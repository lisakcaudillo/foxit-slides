'use client';

import { useMemo, useState } from 'react';
import { Search, ChevronLeft, Sparkles, Upload as UploadIcon } from 'lucide-react';
import { getCategory, getCategoryItems } from './categories';
import type { ElementCategoryId } from './types';

interface CategoryDrillInProps {
  categoryId: ElementCategoryId;
  onBack: () => void;
  onPickElement?: (categoryId: ElementCategoryId, itemId: string) => void;
}

/**
 * Drill-in view for a single category.
 * - Standard categories (Icons, Charts, Shapes, Tables) show search + item grid
 * - AI Image shows a textarea + style pills + Generate
 * - Upload shows a dropzone affordance
 */
export default function CategoryDrillIn({
  categoryId,
  onBack,
  onPickElement,
}: CategoryDrillInProps) {
  const category = getCategory(categoryId);
  const allItems = useMemo(() => getCategoryItems(categoryId), [categoryId]);
  const [query, setQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [stylePill, setStylePill] = useState<'photo' | 'illustration' | 'icon' | 'diagram'>('photo');

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter((it) => it.label.toLowerCase().includes(q));
  }, [allItems, query]);

  if (!category) {
    return (
      <div className="p-4 text-base text-slate-500">Unknown category.</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to categories"
          className="flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
          style={{ width: '44px', height: '44px', minWidth: '44px', minHeight: '44px' }}
        >
          <ChevronLeft style={{ width: '20px', height: '20px' }} />
        </button>
        <h2 className="text-base font-semibold text-slate-900 flex-1">{category.label}</h2>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {categoryId === 'ai-image' ? (
          <AIImageDrillIn
            prompt={aiPrompt}
            onPromptChange={setAiPrompt}
            stylePill={stylePill}
            onStylePillChange={setStylePill}
            onGenerate={() => onPickElement?.(categoryId, `ai-${Date.now()}`)}
          />
        ) : categoryId === 'upload' ? (
          <UploadDrillIn onUpload={() => onPickElement?.(categoryId, `upload-${Date.now()}`)} />
        ) : (
          <SearchableGrid
            query={query}
            onQueryChange={setQuery}
            items={filtered}
            placeholder={`Search ${category.label.toLowerCase()}...`}
            onPick={(itemId) => onPickElement?.(categoryId, itemId)}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Searchable item grid — used by Icons, Charts, Shapes, Tables drill-ins
// ─────────────────────────────────────────────────────────────────────────────

interface SearchableGridProps {
  query: string;
  onQueryChange: (q: string) => void;
  items: ReturnType<typeof getCategoryItems>;
  placeholder: string;
  onPick: (itemId: string) => void;
}

function SearchableGrid({ query, onQueryChange, items, placeholder, onPick }: SearchableGridProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden
        >
          <Search style={{ width: '16px', height: '16px' }} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white text-base text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none transition-colors"
          style={{ padding: '10px 12px 10px 38px', minHeight: '44px' }}
        />
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <p className="text-base text-slate-500 py-6 text-center">No matches.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {items.map((item) => {
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item.id)}
                title={item.label}
                aria-label={item.label}
                className="aspect-square rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                <Icon style={{ width: '20px', height: '20px' }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Image drill-in
// ─────────────────────────────────────────────────────────────────────────────

interface AIImageDrillInProps {
  prompt: string;
  onPromptChange: (p: string) => void;
  stylePill: 'photo' | 'illustration' | 'icon' | 'diagram';
  onStylePillChange: (p: 'photo' | 'illustration' | 'icon' | 'diagram') => void;
  onGenerate: () => void;
}

function AIImageDrillIn({
  prompt,
  onPromptChange,
  stylePill,
  onStylePillChange,
  onGenerate,
}: AIImageDrillInProps) {
  const pills: Array<{ id: AIImageDrillInProps['stylePill']; label: string }> = [
    { id: 'photo', label: 'Photo' },
    { id: 'illustration', label: 'Illustration' },
    { id: 'icon', label: 'Icon' },
    { id: 'diagram', label: 'Diagram' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="Describe what you want..."
        aria-label="AI image description"
        className="w-full rounded-xl border border-slate-200 bg-white text-base text-slate-900 placeholder-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none transition-colors resize-y"
        style={{ padding: '12px 14px', minHeight: '88px' }}
      />
      <div className="flex flex-wrap gap-2">
        {pills.map((p) => {
          const isActive = stylePill === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onStylePillChange(p.id)}
              aria-pressed={isActive}
              className={`rounded-full border text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 ${
                isActive
                  ? 'border-violet-500 bg-violet-50 text-violet-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'
              }`}
              style={{ padding: '8px 16px', minHeight: '36px' }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={!prompt.trim()}
        className="w-full rounded-xl text-white text-base font-semibold flex items-center justify-center gap-2 transition-opacity focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, #6B3FA0, #401842)',
          padding: '12px',
          minHeight: '48px',
        }}
      >
        <Sparkles style={{ width: '18px', height: '18px' }} />
        Generate
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload drill-in
// ─────────────────────────────────────────────────────────────────────────────

interface UploadDrillInProps {
  onUpload: () => void;
}

function UploadDrillIn({ onUpload }: UploadDrillInProps) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onUpload}
        className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50 transition-colors flex flex-col items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-violet-400"
        style={{ minHeight: '160px', padding: '24px' }}
      >
        <span
          className="flex items-center justify-center rounded-xl bg-white text-slate-600"
          style={{ width: '44px', height: '44px' }}
        >
          <UploadIcon style={{ width: '22px', height: '22px' }} />
        </span>
        <span className="text-base font-semibold text-slate-900">Upload a file</span>
        <span className="text-sm text-slate-500 text-center">
          Drag and drop or click to choose
        </span>
      </button>
    </div>
  );
}
