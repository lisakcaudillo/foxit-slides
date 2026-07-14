// Foxit Slidewright — native charts + embedded .xlsx workbook (Phase F).
//
// A chart is a graphicFrame that references a chart part (ppt/charts/chartN.xml),
// which in turn references an embedded workbook (ppt/embeddings/…​.xlsx) holding the
// data. The chart XML also caches the values so it renders without opening the
// workbook. Supported kinds: bar/column (barChart), line, area, pie, doughnut.

import { XML_DECL, escapeText, escapeAttr } from './xml';
import { inchToEmu, ptToCentipoint } from './emu';
import { normHex } from './colors';
import { buildChartWorkbook, colLetter } from './xlsx';

export type ChartKind = 'bar' | 'column' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'radar' | 'bar3D' | 'column3D';
export type DataLabelPos = 'ctr' | 'inEnd' | 'inBase' | 'outEnd' | 'bestFit' | 'l' | 'r' | 't' | 'b';

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}
export interface ChartSpec {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  title?: string;
  xIn: number; yIn: number; wIn: number; hIn: number;
  colors?: string[]; // fallback palette (bare/#hex)
  showLegend?: boolean;
  // ── Wave-1 options ──
  dataLabels?: boolean | { show?: boolean; position?: DataLabelPos; numberFormat?: string; color?: string; fontSizePt?: number };
  axisTitleX?: string;
  axisTitleY?: string;
  valueFormat?: string; // number format for the value axis + value labels (e.g. '#,##0', '0%', '$#,##0')
  categoryFormat?: string;
  legendColor?: string;
  legendFontSizePt?: number;
  legendPos?: 'b' | 'l' | 'r' | 't' | 'tr';
  barGapWidthPct?: number; // default 150
  barOverlapPct?: number; // default 0
  lineSmooth?: boolean;
  lineMarkers?: boolean; // default true for line
  gridlines?: boolean; // value-axis major gridlines, default true
  radarStyle?: 'standard' | 'marker' | 'filled';
  valueAxisLogBase?: number; // log scale (2..1000)
  valueAxisDisplayUnit?: 'hundreds' | 'thousands' | 'tenThousands' | 'hundredThousands' | 'millions' | 'tenMillions' | 'hundredMillions' | 'billions' | 'trillions';
  showDataTable?: boolean;
}

export interface BuiltChart {
  chartXml: string;
  chartRels: string;
  xlsx: Uint8Array;
  frameXml: (shapeId: number, chartRid: string) => string;
}

const CAT_AX = 111_111_111;
const VAL_AX = 222_222_222;
const CAT_AX2 = 333_333_333;
const VAL_AX2 = 444_444_444;
const SER_AX = 555_555_555;
const PALETTE = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

const strRef = (f: string, vals: string[]) =>
  `<c:strRef><c:f>${escapeText(f)}</c:f><c:strCache><c:ptCount val="${vals.length}"/>` +
  vals.map((v, i) => `<c:pt idx="${i}"><c:v>${escapeText(v)}</c:v></c:pt>`).join('') +
  `</c:strCache></c:strRef>`;

const numRef = (f: string, vals: number[]) =>
  `<c:numRef><c:f>${escapeText(f)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>` +
  vals.map((v, i) => (Number.isFinite(v) ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '')).join('') +
  `</c:numCache></c:numRef>`;

function seriesColor(spec: ChartSpec, i: number): string {
  return (
    normHex(spec.series[i]?.color) ??
    normHex(spec.colors?.[i % (spec.colors?.length || 1)]) ??
    PALETTE[i % PALETTE.length]
  );
}

