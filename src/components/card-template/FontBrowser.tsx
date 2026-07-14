'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

// ── Font library ──────────────────────────────────────────────────────────
// Ordered by category (Sans Serif → Serif → Display → Mono → Handwritten)
// so a flat list still reads as grouped. Per Lisa 2026-05-22 — the previous
// FontBrowser had categories + search + always-open scroll list at 320px
// tall, which she flagged as cluttered. Now: collapsed dropdown trigger
// showing the current font in its own typeface, opens on click to a
// filterable list with each option rendered in its own face. Mirrors the
// font picker in Word/Pages.

interface FontEntry { name: string }

// Curated Google Fonts library (~190), ordered by category
// (Sans Serif → Serif → Display → Mono → Handwriting) so the flat list still
// reads as grouped. All are free (Open Font License / Apache 2.0) and load
// on demand via loadFont(). Each font's face is lazy-loaded only when its row
// scrolls into view (see FontOption) so opening the picker doesn't fire ~190
// requests at once.
const FONT_LIBRARY: FontEntry[] = [
  // ── Sans Serif ──────────────────────────────────────────────────────────
  { name: 'Inter' },
  { name: 'Plus Jakarta Sans' },
  { name: 'DM Sans' },
  { name: 'Sora' },
  { name: 'Outfit' },
  { name: 'Manrope' },
  { name: 'Poppins' },
  { name: 'Montserrat' },
  { name: 'Raleway' },
  { name: 'Nunito' },
  { name: 'Nunito Sans' },
  { name: 'Work Sans' },
  { name: 'Open Sans' },
  { name: 'Lato' },
  { name: 'Roboto' },
  { name: 'Noto Sans' },
  { name: 'Source Sans 3' },
  { name: 'Mulish' },
  { name: 'Rubik' },
  { name: 'Karla' },
  { name: 'Figtree' },
  { name: 'Onest' },
  { name: 'Hanken Grotesk' },
  { name: 'Albert Sans' },
  { name: 'Public Sans' },
  { name: 'Lexend' },
  { name: 'Lexend Deca' },
  { name: 'Be Vietnam Pro' },
  { name: 'Epilogue' },
  { name: 'Red Hat Display' },
  { name: 'Red Hat Text' },
  { name: 'Schibsted Grotesk' },
  { name: 'Space Grotesk' },
  { name: 'Archivo' },
  { name: 'Archivo Narrow' },
  { name: 'Barlow' },
  { name: 'Barlow Condensed' },
  { name: 'Barlow Semi Condensed' },
  { name: 'Cabin' },
  { name: 'Catamaran' },
  { name: 'Chivo' },
  { name: 'Dosis' },
  { name: 'Exo 2' },
  { name: 'Fira Sans' },
  { name: 'Heebo' },
  { name: 'IBM Plex Sans' },
  { name: 'Josefin Sans' },
  { name: 'Jost' },
  { name: 'Kanit' },
  { name: 'Libre Franklin' },
  { name: 'Maven Pro' },
  { name: 'Mukta' },
  { name: 'Overpass' },
  { name: 'Oxygen' },
  { name: 'PT Sans' },
  { name: 'Quicksand' },
  { name: 'Saira' },
  { name: 'Saira Condensed' },
  { name: 'Signika' },
  { name: 'Titillium Web' },
  { name: 'Ubuntu' },
  { name: 'Urbanist' },
  { name: 'Varela Round' },
  { name: 'Asap' },
  { name: 'Assistant' },
  { name: 'Comfortaa' },
  { name: 'M PLUS Rounded 1c' },
  { name: 'Spline Sans' },
  { name: 'Sarabun' },
  { name: 'Prompt' },
  { name: 'Wix Madefor Display' },
  { name: 'Wix Madefor Text' },
  { name: 'Instrument Sans' },
  { name: 'Familjen Grotesk' },
  { name: 'Bricolage Grotesque' },
  { name: 'Syne' },
  { name: 'Gantari' },
  { name: 'Tajawal' },
  { name: 'Hind' },
  { name: 'Sen' },
  { name: 'Antonio' },
  // ── Serif ───────────────────────────────────────────────────────────────
  { name: 'Playfair Display' },
  { name: 'Lora' },
  { name: 'Merriweather' },
  { name: 'Source Serif 4' },
  { name: 'Libre Baskerville' },
  { name: 'PT Serif' },
  { name: 'Noto Serif' },
  { name: 'Bitter' },
  { name: 'Crimson Text' },
  { name: 'Crimson Pro' },
  { name: 'EB Garamond' },
  { name: 'Cormorant' },
  { name: 'Cormorant Garamond' },
  { name: 'Spectral' },
  { name: 'Domine' },
  { name: 'Vollkorn' },
  { name: 'Zilla Slab' },
  { name: 'Slabo 27px' },
  { name: 'Frank Ruhl Libre' },
  { name: 'Cardo' },
  { name: 'Alegreya' },
  { name: 'Alegreya Sans' },
  { name: 'Bodoni Moda' },
  { name: 'Fraunces' },
  { name: 'Newsreader' },
  { name: 'Petrona' },
  { name: 'Besley' },
  { name: 'Gelasio' },
  { name: 'Literata' },
  { name: 'Rozha One' },
  { name: 'Marcellus' },
  { name: 'Lustria' },
  { name: 'DM Serif Display' },
  { name: 'DM Serif Text' },
  { name: 'Old Standard TT' },
  { name: 'Tinos' },
  { name: 'Aleo' },
  { name: 'Arvo' },
  { name: 'Roboto Slab' },
  { name: 'Bree Serif' },
  { name: 'Josefin Slab' },
  { name: 'Sorts Mill Goudy' },
  { name: 'Instrument Serif' },
  { name: 'Young Serif' },
  { name: 'Cinzel' },
  { name: 'Marcellus SC' },
  { name: 'Noto Serif Display' },
  // ── Display ─────────────────────────────────────────────────────────────
  { name: 'Bebas Neue' },
  { name: 'Oswald' },
  { name: 'Anton' },
  { name: 'Archivo Black' },
  { name: 'Abril Fatface' },
  { name: 'Righteous' },
  { name: 'Lobster' },
  { name: 'Lobster Two' },
  { name: 'Alfa Slab One' },
  { name: 'Bungee' },
  { name: 'Fjalla One' },
  { name: 'Passion One' },
  { name: 'Staatliches' },
  { name: 'Teko' },
  { name: 'Yeseva One' },
  { name: 'Ultra' },
  { name: 'Bangers' },
  { name: 'Black Ops One' },
  { name: 'Monoton' },
  { name: 'Russo One' },
  { name: 'Secular One' },
  { name: 'Shrikhand' },
  { name: 'Patua One' },
  { name: 'Concert One' },
  { name: 'Bowlby One' },
  { name: 'Titan One' },
  { name: 'Luckiest Guy' },
  { name: 'Fredoka' },
  { name: 'Baloo 2' },
  { name: 'Paytone One' },
  { name: 'Changa One' },
  { name: 'Sigmar One' },
  { name: 'Big Shoulders Display' },
  { name: 'Unbounded' },
  { name: 'Chango' },
  // ── Monospace ───────────────────────────────────────────────────────────
  { name: 'JetBrains Mono' },
  { name: 'Fira Code' },
  { name: 'IBM Plex Mono' },
  { name: 'Roboto Mono' },
  { name: 'Source Code Pro' },
  { name: 'Space Mono' },
  { name: 'Inconsolata' },
  { name: 'Ubuntu Mono' },
  { name: 'DM Mono' },
  { name: 'PT Mono' },
  { name: 'Overpass Mono' },
  { name: 'Red Hat Mono' },
  { name: 'Martian Mono' },
  { name: 'Spline Sans Mono' },
  { name: 'Noto Sans Mono' },
  { name: 'Cousine' },
  // ── Handwriting / Script ────────────────────────────────────────────────
  { name: 'Caveat' },
  { name: 'Dancing Script' },
  { name: 'Pacifico' },
  { name: 'Satisfy' },
  { name: 'Great Vibes' },
  { name: 'Sacramento' },
  { name: 'Shadows Into Light' },
  { name: 'Indie Flower' },
  { name: 'Permanent Marker' },
  { name: 'Kalam' },
  { name: 'Patrick Hand' },
  { name: 'Amatic SC' },
  { name: 'Architects Daughter' },
  { name: 'Gloria Hallelujah' },
  { name: 'Cookie' },
  { name: 'Allura' },
  { name: 'Tangerine' },
  { name: 'Parisienne' },
  { name: 'Pinyon Script' },
  { name: 'Yellowtail' },
  { name: 'Courgette' },
  { name: 'Handlee' },
  { name: 'Gochi Hand' },
  { name: 'Reenie Beanie' },
  { name: 'Rock Salt' },
  { name: 'Covered By Your Grace' },
  { name: 'Mansalva' },
  { name: 'Bad Script' },
  { name: 'Marck Script' },
];

