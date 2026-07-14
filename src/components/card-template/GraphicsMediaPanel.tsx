'use client';

// ── Graphics editor — Media panel (approved redesign, 2026-06-26) ───────────
//
// The dark-glass Media panel for `/editor/asset` (graphics mode). Approved over
// ~10 rounds of design-table mocks (HANDOVER 2026-06-26). Distinct from the
// slides `RailMediaContent` (light, untouched) — this one is built against the
// graphics chrome tokens (`--theme-chrome-*`, `--gfx-accent`) so it reads as
// frosted glass over the violet canvas.
//
// Approved shape (top → bottom):
//   1. "Media" title + one-line description.
//   2. Option cards — Generate (far-left, AI accent) · Library (hover-expands to
//      a full-bleed visual) · Upload. The single-rail entry points.
//   3. Sticky toolbar — search field + a Categories button that opens a
//      tile-grid popover (the home IMAGE_CATEGORIES pattern, NOT chips).
//   4. Discoverable landing — "Recommended for this slide" (current-slide
//      context match) then a dense 3-column masonry with occasional 2-col-wide
//      tiles, varied crops via object-fit:cover, tiles expand on hover.
//   5. Generate accordion (reuses the shared image-gen module) — revealed when
//      the Generate card is opened; never competes with browsing.
//
// Rendering is windowed (lazy): the masonry renders a growing slice and an
// IntersectionObserver sentinel loads the next batch on scroll, so the panel
// never mounts 600+ <img> nodes at once. Every <img> is loading="lazy".
//
// HIG (GOVERNANCE.md §HIG): 4.5:1 contrast on the dark glass, ≥44px targets,
// visible focus rings, 200–300ms ease-out hovers, prefers-reduced-motion
// honored, Lucide icons with aria-labels, alt text on every image.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Upload as UploadIcon, Search, Plus, LayoutGrid, Check } from 'lucide-react';
import {
  fetchLibrary,
  libraryImageUrl,
  rankLibraryBySimilarity,
  categoryLabel,
  type LibraryImageMeta,
} from '../image-gen/library';
import { ImageGenAccordion } from '../image-gen/ImageGenAccordion';

const ALL = '__all__';

/** Render window: how many masonry tiles to mount initially, and how many more
 *  each time the bottom sentinel scrolls into view. Keeps the DOM small over a
 *  600+ image library. */
const PAGE = 30;

/** Curation order for the default "Trending" feed — the beautiful, broadly-
 *  useful PHOTO categories lead; decorative/abstract sets (which read as
 *  repetitive in bulk) trail. Categories not listed sort after these. Used only
 *  to ORDER the round-robin; nothing is hidden — every image is still reachable
 *  via search or the category filter. (Lisa 2026-06-27: trending must be a
 *  diverse, hand-feeling selection, not the raw metadata order.) */
const CURATION_PRIORITY: string[] = [
  // Prime: real photography, broadly useful
  'photographic', 'architecture', 'nature', 'nature-macro', 'ocean-water', 'sky-horizon',
  'business-team', 'modern-office', 'partnership-handshake', 'conference-event', 'remote-work',
  'people-portrait', 'finance-growth', 'data-analytics', 'technology', 'developer',
  'healthcare-medical', 'science-lab', 'education-learning', 'travel-destination', 'food-culinary',
  'real-estate-interior', 'manufacturing-industry', 'logistics-transport', 'retail-shopping',
  'renewable-energy', 'wellness-mindfulness', 'marketing-content', 'creative-design',
  // Trailing: textures / abstract / decorative
  'minimalist', 'minimal-texture', 'theme-photo', 'abstract', 'abstract-art', 'fluid',
  'glassmorphism', 'glass-centerpiece', 'glass-render', 'theme-bg', 'illustration', 'ribbons', 'pattern',
];
function curationRank(cat: string): number {
  const i = CURATION_PRIORITY.indexOf(cat);
  return i === -1 ? CURATION_PRIORITY.length : i;
}

/** Build a diverse default feed: round-robin across categories (in curation
 *  order) so no two adjacent tiles share a category, and the photo categories
 *  surface first. Diagrams are dropped (not "imagery"). The first screenful is
 *  therefore one strong image from each of the best categories — varied, not a
 *  run of near-duplicates. */
