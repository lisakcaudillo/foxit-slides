'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Search,
  Presentation,
  FileText,
  Upload,
  LayoutTemplate,
  Sparkles,
  Image as ImageLucide,
} from 'lucide-react';
import {
  FRAMEWORKS,
  CATEGORIES as FRAMEWORK_SUBCATEGORIES,
  type FrameworkCategory,
} from '@/data/frameworks';

// ── Artifact Type Definitions ────────────────────────────────────────────

interface ArtifactType {
  id: string;
  label: string;
  description: string;
  route: string;
  color: string;
  /** For Slides tiles only — used to drive the Business/Education/Personal sub-filter chips. */
  frameworkCategory?: FrameworkCategory;
  /** For Slides tiles only — number of cards in the framework, shown as a small badge. */
  cardCount?: number;
  /**
   * For Slides tiles only — the per-template sample prompt that the "Use"
   * hover action fires generation against. Presence is the discriminator
   * for whether to show the Edit/Use hover buttons on this tile.
   */
  samplePrompt?: string;
  /**
   * Optional thumbnail URL (curated Unsplash / Pexels / local). When unset,
   * the tile falls back to a Lorem Picsum image seeded by the artifact id.
   */
  thumbnailUrl?: string;
}

interface Category {
  id: string;
  label: string;
  icon: typeof Presentation;
  color: string;
  types: ArtifactType[];
}

// Categories are organized strictly by artifact type. Each category maps 1:1
// to a creation surface (Slides → /editor/slides, Documents → /editor/documents,
// Images → /editor/graphics). Industry / use-case lives as filter chips
// inside a category (e.g. Business / Education / Personal under Slides),
// never as a top-level category.
//
// Slides tiles are derived from `FRAMEWORKS` in `data/frameworks.ts` so this
// modal and the in-editor framework picker stay in sync — single source of
// truth for slide templates. Add or rename a framework there and it shows up
// here automatically.

const SLIDE_TYPES: ArtifactType[] = FRAMEWORKS.map((fw) => ({
  id: fw.id,
  label: fw.name,
  description: fw.description,
  route: `/editor/slides?framework=${fw.id}`,
  color: '#6B3FA0',
  frameworkCategory: fw.category,
  cardCount: fw.steps.length,
  samplePrompt: fw.samplePrompt,
  thumbnailUrl: fw.thumbnailUrl,
}));

const CATEGORIES: Category[] = [
  {
    id: 'slides',
    label: 'Slides',
    icon: Presentation,
    color: '#6B3FA0',
    types: SLIDE_TYPES,
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    color: '#FF5F00',
    types: [
      { id: 'report', label: 'Report', description: 'Structured analysis document', route: '/editor/documents?type=report', color: '#F97316' },
      { id: 'proposal', label: 'Proposal', description: 'Business or project proposal', route: '/editor/documents?type=proposal', color: '#EA580C' },
      { id: 'executive-brief', label: 'Executive Brief', description: 'Concise leadership summary', route: '/editor/documents?type=brief', color: '#DC2626' },
      { id: 'memo', label: 'Memo', description: 'Internal communication', route: '/editor/documents?type=memo', color: '#F59E0B' },
      // Legal documents — folded in here since they're a flavor of Document,
      // not a separate artifact type.
      { id: 'nda', label: 'NDA', description: 'Non-disclosure agreement', route: '/editor/documents?type=nda', color: '#0284C7' },
      { id: 'contract', label: 'Contract', description: 'Service or vendor agreement', route: '/editor/documents?type=contract', color: '#0369A1' },
      { id: 'terms', label: 'Terms of Service', description: 'Platform terms and conditions', route: '/editor/documents?type=terms', color: '#075985' },
    ],
  },
  {
    id: 'images',
    label: 'Graphics',
    icon: ImageLucide,
    color: '#6B3FA0',
    types: [
      { id: 'illustration', label: 'Illustration', description: 'AI-generated illustration', route: '/editor/graphics', color: '#6B3FA0' },
      { id: 'cover-image', label: 'Cover image', description: 'Hero or section banner', route: '/editor/graphics', color: '#7C3AED' },
      { id: 'icon', label: 'Icon', description: 'Single object on a background', route: '/editor/graphics', color: '#8B5CF6' },
    ],
  },
];

// ── Create Modal Component ───────────────────────────────────────────────

