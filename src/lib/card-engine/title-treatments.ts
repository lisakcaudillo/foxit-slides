/**
 * Title Treatment system — the THIRD cover axis.
 *
 * A cover slide (slide 0) is composed from three INDEPENDENT, mix-and-match
 * dimensions, each picked automatically but overridable by the user:
 *
 *   1. Theme        — the look: palette, fonts, page background, CoverArt motif.
 *                     Lives in `components/themes/themes.ts`.
 *   2. Composition  — the structure: `photo` (full-bleed image + scrim),
 *                     `split` (image panel + type panel), `type` (no image,
 *                     typographic stage). Lives in `cover-tiers.ts`.
 *   3. Title Treatment — THIS module. The type-only grammar of the cover:
 *                     where the headline sits, its scale, the accent move,
 *                     and which editorial chrome (eyebrow, hairline rule,
 *                     byline strip, drop-cap, numeral, folio rail) it wears.
 *
 * Implements the approved title-treatments design table (designer-1 "Editorial"
 * grammar breadth + designer-3 "Spec Library" token-traceable anatomy) at
 * `app/public/design-table/title-treatments/`. Each treatment draws its
 * identity from a DIFFERENT dimension of the Theme token set, so two covers
 * never read as one template recolored.
 *
 * THE NO-IMAGE DEFAULT.  Auto-images default OFF, so the cover most users see
 * has no photo and the Composition collapses to the `type` stage. That state
 * used to be a bare fallback; these treatments make it the PRIMARY designed
 * state. Every treatment must look intentional with zero imagery — the photo /
 * split compositions only ENHANCE a treatment when an image exists; they never
 * carry it. A treatment + the `type` composition is always a complete cover.
 *
 * This module is DATA + pure functions only — no React, no SDK, no deps. The
 * renderer (Phase 2) consumes `TITLE_TREATMENT_SPECS`; the swap UI (Phase 3)
 * consumes `TITLE_TREATMENT_NAMES` + the cycle helpers.
 */

import type { Theme } from '@/components/themes/types';
import { TITLE_TREATMENTS, type CoverTier, type TitleTreatment } from './design-types';

// ── The catalog ─────────────────────────────────────────────────────────────
// The treatment enum + type are the single source in design-types.ts (so the
// type contract carries no cross-module import); re-exported here for
// convenience so consumers can import everything title-treatment from one file.
// Full d1 ∪ d3 union (de-duplicated). "Full now, curate later" — Lisa reviews
// these live, then we cut the weak ones. `TITLE_TREATMENTS` order = swap cycle:
//   anchor            d1·01 / d3·1 — bookish flagship (eyebrow+rule+italic accent+byline)
//   drop-cap          d1·03        — oversized serif initial sets the headline
//   chapter-divider   d1·05        — big numeral + "Chapter Three" kicker + hairline
//   numbered-index    d3·2         — document-control header: section number + label/value byline
//   ledger-folio      d1·08        — magazine folio: masthead rail + display headline + byline
//   all-caps-masthead d1·02        — newspaper caps, tight leading, kicker rule both sides
//   centered-colophon d1·06        — symmetric novel title page: centered headline + ornament rule
//   statement         d1·07        — the quote/claim IS the headline, lighter weight, one italic
//   stacked-baseline  d1·04        — each word on its own line; last word italicizes for the turn
//   sunrise-wash      d3·5         — centered, warm; kicker above, one-line subtitle below
//   stacked-poster    d3·6         — high-contrast display type as hero; accent = color shift
export { TITLE_TREATMENTS, type TitleTreatment } from './design-types';

/**
 * Plain-language display names for the "Try a different title" swap menu.
 * The surface NEVER shows the internal id ('stacked-baseline'), the word
 * "treatment", or "tier" — just the human name. (OCR → "Grab Text" precedent.)
 */
export const TITLE_TREATMENT_NAMES: Readonly<Record<TitleTreatment, string>> = {
  anchor: 'Anchor',
  'drop-cap': 'Drop-Cap',
  'chapter-divider': 'Chapter',
  'numbered-index': 'Index Card',
  'ledger-folio': 'Folio',
  'all-caps-masthead': 'Masthead',
  'centered-colophon': 'Colophon',
  statement: 'Statement',
  'stacked-baseline': 'Stacked',
  'sunrise-wash': 'Sunrise',
  'stacked-poster': 'Poster',
};

