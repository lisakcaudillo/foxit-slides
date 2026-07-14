'use client';

// ── Shared image-generation engine — StyleRow ──────────────────────────────
//
// The 8 canonical STYLES as single-select chips (icon + label). Shared by
// both shells; the wizard renders the 4-col grid, the accordion wraps the
// same chips into a narrower 272px panel. On-palette only.

import { STYLES } from './styles';
import { styleIcon } from './iconMap';
import type { ImageStyle } from './types';

const PURPLE = '#6B3FA0';

export interface StyleRowProps {
  value: ImageStyle;
  onChange: (style: ImageStyle) => void;
  /** Grid column count — wizard uses 4, accordion uses 4 in a narrow panel. */
  columns?: number;
}

export function StyleRow({ value, onChange, columns = 4 }: StyleRowProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Visual style"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 8,
      }}
    >
      {STYLES.map((s) => {
        const Icon = styleIcon(s.id);
        const selected = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${s.label} style`}
            onClick={() => onChange(s.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              minHeight: 44,
              padding: '9px 4px',
              border: `1.5px solid ${selected ? PURPLE : '#e2e8f0'}`,
              borderRadius: 10,
              background: selected ? 'rgba(107,63,160,0.08)' : '#fff',
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              color: selected ? PURPLE : '#334155',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <Icon size={18} aria-hidden="true" color={selected ? PURPLE : '#475569'} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
