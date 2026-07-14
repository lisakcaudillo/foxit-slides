// Pure geometry helpers for the asset editor's Arrange operations.
//
// Every function here is PURE: it takes the current `blocks` array plus a
// selection of block ids and returns a BRAND-NEW blocks array. Nothing is
// mutated in place — callers (the React UI) can diff/replace state safely.
//
// Coordinate model (mirrors FreeformBlock in app/src/types/card-template.ts):
//   x, y  — top-left corner of the block, as a % of the card surface (0–100)
//   w, h  — width / height, as a % of the card surface (0–100)
//   z     — z-order within the freeform layer; higher renders on top
//   rotation — clockwise degrees; IGNORED for v1 geometry (see note below)
//
// v1 LIMITATION — rotation-agnostic:
//   All bounding-box math treats blocks as axis-aligned rectangles and ignores
//   `rotation`. A rotated block's visual bounding box is larger than its (x,y,w,h)
//   rect, so align/distribute on rotated blocks aligns the UN-rotated rect, not
//   the visual extent. Rotated-bbox alignment (compute the 4 rotated corners,
//   take min/max) is a future refinement and intentionally out of scope here.
//
// GROUP MODEL — PROPOSAL, not yet in the shared type:
//   FreeformBlock (card-template.ts) has NO group field today. Rather than edit
//   that shared contract, this module uses a LOCAL extension type `Groupable`
//   that adds an optional `groupId?: string`. group/ungroup/move set or read that
//   tag via a narrow cast. If/when grouping is promoted to a real feature, add
//   `groupId?: string` to FreeformPositioned and drop the local type. There is
//   NO persistent group NODE — a group is just a shared tag across sibling blocks.

import type { FreeformBlock } from '../../types/card-template';

// ── Local types ───────────────────────────────────────────────────────────────

/**
 * The subset of FreeformBlock geometry these helpers actually touch. Using a
 * structural type (rather than the full union) keeps the math testable with
 * plain objects and avoids depending on text/image/shape-specific fields.
 */
export interface ArrangeBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation?: number;
}

/**
 * PROPOSAL extension — see file header. Adds the optional group tag without
 * modifying the shared FreeformBlock contract. The helpers operate on this
 * shape; real FreeformBlock values are accepted via the generic constraint
 * below because they are assignable to ArrangeBlock structurally.
 */
export interface Groupable {
  groupId?: string;
}

/** Any value usable by these helpers: must carry the arrange geometry. */
type Block = ArrangeBlock & Groupable;

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type AlignRelativeTo = 'canvas' | 'selection';

// Sanity check that a real FreeformBlock satisfies ArrangeBlock structurally.
// (Compile-time only — erased at runtime.)
type _AssertFreeformIsArrange = FreeformBlock extends ArrangeBlock ? true : never;

// ── Small internal helpers ────────────────────────────────────────────────────

/** Shallow-clone every block so the returned array shares no object refs. */
function cloneAll<T extends Block>(blocks: readonly T[]): T[] {
  return blocks.map((b) => ({ ...b }));
}

