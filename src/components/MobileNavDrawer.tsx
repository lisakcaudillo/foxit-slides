'use client';

/**
 * MobileNavDrawer — hamburger + slide-in drawer for mobile/tablet (<md).
 *
 * Sidebar.tsx (264px primary nav) hides below the md breakpoint per the
 * 2026-05-16 responsive fix, but nothing replaced it — mobile users lost
 * all navigation (home-004 in backlog). This component is that replacement:
 *   - Fixed hamburger button top-right of the viewport (only visible <md)
 *   - Tap opens a slide-in drawer from the left with the same nav content
 *     as Sidebar (Foxit logo, Create CTA, Home/Foxit Slides/Compare, Help,
 *     Settings, Profile)
 *   - Backdrop dims the rest; click backdrop / Esc / X / nav item all close
 *
 * Structure intentionally duplicates Sidebar.tsx rather than sharing markup,
 * because Sidebar is a verbatim kit port (see Sidebar.tsx header) and
 * extracting shared markup would couple the two files in ways future kit
 * updates would have to coordinate around. The duplication cost is small
 * (3-item nav, 3 dock entries) and keeps Sidebar fidelity intact.
 *
 * Mounted by Sidebar.tsx so it only renders on Sidebar routes. Editor +
 * Foxit Slides surfaces will need their own mobile patterns later.
 */

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  PencilLine,
  Sparkles,
  CircleHelp,
  Settings,
  ChevronDown,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import CompareIcon from '@/components/icons/CompareIcon';
import { useToast } from '@/components/Toast';

type NavIconComponent = LucideIcon | typeof CompareIcon;

interface NavLink {
  href: string;
  label: string;
  Icon: NavIconComponent;
  activeWhen?: (pathname: string) => boolean;
}

const NAV: NavLink[] = [
  { href: '/', label: 'Home', Icon: Home, activeWhen: (p) => p === '/' },
  // Studio hidden from the nav (unused; route removed) — mirrors Sidebar.tsx.
  // {
  //   href: '/studio',
  //   label: 'Studio',
  //   Icon: PencilLine,
  //   activeWhen: (p) => p.startsWith('/studio') || p.startsWith('/editor'),
  // },
  // Compare hidden 2026-05-21 — mirrors Sidebar.tsx. Keep code intact.
  // { href: '/compare', label: 'Compare', Icon: CompareIcon, activeWhen: (p) => p.startsWith('/compare') },
];

const ds = {
  navItem: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '12px 12px', marginBottom: 2,
    border: 'none', background: 'transparent',
    fontSize: 15, fontWeight: 500, color: '#64748b',
    borderRadius: 8, cursor: 'pointer', textAlign: 'left' as const,
    position: 'relative' as const,
    fontFamily: 'inherit',
    textDecoration: 'none',
    minHeight: 44,
  } as CSSProperties,
  navItemActive: {
    color: '#0f172a', background: '#f9f6ff', fontWeight: 600,
  } as CSSProperties,
  navBar: {
    position: 'absolute' as const, left: 0, top: 8, bottom: 8, width: 3,
    background: '#6B3FA0', borderRadius: 2,
  } as CSSProperties,
  profile: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 12px', marginTop: 8,
    borderTop: '1px solid #f1f5f9', paddingTop: 14,
    width: '100%',
    border: 'none', background: 'transparent',
    cursor: 'pointer', fontFamily: 'inherit',
    textAlign: 'left' as const,
    minHeight: 44,
  } as CSSProperties,
  avatar: {
    width: 32, height: 32, borderRadius: 8,
    background: '#334155', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600,
    flexShrink: 0,
  } as CSSProperties,
};

export default function MobileNavDrawer() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Esc closes the drawer
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Outside-click closes the profile sub-dropdown
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const closeAll = () => {
    setProfileOpen(false);
    setOpen(false);
  };

  return (
    <>
      {/* Hamburger trigger — visible only below md, since Sidebar covers md+ */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="md:hidden flex items-center justify-center fixed top-3 right-3 z-40"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
          color: '#334155',
          boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
        }}
      >
        <Menu size={22} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-50"
            onClick={closeAll}
            aria-hidden="true"
            style={{
              background: 'rgba(15,23,42,0.45)',
              backdropFilter: 'blur(2px)',
              animation: 'mobileNavFadeIn 180ms ease-out',
            }}
          />

          {/* Drawer */}
          <aside
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="md:hidden fixed top-0 left-0 z-50 flex flex-col"
            style={{
              height: '100vh',
              width: 'min(280px, 84vw)',
              background: '#ffffff',
              borderRight: '1px solid #e2e8f0',
              boxShadow: '4px 0 24px rgba(15,23,42,0.10)',
              animation: 'mobileNavSlideIn 240ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* Header — logo + close */}
            <div
              style={{
                padding: '20px 20px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Link
                href="/"
                aria-label="Foxit Slides — Home"
                onClick={closeAll}
                style={{ display: 'inline-block' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/foxit-logo.png" alt="Foxit" style={{ height: 26, width: 'auto' }} />
              </Link>
              <button
                type="button"
                onClick={closeAll}
                aria-label="Close menu"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Create CTA — same .btn-create as Sidebar */}
            <div style={{ padding: '12px 20px 16px' }}>
              <Link
                href="/editor/slides?new=true"
                className="btn-create"
                aria-label="Create"
                onClick={closeAll}
                style={{ textDecoration: 'none' }}
              >
                <Sparkles size={16} color="#3B2856" />
                Create
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: '#3B2856',
                    marginLeft: 2,
                    lineHeight: 1,
                  }}
                >
                  +
                </span>
              </Link>
            </div>

            {/* Primary nav */}
            <nav style={{ flex: 1, padding: '0 16px', overflowY: 'auto' }}>
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
                    onClick={closeAll}
                    style={{ ...ds.navItem, ...(isActive ? ds.navItemActive : null) }}
                  >
                    {isActive && <span style={ds.navBar} aria-hidden="true" />}
                    <n.Icon size={20} color={isActive ? '#6B3FA0' : '#64748b'} />
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
                onClick={() => {
                  closeAll();
                  window.open('https://www.foxit.com/support/', '_blank');
                }}
                aria-label="Help & Support"
              >
                <CircleHelp size={20} color="#64748b" />
                <span>Help & Support</span>
              </button>
              <Link
                href="/settings"
                style={ds.navItem}
                aria-label="Settings"
                onClick={closeAll}
              >
                <Settings size={20} color="#64748b" />
                <span>Settings</span>
              </Link>

              {/* Profile — same dropdown affordance as Sidebar */}
              <div ref={profileRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((p) => !p)}
                  aria-expanded={profileOpen}
                  aria-label="Account menu"
                  style={ds.profile}
                >
                  <div style={ds.avatar}>DU</div>
                  <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>
                    Demo User
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
                      zIndex: 51,
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
                      demo@foxit.com
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        closeAll();
                        router.push('/settings');
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#334155',
                        fontFamily: 'inherit',
                        minHeight: 44,
                      }}
                    >
                      Account Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeAll();
                        showToast('Sign out coming soon.');
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#334155',
                        fontFamily: 'inherit',
                        minHeight: 44,
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <style>{`
            @keyframes mobileNavFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes mobileNavSlideIn {
              from { transform: translateX(-100%); }
              to { transform: translateX(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              @keyframes mobileNavFadeIn { from { opacity: 1; } to { opacity: 1; } }
              @keyframes mobileNavSlideIn { from { transform: translateX(0); } to { transform: translateX(0); } }
            }
          `}</style>
        </>
      )}
    </>
  );
}
