/**
 * Contrast utilities — WCAG relative-luminance math for the text-contrast
 * guarantee in the slide renderer.
 *
 * requirement (2026-06-03): text must always be legible against
 * whatever is actually behind it — "you wouldn't have white text on a white
 * background." These pure helpers let the renderer pick a text color that
 * clears the WCAG AA 4.5:1 floor against its EFFECTIVE background (a scrim
 * over an image, or a solid theme region).
 *
 * Pure, dependency-free, no `any`. Everything is computed from sRGB hex.
 *
 * NOTE on images: we cannot cheaply sample real image pixels client-side, so
 * for text OVER an image we never reason about the photo directly. Instead a
 * controlled SCRIM is painted between the image and the text (see
 * FreeformLayer), and the text color is chosen against that KNOWN scrim color.
 * That is the whole point of the scrim approach — it converts an
 * unpredictable background into a known one.
 */

// Light + dark text endpoints. Near-white and near-black (not pure #fff/#000)
// read a touch softer while still clearing AA against any opposite-tone
// background. Both are within the approved neutral range.
export const LIGHT_TEXT = '#f8fafc'; // slate-50
export const DARK_TEXT = '#0f172a';  // slate-900

/** WCAG AA contrast floor for normal-size body text. */
export const AA_NORMAL = 4.5;

/** Parse a #rgb / #rrggbb hex into [r,g,b] 0-255. Returns null if not a solid
 *  hex (e.g. a gradient string, rgba(), or a CSS var) — callers treat null as
 *  "unknown background, use the safe default". */
export function parseHex(input: string): [number, number, number] | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^#/, '');
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

/** sRGB channel → linearized value, per the WCAG definition. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance (0 = black, 1 = white) for a solid hex color.
 * Returns null when the input is not a solid hex (gradient / var / rgba).
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Relative luminance from an already-known [r,g,b] (used by the scrim, which
 *  composites an rgba overlay over a base color and needs the result's L). */
export function luminanceFromRgb(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two luminances (1:1 .. 21:1). */
export function contrastFromLuminances(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG contrast ratio between two solid hex colors. Returns null if either
 * input is not a solid hex (caller can't reason about it — fall back to safe).
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  if (la === null || lb === null) return null;
  return contrastFromLuminances(la, lb);
}

/**
 * Pick a text color guaranteed to clear AA (4.5:1) against `bgHex`.
 *
 * Decision order:
 *   1. If `preferredHex` (e.g. the theme's title/body color) is supplied AND
 *      it already clears AA against the background, KEEP it — we don't want
 *      to override a designed theme color when it's legible.
 *   2. Otherwise return whichever of LIGHT_TEXT / DARK_TEXT has the higher
 *      contrast against the background — that one always clears AA because the
 *      two endpoints sit at opposite ends of the luminance range.
 *
 * If `bgHex` is not a solid hex (a gradient/var we can't measure), we return
 * `preferredHex` when given, else null — the caller keeps the theme default
 * (the scrim path supplies a measurable hex, so this branch only hits for
 * theme-region text on gradient regions, where the theme already chose a
 * legible-by-design color).
 */
export function pickTextColor(bgHex: string, preferredHex?: string): string | null {
  const bgL = relativeLuminance(bgHex);
  if (bgL === null) {
    return preferredHex ?? null;
  }
  if (preferredHex) {
    const pl = relativeLuminance(preferredHex);
    if (pl !== null && contrastFromLuminances(pl, bgL) >= AA_NORMAL) {
      return preferredHex; // theme color is legible — keep it.
    }
  }
  const lightContrast = contrastFromLuminances(relativeLuminance(LIGHT_TEXT)!, bgL);
  const darkContrast = contrastFromLuminances(relativeLuminance(DARK_TEXT)!, bgL);
  return lightContrast >= darkContrast ? LIGHT_TEXT : DARK_TEXT;
}

/**
 * Composite an opaque base color with a translucent black/white overlay and
 * return the resulting solid [r,g,b]. Used to compute the EFFECTIVE color of a
 * scrim (a black or white veil at some alpha) to pick text color
 * against the real perceived tone, not the veil's nominal color.
 *
 * `overlay` is 0 (black) or 255 (white) per channel at `alpha` (0..1) over
 * the `base` hex. If base isn't a solid hex we assume mid-grey (128) so the
 * math still yields a usable luminance.
 */
export function compositeOverlay(
  baseHex: string,
  overlayChannel: 0 | 255,
  alpha: number,
): [number, number, number] {
  const base = parseHex(baseHex) ?? [128, 128, 128];
  const a = Math.max(0, Math.min(1, alpha));
  const mix = (c: number) => Math.round(c * (1 - a) + overlayChannel * a);
  return [mix(base[0]), mix(base[1]), mix(base[2])];
}
