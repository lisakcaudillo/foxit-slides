// Foxit Slidewright — color + fill XML.
//
// OOXML colors are bare 6-digit hex (no '#') inside <a:srgbClr val="..."/>. A '#'
// makes PowerPoint drop the color. Fills come in three flavors it supports: solid,
// none, and a linear gradient (<a:gradFill>). Alpha maps to <a:alpha> (per-mille).

import { fracToPerMille } from './emu';

/** A solid fill with optional transparency (0..100, percent transparent). */
export interface SolidFill {
  kind: 'solid';
  color: string; // bare hex
  transparency?: number; // 0..100
}
/** A linear gradient fill. `angle` is OOXML 60000ths-of-a-degree. Stops are
 *  `pos` 0..100000 + bare-hex `color`. */
export interface GradientFill {
  kind: 'gradient';
  angle: number;
  stops: Array<{ pos: number; color: string }>;
}
export interface NoFill {
  kind: 'none';
}
/** A preset pattern fill (`<a:pattFill>`) — e.g. 'pct25', 'ltHorz', 'diagBrick'. */
export interface PatternFill {
  kind: 'pattern';
  preset: string;
  fgColor: string; // bare hex
  bgColor: string; // bare hex
}
export type Fill = SolidFill | GradientFill | NoFill | PatternFill;

/** Normalize a CSS-ish color to a bare 6-digit uppercase hex, or undefined. Handles
 *  `#rgb`, `#rrggbb`, and bare forms. (rgb()/gradient parsing lives in the exporter
 *  mapping layer, which hands the engine already-resolved fills.) */
export function normHex(c?: string): string | undefined {
  if (!c) return undefined;
  const s = c.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(s)) return (s[0] + s[0] + s[1] + s[1] + s[2] + s[2]).toUpperCase();
  return undefined;
}

/** `<a:srgbClr>` element, with an optional inner child (e.g. alpha). */
export function srgbClr(hex: string, inner = ''): string {
  return inner ? `<a:srgbClr val="${hex}">${inner}</a:srgbClr>` : `<a:srgbClr val="${hex}"/>`;
}

function alphaInner(transparency?: number): string {
  if (transparency == null || transparency <= 0) return '';
  // transparency percent → alpha per-mille (opacity).
  return `<a:alpha val="${fracToPerMille(1 - transparency / 100)}"/>`;
}

/** Render a Fill to its OOXML element (solid / gradient / pattern / none). */
export function fillXml(fill: Fill): string {
  if (fill.kind === 'none') return '<a:noFill/>';
  if (fill.kind === 'pattern') {
    return `<a:pattFill prst="${fill.preset}"><a:fgClr><a:srgbClr val="${fill.fgColor}"/></a:fgClr><a:bgClr><a:srgbClr val="${fill.bgColor}"/></a:bgClr></a:pattFill>`;
  }
  if (fill.kind === 'solid') {
    return `<a:solidFill>${srgbClr(fill.color, alphaInner(fill.transparency))}</a:solidFill>`;
  }
  // gradient
  const stops = [...fill.stops].sort((a, b) => a.pos - b.pos);
  const gs = stops
    .map((s) => `<a:gs pos="${Math.max(0, Math.min(100_000, Math.round(s.pos)))}"><a:srgbClr val="${s.color}"/></a:gs>`)
    .join('');
  return `<a:gradFill><a:gsLst>${gs}</a:gsLst><a:lin ang="${Math.round(fill.angle)}" scaled="1"/></a:gradFill>`;
}

export type DashType = 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot';
export type ArrowType = 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle';

/** A line/stroke: `<a:ln>` with width (EMU), solid color, dash style, and head/tail
 *  arrows (all 6 DrawingML variants). `headArrow`/`tailArrow` booleans stay for
 *  back-compat (→ triangle). Returns '' when no color. */
export function lineXml(opts?: {
  color?: string; widthEmu?: number; transparency?: number;
  headArrow?: boolean; tailArrow?: boolean;
  dashType?: DashType; beginArrow?: ArrowType; endArrow?: ArrowType;
} | null): string {
  if (!opts || !opts.color) return '';
  const begin = opts.beginArrow ?? (opts.headArrow ? 'triangle' : undefined);
  const end = opts.endArrow ?? (opts.tailArrow ? 'triangle' : undefined);
  const dash = opts.dashType && opts.dashType !== 'solid' ? `<a:prstDash val="${opts.dashType}"/>` : '';
  const arrows =
    (begin && begin !== 'none' ? `<a:headEnd type="${begin}"/>` : '') +
    (end && end !== 'none' ? `<a:tailEnd type="${end}"/>` : '');
  // spPr line child order: solidFill, prstDash, then head/tail ends.
  return `<a:ln${opts.widthEmu ? ` w="${opts.widthEmu}"` : ''}><a:solidFill>${srgbClr(opts.color, alphaInner(opts.transparency))}</a:solidFill>${dash}${arrows}</a:ln>`;
}
