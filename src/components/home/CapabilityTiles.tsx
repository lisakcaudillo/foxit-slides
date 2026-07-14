'use client';

/* eslint-disable react/no-array-index-key -- ports SVG keying patterns from kit */

/**
 * CapabilityTiles — 4-tile grid demonstrating Compose's actual mechanics.
 * Verbatim visual port of CapabilityTiles.jsx from the kit, animations
 * included.
 *
 * Each tile pairs a static first-frame (`*Still`) shown at rest with a
 * SMIL-animated preview (`*Anim`) that runs on hover/focus. We remount
 * the animated SVG on each activation via `key="play"` so SMIL restarts
 * from frame 0 — same trick the kit uses.
 *
 * Tiles:
 *  1. Chat to artifact      — describe a doc, AI drafts a full version
 *  2. Outline to slides     — paste bullets, get a deck with notes
 *  3. Template starter      — begin from your team's saved patterns
 *  4. Refine by conversation — ask for changes in plain words
 */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

interface Tile {
  id: string;
  title: string;
  desc: string;
  /** Where the modal's "Try it" CTA routes when this tile's demo is opened. */
  tryItRoute: string;
  StillFrame: () => ReactNode;
  Preview: () => ReactNode;
}

const TILES: Tile[] = [
  {
    id: 'chat',
    title: 'Chat to artifact',
    desc: 'Describe a doc — Compose drafts a full version.',
    tryItRoute: '/editor/slides',
    StillFrame: ChatToArtifactStill,
    Preview: ChatToArtifactAnim,
  },
  {
    id: 'outline',
    title: 'Outline to slides',
    desc: 'Paste bullets, get a deck with speaker notes.',
    tryItRoute: '/editor/slides',
    StillFrame: OutlineToSlidesStill,
    Preview: OutlineToSlidesAnim,
  },
  {
    id: 'template',
    title: 'Template starter',
    desc: "Begin from your team's saved patterns.",
    tryItRoute: '/templates',
    StillFrame: TemplateStarterStill,
    Preview: TemplateStarterAnim,
  },
  {
    id: 'refine',
    title: 'Refine by conversation',
    desc: 'Ask for changes in plain words. Compose edits in place.',
    tryItRoute: '/editor/slides',
    StillFrame: RefineByChatStill,
    Preview: RefineByChatAnim,
  },
];

export default function CapabilityTiles() {
  const [demoTile, setDemoTile] = useState<Tile | null>(null);
  return (
    <div style={{ marginTop: 48 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 14 }}>
        How Compose works
      </h2>
      <div className="home-grid-capabilities" style={{ display: 'grid', gap: 14 }}>
        {TILES.map((t) => (
          <CapabilityTile key={t.id} tile={t} onOpenDemo={() => setDemoTile(t)} />
        ))}
      </div>
      {demoTile && <CapabilityDemoModal tile={demoTile} onClose={() => setDemoTile(null)} />}
    </div>
  );
}

