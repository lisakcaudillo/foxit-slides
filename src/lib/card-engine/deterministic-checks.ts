/**
 * deterministic-checks.ts — code-computed slide defects the VLM should not have
 * to judge: block OVERLAP and text/background CONTRAST. Pure functions over the
 * card's freeform geometry + colors (no render). Conservative by design: the
 * structured skeletons intentionally stack a pill behind its label and text over
 * its own card, so these checks flag only HIGH-CONFIDENCE cases to avoid adding
 * false-positive fails (which would make over-flagging worse, not better).
 */
import type { Card, TemplateTheme, FreeformBlock } from '@/types/card-template';

interface RGBA { r: number; g: number; b: number; a: number }

/** Parse hex (#rgb/#rrggbb) or rgb()/rgba(). Named colors / gradients → null (skip). */
function parseColor(c?: string): RGBA | null {
  if (!c || typeof c !== 'string') return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 }; }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) { const h = m[1]; return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; }
  return null;
}

function relLum({ r, g, b }: RGBA): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(c1: RGBA, c2: RGBA): number {
  const L1 = relLum(c1), L2 = relLum(c2);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

type Box = { x: number; y: number; w: number; h: number; z: number };
function intersectFrac(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = w * h;
  const minA = Math.min(a.w * a.h, b.w * b.h);
  return minA > 0 ? inter / minA : 0;
}
const OVERLAP_FRAC = 0.25; // ignore tiny touches/rounding

const t = (b: FreeformBlock): string => ((b as { content?: string }).content ?? '').trim();
const short = (s: string) => s.slice(0, 24);

/** Text-over-text overlap, and text buried under a higher-z opaque element. */
export function checkOverlap(card: Card): string[] {
  const out: string[] = [];
  const ff = (card.freeform ?? []) as (FreeformBlock & Box)[];
  const texts = ff.filter((b) => b.type === 'text' && t(b).length > 2);
  // text vs text
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (intersectFrac(texts[i], texts[j]) > OVERLAP_FRAC) {
        out.push(`text "${short(t(texts[i]))}" overlaps text "${short(t(texts[j]))}"`);
      }
    }
  }
  // text buried under a HIGHER-z opaque image/shape (decorations sit BELOW text,
  // so they are not flagged; this catches an element placed on top of text).
  for (const tx of texts) {
    for (const b of ff) {
      if (b === tx || b.type === 'text') continue;
      if ((b.z ?? 0) <= (tx.z ?? 0)) continue; // below text → fine
      const fill = (b as { fill?: string }).fill;
      const isImage = b.type === 'image' && !!(b as { src?: string }).src;
      const opaque = isImage || (parseColor(fill)?.a ?? 0) >= 0.9;
      if (opaque && intersectFrac(tx, b) > OVERLAP_FRAC) {
        out.push(`text "${short(t(tx))}" is buried under a ${b.type} on top of it`);
        break;
      }
    }
  }
  return out;
}

/** Resolve the solid color directly BEHIND a text block: the topmost opaque solid
 *  shape under it, else the slide's solid background. null when it can't be
 *  computed (image / gradient background, or a translucent layer). */
function bgBehind(tx: FreeformBlock & Box, card: Card, theme: TemplateTheme): RGBA | null {
  const ff = (card.freeform ?? []) as (FreeformBlock & Box)[];
  const shapes = ff
    .filter((b) => b.type === 'shape' && (b.z ?? 0) < (tx.z ?? 0) && intersectFrac(tx, b) > 0.5)
    .sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  for (const s of shapes) {
    const c = parseColor((s as { fill?: string }).fill);
    if (c && c.a >= 0.9) return c; // opaque shape behind → that's the background
    if (c && c.a < 0.9) return null; // translucent layer → blend unknown, skip
  }
  // slide background, only if it's a solid color
  const cardBg = parseColor(card.background?.color);
  if (cardBg) return cardBg;
  if (!card.background?.image && !card.background?.gradient) return parseColor(theme.cardBg);
  return null; // image / gradient slide bg → can't compute
}

