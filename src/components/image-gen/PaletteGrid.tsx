'use client';

// ── Shared image-generation engine — PaletteGrid ───────────────────────────
//
// PALETTES as multi-swatch pills (the swatches ARE the content, so multi-color
// is allowed here — see palettes.ts header). Optional select: clicking the
// active palette deselects it (value becomes null / 'auto' upstream).

import { PALETTES } from './palettes';

const PURPLE = '#6B3FA0';

export interface PaletteGridProps {
  /** Selected palette id, or null for none (lets the model choose). */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Grid column count — wizard 3, accordion 3 (narrow). */
  columns?: number;
}

export function PaletteGrid({ value, onChange, columns = 3 }: PaletteGridProps) {
  return (
    <div
      role="group"
      aria-label="Color palette (optional)"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 9,
      }}
    >
      {PALETTES.map((p) => {
        const selected = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${p.label} palette`}
            onClick={() => onChange(selected ? null : p.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minHeight: 44,
              padding: 7,
              border: `1.5px solid ${selected ? PURPLE : '#e2e8f0'}`,
              borderRadius: 10,
              background: '#fff',
              cursor: 'pointer',
              boxShadow: selected ? '0 0 0 2px rgba(107,63,160,0.18)' : 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden' }}
            >
              {p.swatches.map((c, i) => (
                <span key={i} style={{ flex: 1, background: c }} />
              ))}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: selected ? PURPLE : '#475569',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {p.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
