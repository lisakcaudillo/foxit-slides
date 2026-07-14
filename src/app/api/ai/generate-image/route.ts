import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { saveImagesToLibrary } from '@/lib/imageLibrary';
import { enhanceImagePrompt } from '@/lib/image-prompt-agent';

// ── /api/ai/generate-image ─────────────────────────────────────────────────
//
// Rewritten 2026-05-25 (Firefly surface, second iteration). Previous shape
// returned a single image at quality='high' with literal slide-body context
// dumped into the prompt — flagged three failure modes on a sales-deck
// generation:
//   (a) 15-40s per call (high quality), single image — no perceived value
//   (b) The literal slide text ("SaaS Sales / New Hire") appeared INSIDE
//       the generated photo, because the body dump told the model to put
//       it there
//   (c) Insertion felt undifferentiated — one new thumbnail in a library row
//
// This rewrite addresses all three:
//   1. n=4 by default — same wait as n=1 (parallel), 4× variant value.
//      Powers the Firefly-style result picker on the client.
//   2. Default quality='medium' (~$0.04, 5-10s) instead of 'high'
//      (~$0.17, 15-40s). User opts into 'high' explicitly for photoreal.
//   3. Style picker (8 enum values) instead of binary photo/diagram —
//      style biases the prompt much more usefully than a content-type toggle.
//   4. Aspect picker (1:1 / 16:9 / 9:16) — 16:9 default since slides are 16:9.
//   5. Slide context is ABSTRACTED, not dumped verbatim. Heading only +
//      hard "no text in image" suppression. Body text is no longer sent
//      at all (the cause of the SaaS-Sales-in-photo regression).
//
// Backwards compat: legacy `type: 'photo' | 'diagram'` is still accepted
// and mapped to a sensible style if `style` is absent. Existing callers
// keep working until they migrate.
//
// Provider: OpenAI direct, pay-as-you-go. Production migrates to Azure
// OpenAI when their gpt-image-1 deployment is provisioned.

// ── Style catalog ────────────────────────────────────────────────────────
// 8 styles. Each maps to a prompt fragment + a default
// quality tier (user-overridable via the `quality` field).

const STYLE_FRAGMENTS = {
  photographic: 'A realistic photograph. Editorial quality, sharp focus, natural lighting, clean composition, modern aesthetic.',
  illustration: 'A flat 2D vector illustration. Clean geometric shapes, soft gradients, professional palette, contemporary editorial illustration style.',
  '3d-render': 'A modern 3D render. Soft shadows, isometric or three-quarter perspective, matte materials, contemporary product-illustration aesthetic.',
  watercolor: 'A soft watercolor painting. Painterly brushstrokes, organic textures, gentle color washes, paper-grain feel.',
  sketch: 'A hand-drawn sketch. Pencil or ink lines, light cross-hatch shading, sketchbook aesthetic.',
  minimal: 'A minimalist composition. Generous negative space, a single focal subject, restrained palette, gallery-poster aesthetic.',
  cinematic: 'A cinematic photograph. Dramatic lighting, shallow depth of field, film grain, moody color grade.',
  abstract: 'An abstract composition. Non-literal shapes, textures, and color fields; suggests the concept without depicting it directly.',
} as const;

type StyleId = keyof typeof STYLE_FRAGMENTS;

const STYLE_QUALITY_DEFAULT: Record<StyleId, 'medium' | 'high'> = {
  photographic: 'high',     // photoreal needs the HD pass
  illustration: 'medium',
  '3d-render': 'high',      // 3D shading reads cleaner at high
  watercolor: 'medium',
  sketch: 'medium',
  minimal: 'medium',
  cinematic: 'high',
  abstract: 'medium',
};

const ASPECT_TO_SIZE = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  // Portrait retired — collapses to square for any
  // back-compat caller still sending 9:16. UI offers square + landscape only.
  '9:16': '1024x1024',
} as const;

type AspectId = keyof typeof ASPECT_TO_SIZE;

