'use client';

import type { CSSProperties } from 'react';
import type { Theme } from './types';

/** Apply a CSS gradient to the title text via background-clip. */
function gradientText(value: string): CSSProperties {
  return {
    backgroundImage: value,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: 'transparent',
  };
}

interface ThemeCardProps {
  theme: Theme;
  isSelected: boolean;
  onClick: () => void;
}

// Theme card (small preview tile) — exact port from ThemesModal.jsx lines 182-245.
export function ThemeCard({ theme, isSelected, onClick }: ThemeCardProps) {
  const tStyle: CSSProperties = theme.titleStyle === 'gradient'
    ? { ...gradientText(theme.titleColor), fontFamily: theme.titleFont }
    : { color: theme.titleColor, fontFamily: theme.titleFont };

  // Always emit the same set of long-form properties so React's style diffing
  // doesn't warn about mixing shorthand (`background`) with longhand on
  // re-render when the active theme changes.
  const cardBg: CSSProperties = (() => {
    const isGrad = theme.pageBg.startsWith('linear') || theme.pageBg.startsWith('radial');
    if (!theme.pagePattern) {
      return {
        backgroundImage: isGrad ? theme.pageBg : 'none',
        backgroundColor: isGrad ? undefined : theme.pageBg,
        backgroundSize: undefined,
        backgroundRepeat: undefined,
      };
    }
    return {
      backgroundImage: isGrad ? `${theme.pagePattern}, ${theme.pageBg}` : theme.pagePattern,
      backgroundColor: !isGrad ? theme.pageBg : undefined,
      backgroundSize: theme.pagePatternSize ? `${theme.pagePatternSize}${isGrad ? ', auto' : ''}` : undefined,
      backgroundRepeat: theme.pagePatternSize ? 'repeat, no-repeat' : undefined,
    };
  })();

  return (
    <button
      onClick={onClick}
      style={{
        background: '#fff',
        border: isSelected ? '2px solid #6B3FA0' : '1px solid #e2e8f0',
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        padding: 0,
        display: 'block',
        width: '100%',
        boxShadow: isSelected ? '0 0 0 3px rgba(107,63,160,0.10)' : 'none',
        transition: 'box-shadow 120ms ease',
      }}
    >
      <div style={{ ...cardBg, padding: '16px 18px', minHeight: 110 }}>
        <div
          style={{
            ...tStyle,
            fontSize: 16,
            fontWeight: 500,
            marginBottom: 4,
            letterSpacing: theme.titleFont.includes('Inter') ? '-0.015em' : 'normal',
          }}
        >
          Title
        </div>
        <div
          style={{
            fontFamily: theme.bodyFont,
            fontSize: 11,
            color: theme.bodyColor,
            marginBottom: 12,
          }}
        >
          Body and{' '}
          <span style={{ color: theme.linkColor, textDecoration: 'underline' }}>link</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span
            style={{
              background: theme.primaryBg,
              color: theme.primaryFg,
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: theme.btnRadius,
              fontFamily: theme.bodyFont,
              fontWeight: 500,
            }}
          >
            Primary
          </span>
          <span
            style={{
              background: theme.secondaryBg,
              border: `0.5px solid ${theme.secondaryBorder}`,
              color: theme.secondaryFg,
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: theme.btnRadius,
              fontFamily: theme.bodyFont,
              fontWeight: 500,
            }}
          >
            Secondary
          </span>
        </div>
      </div>
      <div
        style={{
          padding: '9px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #f1f5f9',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{theme.name}</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {theme.category}
          {theme.tone === 'dark' ? ' · dark' : ''}
        </span>
      </div>
    </button>
  );
}
