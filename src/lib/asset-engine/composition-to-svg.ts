// Composition → SVG serializer (pure, headless, server-safe).
//
// Turns a flat array of Freeform blocks (the Asset Editor's composition model)
// into a single standalone SVG document string. This is the foundation of the
// Asset Editor's vector export (SVG / PNG / PDF) and "reuse as SVG":
//   - vector elements (text, shapes, callouts, icons) stay true vector,
//   - raster images embed by `href` (data: URLs or remote URLs),
//   - geometry is percentage-based (0–100% of width/height) and converted to px.
//
// Pure logic ONLY: no React, no DOM, no `window`, no network. Block types are
// imported type-only so this module is safe to run on the server or in a plain
// node script. See docs/uiux/asset-editor-mvp-spec.md §1 ("Output is vector-first").

import type {
  FreeformBlock,
  FreeformTextBlock,
  FreeformImageBlock,
  FreeformShapeBlock,
  FreeformIconBlock,
  FreeformChartBlock,
  FrameShape,
} from '@/types/card-template';
// Local Figma pictogram bodies resolve from this manifest accessor (pure data —
// NOT the React PictographicIcon component). `figma:<id>` names inline here with
// no network. Remote Iconify names (e.g. 'ph:map-pin') still need a runtime
// fetch and stay placeholders.
import { getIcon } from '@/data/figmaAssets';

// ── XML escaping ──────────────────────────────────────────────────────────────
// Escape text content and attribute values so the output is well-formed XML and
// can't be broken (or XSS'd) by `<`, `>`, `&`, quotes, etc. in user content.

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Number formatted for SVG output — trimmed to at most 3 decimals, NaN→0. */
function num(n: number | undefined, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // Up to 3 decimals, no trailing zeros.
  return parseFloat(n.toFixed(3)).toString();
}

// ── Geometry ──────────────────────────────────────────────────────────────────

interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function toPxRect(block: FreeformBlock, width: number, height: number): PxRect {
  const x = (num(block.x) / 100) * width;
  const y = (num(block.y) / 100) * height;
  const w = (num(block.w) / 100) * width;
  const h = (num(block.h) / 100) * height;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/** A per-block transform that applies rotation about the block's center.
 *  Returns '' when the block is upright (no transform attribute needed). */
function rotationTransform(block: FreeformBlock, rect: PxRect): string {
  const r = num(block.rotation);
  if (!r) return '';
  return ` transform="rotate(${fmt(r)} ${fmt(rect.cx)} ${fmt(rect.cy)})"`;
}

/** Opacity attribute, only emitted when the block sets a non-default opacity. */
function opacityAttr(opacity: number | undefined): string {
  if (typeof opacity !== 'number' || opacity >= 1) return '';
  return ` opacity="${fmt(Math.max(0, opacity))}"`;
}

// ── Gradient parsing ──────────────────────────────────────────────────────────
// A shape `fill` may be a CSS linear-gradient string. We parse it into an SVG
// <linearGradient> placed in <defs> and reference it by id. Mirrors the parser
// in lib/pptxExport.ts (kept independent — no cross-module coupling).

interface GradientStop {
  color: string;
  pos: number; // 0..1
}

interface ParsedGradient {
  angle: number; // degrees
  stops: GradientStop[];
}

function sideToAngle(side: string): number {
  const s = side.replace(/^to\s+/i, '').trim().toLowerCase();
  const map: Record<string, number> = {
    top: 0,
    'top right': 45,
    'right top': 45,
    right: 90,
    'bottom right': 135,
    'right bottom': 135,
    bottom: 180,
    'bottom left': 225,
    'left bottom': 225,
    left: 270,
    'top left': 315,
    'left top': 315,
  };
  return map[s] ?? 180;
}

function isGradient(value: string | undefined): value is string {
  return !!value && /gradient\s*\(/i.test(value);
}

function parseLinearGradient(css: string): ParsedGradient | null {
  const m = css.match(/linear-gradient\(\s*([\s\S]*)\)\s*$/i);
  if (!m) return null;
  const parts = m[1]
    .split(/,(?![^(]*\))/) // split on commas not inside parens (rgb(...))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  let angle = 180;
  let idx = 0;
  if (/deg\s*$/.test(parts[0])) {
    angle = parseFloat(parts[0]);
    idx = 1;
  } else if (/^to\s+/i.test(parts[0])) {
    angle = sideToAngle(parts[0]);
    idx = 1;
  }

  const raw = parts
    .slice(idx)
    .map((p) => {
      const color = extractColor(p);
      const pm = p.match(/([\d.]+)%/);
      return {
        color,
        pos: pm ? parseFloat(pm[1]) / 100 : null,
      };
    })
    .filter((s): s is { color: string; pos: number | null } => !!s.color);

  if (!raw.length) return null;
  const stops: GradientStop[] = raw.map((s, i) => ({
    color: s.color,
    pos: s.pos != null ? s.pos : raw.length === 1 ? 0 : i / (raw.length - 1),
  }));
  return { angle, stops };
}

/** Pull the first color token (hex, rgb(), rgba(), or a named color) out of a
 *  gradient stop fragment. */
function extractColor(fragment: string): string | null {
  const rgb = fragment.match(/rgba?\([^)]*\)/i);
  if (rgb) return rgb[0];
  const hex = fragment.match(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-f])/i);
  if (hex) return `#${hex[1]}`;
  const named = fragment.match(/\b([a-z]{3,})\b/i);
  if (named && !/^to$|^deg$/i.test(named[1])) return named[1].toLowerCase();
  return null;
}