function CapabilityTile({ tile, onOpenDemo }: { tile: Tile; onOpenDemo: () => void }) {
  const [active, setActive] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  const playedOnceRef = useRef(false);
  const { title, desc, StillFrame, Preview } = tile;

  // Touch-only autoplay: animations fire on hover for desktop, but touch
  // devices never fire mouseenter. Use IntersectionObserver so each tile
  // plays its animation once when it scrolls into view, then settles back
  // to the static frame. Desktop (hover-capable) is unaffected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (!isTouch) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = tileRef.current;
    if (!el) return;

    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !playedOnceRef.current) {
            playedOnceRef.current = true;
            setActive(true);
            // Longest tile animation is 2.8s; give SMIL a full cycle plus
            // a small buffer before reverting to the still frame.
            timer = window.setTimeout(() => setActive(false), 3000);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={tileRef}
      role="button"
      tabIndex={0}
      aria-label={`See how "${title}" works`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onClick={onOpenDemo}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDemo();
        }
      }}
      style={{
        background: '#ffffff',
        border: '1.5px solid transparent',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'pointer',
        outline: 'none',
        boxShadow: active
          ? '0 8px 28px rgba(107,63,160,0.12), 0 2px 4px rgba(0,0,0,0.04), 0 0 0 2px rgba(107,63,160,0.25)'
          : '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        transition: 'all 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div
        style={{
          height: 104,
          background:
            'linear-gradient(135deg, rgba(240,168,242,0.12) 0%, rgba(200,182,244,0.10) 50%, rgba(156,196,254,0.12) 100%)',
          borderBottom: '1px solid rgba(107,63,160,0.06)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Remount animated preview on each activation so SMIL restarts
            from frame 0 — kit's pattern. */}
        {active ? <Preview key="play" /> : <StillFrame />}
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

function CapabilityDemoModal({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const router = useRouter();
  const { title, desc, tryItRoute, Preview } = tile;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleTryIt = () => {
    onClose();
    router.push(tryItRoute);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'capabilityFadeIn 150ms ease-out' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="capability-demo-title"
        className="fixed z-50 bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(640px, 92vw)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'capabilitySlideUp 200ms ease-out',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close demo"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(6px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#475569',
            zIndex: 1,
          }}
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        <div
          style={{
            height: 260,
            background:
              'linear-gradient(135deg, rgba(240,168,242,0.12) 0%, rgba(200,182,244,0.10) 50%, rgba(156,196,254,0.12) 100%)',
            borderBottom: '1px solid rgba(107,63,160,0.06)',
            position: 'relative',
            overflow: 'hidden',
            padding: 24,
          }}
        >
          {/* SVG scales to fill the larger demo area via its width/height: 100% inner style. */}
          <Preview key="play" />
        </div>

        <div style={{ padding: '24px 28px 28px' }}>
          <h2
            id="capability-demo-title"
            style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}
          >
            {title}
          </h2>
          <p style={{ margin: '8px 0 20px', fontSize: 15, color: '#475569', lineHeight: 1.5 }}>
            {desc}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-chip" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-cta-bold" onClick={handleTryIt}>
              Try it
            </button>
          </div>
        </div>

        <style>{`
          @keyframes capabilityFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes capabilitySlideUp {
            from { opacity: 0; transform: translate(-50%, -48%); }
            to   { opacity: 1; transform: translate(-50%, -50%); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes capabilityFadeIn { from { opacity: 1; } to { opacity: 1; } }
            @keyframes capabilitySlideUp {
              from { opacity: 1; transform: translate(-50%, -50%); }
              to   { opacity: 1; transform: translate(-50%, -50%); }
            }
          }
        `}</style>
      </div>
    </>
  );
}

// ── Shared sparkle helper (verbatim from kit) ─────────────────────────────

function Sparkle({ cx, cy, dur, delay = '0' }: { cx: number; cy: number; dur: string; delay?: string }) {
  return (
    <g transform={`translate(${cx} ${cy})`} opacity="0">
      <animate
        attributeName="opacity"
        values="0;0;1;0;0"
        keyTimes={`0;${delay};${parseFloat(delay) + 0.08};${parseFloat(delay) + 0.18};1`}
        dur={dur}
        repeatCount="indefinite"
      />
      <path d="M0 -3 L0.8 -0.8 L3 0 L0.8 0.8 L0 3 L-0.8 0.8 L-3 0 L-0.8 -0.8 Z" fill="#6B3FA0" />
    </g>
  );
}

// ── 1. ChatToArtifact (animated) — prompt types, then doc page unfurls ────

function ChatToArtifactAnim() {
  const dur = '2.4s';
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      <defs>
        <clipPath id="cta-typing">
          <rect x="16" y="34" width="0" height="16">
            <animate attributeName="width" values="0;76;76;76" keyTimes="0;0.35;0.55;1" dur={dur} repeatCount="indefinite" />
          </rect>
        </clipPath>
        <linearGradient id="cta-doc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F0A8F2" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#C8B6F4" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#9CC4FE" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Prompt bubble */}
      <rect x="10" y="26" width="90" height="32" rx="10" fill="#fff" stroke="rgba(107,63,160,0.12)" />
      <g clipPath="url(#cta-typing)">
        <rect x="18" y="38" width="72" height="2.5" rx="1" fill="#6B3FA0" />
        <rect x="18" y="44" width="52" height="2.5" rx="1" fill="#6B3FA0" opacity="0.55" />
      </g>
      {/* typing caret */}
      <rect x="18" y="37" width="1.5" height="10" fill="#6B3FA0">
        <animate attributeName="x" values="18;94;94;94" keyTimes="0;0.35;0.55;1" dur={dur} repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.35;0.4;1" dur={dur} repeatCount="indefinite" />
      </rect>

      {/* Arrow appears mid-flight */}
      <g opacity="0" transform="translate(104,42)">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.4;0.5;0.85;1" dur={dur} repeatCount="indefinite" />
        <path d="M0 0 L10 0 M6 -4 L10 0 L6 4" stroke="#6B3FA0" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Document page unfolding */}
      <g transform="translate(128, 14)">
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;0;1;1" keyTimes="0;0.45;0.55;0.75;1" dur={dur} repeatCount="indefinite" />
          <rect x="0" y="0" width="76" height="76" rx="6" fill="#fff" stroke="rgba(107,63,160,0.18)" />
          <rect x="0" y="0" width="76" height="8" rx="6" fill="url(#cta-doc)" />
          {/* lines draw in */}
          <rect x="10" y="20" width="0" height="3" rx="1.5" fill="#334155">
            <animate attributeName="width" values="0;0;0;0;56" keyTimes="0;0.55;0.65;0.72;0.82" dur={dur} repeatCount="indefinite" fill="freeze" />
          </rect>
          <rect x="10" y="28" width="0" height="3" rx="1.5" fill="#94a3b8">
            <animate attributeName="width" values="0;0;0;0;0;48" keyTimes="0;0.55;0.65;0.75;0.8;0.88" dur={dur} repeatCount="indefinite" fill="freeze" />
          </rect>
          <rect x="10" y="36" width="0" height="3" rx="1.5" fill="#94a3b8">
            <animate attributeName="width" values="0;0;0;0;0;0;56" keyTimes="0;0.55;0.65;0.75;0.82;0.88;0.95" dur={dur} repeatCount="indefinite" fill="freeze" />
          </rect>
          <rect x="10" y="44" width="0" height="3" rx="1.5" fill="#94a3b8">
            <animate attributeName="width" values="0;0;0;0;0;0;0;36" keyTimes="0;0.55;0.65;0.75;0.82;0.88;0.95;1" dur={dur} repeatCount="indefinite" fill="freeze" />
          </rect>
          <rect x="10" y="56" width="28" height="8" rx="2" fill="rgba(107,63,160,0.10)" />
          <rect x="42" y="56" width="24" height="8" rx="2" fill="rgba(156,196,254,0.22)" />
        </g>
      </g>

      <Sparkle cx={112} cy={20} dur={dur} delay="0.5" />
      <Sparkle cx={196} cy={90} dur={dur} delay="0.7" />
    </svg>
  );
}

// ── 2. OutlineToSlides (animated) — bullets land as slide thumbs ──────────

function OutlineToSlidesAnim() {
  const dur = '2.4s';
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      {/* Outline card on left */}
      <g transform="translate(14, 18)">
        <rect width="72" height="72" rx="8" fill="#fff" stroke="rgba(107,63,160,0.14)" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx="10" cy={14 + i * 18} r="2" fill="#6B3FA0" />
            <rect x="16" y={12 + i * 18} width={46 - i * 8} height="3" rx="1.5" fill="#334155" opacity={0.75 - i * 0.1} />
            <rect x="16" y={18 + i * 18} width={34 - i * 4} height="2" rx="1" fill="#94a3b8" />
          </g>
        ))}
      </g>

      {/* Three slide thumbs entering staggered */}
      {[0, 1, 2].map((i) => {
        const baseStart = 0.25 + i * 0.12;
        return (
          <g key={i} transform={`translate(${110 + i * 32}, ${18 + i * 6})`}>
            <g opacity="0" transform="translate(-16,-8) scale(0.85)">
              <animate
                attributeName="opacity"
                values="0;0;1;1;0"
                keyTimes={`0;${baseStart};${baseStart + 0.12};0.95;1`}
                dur={dur}
                repeatCount="indefinite"
              />
              <animateTransform
                attributeName="transform"
                type="translate"
                values="-16 -8; -16 -8; 0 0; 0 0; 0 0"
                keyTimes={`0;${baseStart};${baseStart + 0.15};0.95;1`}
                dur={dur}
                repeatCount="indefinite"
              />
              <rect width="60" height="42" rx="4" fill="#fff" stroke="rgba(107,63,160,0.22)" />
              <rect x="4" y="4" width="52" height="3" rx="1.5" fill="#6B3FA0" />
              <rect x="4" y="11" width="40" height="2" rx="1" fill="#94a3b8" />
              <rect x="4" y="18" width="22" height="20" rx="2" fill="rgba(240,168,242,0.35)" />
              <rect x="30" y="18" width="26" height="8" rx="1.5" fill="rgba(156,196,254,0.35)" />
              <rect x="30" y="30" width="26" height="8" rx="1.5" fill="rgba(200,182,244,0.35)" />
            </g>
          </g>
        );
      })}

      {/* Connecting dotted path */}
      <path d="M92 54 L108 42" stroke="#6B3FA0" strokeWidth="1.2" strokeDasharray="2 3" fill="none" opacity="0.5" />
      <Sparkle cx={100} cy={48} dur={dur} delay="0.35" />
    </svg>
  );
}

