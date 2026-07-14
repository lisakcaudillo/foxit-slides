/**
 * Serialize an editor deck (Card[] with role-tagged freeform blocks) into a
 * STRUCTURED TEMPLATE definition — the on-disk artifact saved into the project's
 * template library (`app/src/data/templates/<id>.json`).
 *
 * This is the inverse of the structured builder: it reads each freeform block's
 * role/group off its `ff-struct-${role}-${group}-${i}` id and its geometry/style,
 * and emits clean per-slide role slots. Content is kept as a non-authoritative
 * `example` hint (so a human/the generator can see what a slot is for); the
 * template's payload is the SLOTS (where each role goes), which a prompt then
 * fills at generation time.
 *
 * Coordinates are percentages of the 960×540 canvas, matching the freeform model.
 */
import type { CardTemplate, FreeformBlock } from '@/types/card-template';

export interface TemplateSlot {
  role: string;
  group: string;
  /** % of canvas */
  x: number;
  y: number;
  w: number;
  h: number;
  /** px design size (text only) */
  size?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  weight?: number;
  color?: string;
  /** true for an image slot (no bytes — geometry only) */
  image?: boolean;
  /** `'icon'` marks a small pictogram slot (icon-library filled), vs a photo slot. */
  slotKind?: 'icon';
  /** true for a data-table slot. */
  table?: boolean;
  /** table cell text (rows × columns) — non-authoritative example data. */
  tableRows?: string[][];
  /** table's first row is a header. */
  headerRow?: boolean;
  /** merged-cell spans (anchor row/col + row/col span). */
  tableMerges?: { r: number; c: number; rs: number; cs: number }[];
  /** true for a bulleted/numbered list slot. */
  list?: boolean;
  /** list items (optional bold label + text) — non-authoritative example data. */
  listItems?: { text: string; label?: string }[];
  /** list marker style. */
  listMarker?: 'bullet' | 'number' | 'none';
  /** true for a chart slot. */
  chart?: boolean;
  /** chart kind (column/bar/line/pie/donut/funnel/scatter/…). */
  chartType?: string;
  /** chart category labels (x-axis or pie/donut slice labels) — non-authoritative example. */
  chartCategories?: string[];
  /** chart series (name + values) — non-authoritative example data. Colors are
   *  intentionally omitted so the chart recolors from the template palette. */
  chartSeries?: { name: string; values: number[] }[];
  /** value/axis number format (number | currency | percent | compact). */
  numberFormat?: string;
  /** chart axis titles (when present). */
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** decoration shape kind (rectangle/line/circle/arrow) for non-content elements */
  shape?: string;
  /** palette token the element's fill binds to (e.g. 'accent') — NO fixed color, so
   *  the element recolors with whatever palette fills the template. */
  fillToken?: string;
  /** Non-authoritative sample text from the source, as a hint of the slot's intent. */
  example?: string;
}

export interface TemplateSlide {
  index: number;
  slots: TemplateSlot[];
}

export interface StructuredTemplateDef {
  id: string;
  name: string;
  source: string;
  /** logical canvas the slot %s are relative to */
  canvas: { w: number; h: number };
  slides: TemplateSlide[];
}

const ID_RE = /^ff-struct-(.+)-(\d+)$/; // captures roleGroup + the trailing per-(role,group) index

/** Split a `roleGroup` (`title-title`, `slide-number-12`, `image-14`) into role + group. */
function splitRoleGroup(roleGroup: string): { role: string; group: string } {
  const i = roleGroup.lastIndexOf('-');
  if (i < 0) return { role: roleGroup, group: '' };
  return { role: roleGroup.slice(0, i), group: roleGroup.slice(i + 1) };
}

function slotFromBlock(b: FreeformBlock): TemplateSlot | null {
  if (typeof b.id !== 'string') return null;
  // OUR decorations (ff-deco-*) → tagged template decoration elements, bound to a
  // palette TOKEN (no fixed color) so the template stays reusable + palette-driven.
  if (b.id.startsWith('ff-deco-') && b.type === 'shape') {
    const kind = b.id.replace(/^ff-deco-/, '').replace(/-\d+$/, '');
    // A card is a neutral SURFACE container; a table hairline is a neutral BORDER; other
    // decorations (keylines, accent rules) bind to the accent. Either way the fill is a
    // palette TOKEN, never a fixed color.
    const fillToken = kind === 'card' ? 'surface' : kind === 'hairline' ? 'hairline' : 'accent';
    return { role: 'decoration', group: kind, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h), shape: b.shape, fillToken };
  }
  if (!b.id.startsWith('ff-struct-')) return null;
  const m = b.id.match(ID_RE);
  const { role, group } = splitRoleGroup(m ? m[1] : b.id.replace(/^ff-struct-/, ''));
  const base = { role, group, x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
  if (b.type === 'image') return { ...base, image: true, ...(b.slotKind ? { slotKind: b.slotKind } : {}) };
  if (b.type === 'table') return { ...base, table: true, tableRows: b.rows, headerRow: b.headerRow !== false, ...(b.merges && b.merges.length ? { tableMerges: b.merges } : {}) };
  if (b.type === 'list') return { ...base, list: true, listItems: b.items, listMarker: b.marker ?? 'bullet' };
  if (b.type === 'chart') {
    return {
      ...base,
      chart: true,
      chartType: b.chartType,
      chartCategories: b.categories,
      chartSeries: (b.series ?? []).map((s) => ({ name: s.name, values: s.values })),
      ...(b.numberFormat ? { numberFormat: b.numberFormat } : {}),
      ...(b.xAxisLabel ? { xAxisLabel: b.xAxisLabel } : {}),
      ...(b.yAxisLabel ? { yAxisLabel: b.yAxisLabel } : {}),
      ...(b.title ? { example: b.title } : {}),
    };
  }
  if (b.type === 'text') {
    return {
      ...base,
      size: b.style?.fontSize,
      align: b.style?.textAlign,
      weight: b.style?.fontWeight,
      color: b.style?.color,
      example: b.content || undefined,
    };
  }
  return null; // any other block type carries no template slot
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function serializeTemplate(template: CardTemplate, opts?: { id?: string; name?: string; source?: string }): StructuredTemplateDef {
  const slides: TemplateSlide[] = (template.cards ?? []).map((card, index) => ({
    index,
    slots: (card.freeform ?? [])
      .map(slotFromBlock)
      .filter((s): s is TemplateSlot => s !== null),
  }));
  const name = opts?.name ?? template.name ?? 'Untitled template';
  return {
    id: opts?.id ?? slugify(name),
    name,
    source: opts?.source ?? 'pptx-import',
    canvas: { w: 960, h: 540 },
    slides,
  };
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'template';
}
