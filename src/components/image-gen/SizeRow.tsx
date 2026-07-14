'use client';

// ── Shared image-generation engine — SizeRow ───────────────────────────────
//
// SIZES as 3 visual cards (Square / Landscape / Portrait + pixel dims),
// single-select. The little frame glyph reflects the aspect ratio.

import { SIZES } from './sizes';
import type { AspectId } from './types';

const PURPLE = '#6B3FA0';

export interface SizeRowProps {
  value: AspectId;
  onChange: (id: AspectId) => void;
}

/** Aspect frame box dimensions (px) for the preview glyph, keyed by aspect. */
const FRAME_DIMS: Record<AspectId, { w: number; h: number }> = {
  '1:1': { w: 34, h: 34 },
  '16:9': { w: 44, h: 28 },
  '9:16': { w: 28, h: 40 },
};

export function SizeRow({ value, onChange }: SizeRowProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Image size"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 9 }}
    >
      {SIZES.map((s) => {
        const selected = value === s.id;
        const frame = FRAME_DIMS[s.id];
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${s.label}, ${s.dims}`}
            onClick={() => onChange(s.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              minHeight: 44,
              padding: '12px 6px 9px',
              border: `1.5px solid ${selected ? PURPLE : '#e2e8f0'}`,
              borderRadius: 11,
              background: selected ? 'rgba(107,63,160,0.06)' : '#fff',
              cursor: 'pointer',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: frame.w,
                height: frame.h,
                borderRadius: 4,
                background: 'linear-gradient(135deg, rgba(107,63,160,0.18), rgba(96,165,250,0.18))',
                border: `2px solid ${selected ? PURPLE : '#94a3b8'}`,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: selected ? PURPLE : '#334155' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.dims}</span>
          </button>
        );
      })}
    </div>
  );
}
