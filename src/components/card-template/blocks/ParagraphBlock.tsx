'use client';

import type { ParagraphBlock as ParagraphBlockType } from '@/types/card-template';

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ParagraphBlock({
  block,
  invertColors,
}: {
  block: ParagraphBlockType;
  invertColors?: boolean;
}) {
  return (
    <p
      style={{
        color: invertColors ? 'rgba(255,255,255,0.85)' : 'var(--theme-body-color)',
        fontFamily: 'var(--theme-body-font)',
        fontSize: '1.125rem',
        lineHeight: 1.6,
        margin: '0.5rem 0',
      }}
    >
      {renderMarkdown(block.content)}
    </p>
  );
}
