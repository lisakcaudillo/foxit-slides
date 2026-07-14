/**
 * layout-cover-from-piece.ts — WI-1 (layout-as-data), the cover emitter.
 *
 * Reads an approved `CoverLayoutPiece` (DATA) and REPLAYS its saved {x,y,w,h}
 * geometry into positioned freeform blocks. Pure + deterministic: same piece +
 * same content → byte-identical blocks every run (stable ids derived from the
 * piece id + slot name, no Date.now/random). Mirrors the data-driven engine in
 * structuredToFreeform.ts (`layoutFromPiece`), but cover-shaped (named slots)
 * instead of grid-shaped.
 *
 * The decoration is NOT a block — it is the named `treatment`, rendered verbatim
 * by the CoverDecoration component behind these blocks. Here it emits only the
 * text slots + the hairline divider rule.
 *
 * Typography is owned by the existing lock-the-box `textBlock` (slide-typography):
 * the box is FIXED, real titles shrink to the role floor to fit. autoLayout is
 * OFF (these are placed at the captured geometry and never moved).
 */

import type { FreeformBlock, FreeformShapeBlock } from '@/types/card-template';
import { textBlock } from './slide-typography';
import type { CoverLayoutPiece, CoverSlotRegion } from './cover-layout-pieces';
import { COVER_LAYOUT_PIECES, COVER_LAYOUT_ROTATION } from './cover-layout-pieces';

/** Deterministic string hash → index in [0, mod). Stable across runs (no random)
 *  so a given deck always rotates to the same cover layout. */
function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return mod > 0 ? Math.abs(h) % mod : 0;
}

/**
 * THE BYPASS DECISION (WI-1) — pure + unit-testable. Decides whether a cover
 * replays an approved LayoutPiece (returns its id) or falls through to the
 * legacy designCover path (returns null). The guard in composeGeneratedCover
 * calls this; a NON-null result means designCover is short-circuited, a null
 * result means the legacy Designer runs — the "designCover did/didn't run" proof
 * is readable straight from this return value.
 *
 * Rules:
 *   • An image cover never uses a piece (the image path owns it) → null.
 *   • An explicit, KNOWN `coverLayoutId` wins (replays that exact layout).
 *   • Otherwise an EDITORIAL (Quartz-family) no-image cover is assigned one by
 *     deterministic rotation over the deck id (the alternatives the generator
 *     rotates through).
 *   • Any other archetype with no explicit id → null (legacy designCover).
 */
export function resolveCoverPiece(opts: {
  coverLayoutId?: string;
  archetype: string;
  hasImage: boolean;
  deckId: string;
}): string | null {
  if (opts.hasImage) return null;
  if (opts.coverLayoutId && COVER_LAYOUT_PIECES[opts.coverLayoutId]) return opts.coverLayoutId;
  if (opts.archetype === 'editorial' && COVER_LAYOUT_ROTATION.length > 0) {
    return COVER_LAYOUT_ROTATION[hashIndex(opts.deckId, COVER_LAYOUT_ROTATION.length)];
  }
  return null;
}

/** The text content the cover renders. Author/date/eyebrow/subtitle are optional
 *  — a slot is emitted only when the piece declares it AND content is present.
 *  Title is required (a cover always has a title). */
export interface CoverContent {
  title: string;
  subtitle?: string;
  /** Eyebrow text (writer-supplied or a derived kicker). */
  eyebrow?: string;
  author?: string;
  date?: string;
}

/** Convert a hex color + 0–1 opacity into an rgba() string. The freeform shape
 *  model carries no opacity field, so the divider's opacity is baked into fill. */
function withOpacity(hex: string, opacity: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Emit one text slot as a locked, fixed-position freeform block. Returns null
 *  when the slot has no content to render. */
function emitSlot(
  id: string,
  slot: CoverSlotRegion | undefined,
  content: string | undefined,
  z: number,
): FreeformBlock | null {
  if (!slot) return null;
  const text = content?.trim();
  if (!text) return null;
  const shown = slot.uppercase ? text.toUpperCase() : text;
  const block = textBlock({
    id,
    role: slot.role,
    content: shown,
    x: slot.x, y: slot.y, w: slot.w, h: slot.h,
    color: slot.color,
    align: slot.align ?? 'left',
    z,
    lock: true, // lock-the-box: fixed box, text shrinks to fit (never grows / moves)
  });
  // Italic (D's serif subtitle) — the role scale carries no italic flag, so add
  // it to the resolved style without disturbing geometry.
  if (slot.italic && block.type === 'text') {
    block.style = { ...(block.style ?? {}), italic: true };
  }
  return block;
}

/**
 * Replay an approved cover piece into positioned freeform blocks. Deterministic.
 * z-order: divider (3) under text (4+) — all above the decoration layer (which
 * the renderer paints behind, z=0/1).
 */
export function layoutCoverFromPiece(
  piece: CoverLayoutPiece,
  content: CoverContent,
): FreeformBlock[] {
  const out: FreeformBlock[] = [];
  const idp = piece.id;

  // Hairline divider rule (structural — always emitted when the piece has one).
  if (piece.divider) {
    const d = piece.divider;
    const fill = d.opacity != null ? withOpacity(d.color, d.opacity) : d.color;
    out.push({
      id: `cv-${idp}-divider`,
      type: 'shape',
      shape: 'rectangle',
      x: d.x, y: d.y, w: d.w, h: d.h,
      rotation: 0,
      z: 3,
      fill,
    } as FreeformShapeBlock);
  }

  // Text slots, top→bottom. Title is required; the rest are conditional.
  let z = 4;
  const push = (b: FreeformBlock | null) => { if (b) { out.push(b); z += 1; } };
  push(emitSlot(`cv-${idp}-eyebrow`, piece.slots.eyebrow, content.eyebrow, z));
  push(emitSlot(`cv-${idp}-title`, piece.slots.title, content.title, z));
  push(emitSlot(`cv-${idp}-subtitle`, piece.slots.subtitle, content.subtitle, z));
  push(emitSlot(`cv-${idp}-author`, piece.slots.author, content.author, z));
  push(emitSlot(`cv-${idp}-date`, piece.slots.date, content.date, z));

  return out;
}
