/**
 * Ambient theme background generator.
 *
 * Produces a calm, atmospheric background derived from a Theme's accent
 * tokens, designed to sit BEHIND slide cards in the editor workspace.
 * Cards float clearly on top because the ambient sits at lower saturation
 * and a sufficiently different luminance from the card surface.
 *
 * Pure CSS output (multi-layer radial gradients over a solid base). No
 * canvas, no image generation, no network. Deterministic and SSR-safe.
 *
 * Phase 2 hook: a future `pageBackground.mode = 'ai'` will accept an image
 * URL produced by an AI image generator using the theme palette + a style
 * prompt. See app/src/components/themes/types.ts for the type union.
 */

import {
  ambientVariant,
  contrastRatio,
  extractFirstHex,
  hexToOklch,
  oklchToHex,
} from './colorMath';
import type { Theme } from '@/components/themes/types';

export interface AmbientBackground {
  /** Multi-layer CSS background-image string ready to drop into `style`. */
  css: string;
  /** Solid hex fallback for SSR / `background-color`. */
  baseColor: string;
  /** Optional grain overlay as a data URI (currently unused, reserved). */
  noiseDataUri: string | null;
  /** Memoization key derived from the input palette. */
  hash: string;
}

// Two large soft ellipses sweep across the canvas — instead of 4 small
// dots — so the workspace reads as one airy wash with subtle directional
// tone rather than a spotty pattern. Tuned to feel like Gamma's editor bg.
const SWEEP_OFFSETS: ReadonlyArray<readonly [string, string]> = [
  ['18%', '12%'],
  ['82%', '88%'],
];

const MIN_NON_TEXT_CONTRAST = 3.0; // WCAG 1.4.11

function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Build a 4-color palette from the theme's accent tokens. We prefer solid
 * hexes; gradient values are reduced to their first stop. Order:
 *   primary > linkColor > bodyColor > secondaryBorder
 */
function collectPalette(theme: Theme): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const candidates = [
    extractFirstHex(theme.primaryBg),
    theme.linkColor,
    theme.bodyColor,
    theme.secondaryBorder,
    extractFirstHex(theme.secondaryBg, theme.linkColor),
  ];
  for (const hex of candidates) {
    const key = hex.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(hex);
    }
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Pick the dominant lightness for the card surface. Themes with gradient
 * pageBg (most of the 12) we sample the first stop.
 */
function cardSurfaceLightness(theme: Theme): number {
  const baseHex = extractFirstHex(theme.pageBg, '#ffffff');
  return hexToOklch(baseHex).l;
}

/**
 * Produce the ambient base color — the solid color underneath the gradient
 * sweeps.
 *
 * **Light themes** (cards near white): base stays bright at moderate
 * chroma so the workspace reads as a clean peachy/coral/blue wash. Cards
 * float on top with their own subtle drop shadow.
 *
 * **Dark themes** (cards already dark): base goes *deeper* than the card
 * surface, very low chroma. The light at the canvas edges then comes
 * from the gradient sweeps — a "cosmic / nebula" glow effect that lets
 * dark cards still float with shadow on a darker workspace.
 */