const loadedFonts = new Set<string>();

function loadFont(name: string): void {
  if (loadedFonts.has(name)) return;
  loadedFonts.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // Load regular + the weights real text uses (semibold/bold) so a selected
  // font renders bold faithfully on canvas instead of a synthesized bold.
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

// A single font row. Loads its own typeface the first time it scrolls into
// view (IntersectionObserver) so a long list only fetches the faces actually
// seen, then renders its name in that face.
interface FontOptionProps {
  name: string;
  isActive: boolean;
  onSelect: (name: string) => void;
}

function FontOption({ name, isActive, onSelect }: FontOptionProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadFont(name);
          io.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [name]);

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(name)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '10px 12px',
        border: 'none',
        borderRadius: '8px',
        background: isActive ? 'rgba(107,63,160,0.08)' : 'transparent',
        color: 'var(--theme-chrome-fg)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'var(--theme-chrome-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }
      }}
    >
      <span
        style={{
          fontFamily: `'${name}', system-ui, sans-serif`,
          fontSize: '15px',
          fontWeight: isActive ? 600 : 500,
          color: isActive ? '#6B3FA0' : 'var(--theme-chrome-fg)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      {isActive && (
        <Check size={14} style={{ color: '#6B3FA0', flexShrink: 0, marginLeft: '8px' }} />
      )}
    </button>
  );
}