const RequestSchema = z.object({
  prompt: z.string().min(1),
  // New style picker — 8 options. When absent, falls back to `type`.
  style: z.enum([
    'photographic', 'illustration', '3d-render', 'watercolor',
    'sketch', 'minimal', 'cinematic', 'abstract',
  ]).optional(),
  // Aspect picker. Two shapes only: square + landscape,
  // both medium. Portrait (9:16) retired. 16:9 default (slides are 16:9).
  // 9:16 still accepted for back-compat and collapses to square downstream.
  aspect: z.enum(['1:1', '16:9', '9:16']).optional(),
  // Quality override. When absent, derived from style (photographic/3d/
  // cinematic default high, others medium).
  quality: z.enum(['standard', 'high']).optional(),
  // How many variants to generate. Default 4 (Firefly pattern). Capped at
  // 6 — beyond that the result panel can't display them readably.
  n: z.number().int().min(1).max(6).optional(),
  // Legacy binary type — mapped to style if `style` is absent.
  type: z.enum(['diagram', 'photo']).optional(),
  // Legacy width/height — superseded by `aspect`. Kept for back-compat.
  width: z.number().optional(),
  height: z.number().optional(),
  // Forward-compat reference fields (no native vision input for image gen).
  styleRef: z.string().optional(),
  compositionRef: z.string().optional(),
  // Auto-context. Slide BODY is intentionally NOT in this
  // schema anymore — sending it caused literal slide text to appear inside
  // the generated photo. Heading is allowed as a conceptual hint only and
  // gets passed under a strict "no text in image" preamble.
  slideHeading: z.string().max(200).optional(),
  deckTitle: z.string().max(200).optional(),
  themePalette: z.string().max(200).optional(),
  // Where the image will sit — hints the art-director pass to leave
  // text-safe negative space (hero/background/left/right/top).
  placement: z.enum(['hero', 'background', 'left', 'right', 'top']).optional(),
  // Brightness directive (auto-image paths set this). Applied by buildPrompt
  // as a separate clause — NOT baked into `prompt` — so the art-director's
  // sparse-check still sees the bare subject and actually runs. Scoped to the
  // generation paths that want it; the manual wizard leaves it unset so
  // moody styles (cinematic/abstract) aren't forced bright.
  bright: z.boolean().optional(),
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Resolve a style — explicit value wins; otherwise map from legacy `type`;
 *  otherwise default to photographic. */
function resolveStyle(style: StyleId | undefined, type: 'diagram' | 'photo' | undefined): StyleId {
  if (style) return style;
  if (type === 'diagram') return 'illustration';
  return 'photographic';
}

/** Resolve quality — explicit wins; otherwise the style's default tier.
 *  'standard' maps to gpt-image-1's 'medium' (the API doesn't have a tier
 *  literally named "standard"; it uses the term in the schema so users see
 *  Standard / High in the UI instead of Medium / High). */
function resolveQuality(
  q: 'standard' | 'high' | undefined,
  styleId: StyleId,
): 'medium' | 'high' {
  // Default to MEDIUM for every style. Medium square is
  // ~$0.04 and medium landscape ~$0.06, versus $0.17-0.25 at high — the
  // economics that make the feature viable at a $4.99 price point. 'high'
  // stays an explicit opt-in; the per-style high defaults are retired.
  void styleId; // kept for signature/back-compat; no longer drives the default
  if (q === 'high') return 'high';
  return 'medium';
}

/** Resolve aspect → gpt-image-1 size. Falls back to legacy width/height
 *  proportion picker if no aspect supplied. */
function resolveSize(
  aspect: AspectId | undefined,
  width: number | undefined,
  height: number | undefined,
): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspect) return ASPECT_TO_SIZE[aspect];
  // Legacy proportional fallback.
  const w = width ?? 1536;
  const h = height ?? 1024;
  const ratio = w / h;
  if (ratio > 1.3) return '1536x1024';
  if (ratio < 0.77) return '1024x1536';
  return '1024x1024';
}

