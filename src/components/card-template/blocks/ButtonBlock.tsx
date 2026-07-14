'use client';

import type { ButtonBlock as ButtonBlockType } from '@/types/card-template';

export default function ButtonBlock({ block }: { block: ButtonBlockType }) {
  const isLight = block.style === 'primary-light';

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <a
        href={block.url || '#'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.6rem 1.5rem',
          borderRadius: 'var(--theme-btn-radius)',
          fontSize: '0.875rem',
          fontWeight: 600,
          textDecoration: 'none',
          background: isLight ? 'var(--theme-secondary-bg)' : 'var(--theme-primary-bg)',
          color: isLight ? 'var(--theme-secondary-fg)' : 'var(--theme-primary-fg)',
          border: isLight ? '1.5px solid var(--theme-secondary-border)' : 'none',
          cursor: 'pointer',
          transition: 'opacity 200ms',
        }}
      >
        {block.text}
      </a>
    </div>
  );
}
