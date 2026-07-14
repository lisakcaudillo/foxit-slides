'use client';

/**
 * Home — the slide-generation surface. Faithful port of the approved
 * prototype (`app/public/design-table/home-generation/manager-v5.html`).
 *
 * This surface is prompt + recents only: the greeting + gradient-
 * italic headline, a hero row (GenerationPrompt on the left, ShowcaseDeck
 * on the right), then RecentDecks below. CapabilityTiles and
 * QuickActionsGrid were removed from this surface.
 *
 * The real-data recents loader (merge getAllDecks() + getAllDocuments(),
 * sort by most-recently-edited, top 5) is preserved and fed to RecentDecks.
 */

import { useEffect, useState } from 'react';
import { migrateLegacyDocument, getAllDocuments, type StoredDocument } from '@/lib/documentStorage';
import { getAllDecks, type StoredCardDeck } from '@/lib/cardDeckStorage';
import type { RecentDoc } from '@/components/home/RecentDocsRow';
import GenerationPrompt from '@/components/home/GenerationPrompt';
import ShowcaseDeck, { LayoutGallery } from '@/components/home/ShowcaseDeck';
import RecentDecks from '@/components/home/RecentDecks';

type GreetingPart = 'morning' | 'afternoon' | 'evening';

function getTimeOfDay(date: Date = new Date()): GreetingPart {
  const h = date.getHours();
  if (h >= 5 && h <= 11) return 'morning';
  if (h >= 12 && h <= 17) return 'afternoon';
  return 'evening';
}

/** Relative-time formatter for the "Edited 2h ago" line on recent tiles. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} day${sec >= 172800 ? 's' : ''} ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: now - then > 31536000000 ? 'numeric' : undefined,
  });
}

// ── Real-data adapter for RecentDecks ────────────────────────────────────
const COLOR_DECK = '#6B3FA0';
const COLOR_DOC = '#FF5F00';

function deckToRecent(d: StoredCardDeck): RecentDoc {
  const name = d.template.name?.trim() || 'Untitled deck';
  return {
    id: `deck:${d.deckId}`,
    title: name,
    category: 'Presentation',
    when: formatRelative(d.updatedAt),
    color: COLOR_DECK,
    href: `/editor/slides?deck=${encodeURIComponent(d.deckId)}`,
    deckTemplate: d.template,
  };
}

function documentToRecent(d: StoredDocument): RecentDoc {
  const name = d.documentName?.trim() || 'Untitled document';
  return {
    id: `doc:${d.documentId}`,
    title: name,
    category: 'Document',
    when: formatRelative(d.updatedAt),
    color: COLOR_DOC,
    href: `/editor/documents?doc=${encodeURIComponent(d.documentId)}`,
  };
}

function loadRecents(): RecentDoc[] {
  const items: { row: RecentDoc; t: number }[] = [
    ...getAllDecks().map((d) => ({
      row: deckToRecent(d),
      t: new Date(d.updatedAt).getTime(),
    })),
    ...getAllDocuments().map((d) => ({
      row: documentToRecent(d),
      t: new Date(d.updatedAt).getTime(),
    })),
  ];
  return items
    .sort((a, b) => b.t - a.t)
    .slice(0, 4)
    .map((x) => x.row);
}

const GREETING_LABEL: Record<GreetingPart, string> = {
  morning: 'Good morning, ',
  afternoon: 'Good afternoon, ',
  evening: 'Good evening, ',
};

export default function WorkspaceHome() {
  const [timeOfDay, setTimeOfDay] = useState<GreetingPart>('morning');
  const [recents, setRecents] = useState<RecentDoc[]>([]);
  // Lifted here so the layout gallery can render full-width BELOW the hero,
  // not trapped inside the narrow showcase-deck column.
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    migrateLegacyDocument();
    setTimeOfDay(getTimeOfDay());
    setRecents(loadRecents());
  }, []);

  return (
    <div className="home-gen overflow-x-hidden">
      <div className="hg-content">
        {/* ① HERO — single column: greeting, headline, a small showcase-deck
            accent, then the prompt card. (Was a 2-col grid with a large deck on
            the right; collapsed so the card runs full width and Recent
            rises into view without scrolling.) */}
        <section className="hg-hero">
          {/* Top row: heading text on the left, a small tilted deck accent to
              its right (beside the headline — not between text and the card). */}
          <div className="hg-hero-top">
            <div className="hg-hero-intro">
              <div className="hg-greeting hg-rise">
                <span className="dot" />
                {GREETING_LABEL[timeOfDay]}
              </div>
              <h1 className="hg-display hg-rise d1">
                Start with a sentence.
                <br />
                We <span className="accent">design</span> the slides.
              </h1>
              <p className="hg-subhead hg-rise d2">
                Describe what you want to present. Foxit Slides drafts the structure,
                writes the slides, and designs every page.
              </p>
            </div>

            <div className="hg-hero-accent hg-rise d3">
              <ShowcaseDeck
                open={galleryOpen}
                onToggle={() => setGalleryOpen((o) => !o)}
              />
            </div>
          </div>

          {/* Prompt card — runs below the heading row, a bit longer. */}
          <div className="hg-prompt-wrap hg-rise d2">
            <GenerationPrompt />
          </div>
        </section>

        {/* Layout gallery — full content width, expands below the hero so it
            never collides with the deck column. Click-toggled from the deck. */}
        <LayoutGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} />

        {/* RECENT — real data, mini cover-slide tiles with Open/Present. */}
        <RecentDecks items={recents} />
      </div>
    </div>
  );
}
