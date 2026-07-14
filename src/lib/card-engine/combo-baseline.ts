/**
 * combo-baseline.ts — the combo layout generator.
 *
 * A layout is a COMBO, not a hand-authored geometry: a constant base band
 * (eyebrow + title, optionally a subheader / lead) plus one content unit
 * (body · cards(N) · …). All box geometry + per-density char budgets DERIVE from
 * the house grid (docs/architecture/layout-convergence-plan.md Part 0) given the
 * spec — so the same rule produces cards(2) / cards(3) / cards(4) and every
 * density, and it is source-independent (Compose + imports share it).
 *
 * `generateComboLayouts()` resolves the approved variants to concrete geometry
 * that is SAVED to app/src/data/combo-layouts.json (the persisted record every
 * section's box + budget) and merged into the layout manifest.
 */
import type { Decoration } from '@/data/structureDecorations';

// ── House grid ───────────────────────────────────────────────────────────────
const INSET = 48;
const CH = 540;
const CONTENT_W = 960 - INSET * 2; // 864
const PAD = 16; // card interior padding
const FRAC = { concise: 0.45, detailed: 0.72, extensive: 0.88 } as const;

const capOf = (w: number, h: number, size: number) =>
  Math.max(1, Math.floor(w / (size * 0.52))) * Math.max(1, Math.floor(h / (size * 1.25)));
const budgetOf = (w: number, h: number, size: number) => ({
  concise: Math.round(capOf(w, h, size) * FRAC.concise),
  detailed: Math.round(capOf(w, h, size) * FRAC.detailed),
  extensive: Math.round(capOf(w, h, size) * FRAC.extensive),
});
const flatBudget = (n: number) => ({ concise: n, detailed: n, extensive: n });

const card = (x: number, y: number, w: number, h: number): Decoration => ({
  role: 'card', shape: 'rectangle', x, y, w, h, radius: 2,
  fillToken: 'surface', fillOpacity: 1, strokeToken: 'ink', strokeOpacity: 0.14, strokeWeight: 1,
});
const accentTab = (x: number, y: number): Decoration => ({
  role: 'accent-bar', shape: 'rectangle', x, y, w: 30, h: 3, fillToken: 'ink', fillOpacity: 1,
});
const bar = (x: number, y: number, w: number): Decoration => ({
  role: 'accent-bar', shape: 'rectangle', x, y, w, h: 3, fillToken: 'ink', fillOpacity: 1,
});
const rule = (y: number, opacity: number): Decoration => ({
  role: 'accent-bar', shape: 'rectangle', x: INSET, y, w: CONTENT_W, h: 1, fillToken: 'ink', fillOpacity: opacity,
});

export interface ComboSlot {
  role: string;
  group?: string;
  type?: string;
  x: number | number[];
  y: number | number[];
  w: number;
  h: number;
  size: number;
  count?: number;
  align?: string;
  budget?: { concise: number; detailed: number; extensive: number };
}
export interface ComboSpec {
  subtitle?: boolean;
  lead?: boolean;
  content: { type: 'body' } | { type: 'cards'; count: number };
}
export interface ComboLayout {
  shared: ComboSlot[];
  decorations: Decoration[];
}

