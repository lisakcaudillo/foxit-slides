'use client';

import { useEffect, useState } from 'react';
import { pickLoadingPhrase } from './loadingPhrases';

interface BuildingIndicatorProps {
  /** Smaller variant fits in the thumbnail rail. Default is the canvas size. */
  size?: 'canvas' | 'rail';
}

/**
 * Inline placeholder shown beneath the visible cards while the rest of the
 * deck streams in. Pairs a small spinner with a rotating playful phrase —
 * same voice as DraftingOverlay, just inline. Replaces the literal
 * "Building card N of M" status text.
 */
export function BuildingIndicator({ size = 'canvas' }: BuildingIndicatorProps) {
  const [phrase, setPhrase] = useState<string>(() => pickLoadingPhrase());

  useEffect(() => {
    const interval = setInterval(() => {
      setPhrase((prev) => pickLoadingPhrase(prev));
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  const keyframes = (
    <style>{`
      @keyframes building-spin { to { transform: rotate(360deg); } }
      @keyframes building-fade {
        from { opacity: 0; transform: translateY(2px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );

  if (size === 'rail') {
    return (
      <div style={{
        padding: '12px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          width: 12, height: 12,
          border: '2px solid var(--theme-link-color, #6B3FA0)',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'building-spin 0.8s linear infinite',
        }} />
        {keyframes}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '3rem', gap: '12px',
    }}>
      <span style={{
        width: 22, height: 22,
        border: '3px solid var(--theme-link-color, #6B3FA0)',
        borderTopColor: 'transparent', borderRadius: '50%',
        animation: 'building-spin 0.8s linear infinite',
        flexShrink: 0,
      }} />
      <span
        key={phrase}
        style={{
          fontFamily: 'var(--theme-title-font)',
          fontSize: '0.95rem', fontWeight: 600,
          backgroundImage: 'var(--theme-title-color)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          minWidth: '18ch',
          animation: 'building-fade 320ms ease-out',
        }}
      >
        {phrase}…
      </span>
      {keyframes}
    </div>
  );
}
