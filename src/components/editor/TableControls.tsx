'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X } from 'lucide-react';

interface TableControlsProps {
  tableElement: HTMLTableElement;
  onAddRow: (afterIndex: number) => void;
  onAddColumn: (afterIndex: number) => void;
  onDeleteRow: (index: number) => void;
  onDeleteColumn: (index: number) => void;
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function TableControls({
  tableElement,
  onAddRow,
  onAddColumn,
  onDeleteRow,
  onDeleteColumn,
}: TableControlsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  const rowCount = tableElement.rows.length;
  const colCount = tableElement.rows[0]?.cells.length ?? 0;

  // Measure table position and update on resize/scroll
  const updateRect = useCallback(() => {
    const r = tableElement.getBoundingClientRect();
    setRect(r);
  }, [tableElement]);

  useEffect(() => {
    updateRect();
    // Fade in after mount
    const timer = setTimeout(() => setVisible(true), 10);

    const observer = new ResizeObserver(updateRect);
    observer.observe(tableElement);

    // Also update on scroll of any ancestor
    const scrollParent = tableElement.closest('.overflow-auto') ?? window;
    const handleScroll = () => updateRect();
    scrollParent.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      scrollParent.removeEventListener('scroll', handleScroll);
    };
  }, [tableElement, updateRect]);

  if (!rect) return null;

  // Compute row positions relative to the table
  const rowPositions: Array<{ top: number; height: number }> = [];
  for (let i = 0; i < rowCount; i++) {
    const rowRect = tableElement.rows[i].getBoundingClientRect();
    rowPositions.push({
      top: rowRect.top - rect.top,
      height: rowRect.height,
    });
  }

  // Compute column positions relative to the table
  const colPositions: Array<{ left: number; width: number }> = [];
  if (rowCount > 0) {
    for (let i = 0; i < colCount; i++) {
      const cellRect = tableElement.rows[0].cells[i].getBoundingClientRect();
      colPositions.push({
        left: cellRect.left - rect.left,
        width: cellRect.width,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'pointer-events-none fixed z-50 transition-opacity duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    >
      {/* Row delete buttons — left side */}
      {rowCount > 1 && rowPositions.map((pos, i) => (
        <button
          key={`del-row-${i}`}
          onClick={() => onDeleteRow(i)}
          onMouseEnter={() => setHoveredRow(i)}
          onMouseLeave={() => setHoveredRow(null)}
          className={cn(
            'pointer-events-auto absolute flex items-center justify-center',
            'rounded-full bg-white border border-slate-200 shadow-sm',
            'text-slate-400 hover:text-slate-600 hover:border-slate-300',
            'transition-all duration-200 ease-out',
            hoveredRow === i ? 'opacity-100 scale-100' : 'opacity-60 scale-90 hover:opacity-100 hover:scale-100',
          )}
          style={{
            top: pos.top + pos.height / 2 - 10,
            left: -28,
            width: 20,
            height: 20,
            // 44px touch target via padding
            padding: 12,
            boxSizing: 'content-box',
            margin: -12,
          }}
          title={`Delete row ${i + 1}`}
          aria-label={`Delete row ${i + 1}`}
        >
          <X className="size-3" />
        </button>
      ))}

      {/* Column delete buttons — top */}
      {colCount > 1 && colPositions.map((pos, i) => (
        <button
          key={`del-col-${i}`}
          onClick={() => onDeleteColumn(i)}
          onMouseEnter={() => setHoveredCol(i)}
          onMouseLeave={() => setHoveredCol(null)}
          className={cn(
            'pointer-events-auto absolute flex items-center justify-center',
            'rounded-full bg-white border border-slate-200 shadow-sm',
            'text-slate-400 hover:text-slate-600 hover:border-slate-300',
            'transition-all duration-200 ease-out',
            hoveredCol === i ? 'opacity-100 scale-100' : 'opacity-60 scale-90 hover:opacity-100 hover:scale-100',
          )}
          style={{
            top: -28,
            left: pos.left + pos.width / 2 - 10,
            width: 20,
            height: 20,
            padding: 12,
            boxSizing: 'content-box',
            margin: -12,
          }}
          title={`Delete column ${i + 1}`}
          aria-label={`Delete column ${i + 1}`}
        >
          <X className="size-3" />
        </button>
      ))}

      {/* Add row button — bottom center */}
      <button
        onClick={() => onAddRow(rowCount - 1)}
        className={cn(
          'pointer-events-auto absolute flex items-center justify-center',
          'rounded-full bg-white border border-slate-200 shadow-sm',
          'text-violet-600 hover:bg-violet-50 hover:border-violet-300',
          'transition-all duration-200 ease-out',
        )}
        style={{
          bottom: -32,
          left: rect.width / 2 - 12,
          width: 24,
          height: 24,
          padding: 10,
          boxSizing: 'content-box',
          margin: -10,
        }}
        title="Add row"
        aria-label="Add row"
      >
        <Plus className="size-4" />
      </button>

      {/* Add column button — right center */}
      <button
        onClick={() => onAddColumn(colCount - 1)}
        className={cn(
          'pointer-events-auto absolute flex items-center justify-center',
          'rounded-full bg-white border border-slate-200 shadow-sm',
          'text-violet-600 hover:bg-violet-50 hover:border-violet-300',
          'transition-all duration-200 ease-out',
        )}
        style={{
          top: rect.height / 2 - 12,
          right: -32,
          width: 24,
          height: 24,
          padding: 10,
          boxSizing: 'content-box',
          margin: -10,
        }}
        title="Add column"
        aria-label="Add column"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
