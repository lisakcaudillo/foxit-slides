/**
 * geometry-audit.ts — the DETERMINISTIC fit gate (no render, no VLM).
 *
 * "Does the content fit the box" is math, not taste: every structured block is
 * placed at a template slot with a known character budget (`charCap`, derived
 * from the slot's width × height × font size) and a known intended font size.
 * Comparing the generated block against its slot tells us — in milliseconds,
 * reliably — what the visual judge sees slowly and unreliably:
 *
 *   - overBudget : content exceeds the box's character budget (would overflow)
 *   - fontShrunk : the fit had to shrink the font well below the slot's intended
 *                  size to make it fit ⇒ the box is too small for what it holds
 *   - sparse     : content sits well UNDER the density target ⇒ empty-looking
 *   - overflowV  : a single line is taller than its box (collides below)
 *
 * Density sets the TARGET fullness band (concise ~45% of budget, detailed ~72%,
 * extensive ~88% — the same `fillFraction` the fill uses), so `sparse` is judged
 * against the tier the user picked.
 *
 * This is the data behind "fix the fill or fix the Figma geometry?": a slot that
 * shrinks/trims across MANY decks ⇒ the template box is too small; a one-off ⇒
 * the writer over-wrote. The visual judge stays untouched — it keeps judging
 * design/bedazzle; this only owns the mechanical fit line.
 *
 * Thresholds below are PROVISIONAL — meant to be calibrated from the logged
 * numbers (docs/metrics) before this becomes a wired hard gate.
 */
import { describeLayoutSlots } from '@/data/structureTemplates';
import type { Card, FreeformBlock } from '@/types/card-template';

const FRAME_H = 540;

// Provisional cutoffs — tune from docs/metrics data before gating on them.
const FONT_SHRINK_FLAG = 0.15; // font shrank > 15% below the slot's intended size
const SPARSE_FACTOR = 0.45; // content < 45% of the density target reads as sparse

export interface BlockFitAudit {
  ref: string; // layout-qualified, human reference: `${shortLayout}-block${n}` e.g. "stat-block1"
  blockId: string; // the raw block id: ff-struct-${role}-${group}-${i}
  roleGroup: string; // role-group parsed from the id (matches the template slot)
  text: string; // truncated preview
  charCount: number;
  charCap: number | null; // the slot's character budget
  util: number | null; // charCount / charCap
  target: number | null; // density-adjusted target char count
  fontSize: number;
  expectedSize: number | null; // the slot's intended font size
  fontShrink: number | null; // (expected - actual) / expected, clamped ≥ 0
  fits: boolean; // the HARD gate: no overflow + within budget + in-bounds
  flags: string[]; // overBudget | fontShrunk | sparse | overflowV | outOfBounds
}

export interface SlideFitAudit {
  index: number;
  layoutKey: string;
  skinId: string;
  density: string;
  blocks: BlockFitAudit[];
  flagged: number; // blocks with at least one flag
}

export interface DeckFitSummary {
  blocks: number;
  overBudget: number;
  fontShrunk: number;
  sparse: number;
  overflowV: number;
  worstShrink: number; // largest font shrink seen (0..1)
  /** Layout-qualified refs of every flagged block, e.g. "cover-block2:fontShrunk". */
  flagged: string[];
}

function fillFraction(density?: string): number {
  return density === 'extensive' ? 0.88 : density === 'concise' ? 0.45 : 0.72;
}

