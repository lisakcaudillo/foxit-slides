/**
 * structured → freeform converter.
 *
 * Part of the unified-format rewrite (Phase A, 2026-05-21). Walks the legacy
 * `columns[].blocks` structured-flow content and produces an equivalent set
 * of `FreeformBlock`s with computed positions, then returns a Card whose
 * `freeform` array contains them and whose `columns` is wiped to a single
 * empty column (the renderer no longer reads it under unified format).
 *
 * Positioning is intentionally simple — a top-down cursor over the card's
 * 90% × 90% content area. Smart-layout decomposes so each cell becomes its
 * own positioned cluster of (optional icon + heading + body) freeform blocks.
 *
 * Phase C will replace this converter with a generator that emits freeform
 * blocks natively (no structured intermediate). Until then this is the
 * adapter at the seam between generation output and the renderer.
 */

import type {
  Card,
  CardBlock,
  CardTemplate,
  FreeformBlock,
  FreeformIconBlock,
  FreeformShapeBlock,
  FreeformTextBlock,
  FreeformTextVariant,
  SmartLayoutCell,
  TemplateTheme,
} from '@/types/card-template';
import {
  STAT_GRID_PIECE,
  STAT_TRIO_PIECE,
  type CellSlot,
  type LayoutPiece,
} from '@/lib/card-engine/layout-vocabulary';
import {
  composeStructuredContent,
  composeComparison,
  composeProcess,
  composeContentGrid,
} from '@/lib/card-engine/slide-compositions';
import { estHeight, CANVAS } from '@/lib/card-engine/slide-typography';
import { DESIGN_STANDARD } from '@/lib/card-engine/slide-standard';

// ── Layout constants — sourced from the calibrated DESIGN_STANDARD ───────────
// The layout stage reads the design system DIRECTLY (design-system-wiring-spec.md):
// the safe-area inset is `DESIGN_STANDARD.padding.insetPx` (64px on 960×540,
// calibrated from votes — padding, especially TOP and LEFT, is the #1
// recurring defect, so 64 is a FLOOR). Converted px → % per axis. Replaces the
// old hardcoded 8/92/7 constants so the slots honor the calibration, not a guess.
const CARD_W_PX = DESIGN_STANDARD.canvas.w; // 960
const CARD_H_PX = DESIGN_STANDARD.canvas.h; // 540
const INSET_X_PCT = (DESIGN_STANDARD.padding.insetPx / CARD_W_PX) * 100; // ≈6.7%
const INSET_Y_PCT = (DESIGN_STANDARD.padding.insetPx / CARD_H_PX) * 100; // ≈11.9%
const CONTENT_TOP = INSET_Y_PCT;
const CONTENT_BOTTOM = 100 - INSET_Y_PCT;
const CONTENT_SIDE_MARGIN = INSET_X_PCT;  // %  from left/right edges

