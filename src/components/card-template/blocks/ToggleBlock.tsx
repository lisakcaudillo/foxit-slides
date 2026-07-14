'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ToggleBlock as ToggleBlockType } from '@/types/card-template';

export default function ToggleBlock({
  block,
  invertColors,
}: {
  block: ToggleBlockType;
  invertColors?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Heading uses the document title color (as a solid by reading the link
  // color — gradient-text on a tiny inline trigger reads poorly). For inverted
  // dark cards override to white for legibility.
  const headingColor = invertColors ? '#ffffff' : 'var(--theme-link-color)';
  const bodyColor = invertColors ? 'rgba(255,255,255,0.75)' : 'var(--theme-body-color)';

  return (
    <div style={{ margin: '0.25rem 0' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem 0',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <ChevronRight
          size={16}
          style={{
            color: headingColor,
            transition: 'transform 200ms ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontWeight: 600,
          color: headingColor,
          fontFamily: 'var(--theme-title-font)',
          fontSize: '1.05rem',
        }}>
          {block.heading}
        </span>
      </button>
      {open && (
        <div
          style={{
            paddingLeft: '1.5rem',
            paddingBottom: '0.5rem',
            color: bodyColor,
            fontFamily: 'var(--theme-body-font)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
          }}
        >
          {block.content}
        </div>
      )}
    </div>
  );
}
