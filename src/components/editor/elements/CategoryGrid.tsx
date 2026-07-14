'use client';

import { ELEMENT_CATEGORIES } from './categories';
import type { ElementCategoryId } from './types';

interface CategoryGridProps {
  onSelect: (id: ElementCategoryId) => void;
  /** "desktop" uses 2 columns; "mobile" uses 3 columns per the mobile prototype */
  variant?: 'desktop' | 'mobile';
}

/**
 * Default Elements view — visual category cards.
 * Desktop: 2-column. Mobile: 3-column.
 */
export default function CategoryGrid({ onSelect, variant = 'desktop' }: CategoryGridProps) {
  const gridCols = variant === 'mobile' ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={`grid ${gridCols} gap-3`}>
      {ELEMENT_CATEGORIES.map((cat) => {
        const Icon = cat.Icon;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            aria-label={cat.label}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border ${cat.cardSurface} transition-all focus:outline-none focus:ring-2 focus:ring-violet-400`}
            style={{ minHeight: variant === 'mobile' ? '108px' : '110px', padding: '16px 8px' }}
          >
            <span
              className={`flex items-center justify-center rounded-xl bg-white ${cat.iconTint}`}
              style={{ width: '40px', height: '40px' }}
            >
              <Icon style={{ width: '20px', height: '20px' }} />
            </span>
            <span className="text-base font-semibold text-slate-900 leading-none">
              {cat.label}
            </span>
            {variant === 'desktop' && (
              <span className="text-sm text-slate-500 leading-tight text-center px-1">
                {cat.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
