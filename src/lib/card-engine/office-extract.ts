/**
 * Native OOXML structure extraction for DOCX / PPTX.
 *
 * Parses Office Open XML directly (zip + XML) and emits the same
 * `PDFLayoutElement[]` contract the rest of the source-grounded pipeline
 * consumes — preserving the document's DECLARED structure (heading levels,
 * lists, tables, slide titles) instead of converting to PDF first and forcing
 * Layer-2/Layer-4 to re-infer it (lossy). Provenance `page` is real where the
 * format provides it: PPTX slide number, DOCX page-break-derived page.
 *
 * Only true OOXML (.docx/.pptx) is handled here; legacy binary .doc/.ppt are
 * NOT zips and stay on the PDF-conversion path in source-blueprint.
 */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { PDFLayoutElement } from '@/lib/foxit-sdk-server';

// preserveOrder keeps document order of interleaved paragraphs/tables/shapes —
// essential for both structure and provenance. Each node is
// `{ <tag>: PNode[], ':@'?: attrs }`; text nodes are `{ '#text': value }`.
type PNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false, // keep run whitespace so words don't fuse
});

// ── preserveOrder node helpers ──────────────────────────────────────────────

function tagName(n: PNode): string | undefined {
  for (const k in n) if (k !== ':@' && k !== '#text') return k;
  return undefined;
}
function kids(n: PNode): PNode[] {
  const t = tagName(n);
  return t ? ((n[t] as PNode[]) ?? []) : [];
}
function attrVal(n: PNode, name: string): string | undefined {
  const v = (n[':@'] as Record<string, unknown> | undefined)?.['@_' + name];
  return v == null ? undefined : String(v);
}
function findDeep(nodes: PNode[], tag: string): PNode | undefined {
  for (const n of nodes) {
    if (tagName(n) === tag) return n;
    const f = findDeep(kids(n), tag);
    if (f) return f;
  }
  return undefined;
}
function findAll(nodes: PNode[], tag: string, out: PNode[] = []): PNode[] {
  for (const n of nodes) {
    if (tagName(n) === tag) out.push(n);
    findAll(kids(n), tag, out);
  }
  return out;
}
/** Concatenate the text of every `textTag` (w:t / a:t) under these nodes. */
function gatherText(nodes: PNode[], textTag: string): string {
  let s = '';
  for (const n of nodes) {
    if (tagName(n) === textTag) {
      for (const c of kids(n)) { const t = c['#text']; if (t != null) s += String(t); }
    } else {
      s += gatherText(kids(n), textTag);
    }
  }
  return s;
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// ── DOCX ────────────────────────────────────────────────────────────────────

function paraStyle(p: PNode): string | undefined {
  const pPr = kids(p).find((n) => tagName(n) === 'w:pPr');
  if (!pPr) return undefined;
  const pStyle = kids(pPr).find((n) => tagName(n) === 'w:pStyle');
  return pStyle ? attrVal(pStyle, 'w:val') : undefined;
}
function paraIsList(p: PNode): boolean {
  const pPr = kids(p).find((n) => tagName(n) === 'w:pPr');
  return !!pPr && kids(pPr).some((n) => tagName(n) === 'w:numPr');
}
/** True if the paragraph contains a hard or last-rendered page break. */
function paraHasPageBreak(p: PNode): boolean {
  if (findAll(kids(p), 'w:br').some((b) => attrVal(b, 'w:type') === 'page')) return true;
  return findAll(kids(p), 'w:lastRenderedPageBreak').length > 0;
}
/** Word style name → heading level, or null for body text. */
function headingLevel(style?: string): number | null {
  if (!style) return null;
  const m = style.match(/^heading\s*(\d)/i);
  if (m) return Math.min(6, Math.max(1, parseInt(m[1], 10)));
  if (/^title$/i.test(style)) return 1;
  if (/^subtitle$/i.test(style)) return 2;
  return null;
}
function tableText(tbl: PNode): string {
  const rows = kids(tbl).filter((n) => tagName(n) === 'w:tr');
  return rows
    .map((r) => kids(r).filter((c) => tagName(c) === 'w:tc').map((c) => clean(gatherText([c], 'w:t'))).join(' | '))
    .filter((line) => line.replace(/\s*\|\s*/g, '').length > 0)
    .join('\n');
}

export async function extractStructureFromDocx(buffer: Buffer): Promise<PDFLayoutElement[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return [];
  const body = findDeep(parser.parse(xml) as PNode[], 'w:body');
  if (!body) return [];

  const elements: PDFLayoutElement[] = [];
  let page = 1;
  for (const node of kids(body)) {
    const tag = tagName(node);
    if (tag === 'w:p') {
      const text = clean(gatherText([node], 'w:t'));
      if (text) {
        const style = paraStyle(node);
        const level = headingLevel(style);
        const isList = paraIsList(node);
        elements.push({
          type: level != null ? 'heading' : isList ? 'list' : 'paragraph',
          level: level ?? undefined,
          content: text,
          page,
          rawType: style ?? (isList ? 'L' : 'P'),
        });
      }
      // A break inside this paragraph pushes everything after it to the next page.
      if (paraHasPageBreak(node)) page += 1;
    } else if (tag === 'w:tbl') {
      const text = tableText(node);
      if (text) elements.push({ type: 'table', content: text, page, rawType: 'Tbl' });
    }
  }
  return elements;
}

// ── PPTX ────────────────────────────────────────────────────────────────────

/** Slide xml paths in PRESENTATION order (sldIdLst → rels), not file order —
 *  reordering slides in PowerPoint keeps original file names, so numeric sort
 *  is unreliable. Falls back to numeric sort if the rels can't be read. */
async function orderedSlidePaths(zip: JSZip): Promise<string[]> {
  try {
    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (presXml && relsXml) {
      const lst = findDeep(parser.parse(presXml) as PNode[], 'p:sldIdLst');
      const ids = lst
        ? kids(lst).filter((n) => tagName(n) === 'p:sldId').map((n) => attrVal(n, 'r:id')).filter(Boolean)
        : [];
      const relMap = new Map<string, string>();
      for (const rel of findAll(parser.parse(relsXml) as PNode[], 'Relationship')) {
        const id = attrVal(rel, 'Id');
        const target = attrVal(rel, 'Target');
        if (id && target) relMap.set(id, target);
      }
      const paths = ids
        .map((id) => relMap.get(id as string))
        .filter(Boolean)
        .map((t) => 'ppt/' + String(t).replace(/^\.\.\//, '').replace(/^ppt\//, '').replace(/^\//, ''));
      if (paths.length) return paths;
    }
  } catch { /* fall through to numeric sort */ }
  return Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/(\d+)/)![1], 10) - parseInt(b.match(/(\d+)/)![1], 10));
}

