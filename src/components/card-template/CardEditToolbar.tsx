'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Sparkles,
  LayoutGrid,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  Plus,
} from 'lucide-react';
import type { ToolbarContext, FormattingState, ToolbarPosition } from '@/types/toolbar';

// ── Types ────────────────────────────────────────────────────────────────────

// Re-export for backward compatibility
export type ToolbarMode = Extract<ToolbarContext, 'card-selected' | 'text-selected' | 'hidden'>;

export interface CardEditToolbarProps {
  mode: ToolbarMode;
  position: ToolbarPosition;
  // Card-level actions
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onLayoutSwap?: () => void;
  // Text formatting actions
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onFontSize?: (delta: number) => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onAIAction?: (action: string) => void;
  // Formatting state
  formattingState?: FormattingState;
  currentFontSize?: number;
}

// ── Shared styles ────────────────────────────────────────────────────────────

const CONTAINER_STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 50,
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(15,23,42,0.06)',
  borderRadius: '10px',
  boxShadow: '0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
};

const BTN =
  'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-600 transition-colors duration-150';

const BTN_HOVER = `${BTN} hover:bg-[rgba(15,23,42,0.04)]`;
const BTN_AI = `${BTN} hover:bg-[rgba(107,63,160,0.08)]`;
const BTN_DELETE = `${BTN} hover:bg-slate-100 hover:text-slate-900`;
const BTN_ACTIVE = `${BTN} bg-slate-100 text-slate-900`;

// ── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{ width: '1px', height: '20px', background: 'rgba(15,23,42,0.08)', flexShrink: 0 }}
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CardEditToolbar({
  mode,
  position,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onRegenerate,
  onLayoutSwap,
  onBold,
  onItalic,
  onUnderline,
  onFontSize,
  onAlign,
  onAIAction,
  formattingState,
  currentFontSize,
}: CardEditToolbarProps) {
  const [showAIMenu, setShowAIMenu] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close AI menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowAIMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close AI menu on mode change
  useEffect(() => {
    setShowAIMenu(false);
  }, [mode]);

  if (mode === 'hidden') return null;

  return (
    <div
      ref={toolbarRef}
      style={{ ...CONTAINER_STYLE, top: position.top, left: position.left }}
      className="animate-toolbar-in"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* ── Card-level toolbar ─────────────────────────────────────── */}
      {mode === 'card-selected' && (
        <>
          <button type="button" className={BTN_HOVER} onClick={onMoveUp} title="Move up">
            <ChevronUp size={16} />
          </button>
          <button type="button" className={BTN_HOVER} onClick={onMoveDown} title="Move down">
            <ChevronDown size={16} />
          </button>

          <Divider />

          <button type="button" className={BTN_HOVER} onClick={onDuplicate} title="Duplicate">
            <Copy size={16} />
          </button>
          <button type="button" className={BTN_DELETE} onClick={onDelete} title="Delete">
            <Trash2 size={16} />
          </button>

          <Divider />

          <button
            type="button"
            className={`${BTN_AI} gap-1.5 px-3`}
            style={{ color: '#6B3FA0' }}
            onClick={onRegenerate}
            title="Regenerate"
          >
            <Sparkles size={16} />
            <span className="text-sm font-medium">Regenerate</span>
          </button>

          <button
            type="button"
            className={`${BTN_AI} gap-1`}
            style={{ color: '#6B3FA0' }}
            onClick={onLayoutSwap}
            title="Layout"
          >
            <LayoutGrid size={16} />
            <ChevronDown size={12} />
          </button>
        </>
      )}

      {/* ── Text formatting toolbar ────────────────────────────────── */}
      {mode === 'text-selected' && (
        <>
          {/* Font size controls */}
          <button
            type="button"
            className={BTN_HOVER}
            onClick={() => onFontSize?.(-1)}
            title="Decrease font size"
          >
            <Minus size={16} />
          </button>
          <span className="min-h-[44px] min-w-[32px] flex items-center justify-center text-sm font-medium text-slate-500 select-none tabular-nums">
            {currentFontSize ?? 16}
          </span>
          <button
            type="button"
            className={BTN_HOVER}
            onClick={() => onFontSize?.(1)}
            title="Increase font size"
          >
            <Plus size={16} />
          </button>

          <Divider />

          {/* Bold / Italic / Underline */}
          <button
            type="button"
            className={formattingState?.bold ? BTN_ACTIVE : BTN_HOVER}
            onClick={onBold}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className={formattingState?.italic ? BTN_ACTIVE : BTN_HOVER}
            onClick={onItalic}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            className={formattingState?.underline ? BTN_ACTIVE : BTN_HOVER}
            onClick={onUnderline}
            title="Underline"
          >
            <Underline size={16} />
          </button>

          <Divider />

          {/* Alignment */}
          <button
            type="button"
            className={BTN_HOVER}
            onClick={() => onAlign?.('left')}
            title="Align left"
          >
            <AlignLeft size={16} />
          </button>
          <button
            type="button"
            className={BTN_HOVER}
            onClick={() => onAlign?.('center')}
            title="Align center"
          >
            <AlignCenter size={16} />
          </button>
          <button
            type="button"
            className={BTN_HOVER}
            onClick={() => onAlign?.('right')}
            title="Align right"
          >
            <AlignRight size={16} />
          </button>

          <Divider />

          {/* AI actions */}
          <div className="relative">
            <button
              type="button"
              className={`${BTN_AI} gap-1 px-2`}
              style={{ color: '#6B3FA0' }}
              onClick={() => setShowAIMenu(!showAIMenu)}
              title="AI Actions"
            >
              <Sparkles size={16} />
              <span className="text-sm font-medium">AI</span>
              <ChevronDown size={12} />
            </button>

            {showAIMenu && (
              <div
                className="absolute top-full mt-1 right-0 bg-white rounded-lg border border-slate-200 py-1 min-w-[180px] z-50"
                style={{ boxShadow: '0 8px 32px rgba(15,23,42,0.12)' }}
              >
                {(['rewrite', 'summarize', 'expand', 'shorten'] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors capitalize"
                    onClick={() => { onAIAction?.(action); setShowAIMenu(false); }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Entrance animation + reduced motion */}
      <style>{`
        .animate-toolbar-in {
          animation: toolbarFadeIn 200ms ease-out;
        }
        @keyframes toolbarFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-toolbar-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
