'use client';

/**
 * RecentDecks — the Recent grid from the approved prototype
 * (`app/public/design-table/home-generation/manager-v5.html`), rendered as
 * mini cover-slide tiles with Open / Present affordances on hover.
 *
 * Consumes the existing `RecentDoc` shape ({ id, title, category, when,
 * color, href }) already produced by the page's `loadRecents()` adapter.
 * Each tile renders a theme-tinted mini cover slide (eyebrow + title +
 * accent rule + foot), tinted from `doc.color`. Empty state mirrors the
 * tasteful zero-state from the prior RecentDocsRow.
 *
 * Visual rules live in the `.home-gen` scoped CSS in globals.css.
 */

import Link from 'next/link';
import { openNewDeckModal } from '@/lib/newDeckModal';
import { useLayoutEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { RecentDoc } from '@/components/home/RecentDocsRow';
import { SlideStage } from '@/components/card-template/SlideStage';

// SlideStage renders a fixed 960px-wide slide; scale it to the tile width.
const SLIDE_W = 960;

interface RecentDecksProps {
  items: RecentDoc[];
}

export default function RecentDecks({ items }: RecentDecksProps) {
  return (
    <section className="hg-section">
      <div className="hg-sectionhead">
        <h2>Recent</h2>
        <Link href="/studio">
          View all
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {items.length === 0 ? (
        <RecentsEmptyState />
      ) : (
        <div className="hg-grid">
          {items.map((d) => (
            <RecentTile key={d.id} doc={d} />
          ))}
        </div>
      )}
    </section>
  );
}

function RecentTile({ doc }: { doc: RecentDoc }) {
  // The mini cover-slide is tinted from the deck's brand color. The cover
  // tone (dark vs light) is picked from the category so presentations read
  // as deck covers and documents read as paper.
  const dark = doc.category === 'Presentation';
  // Real cover slide when this is a deck with at least one card; otherwise the
  // tinted synthetic cover (documents, or decks with no cards yet).
  const cover = doc.deckTemplate?.cards?.[0];

  // Measure the tile and scale the 960px slide to fit (CSS container units can't
  // feed a unitless scale(), so compute it here). useLayoutEffect = no flash.
  const thumbRef = useRef<HTMLDivElement>(null);
  const [coverScale, setCoverScale] = useState(0);
  useLayoutEffect(() => {
    if (!cover) return;
    const el = thumbRef.current;
    if (!el) return;
    const measure = () => setCoverScale(el.clientWidth / SLIDE_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cover]);
  // `${color}NN` appended-hex-alpha (kit convention): 14≈8%, 26≈15%, 99≈60%.
  const tile = (
    <article className="hg-tile">
      <div className="hg-thumb" ref={thumbRef}>
        {cover && doc.deckTemplate ? (
          <div
            className="hg-thumb-cover"
            aria-hidden="true"
            style={{ transform: `scale(${coverScale})`, visibility: coverScale ? 'visible' : 'hidden' }}
          >
            <SlideStage card={cover} theme={doc.deckTemplate.theme} width={960} height={540} />
          </div>
        ) : (
        <div
          className={`hg-slide${dark ? ' is-dark' : ''}`}
          style={
            dark
              ? {
                  background: `linear-gradient(150deg, ${doc.color} 0%, ${doc.color}CC 100%)`,
                }
              : { background: `${doc.color}10` }
          }
        >
          <div
            className="hg-accentbar"
            style={{ background: dark ? 'rgba(255,255,255,0.55)' : doc.color }}
          />
          <div
            className="s-eyebrow"
            style={{ color: dark ? 'rgba(255,255,255,0.72)' : `${doc.color}` }}
          >
            {doc.category}
          </div>
          <div
            className="s-title"
            style={{ color: dark ? '#F4F1FA' : '#0B1220' }}
          >
            {doc.title}
          </div>
          <div
            className="s-rule"
            style={{ background: dark ? 'rgba(255,255,255,0.5)' : doc.color }}
          />
          <div
            className="s-foot"
            style={{ color: dark ? 'rgba(255,255,255,0.6)' : '#94A3B8' }}
          >
            <span
              className="s-dot"
              style={{ background: dark ? 'rgba(255,255,255,0.7)' : doc.color }}
            />
            {doc.when}
          </div>
        </div>
        )}

        {/* Open / Present on hover */}
        <div className="hg-deck-actions">
          <Open href={doc.href} />
          <Present href={doc.href} />
        </div>
      </div>

      {/* No bold deck title here — the cover slide already shows it (and the
          stored name is the raw prompt). Keep just the muted recency line. */}
      <div className="hg-tilemeta">
        <div className="hg-tilesub">
          {doc.category} · {doc.when}
        </div>
      </div>
    </article>
  );

  return tile;
}

function Open({ href }: { href?: string }) {
  const inner = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
      Open
    </>
  );
  if (href) {
    return (
      <Link className="hg-deck-act primary" href={href} aria-label="Open">
        {inner}
      </Link>
    );
  }
  return (
    <button className="hg-deck-act primary" type="button" aria-label="Open">
      {inner}
    </button>
  );
}

function Present({ href }: { href?: string }) {
  // Append a present hint to the href so the editor can route to present
  // mode if/when it reads it; harmless today (extra query param ignored).
  const presentHref = href ? `${href}${href.includes('?') ? '&' : '?'}present=1` : undefined;
  const inner = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="6 4 20 12 6 20" />
      </svg>
      Present
    </>
  );
  if (presentHref) {
    return (
      <Link className="hg-deck-act" href={presentHref} aria-label="Present">
        {inner}
      </Link>
    );
  }
  return (
    <button className="hg-deck-act" type="button" aria-label="Present">
      {inner}
    </button>
  );
}