// ── 3. TemplateStarter (animated) — cursor picks a template, it glows ─────

function TemplateStarterAnim() {
  const dur = '2.8s';
  const templates = [
    { x: 22, y: 16, hue: '#F0A8F2' },
    { x: 82, y: 16, hue: '#C8B6F4', selected: true },
    { x: 142, y: 16, hue: '#9CC4FE' },
    { x: 22, y: 56, hue: '#9CC4FE' },
    { x: 82, y: 56, hue: '#F0A8F2' },
    { x: 142, y: 56, hue: '#C8B6F4' },
  ];
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      {templates.map((t, i) => (
        <g key={i} transform={`translate(${t.x}, ${t.y})`}>
          <rect
            width="48"
            height="32"
            rx="5"
            fill="#fff"
            stroke={t.selected ? '#6B3FA0' : 'rgba(15,23,42,0.08)'}
            strokeWidth={t.selected ? 1.5 : 1}
          />
          <rect x="4" y="4" width="40" height="3" rx="1.5" fill={t.hue} opacity="0.85" />
          <rect x="4" y="10" width="28" height="2" rx="1" fill="#cbd5e1" />
          <rect x="4" y="14" width="34" height="2" rx="1" fill="#e2e8f0" />
          <rect x="4" y="20" width="18" height="8" rx="1.5" fill={t.hue} opacity="0.3" />
          <rect x="26" y="20" width="18" height="8" rx="1.5" fill={t.hue} opacity="0.18" />
          {t.selected && (
            <rect x="-2" y="-2" width="52" height="36" rx="6" fill="none" stroke="#6B3FA0" strokeWidth="1.5" opacity="0">
              <animate
                attributeName="opacity"
                values="0;0;1;1;0;0"
                keyTimes="0;0.35;0.5;0.8;0.9;1"
                dur={dur}
                repeatCount="indefinite"
              />
              <animate
                attributeName="x"
                values="-2;-2;-4;-4;-2;-2"
                keyTimes="0;0.35;0.5;0.8;0.9;1"
                dur={dur}
                repeatCount="indefinite"
              />
              <animate
                attributeName="y"
                values="-2;-2;-4;-4;-2;-2"
                keyTimes="0;0.35;0.5;0.8;0.9;1"
                dur={dur}
                repeatCount="indefinite"
              />
              <animate
                attributeName="width"
                values="52;52;56;56;52;52"
                keyTimes="0;0.35;0.5;0.8;0.9;1"
                dur={dur}
                repeatCount="indefinite"
              />
              <animate
                attributeName="height"
                values="36;36;40;40;36;36"
                keyTimes="0;0.35;0.5;0.8;0.9;1"
                dur={dur}
                repeatCount="indefinite"
              />
            </rect>
          )}
        </g>
      ))}
      {/* Cursor moves to selected tile */}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="30 80; 30 80; 118 38; 118 38; 30 80"
          keyTimes="0;0.15;0.45;0.85;1"
          dur={dur}
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.3 0 0.2 1;0.3 0 0.2 1;0.3 0 0.2 1;0.3 0 0.2 1"
        />
        <path d="M0 0 L0 12 L3 9 L6 14 L8 13 L5 8 L9 8 Z" fill="#0f172a" stroke="#fff" strokeWidth="0.8" />
      </g>
      <Sparkle cx={130} cy={26} dur={dur} delay="0.55" />
    </svg>
  );
}

