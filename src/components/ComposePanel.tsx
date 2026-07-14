'use client';

/**
 * ComposePanel — secondary nav shown on /compose/* routes.
 *
 * NavBar.tsx routes to this component instead of Sidebar when the user is
 * inside Compose. Same 264px width and visual idioms as Sidebar so the
 * left-edge geometry stays constant when the user crosses the boundary.
 *
 * Two states (only the default shipped in Phase 1):
 *   - Default: RECENT FILES (Documents / Graphics / Slides) +
 *              LIBRARY (My Projects / Brand Kit / Templates) dividers
 *   - Brand Kit (/compose/brand-kit*): ASSETS + CONTENT dividers — Phase 5
 *
 * Top: Foxit logo + explicit Back button → returns to / (the primary
 * Sidebar reappears). Bottom: Help/Settings/Profile dock — duplicated
 * from Sidebar.tsx verbatim so users keep access to those when in
 * Compose. Marked as a follow-up to extract into a shared footer.
 */

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Folder,
  Palette,
  Brush,
  CircleHelp,
  Settings,
  ChevronDown,
  Layers,
  Type as TypeIcon,
  Shapes,
  Bookmark,
  Megaphone,
  CheckSquare,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

interface NavLink {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Custom active rule. Defaults to exact-match. */
  activeWhen?: (pathname: string) => boolean;
}

const RECENT: NavLink[] = [
  {
    href: '/studio/documents',
    label: 'Documents',
    Icon: FileText,
    activeWhen: (p) => p === '/studio/documents',
  },
  {
    href: '/studio/graphics',
    label: 'Graphics',
    Icon: ImageIcon,
    activeWhen: (p) => p === '/studio/graphics',
  },
  {
    href: '/studio/slides',
    label: 'Slides',
    Icon: LayoutTemplate,
    activeWhen: (p) => p === '/studio/slides',
  },
];

const LIBRARY: NavLink[] = [
  {
    href: '/studio/my-projects',
    label: 'My Projects',
    Icon: Folder,
    activeWhen: (p) => p === '/studio/my-projects',
  },
  {
    href: '/studio/brand-kit',
    label: 'Branding',
    Icon: Palette,
    activeWhen: (p) => p.startsWith('/studio/brand-kit'),
  },
  {
    href: '/studio/templates',
    label: 'Templates',
    Icon: FileText,
    activeWhen: (p) => p === '/studio/templates',
  },
  {
    href: '/studio/themes',
    label: 'Themes',
    Icon: Brush,
    activeWhen: (p) => p === '/studio/themes',
  },
  {
    href: '/studio/my-decks',
    label: 'My Decks',
    Icon: Layers,
    activeWhen: (p) => p === '/studio/my-decks',
  },
];

// Brand-kit-context nav. When user is on /compose/brand-kit*, the
// RECENT FILES / LIBRARY content above is hidden and these sections
// take its place. Mirrors the brand-kit-compose.html mockup that
// Lisa approved.

const BRAND_ASSETS: NavLink[] = [
  {
    href: '/studio/brand-kit',
    label: 'All assets',
    Icon: Layers,
    activeWhen: (p) => p === '/studio/brand-kit',
  },
  {
    href: '/studio/brand-kit/logos',
    label: 'Logos',
    Icon: Bookmark,
    activeWhen: (p) => p === '/studio/brand-kit/logos',
  },
  {
    href: '/studio/brand-kit/colors',
    label: 'Colors',
    Icon: Palette,
    activeWhen: (p) => p === '/studio/brand-kit/colors',
  },
  {
    href: '/studio/brand-kit/fonts',
    label: 'Fonts',
    Icon: TypeIcon,
    activeWhen: (p) => p === '/studio/brand-kit/fonts',
  },
  {
    href: '/studio/brand-kit/icons',
    label: 'Icons',
    Icon: Shapes,
    activeWhen: (p) => p === '/studio/brand-kit/icons',
  },
];

const BRAND_CONTENT: NavLink[] = [
  {
    href: '/studio/brand-kit/templates',
    label: 'Brand Templates',
    Icon: FileText,
    activeWhen: (p) => p === '/studio/brand-kit/templates',
  },
  {
    href: '/studio/brand-kit/guidelines',
    label: 'Guidelines',
    Icon: CheckSquare,
    activeWhen: (p) => p === '/studio/brand-kit/guidelines',
  },
  {
    href: '/studio/brand-kit/voice',
    label: 'Brand Voice',
    Icon: Megaphone,
    activeWhen: (p) => p === '/studio/brand-kit/voice',
  },
];

