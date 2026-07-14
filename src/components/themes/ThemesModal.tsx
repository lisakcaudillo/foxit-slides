'use client';

/**
 * Document Themes picker — modal launched from the Theme button in TopBar.
 * Twelve base themes; each defines typography, accents, page background,
 * button pair. Port of ui_kits/_shared/ThemesModal.jsx (lines 627–819).
 *
 * Inline styles are preserved byte-for-byte from the source. Visual design
 * is the product; do not refactor styling without explicit Designer review.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ThemeCard } from './ThemeCard';
import { ThemePreview } from './ThemePreview';
import { SELECTABLE_THEMES, getThemeById, DEFAULT_THEME_ID } from './themes';
import type { Theme } from './types';

interface ThemesModalProps {
  open: boolean;
  onClose: () => void;
  activeThemeId: string;
  onApply: (theme: Theme) => void;
  /** Which themes to offer. Defaults to the 3 mapped/selectable themes (used by
   *  the GENERATION pickers). The editor's RE-SKIN button passes the full THEMES
   *  set so a generated deck can be restyled with any theme (Lisa 2026-06-16). */
  themes?: ReadonlyArray<Theme>;
}

export function ThemesModal({ open, onClose, activeThemeId, onApply, themes = SELECTABLE_THEMES }: ThemesModalProps) {
  const [search, setSearch] = useState('');
  const [draftThemeId, setDraftThemeId] = useState<string>(activeThemeId || DEFAULT_THEME_ID);

  // Reset draft to active theme each time the modal opens
  useEffect(() => {
    if (open) setDraftThemeId(activeThemeId || DEFAULT_THEME_ID);
  }, [open, activeThemeId]);

  // Escape closes without applying
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const filtered = themes.filter(
    (t) => !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const draft = getThemeById(draftThemeId);

  const pickRandom = () => {
    const pool = filtered.length ? filtered : themes;
    const next = pool[Math.floor(Math.random() * pool.length)];
    setDraftThemeId(next.id);
  };

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 11, 26, 0.42)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1040px, 100%)', maxHeight: 'calc(100vh - 48px)',
          background: 'var(--theme-chrome-bg)',
          color: 'var(--theme-chrome-fg)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(15,11,26,0.32), 0 4px 12px rgba(15,11,26,0.12)',
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 480px) 1fr',
          overflow: 'hidden',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          animation: 'themes-modal-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        {/* LEFT — sticky preview pane */}
        <div style={{
          padding: '20px 20px 20px 24px',
          borderRight: '0.5px solid var(--theme-chrome-border)',
          background: 'var(--theme-chrome-bg-elevated)',
          display: 'flex', flexDirection: 'column', gap: 12,
          minHeight: 640,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--theme-chrome-fg)' }}>{draft.name}</div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ThemePreview theme={draft} />
          </div>
        </div>

        {/* RIGHT — header + controls + scrollable list + footer */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)',
          minHeight: 640,
        }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 0' }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 2px', color: 'var(--theme-chrome-fg)' }}>Themes</h2>
            <p style={{ fontSize: 12, color: 'var(--theme-chrome-fg-muted)', margin: 0, lineHeight: 1.5 }}>
              Typography, accents, page background, button pair.
            </p>
          </div>

          {/* Search + Random */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0' }}>
            <input
              type="text"
              placeholder="Search themes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1, height: 36, padding: '0 12px',
                fontSize: 13, fontFamily: 'inherit',
                background: 'var(--theme-chrome-bg-elevated)',
                border: '1px solid var(--theme-chrome-border)',
                borderRadius: 8,
                outline: 'none',
                color: 'var(--theme-chrome-fg)',
              }}
            />
            <button
              onClick={pickRandom}
              style={{
                width: 90, height: 36,
                fontSize: 13, fontWeight: 500,
                color: 'var(--theme-chrome-fg-muted)',
                background: 'var(--theme-chrome-bg-elevated)',
                border: '1px solid var(--theme-chrome-border)',
                borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Random</button>
          </div>

          {/* Scrollable list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '14px 24px 0', minHeight: 0 }}>
            {/* Theme grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: 8 }}>
              {filtered.map((t) => (
                <ThemeCard
                  key={t.id}
                  theme={t}
                  isSelected={t.id === draftThemeId}
                  onClick={() => setDraftThemeId(t.id)}
                />
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '24px 8px', textAlign: 'center', color: 'var(--theme-chrome-fg-subtle)', fontSize: 12 }}>
                  No themes match &quot;{search}&quot;.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 24px 16px',
            borderTop: '0.5px solid var(--theme-chrome-border)',
            background: 'var(--theme-chrome-bg)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'var(--theme-chrome-fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 50, background: 'var(--theme-chrome-fg-subtle)' }} />
              Brand kit not applied
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  height: 32, padding: '0 14px',
                  fontSize: 13, fontWeight: 500,
                  color: 'var(--theme-chrome-fg-muted)',
                  background: 'var(--theme-chrome-bg-elevated)',
                  border: '1px solid var(--theme-chrome-border)',
                  borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Cancel</button>
              <button
                onClick={() => { onApply(draft); onClose(); }}
                style={{
                  height: 32, padding: '0 14px',
                  fontSize: 13, fontWeight: 600, color: '#fff',
                  background: '#14223C', border: '1px solid #14223C', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Apply {draft.name}</button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes themes-modal-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
