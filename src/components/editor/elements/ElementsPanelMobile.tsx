'use client';

import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import CategoryGrid from './CategoryGrid';
import CategoryDrillIn from './CategoryDrillIn';
import type { ElementCategoryId, ElementsPanelCommonProps } from './types';

/**
 * Elements Panel — Mobile bottom sheet variant.
 * Full-width sheet with drag handle, AI prompt, Generate/Search buttons,
 * 3-column category grid, drill-in pattern.
 *
 * Source: elements-panel-mobile.html prototype.
 * Drop the panel below md breakpoint (768px). On md and above, use ElementsPanel.
 */
export default function ElementsPanelMobile({
  isOpen,
  onClose,
  onPickElement,
}: ElementsPanelCommonProps) {
  const [drillCategory, setDrillCategory] = useState<ElementCategoryId | null>(null);
  const [aiQuery, setAiQuery] = useState('');

  const handleSelectCategory = (id: ElementCategoryId) => {
    setDrillCategory(id);
  };

  const handleBack = () => {
    setDrillCategory(null);
  };

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/35 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden
      />

      {/* Bottom sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col motion-reduce:transition-none transition-transform duration-300 ease-out"
        style={{
          maxHeight: '75dvh',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Elements panel"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div
            className="rounded-full bg-slate-300"
            style={{ width: '36px', height: '4px' }}
            aria-hidden
          />
        </div>

        {/* Sheet header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900">
            {drillCategory ? '' : 'Elements'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
            style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px' }}
          >
            <X style={{ width: '22px', height: '22px' }} />
          </button>
        </div>

        {/* Sheet body */}
        <div className="flex-1 overflow-y-auto pb-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          {drillCategory ? (
            <CategoryDrillIn
              categoryId={drillCategory}
              onBack={handleBack}
              onPickElement={onPickElement}
            />
          ) : (
            <BrowseMobile
              aiQuery={aiQuery}
              onAiQueryChange={setAiQuery}
              onSelectCategory={handleSelectCategory}
            />
          )}
        </div>
      </div>
    </>
  );
}

interface BrowseMobileProps {
  aiQuery: string;
  onAiQueryChange: (q: string) => void;
  onSelectCategory: (id: ElementCategoryId) => void;
}

function BrowseMobile({ aiQuery, onAiQueryChange, onSelectCategory }: BrowseMobileProps) {
  return (
    <div className="px-5">
      {/* AI prompt */}
      <div className="relative mb-3">
        <span
          className="absolute left-4 top-1/2 -translate-y-1/2 text-violet-600 pointer-events-none"
          aria-hidden
        >
          <Sparkles style={{ width: '18px', height: '18px' }} />
        </span>
        <input
          type="text"
          value={aiQuery}
          onChange={(e) => onAiQueryChange(e.target.value)}
          placeholder="What do you need?"
          aria-label="AI element prompt"
          className="w-full rounded-xl border bg-slate-50 border-slate-200 text-base text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100 focus:outline-none transition-colors"
          style={{ minHeight: '48px', padding: '0 16px 0 44px' }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5 mb-6">
        <button
          type="button"
          disabled={!aiQuery.trim()}
          className="flex-1 rounded-xl bg-white border-2 border-violet-600 text-violet-700 text-base font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-400"
          style={{ minHeight: '44px' }}
        >
          <Sparkles style={{ width: '16px', height: '16px' }} />
          Generate
        </button>
        <button
          type="button"
          disabled={!aiQuery.trim()}
          className="flex-1 rounded-xl text-white text-base font-semibold border-2 border-violet-600 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-400"
          style={{ background: '#6B3FA0', minHeight: '44px' }}
        >
          Search
        </button>
      </div>

      {/* Browse */}
      <div className="text-base font-semibold text-slate-900 mb-3">Browse</div>
      <CategoryGrid onSelect={onSelectCategory} variant="mobile" />
    </div>
  );
}
