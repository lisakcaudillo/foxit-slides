/**
 * text-fit.ts — closed-loop fit. Measures real text dimensions in the ACTUAL
 * font (opentype.js against the bundled TTFs — the same families the .pptx
 * names) and fits each slot to its manifest box with the contract:
 *
 *     shrink font → (to a per-role LEGIBLE floor) → shorten content → never grow the box.
 *
 * Measurement is glyph-advance summation (no kerning/ligatures) — validated to
 * within ~1% of the browser's render and slightly CONSERVATIVE, so a slot that
 * measures as fitting always fits on screen and in the export. Replaces the old
 * `0.52`-char-width guess.
 *
 * Per-role legible floors are INTERIM (flagged for design to confirm as tokens).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
/* eslint-disable @typescript-eslint/no-explicit-any */

const FONT_DIR = path.join(process.cwd(), 'src/lib/card-engine/fonts');
const FONT_FILES: Record<string, string> = {
  Inter: 'Inter.ttf',
  Roboto: 'Roboto.ttf',
  'Work Sans': 'WorkSans.ttf',
  Fraunces: 'Fraunces.ttf',
};

// Lazy single-load of each font via opentype.parse (loadSync is deprecated).
let _opentype: any;
const _fontCache = new Map<string, any>();
function loadFont(family: string): any | null {
  const file = FONT_FILES[family];
  if (!file) return null; // unmeasurable family → caller uses the slack fallback
  if (_fontCache.has(family)) return _fontCache.get(family);
  try {
    if (!_opentype) _opentype = require('opentype.js');
    const b = readFileSync(path.join(FONT_DIR, file));
    const font = _opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    _fontCache.set(family, font);
    return font;
  } catch {
    _fontCache.set(family, null);
    return null;
  }
}