/** An axis title (`<c:title>`); the value axis is drawn rotated 90°. */
function axisTitleXml(text: string, rotated: boolean): string {
  const bodyPr = rotated ? `<a:bodyPr rot="-5400000" vert="horz"/>` : `<a:bodyPr/>`;
  return `<c:title><c:tx><c:rich>${bodyPr}<a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeText(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

/** Positions valid for `<c:dLblPos>` per chart kind (an invalid one trips a repair). */
const DLBL_POS_OK: Record<string, Set<string>> = {
  bar: new Set(['ctr', 'inBase', 'inEnd', 'outEnd']),
  column: new Set(['ctr', 'inBase', 'inEnd', 'outEnd']),
  pie: new Set(['ctr', 'inEnd', 'outEnd', 'bestFit']),
  doughnut: new Set(['ctr']),
  line: new Set(['ctr', 'l', 'r', 't', 'b']),
  scatter: new Set(['ctr', 'l', 'r', 't', 'b']),
  area: new Set([]),
};
function dLblsXml(spec: ChartSpec): string {
  const d = spec.dataLabels;
  if (!d) return '';
  const opt = typeof d === 'object' ? d : {};
  if (typeof d === 'object' && d.show === false) return '';
  const fmt = opt.numberFormat ?? spec.valueFormat;
  const numFmt = fmt ? `<c:numFmt formatCode="${escapeAttr(fmt)}" sourceLinked="0"/>` : '';
  const sz = opt.fontSizePt ? ptToCentipoint(opt.fontSizePt) : 1000;
  const color = normHex(opt.color) ?? '000000';
  const txPr = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const pos = opt.position && DLBL_POS_OK[spec.kind]?.has(opt.position) ? `<c:dLblPos val="${opt.position}"/>` : '';
  return `<c:dLbls>${numFmt}${txPr}${pos}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
}

function legendXml(spec: ChartSpec): string {
  if (!spec.showLegend) return '';
  const pos = spec.legendPos ?? 'b';
  const sz = spec.legendFontSizePt ? ptToCentipoint(spec.legendFontSizePt) : undefined;
  const color = normHex(spec.legendColor);
  const txPr = sz || color
    ? `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr${sz ? ` sz="${sz}"` : ''}>${color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : ''}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`
    : '';
  return `<c:legend><c:legendPos val="${pos}"/><c:overlay val="0"/>${txPr}</c:legend>`;
}

/** The axis-affecting options shared by single + combo charts. */
interface AxisOpts {
  axisTitleX?: string; axisTitleY?: string; valueFormat?: string; categoryFormat?: string; gridlines?: boolean;
  valueAxisLogBase?: number;
  valueAxisDisplayUnit?: string;
}

function catAxXml(spec: AxisOpts): string {
  const title = spec.axisTitleX ? axisTitleXml(spec.axisTitleX, false) : '';
  const fmt = spec.categoryFormat ?? 'General';
  return (
    `<c:catAx><c:axId val="${CAT_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    title +
    `<c:numFmt formatCode="${escapeAttr(fmt)}" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>` +
    `<c:crossAx val="${VAL_AX}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="1"/></c:catAx>`
  );
}
function valAxXml(spec: AxisOpts): string {
  const title = spec.axisTitleY ? axisTitleXml(spec.axisTitleY, true) : '';
  const grid = spec.gridlines === false ? '' : '<c:majorGridlines/>';
  const fmt = spec.valueFormat ?? 'General';
  const log = spec.valueAxisLogBase ? `<c:logBase val="${spec.valueAxisLogBase}"/>` : '';
  const dispUnits = spec.valueAxisDisplayUnit
    ? `<c:dispUnits><c:builtInUnit val="${spec.valueAxisDisplayUnit}"/><c:dispUnitsLbl><c:layout/></c:dispUnitsLbl></c:dispUnits>`
    : '';
  return (
    `<c:valAx><c:axId val="${VAL_AX}"/><c:scaling>${log}<c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    grid + title +
    `<c:numFmt formatCode="${escapeAttr(fmt)}" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="${CAT_AX}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>${dispUnits}</c:valAx>`
  );
}

/** A chart data table (`<c:dTable>`) placed after the axes in the plot area. */
function dTableXml(spec: { showDataTable?: boolean }): string {
  return spec.showDataTable
    ? `<c:dTable><c:showHorzBorder val="1"/><c:showVertBorder val="1"/><c:showOutline val="1"/><c:showKeys val="1"/></c:dTable>`
    : '';
}

