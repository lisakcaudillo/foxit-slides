/**
 * Layout Vocabulary — the Designer, Stage 1 (data-driven layout pieces).
 *
 * A `LayoutPiece` describes a slide composition as DATA (not a hardcoded
 * layout function). The deterministic converter (`layoutFromPiece` in
 * structuredToFreeform.ts) reads a piece's regions and fits the ACTUAL
 * content into them adaptively — the boxes (grid structure) are locked, the
 * TEXT auto-fits each box so long content never overflows or clips.
 *
 * This is the substrate for the AI Designer (Stage 2): adding a new layout =
 * authoring a new `LayoutPiece` (data), never writing a new function.
 *
 * Geometry is expressed in PERCENT of the 960×540 reference card. The engine
 * computes per-cell rects purely from these numbers, so the same engine
 * renders any grid piece — the only thing that changes is the data here.
 *
 * Scope of THIS file (Stage 1, first slice): the stat-grid / key-metric
 * family only — `stat-grid` (2×2) and `stat-trio` (1×3). More pieces are
 * added by appending to this catalog.
 */

import type { FreeformTextVariant } from '@/types/card-template';

/** A named rectangle on the card, in % of the 960×540 reference surface.
 *  Used for the title band (and any future single-slot region). */
export interface PieceRegion {
  /** Left edge, % of card width. */
  x: number;
  /** Top edge, % of card height. */
  y: number;
  /** Width, % of card width. */
  w: number;
  /** Height, % of card height. */
  h: number;
  /** Which text variant this region's content renders as. */
  variant: FreeformTextVariant;
}

/** Per-cell internal layout for a grid: which content field is the hero
 *  (the big number) and which is the secondary label, and how each renders.
 *  `field` names map to a SmartLayoutCell — `heading` is conventionally the
 *  number, `body` the label (see card-engine generation). The schema names
 *  the field explicitly so the mapping is data, not a hardcoded assumption. */
export interface CellSlot {
  /** Which SmartLayoutCell field supplies this slot's text. */
  field: 'heading' | 'body';
  /** Text variant this slot renders as. */
  variant: FreeformTextVariant;
  /** Text alignment within the cell. */
  align: 'left' | 'center' | 'right';
  /** Order within the cell, top → bottom. */
  order: number;
}

/** A grid specification expressed entirely as data. The engine derives every
 *  cell rect from these numbers — no per-piece geometry code. */
export interface GridSpec {
  /** Number of columns. */
  cols: number;
  /** Number of rows. */
  rows: number;
  /** Outer margin from the card's left/right edges, % of card width. */
  marginX: number;
  /** Horizontal gutter between columns, % of card width. */
  gutterX: number;
  /** Vertical gutter between rows, % of card height. */
  gutterY: number;
  /** The vertical band the grid cluster occupies, as a [top, bottom] pair in
   *  % of card height. The cluster is vertically CENTERED inside this band so
   *  fewer-than-full rows still read as a balanced group. */
  band: { top: number; bottom: number };
  /** The internal layout of each cell (hero number + label). Applied to every
   *  cell uniformly so the grid reads as one parallel set. */
  cell: { slots: CellSlot[] };
}

/** A layout piece = a named composition expressed as data. */
export interface LayoutPiece {
  /** Stable id — referenced by the converter + (later) the AI Designer. */
  id: string;
  /** One-line "what this slide is for" (mirrors RecipeDef.intent). */
  intent: string;
  /** The title slot — a single top-band region. Optional: a piece may be
   *  title-less, in which case the grid uses the full band. */
  title?: PieceRegion;
  /** The grid spec — the locked box structure the engine fills adaptively. */
  grid: GridSpec;
}

// ── The stat / key-metric family ─────────────────────────────────────────────
//
// Geometry per the designer's analysis (all % of 960×540):
//   • Title: x 7→93%, y ~8%, h ~12%, variant `heading`.
//   • Grid band centered in the remaining area (with a title: y ~26→90%); the
//     cell cluster centers as a group inside that band.
//   • Cell internal: NUMBER is the hero (`metric` variant), LABEL beneath it
//     (`subheading`, smaller), both centered. Uniform cell rects.

/** Shared cell internals: hero number on top, label beneath — both centered.
 *  Authored once, reused by every piece in this family. */
const METRIC_CELL: GridSpec['cell'] = {
  slots: [
    { field: 'heading', variant: 'metric', align: 'center', order: 0 },
    { field: 'body', variant: 'subheading', align: 'center', order: 1 },
  ],
};

/** Shared title band for the family. x 7→93% (w 86), y 8%, h 12%. */
const STAT_TITLE: PieceRegion = {
  x: 7,
  y: 8,
  w: 86,
  h: 12,
  variant: 'heading',
};

/**
 * stat-grid — 2×2 metric grid.
 *   margin 7%, gutter-x 4% (→ cell w = (86 − 4)/2 = 41%, cols at x=7%/52%),
 *   gutter-y 5% (→ over the band the rows split evenly), band y 26→90% so the
 *   cluster sits centered below the title.
 */
export const STAT_GRID_PIECE: LayoutPiece = {
  id: 'stat-grid',
  intent:
    'stat-grid — four parallel numbers in a 2×2. Each cell leads with its number; the label sits beneath it.',
  title: STAT_TITLE,
  grid: {
    cols: 2,
    rows: 2,
    marginX: 7,
    gutterX: 4,
    gutterY: 5,
    band: { top: 26, bottom: 90 },
    cell: METRIC_CELL,
  },
};

/**
 * stat-trio — 1×3 row of big numbers.
 *   3 equal columns across 86% width (margin 7% each side, gutter-x 4% → cell
 *   w = (86 − 2×4)/3 = 26%), single row centered in the band.
 */
export const STAT_TRIO_PIECE: LayoutPiece = {
  id: 'stat-trio',
  intent:
    'stat-trio — three big numbers shown side by side. Each cell leads with its number; the label sits beneath it.',
  title: STAT_TITLE,
  grid: {
    cols: 3,
    rows: 1,
    marginX: 7,
    gutterX: 4,
    gutterY: 5,
    band: { top: 26, bottom: 90 },
    cell: METRIC_CELL,
  },
};

/** Catalog — id → piece. Adding a grid piece here (data) makes it available
 *  to the converter with no engine change. */
export const LAYOUT_PIECES: Record<string, LayoutPiece> = {
  [STAT_GRID_PIECE.id]: STAT_GRID_PIECE,
  [STAT_TRIO_PIECE.id]: STAT_TRIO_PIECE,
};
