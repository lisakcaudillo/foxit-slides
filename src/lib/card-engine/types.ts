import { z } from 'zod';

// ── Classification ────────────────────────────────────────────────────────

/** Block-template enum — what visual treatment each section gets. Replaces
 * the older free-form `suggestedBlocks` field. Tightening
 *  this to a closed enum forces the classifier to commit to a specific
 *  template per section, stopping the "everything defaults to paragraph-
 *  content" failure mode. */
export const BLOCK_TEMPLATES = [
  'cover-minimal',     // big title only — clean cover
  'cover-subtitle',    // title + subtitle line — standard cover
  'hero-title',        // title + paragraph + optional labels — intro slide
  'agenda',            // numbered overview of sections
  'paragraph-content', // heading + paragraph — explanatory content
  'bullet-list',       // heading + bullet items — action lists, key points
  'key-metric-trio',   // 3 big numbers side by side
  'key-metric-quad',   // 4 numbers in 2x2
  'grid-2x2',          // 4 cells with icon + heading + body
  'grid-1x3',          // 3 cells with icon + heading + body
  'comparison-2col',   // 2 columns comparing options
  'features-grid',     // 4-6 product features with icons
  'timeline',          // sequential phases
  'process-horizontal',// 3-5 stage process
  'icon-list',         // heading + smart-layout list with icons
  'callout-list',      // heading + list + emphasized callout
  'quote-pull',        // centered pull quote with attribution
  'toggles',           // FAQ-style expandable sections
  'chapter-divider',   // section break / chapter marker
  'summary-takeaways', // 3 key takeaways with check icons
  'cta-closing',       // action items with owner/deadline
] as const;
export type BlockTemplate = typeof BLOCK_TEMPLATES[number];

export const ContentClassificationSchema = z.object({
  contentType: z.enum(['pitch', 'guide', 'report', 'brief', 'proposal', 'educational', 'creative']),
  suggestedCardCount: z.number().min(3).max(15),
  sections: z.array(z.object({
    title: z.string(),
    purpose: z.string(),
    suggestedLayout: z.enum(['single', 'split-left', 'split-right', 'three-col']),
    /** Single template per section — chosen from BLOCK_TEMPLATES. Optional
     *  for forward compatibility: a brand-new classifier response always
     *  includes it; older cached responses fall back to `suggestedBlocks`
     *  inference downstream. */
    template: z.enum(BLOCK_TEMPLATES).optional(),
    /** Legacy — kept optional for backward compatibility with older
     *  responses still in transit. New code should use `template`. */
    suggestedBlocks: z.array(z.string()).optional(),
  })),
  audiences: z.array(z.string()).min(2),
  tones: z.array(z.string()).min(2),
  // Round 2 D6 — perspective fields. The deck has an author voice
  // (speakerRole) and a reader role (audienceRole). Different from the
  // looser `audiences` description above. Identifying them explicitly
  // stops the AI from drifting tone (e.g. flipping a CS-team-internal
  // kickoff into vendor-pitching-customer copy). Optional for
  // backward-compat with any cached classifications.
  speakerRole: z.string().optional(),
  audienceRole: z.string().optional(),
});

export type ContentClassification = z.infer<typeof ContentClassificationSchema>;

// ── Card Blueprint ────────────────────────────────────────────────────────

export const CardBlueprintSchema = z.object({
  cards: z.array(z.object({
    id: z.string(),
    title: z.string(),
    layout: z.enum(['single', 'split-left', 'split-right', 'three-col']),
    style: z.enum(['default', 'dark', 'chapter', 'accent']),
    blockPlan: z.array(z.object({
      type: z.string(),
      instruction: z.string(),
    })),
    blockTemplate: z.string().optional(),
    contentBudget: z.record(z.string(), z.unknown()).optional(),
  })),
});

export type CardBlueprint = z.infer<typeof CardBlueprintSchema>;

// ── Generated Card Content ────────────────────────────────────────────────

/** Valid smart-layout variants. The enum the AI must commit to. */
export const SMART_LAYOUT_VARIANTS = ['grid-2x2', 'grid-1x3', 'grid-1x4', 'list', 'timeline'] as const;
type SmartLayoutVariant = typeof SMART_LAYOUT_VARIANTS[number];

/** Synonyms the model commonly emits in place of the canonical variant
 *  names. Matched case-insensitively, AFTER unicode-x normalization. Keep
 *  this conservative — only map values whose intent is unambiguous. */
