import type Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from './types';

// Canonical image format follows Anthropic's content-block shape; provider
// adapters translate this to other vendors' shapes (e.g., OpenAI image_url).

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type ImageBlockParam = Anthropic.Messages.ImageBlockParam;
export type TextBlockParam = Anthropic.Messages.TextBlockParam;

/**
 * Build a single image content block from raw bytes (or pre-encoded base64).
 * Use inside a MessageParam to send images to vision-capable models.
 */
export function imageBlock(data: Buffer | string, mimeType: ImageMimeType): ImageBlockParam {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mimeType,
      data: typeof data === 'string' ? data : data.toString('base64'),
    },
  };
}

/**
 * Build a user message containing one or more images plus an optional text prompt.
 * Images precede text — Anthropic's recommended ordering for vision prompts.
 */
export function visionUserMessage(
  images: Array<{ data: Buffer | string; mimeType: ImageMimeType }>,
  text?: string,
): MessageParam {
  const content: Array<ImageBlockParam | TextBlockParam> = images.map(img =>
    imageBlock(img.data, img.mimeType),
  );
  if (text) {
    content.push({ type: 'text', text });
  }
  return { role: 'user', content };
}

export function inferImageMimeType(filenameOrExt: string): ImageMimeType {
  const lower = filenameOrExt.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
