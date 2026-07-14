'use client';

/**
 * TemplatesGallery — client gallery for /studio/templates.
 *
 * Each template's thumbnail IS its title slide (the theme cover, rendered
 * flush via <ThemeCoverSlide>). Hovering reveals an "Open" affordance
 * (home-page pattern); clicking opens an expanded overlay showing the
 * template's mixed layouts via <ThemePreview> (cover + content + data) with
 * the existing sample text.
 *
 * NOTE: library images belong on interior SLIDES of future templates, not on
 * the thumbnail/cover — that work comes with the new template layouts.
 *
 * The overlay's "Open in editor" is the eventual hand-off. The slides editor
 * isn't rebranded yet, which is why the click opens this in-context preview
 * rather than routing straight in.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Search, ArrowRight, X } from 'lucide-react';
import { THEMES, CATEGORIES } from '@/components/themes/themes';
import { ThemePreview } from '@/components/themes/ThemePreview';
import { ThemeCoverSlide } from '@/components/themes/cover-forms';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import type { Theme } from '@/components/themes/types';

// Fonts the cover thumbnails need: every theme face + the title-treatment
// display/serif set (Source Serif 4, Fraunces, Playfair, Space Grotesk, Manrope).
const COVER_FONTS = [
  'Inter', 'Poppins', 'Open Sans', 'Montserrat', 'Work Sans', 'Lato',
  'Source Sans 3', 'Manrope', 'DM Sans', 'Space Grotesk', 'Plus Jakarta Sans',
  'Source Serif 4', 'Fraunces', 'Playfair Display',
];

export default function TemplatesGallery() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [selected, setSelected] = useState<Theme | null>(null);

  const filtered = THEMES.filter((t) => {
    if (category !== 'All' && t.category !== category.toLowerCase()) return false;
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="overflow-x-hidden">{/* MainContent owns the floating panel + scroll */}
      <GoogleFonts fonts={COVER_FONTS} />
      <div className="max-w-[1200px] mx-auto px-8 py-10 space-y-8">
        {/* Breadcrumb + header */}
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] text-gray-400 uppercase mb-1.5">
            <Link href="/studio" className="hover:text-violet-700 transition-colors">
              Studio
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-violet-700">Templates</span>
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
              <p className="text-sm text-gray-500 mt-1">
                Start from a designed template — a title slide, typography, and colors, ready to go.
              </p>
            </div>
            <span className="text-sm text-gray-400">
              {filtered.length} template{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Search + category chips */}
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates"
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Gallery */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <p className="text-lg font-medium text-gray-500 mb-1">
              No templates match “{search}”
            </p>
            <p className="text-sm text-gray-400">Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((t) => (
              <TemplateCard key={t.id} theme={t} onOpen={() => setSelected(t)} />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <TemplatePreviewOverlay theme={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/** Thumbnail = the template's title slide. Hover reveals "Open". */
function TemplateCard({ theme, onOpen }: { theme: Theme; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group block w-full text-left rounded-xl overflow-hidden bg-white border border-gray-200 hover:border-violet-200 hover:shadow-lg transition-all"
    >
      {/* Title slide */}
      <div className="relative">
        <ThemeCoverSlide theme={theme} />
        {/* Hover: "Open" */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/12 transition-colors">
          <span className="opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-white/95 text-gray-900 text-xs font-semibold shadow-md">
            Open
            <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-gray-100">
        <span className="text-[13px] font-medium text-gray-900">{theme.name}</span>
        <span className="text-[11px] text-gray-400">
          {theme.category}
          {theme.tone === 'dark' ? ' · dark' : ''}
        </span>
      </div>
    </button>
  );
}

/** Expanded preview — the layout previews you get on click, in context. */
function TemplatePreviewOverlay({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const node = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,11,26,0.42)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white"
        style={{
          width: 'min(620px, 100%)', maxHeight: 'calc(100vh - 48px)',
          borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(15,11,26,0.32), 0 4px 12px rgba(15,11,26,0.12)',
          animation: 'tpl-modal-in 260ms cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{theme.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {theme.category}
              {theme.tone === 'dark' ? ' · dark' : ''} · sample layouts
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-8 -mr-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Layout previews — cover (title slide) + content + data */}
        <div className="px-6 py-5 overflow-auto" style={{ background: '#fbfaff' }}>
          <ThemePreview theme={theme} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">These are sample layouts — your content fills in.</span>
          <Link
            href={`/editor/slides?new=true&theme=${theme.id}`}
            className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            Open in editor
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <style>{`
        @keyframes tpl-modal-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}
