/**
 * Gemini provider adapter (Google AI / generativelanguage REST).
 *
 * Purpose: give Foxit Slides a CROSS-VENDOR model so the eval judge is genuinely
 * independent of the OpenAI generator (see the eval-judge route + docs). It is
 * used for JUDGING, not generation — so the adapter is scoped to what a grader
 * needs: system + text + VISION images + a low temperature + a SINGLE forced
 * structured-JSON verdict. It is dependency-free (raw fetch), so no new npm
 * package lands.
 *
 * Scope / non-goals: this is NOT a full agentic tool-loop adapter. It supports
 * ZERO tools (returns text) or ONE tool (mapped to Gemini's responseSchema JSON
 * mode and returned as a synthesized tool_use block). Multi-tool / tool-result
 * round-trips are intentionally unsupported — the generator stays on OpenAI.
 *
 * Canonical wire format is Anthropic-shaped (see types.ts). We translate:
 *   system            → systemInstruction.parts[].text
 *   messages[].role   → 'user' | 'model'   (assistant → model)
 *   text block        → { text }
 *   image block       → { inline_data: { mime_type, data } }
 *   one forced tool   → generationConfig.responseSchema (+ JSON mime type)
 * and translate the response's JSON back into a tool_use ContentBlock so a
 * tool-forced caller reads it exactly like the OpenAI/Anthropic adapters.
 */
import type {
  AIProvider,
  ContentBlock,
  CreateMessageParams,
  CreateMessageResponse,
  MessageParam,
  StopReason,
  Tool,
} from './types';

/** Default judge model — a STABLE, GA, PINNED, vision-capable tier. Pinned (not
 *  a `-latest` alias) and GA (not a Preview) so the calibrated judge doesn't
 *  drift or 404 under us. gemini-2.5-pro / -flash are closed to new API keys, and
 *  the 3.x Pro tier is Preview-only (Google retires those) — so current-gen GA
 *  Flash is the right stable pick for a reproducible grader. Override with
 *  GEMINI_JUDGE_MODEL (e.g. gemini-3.1-pro-preview for a sharper eye + recalibrate). */
// gemini-3.5-flash (and the gemini-flash-latest alias) were returning sustained
// 503 "high demand" for this key (2026-07-13); -2.5-flash / -2.0-flash 404 (not
// available to the key). gemini-3.1-flash-lite is reachable, vision-capable, and
// the cheapest tier — the right default for a judge run per-slide. Override with
// GEMINI_JUDGE_MODEL.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

// On SUSTAINED overload (503/429) of the primary, createMessage falls back to
// these in order (comma-separated). gemini-pro-latest is a different (pro) pool,
// typically less contended than flash. Override with GEMINI_FALLBACK_MODELS
// (empty string = no fallback).
export const GEMINI_FALLBACK_MODELS = 'gemini-pro-latest';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Read the Gemini API key from environment or .env files. Mirrors the OpenAI /
 * Anthropic getApiKey() pattern (the harness env may carry an empty var that
 * Next's loadEnvConfig won't override).
 */
export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
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
        const match = content.match(/^GEMINI_API_KEY=(.+)$/m);
        if (match && match[1].trim().length > 0) return match[1].trim();
      }
    }
  } catch {
    /* ignore filesystem errors */
  }

  throw new Error('GEMINI_API_KEY not found in environment or .env files');
}

// --- Canonical (Anthropic) → Gemini translation ---------------------------------

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Translate one canonical message's content into Gemini parts (text + images). */
function toGeminiParts(content: MessageParam['content']): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }];
  const parts: GeminiPart[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push({ text: block.text });
    } else if (block.type === 'image' && block.source.type === 'base64') {
      parts.push({ inline_data: { mime_type: block.source.media_type, data: block.source.data } });
    }
    // tool_use / tool_result blocks are unsupported here (see non-goals) — skipped.
  }
  return parts.length ? parts : [{ text: '' }];
}

function toGeminiContents(messages: MessageParam[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m.content),
  }));
}

const TYPE_MAP: Record<string, string> = {
  object: 'OBJECT', array: 'ARRAY', string: 'STRING',
  integer: 'INTEGER', number: 'NUMBER', boolean: 'BOOLEAN',
};

/**
 * Convert a JSON-Schema-ish object (an Anthropic tool `input_schema`) into a
 * Gemini responseSchema. Gemini accepts a SUBSET of OpenAPI schema — it takes
 * uppercase types and does NOT allow additionalProperties / minimum / maximum,
 * so we keep only the supported keys and recurse.
 */
