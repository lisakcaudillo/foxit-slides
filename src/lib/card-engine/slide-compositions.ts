/**
 * Deterministic slide compositions — the runtime renderer's "real templates".
 *
 * These encode the top-tier compositions the AI composer authors at design-time
 * (validated by the visual judge) as fast, free, parameterized functions. The
 * live generation path calls these instead of collapsing rich recipes to
 * bullets — so a content slide renders as the panel + dominant title + numbered
 * cards layout, every time, with no per-slide AI cost (keeps theme re-skin free).
 *
 * Typography is guaranteed by slide-typography (title dominant, autofit, no
 * clipping). Geometry is % of the 960×540 card.
 */
import type { FreeformBlock, TemplateTheme } from '@/types/card-template';
import { textBlock as textBlockAutofit, type TextSpec } from './slide-typography';

/** Lock-the-box for compositions (layout-first increment A, path #1).
 *  Compositions are fixed-grid layouts: every slot box is designed to a computed
 *  height (cardH / cellH / header bands), so text must LOCK to its box — shrink
 *  to the role floor to fit — rather than grow into the block below it. Each
 *  composition builder declares roles + slots; this guarantees the box never
 *  expands past its designed slot. (The autofit default still grows the box, so
 *  non-composition callers of textBlock are unchanged.) */
const textBlock = (spec: TextSpec): FreeformBlock => textBlockAutofit({ ...spec, lock: true });

const isHex = (s?: string): boolean => !!s && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
const WHITE = '#ffffff';

function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const relLum = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Guarantee a panel dark enough to carry white text: if the color is too
 *  light (e.g. a pastel accent on a dark theme), blend it toward near-black. */
