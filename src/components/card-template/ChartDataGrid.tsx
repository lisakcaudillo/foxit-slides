'use client';

/**
 * ChartDataGrid — Gamma-style data-table editor for a single FreeformChartBlock.
 *
 * Ported 1:1 from the approved prototype
 * (app/public/design-table/chart-data-grid/round6/final.html). The user edits
 * the chart's underlying data in a de-tabled glass grid (rows = categories,
 * columns = series, cells = series[c].values[r]), picks a chart type from a
 * static-example gallery, and sets a number format. Every mutation preserves
 * the model invariant `series[i].values.length === categories.length`
 * (min 1 row / 1 column).
 *
 * IMPORTANT: the charts in THIS modal are FIXED representative examples — they
 * never render the user's grid data. The real on-slide chart re-renders through
 * FreeformLayer when `onChange` writes the edited data back to the block.
 *
 * Tokens: Inter, slate neutrals, violet-600 AI accent, Foxit #FF5F00 ONLY for
 * invalid/coercion, 12px rounded-rect buttons. Inline-style approach matches
 * the neighboring card-template components.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  ChartSeries,
  FreeformChartBlock,
  FreeformChartType,
} from '@/types/card-template';
import { IcRowAbove, IcRowBelow, IcColLeft, IcColRight, IcRowDelete, IcColDelete } from './tableIcons';

// ── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate300: '#cbd5e1',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  violet600: '#7c3aed',
  violet500: '#8b5cf6',
  violet300: '#c4b5fd',
  violet50: '#f5f3ff',
  foxit: '#FF5F00',
} as const;

// Series header dot palette (mirrors the prototype's SERIES_DOTS). Used when a
// series has no explicit color override.
const SERIES_DOTS = ['#7c3aed', '#60a5fa', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9'];

function dotFor(series: ChartSeries[], i: number): string {
  return series[i]?.color || SERIES_DOTS[i % SERIES_DOTS.length];
}

// Curated chart palettes the user can apply to the whole chart. "Theme"
// (palette = undefined on the block) defers to the active document theme's
// chartPalette; the named presets override it. Data-viz hues are content, not
// product chrome, so they're allowed outside the Foxit chrome palette.
interface PalettePreset {
  name: string;
  colors: string[] | null; // null = "Theme" (clear the override)
}
const PALETTE_PRESETS: PalettePreset[] = [
  { name: 'Theme', colors: null },
  { name: 'Foxit', colors: ['#6B3FA0', '#E267E4', '#4198FF', '#9FC7FE', '#F0A8F2', '#C8B6F4'] },
  { name: 'Violet', colors: ['#4C1D95', '#7C3AED', '#A78BFA', '#C4B5FD', '#DDD6FE', '#8B5CF6'] },
  { name: 'Ocean', colors: ['#0C4A6E', '#0284C7', '#0EA5E9', '#38BDF8', '#22D3EE', '#2DD4BF'] },
  { name: 'Sunset', colors: ['#7C2D12', '#EA580C', '#F59E0B', '#FBBF24', '#F472B6', '#EF4444'] },
  { name: 'Forest', colors: ['#14532D', '#16A34A', '#65A30D', '#22C55E', '#84CC16', '#10B981'] },
  { name: 'Slate', colors: ['#0F172A', '#334155', '#64748B', '#94A3B8', '#CBD5E1', '#475569'] },
];

// Default preview colors when no palette override is set ("Theme"). The modal
// has no live theme context, so the generic example colors stand in.
const EX_COLORS = ['#7c3aed', '#60a5fa', '#f59e0b', '#10b981'];

// Does a stored palette match a preset's colors? (order-sensitive hex compare)
function palettesEqual(a: string[] | null | undefined, b: string[] | null): boolean {
  if (!a || a.length === 0) return b === null;
  if (b === null) return false;
  return a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());
}

// Bijective base-26 Excel column letters: 0→A … 25→Z, 26→AA, 27→AB, …
function colName(index: number): string {
  let n = index;
  let name = '';
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

type NumberFormat = NonNullable<FreeformChartBlock['numberFormat']>;

// Full real FreeformChartType set — name + one-line description (prototype CHART_TYPES).
interface ChartTypeMeta {
  type: FreeformChartType;
  name: string;
  desc: string;
}
const CHART_TYPES: ChartTypeMeta[] = [
  { type: 'column', name: 'Grouped column', desc: 'Compare values across categories side by side.' },
  { type: 'bar', name: 'Bar', desc: 'Horizontal bars — best for long category names.' },
  { type: 'line', name: 'Line', desc: 'Show how each series moves over time.' },
  { type: 'area', name: 'Area', desc: 'Emphasize the volume beneath each trend.' },
  { type: 'pie', name: 'Pie', desc: 'Show each part as a share of the whole.' },
  { type: 'donut', name: 'Donut', desc: 'Share of total with an open center figure.' },
  { type: 'scatter', name: 'Scatter', desc: 'Plot points to spot clusters and outliers.' },
  { type: 'funnel', name: 'Funnel', desc: 'Stage drop-off, widest to narrowest.' },
  { type: 'bubble', name: 'Bubble', desc: 'Position plus magnitude encoded as size.' },
];

// ── Static example data (fixed, generic) — every chart in the modal draws from
//    this, never from the user's data. ───────────────────────────────────────
const EXAMPLE = {
  cats: ['A', 'B', 'C', 'D'],
  series: [
    { values: [60, 82, 70, 95] },
    { values: [40, 55, 72, 60] },
    { values: [78, 50, 62, 88] },
  ],
  // single-series shapes (pie / donut / funnel) use these segment totals
  parts: [42, 28, 18, 12],
} as const;

// Pick the i-th preview color from the active palette (cycles).
function pcol(colors: string[], i: number): string {
  return colors[i % colors.length];
}
function exMax(): number {
  return Math.max(...EXAMPLE.series.flatMap((s) => s.values)) * 1.14;
}

interface Pad {
  l: number;
  r: number;
  t: number;
  b: number;
}

// Number formatting for the example chart's cosmetic labels (prototype `fmt`).
function fmtValue(v: number, format: NumberFormat): string {
  switch (format) {
    case 'currency':
      return '$' + Math.round(v).toLocaleString();
    case 'percent':
      return v.toFixed(0) + '%';
    case 'compact':
      return v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(Math.round(v));
    default:
      return Math.round(v).toLocaleString();
  }
}

// ── Static-example SVG renderers (port of the prototype `ex*` helpers).
//    Each returns a markup string assigned via dangerouslySetInnerHTML — the
//    content is fully derived from FIXED constants (EXAMPLE / EX_COLORS), never
//    from user input, so there is no injection surface. ──────────────────────
function exGridY(pad: Pad, W: number, plotH: number, max: number, mini: boolean, format: NumberFormat): string {
  let s = '';
  const ticks = mini ? 2 : 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = pad.t + plotH - (v / max) * plotH;
    s += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#eef0f5" stroke-width="1"/>`;
    if (!mini) s += `<text x="${pad.l - 8}" y="${y + 3.5}" font-size="10" fill="#94a3b8" text-anchor="end" font-family="Inter">${fmtValue(v, format)}</text>`;
  }
  return s;
}

function exColumns(W: number, H: number, mini: boolean, format: NumberFormat, colors: string[]): string {
  const pad: Pad = mini ? { l: 6, r: 6, t: 8, b: 9 } : { l: 46, r: 12, t: 14, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = exMax();
  const n = EXAMPLE.cats.length;
  const m = EXAMPLE.series.length;
  const groupW = plotW / n;
  const groupPad = groupW * 0.16;
  const barGap = mini ? 1.2 : 3;
  const barW = Math.max(mini ? 1.5 : 3, (groupW - groupPad * 2 - barGap * (m - 1)) / m);
  let s = mini ? '' : exGridY(pad, W, plotH, max, mini, format);
  EXAMPLE.cats.forEach((cat, ci) => {
    const gx = pad.l + groupW * ci + groupPad;
    EXAMPLE.series.forEach((ser, si) => {
      const val = ser.values[ci];
      const bh = (val / max) * plotH;
      const x = gx + si * (barW + barGap);
      const y = pad.t + plotH - bh;
      const rx = Math.min(mini ? 1 : 3, barW / 3);
      s += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="${rx}" fill="${pcol(colors, si)}"/>`;
    });
    if (!mini) {
      const cx = pad.l + groupW * ci + groupW / 2;
      s += `<text x="${cx}" y="${H - pad.b + 16}" font-size="11" fill="#64748b" text-anchor="middle" font-family="Inter" font-weight="500">${cat}</text>`;
    }
  });
  return s;
}

function exBars(W: number, H: number, mini: boolean, format: NumberFormat, colors: string[]): string {
  const pad: Pad = mini ? { l: 8, r: 6, t: 6, b: 6 } : { l: 38, r: 16, t: 12, b: 18 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = exMax();
  const n = EXAMPLE.cats.length;
  const m = EXAMPLE.series.length;
  const groupH = plotH / n;
  const groupPad = groupH * 0.16;
  const barGap = mini ? 1.2 : 3;
  const barH = Math.max(mini ? 1.5 : 3, (groupH - groupPad * 2 - barGap * (m - 1)) / m);
  let s = '';
  if (!mini)
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const x = pad.l + (v / max) * plotW;
      s += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + plotH}" stroke="#eef0f5" stroke-width="1"/>`;
      s += `<text x="${x}" y="${pad.t + plotH + 14}" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="Inter">${fmtValue(v, format)}</text>`;
    }
  EXAMPLE.cats.forEach((_cat, ci) => {
    const gy = pad.t + groupH * ci + groupPad;
    EXAMPLE.series.forEach((ser, si) => {
      const val = ser.values[ci];
      const bw = (val / max) * plotW;
      const y = gy + si * (barH + barGap);
      s += `<rect x="${pad.l}" y="${y}" width="${bw}" height="${barH}" rx="${Math.min(mini ? 1 : 3, barH / 3)}" fill="${pcol(colors, si)}"/>`;
    });
  });
  return s;
}

function exLine(W: number, H: number, mini: boolean, fill: boolean, format: NumberFormat, colors: string[]): string {
  const pad: Pad = mini ? { l: 6, r: 6, t: 8, b: 9 } : { l: 46, r: 14, t: 14, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = exMax();
  const n = EXAMPLE.cats.length;
  let s = mini ? '' : exGridY(pad, W, plotH, max, mini, format);
  const xAt = (i: number) => (n > 1 ? pad.l + (plotW / (n - 1)) * i : pad.l + plotW / 2);
  const yAt = (v: number) => pad.t + plotH - (v / max) * plotH;
  EXAMPLE.series.forEach((ser, si) => {
    const pts = ser.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
    if (fill) {
      const base = pad.t + plotH;
      s += `<polygon points="${pad.l},${base} ${pts} ${xAt(n - 1)},${base}" fill="${pcol(colors, si)}" fill-opacity="0.16"/>`;
    }
    s += `<polyline points="${pts}" fill="none" stroke="${pcol(colors, si)}" stroke-width="${mini ? 1.8 : 2.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (!mini) ser.values.forEach((v, i) => {
      s += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="3.2" fill="#fff" stroke="${pcol(colors, si)}" stroke-width="2"/>`;
    });
  });
  if (!mini)
    EXAMPLE.cats.forEach((cat, i) => {
      s += `<text x="${xAt(i)}" y="${H - pad.b + 16}" font-size="11" fill="#64748b" text-anchor="middle" font-family="Inter" font-weight="500">${cat}</text>`;
    });
  return s;
}

function exPie(W: number, H: number, mini: boolean, donut: boolean, colors: string[]): string {
  const parts = EXAMPLE.parts;
  const sum = parts.reduce((a, b) => a + b, 0) || 1;
  const cx = W / 2;
  const cy = H / 2;
  const rr = Math.min(W, H) / 2 - (mini ? 8 : 16);
  const inner = donut ? rr * 0.56 : 0;
  let ang = -Math.PI / 2;
  let s = '';
  parts.forEach((t, i) => {
    const frac = t / sum;
    const a2 = ang + frac * Math.PI * 2;
    const x1 = cx + rr * Math.cos(ang);
    const y1 = cy + rr * Math.sin(ang);
    const x2 = cx + rr * Math.cos(a2);
    const y2 = cy + rr * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    if (donut) {
      const ix1 = cx + inner * Math.cos(ang);
      const iy1 = cy + inner * Math.sin(ang);
      const ix2 = cx + inner * Math.cos(a2);
      const iy2 = cy + inner * Math.sin(a2);
      s += `<path d="M${x1},${y1} A${rr},${rr} 0 ${large} 1 ${x2},${y2} L${ix2},${iy2} A${inner},${inner} 0 ${large} 0 ${ix1},${iy1} Z" fill="${pcol(colors, i)}" stroke="#fff" stroke-width="${mini ? 1.2 : 2.5}"/>`;
    } else {
      s += `<path d="M${cx},${cy} L${x1},${y1} A${rr},${rr} 0 ${large} 1 ${x2},${y2} Z" fill="${pcol(colors, i)}" stroke="#fff" stroke-width="${mini ? 1.2 : 2.5}"/>`;
    }
    ang = a2;
  });
  return s;
}

function exScatter(W: number, H: number, mini: boolean, bubble: boolean, format: NumberFormat, colors: string[]): string {
  const pad: Pad = mini ? { l: 8, r: 8, t: 8, b: 9 } : { l: 42, r: 16, t: 14, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = exMax();
  const n = EXAMPLE.cats.length;
  const vmax = Math.max(...EXAMPLE.series.flatMap((s) => s.values));
  let s = mini ? '' : exGridY(pad, W, plotH, max, mini, format);
  const xAt = (i: number) => (n > 1 ? pad.l + (plotW / (n - 1)) * i : pad.l + plotW / 2);
  const yAt = (v: number) => pad.t + plotH - (v / max) * plotH;
  EXAMPLE.series.forEach((ser, si) => {
    ser.values.forEach((v, i) => {
      const r = bubble ? (mini ? 2.5 + (v / vmax) * 5 : 5 + (v / vmax) * 16) : mini ? 2.6 : 5.5;
      s += `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="${r}" fill="${pcol(colors, si)}" fill-opacity="${bubble ? 0.5 : 0.85}" stroke="${pcol(colors, si)}" stroke-width="${bubble ? 1.2 : 0}"/>`;
    });
  });
  return s;
}

function exFunnel(W: number, H: number, mini: boolean, colors: string[]): string {
  const pad: Pad = mini ? { l: 10, r: 10, t: 8, b: 8 } : { l: 40, r: 40, t: 16, b: 16 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const rows = [...EXAMPLE.parts].sort((a, b) => b - a);
  const max = Math.max(...rows, 1);
  const cx = pad.l + plotW / 2;
  const segH = plotH / rows.length;
  const gap = mini ? 1.5 : 4;
  let s = '';
  rows.forEach((t, k) => {
    const wTop = (t / max) * plotW;
    const next = rows[k + 1] !== undefined ? rows[k + 1] : t * 0.6;
    const wBot = (next / max) * plotW;
    const y0 = pad.t + segH * k;
    const y1 = y0 + segH - gap;
    const x0 = cx - wTop / 2;
    const x1 = cx + wTop / 2;
    const x2 = cx + wBot / 2;
    const x3 = cx - wBot / 2;
    s += `<path d="M${x0},${y0} L${x1},${y0} L${x2},${y1} L${x3},${y1} Z" fill="${pcol(colors, k)}" fill-opacity="0.92"/>`;
  });
  return s;
}

function renderExampleMarkup(type: FreeformChartType, W: number, H: number, mini: boolean, format: NumberFormat, colors: string[]): string {
  switch (type) {
    case 'bar':
      return exBars(W, H, mini, format, colors);
    case 'line':
      return exLine(W, H, mini, false, format, colors);
    case 'area':
      return exLine(W, H, mini, true, format, colors);
    case 'pie':
      return exPie(W, H, mini, false, colors);
    case 'donut':
      return exPie(W, H, mini, true, colors);
    case 'scatter':
      return exScatter(W, H, mini, false, format, colors);
    case 'bubble':
      return exScatter(W, H, mini, true, format, colors);
    case 'funnel':
      return exFunnel(W, H, mini, colors);
    default:
      return exColumns(W, H, mini, format, colors);
  }
}


// ── Working data model (local mirror of the block, edited then committed) ─────
interface ChartData {
  chartType: FreeformChartType;
  numberFormat: NumberFormat;
  categories: string[];
  series: ChartSeries[];
  /** Whole-chart palette override; undefined = follow the document theme. */
  palette?: string[];
}