/** Build a fast id-membership set from a selection list. */
function idSet(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

interface BBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Axis-aligned bbox of one block (rotation ignored — see header). */
function blockBBox(b: ArrangeBlock): BBox {
  return { left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h };
}

/** Combined axis-aligned bbox over a non-empty set of blocks. */
function unionBBox(blocks: readonly ArrangeBlock[]): BBox {
  const first = blockBBox(blocks[0]);
  let { left, top, right, bottom } = first;
  for (let i = 1; i < blocks.length; i++) {
    const bb = blockBBox(blocks[i]);
    if (bb.left < left) left = bb.left;
    if (bb.top < top) top = bb.top;
    if (bb.right > right) right = bb.right;
    if (bb.bottom > bottom) bottom = bb.bottom;
  }
  return { left, top, right, bottom };
}

// ── Z-order ───────────────────────────────────────────────────────────────────
//
// All four z helpers preserve the RELATIVE order of the selection and the
// relative order of the unselected blocks; they only shift the selected band
// up or down the stack. After each op, z values are re-normalized to a dense
// 0..n-1 sequence (by visual stacking order) so there are no gaps/collisions.

/** Re-assign dense z (0,1,2,…) following the given visual bottom→top order. */
function renumber<T extends Block>(orderedBottomToTop: T[]): T[] {
  return orderedBottomToTop.map((b, i) => ({ ...b, z: i }));
}

/** Stable sort blocks by current z (ascending = bottom→top). */
function sortedByZ<T extends Block>(blocks: readonly T[]): T[] {
  // Index-tagged sort to make ties deterministic (stable).
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((a, c) => (a.b.z - c.b.z) || (a.i - c.i))
    .map((x) => x.b);
}

/** Move selected blocks to the TOP of the stack (highest z), keeping their order. */
export function bringToFront<T extends Block>(blocks: readonly T[], ids: readonly string[]): T[] {
  const sel = idSet(ids);
  const ordered = sortedByZ(cloneAll(blocks));
  const unselected = ordered.filter((b) => !sel.has(b.id));
  const selected = ordered.filter((b) => sel.has(b.id));
  // unselected stay below, selected float on top — preserving each group's order.
  return renumber([...unselected, ...selected]);
}

/** Move selected blocks to the BOTTOM of the stack (lowest z), keeping their order. */
export function sendToBack<T extends Block>(blocks: readonly T[], ids: readonly string[]): T[] {
  const sel = idSet(ids);
  const ordered = sortedByZ(cloneAll(blocks));
  const unselected = ordered.filter((b) => !sel.has(b.id));
  const selected = ordered.filter((b) => sel.has(b.id));
  return renumber([...selected, ...unselected]);
}

/**
 * Move each selected block one step UP the stack. Processed top→bottom so a
 * contiguous selected band moves together without members leapfrogging. A
 * selected block already at the top (or below another selected block that's
 * already at the top) stays put.
 */
export function bringForward<T extends Block>(blocks: readonly T[], ids: readonly string[]): T[] {
  const sel = idSet(ids);
  const order = sortedByZ(cloneAll(blocks)); // bottom→top
  // Walk from top to bottom; swap a selected block with its upper neighbour if
  // that neighbour is unselected.
  for (let i = order.length - 2; i >= 0; i--) {
    if (sel.has(order[i].id) && !sel.has(order[i + 1].id)) {
      const tmp = order[i];
      order[i] = order[i + 1];
      order[i + 1] = tmp;
    }
  }
  return renumber(order);
}

/**
 * Move each selected block one step DOWN the stack. Mirror of bringForward:
 * walk bottom→top, swapping a selected block with its lower neighbour if that
 * neighbour is unselected.
 */
export function sendBackward<T extends Block>(blocks: readonly T[], ids: readonly string[]): T[] {
  const sel = idSet(ids);
  const order = sortedByZ(cloneAll(blocks)); // bottom→top
  for (let i = 1; i < order.length; i++) {
    if (sel.has(order[i].id) && !sel.has(order[i - 1].id)) {
      const tmp = order[i];
      order[i] = order[i - 1];
      order[i - 1] = tmp;
    }
  }
  return renumber(order);
}

// ── Align ─────────────────────────────────────────────────────────────────────

/** The reference bbox to align against, 0–100 for canvas or the selection union. */
function referenceBBox(selected: readonly ArrangeBlock[], relativeTo: AlignRelativeTo): BBox {
  if (relativeTo === 'canvas') {
    return { left: 0, top: 0, right: 100, bottom: 100 };
  }
  return unionBBox(selected);
}

/**
 * Align the selected blocks to a shared edge.
 *
 *   edge: left | center | right  → moves x (horizontal alignment)
 *         top  | middle | bottom → moves y (vertical alignment)
 *   relativeTo: 'canvas' aligns to the 0–100 surface; 'selection' aligns to
 *               the combined bounding box of the selected blocks.
 *
 * Each block's own width/height is respected (e.g. align-right places each
 * block's right edge on the reference right). Unselected blocks are untouched.
 * Rotation is ignored (axis-aligned bbox — see header).
 */
export function align<T extends Block>(
  blocks: readonly T[],
  ids: readonly string[],
  edge: AlignEdge,
  relativeTo: AlignRelativeTo,
): T[] {
  const sel = idSet(ids);
  const selected = blocks.filter((b) => sel.has(b.id));
  if (selected.length === 0) return cloneAll(blocks);

  const ref = referenceBBox(selected, relativeTo);

  return blocks.map((b) => {
    if (!sel.has(b.id)) return { ...b };
    const next = { ...b };
    switch (edge) {
      case 'left':
        next.x = ref.left;
        break;
      case 'right':
        next.x = ref.right - b.w;
        break;
      case 'center':
        next.x = ref.left + (ref.right - ref.left) / 2 - b.w / 2;
        break;
      case 'top':
        next.y = ref.top;
        break;
      case 'bottom':
        next.y = ref.bottom - b.h;
        break;
      case 'middle':
        next.y = ref.top + (ref.bottom - ref.top) / 2 - b.h / 2;
        break;
    }
    return next;
  });
}

// ── Group / ungroup / move (data ops) ─────────────────────────────────────────
//
// A "group" is purely a shared `groupId` tag across sibling blocks (see header
// PROPOSAL note — no persistent group node, no shared type change).

/** Generate a group id. Deterministic-ish but unique enough for client use. */
function makeGroupId(): string {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Tag the selected blocks as a single group. Returns new blocks where every
 * selected block carries the same fresh `groupId`. Pass `groupId` to reuse an
 * existing id (e.g. merging into a group); otherwise one is generated. If fewer
 * than one block is selected, blocks are returned unchanged (cloned).
 */
export function groupBlocks<T extends Block>(
  blocks: readonly T[],
  ids: readonly string[],
  groupId: string = makeGroupId(),
): T[] {
  const sel = idSet(ids);
  return blocks.map((b) => (sel.has(b.id) ? { ...b, groupId } : { ...b }));
}

/**
 * Remove the group tag from every block carrying `groupId`. Returns new blocks
 * with `groupId` cleared (set to undefined) on former members.
 */
export function ungroupBlocks<T extends Block>(blocks: readonly T[], groupId: string): T[] {
  return blocks.map((b) => (b.groupId === groupId ? { ...b, groupId: undefined } : { ...b }));
}

/**
 * Translate every member of a group together by (dxPct, dyPct) — the
 * nested-transform case. Offsets are in % of the card surface (same units as
 * x/y). Members keep their relative positions; non-members are untouched.
 */
export function moveGroup<T extends Block>(
  blocks: readonly T[],
  groupId: string,
  dxPct: number,
  dyPct: number,
): T[] {
  return blocks.map((b) =>
    b.groupId === groupId ? { ...b, x: b.x + dxPct, y: b.y + dyPct } : { ...b },
  );
}
