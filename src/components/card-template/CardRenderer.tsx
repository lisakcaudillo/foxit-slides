'use client';

import type { Card } from '@/types/card-template';
import { useTemplateTheme } from './TemplateThemeProvider';
import BlockRenderer from './blocks/BlockRenderer';

// Fixed 16:9 slide dimensions (matches standard presentation export)
const CARD_WIDTH = 960;
const CARD_HEIGHT = 540;

function ColumnContent({ card, columnIndex }: { card: Card; columnIndex: number }) {
  const column = card.columns[columnIndex];
  if (!column) return null;
  const invertColors = card.style === 'dark';

  return (
    <div>
      {column.blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} invertColors={invertColors} />
      ))}
    </div>
  );
}

export default function CardRenderer({ card }: { card: Card }) {
  const theme = useTemplateTheme();
  const isDark = card.style === 'dark';
  const isChapter = card.style === 'chapter';

  // Card background
  let background: string;
  if (card.background?.gradient) {
    background = card.background.gradient;
  } else if (card.background?.color) {
    background = card.background.color;
  } else if (isDark) {
    background = 'linear-gradient(135deg, #1a1a3e, #2d1b4e)';
  } else if (isChapter) {
    background = 'linear-gradient(135deg, #e8eaf6, #d6daf0, #cfd6fc)';
  } else {
    background = theme.cardBg;
  }

  // Fixed-size card shell — 16:9 aspect ratio for export compatibility
  const cardStyle: React.CSSProperties = {
    background,
    borderRadius: `${theme.cardRadius}px`,
    boxShadow: isDark ? 'none' : '0 2px 12px rgba(0,0,40,0.08), 0 0 0 1px rgba(0,0,40,0.04)',
    backdropFilter: !isDark && !isChapter && !card.background?.gradient ? 'blur(12px)' : undefined,
    border: !isDark ? '1px solid rgba(255,255,255,0.6)' : undefined,
    overflow: 'hidden',
    width: `${CARD_WIDTH}px`,
    height: `${CARD_HEIGHT}px`,
    flexShrink: 0,
  };

  // Content padding
  const contentPad = `${theme.cardPadding}px`;

  if (card.layout === 'single') {
    return (
      <div style={cardStyle}>
        <div style={{ padding: contentPad, height: '100%', overflow: 'auto' }}>
          <ColumnContent card={card} columnIndex={0} />
        </div>
      </div>
    );
  }

  if (card.layout === 'split-left' || card.layout === 'split-right') {
    // No accent half-panel. The legacy split accent zone (a theme-gradient
    // half) read as an empty "placeholder image" (Issue #1,.
    // Imagery is owned by the Design Intelligence Layer (slideDesign.imageRole /
    // imageIntent), so split layouts render as a full-width single column.
    return (
      <div style={cardStyle}>
        <div style={{ padding: contentPad, height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <ColumnContent card={card} columnIndex={0} />
        </div>
      </div>
    );
  }

  if (card.layout === 'three-col') {
    return (
      <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', padding: contentPad }}>
        {[0, 1, 2].map((colIdx) => (
          <div key={colIdx}>
            <ColumnContent card={card} columnIndex={colIdx} />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