// ── 4. RefineByChat (animated) — chat bubble edits a line in a doc ────────

function RefineByChatAnim() {
  const dur = '2.8s';
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      {/* Doc page */}
      <g transform="translate(14, 14)">
        <rect width="110" height="76" rx="6" fill="#fff" stroke="rgba(107,63,160,0.14)" />
        <rect x="8" y="10" width="70" height="3" rx="1.5" fill="#0f172a" />
        {/* Line that will be replaced */}
        <g>
          <rect x="8" y="22" width="86" height="7" rx="2" fill="rgba(240,168,242,0.35)">
            <animate
              attributeName="fill"
              values="rgba(240,168,242,0.35);rgba(240,168,242,0.35);rgba(156,196,254,0.55);rgba(156,196,254,0.20);rgba(156,196,254,0.20)"
              keyTimes="0;0.45;0.6;0.78;1"
              dur={dur}
              repeatCount="indefinite"
            />
          </rect>
          <rect x="10" y="24" width="82" height="2" rx="1" fill="#94a3b8">
            <animate
              attributeName="opacity"
              values="1;1;0;0;0"
              keyTimes="0;0.45;0.55;0.6;1"
              dur={dur}
              repeatCount="indefinite"
            />
          </rect>
          <rect x="10" y="24" width="0" height="2" rx="1" fill="#6B3FA0">
            <animate
              attributeName="width"
              values="0;0;0;0;72;72"
              keyTimes="0;0.45;0.6;0.65;0.85;1"
              dur={dur}
              repeatCount="indefinite"
            />
          </rect>
        </g>
        <rect x="8" y="36" width="74" height="2" rx="1" fill="#cbd5e1" />
        <rect x="8" y="42" width="66" height="2" rx="1" fill="#e2e8f0" />
        <rect x="8" y="48" width="58" height="2" rx="1" fill="#e2e8f0" />
        <rect x="8" y="58" width="30" height="10" rx="2" fill="rgba(107,63,160,0.10)" />
      </g>

      {/* Chat bubble on right */}
      <g transform="translate(138, 34)">
        <g opacity="0">
          <animate
            attributeName="opacity"
            values="0;0;1;1;0;0"
            keyTimes="0;0.1;0.25;0.55;0.7;1"
            dur={dur}
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            values="138 42; 138 42; 138 34; 138 34; 138 26; 138 26"
            keyTimes="0;0.1;0.25;0.55;0.7;1"
            dur={dur}
            repeatCount="indefinite"
          />
          <rect x="-138" y="-34" width="68" height="32" rx="9" fill="#6B3FA0" transform="translate(138, 34)" />
          <rect x="6" y="6" width="50" height="2.5" rx="1" fill="#fff" opacity="0.9" />
          <rect x="6" y="12" width="42" height="2.5" rx="1" fill="#fff" opacity="0.75" />
          <rect x="6" y="18" width="30" height="2.5" rx="1" fill="#fff" opacity="0.55" />
        </g>
      </g>

      {/* Connecting arrow from bubble down to line */}
      <path d="M138 56 Q 130 60 118 46" stroke="#6B3FA0" strokeWidth="1.2" fill="none" strokeDasharray="2 3" opacity="0">
        <animate
          attributeName="opacity"
          values="0;0;0;0.55;0.55;0;0"
          keyTimes="0;0.35;0.5;0.55;0.68;0.78;1"
          dur={dur}
          repeatCount="indefinite"
        />
      </path>
      <Sparkle cx={168} cy={18} dur={dur} delay="0.2" />
      <Sparkle cx={104} cy={86} dur={dur} delay="0.75" />
    </svg>
  );
}

