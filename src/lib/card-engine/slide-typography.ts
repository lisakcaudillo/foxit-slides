/**
 * Slide typography — the PPT-placeholder guarantee, shared by the AI composer
 * (design-time) and the deterministic render templates (runtime).
 *
 * A caller specifies each text by its SEMANTIC role (title / section / body…)
 * and a box; this layer owns the pixels: a fixed type scale (the title is
 * always dominant) + autofit (shrink to a per-role floor, then grow the box)
 * so text never clips. The AI never sets font sizes; neither does a template —
 * they declare roles, this guarantees the typography.
 *
 * Geometry is in % of the 960×540 reference card.
 */
import type { FreeformBlock } from '@/types/card-template';

export type Role = 'title' | 'subtitle' | 'eyebrow' | 'section' | 'body' | 'stat';

interface RoleStyle { variant: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing?: number }

/** The type scale (px on 960×540). Title is the largest non-stat role. */
export const ROLE_STYLE: Record<Role, RoleStyle> = {
  title:    { variant: 'heading',    fontSize: 42, fontWeight: 800, lineHeight: 1.1 },
  subtitle: { variant: 'subheading', fontSize: 19, fontWeight: 400, lineHeight: 1.35 },
  eyebrow:  { variant: 'subheading', fontSize: 13, fontWeight: 700, lineHeight: 1.2, letterSpacing: 2 },
  section:  { variant: 'subheading', fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
  body:     { variant: 'paragraph',  fontSize: 16, fontWeight: 400, lineHeight: 1.4 },
  stat:     { variant: 'metric',     fontSize: 46, fontWeight: 800, lineHeight: 1.0 },
};

/** Smallest acceptable size per role before it grows the box instead of shrinking. */
export const ROLE_FLOOR: Record<Role, number> = { title: 26, subtitle: 13, eyebrow: 11, section: 14, body: 12, stat: 24 };

export const CANVAS = { w: 960, h: 540 };

/** Estimate rendered text height (px) for a box of the given pixel width. */
export function estHeight(text: string, fontSize: number, boxWpx: number, lineHeight: number): number {
  const cpl = Math.max(1, Math.floor((boxWpx - 10) / (fontSize * 0.55)));
  let lines = 0;
  for (const ln of String(text).split('\n')) lines += Math.max(1, Math.ceil((ln.length || 1) / cpl));
  return lines * fontSize * lineHeight + 8;
}

/** Estimated width (px) of the longest single WORD at a font size. A word can't
 *  wrap, so if it exceeds the box width the renderer breaks it mid-character
 *  ("Microso/ft"). The fit uses this to shrink until the longest word fits the
 *  box, so titles never split a word. Same 0.55 avg-glyph factor as estHeight. */
export function longestWordPx(text: string, fontSize: number): number {
  let maxLen = 0;
  for (const w of String(text).split(/\s+/)) if (w.length > maxLen) maxLen = w.length;
  return maxLen * fontSize * 0.55;
}

export interface TextSpec {
  id: string;
  role: Role;
  content: string;
  /** Box in % of the card. */
  x: number; y: number; w: number; h: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  z?: number;
  /** Lock-the-box (layout-first): when true the box height is FIXED — text
   *  shrinks to the role floor to fit, but the box is never grown. Content that
   *  still won't fit at the floor is a budget violation (too much for the slot),
   *  surfaced by the render clipping rather than by a box that collides with the
   *  block below + the measure-after correction. Default false = legacy
   *  react-to-content behavior (grow the box), so existing callers are unchanged. */
  lock?: boolean;
}

/** Build a role-sized, autofit FreeformTextBlock from a semantic spec. Text
 *  shrinks to the role floor to fit the box. When `spec.lock` is set the box
 *  height is held fixed (lock-the-box); otherwise the box may grow to fit the
 *  content at the floor size (legacy default). */
export function textBlock(spec: TextSpec): FreeformBlock {
  const rs = ROLE_STYLE[spec.role];
  const floor = ROLE_FLOOR[spec.role];
  const boxWpx = (spec.w / 100) * CANVAS.w;
  const usableWpx = boxWpx - 10; // matches estHeight's horizontal padding allowance
  let h = spec.h;
  let fs = rs.fontSize;
  // Shrink to the role floor until BOTH the height fits the box AND the longest
  // single word fits the box width — the latter prevents the renderer from
  // splitting an unbreakable word mid-character (e.g. "Microso/ft" on a title).
  while (
    fs > floor &&
    (estHeight(spec.content, fs, boxWpx, rs.lineHeight) > (h / 100) * CANVAS.h ||
      longestWordPx(spec.content, fs) > usableWpx)
  ) fs -= 1;
  const needPx = estHeight(spec.content, fs, boxWpx, rs.lineHeight);
  if (!spec.lock && needPx > (h / 100) * CANVAS.h) h = Math.min(100 - spec.y, (needPx / CANVAS.h) * 100);
  return {
    id: spec.id, type: 'text', x: spec.x, y: spec.y, w: spec.w, h, rotation: 0, z: spec.z ?? 2,
    variant: rs.variant, content: spec.content,
    style: {
      fontSize: fs, fontWeight: rs.fontWeight, lineHeight: rs.lineHeight,
      ...(rs.letterSpacing ? { letterSpacing: rs.letterSpacing } : {}),
      ...(spec.color ? { color: spec.color } : {}),
      ...(spec.align ? { textAlign: spec.align } : {}),
    },
  } as FreeformBlock;
}

/** Resolve a role from a legacy variant (used when a caller has no explicit role). */
export const VARIANT_TO_ROLE: Record<string, Role> = {
  heading: 'section', subheading: 'section', paragraph: 'body', metric: 'stat',
};