// ── Per-treatment spec ──────────────────────────────────────────────────────
// The layout knobs the Phase-2 renderer needs, traced from designer-3's spec
// cards. Sizes are reference px at the canonical 960×540 cover (designer-3's
// 720×405 stage × 1.333); the renderer scales them to the live card. Colors
// are NOT here — they always come from the live Theme tokens (titleColor,
// linkColor, bodyColor, pageBg, CoverArt motif), so a treatment adapts to any
// theme. That token-only rule is what keeps the family from looking recolored.

/** How the one emphasized word in the headline is set. */
export type AccentMode =
  | 'italic-link' //  italic + linkColor (light themes — Anchor, Chapter)
  | 'italic' //       italic, same color (dark/gradient themes — gradient already carries it)
  | 'color' //        linkColor, no slant (display posters — weight/saturation is the device)
  | 'none';

export interface TitleTreatmentSpec {
  id: TitleTreatment;
  name: string;
  /** Horizontal alignment of the whole title block. */
  align: 'left' | 'center';
  /** Vertical anchor of the headline within the stage. */
  anchor: 'top' | 'center' | 'bottom';
  /** Reference headline font-size in px at 960×540. */
  headlinePx: number;
  headlineLineHeight: number;
  headlineWeight: number;
  /** Headline measure (max line length) in ch. */
  headlineMaxCh: number;
  uppercase: boolean;
  accent: AccentMode;
  // Editorial chrome — which grammar pieces this treatment wears.
  eyebrow: boolean; //      kicker above the headline
  rule: boolean; //         hairline rule under the eyebrow
  byline: boolean; //       bottom presenter/byline strip
  subtitle: boolean; //     one-line sub under the headline
  dropCap: boolean; //      oversized initial letter (first glyph rendered huge)
  numeral: boolean; //      big section number beside/above the headline
  folioRail: boolean; //    top masthead rail (title + issue no.)
  /** CoverArt motif opacity for this treatment's `type` stage (d3: 0.12–0.22). */
  motifOpacity: number;
  /**
   * The composition this treatment is TUNED for. It still renders on the `type`
   * stage with no image (the default); this only says which composition makes
   * it sing when an image is present. Most treatments are `type`-native.
   */
  preferredComposition: CoverTier;
}