/**
 * Zero-state — adapted from the prior RecentDocsRow empty state. Shown when
 * the user has no saved decks or documents yet.
 */
function RecentsEmptyState() {
  return (
    <div className="hg-empty">
      <div className="hg-empty-art" aria-hidden="true">
        <svg viewBox="0 0 120 88" style={{ width: '100%', height: '100%' }}>
          <g transform="translate(8, 14) rotate(-6 36 30)">
            <rect x="0" y="0" width="72" height="60" rx="6" fill="#FF5F00" opacity="0.10" />
            <rect x="0" y="0" width="72" height="60" rx="6" fill="none" stroke="#FF5F00" strokeWidth="0.75" opacity="0.30" />
            <rect x="10" y="14" width="38" height="3" rx="1.5" fill="#FF5F00" opacity="0.35" />
            <rect x="10" y="22" width="52" height="2" rx="1" fill="#FF5F00" opacity="0.25" />
            <rect x="10" y="28" width="44" height="2" rx="1" fill="#FF5F00" opacity="0.25" />
          </g>
          <g transform="translate(28, 8) rotate(2 36 30)">
            <rect x="0" y="0" width="72" height="60" rx="6" fill="#6B3FA0" opacity="0.12" />
            <rect x="0" y="0" width="72" height="60" rx="6" fill="none" stroke="#6B3FA0" strokeWidth="0.75" opacity="0.35" />
            <rect x="10" y="14" width="42" height="3" rx="1.5" fill="#6B3FA0" opacity="0.40" />
            <rect x="10" y="22" width="52" height="2" rx="1" fill="#6B3FA0" opacity="0.30" />
            <rect x="10" y="28" width="36" height="2" rx="1" fill="#6B3FA0" opacity="0.30" />
          </g>
          <g transform="translate(40, 18)">
            <rect x="0" y="0" width="72" height="60" rx="6" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1" />
            <g transform="translate(26, 18)" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M0 0 h12 l4 4 v18 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-20 a2 2 0 0 1 2 -2 z" />
              <path d="M12 0 v4 h4" />
              <path d="M3 12 h10" />
              <path d="M3 16 h10" />
              <path d="M3 20 h7" />
            </g>
          </g>
        </svg>
      </div>

      <div className="hg-empty-copy">
        <div className="hg-empty-title">No recent files yet</div>
        <div className="hg-empty-sub">
          Let&apos;s make your first one — your work will appear here as you go.
        </div>
        {/* Matches the sidebar "+ New" button (same size + glassy purple color). */}
        <button
          type="button"
          onClick={openNewDeckModal}
          aria-label="Create your first presentation"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 44, padding: '0 22px', borderRadius: 11, textDecoration: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(135deg, #4776E6, #A855F7)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.28)',
            color: '#ffffff', fontSize: 15, fontWeight: 600,
            boxShadow: '0 6px 16px rgba(80,55,195,0.32), 0 1px 2px rgba(20,9,50,0.10)',
          }}
        >
          <Plus size={17} color="#ffffff" />
          New
        </button>
      </div>
    </div>
  );
}
