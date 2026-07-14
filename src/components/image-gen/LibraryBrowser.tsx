'use client';

// ── Shared image-generation engine — LibraryBrowser (Editorial Feed / D2) ──
//
// The approved media-panel direction (design table 2026-06-03, D2 "Editorial
// Feed", chosen by the PM over the Manager uniform-grid recommendation):
//
//   • SUGGESTED band (violet wash) — a large 16:10 HERO (the top-ranked match,
//     captioned with its category, a "drag onto slide" pill, violet border)
//     followed by a 3-up row of runner-ups. Ranked against the current
//     slide + deck (slideHeading + deckTitle), NOT the last AI prompt. Hidden
//     entirely when the query is empty or nothing overlaps.
//   • BROWSE — real category filter chips (from the `category` field) + a
//     2-column CSS masonry where every tile uses its REAL aspect ratio from
//     the metadata width/height, so heights vary authentically.
//   • Sticky AI footer — a quiet "Generate a new image with AI" button pinned
//     at the bottom, always reachable while scrolling (opt-in via onGenerateAI).
//
// Every thumbnail is draggable onto a slide (custom MIME payload carrying the
// src + natural dims) and carries a keyboard-reachable Add button (the a11y
// equivalent of drag, since native drag isn't keyboard-operable). Selecting a
// tile (Add or Enter) hands its src + dims back to the caller, which decides
// where to insert.

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, GripVertical, Sparkles } from 'lucide-react';
import {
  fetchLibrary,
  libraryImageUrl,
  rankLibraryBySimilarity,
  categoryLabel,
  type LibraryImageMeta,
} from './library';

const PURPLE = '#6B3FA0';
const INDIGO = '#818cf8';
const BLUE = '#60a5fa';

/** Custom drag MIME — keeps library-image drags distinct from the thumbnail
 *  reorder drag (which uses text/plain). Payload is JSON: { src, width,
 *  height, alt }. A drop target reads this to create a FreeformImageBlock at
 *  the correct aspect ratio. */
export const LIBRARY_IMAGE_DND_MIME = 'application/x-compose-library-image';

export interface LibrarySelection {
  src: string;
  width: number;
  height: number;
  alt?: string;
}

/** True when the user prefers reduced motion — used to drop the hover-lift
 *  + transition on thumbnails (state changes stay instant). SSR-safe. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface LibraryBrowserProps {
  /** Called when a library image is chosen via Add / keyboard. */
  onSelect: (item: LibrarySelection) => void;
  /** The last AI prompt — kept for back-compat; unused now that suggestions
   *  rank against the slide. Drives nothing when slide content is present. */
  lastPrompt?: string;
  /** Slide + deck text — drives the "Suggested for this slide" ranking.
   *  Back-compat: callers may pass this nested object OR the flat
   *  slideHeading / deckTitle props below (both are merged). */
  slideContext?: { slideHeading?: string; deckTitle?: string };
  /** Flat slide heading — preferred over slideContext.slideHeading. */
  slideHeading?: string;
  /** Flat deck title — preferred over slideContext.deckTitle. */
  deckTitle?: string;
  /** Opt-in: renders the sticky "Generate a new image with AI" footer and
   *  calls this when clicked. Omit it and the footer is not rendered (so a
   *  host that already surfaces its own AI generator — e.g. CardEditor's
   *  collapsible accordion — isn't duplicated). */
  onGenerateAI?: () => void;
}

/** Tokenize for the rationale chip — mirrors the ranker's tokenizer so the
 *  "why" surfaces the same words that drove the match. */
