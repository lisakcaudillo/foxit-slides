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

/** Editor/viewer workspace backdrop for a theme: soft palette-derived glows over
 *  a base that stays in the theme's color family but is shifted one step of
 *  contrast off the deck ground (dark themes lifted noticeably lighter, light
 *  themes tinted down) so the deck pops and the surface reads as one family. */
function workspaceBackdrop(theme: Theme): string {
  const hx = (s: string): string[] => s.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})/gi) ?? [];
  const norm = (h: string): string => { h = h.replace('#', ''); return h.length === 3 ? h.split('').map((c) => c + c).join('') : h; };
  const rgb = (h: string): [number, number, number] => { const n = norm(h); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; };
  const rgba = (h: string, a: number): string => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
  const toHsl = (h: string): [number, number, number] => {
    let [r, g, b] = rgb(h).map((v) => v / 255) as [number, number, number];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; }
    return [hh * 360, s, l];
  };
  const toHex = (h: number, s: number, l: number): string => {
    h = ((h % 360) + 360) % 360 / 360; let r: number, g: number, b: number;
    if (s === 0) { r = g = b = l; } else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const hk = (t: number): number => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; r = hk(h + 1 / 3); g = hk(h); b = hk(h - 1 / 3); }
    const x = (v: number): string => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'); return '#' + x(r) + x(g) + x(b);
  };
  const mixHue = (a: number, b: number, t: number): number => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
  const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
  const dark = theme.tone === 'dark';
  const grounds = hx(theme.pageBg);
  const deck = grounds.length ? grounds[grounds.length - 1] : (dark ? '#0e0e14' : '#ffffff');
  const pal = (theme.chartPalette ?? []).filter(Boolean);
  const P = pal.length ? pal : [deck];
  const c = (i: number): string => P[i % P.length];
  // Base tilts toward the palette lead, held at a fixed lightness so it reads
  // apart from the deck; the color comes from the multi-hue glows. Some palettes
  // lead with a warm accent (velvet, obsidian, nocturne) that muddies the base —
  // take those from the deck ground so they stay in the theme's own family.
  const lead = toHsl(c(0));
  let bh = lead[0], bs = lead[1];
  if (theme.id === 'velvet' || theme.id === 'obsidian' || theme.id === 'nocturne') {
    const d = toHsl(deck); bh = d[0]; bs = Math.max(d[1], 0.22);
  }
  const base = dark
    ? toHex(bh, clamp(bs * 0.55, 0.10, 0.36), 0.12)
    : toHex(bh, clamp(bs * 0.35, 0.04, 0.16), 0.945);
  const op = dark ? [0.32, 0.24, 0.18, 0.13] : [0.15, 0.11, 0.09, 0.06];
  return [
    `radial-gradient(82% 122% at 100% 36%, ${rgba(c(0), op[0])} 0%, transparent 54%)`,
    `radial-gradient(94% 92% at 2% 6%, ${rgba(c(1), op[1])} 0%, transparent 55%)`,
    `radial-gradient(112% 82% at 42% 120%, ${rgba(c(2), op[2])} 0%, transparent 55%)`,
    `radial-gradient(68% 74% at 74% 6%, ${rgba(c(3), op[3])} 0%, transparent 52%)`,
    base,
  ].join(', ');
}

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

  // Themed ambient backdrop for the editor/viewer workspace (the area around the
  // deck): soft palette-derived glows over the workspace base, so the surface
  // behind the deck belongs to the same color family instead of a flat panel.
  root.style.setProperty('--theme-workspace-ambient', workspaceBackdrop(theme));

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