// ── Static "first-frame" illustrations — verbatim ports from kit ──────────

function ChatToArtifactStill() {
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="ctas-doc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F0A8F2" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#C8B6F4" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#9CC4FE" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {/* Prompt bubble — empty, waiting */}
      <rect x="10" y="26" width="90" height="32" rx="10" fill="#fff" stroke="rgba(107,63,160,0.12)" />
      <rect x="18" y="41" width="30" height="2.5" rx="1" fill="#cbd5e1" />
      {/* Arrow — faded */}
      <g transform="translate(104,42)" opacity="0.35">
        <path
          d="M0 0 L10 0 M6 -4 L10 0 L6 4"
          stroke="#6B3FA0"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Doc page — empty canvas */}
      <g transform="translate(128, 14)" opacity="0.55">
        <rect x="0" y="0" width="76" height="76" rx="6" fill="#fff" stroke="rgba(107,63,160,0.18)" />
        <rect x="0" y="0" width="76" height="8" rx="6" fill="url(#ctas-doc)" />
        <rect x="10" y="22" width="40" height="2" rx="1" fill="#e2e8f0" />
        <rect x="10" y="30" width="52" height="2" rx="1" fill="#e2e8f0" />
        <rect x="10" y="38" width="32" height="2" rx="1" fill="#e2e8f0" />
      </g>
    </svg>
  );
}