function ensureDarkPanel(hex: string): string {
  if (!isHex(hex)) return '#1f2937';
  if (relLum(hex) < 0.5) return hex;
  const [r, g, b] = toRgb(hex);
  const mix = (c: number) => Math.round(c * 0.45 + 18 * 0.55); // 55% toward #121212
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export interface StructuredContentInput {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  items: { heading: string; body: string }[];
  theme: TemplateTheme;
}

/**
 * Structured content — a left accent panel holding the eyebrow + dominant title
 * (+ optional subtitle), and a right column of numbered items (number · heading
 * · body). Replaces the heading-over-bullets collapse for multi-point content
 * slides. Designed to read legibly on both light and dark themes: the panel
 * uses the theme accent with white text; the right column uses the theme's own
 * heading/body colors (which already contrast their card surface).
 */
export function composeStructuredContent(input: StructuredContentInput): FreeformBlock[] {
  const { title, subtitle, eyebrow, theme } = input;
  const items = input.items.slice(0, 5);
  const accent = (theme.accentColors || []).find(isHex) ?? '#1F3D8A';
  const panelColor = ensureDarkPanel(accent);
  const headingColor = isHex(theme.headingColor) ? theme.headingColor : (isHex(theme.bodyColor) ? theme.bodyColor : '#1f2937');
  const bodyColor = isHex(theme.bodyColor) ? theme.bodyColor : '#475569';
  // Number accent for the right column: the accent, unless it's so light it
  // would wash out on the card surface — then fall back to the heading color.
  const numColor = relLum(accent) < 0.7 ? accent : headingColor;

  const blocks: FreeformBlock[] = [];
  // Left panel (full-bleed, guaranteed dark enough for white text).
  const PANEL_W = 38;
  blocks.push({ id: 'sc-panel', type: 'shape', shape: 'rectangle', x: 0, y: 0, w: PANEL_W, h: 100, rotation: 0, z: 1, fill: panelColor } as FreeformBlock);

  // Panel text (white on the accent panel).
  if (eyebrow) blocks.push(textBlock({ id: 'sc-eyebrow', role: 'eyebrow', content: eyebrow, x: 6, y: 13, w: PANEL_W - 12, h: 6, color: WHITE }));
  blocks.push(textBlock({ id: 'sc-title', role: 'title', content: title, x: 6, y: 20, w: PANEL_W - 11, h: 34, color: WHITE }));
  if (subtitle) blocks.push(textBlock({ id: 'sc-sub', role: 'subtitle', content: subtitle, x: 6, y: 60, w: PANEL_W - 11, h: 22, color: 'rgba(255,255,255,0.85)' }));

  // Right column — numbered items.
  const RX = PANEL_W + 6;           // right region left edge (%)
  const RW = 100 - RX - 4;          // right region width (%)
  const top = 9, bottom = 92, gap = 4;
  const n = Math.max(1, items.length);
  const cardH = (bottom - top - gap * (n - 1)) / n;

  items.forEach((it, i) => {
    const cy = top + i * (cardH + gap);
    blocks.push(textBlock({ id: `sc-num-${i}`, role: 'section', content: `0${i + 1}`, x: RX, y: cy, w: 6, h: 8, color: numColor, align: 'left' }));
    blocks.push(textBlock({ id: `sc-h-${i}`, role: 'section', content: it.heading, x: RX + 7, y: cy, w: RW - 7, h: 8, color: headingColor, align: 'left' }));
    if (it.body) blocks.push(textBlock({ id: `sc-b-${i}`, role: 'body', content: it.body, x: RX + 7, y: cy + 8.5, w: RW - 7, h: cardH - 8.5, color: bodyColor, align: 'left' }));
  });

  return blocks;
}

// ── Shared input + geometry helpers for the typed-layout compositions ─────────
// Comparison / process / content-grid all consume the same per-item content the
// writer already emits (a smart-layout cell = heading + body [+ optional icon]).
// Only the geometry differs. Text always goes through `textBlock` (autofit / no
// clip); shapes are backgrounds, chips, and connectors only — same contract as
// composeStructuredContent above (validated by the visual judge).

export interface CompositionItem { heading: string; body: string; icon?: string }
export interface TypedLayoutInput {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  items: CompositionItem[];
  theme: TemplateTheme;
}

const CARD_W = 960;
const CARD_H = 540;
/** h% that makes a w%-wide box square in real pixels (the card is 16:9, so a
 *  circle needs different w/h percentages to render round). */
const squareH = (wPct: number): number => (wPct * CARD_W) / CARD_H;
/** Translucent tint of a hex color, for column/cell background cards. */
function tint(hex: string, alpha: number): string {
  if (!isHex(hex)) return `rgba(15,23,42,${alpha})`;
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
/** Resolve the standard theme colors a composition needs. */
function themeColors(theme: TemplateTheme) {
  const accent = (theme.accentColors || []).find(isHex) ?? '#1F3D8A';
  const headingColor = isHex(theme.headingColor) ? theme.headingColor : (isHex(theme.bodyColor) ? theme.bodyColor : '#1f2937');
  const bodyColor = isHex(theme.bodyColor) ? theme.bodyColor : '#475569';
  return { accent, headingColor, bodyColor };
}

/**
 * Comparison — two side-by-side columns ("A vs B"). Each column is a light card
 * with an accent header bar (white label) and the side's content below; a round
 * "VS" badge sits in the gutter. A two-column comparison form
 * (header bar + list per side) and the standard's "two columns / matrix".
 * Falls back to the first two items; extra items are dropped (a comparison is
 * binary by construction). Use composeContentGrid for ≥3 parallel points.
 */
export function composeComparison(input: TypedLayoutInput): FreeformBlock[] {
  const { title, theme } = input;
  const items = input.items.slice(0, 2);
  const { accent, headingColor, bodyColor } = themeColors(theme);
  const headerText = relLum(accent) < 0.6 ? WHITE : ensureDarkPanel(accent);
  const blocks: FreeformBlock[] = [];

  // Title band.
  blocks.push(textBlock({ id: 'cmp-title', role: 'title', content: title, x: 6, y: 5, w: 88, h: 13, color: headingColor, align: 'center' }));

  const colTop = 25, colBottom = 92;
  const colH = colBottom - colTop;
  const cols = [{ x: 5, w: 42 }, { x: 53, w: 42 }];
  const headerH = 11;

  items.forEach((it, i) => {
    const { x, w } = cols[i] ?? cols[0];
    // Column card (subtle definition) + accent header bar.
    blocks.push({ id: `cmp-card-${i}`, type: 'shape', shape: 'rectangle', x, y: colTop, w, h: colH, rotation: 0, z: 1, fill: tint(headingColor, 0.04), borderRadius: 14 } as FreeformBlock);
    blocks.push({ id: `cmp-hdr-${i}`, type: 'shape', shape: 'rectangle', x, y: colTop, w, h: headerH, rotation: 0, z: 2, fill: accent, borderRadius: 14 } as FreeformBlock);
    blocks.push(textBlock({ id: `cmp-hl-${i}`, role: 'section', content: it.heading, x: x + 2, y: colTop + 3, w: w - 4, h: headerH - 4, color: headerText, align: 'center' }));
    if (it.body) blocks.push(textBlock({ id: `cmp-bd-${i}`, role: 'body', content: it.body, x: x + 4, y: colTop + headerH + 4, w: w - 8, h: colH - headerH - 8, color: bodyColor, align: 'left' }));
  });

  // Center VS badge (only meaningful with two sides).
  if (items.length === 2) {
    const vsW = 8, vsH = squareH(vsW);
    const vsX = 50 - vsW / 2, vsY = colTop + colH / 2 - vsH / 2;
    blocks.push({ id: 'cmp-vs-c', type: 'shape', shape: 'circle', x: vsX, y: vsY, w: vsW, h: vsH, rotation: 0, z: 4, fill: ensureDarkPanel(accent) } as FreeformBlock);
    blocks.push(textBlock({ id: 'cmp-vs-t', role: 'section', content: 'VS', x: vsX, y: vsY + vsH * 0.3, w: vsW, h: vsH * 0.5, color: WHITE, align: 'center' }));
  }

  return blocks;
}

/**
 * Process — a horizontal numbered milestone row. N accent circles sit on a
 * connecting line, numbered 1..N, each with a heading + short caption below.
 * A milestone row
 * and the standard's "horizontal numbered milestone row". Clamps to 5 steps so
 * the row never gets cramped.
 */
export function composeProcess(input: TypedLayoutInput): FreeformBlock[] {
  const { title, theme } = input;
  const items = input.items.slice(0, 5);
  const n = Math.max(1, items.length);
  const { accent, headingColor, bodyColor } = themeColors(theme);
  const numColor = relLum(accent) < 0.6 ? WHITE : ensureDarkPanel(accent);
  const blocks: FreeformBlock[] = [];

  blocks.push(textBlock({ id: 'prc-title', role: 'title', content: title, x: 6, y: 6, w: 88, h: 12, color: headingColor, align: 'center' }));

  const left = 6, usable = 88;
  const cellW = usable / n;
  const dotW = 8, dotH = squareH(dotW);
  const dotCY = 40;                       // circle vertical center (%)
  const dotY = dotCY - dotH / 2;
  const centers = Array.from({ length: n }, (_, i) => left + cellW * (i + 0.5));

  // Connecting line behind the circles.
  if (n > 1) {
    const x0 = centers[0], x1 = centers[n - 1];
    blocks.push({ id: 'prc-line', type: 'shape', shape: 'rectangle', x: x0, y: dotCY - 0.35, w: x1 - x0, h: 0.7, rotation: 0, z: 1, fill: tint(accent, 0.45) } as FreeformBlock);
  }

  items.forEach((it, i) => {
    const cx = centers[i];
    blocks.push({ id: `prc-dot-${i}`, type: 'shape', shape: 'circle', x: cx - dotW / 2, y: dotY, w: dotW, h: dotH, rotation: 0, z: 2, fill: accent } as FreeformBlock);
    blocks.push(textBlock({ id: `prc-num-${i}`, role: 'section', content: `${i + 1}`, x: cx - dotW / 2, y: dotY + dotH * 0.28, w: dotW, h: dotH * 0.5, color: numColor, align: 'center' }));
    blocks.push(textBlock({ id: `prc-h-${i}`, role: 'section', content: it.heading, x: cx - cellW / 2 + 1, y: dotY + dotH + 3, w: cellW - 2, h: 9, color: headingColor, align: 'center' }));
    if (it.body) blocks.push(textBlock({ id: `prc-b-${i}`, role: 'body', content: it.body, x: cx - cellW / 2 + 1, y: dotY + dotH + 13, w: cellW - 2, h: 30, color: bodyColor, align: 'center' }));
  });

  return blocks;
}

/**
 * Content grid — a multi-icon grid of equal cells (1 row for ≤3 items, 2×2 for
 * 4, 3-col for 5–6). Each cell: an accent icon (the cell's own Material Symbol
 * when present, else a numbered accent chip) + bold heading + caption. Mirrors
 * the standard's "multi-icon grid" and gives content slides a second look so
 * they don't all collapse to the numbered list.
 */
export function composeContentGrid(input: TypedLayoutInput): FreeformBlock[] {
  const { title, eyebrow, theme } = input;
  const items = input.items.slice(0, 6);
  const n = Math.max(1, items.length);
  const { accent, headingColor, bodyColor } = themeColors(theme);
  const chipText = relLum(accent) < 0.6 ? WHITE : ensureDarkPanel(accent);
  const blocks: FreeformBlock[] = [];

  if (eyebrow) blocks.push(textBlock({ id: 'cg-eyebrow', role: 'eyebrow', content: eyebrow, x: 6, y: 6, w: 88, h: 5, color: accent, align: 'left' }));
  blocks.push(textBlock({ id: 'cg-title', role: 'title', content: title, x: 6, y: eyebrow ? 11 : 6, w: 88, h: 12, color: headingColor, align: 'left' }));

  const cols = n <= 3 ? n : (n === 4 ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const gx = 3, gy = 3;
  const gridX = 6, gridTop = 26, gridW = 88, gridBottom = 92;
  const gridH = gridBottom - gridTop;
  const cellW = (gridW - gx * (cols - 1)) / cols;
  const cellH = (gridH - gy * (rows - 1)) / rows;
  const iconW = 6, iconH = squareH(iconW);

  items.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const cx = gridX + c * (cellW + gx);
    const cy = gridTop + r * (cellH + gy);
    // Subtle cell card.
    blocks.push({ id: `cg-card-${i}`, type: 'shape', shape: 'rectangle', x: cx, y: cy, w: cellW, h: cellH, rotation: 0, z: 1, fill: tint(headingColor, 0.04), borderRadius: 12 } as FreeformBlock);
    // Icon when the cell carries one, else a numbered accent chip.
    if (it.icon && it.icon.trim()) {
      blocks.push({ id: `cg-icon-${i}`, type: 'icon', name: it.icon.trim(), x: cx + 3, y: cy + 4, w: iconW, h: iconH, rotation: 0, z: 2, color: accent } as FreeformBlock);
    } else {
      blocks.push({ id: `cg-chip-${i}`, type: 'shape', shape: 'circle', x: cx + 3, y: cy + 4, w: iconW, h: iconH, rotation: 0, z: 2, fill: accent } as FreeformBlock);
      blocks.push(textBlock({ id: `cg-cn-${i}`, role: 'section', content: `${i + 1}`, x: cx + 3, y: cy + 4 + iconH * 0.28, w: iconW, h: iconH * 0.5, color: chipText, align: 'center' }));
    }
    const textTop = cy + 4 + iconH + 2.5;
    blocks.push(textBlock({ id: `cg-h-${i}`, role: 'section', content: it.heading, x: cx + 3, y: textTop, w: cellW - 6, h: 8, color: headingColor, align: 'left' }));
    if (it.body) blocks.push(textBlock({ id: `cg-b-${i}`, role: 'body', content: it.body, x: cx + 3, y: textTop + 8, w: cellW - 6, h: cellH - (textTop - cy) - 10, color: bodyColor, align: 'left' }));
  });

  return blocks;
}
