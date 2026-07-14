'use client';

import type { SmartLayoutBlock as SmartLayoutBlockType } from '@/types/card-template';
import { getIcon } from './iconMap';

// Theme-aware solid title color: blocks like cell headings render as small
// inline text where the gradient-text trick reads poorly. Use the document's
// link color (the closest "accent ink" the theme provides) as the headline
// tone in these dense cells.
const SOLID_HEADING = 'var(--theme-link-color)';
const BODY = 'var(--theme-body-color)';

function GridCell({ cell, invertColors }: { cell: SmartLayoutBlockType['cells'][0]; invertColors?: boolean }) {
  const Icon = getIcon(cell.icon);
  const headingColor = invertColors ? '#ffffff' : SOLID_HEADING;
  const bodyColor = invertColors ? 'rgba(255,255,255,0.75)' : BODY;
  // cell.accentColor is an explicit author override on a single cell; fall
  // back to the document link color when not set.
  const accent = cell.accentColor || 'var(--theme-link-color)';

  return (
    <div
      style={{
        borderLeft: `3px solid ${accent}`,
        paddingLeft: '1rem',
        paddingTop: '0.25rem',
        paddingBottom: '0.25rem',
      }}
    >
      {Icon && (
        <Icon
          size={20}
          style={{ color: accent, marginBottom: '0.5rem' }}
        />
      )}
      <div style={{ fontWeight: 700, color: headingColor, fontFamily: 'var(--theme-title-font)', fontSize: '1.05rem', marginBottom: '0.25rem' }}>
        {cell.heading}
      </div>
      <div style={{ color: bodyColor, fontFamily: 'var(--theme-body-font)', fontSize: '0.95rem', lineHeight: 1.5 }}>
        {cell.body}
      </div>
    </div>
  );
}

function TimelineNode({
  cell,
  index,
  invertColors,
}: {
  cell: SmartLayoutBlockType['cells'][0];
  index: number;
  invertColors?: boolean;
}) {
  const headingColor = invertColors ? '#ffffff' : SOLID_HEADING;
  const bodyColor = invertColors ? 'rgba(255,255,255,0.75)' : BODY;
  // Per-cell accentColor override wins; otherwise use the document link color.
  const accent = cell.accentColor || 'var(--theme-link-color)';

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '2rem' }}>
        <div
          style={{
            width: '2rem',
            height: '2rem',
            borderRadius: '50%',
            background: accent,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.8rem',
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>
        <div style={{ width: '2px', flex: 1, background: 'rgba(0,0,0,0.08)', minHeight: '1.5rem' }} />
      </div>
      <div style={{ paddingBottom: '1.5rem' }}>
        <div style={{ fontWeight: 700, color: headingColor, fontFamily: 'var(--theme-title-font)', fontSize: '1.05rem', marginBottom: '0.25rem' }}>
          {cell.heading}
        </div>
        <div style={{ color: bodyColor, fontFamily: 'var(--theme-body-font)', fontSize: '0.95rem', lineHeight: 1.5 }}>
          {cell.body}
        </div>
      </div>
    </div>
  );
}

function ListItem({ cell, invertColors }: { cell: SmartLayoutBlockType['cells'][0]; invertColors?: boolean }) {
  const Icon = getIcon(cell.icon);
  const headingColor = invertColors ? '#ffffff' : SOLID_HEADING;
  const bodyColor = invertColors ? 'rgba(255,255,255,0.75)' : BODY;
  const iconColor = cell.accentColor || 'var(--theme-link-color)';

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.75rem 0' }}>
      {Icon && (
        <div style={{ flexShrink: 0, marginTop: '0.125rem' }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: headingColor, fontFamily: 'var(--theme-title-font)', fontSize: '1.05rem', marginBottom: '0.25rem' }}>
          {cell.heading}
        </div>
        <div style={{ color: bodyColor, fontFamily: 'var(--theme-body-font)', fontSize: '0.95rem', lineHeight: 1.5 }}>
          {cell.body}
        </div>
      </div>
    </div>
  );
}

export default function SmartLayoutBlock({
  block,
  invertColors,
}: {
  block: SmartLayoutBlockType;
  invertColors?: boolean;
}) {
  if (block.variant === 'timeline') {
    return (
      <div style={{ marginTop: '1rem' }}>
        {block.cells.map((cell, i) => (
          <TimelineNode key={i} cell={cell} index={i} invertColors={invertColors} />
        ))}
      </div>
    );
  }

  if (block.variant === 'list') {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        {block.cells.map((cell, i) => (
          <ListItem key={i} cell={cell} invertColors={invertColors} />
        ))}
      </div>
    );
  }

  // Grid variants: grid-2x2, grid-1x3, grid-1x4
  const colsMap: Record<string, number> = {
    'grid-2x2': 2,
    'grid-1x3': 3,
    'grid-1x4': 4,
  };
  const cols = colsMap[block.variant] || 2;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '1.25rem',
        marginTop: '1rem',
      }}
    >
      {block.cells.map((cell, i) => (
        <GridCell key={i} cell={cell} invertColors={invertColors} />
      ))}
    </div>
  );
}