const CONTRAST_MIN_LARGE = 3.0; // WCAG AA large text; conservative start
const CONTRAST_MIN_SMALL = 4.0;

/** Fraction of `a` (by area) that lies inside `b`. Used by the empty-shape check:
 *  is the text mostly sitting on the shape? */
function fracInside(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const areaA = a.w * a.h;
  return areaA > 0 ? (w * h) / areaA : 0;
}

// Empty-shape thresholds. Percentages of the 960×540 slide (0–100 axes).
const EMPTY_MIN_DIM_PCT = 3;      // < 3% wide or tall → hairline/accent dot, skip
const EMPTY_FULLBLEED_PCT = 90;   // ≥ 90% both axes → full-bleed background, skip
const TEXT_INSIDE_FRAC = 0.5;     // text bbox is ≥ 50% inside a shape → text sits on it

const SLIDE_H_PX = 540;    // shape h is % of 540
const FULL_PILL_RATIO = 0.4; // br / (h_px/2) ≥ 0.4 → reads as a rounded pill
const CARD_MIN_DIM_PCT = 15; // min(w,h) ≥ 15% → big enough to read as a card
const CIRCLE_MIN_DIM_PCT = 4; // circle at ≥ 4% both dims → badge/dot marker
const CONTAINER_FILL_MIN_ALPHA = 0.5; // < 0.5 → translucent tint → decorative

/** Does this shape read as an intentional CONTAINER (a thing designed to hold a
 *  label), vs a decorative BAR/PANEL/ACCENT (a data channel, plot point, or
 *  tinted accent that is valid unlabeled)? A container is one of three narrow
 *  patterns:
 *    - **Pill** — an opaque rectangle whose corner-radius is roughly half its
 *      height (a lozenge; the label is missing = design defect).
 *    - **Card** — an opaque rectangle at least CARD_MIN_DIM_PCT in the smaller
 *      dimension (a substantial block that reads as "content goes here").
 *    - **Badge** — an opaque circle at least CIRCLE_MIN_DIM_PCT in each dim,
 *      or an outlined frame (stroke only, no fill).
 *  Translucent fills (< 50% alpha) always read as decorative accents/tints and
 *  are skipped regardless. Every other shape (Gantt bars, quadrant plots,
 *  timeline rings, thin panels) is decoration; do not flag it. */
function isContainerAffordance(s: FreeformBlock & Box): boolean {
  const kind = (s as { shape?: string }).shape;
  const fill = (s as { fill?: string }).fill;
  const parsedFill = parseColor(fill);
  const strokeW = (s as { strokeWidth?: number }).strokeWidth ?? 0;
  // Translucent tints read as accents; never a placeholder.
  if (parsedFill && parsedFill.a < CONTAINER_FILL_MIN_ALPHA) return false;
  // Outlined frame — stroke, no fill — reads as an intentional box.
  if (!parsedFill && strokeW > 0) return true;
  if (!parsedFill) return false; // no fill AND no stroke → not a container
  if (kind === 'circle') {
    return s.w >= CIRCLE_MIN_DIM_PCT && s.h >= CIRCLE_MIN_DIM_PCT;
  }
  if (kind === 'rectangle') {
    const br = (s as { borderRadius?: number }).borderRadius ?? 0;
    const hPx = (s.h / 100) * SLIDE_H_PX;
    // Full pill (or clearly pill-like rounded).
    if (hPx > 0 && br / (hPx / 2) >= FULL_PILL_RATIO) return true;
    // Card (large enough in the smaller dim to be a content container).
    if (Math.min(s.w, s.h) >= CARD_MIN_DIM_PCT) return true;
  }
  return false;
}