// ── Defs accumulator ──────────────────────────────────────────────────────────
// Gradients, clip paths, drop-shadow filters, and arrowhead markers all live in
// <defs>. We accumulate them with stable, collision-free ids per render.

class Defs {
  private items: string[] = [];
  private seq = 0;

  private nextId(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }

  /** Register a linear gradient; returns the id to reference via url(#id). */
  addGradient(grad: ParsedGradient): string {
    const id = this.nextId('grad');
    const rad = (grad.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    // objectBoundingBox vector for the given angle, clamped to [0,1].
    const x1 = fmt(Math.max(0, Math.min(1, 0.5 - dx / 2)));
    const y1 = fmt(Math.max(0, Math.min(1, 0.5 - dy / 2)));
    const x2 = fmt(Math.max(0, Math.min(1, 0.5 + dx / 2)));
    const y2 = fmt(Math.max(0, Math.min(1, 0.5 + dy / 2)));
    const stops = grad.stops
      .map(
        (s) =>
          `<stop offset="${fmt(Math.max(0, Math.min(1, s.pos)) * 100)}%" stop-color="${escapeXml(
            s.color,
          )}"/>`,
      )
      .join('');
    this.items.push(
      `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`,
    );
    return id;
  }

  /** Register a clip path body (raw SVG shape elements). Returns the id. */
  addClipPath(body: string): string {
    const id = this.nextId('clip');
    this.items.push(`<clipPath id="${id}">${body}</clipPath>`);
    return id;
  }

  /** Register a drop-shadow filter parsed from a CSS box-shadow string. */
  addDropShadow(boxShadow: string): string {
    const id = this.nextId('shadow');
    const s = parseBoxShadow(boxShadow);
    this.items.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">` +
        `<feDropShadow dx="${fmt(s.dx)}" dy="${fmt(s.dy)}" stdDeviation="${fmt(
          s.blur / 2,
        )}" flood-color="${escapeXml(s.color)}" flood-opacity="1"/>` +
        `</filter>`,
    );
    return id;
  }

  /** Register an arrowhead marker matching `color`. Returns the id. */
  addArrowMarker(color: string): string {
    const id = this.nextId('arrow');
    this.items.push(
      `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
        `<path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeXml(color)}"/>` +
        `</marker>`,
    );
    return id;
  }

  render(): string {
    if (!this.items.length) return '';
    return `<defs>${this.items.join('')}</defs>`;
  }
}

interface ParsedShadow {
  dx: number;
  dy: number;
  blur: number;
  color: string;
}

/** Parse a CSS box-shadow into the bits a drop-shadow filter needs. Best-effort;
 *  ignores spread + inset. e.g. '0 3px 10px rgba(11,31,58,0.07)'. */