/** Derive a combo's section geometry + budgets from the house grid. */
export function buildCombo(spec: ComboSpec): ComboLayout {
  const shared: ComboSlot[] = [];
  const decorations: Decoration[] = [];

  // Constant base band — eyebrow + title (flush at the inset).
  shared.push({ role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 });
  shared.push({ role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 50, size: 36 });
  let y = 138 + 12;

  // Subheader — a density-scaling one-liner (off by default on card layouts).
  if (spec.subtitle) {
    shared.push({ role: 'body', group: 'subhead', x: INSET, y, w: CONTENT_W, h: 24, size: 18, budget: budgetOf(CONTENT_W, 24, 18) });
    y += 24 + 14;
  }
  // Lead paragraph — density-scaling.
  if (spec.lead) {
    shared.push({ role: 'body', group: 'lead', x: INSET, y, w: CONTENT_W, h: 50, size: 16, budget: budgetOf(CONTENT_W, 50, 16) });
    y += 50 + 18;
  } else if (!spec.subtitle) {
    y = 150 + 16;
  }

  const regionTop = y;
  const regionH = CH - INSET - regionTop;
  const c = spec.content;

  if (c.type === 'cards') {
    // Cards = a ROW of columns (count ≥ 2). Density sets the COUNT; per-card text is
    // FLAT. A single point is served by combo-statement / combo-stat-1, not here.
    const N = c.count;
    const gap = 20;
    const cardW = Math.floor((CONTENT_W - (N - 1) * gap) / N);
    const cardH = Math.min(regionH, 176);
    const labelH = 20;
    const bodyTop = PAD + 14 + labelH + 8;
    const bodyH = cardH - bodyTop - PAD;
    const tw = cardW - 2 * PAD;
    const flat = Math.round(capOf(tw, bodyH, 14) * 0.8);
    const titleXs: number[] = [];
    const bodyXs: number[] = [];
    for (let i = 0; i < N; i += 1) {
      const cx = INSET + i * (cardW + gap);
      decorations.push(card(cx, regionTop, cardW, cardH), accentTab(cx + PAD, regionTop + PAD));
      titleXs.push(cx + PAD);
      bodyXs.push(cx + PAD);
    }
    shared.push({ role: 'metric-label', group: 'item-title', count: N, x: titleXs, y: regionTop + PAD + 14, w: tw, h: labelH, size: 16 });
    shared.push({ role: 'body', group: 'item-body', count: N, x: bodyXs, y: regionTop + bodyTop, w: tw, h: bodyH, size: 14, budget: flatBudget(flat) });
  } else {
    shared.push({ role: 'body', group: 'lead', x: INSET, y: regionTop, w: CONTENT_W, h: regionH, size: 16, budget: budgetOf(CONTENT_W, regionH, 16) });
  }

  return { shared, decorations };
}

/** The approved CARDS combo, saved at every count (1..4) — density selects which
 *  (concise 2 · detailed 3 · extensive 4; single card is its own layout). */
export const CARDS_VARIANTS = [2, 3, 4].map((n) => ({
  key: `combo-cards-${n}`,
  // Row of columns with a lead above. A single point is combo-statement / combo-stat-1,
  // not a 1-card row (that was a boxed duplicate of the statement — dropped).
  spec: { lead: true, content: { type: 'cards' as const, count: n } },
}));

/** STATEMENT — one key point, NO card box: a large ink statement (the theme-driven
 *  `statement` role) on the left, subordinate muted support on the right. */