function topQueryTokens(query: string, max = 3): string[] {
  const STOP = new Set([
    'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'with', 'and', 'or',
    'from', 'at', 'by', 'is', 'that', 'this', 'it', 'as', 'be', 'are', 'your',
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of query.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (t.length <= 2 || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Compute a clamped aspect-ratio string from the image's natural dims so the
 *  masonry tile renders at its REAL proportions (not a hardcoded shape). The
 *  clamp keeps a pathological pano/strip from blowing out one column. Falls
 *  back to 4:3 when dims are missing. */
function aspectFor(item: LibraryImageMeta): string {
  const { width: w, height: h } = item;
  if (w > 0 && h > 0) {
    const ratio = Math.min(2, Math.max(0.5, w / h));
    return `${ratio} / 1`;
  }
  return '4 / 3';
}

/** Build a LibrarySelection from a library item. */
function selectionFor(item: LibraryImageMeta): LibrarySelection {
  return {
    src: libraryImageUrl(item.filename),
    width: item.width,
    height: item.height,
    alt: item.prompt,
  };
}

/** Set the drag payload on a library-image drag (custom MIME + a uri-list
 *  fallback). Shared by the hero, runner-ups, and masonry thumbs. */
function setDragPayload(e: React.DragEvent, sel: LibrarySelection) {
  try {
    e.dataTransfer.setData(LIBRARY_IMAGE_DND_MIME, JSON.stringify(sel));
    e.dataTransfer.setData('text/uri-list', sel.src);
    e.dataTransfer.effectAllowed = 'copy';
  } catch {
    /* ignore — drag still proceeds for browsers that block setData */
  }
}

/** A human caption for a tile: its category label, else a short prompt clip
 *  (with the `[prefix]` stripped). */
function captionFor(item: LibraryImageMeta): string {
  const label = categoryLabel(item.category);
  if (label) return label;
  const clean = item.prompt.replace(/^\s*\[[a-z0-9-]+\]\s*/i, '').trim();
  return clean.slice(0, 48) || 'Library image';
}

/** The big editorial hero — the single best match. 16:10, captioned, violet
 *  border, "drag onto slide" pill. Drag or click-to-Add. */
function Hero({
  item,
  onSelect,
}: {
  item: LibraryImageMeta;
  onSelect: (item: LibrarySelection) => void;
}) {
  const reduceMotion = prefersReducedMotion();
  const [hover, setHover] = useState(false);
  const sel = selectionFor(item);
  return (
    <div
      draggable
      role="group"
      aria-label={item.prompt || 'Top suggested image'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragStart={(e) => setDragPayload(e, sel)}
      style={{
        position: 'relative',
        borderRadius: 13,
        overflow: 'hidden',
        aspectRatio: '16 / 10',
        cursor: 'grab',
        border: `1.5px solid rgba(107,63,160,0.25)`,
        marginBottom: 9,
        background: '#f1f5f9',
        transform: hover && !reduceMotion ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 14px 34px rgba(64,40,86,0.24)' : 'none',
        transition: reduceMotion
          ? 'none'
          : 'transform 140ms ease, box-shadow 140ms ease',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sel.src}
        alt={item.prompt || 'Top suggested image'}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
      />

      {/* drag-onto-slide pill */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 9,
          right: 9,
          padding: '4px 9px',
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(15,23,42,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <GripVertical size={11} />
        drag onto slide
      </span>

      {/* caption — the image's category */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '24px 12px 9px',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          background: 'linear-gradient(transparent, rgba(15,23,42,0.7))',
          pointerEvents: 'none',
        }}
      >
        {captionFor(item)}
      </span>

      {/* keyboard-reachable Add */}
      <button
        type="button"
        onClick={() => onSelect(sel)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-label={`Add image to slide: ${(item.prompt || 'library image').slice(0, 80)}`}
        style={{
          position: 'absolute',
          right: 9,
          bottom: 9,
          minHeight: 30,
          padding: '0 12px',
          borderRadius: 9,
          border: 'none',
          background: hover ? PURPLE : 'rgba(15,23,42,0.55)',
          color: '#fff',
          font: 'inherit',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: hover ? 1 : 0,
          transition: 'opacity 140ms ease, background 140ms ease',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Plus size={13} aria-hidden="true" />
        Add
      </button>
    </div>
  );
}

/** A masonry / runner-up thumbnail. Renders at the image's REAL aspect ratio
 *  (or a fixed square for the runner-up row). Draggable + Add on hover. */
function Thumb({
  item,
  aspect,
  onSelect,
}: {
  item: LibraryImageMeta;
  /** CSS aspect-ratio string. Masonry passes the image's real ratio; the
   *  suggested runner-up row passes '1 / 1' for a tidy strip. */
  aspect: string;
  onSelect: (item: LibrarySelection) => void;
}) {
  const [hover, setHover] = useState(false);
  const reduceMotion = prefersReducedMotion();
  const sel = selectionFor(item);

  return (
    <div
      draggable
      role="group"
      aria-label={item.prompt || 'Library image'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragStart={(e) => setDragPayload(e, sel)}
      style={{
        position: 'relative',
        borderRadius: 11,
        overflow: 'hidden',
        border: `1.5px solid ${hover ? INDIGO : '#e2e8f0'}`,
        background: '#f1f5f9',
        cursor: 'grab',
        breakInside: 'avoid',
        marginBottom: 9,
        display: 'block',
        transform: hover && !reduceMotion ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 10px 26px rgba(64,40,86,0.20)' : 'none',
        transition: reduceMotion
          ? 'border-color 140ms ease'
          : 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sel.src}
        alt={item.prompt || 'Library image'}
        loading="lazy"
        style={{
          width: '100%',
          display: 'block',
          objectFit: 'cover',
          aspectRatio: aspect,
          pointerEvents: 'none',
        }}
      />

      {/* Drag grip — affordance only, appears on hover (progressive disclosure) */}
      {hover && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 22,
            height: 22,
            borderRadius: 7,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(15,23,42,0.55)',
            color: '#fff',
            backdropFilter: 'blur(4px)',
          }}
        >
          <GripVertical size={13} />
        </span>
      )}

      {/* Add button — keyboard-reachable equivalent of drag. Always in the
          DOM (focusable) but only visible on hover/focus to keep the resting
          panel calm. */}
      <button
        type="button"
        onClick={() => onSelect(sel)}
        aria-label={`Add image to slide: ${(item.prompt || 'library image').slice(0, 80)}`}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          minHeight: 28,
          padding: '0 10px',
          borderRadius: 8,
          border: 'none',
          background: hover ? PURPLE : 'rgba(15,23,42,0.5)',
          color: '#fff',
          font: 'inherit',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: hover ? 1 : 0,
          transition: 'opacity 140ms ease, background 140ms ease',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Plus size={13} aria-hidden="true" />
        Add
      </button>
    </div>
  );
}

const labelCss: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  margin: '0 0 11px',
};

const ALL = '__all__';

export function LibraryBrowser({
  onSelect,
  slideContext,
  slideHeading,
  deckTitle,
  onGenerateAI,
}: LibraryBrowserProps) {
  const [items, setItems] = useState<LibraryImageMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>(ALL);

  useEffect(() => {
    let active = true;
    void fetchLibrary().then((imgs) => {
      if (active) setItems(imgs);
    });
    return () => {
      active = false;
    };
  }, []);

  // Suggestion query: slide heading + deck title (the slide's content), NOT
  // the last AI prompt. Flat props win over the nested slideContext object;
  // both are merged so existing callers keep working.
  const suggestQuery = useMemo(() => {
    const parts = [
      slideHeading ?? slideContext?.slideHeading,
      deckTitle ?? slideContext?.deckTitle,
    ].filter((s): s is string => Boolean(s && s.trim()));
    return parts.join(' ').trim();
  }, [slideHeading, deckTitle, slideContext?.slideHeading, slideContext?.deckTitle]);

  const suggested = useMemo(() => {
    if (!items || !suggestQuery) return [];
    return rankLibraryBySimilarity(items, suggestQuery).slice(0, 4);
  }, [items, suggestQuery]);

  // Rationale: the 2–3 query tokens that actually overlap the top suggestion
  // (explain, don't just show). Falls back to the raw top tokens.
  const rationaleTokens = useMemo(() => {
    if (suggested.length === 0) return [];
    const top = new Set((suggested[0].prompt.toLowerCase().match(/[a-z0-9]+/g) ?? []));
    const q = topQueryTokens(suggestQuery, 5);
    const overlap = q.filter((t) => top.has(t));
    return (overlap.length ? overlap : q).slice(0, 3);
  }, [suggested, suggestQuery]);

  // Distinct categories present in the library (for the Browse filter chips),
  // sorted by their human label. Built from the real `category` field.
  const categories = useMemo(() => {
    if (!items) return [];
    const seen = new Set<string>();
    for (const it of items) if (it.category) seen.add(it.category);
    return [...seen].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [items]);

  // Reset the active chip if the selected category vanishes (e.g. library swap).
  useEffect(() => {
    if (activeCat !== ALL && !categories.includes(activeCat)) setActiveCat(ALL);
  }, [categories, activeCat]);

  // Browse list: search text filters by prompt; category chip filters by the
  // structured `category` field. Both compose.
  const browsed = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (activeCat !== ALL && i.category !== activeCat) return false;
      if (q && !i.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, activeCat]);

  if (items === null) {
    return <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Loading your library…</p>;
  }

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
        Your library is empty. Generate an image and it will be saved here for reuse.
      </p>
    );
  }

  // Suggested band only when there's a content match AND the user isn't
  // actively searching/filtering (then Browse is the focus).
  const showSuggested =
    suggested.length > 0 && !query.trim() && activeCat === ALL;
  const [hero, ...runners] = suggested;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Scroll region — Suggested band + Browse. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            padding: '0 12px',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.8)',
            marginBottom: 16,
          }}
        >
          <Search size={16} aria-hidden="true" color="#94a3b8" />
          <input
            type="search"
            value={query}
            aria-label="Search the image library"
            placeholder="Search images…"
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              font: 'inherit',
              fontSize: 14,
              color: '#0f172a',
              outline: 'none',
            }}
          />
        </div>

        {/* SUGGESTED — editorial hero + 3-up runner-up row, violet wash.
            Hidden entirely when nothing overlaps (no forced/empty section). */}
        {showSuggested && hero && (
          <div
            style={{
              marginBottom: 18,
              padding: '14px 14px 10px',
              borderRadius: 13,
              background: 'linear-gradient(180deg, rgba(107,63,160,0.07), transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <Sparkles size={14} aria-hidden="true" color={PURPLE} />
              <span style={{ fontSize: 14, fontWeight: 700, color: PURPLE }}>
                Suggested for this slide
              </span>
            </div>
            {rationaleTokens.length > 0 && (
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 13px' }}>
                Picked from your library to match {rationaleTokens.map((t) => `“${t}”`).join(' · ')}.
              </p>
            )}

            <Hero item={hero} onSelect={onSelect} />

            {runners.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {runners.map((item) => (
                  <Thumb key={item.id} item={item} aspect="1 / 1" onSelect={onSelect} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* BROWSE — category chips + real-aspect-ratio masonry, no count. */}
        <p style={labelCss}>{query.trim() ? 'Results' : 'Browse'}</p>

        {categories.length > 0 && (
          <div
            role="group"
            aria-label="Filter images by category"
            style={{
              display: 'flex',
              gap: 7,
              overflowX: 'auto',
              paddingBottom: 6,
              marginBottom: 13,
            }}
          >
            {[ALL, ...categories].map((cat) => {
              const active = activeCat === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCat(cat)}
                  aria-pressed={active}
                  style={{
                    flex: 'none',
                    font: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '6px 12px',
                    borderRadius: 9,
                    cursor: 'pointer',
                    border: active ? '1px solid transparent' : '1px solid #e2e8f0',
                    background: active ? 'rgba(107,63,160,0.12)' : 'rgba(255,255,255,0.7)',
                    color: active ? PURPLE : '#475569',
                  }}
                >
                  {cat === ALL ? 'All' : categoryLabel(cat)}
                </button>
              );
            })}
          </div>
        )}

        {browsed.length === 0 ? (
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            {query.trim() ? `No images match “${query.trim()}”.` : 'No images in this category yet.'}
          </p>
        ) : (
          <div style={{ columnCount: 2, columnGap: 9 }}>
            {browsed.map((item) => (
              <Thumb key={item.id} item={item} aspect={aspectFor(item)} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>

      {/* Sticky AI footer — quiet, always reachable. Opt-in: only renders when
          the host wires onGenerateAI (so a host with its own AI generator
          isn't duplicated). */}
      {onGenerateAI && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid rgba(148,163,184,0.2)',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <button
            type="button"
            onClick={onGenerateAI}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              minHeight: 44,
              borderRadius: 11,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 700,
              color: PURPLE,
              border: '1.5px solid rgba(107,63,160,0.3)',
              background: 'rgba(107,63,160,0.05)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${INDIGO}, ${BLUE})`,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
              }}
            >
              <Sparkles size={13} />
            </span>
            Generate a new image with AI
          </button>
        </div>
      )}
    </div>
  );
}