/** Empty stranded shape — a pill/card/badge that ships with no text on it. This is
 *  the deterministic version of the "empty floating shape" clause in the VLM's
 *  L7/C8 (clean composition). Only rectangle/circle count (line/arrow can't hold
 *  text); shapes without a container affordance (sharp-cornered filled bars,
 *  panels, accent lines) are excluded so it doesn't fight legitimate decoration
 *  like Gantt timeline bars; very small shapes and full-bleed backgrounds are
 *  also excluded. */
export function checkEmptyShape(card: Card): string[] {
  const out: string[] = [];
  const ff = (card.freeform ?? []) as (FreeformBlock & Box)[];
  // Track ARRAY position so ties on z fall to render order (later in the array
  // paints on top, matching FreeformLayer's CSS zIndex tie-break).
  const withOrder = ff.map((b, i) => ({ b, i }));
  // ANY non-empty text counts as a label — 2-char labels like "VS" or "1"
  // sitting on a badge/circle are exactly the pattern this check must respect.
  const texts = withOrder.filter(({ b }) => b.type === 'text' && t(b).length >= 1);
  const shapes = withOrder.filter(({ b }) => b.type === 'shape');
  for (const { b: s, i: si } of shapes) {
    const kind = (s as { shape?: string }).shape;
    if (kind === 'line' || kind === 'arrow') continue; // can't hold text
    // Shape that already carries its own wrapped text — that IS the label.
    if (t(s).length > 0) continue;
    // Skip hairlines + accent dots + full-bleed backgrounds.
    if (s.w < EMPTY_MIN_DIM_PCT || s.h < EMPTY_MIN_DIM_PCT) continue;
    if (s.w >= EMPTY_FULLBLEED_PCT && s.h >= EMPTY_FULLBLEED_PCT) continue;
    // Skip decoration that doesn't read as a container (sharp-cornered filled
    // bars, side panels, accent stripes).
    if (!isContainerAffordance(s)) continue;
    // Is there any text sitting inside this shape's bounds? Any real text
    // block that's mostly inside the shape counts as "the label is here"—
    // regardless of z. (The compositions occasionally emit a container circle
    // at z=4 with its 'VS' label at z=2, relying on FreeformLayer's own
    // text-on-shape stacking; requiring text.z > shape.z would false-flag those
    // real cases. If the label ends up visually occluded, the VLM's contrast/
    // premium-feel rubric catches it — this check just proves label INTENT.)
    void si;
    const hasLabel = texts.some(({ b: tx }) => fracInside(tx, s) > TEXT_INSIDE_FRAC);
    if (hasLabel) continue;
    out.push(`empty ${kind ?? 'shape'} with no text on it (${Math.round(s.w)}×${Math.round(s.h)}% at ${Math.round(s.x)},${Math.round(s.y)})`);
  }
  return out;
}

/** Low text/background contrast (the deterministic version of the VLM's L5). */
export function checkContrast(card: Card, theme: TemplateTheme): string[] {
  const out: string[] = [];
  const ff = (card.freeform ?? []) as (FreeformBlock & Box)[];
  for (const b of ff) {
    if (b.type !== 'text' || t(b).length <= 2) continue;
    const style = (b as { style?: { color?: string; gradient?: string; fontSize?: number } }).style ?? {};
    if (style.gradient) continue; // gradient text → ambiguous, skip
    const fg = parseColor(style.color);
    if (!fg || fg.a < 0.9) continue; // unknown or translucent text color → skip
    const bg = bgBehind(b, card, theme);
    if (!bg) continue; // background not computable (image/gradient) → skip
    const ratio = contrastRatio(fg, bg);
    const min = (style.fontSize ?? 16) >= 24 ? CONTRAST_MIN_LARGE : CONTRAST_MIN_SMALL;
    if (ratio < min) {
      out.push(`text "${short(t(b))}" has low contrast (${ratio.toFixed(1)}:1, needs ${min}:1) on its background`);
    }
  }
  return out;
}