export function buildStatement(): ComboLayout {
  return {
    shared: [
      { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
      { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 44, size: 36 },
      { role: 'statement', x: INSET, y: 188, w: 422, h: 190, size: 25, budget: { concise: 70, detailed: 118, extensive: 150 } },
      { role: 'body', group: 'subhead', x: 490, y: 194, w: 422, h: 190, size: 16, budget: budgetOf(422, 190, 16) },
    ],
    decorations: [bar(INSET, 168, 40)],
  };
}

/** STAT — one highlighted metric (the single case a card box is justified: it frames
 *  a real number). Card HUGS the value (centered), support column widened. */
export function buildStat(): ComboLayout {
  const cardW = 300;
  return {
    shared: [
      { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
      { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 44, size: 36 },
      { role: 'metric-value', group: 'hero', x: INSET, y: 236, w: cardW, h: 84, size: 84, align: 'center' },
      { role: 'metric-label', group: 'hero', x: INSET, y: 328, w: cardW, h: 24, size: 15, align: 'center', budget: flatBudget(34) },
      { role: 'body', group: 'subhead', x: 384, y: 200, w: 528, h: 180, size: 16, budget: budgetOf(528, 180, 16) },
    ],
    decorations: [
      card(INSET, 194, cardW, 176),
      bar(INSET + cardW / 2 - 15, 214, 30),
    ],
  };
}

/** Fixed single-layout combos (own their geometry, not parametric like cards). */
export const SPECIAL_VARIANTS = [
  { key: 'combo-statement', build: buildStatement },
  { key: 'combo-stat-1', build: buildStat },
];

/** BODY — the base combo. Density adds STRUCTURE, not just chars: a `subheader`
 *  breaks the body into labelled sections, and the SECTION COUNT is the lever.
 *    0 sections → one paragraph            (concise; trimmed)
 *    1 section  → subheader + paragraph    (detailed)
 *    2 sections → two subheadered sections (extensive)
 *  Saved as 3 layouts, selected by density (concise→0 · detailed→1 · extensive→2). */
export function buildBody(sections: number): ComboLayout {
  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
    { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 46, size: 36 },
    // Lead line = the slide's ONE TAKEAWAY (the point it lands), just under the
    // topic-label title — so the workhorse layout shows the takeaway too.
    { role: 'body', group: 'lead', x: INSET, y: 138, w: CONTENT_W, h: 28, size: 17, budget: flatBudget(110) },
  ];
  if (sections === 0) {
    shared.push({ role: 'body', group: 'p1', x: INSET, y: 190, w: CONTENT_W, h: 216, size: 16, budget: flatBudget(410) });
  } else if (sections === 1) {
    shared.push({ role: 'subheader', group: 's1', x: INSET, y: 192, w: CONTENT_W, h: 24, size: 18 });
    shared.push({ role: 'body', group: 'p1', x: INSET, y: 226, w: CONTENT_W, h: 196, size: 16, budget: flatBudget(440) });
  } else {
    shared.push({ role: 'subheader', group: 's1', x: INSET, y: 184, w: CONTENT_W, h: 24, size: 18 });
    shared.push({ role: 'body', group: 'p1', x: INSET, y: 218, w: CONTENT_W, h: 90, size: 16, budget: flatBudget(280) });
    shared.push({ role: 'subheader', group: 's2', x: INSET, y: 330, w: CONTENT_W, h: 24, size: 18 });
    shared.push({ role: 'body', group: 'p2', x: INSET, y: 364, w: CONTENT_W, h: 86, size: 16, budget: flatBudget(260) });
  }
  return { shared, decorations: [] };
}

/** BODY + IMAGE — the same section ladder, with a full-height image (the
 *  ds-media-cover proportion) on the RIGHT or LEFT and the text in the other column. */
export function buildBodyImage(sections: number, side: 'left' | 'right' = 'right'): ComboLayout {
  const TW = 452; // text column
  const TX = side === 'left' ? 460 : INSET; // text x
  const IX = side === 'left' ? 0 : 548; // image x (full-height, bleeds to its edge)
  const image: ComboSlot = { role: 'image', type: 'image', group: 'img', x: IX, y: 0, w: 412, h: 540, size: 0 };
  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: TX, y: 52, w: 200, h: 16, size: 13 },
    { role: 'title', x: TX, y: 84, w: TW, h: 96, size: 34 },
  ];
  if (sections === 0) {
    shared.push({ role: 'body', group: 'p1', x: TX, y: 214, w: TW, h: 262, size: 16, budget: flatBudget(300) });
  } else if (sections === 1) {
    shared.push({ role: 'subheader', group: 's1', x: TX, y: 210, w: TW, h: 24, size: 18 });
    shared.push({ role: 'body', group: 'p1', x: TX, y: 244, w: TW, h: 232, size: 16, budget: flatBudget(320) });
  } else {
    shared.push({ role: 'subheader', group: 's1', x: TX, y: 204, w: TW, h: 24, size: 18 });
    shared.push({ role: 'body', group: 'p1', x: TX, y: 238, w: TW, h: 96, size: 16, budget: flatBudget(180) });
    shared.push({ role: 'subheader', group: 's2', x: TX, y: 356, w: TW, h: 24, size: 18 });
    shared.push({ role: 'body', group: 'p2', x: TX, y: 390, w: TW, h: 96, size: 16, budget: flatBudget(170) });
  }
  shared.push(image);
  return { shared, decorations: [] };
}