function parseBoxShadow(css: string): ParsedShadow {
  const color =
    css.match(/rgba?\([^)]*\)/i)?.[0] ||
    css.match(/#([0-9a-f]{3,8})(?![0-9a-f])/i)?.[0] ||
    'rgba(0,0,0,0.25)';
  // Numeric lengths (with optional px), in document order: offsetX offsetY blur [spread].
  const nums = (css.match(/-?[\d.]+px|-?[\d.]+(?=\s|$)/g) || []).map((n) =>
    parseFloat(n),
  );
  const [dx = 0, dy = 2, blur = 6] = nums;
  return { dx, dy, blur, color };
}

// ── Block renderers ───────────────────────────────────────────────────────────

function renderText(
  block: FreeformTextBlock,
  rect: PxRect,
): string {
  const st = block.style ?? {};
  const align = st.textAlign ?? 'left';
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const tx = align === 'center' ? rect.cx : align === 'right' ? rect.x + rect.w : rect.x;

  const fontSize = num(st.fontSize, 16);
  const lineHeight = (st.lineHeight && st.lineHeight > 0 ? st.lineHeight : 1.3) * fontSize;
  const fontFamily = st.fontFamily ?? 'Inter, system-ui, sans-serif';
  const fontWeight = st.fontWeight ?? (block.variant === 'heading' ? 700 : 400);
  const color = st.color ?? '#0f172a';

  // Vertical alignment of the text block within its box.
  const lines = String(block.content ?? '').split('\n');
  const totalTextHeight = lines.length * lineHeight;
  let firstBaseline: number;
  if (st.verticalAlign === 'center') {
    firstBaseline = rect.cy - totalTextHeight / 2 + fontSize;
  } else if (st.verticalAlign === 'bottom') {
    firstBaseline = rect.y + rect.h - totalTextHeight + fontSize;
  } else {
    firstBaseline = rect.y + fontSize;
  }

  const extra: string[] = [];
  if (st.italic) extra.push('font-style="italic"');
  if (st.underline) extra.push('text-decoration="underline"');
  if (typeof st.letterSpacing === 'number') extra.push(`letter-spacing="${fmt(st.letterSpacing)}"`);
  const extraAttrs = extra.length ? ' ' + extra.join(' ') : '';

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${fmt(tx)}" y="${fmt(firstBaseline + i * lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  return (
    `<text text-anchor="${anchor}" font-family="${escapeXml(fontFamily)}" ` +
    `font-size="${fmt(fontSize)}" font-weight="${fmt(num(fontWeight, 400))}" ` +
    `fill="${escapeXml(color)}"${extraAttrs}>${tspans}</text>`
  );
}

function clipBodyForFrame(shape: FrameShape, rect: PxRect): string {
  switch (shape) {
    case 'circle':
      return `<ellipse cx="${fmt(rect.cx)}" cy="${fmt(rect.cy)}" rx="${fmt(rect.w / 2)}" ry="${fmt(
        rect.h / 2,
      )}"/>`;
    case 'rounded': {
      const r = Math.min(rect.w, rect.h) * 0.12;
      return `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
        rect.h,
      )}" rx="${fmt(r)}" ry="${fmt(r)}"/>`;
    }
    default:
      // rectangle (and any unsupported decorative frame) → plain rect clip.
      return `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
        rect.h,
      )}"/>`;
  }
}

function renderImage(
  block: FreeformImageBlock,
  rect: PxRect,
  defs: Defs,
): string {
  if (!block.src) {
    // Empty placeholder — dashed frame outline so the slot is visible.
    return (
      `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
        rect.h,
      )}" fill="none" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="6 4"/>`
    );
  }

  const preserve = block.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
  let clipAttr = '';
  if (block.frameShape && block.frameShape !== 'rectangle') {
    const clipId = defs.addClipPath(clipBodyForFrame(block.frameShape, rect));
    clipAttr = ` clip-path="url(#${clipId})"`;
  }

  return (
    `<image href="${escapeXml(block.src)}" x="${fmt(rect.x)}" y="${fmt(rect.y)}" ` +
    `width="${fmt(rect.w)}" height="${fmt(rect.h)}" preserveAspectRatio="${preserve}"${clipAttr}` +
    (block.alt ? ` aria-label="${escapeXml(block.alt)}"` : '') +
    `/>`
  );
}

/** Resolve a shape `fill` to an SVG paint value, registering a gradient if needed. */
function resolveFill(fill: string | undefined, defs: Defs, fallback = 'none'): string {
  if (!fill) return fallback;
  if (isGradient(fill)) {
    const parsed = parseLinearGradient(fill);
    if (parsed) {
      const id = defs.addGradient(parsed);
      return `url(#${id})`;
    }
    // Unparseable gradient → first color stop, else fallback.
    const c = extractColor(fill);
    return c ?? fallback;
  }
  return fill;
}

function renderShape(
  block: FreeformShapeBlock,
  rect: PxRect,
  defs: Defs,
): string {
  const fill = resolveFill(block.fill, defs, block.shape === 'line' || block.shape === 'arrow' ? 'none' : '#e2e8f0');
  const stroke = block.stroke;
  const strokeWidth = num(block.strokeWidth, stroke ? 1 : 0);
  const strokeAttrs = stroke
    ? ` stroke="${escapeXml(stroke)}" stroke-width="${fmt(strokeWidth)}"`
    : '';

  let filterAttr = '';
  if (block.boxShadow) {
    const fid = defs.addDropShadow(block.boxShadow);
    filterAttr = ` filter="url(#${fid})"`;
  }

  let shapeEl = '';
  switch (block.shape) {
    case 'circle':
      shapeEl =
        `<ellipse cx="${fmt(rect.cx)}" cy="${fmt(rect.cy)}" rx="${fmt(rect.w / 2)}" ry="${fmt(
          rect.h / 2,
        )}" fill="${escapeXml(fill)}"${strokeAttrs}${filterAttr}/>`;
      break;
    case 'line':
      shapeEl =
        `<line x1="${fmt(rect.x)}" y1="${fmt(rect.cy)}" x2="${fmt(rect.x + rect.w)}" y2="${fmt(
          rect.cy,
        )}" stroke="${escapeXml(stroke ?? '#0f172a')}" stroke-width="${fmt(
          strokeWidth || 2,
        )}"${filterAttr}/>`;
      break;
    case 'arrow': {
      const color = stroke ?? '#0f172a';
      const markerId = defs.addArrowMarker(color);
      shapeEl =
        `<line x1="${fmt(rect.x)}" y1="${fmt(rect.cy)}" x2="${fmt(rect.x + rect.w)}" y2="${fmt(
          rect.cy,
        )}" stroke="${escapeXml(color)}" stroke-width="${fmt(
          strokeWidth || 2,
        )}" marker-end="url(#${markerId})"${filterAttr}/>`;
      break;
    }
    case 'rectangle':
    default: {
      const r = num(block.borderRadius, 0);
      const rxAttr = r > 0 ? ` rx="${fmt(r)}" ry="${fmt(r)}"` : '';
      shapeEl =
        `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
          rect.h,
        )}"${rxAttr} fill="${escapeXml(fill)}"${strokeAttrs}${filterAttr}/>`;
      break;
    }
  }

  // Text-on-shape (rectangle / circle only) → nested centered text.
  if (block.content && (block.shape === 'rectangle' || block.shape === 'circle')) {
    const ts = block.textStyle ?? {};
    const fontSize = num(ts.fontSize, 16);
    const fontFamily = ts.fontFamily ?? 'Inter, system-ui, sans-serif';
    const fontWeight = ts.fontWeight ?? 500;
    const color = ts.color ?? '#0f172a';
    const lines = String(block.content).split('\n');
    const lineHeight = fontSize * 1.25;
    const startY = rect.cy - ((lines.length - 1) * lineHeight) / 2;
    const extra: string[] = [];
    if (ts.italic) extra.push('font-style="italic"');
    if (ts.underline) extra.push('text-decoration="underline"');
    const extraAttrs = extra.length ? ' ' + extra.join(' ') : '';
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${fmt(rect.cx)}" y="${fmt(startY + i * lineHeight)}">${escapeXml(line)}</tspan>`,
      )
      .join('');
    shapeEl +=
      `<text text-anchor="middle" dominant-baseline="central" ` +
      `font-family="${escapeXml(fontFamily)}" font-size="${fmt(fontSize)}" ` +
      `font-weight="${fmt(num(fontWeight, 500))}" fill="${escapeXml(color)}"${extraAttrs}>${tspans}</text>`;
  }

  return shapeEl;
}

/** Render a `callout` shape kind is not in the union; callouts come through the
 *  CalloutBlock at the card level, but in the freeform/asset model a callout is
 *  represented as a shape variant. We treat a shape whose content is set and
 *  whose kind is rectangle as a candidate bubble — but per spec the asset editor
 *  also surfaces a dedicated callout. Provide a helper for an explicit callout
 *  bubble (rounded-rect + optional tail) so the serializer can render one when a
 *  caller supplies a callout-shaped block. */
function renderCalloutBubble(
  rect: PxRect,
  text: string,
  opts: { fill?: string; stroke?: string; color?: string; tail?: boolean },
): string {
  const r = Math.min(rect.w, rect.h) * 0.18;
  const fill = opts.fill ?? '#1e293b';
  const stroke = opts.stroke;
  const strokeAttrs = stroke ? ` stroke="${escapeXml(stroke)}" stroke-width="1.5"` : '';
  const bubble =
    `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
      rect.h,
    )}" rx="${fmt(r)}" ry="${fmt(r)}" fill="${escapeXml(fill)}"${strokeAttrs}/>`;
  let tail = '';
  if (opts.tail) {
    const tx = rect.x + rect.w * 0.25;
    const ty = rect.y + rect.h;
    tail =
      `<path d="M ${fmt(tx)} ${fmt(ty - 1)} L ${fmt(tx + 16)} ${fmt(ty - 1)} L ${fmt(
        tx,
      )} ${fmt(ty + 14)} Z" fill="${escapeXml(fill)}"${strokeAttrs}/>`;
  }
  const color = opts.color ?? '#ffffff';
  const label = text
    ? `<text x="${fmt(rect.cx)}" y="${fmt(rect.cy)}" text-anchor="middle" ` +
      `dominant-baseline="central" font-family="Inter, system-ui, sans-serif" ` +
      `font-size="${fmt(Math.min(18, rect.h * 0.3))}" fill="${escapeXml(color)}">${escapeXml(text)}</text>`
    : '';
  return bubble + tail + label;
}

// ── Pictogram recoloring ────────────────────────────────────────────────────
// The local Figma pictograms are MONOCHROME line/fill art whose ink is authored
// as `currentColor` (both `stroke="currentColor"` and `fill="currentColor"`).
// They carry no own palette, so recoloring is a string transform over those
// `currentColor` tokens.

const FIGMA_PICTOGRAM_PREFIX = 'figma:';

/** A drawable SVG element opening tag we recolor (everything else passes through). */
const DRAW_EL_RE = /<(path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*?>/gi;

/** Does this element opening tag paint with a non-`none` fill? */
function elementHasPaintFill(tag: string): boolean {
  const m = tag.match(/\bfill="([^"]*)"/i);
  return !!m && m[1].trim().toLowerCase() !== 'none';
}

/** Does this element opening tag stroke (currentColor or any non-none stroke)? */
function elementHasStroke(tag: string): boolean {
  const m = tag.match(/\bstroke="([^"]*)"/i);
  return !!m && m[1].trim().toLowerCase() !== 'none';
}

