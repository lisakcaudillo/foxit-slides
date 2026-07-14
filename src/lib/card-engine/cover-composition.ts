/**
 * Cover Composition engine — the DYNAMIC image+title axis.
 *
 * Approved design table 2026-06-05 (Designer 2 "Dynamic Title Composition
 * Engine" at app/public/design-table/title-treatments/composition-designer-2.html).
 *
 * The title slide is the OUTPUT OF A DECISION, not a fixed layout. When a cover
 * image exists the engine reads a few signals — is an image available, its
 * orientation + brightness, the theme's archetype/tone, the headline length —
 * and chooses a COMPOSITION FORM + TITLE POSITION + SCRIM so the image and the
 * title always co-exist instead of fighting. Across a deck the picks vary, so
 * no two covers feel stamped from one mold; when no image is available it
 * falls back to `type-only` (never an empty image box).
 *
 * Relationship to the other cover axes (additive, no fork):
 *   • Theme          — the look (themes.ts).
 *   • CoverTier      — coarse theme-derived tier photo|split|type (cover-tiers.ts).
 *   • TitleTreatment — the type grammar inside the title region (title-treatments.ts);
 *                      the italic-accent-word emphasis is its default.
 *   • CompositionForm— THIS module: the fine, image-aware structure. Every form
 *                      reconciles to a CoverTier + ImageRole so the existing
 *                      image pipeline / scrim / contrast guarantees apply
 *                      unchanged. When an image is present, the composition
 *                      decides WHERE the title goes (opposite the image); the
 *                      TitleTreatment decides how the type is set inside it.
 *
 * Multi-select + override: callers may pass an allowed SET of
 * forms (the multi-select "Title layout" picker) — the engine rotates only
 * among those for variety; an empty/absent set lets it use any. A single
 * forced form is just an allowed set of length 1.
 *
 * DATA + pure functions only — no React, no SDK, no deps beyond design-types.
 */

import type { Theme, ThemeTone } from '@/components/themes/types';
import type { ThemeArchetype } from './design-types';
import {
  COMPOSITION_FORMS,
  type CompositionForm,
  type CoverTier,
  type ImageRole,
  type TitlePosition,
} from './design-types';

export { COMPOSITION_FORMS, type CompositionForm } from './design-types';

// ── Plain-language names (for the "Title layout" swap menu) ──────────────────
// The surface never shows the internal id ('band-image-top') — just the human
// label. (OCR -> "Grab Text" precedent.)
export const COMPOSITION_FORM_NAMES: Readonly<Record<CompositionForm, string>> = {
  'vertical-half': 'Image beside title',
  'diagonal-split': 'Diagonal split',
  'band-image-top': 'Image on top, title below',
  'band-image-bottom': 'Title on top, image below',
  'full-bleed-overlay': 'Full-bleed (image behind title)',
  'type-only': 'Type only (no image)',
};

// ── Input signals ────────────────────────────────────────────────────────────
export type ImageOrientation = 'portrait' | 'landscape' | 'square';
export type HeadlineLength = 'short' | 'long';

export interface CompositionSignals {
  /** Is a cover image available (generated or user-placed)? */
  hasImage: boolean;
  /** Image aspect bucket. Ignored when hasImage is false. */
  orientation?: ImageOrientation;
  /** Mean image luminance 0 (black) … 1 (white). Drives scrim alpha + the
   *  "too bright to overlay" branch. Ignored when hasImage is false. */
  brightness?: number;
  themeArchetype: ThemeArchetype;
  themeTone: ThemeTone;
  /** Headline length bucket (≈ ≤4 words = short). */
  headlineLength: HeadlineLength;
}

export type ImageSide = 'left' | 'right' | 'top' | 'bottom' | 'full' | 'none';

export interface ScrimSpec {
  kind: 'linear' | 'radial';
  /** Gradient angle for linear scrims (deg). */
  angleDeg?: number;
  /** Peak alpha at the text end. */
  alpha: number;
  /** Where the title sits — the scrim darkens toward this region. */
  toward: TitlePosition;
}