const SMART_LAYOUT_SYNONYMS: Record<string, SmartLayoutVariant> = {
  // 2x2 grid family
  'grid': 'grid-2x2',
  'grid-2': 'grid-2x2',
  '2x2': 'grid-2x2',
  'grid2x2': 'grid-2x2',
  'two-by-two': 'grid-2x2',
  'cards': 'grid-2x2',
  // 3-column family
  '3-col': 'grid-1x3',
  '3col': 'grid-1x3',
  'three': 'grid-1x3',
  'three-col': 'grid-1x3',
  'grid-3': 'grid-1x3',
  '1x3': 'grid-1x3',
  'columns-3': 'grid-1x3',
  // 4-column family
  '4-col': 'grid-1x4',
  '4col': 'grid-1x4',
  'four': 'grid-1x4',
  'four-col': 'grid-1x4',
  'grid-4': 'grid-1x4',
  '1x4': 'grid-1x4',
  'columns-4': 'grid-1x4',
  // list family
  'bullets': 'list',
  'bulleted': 'list',
  'bullet': 'list',
  'bullet-list': 'list',
  'items': 'list',
  // timeline family
  'steps': 'timeline',
  'process': 'timeline',
  'sequence': 'timeline',
  'phases': 'timeline',
  'roadmap': 'timeline',
};

/** Coerce ANY incoming variant value to a valid SmartLayoutVariant. Never
 *  fails — that is the whole point. Order:
 *    1. unicode-x normalization (grid-2×2 → grid-2x2), trim, lowercase
 *    2. exact match against the valid enum
 *    3. synonym map
 *    4. cells-length heuristic (3 → grid-1x3, 4 → grid-2x2, else → list)
 *    5. final fallback → 'list'
 *  Returns a known-good variant string for the enum to validate. */
function coerceSmartLayoutVariant(variant: unknown, cells: unknown): SmartLayoutVariant {
  if (typeof variant === 'string') {
    // Existing behavior: normalize multiplicative unicode to ASCII `x`.
    const normalized = variant.replace(/[×✕✗]/g, 'x').trim().toLowerCase();
    if ((SMART_LAYOUT_VARIANTS as readonly string[]).includes(normalized)) {
      return normalized as SmartLayoutVariant;
    }
    if (SMART_LAYOUT_SYNONYMS[normalized]) {
      return SMART_LAYOUT_SYNONYMS[normalized];
    }
  }
  // Unknown variant — infer from the cell count when available so the
  // content (cells) is preserved with a sensible grid shape.
  if (Array.isArray(cells)) {
    if (cells.length === 3) return 'grid-1x3';
    if (cells.length === 4) return 'grid-2x2';
  }
  return 'list';
}

/** Normalize a single raw block before it reaches the discriminated union.
 *  Today this only repairs smart-layout `variant` (coercing unknown values
 *  to a valid one so an off-enum variant never rejects the whole card), but
 *  it's the natural seam for any future per-block repair. Done at the block
 *  level — rather than wrapping a union member in z.preprocess — because
 *  z.discriminatedUnion cannot read the discriminator off a preprocessed
 *  member. Keeping each member a plain z.object preserves the union (and the
 *  block.type narrowing that downstream consumers rely on). */
function normalizeBlock(block: unknown): unknown {
  if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'smart-layout') {
    const b = block as Record<string, unknown>;
    return { ...b, variant: coerceSmartLayoutVariant(b.variant, b.cells) };
  }
  return block;
}

/** The raw discriminated union. Not exported directly — consumers use the
 *  preprocessed GeneratedBlockSchema below, which repairs blocks first. */
const GeneratedBlockUnion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), content: z.string() }),
  z.object({ type: z.literal('paragraph'), content: z.string() }),
  z.object({
    type: z.literal('smart-layout'),
    // `variant` is coerced to a valid value BEFORE this enum check by the
    // block-level preprocess (normalizeBlock) that wraps this union. It
    // reads both `variant` and `cells` (which a field-level preprocess here
    // couldn't see) so the cells-length fallback works. By the time
    // validation reaches this enum, the value is always one of the five.
    variant: z.enum(SMART_LAYOUT_VARIANTS),
    cells: z.array(z.object({
      icon: z.string().optional(),
      heading: z.string(),
      body: z.string(),
      accentColor: z.string().optional(),
    })),
  }),
  z.object({
    type: z.literal('label-group'),
    labels: z.array(z.object({ text: z.string(), style: z.enum(['filled', 'outline', 'filled-light', 'outline-light']).catch('outline') })),
  }),
  z.object({ type: z.literal('toggle'), heading: z.string(), content: z.string() }),
  z.object({ type: z.literal('callout'), icon: z.string().optional(), content: z.string() }),
  z.object({ type: z.literal('bullet-list'), items: z.array(z.string()) }),
  z.object({ type: z.literal('divider') }),
  z.object({ type: z.literal('button'), text: z.string(), url: z.string().optional(), style: z.enum(['primary', 'primary-light']).catch('primary') }),
]);