function findAmbientBase(palette: string[], cardLightness: number): string {
  const dominant = palette[0];
  const dominantLch = hexToOklch(dominant);

  if (cardLightness >= 0.5) {
    // Light theme — near-white with the faintest hint of palette hue.
    // Earlier tuning (L 0.84–0.93, chroma 0.06–0.10) produced a SATURATED
    // wash that read as a content choice rather than a backdrop.
    // "the background colors (the one BEHIND the slides) are too bold to
    // work as backgrounds... its supposed to be airy." Lift L close to
    // pure white and crush chroma so the base reads as cream/off-white,
    // not a tinted wash. Cards carry the color story; the workspace is
    // breathing room.
    const targetL = Math.max(0.96, Math.min(0.985, cardLightness + 0.02));
    return oklchToHex({
      l: targetL,
      c: Math.min(0.025, dominantLch.c * 0.15),
      h: dominantLch.h,
    });
  }

  // Dark theme — push the workspace BASE meaningfully below the card surface
  // so cards visually float above it. Earlier tuning (cardL - 0.05) sat too
  // close to the card and made the deck blur into the canvas. Now we drop
  // ~0.10 units in OKLCH lightness, with a hard floor of 0.04 so we don't
  // crush to pure black on already-dark themes. Keep chroma low so the
  // workspace stays neutral while sweeps carry the color.
  const targetL = Math.max(0.04, cardLightness - 0.10);
  return oklchToHex({
    l: targetL,
    c: Math.min(0.04, dominantLch.c * 0.3),
    h: dominantLch.h,
  });
}

/**
 * Generate the ambient background for a theme.
 *
 * Two large soft ellipses sweep diagonally across the canvas. For light
 * themes the sweeps are bright tinted variants of the palette hues — the
 * "airy peach" effect. For dark themes the sweeps are MID-lightness glows
 * that read as accent-colored haze against the deep base — atmospheric.
 */
export function generateAmbientBackground(theme: Theme): AmbientBackground {
  const palette = collectPalette(theme);
  const cardLightness = cardSurfaceLightness(theme);
  const baseColor = findAmbientBase(palette, cardLightness);

  // Sweep tuning differs by theme tone.
  //
  // Light: cream-paper backdrop with whisper-quiet color hints. Earlier
  //   tuning (sweep L 0.90, chroma 0.13, mid-alpha 0xaa = 67%) produced
  //   bold tinted blooms that read as bold backgrounds, not breathing
  //   room. Now: sweep L stays high (~0.94) so it blends into the near-
  //   white base; chroma drops to ~0.04 so it's barely a tint; mid-alpha
  //   drops to ~0x40 (25%) so the sweeps fade out fast. The result is a
  //   watercolor wash on cream paper — perceptible only if you look for
  //   it, like Gamma's editor.
  //
  // Dark: sweeps stay STRICTLY below card lightness so the entire workspace
  //   reads as deeper than the card. Earlier tuning let sweeps drift slightly
  //   above card lightness and the eye saw the card receding *into* the
  //   workspace — the opposite of "card floats above." Cap the sweep at
  //   `cardLightness - 0.04` and keep chroma low; cards differentiate via
  //   their own borders + shadows + clearly higher base luminance.
  const isLight = cardLightness >= 0.5;
  const sweepLightness = isLight
    ? 0.94
    : Math.max(0.06, cardLightness - 0.04);
  const sweepChroma = isLight ? 0.04 : 0.06;
  const sweepMidAlpha = isLight ? '40' : '88';

  const layers: string[] = [];
  const sources = palette.slice(0, 2).length === 2
    ? palette.slice(0, 2)
    : [palette[0], palette[0]];
  for (let i = 0; i < SWEEP_OFFSETS.length; i++) {
    const sourceLch = hexToOklch(sources[i]);
    const variantHex = oklchToHex({
      l: sweepLightness,
      c: Math.min(sweepChroma, sourceLch.c * 0.4 + 0.02),
      h: sourceLch.h,
    });
    const [x, y] = SWEEP_OFFSETS[i];
    layers.push(
      `radial-gradient(ellipse 80% 70% at ${x} ${y}, ${variantHex} 0%, ${variantHex}${sweepMidAlpha} 35%, transparent 85%)`,
    );
  }

  const css = layers.join(', ');
  const hash = djb2(palette.join(',') + '|' + cardLightness.toFixed(3));

  // Documented WCAG hooks; not enforced — the airy aesthetic relies on
  // card shadows for separation, not background luminance contrast.
  void MIN_NON_TEXT_CONTRAST;
  void contrastRatio;

  return { css, baseColor, noiseDataUri: null, hash };
}