const MIN_GRID_COLS = 5;

function fromBlock(block: FreeformChartBlock): ChartData {
  // Deep-copy so edits don't mutate the live block before commit.
  const catLen = block.categories.length;
  const series = block.series.map((s) => ({ name: s.name, values: [...s.values], color: s.color }));
  // Always present at least MIN_GRID_COLS series columns in the grid — the extra
  // empty placeholders give room to add data. trimEmptyChartData drops them on
  // commit, so they never reach the rendered chart on the slide.
  while (series.length < MIN_GRID_COLS) {
    const i = series.length;
    series.push({ name: `Series ${colName(i)}`, values: Array(catLen).fill(0), color: SERIES_DOTS[i % SERIES_DOTS.length] });
  }
  return {
    chartType: block.chartType,
    numberFormat: block.numberFormat ?? 'number',
    categories: [...block.categories],
    series,
    palette: block.palette ? [...block.palette] : undefined,
  };
}

// Trim all-empty rows and columns from the grid before the chart is committed
// to the deck. A blank cell is stored as 0, so the untouched 7×7 seed is an
// all-zero table — without this, every inserted chart bakes 7 categories × 7
// series of zeros into the deck and renders a wall of empty bars. The editing
// grid stays a full 7×7 for typing room; only what's COMMITTED is trimmed to
// the cells the user actually filled. An entirely-empty grid is left untouched
// (nothing to anchor a trim on; the renderer shows an "add data" hint instead).
function trimEmptyChartData(d: ChartData): { categories: string[]; series: ChartSeries[] } {
  const isVal = (v: number) => Number.isFinite(v) && v !== 0;
  const keptCols: number[] = [];
  d.series.forEach((s, c) => {
    if (s.values.some(isVal)) keptCols.push(c);
  });
  const keptRows: number[] = [];
  d.categories.forEach((_, r) => {
    if (keptCols.some((c) => isVal(d.series[c]?.values[r] ?? 0))) keptRows.push(r);
  });
  if (keptCols.length === 0 || keptRows.length === 0) {
    return { categories: d.categories, series: d.series };
  }
  return {
    categories: keptRows.map((r) => d.categories[r]),
    series: keptCols.map((c) => ({ ...d.series[c], values: keptRows.map((r) => d.series[c].values[r]) })),
  };
}

