'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { DEFAULT_THEME_ID, getThemeById } from '@/components/themes/themes';
import type { Theme } from '@/components/themes/types';
import {
  generateAmbientBackground,
  type AmbientBackground,
} from './generateAmbientBackground';

/**
 * Routes where the document theme paints chrome (sidebars, toolbar, modals).
 * Outside these routes the theme stays in React state but does NOT mutate
 * the root element — the rest of the app keeps its default light chrome.
 *
 * Each deck has its own theme, but the app shell stays
 * neutral. Picking a dark theme inside the editor must not bleed into
 * /home, /templates, /workflows, etc.
 */
const THEMED_ROUTE_PREFIXES = ['/editor'];

function isThemedRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return THEMED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Memoize ambient generation by theme hash — runs once per theme switch,
// not on every render. Module-scoped so it survives theme transitions.
const ambientCache = new Map<string, AmbientBackground>();
function getAmbient(theme: Theme): AmbientBackground {
  const cached = ambientCache.get(theme.id);
  if (cached) return cached;
  const fresh = generateAmbientBackground(theme);
  ambientCache.set(theme.id, fresh);
  return fresh;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const CSS_VAR_MAP: ReadonlyArray<readonly [keyof Theme, string]> = [
  ['titleFont', '--theme-title-font'],
  ['bodyFont', '--theme-body-font'],
  ['bodyColor', '--theme-body-color'],
  ['linkColor', '--theme-link-color'],
  ['primaryBg', '--theme-primary-bg'],
  ['primaryFg', '--theme-primary-fg'],
  ['secondaryBg', '--theme-secondary-bg'],
  ['secondaryFg', '--theme-secondary-fg'],
  ['secondaryBorder', '--theme-secondary-border'],
];

/**
 * Wrap a solid color into a single-stop linear-gradient so the variable
 * always holds a value that's valid as `background-image`. Solid themes
 * still render correctly because a single-stop gradient looks identical
 * to the underlying color, but consumers can use uniform layered
 * `background-image` declarations and the `background-clip:text` pattern
 * without branching on whether the theme is solid or gradient.
 */
function asBackgroundImage(value: string): string {
  if (value.includes('gradient')) return value;
  return `linear-gradient(${value}, ${value})`;
}

/** Write every theme field to CSS custom properties on <html>. */
function applyThemeToRoot(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, varName] of CSS_VAR_MAP) {
    const value = theme[key];
    if (value != null) root.style.setProperty(varName, String(value));
  }
  // titleColor + pageBg are consumed via background-image (universal pattern).
  // Wrap solid hexes as single-stop gradients so the variables stay valid as
  // background-image values regardless of whether the theme is solid or gradient.
  root.style.setProperty('--theme-title-color', asBackgroundImage(theme.titleColor));
  root.style.setProperty('--theme-page-bg', asBackgroundImage(theme.pageBg));
  // pagePattern is optional; clear it explicitly when missing so a previous
  // theme's pattern doesn't leak into a theme that has none.
  root.style.setProperty('--theme-page-pattern', theme.pagePattern ?? 'none');
  root.style.setProperty('--theme-btn-radius', `${theme.btnRadius}px`);

  // Workspace canvas. Light themes float the deck on ONE calm neutral grey
  //. Volt instead uses its OWN designed complementary backdrop
  // (theme.pageBg = the lighter #232E44 + faint on-palette corner glows) so the
  // dark, glow-lit slides POP against a subtle themed surface, the way the assets
  // editor's workspace does — not a flat grey. Scoped to Volt
  // so every other theme's workspace is unchanged.
  // A skin can declare a dedicated workspace backdrop (theme.workspaceBg); it wins.
  // Volt keeps its glow-image workspace; everything else defaults to neutral grey.
  const isVoltWorkspace = theme.id === 'volt';
  root.style.setProperty('--theme-workspace-base', theme.workspaceBg ?? (isVoltWorkspace ? '#1E2740' : '#E2E5E9'));
  root.style.setProperty('--theme-workspace-bg', isVoltWorkspace ? asBackgroundImage(theme.pageBg) : 'none');

  // Chrome (toolbar / sidebar / modal / nav) stays LIGHT for ALL themes — the
  // editor UI NEVER transitions to dark mode. A dark chrome on
  // dark themes caused the recurring "dark nav bar" problem; now only the DECK
  // reflects the theme, the surrounding app chrome + workspace stay light.
  // Variables consumed by SlideTopToolbar, ThumbnailSidebar, SlideInspectorPanel,
  // ThemesModal, etc.
  const isDark = theme.tone === 'dark';
  root.style.setProperty('--theme-chrome-bg', '#ffffff');
  root.style.setProperty('--theme-chrome-bg-elevated', '#fafbfc');
  root.style.setProperty('--theme-chrome-fg', '#1a1f36');
  root.style.setProperty('--theme-chrome-fg-muted', '#64748b');
  root.style.setProperty('--theme-chrome-fg-subtle', '#94a3b8');
  root.style.setProperty('--theme-chrome-border', '#e2e8f0');
  root.style.setProperty('--theme-chrome-border-strong', '#cbd5e1');
  root.style.setProperty('--theme-chrome-hover', 'rgba(15,23,42,0.04)');

  // Card surface elevation. Light themes get a subtle drop shadow only;
  // dark themes need a heavier shadow PLUS a faint inner highlight so the
  // card edges read against a dark workspace. Without the inner highlight,
  // dark cards on a slightly darker workspace blur into each other.
  root.style.setProperty(
    '--theme-card-shadow',
    isDark
      ? '0 12px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)'
      : '0 1px 4px rgba(0,0,40,0.06), 0 4px 16px rgba(0,0,40,0.04)'
  );
  // Active card halo — strengthened 2026-05-24 (UAT-found): the previous
  // 2px ring lost legibility against the overlapping floating toolbar.
  // Three layered shadows: solid 3px violet ring (selection commitment),
  // 0-spread 6px halo (presence past the toolbar overlap), wider drop
  // shadow (elevation cue). Dark themes get a lighter violet to read on
  // dark workspace.
  root.style.setProperty(
    '--theme-card-shadow-active',
    isDark
      ? '0 0 0 3px #a78bfa, 0 0 0 9px rgba(167,139,250,0.22), 0 16px 36px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.30), inset 0 0 0 1px rgba(255,255,255,0.10)'
      : '0 0 0 3px #6B3FA0, 0 0 0 9px rgba(107,63,160,0.18), 0 8px 28px rgba(107,63,160,0.18), 0 2px 6px rgba(107,63,160,0.10)'
  );
  root.classList.toggle('theme-tone-dark', isDark);
  root.classList.toggle('theme-tone-light', !isDark);
}