/** The block schema every consumer should use. Runs normalizeBlock first so
 *  an off-enum smart-layout `variant` is coerced to a valid one instead of
 *  rejecting the block (and, by extension, the whole card). Wrapping the
 *  *union* in z.preprocess is safe — what z.discriminatedUnion can't accept
 *  is a preprocessed *member*. The inferred output type is the union's, so
 *  `block.type` still narrows for downstream consumers. */
export const GeneratedBlockSchema = z.preprocess(normalizeBlock, GeneratedBlockUnion);

// ── Image Intent ──────────────────────────────────────────────────────────
// Per-card recommendation emitted by the generator (acting as a presentation
// designer) for whether this slide earns a generated image, what to depict,
// and where. Consumed by the auto-image-at-creation flow. The style/placement
// enums mirror the /api/ai/generate-image contract and CardImageIntent in
// card-template.ts — keep all three structurally in sync.

export const IMAGE_STYLES = [
  'photographic', 'illustration', '3d-render', 'watercolor',
  'sketch', 'minimal', 'cinematic', 'abstract',
] as const;
export const IMAGE_PLACEMENTS = ['hero', 'background', 'right', 'left', 'top'] as const;

// Common model near-misses → the canonical enum value. Keeps the AI's intent
// instead of dropping the field when it emits a plausible synonym. Anything not
// mapped here (and not already valid) falls through to `.catch(undefined)`
// below, which degrades just this field — never the whole card.
const IMAGE_STYLE_SYNONYMS: Record<string, (typeof IMAGE_STYLES)[number]> = {
  photorealistic: 'photographic', photo: 'photographic', photography: 'photographic',
  realistic: 'photographic', photorealism: 'photographic',
  '3d': '3d-render', render: '3d-render', rendering: '3d-render', 'three-d': '3d-render',
  illustrated: 'illustration', vector: 'illustration',
  drawing: 'sketch', sketched: 'sketch', 'line-art': 'sketch',
  minimalist: 'minimal', simple: 'minimal',
  cinema: 'cinematic', filmic: 'cinematic', film: 'cinematic',
  watercolour: 'watercolor',
};
function coerceImageStyle(v: unknown): unknown {
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase();
    if ((IMAGE_STYLES as readonly string[]).includes(n)) return n;
    if (IMAGE_STYLE_SYNONYMS[n]) return IMAGE_STYLE_SYNONYMS[n];
  }
  return v; // still invalid → `.catch(undefined)` degrades only this field
}

export const ImageIntentSchema = z.object({
  wanted: z.boolean(),
  // Allow empty when wanted is false — the prompt lets the AI omit detail then.
  subject: z.string().max(240).optional().default(''),
  // An off-enum style/placement degrades to `undefined` instead of rejecting
  // the whole card. style additionally maps common synonyms first so the AI's
  // intent survives (e.g. "photorealistic" → "photographic").
  style: z.preprocess(coerceImageStyle, z.enum(IMAGE_STYLES)).optional().catch(undefined),
  placement: z.enum(IMAGE_PLACEMENTS).optional().catch(undefined),
});

export type ImageIntent = z.infer<typeof ImageIntentSchema>;

export const GeneratedCardSchema = z.object({
  id: z.string(),
  blocks: z.array(GeneratedBlockSchema),
  /** Optional — older cached responses and the retry/fallback paths omit it.
   *  The auto-image flow simply skips cards without a `wanted: true` intent.
   *  `.catch(undefined)` so a malformed intent object degrades to "no image
   *  hint" rather than rejecting (and losing) the entire card. */
  imageIntent: ImageIntentSchema.optional().catch(undefined),
});

export type GeneratedCard = z.infer<typeof GeneratedCardSchema>;
