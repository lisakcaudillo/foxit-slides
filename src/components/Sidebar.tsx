'use client';

/**
 * Sidebar — 264px primary navigation for non-editor routes.
 *
 * Visual port of `ComposeDesignSystem/ui_kits/compose_desktop/Sidebar.jsx`,
 * rewritten as TSX for the ComposeApp shell. Inline styles preserved from
 * the kit so future kit updates map line-for-line; only the click handlers
 * and nav semantics are app-native (Next.js `<Link>` + `usePathname`
 * instead of the kit's `onNavigate(id)` controlled prop).
 *
 * Differences from a strict verbatim port (intentional):
 *  - Buttons → `<Link href>` for client-side routing.
 *  - Active rule for "Compose" highlights on /compose AND /editor/* so the
 *    user always sees where they are when editing (set up earlier in the
 *    NavBar refactor).
 *  - Create CTA opens the existing CreateModal (artifact-type picker)
 *    rather than navigating directly to a route, since clicking "Create"
 *    in the app needs to disambiguate slides vs document.
 *  - Help / Settings / Profile dock retain the existing app behaviors
 *    (open Foxit support, route to /settings, profile dropdown with
 *    Account Settings + Sign Out) wrapped in the kit's visual frame.
 *  - Profile identity is hardcoded to "Lisa Caudillo / LC" per the brief.
 *
 * Out of scope (NavBar.tsx still owns):
 *  - EditorIconRail (slim 56px rail on /editor/*) — left intact.
 *  - Search dropdown — kit has no search; the previous main NavBar feature
 *    is dropped here. Add back later if Lisa wants it surfaced again.
 */

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  LayoutGrid,
  Presentation,
  Plus,
  CircleHelp,
  Settings,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import CompareIcon from '@/components/icons/CompareIcon';
// CreateModal removed from this entry point on 2026-05-16 — Create now
// routes directly to /editor/slides?new=true so template selection is
// voluntary (see the right-column gallery on that page). The modal
// itself still lives at @/components/CreateModal and is mounted by
// other entry points (NavBar, ComposePanel, brand-kit page).
import { useToast } from '@/components/Toast';
import MobileNavDrawer from '@/components/MobileNavDrawer';
import { openNewDeckModal } from '@/lib/newDeckModal';

// Icon type accepts both stock LucideIcon components and our custom
// CompareIcon (same prop surface). Avoids a strict-type cast at the
// call site.
type NavIconComponent = LucideIcon | typeof CompareIcon;

interface NavLink {
  href: string;
  label: string;
  Icon: NavIconComponent;
  /** Custom active rule for the link. Defaults to exact-match for "/" and
   *  startsWith for everything else. */
  activeWhen?: (pathname: string) => boolean;
}

// Templates moved out of the top-level nav in Phase 1 of the Compose
// workspace restructure — it now lives under Compose (rendered by
// ComposePanel.tsx as a child of the LIBRARY section). Old /templates URL
// still works; redirect lands inside the Compose panel.
const NAV: NavLink[] = [
  { href: '/', label: 'Home', Icon: Home, activeWhen: (p) => p === '/' },
  {
    href: '/studio',
    label: 'Studio',
    Icon: LayoutGrid,
    activeWhen: (p) => p.startsWith('/studio'),
  },
  {
    // "Slides" opens the Editor itself (a blank slide). The create surface
    // lives at /editor/generate, reached only via +New / +Create.
    href: '/editor/slides',
    label: 'Slides',
    Icon: Presentation,
    activeWhen: (p) => p.startsWith('/editor/slides'),
  },
  // Compare is hidden from the sidebar per Lisa 2026-05-21 — code, routes,
  // and the /compare page stay intact so we can bring it back without
  // rewiring anything. Just commented out of the nav list.
  // { href: '/compare', label: 'Compare', Icon: CompareIcon, activeWhen: (p) => p.startsWith('/compare') },
];

