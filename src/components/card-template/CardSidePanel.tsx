'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Layers,
  Shapes,
  Type,
  Palette,
  Sparkles,
  X,
  Plus,
  Search,
} from 'lucide-react';
import type { Card, CardBlock, CardLayout, TemplateTheme } from '@/types/card-template';
import TextPanel from './TextPanel';
import BrandingPanel from './BrandingPanel';

// ── Types ────────────────────────────────────────────────────────────────────

export type PanelId = 'cards' | 'elements' | 'text' | 'branding' | 'ai';

interface CardSidePanelProps {
  activePanel: PanelId | null;
  onPanelChange: (panel: PanelId | null) => void;
  cards: Card[];
  activeCardIndex: number;
  onCardSelect: (index: number) => void;
  onAddCard: () => void;
  onInsertBlock: (blockType: string, preset?: Partial<CardBlock>) => void;
  onLayoutChange: (layout: string) => void;
  onAIGenerate: (prompt: string) => void;
  currentTheme?: TemplateTheme;
  onThemeChange?: (theme: TemplateTheme) => void;
  onFontChange?: (font: string) => void;
}

// ── Icon Rail Button ─────────────────────────────────────────────────────────

function RailButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rail-btn"
      style={{
        width: '44px',
        height: '44px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 150ms ease, color 150ms ease',
        background: isActive ? 'rgba(107,63,160,0.08)' : 'transparent',
        color: isActive ? '#6B3FA0' : '#64748b',
      }}
    >
      <Icon size={20} />
    </button>
  );
}

// ── Panel Header ─────────────────────────────────────────────────────────────

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 16px 12px',
      borderBottom: '1px solid rgba(15,23,42,0.06)',
    }}>
      <span style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close panel"
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '6px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          transition: 'background 150ms ease',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ── Cards Panel ──────────────────────────────────────────────────────────────

function CardsPanel({
  cards,
  activeCardIndex,
  onCardSelect,
  onAddCard,
}: {
  cards: Card[];
  activeCardIndex: number;
  onCardSelect: (index: number) => void;
  onAddCard: () => void;
}) {
  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {cards.map((card, i) => {
        const isActive = i === activeCardIndex;
        const blocks = card.columns[0]?.blocks || [];
        const title = blocks.find(b => b.type === 'heading');
        const titleText = title && title.type === 'heading' ? title.content : `Card ${i + 1}`;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onCardSelect(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: isActive ? '2px solid #6B3FA0' : '1px solid rgba(15,23,42,0.08)',
              background: isActive ? 'rgba(107,63,160,0.04)' : 'white',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'all 150ms ease',
              minHeight: '44px',
            }}
          >
            <div style={{
              width: '48px',
              height: '28px',
              borderRadius: '4px',
              background: card.style === 'dark'
                ? 'linear-gradient(135deg, #1a1a3e, #2a2a5a)'
                : '#f1f5f9',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: card.style === 'dark' ? '#fff' : '#6B3FA0',
              }}>
                {i + 1}
              </span>
            </div>
            <span style={{
              fontSize: '14px',
              fontWeight: isActive ? 600 : 400,
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {titleText}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAddCard}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '10px',
          borderRadius: '8px',
          border: '2px dashed rgba(15,23,42,0.1)',
          background: 'transparent',
          cursor: 'pointer',
          color: '#64748b',
          fontSize: '14px',
          fontWeight: 500,
          minHeight: '44px',
          transition: 'all 150ms ease',
        }}
      >
        <Plus size={14} />
        Add card
      </button>
    </div>
  );
}

// ── Elements Panel ───────────────────────────────────────────────────────────

interface ElementCategory {
  id: string;
  label: string;
  blockType: string;
  gradient: string;
  iconPath: string;
}

const ELEMENT_CATEGORIES: ElementCategory[] = [
  {
    id: 'icons',
    label: 'Icons',
    blockType: 'smart-layout',
    gradient: 'linear-gradient(135deg, #6B3FA0, #8B5FC0)',
    iconPath: 'M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z',
  },
  {
    id: 'ai-image',
    label: 'AI Image',
    blockType: 'image',
    gradient: 'linear-gradient(135deg, #6B3FA0, #818cf8)',
    iconPath: 'M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15M17 8L12 3L7 8M12 3V15',
  },
  {
    id: 'charts',
    label: 'Charts',
    blockType: 'smart-layout',
    gradient: 'linear-gradient(135deg, #401842, #6B3FA0)',
    iconPath: 'M18 20V10M12 20V4M6 20V14',
  },
  {
    id: 'shapes',
    label: 'Shapes',
    blockType: 'divider',
    gradient: 'linear-gradient(135deg, #FF5F00, #ff8c40)',
    iconPath: 'M12 2L22 8.5V15.5L12 22L2 15.5V8.5L12 2Z',
  },
  {
    id: 'mockups',
    label: 'Mockups',
    blockType: 'smart-layout',
    gradient: 'linear-gradient(135deg, #475569, #64748b)',
    iconPath: 'M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4ZM4 18H20V8H4V18Z',
  },
  {
    id: 'tables',
    label: 'Tables',
    blockType: 'grid-layout',
    gradient: 'linear-gradient(135deg, #FF5F00, #c2410c)',
    iconPath: 'M3 3H21V21H3V3ZM3 9H21M3 15H21M9 3V21M15 3V21',
  },
  {
    id: 'upload',
    label: 'Upload',
    blockType: 'image',
    gradient: 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
    iconPath: 'M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15M7 10L12 5L17 10M12 5V16',
  },
];

