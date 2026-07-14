import {
  Shapes,
  Sparkles,
  BarChart3,
  Hexagon,
  Table2,
  Upload,
  // icon set for "Icons" drill-in (samples only — production wires to Material Symbols catalog)
  Plus,
  Check,
  Circle,
  Star,
  Heart,
  Square,
  Sun,
  Bell,
  Home,
  ArrowRight,
  Camera,
  Lock,
  MessageCircle,
  Shield,
  Bookmark,
  CheckCircle,
  // shapes
  Triangle,
  // charts
  PieChart,
  LineChart,
  TrendingUp,
  Activity,
  // tables
  Grid3x3,
  Rows3,
  Columns3,
  type LucideIcon,
} from 'lucide-react';
import type { ElementCategory, ElementCategoryId, ElementItem } from './types';

/**
 * Categories shown in the Elements Panel.
 * Source of truth: approved prototypes (elements-panel-desktop.html, image-panel-f.html).
 * Mockups REMOVED).
 * Surface tints are slate-only — no off-palette colors.
 */
export const ELEMENT_CATEGORIES: ElementCategory[] = [
  {
    id: 'icons',
    label: 'Icons',
    description: 'Symbols and pictograms',
    Icon: Shapes,
    cardSurface: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    iconTint: 'text-violet-600',
  },
  {
    id: 'ai-image',
    label: 'AI Image',
    description: 'Generate from a description',
    Icon: Sparkles,
    cardSurface: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    iconTint: 'text-violet-600',
  },
  {
    id: 'charts',
    label: 'Charts',
    description: 'Data visualizations',
    Icon: BarChart3,
    cardSurface: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    iconTint: 'text-slate-700',
  },
  {
    id: 'shapes',
    label: 'Shapes',
    description: 'Basic geometry',
    Icon: Hexagon,
    cardSurface: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    iconTint: 'text-slate-700',
  },
  {
    id: 'tables',
    label: 'Tables',
    description: 'Rows and columns',
    Icon: Table2,
    cardSurface: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    iconTint: 'text-slate-700',
  },
  {
    id: 'upload',
    label: 'Upload',
    description: 'Your files',
    Icon: Upload,
    cardSurface: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    iconTint: 'text-slate-600',
  },
];

/**
 * Sample items for drill-in views. The icons category is illustrative — the production
 * implementation will load from a larger icon catalog (Material Symbols via Iconify).
 */
const ICON_ITEMS: ElementItem[] = [
  { id: 'plus', label: 'Plus', Icon: Plus },
  { id: 'check', label: 'Check', Icon: Check },
  { id: 'circle', label: 'Circle', Icon: Circle },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'heart', label: 'Heart', Icon: Heart },
  { id: 'square', label: 'Square', Icon: Square },
  { id: 'sun', label: 'Sun', Icon: Sun },
  { id: 'bell', label: 'Bell', Icon: Bell },
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'arrow-right', label: 'Arrow', Icon: ArrowRight },
  { id: 'camera', label: 'Camera', Icon: Camera },
  { id: 'lock', label: 'Lock', Icon: Lock },
  { id: 'message', label: 'Message', Icon: MessageCircle },
  { id: 'shield', label: 'Shield', Icon: Shield },
  { id: 'bookmark', label: 'Bookmark', Icon: Bookmark },
  { id: 'check-circle', label: 'Verified', Icon: CheckCircle },
];

const CHART_ITEMS: ElementItem[] = [
  { id: 'bar', label: 'Bar', Icon: BarChart3 },
  { id: 'line', label: 'Line', Icon: LineChart },
  { id: 'pie', label: 'Pie', Icon: PieChart },
  { id: 'area', label: 'Area', Icon: TrendingUp },
  { id: 'activity', label: 'Activity', Icon: Activity },
];

const SHAPE_ITEMS: ElementItem[] = [
  { id: 'rectangle', label: 'Rectangle', Icon: Square },
  { id: 'circle', label: 'Circle', Icon: Circle },
  { id: 'triangle', label: 'Triangle', Icon: Triangle },
  { id: 'hexagon', label: 'Hexagon', Icon: Hexagon },
  { id: 'star', label: 'Star', Icon: Star },
];

const TABLE_ITEMS: ElementItem[] = [
  { id: 'table-2x2', label: '2 × 2', Icon: Grid3x3 },
  { id: 'table-3x3', label: '3 × 3', Icon: Grid3x3 },
  { id: 'table-rows', label: 'Rows', Icon: Rows3 },
  { id: 'table-cols', label: 'Columns', Icon: Columns3 },
];

const ITEMS_BY_CATEGORY: Record<ElementCategoryId, ElementItem[]> = {
  icons: ICON_ITEMS,
  charts: CHART_ITEMS,
  shapes: SHAPE_ITEMS,
  tables: TABLE_ITEMS,
  // ai-image and upload have custom drill-in UIs (no item grid)
  'ai-image': [],
  upload: [],
};

export function getCategoryItems(id: ElementCategoryId): ElementItem[] {
  return ITEMS_BY_CATEGORY[id] ?? [];
}

export function getCategory(id: ElementCategoryId): ElementCategory | undefined {
  return ELEMENT_CATEGORIES.find((c) => c.id === id);
}

// Re-export the LucideIcon type alias so consumers don't need to import from lucide-react directly.
export type { LucideIcon };