// ── Inline styles from kit Sidebar.jsx (verbatim) ─────────────────────────
//
// Preserved in inline form so a future agent can diff against the kit
// without translation friction. Layout-only properties stay in className
// where it's clean (size, etc.), but anything visually load-bearing
// (colors, gradients, shadows) is inline.

const ds = {
  // `display` + `flexDirection` are intentionally NOT inline here — they
  // live on the aside's className so we can hide the sidebar on mobile
  // (max-md:hidden) without the inline `display: flex` overriding the
  // CSS class. The kit's inline-style discipline is preserved everywhere
  // else; this is the one carve-out for responsive behavior.
  sidebar: {
    position: 'fixed', top: 12, left: 12, bottom: 12, width: 244,
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(20px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(20,9,50,0.04), 0 12px 36px rgba(80,55,195,0.10)',
    overflow: 'hidden',
    zIndex: 40,
  } as CSSProperties,
  navItem: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%',
    padding: '12px 14px', marginBottom: 9,
    border: 'none', background: 'transparent',
    fontSize: 15, fontWeight: 500, color: '#64748b',
    borderRadius: 9, cursor: 'pointer', textAlign: 'left' as const,
    position: 'relative' as const,
    fontFamily: 'inherit',
    textDecoration: 'none',
  } as CSSProperties,
  navItemActive: {
    color: '#0f172a', background: 'rgba(80,55,195,0.10)', fontWeight: 600,
  } as CSSProperties,
  navBar: {
    position: 'absolute' as const, left: 0, top: 8, bottom: 8, width: 3,
    background: 'linear-gradient(135deg,#4776E6,#A855F7)', borderRadius: 2,
  } as CSSProperties,
  profile: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', marginTop: 8,
    borderTop: '1px solid #f1f5f9', paddingTop: 14,
    width: '100%',
    border: 'none', background: 'transparent',
    cursor: 'pointer', fontFamily: 'inherit',
    textAlign: 'left' as const,
  } as CSSProperties,
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 600,
    flexShrink: 0,
  } as CSSProperties,
};

