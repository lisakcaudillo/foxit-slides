'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TemplateTheme } from '@/types/card-template';

export const TemplateThemeContext = createContext<TemplateTheme | null>(null);

export function useTemplateTheme(): TemplateTheme {
  const theme = useContext(TemplateThemeContext);
  if (!theme) {
    throw new Error('useTemplateTheme must be used within a TemplateThemeProvider');
  }
  return theme;
}

export default function TemplateThemeProvider({
  theme,
  children,
}: {
  theme: TemplateTheme;
  children: ReactNode;
}) {
  return (
    <TemplateThemeContext.Provider value={theme}>
      {children}
    </TemplateThemeContext.Provider>
  );
}
