// Foxit Slidewright — public API + package assembly.
//
// Foxit's own in-house OpenXML PowerPoint writer (Foxit Slides's exporter runs on it).
// No pptxgenjs, no third-party PPTX code: we emit the OOXML parts directly
// (informed by the format structure + real PowerPoint output) and zip them with
// jszip (a general compression lib). The API mirrors the shape of a slide builder —
// createDeck() → slide.addText/addShape/addImage/addTable/addChart → deck.write() —
// so the exporter mapping stays simple.
//
// Geometry is in INCHES at the API boundary (converted to EMU internally); font
// sizes in POINTS; angles in DEGREES. A 16:9 widescreen slide is 13.333in × 7.5in.

import JSZip from 'jszip';
import { XML_DECL, escapeText, escapeAttr } from './xml';
import { inchToEmu, ptToCentipoint, ptToEmu, degToOoxmlAngle, fracToPerMille } from './emu';
import { type Fill, fillXml, lineXml, normHex } from './colors';
import {
  themeXml,
  slideMasterXml,
  slideLayoutXml,
  presPropsXml,
  viewPropsXml,
  tableStylesXml,
  corePropsXml,
  appPropsXml,
  notesMasterXml,
  notesSlideXml,
} from './boilerplate';
import { buildTableFrame, type TableSpec } from './table';
import { buildChart, buildCombo, type ChartSpec, type ComboChartSpec } from './chart';
import {
  buildRegistry,
  customSlideMasterXml,
  customSlideLayoutXml,
  phTag,
  phName,
  type SlideMasterDef,
  type ResolvedPlaceholder,
  type PlaceholderRegistry,
} from './master';

export type { SlideMasterDef, PlaceholderDef, PlaceholderType } from './master';

/** Human-readable name of this engine (stamped into the .pptx Application field). */
export const SLIDEWRIGHT_NAME = 'Foxit Slidewright';
/** Engine version. */
export const SLIDEWRIGHT_VERSION = '1.0.0';

const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

// ── Public option types ──────────────────────────────────────────────────────
export type HAlign = 'left' | 'center' | 'right' | 'justify';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface Hyperlink {
  external?: string; // a URL (opens externally)
  slideIndex?: number; // 1-based slide number (internal jump)
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string; // solid run color (bare hex or #hex)
  gradient?: Fill; // gradient run fill (overrides color) — editable gradient text
  sizePt?: number;
  fontFace?: string;
  hyperlink?: Hyperlink;
  // ── Wave-3 text effects (per-run; fall back to the box default) ──
  subscript?: boolean;
  superscript?: boolean;
  outlineColor?: string; // text outline (a:ln in rPr)
  outlineWidthPt?: number;
  glowColor?: string; // text glow
  glowRadiusPt?: number;
  highlight?: string; // highlight color (marker)
}

export interface TextBoxOpts {
  x?: number; y?: number; w?: number; h?: number; // inches — optional when `placeholder` supplies them
  placeholder?: string; // bind to a master placeholder by name (inherits geometry + format)
  align?: HAlign;
  valign?: VAlign;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  gradient?: Fill;
  fontFace?: string;
  lineSpacingMultiple?: number;
  letterSpacingPt?: number;
  rotationDeg?: number;
  wrap?: boolean;
  shape?: PresetGeom; // when set, the text lives inside a shape (fill/line apply)
  fill?: Fill;
  line?: Parameters<typeof lineXml>[0];
  rectRadiusIn?: number;
  shadow?: ShadowSpec;
  // ── Wave-3 text effects (box defaults for every run) ──
  subscript?: boolean;
  superscript?: boolean;
  outlineColor?: string;
  outlineWidthPt?: number;
  glowColor?: string;
  glowRadiusPt?: number;
  highlight?: string;
  // ── Wave-3 paragraph / body ──
  lineSpacingExactPt?: number; // "Exactly" line spacing (wins over lineSpacingMultiple)
  paraSpaceBeforePt?: number;
  paraSpaceAfterPt?: number;
  tabStopsIn?: number[];
  textDirection?: 'horz' | 'vert' | 'vert270' | 'wordArtVert';
  autoFit?: 'none' | 'shrink' | 'resize'; // shrink=normAutofit, resize=spAutoFit
  rtl?: boolean; // right-to-left paragraph direction
}

/** A named OOXML preset geometry. The four Foxit Slides uses are first-class; any other
 *  valid preset name (the full DrawingML catalogue) also passes through. */
export type PresetGeom = 'rect' | 'roundRect' | 'ellipse' | 'line' | (string & {});

/** A custom-geometry path command. Points are FRACTIONS 0..1 of the shape box.
 *  move/line take one point; cubic takes 3 (two control + end); quad takes 2. */
export type GeomCmd =
  | { move: [number, number] }
  | { line: [number, number] }
  | { cubic: [[number, number], [number, number], [number, number]] }
  | { quad: [[number, number], [number, number]] }
  | 'close';

/** A drop shadow (`<a:outerShdw>`). */
export interface ShadowSpec {
  colorHex: string;
  opacity?: number; // 0..1 shadow alpha
  blurIn?: number;
  distIn?: number;
  dirDeg?: number; // direction, 0 = right, clockwise
}

export interface ShapeOpts {
  x: number; y: number; w: number; h: number;
  fill?: Fill;
  line?: Parameters<typeof lineXml>[0];
  rectRadiusIn?: number; // roundRect corner radius, inches
  rotationDeg?: number;
  shadow?: ShadowSpec;
  flipH?: boolean;
  flipV?: boolean;
  /** Start/end sweep angle (degrees) for arc/pie/blockArc/chord presets. */
  angleStartDeg?: number;
  angleEndDeg?: number;
  /** Custom freeform geometry (overrides the preset). Points are fractions 0..1. */
  geom?: GeomCmd[];
  /** Fill the shape with an image (data URL) instead of a solid/gradient. */
  imageFill?: string;
}

export interface ImageOpts {
  data: string; // data: URL
  x?: number; y?: number; w?: number; h?: number; // optional when `placeholder` supplies them
  placeholder?: string; // bind to a master `pic` placeholder by name
  rotationDeg?: number;
  rounded?: boolean; // circular crop
  sizing?: 'cover' | 'contain'; // aspect-preserving fill (crop) / fit (letterbox)
  opacity?: number; // 0..1 render opacity (1 = opaque)
  flipH?: boolean;
  flipV?: boolean;
  shadow?: ShadowSpec;
  altText?: string; // accessibility description
  /** Explicit crop insets as fractions 0..1 of each edge (overrides `sizing`). */
  crop?: { l?: number; r?: number; t?: number; b?: number };
}

