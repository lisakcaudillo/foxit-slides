/**
 * fixer-contract.ts — the safety contract every deck-mutating fixer must honor,
 * so a fix can never silently make a slide worse or brick the pipeline.
 *
 * Learned from a production incident on the sibling engine: a swap-layout fixer
 * that "succeeded" (its plan said the new layout's slots were satisfiable) but
 * left the slide rendering EMPTY, and stalled export because nothing verified the
 * result. The lesson generalizes to every fixer: "the plan is satisfiable" is not
 * "the slide actually renders non-empty and no worse than before."
 *
 * Two guarantees:
 *   1. FAIL-SAFE   — callers wrap synchronous fixers so a throw reverts + continues
 *                    (the async fixers already try/catch). A bad fixer never bricks
 *                    the loop.
 *   2. VERIFY-RESULT — after a fix, if the slide got EMPTIED, STRANDED its content
 *                    (collapsed to a heading on an empty artboard — the near-empty
 *                    regression a layout swap causes when content doesn't land in the
 *                    new layout's slots), or gained new geometry blockers (overlap /
 *                    clip / empty / off-edge), REVERT to the pre-fix snapshot.
 *                    Applies to swap-layout, rebuild, geometry, style.
 */
import type { Card, TemplateTheme } from '@/types/card-template';
import { analyzeCardGeometry } from './judge-deck';

/** Deep, mutation-proof copy of a card for revert. Cards are plain JSON deck data,
 *  so structuredClone works; JSON is the fallback if a card ever carries something
 *  non-cloneable. */
export function snapshotCard(card: Card): Card {
  try {
    return structuredClone(card);
  } catch {
    return JSON.parse(JSON.stringify(card)) as Card;
  }
}

/** Does the card still carry real rendered content? (>2 chars in any text block.) */
export function cardHasContent(card: Card): boolean {
  return (card.freeform ?? []).some(
    (b) => (b as { type?: string }).type === 'text' && String((b as { content?: string }).content ?? '').trim().length > 2,
  );
}

/** Count blocks that render REAL content — a text block with content, an image
 *  with a src, or a data block (chart/table). Decorative shapes/backgrounds don't
 *  count. This is the "is the slide substantive" signal: a value of ≤1 means the
 *  slide is heading-only (or blank) — the near-empty state a layout swap strands
 *  when the produced content doesn't land in the new layout's slots (bee531e). */
export function substantiveBlockCount(card: Card): number {
  return (card.freeform ?? []).filter((b) => {
    const type = (b as { type?: string }).type;
    if (type === 'text') return String((b as { content?: string }).content ?? '').trim().length > 2;
    if (type === 'image') return !!(b as { src?: string }).src;
    if (type === 'chart' || type === 'table') return true;
    return false; // shapes / decorations aren't content
  }).length;
}

// Geometry issues that constitute a REGRESSION if a fix introduces more of them.
const BLOCKER_RE = /overlap|buried|empty|overflow|runs off/i;
const blockerCount = (issues: string[]): number => issues.filter((s) => BLOCKER_RE.test(s)).length;

/**
 * Did the fix make the slide WORSE? Returns a reason to revert, or null to keep it.
 * Regressions: (a) the slide was emptied (the catastrophic case), (b) the fix
 * STRANDED content — the slide had ≥2 substantive blocks and collapsed to ≤1
 * (heading-only), the near-empty case a bad layout swap causes, or (c) it gained
 * blocker-class geometry issues (overlap/clip/empty/off-edge) vs. before the fix.
 *
 * The content-loss guard is deliberately narrow so it doesn't fight legitimate
 * fixes: `shorten` keeps its blocks (just shorter) → count unchanged; `remove`
 * only drops EMPTY blocks → never counted as substantive anyway; a clean swap
 * rebuilds with comparable content. Only actual content loss (multi-block → one)
 * trips it — exactly the "heading on an empty artboard" regression.
 */
export function fixMadeItWorse(before: Card, after: Card, theme?: TemplateTheme): string | null {
  if (!cardHasContent(after)) return 'slide emptied';
  const subBefore = substantiveBlockCount(before);
  const subAfter = substantiveBlockCount(after);
  if (subBefore >= 2 && subAfter <= 1) return `content stranded (${subBefore} → ${subAfter} substantive blocks)`;
  const b = blockerCount(analyzeCardGeometry(before, theme));
  const a = blockerCount(analyzeCardGeometry(after, theme));
  if (a > b) return `new blockers (${b} → ${a})`;
  return null;
}
