/**
 * Perceptually-uniform color math for the ambient background generator.
 *
 * Uses OKLCH (https://bottosson.github.io/posts/oklab/) so chroma + lightness
 * shifts behave consistently across hues — adjustments that look "the same"
 * to a human are computed the same in this space, unlike HSL where blue and
 * yellow at the same nominal lightness are perceptually very different.
 *
 * Pure functions, no DOM access, deterministic, safe for SSR.
 */

export interface OKLCH {
  l: number; // 0..1 — perceptual lightness
  c: number; // 0..~0.4 — chroma (saturation)
  h: number; // 0..360 — hue (degrees)
}

export interface RGB {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
}

// ── Hex parsing ─────────────────────────────────────────────────────────────

/**
 * Extract the first hex color from a string. Useful when the input may be a
 * gradient like `linear-gradient(135deg, #ABCDEF, #...)` or a plain hex.
 * Falls back to a neutral grey if no hex is found.
 */
export function extractFirstHex(value: string, fallback = '#666666'): string {
  const m = value.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : fallback;
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number): string => {
    const v = Math.max(0, Math.min(255, Math.round(n * 255)));
    return v.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── sRGB ↔ Linear RGB ───────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── Linear RGB ↔ Oklab ─────────────────────────────────────────────────────
// Matrices from Björn Ottosson's reference: https://bottosson.github.io/posts/oklab/

function linearRgbToOklab({ r, g, b }: RGB): { L: number; a: number; b: number } {
  const l = srgbToLinear(r);
  const m = srgbToLinear(g);
  const s = srgbToLinear(b);

  const lp = Math.cbrt(0.4122214708 * l + 0.5363325363 * m + 0.0514459929 * s);
  const mp = Math.cbrt(0.2119034982 * l + 0.6806995451 * m + 0.1073969566 * s);
  const sp = Math.cbrt(0.0883024619 * l + 0.2817188376 * m + 0.6299787005 * s);

  return {
    L: 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp,
    a: 1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp,
    b: 0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp,
  };
}

function oklabToLinearRgb(L: number, a: number, b: number): RGB {
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.291485548 * b;

  const l = lp * lp * lp;
  const m = mp * mp * mp;
  const s = sp * sp * sp;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

// ── OKLCH ↔ Oklab ───────────────────────────────────────────────────────────

export function rgbToOklch(rgb: RGB): OKLCH {
  const { L, a, b } = linearRgbToOklab(rgb);
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToRgb({ l, c, h }: OKLCH): RGB {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  return oklabToLinearRgb(l, a, b);
}

export function hexToOklch(hex: string): OKLCH {
  return rgbToOklch(hexToRgb(hex));
}

export function oklchToHex(lch: OKLCH): string {
  const rgb = oklchToRgb(lch);
  return rgbToHex({
    r: Math.max(0, Math.min(1, rgb.r)),
    g: Math.max(0, Math.min(1, rgb.g)),
    b: Math.max(0, Math.min(1, rgb.b)),
  });
}

// ── Adjustments ─────────────────────────────────────────────────────────────

/** Set the lightness of a color while keeping its hue + chroma. */
export function withLightness(hex: string, l: number): string {
  const lch = hexToOklch(hex);
  return oklchToHex({ ...lch, l: Math.max(0, Math.min(1, l)) });
}

/** Set the chroma (saturation) of a color while keeping its hue + lightness. */
export function withChroma(hex: string, c: number): string {
  const lch = hexToOklch(hex);
  return oklchToHex({ ...lch, c: Math.max(0, c) });
}

/**
 * Produce an "ambient" variant of a hex: low chroma, lightness shifted by
 * `lightnessDelta` (positive = lighter, negative = darker). Hue is preserved
 * so the result still belongs to the source palette.
 */
export function ambientVariant(
  hex: string,
  options: { chroma?: number; lightnessDelta?: number } = {},
): string {
  const lch = hexToOklch(hex);
  const chroma = options.chroma ?? Math.min(lch.c, 0.08);
  const targetL = lch.l + (options.lightnessDelta ?? 0);
  return oklchToHex({
    l: Math.max(0, Math.min(1, targetL)),
    c: Math.max(0, chroma),
    h: lch.h,
  });
}

// ── Contrast ────────────────────────────────────────────────────────────────

function relativeLuminance({ r, g, b }: RGB): number {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * WCAG contrast ratio between two hex colors. Returns a value in [1, 21].
 * For non-text contrast (1.4.11), 3:1 is the minimum.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}
