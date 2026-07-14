'use client';

import type { LabelGroupBlock as LabelGroupBlockType } from '@/types/card-template';

export default function LabelGroupBlock({
  block,
  invertColors,
}: {
  block: LabelGroupBlockType;
  invertColors?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
      {block.labels.map((label, i) => {
        const isFilled = label.style === 'filled' || label.style === 'filled-light';
        const isLight = label.style === 'filled-light' || label.style === 'outline-light';

        // "Light" variants intentionally use neutral / body-tinted ink so they
        // read as quiet metadata; "regular" variants pull the document accent.
        const accent = isLight ? 'var(--theme-body-color)' : 'var(--theme-link-color)';

        const style: React.CSSProperties = isFilled
          ? {
              background: isLight ? 'rgba(0,0,0,0.06)' : accent,
              color: isFilled && !isLight ? '#ffffff' : accent,
              border: 'none',
            }
          : {
              background: 'transparent',
              color: invertColors ? 'rgba(255,255,255,0.8)' : accent,
              border: `1.5px solid ${invertColors ? 'rgba(255,255,255,0.3)' : (isLight ? 'rgba(0,0,0,0.15)' : accent)}`,
            };

        return (
          <span
            key={i}
            style={{
              ...style,
              padding: '0.3rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.9rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {label.text}
          </span>
        );
      })}
    </div>
  );
}
