// Foxit Slidewright — native tables (<a:tbl> inside a <p:graphicFrame>).
//
// A PowerPoint table is a graphicFrame carrying an <a:tbl>: a <a:tblGrid> of
// column widths, then one <a:tr> per row, each holding exactly gridCols <a:tc>.
// Merges are expressed by a gridSpan/rowSpan on the anchor cell plus hMerge/vMerge
// placeholder cells for the covered positions — we compute those from a merge list
// so the caller just passes a full text grid + which rectangles are merged.

import { escapeText, escapeAttr } from './xml';
import { inchToEmu, ptToCentipoint, ptToEmu } from './emu';
import { normHex, type DashType } from './colors';

/** A formatted run inside a cell (for mixed-format cell text). */
export interface TableCellRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  sizePt?: number;
  fontFace?: string;
}
export interface TableCellContent {
  text?: string;
  runs?: TableCellRun[]; // overrides `text` with mixed-format runs
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  sizePt?: number;
  fontFace?: string;
  /** Cell padding, inches — single value or [top, right, bottom, left]. */
  marginIn?: number | [number, number, number, number];
  /** Per-cell border override (all sides). */
  border?: { color?: string; widthPt?: number; dashType?: DashType };
}
export interface TableMerge { r: number; c: number; rs: number; cs: number }

export interface TableSpec {
  xIn: number; yIn: number; wIn: number; hIn: number;
  colWidthsIn: number[];
  rowHeightsIn?: number[];
  rows: TableCellContent[][]; // full grid, rows × cols (ragged rows padded)
  merges?: TableMerge[];
  headerRow?: boolean;
  headerFill?: string; // hex
  headerColor?: string; // hex
  headerRuleColor?: string; // hex — accent bottom-rule under the header
  bodyColor?: string; // hex
  bodyBorderColor?: string; // hex
  fontFace?: string;
  fontSizePt?: number;
}

function fontXml(name?: string): string {
  return name ? `<a:latin typeface="${escapeAttr(name)}"/><a:cs typeface="${escapeAttr(name)}"/>` : '';
}

function cellTxBody(cell: TableCellContent, spec: TableSpec, isHeader: boolean): string {
  const algn = cell.align === 'center' ? 'ctr' : cell.align === 'right' ? 'r' : 'l';
  const sz = ptToCentipoint(cell.sizePt ?? spec.fontSizePt ?? 12);
  const defColor = normHex(cell.color) ?? normHex(isHeader ? spec.headerColor : spec.bodyColor) ?? '333333';
  const cellFace = cell.fontFace ?? spec.fontFace;
  const mkRun = (r: TableCellRun): string => {
    const rsz = ptToCentipoint(r.sizePt ?? cell.sizePt ?? spec.fontSizePt ?? 12);
    const b = (r.bold ?? cell.bold ?? isHeader) ? ' b="1"' : '';
    const it = (r.italic ?? cell.italic) ? ' i="1"' : '';
    const u = (r.underline ?? cell.underline) ? ' u="sng"' : '';
    const col = normHex(r.color) ?? defColor;
    return `<a:r><a:rPr lang="en-US" sz="${rsz}"${b}${it}${u} dirty="0"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill>${fontXml(r.fontFace ?? cellFace)}</a:rPr><a:t>${escapeText(r.text)}</a:t></a:r>`;
  };
  let runsXml: string;
  if (cell.runs && cell.runs.length) {
    runsXml = cell.runs.map(mkRun).join('');
  } else if (cell.text) {
    runsXml = mkRun({ text: cell.text, bold: cell.bold, italic: cell.italic, underline: cell.underline, color: cell.color, sizePt: cell.sizePt, fontFace: cell.fontFace });
  } else {
    runsXml = '';
  }
  return `<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${algn}"/>${runsXml}<a:endParaRPr lang="en-US" sz="${sz}"/></a:p></a:txBody>`;
}

/** Cell properties: margins, vertical anchor, borders, fill. gridSpan/rowSpan are
 *  NOT here — they belong on the <a:tc> element (schema-correct). */