interface FontBrowserProps {
  onSelectFont: (fontFamily: string) => void;
  currentFont?: string;
}

export default function FontBrowser({ onSelectFont, currentFont }: FontBrowserProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Trigger displays the current font rendered in that font. Preload it so
  // the rendered name doesn't flash from a fallback to the loaded face.
  useEffect(() => {
    if (currentFont) loadFont(currentFont);
  }, [currentFont]);

  // Each option lazy-loads its own typeface as it scrolls into view (see
  // FontOption), so opening the picker no longer fires ~190 requests at once.

  // Click-outside + Escape closes the dropdown. Reset the search filter on
  // close so reopening starts fresh.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset search whenever the dropdown closes — opening again should always
  // start at the unfiltered list.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Auto-focus the search input on open so the user can immediately type
  // to filter, mirroring Word/Pages behaviour.
  useEffect(() => {
    if (open) {
      // Defer to next tick so the input has mounted.
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = FONT_LIBRARY.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const displayName = currentFont ?? FONT_LIBRARY[0].name;

  const handleSelect = useCallback((name: string) => {
    onSelectFont(name);
    setOpen(false);
  }, [onSelectFont]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Font: ${displayName}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: '44px',
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid var(--theme-chrome-border)',
          background: 'var(--theme-chrome-bg-elevated)',
          color: 'var(--theme-chrome-fg)',
          cursor: 'pointer',
          fontFamily: 'Inter, system-ui, sans-serif',
          transition: 'border-color 160ms ease',
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = '#6B3FA0';
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-chrome-border)';
        }}
      >
        <span
          style={{
            fontFamily: `'${displayName}', system-ui, sans-serif`,
            fontSize: '15px',
            fontWeight: 500,
            color: 'var(--theme-chrome-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--theme-chrome-fg-subtle)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Fonts"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--theme-chrome-bg)',
            border: '1px solid var(--theme-chrome-border)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '320px',
            animation: 'fontDropdownIn 140ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <style>{`
            @keyframes fontDropdownIn {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              @keyframes fontDropdownIn {
                from { opacity: 0; }
                to   { opacity: 1; }
              }
            }
          `}</style>

          {/* Search filter — focused on open. Slim row, mirrors the input
              style in the trigger above so the dropdown reads as one
              continuous surface. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderBottom: '1px solid var(--theme-chrome-border)',
              flexShrink: 0,
            }}
          >
            <Search size={14} style={{ color: 'var(--theme-chrome-fg-subtle)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts…"
              aria-label="Search fonts"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '14px',
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--theme-chrome-fg)',
                minHeight: '0',
                padding: '4px 0',
              }}
            />
          </div>

          {/* Font list — each item rendered in its own typeface. The flat
              list preserves the implicit category grouping in FONT_LIBRARY
              (Sans → Serif → Display → Mono → Handwritten). */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {filtered.length === 0 && (
              <div
                style={{
                  padding: '20px 12px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'var(--theme-chrome-fg-subtle)',
                }}
              >
                No fonts match “{search}”
              </div>
            )}
            {filtered.map((font) => (
              <FontOption
                key={font.name}
                name={font.name}
                isActive={currentFont === font.name}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