function serCommon(spec: ChartSpec, i: number, withFill: boolean): string {
  const col = colLetter(i + 1); // B, C, …
  const n = spec.categories.length;
  const isLine = spec.kind === 'line';
  const isLineish = isLine || spec.kind === 'radar'; // radar series draw as lines too
  const color = seriesColor(spec, i);
  const tx = `<c:tx>${strRef(`Sheet1!$${col}$1`, [spec.series[i].name])}</c:tx>`;
  // Line/radar series carry their color on the LINE; bar/area on the solid fill.
  const fill = !withFill ? '' : isLineish
    ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr>`
    : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>`;
  const cat = `<c:cat>${strRef(`Sheet1!$A$2:$A$${n + 1}`, spec.categories)}</c:cat>`;
  const val = `<c:val>${numRef(`Sheet1!$${col}$2:$${col}$${n + 1}`, spec.series[i].values)}</c:val>`;
  const smooth = isLine ? `<c:smooth val="${spec.lineSmooth ? 1 : 0}"/>` : '';
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${fill}<c:invertIfNegative val="0"/>${cat}${val}${smooth}</c:ser>`;
}

function plotXml(spec: ChartSpec): string {
  if (spec.kind === 'pie' || spec.kind === 'doughnut') {
    // Single series; per-slice colors via dPt; no axes.
    const s = spec.series[0];
    const n = spec.categories.length;
    const dpts = spec.categories
      .map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${seriesColor(spec, i)}"/></a:solidFill></c:spPr></c:dPt>`)
      .join('');
    const ser =
      `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx>${strRef('Sheet1!$B$1', [s.name])}</c:tx>${dpts}` +
      `<c:cat>${strRef(`Sheet1!$A$2:$A$${n + 1}`, spec.categories)}</c:cat>` +
      `<c:val>${numRef(`Sheet1!$B$2:$B$${n + 1}`, s.values)}</c:val></c:ser>`;
    const hole = spec.kind === 'doughnut' ? `<c:holeSize val="50"/>` : '';
    const tag = spec.kind === 'doughnut' ? 'doughnutChart' : 'pieChart';
    return `<c:plotArea><c:layout/><c:${tag}><c:varyColors val="1"/>${ser}${dLblsXml(spec)}<c:firstSliceAng val="0"/>${hole}</c:${tag}></c:plotArea>`;
  }
  if (spec.kind === 'scatter') {
    // X = categories parsed as numbers (fall back to 1..n); Y = each series' values.
    const n = spec.categories.length;
    const xNums = spec.categories.map((c, i) => { const v = parseFloat(String(c)); return Number.isFinite(v) ? v : i + 1; });
    const sers = spec.series
      .map((s, i) => {
        const col = colLetter(i + 1);
        const color = seriesColor(spec, i);
        return (
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx>${strRef(`Sheet1!$${col}$1`, [s.name])}</c:tx>` +
          `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>` +
          `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr></c:marker>` +
          `<c:xVal><c:numRef><c:f>Sheet1!$A$2:$A$${n + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>` +
          xNums.map((x, k) => `<c:pt idx="${k}"><c:v>${x}</c:v></c:pt>`).join('') + `</c:numCache></c:numRef></c:xVal>` +
          `<c:yVal>${numRef(`Sheet1!$${col}$2:$${col}$${n + 1}`, s.values)}</c:yVal></c:ser>`
        );
      })
      .join('');
    const axIds = `<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/>`;
    const xAx = `<c:valAx><c:axId val="${CAT_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${VAL_AX}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
    const yAx = `<c:valAx><c:axId val="${VAL_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${CAT_AX}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
    return `<c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="marker"/><c:varyColors val="0"/>${sers}${dLblsXml(spec)}${axIds}</c:scatterChart>${xAx}${yAx}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
  }
  const sers = spec.series.map((_, i) => serCommon(spec, i, true)).join('');
  const axIds = `<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/>`;
  const dLbls = dLblsXml(spec);
  if (spec.kind === 'radar') {
    const style = spec.radarStyle ?? 'marker';
    const chartTag = `<c:radarChart><c:radarStyle val="${style}"/><c:varyColors val="0"/>${sers}${dLbls}${axIds}</c:radarChart>`;
    return `<c:plotArea><c:layout/>${chartTag}${catAxXml(spec)}${valAxXml(spec)}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
  }
  if (spec.kind === 'bar3D' || spec.kind === 'column3D') {
    const dir = spec.kind === 'bar3D' ? 'bar' : 'col';
    const ax3 = `<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/><c:axId val="${SER_AX}"/>`;
    const chartTag = `<c:bar3DChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}${dLbls}<c:gapWidth val="${spec.barGapWidthPct ?? 150}"/><c:gapDepth val="150"/><c:shape val="box"/>${ax3}</c:bar3DChart>`;
    const serAx = `<c:serAx><c:axId val="${SER_AX}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${VAL_AX}"/></c:serAx>`;
    return `<c:plotArea><c:layout/>${chartTag}${catAxXml(spec)}${valAxXml(spec)}${serAx}${dTableXml(spec)}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
  }
  let chartTag = '';
  if (spec.kind === 'bar' || spec.kind === 'column') {
    const dir = spec.kind === 'bar' ? 'bar' : 'col';
    chartTag = `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}${dLbls}<c:gapWidth val="${spec.barGapWidthPct ?? 150}"/><c:overlap val="${spec.barOverlapPct ?? 0}"/>${axIds}</c:barChart>`;
  } else if (spec.kind === 'line') {
    chartTag = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${dLbls}<c:marker val="${spec.lineMarkers === false ? 0 : 1}"/>${axIds}</c:lineChart>`;
  } else {
    chartTag = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${dLbls}${axIds}</c:areaChart>`;
  }
  return `<c:plotArea><c:layout/>${chartTag}${catAxXml(spec)}${valAxXml(spec)}${dTableXml(spec)}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
}

export async function buildChart(n: number, spec: ChartSpec): Promise<BuiltChart> {
  const legend = legendXml(spec);
  const title = spec.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeText(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`;
  const view3D = (spec.kind === 'bar3D' || spec.kind === 'column3D')
    ? `<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:depthPercent val="100"/><c:rAngAx val="1"/></c:view3D>`
    : '';
  const chartXml =
    XML_DECL +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:date1904 val="0"/><c:roundedCorners val="0"/>` +
    `<c:chart>${title}${view3D}${plotXml(spec)}${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>` +
    `</c:chartSpace>`;

  const chartRels =
    XML_DECL +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet${n}.xlsx"/>` +
    `</Relationships>`;

  const scatter = spec.kind === 'scatter';
  const xlsx = await buildChartWorkbook({
    categories: scatter ? spec.categories.map((c, i) => { const v = parseFloat(String(c)); return Number.isFinite(v) ? v : i + 1; }) : spec.categories,
    categoriesNumeric: scatter,
    series: spec.series.map((s) => ({ name: s.name, values: s.values })),
  });

  const frameXml = (shapeId: number, chartRid: string) =>
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId}" name="Chart ${shapeId}"/>` +
    `<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${inchToEmu(spec.xIn)}" y="${inchToEmu(spec.yIn)}"/><a:ext cx="${inchToEmu(spec.wIn)}" cy="${inchToEmu(spec.hIn)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRid}"/>` +
    `</a:graphicData></a:graphic></p:graphicFrame>`;

  return { chartXml, chartRels, xlsx, frameXml };
}

// ── Combo charts (multiple chart types sharing one plot area / axes) ──────────
export interface ComboLayer {
  kind: 'bar' | 'column' | 'line' | 'area';
  series: ChartSeries[];
  /** Plot this layer against a secondary value axis (right side). */
  secondaryAxis?: boolean;
}
export interface ComboChartSpec extends AxisOpts {
  layers: ComboLayer[];
  categories: string[];
  title?: string;
  xIn: number; yIn: number; wIn: number; hIn: number;
  colors?: string[];
  showLegend?: boolean;
  legendPos?: 'b' | 'l' | 'r' | 't' | 'tr';
  showDataTable?: boolean;
}

/** Build a combo chart: each layer emits its own chart element into a shared plot
 *  area, all referencing one cat + val axis; series occupy consecutive workbook
 *  columns across layers. */
export async function buildCombo(n: number, spec: ComboChartSpec): Promise<BuiltChart> {
  const PAL = spec.colors && spec.colors.length ? spec.colors.map((c) => normHex(c) || c) : PALETTE;
  const cats = spec.categories;
  const nCat = cats.length;
  const hasSecondary = spec.layers.some((l) => l.secondaryAxis);

  // Flatten every series across layers to consecutive columns B, C, D…
  const flat: Array<{ name: string; values: number[] }> = [];
  spec.layers.forEach((l) => l.series.forEach((s) => flat.push({ name: s.name, values: s.values })));

  let gIdx = 0;
  const layerTags = spec.layers.map((layer) => {
    const axIds = layer.secondaryAxis
      ? `<c:axId val="${CAT_AX2}"/><c:axId val="${VAL_AX2}"/>`
      : `<c:axId val="${CAT_AX}"/><c:axId val="${VAL_AX}"/>`;
    const isLine = layer.kind === 'line';
    const sers = layer.series
      .map((s) => {
        const idx = gIdx++;
        const col = colLetter(idx + 1);
        const color = normHex(s.color) ?? PAL[idx % PAL.length];
        const tx = `<c:tx>${strRef(`Sheet1!$${col}$1`, [s.name])}</c:tx>`;
        const fill = isLine
          ? `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr>`
          : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>`;
        const cat = `<c:cat>${strRef(`Sheet1!$A$2:$A$${nCat + 1}`, cats)}</c:cat>`;
        const val = `<c:val>${numRef(`Sheet1!$${col}$2:$${col}$${nCat + 1}`, s.values)}</c:val>`;
        const smooth = isLine ? '<c:smooth val="0"/>' : '';
        return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${tx}${fill}<c:invertIfNegative val="0"/>${cat}${val}${smooth}</c:ser>`;
      })
      .join('');
    if (layer.kind === 'bar' || layer.kind === 'column') {
      const dir = layer.kind === 'bar' ? 'bar' : 'col';
      return `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="150"/><c:overlap val="0"/>${axIds}</c:barChart>`;
    }
    if (isLine) return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axIds}</c:lineChart>`;
    return `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${axIds}</c:areaChart>`;
  }).join('');

  const legend = spec.showLegend ? `<c:legend><c:legendPos val="${spec.legendPos ?? 'b'}"/><c:overlay val="0"/></c:legend>` : '';
  const title = spec.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escapeText(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`;
  // Secondary value axis (right) + its hidden category axis, when any layer uses it.
  const secAxes = hasSecondary
    ? `<c:valAx><c:axId val="${VAL_AX2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="r"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${CAT_AX2}"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>` +
      `<c:catAx><c:axId val="${CAT_AX2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="1"/><c:axPos val="b"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${VAL_AX2}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="1"/></c:catAx>`
    : '';
  const plotArea = `<c:plotArea><c:layout/>${layerTags}${catAxXml(spec)}${valAxXml(spec)}${secAxes}${dTableXml(spec)}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`;
  const chartXml =
    XML_DECL +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:date1904 val="0"/><c:roundedCorners val="0"/>` +
    `<c:chart>${title}${plotArea}${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
  const chartRels =
    XML_DECL +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet${n}.xlsx"/></Relationships>`;
  const xlsx = await buildChartWorkbook({ categories: cats, series: flat });
  const frameXml = (shapeId: number, chartRid: string) =>
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${shapeId}" name="Chart ${shapeId}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${inchToEmu(spec.xIn)}" y="${inchToEmu(spec.yIn)}"/><a:ext cx="${inchToEmu(spec.wIn)}" cy="${inchToEmu(spec.hIn)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRid}"/>` +
    `</a:graphicData></a:graphic></p:graphicFrame>`;
  return { chartXml, chartRels, xlsx, frameXml };
}