export interface MediaOpts {
  type: 'video' | 'audio' | 'online';
  data?: string; // data: URL for embedded audio/video
  link?: string; // external URL for `online`
  poster?: string; // poster image data URL (default gray)
  x: number; y: number; w: number; h: number;
}

export interface ListItem { text: string; label?: string }
export interface ListOpts {
  x: number; y: number; w: number; h: number;
  items: ListItem[];
  marker?: 'bullet' | 'number' | 'none';
  labelLayout?: 'inline' | 'stacked';
  sizePt?: number;
  color?: string;
  fontFace?: string;
  lineSpacingMultiple?: number;
  gapPt?: number;
}

// ── Media + rels bookkeeping ─────────────────────────────────────────────────
interface Rel { id: string; type: string; target: string; mode?: 'External' }
interface Media { partName: string; ext: string; bytes: Uint8Array; contentType: string }

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

let mediaSeq = 0; // global media part counter (unique across the deck)
let chartSeq = 0;

// ── Slide ────────────────────────────────────────────────────────────────────
export class Slide {
  readonly index: number; // 1-based
  private body: string[] = [];
  private rels: Rel[] = [];
  private relSeq = 0;
  private shapeId = 1; // 1 = the group shape; real shapes start at 2
  private bg?: string; // <p:bg> inner
  /** media/chart parts this slide contributed (collected by the deck at package time). */
  readonly media: Media[] = [];
  readonly parts: Array<{ partName: string; content: string; contentType: string }> = [];
  /** Speaker notes (set via addNotes); the deck emits a notesSlide part if present. */
  notes?: string;
  /** Whether to render a slide-number field (set by the deck when slideNumbers is on). */
  showSlideNumber = false;
  /** The master's placeholder registry, if this slide is bound to a master. */
  private placeholders?: PlaceholderRegistry;

  constructor(index: number) {
    this.index = index;
  }

  /** Bind this slide to a master's placeholder registry (deck-internal). */
  setPlaceholders(reg: PlaceholderRegistry): void {
    this.placeholders = reg;
  }

  /** Resolve a placeholder by name (only when the slide is master-bound). */
  private ph(name?: string): ResolvedPlaceholder | undefined {
    return name ? this.placeholders?.get(name) : undefined;
  }

  /** Concrete geometry from explicit opts, falling back to a placeholder, then a
   *  safe default. */
  private geomFor(o: { x?: number; y?: number; w?: number; h?: number }, ph?: ResolvedPlaceholder): { x: number; y: number; w: number; h: number } {
    return {
      x: o.x ?? ph?.x ?? 1,
      y: o.y ?? ph?.y ?? 1,
      w: o.w ?? ph?.w ?? 4,
      h: o.h ?? ph?.h ?? 2,
    };
  }

  /** Speaker notes for this slide (shown in the presenter/notes view). */
  addNotes(text: string): void {
    this.notes = text;
  }

  /** Register the relationship from this slide to its notes slide (deck-internal). */
  linkNotesSlide(notesIndex: number): void {
    this.addRel('notesSlide', `../notesSlides/notesSlide${notesIndex}.xml`);
  }

  /** A bottom-right slide-number field placeholder (`<a:fld type="slidenum">`). */
  private slideNumberSp(): string {
    if (!this.showSlideNumber) return '';
    const id = this.nextShapeId();
    const x = inchToEmu(SLIDE_W_IN - 1.2), y = inchToEmu(SLIDE_H_IN - 0.5), w = inchToEmu(1), h = inchToEmu(0.35);
    return (
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Slide Number Placeholder ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
      `<p:nvPr><p:ph type="sldNum" sz="quarter" idx="4294967295"/></p:nvPr></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
      `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="r"/><a:fld id="{858D2B98-1C6B-4F5A-9E42-5B3E5A6E7F01}" type="slidenum"><a:rPr lang="en-US"/><a:t>2</a:t></a:fld></a:p></p:txBody></p:sp>`
    );
  }

  private nextRid(): string {
    return `rId${++this.relSeq}`;
  }
  private nextShapeId(): number {
    return ++this.shapeId;
  }
  private addRel(type: string, target: string, mode?: 'External'): string {
    const id = this.nextRid();
    this.rels.push({ id, type: `${REL}/${type}`, target, mode });
    return id;
  }
  /** Add a relationship with a FULL type URI (e.g. the MS media rel type). */
  private addRelRaw(fullType: string, target: string, mode?: 'External'): string {
    const id = this.nextRid();
    this.rels.push({ id, type: fullType, target, mode });
    return id;
  }

  /** Solid background color (bare/#hex). */
  setBackgroundColor(hex: string): void {
    const h = normHex(hex) ?? 'FFFFFF';
    this.bg = `<p:bg><p:bgPr>${fillXml({ kind: 'solid', color: h })}<a:effectLst/></p:bgPr></p:bg>`;
  }
  /** Full-bleed background image (data URL). Rendered as a picture behind content
   *  is handled by addImage at 0,0,full; slide.background element only supports a
   *  fill, so a cover image is added as the first shape by the exporter. This sets
   *  a fallback solid behind it. */
  setBackgroundImageFallback(hex: string): void {
    this.setBackgroundColor(hex);
  }

  private xfrm(x: number, y: number, w: number, h: number, rotationDeg?: number, flipH?: boolean, flipV?: boolean): string {
    const rot = rotationDeg ? ` rot="${degToOoxmlAngle(rotationDeg)}"` : '';
    const fh = flipH ? ' flipH="1"' : '';
    const fv = flipV ? ' flipV="1"' : '';
    return `<a:xfrm${rot}${fh}${fv}><a:off x="${inchToEmu(x)}" y="${inchToEmu(y)}"/><a:ext cx="${inchToEmu(w)}" cy="${inchToEmu(h)}"/></a:xfrm>`;
  }

  private prstGeom(preset: PresetGeom, rectRadiusIn?: number, w?: number, h?: number, angleStartDeg?: number, angleEndDeg?: number): string {
    if (preset === 'roundRect' && rectRadiusIn && w && h) {
      // roundRect adj is the corner radius as a fraction (×100000) of the shorter side.
      const frac = Math.max(0, Math.min(0.5, rectRadiusIn / Math.min(w, h)));
      return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(frac * 100_000)}"/></a:avLst></a:prstGeom>`;
    }
    // Any DrawingML preset name passes through (the full ~187-shape catalogue);
    // `rect` is the safe default. Only [a-z0-9] names are accepted (schema-safe).
    const prst = /^[a-zA-Z][a-zA-Z0-9]*$/.test(preset) ? preset : 'rect';
    // Sweep angles for arc/pie/blockArc/chord (adj1=start, adj2=end, 60000ths).
    if (angleStartDeg != null && angleEndDeg != null && /^(arc|pie|pieWedge|blockArc|chord)$/.test(prst)) {
      const a = (d: number) => Math.round((((d % 360) + 360) % 360) * 60_000);
      return `<a:prstGeom prst="${prst}"><a:avLst><a:gd name="adj1" fmla="val ${a(angleStartDeg)}"/><a:gd name="adj2" fmla="val ${a(angleEndDeg)}"/></a:avLst></a:prstGeom>`;
    }
    return `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
  }

  /** Custom freeform geometry (`<a:custGeom>`). Path space = the box's EMU size;
   *  fractional points 0..1 map onto it. */
  private custGeomXml(cmds: GeomCmd[], w: number, h: number): string {
    const W = inchToEmu(w), H = inchToEmu(h);
    const px = (f: number) => Math.round(Math.max(0, Math.min(1, f)) * W);
    const py = (f: number) => Math.round(Math.max(0, Math.min(1, f)) * H);
    const pt = (p: [number, number]) => `<a:pt x="${px(p[0])}" y="${py(p[1])}"/>`;
    const path = cmds.map((c) => {
      if (c === 'close') return '<a:close/>';
      if ('move' in c) return `<a:moveTo>${pt(c.move)}</a:moveTo>`;
      if ('line' in c) return `<a:lnTo>${pt(c.line)}</a:lnTo>`;
      if ('cubic' in c) return `<a:cubicBezTo>${c.cubic.map(pt).join('')}</a:cubicBezTo>`;
      return `<a:quadBezTo>${c.quad.map(pt).join('')}</a:quadBezTo>`;
    }).join('');
    return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${W}" b="${H}"/><a:pathLst><a:path w="${W}" h="${H}">${path}</a:path></a:pathLst></a:custGeom>`;
  }

