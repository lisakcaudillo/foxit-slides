import type Anthropic from '@anthropic-ai/sdk';

// Use Anthropic's types as the canonical format — adapters translate for other providers.
// This means tool definitions, messages, and response content blocks all follow the
// Anthropic wire format. Other provider adapters must map to/from this canonical shape.

export type MessageParam = Anthropic.Messages.MessageParam;
export type Tool = Anthropic.Messages.Tool;
export type ToolChoice = Anthropic.Messages.ToolChoice;
export type ContentBlock = Anthropic.Messages.ContentBlock;
export type ToolUseBlock = Anthropic.Messages.ToolUseBlock;
export type StopReason = Anthropic.Messages.Message['stop_reason'];

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: MessageParam[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  /** Sampling temperature. Omit to use the provider/model default. Pin LOW for
   *  graders (the eval judge) and for reducing planner run-to-run variance.
   *  NOTE: some reasoning models (e.g. OpenAI o-series) reject a non-default
   *  temperature — only set this for models that accept it. */
  temperature?: number;
}

export interface CreateMessageResponse {
  content: ContentBlock[];
  stop_reason: StopReason;
  /** Token usage for this call, when the adapter surfaces it (Gemini does; the
   *  OpenAI/Anthropic adapters meter separately and leave this undefined). Used
   *  by the eval judge to log real per-deck grading cost. */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AIProvider {
  readonly name: string;

  createMessage(params: CreateMessageParams): Promise<CreateMessageResponse>;
}
