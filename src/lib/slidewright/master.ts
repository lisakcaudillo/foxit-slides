// Foxit Slidewright — custom slide masters + placeholders (PRD P1).
//
// A slide master defines reusable, named placeholders (title/body/pic/…) each with
// a position, size, and default text format. A slide binds content to a placeholder
// by name and inherits that geometry + format. It emits a matching <p:ph type idx>
// on the master, the layout, and the slide so PowerPoint links them (idx must be
// identical across all three — the one real correctness rule, per the PRD).
//
// Package note: a custom master REPLACES the content of slideMaster1.xml /
// slideLayout1.xml — the part names, rels graph, and content-types are unchanged,
// so there is no rId bookkeeping to get wrong.

import { XML_DECL, escapeAttr } from './xml';
import { inchToEmu, ptToCentipoint } from './emu';
import { normHex, fillXml } from './colors';
import { masterTxStyles, STD_CLR_MAP } from './boilerplate';

const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/** The placeholder kinds it supports (a subset of ST_PlaceholderType). */
export type PlaceholderType = 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'pic' | 'tbl' | 'chart' | 'media';

/** A named placeholder on a master: geometry (inches) + default text format. */
export interface PlaceholderDef {
  name: string; // caller's lookup key (e.g. 'title')
  type: PlaceholderType;
  x: number; y: number; w: number; h: number; // inches
  align?: 'left' | 'center' | 'right' | 'justify';
  valign?: 'top' | 'middle' | 'bottom';
  fontFace?: string;
  sizePt?: number;
  color?: string; // bare/#hex
  bold?: boolean;
}

/** A slide master definition. */
export interface SlideMasterDef {
  name: string;
  background?: { color?: string };
  slideNumber?: boolean; // render a slide-number field on bound slides
  placeholders: PlaceholderDef[];
}

/** A placeholder def with its assigned idx (title/ctrTitle carry none). */
export interface ResolvedPlaceholder extends PlaceholderDef {
  idx?: number;
}
export type PlaceholderRegistry = Map<string, ResolvedPlaceholder>;

/** Assign each placeholder a stable idx (title/ctrTitle use type only; every other
 *  kind gets a unique incrementing idx, reused verbatim on master/layout/slide). */
export function buildRegistry(def: SlideMasterDef): PlaceholderRegistry {
  const reg: PlaceholderRegistry = new Map();
  let idx = 0;
  for (const p of def.placeholders) {
    const isTitle = p.type === 'title' || p.type === 'ctrTitle';
    reg.set(p.name, { ...p, idx: isTitle ? undefined : ++idx });
  }
  return reg;
}

/** The `<p:ph type idx>` element for a slide's placeholder-bound content. */
export function phTag(ph: ResolvedPlaceholder): string {
  return `<p:ph type="${ph.type}"${ph.idx != null ? ` idx="${ph.idx}"` : ''}/>`;
}

/** Human-readable placeholder shape name (matches PowerPoint's conventions). */
export function phName(t: PlaceholderType): string {
  switch (t) {
    case 'title': case 'ctrTitle': return 'Title';
    case 'subTitle': return 'Subtitle';
    case 'body': return 'Content Placeholder';
    case 'pic': return 'Picture Placeholder';
    case 'tbl': return 'Table Placeholder';
    case 'chart': return 'Chart Placeholder';
    case 'media': return 'Media Placeholder';
  }
}

function anchorOf(v?: string): string { return v === 'middle' ? 'ctr' : v === 'bottom' ? 'b' : 't'; }
function algnOf(a?: string): string { return a === 'center' ? 'ctr' : a === 'right' ? 'r' : a === 'justify' ? 'just' : 'l'; }

const GROUP =
  `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

/** One placeholder `<p:sp>` for the master/layout spTree: geometry + the default
 *  run format baked into lvl1 so inheritance carries it too. */
function phShape(id: number, ph: ResolvedPlaceholder): string {
  const xf = `<a:xfrm><a:off x="${inchToEmu(ph.x)}" y="${inchToEmu(ph.y)}"/><a:ext cx="${inchToEmu(ph.w)}" cy="${inchToEmu(ph.h)}"/></a:xfrm>`;
  const color = normHex(ph.color);
  const defRPr =
    `<a:defRPr sz="${ptToCentipoint(ph.sizePt ?? 18)}"${ph.bold ? ' b="1"' : ''}>` +
    (color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : '') +
    (ph.fontFace ? `<a:latin typeface="${escapeAttr(ph.fontFace)}"/><a:cs typeface="${escapeAttr(ph.fontFace)}"/>` : '') +
    `</a:defRPr>`;
  const lst = `<a:lstStyle><a:lvl1pPr algn="${algnOf(ph.align)}">${defRPr}</a:lvl1pPr></a:lstStyle>`;
  const body = `<p:txBody><a:bodyPr anchor="${anchorOf(ph.valign)}"/>${lst}<a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${phName(ph.type)} ${id}"/>` +
    `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${phTag(ph)}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xf}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${body}</p:sp>`
  );
}

/** Placeholder types that belong in the slide MASTER's shape tree. The specific
 *  content placeholders (pic/tbl/chart/media) live only on the layout — a master
 *  that carries them makes PowerPoint report the file as needing repair. */
const MASTER_PH_TYPES = new Set<PlaceholderType>(['title', 'ctrTitle', 'subTitle', 'body']);

/** The custom slide master (spTree of the title/body prototype placeholders +
 *  optional background). Content placeholders (pic/tbl/chart/media) are layout-only. */
export function customSlideMasterXml(def: SlideMasterDef, reg: PlaceholderRegistry): string {
  const bg = def.background?.color
    ? `<p:bg><p:bgPr>${fillXml({ kind: 'solid', color: normHex(def.background.color) ?? 'FFFFFF' })}<a:effectLst/></p:bgPr></p:bg>`
    : '';
  let id = 1;
  const sps = [...reg.values()].filter((ph) => MASTER_PH_TYPES.has(ph.type)).map((ph) => phShape(++id, ph)).join('');
  return (
    XML_DECL +
    `<p:sldMaster ${A_NS} ${R_NS} ${P_NS}>` +
    `<p:cSld>${bg}<p:spTree>${GROUP}${sps}</p:spTree></p:cSld>` +
    STD_CLR_MAP +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
    `<p:txStyles>${masterTxStyles()}</p:txStyles>` +
    `</p:sldMaster>`
  );
}

/** The custom slide layout — re-declares the same placeholders so the
 *  master↔layout↔slide inheritance chain is complete. */
export function customSlideLayoutXml(def: SlideMasterDef, reg: PlaceholderRegistry): string {
  let id = 1;
  const sps = [...reg.values()].map((ph) => phShape(++id, ph)).join('');
  return (
    XML_DECL +
    `<p:sldLayout ${A_NS} ${R_NS} ${P_NS} type="obj" preserve="1">` +
    `<p:cSld name="${escapeAttr(def.name)}"><p:spTree>${GROUP}${sps}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  );
}
