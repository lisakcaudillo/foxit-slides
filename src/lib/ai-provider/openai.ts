import OpenAI, { AzureOpenAI } from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions';
import type {
  AIProvider,
  ContentBlock,
  CreateMessageParams,
  CreateMessageResponse,
  MessageParam,
  StopReason,
  Tool,
  ToolChoice,
} from './types';
import { isStrictRepresentable, stripNulls, toStrictSchema } from './strict-schema';
import { recordUsage } from '@/lib/card-engine/usage-meter';

/**
 * Read the OpenAI API key from environment variables or .env files.
 *
 * Mirrors the Anthropic getApiKey() pattern: the system env may carry an empty
 * OPENAI_API_KEY (e.g. from the Claude Code harness) which Next.js loadEnvConfig
 * will not override, to fall back to reading .env.local / .env directly.
 */
export function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key && key.trim().length > 0) return key;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    for (const envFile of ['.env.local', '.env']) {
      const envPath = path.join(process.cwd(), envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
        if (match && match[1].trim().length > 0) return match[1].trim();
      }
    }
  } catch {
    /* ignore filesystem errors */
  }

  throw new Error('OPENAI_API_KEY not found in environment or .env files');
}

// --- Canonical (Anthropic) → OpenAI translation ---------------------------------

/** Flatten an Anthropic message's content to plain text (callers use string or text blocks). */
function messageText(content: MessageParam['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
}

function toOpenAIMessages(
  system: string | undefined,
  messages: MessageParam[],
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const msg of messages) {
    out.push({ role: msg.role, content: messageText(msg.content) });
  }
  return out;
}

/**
 * Map an Anthropic tool to an OpenAI function tool. Schemas that fit strict mode
 * are sent with `strict: true` (guaranteed schema-conformant output); schemas
 * that cannot (open-ended maps) fall back to non-strict function calling, which
 * still returns structured JSON, just without the hard guarantee.
 */
function toOpenAITool(tool: Tool): ChatCompletionTool {
  const schema = (tool.input_schema ?? {}) as Record<string, unknown>;
  const strict = isStrictRepresentable(schema);
  if (process.env.NODE_ENV !== 'production') {
    // Operational visibility: which tools get OpenAI's hard schema guarantee vs
    // fall back to non-strict function calling (open maps / untyped leaves).
    console.log(`[openai-provider] tool "${tool.name}" → strict=${strict}`);
  }
  const parameters = strict ? toStrictSchema(schema) : schema;
  return {
    type: 'function',
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: parameters as Record<string, unknown>,
      strict,
    },
  };
}

function toOpenAIToolChoice(
  toolChoice: ToolChoice | undefined,
): ChatCompletionToolChoiceOption | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice.type === 'tool') {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  if (toolChoice.type === 'any') return 'required';
  if (toolChoice.type === 'auto') return 'auto';
  if (toolChoice.type === 'none') return 'none';
  return undefined;
}

function mapFinishReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'content_filter':
      return 'refusal';
    default:
      return 'end_turn';
  }
}

// --- Provider -------------------------------------------------------------------

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string) {
    // Endpoint / auth / deployment behind env so Azure OpenAI is a config flip,
    // not a second implementation. When AZURE_OPENAI_ENDPOINT is set it uses the
    // AzureOpenAI client (api-key header + api-version + deployment name);
    // otherwise the standard OpenAI client (optionally pointed at a custom
    // base URL). No code change is needed to move OpenAI-direct → Azure.
    const key = apiKey ?? getOpenAIApiKey();
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (azureEndpoint && azureEndpoint.trim().length > 0) {
      this.client = new AzureOpenAI({
        endpoint: azureEndpoint,
        apiKey: key,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
        ...(process.env.AZURE_OPENAI_DEPLOYMENT
          ? { deployment: process.env.AZURE_OPENAI_DEPLOYMENT }
          : {}),
      });
    } else {
      this.client = new OpenAI({
        apiKey: key,
        ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
      });
    }
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    const request: ChatCompletionCreateParamsNonStreaming = {
      // For Azure the deployment is bound to the client; the model field is the
      // deployment name there and the model id for OpenAI-direct.
      model: process.env.AZURE_OPENAI_DEPLOYMENT || params.model,
      max_completion_tokens: params.max_tokens,
      messages: toOpenAIMessages(params.system, params.messages),
    };

    // Only forward temperature when the caller pinned it — most models take the
    // default. (o-series reasoning models reject a non-default temperature, so
    // callers must not set it for those.)
    if (params.temperature !== undefined) request.temperature = params.temperature;

    if (params.tools?.length) {
      request.tools = params.tools.map(toOpenAITool);
      const toolChoice = toOpenAIToolChoice(params.tool_choice);
      if (toolChoice) request.tool_choice = toolChoice;
    }

    const response = await this.client.chat.completions.create(request);

    if (response.usage) {
      // Feed the per-generation usage meter (no-op outside a metered generation)
      // so deck cost is logged to deck-cost-log.csv from the LIVE pipeline, not
      // just estimated from dev logs. Runs in prod too.
      const cachedTok = response.usage.prompt_tokens_details?.cached_tokens ?? 0;
      recordUsage('textgen', {
        input: response.usage.prompt_tokens,
        cached: cachedTok,
        output: response.usage.completion_tokens,
      });
    }

    if (process.env.NODE_ENV !== 'production' && response.usage) {
      // Token usage per call — lets cost-per-deck be computed from the dev log.
      // cached = prompt tokens served from OpenAI's automatic prompt cache (billed
      // at half) — the real cost lever for the repeated judge rubric / system prompt.
      const cached = response.usage.prompt_tokens_details?.cached_tokens ?? 0;
      // Tag with the tool name so cost attribution survives concurrent generation
      // (cards run under Promise.all, so log lines from different calls interleave).
      const firstTool = request.tools?.[0];
      const toolName =
        firstTool && firstTool.type === 'function' ? firstTool.function.name : 'none';
      console.log(
        `[openai-usage] model=${request.model} tool=${toolName} prompt=${response.usage.prompt_tokens} cached=${cached} completion=${response.usage.completion_tokens}`,
      );
    }

    const choice = response.choices[0];
    const message = choice?.message;

    const content: ContentBlock[] = [];

    if (message?.content) {
      content.push({ type: 'text', text: message.content, citations: [] } as ContentBlock);
    }

    for (const call of message?.tool_calls ?? []) {
      if (call.type !== 'function') continue;
      let input: unknown = {};
      try {
        input = stripNulls(JSON.parse(call.function.arguments || '{}'));
      } catch {
        throw new Error(
          `OpenAIProvider: tool call "${call.function.name}" returned unparseable JSON arguments`,
        );
      }
      content.push({
        type: 'tool_use',
        id: call.id,
        name: call.function.name,
        input,
      } as ContentBlock);
    }

    return {
      content,
      stop_reason: mapFinishReason(choice?.finish_reason),
    };
  }
}
