'use client';

import type { CSSProperties } from 'react';
import type { HeadingBlock as HeadingBlockType } from '@/types/card-template';
import { themedTitleStyle } from '@/lib/theme/gradientText';

const sizeMap = {
  1: { fontSize: '2.75rem', fontWeight: 900, lineHeight: 1.1 },
  2: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.04em', textTransform: 'uppercase' as const },
  3: { fontSize: '2.25rem', fontWeight: 900, lineHeight: 1.15 },
};

export default function HeadingBlock({
  block,
  invertColors,
}: {
  block: HeadingBlockType;
  invertColors?: boolean;
}) {
  const style = sizeMap[block.level];

  // Inverted (dark cards) override the document theme to keep contrast.
  const colorStyle: CSSProperties = invertColors
    ? { color: '#ffffff' }
    : themedTitleStyle();

  return (
    <div
      style={{
        ...colorStyle,
        fontFamily: 'var(--theme-title-font)',
        ...style,
        marginBottom: block.level === 2 ? '0.25rem' : '0.5rem',
      }}
    >
      {block.content}
    </div>
  );
}