export const BODY_VARIANTS = [
  { key: 'combo-body', build: () => buildBody(0) },
  { key: 'combo-body-1', build: () => buildBody(1) },
  { key: 'combo-body-2', build: () => buildBody(2) },
  { key: 'combo-body-image', build: () => buildBodyImage(0, 'right') },
  { key: 'combo-body-image-1', build: () => buildBodyImage(1, 'right') },
  { key: 'combo-body-image-2', build: () => buildBodyImage(2, 'right') },
  { key: 'combo-body-image-left', build: () => buildBodyImage(0, 'left') },
  { key: 'combo-body-image-left-1', build: () => buildBodyImage(1, 'left') },
  { key: 'combo-body-image-left-2', build: () => buildBodyImage(2, 'left') },
];

/** TABLE — an R×C grid: a header line over a label column + N value columns, header
 *  row with a rule, light row separators. Cell text is short/flat. Two families use
 *  this: `combo-table-rows-*` scales the ROW count (fixed columns) and
 *  `combo-table-cols-*` scales the value-COLUMN count (fixed rows). */
export function buildTableGrid(rows: number, valueCols: number): ComboLayout {
  const regionTop = 200; // below the header line
  const regionBottom = 492;
  // Header text, then PADDING, the divider rule, PADDING, then the rows — so the
  // column headers aren't jammed against the rule.
  const headerY = regionTop;
  const ruleY = regionTop + 38;
  const bodyTop = regionTop + 52;
  // Cap the row height so a low-row table reads COMPACT (top-aligned) instead of
  // stretching a few rows airily across the whole region; many rows shrink to fit.
  const rowH = Math.min(58, (regionBottom - bodyTop) / rows);
  const PAD = 8;
  const labelW = valueCols <= 2 ? 300 : valueCols === 3 ? 264 : 240;
  const valW = Math.floor((CONTENT_W - labelW) / valueCols);
  const valueX = (c: number) => INSET + labelW + c * valW; // value column left edges
  const headerXs = [INSET, ...Array.from({ length: valueCols }, (_, c) => valueX(c) + PAD)];
  const cellY = (i: number) => Math.round(bodyTop + i * rowH + (rowH - 20) / 2);
  const rowYs = Array.from({ length: rows }, (_, i) => cellY(i));
  const headerYc = headerY;

  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
    { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 50, size: 36 },
    { role: 'subheader', group: 'table-head', x: INSET, y: 152, w: CONTENT_W, h: 26, size: 18 },
    { role: 'metric-label', group: 'thead', count: valueCols + 1, x: headerXs, y: headerYc, w: 140, h: 22, size: 14 },
    { role: 'metric-label', group: 'row-label', count: rows, x: INSET, y: rowYs, w: labelW - PAD, h: 20, size: 14, budget: flatBudget(24) },
  ];
  for (let c = 0; c < valueCols; c += 1) {
    shared.push({ role: 'body', group: `cell-${c + 1}`, count: rows, x: valueX(c) + PAD, y: rowYs, w: valW - 2 * PAD, h: 20, size: 14, budget: flatBudget(18) });
  }
  const decorations: Decoration[] = [rule(ruleY, 0.85)];
  for (let i = 1; i < rows; i += 1) decorations.push(rule(Math.round(bodyTop + i * rowH), 0.12));
  return { shared, decorations };
}

export const TABLE_VARIANTS = [
  // ROW-expand: fixed 2 value columns, density = row count (3 / 5 / 7).
  { key: 'combo-table-rows-3', build: () => buildTableGrid(3, 2) },
  { key: 'combo-table-rows-5', build: () => buildTableGrid(5, 2) },
  { key: 'combo-table-rows-7', build: () => buildTableGrid(7, 2) },
  // COLUMN-expand: fixed 4 rows, density = value-column count (2 / 3 / 4).
  { key: 'combo-table-cols-2', build: () => buildTableGrid(4, 2) },
  { key: 'combo-table-cols-3', build: () => buildTableGrid(4, 3) },
  { key: 'combo-table-cols-4', build: () => buildTableGrid(4, 4) },
  // GRID-expand: rows AND value columns grow together (named rows×cols).
  { key: 'combo-table-grid-3x2', build: () => buildTableGrid(3, 2) },
  { key: 'combo-table-grid-5x3', build: () => buildTableGrid(5, 3) },
  { key: 'combo-table-grid-7x4', build: () => buildTableGrid(7, 4) },
];

