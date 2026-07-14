'use client';

/**
 * QuickActionsGrid — 3-column × 2-row grid of quick action tiles.
 * Visual port of `QuickActionsGrid` from
 * ComposeDesignSystem/ui_kits/compose_desktop/HomeParts.jsx.
 *
 * Per Lisa's brief approval (2026-04-30):
 *  - Kit icons for each action (git-compare-arrows, presentation,
 *    pen-line, wand-2, layout-template, workflow).
 *  - Existing ComposeApp wording for titles + descriptions — the kit
 *    copy was prototype filler; the live app copy is technically
 *    accurate and reflects real product capability.
 *  - 6 items in 3 cols × 2 rows.
 *
 * Each tile is an anchor that routes to the action's home in the app.
 * Springy lift on hover via `.home-card-hover`. Inline styles preserved
 * from kit so kit updates diff cleanly.
 */

import {
  GitCompareArrows,
  Presentation,
  PenLine,
  Wand2,
  LayoutTemplate,
  type LucideIcon,
} from 'lucide-react';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
}

// Description copy is kit-verbatim per Lisa (2026-04-30).
// Workflow Builder dropped 2026-04-30 — Workflows is out-of-MVP scope
// per Lisa's earlier nav-trim call, and surfacing it in Quick Actions
// sent users to a feature that won't ship for the demo. Five tiles
// remain in the 3-col grid (3 + 2 layout, the trailing empty cell on
// row 2 reads naturally with the kit's gap and spacing).
// "Compare Documents" tile hidden from Quick Actions per Lisa 2026-05-21 —
// /compare route + page stay intact for future revival. Commented out so
// the diff stays minimal when we bring it back.
const QUICK_ACTIONS: QuickAction[] = [
  // {
  //   title: 'Compare Documents',
  //   description: 'AI spots meaningful changes, not just text diffs',
  //   href: '/compare',
  //   Icon: GitCompareArrows,
  // },
  {
    title: 'Create Presentation',
    description: 'Generate slide decks from a prompt in seconds',
    href: '/editor/slides?new=true',
    Icon: Presentation,
  },
  {
    title: 'Sign & Send',
    description: 'Prepare, sign, and send — all in one place',
    href: '/editor/documents',
    Icon: PenLine,
  },
  {
    title: 'AI Writing Tools',
    description: 'Rewrite, expand, shorten, or change tone',
    href: '/editor/slides?new=true',
    Icon: Wand2,
  },
  {
    title: 'Template Library',
    description: 'Browse and reuse your saved templates',
    href: '/templates',
    Icon: LayoutTemplate,
  },
];

export default function QuickActionsGrid() {
  return (
    <div style={{ marginTop: 48 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 14 }}>
        Quick actions
      </h2>
      <div className="home-grid-quick" style={{ display: 'grid', gap: 14 }}>
        {QUICK_ACTIONS.map((a) => (
          <ActionTile key={a.title} action={a} />
        ))}
      </div>
    </div>
  );
}

function ActionTile({ action }: { action: QuickAction }) {
  const Icon = action.Icon;
  return (
    <a
      href={action.href}
      className="home-card-hover"
      style={{
        padding: 18,
        background: '#ffffff',
        border: '1.5px solid transparent',
        borderRadius: 12,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'rgba(107,63,160,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <Icon size={18} color="#6B3FA0" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{action.title}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{action.description}</div>
    </a>
  );
}
