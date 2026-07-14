export type {
  AIProvider,
  AIProviderConfig,
  ContentBlock,
  CreateMessageParams,
  CreateMessageResponse,
  MessageParam,
  StopReason,
  Tool,
  ToolChoice,
  ToolUseBlock,
} from './types';

export { AnthropicProvider, getApiKey } from './anthropic';
export { OpenAIProvider, getOpenAIApiKey } from './openai';
export { GeminiProvider, getGeminiApiKey, DEFAULT_GEMINI_MODEL } from './gemini';

export {
  imageBlock,
  visionUserMessage,
  inferImageMimeType,
  type ImageMimeType,
  type ImageBlockParam,
  type TextBlockParam,
} from './vision';

import type { AIProvider } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

// Singleton cache so we don't create a new client on every call.
let cachedProvider: AIProvider | null = null;
let cachedProviderName: string | null = null;

/**
 * Return an AIProvider instance for the given provider name.
 *
 * Provider is selected by:
 *   1. The `name` argument (if supplied)
 *   2. The `AI_PROVIDER` environment variable
 *   3. Defaults to 'openai'
 *
 * 'openai' and 'anthropic' are implemented. 'azure' routes through the OpenAI
 * adapter (Azure OpenAI is a config flip — see AZURE_OPENAI_* env in openai.ts),
 * so no separate Azure adapter is needed. The Anthropic provider is retained but
 * is no longer the default (text generation has migrated off Claude).
 */
export function getProvider(name?: string): AIProvider {
  const providerName = name ?? process.env.AI_PROVIDER ?? 'openai';

  // Return cached instance if the provider name hasn't changed.
  if (cachedProvider && cachedProviderName === providerName) {
    return cachedProvider;
  }

  switch (providerName) {
    case 'openai':
    // Azure OpenAI is the same adapter; auth/endpoint/deployment differ by env only.
    case 'azure':
      cachedProvider = new OpenAIProvider();
      cachedProviderName = providerName;
      return cachedProvider;

    case 'anthropic':
      cachedProvider = new AnthropicProvider();
      cachedProviderName = providerName;
      return cachedProvider;

    case 'gcp-gemini':
      // Google AI (Gemini) — cross-vendor model used for the INDEPENDENT eval
      // judge (grading only, not generation). See ai-provider/gemini.ts.
      cachedProvider = new GeminiProvider();
      cachedProviderName = providerName;
      return cachedProvider;

    case 'gcp-claude':
      throw new Error(
        `AI provider "${providerName}" is not yet implemented. ` +
        `Available: openai, azure, anthropic, gcp-gemini. See multi-model-provider-scope.md for the roadmap.`
      );

    default:
      throw new Error(
        `Unknown AI provider "${providerName}". ` +
        `Supported: openai, azure, anthropic, gcp-gemini. Planned: gcp-claude.`
      );
  }
}

/**
 * Return the model identifier to use for AI calls.
 *
 * Reads from `AI_MODEL` if set; otherwise picks a provider-appropriate default
 * (gpt-4o for openai/azure, claude-sonnet-4 for anthropic). For Azure, the
 * deployment name (AZURE_OPENAI_DEPLOYMENT) takes precedence inside the adapter.
 */
export function getModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  const providerName = process.env.AI_PROVIDER ?? 'openai';
  return providerName === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o';
}