/** TIMELINE — N milestones along a horizontal axis: a node on the axis, a prominent
 *  milestone marker above, a description below. Density sets the milestone COUNT
 *  (concise 3 · detailed 4 · extensive 5). */
export function buildTimeline(count: number): ComboLayout {
  const colW = CONTENT_W / count;
  const axisY = 300;
  const nodeD = 12; // node diameter
  const titleW = Math.floor(colW - 24);
  const descW = Math.floor(colW - 28);
  const nodeX = (i: number) => INSET + (i + 0.5) * colW;
  const titleXs: number[] = [];
  const descXs: number[] = [];
  const decorations: Decoration[] = [];
  // axis line spanning the outer node centres
  const first = nodeX(0);
  const last = nodeX(count - 1);
  decorations.push({ role: 'accent-bar', shape: 'rectangle', x: Math.round(first), y: axisY - 1, w: Math.round(last - first), h: 2, fillToken: 'ink', fillOpacity: 0.85 });
  for (let i = 0; i < count; i += 1) {
    const cx = nodeX(i);
    decorations.push({ role: 'accent-bar', shape: 'rectangle', x: Math.round(cx - nodeD / 2), y: axisY - nodeD / 2, w: nodeD, h: nodeD, radius: nodeD / 2, fillToken: 'ink', fillOpacity: 1 });
    titleXs.push(Math.round(cx - titleW / 2));
    descXs.push(Math.round(cx - descW / 2));
  }
  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
    { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 50, size: 36 },
    { role: 'metric-value', group: 'milestone-date', count, x: titleXs, y: 224, w: titleW, h: 34, size: 24, align: 'center', budget: flatBudget(16) },
    { role: 'body', group: 'milestone-desc', count, x: descXs, y: 328, w: descW, h: 70, size: 13, align: 'center', budget: flatBudget(74) },
  ];
  return { shared, decorations };
}

/** TIMELINE (vertical) — N milestones down a vertical axis on the left, each with a
 *  marker + a wider description to the right. Suits more text per step / more steps
 *  than the horizontal timeline. Density sets the count (concise 3 · … · extensive 5). */
export function buildTimelineVertical(count: number): ComboLayout {
  const axisX = 104;
  const top = 186;
  const bottom = 484;
  const rowH = (bottom - top) / count;
  const nodeD = 12;
  const textX = 144;
  const textW = CONTENT_W + INSET - textX; // 912 - 144 = 768
  const nodeY = (i: number) => Math.round(top + (i + 0.5) * rowH);
  const markerYs: number[] = [];
  const descYs: number[] = [];
  const descH = Math.max(22, Math.round(rowH - 40));
  const decorations: Decoration[] = [];
  const first = nodeY(0);
  const last = nodeY(count - 1);
  decorations.push({ role: 'accent-bar', shape: 'rectangle', x: axisX - 1, y: first, w: 2, h: last - first, fillToken: 'ink', fillOpacity: 0.85 });
  for (let i = 0; i < count; i += 1) {
    const cy = nodeY(i);
    decorations.push({ role: 'accent-bar', shape: 'rectangle', x: axisX - nodeD / 2, y: cy - nodeD / 2, w: nodeD, h: nodeD, radius: nodeD / 2, fillToken: 'ink', fillOpacity: 1 });
    markerYs.push(cy - 18);
    descYs.push(cy + 8);
  }
  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
    { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 50, size: 36 },
    { role: 'metric-value', group: 'milestone-date', count, x: textX, y: markerYs, w: textW, h: 24, size: 20, budget: flatBudget(22) },
    { role: 'body', group: 'milestone-desc', count, x: textX, y: descYs, w: textW, h: descH, size: 14, budget: flatBudget(110) },
  ];
  return { shared, decorations };
}

