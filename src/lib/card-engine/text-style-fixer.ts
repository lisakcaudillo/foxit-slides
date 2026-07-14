/**
 * text-style-fixer.ts — apply the VLM's text-style directives to a card in
 * place. Three change-types share this fixer because they all mutate
 * `style.*` on a text block without touching geometry:
 *
 *   R-4  recolor  → swap the text color to a safe pair based on the block's
 *                   underlying background. If a colored shape sits beneath
 *                   the text at lower z, it picks white on dark fills / dark
 *                   ink on light fills (WCAG-safe contrast). If no shape is
 *                   underneath, it assumes the theme ground and choose the
 *                   opposite polarity to the current color.
 *   R-9  restyle  → bump the font weight one step (400 → 500 → 700). Meant
 *                   for L6 (premium feel) where the block reads as too
 *                   generic. Deliberately narrow — no font-family swap,
 *                   because a family swap would fight the design system.
 *   R-10 align    → set style.textAlign to `center`. Meant for L4 (structural
 *                   consistency) when a block sits alone in a row and center
 *                   reads more intentional than left. If the block is already
 *                   centered, it leaves it (nothing to do).
 *
 * All three run AFTER applyGeometryFixes in slide-gates so they don't fight
 * shrink/remove decisions. All three are pure edits to existing blocks —
 * they add nothing, remove nothing, move nothing.
 *
 * Fail-open: on any error the block is left as-is and the fixer returns
 * whatever it managed to apply before that point.
 */
import type { Card, FreeformBlock, FreeformImageBlock, FreeformTextBlock, FreeformShapeBlock } from '@/types/card-template';

export interface TextStyleDirective { element: string; change: string; reason?: string }

interface Box { x: number; y: number; w: number; h: number; z: number }

// ── Color helpers ────────────────────────────────────────────────────────

/** Parse a hex color (#rgb or #rrggbb). Returns null for anything else
 *  (rgb(), rgba(), gradients, undefined). */
