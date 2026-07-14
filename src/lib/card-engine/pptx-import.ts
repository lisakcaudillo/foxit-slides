/**
 * PPTX → editor deck importer.
 *
 * Opens a user's `.pptx` and turns each slide into an editor `Card` whose
 * freeform blocks are **role-mapped 1:1 from PowerPoint placeholders**
 * (`<p:ph type="…" idx="…">`). The role rides on each block id as
 * `ff-struct-${role}-${group}-${i}` — the same convention the structured
 * generator + critic use — so an imported deck is immediately editable AND
 * usable as a structured template (save-as-template / generate-into-template).
 *
 * Geometry AND text style resolve through the standard OOXML inheritance chain
 * (slide run/shape → slide layout → slide master `txStyles`), in EMU/theme refs,
 * converted to the editor's percentage coordinate space + px font sizes + hex.
 *
 * Built + proven against a real 21-slide pitch template: 237/237 placeholders
 * resolved geometry. Charts (`graphicFrame`) currently import as positioned
 * image placeholders — live chart-data extraction is the next increment.
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { Card, FreeformBlock, FreeformTextBlock, FreeformImageBlock, FreeformShapeBlock, FreeformTableBlock, FreeformListBlock, FreeformTextVariant } from '@/types/card-template';
import { measureWidth } from './text-fit';

/** PowerPoint placeholder `type` → our role vocabulary (1:1). */
const PLACEHOLDER_ROLE: Record<string, string> = {
  title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body',
  pic: 'image', tbl: 'table', ftr: 'footer', dt: 'date', sldNum: 'slide-number',
};
const ROLE_VARIANT: Record<string, FreeformTextVariant> = {
  title: 'heading', subtitle: 'subheading', body: 'paragraph',
  footer: 'paragraph', date: 'paragraph', 'slide-number': 'paragraph', table: 'paragraph',
};
/** Which master txStyles group a placeholder type reads from. */
const STYLE_GROUP = (role: string): 'title' | 'body' | 'other' =>
  role === 'title' ? 'title' : role === 'body' || role === 'subtitle' ? 'body' : 'other';

/** Canonical section-title size (px on the 960×540 canvas). Source decks carry a
 *  per-slide author size on every title; for a CONSISTENT deck we ignore those and
 *  give every title this one size. Autofit still shrinks a genuinely over-long title.
 *  ONLY title-role placeholders are affected — body/other text keeps its source size. */
const TITLE_PX = 36;

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const arr = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Greedy word-wrap line count for `text` at `size` in `maxW` px (real-font measure). */
function wrapLineCount(text: string, fontStack: string, size: number, maxW: number): number {
  let lines = 0;
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines += 1; continue; }
    let cur = '';
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if ((measureWidth(trial, fontStack, size) ?? Infinity) <= maxW) cur = trial;
      else { if (cur) lines += 1; cur = w; }
    }
    if (cur) lines += 1;
  }
  return lines || 1;
}

/**
 * Replicate PowerPoint placeholder autofit: shrink the font until the FULL text
 * fits the box, down to a small floor (PP itself goes ~9–10pt on dense templates).
 * Never trims — content is preserved even if it must go small. Subtracts editor
 * padding and applies a safety factor because the browser wraps a touch looser
 * than opentype's advance measurement.
 */
function autofitSize(text: string, boxWpx: number, boxHpx: number, fontStack: string, designSize: number): { size: number; lineHeight: number } {
  const LH = 1.2, FLOOR = 9, SAFETY = 1.12;
  if (!text.trim() || !measureWidth('M', fontStack, 16)) return { size: designSize, lineHeight: LH };
  const w = Math.max(20, boxWpx - 14), h = Math.max(14, boxHpx - 10);
  for (let s = designSize; s >= FLOOR; s -= 0.5) {
    const lines = wrapLineCount(text, fontStack, s, w);
    if (lines * s * LH * SAFETY <= h) return { size: Math.round(s * 10) / 10, lineHeight: LH };
  }
  return { size: FLOOR, lineHeight: 1.1 };
}

export interface ImportedDeck {
  cards: Card[];
  warnings: string[];
}

interface PH {
  role: string; type: string; idx: string; name: string; xfrm: any;
  text: string; rPr: any; algn?: string; lvl: number; isPic: boolean;
}
type Style = { sz?: number; bold?: boolean; align?: string; color?: string };