export const TITLE_TREATMENT_SPECS: Readonly<Record<TitleTreatment, TitleTreatmentSpec>> = {
  // d3·1 / d1·01 — Hardcover Title Page. The anchor + guaranteed fallback.
  anchor: {
    id: 'anchor', name: 'Anchor', align: 'left', anchor: 'bottom',
    headlinePx: 72, headlineLineHeight: 1.04, headlineWeight: 700, headlineMaxCh: 12,
    uppercase: false, accent: 'italic-link',
    eyebrow: true, rule: true, byline: true, subtitle: false,
    dropCap: false, numeral: false, folioRail: false,
    motifOpacity: 0.18, preferredComposition: 'type',
  },
  // d1·03 — Drop-Cap Opening. Oversized serif initial; novel's first page.
  'drop-cap': {
    id: 'drop-cap', name: 'Drop-Cap', align: 'left', anchor: 'center',
    headlinePx: 46, headlineLineHeight: 1.06, headlineWeight: 700, headlineMaxCh: 14,
    uppercase: false, accent: 'italic-link',
    eyebrow: true, rule: true, byline: true, subtitle: true,
    dropCap: true, numeral: false, folioRail: false,
    motifOpacity: 0.22, preferredComposition: 'type',
  },
  // d1·05 / d3-ish — Chapter Divider. Oversized numeral + "Chapter N" kicker.
  'chapter-divider': {
    id: 'chapter-divider', name: 'Chapter', align: 'left', anchor: 'center',
    headlinePx: 54, headlineLineHeight: 1.05, headlineWeight: 700, headlineMaxCh: 13,
    uppercase: false, accent: 'italic-link',
    eyebrow: true, rule: false, byline: true, subtitle: true,
    dropCap: false, numeral: true, folioRail: false,
    motifOpacity: 0.18, preferredComposition: 'type',
  },
  // d3·2 — Numbered Index Card. Section number + ledger motif + label/value byline.
  'numbered-index': {
    id: 'numbered-index', name: 'Index Card', align: 'left', anchor: 'top',
    headlinePx: 62, headlineLineHeight: 1.06, headlineWeight: 700, headlineMaxCh: 14,
    uppercase: false, accent: 'italic-link',
    eyebrow: true, rule: true, byline: true, subtitle: false,
    dropCap: false, numeral: true, folioRail: false,
    motifOpacity: 0.22, preferredComposition: 'type',
  },
  // d1·08 — Ledger Folio. Masthead rail top + heavy display headline + byline.
  'ledger-folio': {
    id: 'ledger-folio', name: 'Folio', align: 'left', anchor: 'center',
    headlinePx: 64, headlineLineHeight: 0.98, headlineWeight: 900, headlineMaxCh: 12,
    uppercase: false, accent: 'italic',
    eyebrow: false, rule: false, byline: true, subtitle: true,
    dropCap: false, numeral: false, folioRail: true,
    motifOpacity: 0.18, preferredComposition: 'type',
  },
  // d1·02 — All-Caps Masthead. Newspaper caps, tight leading, kicker rule both sides.
  'all-caps-masthead': {
    id: 'all-caps-masthead', name: 'Masthead', align: 'left', anchor: 'center',
    headlinePx: 72, headlineLineHeight: 0.92, headlineWeight: 800, headlineMaxCh: 10,
    uppercase: true, accent: 'italic',
    eyebrow: true, rule: true, byline: true, subtitle: true,
    dropCap: false, numeral: false, folioRail: false,
    motifOpacity: 0.20, preferredComposition: 'type',
  },
  // d1·06 — Centered Colophon. Symmetric novel title page; ornament rule; one byline line.
  'centered-colophon': {
    id: 'centered-colophon', name: 'Colophon', align: 'center', anchor: 'center',
    headlinePx: 56, headlineLineHeight: 1.06, headlineWeight: 700, headlineMaxCh: 15,
    uppercase: false, accent: 'italic',
    eyebrow: true, rule: true, byline: true, subtitle: true,
    dropCap: false, numeral: false, folioRail: false,
    motifOpacity: 0.16, preferredComposition: 'type',
  },
  // d1·07 — Statement Cover. The quote/claim IS the headline; lighter weight; one italic.
  statement: {
    id: 'statement', name: 'Statement', align: 'left', anchor: 'center',
    headlinePx: 50, headlineLineHeight: 1.12, headlineWeight: 500, headlineMaxCh: 22,
    uppercase: false, accent: 'italic',
    eyebrow: true, rule: true, byline: true, subtitle: false,
    dropCap: false, numeral: false, folioRail: false,
    motifOpacity: 0.20, preferredComposition: 'photo',
  },
  // d1·04 — Stacked Baseline. Each word on its own line; last word italicizes.
  'stacked-baseline': {
    id: 'stacked-baseline', name: 'Stacked', align: 'left', anchor: 'center',
    headlinePx: 62, headlineLineHeight: 0.98, headlineWeight: 700, headlineMaxCh: 10,
    uppercase: false, accent: 'italic',
    eyebrow: true, rule: true, byline: true, subtitle: false,
    dropCap: false, numeral: false, folioRail: false,
    motifOpacity: 0.20, preferredComposition: 'type',
  },
  // d3·5 — Sunrise Warm Wash. Centered, optimistic; kicker above, subtitle below.
  'sunrise-wash': {
    id: 'sunrise-wash', name: 'Sunrise', align: 'center', anchor: 'center',
    headlinePx: 74, headlineLineHeight: 1.04, headlineWeight: 700, headlineMaxCh: 15,
    uppercase: false, accent: 'italic',
    eyebrow: true, rule: false, byline: false, subtitle: true,
    dropCap: false, numeral: false, folioRail: false,
    motifOpacity: 0.22, preferredComposition: 'type',
  },
  // d3·6 — Stacked Display Poster. High-contrast type as hero; accent = color shift.
  'stacked-poster': {
    id: 'stacked-poster', name: 'Poster', align: 'left', anchor: 'center',
    headlinePx: 82, headlineLineHeight: 0.98, headlineWeight: 700, headlineMaxCh: 10,
    uppercase: false, accent: 'color',
    eyebrow: false, rule: false, byline: true, subtitle: false,
    dropCap: false, numeral: false, folioRail: true,
    motifOpacity: 0.10, preferredComposition: 'type',
  },
};