function parseHex(c?: string): { r: number; g: number; b: number } | null {
  if (!c || typeof c !== 'string') return null;
  const s = c.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const h = m[1];
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const h = m[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

/** Relative luminance per WCAG 2.1. */
function relLum(rgb: { r: number; g: number; b: number }): number {
  const f = (v: number): number => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

const LIGHT_TEXT = '#FFFFFF';
const DARK_TEXT = '#1A1F2E';

// ── Overlap check ────────────────────────────────────────────────────────

function intersectFrac(a: Box, b: Box): number {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = iw * ih;
  const minA = Math.min(a.w * a.h, b.w * b.h);
  return minA > 0 ? inter / minA : 0;
}

/** Find the shape sitting beneath a text block (lower z, majority-overlap).
 *  Prefers the highest-z shape that qualifies (the "closest" background). */
function shapeBehind(textBlock: FreeformTextBlock, ff: readonly FreeformBlock[]): FreeformShapeBlock | null {
  const textBox: Box = { x: textBlock.x, y: textBlock.y, w: textBlock.w, h: textBlock.h, z: textBlock.z };
  let best: FreeformShapeBlock | null = null;
  let bestZ = -Infinity;
  for (const b of ff) {
    if (b.type !== 'shape') continue;
    const s = b as FreeformShapeBlock;
    if (s.z >= textBox.z) continue;
    const box: Box = { x: s.x, y: s.y, w: s.w, h: s.h, z: s.z };
    if (intersectFrac(textBox, box) < 0.5) continue;
    if (s.z > bestZ) { best = s; bestZ = s.z; }
  }
  return best;
}

/** True if a text block has an image sitting substantially beneath it (lower z,
 *  majority-overlap) — including full-bleed backgrounds. Recolor should skip
 *  these: the renderer's scrim already forces a legible text color on
 *  behind-text imagery, and flipping the block's own color would override it
 *  the WRONG way (dark ink on top of a scrim'd photo). */
function hasImageBehind(textBlock: FreeformTextBlock, ff: readonly FreeformBlock[]): boolean {
  const textBox: Box = { x: textBlock.x, y: textBlock.y, w: textBlock.w, h: textBlock.h, z: textBlock.z };
  for (const b of ff) {
    if (b.type !== 'image') continue;
    const img = b as FreeformImageBlock;
    if (img.z >= textBox.z) continue;
    if (!img.src) continue; // empty placeholder — no scrim yet
    const box: Box = { x: img.x, y: img.y, w: img.w, h: img.h, z: img.z };
    if (intersectFrac(textBox, box) >= 0.5) return true;
  }
  return false;
}

/** Choose the WCAG-safe text color for a given background hex. */
function safeTextColorFor(bgHex: string): string {
  const bg = parseHex(bgHex);
  if (!bg) return DARK_TEXT;
  // Luminance ≤ 0.4 = "dark bg", use white; else use dark ink.
  return relLum(bg) <= 0.4 ? LIGHT_TEXT : DARK_TEXT;
}

/** Flip a text color to the opposite polarity — used when there's no
 *  underlying shape (assume theme ground) and the current color is
 *  clearly wrong. Best-effort: unknown → dark ink. */
function flipTextColor(current: string | undefined): string {
  const cur = parseHex(current);
  if (!cur) return DARK_TEXT;
  return relLum(cur) > 0.5 ? DARK_TEXT : LIGHT_TEXT;
}

// ── Font weight step ─────────────────────────────────────────────────────

const WEIGHT_STEPS = [300, 400, 500, 600, 700, 800];

function bumpWeight(current: number | undefined): number | null {
  const cur = current ?? 400;
  const idx = WEIGHT_STEPS.findIndex((w) => w > cur);
  if (idx < 0) return null; // already at max
  return WEIGHT_STEPS[idx];
}

// ── Public fixer ─────────────────────────────────────────────────────────

/** Apply recolor / restyle / align directives to a card in place. Returns
 *  true if anything changed (so the caller knows to re-judge it). */
export function applyTextStyleFixes(card: Card, directives: TextStyleDirective[]): boolean {
  if (!directives.length) return false;
  const ff = (card.freeform ?? []) as FreeformBlock[];
  let changed = false;

  for (const d of directives) {
    if (d.change !== 'recolor' && d.change !== 'restyle' && d.change !== 'align') continue;

    // Match by full block id (VLM emits the full block id as element).
    const block = ff.find((b) => b.type === 'text' && (b as { id?: string }).id === d.element) as FreeformTextBlock | undefined;
    if (!block) continue;
    const style = block.style ?? {};

    if (d.change === 'recolor') {
      // Full-bleed and behind-text image slides use the renderer's scrim +
      // forced-light color path; do NOT touch style.color there, or the
      // block's own color will override the scrim's pick.
      if (card.slideDesign?.imageRole === 'full-bleed'
          || card.slideDesign?.imageRole === 'duotone'
          || card.slideDesign?.imageRole === 'texture'
          || card.slideDesign?.imageRole === 'background') {
        continue;
      }
      if (hasImageBehind(block, ff)) continue;

      const beneath = shapeBehind(block, ff);
      let nextColor: string | undefined;
      if (beneath && beneath.fill) {
        // Text on a colored shape: WCAG-safe pair against that fill.
        nextColor = safeTextColorFor(beneath.fill);
      } else if (parseHex(style.color)) {
        // No shape beneath and an explicit hex color: flip polarity. Only when
        // it knows what "flip" means — never manufacture a color from thin air.
        nextColor = flipTextColor(style.color);
      } else {
        // Unknown current color OR undefined — skip. The renderer probably
        // resolves it correctly and any override would guess wrong.
        continue;
      }
      if (nextColor && nextColor !== style.color) {
        block.style = { ...style, color: nextColor };
        changed = true;
      }
    } else if (d.change === 'restyle') {
      const next = bumpWeight(style.fontWeight);
      if (next != null && next !== style.fontWeight) {
        block.style = { ...style, fontWeight: next };
        changed = true;
      }
    } else if (d.change === 'align') {
      if (style.textAlign !== 'center') {
        block.style = { ...style, textAlign: 'center' };
        changed = true;
      }
    }
  }
  return changed;
}