function shapeIsTitle(sp: PNode): boolean {
  const ph = findDeep(kids(sp), 'p:ph');
  const type = ph ? attrVal(ph, 'type') : undefined;
  return type === 'title' || type === 'ctrTitle';
}
function shapeParagraphs(sp: PNode): string[] {
  const txBody = findDeep(kids(sp), 'p:txBody');
  if (!txBody) return [];
  return kids(txBody)
    .filter((n) => tagName(n) === 'a:p')
    .map((p) => clean(gatherText([p], 'a:t')))
    .filter(Boolean);
}

export async function extractStructureFromPptx(buffer: Buffer): Promise<PDFLayoutElement[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = await orderedSlidePaths(zip);
  const elements: PDFLayoutElement[] = [];
  let page = 0;
  for (const path of slidePaths) {
    page += 1; // slide number = real page provenance
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    const tree = parser.parse(xml) as PNode[];
    for (const sp of findAll(tree, 'p:sp')) {
      const isTitle = shapeIsTitle(sp);
      for (const text of shapeParagraphs(sp)) {
        elements.push(
          isTitle
            ? { type: 'heading', level: 1, content: text, page, rawType: 'pptx-title' }
            : { type: 'paragraph', content: text, page, rawType: 'pptx-body' },
        );
      }
    }
  }
  return elements;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/** True for formats this module parses natively (OOXML zips). Legacy binary
 *  .doc/.ppt are not zips and must stay on the PDF-conversion path. */
export function isNativeOfficeFormat(filename: string): 'docx' | 'pptx' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pptx')) return 'pptx';
  return null;
}

export async function extractOfficeStructure(
  buffer: Buffer,
  kind: 'docx' | 'pptx',
): Promise<PDFLayoutElement[]> {
  return kind === 'docx' ? extractStructureFromDocx(buffer) : extractStructureFromPptx(buffer);
}
