// Native PPTX export for slide decks — powered by Foxit Slides's in-house OOXML engine.
//
// Authors a real, editable PowerPoint from the CardTemplate model — text boxes,
// shapes, images, tables, and charts as first-class PPTX objects (NOT a flattened
// image-per-slide render, and NOT a lossy PDF→PPTX round-trip). The freeform block
// model is absolute-positioned in percentages against a 960×540 card, which is
// exactly PowerPoint 16:9 widescreen (13.333in × 7.5in), so the mapping is direct:
// % → inches, and px → pt at 1:1.
//
// The exporter is a THIN MAPPING layer: it resolves CardTemplate colors/geometry
// and calls the in-house engine (app/src/lib/pptx). No third-party PPTX library —
// gradient text and gradient shape fills are native engine features (no post-pass).

import {
  createDeck,
  type Slide,
  type TextRun,
  type Hyperlink,
} from '@/lib/slidewright';
import { type Fill } from '@/lib/slidewright/colors';
import type {
  CardTemplate,
  Card,
  TemplateTheme,
  FreeformTextBlock,
  FreeformImageBlock,
  FreeformShapeBlock,
  FreeformIconBlock,
  FreeformChartBlock,
  FreeformTableBlock,
  FreeformListBlock,
  LinkTarget,
} from '@/types/card-template';
import { asLinkTarget } from '@/lib/card-engine/text-runs';
import { resolveIconId } from '@/components/card-template/blocks/icon-map';
import { getDeviceFrame, getIcon } from '@/data/figmaAssets';
import { toOoxmlColor } from './ooxmlColor.mjs';

// ── Geometry ──────────────────────────────────────────────────────────────
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const inX = (pct: number) => (pct / 100) * SLIDE_W;
const inY = (pct: number) => (pct / 100) * SLIDE_H;
const pt = (px: number) => px;

const VARIANT_DEFAULTS: Record<
  FreeformTextBlock['variant'],
  { size: number; weight: number; lineHeight: number }
> = {
  heading: { size: 38.4, weight: 900, lineHeight: 1.15 },
  subheading: { size: 22.4, weight: 600, lineHeight: 1.3 },
  paragraph: { size: 16, weight: 400, lineHeight: 1.6 },
  metric: { size: 48, weight: 800, lineHeight: 1.05 },
};

// ── Color helpers ─────────────────────────────────────────────────────────
/** Normalize to a bare 6-digit hex (no '#'), or undefined. */
function hex(c?: string): string | undefined {
  return toOoxmlColor(c);
}

/** First hex color found in a CSS gradient/string. */
function firstHex(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i);
  return m ? hex(m[0]) : undefined;
}

/** Any CSS color (hex/rgb/rgba) → { color, transparency } or undefined. */
function solidPaint(c?: string): { color: string; transparency?: number } | undefined {
  if (!c) return undefined;
  const s = c.trim();
  const direct = hex(s);
  if (direct) return { color: direct };
  const rgbm = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/i);
  if (rgbm) {
    const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    const color = (toHex(+rgbm[1]) + toHex(+rgbm[2]) + toHex(+rgbm[3])).toUpperCase();
    let transparency: number | undefined;
    if (rgbm[4] != null) {
      const a = rgbm[4].endsWith('%') ? parseFloat(rgbm[4]) / 100 : parseFloat(rgbm[4]);
      transparency = Math.max(0, Math.min(100, Math.round((1 - a) * 100)));
    }
    return { color, ...(transparency != null ? { transparency } : {}) };
  }
  const fh = firstHex(s);
  return fh ? { color: fh } : undefined;
}

/** CSS gradient angle (0deg = up, clockwise) → OOXML lin ang (0 = right, cw, in
 *  60000ths of a degree). */
function cssAngleToOoxml(deg: number): number {
  const a = (((deg - 90) % 360) + 360) % 360;
  return Math.round(a * 60000);
}