/** First family in a CSS stack (e.g. "Inter, sans-serif" → "Inter"). */
function firstFamily(stack: string): string {
  return (stack.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
}

/** Real text width in px for a single line, including CSS letter-spacing (added
 *  per gap between glyphs). null if the font isn't measurable. */
export function measureWidth(text: string, fontStack: string, fontSize: number, letterSpacing = 0): number | null {
  const font = loadFont(firstFamily(fontStack));
  if (!font) return null;
  let units = 0;
  for (const ch of text) units += font.charToGlyph(ch).advanceWidth || 0;
  const glyphW = (units * fontSize) / font.unitsPerEm;
  return glyphW + Math.max(0, text.length - 1) * letterSpacing;
}

/** Greedy word-wrap to lines that each fit maxW. Falls back to char-wrap for a
 *  single word longer than the box. */
function wrapLines(text: string, fontStack: string, fontSize: number, maxW: number, letterSpacing = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const w = (s: string) => measureWidth(s, fontStack, fontSize, letterSpacing) ?? Infinity;
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (w(trial) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ── Per-role legible floors (INTERIM — flag for design to confirm as tokens) ──
// floor = max(0.6 × design size, role's minimum legible size). Below the floor
// it SHORTEN rather than shrink into illegibility.
const ROLE_MIN_LEGIBLE: Record<string, number> = {
  title: 26,
  'metric-value': 40,
  'metric-label': 11,
  'eyebrow-label': 10,
  delta: 11,
  RECOMMENDED: 9,
  author: 12,
  date: 12,
  body: 13, // body / supporting text — legible floor (was 11px renderable)
};
const DEFAULT_MIN_LEGIBLE = 12;

export function roleFloor(role: string, designSize: number): number {
  const absMin = ROLE_MIN_LEGIBLE[role] ?? DEFAULT_MIN_LEGIBLE;
  // Floor = the higher of (0.6× design, role legible min) — but NEVER above the
  // design size (the fit only ever shrinks or shortens; it must not grow font).
  // If the legible min EXCEEDS the design size, the slot's own design size is
  // already below the proposed legible token → flagged for design; here it clamps
  // to design so the fit doesn't make it worse.
  return Math.min(designSize, Math.max(Math.round(designSize * 0.6), absMin));
}

export interface FitResult {
  fontSize: number;
  /** Possibly-tightened line-height (a height lever before shrinking the font). */
  lineHeight: number;
  text: string;
  /** true if content was shortened (last-ditch deterministic sentence/word trim). */
  shortened: boolean;
  /** true if it still doesn't fit even shortened at the floor (should be rare). */
  overflow: boolean;
}

/** Minimum legible leading — below this lines crowd. */
const MIN_LINE_HEIGHT = 1.05;

/**
 * Fit `text` into a box: shrink the font toward the per-role floor; if it still
 * overflows at the floor, trim on a word/sentence boundary (last resort — the
 * model-rewrite path in generation should make this rare). The box is NEVER
 * grown. `contentSized` slots (e.g. big metric numbers) don't wrap — they fit by
 * width on one line.
 */
export function fitToBox(opts: {
  text: string;
  boxW: number;
  boxH: number;
  fontStack: string;
  designSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  role: string;
  contentSized?: boolean;
  /** Pin the font to AT LEAST this size (used to force one uniform size across a
   *  group of peer boxes). Raises the floor so the fit won't shrink past it. */
  minFont?: number;
  /** VERBATIM (a quote): reproduce whole — shrink the font (further, if needed) but
   *  NEVER trim the words. */
  verbatim?: boolean;
}): FitResult {
  const { text, boxW, boxH, fontStack, designSize, role, contentSized, verbatim } = opts;
  const ls = opts.letterSpacing ?? 0;
  const designLH = opts.lineHeight ?? 1.2;
  // A verbatim quote may shrink below the role's legible floor (to a hard 10px
  // minimum) rather than lose a word — the quote must stay whole.
  const floor = verbatim
    ? Math.min(designSize, Math.max(10, opts.minFont ?? 0))
    : Math.min(designSize, Math.max(roleFloor(role, designSize), opts.minFont ?? 0));
  if (!measureWidth('M', fontStack, 16)) {
    // Unmeasurable font → conservative: keep design size (slack fallback handles it elsewhere).
    return { fontSize: designSize, lineHeight: designLH, text, shortened: false, overflow: false };
  }

  // Does `t` fit at this size + leading? (+1px tolerance for sub-pixel rounding.)
  const fits = (size: number, lh: number, t: string): boolean => {
    if (contentSized) return (measureWidth(t, fontStack, size, ls) ?? Infinity) <= boxW + 1 && size * lh <= boxH + 1;
    const lines = wrapLines(t, fontStack, size, boxW, ls);
    return lines.length * size * lh <= boxH + 1 && lines.every((l) => (measureWidth(l, fontStack, size, ls) ?? Infinity) <= boxW + 1);
  };
  // Leading candidates: the design leading, then tighten toward MIN_LINE_HEIGHT
  // (a height lever — tighten the leading before shrinking the font).
  const lhSteps: number[] = [];
  for (let lh = designLH; lh >= MIN_LINE_HEIGHT - 1e-6; lh -= 0.05) lhSteps.push(+lh.toFixed(2));
  if (lhSteps[lhSteps.length - 1] > MIN_LINE_HEIGHT) lhSteps.push(MIN_LINE_HEIGHT);

  // 1) Largest size (design → floor); at each, loosest leading that fits.
  // Build explicit size candidates from the (possibly FRACTIONAL) design size
  // down to the floor, ALWAYS including both endpoints. A plain
  // `size = Math.round(designSize); size >= floor; size--` loop silently SKIPS
  // every size when designSize rounds DOWN below the floor (e.g. design 11.47,
  // floor 11.47 → starts at 11 < floor → zero iterations → the text gets trimmed
  // even though it fits at 11.47). That clipped real, complete copy mid-sentence.
  const sizeSteps: number[] = [designSize];
  for (let s = Math.floor(designSize); s >= Math.ceil(floor); s--) sizeSteps.push(s);
  if (sizeSteps[sizeSteps.length - 1] !== floor) sizeSteps.push(floor);
  for (const size of sizeSteps) {
    for (const lh of lhSteps) {
      if (fits(size, lh, text)) return { fontSize: size, lineHeight: lh, text, shortened: false, overflow: false };
    }
  }
  // VERBATIM: a quote must never be trimmed. If it doesn't fit even at the 10px
  // floor, keep it whole and let it overflow slightly (rare) — never shorten it.
  if (verbatim) return { fontSize: floor, lineHeight: MIN_LINE_HEIGHT, text, shortened: false, overflow: true };
  // 2a) Prefer ending on a complete SENTENCE: drop whole trailing sentences
  // until it fits, so the result is a finished thought ("X. Y.") rather than a
  // clause cut mid-idea ("…and may even"). Take the LONGEST that fits.
  const sentenceCuts: number[] = [];
  { const re = /[.!?]+["'»”’)\]]?/g; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) sentenceCuts.push(m.index + m[0].length); }
  for (let i = sentenceCuts.length - 1; i >= 0; i--) {
    const cand = text.slice(0, sentenceCuts[i]).trim();
    if (cand && cand.length < text.trim().length && fits(floor, MIN_LINE_HEIGHT, cand)) {
      return { fontSize: floor, lineHeight: MIN_LINE_HEIGHT, text: cand, shortened: true, overflow: false };
    }
  }
  // 2b) No whole sentence fits — shorten on a word boundary until it fits.
  // NO trailing "…" — an ellipsis reads as truncated AND eats width; instead end
  // on a complete clause (strip a dangling connective) so the result reads
  // finished. Take the LONGEST clean version that fits.
  const words = text.split(/\s+/).filter(Boolean);
  for (let n = words.length - 1; n >= 1; n--) {
    const trimmed = words.slice(0, n).join(' ')
      .replace(/[\s,;:.–—-]+$/, '')
      .replace(/\s+(and|or|but|to|of|in|on|for|with|the|a|an|by|as|at|from|that|which|its|our|their|your|&)$/i, '')
      .trim();
    if (trimmed && fits(floor, MIN_LINE_HEIGHT, trimmed)) {
      return { fontSize: floor, lineHeight: MIN_LINE_HEIGHT, text: trimmed, shortened: true, overflow: false };
    }
  }
  // 3) Still over even as a single word — render at floor/tight, flag overflow.
  return { fontSize: floor, lineHeight: MIN_LINE_HEIGHT, text, shortened: true, overflow: true };
}

// ── Card-level fit pass (server-side, at placement) ──────────────────────────
import type { Card } from '@/types/card-template';

const FRAME_W = 960;
const FRAME_H = 540;

/** variant → the role key used for the legible floor + whether it's content-sized
 *  (big numbers fit by width, never wrap). */
function variantRole(variant?: string): { role: string; contentSized: boolean } {
  switch (variant) {
    case 'heading': return { role: 'title', contentSized: false };
    case 'metric': return { role: 'metric-value', contentSized: true };
    case 'subheading': return { role: 'metric-label', contentSized: false };
    default: return { role: 'body', contentSized: false };
  }
}

export interface SlotFitNote {
  text: string;
  fromSize: number;
  toSize: number;
  shortened: boolean;
  overflow: boolean;
  /** Block id — lets the rewrite-to-fit pass find and replace this slot. */
  id?: string;
  /** Full original text (before any trim) — the source the rewrite condenses. */
  full?: string;
  /** The box's character capacity at the fitted size — the rewrite's target limit. */
  cap?: number;
  /** Verbatim (a quote) — must NOT be rewritten/reshortened by the caller. */
  verbatim?: boolean;
}

/** Approx character capacity of a box at a given font — the rewrite-to-fit target. */
function fitCap(boxWpx: number, boxHpx: number, font: number, lh: number): number {
  const perLine = Math.max(1, Math.floor(boxWpx / (font * 0.5)));
  const lines = Math.max(1, Math.floor(boxHpx / (font * lh)));
  return Math.max(8, Math.floor(perLine * lines * 0.92));
}

// Grow-to-fit: a wrapping text box may GROW down into empty space (like dragging
// a PowerPoint box taller) so its words fit, instead of shrinking/trimming.
const CARD_BOTTOM_PCT = 90; // don't grow a box's bottom past this much of the card
const GROW_PAD_PX = 6;      // a little breathing room below the last line

/** Lowest y% a box may grow its bottom to: the top of the nearest CONTENT block
 *  (text/image) below it that horizontally overlaps it, or the card's safe
 *  bottom. Shapes/icons (backgrounds, dividers, decorations) don't block growth. */
function availableBottomPct(
  card: Card,
  box: { id?: string; x: number; y: number; w: number; h: number },
): number {
  const bl = box.x;
  const br = box.x + box.w;
  let limit = CARD_BOTTOM_PCT;
  for (const o of card.freeform ?? []) {
    if (o.id === box.id) continue;
    if (o.type === 'shape' || o.type === 'icon') continue; // backgrounds don't block growth
    // Cap against any content block below this box's TOP — not its current bottom.
    // (The old `boxBottom` test skipped blocks a too-tall box already reached, so
    // it grew right over the cards below it — the slide-3 collision.)
    if (o.y <= box.y + 0.5) continue; // blocks at/above this box's top don't cap growth
    const ol = o.x;
    const or = o.x + o.w;
    if (ol < br - 0.5 && or > bl + 0.5 && o.y < limit) limit = o.y; // overlaps horizontally → caps growth
  }
  return limit;
}

/**
 * Fit every text block on a card to its box IN PLACE (mutates), baking the
 * fitted fontSize + (possibly shortened) content so the editor render AND the
 * export use the same values. The box geometry (x/y/w/h) is never changed.
 * Returns the slots that were adjusted (for logging / a rewrite-to-fit signal).
 */
type FitBlock = {
  type?: string;
  id?: string;
  variant?: string;
  content?: string;
  verbatim?: boolean;
  x: number; y: number; w: number; h: number;
  style?: { fontFamily?: string; fontSize?: number; lineHeight?: number; letterSpacing?: number };
};

/** Peer-group key: the box id with its trailing `-<index>` stripped, plus the
 *  variant. Boxes like `…item-body-0/1/2` share a key → they're symmetric peers
 *  (a comparison row, an infographic grid) that must stay the SAME size + font. */
function peerKey(b: FitBlock): string {
  const base = (b.id ?? '').replace(/-\d+$/, '') || (b.id ?? '');
  return `${base}|${b.variant ?? 'body'}`;
}

export function fitCardText(card: Card): SlotFitNote[] {
  const notes: SlotFitNote[] = [];
  const blocks = (card.freeform ?? []) as unknown as FitBlock[];
  // Bucket fittable text blocks into peer groups; singletons get their own group.
  const groups = new Map<string, FitBlock[]>();
  for (const b of blocks) {
    if (b.type !== 'text') continue;
    const text = (b.content ?? '').trim();
    if (!text || text.length <= 1) continue; // skip glyph marks
    if (!b.style?.fontSize || !b.style?.fontFamily) continue;
    const key = peerKey(b);
    const g = groups.get(key);
    if (g) g.push(b); else groups.set(key, [b]);
  }
  for (const group of groups.values()) fitGroup(card, group, notes);
  return notes;
}

/** Fit one peer group together: equal box height + one uniform font size per
 * type (— "if you grow one box, grow the others; each text type
 *  keeps the same size in every box"). A singleton group is just a normal box. */
function fitGroup(card: Card, group: FitBlock[], notes: SlotFitNote[]): void {
  const items = group.map((b) => {
    const { role, contentSized } = variantRole(b.variant);
    const style = b.style!;
    return {
      b,
      text: (b.content ?? '').trim(),
      role,
      contentSized,
      verbatim: !!b.verbatim,
      designSize: style.fontSize!,
      fontStack: style.fontFamily!,
      designLH: style.lineHeight ?? 1.2,
      ls: style.letterSpacing ?? 0,
      boxW: (b.w / 100) * FRAME_W,
      originalH: b.h,
      originalHpx: (b.h / 100) * FRAME_H,
    };
  });

  // ── GROW-TO-FIT (height), equalized across the group ──────────────────────
  // Wrapping peers grow DOWN into empty space so words fit without shrinking.
  // All peers grow to the SAME height (the max any one needs), capped by the
  // TIGHTEST peer's available space so none overlaps its own neighbor below.
  const wrapping = items.filter((i) => !i.contentSized);
  if (wrapping.length) {
    let maxNeeded = 0;
    let minAvail = Infinity;
    let baseH = 0;
    for (const i of wrapping) {
      const needed =
        wrapLines(i.text, i.fontStack, i.designSize, i.boxW, i.ls).length *
          i.designSize * i.designLH + GROW_PAD_PX;
      maxNeeded = Math.max(maxNeeded, needed);
      minAvail = Math.min(minAvail, ((availableBottomPct(card, i.b) - i.b.y) / 100) * FRAME_H);
      baseH = Math.max(baseH, i.originalHpx);
    }
    // Grow toward the text height, but CLAMP to the available space above the next
    // content block. If the authored box was already too tall (its bottom sits over
    // a block below), this SHRINKS it to the available space too — so the box never
    // overlaps its neighbour; the text then fits the clamped box via shrink/trim
    // below (budget-driven: the box bounds the text, not the other way around).
    const groupH = Math.min(Math.max(baseH, maxNeeded), minAvail);
    if (Math.abs(groupH - baseH) > 1) {
      for (const i of wrapping) i.b.h = (groupH / FRAME_H) * 100;
    }
  }

  // ── FONT (size + leading), uniform across the group ───────────────────────
  // 1) Independent best fit per (now grown) box → the smallest size any peer
  //    needs is the group's size, so every peer renders at one legible size.
  const firstPass = items.map((i) => {
    const boxH = (i.b.h / 100) * FRAME_H;
    return {
      i,
      boxH,
      res: fitToBox({
        text: i.text, boxW: i.boxW, boxH, fontStack: i.fontStack,
        designSize: i.designSize, lineHeight: i.designLH, letterSpacing: i.ls,
        role: i.role, contentSized: i.contentSized, verbatim: i.verbatim,
      }),
    };
  });
  const groupFont = Math.min(...firstPass.map((p) => p.res.fontSize));

  // 2) Re-fit each box PINNED to groupFont; collect the tightest leading any
  //    peer needs so the whole group also shares one leading (still fits all).
  const secondPass = firstPass.map((p) => ({
    i: p.i,
    res: fitToBox({
      text: p.i.text, boxW: p.i.boxW, boxH: p.boxH, fontStack: p.i.fontStack,
      designSize: groupFont, lineHeight: p.i.designLH, letterSpacing: p.i.ls,
      role: p.i.role, contentSized: p.i.contentSized, minFont: groupFont, verbatim: p.i.verbatim,
    }),
  }));
  const groupLH = Math.min(...secondPass.map((p) => p.res.lineHeight));

  // 3) Bake the uniform size/leading + per-box (possibly trimmed) text.
  for (const { i, res } of secondPass) {
    const changed =
      groupFont !== i.designSize || res.text !== i.text ||
      groupLH !== i.designLH || i.b.h !== i.originalH;
    if (changed) {
      i.b.style = { ...i.b.style, fontSize: groupFont, lineHeight: groupLH };
      i.b.content = res.text;
      notes.push({
        text: i.text.slice(0, 28), fromSize: Math.round(i.designSize),
        toSize: groupFont, shortened: res.shortened, overflow: res.overflow,
        id: i.b.id, full: i.text,
        cap: fitCap(i.boxW, (i.b.h / 100) * FRAME_H, groupFont, groupLH),
        ...(i.verbatim ? { verbatim: true } : {}),
      });
    }
  }
}

/** Wrap-aware overflow check: which text blocks DON'T fit their box at their
 *  CURRENT fontSize (accounts for multi-line wrap height, which the geometry
 *  gate's single-line check misses). Used to prove before/after fit. */
export function measureOverflows(card: Card): { id: string; text: string; lines: number }[] {
  const out: { id: string; text: string; lines: number }[] = [];
  for (const b of card.freeform ?? []) {
    if (b.type !== 'text') continue;
    const text = (b.content ?? '').trim();
    if (!text || text.length <= 1) continue;
    const style = (b as { style?: { fontFamily?: string; fontSize?: number; lineHeight?: number; letterSpacing?: number } }).style;
    const size = style?.fontSize;
    const stack = style?.fontFamily;
    if (!size || !stack || !measureWidth('M', stack, 16)) continue;
    const lh = style?.lineHeight ?? 1.2;
    const ls = style?.letterSpacing ?? 0;
    const boxW = (b.w / 100) * FRAME_W;
    const boxH = (b.h / 100) * FRAME_H;
    const { contentSized } = variantRole((b as { variant?: string }).variant);
    const lines = contentSized ? [text] : wrapLines(text, stack, size, boxW, ls);
    const tooWide = lines.some((l) => (measureWidth(l, stack, size, ls) ?? Infinity) > boxW + 1);
    const tooTall = lines.length * size * lh > boxH + 1;
    if (tooWide || tooTall) out.push({ id: b.id, text: text.slice(0, 28), lines: lines.length });
  }
  return out;
}
