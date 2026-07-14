'use client';

/**
 * NavBar — top-level layout component that decides which left rail to
 * render based on the active route.
 *
 *   /editor/*          → <EditorIconRail>  (slim 56px, theme-aware chrome)
 *   /workflows/new     → <EditorIconRail>  (workflow builder = full-bleed)
 *   /compose/*         → <ComposePanel>    (264px secondary nav, replaces
 *                                           Sidebar; back button returns
 *                                           the user to / and reveals
 *                                           Sidebar again)
 *   everything else    → <Sidebar>         (kit-port 264px primary nav)
 *
 * The MainNavBar that previously lived inline here was replaced by the
 * Compose Design System sidebar port (see `Sidebar.tsx`). EditorIconRail
 * stays here because it's not part of the kit and continues to be the
 * editor's chrome rail. ComposePanel is the contextual nav for the
 * Compose workspace.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FileText,
  Sparkles,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import CompareIcon from '@/components/icons/CompareIcon';
import CreateModal from '@/components/CreateModal';
import Sidebar from '@/components/Sidebar';
import ComposePanel from '@/components/ComposePanel';

// ── EditorIconRail — slim 56px rail on /editor/* (kept verbatim) ──────────

/** Slim icon rail shown on /editor routes */
function EditorIconRail() {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  // When the Elements Panel is mounted on the editor route, hide this rail —
  // only ONE left rail visible at a time per Lisa's approved modifications.
  const [elementsPanelOpen, setElementsPanelOpen] = useState(false);

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<{ open: boolean }>).detail;
      setElementsPanelOpen(Boolean(detail?.open));
    }
    window.addEventListener('compose:elements-panel', handle);
    return () => window.removeEventListener('compose:elements-panel', handle);
  }, []);

  // MVP rail — Workflows, Team, Apps deemed out of scope for MVP.
  // Re-add once those features ship. Routes still resolve if linked
  // directly, but they're hidden from the in-editor nav.
  //
  // Compose appears here too so the user always sees where they are
  // while editing. Active state rule (below) treats both /compose and
  // /editor/* as "in Compose" so the highlight doesn't disappear the
  // moment you click into a deck.
  // Icon union accepts stock Lucide icons + our custom CompareIcon
  // (same prop surface). Mirrors the type pattern in Sidebar.tsx.
  type RailIcon = LucideIcon | typeof CompareIcon;
  const railLinks: { href: string; label: string; Icon: RailIcon; activeWhen?: (p: string) => boolean }[] = [
    { href: '/', label: 'Home', Icon: Home, activeWhen: (p) => p === '/' },
    { href: '/studio', label: 'Studio', Icon: Sparkles, activeWhen: (p) => p.startsWith('/studio') || p.startsWith('/editor') },
    // Compare hidden 2026-05-21 — mirrors Sidebar.tsx + MobileNavDrawer.
    // { href: '/compare', label: 'Compare', Icon: CompareIcon, activeWhen: (p) => p.startsWith('/compare') },
    { href: '/templates', label: 'Templates', Icon: FileText, activeWhen: (p) => p.startsWith('/templates') },
  ];

  if (elementsPanelOpen) return null;

  return (
    <>
      <aside
        className="fixed top-0 left-0 h-screen w-[56px] flex flex-col items-center py-4 z-40 gap-1"
        style={{
          background: 'var(--theme-chrome-bg)',
          borderRight: '1px solid var(--theme-chrome-border)',
        }}
      >
        {/* Create + button — opens artifact type picker */}
        <button
          onClick={() => setCreateOpen(true)}
          title="Create"
          className="size-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors mb-2"
          style={{ background: 'linear-gradient(135deg, #6B3FA0, #8B5CF6)', color: 'white' }}
        >
          <Plus style={{ width: '22px', height: '22px' }} />
        </button>

        {railLinks.map((link) => {
          const isActive = link.activeWhen
            ? link.activeWhen(pathname ?? '')
            : link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              aria-label={link.label}
              className="size-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors"
              style={{
                color: isActive ? '#a78bfa' : 'var(--theme-chrome-fg-muted)',
                background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--theme-chrome-hover)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--theme-chrome-fg)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--theme-chrome-fg-muted)';
                }
              }}
            >
              <link.Icon className="size-5" />
            </Link>
          );
        })}
      </aside>
      <CreateModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

// ── Default export — route to rail or sidebar ────────────────────────────

export default function NavBar() {
  const pathname = usePathname();

  // Internal headless render targets (e.g. /internal/slide-render, the Design
  // critic's render-to-image source) render the slide ALONE — no nav chrome, or
  // the fixed sidebar overlaps the slide and pollutes the captured PNG.
  if (pathname.startsWith('/internal')) return null;

  // Slides editor: no separate global-nav rail — the SlideToolRail carries a
  // logo→home at its top and is the sole left nav (per Lisa 2026-06-14).
  if (pathname.startsWith('/editor/slides')) return null;

  // Generate (create) page: no global nav rail — it carries its own brand mark
  // + Back-to-home button (Lisa 2026-06-16).
  if (pathname.startsWith('/editor/generate')) return null;

  // Asset/Graphics editor: full-bleed like the slides editor — its own
  // SlideToolRail (now GRAPHICS) is the sole left nav (Lisa 2026-06-23).
  if (pathname.startsWith('/editor/asset')) return null;

  // Other editor routes + the workflow builder still use the slim icon rail.
  if (pathname.startsWith('/editor') || pathname === '/workflows/new') {
    return <EditorIconRail />;
  }

  // Compose workspace gets its own contextual nav. Sidebar hides; ComposePanel
  // takes over with Recent Files / Library sections (and Assets / Content
  // when on /compose/brand-kit*, wired in Phase 5).
  if (pathname.startsWith('/studio')) {
    return <ComposePanel />;
  }

  return <Sidebar />;
}