/** Audit one deck's fit, slide by slide. Pure + cheap — no render, no network. */
export function auditDeckGeometry(
  cards: Card[],
  layoutKeys: string[],
  skinId: string,
  density: string | undefined,
): SlideFitAudit[] {
  const ff = fillFraction(density);
  const out: SlideFitAudit[] = [];

  for (let i = 0; i < cards.length; i++) {
    const layoutKey = layoutKeys[i] ?? '';
    // Short, readable layout name for the block ref: "02-stat" → "stat".
    const shortLayout = layoutKey.replace(/^\d+-/, '') || layoutKey || 'slide';
    let specByRoleGroup = new Map<string, { charCap: number; size: number; role: string }>();
    try {
      for (const s of describeLayoutSlots(layoutKey, skinId)) {
        // Block id is `ff-struct-${role}-${group ?? 'x'}-${i}` — mirror that key.
        specByRoleGroup.set(`${s.role}-${s.group ?? 'x'}`, { charCap: s.charCap, size: s.size, role: s.role });
      }
    } catch {
      specByRoleGroup = new Map();
    }

    const blocks: BlockFitAudit[] = [];
    for (const b of (cards[i].freeform ?? []) as FreeformBlock[]) {
      if (b.type !== 'text' || typeof b.id !== 'string' || !b.id.startsWith('ff-struct-')) continue;
      const text = (b.content ?? '').trim();
      const charCount = text.length;
      const fontSize = (b as { style?: { fontSize?: number; lineHeight?: number } }).style?.fontSize ?? 0;
      const lineHeight = (b as { style?: { lineHeight?: number } }).style?.lineHeight ?? 1.15;

      const m = b.id.match(/^ff-struct-(.+)-(\d+)$/);
      const roleGroup = m ? m[1] : b.id;
      const spec = m ? specByRoleGroup.get(roleGroup) ?? null : null;

      const charCap = spec ? spec.charCap : null;
      const expectedSize = spec ? spec.size : null;
      const util = charCap && charCap > 0 ? charCount / charCap : null;
      const target = charCap != null ? Math.round(charCap * ff) : null;
      const fontShrink = expectedSize && expectedSize > 0 ? Math.max(0, (expectedSize - fontSize) / expectedSize) : null;

      const flags: string[] = [];
      // Vertical overflow (a line taller than its box → collides below).
      const boxHpx = ((b.h ?? 0) / 100) * FRAME_H;
      const overflowV = fontSize > 0 && fontSize * lineHeight > boxHpx + 6 && charCount > 2;
      if (overflowV) flags.push('overflowV');
      // Out of bounds (top/left/bottom edges).
      const outOfBounds = (b.y ?? 0) < -0.5 || (b.y ?? 0) + (b.h ?? 0) > 100.5 || (b.x ?? 0) < -0.5;
      if (outOfBounds) flags.push('outOfBounds');
      if (util != null && util > 1.0) flags.push('overBudget');
      if (fontShrink != null && fontShrink > FONT_SHRINK_FLAG) flags.push('fontShrunk');
      // SPARSE only applies to body slots — the only ones that scale with density.
      // Fixed-by-role slots (titles, eyebrow labels, numbers, dates, stat values)
      // are short by design and the engine never fills them to the density target,
      // so flagging them sparse is a false positive.
      if (spec?.role === 'body' && target != null && charCount > 0 && charCount < target * SPARSE_FACTOR) flags.push('sparse');

      const fits = !flags.includes('overflowV') && !flags.includes('outOfBounds') && !flags.includes('overBudget');

      blocks.push({
        ref: `${shortLayout}-block${blocks.length + 1}`,
        blockId: b.id,
        roleGroup,
        text: text.slice(0, 40),
        charCount,
        charCap,
        util: util != null ? Math.round(util * 100) / 100 : null,
        target,
        fontSize: Math.round(fontSize * 10) / 10,
        expectedSize,
        fontShrink: fontShrink != null ? Math.round(fontShrink * 100) / 100 : null,
        fits,
        flags,
      });
    }

    out.push({
      index: i,
      layoutKey,
      skinId,
      density: density ?? 'detailed',
      blocks,
      flagged: blocks.filter((b) => b.flags.length > 0).length,
    });
  }

  return out;
}

/** Roll the per-slide audit into deck-level counters for the CSV summary. */
export function summarizeFit(slides: SlideFitAudit[]): DeckFitSummary {
  const all = slides.flatMap((s) => s.blocks);
  return {
    blocks: all.length,
    overBudget: all.filter((b) => b.flags.includes('overBudget')).length,
    fontShrunk: all.filter((b) => b.flags.includes('fontShrunk')).length,
    sparse: all.filter((b) => b.flags.includes('sparse')).length,
    overflowV: all.filter((b) => b.flags.includes('overflowV')).length,
    worstShrink: all.reduce((mx, b) => Math.max(mx, b.fontShrink ?? 0), 0),
    flagged: all.filter((b) => b.flags.length > 0).map((b) => `${b.ref}:${b.flags.join('+')}`),
  };
}