export interface CompositionResult {
  form: CompositionForm;
  titlePosition: TitlePosition;
  imageSide: ImageSide;
  /** Null unless the title overlaps the image (full-bleed-overlay). */
  scrim: ScrimSpec | null;
}

// ── Form -> existing-pipeline reconcile ──────────────────────────────────────
const FORM_IMAGE_ROLE: Readonly<Record<CompositionForm, ImageRole>> = {
  'vertical-half': 'column',
  'diagonal-split': 'column',
  'band-image-top': 'band',
  'band-image-bottom': 'band',
  'full-bleed-overlay': 'full-bleed',
  'type-only': 'none',
};

const FORM_COVER_TIER: Readonly<Record<CompositionForm, CoverTier>> = {
  'vertical-half': 'split',
  'diagonal-split': 'split',
  'band-image-top': 'split',
  'band-image-bottom': 'split',
  'full-bleed-overlay': 'photo',
  'type-only': 'type',
};

/** The ImageRole a form reconciles to (so scrim / image-aware bounds / contrast
 *  logic applies unchanged). */
export function compositionImageRole(form: CompositionForm): ImageRole {
  return FORM_IMAGE_ROLE[form];
}

/** The coarse CoverTier a form reconciles to (so theme-tier consumers + the
 *  TitleTreatment `preferredComposition` hint still line up). */
export function compositionCoverTier(form: CompositionForm): CoverTier {
  return FORM_COVER_TIER[form];
}

/** True when a form actually needs a generated image. `type-only` does not. */
export function compositionWantsImage(form: CompositionForm): boolean {
  return form !== 'type-only';
}

// ── Scrim ────────────────────────────────────────────────────────────────────
/**
 * Scrim alpha tuned to image brightness so dark images get a lighter scrim and
 * bright images a heavier one — both land ≥ 4.5:1 (WCAG AA). Matches the
 * approved prototype: clamp(0.35 + (brightness − 0.5)·0.6, 0.40, 0.78).
 */
export function scrimAlpha(brightness: number): number {
  const a = 0.35 + (brightness - 0.5) * 0.6;
  return Math.min(0.78, Math.max(0.4, a));
}

// ── Title position is always OPPOSITE the image ──────────────────────────────
function titlePositionFor(form: CompositionForm, imageSide: ImageSide): TitlePosition {
  switch (form) {
    case 'vertical-half':
    case 'diagonal-split':
      return imageSide === 'left' ? 'right-column' : 'left-column';
    case 'band-image-top':
      return 'bottom-band';
    case 'band-image-bottom':
      return 'top-band';
    case 'full-bleed-overlay':
      return 'bottom-overlay'; // centered handled by caller for calm dark images
    case 'type-only':
    default:
      return 'left-column';
  }
}

// ── The deterministic selector (Designer 2 rules; first match wins) ──────────
/**
 * Pick a composition for one cover from its signals. `rotationIndex` (a
 * per-deck counter) alternates the image side / breaks ties so a deck doesn't
 * repeat the same form+side back-to-back. Pure + deterministic for a given
 * (signals, rotationIndex).
 */
