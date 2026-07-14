import type { LucideIcon } from 'lucide-react';

export type ElementCategoryId =
  | 'icons'
  | 'ai-image'
  | 'charts'
  | 'shapes'
  | 'tables'
  | 'upload';

export interface ElementCategory {
  id: ElementCategoryId;
  label: string;
  description: string;
  Icon: LucideIcon;
  /** Tailwind classes for the category card surface (slate-only per Foxit palette discipline) */
  cardSurface: string;
  /** Tailwind classes for icon tint inside the card */
  iconTint: string;
}

export interface ElementItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export interface ElementsPanelCommonProps {
  /** When true, panel renders. Parent owns visibility. */
  isOpen: boolean;
  /** Close request — parent should set isOpen=false */
  onClose: () => void;
  /** Called when user picks an element from a drill-in. Receives category + item id. */
  onPickElement?: (categoryId: ElementCategoryId, itemId: string) => void;
}