function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return { type: 'STRING' };
  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof s.type === 'string') out.type = TYPE_MAP[s.type] ?? String(s.type).toUpperCase();
  if (typeof s.description === 'string') out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties && typeof s.properties === 'object') {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
      props[k] = toGeminiSchema(v);
    }
    out.properties = props;
  }
  if (Array.isArray(s.required)) out.required = s.required;
  return out;
}

function mapFinishReason(reason: string | undefined, forcedTool: boolean): StopReason {
  if (forcedTool) return 'tool_use';
  switch (reason) {
    case 'MAX_TOKENS': return 'max_tokens';
    case 'STOP': return 'end_turn';
    default: return 'end_turn';
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gcp-gemini';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? getGeminiApiKey();
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    const model = params.model || process.env.GEMINI_JUDGE_MODEL || DEFAULT_GEMINI_MODEL;

    // Exactly one tool → force structured JSON via responseSchema. (>1 tool is a
    // non-goal — the generator stays on OpenAI.)
    const forcedTool: Tool | null =
      params.tools && params.tools.length === 1 ? params.tools[0] : null;

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: params.max_tokens,
    };
    if (params.temperature !== undefined) generationConfig.temperature = params.temperature;
    if (forcedTool) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = toGeminiSchema(forcedTool.input_schema);
    }

    const body: Record<string, unknown> = {
      contents: toGeminiContents(params.messages),
      generationConfig,
    };
    if (params.system) {
      body.systemInstruction = { parts: [{ text: params.system }] };
    }

    // Retry transient failures: 503 (model overloaded) and 429 (rate limit) are
    // common on the flash pool and can stay hot for minutes. Each model gets a few
    // attempts with backoff; if it stays 503/429, fall back to the next model in
    // the chain rather than burn the whole budget on one hot pool. A non-retryable
    // error (any other status, incl. 404) surfaces immediately; a hard 429
    // (insufficient_quota) exhausts the chain and surfaces.
    const MAX_ATTEMPTS = 3;
    const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? GEMINI_FALLBACK_MODELS)
      .split(',').map((s) => s.trim()).filter(Boolean);
    const modelChain = [model, ...fallbacks.filter((m) => m !== model)];

    // One model, up to MAX_ATTEMPTS. Returns the ok Response, null if it stayed
    // 503/429 (→ try the next model), or throws on a non-retryable error.
    const tryModel = async (m: string): Promise<Response | null> => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const r = await fetch(`${GEMINI_API_BASE}/models/${m}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Header (not ?key=) so the secret never lands in a URL / access log.
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
        });
        if (r.ok) return r;
        const retryable = r.status === 503 || r.status === 429;
        if (!retryable) {
          const errText = await r.text().catch(() => '');
          throw new Error(`Gemini API ${r.status}: ${errText.slice(0, 500)}`);
        }
        if (attempt === MAX_ATTEMPTS) return null; // stayed hot → fall back
        await new Promise((rs) => setTimeout(rs, attempt * 1500)); // 1.5s, 3s backoff
      }
      return null;
    };

    let res: Response | null = null;
    for (const m of modelChain) {
      res = await tryModel(m);
      if (res) break;
    }
    if (!res) throw new Error(`Gemini API 503: all models overloaded (${modelChain.join(', ')})`);

    const json = (await res.json()) as GeminiResponse;
    if (json.error) throw new Error(`Gemini API error: ${json.error.message ?? 'unknown'}`);

    const cand = json.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const usage = {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };

    let content: ContentBlock[];
    if (forcedTool) {
      // Return the JSON as a tool_use block so a tool-forced caller reads it the
      // same way it reads the OpenAI/Anthropic adapters. Parse leniently.
      let input: unknown = {};
      try {
        input = JSON.parse(text);
      } catch {
        throw new Error(`Gemini returned non-JSON for forced tool "${forcedTool.name}": ${text.slice(0, 200)}`);
      }
      content = [{ type: 'tool_use', id: `gemini_${forcedTool.name}`, name: forcedTool.name, input } as unknown as ContentBlock];
    } else {
      content = [{ type: 'text', text, citations: null } as unknown as ContentBlock];
    }

    return {
      content,
      stop_reason: mapFinishReason(cand?.finishReason, !!forcedTool),
      usage,
    };
  }
}