// Coerce a raw cell string to a number. Returns null when the value was
// non-empty but unparseable (caller marks it coerced and stores 0).
function parseCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const num = Number(trimmed.replace(/[, $%]/g, ''));
  return Number.isNaN(num) ? null : num;
}

export interface ChartDataGridProps {
  block: FreeformChartBlock;
  onChange: (partial: Partial<FreeformChartBlock>) => void;
  onClose: () => void;
}

export default function ChartDataGrid({ block, onChange, onClose }: ChartDataGridProps) {
  // Local working copy — committed to the block on Done; discarded on Cancel.
  const [data, setData] = useState<ChartData>(() => fromBlock(block));
  // Cells flagged as coerced (non-numeric → 0), keyed "r:c", for the orange ring.
  const [coercedCells, setCoercedCells] = useState<Set<string>>(new Set());
  // Bumped on every structural op (add/remove row/col) and paste. Grid inputs
  // are uncontrolled (defaultValue) so typing stays smooth and caret-stable
  // like the prototype; this epoch is part of their React key, so a reshape
  // remounts them with fresh seed values while per-keystroke edits don't.
  const [gridEpoch, setGridEpoch] = useState(0);
  const bumpEpoch = useCallback(() => setGridEpoch((n) => n + 1), []);
  // The cell (row label, series header, or value) the cursor last entered — the
  // Confluence-style insert/delete controls act relative to it.
  const [activeCell, setActiveCell] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Esc closes (cancel). Lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const activeMeta = useMemo(
    () => CHART_TYPES.find((c) => c.type === data.chartType) ?? CHART_TYPES[0],
    [data.chartType],
  );

  // ── Cell / label / header edits ───────────────────────────────────────────
  const setCellValue = useCallback((r: number, c: number, raw: string) => {
    const parsed = parseCell(raw);
    setCoercedCells((prev) => {
      const next = new Set(prev);
      const key = `${r}:${c}`;
      if (parsed === null) next.add(key);
      else next.delete(key);
      return next;
    });
    if (parsed === null) showToast('That cell wasn’t a number — set to 0.');
    setData((prev) => {
      const series = prev.series.map((s, si) =>
        si === c ? { ...s, values: s.values.map((v, ri) => (ri === r ? (parsed ?? 0) : v)) } : s,
      );
      return { ...prev, series };
    });
  }, [showToast]);

  const setCategory = useCallback((r: number, value: string) => {
    setData((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, ri) => (ri === r ? value : cat)),
    }));
  }, []);

  const setSeriesName = useCallback((c: number, value: string) => {
    setData((prev) => ({
      ...prev,
      series: prev.series.map((s, si) => (si === c ? { ...s, name: value } : s)),
    }));
  }, []);

  // ── Invariant-preserving structural ops ───────────────────────────────────
  // Insert a category row at `at` (clamped); `at >= length` appends.
  const insertRow = useCallback((at: number) => {
    setData((prev) => {
      const n = prev.categories.length;
      const i = Math.max(0, Math.min(at, n));
      const cats = [...prev.categories];
      cats.splice(i, 0, `Category ${n + 1}`);
      return { ...prev, categories: cats, series: prev.series.map((s) => { const v = [...s.values]; v.splice(i, 0, 0); return { ...s, values: v }; }) };
    });
    bumpEpoch();
  }, [bumpEpoch]);
  const addRow = useCallback(() => insertRow(Number.MAX_SAFE_INTEGER), [insertRow]);

  const removeRow = useCallback((r: number) => {
    setData((prev) => {
      if (prev.categories.length <= 1) return prev;
      return {
        ...prev,
        categories: prev.categories.filter((_, ri) => ri !== r),
        series: prev.series.map((s) => ({ ...s, values: s.values.filter((_, ri) => ri !== r) })),
      };
    });
    setCoercedCells(new Set());
    bumpEpoch();
  }, [bumpEpoch]);

  // Insert a series column at `at` (clamped); `at >= length` appends.
  const insertCol = useCallback((at: number) => {
    setData((prev) => {
      const n = prev.series.length;
      const i = Math.max(0, Math.min(at, n));
      const col: ChartSeries = {
        name: `Series ${colName(n)}`,
        values: Array(prev.categories.length).fill(0),
        color: SERIES_DOTS[i % SERIES_DOTS.length],
      };
      const series = [...prev.series];
      series.splice(i, 0, col);
      return { ...prev, series: series.map((s, k) => ({ ...s, color: SERIES_DOTS[k % SERIES_DOTS.length] })) };
    });
    bumpEpoch();
  }, [bumpEpoch]);
  const addCol = useCallback(() => insertCol(Number.MAX_SAFE_INTEGER), [insertCol]);

  const removeCol = useCallback((c: number) => {
    setData((prev) => {
      if (prev.series.length <= 1) return prev;
      return { ...prev, series: prev.series.filter((_, si) => si !== c) };
    });
    setCoercedCells(new Set());
    bumpEpoch();
  }, [bumpEpoch]);

  // ── Paste TSV/CSV (first row = series names, first col = categories) ───────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const txt = e.clipboardData.getData('text/plain');
    if (!txt || !/[\t,\n]/.test(txt)) return; // single cell → normal edit
    e.preventDefault();
    const rows = txt.replace(/\r/g, '').split('\n').filter((l) => l.length);
    if (rows.length < 2) return;
    const delim = rows[0].includes('\t') ? '\t' : ',';
    const table = rows.map((l) => l.split(delim));
    const header = table[0];
    let coerced = false;
    const newCats: string[] = [];
    const newSeries: ChartSeries[] = header.slice(1).map((n) => ({ name: n.trim() || 'Series', values: [] }));
    table.slice(1).forEach((cols) => {
      newCats.push((cols[0] || '').trim());
      newSeries.forEach((s, i) => {
        const parsed = parseCell(cols[i + 1] || '');
        if (parsed === null) coerced = true;
        s.values.push(parsed ?? 0);
      });
    });
    if (newSeries.length && newCats.length) {
      setData((prev) => ({
        ...prev,
        categories: newCats,
        series: newSeries.map((s, i) => ({ ...s, color: SERIES_DOTS[i % SERIES_DOTS.length] })),
      }));
      setCoercedCells(new Set());
      bumpEpoch();
      if (coerced) showToast('Some cells weren’t numbers — set to 0.');
    }
  }, [showToast, bumpEpoch]);

  // ── Keyboard nav (code only, no visible UI) ───────────────────────────────
  // Tab = next cell · Enter = down · Arrows = move (caret-aware).
  const gridRows = useCallback((): HTMLInputElement[][] => {
    if (!bodyRef.current) return [];
    return [...bodyRef.current.querySelectorAll('tr.body-row')].map(
      (tr) => [...tr.querySelectorAll('input')] as HTMLInputElement[],
    );
  }, []);
  const focusAt = useCallback((r: number, c: number) => {
    const g = gridRows();
    if (r < 0 || r >= g.length) return;
    const row = g[r];
    const idx = Math.max(0, Math.min(c, row.length - 1));
    row[idx].focus();
    row[idx].select();
  }, [gridRows]);
  const posOf = useCallback((input: HTMLInputElement): { r: number; c: number } | null => {
    const g = gridRows();
    for (let r = 0; r < g.length; r++) {
      const c = g[r].indexOf(input);
      if (c >= 0) return { r, c };
    }
    return null;
  }, [gridRows]);
  const onCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const p = posOf(target);
    const caretStart = target.selectionStart;
    const caretEnd = target.selectionEnd;
    const len = (target.value || '').length;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (p) focusAt(p.r, e.shiftKey ? p.c - 1 : p.c + 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (p) focusAt(p.r + 1, p.c);
      return;
    }
    if (!p) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt(p.r + 1, p.c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt(p.r - 1, p.c);
    } else if (e.key === 'ArrowRight' && caretStart === caretEnd && caretEnd !== null && caretEnd >= len) {
      e.preventDefault();
      focusAt(p.r, p.c + 1);
    } else if (e.key === 'ArrowLeft' && caretStart === caretEnd && caretStart !== null && caretStart <= 0) {
      e.preventDefault();
      focusAt(p.r, p.c - 1);
    }
  }, [focusAt, posOf]);

  // ── Chart-type select + number format ─────────────────────────────────────
  const selectType = useCallback((type: FreeformChartType) => {
    setData((prev) => ({ ...prev, chartType: type }));
  }, []);

  const onGalleryKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = CHART_TYPES.findIndex((c) => c.type === data.chartType);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(CHART_TYPES.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, idx - 1);
    else return;
    e.preventDefault();
    selectType(CHART_TYPES[next].type);
  }, [data.chartType, selectType]);

  // ── Commit / cancel ───────────────────────────────────────────────────────
  const commit = useCallback(() => {
    // Trim empty rows/columns so only filled data lands in the deck.
    const trimmed = trimEmptyChartData(data);
    onChange({
      chartType: data.chartType,
      numberFormat: data.numberFormat,
      categories: trimmed.categories,
      series: trimmed.series,
      palette: data.palette,
    });
    onClose();
  }, [data, onChange, onClose]);

  // Apply / clear a palette preset (null colors = "Theme" → clear override).
  const selectPalette = useCallback((colors: string[] | null) => {
    setData((prev) => ({ ...prev, palette: colors ? [...colors] : undefined }));
  }, []);

  // Colors the modal previews draw with: the chosen palette, or the generic
  // example colors when on "Theme" (the modal has no live theme context).
  const previewColors = useMemo(
    () => (data.palette && data.palette.length ? data.palette : EX_COLORS),
    [data.palette],
  );

  // Big preview markup (static example for the selected type).
  const bigMarkup = useMemo(
    () => renderExampleMarkup(data.chartType, 560, 240, false, data.numberFormat, previewColors),
    [data.chartType, data.numberFormat, previewColors],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={S.scrim} onMouseDown={onClose}>
      <div
        className="cdg-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Chart data"
        style={S.modal}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={S.head}>
          <div>
            <div style={S.eyebrow}>
              <span style={S.eyebrowDot} /> Chart data
            </div>
            <div style={S.title}>Edit the numbers, pick the shape</div>
          </div>
          <button type="button" style={S.close} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 18, height: 18 }}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* BODY */}
        <div style={S.body}>
          {/* Title + axis labels are edited as text on the slide, not here. */}
          {/* DATA GRID (hero) */}
          <div style={{ flex: 'none' }}>
            <div style={S.dataHeader}>
              <div style={{ ...S.secLabel, marginBottom: 0 }}>Data</div>
              {/* Confluence-style controls — same icons as the freeform table
                  toolbar; act relative to the cell the cursor last entered. */}
              <div style={S.gridTools}>
                <button type="button" className="cdg-icbtn" style={S.icBtn} title="Insert row above" aria-label="Insert row above" onClick={() => insertRow(activeCell.r)}><IcRowAbove size={16} /></button>
                <button type="button" className="cdg-icbtn" style={S.icBtn} title="Insert row below" aria-label="Insert row below" onClick={() => insertRow(activeCell.r + 1)}><IcRowBelow size={16} /></button>
                <span style={S.icDivider} />
                <button type="button" className="cdg-icbtn" style={S.icBtn} title="Insert column left" aria-label="Insert column left" onClick={() => insertCol(activeCell.c)}><IcColLeft size={16} /></button>
                <button type="button" className="cdg-icbtn" style={S.icBtn} title="Insert column right" aria-label="Insert column right" onClick={() => insertCol(activeCell.c + 1)}><IcColRight size={16} /></button>
                <span style={S.icDivider} />
                <button type="button" className="cdg-icbtn" style={S.icBtn} title="Delete the highlighted row" aria-label="Delete row" onClick={() => removeRow(activeCell.r)}><IcRowDelete size={17} /></button>
                <button type="button" className="cdg-icbtn" style={S.icBtn} title="Delete the highlighted column" aria-label="Delete column" onClick={() => removeCol(activeCell.c)}><IcColDelete size={17} /></button>
              </div>
            </div>
            <div style={S.gridWrap} onPaste={handlePaste}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.corner} />
                    {data.series.map((s, c) => (
                      <th key={c} className="cdg-col-head" style={{ ...S.colHead, ...(c === activeCell.c ? S.activeHdr : null) }}>
                        <div style={S.colDotWrap}>
                          <i style={{ ...S.colDot, background: dotFor(data.series, c) }} />
                        </div>
                        <input
                          key={`h-${gridEpoch}-${c}`}
                          defaultValue={s.name}
                          style={S.colHeadInput}
                          aria-label={`Series ${c + 1} name`}
                          onFocus={() => setActiveCell((p) => ({ ...p, c }))}
                          onChange={(e) => setSeriesName(c, e.target.value)}
                          onKeyDown={onCellKeyDown}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody ref={bodyRef}>
                  {data.categories.map((cat, r) => (
                    <tr key={r} className="body-row cdg-body-row">
                      <td style={{ ...S.rowHead, ...(r === activeCell.r ? S.activeHdr : null) }}>
                        <input
                          key={`r-${gridEpoch}-${r}`}
                          defaultValue={cat}
                          style={S.rowHeadInput}
                          aria-label={`Row label ${r + 1}`}
                          onFocus={() => setActiveCell((p) => ({ ...p, r }))}
                          onChange={(e) => setCategory(r, e.target.value)}
                          onKeyDown={onCellKeyDown}
                        />
                      </td>
                      {data.series.map((s, c) => {
                        const coerced = coercedCells.has(`${r}:${c}`);
                        return (
                          <td key={c} style={S.cell}>
                            <input
                              key={`c-${gridEpoch}-${r}-${c}`}
                              defaultValue={s.values[r] === 0 ? '' : s.values[r]}
                              inputMode="numeric"
                              aria-label={`${s.name} ${cat}`}
                              style={{ ...S.cellInput, ...(coerced ? S.cellInputCoerced : null) }}
                              onFocus={() => setActiveCell({ r, c })}
                              onChange={(e) => setCellValue(r, c, e.target.value)}
                              onKeyDown={onCellKeyDown}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CHART STYLE BAND */}
          <div style={S.styleBand}>
            <div style={S.secLabel}>Chart style</div>
            <div style={S.bandLayout}>
              {/* BIG preview (LEFT) */}
              <div style={S.previewCol}>
                <div style={S.previewCard}>
                  <div style={S.pvName}>{activeMeta.name}</div>
                  <div style={S.pvDesc}>{activeMeta.desc}</div>
                  <div style={S.pvChartbox}>
                    <svg
                      viewBox="0 0 560 240"
                      role="img"
                      aria-label="Chart style example"
                      style={{ width: '100%', height: '100%' }}
                      dangerouslySetInnerHTML={{ __html: bigMarkup }}
                    />
                  </div>
                  <div style={S.fmtRow}>
                    <span style={S.fmtLabel}>Number format</span>
                    <div style={S.selectShell}>
                      <select
                        value={data.numberFormat}
                        aria-label="Number format"
                        style={S.select}
                        onChange={(e) => setData((prev) => ({ ...prev, numberFormat: e.target.value as NumberFormat }))}
                      >
                        <option value="number">Number — 1,234</option>
                        <option value="currency">Currency — $1,234</option>
                        <option value="percent">Percent — 12.3%</option>
                        <option value="compact">Compact — 1.2K</option>
                      </select>
                      <svg style={S.chev} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </div>
                  <div style={S.paletteRow}>
                    <span style={S.fmtLabel}>Color palette</span>
                    <div style={S.paletteChips} role="radiogroup" aria-label="Color palette">
                      {PALETTE_PRESETS.map((p) => {
                        const active = palettesEqual(data.palette, p.colors);
                        return (
                          <button
                            key={p.name}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={`${p.name} palette`}
                            title={p.name}
                            className={'cdg-pal' + (active ? ' cdg-pal-active' : '')}
                            style={{ ...S.palChip, ...(active ? S.palChipActive : null) }}
                            onClick={() => selectPalette(p.colors)}
                          >
                            <span style={S.palSwatches}>
                              {p.colors
                                ? p.colors.slice(0, 4).map((c, i) => (
                                    <i key={i} style={{ ...S.palDot, background: c }} />
                                  ))
                                : <i style={{ ...S.palDot, ...S.palDotTheme }} />}
                            </span>
                            <span style={{ ...S.palName, ...(active ? { color: C.violet600 } : null) }}>{p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* GALLERY (RIGHT) — all 9 static examples, no scroll */}
              <div style={S.galleryCol}>
                <div style={S.galleryGrid} role="radiogroup" aria-label="Chart style" onKeyDown={onGalleryKeyDown}>
                  {CHART_TYPES.map((ct) => {
                    const active = ct.type === data.chartType;
                    const miniMarkup = renderExampleMarkup(ct.type, 200, 110, true, data.numberFormat, previewColors);
                    return (
                      <button
                        key={ct.type}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`${ct.name} — ${ct.desc}`}
                        tabIndex={active ? 0 : -1}
                        className={'cdg-gtile' + (active ? ' cdg-gtile-active' : '')}
                        style={{ ...S.gtile, ...(active ? S.gtileActive : null) }}
                        onClick={() => selectType(ct.type)}
                      >
                        <div style={S.gtileMini}>
                          <svg
                            viewBox="0 0 200 110"
                            preserveAspectRatio="xMidYMid meet"
                            style={{ width: '100%', height: '100%' }}
                            dangerouslySetInnerHTML={{ __html: miniMarkup }}
                          />
                        </div>
                        <div style={{ ...S.gname, ...(active ? { color: C.violet600 } : null) }}>
                          {ct.name.split(' ')[0] === 'Grouped' ? 'Column' : ct.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={S.foot}>
          <span style={{ flex: 1 }} />
          <button type="button" style={S.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={S.btnCtaBold} onClick={commit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Done
          </button>
        </div>
      </div>

      {/* Quiet coercion toast (Foxit-orange icon) */}
      <div style={{ ...S.toast, ...(toast ? S.toastShow : null) }} aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16, color: C.foxit, flex: 'none' }}>
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        <span>{toast}</span>
      </div>

      {/* Scoped hover/focus styles that inline styles can't express. */}
      <style>{`
        .cdg-modal{ animation: cdgRise .26s cubic-bezier(.16,1,.3,1); font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        @keyframes cdgRise{ from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:none} }
        .cdg-modal .cdg-col-del{ display:none; }
        .cdg-modal .cdg-col-head:hover .cdg-col-del{ display:inline-flex; }
        .cdg-modal .cdg-col-del:hover{ color:${C.foxit}; border-color:${C.foxit}; }
        .cdg-modal .cdg-row-del{ opacity:0; transition:opacity .14s ease; }
        .cdg-modal .cdg-body-row:hover .cdg-row-del{ opacity:1; }
        .cdg-modal .cdg-row-del:hover{ color:${C.foxit}; border-color:${C.foxit}; }
        .cdg-modal .cdg-col-head input:focus,
        .cdg-modal .cdg-body-row input:focus{ background:${C.violet50}; box-shadow:inset 0 0 0 2px ${C.violet500}; border-radius:6px; }
        .cdg-modal td input:hover{ background:rgba(124,58,237,.035); }
        .cdg-modal .cdg-ghost:hover{ border-color:${C.violet500}; color:${C.violet600}; background:${C.violet50}; }
        .cdg-modal .cdg-icbtn:hover{ background:${C.slate100}; }
        .cdg-modal .cdg-gtile:hover{ border-color:${C.violet300}; box-shadow:0 4px 14px rgba(99,102,241,.12); transform:translateY(-1px); }
        .cdg-modal .cdg-gtile:focus-visible{ outline:none; box-shadow:0 0 0 3px rgba(124,58,237,.3); }
        .cdg-modal .cdg-text:focus{ border-color:${C.violet500}; box-shadow:0 0 0 3px rgba(124,58,237,.12); }
        .cdg-modal .cdg-text::placeholder{ color:${C.slate400}; }
        .cdg-modal .cdg-pal:hover{ border-color:${C.violet300}; }
        .cdg-modal .cdg-pal:focus-visible{ outline:none; box-shadow:0 0 0 3px rgba(124,58,237,.3); }
        .cdg-modal .cdg-gtile-active{ box-shadow:0 0 0 3px rgba(124,58,237,.16), 0 6px 18px rgba(99,102,241,.16); }
        @media (prefers-reduced-motion: reduce){ .cdg-modal{ animation:none; } }
      `}</style>
    </div>,
    document.body,
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,.36)',
    backdropFilter: 'blur(3px) saturate(.95)',
    WebkitBackdropFilter: 'blur(3px) saturate(.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3vh 28px',
    zIndex: 200,
  },
  modal: {
    width: 'min(1180px, 96vw)',
    maxHeight: '92vh',
    background: 'rgba(255,255,255,.96)',
    border: '1px solid rgba(255,255,255,.7)',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow:
      '0 1px 0 rgba(255,255,255,.6) inset, 0 24px 80px rgba(15,23,42,.28), 0 4px 18px rgba(99,102,241,.12)',
    display: 'flex',
    flexDirection: 'column',
    color: C.slate900,
  },
  head: {
    padding: '16px 26px 14px',
    borderBottom: '1px solid rgba(15,23,42,.06)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    background: 'rgba(255,255,255,.5)',
    flex: 'none',
  },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.violet600 },
  eyebrowDot: { width: 7, height: 7, borderRadius: '50%', background: C.violet600, boxShadow: '0 0 0 3px rgba(124,58,237,.16)' },
  title: { fontSize: 20, fontWeight: 700, color: C.slate900, marginTop: 6, letterSpacing: '-.01em' },
  close: {
    flex: 'none',
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 11,
    border: '1px solid rgba(15,23,42,.08)',
    background: '#fff',
    color: C.slate500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, padding: '16px 26px 14px', overflow: 'hidden' },
  secLabel: { fontSize: 12, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.slate400, marginBottom: 9 },

  gridWrap: {
    border: '1px solid rgba(15,23,42,.08)',
    borderRadius: 14,
    overflow: 'hidden',
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(15,23,42,.03)',
  },
  table: { borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed', fontSize: 14 },
  corner: {
    width: 76,
    padding: 0,
    background: 'linear-gradient(180deg,#faf9ff,#f4f1fb)',
    borderBottom: '1px solid rgba(15,23,42,.07)',
    borderRight: '1px solid rgba(15,23,42,.06)',
  },
  colHead: {
    padding: 0,
    position: 'relative',
    background: 'linear-gradient(180deg,#faf9ff,#f4f1fb)',
    borderBottom: '1px solid rgba(15,23,42,.07)',
    borderRight: '1px solid rgba(15,23,42,.05)',
  },
  colDotWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 7, marginBottom: -3 },
  colDot: { width: 8, height: 8, borderRadius: 3 },
  colDel: {
    width: 15,
    height: 15,
    borderRadius: '50%',
    border: `1px solid ${C.slate200}`,
    background: '#fff',
    color: C.slate400,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  colHeadInput: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    textAlign: 'center',
    font: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    color: C.slate700,
    padding: '7px 4px',
    outline: 'none',
    letterSpacing: '-.005em',
  },
  rowHead: {
    padding: 0,
    position: 'relative',
    background: 'linear-gradient(90deg,#faf9ff,#f6f4fc)',
    borderRight: '1px solid rgba(15,23,42,.07)',
    borderTop: '1px solid rgba(15,23,42,.05)',
  },
  rowHeadInput: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    font: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    color: C.slate700,
    padding: '8px 8px 8px 24px',
    outline: 'none',
  },
  rowDel: {
    position: 'absolute',
    left: 3,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 15,
    height: 15,
    borderRadius: '50%',
    border: `1px solid ${C.slate200}`,
    background: '#fff',
    color: C.slate400,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(15,23,42,.1)',
    zIndex: 4,
  },
  cell: { padding: 0, position: 'relative', borderTop: '1px solid rgba(15,23,42,.05)', borderRight: '1px solid rgba(15,23,42,.05)' },
  cellInput: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    textAlign: 'right',
    font: 'inherit',
    fontSize: 14,
    fontVariantNumeric: 'tabular-nums',
    color: C.slate900,
    padding: '8px 12px 8px 6px',
    outline: 'none',
    transition: 'background .12s ease',
  },
  cellInputCoerced: { boxShadow: `inset 0 0 0 2px ${C.foxit}`, background: 'rgba(255,95,0,.06)', borderRadius: 6 },

  dataHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 },
  gridTools: { display: 'flex', alignItems: 'center', gap: 2 },
  icBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent',
    color: C.slate700, cursor: 'pointer',
  } as const,
  icDivider: { width: 1, height: 18, background: C.slate200, margin: '0 4px' } as const,
  // Active row/column HEADER highlight (row label + series name) — like the
  // highlighted headers in Sheets/Excel; the body cells are not tinted.
  activeHdr: { background: 'rgba(124,58,237,0.12)' } as const,
  ghost: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 30,
    padding: '0 11px',
    borderRadius: 12,
    border: `1px dashed ${C.slate300}`,
    background: 'transparent',
    color: C.slate600,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },

  styleBand: { marginTop: 14, borderTop: '1px solid rgba(15,23,42,.06)', paddingTop: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  bandLayout: { display: 'flex', gap: 20, alignItems: 'stretch', flex: 1, minHeight: 0 },
  previewCol: { flex: '0 0 40%', minWidth: 0, display: 'flex', flexDirection: 'column' },
  galleryCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  previewCard: {
    background: '#ffffff',
    border: '1px solid rgba(15,23,42,.07)',
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(15,23,42,.04),0 10px 30px rgba(99,102,241,.08)',
    padding: '14px 16px 12px',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  pvName: { fontSize: 16, fontWeight: 600, color: C.slate800 },
  pvDesc: { fontSize: 13, color: C.slate500, marginTop: 2, lineHeight: 1.4 },
  pvChartbox: { flex: 1, minHeight: 0, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fmtRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 },
  fmtLabel: { fontSize: 13, fontWeight: 500, color: C.slate600, whiteSpace: 'nowrap' },
  labelsRow: { display: 'flex', gap: 12, marginBottom: 14 },
  labelField: { flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  labelFieldSm: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: C.slate500, letterSpacing: '.02em' },
  textField: {
    height: 38,
    border: `1px solid ${C.slate200}`,
    borderRadius: 10,
    padding: '0 12px',
    fontSize: 14,
    color: C.slate800,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
  },
  paletteRow: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 },
  paletteChips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  palChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 30,
    padding: '0 9px 0 7px',
    borderRadius: 10,
    border: `1.5px solid ${C.slate200}`,
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color .15s ease, background .15s ease',
  },
  palChipActive: { borderColor: C.violet500, background: C.violet50 },
  palSwatches: { display: 'inline-flex', borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(15,23,42,.06)' },
  palDot: { width: 7, height: 14, display: 'block' },
  palDotTheme: { width: 14, background: 'linear-gradient(135deg,#94a3b8,#cbd5e1)' },
  palName: { fontSize: 12, fontWeight: 600, color: C.slate600 },
  selectShell: { position: 'relative', flex: 1 },
  select: {
    width: '100%',
    height: 40,
    border: `1px solid ${C.slate200}`,
    borderRadius: 12,
    background: '#fff',
    padding: '0 38px 0 13px',
    font: 'inherit',
    fontSize: 14,
    fontWeight: 500,
    color: C.slate800,
    appearance: 'none',
    cursor: 'pointer',
    outline: 'none',
  },
  chev: { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.slate400 },

  galleryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridAutoRows: '1fr', gap: 9, flex: 1, minHeight: 0 },
  gtile: {
    position: 'relative',
    border: `1.5px solid ${C.slate200}`,
    borderRadius: 12,
    background: '#fff',
    cursor: 'pointer',
    padding: '6px 6px 5px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minHeight: 0,
    transition: 'border-color .15s ease, box-shadow .15s ease, transform .12s ease',
  },
  gtileActive: { borderColor: C.violet500 },
  gtileMini: { flex: 1, minHeight: 0, pointerEvents: 'none', display: 'flex' },
  gname: { fontSize: 12, fontWeight: 600, color: C.slate600, textAlign: 'center', letterSpacing: '-.005em', flex: 'none' },

  foot: {
    padding: '14px 26px',
    borderTop: '1px solid rgba(15,23,42,.06)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(255,255,255,.5)',
    flex: 'none',
  },
  btnGhost: {
    height: 42,
    padding: '0 20px',
    borderRadius: 12,
    border: `1px solid ${C.slate200}`,
    background: '#fff',
    color: C.slate700,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnCtaBold: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    padding: '0 24px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    background: 'linear-gradient(90deg,#E267E4 0%,#9FC7FE 50%,#4198FF 100%)',
    color: '#2e1065',
    fontSize: 14,
    fontWeight: 600,
    boxShadow: '0 4px 16px rgba(65,152,255,.28)',
    fontFamily: 'inherit',
  },

  toast: {
    position: 'fixed',
    bottom: 26,
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: C.slate900,
    color: '#fff',
    fontSize: 13.5,
    fontWeight: 500,
    padding: '12px 16px',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    boxShadow: '0 12px 40px rgba(15,23,42,.4)',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'all .25s cubic-bezier(.16,1,.3,1)',
    zIndex: 250,
  },
  toastShow: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
};
