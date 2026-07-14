'use client';

import type { CalloutBlock as CalloutBlockType } from '@/types/card-template';
import { getIcon } from './iconMap';

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function CalloutBlock({
  block,
  invertColors,
}: {
  block: CalloutBlockType;
  invertColors?: boolean;
}) {
  const Icon = getIcon(block.icon);

  return (
    <div
      style={{
        borderLeft: '3px solid var(--theme-link-color)',
        padding: '0.75rem 1rem',
        marginTop: '0.75rem',
        background: invertColors ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.02)',
        borderRadius: '0 8px 8px 0',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        {Icon && (
          <Icon size={18} style={{ color: 'var(--theme-link-color)', marginTop: '0.125rem', flexShrink: 0 }} />
        )}
        <div
          style={{
            color: invertColors ? 'rgba(255,255,255,0.85)' : 'var(--theme-body-color)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
          }}
        >
          {renderMarkdown(block.content)}
        </div>
      </div>
    </div>
  );
}
