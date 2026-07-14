'use client';

import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';

/**
 * Read the active document theme + a setter to swap to a new one.
 * Throws if the consumer isn't inside <ThemeProvider>.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