/** Parse a CSS linear-gradient to an engine gradient Fill (angle + stops), or null. */
function parseGradientFill(css?: string): Fill | null {
  if (!css) return null;
  const angM = css.match(/(-?\d+(?:\.\d+)?)deg/);
  const ang = cssAngleToOoxml(angM ? parseFloat(angM[1]) : 180);
  const raw: { color: string; pct?: number }[] = [];
  const re = /#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])(?:\s+(\d+(?:\.\d+)?)%)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const c = hex(`#${m[1]}`);
    if (c) raw.push({ color: c, pct: m[2] != null ? parseFloat(m[2]) : undefined });
  }
  if (raw.length < 2) return null;
  const stops = raw.map((s, idx) => ({
    pos: Math.round(Math.max(0, Math.min(100, s.pct ?? (idx / (raw.length - 1)) * 100)) * 1000),
    color: s.color,
  }));
  return { kind: 'gradient', angle: ang, stops };
}

/** Resolve any CSS fill string → an engine Fill (gradient native; else solid; else none). */
function resolveFill(css?: string): Fill {
  if (!css) return { kind: 'none' };
  if (/gradient/i.test(css)) {
    const g = parseGradientFill(css);
    if (g) return g;
  }
  const p = solidPaint(css);
  return p ? { kind: 'solid', color: p.color, transparency: p.transparency } : { kind: 'none' };
}

/** Parse a CSS box-shadow ('0 3px 10px rgba(11,31,58,0.07)') into an engine
 *  ShadowSpec. px are on the 960×540 card (72px/in). Returns undefined if no
 *  color/offsets can be found. */