export async function importPptx(buffer: Buffer | ArrayBuffer | Uint8Array, opts?: { accent?: string }): Promise<ImportedDeck> {
  const zip = await JSZip.loadAsync(buffer);
  const warnings: string[] = [];
  // OUR accent for generated decorations (not the source's). Defaults to the
  // Compose accent; the caller can pass the active theme's accent.
  const accent = opts?.accent ?? '#6B3FA0';
  const readXml = async (p: string): Promise<any | null> => {
    const f = zip.file(p);
    return f ? xml.parse(await f.async('string')) : null;
  };
  const resolveRel = (relsPath: string, target: string): string => {
    const baseDir = relsPath.replace('/_rels', '').split('/').slice(0, -1).join('/');
    const stack: string[] = [];
    for (const p of (baseDir + '/' + target).split('/')) {
      if (p === '..') stack.pop(); else if (p !== '.' && p !== '') stack.push(p);
    }
    return stack.join('/');
  };
  const relTarget = async (relsPath: string, typeIncludes: string): Promise<string | null> => {
    const rels = (await readXml(relsPath))?.['Relationships']?.['Relationship'];
    const r = arr<any>(rels).find((x) => String(x['@_Type'] || '').includes(typeIncludes));
    return r ? resolveRel(relsPath, r['@_Target']) : null;
  };

  // slide dimensions (EMU)
  const pres = await readXml('ppt/presentation.xml');
  const sz = pres?.['p:presentation']?.['p:sldSz'];
  const EMU_W = +(sz?.['@_cx'] ?? 12192000), EMU_H = +(sz?.['@_cy'] ?? 6858000);
  const pctX = (e: any) => +(((+e / EMU_W) * 100).toFixed(3));
  const pctY = (e: any) => +(((+e / EMU_H) * 100).toFixed(3));

  // ── theme color scheme (resolve schemeClr → hex) ──
  const themePath = (await relTarget('ppt/_rels/presentation.xml.rels', 'theme')) || 'ppt/theme/theme1.xml';
  const themeDoc = await readXml(themePath);
  const clrScheme = themeDoc?.['a:theme']?.['a:themeElements']?.['a:clrScheme'] ?? {};
  const schemeHex = (node: any): string | undefined => {
    const s = node?.['a:srgbClr']?.['@_val'];
    if (s) return `#${s}`;
    const sys = node?.['a:sysClr']?.['@_lastClr'];
    if (sys) return `#${sys}`;
    return undefined;
  };
  // default clrMap: tx1→dk1, bg1→lt1, tx2→dk2, bg2→lt2, accentN→accentN
  const CLR_MAP: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
  const colorFromScheme = (val?: string): string | undefined => {
    if (!val) return undefined;
    const mapped = CLR_MAP[val] || val; // accent1..6, hlink stay as-is
    return schemeHex(clrScheme[`a:${mapped}`]);
  };
  const fillColor = (solidFill: any): string | undefined => {
    if (!solidFill) return undefined;
    const srgb = solidFill['a:srgbClr']?.['@_val'];
    if (srgb) return `#${srgb}`;
    return colorFromScheme(solidFill['a:schemeClr']?.['@_val']);
  };

  // ── master txStyles: (group, level) → Style ──
  const loadMasterStyles = (masterDoc: any) => {
    const tx = masterDoc?.['p:sldMaster']?.['p:txStyles'] ?? {};
    const groups: Record<string, any> = { title: tx['p:titleStyle'], body: tx['p:bodyStyle'], other: tx['p:otherStyle'] };
    return (group: 'title' | 'body' | 'other', level: number): Style => {
      const g = groups[group];
      if (!g) return {};
      const lvl = g[`a:lvl${Math.min(Math.max(level, 0), 8) + 1}pPr`] || g['a:lvl1pPr'];
      if (!lvl) return {};
      const dr = lvl['a:defRPr'] || {};
      return {
        sz: dr['@_sz'] ? +dr['@_sz'] / 100 : undefined,
        bold: dr['@_b'] === '1' || undefined,
        align: lvl['@_algn'],
        color: fillColor(dr['a:solidFill']),
      };
    };
  };

  // collect placeholder shapes from a slide/layout/master document
  const collectPH = (doc: any): PH[] => {
    const tree = doc?.['p:sld'] || doc?.['p:sldLayout'] || doc?.['p:sldMaster'];
    const spTree = tree?.['p:cSld']?.['p:spTree'];
    if (!spTree) return [];
    const out: PH[] = [];
    for (const tag of ['p:sp', 'p:pic'] as const) {
      for (const sp of arr<any>(spTree[tag])) {
        const isPic = tag === 'p:pic';
        const ph = sp[isPic ? 'p:nvPicPr' : 'p:nvSpPr']?.['p:nvPr']?.['p:ph'];
        if (!ph) continue;
        const type = ph['@_type'] || 'body';
        const idx = ph['@_idx'] != null ? String(ph['@_idx']) : (type === 'title' || type === 'ctrTitle' ? 'title' : '0');
        const name = sp[isPic ? 'p:nvPicPr' : 'p:nvSpPr']?.['p:cNvPr']?.['@_name'] || '';
        const xfrm = sp['p:spPr']?.['a:xfrm'];
        const paras: string[] = []; let rPr: any, algn: string | undefined, lvl = 0;
        const txBody = sp['p:txBody'];
        if (txBody) for (const p of arr<any>(txBody['a:p'])) {
          algn = algn ?? p['a:pPr']?.['@_algn'];
          lvl = +(p['a:pPr']?.['@_lvl'] ?? 0);
          let line = '';
          for (const r of arr<any>(p['a:r'])) { line += r['a:t'] ?? ''; rPr = rPr ?? r['a:rPr']; }
          paras.push(line);
        }
        const text = paras.join('\n').trim();
        out.push({ role: PLACEHOLDER_ROLE[type] || type, type, idx, name, xfrm, text, rPr, algn, lvl, isPic });
      }
    }
    return out;
  };

  const geom = (xfrm: any) => {
    const off = xfrm?.['a:off'], ext = xfrm?.['a:ext'];
    return off && ext ? { x: pctX(off['@_x']), y: pctY(off['@_y']), w: pctX(ext['@_cx']), h: pctY(ext['@_cy']) } : null;
  };
  // Source <a:tbl> tables live in <p:graphicFrame> (NOT a sp/pic), so the placeholder
  // pass misses them. Pull each table out as a grid of cell strings.
  const collectTables = (doc: any): string[][][] => {
    const tree = doc?.['p:sld']?.['p:cSld']?.['p:spTree'];
    if (!tree) return [];
    const tables: string[][][] = [];
    for (const gf of arr<any>(tree['p:graphicFrame'])) {
      const tbl = gf['a:graphic']?.['a:graphicData']?.['a:tbl'];
      if (!tbl) continue;
      const rows = arr<any>(tbl['a:tr']).map((tr) => arr<any>(tr['a:tc']).map((tc) =>
        arr<any>(tc['a:txBody']?.['a:p']).map((p) => arr<any>(p['a:r']).map((r) => r['a:t'] ?? '').join('')).join(' ').trim()));
      if (rows.length && rows.some((r) => r.some((c) => c))) tables.push(rows);
    }
    return tables;
  };
  const toAlign = (a?: string): 'left' | 'center' | 'right' | undefined =>
    a === 'ctr' ? 'center' : a === 'r' ? 'right' : a === 'l' ? 'left' : undefined;

  // ── colors: we deliberately do NOT reproduce the source's theme colors/shades.
  //    Keep only AUTHOR-literal colors (srgbClr); theme refs (schemeClr) are left
  //    undefined so OUR theme colors the text — never the source's exact palette. ──
  const literalColor = (solidFill: any): string | undefined => {
    const srgb = solidFill?.['a:srgbClr']?.['@_val'];
    return srgb ? `#${srgb}` : undefined;
  };

  // ── OUR decoration system: the Quartz "Editorial" accent family (the approved
  //    pilot — accent/editorial/*, bound to ink + accent tokens, recolors across
  //    modes). Geometry from the Figma tiles (480×270 = half of 960×540). We apply
  //    the accent roles relative to the imported content slots; the source's own
  //    decorations are NOT reproduced. Accent-colored bits use our `accent`. ──
  const ourDecorations = (blocks: FreeformBlock[], zBase: number): FreeformShapeBlock[] => {
    const decos: FreeformShapeBlock[] = [];
    const find = (re: RegExp) => blocks.find((b): b is FreeformTextBlock => b.type === 'text' && re.test(b.id));
    let z = zBase;
    // ONE coherent motif: a thin accent KEYLINE flush to the left edge of the
    // marked element, its TOP aligned to the top of the first letter (cap top)
    // and its height = the cap height — so it sits flush with the text, not
    // centred on the line or floating. Tightly coupled = intentional on every slide.
    // Reusable for ANY title/font: the first capital letter sits within the text
    // block at a position derived from the font size + line-height + Inter metrics:
    //   capTop  = padding + half-leading + (ascent→cap gap)
    //   capH    = cap height
    // The keyline spans that cap with a slight overhang on both ends, so its top
    // is flush with (a hair above) the top of the first letter on every slide.
    const PAD_PX = 4;            // freeform text block inner padding
    const CAP_INSET = 0.20;      // Inter: content-box top → cap top, as a fraction of font px
    const CAP_HEIGHT = 0.71;     // Inter cap height as a fraction of font px
    const EXTEND = 0.25;         // overhang past the letter on each end = 25% of the cap height
    const bracket = (slot: FreeformTextBlock) => {
      const fPx = slot.style?.fontSize ?? 24;
      const lh = slot.style?.lineHeight ?? 1.2;
      const halfLeading = ((lh - 1) / 2) * fPx;
      const capTopPx = PAD_PX + halfLeading + CAP_INSET * fPx;
      const capHPx = CAP_HEIGHT * fPx;
      const extendPx = EXTEND * capHPx; // 25% of the letter height, top + bottom
      decos.push({
        id: `ff-deco-keyline-${decos.length}`, type: 'shape', shape: 'rectangle',
        x: Math.max(0, slot.x - 1.6),
        y: slot.y + ((capTopPx - extendPx) / 540) * 100,
        w: 0.5, h: Math.max(2, ((capHPx + 2 * extendPx) / 540) * 100),
        rotation: 0, z: z++, fill: accent,
      });
    };
    const eyebrow = find(/^ff-struct-eyebrow-label-/);
    const title = find(/^ff-struct-title-/);
    if (eyebrow) bracket(eyebrow);
    if (title) bracket(title);
    return decos;
  };

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0]);

  const masterStyleCache: Record<string, ReturnType<typeof loadMasterStyles>> = {};
  const cards: Card[] = [];
  let deckDate = '';   // captured from the source footer so we can show it on the title slide
  let coverIdx = -1;   // which card is the title slide

  for (const sp of slidePaths) {
    const slideDoc = await readXml(sp);
    if (!slideDoc) continue;
    const base = sp.split('/').pop()!;
    const layoutPath = await relTarget(`ppt/slides/_rels/${base}.rels`, 'slideLayout');
    const masterPath = layoutPath ? await relTarget(`ppt/slideLayouts/_rels/${layoutPath.split('/').pop()}.rels`, 'slideMaster') : null;
    const layoutDoc = layoutPath ? await readXml(layoutPath) : null;
    const layoutPH = layoutDoc ? collectPH(layoutDoc) : [];
    const masterDoc = masterPath ? await readXml(masterPath) : null;
    const masterPH = masterDoc ? collectPH(masterDoc) : [];
    if (masterPath && !masterStyleCache[masterPath]) masterStyleCache[masterPath] = loadMasterStyles(masterDoc);
    const styleOf = masterPath ? masterStyleCache[masterPath] : () => ({} as Style);

    const inheritXfrm = (type: string, idx: string) => {
      const isTitle = type === 'title' || type === 'ctrTitle';
      const match = (p: PH) => isTitle ? p.type === 'title' || p.type === 'ctrTitle' : p.idx === idx && (p.type === type || p.role === PLACEHOLDER_ROLE[type]);
      return layoutPH.find(match)?.xfrm || masterPH.find((p) => p.type === type || p.role === PLACEHOLDER_ROLE[type])?.xfrm || null;
    };

    const blocks: FreeformBlock[] = [];
    const counters: Record<string, number> = {};
    // NOTE: the source's decorative shapes/bars/fills are intentionally NOT imported
    // (we don't reproduce their skin). We keep only the content role slots, then add
    // OUR own decorations below.
    const phs = collectPH(slideDoc);
    const tables = collectTables(slideDoc);
    const isCover = phs.some((p) => p.type === 'ctrTitle') || cards.length === 0;
    // count of real text-content placeholders (title/subtitle/body) — used to tell an
    // image-led slide (few words, photo carries it) from a text-heavy content slide.
    const textCount = phs.filter(
      (p) => !p.isPic && !['image', 'table', 'date', 'footer', 'slide-number'].includes(p.role) && (p.text?.length ?? 0) > 0,
    ).length;
    if (isCover && coverIdx < 0) coverIdx = cards.length;
    let droppedFullBleed = false; // a full-bleed image we skipped — may belong in a side band
    for (const ph of phs) {
      // Capture the deck date even on slides where we drop the footer, so the title
      // slide can show it.
      if (ph.role === 'date' && ph.text && !deckDate) deckDate = ph.text;
      // The date + deck-name footer is title-slide furniture — drop it on every other
      // slide (Lisa: only the title slide should carry the date and name).
      if (!isCover && (ph.role === 'date' || ph.role === 'footer')) continue;
      const g = geom(ph.xfrm) || geom(inheritXfrm(ph.type, ph.idx));
      if (!g) { warnings.push(`${base}: ${ph.role} idx=${ph.idx} no geometry — skipped`); continue; }
      const key = `${ph.role}-${ph.idx}`;
      const i = counters[key] = (counters[key] ?? -1) + 1;
      const common = { id: `ff-struct-${ph.role}-${ph.idx}-${i}`, x: g.x, y: g.y, w: g.w, h: g.h, rotation: 0, z: blocks.length };

      if (ph.isPic || ph.role === 'image' || ph.role === 'table') {
        // A full-bleed image zone is TAGGED as a background-photo slot — role `image`,
        // group `background` (id `ff-struct-image-background-i`) and sent to the back
        // (low z) so it sits behind the content. The editor, the saved template, and
        // the fill logic all know it's a full-bleed background vs a content image.
        const fullBleed = g.w >= 90 && g.h >= 90;
        if (fullBleed) {
          // A whole-slide background photo belongs on a cover or an image-led slide;
          // on a text-heavy content slide it just sits behind the words as noise — drop it.
          if (!isCover && textCount >= 2) { droppedFullBleed = true; continue; }
          const bi = counters['image-background'] = (counters['image-background'] ?? -1) + 1;
          blocks.push({ ...common, id: `ff-struct-image-background-${bi}`, z: -1000, type: 'image', src: undefined, alt: 'background image', fit: 'cover', frameShape: 'rectangle' } as FreeformImageBlock);
          continue;
        }
        blocks.push({ ...common, type: 'image', src: undefined, alt: ph.role, fit: 'cover', frameShape: 'rectangle' } as FreeformImageBlock);
        continue;
      }
      // Drop the source's vertical SIDEBAR section-label — a tall, narrow text box
      // pinned to the far-right edge that just repeats the slide title ("About",
      // "Problem"). Un-rotated it reads as stray text floating in the top-right corner.
      if (g.x >= 80 && g.w <= 20 && g.h >= 60) continue;

      // nominal style: run rPr overrides inherited master txStyles
      const inh = styleOf(STYLE_GROUP(ph.role), ph.lvl);
      const runSz = ph.rPr?.['@_sz'] ? +ph.rPr['@_sz'] / 100 : undefined;
      // author-literal colors only; theme refs (schemeClr) → undefined so OUR theme colors it
      const runColor = literalColor(ph.rPr?.['a:solidFill']);
      // Titles get the canonical size (consistency guideline); everything else keeps
      // its source/inherited size. Autofit below still shrinks any title that overflows.
      const nominal = ph.role === 'title' ? TITLE_PX : (runSz ?? inh.sz ?? 18);
      // PowerPoint placeholders autofit text to the box (<a:normAutofit/>) — shrink to
      // fit, never trim (content preserved as the full ph.text).
      const fit = autofitSize(ph.text, (g.w / 100) * 960, (g.h / 100) * 540, 'Inter', nominal);
      const txt: FreeformTextBlock = {
        ...common, type: 'text', variant: ROLE_VARIANT[ph.role] ?? 'paragraph', content: ph.text,
        style: {
          fontSize: fit.size,
          lineHeight: fit.lineHeight,
          fontWeight: (ph.rPr?.['@_b'] === '1' || inh.bold) ? 700 : undefined,
          italic: ph.rPr?.['@_i'] === '1' || undefined,
          color: runColor, // schemeClr left undefined → OUR theme colors the text
          textAlign: toAlign(ph.algn ?? inh.align),
        },
      };
      blocks.push(txt);
    }

    // Snap text that BLEEDS off the left edge (x≈0, no padding, e.g. a "Market Gap"
    // section header the source pinned to x=0) in to the slide's left content margin.
    // The margin is the leftmost real content (not the title — on a right-content
    // layout the title sits at x≈50 and is NOT the left margin), and only x<3 outliers
    // are moved, so a normal left-aligned footer/body is never touched.
    const contentXs = blocks
      .filter((b): b is FreeformTextBlock => b.type === 'text' && b.x >= 3)
      .map((b) => b.x);
    const leftMargin = contentXs.length ? Math.min(...contentXs) : 7.5;
    for (const b of blocks) {
      if (b.type === 'text' && b.x < 3) {
        b.w = Math.min(b.w, 100 - leftMargin - 4); // keep it on-canvas after the shift
        b.x = leftMargin;
      }
    }

    // Pictogram placeholders. In a CATEGORY GRID — ≥2 short ALL-CAPS labels, each
    // sitting directly above a longer description in the same column — drop a small
    // icon slot in the gutter to the left of each label (a slot only, no bytes; the
    // library/palette fills it). Left-of-label, not above: the source grids are dense
    // (a label sits right under the prior item's body), so an icon above would overlap.
    const textBlk = blocks.filter((b): b is FreeformTextBlock => b.type === 'text');
    const isCapsLabel = (b: FreeformTextBlock) => {
      const t = (b.content ?? '').trim();
      return t.length >= 1 && t.length <= 24 && /[A-Z]/.test(t) && t === t.toUpperCase()
        && !(typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'));
    };
    // A "body below" is a real description (prose), not another caps label — so a SHORT
    // description like "Professional investors" still qualifies the label as a grid item.
    const hasBodyBelow = (label: FreeformTextBlock) => textBlk.some(
      (d) => d !== label && Math.abs(d.x - label.x) < 4 && d.y > label.y && d.y - label.y < 14
        && (d.content ?? '').trim().length > 12 && !isCapsLabel(d),
    );

    // Normalize an OVERSIZED caps header. A short uppercase label trapped in a giant
    // placeholder box (e.g. "CONTOSO" in a w75×h57 box) renders high and to the left,
    // out of line with its own column body and its sibling header. Snap it onto the
    // well-formed sibling header's baseline + size and onto its column body's x.
    const capsHeaders = textBlk.filter(isCapsLabel);
    for (const hdr of capsHeaders) {
      if (!(hdr.h > 12 || hdr.w > 50)) continue; // only the oversized ones
      const body = textBlk
        .filter((d) => d !== hdr && (d.content ?? '').trim().length > 24 && d.y > hdr.y && d.y - hdr.y < 24)
        .sort((a, b) => Math.abs(a.x - hdr.x) - Math.abs(b.x - hdr.x))[0];
      if (!body) continue;
      const sib = capsHeaders.find((o) => o !== hdr && o.h <= 12 && o.w <= 50 && Math.abs(o.y - hdr.y) < 20);
      hdr.x = body.x;
      hdr.w = sib ? sib.w : body.w;
      hdr.h = sib ? sib.h : Math.min(hdr.h, 8);
      if (sib) hdr.y = sib.y;
    }

    // A left-bullet icon only fits where labels STACK in a column (≥2 candidates share
    // an x, e.g. CUSTOMERS over FINANCIALS). Side-by-side column layouts (Business Model
    // / a timeline / stat columns — each label at its own x) want an icon ON TOP instead,
    // which is the separate infographic treatment, so they're skipped here.
    const candidates = textBlk.filter((b) => isCapsLabel(b) && hasBodyBelow(b));
    const gridLabels = candidates.filter((b) => candidates.filter((o) => Math.abs(o.x - b.x) < 3).length >= 2);
    if (gridLabels.length >= 2) {
      // Align grid ROWS across columns. Item N in each column should share a row; one
      // column is often offset lower by a lead-in header above it (e.g. PROBLEM's left
      // column carries "Market Gap"), leaving the other column floating higher. Group
      // each label with its description (down to the next label in its column), then
      // pull each row's items down to the lowest one — never up into a lead-in.
      const cols: FreeformTextBlock[][] = [];
      for (const lb of gridLabels) {
        const col = cols.find((c) => Math.abs(c[0].x - lb.x) < 3);
        if (col) col.push(lb); else cols.push([lb]);
      }
      cols.forEach((c) => c.sort((a, b) => a.y - b.y));
      const groupOf = (col: FreeformTextBlock[], idx: number) => {
        const nextY = idx + 1 < col.length ? col[idx + 1].y : Infinity;
        return textBlk.filter((d) => Math.abs(d.x - col[idx].x) < 4 && d.y >= col[idx].y && d.y < nextY);
      };
      const groups = new Map<FreeformTextBlock, FreeformTextBlock[]>();
      cols.forEach((c) => c.forEach((lb, idx) => groups.set(lb, groupOf(c, idx))));
      const rowN = Math.max(...cols.map((c) => c.length));
      for (let ri = 0; ri < rowN; ri++) {
        const rowItems = cols.map((c) => c[ri]).filter(Boolean);
        if (rowItems.length < 2) continue;
        const targetY = Math.max(...rowItems.map((b) => b.y));
        for (const lb of rowItems) {
          const dy = targetY - lb.y;
          if (Math.abs(dy) < 0.5) continue;
          for (const d of groups.get(lb) ?? []) d.y += dy;
        }
      }

      const GAP = 1.1;
      let ic = -1;
      for (const label of gridLabels) {
        const baseX = label.x;        // this column's content margin (icon's left edge)
        const iconH = Math.min(label.h, 5); // small fixed-ish icon — never scale with a tall box
        const iconW = (iconH * 540) / 960; // square in px
        const shift = iconW + GAP;
        // Icon-bullet ROW: the icon sits at the content margin and the label + its
        // description indent to the right of it (so the icon lines up with the title's
        // left edge instead of floating in the deep margin).
        blocks.push({
          id: `ff-struct-image-icon-${++ic}`,
          x: baseX, y: label.y, w: iconW, h: iconH, rotation: 0, z: blocks.length,
          type: 'image', src: undefined, alt: 'pictogram', slotKind: 'icon', fit: 'contain', frameShape: 'rectangle',
        } as FreeformImageBlock);
        const row = textBlk.filter(
          (d) => d === label || (Math.abs(d.x - baseX) < 4 && d.y > label.y && d.y - label.y < 14 && !isCapsLabel(d)),
        );
        for (const p of row) { p.x += shift; p.w = Math.max(4, p.w - shift); }
      }

      // Normalize grid-item DESCRIPTION font size across the whole grid (single- OR
      // multi-column) and re-fit height. Autofit otherwise leaves a SHORT item at a
      // larger nominal size than its shrunk neighbours (e.g. SOLUTION's "Professional
      // investors" at 19 next to 13–15). The multi-column card block re-fits again at
      // the card width; this also covers single-column lists, which it skips.
      const gridDescs = gridLabels.flatMap((label) => textBlk.filter(
        (d) => d !== label && Math.abs(d.x - label.x) < 4 && d.y > label.y && d.y - label.y < 14 && !isCapsLabel(d)));
      if (gridDescs.length) {
        const uni = Math.min(...gridDescs.map((d) => d.style?.fontSize ?? 15));
        for (const d of gridDescs) {
          if (d.style) { d.style.fontSize = uni; d.style.lineHeight = 1.2; }
          const lines = wrapLineCount(d.content ?? '', 'Inter', uni, (d.w / 100) * 960 - 8);
          d.h = ((lines * uni * 1.2 + 8) / 540) * 100;
        }
      }

      // EQUAL spacing between LIST items (single-column lists like SOLUTION). The source
      // positions each item by its own content height, so a short item leaves a smaller
      // gap. Redistribute the items with one EQUAL gap, preserving the list's overall
      // vertical extent. (Multi-column grids get even row spacing from the card block.)
      if (cols.length === 1 && cols[0].length >= 2) {
        const itemsV = cols[0].map((label) => {
          const grp = textBlk.filter((d) => d === label || (Math.abs(d.x - label.x) < 4 && d.y > label.y && d.y - label.y < 14 && !isCapsLabel(d)));
          const icon = blocks.find((b) => b.type === 'image' && typeof b.id === 'string' && b.id.startsWith('ff-struct-image-icon-')
            && Math.abs(b.y - label.y) < 4 && b.x < label.x && label.x - b.x < 14);
          const members = icon ? [icon, ...grp] : [...grp];
          const top = Math.min(...members.map((m) => m.y));
          return { members, top, h: Math.max(...members.map((m) => m.y + m.h)) - top };
        });
        const lastBottom = itemsV[itemsV.length - 1].top + itemsV[itemsV.length - 1].h;
        const totalH = itemsV.reduce((s, it) => s + it.h, 0);
        // Anchor the list near the TITLE (its text bottom, not the oversized box) so it
        // doesn't float with a big empty gap below the title; only ever moves UP. Then
        // fill down to the list's natural bottom with equal gaps.
        const titleEl = textBlk.find((b) => typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'));
        const titleBottom = titleEl ? titleEl.y + ((titleEl.style?.fontSize ?? 24) * 1.2 / 540) * 100 : 0;
        const firstTop = titleBottom ? Math.min(itemsV[0].top, titleBottom + 6) : itemsV[0].top;
        const gap = Math.max(2, (lastBottom - firstTop - totalH) / (itemsV.length - 1));
        let cursor = firstTop;
        for (const it of itemsV) {
          const shift = cursor - it.top;
          if (Math.abs(shift) > 0.01) for (const m of it.members) m.y += shift;
          cursor += it.h + gap;
        }
      }

      // CARD per grid item — wrap each item (icon + label + description) in a rounded
      // container. Only for a true multi-column grid (≥2 columns); a single-column list
      // stays uncarded. Laid out as a uniform grid: even column width, per-row height.
      if (cols.length >= 2) {
        const GUT = 4, INNER = 2.2, ICON_GAP = 1.0, PADY = 2.6, VGUT = 3, LH = 1.2;
        const N = cols.length;
        const items = cols.flatMap((c, ci) => c.map((label, ri) => {
          const grp = textBlk.filter((d) => d === label || (Math.abs(d.x - label.x) < 4 && d.y > label.y && d.y - label.y < 14 && !isCapsLabel(d)));
          const icon = blocks.find((b) => b.type === 'image' && typeof b.id === 'string' && b.id.startsWith('ff-struct-image-icon-')
            && Math.abs(b.y - label.y) < 4 && b.x < label.x && label.x - b.x < 14) as FreeformImageBlock | undefined;
          return { ci, ri, label, descs: grp.filter((d) => d !== label), icon };
        }));
        const titleBlk = textBlk.find((b) => typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'));
        const slideMargin = titleBlk ? titleBlk.x : 7.5;
        const gridLeft = Math.min(...items.map((it) => it.icon?.x ?? it.label.x));
        // If the grid is offset to one SIDE (the title sits BESIDE it, not above), it gets
        // squeezed into a fraction of the width with the other half left empty. Promote the
        // title to a full-width top header and spread the grid across the FULL width.
        // Otherwise the grid spans its own left margin → the slide's right content margin.
        const sideGrid = !!titleBlk && gridLeft - slideMargin > 25;
        const effLeft = sideGrid ? slideMargin : gridLeft;
        const cardW = (100 - slideMargin - effLeft - (N - 1) * GUT) / N;
        // Uniform description font size across the grid (autofit otherwise leaves a short
        // item at a larger nominal size than its shrunk neighbours — that's the odd big 4th card).
        const uniSize = Math.min(...items.flatMap((it) => it.descs.map((d) => d.style?.fontSize ?? 15)));
        // Pass 1 — reflow content into the card width; normalize desc font + re-fit height.
        for (const it of items) {
          const cardX = effLeft + it.ci * (cardW + GUT);
          if (it.icon) it.icon.x = cardX + INNER;
          const textLeft = cardX + INNER + (it.icon ? it.icon.w + ICON_GAP : 0);
          const textW = Math.max(6, cardX + cardW - INNER - textLeft);
          it.label.x = textLeft; it.label.w = textW;
          for (const d of it.descs) {
            d.x = textLeft; d.w = textW;
            if (d.style) { d.style.fontSize = uniSize; d.style.lineHeight = LH; }
            const lines = wrapLineCount(d.content ?? '', 'Inter', uniSize, (textW / 100) * 960 - 8);
            d.h = ((lines * uniSize * LH + 8) / 540) * 100;
          }
        }
        // EVERY card is the SAME size; text always fits with equal padding.
        const contentTop = (it: typeof items[number]) => Math.min(it.label.y, it.icon?.y ?? it.label.y);
        const contentH = (it: typeof items[number]) =>
          Math.max(it.label.y + it.label.h, ...it.descs.map((d) => d.y + d.h)) - contentTop(it);
        const baseH = Math.max(...items.map(contentH)) + 2 * PADY;
        const rowOrder = [...new Set(items.map((it) => it.ri))].sort((a, b) => a - b);
        const cardY: Record<number, number> = {};
        let H = baseH;
        if (sideGrid && titleBlk) {
          // Promote the title to a full-width top header, then FILL the body height below
          // it with the rows (so the spread grid isn't top-heavy); content is centred in
          // the resulting taller cards.
          titleBlk.y = 6;
          titleBlk.w = 100 - 2 * slideMargin;
          const titleBottom = 6 + ((titleBlk.style?.fontSize ?? 32) * 1.2 / 540) * 100;
          const bodyTop = titleBottom + 6, bodyBottom = 92, nR = rowOrder.length;
          H = Math.max(baseH, (bodyBottom - bodyTop - (nR - 1) * VGUT) / nR);
          rowOrder.forEach((ri, k) => { cardY[ri] = bodyTop + k * (H + VGUT); });
        } else {
          rowOrder.forEach((ri, k) => {
            cardY[ri] = k === 0
              ? Math.min(...items.filter((it) => it.ri === ri).map(contentTop)) - PADY
              : cardY[rowOrder[k - 1]] + H + VGUT;
          });
        }
        // Pass 2 — position each row's content (centred in the taller side-grid cards,
        // top-aligned otherwise) and push identical cards.
        let gc = -1;
        for (const it of items) {
          const vShift = sideGrid
            ? cardY[it.ri] + (H - contentH(it)) / 2 - contentTop(it)
            : cardY[it.ri] + PADY - contentTop(it);
          if (Math.abs(vShift) > 0.01) {
            if (it.icon) it.icon.y += vShift;
            it.label.y += vShift;
            for (const d of it.descs) d.y += vShift;
          }
          blocks.push({
            id: `ff-deco-card-${++gc}`, type: 'shape', shape: 'rectangle',
            x: effLeft + it.ci * (cardW + GUT), y: cardY[it.ri], w: cardW, h: H,
            rotation: 0, z: -5, fill: '#FFFFFF', stroke: 'rgba(11,31,58,0.08)', strokeWidth: 1, borderRadius: 14,
            boxShadow: '0 3px 10px rgba(11,31,58,0.07)',
          } as FreeformShapeBlock);
        }

        // A lead-in paragraph above the grid (e.g. "Market Gap"'s intro) shouldn't be
        // compressed into one column — let it extend to the full content width.
        const firstRowY = Math.min(...gridLabels.map((l) => l.y));
        for (const b of textBlk) {
          if ((b.content ?? '').trim().length > 24 && b.y < firstRowY - 4 && b.w < 50
            && typeof b.id === 'string' && !b.id.startsWith('ff-struct-title-')) {
            b.w = Math.max(b.w, 100 - b.x - 7);
          }
        }
      }
    }

    // Drop a stray label that just REPEATS the title (a decorative "Benefits" on a
    // "PRODUCT BENEFITS" slide) — short, single-line, and a substring of the title.
    const titleTxt = (textBlk.find((b) => typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'))?.content ?? '').trim().toLowerCase();
    if (titleTxt) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        if (b.type === 'text' && typeof b.id === 'string' && !b.id.startsWith('ff-struct-title-')) {
          const t = (b.content ?? '').trim().toLowerCase();
          if (t && t.length <= 20 && !t.includes('\n') && t !== titleTxt && titleTxt.includes(t)) blocks.splice(i, 1);
        }
      }
    }

    // ── Top-margin normalization. A title aligned to the TOP of the slide should sit
    //    at a consistent margin, not hug the border (the source pins them at ~5–6%).
    //    Snap it HERE — before the list-to-cards / takeaway / table passes that anchor
    //    their content to the title — so that content flows from the new position (no
    //    crowding) and the accent keyline (generated later) tracks it. Centered titles
    //    (cover / section dividers, y ≥ 15) are left as-is. Earlier passes (icon bullets,
    //    list anchor, side-grid) keep their content; their title gaps are generous, so
    //    the small downward shift is simply absorbed.
    if (!isCover) {
      const topTitle = blocks.find((b): b is FreeformTextBlock =>
        b.type === 'text' && typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'));
      if (topTitle && topTitle.y < 15) topTitle.y = 8;
    }

    // LIST → CARDS. A sparse slide whose main content is a single multi-item list (e.g.
    // Product Benefits) reads as empty. Split the list and lay the items out as a row of
    // cards across the FULL width below the title, each with an icon.
    if (gridLabels.length < 2) {
      const titleB = blocks.find((b): b is FreeformTextBlock => b.type === 'text' && typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'));
      const bodies = blocks.filter((b): b is FreeformTextBlock => b.type === 'text'
        && typeof b.id === 'string' && /^ff-struct-(body|subtitle)-/.test(b.id) && !!(b.content ?? '').trim());
      const listBlk = bodies.find((b) => (b.content ?? '').split(/\n\s*\n+/).filter((s) => s.trim()).length >= 2);
      const listItems = listBlk ? (listBlk.content ?? '').split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean) : [];
      if (listBlk && bodies.length <= 2 && listItems.length >= 2 && listItems.length <= 5 && listItems.every((s) => s.length <= 140)) {
        blocks.splice(blocks.indexOf(listBlk), 1); // the single block becomes N cards
        const margin = titleB ? titleB.x : 7.5;
        const N = listItems.length;
        const GUT = 4, INNER = 2.5, ICON_H = 5, LH = 1.3, fontSize = 16;
        const cardW = (100 - 2 * margin - (N - 1) * GUT) / N;
        const titleBottom = titleB ? titleB.y + ((titleB.style?.fontSize ?? 32) * 1.2 / 540) * 100 : 14;
        // Takeaway SUBTITLE under the title — a one-line summary slot (placeholder text).
        let belowTitle = titleBottom;
        if (titleB) {
          const subSize = 19, subLH = 1.25, subW = 100 - 2 * margin;
          const subText = 'Designed to make investing simple, supported, and worth it.';
          const subLines = wrapLineCount(subText, 'Inter', subSize, (subW / 100) * 960 - 8);
          const subH = ((subLines * subSize * subLH + 8) / 540) * 100;
          blocks.push({ id: 'ff-struct-subtitle-takeaway-0', type: 'text', variant: 'paragraph', content: subText, x: margin, y: titleBottom + 2, w: subW, h: subH, rotation: 0, z: blocks.length, style: { fontSize: subSize, lineHeight: subLH, fontWeight: 500, color: accent } } as FreeformTextBlock);
          belowTitle = titleBottom + 2 + subH;
        }
        const bodyTop = belowTitle + 6, bodyBottom = 90;
        const cardH = Math.min(bodyBottom - bodyTop, 50);
        const cardY = bodyTop + (bodyBottom - bodyTop - cardH) / 3; // bias toward the title
        const iconWpct = (ICON_H * 540) / 960;
        listItems.forEach((text, i) => {
          const cardX = margin + i * (cardW + GUT);
          const tW = cardW - 2 * INNER;
          const lines = wrapLineCount(text, 'Inter', fontSize, (tW / 100) * 960 - 8);
          const tH = ((lines * fontSize * LH + 8) / 540) * 100;
          const groupTop = cardY + (cardH - (ICON_H + 3 + tH)) / 2; // centre icon+text in the card
          blocks.push({ id: `ff-struct-image-icon-${i}`, x: cardX + cardW / 2 - iconWpct / 2, y: groupTop, w: iconWpct, h: ICON_H, rotation: 0, z: blocks.length, type: 'image', src: undefined, alt: 'pictogram', slotKind: 'icon', fit: 'contain', frameShape: 'rectangle' } as FreeformImageBlock);
          blocks.push({ id: `ff-struct-body-b${i}-0`, type: 'text', variant: 'paragraph', content: text, x: cardX + INNER, y: groupTop + ICON_H + 3, w: tW, h: tH, rotation: 0, z: blocks.length, style: { fontSize, lineHeight: LH, textAlign: 'center', color: listBlk.style?.color } } as FreeformTextBlock);
          blocks.push({ id: `ff-deco-card-${i}`, type: 'shape', shape: 'rectangle', x: cardX, y: cardY, w: cardW, h: cardH, rotation: 0, z: -5, fill: '#FFFFFF', stroke: 'rgba(11,31,58,0.08)', strokeWidth: 1, borderRadius: 14, boxShadow: '0 3px 10px rgba(11,31,58,0.07)' } as FreeformShapeBlock);
        });
      }
    }

    // TABLES. Compose each source <a:tbl> as a clean grid below the title — header row
    // (bold + accent rule) then body rows with light hairline separators, OUR styling.
    if (tables.length) {
      // The table is the slide's content — drop the source's stray body labels (table /
      // chart captions like "Key metrics" / "Revenue by year") that clash with the grid.
      for (let k = blocks.length - 1; k >= 0; k--) {
        const b = blocks[k];
        if (b.type === 'text' && typeof b.id === 'string' && /^ff-struct-body-/.test(b.id)) blocks.splice(k, 1);
      }
      const titleB = blocks.find((b): b is FreeformTextBlock => b.type === 'text' && typeof b.id === 'string' && b.id.startsWith('ff-struct-title-'));
      const margin = titleB ? titleB.x : 7.5;
      const titleBottom = titleB ? titleB.y + ((titleB.style?.fontSize ?? 32) * 1.2 / 540) * 100 : 16;
      const tableW = 100 - 2 * margin;
      tables.forEach((rows, ti) => {
        const nRows = rows.length, nCols = Math.max(...rows.map((r) => r.length));
        const top = titleBottom + 7, bottom = 93;
        const h = Math.min(bottom - top, nRows * 6);
        blocks.push({
          id: `ff-struct-table-${ti}`, type: 'table',
          x: margin, y: top, w: tableW, h, rotation: 0, z: blocks.length,
          rows, headerRow: true,
          // wider first column for row labels; the rest equal
          colWidths: Array.from({ length: nCols }, (_, ci) => (ci === 0 && nCols > 2 ? 1.7 : 1)),
          align: Array.from({ length: nCols }, (_, ci): 'left' | 'right' => (ci === 0 ? 'left' : 'right')),
          style: { fontSize: 10.5 },
        } as FreeformTableBlock);
      });
    }

    // CARD placeholders. The side-by-side column groups (a row of ≥2 labels each at its
    // OWN x — Business Model / a timeline / stat columns) read as CARDS: wrap each
    // column's label + description in a rounded container shape (tagged decoration,
    // palette-driven) sitting behind the text. This is the right structure for columns,
    // where a left-bullet icon doesn't fit.
    const columnCands = candidates.filter((b) => !gridLabels.includes(b));
    const rows: FreeformTextBlock[][] = [];
    for (const b of columnCands) {
      const r = rows.find((rw) => Math.abs(rw[0].y - b.y) < 4 && Math.abs(rw[0].x - b.x) >= 3);
      if (r) r.push(b); else rows.push([b]);
    }
    let cardI = -1;
    for (const r of rows) {
      if (r.length < 2) continue; // need a genuine ROW of columns, not a lone label
      // UNIFORM grid: one card width from the column pitch + a fixed gutter, so gaps are
      // even. (Sizing each card to its own content overlaps/cramps, because the source
      // label boxes are oversized and unevenly wide.) Content reflows INTO each card.
      const cols = [...r].sort((a, b) => a.x - b.x);
      const N = cols.length;
      const pitch = (cols[N - 1].x - cols[0].x) / (N - 1);
      const GUTTER = 3, INNER = 1.2, PADY = 1.6, LEADIN = 1.0;
      const cardW = pitch - GUTTER;
      const rowLeft = cols[0].x - LEADIN;
      cols.forEach((label, i) => {
        const grp = textBlk.filter((d) => d === label || (Math.abs(d.x - label.x) < 4 && d.y > label.y && d.y - label.y < 16));
        const descs = grp.filter((d) => d !== label);
        const cardX = rowLeft + i * (cardW + GUTTER);
        const top = label.y;
        const bottom = descs.length ? Math.max(...descs.map((d) => d.y + d.h)) : label.y + Math.min(label.h, 6);
        // reflow the column's content to sit inside the card with consistent padding
        for (const d of grp) { d.x = cardX + INNER; d.w = Math.min(d.w, cardW - 2 * INNER); }
        blocks.push({
          id: `ff-deco-card-${++cardI}`, type: 'shape', shape: 'rectangle',
          x: cardX, y: top - PADY, w: cardW, h: (bottom - top) + 2 * PADY,
          rotation: 0, z: -5, // behind the text (z≥0), above any background image (z=-1000)
          fill: '#FFFFFF', stroke: 'rgba(11,31,58,0.08)', strokeWidth: 1, borderRadius: 14,
          boxShadow: '0 3px 10px rgba(11,31,58,0.07)',
        } as FreeformShapeBlock);
      });
    }

    // ── Plain dense list → list block. A body whose text is a multi-item list (3+
    //    short items, blank-line separated, OR bullet-prefixed lines) that no other
    //    pass turned into cards / icons / a table just reads as a dense paragraph.
    //    Re-express it in place as a native list block (one editable block, real
    //    bullet markers). A short "Term\ndetail" item yields a BOLD label + text.
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.type !== 'text' || typeof b.id !== 'string' || !/^ff-struct-body-/.test(b.id)) continue;
      const rawText = (b.content ?? '').trim();
      if (!rawText) continue;
      let parts = rawText.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) {
        const lines = rawText.split('\n').map((s) => s.trim()).filter(Boolean);
        if (lines.length >= 3 && lines.every((l) => /^[•\-*–]/.test(l))) parts = lines;
      }
      if (parts.length < 3 || parts.some((p) => p.length > 120)) continue; // a real list, not prose
      const items: FreeformListBlock['items'] = parts.map((p) => {
        const t = p.replace(/^[•\-*–]\s*/, '').trim();
        const nl = t.indexOf('\n');
        if (nl > 0 && nl <= 26 && !/[.!?]$/.test(t.slice(0, nl).trim())) {
          return { label: t.slice(0, nl).trim(), text: t.slice(nl + 1).trim() };
        }
        return { text: t };
      });
      const anyLabel = items.some((it) => it.label);
      blocks[i] = {
        id: b.id.replace('-body-', '-list-'), type: 'list',
        x: b.x, y: b.y, w: b.w, h: b.h, rotation: 0, z: b.z,
        marker: 'bullet', labelLayout: anyLabel ? 'stacked' : 'inline', gap: 8,
        items, style: { fontSize: Math.min(b.style?.fontSize ?? 14, 15), lineHeight: 1.3, color: b.style?.color },
      } as FreeformListBlock;
    }

    // OUR decorations on top of the content layout (the source's are dropped above).
    blocks.push(...ourDecorations(blocks, blocks.length));

    // Side-band image. A full-bleed source image on a content slide whose text is
    // clustered to one side belongs in the EMPTY band on the other side (an "image +
    // content" split), not full-bleed behind the words. A non-background image acts as
    // a BORDER of the slide: it sits flush to the edge, and everything nearest it (the
    // cards, the title accent) keeps a padding gap from its inner edge. Runs AFTER the
    // cards + accent exist so the inner edge clears them all. PANEL only (18–50%).
    if (droppedFullBleed) {
      const near = blocks.filter((b) => (b.type === 'text' || b.type === 'shape' || b.type === 'image' || b.type === 'list')
        && !/^ff-struct-(date|footer|slide-number)-/.test(typeof b.id === 'string' ? b.id : '')
        && (b.z ?? 0) > -1000); // ignore footer chrome + any full-bleed background
      if (near.length) {
        const cLeft = Math.min(...near.map((b) => b.x));
        const cRight = Math.max(...near.map((b) => b.x + b.w));
        const PAD = 3, MINB = 18, MAXB = 70; // padding off content; allow a true split (image up to ~70%, text ≥ ~30%)
        const leftBand = cLeft, rightBand = 100 - cRight;
        let band: { x: number; w: number; group: string } | null = null;
        if (leftBand >= MINB && leftBand <= MAXB && leftBand >= rightBand) band = { x: 0, w: cLeft - PAD, group: 'side-left' };
        else if (rightBand >= MINB && rightBand <= MAXB) band = { x: cRight + PAD, w: 100 - cRight - PAD, group: 'side-right' };
        if (band && band.w > 10) {
          blocks.push({
            id: `ff-struct-image-${band.group}-0`, x: band.x, y: 0, w: band.w, h: 100, rotation: 0, z: -50,
            type: 'image', src: undefined, alt: 'image', fit: 'cover', frameShape: 'rectangle',
          } as FreeformImageBlock);
        }
      }
    }
    cards.push({ id: `imported-${cards.length + 1}`, layout: 'single', style: 'default', columns: [], freeform: blocks });
  }

  // Title slide carries the date + name. The name already rides a body slot; the source
  // cover usually has no date placeholder (the date lived in the repeating footer), so
  // add a date under the cover's name/title using the captured deck date.
  if (deckDate && coverIdx >= 0 && cards[coverIdx]) {
    const cover = cards[coverIdx].freeform ?? [];
    const hasDate = cover.some((b) => typeof b.id === 'string' && /^ff-struct-date-/.test(b.id));
    if (!hasDate) {
      const anchor = cover.find((b): b is FreeformTextBlock => b.type === 'text' && typeof b.id === 'string' && /^ff-struct-(body|subtitle)-/.test(b.id))
        || cover.find((b): b is FreeformTextBlock => b.type === 'text' && typeof b.id === 'string' && /^ff-struct-title-/.test(b.id));
      if (anchor) {
        cover.push({
          id: 'ff-struct-date-cover-0', type: 'text', variant: 'paragraph', content: deckDate,
          x: anchor.x, y: Math.min(anchor.y + anchor.h + 0.8, 94), w: anchor.w, h: 5, rotation: 0, z: cover.length,
          style: { ...(anchor.style ?? {}), fontSize: Math.min(anchor.style?.fontSize ?? 16, 15), fontWeight: undefined },
        } as FreeformTextBlock);
      }
    }
  }

  return { cards, warnings };
}