// ── Inline styles — mirror Sidebar.tsx's idioms ───────────────────────────

const ds = {
  // Floating glass card — pixel-matched to the home Sidebar (Sidebar.tsx
  // `ds.sidebar`) so the left-edge chrome reads identically when the user
  // crosses from Home into Studio: same 12px inset, 244 width, translucent
  // blur, 16px radius, and soft shadow over the wash. MainContent's
  // md:ml-[264px] offset (12 inset + 244 width + 8 gap) stays correct.
  panel: {
    position: 'fixed' as const,
    top: 12,
    left: 12,
    bottom: 12,
    width: 244,
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(20px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(20,9,50,0.04), 0 12px 36px rgba(80,55,195,0.10)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 40,
  } as CSSProperties,
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    padding: '12px 14px',
    marginBottom: 9,
    border: 'none',
    background: 'transparent',
    fontSize: 15,
    fontWeight: 500,
    color: '#64748b',
    borderRadius: 9,
    cursor: 'pointer',
    textAlign: 'left' as const,
    position: 'relative' as const,
    fontFamily: 'inherit',
    textDecoration: 'none',
  } as CSSProperties,
  navItemNested: {
    paddingLeft: 32,
  } as CSSProperties,
  navItemActive: {
    color: '#0f172a',
    background: 'rgba(80,55,195,0.10)',
    fontWeight: 600,
  } as CSSProperties,
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '10px 14px 6px',
    fontSize: 11,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    fontFamily: 'inherit',
    border: 'none',
    background: 'transparent',
    textAlign: 'left' as const,
    textDecoration: 'none',
    transition: 'color 120ms ease',
  } as CSSProperties,
  sectionHeaderActive: {
    color: '#5037C3',
  } as CSSProperties,
  navBar: {
    position: 'absolute' as const,
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    background: 'linear-gradient(135deg, #4776E6, #A855F7)',
    borderRadius: 2,
  } as CSSProperties,
  profile: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    marginTop: 8,
    borderTop: '1px solid #f1f5f9',
    paddingTop: 14,
    width: '100%',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  } as CSSProperties,
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  } as CSSProperties,
};

