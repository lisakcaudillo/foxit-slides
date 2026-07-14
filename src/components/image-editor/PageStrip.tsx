'use client';

import { Plus } from 'lucide-react';

// ── Bottom page strip (64px) ──────────────────────────────────────────────
//
// Page thumbnail strip at the bottom of /editor/graphics. Multi-page images
// (e.g. a sequence of variations or a poster set) live here. Today the
// thumbnails are placeholder rectangles; in step 6 they'll be wired to the
// generated image set.

interface PageStripProps {
  pageIds?: string[];
  activePageId?: string;
  onSelect?: (pageId: string) => void;
  onAdd?: () => void;
}

export default function PageStrip({
  pageIds = ['p1'],
  activePageId = 'p1',
  onSelect,
  onAdd,
}: PageStripProps) {
  return (
    <footer
      style={{
        height: '72px',
        background: 'rgba(241,245,249,1)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '0 16px',
        flexShrink: 0,
        overflowX: 'auto',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {pageIds.map((id, idx) => {
        const active = id === activePageId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
            title={`Page ${idx + 1}`}
            style={{
              width: '44px',
              height: '56px',
              borderRadius: '4px',
              border: active
                ? '2px solid #6B3FA0'
                : '2px solid transparent',
              background: '#fff',
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              color: active ? '#6B3FA0' : '#697386',
              fontWeight: active ? 600 : 500,
              fontFamily: 'inherit',
              boxShadow:
                '0 1px 2px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.04)',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!active)
                e.currentTarget.style.borderColor = 'rgba(107,63,160,0.30)';
            }}
            onMouseLeave={(e) => {
              if (!active)
                e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            {idx + 1}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        title="Add page"
        aria-label="Add page"
        style={{
          width: '44px',
          height: '56px',
          borderRadius: '4px',
          background: 'transparent',
          border: '2px dashed rgba(0,0,0,0.15)',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#697386',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(107,63,160,0.30)';
          e.currentTarget.style.color = '#6B3FA0';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
          e.currentTarget.style.color = '#697386';
        }}
      >
        <Plus size={16} />
      </button>
    </footer>
  );
}
