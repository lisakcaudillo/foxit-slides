/**
 * Decorative skin elements per structure layout — the non-fillable shapes that
 * give each layout its visual identity (eyebrow pills, hairline rules, cards,
 * accent bars, step nodes, chart bars). Extracted from the Figma frames;
 * geometry is in px on the 960×540 frame.
 *
 * Colors are SKIN TOKENS ('ink' | 'accent' | 'sub' | 'ground'), not literals, so
 * one geometry serves every skin (the builder resolves the token to the skin's
 * color). Semantic colors that are the same across skins (e.g. the green
 * process/timeline node, the green delta badge) use a literal.
 *
 * Keyed layout → skin (or 'shared' for skin-agnostic geometry, used by all
 * interiors 02-12 since their geometry is identical across skins). Cover (01) is
 * per-theme geometry → keyed per skin.
 *
 * A decoration with `hugRole` is content-sized in Figma (a pill around a label);
 * its geometry is computed to hug that text slot's placeholder.
 */

export type FillToken = 'ink' | 'accent' | 'sub' | 'ground' | 'surface';

export interface Decoration {
  role: string;
  shape: 'rectangle' | 'circle';
  /** px on 960×540. Omit x/w when `hugRole` is set (computed from the label). */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  radius?: number;
  /** Optional CSS box-shadow (e.g. the soft card shadow from the Figma frames). */
  boxShadow?: string;
  /** Skin-token fill (default). */
  fillToken?: FillToken;
  /** Literal fill (semantic colors like the green process node, skin-independent). Wins over fillToken. */
  fillLiteral?: string;
  fillOpacity?: number;
  /** Skin-token stroke (adapts per skin — e.g. card borders use 'ink'). */
  strokeToken?: FillToken;
  /** Literal stroke (semantic colors like the green delta badge, skin-independent). Wins over strokeToken. */
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  /** When set, the shape hugs this text slot's placeholder (role[:group]). */
  hugRole?: string;
  hugGroup?: string;
  padX?: number;
  padY?: number;
}

const SEMANTIC_GREEN = '#3c7e6b';

// ── Concise builders ─────────────────────────────────────────────────────────
const PILL: Decoration = {
  role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label',
  padX: 13, padY: 6, radius: 20, fillToken: 'ink', fillOpacity: 0.07,
};
const card = (x: number, y: number, w: number, h: number): Decoration => ({
  // `surface` is a per-skin contrast STEP from the ground (lighter on dark
  // themes, darker on light themes) so the card separates from the slide
  // background instead of blending in (the old ground-on-ground + faint stroke
  // was invisible on Mono Dark). Skin text tones already contrast the ground,
  // so they stay legible on the same-family surface.
  role: 'card', shape: 'rectangle', x, y, w, h, radius: 2,
  fillToken: 'surface', fillOpacity: 1, strokeToken: 'ink', strokeOpacity: 0.14, strokeWeight: 1,
  boxShadow: '0px 3px 10px 0px rgba(11,31,58,0.07)',
});
const accentBar = (x: number, y: number, w: number, h: number): Decoration => ({
  role: 'accent-bar', shape: 'rectangle', x, y, w, h, fillToken: 'ink', fillOpacity: 1,
});
const rule = (x: number, y: number, w: number, h: number, o: number): Decoration => ({
  role: 'divider', shape: 'rectangle', x, y, w, h, fillToken: 'ink', fillOpacity: o,
});