interface ContentBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Default content bounds — the full content area with side margins.
 *
 *  Image placement is now owned entirely by the Design Intelligence Layer
 *  (`slideDesign.imageRole` + `imageIntent`), which places real images as
 *  freeform blocks and routes text into the complementary region via
 *  `imageAwareBounds`. The legacy `split-left` / `split-right` accent zone
 *  (a theme-gradient half-panel set by the card-engine on every split layout)
 *  is no longer rendered — it read as an empty "placeholder image" when no
 * image filled it (Issue #1,. So split layouts no longer
 *  reserve a half here; content reflows to full width and the DIL decides if
 *  and where an image goes. */
function boundsForLayout(_layout: string | undefined): ContentBounds {
  return { left: CONTENT_SIDE_MARGIN, right: 100 - CONTENT_SIDE_MARGIN, top: CONTENT_TOP, bottom: CONTENT_BOTTOM };
}

/** Half-width text bounds for a hero (split) template when no region-occupying
 *  imageRole already carved one out (`imageAwareBounds` returned null). The
 *  geometry MIRRORS the `column` case of `imageAwareBounds` so text and image
 *  never share a side:
 *    • hero-text-right → image LEFT  → text RIGHT half (x ≥ 50, right ≤ 93)
 *    • hero-text-left  → image RIGHT → text LEFT  half (x ≥ 7,  right ≤ 50)
 *  Returns null for non-hero templates (caller falls back to full-width). */
function heroBoundsForTemplate(template: LayoutTemplate): ContentBounds | null {
  if (template === 'hero-text-right') {
    return {
      left: 46 + REGION_GUTTER, // 50%
      right: 100 - CONTENT_SIDE_MARGIN,
      top: CONTENT_TOP,
      bottom: CONTENT_BOTTOM,
    };
  }
  if (template === 'hero-text-left') {
    return {
      left: CONTENT_SIDE_MARGIN,
      right: 54 - REGION_GUTTER, // 50%
      top: CONTENT_TOP,
      bottom: CONTENT_BOTTOM,
    };
  }
  return null;
}

// ── Image-aware text bounds (Design Intelligence Layer) ──────────────────────
// When the deck planner assigned a region-occupying `imageRole`, the image
// claims part of the card. Text must flow into the COMPLEMENTARY region so it
// never runs over the image (the overlap bug flagged 2026-06-03: a
// split-image / imageRole:'column' slide placed the image left 0–46% but the
// text rendered full-width and ran straight across it).
//
// The geometry here MIRRORS `imageRoleBox` in editor/slides/page.tsx — the
// source of truth for where the image sits. They MUST stay consistent so text
// and image never land on the same side:
//   • column, image LEFT  (x:0,  w:46) → text RIGHT: x ≥ 50, right ≤ 96
//   • column, image RIGHT (x:54, w:46) → text LEFT:  x ≥ 4,  right ≤ 50
//   • band  (image top 0–30%)          → text BELOW: top ≥ 34, full width
//   • full-bleed/duotone/texture/background → image is BEHIND text (z=0);
//     text keeps full geometry (legibility handled by scrim/contrast, see
//     the TODO in cardToUnified — out of scope for this overlap fix).
//   • none / undefined                 → null (caller uses today's bounds).
//
// IMAGE SIDE DERIVATION: matches `imageRoleBox(role, placement)` exactly —
// for `column` the image is LEFT only when placement === 'left', otherwise
// RIGHT (covers right/hero/background/top/undefined). The recipe's
// `textSafeZone` is NOT trusted here because it can disagree with the actual
// placed image side (e.g. split-image's safe-zone says 'left' while the
// product archetype anchors the image left); we trust the image box instead.
const REGION_GUTTER = 4; // % breathing room between text and image edge.

type CardImageRole =
  | 'none' | 'full-bleed' | 'column' | 'band' | 'texture' | 'duotone' | 'background';

function imageAwareBounds(card: Card): ContentBounds | null {
  const role = card.slideDesign?.imageRole as CardImageRole | undefined;
  if (!role || role === 'none') return null;

  // Behind-text roles: image fills the card at z=0; text stays full-area.
  // Legibility is a scrim/contrast concern, not a geometry one — leave text
  // bounds to the caller (null) so we don't constrain a full-card image.
  if (role === 'full-bleed' || role === 'duotone' || role === 'texture' || role === 'background') {
    return null;
  }

  // band / column reserve a region for the image and flow text into the
  // complementary area — but ONLY when an image is ACTUALLY present. The
  // planner's role is a proposal the async auto-image flow may never fulfill;
  // reserving for a phantom image is what crammed the content.
  // No real image → null → the caller uses the full content area.
  if (!cardHasImage(card)) return null;

  if (role === 'band') {
    // Image occupies the top 30% band → text flows below it, full width.
    return {
      left: CONTENT_SIDE_MARGIN,
      right: 100 - CONTENT_SIDE_MARGIN,
      top: 30 + REGION_GUTTER, // 34%
      bottom: CONTENT_BOTTOM,
    };
  }

  if (role === 'column') {
    // Mirror imageRoleBox: image LEFT iff placement === 'left', else RIGHT.
    const imageLeft = card.imageIntent?.placement === 'left';
    if (imageLeft) {
      // Image left 0–46% → text right half.
      return {
        left: 46 + REGION_GUTTER, // 50%
        right: 100 - CONTENT_SIDE_MARGIN,
        top: CONTENT_TOP,
        bottom: CONTENT_BOTTOM,
      };
    }
    // Image right 54–100% → text left half.
    return {
      left: CONTENT_SIDE_MARGIN,
      right: 54 - REGION_GUTTER, // 50%
      top: CONTENT_TOP,
      bottom: CONTENT_BOTTOM,
    };
  }

  return null;
}

// Per-block-type vertical footprint FLOORS, in % of card height. These are
// the minimum h a block reserves when its content is short; contentAwareHeight
// (below) overrides upward when wrapped content needs more room. Lowered
// substantially 2026-05-22,
// bullet 28%, callout 18%) reserved 100-140px on a 540px card even for
// one-line bodies, which pushed trailing content past the card boundary on
// dense slides (heading + 3-cell smart-layout + trailing callout). Now the
// floors approximate a single rendered line plus a small buffer; long
// content still expands naturally via contentAwareHeight.
const BLOCK_HEIGHT_DEFAULTS: Record<string, number> = {
  heading: 18,        // level 1 (display) — actual content drives most h
  subheading: 8,      // level 2 (one-line floor; was 11)
  heading3: 10,       // level 3 (one-line floor; was 13)
  paragraph: 8,       // one-line floor (was 26)
  bulletList: 10,     // ~2 items floor (was 28)
  callout: 8,         // one-line floor (was 18)
  divider: 2,
  toggle: 8,          // was 10
  button: 8,          // was 9
  labelGroup: 8,      // was 11
  image: 30,          // images stay at 30% (visual surface needs presence)
};

// Reference card dimensions (CARD_W_PX / CARD_H_PX) are sourced from
// DESIGN_STANDARD.canvas at the top of this file (px ↔ % math).

// Per-type rendering metrics, in px. Used to predict wrap line count + line
// height to give each block enough vertical room to fit its actual
// rendered text. Keeping these tied to the TextContent variant styles in
// FreeformLayer.tsx: heading = 2.4rem/1.15, subheading = 1.4rem/1.3,
// paragraph = 1rem/1.6. Char-width estimates are conservative (Inter is
// fairly compact; we err on the side of overestimating line count).
const TEXT_METRICS = {
  heading:    { fontPx: 38, lineHeightPx: 44, charWidthPx: 21 },
  subheading: { fontPx: 22, lineHeightPx: 29, charWidthPx: 12 },
  paragraph:  { fontPx: 16, lineHeightPx: 26, charWidthPx: 9 },
  callout:    { fontPx: 16, lineHeightPx: 26, charWidthPx: 9 },
  // metric — the big hero number in a stat cell. font 48px, weight 800,
  // tight leading. char-width ≈ 0.88×font: heavy 800-weight DISPLAY digits are
  // wide, and metric strings carry $, commas, % and decimals that widen the
  // average glyph further. Conservative (over-estimate) so the adaptive fit in
  // layoutFromPiece scales a long number DOWN to fit the cell rather than
  // letting it clip. Used as the reference point for fitFontPx.
  metric:     { fontPx: 48, lineHeightPx: 52, charWidthPx: 42 },
} as const;

/**
 * Predict the vertical footprint a text block needs based on its content
 * length and container width. Heading wrap in hero/split-layout columns
 * (narrower than full-width) was causing overlap because the previous
 * char-only estimator didn't know the container was half-width. Now we
 * estimate chars-per-line from the actual width and multiply by line height.
 */
function contentAwareHeight(
  base: number,
  charLen: number,
  widthPercent: number,
  variant: keyof typeof TEXT_METRICS,
): number {
  const m = TEXT_METRICS[variant];
  const widthPx = (widthPercent / 100) * CARD_W_PX;
  // Account for 4px text padding on each side (matches TextContent style).
  const usablePx = Math.max(20, widthPx - 8);
  const charsPerLine = Math.max(8, usablePx / m.charWidthPx);
  const lines = Math.max(1, Math.ceil(charLen / charsPerLine));
  const requiredPx = lines * m.lineHeightPx + 8; // +8 for vertical padding
  const requiredPct = (requiredPx / CARD_H_PX) * 100;
  return Math.max(base, requiredPct);
}

// ── Layout quality gate: relative cramping detection ────────────────────────
// "Looks cramped as if the space weren't there." This is NOT an emptiness check
// — negative space is fine, even good. It flags text that is forced to wrap
// (short text on ≥2 lines) in a column NARROWER than it needs, WHILE free,
// usable horizontal space adjacent to it would have let it fit on fewer lines.
// That contradiction — squeezed content next to reclaimable room — is the
// defect (e.g. a 3-section block jammed into a hero half while the reserved
// image half sits empty, wrapping "Mentor Assignment" onto 2–3 lines). A
// genuinely FULL slide where text wraps because every region is occupied is NOT
// flagged: there is no adjacent room to expand into, so the wrap is forced, not
// self-imposed. Deterministic, geometry-only — no VLM. Runs on the MEASURED
// layout (real rendered line counts), where all the data already exists.

export interface LayoutGateBlock {
  id: string;
  type: string;          // 'text' | 'image' | 'shape' | 'icon'
  x: number; y: number; w: number; h: number; // % of the 960×540 card
  charLen?: number;      // trimmed text length (text blocks only)
  variant?: string;      // 'heading' | 'subheading' | 'paragraph' | 'metric'
  fontSizePx?: number;   // resolved font size when overridden (else variant default)
  lineCount?: number;    // MEASURED rendered line count (from the DOM)
}

export interface LayoutGateIssue {
  blockId: string;
  kind: 'cramped-wrap';
  detail: string;
}

/** Free horizontal space (% of card) beside `b` within `safe`, across b's
 *  vertical band, not occupied by any OTHER block. Left-free + right-free. This
 *  is the "reclaimable room" — if it's large, the wrap was self-imposed. */
function freeWidthBeside(
  b: LayoutGateBlock,
  all: LayoutGateBlock[],
  safe: { left: number; right: number },
): number {
  const top = b.y;
  const bot = b.y + b.h;
  const band = all.filter((o) => o.id !== b.id && o.y < bot && o.y + o.h > top);
  let rightLimit = safe.right;
  let leftLimit = safe.left;
  for (const o of band) {
    if (o.x >= b.x + b.w) rightLimit = Math.min(rightLimit, o.x);
    if (o.x + o.w <= b.x) leftLimit = Math.max(leftLimit, o.x + o.w);
  }
  return Math.max(0, rightLimit - (b.x + b.w)) + Math.max(0, b.x - leftLimit);
}

/** Flag text that's cramped (short text wrapping to ≥2 lines in a starved
 *  column) when reclaimable free space beside it would let it fit on one line.
 *  Pure + deterministic. Returns [] for a legitimately full slide. */
export function detectCrampedLayout(
  blocks: LayoutGateBlock[],
  safe: { left: number; right: number; top: number; bottom: number },
): LayoutGateIssue[] {
  const issues: LayoutGateIssue[] = [];
  for (const b of blocks) {
    if (b.type !== 'text' || !b.lineCount || b.lineCount < 2) continue; // only wrapped text
    const charLen = b.charLen ?? 0;
    if (charLen === 0) continue;
    const v = (b.variant === 'heading' || b.variant === 'subheading' || b.variant === 'metric')
      ? b.variant : 'paragraph';
    const m = TEXT_METRICS[v];
    // Char width scales with the block's actual font size when overridden.
    const charW = b.fontSizePx ? m.charWidthPx * (b.fontSizePx / m.fontPx) : m.charWidthPx;
    // Width (%) the text would need to sit on a SINGLE line.
    const neededPct = ((charLen * charW + 8) / CARD_W_PX) * 100;
    // Genuinely long text (needs most of the slide for one line) wraps for real
    // reasons — not a cramping defect. Only flag SHORT text being squeezed.
    if (neededPct > 60) continue;
    if (b.w >= neededPct) continue; // already wide enough (guard)
    const free = freeWidthBeside(b, blocks, safe);
    if (b.w + free >= neededPct) {
      issues.push({
        blockId: b.id,
        kind: 'cramped-wrap',
        detail: `text (${charLen} chars) wraps to ${b.lineCount} lines in a ${Math.round(b.w)}% column, `
          + `but ${Math.round(b.w + free)}% is free beside it → it could sit on one line. Cramped despite room.`,
      });
    }
  }
  return issues;
}

// Block-to-block vertical gap (%).
const BLOCK_GAP = 2;

// ── Layout templates (Phase C) ──────────────────────────────────────────────
// Templates supply starting positions and target heights for the converter
// based on the SHAPE of a card's structured content. The cursor-down
// algorithm in blocksToFreeform stays as the fallback for shapes a template
// doesn't recognise. Auto-layout pass downstream still corrects for content
// overflow.

type LayoutTemplate =
  | 'cover'           // heading-only (and optional subtitle) → vertically centered
  | 'title-body'      // heading + paragraph(s)
  | 'title-list'      // heading + bullet-list or smart-layout
  | 'hero-text-right' // split-left (accent on left, text on right)
  | 'hero-text-left'  // split-right (accent on right, text on left)
  | 'stat-grid'       // data-driven 2×2 metric grid (LayoutPiece)
  | 'stat-trio'       // data-driven 1×3 metric row (LayoutPiece)
  | 'structured-content' // panel + dominant title + numbered cards (composeStructuredContent)
  | 'comparison'      // two side-by-side columns + VS badge (composeComparison)
  | 'process'         // horizontal numbered milestone row (composeProcess)
  | 'content-grid'    // multi-icon grid of equal cells (composeContentGrid)
  | 'stack';          // fallback — cursor-down through whatever's there

/** Does this card actually have an image to fill a split half? True when a
 *  structured image block exists, a user-placed freeform image has a src, or
 *  the Design Intelligence Layer assigned a region-occupying imageRole
 *  (column/band) — meaning an auto-image will be placed into that region.
 *  Used to GATE split templates: the gradient accent panel was removed
 *  (Issue #1, 2026-06-03), so a split with no image leaves an empty half. */
function cardHasImage(card: Card): boolean {
  // ADAPT TO REALITY: an image counts only when it is ACTUALLY
  // on the slide — a real image block with a src. The planner's `imageRole`
  // (column/band) is a PROPOSAL; the auto-image flow that fulfills it is async +
  // best-effort, so a column/band role frequently has NO image behind it. Keying
  // "has image" off the role made the layout reserve a half for a phantom image
  // and cram the content into the other half (the title slide jammed right, the
  // 3-section slides double-lining). Only a present image reserves space.
  const structured = card.columns?.[0]?.blocks ?? [];
  if (structured.some((b) => b.type === 'image' && !!b.src)) return true;
  const freeform = card.freeform ?? [];
  if (freeform.some((b) => b.type === 'image' && !!b.src)) return true;
  return false;
}

/** Does this card carry a smart-layout block with cells (the metric cells a
 *  stat-grid / stat-trio piece fills)? Gates the data-driven grid templates so
 *  a stat recipe with no actual cell content falls back to a structured
 *  template instead of an empty grid. */
function cardHasMetricCells(card: Card): boolean {
  const blocks = card.columns?.[0]?.blocks ?? [];
  return blocks.some(
    (b) => b.type === 'smart-layout' && Array.isArray(b.cells) && b.cells.length > 0,
  );
}

/** Does this card carry rich multi-point content (a smart-layout with ≥2 cells
 *  that have BOTH a heading and body, or a bullet-list with ≥2 items)? These are
 *  the "key points" content slides that today collapse to bullets — they get the
 *  structured-content composition (panel + dominant title + numbered cards). */
function cardHasStructuredItems(card: Card): boolean {
  const blocks = card.columns?.[0]?.blocks ?? [];
  const sl = blocks.find((b) => b.type === 'smart-layout');
  if (sl && sl.type === 'smart-layout' && Array.isArray(sl.cells)
    && sl.cells.filter((c) => (c.heading?.trim() && c.body?.trim())).length >= 2) return true;
  const bl = blocks.find((b) => b.type === 'bullet-list');
  if (bl && bl.type === 'bullet-list' && Array.isArray(bl.items) && bl.items.length >= 2) return true;
  return false;
}

/** Pull the title / subtitle / items out of a card's structured blocks for the
 *  structured-content composition. */
function extractStructuredContent(card: Card): { title: string; subtitle?: string; items: { heading: string; body: string; icon?: string }[] } {
  const blocks = card.columns?.[0]?.blocks ?? [];
  const heading = blocks.find((b) => b.type === 'heading');
  const title = heading && heading.type === 'heading' ? heading.content : '';
  const para = blocks.find((b) => b.type === 'paragraph');
  const subtitle = para && para.type === 'paragraph' ? para.content : undefined;
  const sl = blocks.find((b) => b.type === 'smart-layout');
  let items: { heading: string; body: string; icon?: string }[] = [];
  if (sl && sl.type === 'smart-layout' && Array.isArray(sl.cells)) {
    items = sl.cells.filter((c) => c.heading?.trim() || c.body?.trim()).map((c) => ({ heading: c.heading ?? '', body: c.body ?? '', icon: c.icon }));
  } else {
    const bl = blocks.find((b) => b.type === 'bullet-list');
    if (bl && bl.type === 'bullet-list' && Array.isArray(bl.items)) items = bl.items.map((it) => ({ heading: it, body: '' }));
  }
  return { title, subtitle, items };
}

/** Count the rich multi-point items a card carries (smart-layout cells with a
 *  heading, or bullet items). Gates the typed-layout compositions so e.g. a
 *  comparison only fires with two sides to compare. */
function structuredItemCount(card: Card): number {
  const blocks = card.columns?.[0]?.blocks ?? [];
  const sl = blocks.find((b) => b.type === 'smart-layout');
  if (sl && sl.type === 'smart-layout' && Array.isArray(sl.cells)) {
    return sl.cells.filter((c) => c.heading?.trim() || c.body?.trim()).length;
  }
  const bl = blocks.find((b) => b.type === 'bullet-list');
  if (bl && bl.type === 'bullet-list' && Array.isArray(bl.items)) return bl.items.length;
  return 0;
}

/** Map a Design Intelligence Layer recipe → an EXISTING layout template.
 *  Returns null when the recipe doesn't dictate a template (the caller then
 *  falls back to the shape-based detection below). Split/image-led recipes
 *  only map to a hero template when the card actually has an image — otherwise
 *  null so the caller renders a full-width structured template instead of an
 *  empty half. `imageLeft` decides which hero variant (text on the opposite
 *  side) mirrors imageAwareBounds' image-side derivation. */
// B1 (2026-06-11): `templateForRecipe` (Table #2) is collapsed INTO `pickTemplate` below —
// recipe→composition + the shape-detection fallback are now one converter-side decider, so a
// recipe name is resolved to a composition in exactly one place. Behavior-preserving inline
// (each former `return null` becomes a fall-through to the shape-detection tail).

/** Pick the best template. The Design Intelligence Layer recipe wins when
 *  present and valid (with safe image-gating); otherwise we fall back to the
 *  card.layout + structured-block-shape detection (today's behavior). */
// Full-canvas compositions place content across the WHOLE slide and reserve no
// region for an image., P3a lock-the-box): a slide is EITHER
// a full-canvas composition OR an image+content split — never both. A composition
// slide gets NO image (the composition IS the visual). This Set + predicate is the
// SINGLE source both the converter (strips any image) and the editor's async
// auto-image gate read, so the two can't disagree — that disagreement (layout
// decided here, image placed there, blind to each other) was the overlap bug.
const COMPOSITION_TEMPLATES: ReadonlySet<LayoutTemplate> = new Set([
  'structured-content', 'comparison', 'process', 'content-grid',
]);

function pickTemplate(card: Card): { template: LayoutTemplate; viaBlockTemplate: boolean } {
  // B2b (2026-06-11) — the SINGLE content-led layout decision. Composition is
  // decided from the blueprint's `blockTemplate` intent (carried onto slideDesign
  // in B2a) reconciled against the REALIZED content (the gates below), in ONE
  // place. The former recipe branch (and the whole recipe→composition table) is
  // gone: recipe no longer drives layout. The blockTemplate branch resolves a
  // concrete composition (with content gates) or null to defer; when it defers,
  // the shape-detection tail decides. `viaBlockTemplate` reports which path decided.
  //
  // Image-split layouts are NOT a blockTemplate — they come from `card.layout`
  // (split-left/right) + an actual image, handled by the shape-detection tail. A
  // prose blockTemplate therefore DEFERS (null) so that tail can host an image.
  const fromBlockTemplate: LayoutTemplate | null = ((): LayoutTemplate | null => {
    switch (card.slideDesign?.blockTemplate) {
      case 'cover-minimal':
      case 'cover-subtitle':
        return 'cover';
      case 'quote-pull':
        return 'title-body'; // no dedicated quote template — title-body reads cleanly
      // Metric grids → the data-driven stat composition when real metric cells
      // exist, else the content-grid (gated), else defer. Trio keeps its 1×3 row;
      // quad / 2×2 use the 2×2 grid.
      case 'key-metric-trio':
        return cardHasMetricCells(card)
          ? 'stat-trio'
          : (structuredItemCount(card) >= 2 ? 'content-grid' : null);
      case 'key-metric-quad':
      case 'grid-2x2':
        return cardHasMetricCells(card)
          ? 'stat-grid'
          : (structuredItemCount(card) >= 2 ? 'content-grid' : null);
      // Comparison — two sides to compare.
      case 'comparison-2col':
        return structuredItemCount(card) >= 2 ? 'comparison' : null;
      // Sequence → horizontal process milestone row.
      case 'process-horizontal':
      case 'timeline':
      case 'agenda':
        return structuredItemCount(card) >= 2 ? 'process' : null;
      // Multi-item content → equal-cell content grid (gated). grid-1x3 is an
      // icon+heading+body content grid (not metrics), so it lives here too.
      case 'grid-1x3':
      case 'icon-list':
      case 'features-grid':
      case 'callout-list':
      case 'summary-takeaways':
      case 'toggles':
      case 'cta-closing':
        return structuredItemCount(card) >= 2 ? 'content-grid' : null;
      // hero-title / paragraph-content / bullet-list / chapter-divider /
      // unknown / none → defer to shape detection (it picks cover / title-body /
      // title-list / hero from the realized content + layout).
      default:
        return null;
    }
  })();
  if (fromBlockTemplate) return { template: fromBlockTemplate, viaBlockTemplate: true };

  // Shape-detection fallback (viaBlockTemplate: false). Rich multi-point content →
  // the structured-content composition instead of collapsing to bullets.
  if (cardHasStructuredItems(card)) return { template: 'structured-content', viaBlockTemplate: false };
  if (card.layout === 'split-left') return { template: cardHasImage(card) ? 'hero-text-right' : 'title-body', viaBlockTemplate: false };
  if (card.layout === 'split-right') return { template: cardHasImage(card) ? 'hero-text-left' : 'title-body', viaBlockTemplate: false };
  const blocks = card.columns?.[0]?.blocks ?? [];
  if (blocks.length === 0) return { template: 'stack', viaBlockTemplate: false };
  const first = blocks[0];
  if (first.type !== 'heading') return { template: 'stack', viaBlockTemplate: false };
  // Cover: just a heading, or heading + one short paragraph/heading.
  const isCover =
    blocks.length === 1
    || (blocks.length === 2
        && (blocks[1].type === 'paragraph'
            ? (blocks[1].content.length < 90)
            : blocks[1].type === 'heading'));
  if (isCover) return { template: 'cover', viaBlockTemplate: false };
  // Title + list — heading followed by bullet-list or smart-layout.
  const hasList = blocks.slice(1).some(
    (b) => b.type === 'bullet-list' || b.type === 'smart-layout',
  );
  if (hasList) return { template: 'title-list', viaBlockTemplate: false };
  return { template: 'title-body', viaBlockTemplate: false }; // default for heading + paragraph(s)
}

// ── ID generation ────────────────────────────────────────────────────────────
let idCounter = 0;
function nextFreeformId(): string {
  idCounter += 1;
  return `ff-conv-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// ── Markdown stripping ───────────────────────────────────────────────────────
// AI generations occasionally embed markdown emphasis markers (`**bold**`,
// `__bold__`, `*italic*`, `_italic_`) inside text content. The freeform
// renderer is plain-text (no markdown pass), so those markers render as
// literal characters on the slide — e.g. `**Product Team/Week 2**` shows
// up verbatim. Strip the markers at conversion time so the slide reads
// cleanly. flagged this 2026-05-22.
//
// Conservative regexes: `**...**` and `__...__` for bold (any non-greedy
// content between matched pairs); `*...*` and `_..._` only when the marker
// looks like emphasis (not a stand-alone bullet `*` or a snake_case
// identifier). Bold runs first so `***foo***` collapses to `*foo*` then
// to `foo`. Newlines and bullets are preserved.
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/(^|[\s(])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^\s_][^_]*?[^\s_]|[^\s_])_(?=[\s).,!?:;]|$)/g, '$1$2');
}

// ── Settle pass: enforce no AABB overlap among CONVERTER-generated blocks ────
//
// only. Once a user has placed a freeform block, the system never moves it.
// User blocks count as FIXED OBSTACLES so the converter doesn't blast over
// them, but their positions are never adjusted.
//
// Greedy top-down algorithm for `moveable` only: sort by y ascending, walk
// in order, for each block check AABB collision against already-settled
// moveables PLUS all `fixed` user blocks. If overlap, shift the block DOWN
// (never up, never sideways) until clear. Clamp to bounds.bottom — accept
// residual overlap rather than push a block off-card.
//
// Catches in the moveable set:
//   - converter height-prediction misses (contentAwareHeight underestimates)
//   - smart-layout cells where body content runs longer than expected
//   - any future template-positioned block that lands on a sibling
//
// Decorative shapes/icons pass through unchanged (and act as obstacles only)
// — future-proofing for intentional shape-behind-text designs.
function settleOverlaps(
  moveable: FreeformBlock[],
  fixed: FreeformBlock[],
  bounds: ContentBounds,
): FreeformBlock[] {
  if (moveable.length === 0) return moveable;

  const isDecorative = (b: FreeformBlock) =>
    b.type === 'shape' || b.type === 'icon';

  // Collision HEIGHT = the block's real rendered TEXT extent, not its box. A
  // text box can be taller than its text (then a box test false-positives on a
  // deliberate overlap) or shorter than its text (then a box test MISSES text
  // spilling past the box). Measuring the ink via estHeight makes the gate test
  // text-vs-text, which is what actually must not collide. Non-text blocks
  // (image/chart) keep their box height — their footprint IS the box.
  const collisionH = (b: FreeformBlock): number => {
    if (b.type === 'text' && typeof b.content === 'string' && b.content.trim()) {
      const fs = b.style?.fontSize ?? 24;
      const lh = b.style?.lineHeight ?? 1.3;
      const boxWpx = (b.w / 100) * CANVAS.w;
      return (estHeight(b.content, fs, boxWpx, lh) / CANVAS.h) * 100;
    }
    return b.h;
  };

  const overlaps = (a: FreeformBlock, b: FreeformBlock) =>
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + collisionH(b) &&
    a.y + collisionH(a) > b.y;

  // Sort moveable by y ascending; ties break by original index so the
  // converter's intent is preserved when y values match (e.g. icon + heading
  // co-anchored in the same row of a smart-layout cell).
  const indexed = moveable.map((b, i) => ({ b, i }));
  indexed.sort((a, z) => (a.b.y - z.b.y) || (a.i - z.i));

  const settled: FreeformBlock[] = [];
  for (const { b } of indexed) {
    // Decorative converter blocks pass through; still become obstacles.
    if (isDecorative(b)) {
      settled.push(b);
      continue;
    }
    let y = b.y;
    let guard = 0;
    while (guard < 100) {
      // Obstacles = previously settled moveables + the fixed user-block set.
      const obstacles: FreeformBlock[] = [...settled, ...fixed];
      const collidesWith = obstacles.find((s) =>
        overlaps({ ...b, y }, s) && !isDecorative(s),
      );
      if (!collidesWith) break;
      const newY = collidesWith.y + collisionH(collidesWith) + 0.5;
      if (newY <= y) break; // numerical edge case
      y = newY;
      guard += 1;
    }
    if (y + b.h > bounds.bottom) {
      // Settle pushed b past the card bottom while clearing obstacles
      // above. Pulling y back up to (bounds.bottom - b.h) would re-collide
      // with those obstacles — that's the exact text-on-text overlap
      // flagged 2026-05-24 (last subheading+paragraph pair on dense
      // slides). Try shrinking in place first; if the result still overlaps
      // or falls below the minH floor, drop the block. Better absent than
      // overlapping.
      const fitH = bounds.bottom - y;
      // Decorative blocks were already handled by the `if (isDecorative(b))`
      // branch above, so b here is always text/image/chart — use the
      // non-decorative floor.
      const floor = 6;
      if (fitH >= floor) {
        const shrunk = { ...b, y, h: fitH };
        // Sanity: shrinking shouldn't introduce overlap (y unchanged, h
        // smaller), but verify anyway.
        const stillCollides = [...settled, ...fixed].some((s) =>
          overlaps(shrunk, s) && !isDecorative(s),
        );
        if (stillCollides) continue;
        settled.push(shrunk);
      } else {
        // Can't fit at the settled y even shrunk to floor. Drop.
        continue;
      }
    } else {
      settled.push(y === b.y ? b : { ...b, y });
    }
  }

  // Restore original moveable array order via id-map. Blocks dropped by
  // the overflow handling above are filtered out so the caller doesn't
  // receive the original unsettled (overlapping) versions.
  const byId = new Map(settled.map((b) => [b.id, b]));
  return moveable.filter((b) => byId.has(b.id)).map((b) => byId.get(b.id)!);
}

// ── Public entry ─────────────────────────────────────────────────────────────

/** Convert a CardTemplate to unified-format: every card's structured blocks
 *  become freeform blocks; `columns` is wiped. Idempotent — if a card already
 *  has freeform blocks and an empty columns flow, it's returned as-is. */
export function templateToUnified(template: CardTemplate): CardTemplate {
  return {
    ...template,
    cards: template.cards.map((c) => cardToUnified(c, template.theme)),
  };
}

/** Convert a single Card to unified-format. Preserves card-level fields
 *  (id, layout, style, background, accent, provenance) and ANY existing
 *  freeform blocks (user-added blocks are merged on top of the converted
 *  structured content). Hero/split layouts get content positioned in the
 *  non-accent half so the image placeholder stays unobstructed. */
export function cardToUnified(card: Card, theme?: TemplateTheme): Card {
  const structuredBlocks = card.columns?.[0]?.blocks ?? [];
  // Card is already unified — no structured content to convert. The spread-free
  // early return preserves ALL card-level fields verbatim (including
  // `slideDesign` + `imageIntent` from the Design Intelligence Layer).
  if (structuredBlocks.length === 0) return card;

  // Image-aware bounds win when the planner assigned a region-occupying
  // imageRole (column / band) — text flows into the COMPLEMENTARY region so
  // it never overlaps the auto-placed image. Falls back to the layout-driven
  // bounds (today's behavior) when no slideDesign, imageRole 'none', or a
  // behind-text role (full-bleed/duotone/texture/background) — those keep
  // full-area text with the image at z=0 behind it.
  //
  // LEGIBILITY (behind-text roles): full-bleed / duotone / texture /
  // background sit at z=0 behind full-width text. Legibility is now guaranteed
  // at RENDER time, not here: FreeformLayer reads `card.slideDesign.imageRole`,
  // and for these behind-text roles it paints a soft gradient SCRIM between
  // the image and the text (strongest under the text-safe zone), then chooses
  // a light/dark text color against the scrim's known tone (WCAG ≥ 4.5:1 via
  // lib/contrast.ts → pickTextColor). The converter deliberately keeps text
  // full-area for these roles — constraining geometry here would fight the
  // scrim. We can't cheaply sample real image pixels client-side, which is
  // exactly why the scrim (a controlled, known background) is the mechanism
  // rather than per-pixel image analysis. The `slideDesign` field is preserved
  // verbatim on the returned card (see the spread below) so the renderer can
  // read the role. column / band roles already route text to the complementary
  // region via imageAwareBounds, so they need adaptive color (handled in the
  // renderer against the theme region) but no scrim.
  const { template, viaBlockTemplate } = pickTemplate(card);

  // B2a: stamp the full-canvas decision on slideDesign HERE — while columns are
  // still intact, before the composition empties them. Computed from the resolved
  // `template` (B2b: now blockTemplate-driven). The client auto-image gate reads
  // this stamp (B2b seam change) instead of recomputing on the raw card. Additive
  // metadata only → no render change.
  if (card.slideDesign) card.slideDesign.isFullCanvasComposition = COMPOSITION_TEMPLATES.has(template);

  // AC8 handover (additive instrumentation): writer→layout (the converter, now server-side after
  // Phase A). Where the blockTemplate INTENT is reconciled against realized content into a
  // composition; bugs are visible here (a sequence template → process; a template whose content
  // gate fails → shape-detection fallback). Unhappy when the blockTemplate branch did NOT decide.
  // (B2b: provenance comes from the single decider's `viaBlockTemplate`.)
  if (process.env.NODE_ENV !== 'production') {
    const bt = card.slideDesign?.blockTemplate ?? '(none)';
    const base = `writer→layout(converter) | received: blockTemplate=${bt}, items=${structuredItemCount(card)}, image=${cardHasImage(card)} | decided: composition=${template} | passed-on: blocks`;
    if (!viaBlockTemplate) {
      console.warn(`[handover!] ${base} | reason: blockTemplate "${bt}" gate failed → shape-detection fallback`);
    } else {
      console.log(`[handover] ${base}`);
    }
  }

  // Structured-content composition (panel + dominant title + numbered cards).
  // It's self-fitting (slide-typography guarantees the type scale + no clipping)
  // and self-positioning, so it bypasses the clamp/settle pass and returns early.
  // Needs the theme for the accent panel + colors; without it (e.g. the live
  // streaming path until that one call passes the theme) it falls back to the
  // existing title-list rendering below — never an error.
  if (COMPOSITION_TEMPLATES.has(template) && theme) {
    const sc = { ...extractStructuredContent(card), theme };
    const composed =
      template === 'comparison' ? composeComparison(sc)
        : template === 'process' ? composeProcess(sc)
          : template === 'content-grid' ? composeContentGrid(sc)
            : composeStructuredContent(sc);
    // P3a lock-the-box: a composition owns the whole slide → it gets NO image.
    // Drop any image block and mark imageRole 'none' so the editor's async
    // auto-image placement skips this slide too (the gate reads the same rule).
    const nonImageFreeform = (card.freeform ?? []).filter((b) => b.type !== 'image');
    const maxZ = composed.reduce((m, b) => Math.max(m, b.z), 0);
    const userBlocks = nonImageFreeform.map((b, i) => ({ ...b, z: maxZ + 1 + i }));
    const composedDesign = card.slideDesign
      ? { ...card.slideDesign, imageRole: 'none' as const }
      : card.slideDesign;
    return {
      ...card,
      slideDesign: composedDesign,
      imageIntent: card.imageIntent,
      columns: [{ blocks: [] }],
      freeform: [...composed, ...userBlocks],
    };
  }
  // No theme available for the composition → render as a list (today's behavior).
  const effectiveTemplate: LayoutTemplate = COMPOSITION_TEMPLATES.has(template) ? 'title-list' : template;

  // Bounds resolution order:
  //   1. imageAwareBounds — when the planner assigned a region-occupying
  //      imageRole (column/band), text flows into the COMPLEMENTARY region.
  //   2. heroBoundsForTemplate — when a hero template was chosen but no
  //      imageRole carved a region (e.g. a structured/freeform image without
  //      slideDesign.imageRole), reserve the opposite half so the text never
  //      runs over the image.
  //   3. boundsForLayout — today's full-width default.
  const bounds =
    imageAwareBounds(card) ?? heroBoundsForTemplate(effectiveTemplate) ?? boundsForLayout(card.layout);
  // Per-template positioning. Each template returns freeform blocks with
  // explicit positions; auto-layout pass downstream still adjusts for
  // content overflow so the template positions are a starting point, not
  // a hard contract.
  const converted = effectiveTemplate === 'cover'
    ? layoutCover(structuredBlocks, bounds)
    : effectiveTemplate === 'title-body'
      ? layoutTitleBody(structuredBlocks, bounds)
      : effectiveTemplate === 'title-list'
        ? layoutTitleList(structuredBlocks, bounds)
        : effectiveTemplate === 'hero-text-right' || effectiveTemplate === 'hero-text-left'
          ? layoutHero(structuredBlocks, bounds)
          // Data-driven grid pieces — geometry comes from the LayoutPiece, not
          // from `bounds`. layoutFromPiece reads the piece's regions + grid and
          // fits the actual content adaptively. Falls back to blocksToFreeform
          // (via bounds) when the card doesn't have the metric cells the piece
          // expects, so it never throws.
          : effectiveTemplate === 'stat-grid'
            ? layoutFromPiece(STAT_GRID_PIECE, structuredBlocks, bounds)
            : effectiveTemplate === 'stat-trio'
              ? layoutFromPiece(STAT_TRIO_PIECE, structuredBlocks, bounds)
              : blocksToFreeform(structuredBlocks, bounds);
  // Fit-to-bounds pass — two-stage so converter overflow never visually
  // leaks past the card edge:
  //
  //   1. DROP any block whose top is already at or past bounds.bottom
  //      (it would be entirely off-card with no useful render). AI
  //      generations on dense layouts can produce blocks the cursor-down
  //      placed past 92%; rendering them gives a sliver at the very
  //      bottom that distracts more than it informs. Better to omit.
  //   2. CLAMP remaining blocks so they don't extend past bounds.bottom.
  //      If clamp would push h below the minH floor, ALSO clamp y so
  //      the block fits in [bounds.bottom - h, bounds.bottom]. This
  //      keeps the visible content inside the card; settle-overlaps
  //      runs after and re-stacks if the y shift created collisions.
  //
  // Combined with the per-block overflow:hidden in FreeformLayer's
  // BlockView wrapper, this guarantees zero visual leakage.
  const minH = (b: FreeformBlock) =>
    b.type === 'shape' || b.type === 'icon' ? 3 : 6;
  // When the loop drops a block, the section heading right above it may
  // already be in `clamped`. Pop trailing subheadings so we don't leave
  // an orphan "Section Title" with no body underneath —
  // flagged a slide where Block 4's subheading rendered but its
  // paragraph had been dropped, producing a heading hanging at the
  // bottom of the card with nothing below it. Slide-title `heading`
  // variants are preserved (the slide always needs its own title);
  // only `subheading` pop targets section labels that pair with bodies.
  const popOrphanSubheadings = (list: FreeformBlock[]) => {
    while (list.length > 0) {
      const last = list[list.length - 1];
      if (last.type === 'text' && last.variant === 'subheading') {
        list.pop();
      } else {
        break;
      }
    }
  };
  const clamped: FreeformBlock[] = [];
  for (const b of converted) {
    // Stage 0 — strip empty-src image blocks. flagged
    // recurring "Image placeholder" rectangles on generated slides. The
    // AI's GeneratedBlockSchema doesn't include 'image' so the AI itself
    // never emits these — but defensively, if ANY converter path produces
    // an image block with no src and it wasn't placed by the user, drop
    // it. Foxit Slides has integrated image generation; an empty placeholder
    // is friction, not affordance. User can still add an image
    // intentionally from the Elements (frame) or Media (generate/upload)
    // panels.
    if (b.type === 'image' && !b.src) continue;
    // Stage 1 — drop fully-off-card blocks. A tiny tolerance (0.5%) lets
    // blocks that just barely touch the bottom still render.
    if (b.y >= bounds.bottom - 0.5) {
      popOrphanSubheadings(clamped);
      continue;
    }
    // Stage 2 — clamp.
    const overflow = (b.y + b.h) - bounds.bottom;
    if (overflow <= 0) {
      clamped.push(b);
      continue;
    }
    const floor = minH(b);
    const targetH = b.h - overflow;
    if (targetH >= floor) {
      clamped.push({ ...b, h: targetH });
    } else {
      // Can't shrink h below the floor without losing visible content.
      // Previously this pulled y UP so the block landed at (bounds.bottom -
      // floor, floor) — but on dense slides where the prior block ends near
      // bounds.bottom, the pull-up landed on top of it, producing the
      // text-on-text overlap flagged on 2026-05-24 (slide 1 with
      // 4 subheading+paragraph pairs: last paragraph touched / overlapped
      // its heading). Visible overlap reads as broken; a missing trailing
      // block reads as "AI generated too much for one slide" which is
      // recoverable (regenerate, shorten, add a slide). Drop instead —
      // and pop the orphan subheading above so the slide doesn't end on
      // a hanging "Section Title" with no body.
      popOrphanSubheadings(clamped);
      continue;
    }
  }

  const existingFreeform = card.freeform ?? [];
  // Existing user-added freeform blocks go on top (higher z) than converted ones.
  const maxConvertedZ = clamped.reduce((m, b) => Math.max(m, b.z), 0);
  const userBlocks = existingFreeform.map((b, i) => ({ ...b, z: maxConvertedZ + 1 + i }));

  // No-overlap settle pass — applies to CONVERTER output only. User blocks
  // act as fixed obstacles so the converter doesn't blast over content the
  // user placed deliberately, but their positions are never adjusted by
  // the system.: the user owns the position of every
  // block they place; the no-overlap rule is for AI-generated content.
  const settledConverted = settleOverlaps(clamped, userBlocks, bounds);

  return {
    // Spread preserves every card-level field — critically the Design
    // Intelligence Layer's `slideDesign` (recipe/imageRole/budget/provenance)
    // and `imageIntent`. These must survive the structured→freeform conversion
    // so they persist to storage and the per-slide override UI can read them
    // (BUG 3 fix 2026-06-03). Threaded explicitly below for regression safety.
    ...card,
    slideDesign: card.slideDesign,
    imageIntent: card.imageIntent,
    columns: [{ blocks: [] }],
    freeform: [...settledConverted, ...userBlocks],
  };
}

// ── Template-specific layouts ────────────────────────────────────────────────

/** Cover: heading vertically centered, optional subtitle below. */
function layoutCover(blocks: CardBlock[], bounds: ContentBounds): FreeformBlock[] {
  const out: FreeformBlock[] = [];
  let z = 1;
  const contentLeft = bounds.left;
  const contentWidth = bounds.right - bounds.left;
  const heading = blocks.find((b) => b.type === 'heading');
  const subtitle = blocks.find((b, i) => i > 0 && (b.type === 'paragraph' || b.type === 'heading'));
  if (heading && heading.type === 'heading') {
    const variant = heading.level === 1 ? 'heading' : 'subheading';
    const metricKey = variant === 'heading' ? 'heading' : 'subheading';
    const h = contentAwareHeight(BLOCK_HEIGHT_DEFAULTS.heading, heading.content.length, contentWidth, metricKey);
    const subtitleH = subtitle
      ? contentAwareHeight(BLOCK_HEIGHT_DEFAULTS.paragraph, getContent(subtitle).length, contentWidth, 'paragraph')
      : 0;
    // Build the title FIRST to use its REAL autofit-resolved height — textBlock
    // grows the box past the `h` estimate for a long wrapped title, and placing
    // the subtitle at `startY + h` (the estimate) drops it INTO the grown title
    // (the cover overlap flagged). Position everything off the real height.
    const titleBlock = textBlock({
      variant, content: heading.content,
      x: contentLeft, y: bounds.top, w: contentWidth, h, z: z++,
    });
    const realH = titleBlock.h;
    // Center vertically using the real title height.
    const totalH = realH + (subtitle ? 4 + subtitleH : 0);
    const startY = Math.max(bounds.top, 50 - totalH / 2);
    out.push({ ...titleBlock, y: startY });
    if (subtitle) {
      out.push(textBlock({
        variant: 'paragraph', content: getContent(subtitle),
        x: contentLeft, y: startY + realH + 4, w: contentWidth, h: subtitleH, z: z++,
      }));
    }
  } else {
    // Heading missing or wrong type — fall back to stack.
    return blocksToFreeform(blocks, bounds);
  }
  return out;
}

/** Title-body: heading near the top, paragraph(s) below, generous breathing
 *  room. Differs from cursor-down by giving the title a fixed-ish top slot
 *  rather than starting at the card's content-top margin. */
function layoutTitleBody(blocks: CardBlock[], bounds: ContentBounds): FreeformBlock[] {
  const out: FreeformBlock[] = [];
  let z = 1;
  const contentLeft = bounds.left;
  const contentWidth = bounds.right - bounds.left;
  // Heading slot — top 25% of content area.
  const heading = blocks[0];
  let cursor = bounds.top + 2;
  if (heading && heading.type === 'heading') {
    const variant = heading.level === 1 ? 'heading' : 'subheading';
    const metricKey = variant === 'heading' ? 'heading' : 'subheading';
    const h = contentAwareHeight(BLOCK_HEIGHT_DEFAULTS.heading, heading.content.length, contentWidth, metricKey);
    out.push(textBlock({
      variant, content: heading.content,
      x: contentLeft, y: cursor, w: contentWidth, h, z: z++,
    }));
    cursor += h + 4; // slightly larger gap after the title than the standard 2%
  }
  // Body — flow remaining blocks cursor-down (uses the stack algorithm).
  const remaining = heading?.type === 'heading' ? blocks.slice(1) : blocks;
  const rest = blocksToFreeform(remaining, { ...bounds, top: cursor });
  // The stack algorithm internally restarts z at 1 — bump them past the title.
  for (const r of rest) out.push({ ...r, z: z++ });
  return out;
}

/** Title-list: heading at the top, list/grid below with a clean gap. */
function layoutTitleList(blocks: CardBlock[], bounds: ContentBounds): FreeformBlock[] {
  // Same shape as title-body — the cursor-down handles bullet-list/smart-
  // layout correctly. The visual win here is the extra-tight title-to-list
  // gap (~3% instead of the default 2%) that makes lists feel tied to
  // their heading.
  return layoutTitleBody(blocks, bounds);
}

/** Hero: text content packed into the non-accent half (bounds already
 *  reflect that), vertically centered within the available height. */
function layoutHero(blocks: CardBlock[], bounds: ContentBounds): FreeformBlock[] {
  // Layout via cursor-down then shift the whole group to vertical center.
  const tentative = blocksToFreeform(blocks, bounds);
  if (tentative.length === 0) return tentative;
  const totalH = tentative.reduce((m, b) => Math.max(m, b.y + b.h), 0) - tentative[0].y;
  const targetTop = Math.max(bounds.top, (bounds.top + bounds.bottom) / 2 - totalH / 2);
  const offset = targetTop - tentative[0].y;
  if (Math.abs(offset) < 1) return tentative;
  return tentative.map((b) => ({ ...b, y: b.y + offset }));
}

// ── Data-driven layout engine (the Designer, Stage 1) ────────────────────────
//
// ONE engine that reads a LayoutPiece's region data and fits the ACTUAL
// content into it. The boxes (grid rects) are locked by the piece; the TEXT
// auto-fits each box (adaptive font size) so a long number never overflows or
// clips. Adding another grid piece later = adding DATA to layout-vocabulary.ts,
// not code here — the engine never references a specific piece id.

/** Estimate the largest font size (px) at which `text` fits on ONE line inside
 *  `boxWidthPct`% of the card width. Uses the variant's reference font/char-
 *  width ratio (TEXT_METRICS) to derive a per-char width that scales linearly
 *  with font size, then solves for the size where the string just fits. Capped
 *  at the variant's reference font and floored so it stays legible. This is the
 *  "lock the box, not the words" adaptivity: short "42%" keeps the big size,
 *  long "$1,234,567" scales down to fit the same cell. */
function fitFontPx(
  text: string,
  boxWidthPct: number,
  variant: keyof typeof TEXT_METRICS,
  opts?: { minPx?: number; maxPx?: number },
): number {
  const m = TEXT_METRICS[variant];
  const maxPx = opts?.maxPx ?? m.fontPx;
  const minPx = opts?.minPx ?? Math.round(m.fontPx * 0.4);
  const boxWidthPx = Math.max(20, (boxWidthPct / 100) * CARD_W_PX - 8); // -8 padding
  const len = Math.max(1, text.trim().length);
  // char-width is proportional to font size: ratio = referenceCharWidth / refFont.
  const charRatio = m.charWidthPx / m.fontPx;
  // size at which len chars exactly fill the box: boxWidthPx = len * charRatio * size.
  const fitPx = boxWidthPx / (len * charRatio);
  return Math.max(minPx, Math.min(maxPx, Math.round(fitPx)));
}

/** Compute the uniform cell rects for a grid, in % of the card. Pure geometry
 *  derived ENTIRELY from the piece's GridSpec — no hardcoded per-piece numbers.
 *  The cluster is vertically centered inside the spec's band; cells are even. */
function gridCellRects(
  grid: LayoutPiece['grid'],
  cellCount: number,
): { x: number; y: number; w: number; h: number }[] {
  const { cols, rows, marginX, gutterX, gutterY, band } = grid;
  const usableW = 100 - 2 * marginX;
  const cellW = (usableW - (cols - 1) * gutterX) / cols;

  // How many rows are actually populated (cells may underfill the grid).
  const usedRows = Math.max(1, Math.min(rows, Math.ceil(cellCount / cols)));
  const bandH = band.bottom - band.top;
  // Even row height across the FULL spec rows, then center the used rows.
  const fullClusterH = bandH;
  const rowH = (fullClusterH - (rows - 1) * gutterY) / rows;
  const usedClusterH = usedRows * rowH + (usedRows - 1) * gutterY;
  // Vertically center the populated cluster inside the band.
  const top = band.top + (bandH - usedClusterH) / 2;

  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < cellCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (row >= usedRows) break;
    const x = marginX + col * (cellW + gutterX);
    const y = top + row * (rowH + gutterY);
    rects.push({ x, y, w: cellW, h: rowH });
  }
  return rects;
}

/** Render a single grid cell's slots (hero number + label) inside its rect,
 *  adaptively. Each slot reads its content from the named SmartLayoutCell
 *  field; the metric/label font scales to FIT the cell width so long content
 *  never overflows. Slots stack top→bottom by `order`, the cluster centered
 *  vertically within the cell. */
function renderCellSlots(
  out: FreeformBlock[],
  cell: SmartLayoutCell,
  rect: { x: number; y: number; w: number; h: number },
  slots: CellSlot[],
  nextZ: () => number,
): void {
  const ordered = [...slots].sort((a, b) => a.order - b.order);
  // First pass — fit each slot's font + estimate its line height (% of card).
  const measured = ordered.map((slot) => {
    const text = slot.field === 'heading' ? cell.heading : cell.body;
    const variant = (slot.variant in TEXT_METRICS ? slot.variant : 'paragraph') as keyof typeof TEXT_METRICS;
    const fontPx = fitFontPx(text ?? '', rect.w, variant);
    // Line-height tracks the fitted font (keep the variant's leading ratio).
    const ref = TEXT_METRICS[variant];
    const lineRatio = ref.lineHeightPx / ref.fontPx;
    const slotHPct = ((fontPx * lineRatio) / CARD_H_PX) * 100;
    return { slot, text: text ?? '', fontPx, slotHPct, variant };
  }).filter((s) => s.text.trim().length > 0);

  if (measured.length === 0) return;

  const SLOT_GAP = 1.5; // % between number and label
  const clusterH = measured.reduce((sum, s) => sum + s.slotHPct, 0)
    + (measured.length - 1) * SLOT_GAP;
  let y = rect.y + Math.max(0, (rect.h - clusterH) / 2);

  for (const s of measured) {
    out.push(textBlock({
      variant: s.slot.variant,
      content: s.text,
      fixed: true,
      styleOverride: { fontSize: s.fontPx, textAlign: s.slot.align },
      x: rect.x, y, w: rect.w, h: s.slotHPct, z: nextZ(),
    }));
    y += s.slotHPct + SLOT_GAP;
  }
}

/**
 * The data-driven converter. Reads `piece` (the LayoutPiece DATA) and places
 * the card's title + metric cells at the piece's region geometry, fitting the
 * text adaptively. The grid rects are LOCKED (clean, uniform); the words
 * AUTO-FIT each box. Emits FIXED-position blocks (no __autoLayout).
 *
 * Defensive: if the card has no smart-layout cells (or the piece is malformed),
 * falls back to blocksToFreeform so it never throws and the slide still renders.
 */
function layoutFromPiece(
  piece: LayoutPiece,
  blocks: CardBlock[],
  bounds: ContentBounds,
): FreeformBlock[] {
  // Find the metric cells (the smart-layout block) + the title heading.
  const smart = blocks.find(
    (b): b is Extract<CardBlock, { type: 'smart-layout' }> =>
      b.type === 'smart-layout',
  );
  const cells = smart?.cells ?? [];
  if (cells.length === 0) {
    // Nothing to grid — fall back to the standard stack so we never render
    // an empty grid (or throw).
    return blocksToFreeform(blocks, bounds);
  }

  const out: FreeformBlock[] = [];
  let z = 1;
  const nextZ = () => z++;

  // Title slot (data-driven region). Use the first heading; if none, skip.
  const heading = blocks.find((b) => b.type === 'heading');
  if (piece.title && heading && heading.type === 'heading') {
    const r = piece.title;
    out.push(textBlock({
      variant: r.variant,
      content: heading.content,
      fixed: true,
      x: r.x, y: r.y, w: r.w, h: r.h, z: nextZ(),
    }));
  }

  // Grid rects from piece data; render each cell's slots adaptively.
  const rects = gridCellRects(piece.grid, cells.length);
  for (let i = 0; i < rects.length; i++) {
    renderCellSlots(out, cells[i], rects[i], piece.grid.cell.slots, nextZ);
  }

  return out;
}

/** Pull text content out of a heading or paragraph block — narrowed accessor
 *  used by the cover layout. Other block types return empty string. */
function getContent(block: CardBlock): string {
  if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout') {
    return block.content;
  }
  return '';
}

// ── Conversion ───────────────────────────────────────────────────────────────

function blocksToFreeform(blocks: CardBlock[], bounds: ContentBounds): FreeformBlock[] {
  const out: FreeformBlock[] = [];
  const CONTENT_LEFT = bounds.left;
  const CONTENT_WIDTH = bounds.right - bounds.left;
  let cursorY = bounds.top;
  let z = 1;

  const advance = (height: number) => {
    cursorY = Math.min(bounds.bottom, cursorY + height + BLOCK_GAP);
  };

  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const variant = block.level === 1 ? 'heading' : 'subheading';
        const base = block.level === 1
          ? BLOCK_HEIGHT_DEFAULTS.heading
          : block.level === 3
            ? BLOCK_HEIGHT_DEFAULTS.heading3
            : BLOCK_HEIGHT_DEFAULTS.subheading;
        const metricKey = variant === 'heading' ? 'heading' : 'subheading';
        const h = contentAwareHeight(base, block.content.length, CONTENT_WIDTH, metricKey);
        out.push(textBlock({
          variant, content: block.content,
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'paragraph': {
        const h = contentAwareHeight(BLOCK_HEIGHT_DEFAULTS.paragraph, block.content.length, CONTENT_WIDTH, 'paragraph');
        out.push(textBlock({
          variant: 'paragraph', content: block.content,
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'callout': {
        const h = contentAwareHeight(BLOCK_HEIGHT_DEFAULTS.callout, block.content.length, CONTENT_WIDTH, 'callout');
        out.push(textBlock({
          variant: 'paragraph', content: block.content, italic: true,
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'bullet-list': {
        // Combine bullets into one text block (Phase A simplification). Each
        // item gets a leading "•" and a newline. Phase C will emit individual
        // freeform blocks per item if needed. Use the longest item to drive
        // the per-line wrap estimate, then multiply by item count.
        const content = block.items.map((i) => `• ${i}`).join('\n');
        const longestItem = block.items.reduce((m, i) => Math.max(m, i.length), 0);
        // Per-item height predicted from the longest item's wrap, sum across items.
        const perItemH = contentAwareHeight(0, longestItem + 2, CONTENT_WIDTH, 'paragraph');
        const h = Math.min(60, BLOCK_HEIGHT_DEFAULTS.bulletList * 0.3 + block.items.length * perItemH);
        out.push(textBlock({
          variant: 'paragraph', content,
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'divider': {
        const h = BLOCK_HEIGHT_DEFAULTS.divider;
        out.push(shapeBlock({
          shape: 'line', fill: '#cbd5e1',
          x: CONTENT_LEFT, y: cursorY + 0.5, w: CONTENT_WIDTH, h: 0.4, z: z++,
        }));
        advance(h);
        break;
      }
      case 'toggle': {
        const h = BLOCK_HEIGHT_DEFAULTS.toggle;
        out.push(textBlock({
          variant: 'subheading', content: `▸ ${block.heading}`,
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'button': {
        const h = BLOCK_HEIGHT_DEFAULTS.button;
        out.push(textBlock({
          variant: 'subheading', content: block.text,
          x: CONTENT_LEFT, y: cursorY, w: 30, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'label-group': {
        const h = BLOCK_HEIGHT_DEFAULTS.labelGroup;
        const content = block.labels.map((l) => l.text).join('   ');
        out.push(textBlock({
          variant: 'paragraph', content,
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'image': {
        const h = BLOCK_HEIGHT_DEFAULTS.image;
        out.push(imageBlock({
          src: block.src, alt: block.alt, fit: block.fit ?? 'cover',
          x: CONTENT_LEFT, y: cursorY, w: CONTENT_WIDTH, h, z: z++,
        }));
        advance(h);
        break;
      }
      case 'smart-layout': {
        // Decompose: each cell produces its own group of freeform blocks
        // (optional icon, heading, body).: every icon and text
        // inside a smart-layout should be its own object.
        const decomposed = decomposeSmartLayout(block, cursorY, z, CONTENT_LEFT, CONTENT_WIDTH);
        out.push(...decomposed.blocks);
        z = decomposed.nextZ;
        advance(decomposed.consumedHeight);
        break;
      }
      // grid-layout and any other discriminants — skip (rare; can be added
      // when needed).
      default:
        break;
    }
  }

  return out;
}

// ── Smart-layout decomposition ──────────────────────────────────────────────

interface DecomposeResult {
  blocks: FreeformBlock[];
  nextZ: number;
  consumedHeight: number;
}

function decomposeSmartLayout(
  block: { variant: string; cells: SmartLayoutCell[] },
  startY: number,
  startZ: number,
  contentLeft: number,
  contentWidth: number,
): DecomposeResult {
  const out: FreeformBlock[] = [];
  let z = startZ;
  const cells = block.cells ?? [];

  // Grid variants — N cells laid out as columns × rows
  if (block.variant.startsWith('grid')) {
    const cols = block.variant === 'grid-1x4' ? 4
      : block.variant === 'grid-1x3' ? 3
      : 2; // grid-2x2 default
    const rows = Math.max(1, Math.ceil(cells.length / cols));
    const gridHeight = Math.min(50, 12 + rows * 16);
    const cellW = (contentWidth - (cols - 1) * 2) / cols;
    const cellH = (gridHeight - (rows - 1) * 2) / rows;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = contentLeft + col * (cellW + 2);
      const cellY = startY + row * (cellH + 2);
      pushCellBlocks(out, cell, cellX, cellY, cellW, cellH, () => z++);
    }
    return { blocks: out, nextZ: z, consumedHeight: gridHeight };
  }

  // List / timeline variants — single column, each cell its own row.
  // Cell heights are content-aware (driven by body length) so a long body
  // doesn't overflow into the next cell's icon + heading. The previous
  // fixed `rowH = 12` was too small when AI generated multi-line bodies,
  // and the FreeformLayer auto-layout pass didn't reliably catch the
  // overlap between decomposed cell blocks.
  const cellGap = 3;             // % between rows
  const minCellH = 12;           // floor so empty cells still take visual space
  let cursor = startY;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const usedH = pushCellBlocks(out, cell, contentLeft, cursor, contentWidth, minCellH, () => z++);
    cursor += usedH + cellGap;
  }
  return { blocks: out, nextZ: z, consumedHeight: cursor - startY };
}

/** Push (optional icon, heading, body) freeform blocks for a single cell,
 *  laying out within the cell's box. The cellH arg is a floor — actual
 *  height is driven by the body content's natural wrap so a long body
 *  doesn't overflow into the next cell.
 *
 *  Layout shape:
 *    [icon] [heading]        ← top row, icon vertically aligned with heading
 *    [        body         ] ← below, full cell width
 *
 *  Returns the actual height consumed (in %) so the caller can stack the
 *  next cell directly below.
 */
function pushCellBlocks(
  out: FreeformBlock[],
  cell: SmartLayoutCell,
  cellX: number, cellY: number, cellW: number, minCellH: number,
  nextZ: () => number,
): number {
  const hasIcon = !!cell.icon;
  const iconSize = 6;       // % wide+tall — icon row anchor
  const textLeft = hasIcon ? cellX + iconSize + 1.5 : cellX;
  const textWidth = cellW - (textLeft - cellX);
  // Heading height predicted from its actual content length wrapped against
  // textWidth. Earlier this was hardcoded to iconSize (6%) which only fits
  // one line of subheading text — a 2-word heading in a narrow column wrapped
  // to 2 lines and the second line was painted over by the body block,
  // leaving stubs like "Col"/"Sto" visible (UAT-found, 2026-05-24). The floor
  // stays at iconSize so the heading still aligns with the icon on its row.
  const headingH = cell.heading
    ? contentAwareHeight(iconSize, cell.heading.length, textWidth, 'subheading')
    : iconSize;
  const bodyY = cellY + headingH + 1;
  // Body height predicted from the actual content length wrapped against
  // the cell width. Floor of 4 keeps a visible block even for short bodies.
  const bodyH = cell.body
    ? contentAwareHeight(4, cell.body.length, cellW, 'paragraph')
    : 0;

  if (hasIcon) {
    out.push(iconBlock({
      name: cell.icon!,
      color: cell.accentColor,
      x: cellX, y: cellY, w: iconSize, h: iconSize, z: nextZ(),
    }));
  }
  if (cell.heading) {
    out.push(textBlock({
      variant: 'subheading', content: cell.heading,
      x: textLeft, y: cellY, w: textWidth, h: headingH, z: nextZ(),
    }));
  }
  if (cell.body) {
    out.push(textBlock({
      variant: 'paragraph', content: cell.body,
      x: cellX, y: bodyY, w: cellW, h: bodyH, z: nextZ(),
    }));
  }

  // Total height = heading row + gap + body. Heading already accounts for
  // its real wrap height; bodyY is positioned below it.
  // Floor at minCellH so empty cells still occupy visual space.
  const usedH = headingH + (cell.body ? 1 + bodyH : 0);
  return Math.max(minCellH, usedH);
}

// ── FreeformBlock factories ─────────────────────────────────────────────────

// All factories below stamp `__autoLayout: true` so the FreeformLayer knows
// to run its measure-and-adjust pass against the actual rendered content
// once these blocks paint for the first time.

function textBlock(args: {
  variant: FreeformTextVariant;
  content: string;
  italic?: boolean;
  /** Per-block style overrides (alignment, adaptive font size). Used by the
   *  data-driven grid engine to lock alignment + the fitted metric/label size
   *  per cell. Merged with the italic flag. */
  styleOverride?: NonNullable<FreeformTextBlock['style']>;
  /** When true the block is placed at a FIXED position (no measure-and-adjust
   *  pass). The data-driven grid engine sets this so the locked grid rects
   *  aren't moved by the renderer's auto-layout. Defaults to false (auto). */
  fixed?: boolean;
  x: number; y: number; w: number; h: number; z: number;
}): FreeformTextBlock {
  const style: NonNullable<FreeformTextBlock['style']> = {
    ...(args.italic ? { italic: true } : {}),
    ...(args.styleOverride ?? {}),
  };
  return {
    id: nextFreeformId(),
    type: 'text',
    variant: args.variant,
    // Strip markdown emphasis markers — the freeform renderer is plain-text
    // and shows `**foo**` verbatim otherwise. See stripMarkdown above.
    content: stripMarkdown(args.content),
    ...(Object.keys(style).length > 0 ? { style } : {}),
    x: args.x, y: args.y, w: args.w, h: args.h,
    rotation: 0, z: args.z,
    // Fixed blocks (the grid engine) skip the auto-layout measure pass so the
    // locked grid stays put; everything else opts in.
    ...(args.fixed ? {} : { __autoLayout: true }),
  };
}

function imageBlock(args: {
  src: string; alt?: string; fit?: 'cover' | 'contain';
  x: number; y: number; w: number; h: number; z: number;
}): FreeformBlock {
  return {
    id: nextFreeformId(),
    type: 'image',
    src: args.src,
    alt: args.alt,
    fit: args.fit ?? 'cover',
    x: args.x, y: args.y, w: args.w, h: args.h,
    rotation: 0, z: args.z,
    __autoLayout: true,
  };
}

function shapeBlock(args: {
  shape: 'rectangle' | 'circle' | 'line' | 'arrow';
  fill?: string;
  x: number; y: number; w: number; h: number; z: number;
}): FreeformShapeBlock {
  return {
    id: nextFreeformId(),
    type: 'shape',
    shape: args.shape,
    fill: args.fill,
    x: args.x, y: args.y, w: args.w, h: args.h,
    rotation: 0, z: args.z,
    __autoLayout: true,
  };
}

function iconBlock(args: {
  name: string;
  color?: string;
  x: number; y: number; w: number; h: number; z: number;
}): FreeformIconBlock {
  return {
    id: nextFreeformId(),
    type: 'icon',
    name: args.name,
    color: args.color,
    x: args.x, y: args.y, w: args.w, h: args.h,
    rotation: 0, z: args.z,
    __autoLayout: true,
  };
}