export const TIMELINE_VARIANTS = [
  { key: 'combo-timeline-3', build: () => buildTimeline(3) },
  { key: 'combo-timeline-4', build: () => buildTimeline(4) },
  { key: 'combo-timeline-5', build: () => buildTimeline(5) },
  { key: 'combo-timeline-vertical-3', build: () => buildTimelineVertical(3) },
  { key: 'combo-timeline-vertical-4', build: () => buildTimelineVertical(4) },
  { key: 'combo-timeline-vertical-5', build: () => buildTimelineVertical(5) },
];

// ── Planner integration ──────────────────────────────────────────────────────
// The planner picks ONE key per slide by matching content to a layout's PURPOSE,
// and density is applied at fill time — it does NOT pick a density variant. So the
// planner is offered one FAMILY per combo (with an affordance purpose); the deck's
// density then resolves the family to the concrete saved variant.

export interface ComboFamily {
  key: string;
  label: string;
  purpose: string;
  hasImage?: boolean;
  byDensity: { concise: string; detailed: string; extensive: string };
}

/** Density-variant families — planner picks the family key, density resolves it. */
export const COMBO_FAMILIES: ComboFamily[] = [
  { key: 'combo-cards', label: 'Cards', purpose: 'A row of 2–4 short parallel points as cards (features, options, comparisons, reasons). Density sets the card count.', byDensity: { concise: 'combo-cards-2', detailed: 'combo-cards-3', extensive: 'combo-cards-4' } },
  { key: 'combo-body', label: 'Body', purpose: 'A prose slide explaining one idea. Higher density breaks the text into labelled subheadered sections.', byDensity: { concise: 'combo-body', detailed: 'combo-body-1', extensive: 'combo-body-2' } },
  { key: 'combo-body-image', label: 'Body with image', purpose: 'A prose slide with a supporting image in a side column. Use when a photo/visual genuinely adds to the point.', hasImage: true, byDensity: { concise: 'combo-body-image', detailed: 'combo-body-image-1', extensive: 'combo-body-image-2' } },
  { key: 'combo-table-rows', label: 'Table (rows)', purpose: 'A data table: one metric/label per row across 2 value columns (year-over-year, before/after). Density adds rows.', byDensity: { concise: 'combo-table-rows-3', detailed: 'combo-table-rows-5', extensive: 'combo-table-rows-7' } },
  { key: 'combo-table-cols', label: 'Table (wide)', purpose: 'A wide comparison table across many columns (entities, periods, options) with few rows. Density adds columns.', byDensity: { concise: 'combo-table-cols-2', detailed: 'combo-table-cols-3', extensive: 'combo-table-cols-4' } },
  { key: 'combo-table-grid', label: 'Table (grid)', purpose: 'A large data grid with many rows AND columns of values. Density grows both dimensions.', byDensity: { concise: 'combo-table-grid-3x2', detailed: 'combo-table-grid-5x3', extensive: 'combo-table-grid-7x4' } },
  { key: 'combo-timeline', label: 'Timeline', purpose: '3–5 milestones over time on a horizontal axis (roadmap, phases, history, sequence). Punchy, short labels. Density sets the milestone count.', byDensity: { concise: 'combo-timeline-3', detailed: 'combo-timeline-4', extensive: 'combo-timeline-5' } },
  { key: 'combo-timeline-vertical', label: 'Timeline (vertical)', purpose: 'Milestones down a vertical axis with a wider description per step — use when each milestone needs a sentence or two, or there are more steps.', byDensity: { concise: 'combo-timeline-vertical-3', detailed: 'combo-timeline-vertical-4', extensive: 'combo-timeline-vertical-5' } },
  { key: 'combo-metrics', label: 'Metrics', purpose: 'A row of 2–4 headline numbers (KPIs, results), each a big value + label. Use when several figures are the point. For ONE figure use the single stat.', byDensity: { concise: 'combo-metrics-2', detailed: 'combo-metrics-3', extensive: 'combo-metrics-4' } },
];