export default function CreateModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState('slides');
  // Sub-filter chips inside Slides category (Business / Education / Personal).
  // 'all' shows every framework. Chip row is hidden for non-slides categories.
  const [slidesSubFilter, setSlidesSubFilter] = useState<'all' | FrameworkCategory>('all');
  const [search, setSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const category = CATEGORIES.find((c) => c.id === activeCategory) || CATEGORIES[0];

  // Filter by search
  const allTypes = CATEGORIES.flatMap((c) => c.types.map((t) => ({ ...t, categoryId: c.id, categoryLabel: c.label })));
  const baseList = search.trim()
    ? allTypes.filter((t) => t.label.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
    : category.types;

  // Apply Slides sub-filter (Business / Education / Personal) when applicable.
  const filtered =
    !search.trim() && activeCategory === 'slides' && slidesSubFilter !== 'all'
      ? baseList.filter((t) => t.frameworkCategory === slidesSubFilter)
      : baseList;

  const handleSelect = (route: string) => {
    onClose();
    router.push(route);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'fadeIn 150ms ease-out' }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="fixed z-50 bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(900px, 90vw)',
          height: 'min(600px, 80vh)',
          animation: 'modalSlideUp 200ms ease-out',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>Create</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '400px', marginLeft: '24px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#94a3b8' }} />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="What would you like to create?"
                style={{
                  width: '100%', height: '40px', borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.08)', padding: '0 12px 0 40px',
                  fontSize: '0.95rem', color: '#0f172a', outline: 'none',
                  background: 'rgba(0,0,0,0.02)',
                }}
              />
            </div>
          </div>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '8px', border: 'none',
            background: 'transparent', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#94a3b8',
            marginLeft: '12px',
          }}>
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Category Sidebar */}
          <div style={{
            width: '200px', borderRight: '1px solid rgba(0,0,0,0.06)',
            padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px',
            flexShrink: 0,
          }}>
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id && !search.trim();
              return (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.id); setSearch(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: '10px', border: 'none',
                    background: isActive ? `${cat.color}0a` : 'transparent',
                    color: isActive ? cat.color : '#64748b',
                    cursor: 'pointer', fontSize: '0.925rem', fontWeight: isActive ? 600 : 400,
                    textAlign: 'left', width: '100%', transition: 'all 150ms ease',
                  }}
                >
                  <Icon style={{ width: '18px', height: '18px' }} />
                  {cat.label}
                </button>
              );
            })}

            <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '8px 12px' }} />

            {/* Quick actions */}
            <button
              onClick={() => handleSelect('/templates')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: 'transparent', color: '#64748b', cursor: 'pointer',
                fontSize: '0.925rem', textAlign: 'left', width: '100%',
              }}
            >
              <LayoutTemplate style={{ width: '18px', height: '18px' }} />
              From Template
            </button>
            <button
              onClick={() => handleSelect('/editor/documents?upload=true')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px', border: 'none',
                background: 'transparent', color: '#64748b', cursor: 'pointer',
                fontSize: '0.925rem', textAlign: 'left', width: '100%',
              }}
            >
              <Upload style={{ width: '18px', height: '18px' }} />
              Upload
            </button>
          </div>

          {/* Artifact Type Cards */}
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
            {search.trim() && (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '12px' }}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &quot;{search}&quot;
              </div>
            )}
            {!search.trim() && (
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>
                {category.label}
              </h3>
            )}

            {/* Slides sub-filter chips */}
            {!search.trim() && activeCategory === 'slides' && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {(['all', ...FRAMEWORK_SUBCATEGORIES.map((c) => c.id)] as ('all' | FrameworkCategory)[]).map((id) => {
                  const label =
                    id === 'all'
                      ? 'All'
                      : FRAMEWORK_SUBCATEGORIES.find((c) => c.id === id)?.label || id;
                  const active = slidesSubFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSlidesSubFilter(id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '8px',
                        border: active ? '1px solid #6B3FA0' : '1px solid rgba(0,0,0,0.08)',
                        background: active ? '#6B3FA0' : 'white',
                        color: active ? 'white' : '#475569',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              {filtered.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleSelect(type.route)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    padding: '16px', borderRadius: '14px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    background: 'white', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 200ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = type.color + '40';
                    e.currentTarget.style.boxShadow = `0 4px 16px ${type.color}15`;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Thumbnail — real photo when available, sparkle placeholder otherwise */}
                  <div style={{
                    position: 'relative', overflow: 'hidden',
                    width: '100%', aspectRatio: '4/3', borderRadius: '10px',
                    background: `linear-gradient(135deg, ${type.color}08, ${type.color}15)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${type.color}15`,
                  }}>
                    {/* Image always rendered — fallback to Picsum seed if no curated url. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={type.thumbnailUrl ?? `https://picsum.photos/seed/${type.id}/400/300`}
                      alt={type.label}
                      loading="lazy"
                      onError={(e) => {
                        // Hide a broken image so the sparkle backdrop shows.
                        e.currentTarget.style.display = 'none';
                      }}
                      style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <Sparkles style={{ position: 'relative', width: '24px', height: '24px', color: type.color, opacity: 0.5 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>{type.label}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>{type.description}</div>
                    {type.cardCount && (
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px', fontWeight: 500 }}>
                        {type.cardCount} cards
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CSS Animations */}
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes modalSlideUp { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }
          @media (prefers-reduced-motion: reduce) {
            @keyframes fadeIn { from { opacity: 1; } to { opacity: 1; } }
            @keyframes modalSlideUp { from { opacity: 1; transform: translate(-50%, -50%); } to { opacity: 1; transform: translate(-50%, -50%); } }
          }
        `}</style>
      </div>
    </>
  );
}