function tcPr(cell: TableCellContent, spec: TableSpec, isHeader: boolean): string {
  const anchor = cell.valign === 'top' ? 't' : cell.valign === 'bottom' ? 'b' : 'ctr';
  const m = cell.marginIn;
  const [mt, mr, mb, ml] = Array.isArray(m) ? m : m != null ? [m, m, m, m] : [null, null, null, null];
  const marAttrs =
    `marL="${ml != null ? inchToEmu(ml) : 91440}" marR="${mr != null ? inchToEmu(mr) : 91440}" ` +
    `marT="${mt != null ? inchToEmu(mt) : 45720}" marB="${mb != null ? inchToEmu(mb) : 45720}"`;
  const ln = (tag: string, w: number, col: string, dash: DashType = 'solid') =>
    `<a:${tag} w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:prstDash val="${dash}"/></a:${tag}>`;
  let borders: string;
  if (cell.border && normHex(cell.border.color)) {
    // Per-cell override — same border on all four sides.
    const col = normHex(cell.border.color)!;
    const w = ptToEmu(cell.border.widthPt ?? 0.5);
    const dash = cell.border.dashType ?? 'solid';
    borders = ln('lnL', w, col, dash) + ln('lnR', w, col, dash) + ln('lnT', w, col, dash) + ln('lnB', w, col, dash);
  } else if (isHeader) {
    borders = ln('lnB', 19050, normHex(spec.headerRuleColor) ?? normHex(spec.headerFill) ?? '6B3FA0');
  } else {
    const col = normHex(spec.bodyBorderColor) ?? 'E5E5E5';
    borders = ln('lnL', 6350, col) + ln('lnR', 6350, col) + ln('lnT', 6350, col) + ln('lnB', 6350, col);
  }
  const fillHex = normHex(cell.fill) ?? (isHeader ? normHex(spec.headerFill) : undefined);
  const fill = fillHex ? `<a:solidFill><a:srgbClr val="${fillHex}"/></a:solidFill>` : '<a:noFill/>';
  return `<a:tcPr ${marAttrs} anchor="${anchor}">${borders}${fill}</a:tcPr>`;
}

export function buildTableFrame(shapeId: number, spec: TableSpec): string {
  const nCols = Math.max(1, spec.colWidthsIn.length, ...spec.rows.map((r) => r.length));
  const totalW = spec.wIn;
  const colW = spec.colWidthsIn.length === nCols ? spec.colWidthsIn : Array(nCols).fill(totalW / nCols);

  // Merge maps: anchor → {rs,cs}; covered → 'h' | 'v' | 'both'.
  const anchor = new Map<string, { rs: number; cs: number }>();
  const covered = new Map<string, 'h' | 'v'>();
  for (const m of spec.merges ?? []) {
    const rs = Math.max(1, m.rs), cs = Math.max(1, m.cs);
    anchor.set(`${m.r},${m.c}`, { rs, cs });
    for (let dr = 0; dr < rs; dr++)
      for (let dc = 0; dc < cs; dc++) {
        if (dr === 0 && dc === 0) continue;
        // A cell in the anchor's row but a later column merges horizontally;
        // any cell in a later row merges vertically.
        covered.set(`${m.r + dr},${m.c + dc}`, dr === 0 ? 'h' : 'v');
      }
  }

  const grid = colW.map((w) => `<a:gridCol w="${inchToEmu(w)}"/>`).join('');

  const nRows = spec.rows.length;
  const rowH = spec.rowHeightsIn && spec.rowHeightsIn.length === nRows
    ? spec.rowHeightsIn
    : Array(nRows).fill(spec.hIn / Math.max(1, nRows));

  const trs = spec.rows
    .map((row, r) => {
      let tcs = '';
      for (let c = 0; c < nCols; c++) {
        const cell = row[c] ?? { text: '' };
        const isHeader = !!spec.headerRow && r === 0;
        const cov = covered.get(`${r},${c}`);
        const a = anchor.get(`${r},${c}`);
        if (cov === 'h') {
          tcs += `<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>`;
        } else if (cov === 'v') {
          tcs += `<a:tc vMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody><a:tcPr/></a:tc>`;
        } else {
          // gridSpan/rowSpan are attributes of <a:tc> (NOT tcPr) per the OOXML schema.
          const span = (a && a.cs > 1 ? ` gridSpan="${a.cs}"` : '') + (a && a.rs > 1 ? ` rowSpan="${a.rs}"` : '');
          tcs += `<a:tc${span}>${cellTxBody(cell, spec, isHeader)}${tcPr(cell, spec, isHeader)}</a:tc>`;
        }
      }
      return `<a:tr h="${inchToEmu(rowH[r])}">${tcs}</a:tr>`;
    })
    .join('');

  const tbl =
    `<a:tbl><a:tblPr firstRow="${spec.headerRow ? 1 : 0}" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid>${trs}</a:tbl>`;

  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId}" name="Table ${shapeId}"/>` +
    `<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${inchToEmu(spec.xIn)}" y="${inchToEmu(spec.yIn)}"/><a:ext cx="${inchToEmu(spec.wIn)}" cy="${inchToEmu(spec.hIn)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">${tbl}</a:graphicData></a:graphic></p:graphicFrame>`
  );
}