/** Build the final enhanced prompt sent to gpt-image-1. Order matters:
 *
 *    [hard no-text rule]
 *    [conceptual context — heading + theme only, NOT body text]
 *    [style fragment]
 *    [user's prompt verbatim — last so it stays load-bearing]
 *
 *  The slide BODY is no longer included — it was the source of the
 * literal-text-in-image regression flagged (a slide whose body
 *  read "SaaS Sales / New Hire" produced a photo with those exact words
 *  inside the image). Heading is permitted as a conceptual hint. */
function buildPrompt(
  userPrompt: string,
  styleId: StyleId,
  context?: {
    slideHeading?: string;
    deckTitle?: string;
    themePalette?: string;
    bright?: boolean;
  },
): string {
  // HARD rule first. gpt-image-1 ignores text-suppression instructions when
  // the context contains literal phrases that look like slide labels —
  // putting this at the top of the prompt and repeating the rule reduces
  // the failure rate substantially.
  const noText = 'IMPORTANT: The image must contain NO text, letters, words, signs, labels, captions, or written content of any kind. Purely visual.';

  // Conceptual context — heading + deck topic only. No body text.
  const ctxLines: string[] = [];
  if (context?.deckTitle?.trim()) {
    ctxLines.push(`Deck topic: ${context.deckTitle.trim()}`);
  }
  if (context?.slideHeading?.trim()) {
    ctxLines.push(`Slide concept: ${context.slideHeading.trim()}`);
  }
  const contextBlock = ctxLines.length > 0
    ? `Conceptual context (illustrate the theme, do NOT literally depict any slide text): ${ctxLines.join('; ')}.`
    : '';

  // Color-grade directive — a load-bearing clause, present in the FINAL
  // prompt whenever a palette exists, even if the art-director pass was
  // skipped (rich user prompts skip enhancement). This guarantees palette
  // coherence on EVERY generation that has a palette, so generated imagery
  // carries the deck's mood and feels designed-for-this-deck, not stock.
  // Phrased as professional colorist grading — cohesive, not garish.
  // Palette color-grade — DROPPED in bright mode. Grading the image to a dark
  // theme palette was the root cause of gloomy auto-images; brightness must win.
  // The palette still grades the manual wizard, where the user owns the mood.
  const palette = context?.bright ? '' : context?.themePalette?.trim();
  const colorGrade = palette
    ? `COLOR HARMONY: Let this deck palette — ${palette} — softly inform the accent hues so the image feels cohesive with the deck. Keep the image BRIGHT, well-exposed, and naturally lit — the palette guides accents only, it must NOT darken the image, dominate the exposure, or make it moody/low-key. Tasteful and natural, never oversaturated, never dim.`
    : '';

  // In bright mode the moody 'cinematic' grade contradicts the brightness goal,
  // so render it clean instead. This is the route's bright POLICY (explicit +
  // documented), replacing the silent client-side style swap. The manual wizard
  // (no bright flag) still honors cinematic as the moody style the user chose.
  const fragmentStyle = context?.bright && styleId === 'cinematic' ? 'photographic' : styleId;
  const styleFragment = STYLE_FRAGMENTS[fragmentStyle];

  // Brightness directive — applied as its own clause (auto-image paths request
  // it) so the brightness language never has to live inside `prompt`, which
  // would defeat the art-director's sparse-check. Kept off the manual wizard
  // so explicitly moody styles aren't forced bright.
  const brightness = context?.bright
    ? 'BRIGHTNESS: Bright, well-exposed, naturally lit, airy — daylight or bright interior light. NOT dark, not low-key, not moody, not a dark color grade.'
    : '';

  // User prompt last — keeps the user's literal words load-bearing.
  return [
    noText,
    contextBlock,
    styleFragment,
    `Subject: ${userPrompt}`,
    colorGrade, // after the subject so it grades whatever was described
    brightness,
    noText, // repeat at end — empirically this halves the rate of text creeping in
  ].filter(Boolean).join('\n\n');
}