/** Single-layout combos the planner picks directly (no density variant). */
export const COMBO_DIRECT: { key: string; label: string; purpose: string }[] = [
  { key: 'combo-statement', label: 'Statement', purpose: 'One key claim or takeaway stated large, with brief supporting detail beside it. No chrome — a single point that should land.' },
  { key: 'combo-stat-1', label: 'Stat', purpose: 'A single highlighted metric — one big number with a caption and a line of supporting detail. Use when ONE figure is the point.' },
];

/** Resolve a planned key: a family → its density variant; anything else unchanged. */
export function resolveComboFamily(key: string, density?: string): string {
  const f = COMBO_FAMILIES.find((x) => x.key === key);
  if (!f) return key;
  const mode = density === 'concise' ? 'concise' : density === 'extensive' ? 'extensive' : 'detailed';
  return f.byDensity[mode];
}

// ── Chrome layouts (cover / divider / closing / quote) as combos ─────────────
// Single-layout structural slides, ported to the house grid. They reuse the same
// role:group styles as the original Figma-derived templates so they look consistent
// (title:section-title, title:closing-title, title:quote, metric-value:section-number).

/** COVER — kicker + big title + optional lead, byline (author · date) at the foot. */
export function buildCover(): ComboLayout {
  return {
    shared: [
      { role: 'title', x: INSET, y: 236, w: 840, h: 160, size: 54 },
      // Lead is a SINGLE line (never wraps): one-line box + one-line budget.
      { role: 'body', group: 'lead', x: INSET, y: 404, w: 700, h: 24, size: 18, budget: budgetOf(700, 24, 18) },
      { role: 'author', x: INSET, y: 448, w: 360, h: 18, size: 14 },
      { role: 'date', x: INSET + 380, y: 448, w: 300, h: 18, size: 14 },
    ],
    decorations: [rule(434, 0.85)],
  };
}

/** DIVIDER — oversized section number + eyebrow + section title. */
export function buildDivider(): ComboLayout {
  return {
    shared: [
      { role: 'metric-value', group: 'section-number', x: INSET, y: 150, w: 400, h: 170, size: 150 },
      { role: 'title', group: 'divider-title', x: INSET, y: 352, w: 864, h: 130, size: 58 },
    ],
    decorations: [],
  };
}

/** CLOSING — kicker + closing title + lead + CTA + footer. */
export function buildClosing(): ComboLayout {
  return {
    shared: [
      { role: 'title', group: 'closing-title', x: INSET, y: 238, w: 820, h: 120, size: 50 },
      { role: 'body', group: 'lead', x: INSET, y: 376, w: 700, h: 50, size: 18, budget: budgetOf(700, 50, 18) },
      { role: 'body', group: 'cta-label', x: INSET, y: 448, w: 500, h: 20, size: 15, budget: flatBudget(44) },
      { role: 'body', group: 'footer', x: INSET, y: 490, w: 864, h: 16, size: 13, budget: flatBudget(60) },
    ],
    decorations: [],
  };
}

/** QUOTE — a pull quote (display serif) + attribution name + role. */
export function buildQuote(): ComboLayout {
  return {
    shared: [
      { role: 'title', group: 'quote', x: INSET, y: 212, w: 820, h: 200, size: 34, budget: budgetOf(820, 200, 34) },
      { role: 'metric-label', group: 'attribution', x: INSET, y: 434, w: 500, h: 20, size: 15, budget: flatBudget(30) },
      { role: 'body', group: 'attribution-role', x: INSET, y: 460, w: 500, h: 18, size: 13, budget: flatBudget(40) },
    ],
    decorations: [bar(INSET, 182, 40)],
  };
}

/** AGENDA — a numbered list: N rows, each an oversized number + title + description.
 *  Density sets the item count (3 / 4 / 5). A scaffold slide (items seed from the
 *  deck's section titles) — wired into that logic in the chrome pass. */
