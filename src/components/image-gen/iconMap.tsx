'use client';

// ── Shared image-generation engine — icon map ──────────────────────────────
//
// One source for the icons both shells render, so the wizard and the slides
// accordion show identical glyphs. Maps:
//   • template `iconId` strings (box / user / flower / hexagon / image / brush)
//   • the 8 canonical style ids (photographic / illustration / 3d-render / …)
// to Lucide components. Lucide only, consistent stroke weight (HIG Icons).
//
// Note: promptModel's tech-abstract template uses iconId 'hexagon' (the Lucide
// name); 'hex' is accepted as an alias so the manager-prototype id also works.

import {
  Box,
  User,
  Flower2,
  Hexagon,
  Image as ImageIcon,
  Brush,
  Camera,
  PenTool,
  Boxes,
  Droplets,
  Pencil,
  Minus,
  Clapperboard,
  Sparkles,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ImageStyle } from './types';

/** Template icon ids → Lucide component. */
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  box: Box,
  user: User,
  flower: Flower2,
  hexagon: Hexagon,
  hex: Hexagon,
  image: ImageIcon,
  brush: Brush,
};

/** The 8 canonical style ids → Lucide component. */
const STYLE_ICONS: Record<ImageStyle, LucideIcon> = {
  photographic: Camera,
  illustration: PenTool,
  '3d-render': Boxes,
  watercolor: Droplets,
  sketch: Pencil,
  minimal: Minus,
  cinematic: Clapperboard,
  abstract: Sparkles,
};

/** Resolve a template iconId to its Lucide component (HelpCircle fallback). */
export function templateIcon(iconId: string): LucideIcon {
  return TEMPLATE_ICONS[iconId] ?? HelpCircle;
}

/** Resolve a style id to its Lucide component. */
export function styleIcon(id: ImageStyle): LucideIcon {
  return STYLE_ICONS[id] ?? Sparkles;
}