export function selectComposition(
  signals: CompositionSignals,
  rotationIndex = 0,
): CompositionResult {
  const { hasImage, themeArchetype, themeTone, headlineLength } = signals;
  const orientation = signals.orientation ?? 'landscape';
  const brightness = signals.brightness ?? 0.5;
  const sideFlip: ImageSide = rotationIndex % 2 === 0 ? 'left' : 'right';

  // 1 — No image: guaranteed type-only fallback.
  if (!hasImage) {
    return { form: 'type-only', titlePosition: 'left-column', imageSide: 'none', scrim: null };
  }

  // 2 — Portrait image: vertical half, title opposite, no overlap.
  if (orientation === 'portrait') {
    return build('vertical-half', sideFlip);
  }

  // 3 — Cinematic / dark + short headline: full-bleed overlay with scrim.
  if (orientation === 'landscape' && (themeArchetype === 'cinematic' || themeTone === 'dark') && headlineLength === 'short') {
    const calm = brightness < 0.3;
    return {
      form: 'full-bleed-overlay',
      titlePosition: calm ? 'centered-overlay' : 'bottom-overlay',
      imageSide: 'full',
      scrim: {
        kind: calm ? 'radial' : 'linear',
        angleDeg: 180,
        alpha: scrimAlpha(brightness),
        toward: calm ? 'centered-overlay' : 'bottom-overlay',
      },
    };
  }

  // 4 — Editorial / product + long headline: vertical half, crisp type.
  if (orientation === 'landscape' && (themeArchetype === 'editorial' || themeArchetype === 'product') && headlineLength === 'long') {
    return build('vertical-half', sideFlip);
  }

  // 5 — Square image + warm/editorial: image top band, title below.
  if (orientation === 'square' && (themeArchetype === 'warm' || themeArchetype === 'editorial')) {
    return build('band-image-top', 'top');
  }

  // 6 — Bright / busy landscape: band the image below, title on clean bg above.
  if (orientation === 'landscape' && brightness > 0.62) {
    return build('band-image-bottom', 'bottom');
  }

  // 7 — Variety slot (creative / product landscape): diagonal split.
  if (orientation === 'landscape' && (themeArchetype === 'product' || themeArchetype === 'warm' || themeArchetype === 'cinematic' || themeArchetype === 'editorial')) {
    // Alternate which form fills the variety slot so a deck mixes diagonal in.
    const form: CompositionForm = rotationIndex % 3 === 2 ? 'diagonal-split' : 'vertical-half';
    return build(form, sideFlip);
  }

  // Fallback — vertical half (never breaks).
  return build('vertical-half', sideFlip);
}

/** Build a non-overlay result (no scrim — image + title sit in separate
 *  regions). */
function build(form: CompositionForm, imageSide: ImageSide): CompositionResult {
  return { form, titlePosition: titlePositionFor(form, imageSide), imageSide, scrim: null };
}

// ── Multi-select / override ───────────────────────────────────────────────────
/**
 * Choose a composition constrained to the user's allowed set (the multi-select
 * "Title layout" picker). When `allowed` is empty/undefined the full engine
 * runs. When the auto-pick is in the set, it's used; otherwise the engine picks
 * deterministically from the allowed set by rotation (so a multi-form set still
 * varies across a deck) and recomputes title position + scrim for that form.
 * A single-element `allowed` forces every cover to that form.
 */
export function selectCompositionFromAllowed(
  signals: CompositionSignals,
  allowed: readonly CompositionForm[] | undefined,
  rotationIndex = 0,
): CompositionResult {
  const auto = selectComposition(signals, rotationIndex);
  if (!allowed || allowed.length === 0) return auto;

  // No image always means type-only, regardless of the allowed set.
  if (!signals.hasImage) return auto;

  if (allowed.includes(auto.form)) return auto;

  // Pick from the allowed set deterministically; rotate for variety.
  const usable = allowed.filter((f) => f !== 'type-only' || !signals.hasImage);
  const pool = usable.length > 0 ? usable : allowed;
  const chosen = pool[rotationIndex % pool.length];
  return forceForm(chosen, signals, rotationIndex);
}

/**
 * Force a specific composition form (per-slide override) and compute a sound
 * title position + scrim for it from the signals.
 */
export function forceForm(
  form: CompositionForm,
  signals: CompositionSignals,
  rotationIndex = 0,
): CompositionResult {
  if (form === 'type-only' || !signals.hasImage) {
    return { form: 'type-only', titlePosition: 'left-column', imageSide: 'none', scrim: null };
  }
  if (form === 'full-bleed-overlay') {
    const brightness = signals.brightness ?? 0.5;
    const calm = brightness < 0.3;
    return {
      form,
      titlePosition: calm ? 'centered-overlay' : 'bottom-overlay',
      imageSide: 'full',
      scrim: { kind: calm ? 'radial' : 'linear', angleDeg: 180, alpha: scrimAlpha(brightness), toward: calm ? 'centered-overlay' : 'bottom-overlay' },
    };
  }
  if (form === 'band-image-top') return build(form, 'top');
  if (form === 'band-image-bottom') return build(form, 'bottom');
  // vertical-half / diagonal-split — alternate the image side by rotation.
  const side: ImageSide = rotationIndex % 2 === 0 ? 'left' : 'right';
  return build(form, side);
}