/** Replace every `currentColor` token (in fill/stroke) inside one element tag
 *  with the given concrete color. */
function paintCurrentColor(tag: string, color: string): string {
  return tag.replace(/="currentColor"/g, `="${color}"`);
}

/**
 * Recolor a pictogram SVG body (the inner markup, no outer `<svg>`), as a pure
 * string transform. The Figma pictograms author their ink as `currentColor`.
 *
 *  - `single`     — every element's ink → `primary` (the whole icon, one color).
 *  - `two-tone`   — if the icon has ≥2 SEPARABLE ink groups (stroke elements vs
 *                   filled elements, e.g. an outline + accent dots), stroke ink →
 *                   `primary` and fill ink → `secondary`. A single-group icon
 *                   (stroke-only or fill-only) CANNOT be two-toned → falls back
 *                   to `single` and reports it via the returned `twoToned` flag.
 *  - `full-color` — leave the icon's own colors intact (these pictograms are
 *                   monochrome `currentColor`, so this still resolves the ink to
 *                   `primary` so it's visible — there is no embedded palette to
 *                   preserve).
 *
 * Returns `{ svg, twoToned }` so callers can surface whether two-tone applied.
 */
export function recolorPictogramSvg(
  body: string,
  mode: 'single' | 'two-tone' | 'full-color',
  colors: { primary?: string; secondary?: string },
): { svg: string; twoToned: boolean } {
  const primary = colors.primary ?? 'currentColor';
  const secondary = colors.secondary ?? primary;

  if (mode === 'full-color') {
    // Monochrome pictograms have no own palette to preserve. Resolve the ink to
    // `primary` so the icon is visible (a true full-color icon would pass
    // through untouched here — none of the local set qualifies).
    const svg = body.replace(/="currentColor"/g, `="${primary}"`);
    return { svg, twoToned: false };
  }

  if (mode === 'two-tone') {
    // Separability test: an icon is two-tone-able only if it has BOTH a
    // stroke-ink group and a fill-ink group (the natural primary/secondary
    // split for this line-art set). Otherwise fall back to single.
    let sawStroke = false;
    let sawFill = false;
    const tags = body.match(DRAW_EL_RE) || [];
    for (const tag of tags) {
      if (elementHasStroke(tag)) sawStroke = true;
      if (elementHasPaintFill(tag)) sawFill = true;
    }
    const separable = sawStroke && sawFill;
    if (!separable) {
      // Single-group icon: can't be two-toned → single fallback.
      const svg = body.replace(/="currentColor"/g, `="${primary}"`);
      return { svg, twoToned: false };
    }
    // Map stroke ink → primary, fill ink → secondary, element by element. An
    // element that both strokes AND fills gets stroke→primary, fill→secondary.
    const svg = body.replace(DRAW_EL_RE, (tag) => {
      let out = tag;
      if (elementHasStroke(tag)) {
        out = out.replace(/\bstroke="currentColor"/i, `stroke="${primary}"`);
      }
      if (elementHasPaintFill(tag)) {
        out = out.replace(/\bfill="currentColor"/i, `fill="${secondary}"`);
      }
      return out;
    });
    return { svg, twoToned: true };
  }

  // mode === 'single': whole icon → primary.
  const svg = paintCurrentColorAll(body, primary);
  return { svg, twoToned: false };
}

