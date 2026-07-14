/**
 * cover-layout-pieces.ts — WI-1 (layout-as-data), first slice.
 *
 * The THREE approved Quartz/Editorial cover layouts, captured as DATA. This file
 * IS the reproducibility artifact: the exact {x,y,w,h} geometry of every cover
 * slot (transcribed verbatim from the Design-Table-approved designs A2 / C2 / D,
 * 2026-06-13) plus a named decorative treatment. At creation time the generator
 * tags a cover with one of these ids (`slideDesign.coverLayoutId`); at render the
 * saved geometry is REPLAYED exactly, never recomputed — that is the WI-1
 * "capture the resolved numbers; replay them" principle.
 *
 * KEYING (per the WI-1 brief): cover layouts are TYPE-LEVEL shared geometry
 * (keyed by slide-type `cover` + a layout-id), re-skinned per template/archetype.
 * The geometry here is theme-agnostic; Quartz/Editorial supplies the palette +
 * serif/hairline paint at render. The captured per-slot `color` hexes below are
 * the APPROVED Quartz skin (so Quartz renders pixel-faithfully); a second theme
 * re-skins by overriding them — the geometry is untouched.
 *
 * Geometry is in PERCENT of the 960×540 reference card, same convention as
 * `layout-vocabulary.ts` (the stat-grid family) and the freeform model.
 *
 * NOTE on type scale: the slot `role` drives typography through the existing
 * lock-the-box `textBlock` (slide-typography.ts) — the box is fixed and real
 * titles shrink to fit. The approved mocks use a larger display size than the
 * role scale caps at; the GEOMETRY (the box) and the DECORATION are exact, the
 * type is role-sized inside the locked box.
 */

import type { Role } from './slide-typography';

/** The named decorative treatments — the verbatim CSS/SVG lives in the
 *  CoverDecoration renderer, keyed by this id; here it is data only. */
export type CoverTreatment = 'glass-ribbon' | 'warm-waves' | 'diagonal-split';

export type CoverSlotName = 'eyebrow' | 'title' | 'subtitle' | 'author' | 'date';

/** A named cover text slot — a fixed box (% of 960×540) + the semantic role that
 *  drives its typography, the captured approved color, alignment, and casing. */
export interface CoverSlotRegion {
  /** Left edge, % of card width. */
  x: number;
  /** Top edge, % of card height. */
  y: number;
  /** Width, % of card width. */
  w: number;
  /** Height, % of card height — LOCKED (text shrinks to fit, box never grows). */
  h: number;
  /** Semantic role → drives the lock-the-box type scale (slide-typography). */
  role: Role;
  /** Captured approved color (the Quartz skin). A re-skin overrides per theme. */
  color: string;
  /** Text alignment within the box. Default 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Render the content uppercased (eyebrow / date in the approved designs). */
  uppercase?: boolean;
  /** Italic (D's serif subtitle). */
  italic?: boolean;
}

/** The hairline divider — a thin shape rule, captured geometry + color. */
export interface CoverDividerRegion {
  x: number;
  y: number;
  w: number;
  /** Height, % of card height (a 1px rule ≈ 0.2%). */
  h: number;
  color: string;
  /** 0–1 fill opacity (D's rule is ink @ 0.22). */
  opacity?: number;
}

/**
 * INTERNAL pattern-asset registry — treatment → the transparent-background PNG
 * decal that the SVG decoration layers OVER its vector base. Single source of
 * truth: the SAME physical file is also registered in the user content library
 * (public/library/metadata.json, `[pattern]` family) — one asset, two
 * registrations (never two copies that can drift). `warm-waves` has no decal
 * (fully vector). `libraryId` ties the internal asset to its library entry.
 */
export const PATTERN_ASSETS: Partial<Record<CoverTreatment, { filename: string; path: string; libraryId: string }>> = {
  'glass-ribbon': {
    filename: 'pattern-glass-ribbon.png',
    path: '/library/images/pattern-glass-ribbon.png',
    libraryId: 'pattern-glass-ribbon',
  },
  'diagonal-split': {
    filename: 'pattern-diagonal-split.png',
    path: '/library/images/pattern-diagonal-split.png',
    libraryId: 'pattern-diagonal-split',
  },
};

/** A cover layout = named composition expressed as data: the decorative
 *  treatment, the text slots, and the divider — all replayed verbatim. */
export interface CoverLayoutPiece {
  /** Stable id — the value stamped on `slideDesign.coverLayoutId`. */
  id: string;
  /** One-line "what this cover is for". */
  intent: string;
  /** Which decorative treatment fills the decoration region (verbatim CSS). */
  treatment: CoverTreatment;
  /** The decoration region (full-card for these three). */
  decoration: { x: number; y: number; w: number; h: number };
  /** The named text slots. `eyebrow`/`subtitle`/`author`/`date` are optional —
   *  emitted only when the card supplies content; `title` is always present. */
  slots: { title: CoverSlotRegion } & Partial<Record<Exclude<CoverSlotName, 'title'>, CoverSlotRegion>>;
  /** The hairline divider rule, if the design carries one. */
  divider?: CoverDividerRegion;
}

