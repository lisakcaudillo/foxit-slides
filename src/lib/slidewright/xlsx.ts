// Foxit Slidewright — the embedded chart-data workbook.
//
// A native PowerPoint chart references a real .xlsx workbook for its data (so the
// user can "Edit Data"). This builds a minimal-but-valid workbook: content-types,
// package rels, workbook + its rels, one worksheet, sharedStrings, and styles.
// Layout: A1 blank; B1,C1,… series names; A2.. category labels; B2..,C2.. values.
// The cell references here MUST match the c:f formulas the chart emits.

import JSZip from 'jszip';
import { XML_DECL, escapeText } from './xml';

/** Column letter for a 0-based index (0→A, 1→B, …). Charts stay well under 26 cols. */
export function colLetter(i: number): string {
  let n = i, s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

export interface WorkbookData {
  categories: Array<string | number>;
  series: Array<{ name: string; values: number[] }>;
  /** When true, column A (categories) holds NUMBERS (scatter/bubble X axis) rather
   *  than shared strings. */
  categoriesNumeric?: boolean;
}

/** Build the embedded .xlsx as raw bytes (a nested zip). */
export async function buildChartWorkbook(data: WorkbookData): Promise<Uint8Array> {
  const nRows = data.categories.length; // data rows (excludes header row 1)
  const nSer = data.series.length;

  // Shared strings: index 0 = "" (A1 blank), then series names, then categories.
  const strings: string[] = [''];
  const strIdx = new Map<string, number>();
  strIdx.set('', 0);
  const intern = (s: string): number => {
    if (strIdx.has(s)) return strIdx.get(s)!;
    const idx = strings.length;
    strings.push(s);
    strIdx.set(s, idx);
    return idx;
  };
  const serNameIdx = data.series.map((s) => intern(s.name));
  const numericCats = !!data.categoriesNumeric;
  const catIdx = numericCats ? [] : (data.categories as string[]).map((c) => intern(String(c)));

  // Worksheet rows.
  const rowsXml: string[] = [];
  // Row 1: A1 blank string, B1.. series names (string type "s").
  let row1 = `<c r="A1" t="s"><v>0</v></c>`;
  for (let s = 0; s < nSer; s++) row1 += `<c r="${colLetter(s + 1)}1" t="s"><v>${serNameIdx[s]}</v></c>`;
  rowsXml.push(`<row r="1" spans="1:${nSer + 1}">${row1}</row>`);
  // Rows 2..: A = category (string, OR number for scatter/bubble X), B.. = values.
  for (let r = 0; r < nRows; r++) {
    const cat = data.categories[r];
    const catCell = numericCats
      ? `<c r="A${r + 2}"><v>${Number.isFinite(cat as number) ? cat : r + 1}</v></c>`
      : `<c r="A${r + 2}" t="s"><v>${catIdx[r]}</v></c>`;
    let cells = catCell;
    for (let s = 0; s < nSer; s++) {
      const v = data.series[s].values[r];
      cells += `<c r="${colLetter(s + 1)}${r + 2}">${Number.isFinite(v) ? `<v>${v}</v>` : ''}</c>`;
    }
    rowsXml.push(`<row r="${r + 2}" spans="1:${nSer + 1}">${cells}</row>`);
  }
  const lastCol = colLetter(nSer);
  const dimension = `A1:${lastCol}${nRows + 1}`;

  const sst =
    XML_DECL +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map((s) => `<si><t xml:space="preserve">${escapeText(s)}</t></si>`).join('') +
    `</sst>`;

  const sheet =
    XML_DECL +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dimension}"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr baseColWidth="10" defaultRowHeight="16"/>` +
    `<sheetData>${rowsXml.join('')}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;

  const workbook =
    XML_DECL +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    XML_DECL +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  const styles =
    XML_DECL +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const contentTypes =
    XML_DECL +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`;

  const rootRels =
    XML_DECL +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('xl/workbook.xml', workbook);
  zip.file('xl/_rels/workbook.xml.rels', workbookRels);
  zip.file('xl/worksheets/sheet1.xml', sheet);
  zip.file('xl/sharedStrings.xml', sst);
  zip.file('xl/styles.xml', styles);
  const buf = await zip.generateAsync({ type: 'uint8array' });
  return buf;
}