/** Replace every `currentColor` ink token in a body with `color`. */
function paintCurrentColorAll(body: string, color: string): string {
  return body.replace(/="currentColor"/g, `="${color}"`);
}

function renderIcon(block: FreeformIconBlock, rect: PxRect): string {
  const color = block.color ?? '#64748b';

  // Local Figma pictogram (`figma:<id>`) → resolve its body from the manifest
  // and inline it, recolored to the block color. No network.
  const figmaId = block.name.startsWith(FIGMA_PICTOGRAM_PREFIX)
    ? block.name.slice(FIGMA_PICTOGRAM_PREFIX.length)
    : null;
  const figmaIcon = figmaId ? getIcon(figmaId) : undefined;

  if (figmaIcon) {
    // Inline the manifest body inside its own viewBox, scaled+centered into the
    // block rect via a nested <svg> (which maps the icon's viewBox onto the
    // rect for us). Ink recolored to the block color (whole-icon = single).
    const { svg: recolored } = recolorPictogramSvg(figmaIcon.body, 'single', {
      primary: color,
    });
    return (
      `<svg x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
        rect.h,
      )}" viewBox="${escapeXml(figmaIcon.viewBox)}" fill="none" ` +
      `preserveAspectRatio="xMidYMid meet" aria-label="${escapeXml(block.name)}">` +
      recolored +
      `</svg>`
    );
  }

  // Remote Iconify pictogram (e.g. 'ph:map-pin'): the body is only available via
  // a runtime CDN fetch, which this pure, network-free serializer must not do.
  // Emit a clean labeled placeholder; the Asset Editor's caller can splice the
  // fetched body over this group.
  // TODO: remote pictogram body (runtime-fetched) — resolve `block.name` via the
  //       Iconify API and inline its path set in place of this placeholder.
  const size = Math.min(rect.w, rect.h);
  const pad = size * 0.18;
  return (
    `<g aria-label="${escapeXml(block.name)}">` +
    `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
      rect.h,
    )}" fill="none" stroke="${escapeXml(color)}" stroke-width="1.5" rx="6"/>` +
    `<rect x="${fmt(rect.x + pad)}" y="${fmt(rect.y + pad)}" width="${fmt(
      rect.w - pad * 2,
    )}" height="${fmt(rect.h - pad * 2)}" fill="${escapeXml(color)}" opacity="0.18" rx="4"/>` +
    `<text x="${fmt(rect.cx)}" y="${fmt(rect.y + rect.h + 12)}" text-anchor="middle" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="9" fill="${escapeXml(
      color,
    )}">${escapeXml(block.name)}</text>` +
    `</g>`
  );
}