export default function ComposePanel() {
  const pathname = usePathname() ?? '/studio';
  const router = useRouter();
  const { showToast } = useToast();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Section header active rule — header lights up on its overview page
  // OR on any nested item under it.
  const recentActive =
    pathname === '/studio/recent' || RECENT.some((i) => i.activeWhen?.(pathname));
  const libraryActive =
    pathname === '/studio/library' || LIBRARY.some((i) => i.activeWhen?.(pathname));

  // Brand-kit context detection. When true, swap RECENT FILES + LIBRARY
  // for ASSETS + CONTENT (matches the mockup).
  const isBrandKit = pathname.startsWith('/studio/brand-kit');

  const renderItem = (item: NavLink) => {
    const isActive = item.activeWhen
      ? item.activeWhen(pathname)
      : pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        style={{
          ...ds.navItem,
          ...(isActive ? ds.navItemActive : null),
        }}
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
        <item.Icon size={20} color={isActive ? '#5037C3' : '#94a3b8'} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <aside style={ds.panel}>
        {/* Wordmark — pixel-matched to the home Sidebar (Sidebar.tsx): same
            logo mark, SLIDES / divider / WORKSPACE font sizes + letter
            spacing, and the same 30/20/16 padding (per Lisa 2026-06-14). */}
        <div style={{ padding: '30px 20px 16px' }}>
          <Link href="/" aria-label="Slides Workspace — Home" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4776E6,#A855F7)', boxShadow: '0 2px 8px rgba(103,76,245,0.30)' }}>
              <svg width="17" height="17" viewBox="0 0 1024 1024" fill="none"><path d="M550.92 757.41C541.61 760.4 532.75 763.28 524.24 766.08C523.99 766.17 523.89 766.47 524.03 766.69L576.88 846.16C576.95 846.27 577.08 846.33 577.21 846.33L810.96 846.34C811.27 846.34 811.46 846 811.3 845.73L708.23 673.58C708.12 673.38 707.86 673.32 707.67 673.45C667.43 700.83 625.34 728.47 553.87 756.35L550.92 757.41Z" fill="white"/><path d="M193.26 819.15C193.26 819.15 201.93 654.66 270.55 535.82C339.17 416.98 470.33 323.67 653.06 275.7C653.06 275.7 798.18 240.63 843.13 213.39C843.13 213.39 892.02 180.38 869.94 257.13C869.94 257.13 840.65 331.44 750.35 379.68C729.06 390.83 713.24 393.32 716.58 414.53C722.62 436.09 757.15 419.7 761.89 417.23C770.1 410.15 850.14 387.29 796.81 466.97C743.18 549.5 710.63 624.37 502.42 698.64C363.61 738.25 308.4 760.54 227.96 836.47C187.73 866.24 193.26 819.15 193.26 819.15Z" fill="white"/><path d="M322.48 117.38C329.53 236.44 348.73 261.33 462.1 298.36C343.04 305.41 318.16 324.61 281.12 437.98C274.07 318.92 254.88 294.03 141.5 257C260.56 249.95 285.45 230.75 322.48 117.38Z" fill="white"/></svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.12em', background: 'linear-gradient(135deg,#4776E6,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>WORKSPACE</span>
              <span aria-hidden="true" style={{ height: 1, width: '100%', background: 'linear-gradient(90deg, rgba(120,90,230,0.5), rgba(120,90,230,0))' }} />
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.18em', color: '#475569' }}>STUDIO</span>
            </span>
          </Link>
        </div>

        {/* Divider under the wordmark — matches the home Sidebar (gradient
            hairline). The logo links home, so no separate Back affordance. */}
        <div
          aria-hidden="true"
          style={{
            height: 1,
            margin: '8px 18px 16px',
            background: 'linear-gradient(90deg, rgba(15,23,42,0.10), rgba(15,23,42,0))',
          }}
        />

        {/* Create CTA removed — page-level "+ Add asset" / per-page create
            buttons take over. The CreateModal still mounts in pages that
            need it (e.g. /compose/brand-kit) so the same options remain
            reachable. */}

        {/* Section nav — RECENT FILES + LIBRARY in normal context, swaps to
            ASSETS + CONTENT when inside the brand kit. */}
        <nav style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>
          {isBrandKit ? (
            <>
              <div style={ds.sectionHeader}>Assets</div>
              {BRAND_ASSETS.map(renderItem)}

              <div style={{ ...ds.sectionHeader, marginTop: 12 }}>Content</div>
              {BRAND_CONTENT.map(renderItem)}
            </>
          ) : (
            <>
              <Link
                href="/studio/recent"
                aria-label="Recent Files overview"
                style={{
                  ...ds.sectionHeader,
                  ...(recentActive ? ds.sectionHeaderActive : null),
                }}
              >
                Recent Files
              </Link>
              {RECENT.map(renderItem)}

              <Link
                href="/studio/library"
                aria-label="Library overview"
                style={{
                  ...ds.sectionHeader,
                  marginTop: 12,
                  ...(libraryActive ? ds.sectionHeaderActive : null),
                }}
              >
                Library
              </Link>
              {LIBRARY.map(renderItem)}
            </>
          )}
        </nav>

        {/* Bottom dock — Help / Settings / Profile.
            Duplicated from Sidebar.tsx verbatim for parity. Future cleanup
            opportunity: extract into a shared <SidebarFooter /> component. */}
        <div style={{ padding: '0 16px 20px' }}>
          <button
            type="button"
            style={ds.navItem}
            onClick={() => window.open('https://www.foxit.com/support/', '_blank')}
            aria-label="Help & Support"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <CircleHelp size={20} color="#64748b" />
            <span>Help & Support</span>
          </button>
          <Link
            href="/settings"
            style={ds.navItem}
            aria-label="Settings"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <Settings size={20} color="#64748b" />
            <span>Settings</span>
          </Link>

          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setProfileOpen((p) => !p)}
              aria-expanded={profileOpen}
              aria-label="Account menu"
              style={ds.profile}
            >
              <div style={ds.avatar}>LC</div>
              <span
                style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}
              >
                Lisa Caudillo
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
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  boxShadow:
                    '0 8px 28px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
                  padding: '6px 0',
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    color: '#94a3b8',
                    borderBottom: '1px solid #f1f5f9',
                  }}
                >
                  lisa.caudillo@foxit.com
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    router.push('/settings');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#334155',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  Account Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    showToast('Sign out coming soon.');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#334155',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
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