// ── The deterministic selector ──────────────────────────────────────────────
// Mirrors the exact shape of `coverTierForTheme()` in cover-tiers.ts: a small
// per-theme override map first, then a data-driven derivation from the signals
// already on every Theme (archetype, category, tone). First match wins. This is
// what makes variety AUTOMATIC across 42 themes without authoring 42 covers —
// and every pick is overridable through the "Try a different title" swap.

/**
 * Named per-theme overrides for the prototype's worked examples + any theme
 * whose best treatment isn't obvious from (archetype, category, tone) alone.
 * Keep small — anything not listed falls through to `deriveTitleTreatment`.
 */
const THEME_TITLE_TREATMENT: Readonly<Record<string, TitleTreatment>> = {
  counsel: 'anchor', //            legal editorial — the bookish flagship
  ledger: 'drop-cap', //           finance/annual report reads as a novel's opening
  quartz: 'chapter-divider', //    crisp white stage, gem motif
  'foxit-glow': 'sunrise-wash', // warm brand wash, centered
  solstice: 'ledger-folio', //     warm magazine folio
  aurora: 'centered-colophon', //  pastel creative, symmetric
  volt: 'stacked-baseline', //     dark nebula, word-per-line
  obsidian: 'statement', //        dark branded, founder's-letter quote
  voltage: 'stacked-poster', //    near-black product keynote
};

/** Light-tuned treatments — chosen for light themes when deriving. */
const LIGHT_POOL: Record<string, TitleTreatment> = {
  legalEditorial: 'anchor',
  businessEditorial: 'numbered-index',
  warm: 'sunrise-wash',
  product: 'all-caps-masthead',
  creative: 'centered-colophon',
};

/** Dark-tuned treatments — chosen for dark themes when deriving. */
const DARK_POOL: Record<string, TitleTreatment> = {
  cinematic: 'statement',
  product: 'stacked-poster',
  creative: 'stacked-baseline',
  editorial: 'statement',
  warm: 'statement',
};

/**
 * Derive a title treatment from a theme's identity when it isn't named above.
 * Data-driven so new themes get a sensible, tone-appropriate default with no
 * code change. Dark themes never receive a light-only treatment and vice-versa
 * (the treatment colors come from tokens, but the GRAMMAR is tuned per tone).
 */
function deriveTitleTreatment(theme: Theme): TitleTreatment {
  if (theme.tone === 'dark') {
    return (
      DARK_POOL[theme.archetype] ??
      DARK_POOL[theme.category] ??
      'statement' // dark fallback — quote-led, reads on any dark field
    );
  }
  // Light themes.
  if (theme.category === 'legal' || theme.archetype === 'editorial') {
    return theme.category === 'legal'
      ? LIGHT_POOL.legalEditorial
      : LIGHT_POOL.businessEditorial;
  }
  if (theme.archetype === 'warm') return LIGHT_POOL.warm;
  if (theme.archetype === 'product') return LIGHT_POOL.product;
  if (theme.category === 'creative') return LIGHT_POOL.creative;
  return 'anchor'; // light fallback — the never-breaks bookish baseline
}

/** The auto-picked title treatment for a theme. Pure + deterministic. */
export function titleTreatmentForTheme(theme: Theme): TitleTreatment {
  return THEME_TITLE_TREATMENT[theme.id] ?? deriveTitleTreatment(theme);
}

/** Spec lookup. */
export function titleTreatmentSpec(t: TitleTreatment): TitleTreatmentSpec {
  return TITLE_TREATMENT_SPECS[t];
}

/** Cycle to the next treatment (used by the one-click swap). Wraps. */
export function nextTitleTreatment(t: TitleTreatment): TitleTreatment {
  const i = TITLE_TREATMENTS.indexOf(t);
  return TITLE_TREATMENTS[(i + 1) % TITLE_TREATMENTS.length];
}
