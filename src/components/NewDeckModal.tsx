'use client';

/**
 * NewDeckModal — the tabbed new-deck dialog for /editor/slides, replacing the
 * old `?new=true` create-wizard entry. Designed in Figma (file
 * CxmUXLX76JZdbNk0IincVl) and approved by.
 *
 * Structure:
 *   • A dark scrim (semi-opacity) highlights the modal over whatever page
 *     it's opened on — home, studio, or the slides editor.
 *   • Two tabs: GENERATE (hosts the verbatim landing-page prompt card,
 *     GenerationPrompt — its own Images/Themes popovers + Generate handoff)
 *     and OPEN FROM LIBRARY (saved decks → opens ?deck=<id>).
 *
 * Opening is decoupled from the entry points via a window CustomEvent so the
 * +New CTAs (Sidebar, home Recents) just call `openNewDeckModal()` — the modal
 * is mounted once globally in the root layout.
 *
 * The Images slide-in panel + search bar from the Figma are a deliberate
 * follow-up.
 */

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, X, LayoutGrid } from 'lucide-react';
import GenerationPrompt from '@/components/home/GenerationPrompt';
import { getAllDecks, type StoredCardDeck } from '@/lib/cardDeckStorage';
import { NEW_DECK_OPEN_EVENT } from '@/lib/newDeckModal';

type Tab = 'generate' | 'library';

// Relative "updated" label — short, no dependency.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function deckCategory(deck: StoredCardDeck): string {
  // Mirrors the home Recent tiles' muted line: category · when. We only have a
  // loose category signal; fall back to "Deck".
  const c = (deck.template as { category?: string }).category;
  return (typeof c === 'string' && c.trim()) || 'Deck';
}

export default function NewDeckModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('generate');
  const [decks, setDecks] = useState<StoredCardDeck[]>([]);

  // Subscribe to the global open event.
  useEffect(() => {
    const onOpen = () => {
      setTab('generate');
      setOpen(true);
    };
    window.addEventListener(NEW_DECK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(NEW_DECK_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Auto-opened over the editor's empty "new" state (no deck loaded), closing
    // would leave a blank backdrop — send the user home instead. When a deck is
    // loaded behind the modal (?deck=…), just close and stay on it.
    try {
      const u = new URL(window.location.href);
      if (u.pathname.startsWith('/editor/slides') && !u.searchParams.has('deck')) {
        window.location.assign('/');
      }
    } catch {
      /* noop */
    }
  }, []);

  // Load saved decks when the Library tab is shown (cheap localStorage read).
  useEffect(() => {
    if (open && tab === 'library') setDecks(getAllDecks());
  }, [open, tab]);

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  const openDeck = (deckId: string) => {
    // Full navigation so the editor mounts fresh and hydrates ?deck on mount.
    window.location.assign(`/editor/slides?deck=${encodeURIComponent(deckId)}`);
  };

  const tabBtn = (id: Tab): React.CSSProperties => ({
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    padding: '0 2px 10px',
    marginRight: 28,
    fontSize: 15,
    fontFamily: 'inherit',
    fontWeight: tab === id ? 700 : 500,
    color: tab === id ? '#0f172a' : '#94a3b8',
    cursor: 'pointer',
    position: 'relative',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'rgba(11,18,32,0.40)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        animation: 'ndmFade 140ms ease-out',
      }}
    >
      <div
        style={{
          // Hug the content width so the (left-aligned, nowrap) intent sentence
          // — the widest row — drives the modal width. This makes the sentence's
          // right gap equal its left gap (symmetric 33px), and the Generate
          // button reflows inward as the modal narrows. Capped at 96vw; floored
          // so the toolbar never wraps on short prompts.
          width: 'max-content',
          maxWidth: 'min(1300px, 96vw)',
          minWidth: 'min(720px, 92vw)',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: '#ffffff', borderRadius: 16,
          boxShadow: '0 24px 70px -20px rgba(15,23,42,0.45), 0 2px 8px rgba(15,23,42,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Tabs + close */}
        <div
          style={{
            display: 'flex', alignItems: 'center',
            padding: '20px 24px 0', borderBottom: '1px solid #eef1f5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            {(['generate', 'library'] as Tab[]).map((id) => (
              <button
                key={id}
                type="button"
                style={tabBtn(id)}
                onClick={() => setTab(id)}
              >
                {id === 'generate' ? 'Generate' : 'Open from Library'}
                {tab === id && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5,
                      borderRadius: 2,
                      background: 'linear-gradient(135deg, #4776E6, #A855F7)',
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            style={{
              marginLeft: 'auto', marginBottom: 6,
              width: 30, height: 30, borderRadius: 8,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f1f5f9'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: tab === 'generate' ? 'hidden' : 'auto', padding: tab === 'generate' ? '8px 0 4px' : '20px 24px 24px' }}>
          {tab === 'generate' ? (
            // `.home-gen` re-applies the --hg-* token scope the prompt card needs.
            // The home class also carries a full-viewport min-height + frosted
            // panel chrome; strip it here via INLINE styles (always win over the
            // class, no CSS-HMR dependency) so there's no white hanging space.
            <div
              className="home-gen hg-in-modal"
              style={{
                // Even left/right; generous top/bottom so the card (and its
                // interactive intent sentence) isn't cramped against the edges.
                padding: '24px 28px 28px',
                minHeight: 0,
                margin: 0,
                background: 'transparent',
                border: 0,
                borderRadius: 0,
                boxShadow: 'none',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              }}
            >
              <GenerationPrompt />
            </div>
          ) : (
            <LibraryTab decks={decks} onOpen={openDeck} onGenerate={() => setTab('generate')} />
          )}
        </div>
      </div>

      <style>{`@keyframes ndmFade{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}

export function LibraryTab({
  decks, onOpen, onGenerate,
}: {
  decks: StoredCardDeck[];
  onOpen: (deckId: string) => void;
  onGenerate: () => void;
}) {
  if (decks.length === 0) {
    return (
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, padding: '54px 24px', textAlign: 'center',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 48, height: 48, borderRadius: 14,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: '#f1f5f9', color: '#94a3b8',
          }}
        >
          <LayoutGrid size={22} />
        </span>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>No saved decks yet</div>
        <div style={{ fontSize: 13.5, color: '#64748b', maxWidth: 360 }}>
          Generate your first deck and it’ll show up here to reopen anytime.
        </div>
        <button
          type="button"
          onClick={onGenerate}
          style={{
            marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 11, border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            background: 'linear-gradient(135deg, #4776E6, #A855F7)',
          }}
        >
          <Sparkles size={15} /> Create
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {decks.map((d) => {
        const name = d.template.name?.trim() || 'Untitled deck';
        const slides = d.template.cards?.length ?? 0;
        return (
          <button
            key={d.deckId}
            type="button"
            onClick={() => onOpen(d.deckId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: '1px solid #e2e8f0', background: '#ffffff', fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = '#f8fafc';
              el.style.borderColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = '#ffffff';
              el.style.borderColor = '#e2e8f0';
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0, width: 44, height: 30, borderRadius: 7,
                background: 'linear-gradient(135deg, #eef2ff, #faf5ff)',
                border: '1px solid #eef1f5',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#94a3b8',
              }}
            >
              <LayoutGrid size={15} />
            </span>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontSize: 14, fontWeight: 600, color: '#0f172a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {name}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {deckCategory(d)} · {slides} {slides === 1 ? 'slide' : 'slides'} · {relativeTime(d.updatedAt)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
