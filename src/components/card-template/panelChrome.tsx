'use client';

import { useState } from 'react';
import type { CSSProperties, ReactNode, MouseEvent as ReactMouseEvent } from 'react';

// ── Panel chrome — single source of truth for tool-panel typography ────────
//
// The slide-editor tool panels (Text / Media / Elements / Layouts / Brand)
// previously each declared their own section-label style, which drifted:
// 11/12/13/14px, letter-spacing 0.05/0.06/0.08em, theme-var vs hardcoded
// #64748b color, mixed rem/px, inconsistent casing. This module is the ONE
// place that defines panel text roles so they can't diverge again. Design
// Table → Lisa-approved 2026-06-14 ("Unify + compact").
//
// LOAD-BEARING: every panel imports from here. Editing a token reflows all
// panels at once — that's the point (consistency), so change deliberately.
//
// Casing rule: SECTION LABELS are UPPERCASE; everything else (item titles,
// hints, values, buttons) is Sentence case. No Title Case.
//
// Colors are theme CSS vars (never hardcoded grey) so dark-chrome themes stay
// legible. Font family is inherited from the panel root (Inter) — never
// re-declared here.

export const panelChrome = {
  /** Section header — the workhorse signpost above each group of controls. */
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--theme-chrome-fg-subtle)',
    lineHeight: 1,
  } as CSSProperties,
  /** Primary text on a button/row (e.g. "Add a text box", a list item). */
  itemTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--theme-chrome-fg)',
  } as CSSProperties,
  /** Instructional hint under a section (e.g. "Click an empty frame…"). */
  hint: {
    fontSize: 11,
    fontWeight: 400,
    color: 'var(--theme-chrome-fg-subtle)',
    lineHeight: 1.4,
  } as CSSProperties,
  /** Secondary value / mono (hex, font name). */
  value: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--theme-chrome-fg-muted)',
  } as CSSProperties,
  /** Consistent spacing ramp (4px base). */
  gap: { section: 16, labelToContent: 8, item: 6, tile: 8 },
  /** Shared square icon-tile (Elements/Text/etc.). Theme-var colors so it
   *  reads on dark chrome; pair with tileHoverIn/Out for the hover state. */
  tile: {
    width: '100%',
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 10,
    border: '1px solid var(--theme-chrome-border)',
    background: 'var(--theme-chrome-bg-elevated)',
    color: 'var(--theme-chrome-fg-muted)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 150ms ease, background 150ms ease, color 150ms ease',
    boxSizing: 'border-box',
  } as CSSProperties,
  /** Primary in-panel CTA (filled) — e.g. "Add a text box". */
  btnPrimary: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', height: 40, borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg,#6B3FA0,#8B5CF6)', color: '#fff',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  } as CSSProperties,
  /** Secondary in-panel action (outlined) — e.g. "AI Write", "Generate". */
  btnSecondary: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', height: 40, borderRadius: 10,
    border: '1px solid var(--theme-chrome-border)', background: 'var(--theme-chrome-bg)',
    color: 'var(--theme-chrome-fg)', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  } as CSSProperties,
} as const;

/** Shared icon-tile hover (purple border + tint). Use on tile buttons. */
export function tileHoverIn(e: ReactMouseEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = '#6B3FA0';
  e.currentTarget.style.background = 'rgba(107,63,160,0.06)';
  e.currentTarget.style.color = '#6B3FA0';
}
export function tileHoverOut(e: ReactMouseEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--theme-chrome-border)';
  e.currentTarget.style.background = 'var(--theme-chrome-bg-elevated)';
  e.currentTarget.style.color = 'var(--theme-chrome-fg-muted)';
}

/** Collapsible section — a clickable section label (chevron) + body. Keeps
 *  tall panels from scrolling in short windows: collapse what you're not
 *  using. Shared by every panel so they read + behave the same. */
export function PanelSection({
  title,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: 0, border: 0, background: 'transparent', cursor: 'pointer',
          marginBottom: open ? panelChrome.gap.labelToContent : 0,
          ...panelChrome.label,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .18s', opacity: .65, flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        {action}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

/** The one section header every panel renders. `action` is an optional
 *  right-aligned slot (a "Manage →" link, a count, a collapse chevron). */
export function PanelSectionLabel({
  children,
  action,
  style,
}: {
  children: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: panelChrome.gap.labelToContent,
        ...panelChrome.label,
        ...style,
      }}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}
