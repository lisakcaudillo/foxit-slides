'use client';

import { useEffect, useState } from 'react';
import {
  Sparkles,
  Type,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Palette,
} from 'lucide-react';

// ── Slide tool rail (left side, flex child) ───────────────────────────────
//
// Canva-pattern rail: 56px-wide column anchored to the LEFT of the slide
// editor, between the app-shell EditorIconRail and the SlideToolPanel.
// Click an icon → SlideToolPanel slides out adjacent (272px). Click the
// same icon again → panel closes.
//
// Per Lisa 2026-05-22 (P0 #2) — replaces the prior `position: fixed`
// floating rail on the right. Design from Designer 1 (visual polish) at
// `docs/uiux/prototypes/cards-layout-restructure-d1.html`.
//
// 2026-05-22 polish (P0 #2.1): dropped Search per Lisa; switched chrome to
// `var(--theme-chrome-*)` vars so dark themes get dark chrome; restored
// icon rendering by passing `stroke` as a Lucide prop only when needed
// (the prior `stroke={undefined}` plumbing tripped Lucide's default in
// some browsers and made icons appear empty).

export type SlideRailPanel =
  | 'search'
  | 'ai'
  | 'text'
  | 'media'
  | 'elements'
  | 'layouts'
  | 'brand'
  | 'export';

interface SlideToolRailProps {
  active: SlideRailPanel | null;
  onOpenPanel: (panel: SlideRailPanel) => void;
  /** Hovering a tool opens its panel (Gmail-style flyout) — same view as click. */
  onHoverPanel?: (panel: SlideRailPanel) => void;
  /** Editor surface — 'graphics' drops slide-only tools (Layouts) from the rail. */
  mode?: 'slides' | 'graphics';
}

type ToolEntry =
  | { kind: 'tool'; panel: SlideRailPanel; icon: typeof Sparkles; label: string; ai?: boolean }
  | { kind: 'divider' };

// Tool ordering: AI is the lead "invoke" action; Text / Media / Elements /
// Brand are the content-insertion cluster; Export trails on its own.
// Search was removed 2026-05-22 per Lisa — the panel never had real search
// content and was just noise on the rail.
const TOOLS: ToolEntry[] = [
  { kind: 'tool', panel: 'text', icon: Type, label: 'Text' },
  { kind: 'tool', panel: 'media', icon: ImageIcon, label: 'Media' },
  { kind: 'tool', panel: 'elements', icon: LayoutGrid, label: 'Elements' },
  // Layouts — per-card layout swap (formerly a floating popover from the
  // thumbnail right-click menu; promoted to a left-panel tab 2026-05-23 per
  // Lisa, completing the Canva-style restructure). Re-uses LAYOUT_PICKS
  // tiles from layout-picks.tsx so the picker shape stays one source.
  { kind: 'tool', panel: 'layouts', icon: LayoutTemplate, label: 'Layouts' },
  { kind: 'tool', panel: 'brand', icon: Palette, label: 'Brand' },
];