function OutlineToSlidesStill() {
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      {/* Outline card */}
      <g transform="translate(14, 18)">
        <rect width="72" height="72" rx="8" fill="#fff" stroke="rgba(107,63,160,0.14)" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx="10" cy={14 + i * 18} r="2" fill="#6B3FA0" />
            <rect
              x="16"
              y={12 + i * 18}
              width={46 - i * 8}
              height="3"
              rx="1.5"
              fill="#334155"
              opacity={0.75 - i * 0.1}
            />
            <rect x="16" y={18 + i * 18} width={34 - i * 4} height="2" rx="1" fill="#94a3b8" />
          </g>
        ))}
      </g>
      {/* Arrow / direction hint */}
      <g transform="translate(92,50)" opacity="0.45">
        <path
          d="M0 0 L12 0 M8 -4 L12 0 L8 4"
          stroke="#6B3FA0"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Slide thumbnail stack */}
      <g transform="translate(118, 22)" opacity="0.3">
        <rect width="60" height="42" rx="4" fill="#fff" stroke="rgba(107,63,160,0.22)" />
      </g>
      <g transform="translate(126, 28)" opacity="0.55">
        <rect width="60" height="42" rx="4" fill="#fff" stroke="rgba(107,63,160,0.22)" />
      </g>
      <g transform="translate(134, 34)">
        <rect width="60" height="42" rx="4" fill="#fff" stroke="rgba(107,63,160,0.22)" />
        <rect x="4" y="4" width="52" height="3" rx="1.5" fill="#6B3FA0" />
        <rect x="4" y="11" width="40" height="2" rx="1" fill="#94a3b8" />
        <rect x="4" y="18" width="22" height="20" rx="2" fill="rgba(240,168,242,0.35)" />
        <rect x="30" y="18" width="26" height="8" rx="1.5" fill="rgba(156,196,254,0.35)" />
        <rect x="30" y="30" width="26" height="8" rx="1.5" fill="rgba(200,182,244,0.35)" />
      </g>
    </svg>
  );
}