interface ResultImage {
  src: string;        // data URL
  width: number;
  height: number;
  libraryId?: string; // populated after auto-save
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not set in environment. Add it to app/.env.local and restart the dev server.' },
        { status: 500 },
      );
    }

    const {
      prompt, style, aspect, quality: qualityIn, n: nIn, type,
      width, height,
      slideHeading, deckTitle, themePalette, placement, bright,
    } = parsed.data;

    const styleId = resolveStyle(style, type);
    const quality = resolveQuality(qualityIn, styleId);
    const size = resolveSize(aspect, width, height);
    const n = nIn ?? 4;

    // Art-director pass: a thin prompt (a bare noun, MadLibs defaults, or the
    // card-engine's short subject phrase) is expanded into a fully art-directed
    // image prompt — composition, light, palette, mood, text-safe negative
    // space — before it reaches gpt-image-1. Rich prompts pass through
    // untouched. Any failure falls back to the raw prompt, so the image call
    // never blocks on it. One integration point serves BOTH the manual
    // surfaces and the auto-image-at-creation path (both POST here).
    // When BRIGHT is requested (auto-image paths), do NOT hand the theme palette
    // to the art director. Baking a dark theme's palette into the scene was the
    // root cause of gloomy images (a navy-themed deck → navy boardrooms). The
    // palette stays for the manual wizard, where the user picks the mood.
    const { enhanced: directedPrompt, applied: promptEnhanced } = await enhanceImagePrompt(
      prompt,
      { styleId, placement, slideHeading, deckTitle, themePalette: bright ? undefined : themePalette },
    );

    const enhancedPrompt = buildPrompt(directedPrompt, styleId, { slideHeading, deckTitle, themePalette, bright });

    // gpt-image-1 supports n=1..10 in a single call. The wait is dominated
    // by model inference, not request count — n=4 takes roughly the same
    // wall-clock as n=1 (parallel server-side). 4× the variants for ~1×
    // the wait + 4× the cost (medium = ~$0.16 for n=4, vs $0.04 for n=1).
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: enhancedPrompt,
      size,
      quality,
      n,
    });

    const rawItems = response.data ?? [];
    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: 'No image data returned from gpt-image-1' },
        { status: 500 },
      );
    }

    const [actualW, actualH] = size.split('x').map(Number);

    // Save each variant to the library so they ALL bootstrap the stock
    // pool. Client picks one to insert via the Firefly result panel; the
    // others stay browsable later via the Library row. curation
    // workflow (manual folder cleanup pre-launch) decides what ships.
    //
    // Batch save: PNGs parallelise (unique filenames), but metadata.json
    // gets ONE atomic update. Calling saveImageToLibrary N times in a
    // Promise.all used to lose entries to the read-update-write race —
    // that bug orphaned 12 PNGs before 2026-05-26.
    const itemsWithData = rawItems.map((item) => ({
      dataUrl: item.b64_json ? `data:image/png;base64,${item.b64_json}` : '',
    }));
    const savePayload = itemsWithData
      .filter((i) => i.dataUrl)
      .map((i) => ({
        dataUrl: i.dataUrl,
        prompt: `[${styleId}] ${prompt}`,
        type: type ?? ('photo' as const),
        quality,
        width: actualW,
        height: actualH,
      }));
    // saveImagesToLibrary already swallows its own errors and returns null
    // entries on failure, so no outer .catch needed.
    const saved = await saveImagesToLibrary(savePayload);

    // Re-zip results in the original order — itemsWithData preserves it,
    // and saved aligns with the filtered-non-empty subset.
    let savedIdx = 0;
    const results: ResultImage[] = itemsWithData.map((item) => {
      if (!item.dataUrl) {
        return { src: '', width: actualW, height: actualH };
      }
      const entry = saved[savedIdx++];
      return {
        src: item.dataUrl,
        width: actualW,
        height: actualH,
        libraryId: entry?.id,
      };
    });

    return NextResponse.json({
      images: results.filter((r) => r.src),
      style: styleId,
      quality,
      aspect: aspect ?? null,
      // True when the art-director agent expanded a thin prompt before
      // generation (dev/debug signal; the client may ignore it).
      promptEnhanced,
      // Legacy single-image fields for any caller that hasn't migrated yet.
      // Points at the first result.
      src: results[0]?.src,
      width: actualW,
      height: actualH,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate-image] gpt-image-1 error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