function renderChart(block: FreeformChartBlock, rect: PxRect): string {
  // Charts are out of scope for v1 of the SVG serializer — the native chart
  // renderer lives in the card-engine and produces its own SVG. Emit a labeled
  // placeholder so the composition still serializes.
  // TODO chart: route through the native chart SVG renderer and splice its
  //             <g> output here instead of this placeholder.
  return (
    `<g aria-label="chart">` +
    `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(
      rect.h,
    )}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" rx="8"/>` +
    `<text x="${fmt(rect.cx)}" y="${fmt(rect.cy)}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="12" fill="#64748b">${escapeXml(
      block.title || `${block.chartType} chart`,
    )}</text>` +
    `</g>`
  );
}

// ── Top-level serializer ──────────────────────────────────────────────────────

function renderBlock(block: FreeformBlock, width: number, height: number, defs: Defs): string {
  const rect = toPxRect(block, width, height);
  let inner: string;

  switch (block.type) {
    case 'text':
      inner = renderText(block, rect);
      break;
    case 'image':
      inner = renderImage(block, rect, defs);
      break;
    case 'shape':
      inner = renderShape(block, rect, defs);
      break;
    case 'icon':
      inner = renderIcon(block, rect);
      break;
    case 'chart':
      inner = renderChart(block, rect);
      break;
    case 'table':
      // Tables aren't part of the asset/graphics SVG export path (slides only).
      inner = '';
      break;
    case 'list':
      // Lists aren't part of the asset/graphics SVG export path (slides only).
      inner = '';
      break;
    default: {
      // Exhaustiveness guard — if a new block type is added to the union this
      // forces a compile error here.
      const _never: never = block;
      void _never;
      inner = '';
    }
  }

  const transform = rotationTransform(block, rect);
  const opacity = opacityAttr((block as { opacity?: number }).opacity);
  // Wrap every block in a <g> so the per-block transform/opacity apply uniformly.
  if (!transform && !opacity) return inner;
  return `<g${transform}${opacity}>${inner}</g>`;
}

