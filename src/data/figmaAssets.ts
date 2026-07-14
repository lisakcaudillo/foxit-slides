// Typed accessor for the canonical Figma asset manifest (figma-assets.json).
//
// ONE manifest, imported here and nowhere else. Components ask this module for
// device-frame geometry (DeviceFrame in card-template/frames.tsx, the PPTX
// export path) and pictogram markup — they never read the JSON directly.

import manifestJson from './figma-assets.json';

/** A device-frame "screen" rectangle — where a dropped image lands. x/y/w/h are
 *  % of the outer body box; radius is in px (viewBox units). */
export interface DeviceScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

/** A notch / camera cutout painted on top of the screen. x/y/w/h are % of the
 *  outer body box. */
export interface DeviceNotch {
  kind: 'pill' | 'circle';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/** A decorative rect drawn behind/around the body (e.g. a laptop's keyboard
 *  deck). x/y/w/h are % of the outer box. */
export interface DeviceExtra {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  fill: string;
}

export interface DeviceFrameAsset {
  label: string;
  family: string;
  /** Device base key (color-independent), e.g. 'iphone', 'android-tablet'. */
  device: string;
  /** Device display name without the color, e.g. 'iPhone'. */
  deviceLabel: string;
  /** Color variant: 'black' | 'silver' | 'white'. */
  color: string;
  /** Outer box in px — also the SVG viewBox (`0 0 w h`). For laptops this is
   *  the full footprint (lid + base); the lid is `bodyRect`. */
  outer: { w: number; h: number; radius: number };
  /** Body fill (#RRGGBB internally; stripped to bare hex on PPTX export). */
  body: string;
  /** Optional body outline — needed so light (silver/white) bodies read on a
   *  light slide. */
  bodyStroke?: string;
  /** Optional body sub-rect (% of outer) when the body isn't the full outer box
   *  — e.g. a laptop lid. Defaults to the full outer box. */
  bodyRect?: { x: number; y: number; w: number; h: number; radius: number };
  screenRect: DeviceScreenRect;
  notch?: DeviceNotch;
  /** Optional decorative rects (laptop base bars), drawn behind the body. */
  extras?: DeviceExtra[];
}

export interface IconAsset {
  label: string;
  /** Category tag for the picker chip filter (e.g. 'Security', 'Numbers'). */
  category: string;
  viewBox: string;
  /** Inline SVG markup with ink recolored to `currentColor` (export-safe). */
  body: string;
}

interface Manifest {
  frames: Record<string, DeviceFrameAsset>;
  icons: Record<string, IconAsset>;
}

const manifest = manifestJson as unknown as Manifest;

/** Look up a device frame by manifest id (e.g. `iphone-black`). */
export function getDeviceFrame(id?: string): DeviceFrameAsset | undefined {
  return id ? manifest.frames[id] : undefined;
}

/** All device frames, each with its manifest id — drives the Elements picker. */
export function listDeviceFrames(): Array<{ id: string } & DeviceFrameAsset> {
  return Object.entries(manifest.frames).map(([id, frame]) => ({ id, ...frame }));
}

/** Look up a pictogram by manifest id (e.g. `document`). */
export function getIcon(id?: string): IconAsset | undefined {
  return id ? manifest.icons[id] : undefined;
}

/** All pictograms, each with its manifest id — drives the Elements icon picker
 *  and the infographic icon-badge picker. The editor refers to a pictogram by
 *  the `figma:<id>` name on an icon block. */
export function listIcons(): Array<{ id: string } & IconAsset> {
  return Object.entries(manifest.icons).map(([id, icon]) => ({ id, ...icon }));
}

/** Display order for the icon category chips. Any category present in the
 *  manifest but missing here is appended at the end. */
const ICON_CATEGORY_ORDER = [
  'Product', 'Business', 'People', 'Infrastructure', 'Security',
  'Navigation', 'UI', 'Academic', 'Shapes', 'Numbers',
];

/** Distinct icon categories present in the manifest, in display order. */
export function listIconCategories(): string[] {
  const present = new Set(Object.values(manifest.icons).map((i) => i.category));
  const ordered = ICON_CATEGORY_ORDER.filter((c) => present.has(c));
  for (const c of present) if (!ordered.includes(c)) ordered.push(c);
  return ordered;
}

export interface DeviceVariant extends DeviceFrameAsset {
  id: string;
}
export interface DeviceGroup {
  device: string;
  label: string;
  family: string;
  variants: DeviceVariant[];
}

/** Device frames grouped by device (color variants collapsed into each group),
 *  in manifest order. Drives the picker's "one tile per device + color toggle"
 *  layout instead of 15 near-identical tiles. */
export function listDeviceGroups(): DeviceGroup[] {
  const order: string[] = [];
  const map = new Map<string, DeviceGroup>();
  for (const [id, f] of Object.entries(manifest.frames)) {
    if (!map.has(f.device)) {
      map.set(f.device, { device: f.device, label: f.deviceLabel, family: f.family, variants: [] });
      order.push(f.device);
    }
    map.get(f.device)!.variants.push({ id, ...f });
  }
  return order.map((d) => map.get(d)!);
}