export const DECORATIONS: Record<string, Record<string, Decoration[]>> = {
  // Cover is per-theme geometry → per skin (chroma-fold / quill added or flagged).
  '01-cover': {
    // Per-theme geometry. NOTE: Chroma's violet-glass image + fade and Quill's
    // dark photo + navy gradient panel are NOT rendered (covers fall back to the
    // skin's gradient/dark ground) — flagged. The accent-tinted eyebrow pills +
    // Quill's gold rule ARE rendered.
    'mono-light': [
      PILL,
      rule(72, 132, 816, 2, 1),
      rule(72, 432, 816, 2, 0.9),
    ],
    'chroma-fold': [
      { role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label', padX: 13, padY: 6, radius: 20, fillToken: 'accent', fillOpacity: 0.12 },
    ],
    'quill': [
      { role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label', padX: 13, padY: 6, radius: 20, fillToken: 'accent', fillOpacity: 0.16 },
      { role: 'divider', shape: 'rectangle', x: 824, y: 318, w: 64, h: 2, fillToken: 'accent', fillOpacity: 0.9 },
    ],
    'blue': [
      { role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label', padX: 13, padY: 6, radius: 20, fillToken: 'accent', fillOpacity: 0.1 },
      rule(85, 132, 760, 2, 1),
      rule(85, 432, 760, 2, 0.85),
    ],
    // Counsel cover (node 194:2): short rust accent rule under the offset title.
    // No eyebrow pill — the big accent index number is the cover's mark.
    'counsel': [
      { role: 'divider', shape: 'rectangle', x: 278, y: 341, w: 64, h: 2, fillToken: 'accent', fillOpacity: 0.9 },
    ],
    // Mono Dark cover (node 232:224): eyebrow pill (ink 0.14) top-left + a short
    // ink rule above the big light title (lower-left). Meta is top-right (slots).
    'mono-dark': [
      { role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label', padX: 13, padY: 6, radius: 20, fillToken: 'ink', fillOpacity: 0.14 },
      rule(74, 288, 64, 2, 0.9),
    ],
    // Schoolbook cover (node 233:224): double hairline rule near the top + a
    // short MAROON rule under the offset title (maroon ≠ the rust link accent).
    'schoolbook': [
      rule(72, 132, 816, 1, 0.22),
      rule(72, 138, 816, 1, 0.22),
      { role: 'divider', shape: 'rectangle', x: 278, y: 296, w: 64, h: 2, fillLiteral: '#8a3344', fillOpacity: 0.9 },
    ],
    // Ledger cover (node 196:446): gold eyebrow pill + gold rule under the left
    // title, and a faint vertical column rule splitting the left title from the
    // right meta column.
    'ledger': [
      { role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label', padX: 13, padY: 6, radius: 20, fillToken: 'accent', fillOpacity: 0.14 },
      { role: 'divider', shape: 'rectangle', x: 74, y: 355, w: 64, h: 2, fillToken: 'accent', fillOpacity: 0.9 },
      { role: 'divider', shape: 'rectangle', x: 618, y: 80, w: 2, h: 392, fillLiteral: '#000000', fillOpacity: 0.14 },
    ],
    // Vellum cover (node 196:668): terracotta eyebrow pill + terracotta rule
    // under the left title; author/date stacked beneath. Gradient parchment ground.
    'vellum': [
      { role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label', padX: 13, padY: 6, radius: 20, fillToken: 'accent', fillOpacity: 0.14 },
      { role: 'divider', shape: 'rectangle', x: 74, y: 371, w: 64, h: 2, fillToken: 'accent', fillOpacity: 0.9 },
    ],
  },

  '02-stat': {
    // No delta/change-indicator: it wasn't in the Figma frame (a hand-authored
    // slot that read as misplaced), so the stat is value + label only and the
    // old hero delta-pill is gone. PILL = eyebrow; rule =
    // the row divider on the 4-up grid.
    shared: [
      PILL,
      rule(72, 400, 816, 1, 0.14),
    ],
  },

  // Comparison is NEUTRAL by default — two equal columns. it deliberately does NOT
  // paint the right column as a "recommended" card or stamp a RECOMMENDED badge:
  // most comparisons (esp. source-derived "X vs Y") have no winner, so crowning
  // the right side is wrong. The
  // RECOMMENDED text slot is likewise suppressed in the builder. (A future
  // evaluative-comparison signal could re-introduce a one-sided highlight.)
  // Criterion label-chips are generated PER-INSTANCE in the builder.
  '03-comparison': {
    shared: [
      PILL,
      // (Vertical centre divider removed 2026-06-17 — the criterion labels sit
      // on it, and the masking chip is gone; the columns read clearly from the
      // row rules + the recommended card without a line through the labels.)
      rule(100, 220, 760, 1, 0.14),
      rule(100, 286, 760, 1, 0.14),
      rule(100, 352, 760, 1, 0.14),
      rule(100, 418, 760, 1, 0.14),
    ],
  },

  '04-process': {
    shared: [
      PILL,
      rule(192, 288, 576, 2, 0.14),
      { role: 'node', shape: 'circle', x: 168, y: 264, w: 48, h: 48, fillLiteral: SEMANTIC_GREEN, fillOpacity: 0.1, strokeToken: 'ink', strokeWeight: 1.5 },
      { role: 'node', shape: 'circle', x: 360, y: 264, w: 48, h: 48, fillLiteral: SEMANTIC_GREEN, fillOpacity: 0.1, strokeToken: 'ink', strokeWeight: 1.5 },
      { role: 'node', shape: 'circle', x: 552, y: 264, w: 48, h: 48, fillLiteral: SEMANTIC_GREEN, fillOpacity: 0.1, strokeToken: 'ink', strokeWeight: 1.5 },
      { role: 'node', shape: 'circle', x: 744, y: 264, w: 48, h: 48, fillLiteral: SEMANTIC_GREEN, fillOpacity: 0.1, strokeToken: 'ink', strokeWeight: 1.5 },
    ],
  },

  '05-content': {
    shared: [
      card(48, 246, 864, 86), accentBar(48, 246, 5, 86),
      card(48, 346, 864, 86), accentBar(48, 346, 5, 86),
      card(48, 446, 864, 86), accentBar(48, 446, 5, 86),
    ],
    // Ledgerline: clean open treatment — no surface cards or heavy ink bars
    // (stacked cards read as a wall of dividers). A slim gold tick per item
    // gives rhythm + the accent without the box weight.
    ledgerline: [
      PILL,
      { role: 'accent-bar', shape: 'rectangle', x: 72, y: 346, w: 3, h: 34, fillToken: 'accent', fillOpacity: 1 },
      { role: 'accent-bar', shape: 'rectangle', x: 72, y: 404, w: 3, h: 34, fillToken: 'accent', fillOpacity: 1 },
      { role: 'accent-bar', shape: 'rectangle', x: 72, y: 462, w: 3, h: 34, fillToken: 'accent', fillOpacity: 1 },
    ],
  },

  '06-quote': {
    shared: [rule(170, 412, 40, 2, 0.9)],
  },

  '07-timeline': {
    shared: [
      PILL,
      rule(130, 300, 700, 2, 0.14),
      { role: 'node', shape: 'circle', x: 186, y: 294, w: 13, h: 13, fillLiteral: SEMANTIC_GREEN, fillOpacity: 1, strokeToken: 'ink', strokeWeight: 3 },
      { role: 'node', shape: 'circle', x: 378, y: 294, w: 13, h: 13, fillLiteral: SEMANTIC_GREEN, fillOpacity: 1, strokeToken: 'ink', strokeWeight: 3 },
      { role: 'node', shape: 'circle', x: 570, y: 294, w: 13, h: 13, fillLiteral: SEMANTIC_GREEN, fillOpacity: 1, strokeToken: 'ink', strokeWeight: 3 },
      { role: 'node', shape: 'circle', x: 762, y: 294, w: 13, h: 13, fillLiteral: SEMANTIC_GREEN, fillOpacity: 1, strokeToken: 'ink', strokeWeight: 3 },
    ],
  },

  '08-divider': {
    shared: [
      // (Figma has a 56px hairline above the eyebrow at y200; removed
      // 2026-06-17 — it read disconnected floating above the pill.)
      PILL,
      { role: 'title-accent', shape: 'rectangle', x: 74, y: 438, w: 150, h: 6, radius: 3, fillToken: 'ink', fillOpacity: 1 },
    ],
  },

  '09-closing': {
    shared: [
      PILL,
      { role: 'cta', shape: 'rectangle', x: 72, y: 404, w: 210, h: 46, radius: 14, fillToken: 'ground', fillOpacity: 0.66, strokeToken: 'accent', strokeWeight: 1 },
    ],
  },

  '10-agenda': {
    shared: [
      PILL,
      card(72, 164, 816, 72), accentBar(72, 164, 5, 72),
      card(72, 248, 816, 72), accentBar(72, 248, 5, 72),
      card(72, 332, 816, 72), accentBar(72, 332, 5, 72),
      card(72, 416, 816, 72), accentBar(72, 416, 5, 72),
    ],
    // Ledgerline: clean open treatment — drop the cards + bars; the big index
    // numbers carry the structure, separated by whitespace and slim hairlines.
    ledgerline: [
      PILL,
      rule(72, 240, 816, 1, 0.1),
      rule(72, 324, 816, 1, 0.1),
      rule(72, 408, 816, 1, 0.1),
    ],
  },

  '11-infographic': {
    shared: [
      PILL,
      card(82, 176, 236, 222),
      card(362, 176, 236, 222),
      card(642, 176, 236, 222),
      { role: 'icon-badge', shape: 'circle', x: 158, y: 200, w: 84, h: 84, fillToken: 'ink', fillOpacity: 0.07 },
      { role: 'icon-badge', shape: 'circle', x: 438, y: 200, w: 84, h: 84, fillToken: 'ink', fillOpacity: 0.07 },
      { role: 'icon-badge', shape: 'circle', x: 718, y: 200, w: 84, h: 84, fillToken: 'ink', fillOpacity: 0.07 },
    ],
  },

  '12-diagram': {
    shared: [
      PILL,
      { role: 'plot', shape: 'rectangle', x: 84, y: 168, w: 792, h: 300, radius: 14, fillToken: 'ink', fillOpacity: 0.04 },
      rule(96, 202, 768, 1, 0.08),
      rule(96, 285, 768, 1, 0.08),
      rule(96, 367, 768, 1, 0.08),
      { role: 'bar', shape: 'rectangle', x: 120, y: 377, w: 92, h: 75, fillToken: 'ink', fillOpacity: 0.82 },
      { role: 'bar', shape: 'rectangle', x: 270, y: 344, w: 92, h: 108, fillToken: 'ink', fillOpacity: 0.82 },
      { role: 'bar', shape: 'rectangle', x: 420, y: 323, w: 92, h: 129, fillToken: 'ink', fillOpacity: 0.82 },
      { role: 'bar', shape: 'rectangle', x: 570, y: 269, w: 92, h: 183, fillToken: 'ink', fillOpacity: 0.82 },
      { role: 'bar', shape: 'rectangle', x: 720, y: 210, w: 92, h: 242, fillToken: 'ink', fillOpacity: 0.82 },
      rule(96, 452, 768, 2, 0.14),
    ],
  },
};

// ── Volt skin decorations ────────────────────────────────────────────────────
// Volt ships its OWN reworked per-layout geometry (perTemplate.volt in the
// manifest), so it needs its own structural shapes too. Dark skin: translucent
// white cards, magenta (accent) bars + chips, teal nodes. Merged into
// DECORATIONS below so the builder's `DECORATIONS[layout].volt` lookup resolves.
// Black-glass content panel (Figma Volt design,. The previous
// treatment was #ffffff @ 6% — a near-invisible white frost that read as
// "missing" on the dark glow ground. Volt's panels are DARK glass: a deep
// translucent fill that sits a touch darker than the slide ground, a faint
// light rim for the glass edge, and a soft drop shadow for depth — so each
// panel reads as a defined black-glass surface against the glow.
const voltCard = (x: number, y: number, w: number, h: number): Decoration => ({
  role: 'card', shape: 'rectangle', x, y, w, h, radius: 10,
  fillLiteral: '#0A0E1A', fillOpacity: 0.5,
  strokeColor: 'rgba(255,255,255,0.09)', strokeWeight: 1,
  boxShadow: '0 6px 22px rgba(0,0,0,0.32)',
});
const voltBar = (x: number, y: number, w: number, h: number): Decoration => ({
  role: 'bar', shape: 'rectangle', x, y, w, h, radius: 3, fillLiteral: '#b99ee5', fillOpacity: 1,
});
const voltAccent = (x: number, y: number, w: number, h: number): Decoration => ({
  role: 'accent-bar', shape: 'rectangle', x, y, w, h, fillToken: 'accent', fillOpacity: 1,
});
const voltRule = (x: number, y: number, w: number, h: number, o = 0.12): Decoration => ({
  role: 'divider', shape: 'rectangle', x, y, w, h, fillLiteral: '#ffffff', fillOpacity: o,
});
const voltNode = (x: number, y: number, w: number, h: number, big: boolean): Decoration => ({
  role: 'node', shape: 'circle', x, y, w, h, fillLiteral: SEMANTIC_GREEN, fillOpacity: big ? 1 : 0.1,
  strokeToken: 'ink', strokeWeight: big ? 3 : 1.5,
});
const VOLT_PILL: Decoration = {
  role: 'eyebrow-pill', shape: 'rectangle', hugRole: 'eyebrow-label',
  padX: 13, padY: 6, radius: 8, fillToken: 'accent', fillOpacity: 0.16,
};

const VOLT_DECO: Record<string, Decoration[]> = {
  '01-cover': [{ role: 'panel', shape: 'rectangle', x: 0, y: 399, w: 960, h: 141, fillLiteral: '#0d1424', fillOpacity: 0.5 },
    { role: 'divider', shape: 'rectangle', x: 72, y: 400, w: 816, h: 1, fillLiteral: '#ffffff', fillOpacity: 0.14 },
    { role: 'accent-bar', shape: 'rectangle', x: 72, y: 397, w: 64, h: 3, fillToken: 'accent', fillOpacity: 1 }],
  '02-stat': [VOLT_PILL, voltRule(72, 304, 816, 1)],
  '03-comparison': [
    VOLT_PILL, voltCard(269, 150, 619, 318),
    { role: 'divider', shape: 'rectangle', x: 590, y: 150, w: 1, h: 318, fillToken: 'accent', fillOpacity: 0.9 },
    voltRule(72, 210, 816, 1), voltRule(72, 274, 816, 1), voltRule(72, 338, 816, 1), voltRule(72, 402, 816, 1),
  ],
  '04-process': [
    VOLT_PILL, voltRule(109, 250, 612, 2),
    voltNode(85, 226, 48, 48, false), voltNode(289, 226, 48, 48, false), voltNode(493, 226, 48, 48, false), voltNode(697, 226, 48, 48, false),
  ],
  '05-content': [
    VOLT_PILL,
    voltCard(512, 152, 376, 66), voltAccent(512, 152, 5, 66),
    voltCard(512, 236, 376, 66), voltAccent(512, 236, 5, 66),
    voltCard(512, 320, 376, 66), voltAccent(512, 320, 5, 66),
  ],
  '07-timeline': [
    VOLT_PILL, voltRule(120, 172, 2, 278),
    voltNode(114, 178, 13, 13, true), voltNode(114, 256, 13, 13, true), voltNode(114, 334, 13, 13, true), voltNode(114, 412, 13, 13, true),
  ],
  '08-divider': [
    VOLT_PILL, voltRule(72, 120, 816, 1),
    { role: 'title-accent', shape: 'rectangle', x: 72, y: 336, w: 150, h: 6, radius: 3, fillToken: 'accent', fillOpacity: 1 },
  ],
  '09-closing': [VOLT_PILL, voltRule(72, 430, 816, 1, 0.18)],
  '10-agenda': [
    VOLT_PILL,
    voltCard(72, 150, 398, 148), voltAccent(72, 150, 5, 148),
    voltCard(490, 150, 398, 148), voltAccent(490, 150, 5, 148),
    voltCard(72, 308, 398, 148), voltAccent(72, 308, 5, 148),
    voltCard(490, 308, 398, 148), voltAccent(490, 308, 5, 148),
  ],
  '11-infographic': [
    VOLT_PILL, voltCard(72, 150, 410, 322), voltCard(506, 150, 382, 150), voltCard(506, 318, 382, 150),
    { role: 'icon-badge', shape: 'circle', x: 235, y: 194, w: 84, h: 84, fillToken: 'accent', fillOpacity: 0.18 },
    { role: 'icon-badge', shape: 'circle', x: 530, y: 183, w: 84, h: 84, fillToken: 'accent', fillOpacity: 0.18 },
    { role: 'icon-badge', shape: 'circle', x: 530, y: 351, w: 84, h: 84, fillToken: 'accent', fillOpacity: 0.18 },
  ],
  '12-diagram': [
    VOLT_PILL,
    { role: 'plot', shape: 'rectangle', x: 72, y: 150, w: 442, h: 300, radius: 8, fillLiteral: '#ffffff', fillOpacity: 0.04 },
    { role: 'divider', shape: 'rectangle', x: 180, y: 164, w: 2, h: 272, fillLiteral: '#ffffff', fillOpacity: 0.12 },
    voltRule(270, 164, 1, 272, 0.08), voltRule(351, 164, 1, 272, 0.08), voltRule(431, 164, 1, 272, 0.08),
    voltBar(182, 178, 86, 26), voltBar(182, 230, 125, 26), voltBar(182, 282, 149, 26), voltBar(182, 334, 211, 26), voltBar(182, 386, 278, 26),
    { role: 'divider', shape: 'rectangle', x: 560, y: 150, w: 1, h: 300, fillLiteral: '#ffffff', fillOpacity: 0.12 },
  ],
};

// Volt was rebuilt on the shared combo layouts (2026-07-13) — it no longer uses its
// bespoke per-layout decorations. VOLT_DECO is retained below but NOT registered, so
// the builder's `DECORATIONS[layout].volt` lookup falls back to `.shared` (combo).
void VOLT_DECO;