/** Cycle to the next form (single-step swap affordance). Wraps. */
export function nextCompositionForm(form: CompositionForm): CompositionForm {
  const i = COMPOSITION_FORMS.indexOf(form);
  return COMPOSITION_FORMS[(i + 1) % COMPOSITION_FORMS.length];
}

// ── Geometry for the renderer ────────────────────────────────────────────────
// Percentage regions on the 16:9 cover (0–100). The renderer maps these to the
// live card and seats the image in `image` and the title block in `title`.
// `clipPath` is set only for diagonal-split (a CSS polygon() for the image).
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CompositionGeometry {
  image: Rect | null;
  title: Rect;
  clipPath?: string;
}

const TITLE_INSET = 7; // % inset of the title block from its region edge

/**
 * Geometry for a composition form + image side. Numbers trace the approved
 * spec library (designer-3): vertical split 54/46, band heights 54/52,
 * diagonal clip-path slash. Pure.
 */
export function compositionGeometry(form: CompositionForm, imageSide: ImageSide): CompositionGeometry {
  switch (form) {
    case 'vertical-half': {
      const imgRight = imageSide !== 'left';
      return {
        image: { x: imgRight ? 54 : 0, y: 0, w: 46, h: 100 },
        title: { x: imgRight ? TITLE_INSET : 54 + TITLE_INSET, y: 0, w: 54 - TITLE_INSET * 2, h: 100 },
      };
    }
    case 'diagonal-split': {
      const imgLeft = imageSide === 'left';
      return {
        image: { x: 0, y: 0, w: 100, h: 100 },
        // image occupies one triangle; title sits in the open triangle.
        clipPath: imgLeft ? 'polygon(0 0, 62% 0, 38% 100%, 0 100%)' : 'polygon(100% 0, 100% 100%, 38% 100%, 62% 0)',
        title: imgLeft
          ? { x: 52, y: 0, w: 41, h: 100 }
          : { x: TITLE_INSET, y: 0, w: 41, h: 100 },
      };
    }
    case 'band-image-top':
      return { image: { x: 0, y: 0, w: 100, h: 54 }, title: { x: TITLE_INSET, y: 56, w: 100 - TITLE_INSET * 2, h: 44 } };
    case 'band-image-bottom':
      return { image: { x: 0, y: 52, w: 100, h: 48 }, title: { x: TITLE_INSET, y: 0, w: 100 - TITLE_INSET * 2, h: 50 } };
    case 'full-bleed-overlay':
      return { image: { x: 0, y: 0, w: 100, h: 100 }, title: { x: TITLE_INSET, y: 60, w: 100 - TITLE_INSET * 2, h: 38 } };
    case 'type-only':
    default:
      return { image: null, title: { x: TITLE_INSET, y: 0, w: 86, h: 100 } };
  }
}

// ── Headline-length helper ────────────────────────────────────────────────────
/** Bucket a headline into short/long (≈ ≤4 words = short) for the selector. */
export function headlineLengthOf(headline: string | undefined | null): HeadlineLength {
  const words = (headline ?? '').trim().split(/\s+/).filter(Boolean).length;
  return words <= 4 ? 'short' : 'long';
}

// ── Theme convenience ─────────────────────────────────────────────────────────
/** Pull the selector's theme signals off a Theme. archetype + tone live on it. */
export function themeSignals(theme: Theme): Pick<CompositionSignals, 'themeArchetype' | 'themeTone'> {
  return { themeArchetype: theme.archetype, themeTone: theme.tone };
}