function TemplateStarterStill() {
  const templates = [
    { x: 22, y: 16, hue: '#F0A8F2' },
    { x: 82, y: 16, hue: '#C8B6F4' },
    { x: 142, y: 16, hue: '#9CC4FE' },
    { x: 22, y: 56, hue: '#9CC4FE' },
    { x: 82, y: 56, hue: '#F0A8F2' },
    { x: 142, y: 56, hue: '#C8B6F4' },
  ];
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      {templates.map((t, i) => (
        <g key={i} transform={`translate(${t.x}, ${t.y})`}>
          <rect width="48" height="32" rx="5" fill="#fff" stroke="rgba(15,23,42,0.08)" strokeWidth="1" />
          <rect x="4" y="4" width="40" height="3" rx="1.5" fill={t.hue} opacity="0.85" />
          <rect x="4" y="10" width="28" height="2" rx="1" fill="#cbd5e1" />
          <rect x="4" y="14" width="34" height="2" rx="1" fill="#e2e8f0" />
          <rect x="4" y="20" width="18" height="8" rx="1.5" fill={t.hue} opacity="0.3" />
          <rect x="26" y="20" width="18" height="8" rx="1.5" fill={t.hue} opacity="0.18" />
        </g>
      ))}
      {/* Idle cursor parked at entry */}
      <g transform="translate(30,80)" opacity="0.7">
        <path d="M0 0 L0 12 L3 9 L6 14 L8 13 L5 8 L9 8 Z" fill="#0f172a" stroke="#fff" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function RefineByChatStill() {
  return (
    <svg viewBox="0 0 220 104" style={{ width: '100%', height: '100%' }}>
      {/* Doc page */}
      <g transform="translate(14, 14)">
        <rect width="110" height="76" rx="6" fill="#fff" stroke="rgba(107,63,160,0.14)" />
        <rect x="8" y="10" width="70" height="3" rx="1.5" fill="#0f172a" />
        {/* Line that WILL be refined — subtly highlighted */}
        <rect x="8" y="22" width="86" height="7" rx="2" fill="rgba(240,168,242,0.35)" />
        <rect x="10" y="24" width="82" height="2" rx="1" fill="#94a3b8" />
        <rect x="8" y="36" width="74" height="2" rx="1" fill="#cbd5e1" />
        <rect x="8" y="42" width="66" height="2" rx="1" fill="#e2e8f0" />
        <rect x="8" y="48" width="58" height="2" rx="1" fill="#e2e8f0" />
        <rect x="8" y="58" width="30" height="10" rx="2" fill="rgba(107,63,160,0.10)" />
      </g>
      {/* Chat bubble — idle, tucked to the side */}
      <g transform="translate(138, 34)" opacity="0.6">
        <rect width="68" height="32" rx="9" fill="#6B3FA0" />
        <rect x="6" y="6" width="50" height="2.5" rx="1" fill="#fff" opacity="0.9" />
        <rect x="6" y="12" width="42" height="2.5" rx="1" fill="#fff" opacity="0.75" />
        <rect x="6" y="18" width="30" height="2.5" rx="1" fill="#fff" opacity="0.55" />
      </g>
    </svg>
  );
}