export default function SlideToolRail({
  active,
  onOpenPanel,
  onHoverPanel,
  mode = 'slides',
}: SlideToolRailProps) {
  // Graphics mode is a single standalone artboard, not a multi-card deck — the
  // per-card "Layouts" swap doesn't apply, so drop it from the rail (the nav
  // baseline locked at the design table: Text · Media · Elements · Brand).
  const tools = mode === 'graphics'
    ? TOOLS.filter((t) => !(t.kind === 'tool' && t.panel === 'layouts'))
    : TOOLS;
  // Remember the most recently opened panel so that hovering anywhere on the
  // rail (incl. the empty space below the tools, or the logo) re-expands the
  // menu to that panel — Gmail-style "hover the bar to expand" (per Lisa
  // 2026-06-14). Defaults to 'text' on first hover before any tool is opened.
  const [lastPanel, setLastPanel] = useState<SlideRailPanel>('text');
  useEffect(() => {
    if (active) setLastPanel(active);
  }, [active]);

  return (
    <nav
      role="toolbar"
      aria-label="Slide editor tools"
      aria-orientation="vertical"
      data-print-hide
      // Whole-rail hover target: entering the rail anywhere opens the panel
      // (the active one if already open, else the last-opened). Entering over
      // a specific tool fires that button's onMouseEnter afterwards (mouseenter
      // dispatches ancestor→descendant), so the precise tool still wins.
      onMouseEnter={() => onHoverPanel?.(active ?? lastPanel)}
      style={{
        // Width / structure unchanged from D1.
        width: '56px',
        flexShrink: 0,
        // Theme-aware chrome — was hardcoded white. Dark themes (Midnight,
        // etc.) now get dark rail / dark border via the chrome CSS vars
        // set by ThemeProvider.tsx.
        background: 'var(--theme-chrome-bg)',
        backdropFilter: 'var(--chrome-blur, none)',
        WebkitBackdropFilter: 'var(--chrome-blur, none)',
        padding: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative',
        // Graphics: float as a rounded glass island (content-height, no edge
        // divider, soft shadow). Slides keeps the full-height docked column with
        // the right divider. (Lisa 2026-06-25)
        ...(mode === 'graphics'
          ? {
              borderRadius: 16,
              boxShadow: '0 1px 2px rgba(0,0,0,.5), 0 26px 64px -14px rgba(0,0,0,.66)',
            }
          : { height: '100%', borderRight: '1px solid var(--theme-chrome-border)' }),
      }}
    >
      {/* AI-icon gradient defs — mounted inside the nav (not as a fragment
          sibling) so it can't accidentally affect flex layout. Width/height
          are 0 so this contributes no visual footprint; it exists only to
          host the <linearGradient> referenced by stroke="url(#...)" below. */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="slideRailAiGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6B3FA0" />
            <stop offset="60%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>

      {/* No logo here — the SLIDES/WORKSPACE wordmark moved to the editor top
          bar (per Lisa 2026-06-14), so the rail is purely the tool cluster.
          Home is reachable from the top-bar wordmark. */}
      <div aria-hidden="true" style={{ height: '4px', flexShrink: 0 }} />

      {tools.map((entry, idx) => {
        if (entry.kind === 'divider') {
          return (
            <div
              key={`div-${idx}`}
              aria-hidden="true"
              style={{
                width: '24px',
                height: '1px',
                background: 'var(--theme-chrome-border)',
                margin: '6px 0',
              }}
            />
          );
        }

        const isActive = active === entry.panel;
        const Icon = entry.icon;
        // Only override the stroke when we actively want the AI gradient.
        // Passing `stroke={undefined}` was making Lucide render with an
        // empty stroke in some browsers (icons appeared invisible) —
        // spreading the prop conditionally keeps Lucide's `currentColor`
        // default in play everywhere else.
        const iconProps = entry.ai && !isActive
          ? { stroke: 'url(#slideRailAiGradient)' }
          : {};
        // Graphics mode selected-state (design table, locked): a glassy blue
        // OUTLINE RING + whisper of fill + a BOLDER white glyph, instead of the
        // slides violet tint + left indicator bar. Slides keeps its exact values.
        const g = mode === 'graphics';
        const gActive = g && isActive;
        // Graphics selection accent = the centralized blue↔purple in-between
        // (`--gfx-accent`, set on the editor root) so rail/inspector/swatch match.
        const activeBg = g ? 'var(--gfx-accent-soft, rgba(139,124,246,0.16))' : 'rgba(107, 63, 160, 0.10)';
        const activeFg = g ? '#ffffff' : '#6B3FA0';
        // Graphics active state = a FULL-WIDTH highlight band (nav left edge → right
        // edge), bounded top + bottom by accent lines — NOT a curved box. Spanning
        // the whole rail means the label can never overflow the selection (Lisa
        // 2026-06-23). The band is the full-width button fill (below); these inset
        // shadows draw its top/bottom edges.
        const activeRing = gActive
          ? 'inset 0 1.5px 0 var(--gfx-accent, #8B7CF6), inset 0 -1.5px 0 var(--gfx-accent, #8B7CF6)'
          : 'none';
        const focusColor = g ? 'var(--gfx-accent, #8B7CF6)' : '#6B3FA0';
        return (
          <button
            key={entry.panel}
            type="button"
            onClick={() => onOpenPanel(entry.panel)}
            title={entry.label}
            aria-label={entry.label}
            aria-pressed={isActive}
            style={{
              position: 'relative',
              // Graphics active tab spans the FULL rail width (edge-to-edge band);
              // everything else stays the centered 44px rounded tile.
              width: gActive ? '100%' : '44px',
              height: '48px',
              borderRadius: gActive ? '0px' : '10px',
              border: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              cursor: 'pointer',
              // Active state: brand purple at 8% on light, mirror tint in
              // theme-chrome-hover on dark. The active fg stays purple
              // (brand-recognisable) on every theme.
              background: isActive ? activeBg : 'transparent',
              color: isActive ? activeFg : 'var(--theme-chrome-fg-subtle)',
              boxShadow: activeRing,
              fontFamily: 'inherit',
              transition:
                'background 160ms cubic-bezier(0.25, 1, 0.5, 1),' +
                ' color 160ms cubic-bezier(0.25, 1, 0.5, 1)',
            }}
            onMouseEnter={(e) => {
              onHoverPanel?.(entry.panel);
              if (isActive) return;
              e.currentTarget.style.background = 'var(--theme-chrome-hover)';
              e.currentTarget.style.color = 'var(--theme-chrome-fg)';
            }}
            onMouseLeave={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--theme-chrome-fg-subtle)';
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = `2px solid ${focusColor}`;
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
              e.currentTarget.style.outlineOffset = '0';
            }}
          >
            {isActive && !g && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '-8px',
                  top: '8px',
                  bottom: '8px',
                  width: '3px',
                  borderRadius: '0 3px 3px 0',
                  background: 'linear-gradient(180deg, #6B3FA0 0%, #8B5CF6 100%)',
                  boxShadow: '0 0 12px rgba(107, 63, 160, 0.45)',
                }}
              />
            )}
            <Icon
              strokeWidth={g && isActive ? 2.5 : 1.75}
              {...iconProps}
              style={{ width: '20px', height: '20px' }}
            />
            <span
              style={{
                // 9px + tight tracking so the longest label ("Elements") fits
                // inside the 44px button (and its active ring) without spilling.
                fontSize: '9px',
                fontWeight: isActive ? 600 : 500,
                letterSpacing: '-0.01em',
                lineHeight: 1,
                maxWidth: '42px',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                color: 'inherit',
              }}
            >
              {entry.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
