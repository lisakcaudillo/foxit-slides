/**
 * geometry-fixer.ts — apply the SAFE deterministic geometry fixes the VLM asked
 * for. Four change-types today:
 *
 *   `shrink`             (existing) — reduce a role's font and re-fit
 *   `remove`             (existing) — drop an empty / orphan element
 *   `restructure-focal`  (R-5) — bump the named FOCAL block's font size up one
 *                                step so it dominates. Bounded by ABS_CEILING_PX
 *                                and re-fit at the end. Meant for L2 (one focal
 *                                element) when the VLM says multiple blocks are
 *                                competing and identifies which one should win.
 *   `rebalance` / `move` (R-6) — constrained position nudge for a single block.
 *                                Direction inferred from the VLM's reason ("left"
 *                                / "right" / "up" / "down" / "center"); moves ≤
 *                                8% horizontally / 6% vertically per pass,
 *                                clamped to slide bounds, aborted if the target
 *                                position would overlap another text/image block.
 *
 * These patch the EXISTING card (no re-fill). All are safe on the FIXED
 * skeleton: font size stays within a ceiling; position moves stay within a
 * small window; and we abort rather than push things into overlap.
 */
import type { Card, FreeformBlock } from '@/types/card-template';
import { fitCardText } from './text-fit';
import { roleGroupOf } from './slide-manifest';

export interface FixDirective { element: string; change: string; reason?: string }

const SHRINK_STEP = 0.85; // one step per revise pass
const ABS_FLOOR_PX = 12; // never shrink below legibility
const GROW_STEP = 1.15; // R-5: one focal-size bump per revise pass
const ABS_CEILING_PX = 96; // R-5: never grow past a huge display size

const REBALANCE_MAX_DX_PCT = 8; // R-6: max horizontal move per pass
const REBALANCE_MAX_DY_PCT = 6; // R-6: max vertical move per pass

/** Direction inferred from VLM's rebalance reason text. */
type NudgeDir = 'left' | 'right' | 'up' | 'down' | 'center' | null;
function inferNudgeDir(reason: string | undefined): NudgeDir {
  const r = (reason ?? '').toLowerCase();
  if (!r) return null;
  if (/\b(center|centered|centre|centred)\b/.test(r)) return 'center';
  // Order matters — "left" and "right" first (they're most specific).
  if (/\b(shift|move|nudge)?\s*(to the |towards? )?left\b/.test(r) || /\btoo far right\b/.test(r)) return 'left';
  if (/\b(shift|move|nudge)?\s*(to the |towards? )?right\b/.test(r) || /\btoo far left\b/.test(r)) return 'right';
  if (/\b(shift|move|nudge)?\s*(upwards?|up|higher)\b/.test(r) || /\btoo low\b/.test(r)) return 'up';
  if (/\b(shift|move|nudge)?\s*(downwards?|down|lower)\b/.test(r) || /\btoo high\b/.test(r)) return 'down';
  return null;
}

/** Would a moved block overlap another non-decoration block? Simple bbox
 *  intersection, ignores shapes (decorations are behind by design) and images
 *  (a small text-over-image overlap is often intentional). */
function wouldOverlap(
  ff: readonly FreeformBlock[],
  self: FreeformBlock,
  newX: number,
  newY: number,
): boolean {
  const w = (self as { w: number }).w;
  const h = (self as { h: number }).h;
  for (const b of ff) {
    if (b === self) continue;
    if (b.type === 'shape' || b.type === 'image') continue;
    const bx = (b as { x: number }).x;
    const by = (b as { y: number }).y;
    const bw = (b as { w: number }).w;
    const bh = (b as { h: number }).h;
    const overlapX = Math.max(0, Math.min(newX + w, bx + bw) - Math.max(newX, bx));
    const overlapY = Math.max(0, Math.min(newY + h, by + bh) - Math.max(newY, by));
    if (overlapX * overlapY > 0) return true;
  }
  return false;
}

/** Apply shrink/remove directives to a card in place. Returns true if anything
 *  changed (so the caller knows to re-judge it). Re-fits once at the end. */
