'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home,
  Type,
  LayoutGrid,
  Image as ImageIcon,
  Layers,
  X,
  Sparkles,
} from 'lucide-react';
import CategoryGrid from './CategoryGrid';
import CategoryDrillIn from './CategoryDrillIn';
import { ELEMENT_CATEGORIES } from './categories';
import type { ElementCategoryId, ElementsPanelCommonProps } from './types';

/**
 * Elements Panel — Desktop variant.
 * 56px icon rail (Home + categories) + 320px content panel.
 *
 *:
 *   - Home icon at TOP of rail (navigates to /).
 *   - When this panel is open, the editor route hides the main NavBar — only ONE left rail at a time.
 *   - Mockups category removed.
 *
 * Source: elements-panel-desktop.html + image-panel-f.html prototypes.
 */
export default function ElementsPanel({
  isOpen,
  onClose,
  onPickElement,
}: ElementsPanelCommonProps) {
  const router = useRouter();
  const [activeRail, setActiveRail] = useState<'text' | 'elements' | 'media' | 'layouts'>('elements');
  const [drillCategory, setDrillCategory] = useState<ElementCategoryId | null>(null);
  const [aiQuery, setAiQuery] = useState('');

  if (!isOpen) return null;

  const handleSelectCategory = (id: ElementCategoryId) => {
    setDrillCategory(id);
  };

  const handleBack = () => {
    setDrillCategory(null);
  };

  const railButtons: Array<{
    id: 'text' | 'elements' | 'media' | 'layouts';
    Icon: typeof Type;
    label: string;
  }> = [
    { id: 'text', Icon: Type, label: 'Text' },
    { id: 'elements', Icon: LayoutGrid, label: 'Elements' },
    { id: 'media', Icon: ImageIcon, label: 'Media' },
    { id: 'layouts', Icon: Layers, label: 'Layouts' },
  ];

  return (
    <>
      {/* Click-out backdrop (transparent, like other editor drawers) */}
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel + icon rail. Slide in from left. */}
      <div
        className="fixed left-0 top-0 bottom-0 z-40 flex shadow-xl animate-in slide-in-from-left duration-200"
        role="dialog"
        aria-label="Elements panel"
      >
        {/* Icon rail — 56px wide, Home at top */}
        <aside
          className="bg-white border-r border-slate-200 flex flex-col items-center py-3 gap-1"
          style={{ width: '56px' }}
        >
          {/* Home — first item, navigates to / */}
          <button
            type="button"
            onClick={() => router.push('/')}
            title="Home"
            aria-label="Home"
            className="flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px' }}
          >
            <Home style={{ width: '20px', height: '20px' }} />
          </button>
          {/* Subtle divider */}
          <div className="w-7 h-px bg-slate-200 my-1" aria-hidden />

          {railButtons.map((btn) => {
            const Icon = btn.Icon;
            const isActive = activeRail === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => {
                  setActiveRail(btn.id);
                  if (btn.id === 'elements') setDrillCategory(null);
                }}
                title={btn.label}
                aria-label={btn.label}
                aria-pressed={isActive}
                className={`flex items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                  isActive
                    ? 'bg-violet-50 text-violet-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
                style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px' }}
              >
                <Icon style={{ width: '20px', height: '20px' }} />
              </button>
            );
          })}
        </aside>

        {/* Content panel — 320px */}
        <section
          className="bg-white flex flex-col"
          style={{ width: '320px' }}
        >
          {drillCategory ? (
            <CategoryDrillIn
              categoryId={drillCategory}
              onBack={handleBack}
              onPickElement={onPickElement}
            />
          ) : (
            <BrowseView
              aiQuery={aiQuery}
              onAiQueryChange={setAiQuery}
              onSelectCategory={handleSelectCategory}
              onClose={onClose}
            />
          )}
        </section>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Browse view: AI prompt + Generate/Search + Recently Used + Category grid
// ─────────────────────────────────────────────────────────────────────────────

interface BrowseViewProps {
  aiQuery: string;
  onAiQueryChange: (q: string) => void;
  onSelectCategory: (id: ElementCategoryId) => void;
  onClose: () => void;
}

function BrowseView({
  aiQuery,
  onAiQueryChange,
  onSelectCategory,
  onClose,
}: BrowseViewProps) {
  const recentCategories = ELEMENT_CATEGORIES.slice(0, 5);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
        <h2 className="text-base font-semibold text-slate-900">Elements</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
          style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px' }}
        >
          <X style={{ width: '18px', height: '18px' }} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* AI prompt input */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-colors"
               style={{ padding: '10px 12px' }}>
            <Sparkles className="text-violet-600 flex-shrink-0" style={{ width: '16px', height: '16px' }} aria-hidden />
            <input
              type="text"
              value={aiQuery}
              onChange={(e) => onAiQueryChange(e.target.value)}
              placeholder="Describe your ideal element"
              aria-label="Describe your ideal element"
              className="flex-1 bg-transparent text-base text-slate-900 placeholder-slate-400 outline-none border-none"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-4 pt-3">
          <button
            type="button"
            disabled={!aiQuery.trim()}
            className="flex-1 rounded-xl bg-white border border-slate-200 text-slate-700 text-base font-medium hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ minHeight: '44px' }}
          >
            Generate
          </button>
          <button
            type="button"
            disabled={!aiQuery.trim()}
            className="flex-1 rounded-xl text-white text-base font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ background: '#6B3FA0', minHeight: '44px' }}
          >
            Search
          </button>
        </div>

        {/* Recently used */}
        <div className="px-4 pt-5 pb-1">
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Recently used
          </span>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {recentCategories.map((cat) => {
            const Icon = cat.Icon;
            return (
              <button
                key={`recent-${cat.id}`}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                title={cat.label}
                aria-label={`Recently used: ${cat.label}`}
                className="flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex-shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px' }}
              >
                <Icon style={{ width: '18px', height: '18px' }} />
              </button>
            );
          })}
        </div>

        {/* Browse categories */}
        <div className="px-4 pt-3 pb-1">
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Browse categories
          </span>
        </div>
        <div className="px-4 pb-5">
          <CategoryGrid onSelect={onSelectCategory} variant="desktop" />
        </div>
      </div>
    </>
  );
}