// ── Component ─────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { showToast } = useToast();
  // (createOpen state removed — Create CTA is now a Link, not a modal trigger.)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <>
      {/* Mobile nav (<md) — hamburger + slide-in drawer. Renders nothing
          above md so the desktop sidebar below is the sole nav surface. */}
      <MobileNavDrawer />

      <aside className="hidden md:flex md:flex-col" style={ds.sidebar}>
        {/* Foxit logo — wraps in Link to home (convention; click-to-home
            is the universal app expectation for product logos). */}
        <div style={{ padding: '30px 20px 16px' }}>
          <Link href="/" aria-label="Slides Workspace — Home" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4776E6,#A855F7)', boxShadow: '0 2px 8px rgba(103,76,245,0.30)' }}>
              <svg width="17" height="17" viewBox="0 0 1024 1024" fill="none"><path d="M550.92 757.41C541.61 760.4 532.75 763.28 524.24 766.08C523.99 766.17 523.89 766.47 524.03 766.69L576.88 846.16C576.95 846.27 577.08 846.33 577.21 846.33L810.96 846.34C811.27 846.34 811.46 846 811.3 845.73L708.23 673.58C708.12 673.38 707.86 673.32 707.67 673.45C667.43 700.83 625.34 728.47 553.87 756.35L550.92 757.41Z" fill="white"/><path d="M193.26 819.15C193.26 819.15 201.93 654.66 270.55 535.82C339.17 416.98 470.33 323.67 653.06 275.7C653.06 275.7 798.18 240.63 843.13 213.39C843.13 213.39 892.02 180.38 869.94 257.13C869.94 257.13 840.65 331.44 750.35 379.68C729.06 390.83 713.24 393.32 716.58 414.53C722.62 436.09 757.15 419.7 761.89 417.23C770.1 410.15 850.14 387.29 796.81 466.97C743.18 549.5 710.63 624.37 502.42 698.64C363.61 738.25 308.4 760.54 227.96 836.47C187.73 866.24 193.26 819.15 193.26 819.15Z" fill="white"/><path d="M322.48 117.38C329.53 236.44 348.73 261.33 462.1 298.36C343.04 305.41 318.16 324.61 281.12 437.98C274.07 318.92 254.88 294.03 141.5 257C260.56 249.95 285.45 230.75 322.48 117.38Z" fill="white"/></svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.12em', background: 'linear-gradient(135deg,#4776E6,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>WORKSPACE</span>
            </span>
          </Link>
        </div>

        {/* Create CTA — kit pastel gradient via .btn-create.
            Per Lisa (2026-05-16): the artifact-type modal is removed from
            this entry point. Clicking Create routes straight to the slides
            creation wizard at /editor/slides?new=true. Template selection
            there is voluntary (the right-column gallery is always visible
            but the user can type a prompt and Generate without picking).
            Note: Documents and Images flows no longer have a sidebar
            entry — track that as a separate placement decision. */}
        {/* Divider — gives the wordmark room to breathe before the action. */}
        <div aria-hidden="true" style={{ height: 1, margin: '8px 18px 16px', background: 'linear-gradient(90deg, rgba(15,23,42,0.10), rgba(15,23,42,0))' }} />

        <div style={{ padding: '4px 16px 22px' }}>
          <button
            type="button"
            onClick={openNewDeckModal}
            aria-label="New presentation"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', height: 44, borderRadius: 11, textDecoration: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg, #4776E6, #A855F7)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.28)',
              color: '#ffffff', fontSize: 15, fontWeight: 600,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(20,9,50,0.12), 0 4px 10px -4px rgba(80,55,195,0.30)',
            }}
          >
            <Plus size={17} color="#ffffff" />
            New
          </button>
        </div>

        {/* Primary nav */}
        <nav style={{ flex: 1, padding: '0 16px' }}>
          {NAV.map((n) => {
            const isActive = n.activeWhen
              ? n.activeWhen(pathname)
              : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.label}
                aria-current={isActive ? 'page' : undefined}
                style={{ ...ds.navItem, ...(isActive ? ds.navItemActive : null) }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                {isActive && <span style={ds.navBar} aria-hidden="true" />}
                <n.Icon size={20} color={isActive ? '#5037C3' : '#64748b'} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom dock — Help / Settings / Profile */}
        <div style={{ padding: '0 16px 20px' }}>
          <button
            type="button"
            style={ds.navItem}
            onClick={() => window.open('https://www.foxit.com/support/', '_blank')}
            aria-label="Help & Support"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <CircleHelp size={20} color="#64748b" />
            <span>Help & Support</span>
          </button>
          <Link
            href="/settings"
            style={ds.navItem}
            aria-label="Settings"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Settings size={20} color="#64748b" />
            <span>Settings</span>
          </Link>

          {/* Profile dropdown — kit visual + existing dropdown affordance */}
          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setProfileOpen((p) => !p)}
              aria-expanded={profileOpen}
              aria-label="Account menu"
              style={ds.profile}
            >
              <div style={ds.avatar}>LC</div>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>Lisa Caudillo</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Foxit</span>
              </span>
              <ChevronDown
                size={14}
                color="#94a3b8"
                style={{
                  marginLeft: 'auto',
                  transition: 'transform 150ms ease',
                  transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>
            {profileOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  boxShadow: '0 8px 28px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
                  padding: '6px 0',
                  zIndex: 50,
                }}
              >
                <div style={{ padding: '6px 12px', fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                  lisa.caudillo@foxit.com
                </div>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); router.push('/settings'); }}
                  style={{
                    width: '100%', padding: '8px 12px', textAlign: 'left',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 13, color: '#334155', fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  Account Settings
                </button>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); showToast('Sign out coming soon.'); }}
                  style={{
                    width: '100%', padding: '8px 12px', textAlign: 'left',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 13, color: '#334155', fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