/**
 * Strip every theme variable / class the editor injected so non-editor
 * routes render in the app's default light chrome. Called whenever the
 * route leaves a themed prefix or on initial mount of a non-editor route.
 *
 * The chrome variables fall back to the light defaults declared in
 * globals.css (`:root { --theme-chrome-bg: #ffffff; ... }`), so removing
 * them via removeProperty() restores those defaults automatically.
 */
function resetThemeFromRoot(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // All vars that ThemeProvider writes — removing them lets globals.css
  // defaults kick back in. Listed explicitly rather than tracked in an
  // array so additions to applyThemeToRoot must also be added here.
  const VARS_TO_CLEAR = [
    '--theme-title-font',
    '--theme-body-font',
    '--theme-body-color',
    '--theme-link-color',
    '--theme-primary-bg',
    '--theme-primary-fg',
    '--theme-secondary-bg',
    '--theme-secondary-fg',
    '--theme-secondary-border',
    '--theme-title-color',
    '--theme-page-bg',
    '--theme-page-pattern',
    '--theme-btn-radius',
    '--theme-workspace-bg',
    '--theme-workspace-base',
    '--theme-chrome-bg',
    '--theme-chrome-bg-elevated',
    '--theme-chrome-fg',
    '--theme-chrome-fg-muted',
    '--theme-chrome-fg-subtle',
    '--theme-chrome-border',
    '--theme-chrome-border-strong',
    '--theme-chrome-hover',
    '--theme-card-shadow',
    '--theme-card-shadow-active',
  ];
  for (const v of VARS_TO_CLEAR) {
    root.style.removeProperty(v);
  }
  root.classList.remove('theme-tone-dark');
  root.classList.remove('theme-tone-light');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const themed = isThemedRoute(pathname);

  // Theme is session-scoped, NOT user-scoped. Every fresh page load starts
  // at the default theme — picking a dark theme on Deck A must not make
  // Deck B (or a fresh editor session) open dark by default. This mirrors
  // Each deck has its own theme; new decks default to light.
  //
  // Per-deck persistence (so reopening a saved deck restores its theme)
  // is a follow-up that lives alongside the deck save/load path; it would
  // seed this provider from the deck's own themeId rather than from
  // localStorage. Until that lands, the in-editor ThemeButton selection
  // applies for the current session only.
  const [theme, setThemeState] = useState<Theme>(() => getThemeById(DEFAULT_THEME_ID));

  // Apply the theme to <html> before the first browser paint, but ONLY on
  // themed routes. Outside the editor it strips any previously-applied
  // theme so the app shell stays neutral. useLayoutEffect runs after DOM
  // mutations but before paint, so route changes don't flash a stale
  // chrome color.
  useLayoutEffect(() => {
    if (themed) {
      applyThemeToRoot(theme);
    } else {
      resetThemeFromRoot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themed]);

  // Reapply whenever the theme changes (e.g. user picks a new theme in the
  // ThemesModal) — but only while it is on a themed route.
  useEffect(() => {
    if (themed) applyThemeToRoot(theme);
  }, [theme, themed]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    // No persistence: theme is per-session for now (see comment above).
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