function parseBoxShadow(css?: string): { colorHex: string; opacity?: number; blurIn?: number; distIn?: number; dirDeg?: number } | undefined {
  if (!css || /^\s*none\s*$/i.test(css)) return undefined;
  const paint = solidPaint(css);
  if (!paint) return undefined;
  const nums = (css.match(/-?\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
  // First 3 numbers that aren't part of the color: offsetX, offsetY, blur. The
  // color's own digits are stripped by taking numbers that precede the color token.
  const beforeColor = css.split(/rgba?\(|#/)[0];
  const geom = (beforeColor.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const [ox = 0, oy = 3, blur = 8] = geom.length ? geom : nums;
  const distIn = Math.hypot(ox, oy) / 72;
  const dirDeg = (Math.atan2(oy, ox) * 180) / Math.PI;
  return {
    colorHex: paint.color,
    opacity: paint.transparency != null ? Math.max(0, 1 - paint.transparency / 100) : 0.3,
    blurIn: blur / 72,
    distIn,
    dirDeg,
  };
}

/** Clean a CSS font-family stack to a single PPTX font face. */
function fontFace(stack?: string): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first || undefined;
}

function cardBgHex(card: Card, theme: TemplateTheme): string {
  return (
    firstHex(card.background?.gradient) ??
    hex(card.background?.color) ??
    (card.style === 'dark' ? '1A1A3E' : undefined) ??
    (card.style === 'chapter' ? 'E8EAF6' : undefined) ??
    hex(theme.cardBg) ??
    firstHex(theme.cardBg) ??
    'FFFFFF'
  );
}

function cssBackgroundOf(card: Card, theme: TemplateTheme): string {
  if (card.background?.gradient) return card.background.gradient;
  if (card.background?.color) return card.background.color;
  if (card.style === 'dark') return 'linear-gradient(135deg, #1a1a3e, #2d1b4e)';
  if (card.style === 'chapter') return 'linear-gradient(135deg, #e8eaf6, #d6daf0, #cfd6fc)';
  return theme.cardBg || '#ffffff';
}

function sideToAngle(s: string): number {
  s = s.toLowerCase();
  if (s.includes('top') && s.includes('right')) return 45;
  if (s.includes('bottom') && s.includes('right')) return 135;
  if (s.includes('bottom') && s.includes('left')) return 225;
  if (s.includes('top') && s.includes('left')) return 315;
  if (s.includes('top')) return 0;
  if (s.includes('right')) return 90;
  if (s.includes('bottom')) return 180;
  if (s.includes('left')) return 270;
  return 180;
}

/** Foxit Slides a CSS linear-gradient as a vector SVG data URL, for a faithful slide-bg. */
function gradientToSvgDataUrl(css: string): string | null {
  const m = css.match(/linear-gradient\(\s*([\s\S]*)\)\s*$/i);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  let angle = 180;
  let idx = 0;
  if (/deg\s*$/.test(parts[0])) { angle = parseFloat(parts[0]); idx = 1; }
  else if (/^to\s+/i.test(parts[0])) { angle = sideToAngle(parts[0]); idx = 1; }
  const stops = parts.slice(idx).map((p) => {
    const hm = p.match(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i);
    const pm = p.match(/([\d.]+)%/);
    return { color: hm ? `#${hm[1]}` : null, pos: pm ? parseFloat(pm[1]) / 100 : null as number | null };
  }).filter((s): s is { color: string; pos: number | null } => !!s.color);
  if (!stops.length) return null;
  stops.forEach((s, i) => { if (s.pos == null) s.pos = stops.length === 1 ? 0 : i / (stops.length - 1); });
  const W = 1280, H = 720;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const cx = W / 2, cy = H / 2;
  const half = (Math.abs(dx) * W + Math.abs(dy) * H) / 2;
  const x1 = (cx - dx * half).toFixed(1), y1 = (cy - dy * half).toFixed(1);
  const x2 = (cx + dx * half).toFixed(1), y2 = (cy + dy * half).toFixed(1);
  const stopEls = stops
    .map((s) => `<stop offset="${Math.max(0, Math.min(100, (s.pos as number) * 100)).toFixed(2)}%" stop-color="${s.color}"/>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    `<defs><linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopEls}</linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#bg)"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

type BgResult =
  | { kind: 'color'; color: string }
  | { kind: 'image'; data: string }
  | { kind: 'svg'; data: string; fallbackColor: string };

async function resolveBackground(card: Card, theme: TemplateTheme): Promise<BgResult> {
  const img = await toDataUrl(card.background?.image);
  if (img) return { kind: 'image', data: img };
  const css = cssBackgroundOf(card, theme);
  if (/gradient/i.test(css)) {
    const svg = gradientToSvgDataUrl(css);
    if (svg) return { kind: 'svg', data: svg, fallbackColor: firstHex(css) ?? 'FFFFFF' };
    return { kind: 'color', color: firstHex(css) ?? 'FFFFFF' };
  }
  return { kind: 'color', color: hex(css) ?? firstHex(css) ?? 'FFFFFF' };
}

function isDarkCard(card: Card, theme: TemplateTheme): boolean {
  const bg = cardBgHex(card, theme);
  const r = parseInt(bg.slice(0, 2), 16);
  const g = parseInt(bg.slice(2, 4), 16);
  const b = parseInt(bg.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function isDarkHex(h: string): boolean {
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

// ── Async asset prefetch ─────────────────────────────────────────────────────
async function toDataUrl(src?: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    if (typeof Buffer !== 'undefined') {
      const ab = await res.arrayBuffer();
      const mime = res.headers.get('content-type')?.split(';')[0] || 'image/png';
      return `data:${mime};base64,${Buffer.from(ab).toString('base64')}`;
    }
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function figmaIconDataUrl(block: FreeformIconBlock): string | null {
  const id = block.name.slice('figma:'.length);
  const icon = getIcon(id);
  if (!icon) return null;
  const color = block.color && /^#?[0-9a-fA-F]{3,6}$/.test(block.color.trim())
    ? (block.color.trim().startsWith('#') ? block.color.trim() : `#${block.color.trim()}`)
    : '#0B1F3A';
  const body = icon.body.replace(/currentColor/g, color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="none">${body}</svg>`;
  return svgDataUrl(svg);
}

async function iconDataUrl(block: FreeformIconBlock): Promise<string | null> {
  if (block.name.startsWith('figma:')) return figmaIconDataUrl(block);
  const iconId = resolveIconId(block.name);
  const px = 128;
  const color = hex(block.color);
  const url = `https://api.iconify.design/${iconId}.svg?width=${px}&height=${px}${
    color ? `&color=${encodeURIComponent('#' + color)}` : ''
  }`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const svg = await res.text();
    if (!svg.trim().startsWith('<svg')) return null;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch {
    return null;
  }
}

function rotateOf(block: { rotation?: number }): number | undefined {
  const r = block.rotation || 0;
  if (!r) return undefined;
  return ((Math.round(r) % 360) + 360) % 360;
}

// ── Per-block writers ────────────────────────────────────────────────────────
/** Map a run's link mark to an engine Hyperlink (external URL or internal slide). */
export function hyperlinkFor(
  link: string | LinkTarget | undefined,
  slideIndexById?: Map<string, number>,
): Hyperlink | undefined {
  const t = asLinkTarget(link);
  if (!t) return undefined;
  if (t.kind === 'slide') {
    const n = slideIndexById?.get(t.value);
    return n ? { slideIndex: n } : undefined;
  }
  if (t.kind === 'download' && t.value.startsWith('data:')) return undefined;
  return { external: t.value };
}

function addText(slide: Slide, b: FreeformTextBlock, card: Card, theme: TemplateTheme, slideIndexById?: Map<string, number>) {
  const v = VARIANT_DEFAULTS[b.variant];
  const headingish = b.variant === 'heading' || b.variant === 'subheading';
  const size = b.style?.fontSize ?? v.size;
  const weight = b.style?.fontWeight ?? v.weight;
  const themeColor = headingish ? theme.headingColor : theme.bodyColor;
  const gradient = parseGradientFill(b.style?.gradient) ?? undefined;
  const color = hex(b.style?.color) ?? hex(themeColor) ?? (isDarkCard(card, theme) ? 'F5F5F7' : '111111');
  const face = fontFace(b.style?.fontFamily) ?? fontFace(headingish ? theme.headingFont : theme.bodyFont);

  const boxOpts = {
    x: inX(b.x),
    y: inY(b.y),
    w: inX(b.w),
    h: inY(b.h),
    sizePt: pt(size),
    bold: weight >= 600,
    italic: b.style?.italic || undefined,
    underline: b.style?.underline || undefined,
    color: b.style?.color ? color : gradient ? undefined : color,
    gradient,
    fontFace: face,
    align: (b.style?.textAlign ?? 'left') as 'left' | 'center' | 'right' | 'justify',
    valign: 'top' as const,
    lineSpacingMultiple: b.style?.lineHeight ?? v.lineHeight,
    letterSpacingPt: b.style?.letterSpacing,
    rotationDeg: rotateOf(b),
    wrap: true,
  };

  if (b.runs && b.runs.length) {
    const runs: TextRun[] = b.runs.map((r) => {
      const m = r.marks;
      return {
        text: r.text,
        sizePt: pt(m?.fontSize ?? size),
        bold: m?.bold ?? weight >= 600,
        italic: m?.italic ?? b.style?.italic,
        underline: m?.underline ?? b.style?.underline,
        strike: m?.strike,
        color: hex(m?.color) ?? (gradient ? undefined : color),
        gradient: m?.color ? undefined : gradient,
        fontFace: fontFace(m?.fontFamily) ?? face,
        hyperlink: hyperlinkFor(m?.link, slideIndexById),
      };
    });
    slide.addText(runs, boxOpts);
    return;
  }
  slide.addText(b.content ?? '', boxOpts);
}

async function addImage(slide: Slide, b: FreeformImageBlock) {
  if (b.frameShape === 'device') {
    await addDeviceFrame(slide, b);
    return;
  }
  const data = await toDataUrl(b.src);
  if (!data) return;
  slide.addImage({
    data,
    x: inX(b.x),
    y: inY(b.y),
    w: inX(b.w),
    h: inY(b.h),
    rotationDeg: rotateOf(b),
    rounded: b.frameShape === 'circle' || undefined,
    sizing: b.fit === 'contain' ? 'contain' : 'cover',
    opacity: b.opacity,
  });
}

async function addDeviceFrame(slide: Slide, b: FreeformImageBlock) {
  const frame = getDeviceFrame(b.deviceId);
  if (!frame) return;
  const { outer, body, bodyStroke, bodyRect, screenRect, notch, extras } = frame;
  const X = inX(b.x), Y = inY(b.y), W = inX(b.w), H = inY(b.h);
  const px = (p: number) => X + (p / 100) * W;
  const py = (p: number) => Y + (p / 100) * H;
  const pw = (p: number) => (p / 100) * W;
  const ph = (p: number) => (p / 100) * H;
  const bodyHex = hex(body);
  const strokeHex = hex(bodyStroke);

  for (const ex of extras ?? []) {
    const exHex = hex(ex.fill);
    slide.addShape('roundRect', {
      x: px(ex.x), y: py(ex.y), w: pw(ex.w), h: ph(ex.h),
      fill: exHex ? { kind: 'solid', color: exHex } : { kind: 'none' },
      rectRadiusIn: ex.radius ? (ex.radius / outer.w) * W : 0,
    });
  }
  const bX = bodyRect ? px(bodyRect.x) : X;
  const bY = bodyRect ? py(bodyRect.y) : Y;
  const bW = bodyRect ? pw(bodyRect.w) : W;
  const bH = bodyRect ? ph(bodyRect.h) : H;
  const bRad = bodyRect ? bodyRect.radius : outer.radius;
  slide.addShape('roundRect', {
    x: bX, y: bY, w: bW, h: bH,
    fill: bodyHex ? { kind: 'solid', color: bodyHex } : { kind: 'none' },
    line: strokeHex ? { color: strokeHex, widthEmu: Math.round(0.75 * 12700) } : undefined,
    rectRadiusIn: (bRad / outer.w) * W,
  });
  const sx = X + (screenRect.x / 100) * W;
  const sy = Y + (screenRect.y / 100) * H;
  const sw = (screenRect.w / 100) * W;
  const sh = (screenRect.h / 100) * H;
  const data = await toDataUrl(b.src);
  if (data) {
    slide.addImage({ data, x: sx, y: sy, w: sw, h: sh, sizing: b.fit === 'contain' ? 'contain' : 'cover' });
  }
  if (notch) {
    const nx = X + (notch.x / 100) * W;
    const ny = Y + (notch.y / 100) * H;
    const nw = (notch.w / 100) * W;
    const nh = (notch.h / 100) * H;
    const notchHex = hex(notch.fill) ?? '000000';
    slide.addShape(notch.kind === 'circle' ? 'ellipse' : 'roundRect', {
      x: nx, y: ny, w: nw, h: nh,
      fill: { kind: 'solid', color: notchHex },
      ...(notch.kind === 'pill' ? { rectRadiusIn: nh / 2 } : {}),
    });
  }
}

function addShape(slide: Slide, b: FreeformShapeBlock, theme: TemplateTheme) {
  const fill = resolveFill(b.fill);
  const strokePaint = solidPaint(b.stroke);
  const line = strokePaint
    ? { color: strokePaint.color, widthEmu: Math.round((b.strokeWidth ?? 1) * 12700), transparency: strokePaint.transparency }
    : undefined;
  const shadow = parseBoxShadow(b.boxShadow);
  const geom = { x: inX(b.x), y: inY(b.y), w: inX(b.w), h: inY(b.h), rotationDeg: rotateOf(b) };

  if (b.shape === 'line' || b.shape === 'arrow') {
    slide.addShape('line', {
      ...geom,
      line: {
        color: strokePaint?.color ?? (fill.kind === 'solid' ? fill.color : '333333'),
        widthEmu: Math.round((b.strokeWidth ?? 2) * 12700),
        tailArrow: b.shape === 'arrow',
      },
    });
    return;
  }

  const rectRadiusIn = b.shape === 'rectangle' && b.borderRadius ? b.borderRadius / 72 : undefined;
  const preset = b.shape === 'circle' ? 'ellipse' : rectRadiusIn ? 'roundRect' : 'rect';

  if (b.content && b.content.trim()) {
    const fillHexForContrast = fill.kind === 'solid' ? fill.color : fill.kind === 'gradient' ? fill.stops[0]?.color : undefined;
    const txtColor = hex(b.textStyle?.color) ?? (fillHexForContrast && isDarkHex(fillHexForContrast) ? 'FFFFFF' : '111111');
    slide.addText(b.content, {
      ...geom,
      shape: preset,
      fill,
      line,
      shadow,
      rectRadiusIn,
      color: txtColor,
      sizePt: pt(b.textStyle?.fontSize ?? 16),
      bold: (b.textStyle?.fontWeight ?? 400) >= 600,
      italic: b.textStyle?.italic || undefined,
      underline: b.textStyle?.underline || undefined,
      fontFace: fontFace(b.textStyle?.fontFamily) ?? fontFace(theme.bodyFont),
      align: (b.textStyle?.textAlign ?? 'center') as 'left' | 'center' | 'right' | 'justify',
      valign: 'middle',
    });
  } else {
    slide.addShape(preset, { ...geom, fill, line, rectRadiusIn, shadow });
  }
}

async function addIcon(slide: Slide, b: FreeformIconBlock) {
  const data = await iconDataUrl(b);
  if (!data) return;
  const side = 32 / 72;
  const boxX = inX(b.x), boxY = inY(b.y), boxW = inX(b.w), boxH = inY(b.h);
  slide.addImage({
    data,
    x: boxX + (boxW - side) / 2,
    y: boxY + (boxH - side) / 2,
    w: side,
    h: side,
    rotationDeg: rotateOf(b),
  });
}

function chartKind(t: FreeformChartBlock['chartType']): 'bar' | 'column' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' {
  switch (t) {
    case 'bar': return 'bar';
    case 'column': return 'column';
    case 'line': return 'line';
    case 'area': return 'area';
    case 'pie': return 'pie';
    case 'donut': return 'doughnut';
    case 'scatter': return 'scatter';
    // Foxit Slides's chart model carries no per-point SIZE, so a true bubble chart
    // isn't expressible — the closest faithful native form is a scatter (X,Y
    // points). Funnel has no native OOXML equivalent in the c: chart schema (it's
    // an Office-2016 cx: "chartex" type) — a horizontal bar reads funnel-adjacent
    // and stays a real, editable chart. Both are honest best-effort, not lossy.
    case 'bubble': return 'scatter';
    case 'funnel': return 'bar';
    default: return 'column';
  }
}

async function addChart(slide: Slide, b: FreeformChartBlock, theme: TemplateTheme) {
  // Per-chart palette override (b.palette) wins over per-series color, then theme.
  const colors = b.series.map(
    (s, i) => hex(s.color) ?? hex(b.palette?.[i % (b.palette?.length || 1)]) ?? hex(theme.accentColors[i % theme.accentColors.length]) ?? '6B3FA0',
  );
  // Map the model's coarse numberFormat to an OOXML format code (value axis + labels).
  const fmt =
    b.numberFormat === 'currency' ? '$#,##0' :
    b.numberFormat === 'percent' ? '0%' :
    b.numberFormat === 'compact' ? '#,##0,"k"' :
    b.numberFormat === 'number' ? '#,##0' : undefined;
  await slide.addChart({
    kind: chartKind(b.chartType),
    categories: b.categories,
    series: b.series.map((s, i) => ({ name: s.name, values: s.values, color: colors[i] })),
    title: b.title,
    xIn: inX(b.x),
    yIn: inY(b.y),
    wIn: inX(b.w),
    hIn: inY(b.h),
    colors,
    showLegend: b.series.length > 1,
    valueFormat: fmt,
    axisTitleX: b.xAxisLabel,
    axisTitleY: b.yAxisLabel,
  });
}

function addTable(slide: Slide, b: FreeformTableBlock, theme: TemplateTheme) {
  const rows = b.rows ?? [];
  if (!rows.length) return;
  const nCols = Math.max(1, ...rows.map((r) => r.length));
  const totalW = inX(b.w);
  let colWidthsIn: number[];
  if (b.colWidths && b.colWidths.length === nCols) {
    const sum = b.colWidths.reduce((a, c) => a + Math.max(0, c), 0) || 1;
    colWidthsIn = b.colWidths.map((c) => (Math.max(0, c) / sum) * totalW);
  } else {
    colWidthsIn = Array(nCols).fill(totalW / nCols);
  }
  const align = b.align ?? [];
  slide.addTable({
    xIn: inX(b.x), yIn: inY(b.y), wIn: totalW, hIn: inY(b.h),
    colWidthsIn,
    headerRow: b.headerRow !== false,
    headerFill: hex(theme.accentColors?.[0]),
    headerColor: hex(theme.headingColor),
    headerRuleColor: hex(theme.accentColors?.[0]),
    bodyColor: hex(b.style?.color) ?? hex(theme.bodyColor),
    bodyBorderColor: 'E5E5E5',
    fontFace: fontFace(b.style?.fontFamily) ?? fontFace(theme.bodyFont),
    fontSizePt: b.style?.fontSize ?? 12,
    rows: rows.map((row, r) =>
      Array.from({ length: nCols }, (_, c) => ({
        text: row[c] ?? '',
        align: align[c] ?? (c === 0 ? 'left' : 'right'),
        bold: b.headerRow !== false && r === 0,
      })),
    ),
    merges: b.merges,
  });
}

function addList(slide: Slide, b: FreeformListBlock, card: Card, theme: TemplateTheme) {
  if (!b.items?.length) return;
  slide.addList({
    x: inX(b.x),
    y: inY(b.y),
    w: inX(b.w),
    h: inY(b.h),
    items: b.items.map((it) => ({ text: it.text, label: it.label })),
    marker: b.marker ?? 'bullet',
    labelLayout: b.labelLayout ?? 'inline',
    sizePt: pt(b.style?.fontSize ?? 16),
    color: hex(b.style?.color) ?? hex(theme.bodyColor) ?? (isDarkCard(card, theme) ? 'F5F5F7' : '333333'),
    fontFace: fontFace(b.style?.fontFamily) ?? fontFace(theme.bodyFont),
    lineSpacingMultiple: b.style?.lineHeight,
    // `gap` is px on the 960×540 canvas; px→pt is 1:1 at the scale.
    gapPt: b.gap != null ? b.gap : undefined,
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
/** Build a deck into a finished .pptx Blob (native gradient text/shape fills — no
 *  post-pass). Separated from the download so it can be tested/inspected headlessly. */
export async function buildDeckPptxBlob(template: CardTemplate): Promise<Blob> {
  const deck = createDeck({ title: template.name || 'Presentation', author: 'Foxit Slides' });
  const theme = template.theme;
  const slideIndexById = new Map(template.cards.map((c, i) => [c.id, i + 1]));

  for (const card of template.cards) {
    const slide = deck.addSlide();
    const bg = await resolveBackground(card, theme);
    if (bg.kind === 'color') {
      slide.setBackgroundColor(bg.color);
    } else if (bg.kind === 'image') {
      slide.setBackgroundColor('FFFFFF');
      slide.addImage({ data: bg.data, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, sizing: 'cover' });
    } else {
      slide.setBackgroundColor(bg.fallbackColor);
      slide.addImage({ data: bg.data, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, sizing: 'cover' });
    }

    const blocks = [...(card.freeform ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const block of blocks) {
      switch (block.type) {
        case 'text':
          addText(slide, block, card, theme, slideIndexById);
          break;
        case 'image':
          await addImage(slide, block);
          break;
        case 'shape':
          addShape(slide, block, theme);
          break;
        case 'icon':
          await addIcon(slide, block);
          break;
        case 'chart':
          await addChart(slide, block, theme);
          break;
        case 'table':
          addTable(slide, block, theme);
          break;
        case 'list':
          addList(slide, block, card, theme);
          break;
      }
    }
  }

  return deck.write();
}

/** Build + DOWNLOAD a deck as a .pptx (the editor's "Export as PPT" path). */
export async function exportDeckToPptx(template: CardTemplate, fileName?: string): Promise<void> {
  const blob = await buildDeckPptxBlob(template);
  const safe = (fileName || template.name || 'presentation')
    .trim()
    .replace(/[^a-z0-9\-_ ]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'presentation';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.pptx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
