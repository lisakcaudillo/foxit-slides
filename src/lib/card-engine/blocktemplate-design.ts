/**
 * blocktemplate-design.ts — the blockTemplate-keyed design table.
 *
 * RECIPE RETIREMENT, scope (a) — S1 (additive, NOT yet wired).
 *
 * Background: after B2b, `recipe` no longer drives layout (the converter decides
 * composition from `blockTemplate`). `recipe` survives only as a planner-internal
 * detail feeding a handful of secondary decisions. This table is the
 * blockTemplate-keyed home for the two pieces of design data that were ONLY
 * reachable through the recipe catalog:
 *   - `allowedImageRoles` — which image roles a slide of this template may carry
 *   - `textSafeZone`      — provenance metadata (does NOT drive geometry; the
 *                           text region is derived from the placed image box in
 *                           structuredToFreeform.imageAwareBounds)
 *
 * What is NOT here, on purpose:
 *   - `contentBudget` — already blockTemplate-keyed by `budgetForTemplate()`
 *     (index.ts). The recipe budget only TIGHTENED it via `mergeDesignBudget`.
 *     Duplicating budget here would create a second source of truth — exactly the
 *     hand-synced duplication recipe retirement removes. S2 drops the recipe
 *     tightening and uses `budgetForTemplate` directly; budget does not move here.
 *
 * The values below are PROPOSED (S1). They are eyed against the collapse table
 * (recipe-retirement-design.md) before S2 wires them. Several blockTemplates that
 * never earn an auto-image (the image gate `imageValueForBlockTemplate` scores
 * them 0) keep `allowedImageRoles` only for documentation / defensive parity —
 * `selectImageBudget` never selects them, so their roles are not consulted in
 * the live auto-image flow.
 *
 * Keyed by the canonical `BlockTemplate` union so `tsc` enforces all 21 present.
 */

import type { BlockTemplate } from './types';
import type { ImageRole, TextSafeZone } from './design-types';

export interface BlockTemplateDesign {
  /** Image roles a slide of this template may carry. Only CONSULTED for templates
   *  the image gate scores > 0 (paragraph-content, bullet-list, hero-title,
   *  chapter-divider, covers); type-only templates list ['none']. Covers are
   *  driven by `coverTierImageRole`, so their entry here is not used by the
   *  auto-image flow (kept for completeness). */
  allowedImageRoles: ImageRole[];
  /** Provenance metadata ONLY — does not drive geometry. Mirrors the dominant
   *  former recipe's safe zone for continuity. */
  textSafeZone: TextSafeZone;
}

export const BLOCKTEMPLATE_DESIGN: Record<BlockTemplate, BlockTemplateDesign> = {
  // ── Covers (image role comes from coverTier, not this table — values moot) ──
  'cover-minimal':      { allowedImageRoles: ['none', 'band', 'column'], textSafeZone: 'left' },
  'cover-subtitle':     { allowedImageRoles: ['none', 'band', 'column', 'full-bleed', 'duotone'], textSafeZone: 'lower-third' },

  // ── Image-capable content (gate > 0 — these are the live decisions) ─────────
  'hero-title':         { allowedImageRoles: ['none', 'full-bleed', 'duotone'], textSafeZone: 'corner' },
  // COLLAPSE (4 recipes → one): split-image[column] · full-bleed-safe-zone[full-bleed,duotone]
  //   · top-band[band,none] · text-led[none,texture]. Proposed set keeps SUPPORTING
  //   roles (column/band/texture) + none; DROPS full-bleed/duotone (a prose slide
  //   no longer becomes a full-bleed statement — that intent now lives in hero-title).
  'paragraph-content':  { allowedImageRoles: ['none', 'column', 'band', 'texture'], textSafeZone: 'full' },
  'bullet-list':        { allowedImageRoles: ['none', 'column'], textSafeZone: 'full' },
  // NEWLY AUTHORED (no prior recipe mapped chapter-divider; its old roles were
  // whitelist-arbitrary). Section break → full-bleed or texture reads well.
  'chapter-divider':    { allowedImageRoles: ['none', 'full-bleed', 'texture'], textSafeZone: 'center' },

  // ── Type-only / composition-is-the-visual (gate = 0 — roles not live) ───────
  'agenda':             { allowedImageRoles: ['none'], textSafeZone: 'full' },
  'key-metric-trio':    { allowedImageRoles: ['none', 'texture'], textSafeZone: 'full' },
  'key-metric-quad':    { allowedImageRoles: ['none', 'texture'], textSafeZone: 'full' },
  'grid-2x2':           { allowedImageRoles: ['none', 'texture'], textSafeZone: 'full' },
  'grid-1x3':           { allowedImageRoles: ['none'], textSafeZone: 'full' },
  'comparison-2col':    { allowedImageRoles: ['none', 'duotone'], textSafeZone: 'full' },
  'features-grid':      { allowedImageRoles: ['none'], textSafeZone: 'full' },
  'timeline':           { allowedImageRoles: ['none', 'band'], textSafeZone: 'full' },
  'process-horizontal': { allowedImageRoles: ['none', 'band'], textSafeZone: 'full' },
  'icon-list':          { allowedImageRoles: ['none', 'band'], textSafeZone: 'full' },
  'callout-list':       { allowedImageRoles: ['none', 'texture'], textSafeZone: 'full' },
  'quote-pull':         { allowedImageRoles: ['none', 'full-bleed', 'texture'], textSafeZone: 'center' },
  'toggles':            { allowedImageRoles: ['none'], textSafeZone: 'full' },
  'summary-takeaways':  { allowedImageRoles: ['none'], textSafeZone: 'full' },
  'cta-closing':        { allowedImageRoles: ['none'], textSafeZone: 'full' },
};

/** Defensive default for an unknown / missing blockTemplate (mirrors the engine's
 *  `default` budget posture: type-only, full safe zone). */
export const DEFAULT_BLOCKTEMPLATE_DESIGN: BlockTemplateDesign = {
  allowedImageRoles: ['none'],
  textSafeZone: 'full',
};

/** Look up the design for a blockTemplate, tolerant of `undefined`/unknown
 *  strings (the planner sees `blockTemplate?: string`). */
export function designForBlockTemplate(
  blockTemplate: string | undefined,
): BlockTemplateDesign {
  if (blockTemplate && blockTemplate in BLOCKTEMPLATE_DESIGN) {
    return BLOCKTEMPLATE_DESIGN[blockTemplate as BlockTemplate];
  }
  return DEFAULT_BLOCKTEMPLATE_DESIGN;
}