function ElementsPanel({
  onInsertBlock,
}: {
  onInsertBlock: (blockType: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* AI search input */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(15,23,42,0.1)',
        background: 'rgba(255,255,255,0.8)',
      }}>
        <Sparkles size={16} style={{ color: '#6B3FA0', flexShrink: 0 }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="What do you need?"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '14px',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#0f172a',
          }}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(107,63,160,0.3)',
            background: 'transparent',
            color: '#6B3FA0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            minHeight: '44px',
            transition: 'all 150ms ease',
          }}
        >
          <Sparkles size={14} />
          Generate
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #6B3FA0, #8B5FC0)',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
            minHeight: '44px',
            transition: 'all 150ms ease',
          }}
        >
          <Search size={14} />
          Search
        </button>
      </div>

      {/* Category grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
      }}>
        {ELEMENT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onInsertBlock(cat.blockType)}
            title={cat.label}
            aria-label={`Insert ${cat.label}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '16px 8px',
              borderRadius: '12px',
              border: 'none',
              background: cat.gradient,
              cursor: 'pointer',
              minHeight: '80px',
              minWidth: '0',
              transition: 'all 150ms ease',
              opacity: 0.92,
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={cat.iconPath} />
            </svg>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'white',
            }}>
              {cat.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Layouts Panel ────────────────────────────────────────────────────────────

const LAYOUT_OPTIONS: { id: CardLayout; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'split-left', label: 'Split Left' },
  { id: 'split-right', label: 'Split Right' },
  { id: 'three-col', label: 'Three Column' },
];

function LayoutWireframe({ layout }: { layout: CardLayout }) {
  const base: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16/9',
    borderRadius: '6px',
    display: 'flex',
    gap: '3px',
    padding: '4px',
    background: '#f8fafc',
    overflow: 'hidden',
  };
  switch (layout) {
    case 'single':
      return (
        <div style={base}>
          <div style={{ flex: 1, borderRadius: '3px', background: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '3px', padding: '6px' }}>
            <div style={{ height: '4px', width: '60%', borderRadius: '2px', background: '#94a3b8' }} />
            <div style={{ height: '3px', width: '80%', borderRadius: '2px', background: '#cbd5e1' }} />
            <div style={{ height: '3px', width: '50%', borderRadius: '2px', background: '#cbd5e1' }} />
          </div>
        </div>
      );
    case 'split-left':
      return (
        <div style={base}>
          <div style={{ flex: '0 0 40%', borderRadius: '3px', background: 'linear-gradient(135deg, #6B3FA0, #8B5FC0)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px' }}>
            <div style={{ height: '4px', width: '70%', borderRadius: '2px', background: '#94a3b8' }} />
            <div style={{ height: '3px', width: '90%', borderRadius: '2px', background: '#cbd5e1' }} />
          </div>
        </div>
      );
    case 'split-right':
      return (
        <div style={base}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px' }}>
            <div style={{ height: '4px', width: '70%', borderRadius: '2px', background: '#94a3b8' }} />
            <div style={{ height: '3px', width: '90%', borderRadius: '2px', background: '#cbd5e1' }} />
          </div>
          <div style={{ flex: '0 0 40%', borderRadius: '3px', background: 'linear-gradient(135deg, #6B3FA0, #8B5FC0)' }} />
        </div>
      );
    case 'three-col':
      return (
        <div style={base}>
          {[0, 1, 2].map((c) => (
            <div key={c} style={{ flex: 1, borderRadius: '3px', background: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
              <div style={{ height: '3px', width: '60%', borderRadius: '2px', background: '#94a3b8' }} />
              <div style={{ height: '2px', width: '80%', borderRadius: '2px', background: '#cbd5e1' }} />
            </div>
          ))}
        </div>
      );
  }
}

function LayoutsPanel({
  currentLayout,
  onLayoutChange,
}: {
  currentLayout: string;
  onLayoutChange: (layout: string) => void;
}) {
  return (
    <div style={{
      padding: '12px',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
    }}>
      {LAYOUT_OPTIONS.map((opt) => {
        const isActive = currentLayout === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onLayoutChange(opt.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '10px',
              borderRadius: '10px',
              border: isActive ? '2px solid #6B3FA0' : '1px solid rgba(15,23,42,0.06)',
              background: isActive ? 'rgba(107,63,160,0.04)' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <LayoutWireframe layout={opt.id} />
            <span style={{
              fontSize: '12px',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#6B3FA0' : '#475569',
              textAlign: 'center',
              width: '100%',
            }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── AI Panel ─────────────────────────────────────────────────────────────────

const AI_SUGGESTIONS = ['Add bullet points', 'Add metrics', 'Add comparison'];

function AIPanel({
  onAIGenerate,
}: {
  onAIGenerate: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onAIGenerate(trimmed);
    setPrompt('');
  }, [prompt, onAIGenerate]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [prompt]);

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Describe what to add..."
        rows={3}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid rgba(15,23,42,0.1)',
          background: 'rgba(255,255,255,0.8)',
          fontSize: '14px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#0f172a',
          resize: 'none',
          outline: 'none',
          lineHeight: 1.5,
        }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!prompt.trim()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '12px',
          borderRadius: '10px',
          border: 'none',
          background: prompt.trim()
            ? 'linear-gradient(135deg, #6B3FA0, #8B5FC0)'
            : 'rgba(15,23,42,0.06)',
          color: prompt.trim() ? 'white' : '#94a3b8',
          cursor: prompt.trim() ? 'pointer' : 'default',
          fontSize: '14px',
          fontWeight: 600,
          minHeight: '44px',
          transition: 'all 200ms ease',
        }}
      >
        <Sparkles size={16} />
        Generate
      </button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {AI_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onAIGenerate(s)}
            style={{
              padding: '6px 12px',
              borderRadius: '16px',
              border: '1px solid rgba(15,23,42,0.08)',
              background: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: '#475569',
              transition: 'all 150ms ease',
              whiteSpace: 'nowrap',
              minHeight: '44px',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Panel Items Lookup ───────────────────────────────────────────────────────

const PANEL_ITEMS: { id: PanelId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'cards', label: 'Slides', icon: Layers },
  { id: 'elements', label: 'Elements', icon: Shapes },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'ai', label: 'AI', icon: Sparkles },
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function CardSidePanel({
  activePanel,
  onPanelChange,
  cards,
  activeCardIndex,
  onCardSelect,
  onAddCard,
  onInsertBlock,
  onLayoutChange,
  onAIGenerate,
  currentTheme,
  onThemeChange,
  onFontChange,
}: CardSidePanelProps) {
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activePanel) {
        onPanelChange(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [activePanel, onPanelChange]);

  const panelOpen = activePanel !== null;
  const panelTitle = PANEL_ITEMS.find((p) => p.id === activePanel)?.label || '';

  // Get current card layout for layouts panel
  const currentCardLayout = cards[activeCardIndex]?.layout || 'single';

  return (
    <div style={{ display: 'flex', height: '100%', flexShrink: 0 }}>
      {/* Icon Rail */}
      <div
        style={{
          width: '56px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 6px',
          gap: '4px',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        {PANEL_ITEMS.map((item) => (
          <RailButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            isActive={activePanel === item.id}
            onClick={() => onPanelChange(activePanel === item.id ? null : item.id)}
          />
        ))}
      </div>

      {/* Panel Content */}
      <div
        style={{
          width: panelOpen ? '280px' : '0px',
          overflow: 'hidden',
          transition: 'width 250ms ease-out',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: panelOpen ? '1px solid rgba(15,23,42,0.06)' : 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {panelOpen && (
          <>
            <PanelHeader
              title={panelTitle}
              onClose={() => onPanelChange(null)}
            />
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              {activePanel === 'cards' && (
                <CardsPanel
                  cards={cards}
                  activeCardIndex={activeCardIndex}
                  onCardSelect={onCardSelect}
                  onAddCard={onAddCard}
                />
              )}
              {activePanel === 'elements' && (
                <ElementsPanel onInsertBlock={(t) => onInsertBlock(t)} />
              )}
              {activePanel === 'text' && (
                <TextPanel onInsertBlock={onInsertBlock} onSelectFont={onFontChange} currentFont={currentTheme?.headingFont} />
              )}
              {activePanel === 'branding' && currentTheme && onThemeChange && (
                <BrandingPanel currentTheme={currentTheme} onThemeChange={onThemeChange} />
              )}
              {activePanel === 'ai' && <AIPanel onAIGenerate={onAIGenerate} />}
            </div>
          </>
        )}
      </div>

      {/* Reduced motion support */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0ms !important; }
        }
        .rail-btn:hover {
          background: rgba(15,23,42,0.04) !important;
          color: #475569 !important;
        }
      `}</style>
    </div>
  );
}