export function buildAgenda(count: number): ComboLayout {
  const top = 180;
  const bottom = 488;
  const rowH = (bottom - top) / count;
  const textX = 128;
  const textW = CONTENT_W + INSET - textX; // 784
  const nums: number[] = [];
  const titles: number[] = [];
  const descs: number[] = [];
  const decorations: Decoration[] = [];
  for (let i = 0; i < count; i += 1) {
    const rt = Math.round(top + i * rowH);
    nums.push(rt + 2);
    titles.push(rt + 6);
    descs.push(rt + 36);
    if (i > 0) decorations.push(rule(rt - 4, 0.12));
  }
  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
    { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 50, size: 36 },
    { role: 'metric-value', group: 'item-number', count, x: INSET, y: nums, w: 80, h: 40, size: 30 },
    { role: 'metric-label', group: 'agenda-title', count, x: textX, y: titles, w: textW, h: 24, size: 19 },
    { role: 'body', group: 'agenda-desc', count, x: textX, y: descs, w: textW, h: Math.max(20, Math.round(rowH - 44)), size: 14, budget: flatBudget(92) },
  ];
  return { shared, decorations };
}

export const AGENDA_VARIANTS = [
  { key: 'combo-agenda-3', build: () => buildAgenda(3) },
  { key: 'combo-agenda-4', build: () => buildAgenda(4) },
  { key: 'combo-agenda-5', build: () => buildAgenda(5) },
];

/** METRICS — a row of N big numbers, each a value + label (the multi-metric sibling
 *  of combo-stat-1). Density sets the count (2 / 3 / 4); per-metric text is flat. */
export function buildMetrics(count: number): ComboLayout {
  const colW = CONTENT_W / count;
  const valueSize = count <= 2 ? 76 : count === 3 ? 62 : 52;
  const valueY = 232;
  const labelY = 344;
  const pad = 12;
  const cellW = Math.round(colW - 2 * pad);
  const xs = Array.from({ length: count }, (_, i) => Math.round(INSET + i * colW + pad));
  const shared: ComboSlot[] = [
    { role: 'eyebrow-label', x: INSET, y: 52, w: 290, h: 16, size: 13 },
    { role: 'title', x: INSET, y: 88, w: CONTENT_W, h: 50, size: 36 },
    { role: 'body', group: 'lead', x: INSET, y: 150, w: CONTENT_W, h: 44, size: 18, budget: budgetOf(CONTENT_W, 44, 18) },
    { role: 'metric-value', group: 'hero', count, x: xs, y: valueY, w: cellW, h: 96, size: valueSize, align: 'center' },
    { role: 'metric-label', group: 'hero', count, x: xs, y: labelY, w: cellW, h: 24, size: 15, align: 'center', budget: flatBudget(28) },
  ];
  return { shared, decorations: [] };
}

export const METRICS_VARIANTS = [
  { key: 'combo-metrics-2', build: () => buildMetrics(2) },
  { key: 'combo-metrics-3', build: () => buildMetrics(3) },
  { key: 'combo-metrics-4', build: () => buildMetrics(4) },
];

export const CHROME_VARIANTS = [
  { key: 'combo-cover', build: buildCover },
  { key: 'combo-divider', build: buildDivider },
  { key: 'combo-closing', build: buildClosing },
  { key: 'combo-quote', build: buildQuote },
];

/** Resolve every saved combo variant to concrete section geometry. */
export function generateComboLayouts(): Record<string, ComboLayout> {
  const out: Record<string, ComboLayout> = {};
  for (const v of CARDS_VARIANTS) out[v.key] = buildCombo(v.spec);
  for (const v of BODY_VARIANTS) out[v.key] = v.build();
  for (const v of TABLE_VARIANTS) out[v.key] = v.build();
  for (const v of TIMELINE_VARIANTS) out[v.key] = v.build();
  for (const v of AGENDA_VARIANTS) out[v.key] = v.build();
  for (const v of METRICS_VARIANTS) out[v.key] = v.build();
  for (const v of CHROME_VARIANTS) out[v.key] = v.build();
  for (const v of SPECIAL_VARIANTS) out[v.key] = v.build();
  return out;
}
