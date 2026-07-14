'use client';

import type { BulletListBlock as BulletListBlockType } from '@/types/card-template';

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function BulletListBlock({
  block,
  invertColors,
}: {
  block: BulletListBlockType;
  invertColors?: boolean;
}) {
  const color = invertColors ? 'rgba(255,255,255,0.85)' : 'var(--theme-body-color)';

  return (
    <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>
      {block.items.map((item, i) => (
        <li
          key={i}
          style={{
            color,
            fontSize: '1.05rem',
            lineHeight: 1.7,
            marginBottom: '0.25rem',
          }}
        >
          {renderMarkdown(item)}
        </li>
      ))}
    </ul>
  );
}
