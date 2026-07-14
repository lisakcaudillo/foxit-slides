import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, CreateMessageParams, CreateMessageResponse } from './types';

/**
 * Read the Anthropic API key from environment variables or .env files.
 *
 * This function exists because the system environment may have ANTHROPIC_API_KEY
 * set to an empty string (e.g., from Claude Code's own environment), which prevents
 * Next.js loadEnvConfig from overriding it. The fallback reads directly from .env
 * files on disk.
 */
export function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && key.trim().length > 0) return key;

  // Fallback: read directly from .env.local or .env
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    for (const envFile of ['.env.local', '.env']) {
      const envPath = path.join(process.cwd(), envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        if (match && match[1].trim().length > 0) return match[1].trim();
      }
    }
  } catch {
    /* ignore filesystem errors */
  }

  throw new Error('ANTHROPIC_API_KEY not found in environment or .env files');
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? getApiKey() });
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tool_choice,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    });

    return {
      content: response.content,
      stop_reason: response.stop_reason,
    };
  }
}
