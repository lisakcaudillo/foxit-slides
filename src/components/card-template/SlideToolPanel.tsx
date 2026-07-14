'use client';

import { useEffect, useState } from 'react';
import type { SlideRailPanel } from './SlideToolRail';

// ── Slide tool panel (left side, flex child, slides out from rail) ────────
//
// The expandable panel that opens adjacent to the SlideToolRail when a tool
// is active. 272px wide, full editor height, mounted as a flex sibling of
// the rail (not a floating modal).
//
// Per Lisa 2026-05-22 (P0 #2) — replaces the prior floating `position:fixed`
// right-anchored modal. Design from Designer 1 (visual polish) at
// `docs/uiux/prototypes/cards-layout-restructure-d1.html`.
//
// 2026-05-22 polish (P0 #2.1): chrome now uses `var(--theme-chrome-*)` so
// dark themes get dark panel chrome (was hardcoded white). Inner scroll
// area gets horizontal padding so panel content doesn't crowd the edges.

interface SlideToolPanelProps {
  panel: SlideRailPanel;
  onClose: () => void;
  children?: React.ReactNode;
  /** Wider variant — used by the Media panel so the 2-up masonry library
   *  thumbnails read as legible photos (the 272px default is cramped at
   *  ~118px tiles per the media-panel redesign spec, 2026-06-03). Other
   *  panels (Text, Elements, Brand) keep the 272px default. */
  wide?: boolean;
  /** Explicit width override (e.g. the graphics Media panel, which needs more
   *  room for its 3-col photo masonry than the slides 328px). Wins over `wide`
   *  / the 272px default. Graphics-only so the slides panels keep their width. */
  panelWidth?: string;
  /** Drives the open/close slide. Parent keeps the panel mounted while this is
   *  flipped to false so it can slide shut before unmounting. Default true. */
  open?: boolean;
}

const PANEL_LABELS: Record<SlideRailPanel, string> = {
  search: 'Search',
  ai: 'AI',
  text: 'Text',
  media: 'Media',
  elements: 'Elements',
  layouts: 'Layouts',
  brand: 'Brand',
  export: 'Export',
};

export default function SlideToolPanel({
  panel,
  children,
  wide = false,
  panelWidth,
  open = true,
}: SlideToolPanelProps) {
  // Slide in on mount; slide out when `open` flips to false (the parent delays
  // unmount until the transition finishes). Animating the panel's WIDTH keeps
  // it in flex flow so the canvas reclaims the space smoothly; an inner
  // fixed-width wrapper stops the content reflowing during the slide.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const fullWidth = panelWidth ?? (wide ? '328px' : '272px');
  const visible = entered && open;
  return (
    <aside
      // `complementary` (not `region`) matches the keep-card-selection check
      // in CardEditor's document-mousedown handler at the `inInspector`
      // branch — without it, ANY click inside the panel (e.g. clicking
      // "Add a heading" in TextPanel) deselected the active card BEFORE
      // the button's onClick fired, and the `activeCard === null` guard
      // in onInsertBlock then swallowed the insert. Found via dead-feature
      // audit 2026-05-22; the panel is semantically complementary content
      // anyway (a sibling sidebar to the canvas).
      role="complementary"
      aria-label={`${PANEL_LABELS[panel]} tools`}
      data-print-hide
      style={{
        // Slide open/closed by animating width (0 ↔ full) so the canvas
        // reclaims space smoothly. The inner wrapper below holds the real
        // width so content doesn't reflow while this clips it.
        width: visible ? fullWidth : '0px',
        flexShrink: 0,
        height: '100%',
        background: 'var(--theme-chrome-bg)',
        borderRight: visible ? '1px solid var(--theme-chrome-border)' : '1px solid transparent',
        backdropFilter: 'var(--chrome-blur, none)',
        WebkitBackdropFilter: 'var(--chrome-blur, none)',
        // Soft right-edge shadow lifts the panel just enough to read as
        // its own surface against the canvas — visible on both light and
        // dark chrome (10% black is theme-neutral).
        boxShadow: visible ? '4px 0 16px rgba(15, 23, 42, 0.04)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'var(--theme-chrome-fg)',
        transition: 'width 260ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Inner wrapper — pinned to the panel's full width so the header/body
          keep their layout while the outer element animates its width. */}
      <div style={{ width: fullWidth, height: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {/* No panel header — the SLIDES/WORKSPACE wordmark moved to the editor
          top bar (per Lisa 2026-06-14), so the panel is pure tool content and
          reclaims the header's height. It closes via mouse-leave (CardEditor's
          close-on-leave wrapper) or by clicking the active tool in the rail. */}

      {/* Scroll body — owns the panel's content padding (single source of
          truth) so every panel gets the SAME 16px breathing room on all
          sides. Panel content components no longer set their own outer
          padding (per Lisa 2026-06-14 — they were inconsistent: 0 / 12 / 16 /
          20px). */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px',
        }}
      >
        {children}
      </div>
      </div>
    </aside>
  );
}
