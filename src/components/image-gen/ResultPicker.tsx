'use client';

// ── Shared image-generation engine — ResultPicker ──────────────────────────
//
// Given the 4 generated variants, show thumbnails; tapping one opens a larger
// hero preview with "Use this image" / "More" / "×". BOTH shells use this
// preview+confirm flow (locked decision — image-prompt-flow-PLAN.md §10).
//
// Escape collapses the picker (onDismiss). On-palette chrome; CTA = btn-cta-bold.

import { useEffect, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import type { AiResult } from './types';

const PURPLE = '#6B3FA0';

export interface ResultPickerProps {
  results: AiResult[];
  /** Confirm the chosen variant. */
  onUse: (result: AiResult) => void;
  /** Generate more variants from the same params. */
  onMore: () => void;
  /** Close the picker (also fired on Escape). */
  onDismiss: () => void;
  /** Disable More while a regeneration is in flight. */
  generating?: boolean;
}

export function ResultPicker({
  results,
  onUse,
  onMore,
  onDismiss,
  generating = false,
}: ResultPickerProps) {
  const [selected, setSelected] = useState(0);

  // Keep the selected index valid if the result set shrinks.
  useEffect(() => {
    if (selected > results.length - 1) setSelected(0);
  }, [results.length, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (results.length === 0) return null;
  const hero = results[selected] ?? results[0];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          Pick your favorite
        </span>
        <button
          type="button"
          aria-label="Close results"
          onClick={onDismiss}
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'none',
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Hero preview */}
      <div
        style={{
          borderRadius: 13,
          overflow: 'hidden',
          marginBottom: 11,
          boxShadow: '0 10px 26px rgba(64,24,66,0.18)',
          background: '#f1f5f9',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero.src}
          alt={`Selected variant ${selected + 1} of ${results.length}`}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </div>

      {/* Thumbnail strip */}
      <div
        role="listbox"
        aria-label="Generated variants"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(results.length, 4)}, minmax(0, 1fr))`,
          gap: 8,
          marginBottom: 14,
        }}
      >
        {results.map((r, i) => {
          const isSel = i === selected;
          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={isSel}
              aria-label={`Variant ${i + 1}`}
              onClick={() => setSelected(i)}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 9,
                overflow: 'hidden',
                padding: 0,
                border: `2px solid ${isSel ? PURPLE : 'transparent'}`,
                boxShadow: isSel ? '0 0 0 2px rgba(107,63,160,0.25)' : 'none',
                cursor: 'pointer',
                background: '#f1f5f9',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.src}
                alt={`Variant ${i + 1}`}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 9 }}>
        <button
          type="button"
          onClick={onMore}
          disabled={generating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            minHeight: 46,
            padding: '0 16px',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.7)',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            color: '#334155',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.5 : 1,
          }}
        >
          <RotateCw size={15} aria-hidden="true" />
          More
        </button>
        <button
          type="button"
          className="btn-cta-bold"
          onClick={() => onUse(hero)}
          style={{ flex: 1, justifyContent: 'center', minHeight: 46, fontSize: 15, fontWeight: 700 }}
        >
          Use this image
        </button>
      </div>
    </div>
  );
}
