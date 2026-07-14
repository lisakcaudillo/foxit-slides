'use client';

import {
  Search,
  Sparkles,
  Type,
  ImagePlus,
  LayoutGrid,
  PenTool,
  FileDown,
  Table2,
} from 'lucide-react';
import { isFoxitReady } from '@/lib/foxit';

export type RailPanel = 'search' | 'ai' | 'text' | 'media' | 'blocks' | 'fields' | 'export' | 'tables';

interface ToolRailProps {
  onOpenPanel: (panel: RailPanel) => void;
  activePanel?: RailPanel | null;
}

const TOOLS: {
  panel: RailPanel;
  icon: typeof Search;
  label: string;
  requiresFoxit?: boolean;
}[] = [
  { panel: 'search', icon: Search, label: 'Search' },
  { panel: 'ai', icon: Sparkles, label: 'AI' },
  { panel: 'text', icon: Type, label: 'Text' },
  { panel: 'media', icon: ImagePlus, label: 'Media' },
  { panel: 'blocks', icon: LayoutGrid, label: 'Blocks' },
  { panel: 'tables', icon: Table2, label: 'Tables' },
  { panel: 'fields', icon: PenTool, label: 'Fields' },
  { panel: 'export', icon: FileDown, label: 'Export' },
];

/**
 * Floating right-side tool rail — positioned to the right of the A4 page.
 * Icon strip with labels. SDK-dependent tools hidden when unavailable.
 */
export default function FloatingToolRail({
  onOpenPanel,
  activePanel,
}: ToolRailProps) {
  const foxitReady = isFoxitReady();

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-1 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-lg py-3 px-1.5"
      role="toolbar"
      aria-label="Editor tools"
      style={{
        top: '50%',
        transform: 'translateY(-50%)',
        right: '24px',
      }}
    >
      {TOOLS.map((tool) => {
        if (tool.requiresFoxit && !foxitReady) return null;

        const isActive = activePanel === tool.panel;
        const Icon = tool.icon;

        return (
          <button
            key={tool.panel}
            type="button"
            onClick={() => onOpenPanel(tool.panel)}
            title={tool.label}
            aria-label={tool.label}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
              isActive
                ? 'bg-violet-50 text-violet-600'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
            style={{ width: '48px', height: '48px', minWidth: '48px', minHeight: '48px' }}
          >
            <Icon style={{ width: '20px', height: '20px' }} />
            <span style={{ fontSize: '10px', lineHeight: 1, fontWeight: 500 }}>{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}