export function applyGeometryFixes(card: Card, directives: FixDirective[]): boolean {
  if (!directives.length) return false;
  let changed = false;
  const ff = (card.freeform ?? []) as FreeformBlock[];

  for (const d of directives) {
    if (d.change === 'shrink') {
      for (const b of ff) {
        if (b.type !== 'text') continue;
        if (roleGroupOf(b) !== d.element) continue;
        const style = (b as { style?: { fontSize?: number } }).style ?? {};
        const cur = style.fontSize;
        if (!cur) continue;
        const next = Math.max(ABS_FLOOR_PX, Math.round(cur * SHRINK_STEP));
        if (next < cur) {
          (b as { style?: Record<string, unknown> }).style = { ...style, fontSize: next };
          changed = true;
        }
      }
    } else if (d.change === 'remove') {
      // Only remove EMPTY blocks of that role (safe — a populated slot is part of
      // the layout; dropping it would change the design, not fix a defect).
      const before = ff.length;
      const kept = ff.filter(
        (b) => !(b.type === 'text' && roleGroupOf(b) === d.element && !(((b as { content?: string }).content ?? '').trim())),
      );
      if (kept.length < before) {
        card.freeform = kept;
        changed = true;
      }
    } else if (d.change === 'restructure-focal') {
      // R-5. Bump the FOCAL block's font size up one step so it visually
      // dominates. Match on full id (VLM emits the block id as element on
      // native; roleGroupOf falls through to the id for those). Bounded by
      // ABS_CEILING_PX; no-op if already at ceiling.
      for (const b of ff) {
        if (b.type !== 'text') continue;
        const id = (b as { id?: string }).id;
        if (id !== d.element && roleGroupOf(b) !== d.element) continue;
        const style = (b as { style?: { fontSize?: number } }).style ?? {};
        const cur = style.fontSize;
        if (!cur) continue;
        const next = Math.min(ABS_CEILING_PX, Math.round(cur * GROW_STEP));
        if (next > cur) {
          (b as { style?: Record<string, unknown> }).style = { ...style, fontSize: next };
          changed = true;
        }
      }
    } else if (d.change === 'rebalance' || d.change === 'move') {
      // R-6. Constrained position nudge. Direction inferred from the VLM's
      // reason text; abort if we can't tell what direction (never guess).
      // Move ≤ 8% horizontally / 6% vertically per pass. Clamp to slide
      // bounds. Abort if the target position would overlap another text
      // block (shapes/images ignored — they're usually background).
      const dir = inferNudgeDir(d.reason);
      if (!dir) continue;
      for (const b of ff) {
        const id = (b as { id?: string }).id;
        if (id !== d.element && roleGroupOf(b) !== d.element) continue;
        if (b.type === 'shape') continue; // moving decoration fights the design
        const x = (b as { x: number }).x;
        const y = (b as { y: number }).y;
        let newX = x;
        let newY = y;
        const dx = REBALANCE_MAX_DX_PCT;
        const dy = REBALANCE_MAX_DY_PCT;
        if (dir === 'left') newX = Math.max(0, x - dx);
        else if (dir === 'right') newX = Math.min(100 - (b as { w: number }).w, x + dx);
        else if (dir === 'up') newY = Math.max(0, y - dy);
        else if (dir === 'down') newY = Math.min(100 - (b as { h: number }).h, y + dy);
        else if (dir === 'center') {
          // Center on the horizontal axis only — vertical centering usually
          // conflicts with the layout's own vertical rhythm.
          const w = (b as { w: number }).w;
          const centerX = (100 - w) / 2;
          const distance = Math.abs(centerX - x);
          const step = Math.min(dx, distance);
          newX = x < centerX ? x + step : x - step;
        }
        if (Math.abs(newX - x) < 0.5 && Math.abs(newY - y) < 0.5) continue;
        if (wouldOverlap(ff, b, newX, newY)) continue;
        (b as { x: number }).x = newX;
        (b as { y: number }).y = newY;
        changed = true;
      }
    }
    // Any other change: out of scope here (handled elsewhere).
  }

  if (changed) fitCardText(card); // re-fit so shrunk text settles cleanly
  return changed;
}