// ── The three approved Quartz/Editorial covers (Design Table, 2026-06-13) ─────
// Geometry transcribed EXACTLY from the approved region tables. Do not "tidy"
// these numbers — they are the captured design.

/**
 * cover-glass-ribbon (A2) — title in the clean LEFT zone, a flowing translucent
 * glass ribbon (dawn peach→lavender→blue) kept to the right third. Meta footer
 * bottom-left. The GOLD "premium accessory" form.
 */
export const COVER_GLASS_RIBBON: CoverLayoutPiece = {
  id: 'cover-glass-ribbon',
  intent: 'cover-glass-ribbon — clean left title zone, translucent glass ribbon in the right third (premium accessory).',
  treatment: 'glass-ribbon',
  decoration: { x: 0, y: 0, w: 100, h: 100 },
  slots: {
    eyebrow: { x: 6.7, y: 30.5, w: 49, h: 4, role: 'eyebrow', color: '#1F4FAA', uppercase: true },
    title: { x: 6.7, y: 36, w: 49, h: 24, role: 'title', color: '#0B1F3A' },
    subtitle: { x: 6.7, y: 66, w: 44, h: 6, role: 'subtitle', color: '#324867' },
    author: { x: 6.7, y: 88.5, w: 18, h: 3, role: 'body', color: '#0B1F3A' },
    date: { x: 25, y: 88.5, w: 20, h: 3, role: 'body', color: '#5a6b85', uppercase: false },
  },
  divider: { x: 6.7, y: 62, w: 6.7, h: 0.2, color: '#1F4FAA' },
};

/**
 * cover-warm-waves (C2) — full-bleed soft layered dawn waves up top, a white
 * curved divide carving the clean lower title zone; solid near-navy serif hero.
 * The loved "the curve is what reads designed" form.
 */
export const COVER_WARM_WAVES: CoverLayoutPiece = {
  id: 'cover-warm-waves',
  intent: 'cover-warm-waves — full-bleed dawn waves + curved divide carving a clean lower title zone.',
  treatment: 'warm-waves',
  decoration: { x: 0, y: 0, w: 100, h: 100 },
  slots: {
    eyebrow: { x: 6.25, y: 55.6, w: 30, h: 4, role: 'eyebrow', color: '#a25d6b', uppercase: true },
    title: { x: 6.04, y: 59.3, w: 87.7, h: 22, role: 'title', color: '#0B1F3A' },
    subtitle: { x: 6.25, y: 80.7, w: 62.5, h: 6, role: 'subtitle', color: '#41506e' },
    author: { x: 6.25, y: 91, w: 30, h: 3.5, role: 'body', color: '#0B1F3A' },
    date: { x: 74, y: 91, w: 20, h: 3.5, role: 'body', color: '#7c7280', align: 'right', uppercase: true },
  },
  divider: { x: 6.25, y: 89.8, w: 20.83, h: 0.2, color: '#cdbac0' },
};

/**
 * cover-diagonal-split (D) — a diagonal seam from a dawn art zone (lower-left)
 * into a clean upper-right title zone; italic serif subtitle, footer meta.
 */
export const COVER_DIAGONAL_SPLIT: CoverLayoutPiece = {
  id: 'cover-diagonal-split',
  intent: 'cover-diagonal-split — diagonal seam, dawn art zone lower-left, clean upper-right title zone.',
  treatment: 'diagonal-split',
  decoration: { x: 0, y: 0, w: 100, h: 100 },
  slots: {
    eyebrow: { x: 46, y: 8, w: 48, h: 5, role: 'eyebrow', color: '#1F4FAA', uppercase: true },
    title: { x: 46, y: 16, w: 48, h: 42, role: 'title', color: '#0B1F3A' },
    subtitle: { x: 46, y: 56, w: 45, h: 10, role: 'subtitle', color: '#445268', italic: true },
    author: { x: 46, y: 84, w: 24, h: 4, role: 'body', color: '#0B1F3A' },
    date: { x: 78, y: 84, w: 16, h: 4, role: 'body', color: '#6B7686', align: 'right', uppercase: true },
  },
  divider: { x: 46, y: 82, w: 48, h: 0.2, color: '#0B1F3A', opacity: 0.22 },
};

/** Catalog — id → cover piece. The guard in composeGeneratedCover reads this. */
export const COVER_LAYOUT_PIECES: Record<string, CoverLayoutPiece> = {
  [COVER_GLASS_RIBBON.id]: COVER_GLASS_RIBBON,
  [COVER_WARM_WAVES.id]: COVER_WARM_WAVES,
  [COVER_DIAGONAL_SPLIT.id]: COVER_DIAGONAL_SPLIT,
};

/** Stable rotation order — the alternatives the generator rotates through. */
export const COVER_LAYOUT_ROTATION: readonly string[] = [
  COVER_WARM_WAVES.id, // C2 — the lead pick
  COVER_GLASS_RIBBON.id, // A2
  COVER_DIAGONAL_SPLIT.id, // D
];
