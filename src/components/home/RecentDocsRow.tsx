'use client';

/**
 * RecentDocsRow — 5-column grid of recent doc tiles. Visual port of
 * `RecentDocsRow` from ComposeDesignSystem/ui_kits/compose_desktop/HomeParts.jsx.
 *
 * Each tile: tinted thumbnail (90px height, brand-color rgba background)
 * with file-text icon, then title + "category · when".
 *
 * Data shape matches the kit's RECENT array. Items are passed in via
 * prop so a future hookup can wire `getAllDecks() + getAllDocuments()`
 * from cardDeckStorage / documentStorage and feed real data; the kit's
 * 5 sample items remain the default for the first port pass.
 */

import Link from 'next/link';
import { Clock, FileText, Sparkles } from 'lucide-react';
import type { CardTemplate } from '@/types/card-template';

export interface RecentDoc {
  id: string;
  title: string;
  category: string;
  when: string;
  /** Brand color used for the thumbnail tint and icon color. */
  color: string;
  /** Optional click target. */
  href?: string;
  /** For decks: the stored template, so the tile can render the real cover slide. */
  deckTemplate?: CardTemplate;
}

const DEFAULT_RECENT: RecentDoc[] = [
  { id: 'r1', title: 'Q2 Strategy Deck', category: 'Presentation', when: '2h ago', color: '#6B3FA0' },
  { id: 'r2', title: 'Vendor NDA', category: 'Legal', when: '6h ago', color: '#401842' },
  { id: 'r3', title: 'Onboarding Guide', category: 'HR', when: 'Yesterday', color: '#FF5F00' },
  { id: 'r4', title: 'Product Brief', category: 'Business', when: '2d ago', color: '#6B3FA0' },
  { id: 'r5', title: 'Team OKRs Deck', category: 'Presentation', when: '3d ago', color: '#401842' },
];

interface RecentDocsRowProps {
  items?: RecentDoc[];
}

export default function RecentDocsRow({ items = DEFAULT_RECENT }: RecentDocsRowProps) {
  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Clock size={16} color="#94a3b8" />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155' }}>Recent documents</h2>
      </div>
      {items.length === 0 ? (
        <RecentsEmptyState />
      ) : (
        <div className="home-grid-recents" style={{ display: 'grid', gap: 14 }}>
          {items.map((d) => (
            <RecentTile key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Zero-state — shown when the user has no saved decks or documents yet.
 * Matches the existing tile aesthetic (white card, soft shadow, 10px
 * radius) but spans the full row instead of the 5-column grid. Uses an
 * inline SVG of three stacked document silhouettes in the brand palette
 * (purple + orange) at low opacity so the page reads as "your files
 * will appear here" rather than "you have nothing."
 */
function RecentsEmptyState() {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        padding: '28px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}
    >
      {/* Illustration — stacked doc silhouettes in brand tints */}
      <div
        aria-hidden="true"
        style={{
          width: 120,
          height: 88,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <svg viewBox="0 0 120 88" style={{ width: '100%', height: '100%' }}>
          {/* Back card — orange tint */}
          <g transform="translate(8, 14) rotate(-6 36 30)">
            <rect x="0" y="0" width="72" height="60" rx="6" fill="#FF5F00" opacity="0.10" />
            <rect x="0" y="0" width="72" height="60" rx="6" fill="none" stroke="#FF5F00" strokeWidth="0.75" opacity="0.30" />
            <rect x="10" y="14" width="38" height="3" rx="1.5" fill="#FF5F00" opacity="0.35" />
            <rect x="10" y="22" width="52" height="2" rx="1" fill="#FF5F00" opacity="0.25" />
            <rect x="10" y="28" width="44" height="2" rx="1" fill="#FF5F00" opacity="0.25" />
          </g>
          {/* Middle card — purple tint */}
          <g transform="translate(28, 8) rotate(2 36 30)">
            <rect x="0" y="0" width="72" height="60" rx="6" fill="#6B3FA0" opacity="0.12" />
            <rect x="0" y="0" width="72" height="60" rx="6" fill="none" stroke="#6B3FA0" strokeWidth="0.75" opacity="0.35" />
            <rect x="10" y="14" width="42" height="3" rx="1.5" fill="#6B3FA0" opacity="0.40" />
            <rect x="10" y="22" width="52" height="2" rx="1" fill="#6B3FA0" opacity="0.30" />
            <rect x="10" y="28" width="36" height="2" rx="1" fill="#6B3FA0" opacity="0.30" />
          </g>
          {/* Front card — solid white with file icon */}
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

      {/* Copy + CTA */}
      <div style={{ flex: 1, minWidth: 240 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#0f172a',
            marginBottom: 4,
          }}
        >
          No recent files yet
        </div>
        <div
          style={{
            fontSize: 14,
            color: '#64748b',
            marginBottom: 14,
          }}
        >
          Let&apos;s make your first one — your work will appear here as you go.
        </div>
        <Link
          href="/editor/slides?new=true"
          className="btn-create"
          aria-label="Create your first document"
          style={{ textDecoration: 'none', display: 'inline-flex' }}
        >
          <Sparkles size={16} color="#3B2856" />
          Create
          <span style={{ fontSize: 16, fontWeight: 500, color: '#3B2856', marginLeft: 2, lineHeight: 1 }}>+</span>
        </Link>
      </div>
    </div>
  );
}

function RecentTile({ doc }: { doc: RecentDoc }) {
  // The `${color}14` and `${color}99` patterns are the kit's appended-hex-
  // alpha trick — `14` is ~8% opacity, `99` is ~60%. Preserved verbatim
  // so the thumbnail tone matches the kit pixel-for-pixel.
  // Scaled down from the kit's original (90px thumb, 28 icon, 13/11 text)
  //
  // fold breathes better.
  const content = (
    <div
      className="home-card-hover"
      style={{
        minWidth: 0,
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          height: 64,
          background: `${doc.color}14`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FileText size={22} color={`${doc.color}99`} />
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: '#0f172a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {doc.title}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 2,
            fontSize: 10.5,
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span>{doc.category}</span>
          <span>·</span>
          <span>{doc.when}</span>
        </div>
      </div>
    </div>
  );

  if (doc.href) {
    return (
      <a href={doc.href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    );
  }
  return content;
}