  private shadowXml(s?: ShadowSpec): string {
    if (!s) return '';
    const alpha = s.opacity != null ? `<a:alpha val="${fracToPerMille(Math.max(0, Math.min(1, s.opacity)))}"/>` : '';
    return `<a:effectLst><a:outerShdw blurRad="${inchToEmu(s.blurIn ?? 0.03)}" dist="${inchToEmu(s.distIn ?? 0.03)}" dir="${degToOoxmlAngle(s.dirDeg ?? 90)}" rotWithShape="0"><a:srgbClr val="${s.colorHex}">${alpha}</a:srgbClr></a:outerShdw></a:effectLst>`;
  }

  private runXml(run: TextRun, def: TextBoxOpts): string {
    const sz = ptToCentipoint(run.sizePt ?? def.sizePt ?? 18);
    const b = (run.bold ?? def.bold) ? ' b="1"' : '';
    const i = (run.italic ?? def.italic) ? ' i="1"' : '';
    const u = (run.underline ?? def.underline) ? ' u="sng"' : '';
    const strike = run.strike ? ' strike="sngStrike"' : '';
    const face = run.fontFace ?? def.fontFace;
    const color = normHex(run.color) ?? normHex(def.color);
    // Fill: gradient wins (editable gradient text), else solid color, else nothing.
    const fill = run.gradient
      ? fillXml(run.gradient)
      : def.gradient && run.color == null
      ? fillXml(def.gradient)
      : color
      ? fillXml({ kind: 'solid', color })
      : '';
    // Hyperlink → a rel + <a:hlinkClick>.
    let hlink = '';
    if (run.hyperlink?.external) {
      const rid = this.addRel('hyperlink', run.hyperlink.external, 'External');
      hlink = `<a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/>`;
    } else if (run.hyperlink?.slideIndex) {
      const rid = this.addRel('slide', `slide${run.hyperlink.slideIndex}.xml`);
      hlink = `<a:hlinkClick xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}" action="ppaction://hlinksldjump"/>`;
    }
    const latin = face ? `<a:latin typeface="${escapeAttr(face)}"/><a:cs typeface="${escapeAttr(face)}"/>` : '';
    // Sub/superscript → baseline; outline/glow/highlight in strict rPr child order:
    // ln, fill, effectLst(glow), highlight, latin, hlinkClick.
    const baseline = (run.superscript ?? def.superscript) ? ' baseline="30000"'
      : (run.subscript ?? def.subscript) ? ' baseline="-25000"' : '';
    const outlineC = normHex(run.outlineColor ?? def.outlineColor);
    const ln = outlineC ? `<a:ln w="${ptToEmu(run.outlineWidthPt ?? def.outlineWidthPt ?? 1)}"><a:solidFill><a:srgbClr val="${outlineC}"/></a:solidFill></a:ln>` : '';
    const glowC = normHex(run.glowColor ?? def.glowColor);
    const glow = glowC ? `<a:effectLst><a:glow rad="${ptToEmu(run.glowRadiusPt ?? def.glowRadiusPt ?? 4)}"><a:srgbClr val="${glowC}"><a:alpha val="60000"/></a:srgbClr></a:glow></a:effectLst>` : '';
    const hlC = normHex(run.highlight ?? def.highlight);
    const highlight = hlC ? `<a:highlight><a:srgbClr val="${hlC}"/></a:highlight>` : '';
    const rPr = `<a:rPr lang="en-US" sz="${sz}"${b}${i}${u}${strike}${baseline} dirty="0">${ln}${fill}${glow}${highlight}${latin}${hlink}</a:rPr>`;
    return `<a:r>${rPr}<a:t>${escapeText(run.text)}</a:t></a:r>`;
  }

