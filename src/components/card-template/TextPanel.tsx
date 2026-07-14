'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, List, ListOrdered } from 'lucide-react';
import FontBrowser from './FontBrowser';
import { panelChrome, tileHoverIn, tileHoverOut } from './panelChrome';

// ── Types ────────────────────────────────────────────────────────────────────

interface TextPanelProps {
  onInsertBlock: (blockType: string, preset?: Record<string, unknown>) => void;
  onAIWrite?: (prompt: string) => void;
  onSelectFont?: (fontFamily: string) => void;
  currentFont?: string;
}

// ── Text style presets ───────────────────────────────────────────────────────

interface TextStylePreset {
  id: string;
  label: string;
  blockType: string;
  preset: Record<string, unknown>;
  renderStyle: React.CSSProperties;
  accentBorder?: boolean;
}

const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: 'heading',
    label: 'Add a heading',
    blockType: 'heading',
    preset: { type: 'heading', level: 1, content: 'Heading' },
    renderStyle: {
      fontSize: '2.4rem',
      fontWeight: 900,
      lineHeight: 1.15,
      color: '#0f172a',
    },
  },
  {
    id: 'subheading',
    label: 'Add a subheading',
    blockType: 'heading',
    preset: { type: 'heading', level: 2, content: 'Subheading' },
    renderStyle: {
      fontSize: '1.1rem',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      lineHeight: 1.3,
      color: '#0f172a',
    },
  },
  {
    id: 'body',
    label: 'Add a body text',
    blockType: 'paragraph',
    preset: { type: 'paragraph', content: 'Body text goes here.' },
    renderStyle: {
      fontSize: '1.05rem',
      fontWeight: 400,
      lineHeight: 1.5,
      color: '#0f172a',
    },
  },
  {
    id: 'caption',
    label: 'Add a caption',
    blockType: 'paragraph',
    preset: { type: 'paragraph', content: 'Caption text' },
    renderStyle: {
      fontSize: '0.85rem',
      fontWeight: 400,
      lineHeight: 1.4,
      color: '#64748b',
    },
  },
  {
    id: 'quote',
    label: 'Add a quote',
    blockType: 'callout',
    preset: { type: 'callout', content: 'Quote text here.' },
    renderStyle: {
      fontSize: '1.1rem',
      fontWeight: 400,
      fontStyle: 'italic',
      lineHeight: 1.5,
      color: '#0f172a',
    },
    accentBorder: true,
  },
];

// ── List presets ─────────────────────────────────────────────────────────────

interface ListPreset {
  id: string;
  label: string;
  blockType: string;
  preset: Record<string, unknown>;
}

const LIST_PRESETS: ListPreset[] = [
  {
    id: 'bullet-list',
    label: 'Bullet list',
    blockType: 'bullet-list',
    preset: { type: 'bullet-list', items: ['Item 1', 'Item 2', 'Item 3'] },
  },
  {
    id: 'numbered-list',
    label: 'Numbered list',
    blockType: 'bullet-list',
    preset: { type: 'bullet-list', items: ['First item', 'Second item', 'Third item'] },
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function TextPanel({ onInsertBlock, onAIWrite, onSelectFont, currentFont }: TextPanelProps) {
  const [aiWriteOpen, setAiWriteOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when AI Write opens
  useEffect(() => {
    if (aiWriteOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [aiWriteOpen]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [aiPrompt]);

  const handleAISubmit = useCallback(() => {
    const trimmed = aiPrompt.trim();
    if (!trimmed || !onAIWrite) return;
    onAIWrite(trimmed);
    setAiPrompt('');
    setAiWriteOpen(false);
  }, [aiPrompt, onAIWrite]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Font browser */}
      {onSelectFont && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ ...panelChrome.label, marginBottom: 0 }}>Font</span>
          <FontBrowser onSelectFont={onSelectFont} currentFont={currentFont} />
        </div>
      )}

      {/* 2. Add a text box CTA — shared primary button (panelChrome). */}
      <button
        type="button"
        onClick={() => onInsertBlock('paragraph', { type: 'paragraph', content: 'New text' })}
        aria-label="Add a text box"
        style={panelChrome.btnPrimary}
      >
        Add a text box
      </button>

      {/* 3. AI Write button / inline form — shared secondary button. */}
      {!aiWriteOpen ? (
        <button
          type="button"
          onClick={() => setAiWriteOpen(true)}
          aria-label="AI write"
          style={panelChrome.btnSecondary}
        >
          <Sparkles size={16} />
          AI write
        </button>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          borderRadius: '12px',
          border: '1px solid rgba(107,63,160,0.2)',
          background: 'rgba(107,63,160,0.03)',
        }}>
          <textarea
            ref={textareaRef}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAISubmit();
              }
              if (e.key === 'Escape') {
                setAiWriteOpen(false);
                setAiPrompt('');
              }
            }}
            placeholder="What should the AI write?"
            rows={2}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid rgba(15,23,42,0.1)',
              background: 'white',
              fontSize: '16px',
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#0f172a',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setAiWriteOpen(false);
                setAiPrompt('');
              }}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '8px',
                border: '1px solid rgba(15,23,42,0.1)',
                background: 'white',
                color: '#64748b',
                fontSize: '16px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAISubmit}
              disabled={!aiPrompt.trim() || !onAIWrite}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                height: '44px',
                borderRadius: '8px',
                border: 'none',
                background: aiPrompt.trim() && onAIWrite
                  ? 'linear-gradient(135deg, #6B3FA0, #8B5FC0)'
                  : 'rgba(15,23,42,0.06)',
                color: aiPrompt.trim() && onAIWrite ? 'white' : '#94a3b8',
                fontSize: '16px',
                fontWeight: 600,
                cursor: aiPrompt.trim() && onAIWrite ? 'pointer' : 'default',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              <Sparkles size={14} />
              Generate
            </button>
          </div>
        </div>
      )}

      {/* 4. Default text styles — rendered at actual size */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ ...panelChrome.label, marginBottom: '8px' }}>
          Default text styles
        </span>
        {TEXT_STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onInsertBlock(preset.blockType, preset.preset)}
            title={preset.label}
            aria-label={preset.label}
            style={{
              display: 'block',
              width: '100%',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              minHeight: '44px',
              transition: 'border-color 200ms ease',
              fontFamily: 'Inter, system-ui, sans-serif',
              ...(preset.accentBorder
                ? { borderLeft: '3px solid #6B3FA0' }
                : {}),
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#a78bfa';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
            }}
          >
            <span style={{
              ...preset.renderStyle,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {preset.label}
            </span>
          </button>
        ))}
      </div>

      {/* 5. Lists — compact icon tiles (was full-width labeled rows). Per Lisa
          2026-06-14: less text + icon where self-explanatory (list glyphs);
          tile colors use theme vars so they read on dark chrome. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ ...panelChrome.label, marginBottom: 0 }}>Lists</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {LIST_PRESETS.map((preset) => {
            const Icon = /number/i.test(preset.label) ? ListOrdered : List;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onInsertBlock(preset.blockType, preset.preset)}
                title={preset.label}
                aria-label={`Insert ${preset.label}`}
                style={panelChrome.tile}
                onMouseEnter={tileHoverIn}
                onMouseLeave={tileHoverOut}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Reduced motion support */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0ms !important; }
        }
      `}</style>
    </div>
  );
}
