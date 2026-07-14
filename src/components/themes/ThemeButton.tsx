'use client';

import { useState } from 'react';
import { Palette } from 'lucide-react';
import { ThemesModal } from './ThemesModal';
import { THEMES } from './themes';
import { useTheme } from '@/lib/theme/useTheme';

interface ThemeButtonProps {
  /** Optional override styling for the button (matches host toolbar). */
  buttonStyle?: React.CSSProperties;
}

export function ThemeButton({ buttonStyle }: ThemeButtonProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const defaultStyle: React.CSSProperties = {
    minHeight: '44px',
    minWidth: '44px',
    height: '40px',
    padding: '0 14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#1e293b',
    cursor: 'pointer',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: 500,
    fontFamily: 'inherit',
    transition: 'all 150ms ease',
  };

  return (
    <>
      <button
        type="button"
        title={`Theme: ${theme.name}`}
        aria-label={`Document theme — current: ${theme.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={buttonStyle ?? defaultStyle}
      >
        <Palette size={16} /> Themes
      </button>
      <ThemesModal
        open={open}
        onClose={() => setOpen(false)}
        activeThemeId={theme.id}
        onApply={(t) => setTheme(t)}
        themes={THEMES}
      />
    </>
  );
}