  private txBody(runs: TextRun[], o: TextBoxOpts): string {
    const anchor = o.valign === 'middle' ? 'ctr' : o.valign === 'bottom' ? 'b' : 't';
    const wrap = o.wrap === false ? 'none' : 'square';
    const vert = o.textDirection && o.textDirection !== 'horz' ? ` vert="${o.textDirection}"` : '';
    const autoFit = o.autoFit === 'shrink' ? '<a:normAutofit/>' : o.autoFit === 'resize' ? '<a:spAutoFit/>' : '';
    const bodyPr = `<a:bodyPr wrap="${wrap}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${anchor}"${vert}>${autoFit}</a:bodyPr>`;
    const algn = o.align === 'center' ? 'ctr' : o.align === 'right' ? 'r' : o.align === 'justify' ? 'just' : 'l';
    // Exact line spacing wins over the multiple; then spcBef/spcAft; then bullets/tabs.
    const lnSpc = o.lineSpacingExactPt
      ? `<a:lnSpc><a:spcPts val="${Math.round(o.lineSpacingExactPt * 100)}"/></a:lnSpc>`
      : o.lineSpacingMultiple ? `<a:lnSpc><a:spcPct val="${Math.round(o.lineSpacingMultiple * 100_000)}"/></a:lnSpc>` : '';
    const spcBef = o.paraSpaceBeforePt != null ? `<a:spcBef><a:spcPts val="${Math.round(o.paraSpaceBeforePt * 100)}"/></a:spcBef>` : '';
    const spcAft = o.paraSpaceAfterPt != null ? `<a:spcAft><a:spcPts val="${Math.round(o.paraSpaceAfterPt * 100)}"/></a:spcAft>` : '';
    const tabLst = o.tabStopsIn && o.tabStopsIn.length
      ? `<a:tabLst>${o.tabStopsIn.map((t) => `<a:tab pos="${inchToEmu(t)}" algn="l"/>`).join('')}</a:tabLst>` : '';
    const spc = o.letterSpacingPt != null ? ` spc="${ptToCentipoint(o.letterSpacingPt)}"` : '';
    // Split runs on '\n' into paragraphs; each newline starts a new <a:p>.
    const paras: TextRun[][] = [[]];
    for (const r of runs) {
      const segs = r.text.split('\n');
      segs.forEach((seg, si) => {
        if (si > 0) paras.push([]);
        paras[paras.length - 1].push({ ...r, text: seg });
      });
    }
    const pXml = paras
      .map((pr) => {
        const rXml = pr.filter((r) => r.text.length > 0).map((r) => this.runXml(r, o)).join('');
        // pPr child order: lnSpc, spcBef, spcAft, buNone, tabLst.
        const rtl = o.rtl ? ' rtl="1"' : '';
        const pPr = `<a:pPr marL="0" algn="${algn}" indent="0"${rtl}${spc}>${lnSpc}${spcBef}${spcAft}<a:buNone/>${tabLst}</a:pPr>`;
        const endSz = ptToCentipoint(o.sizePt ?? 18);
        return `<a:p>${pPr}${rXml}<a:endParaRPr lang="en-US" sz="${endSz}" dirty="0"/></a:p>`;
      })
      .join('');
    return `<p:txBody>${bodyPr}<a:lstStyle/>${pXml}</p:txBody>`;
  }

  /** A text box (optionally inside a shape when `o.shape` is set, or bound to a
   *  master placeholder when `o.placeholder` is set). */
  addText(runs: TextRun[] | string, o: TextBoxOpts): void {
    const rs = typeof runs === 'string' ? [{ text: runs }] : runs;
    const id = this.nextShapeId();
    const ph = this.ph(o.placeholder);
    const g = this.geomFor(o, ph);
    // Placeholder supplies geometry + text-format defaults unless the call overrides.
    const m: TextBoxOpts = ph
      ? { ...o, ...g, align: o.align ?? ph.align, valign: o.valign ?? ph.valign, sizePt: o.sizePt ?? ph.sizePt, color: o.color ?? ph.color, bold: o.bold ?? ph.bold, fontFace: o.fontFace ?? ph.fontFace }
      : { ...o, ...g };
    const geomPreset: PresetGeom = o.shape ?? 'rect';
    const fill = o.shape && o.fill ? fillXml(o.fill) : '<a:noFill/>';
    const line = o.shape ? lineXml(o.line) : '';
    const name = ph ? phName(ph.type) : 'Text';
    // Placeholder shapes carry <p:ph> + a noGrp lock; plain text boxes get txBox="1".
    const cNvSpPr = ph ? `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` : `<p:cNvSpPr${o.shape ? '' : ' txBox="1"'}/>`;
    const nv = `<p:nvSpPr><p:cNvPr id="${id}" name="${name} ${id}"/>${cNvSpPr}<p:nvPr>${ph ? phTag(ph) : ''}</p:nvPr></p:nvSpPr>`;
    const spPr = `<p:spPr>${this.xfrm(g.x, g.y, g.w, g.h, o.rotationDeg)}${this.prstGeom(geomPreset, o.rectRadiusIn, g.w, g.h)}${fill}${line}${this.shadowXml(o.shadow)}</p:spPr>`;
    this.body.push(`<p:sp>${nv}${spPr}${this.txBody(rs, m)}</p:sp>`);
  }

  /** Fill a shape with an embedded image (`<a:blipFill>` in the spPr). */
  private imageFillXml(dataUrl: string): string {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return '<a:noFill/>';
    const partName = `ppt/media/image${++mediaSeq}.${parsed.ext}`;
    this.media.push({ partName, ext: parsed.ext, bytes: parsed.bytes, contentType: parsed.contentType });
    const rid = this.addRel('image', `../media/image${mediaSeq}.${parsed.ext}`);
    return `<a:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
  }

  /** A shape (no text). Use addText with `shape` set for a shape WITH text. */
  addShape(preset: PresetGeom, o: ShapeOpts): void {
    const id = this.nextShapeId();
    const fill = preset === 'line' ? '' : o.imageFill ? this.imageFillXml(o.imageFill) : o.fill ? fillXml(o.fill) : '<a:noFill/>';
    const line = preset === 'line'
      ? lineXml({ ...(o.line ?? {}), color: o.line?.color ?? '333333' })
      : lineXml(o.line);
    const nv = `<p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`;
    const geom = o.geom && o.geom.length
      ? this.custGeomXml(o.geom, o.w, o.h)
      : this.prstGeom(preset, o.rectRadiusIn, o.w, o.h, o.angleStartDeg, o.angleEndDeg);
    const spPr = `<p:spPr>${this.xfrm(o.x, o.y, o.w, o.h, o.rotationDeg, o.flipH, o.flipV)}${geom}${fill}${line}${this.shadowXml(o.shadow)}</p:spPr>`;
    // A body is required even for an empty shape.
    const empty = `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>`;
    this.body.push(`<p:sp>${nv}${spPr}${empty}</p:sp>`);
  }

  /** An embedded raster/SVG image from a data URL.
   *  Sizing is aspect-preserving (no distortion): `cover` center-crops the source
   *  to the box via <a:srcRect> (needs the image's intrinsic size, decoded from the
   *  PNG/JPEG header); `contain` shrinks the placed extent to fit inside the box,
   *  centered. If dimensions can't be read (e.g. SVG), it falls back to a plain
   *  stretch — SVG scales cleanly and our SVG uses are full-bleed. `opacity` maps to
   *  <a:alphaModFix>. */
  addImage(o: ImageOpts): void {
    const parsed = parseDataUrl(o.data);
    if (!parsed) return;
    const id = this.nextShapeId();
    const phDef = this.ph(o.placeholder);
    const g = this.geomFor(o, phDef);
    const partName = `ppt/media/image${++mediaSeq}.${parsed.ext}`;
    this.media.push({ partName, ext: parsed.ext, bytes: parsed.bytes, contentType: parsed.contentType });
    const rid = this.addRel('image', `../media/image${mediaSeq}.${parsed.ext}`);
    const descr = o.altText ? ` descr="${escapeAttr(o.altText)}"` : '';
    const picLocks = phDef ? `<a:picLocks noGrp="1" noChangeAspect="1"/>` : `<a:picLocks noChangeAspect="1"/>`;
    const nv = `<p:nvPicPr><p:cNvPr id="${id}" name="${phDef ? phName(phDef.type) : 'Picture'} ${id}"${descr}/><p:cNvPicPr>${picLocks}</p:cNvPicPr><p:nvPr>${phDef ? phTag(phDef) : ''}</p:nvPr></p:nvPicPr>`;
    const alpha = o.opacity != null && o.opacity < 1 ? `<a:alphaModFix amt="${fracToPerMille(Math.max(0, o.opacity))}"/>` : '';
    const blip = alpha
      ? `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}">${alpha}</a:blip>`
      : `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/>`;