/**
 * Serialize a Freeform composition to a standalone SVG document string.
 *
 * @param blocks  The composition's freeform blocks (percentage geometry).
 * @param width   Artboard width in px (the SVG `width` + viewBox W).
 * @param height  Artboard height in px (the SVG `height` + viewBox H).
 * @returns A well-formed, standalone `<svg>…</svg>` string. Vector elements stay
 *          vector; raster images embed by href. Pure — no DOM, no network.
 */
export function compositionToSvg(
  blocks: FreeformBlock[],
  width: number,
  height: number,
): string {
  const W = num(width, 960);
  const H = num(height, 540);
  const defs = new Defs();

  // Render in z-order (ascending z = back to front). Stable sort preserves the
  // original order for equal z values.
  const ordered = [...(blocks ?? [])]
    .map((block, i) => ({ block, i }))
    .sort((a, b) => num(a.block.z) - num(b.block.z) || a.i - b.i)
    .map((entry) => entry.block);

  const body = ordered.map((b) => renderBlock(b, W, H, defs)).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}" height="${fmt(H)}" ` +
    `viewBox="0 0 ${fmt(W)} ${fmt(H)}">` +
    defs.render() +
    body +
    `</svg>`
  );
}

// Exported for callers that want to emit an explicit callout bubble (the asset
// editor surfaces a dedicated callout annotation tool). Not part of the core
// block union, so it's a standalone helper.
export { renderCalloutBubble };