function buildTrending(items: LibraryImageMeta[]): LibraryImageMeta[] {
  const groups = new Map<string, LibraryImageMeta[]>();
  for (const it of items) {
    if (it.type === 'diagram') continue;
    const c = it.category || 'other';
    const arr = groups.get(c);
    if (arr) arr.push(it);
    else groups.set(c, [it]);
  }
  const cats = [...groups.keys()].sort((a, b) => curationRank(a) - curationRank(b));
  const out: LibraryImageMeta[] = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const c of cats) {
      const arr = groups.get(c)!;
      if (round < arr.length) {
        out.push(arr[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Probe a data-URL / src for its natural pixel size (upload path). */
function probeDims(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('probe failed'));
    img.src = src;
  });
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A deterministic crop aspect (w/h) per tile index — gives the masonry varied
 *  portrait/square/landscape rhythm even though the library is mostly uniform
 *  16:9. Wide (2-col) tiles get a cinematic crop. */
function cropAspect(index: number, wide: boolean): number {
  if (wide) return 1.6; // ~16:10 letterbox for the spanning tiles
  // portrait · square · 4:3 · 3:2, rotating
  return [0.74, 1, 1.34, 1.5][index % 4];
}

/** Every Nth tile spans two columns for an editorial, non-gridlike rhythm.
 *  Skips the very first tiles so the top of the grid stays tidy. */
function isWide(index: number): boolean {
  return index > 2 && index % 7 === 0;
}

// Masonry geometry — fixed reference column so we can convert each tile's crop
// aspect into a CSS grid row-span. The grid uses 1fr columns (so it flexes with
// the panel) but the span math only needs a representative width; small drift
// is invisible because the image covers its cell.
// Reference column width at the graphics Media panel's 400px (≈368px content,
// 3 cols, 8px gaps → ~117px). Keeps each tile's row-span aligned to its crop
// aspect so heights match the intended portrait/square/landscape rhythm.
const COL = 116;
const GAP = 8;
const ROW = 8;
function rowSpan(index: number, wide: boolean): number {
  const w = wide ? COL * 2 + GAP : COL;
  const h = w / cropAspect(index, wide);
  return Math.max(1, Math.round((h + GAP) / (ROW + GAP)));
}

/** Palette for the two editors. `dark` = the graphics dark-glass chrome;
 *  `light` = the slides editor's light chrome (white/glass surfaces, violet
 *  #6B3FA0 accent). Every color in the panel rides a `--gmp-*` variable so the
 *  same markup + GMP_CSS renders both. */
type Scheme = 'dark' | 'light';

function schemeVars(scheme: Scheme): React.CSSProperties {
  if (scheme === 'light') {
    return {
      '--gmp-fg': '#0f172a',
      '--gmp-muted': '#64748b',
      '--gmp-faint': '#94a3b8',
      '--gmp-surface': 'rgba(255,255,255,0.8)',
      '--gmp-surface-hover': '#f1f5f9',
      '--gmp-border': '#e2e8f0',
      '--gmp-border-strong': '#cbd5e1',
      '--gmp-accent': '#6B3FA0',
      '--gmp-accent-soft': 'rgba(107,63,160,0.1)',
      '--gmp-accent-border': 'rgba(107,63,160,0.35)',
      '--gmp-pop-bg': 'rgba(255,255,255,0.97)',
      '--gmp-bar-bg': 'rgba(255,255,255,0.9)',
      '--gmp-shadow': 'rgba(15,23,42,0.18)',
      '--gmp-err-fg': '#b91c1c',
      '--gmp-err-bg': 'rgba(220,38,38,0.07)',
      '--gmp-err-border': 'rgba(220,38,38,0.2)',
    } as React.CSSProperties;
  }
  return {
    '--gmp-fg': '#f1f5f9',
    '--gmp-muted': 'rgba(241,245,249,0.58)',
    '--gmp-faint': 'rgba(241,245,249,0.4)',
    '--gmp-surface': 'rgba(255,255,255,0.04)',
    '--gmp-surface-hover': 'rgba(255,255,255,0.08)',
    '--gmp-border': 'rgba(148,163,184,0.12)',
    '--gmp-border-strong': 'rgba(148,163,184,0.3)',
    '--gmp-accent': '#8B7CF6',
    '--gmp-accent-soft': 'rgba(139,124,246,0.16)',
    '--gmp-accent-border': 'rgba(139,124,246,0.4)',
    '--gmp-pop-bg': 'rgba(28,28,32,0.96)',
    '--gmp-bar-bg': 'var(--theme-chrome-bg, rgba(22,22,24,0.85))',
    '--gmp-shadow': 'rgba(0,0,0,0.45)',
    '--gmp-err-fg': '#fda4af',
    '--gmp-err-bg': 'rgba(244,63,94,0.12)',
    '--gmp-err-border': 'rgba(244,63,94,0.25)',
  } as React.CSSProperties;
}

interface GraphicsMediaPanelProps {
  onInsertImage: (src: string, alt?: string, naturalDims?: { width: number; height: number }) => void;
  /** Editor palette — defaults to the graphics dark glass. Slides passes 'light'. */
  scheme?: Scheme;
  slideContext?: {
    slideHeading?: string;
    slideBody?: string;
    deckTitle?: string;
    themePalette?: string;
  };
}

export function GraphicsMediaPanel({ onInsertImage, scheme = 'dark', slideContext }: GraphicsMediaPanelProps) {
  const [items, setItems] = useState<LibraryImageMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [catOpen, setCatOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const catBtnRef = useRef<HTMLButtonElement>(null);
  const reduce = prefersReducedMotion();

  // Fetch the library index once (and again whenever a generation bumps the
  // version). The metadata is one JSON; the heavy part — the images — stay lazy
  // via loading="lazy" + the render window below.
  useEffect(() => {
    let active = true;
    void fetchLibrary().then((imgs) => {
      if (active) setItems(imgs);
    });
    return () => {
      active = false;
    };
  }, [libraryVersion]);

  // Context query for the "Recommended for this slide" band.
  const suggestQuery = useMemo(() => {
    return [slideContext?.slideHeading, slideContext?.deckTitle]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(' ')
      .trim();
  }, [slideContext?.slideHeading, slideContext?.deckTitle]);

  const recommended = useMemo(() => {
    if (!items || !suggestQuery) return [];
    return rankLibraryBySimilarity(items, suggestQuery).slice(0, 3);
  }, [items, suggestQuery]);

  // Distinct categories present, for the tile-grid popover. Each carries a
  // representative thumbnail (its first image) so the popover shows pictures,
  // not text chips.
  const categories = useMemo(() => {
    if (!items) return [];
    const firstOf = new Map<string, LibraryImageMeta>();
    for (const it of items) {
      if (it.category && !firstOf.has(it.category)) firstOf.set(it.category, it);
    }
    return [...firstOf.entries()]
      .map(([key, rep]) => ({ key, rep }))
      .sort((a, b) => categoryLabel(a.key).localeCompare(categoryLabel(b.key)));
  }, [items]);

  // The browse list — search text (over prompt) AND category compose.
  const browsed = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (activeCat !== ALL && i.category !== activeCat) return false;
      if (q && !i.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, activeCat]);

  // Default landing feed — a diverse, curated cross-category ordering (vs the
  // raw metadata order, which clustered near-duplicates). Built once per
  // library load.
  const trending = useMemo(() => (items ? buildTrending(items) : []), [items]);

  // The active feed: filtered results when searching/filtering, else the
  // diverse curated Trending order.
  const filtering = query.trim() !== '' || activeCat !== ALL;
  const feed = filtering ? browsed : trending;

  // Reset the render window when the filter changes (so a new filter starts at
  // the top, not deep into a stale window).
  useEffect(() => {
    setVisible(PAGE);
  }, [query, activeCat]);

  // Grow the render window when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + PAGE, feed.length));
        }
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed.length]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (!file.type.startsWith('image/')) {
        setUploadError('That file is not an image. Pick a PNG, JPG, SVG, or WebP.');
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        setUploadError('Image is over 4 MB. Compress it or use a smaller file.');
        return;
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error ?? new Error('read failed'));
          reader.readAsDataURL(file);
        });
        const alt = file.name.replace(/\.[a-z0-9]+$/i, '') || undefined;
        let dims: { width: number; height: number } | undefined;
        try {
          dims = await probeDims(dataUrl);
        } catch {
          /* non-fatal — insert at default size */
        }
        onInsertImage(dataUrl, alt, dims);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Could not read the file.');
      }
    },
    [onInsertImage],
  );

  const pickCategory = useCallback((key: string) => {
    setActiveCat(key);
    setCatOpen(false);
    catBtnRef.current?.focus();
  }, []);

  // Close the category popover on outside click / Escape.
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e: MouseEvent) => {
      const pop = document.getElementById('gmp-cat-popover');
      if (pop && !pop.contains(e.target as Node) && !catBtnRef.current?.contains(e.target as Node)) {
        setCatOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCatOpen(false);
        catBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [catOpen]);

  const window = feed.slice(0, visible);

  return (
    <div className="gmp-root" style={{ display: 'flex', flexDirection: 'column', gap: 14, ...schemeVars(scheme) }}>
      <style>{GMP_CSS}</style>

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650, letterSpacing: '-0.01em', color: 'var(--gmp-fg)' }}>
          Media
        </h2>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.4, color: 'var(--gmp-muted)' }}>
          Generate, browse, or upload imagery.
        </p>
      </div>

      {/* ── Option cards — Generate · Library · Upload ──────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {/* Generate (far-left, AI accent) */}
        <button
          type="button"
          className="gmp-optcard gmp-optcard--ai"
          aria-expanded={aiOpen}
          aria-label="Generate an image with AI"
          onClick={() => setAiOpen((v) => !v)}
        >
          <span className="gmp-optcard-ic" aria-hidden="true">
            <Sparkles size={17} />
          </span>
          <span className="gmp-optcard-label">Generate</span>
        </button>

        {/* Library — hover-expands to a full-bleed visual. Scrolls focus to the
            browse grid (which is also the default landing). */}
        <button
          type="button"
          className="gmp-optcard gmp-optcard--lib"
          aria-label="Browse the image library"
          onClick={() => {
            setActiveCat(ALL);
            setQuery('');
            document.getElementById('gmp-browse')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          }}
        >
          {items && items[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="gmp-optcard-bleed"
              src={libraryImageUrl(items[0].filename)}
              alt=""
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <span className="gmp-optcard-ic" aria-hidden="true">
            <LayoutGrid size={17} />
          </span>
          <span className="gmp-optcard-label">Library</span>
        </button>

        {/* Upload */}
        <button
          type="button"
          className="gmp-optcard gmp-optcard--up"
          aria-label="Upload an image from your device"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="gmp-optcard-ic" aria-hidden="true">
            <UploadIcon size={17} />
          </span>
          <span className="gmp-optcard-label">Upload</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      </div>

      {uploadError && (
        <div role="alert" className="gmp-error">
          {uploadError}
        </div>
      )}

      {/* ── Generate accordion (revealed) ──────────────────────────────── */}
      {aiOpen && (
        <div className="gmp-genwrap">
          <ImageGenAccordion
            slideContext={
              slideContext
                ? {
                    ...(slideContext.slideHeading ? { slideHeading: slideContext.slideHeading } : {}),
                    ...(slideContext.deckTitle ? { deckTitle: slideContext.deckTitle } : {}),
                    ...(slideContext.themePalette ? { themePalette: slideContext.themePalette } : {}),
                  }
                : undefined
            }
            onUse={(r, dims) => onInsertImage(r.src, undefined, dims)}
            onGenerated={() => setLibraryVersion((v) => v + 1)}
          />
        </div>
      )}

      {/* ── Sticky toolbar — search + Categories popover trigger ────────── */}
      <div className="gmp-toolbar">
        <div className="gmp-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            aria-label="Search the image library"
            placeholder="Search images…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            ref={catBtnRef}
            type="button"
            className={`gmp-catbtn${activeCat !== ALL ? ' is-active' : ''}`}
            aria-haspopup="true"
            aria-expanded={catOpen}
            aria-label="Filter by category"
            onClick={() => setCatOpen((v) => !v)}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            <span>{activeCat === ALL ? 'Categories' : categoryLabel(activeCat)}</span>
          </button>

          {catOpen && (
            <div id="gmp-cat-popover" className="gmp-catpop" role="menu" aria-label="Categories">
              <div className="gmp-catpop-grid">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeCat === ALL}
                  className={`gmp-cattile gmp-cattile--all${activeCat === ALL ? ' is-sel' : ''}`}
                  onClick={() => pickCategory(ALL)}
                >
                  <span className="gmp-cattile-cap">All</span>
                  {activeCat === ALL && (
                    <span className="gmp-cattile-check" aria-hidden="true"><Check size={12} /></span>
                  )}
                </button>
                {categories.map(({ key, rep }) => {
                  const sel = activeCat === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sel}
                      className={`gmp-cattile${sel ? ' is-sel' : ''}`}
                      onClick={() => pickCategory(key)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="gmp-cattile-img"
                        src={libraryImageUrl(rep.filename)}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <span className="gmp-cattile-cap">{categoryLabel(key)}</span>
                      {sel && (
                        <span className="gmp-cattile-check" aria-hidden="true"><Check size={12} /></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Loading / empty ─────────────────────────────────────────────── */}
      {items === null && <p className="gmp-muted">Loading your library…</p>}
      {items !== null && items.length === 0 && (
        <p className="gmp-muted">Your library is empty. Generate an image and it will be saved here.</p>
      )}

      {items !== null && items.length > 0 && (
        <>
          {/* Recommended for this slide — only on the discoverable landing
              (no active search/category). */}
          {!filtering && recommended.length > 0 && (
            <div>
              <p className="gmp-sectlabel">
                <Sparkles size={12} aria-hidden="true" style={{ color: 'var(--gmp-accent)' }} /> Recommended for this slide
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {recommended.map((it) => (
                  <MediaTile
                    key={it.id}
                    item={it}
                    aspect="1 / 1"
                    reduce={reduce}
                    onSelect={() => onInsertImage(libraryImageUrl(it.filename), it.prompt, { width: it.width, height: it.height })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Browse / Results masonry */}
          <div id="gmp-browse">
            <p className="gmp-sectlabel">{filtering ? 'Results' : 'Trending'}</p>
            {window.length === 0 ? (
              <p className="gmp-muted">
                {query.trim() ? `No images match “${query.trim()}”.` : 'No images in this category yet.'}
              </p>
            ) : (
              <div
                className="gmp-masonry"
                style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: `${ROW}px`, gap: `${GAP}px` }}
              >
                {window.map((it, i) => {
                  const wide = isWide(i);
                  return (
                    <MediaTile
                      key={it.id}
                      item={it}
                      reduce={reduce}
                      gridStyle={{
                        gridColumn: wide ? 'span 2' : 'span 1',
                        gridRowEnd: `span ${rowSpan(i, wide)}`,
                      }}
                      onSelect={() => onInsertImage(libraryImageUrl(it.filename), it.prompt, { width: it.width, height: it.height })}
                    />
                  );
                })}
              </div>
            )}
            {/* sentinel for the render window */}
            {visible < feed.length && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />}
          </div>
        </>
      )}
    </div>
  );
}

// ── Masonry / recommended tile ─────────────────────────────────────────────
function MediaTile({
  item,
  aspect,
  gridStyle,
  reduce,
  onSelect,
}: {
  item: LibraryImageMeta;
  /** Fixed aspect for the recommended row; omit for masonry (height = grid span). */
  aspect?: string;
  gridStyle?: React.CSSProperties;
  reduce: boolean;
  onSelect: () => void;
}) {
  // Concise, prompt-free label. Library entries can carry very long generation
  // prompts (the MS-Designer-style ones); never surface them — as alt text a
  // missing file would render the entire prompt as a stretched broken-image box
  // (Lisa 2026-06-27). Use the category, else a generic label.
  const label = categoryLabel(item.category) || 'Library image';
  return (
    <div className={`gmp-tile${reduce ? ' is-reduce' : ''}`} style={gridStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={libraryImageUrl(item.filename)}
        alt={label}
        loading="lazy"
        style={aspect ? { aspectRatio: aspect } : undefined}
        // A missing file would otherwise render the alt as a stretched
        // broken-image box — drop the whole tile so the masonry stays clean.
        onError={(e) => {
          const tile = e.currentTarget.parentElement;
          if (tile) tile.style.display = 'none';
        }}
      />
      <button
        type="button"
        className="gmp-tile-add"
        aria-label="Add image to canvas"
        onClick={onSelect}
      >
        <Plus size={13} aria-hidden="true" />
        Add
      </button>
    </div>
  );
}

// ── Scoped styles ───────────────────────────────────────────────────────────
// Inline <style> keeps the dark-glass Media panel self-contained (hover/focus/
// sticky/reduced-motion are awkward as inline styles). All colors ride the
// graphics chrome tokens so a future theme swap (the queued 6-theme picker)
// retints this panel for free.
const GMP_CSS = `
.gmp-muted{ font-size:13px; color:var(--gmp-muted); margin:0; line-height:1.5; }
.gmp-sectlabel{ display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--gmp-muted); margin:0 0 10px; }

/* Option cards */
.gmp-optcard{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; min-height:64px; padding:10px 6px; border-radius:12px; border:1px solid var(--gmp-border); background:var(--gmp-surface); color:var(--gmp-fg); font-family:inherit; cursor:pointer; overflow:hidden; transition:transform .2s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease; }
.gmp-optcard:hover{ background:var(--gmp-surface-hover); border-color:var(--gmp-border-strong); transform:translateY(-1px); }
.gmp-optcard:focus-visible{ outline:none; box-shadow:0 0 0 2px var(--gmp-accent); }
.gmp-optcard-ic{ display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:var(--gmp-surface-hover); color:var(--gmp-fg); }
.gmp-optcard-label{ font-size:12.5px; font-weight:560; letter-spacing:-0.005em; }
.gmp-optcard--ai .gmp-optcard-ic{ background:linear-gradient(135deg, var(--gmp-accent), #60a5fa); color:#fff; }
.gmp-optcard--ai{ border-color:var(--gmp-accent-border); background:var(--gmp-accent-soft); }
.gmp-optcard--ai:hover{ background:var(--gmp-accent-soft); border-color:var(--gmp-accent); filter:brightness(1.06); }

/* Library card — image hidden until hover, then full-bleed */
.gmp-optcard--lib .gmp-optcard-bleed{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0; transform:scale(1.08); transition:opacity .25s ease, transform .35s ease; pointer-events:none; }
.gmp-optcard--lib:hover .gmp-optcard-bleed{ opacity:1; transform:scale(1); }
.gmp-optcard--lib:hover .gmp-optcard-ic{ background:rgba(15,23,42,0.5); backdrop-filter:blur(4px); color:#fff; }
.gmp-optcard--lib .gmp-optcard-ic, .gmp-optcard--lib .gmp-optcard-label{ position:relative; z-index:1; }
.gmp-optcard--lib:hover .gmp-optcard-label{ color:#fff; text-shadow:0 1px 6px rgba(0,0,0,0.6); }

.gmp-error{ font-size:12px; color:var(--gmp-err-fg); background:var(--gmp-err-bg); border:1px solid var(--gmp-err-border); padding:7px 10px; border-radius:8px; line-height:1.4; }
.gmp-genwrap{ border:1px solid var(--gmp-border); border-radius:12px; padding:12px; background:var(--gmp-surface); }

/* Sticky toolbar */
.gmp-toolbar{ position:sticky; top:-16px; z-index:5; display:flex; gap:8px; padding:8px 0; margin:0 0 -2px; background:var(--gmp-bar-bg); backdrop-filter:var(--chrome-blur,none); -webkit-backdrop-filter:var(--chrome-blur,none); }
.gmp-search{ flex:1 1 auto; min-width:0; display:flex; align-items:center; gap:8px; min-height:40px; padding:0 12px; border-radius:10px; border:1px solid var(--gmp-border); background:var(--gmp-surface); color:var(--gmp-muted); }
.gmp-search input{ flex:1; min-width:0; border:none; background:none; font:inherit; font-size:13.5px; color:var(--gmp-fg); outline:none; }
.gmp-search input::placeholder{ color:var(--gmp-faint); }
.gmp-search:focus-within{ border-color:var(--gmp-accent); box-shadow:0 0 0 1px var(--gmp-accent); }
.gmp-catbtn{ display:flex; align-items:center; gap:6px; min-height:40px; padding:0 12px; border-radius:10px; border:1px solid var(--gmp-border); background:var(--gmp-surface); color:var(--gmp-fg); font:inherit; font-size:13px; font-weight:550; cursor:pointer; white-space:nowrap; transition:background .16s ease, border-color .16s ease; }
.gmp-catbtn:hover{ background:var(--gmp-surface-hover); }
.gmp-catbtn:focus-visible{ outline:none; box-shadow:0 0 0 2px var(--gmp-accent); }
.gmp-catbtn.is-active{ border-color:var(--gmp-accent); background:var(--gmp-accent-soft); color:var(--gmp-accent); }

/* Category tile-grid popover */
.gmp-catpop{ position:absolute; top:calc(100% + 6px); right:0; z-index:1100; width:300px; max-height:340px; overflow-y:auto; padding:8px; border-radius:14px; border:1px solid var(--gmp-border); background:var(--gmp-pop-bg); backdrop-filter:saturate(1.4) blur(24px); -webkit-backdrop-filter:saturate(1.4) blur(24px); box-shadow:0 18px 48px var(--gmp-shadow); animation:gmp-pop .18s cubic-bezier(.34,1.56,.64,1); }
@keyframes gmp-pop{ from{ opacity:0; transform:translateY(-6px) scale(.97); } to{ opacity:1; transform:none; } }
.gmp-catpop-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
.gmp-cattile{ position:relative; display:block; padding:0; border:0; border-radius:10px; overflow:hidden; cursor:pointer; aspect-ratio:4/3; background:var(--gmp-surface); box-shadow:inset 0 0 0 1px var(--gmp-border); transition:box-shadow .16s ease, transform .16s ease; }
.gmp-cattile:hover{ transform:translateY(-1px); box-shadow:inset 0 0 0 1px var(--gmp-border-strong), 0 6px 16px var(--gmp-shadow); }
.gmp-cattile:focus-visible{ outline:none; box-shadow:0 0 0 2px var(--gmp-accent); }
.gmp-cattile-img{ width:100%; height:100%; object-fit:cover; display:block; }
.gmp-cattile-cap{ position:absolute; left:0; right:0; bottom:0; padding:14px 8px 6px; font-size:11.5px; font-weight:650; color:#fff; text-align:left; background:linear-gradient(to top, rgba(8,8,12,0.86) 0%, rgba(8,8,12,0.3) 60%, transparent 100%); }
.gmp-cattile--all{ display:grid; place-items:center; background:var(--gmp-accent-soft); }
.gmp-cattile--all .gmp-cattile-cap{ position:static; padding:0; background:none; font-size:13px; color:var(--gmp-accent); }
.gmp-cattile.is-sel{ box-shadow:inset 0 0 0 2px var(--gmp-accent); }
.gmp-cattile-check{ position:absolute; top:5px; right:5px; width:19px; height:19px; border-radius:50%; background:var(--gmp-accent); color:#fff; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 4px var(--gmp-shadow); }

/* Masonry + tiles */
.gmp-masonry{ display:grid; }
.gmp-tile{ position:relative; border-radius:10px; overflow:hidden; background:var(--gmp-surface); box-shadow:inset 0 0 0 1px var(--gmp-border); cursor:default; transition:transform .2s ease, box-shadow .2s ease, z-index 0s; }
.gmp-tile img{ width:100%; height:100%; object-fit:cover; display:block; }
.gmp-tile:hover{ transform:scale(1.03); box-shadow:inset 0 0 0 1px var(--gmp-accent), 0 10px 26px var(--gmp-shadow); z-index:2; }
.gmp-tile.is-reduce:hover{ transform:none; }
.gmp-tile-add{ position:absolute; right:6px; bottom:6px; display:inline-flex; align-items:center; gap:4px; min-height:28px; padding:0 10px; border:none; border-radius:8px; background:var(--gmp-accent); color:#fff; font:inherit; font-size:12.5px; font-weight:700; cursor:pointer; opacity:0; transform:translateY(4px); transition:opacity .18s ease, transform .18s ease; backdrop-filter:blur(4px); }
.gmp-tile:hover .gmp-tile-add, .gmp-tile-add:focus-visible{ opacity:1; transform:none; }
.gmp-tile-add:focus-visible{ outline:none; box-shadow:0 0 0 2px #fff; }

@media (prefers-reduced-motion: reduce){
  .gmp-optcard, .gmp-tile, .gmp-cattile, .gmp-optcard--lib .gmp-optcard-bleed{ transition:none; }
  .gmp-catpop{ animation:none; }
  .gmp-tile-add{ transition:opacity .12s linear; transform:none; }
}
`;