    let x = g.x, y = g.y, w = g.w, h = g.h, srcRect = '';
    // Explicit crop insets win over aspect sizing.
    if (o.crop && (o.crop.l || o.crop.r || o.crop.t || o.crop.b)) {
      const cr = (v?: number) => `${fracToPerMille(Math.max(0, Math.min(1, v ?? 0)))}`;
      srcRect = `<a:srcRect l="${cr(o.crop.l)}" t="${cr(o.crop.t)}" r="${cr(o.crop.r)}" b="${cr(o.crop.b)}"/>`;
    }
    const dims = imageSize(parsed.bytes, parsed.ext);
    if (!srcRect && dims && dims.w > 0 && dims.h > 0 && (o.sizing === 'cover' || o.sizing === 'contain')) {
      const boxA = g.w / g.h;
      const imgA = dims.w / dims.h;
      if (o.sizing === 'cover') {
        // Crop the overflowing dimension so the (correct-aspect) region fills the box.
        if (imgA > boxA) { const c = (1 - boxA / imgA) / 2; srcRect = `<a:srcRect l="${fracToPerMille(c)}" r="${fracToPerMille(c)}"/>`; }
        else if (imgA < boxA) { const c = (1 - imgA / boxA) / 2; srcRect = `<a:srcRect t="${fracToPerMille(c)}" b="${fracToPerMille(c)}"/>`; }
      } else {
        // contain: shrink the placed extent to the image aspect, center within the box.
        if (imgA > boxA) { const nh = g.w / imgA; y = g.y + (g.h - nh) / 2; h = nh; }
        else if (imgA < boxA) { const nw = g.h * imgA; x = g.x + (g.w - nw) / 2; w = nw; }
      }
    }
    const round = o.rounded ? 'ellipse' : 'rect';
    const spPr = `<p:spPr>${this.xfrm(x, y, w, h, o.rotationDeg, o.flipH, o.flipV)}<a:prstGeom prst="${round}"><a:avLst/></a:prstGeom>${this.shadowXml(o.shadow)}</p:spPr>`;
    this.body.push(`<p:pic>${nv}<p:blipFill>${blip}${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill>${spPr}</p:pic>`);
  }

  /** Embedded audio/video or an online (YouTube-style) video. Embedded media get a
   *  poster image (default gray if none), a `<a:videoFile>`/`<a:audioFile>` link
   *  rel + the Office-2010 `<p14:media>` embed rel, and a media content-type. Online
   *  media degrade to a poster picture hyperlinked to the video URL (best-effort). */
  addMedia(o: MediaOpts): void {
    const id = this.nextShapeId();
    const poster = parseDataUrl(o.poster || DEFAULT_POSTER) || parseDataUrl(DEFAULT_POSTER)!;
    const posterPart = `ppt/media/image${++mediaSeq}.${poster.ext}`;
    this.media.push({ partName: posterPart, ext: poster.ext, bytes: poster.bytes, contentType: poster.contentType });
    const posterRid = this.addRel('image', `../media/image${mediaSeq}.${poster.ext}`);
    const geom = `${this.xfrm(o.x, o.y, o.w, o.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
    const blipFill = `<p:blipFill><a:blip r:embed="${posterRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`;

    if (o.type === 'online' && o.link) {
      const linkRid = this.addRel('hyperlink', o.link, 'External');
      const nv = `<p:nvPicPr><p:cNvPr id="${id}" name="Online Media ${id}"><a:hlinkClick r:id="${linkRid}"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`;
      this.body.push(`<p:pic>${nv}${blipFill}<p:spPr>${geom}</p:spPr></p:pic>`);
      return;
    }
    const parsed = parseDataUrl(o.data || '');
    if (!parsed) return;
    const me = mediaExt(parsed.contentType, o.type === 'audio' ? 'audio' : 'video');
    const mediaPart = `ppt/media/media${++mediaSeq}.${me.ext}`;
    this.media.push({ partName: mediaPart, ext: me.ext, bytes: parsed.bytes, contentType: me.contentType });
    const linkRid = this.addRel(o.type === 'audio' ? 'audio' : 'video', `../media/media${mediaSeq}.${me.ext}`);
    const embedRid = this.addRelRaw('http://schemas.microsoft.com/office/2007/relationships/media', `../media/media${mediaSeq}.${me.ext}`);
    const tag = o.type === 'audio' ? 'audioFile' : 'videoFile';
    const nv = `<p:nvPicPr><p:cNvPr id="${id}" name="Media ${id}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>` +
      `<p:nvPr><a:${tag} r:link="${linkRid}"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="${embedRid}"/></p:ext></p:extLst></p:nvPr></p:nvPicPr>`;
    this.body.push(`<p:pic>${nv}${blipFill}<p:spPr>${geom}</p:spPr></p:pic>`);
  }

  /** A native bulleted / numbered list (one text box, one <a:p> per item). A
   *  `label` renders as a BOLD lead-in — inline before the text, or on its own line
   *  above it (`labelLayout:'stacked'`). */
  addList(o: ListOpts): void {
    const id = this.nextShapeId();
    const sz = ptToCentipoint(o.sizePt ?? 16);
    const color = normHex(o.color) ?? '333333';
    const face = o.fontFace ? `<a:latin typeface="${escapeAttr(o.fontFace)}"/><a:cs typeface="${escapeAttr(o.fontFace)}"/>` : '';
    const lnSpc = o.lineSpacingMultiple ? `<a:lnSpc><a:spcPct val="${Math.round(o.lineSpacingMultiple * 100_000)}"/></a:lnSpc>` : '';
    const marker = o.marker ?? 'bullet';
    const bu = marker === 'number'
      ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>'
      : marker === 'none'
      ? '<a:buNone/>'
      : '<a:buFont typeface="Arial"/><a:buChar char="•"/>';
    const runProps = (bold: boolean) => `<a:rPr lang="en-US" sz="${sz}"${bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${face}</a:rPr>`;
    const paras = o.items
      .map((it, idx) => {
        const spcBef = idx > 0 && o.gapPt != null ? `<a:spcBef><a:spcPts val="${Math.round(o.gapPt * 100)}"/></a:spcBef>` : '';
        const pPr = marker === 'none'
          ? `<a:pPr>${spcBef}${lnSpc}<a:buNone/></a:pPr>`
          : `<a:pPr marL="274638" indent="-274638">${spcBef}${lnSpc}${bu}</a:pPr>`;
        let runs: string;
        if (it.label && o.labelLayout === 'stacked') {
          runs = `<a:r>${runProps(true)}<a:t>${escapeText(it.label)}</a:t></a:r><a:br/><a:r>${runProps(false)}<a:t>${escapeText(it.text)}</a:t></a:r>`;
        } else if (it.label) {
          runs = `<a:r>${runProps(true)}<a:t>${escapeText(it.label + ' ')}</a:t></a:r><a:r>${runProps(false)}<a:t>${escapeText(it.text)}</a:t></a:r>`;
        } else {
          runs = `<a:r>${runProps(false)}<a:t>${escapeText(it.text)}</a:t></a:r>`;
        }
        return `<a:p>${pPr}${runs}<a:endParaRPr lang="en-US" sz="${sz}"/></a:p>`;
      })
      .join('');
    const nv = `<p:nvSpPr><p:cNvPr id="${id}" name="List ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`;
    const spPr = `<p:spPr>${this.xfrm(o.x, o.y, o.w, o.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`;
    const bodyPr = `<a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"/>`;
    this.body.push(`<p:sp>${nv}${spPr}<p:txBody>${bodyPr}<a:lstStyle/>${paras}</p:txBody></p:sp>`);
  }

  /** A native, editable table. Bind to a `tbl` placeholder via `spec.placeholder`
   *  to inherit its geometry (the placeholder's geometry wins). */
  addTable(spec: TableSpec & { placeholder?: string }): void {
    const id = this.nextShapeId();
    const { placeholder, ...rest } = spec;
    const ph = this.ph(placeholder);
    const framed: TableSpec = ph ? { ...rest, xIn: ph.x, yIn: ph.y, wIn: ph.w, hIn: ph.h } : rest;
    this.body.push(buildTableFrame(id, framed));
  }

  /** A native, editable chart backed by an embedded .xlsx workbook. Bind to a
   *  `chart` placeholder via `spec.placeholder` to inherit its geometry. */
  async addChart(spec: ChartSpec & { placeholder?: string }): Promise<void> {
    const id = this.nextShapeId();
    const n = ++chartSeq;
    const { placeholder, ...rest } = spec;
    const ph = this.ph(placeholder);
    const built = await buildChart(n, ph ? { ...rest, xIn: ph.x, yIn: ph.y, wIn: ph.w, hIn: ph.h } : rest);
    // chart part + its rels + the embedded workbook, collected into the package.
    const chartRid = this.addRel('chart', `../charts/chart${n}.xml`);
    this.parts.push({ partName: `ppt/charts/chart${n}.xml`, content: built.chartXml, contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' });
    this.parts.push({ partName: `ppt/charts/_rels/chart${n}.xml.rels`, content: built.chartRels, contentType: '' });
    this.media.push({ partName: `ppt/embeddings/Microsoft_Excel_Worksheet${n}.xlsx`, ext: 'xlsx', bytes: built.xlsx, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const frame = built.frameXml(id, chartRid);
    this.body.push(frame);
  }

  /** A native combo chart — multiple chart types (e.g. bar + line) sharing one
   *  plot area and axes, backed by one embedded workbook. */
  async addComboChart(spec: ComboChartSpec & { placeholder?: string }): Promise<void> {
    const id = this.nextShapeId();
    const n = ++chartSeq;
    const { placeholder, ...rest } = spec;
    const ph = this.ph(placeholder);
    const built = await buildCombo(n, ph ? { ...rest, xIn: ph.x, yIn: ph.y, wIn: ph.w, hIn: ph.h } : rest);
    const chartRid = this.addRel('chart', `../charts/chart${n}.xml`);
    this.parts.push({ partName: `ppt/charts/chart${n}.xml`, content: built.chartXml, contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' });
    this.parts.push({ partName: `ppt/charts/_rels/chart${n}.xml.rels`, content: built.chartRels, contentType: '' });
    this.media.push({ partName: `ppt/embeddings/Microsoft_Excel_Worksheet${n}.xlsx`, ext: 'xlsx', bytes: built.xlsx, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    this.body.push(built.frameXml(id, chartRid));
  }

  /** The slide XML part. */
  render(): string {
    const bg = this.bg ?? '';
    return (
      XML_DECL +
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:cSld name="Slide ${this.index}">${bg}<p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
      this.body.join('') +
      this.slideNumberSp() +
      `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
    );
  }

  /** The slide's .rels part (layout rel is always rId... appended last so body
   *  rels keep their ids). We prepend the layout rel with a fresh id. */
  renderRels(): string {
    const layoutRid = this.nextRid();
    const all: Rel[] = [
      { id: layoutRid, type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' },
      ...this.rels,
    ];
    const rows = all
      .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escapeAttr(r.target)}"${r.mode ? ` TargetMode="${r.mode}"` : ''}/>`)
      .join('');
    return XML_DECL + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rows}</Relationships>`;
  }
}

// ── Deck ─────────────────────────────────────────────────────────────────────
export interface DeckOpts {
  title?: string;
  author?: string;
  isoDate?: string; // fixed timestamp for determinism; defaults to a constant epoch
  subject?: string;
  company?: string;
  revision?: string;
  slideNumbers?: boolean; // render a slide-number field on every slide
}

export class Deck {
  private slides: Slide[] = [];
  readonly title: string;
  readonly author: string;
  readonly isoDate: string;
  readonly subject?: string;
  readonly company?: string;
  readonly revision?: string;
  readonly slideNumbers: boolean;

  constructor(opts: DeckOpts = {}) {
    this.title = opts.title || 'Presentation';
    this.author = opts.author || 'Foxit Slides';
    // Deterministic default: engine code must not call Date.now(); the exporter
    // may pass a real timestamp. Fixed epoch keeps test output byte-stable.
    this.isoDate = opts.isoDate || '2020-01-01T00:00:00Z';
    this.subject = opts.subject;
    this.company = opts.company;
    this.revision = opts.revision;
    this.slideNumbers = !!opts.slideNumbers;
    // Reset the deck-scoped media/chart counters so each write is self-contained.
    mediaSeq = 0;
    chartSeq = 0;
  }

  private sections: Array<{ name: string; start: number }> = [];
  private masterDef?: SlideMasterDef;
  private placeholderReg?: PlaceholderRegistry;

  /** Define a reusable slide master with named placeholders. Slides created after
   *  this (with a matching `addSlide({ master })`, or any `addSlide()` since P1
   *  supports one master) can bind content to a placeholder and inherit its
   *  geometry + text format. Defining no master preserves the default blank master. */
  defineSlideMaster(def: SlideMasterDef): void {
    this.masterDef = def;
    this.placeholderReg = buildRegistry(def);
  }

  addSlide(opts: { master?: string } = {}): Slide {
    const s = new Slide(this.slides.length + 1);
    s.showSlideNumber = this.slideNumbers || !!this.masterDef?.slideNumber;
    // Bind to the master when one is defined and either no name was given or it matches.
    if (this.masterDef && this.placeholderReg && (opts.master == null || opts.master === this.masterDef.name)) {
      s.setPlaceholders(this.placeholderReg);
    }
    this.slides.push(s);
    return s;
  }

  /** Begin a named section; slides added after this call belong to it (until the
   *  next addSection). */
  addSection(name: string): void {
    this.sections.push({ name, start: this.slides.length });
  }

  /** The presentation `<p:extLst>` section list (Office 2010 ext), or ''. Leading
   *  slides before the first section fall into an auto "Default Section". */
  private sectionListXml(): string {
    if (!this.sections.length) return '';
    const secs = this.sections[0].start > 0
      ? [{ name: 'Default Section', start: 0 }, ...this.sections]
      : this.sections;
    const guid = (i: number) => `{00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}}`;
    const parts = secs.map((sec, i) => {
      const end = i + 1 < secs.length ? secs[i + 1].start : this.slides.length;
      const ids = this.slides.slice(sec.start, end).map((_, k) => `<p14:sldId id="${256 + sec.start + k}"/>`).join('');
      return `<p14:section name="${escapeAttr(sec.name)}" id="${guid(i)}"><p14:sldIdLst>${ids}</p14:sldIdLst></p14:section>`;
    }).join('');
    return `<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">${parts}</p14:sectionLst></p:ext></p:extLst>`;
  }

  /** Assemble the OPC package and return the .pptx bytes. Defaults to a Blob;
   *  pass `outputType` for other forms (nodebuffer/uint8array/arraybuffer/base64)
   *  and `compression:false` for STORE (no DEFLATE). */
  async write(): Promise<Blob>;
  async write(opts: { outputType?: 'blob'; compression?: boolean }): Promise<Blob>;
  async write(opts: { outputType: 'nodebuffer' | 'uint8array' | 'arraybuffer' | 'base64' | 'binarystring'; compression?: boolean }): Promise<Buffer | Uint8Array | ArrayBuffer | string>;
  async write(opts: { outputType?: string; compression?: boolean } = {}): Promise<Blob | Buffer | Uint8Array | ArrayBuffer | string> {
    const zip = new JSZip();
    const overrides: string[] = [];
    const defaults = new Set<string>();
    const addDefault = (ext: string, ct: string) => defaults.add(`${ext} ${ct}`);
    addDefault('rels', 'application/vnd.openxmlformats-package.relationships+xml');
    addDefault('xml', 'application/xml');
    addDefault('png', 'image/png');
    addDefault('jpeg', 'image/jpeg');
    addDefault('jpg', 'image/jpeg');
    addDefault('gif', 'image/gif');
    addDefault('svg', 'image/svg+xml');
    addDefault('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // ── Fixed package parts ──
    zip.file('_rels/.rels', XML_DECL +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/>` +
      `</Relationships>`);
    const notedSlides = this.slides.filter((s) => s.notes && s.notes.trim());
    const hasNotes = notedSlides.length > 0;
    zip.file('docProps/core.xml', corePropsXml(this.title, this.author, this.isoDate, this.subject, this.revision));
    overrides.push(override('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'));
    zip.file('docProps/app.xml', appPropsXml(this.slides.length, notedSlides.length, this.company));
    overrides.push(override('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml'));

    // ── Notes master (one, only if any slide has notes) ──
    if (hasNotes) {
      zip.file('ppt/notesMasters/notesMaster1.xml', notesMasterXml());
      overrides.push(override('/ppt/notesMasters/notesMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml'));
      zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', XML_DECL +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
    }

    zip.file('ppt/theme/theme1.xml', themeXml());
    overrides.push(override('/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'));
    // A custom master swaps only the CONTENT of slideMaster1/slideLayout1 — the part
    // names, rels graph, and content-types are identical, so no rId bookkeeping changes.
    const masterXml = this.masterDef && this.placeholderReg ? customSlideMasterXml(this.masterDef, this.placeholderReg) : slideMasterXml();
    const layoutXml = this.masterDef && this.placeholderReg ? customSlideLayoutXml(this.masterDef, this.placeholderReg) : slideLayoutXml();
    zip.file('ppt/slideMasters/slideMaster1.xml', masterXml);
    overrides.push(override('/ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'));
    zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', XML_DECL +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/>` +
      `</Relationships>`);
    zip.file('ppt/slideLayouts/slideLayout1.xml', layoutXml);
    overrides.push(override('/ppt/slideLayouts/slideLayout1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'));
    zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', XML_DECL +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
      `</Relationships>`);
    zip.file('ppt/presProps.xml', presPropsXml());
    overrides.push(override('/ppt/presProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'));
    zip.file('ppt/viewProps.xml', viewPropsXml());
    overrides.push(override('/ppt/viewProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml'));
    zip.file('ppt/tableStyles.xml', tableStylesXml());
    overrides.push(override('/ppt/tableStyles.xml', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'));

    // ── presentation.xml + rels ──
    const sldIds = this.slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`)
      .join('');
    // Assign the notesMaster rId after the slides + fixed parts.
    const notesMasterRid = hasNotes ? 2 + this.slides.length + 4 : 0; // presProps,viewProps,theme,tableStyles then notesMaster
    zip.file('ppt/presentation.xml', XML_DECL +
      `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1" autoCompressPictures="0">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      // NOTE: notesMasterIdLst MUST come AFTER sldIdLst. The ECMA schema arguably
      // allows it before, but real PowerPoint reports the file as corrupt when it
      // precedes sldIdLst (caught by PowerPoint-render pressure test, 2026-07-13).
      `<p:sldIdLst>${sldIds}</p:sldIdLst>` +
      (hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${notesMasterRid}"/></p:notesMasterIdLst>` : '') +
      `<p:sldSz cx="${inchToEmu(SLIDE_W_IN)}" cy="${inchToEmu(SLIDE_H_IN)}"/>` +
      `<p:notesSz cx="6858000" cy="9144000"/>` +
      this.sectionListXml() +
      `</p:presentation>`);
    const presRels: string[] = [`<Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`];
    this.slides.forEach((_, i) => {
      presRels.push(`<Relationship Id="rId${2 + i}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`);
    });
    let rid = 2 + this.slides.length;
    presRels.push(`<Relationship Id="rId${rid++}" Type="${REL}/presProps" Target="presProps.xml"/>`);
    presRels.push(`<Relationship Id="rId${rid++}" Type="${REL}/viewProps" Target="viewProps.xml"/>`);
    presRels.push(`<Relationship Id="rId${rid++}" Type="${REL}/theme" Target="theme/theme1.xml"/>`);
    presRels.push(`<Relationship Id="rId${rid++}" Type="${REL}/tableStyles" Target="tableStyles.xml"/>`);
    if (hasNotes) presRels.push(`<Relationship Id="rId${rid++}" Type="${REL}/notesMaster" Target="notesMasters/notesMaster1.xml"/>`);
    zip.file('ppt/_rels/presentation.xml.rels', XML_DECL +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels.join('')}</Relationships>`);
    overrides.push(override('/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'));

    // ── slides + their rels + media + chart + notes parts ──
    for (const s of this.slides) {
      const partName = `ppt/slides/slide${s.index}.xml`;
      const slideXml = s.render();
      // Speaker notes → a notesSlide part; link it from the slide before rels render.
      if (s.notes && s.notes.trim()) {
        s.linkNotesSlide(s.index);
        const nsPart = `ppt/notesSlides/notesSlide${s.index}.xml`;
        zip.file(nsPart, notesSlideXml(s.notes));
        zip.file(`ppt/notesSlides/_rels/notesSlide${s.index}.xml.rels`, XML_DECL +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${REL}/notesMaster" Target="../notesMasters/notesMaster1.xml"/>` +
          `<Relationship Id="rId2" Type="${REL}/slide" Target="../slides/slide${s.index}.xml"/></Relationships>`);
        overrides.push(override(`/${nsPart}`, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'));
      }
      zip.file(partName, slideXml);
      zip.file(`ppt/slides/_rels/slide${s.index}.xml.rels`, s.renderRels());
      overrides.push(override(`/${partName}`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'));
      for (const m of s.media) {
        zip.file(m.partName, m.bytes);
        // Ensure a Default content-type exists for this extension (covers media
        // types like mp4/mp3 in addition to the standard image/xlsx defaults).
        addDefault(m.ext, m.contentType);
      }
      for (const p of s.parts) {
        zip.file(p.partName, p.content);
        if (p.contentType) overrides.push(override(`/${p.partName}`, p.contentType));
      }
    }

    // ── [Content_Types].xml ──
    const defaultEls = Array.from(defaults)
      .map((d) => { const [ext, ct] = d.split(' '); return `<Default Extension="${ext}" ContentType="${ct}"/>`; })
      .join('');
    zip.file('[Content_Types].xml', XML_DECL +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultEls}${overrides.join('')}</Types>`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jszip's type union is looser than our overloads
    return zip.generateAsync({
      type: (opts.outputType || 'blob') as any,
      compression: opts.compression === false ? 'STORE' : 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  }
}

function override(partName: string, contentType: string): string {
  return `<Override PartName="${partName}" ContentType="${contentType}"/>`;
}

// ── Data-URL parsing ─────────────────────────────────────────────────────────
function parseDataUrl(src: string): { ext: string; contentType: string; bytes: Uint8Array } | null {
  const m = src.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!m) return null;
  const mime = (m[1] || 'image/png').toLowerCase();
  const isB64 = !!m[2];
  const dataStr = m[3];
  let bytes: Uint8Array;
  if (isB64) {
    bytes = base64ToBytes(dataStr);
  } else {
    const decoded = decodeURIComponent(dataStr);
    bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i) & 0xff;
  }
  const ext = mime === 'image/jpeg' ? 'jpeg' : mime === 'image/svg+xml' ? 'svg' : mime === 'image/gif' ? 'gif' : 'png';
  return { ext, contentType: mime, bytes };
}

/** Decode intrinsic pixel dimensions from a PNG or JPEG byte header (for
 *  aspect-correct cover/contain). Returns null for SVG/GIF/unparseable — the caller
 *  then falls back to a plain stretch. */
function imageSize(bytes: Uint8Array, ext: string): { w: number; h: number } | null {
  if (ext === 'png') {
    // 8-byte signature, then the IHDR chunk: len[4] "IHDR"[4] width[4] height[4].
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
      const w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
      const h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
      return { w, h };
    }
    return null;
  }
  if (ext === 'jpeg') {
    // Scan segments for a Start-Of-Frame marker, which carries height/width.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (bytes[i + 5] << 8) | bytes[i + 6];
        const w = (bytes[i + 7] << 8) | bytes[i + 8];
        return { w, h };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len <= 0) break;
      i += 2 + len;
    }
    return null;
  }
  return null;
}

/** 1×1 gray PNG used as a default media poster. */
const DEFAULT_POSTER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

/** Media file extension + content-type from a data-URL mime + kind. */
function mediaExt(contentType: string, kind: 'video' | 'audio'): { ext: string; contentType: string } {
  const ct = (contentType || '').toLowerCase();
  if (kind === 'audio') {
    if (ct.includes('wav')) return { ext: 'wav', contentType: 'audio/wav' };
    if (ct.includes('mp4') || ct.includes('m4a')) return { ext: 'm4a', contentType: 'audio/mp4' };
    return { ext: 'mp3', contentType: 'audio/mpeg' };
  }
  if (ct.includes('webm')) return { ext: 'webm', contentType: 'video/webm' };
  if (ct.includes('quicktime') || ct.includes('mov')) return { ext: 'mov', contentType: 'video/quicktime' };
  return { ext: 'mp4', contentType: 'video/mp4' };
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Convenience: create a deck. */
export function createDeck(opts?: DeckOpts): Deck {
  return new Deck(opts);
}

export const SLIDE_WIDTH_IN = SLIDE_W_IN;
export const SLIDE_HEIGHT_IN = SLIDE_H_IN;
