// ── Image-Prompt Agent ─────────────────────────────────────────────────────
//
// A small "art director" that turns a thin user/AI request into a
// professionally-engineered image-generation prompt before it reaches
// gpt-image-1. Wired into /api/ai/generate-image, so BOTH paths benefit:
//   • the manual surfaces (/editor/graphics wizard + slides Media panel),
//     which previously sent the user's raw words verbatim with no craft.
//   • the auto-image-at-creation path, whose card-engine "presentation
//     designer" emits only a short subject phrase.
//
// Policy (confirmed with
//   • ENHANCE ONLY WHEN SPARSE. A rich prompt is sent through untouched so
//     power users and already-detailed AI subjects aren't second-guessed.
//   • The ~1-2s Claude call is acceptable — better prompts mean fewer
//     regenerations, which also lets us run cheaper quality tiers.
//   • Graceful degradation: any failure (no API key, timeout, bad JSON)
//     falls back to the original prompt. The image call never blocks on it.
//
// The agent expands the SUBJECT only. The route's buildPrompt() still owns
// the hard no-text rule and the per-style medium fragment, so the agent
// deliberately avoids restating the medium to prevent double-styling.

import { getProvider, getModel } from '@/lib/ai-provider';
import { z } from 'zod';

export interface EnhanceContext {
  /** One of the 8 generate-image styles (photographic, illustration, …). */
  styleId?: string;
  /** Where the image will sit — hints whether to leave text-safe space. */
  placement?: string;
  slideHeading?: string;
  deckTitle?: string;
  /** Comma-ish palette string, e.g. "warm stone, deep navy, brass". */
  themePalette?: string;
}

const EnhancedSchema = z.object({
  prompt: z.string().min(1).max(1200),
});

/**
 * Heuristic: is this prompt thin enough to be worth expanding?
 *
 * Mirrors card-engine's "sparse" notion, tuned for image subjects:
 *   • very short (a bare noun or two), OR
 *   • lacks any descriptive richness (no adjectives/commas/scene detail).
 *
 * A detailed, comma-rich, or long prompt is treated as author-intended and
 * passed through untouched.
 */
export function isSparsePrompt(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false; // empty is handled upstream; nothing to enhance
  const words = p.split(/\s+/).filter(Boolean);
  // Long prompts are assumed deliberate.
  if (words.length >= 14) return false;
  // Commas usually signal the user already layered detail (subject, lighting…).
  if ((p.match(/,/g)?.length ?? 0) >= 2) return false;
  // Otherwise it's a short/bare request — enhance it.
  return true;
}

const PLACEMENT_TEXT_SAFE = new Set(['hero', 'background', 'left', 'right', 'top']);

/**
 * Expand a sparse subject into an art-directed image prompt.
 *
 * Returns the enriched SUBJECT string. On any error, returns the original
 * prompt so the caller can proceed unchanged.
 */
export async function enhanceImagePrompt(
  prompt: string,
  ctx: EnhanceContext = {},
): Promise<{ enhanced: string; applied: boolean }> {
  // Respect the policy: only spend a call on thin input.
  if (!isSparsePrompt(prompt)) {
    return { enhanced: prompt, applied: false };
  }

  // No key → don't even try; the image call will surface the real error.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.AI_PROVIDER) {
    return { enhanced: prompt, applied: false };
  }

  const palette = ctx.themePalette?.trim();
  const ctxLines: string[] = [];
  if (ctx.deckTitle?.trim()) ctxLines.push(`Deck topic: ${ctx.deckTitle.trim()}`);
  if (ctx.slideHeading?.trim()) ctxLines.push(`Slide concept: ${ctx.slideHeading.trim()}`);
  if (palette) ctxLines.push(`Deck palette / color mood (grade the image to this): ${palette}`);
  if (ctx.styleId) ctxLines.push(`Art style already chosen (do NOT restate the medium): ${ctx.styleId}`);
  const textSafe = ctx.placement && PLACEMENT_TEXT_SAFE.has(ctx.placement);

  // When a palette is present, COLOR becomes a primary art-direction lever:
  // the image is deliberately graded to the deck's hues and lighting mood so
  // generated imagery feels designed-for-this-deck, not stock. Tasteful, not
  // garish — phrased as professional color grading / tonal cohesion.
  const colorDirective = palette
    ? `- COLOR (PRIMARY): This image must feel like it belongs to a deck whose palette is "${palette}". Grade it to that color story — let those hues dominate the lighting, surfaces, and atmosphere, the way a colorist tones a film. Tasteful and cohesive, never garish or oversaturated. Choose a setting/subject treatment that naturally carries these tones.`
    : `- COLOR: a cohesive, professional palette.`;

  const sys = `You are an expert image-generation art director. You turn a thin request into ONE vivid, concrete image prompt that a diffusion model (gpt-image-1) will render well.

Craft the prompt with deliberate art direction:
- SUBJECT: name a concrete scene, object, or visual metaphor. Never depict text, words, numbers, charts, labels, or UI.
- COMPOSITION: framing, focal point, perspective, depth.
- LIGHT: direction, quality, time of day or mood lighting${palette ? ' — chosen to reinforce the deck palette below' : ''}.
${colorDirective}
- MOOD: the feeling the image should evoke.
${textSafe ? '- NEGATIVE SPACE: leave a calm, uncluttered region for text to be overlaid later (this image sits behind/beside slide copy).' : ''}

Rules:
- Do NOT restate the chosen art medium/style — that is appended separately. Focus on subject, composition, light, color, mood.
${palette ? '- Bake the palette into the described scene itself (tones, materials, light), not as a separate instruction — the model renders best when color lives in the imagery.\n' : ''}- Keep it to 2-4 sentences, under ~80 words. No lists, no headings.
- Never include any readable text, letters, signs, or numerals in the described scene.
- Output STRICT JSON only: {"prompt": "<the image prompt>"}`;

  const user = `Thin request: "${prompt.trim()}"${ctxLines.length ? `\n\nContext:\n${ctxLines.join('\n')}` : ''}\n\nReturn the enriched image prompt as JSON.`;

  try {
    const provider = getProvider();
    const response = await provider.createMessage({
      model: getModel(),
      max_tokens: 500,
      system: sys,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find(
      (b: { type: string }) => b.type === 'text',
    ) as { text: string } | undefined;
    if (!textBlock) return { enhanced: prompt, applied: false };

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { enhanced: prompt, applied: false };

    const parsed = EnhancedSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return { enhanced: prompt, applied: false };

    const enriched = parsed.data.prompt.trim();
    // Sanity: never return something shorter/emptier than the input.
    if (enriched.length < prompt.trim().length) {
      return { enhanced: prompt, applied: false };
    }
    return { enhanced: enriched, applied: true };
  } catch (err) {
    console.error('[image-prompt-agent] enhancement failed, using raw prompt:', err);
    return { enhanced: prompt, applied: false };
  }
}
