'use client';

/**
 * Per-theme decorative cover art. Each motif is tuned to that theme's
 * character: legal themes get understated marks, creative themes go
 * bolder, branded themes echo brand DNA. Originally lived inside
 * ThemePreview as a render-time helper; extracted here so the editor
 * workspace can reuse the same artwork (at lower opacity) as a subtle
 * background pattern behind the card stack.
 *
 * Each variant ships with its own internal opacities tuned for the
 * cover-slide context (full-strength). Callers that want a quieter
 * presence wrap this in a parent div with reduced opacity / blur — see
 * `WorkspacePattern.tsx`.
 *
 * `viewBox` is uniformly 320×200 with `preserveAspectRatio` slice modes
 * that anchor each motif to its visually intentional corner — counsel's
 * compass to bottom-right, aurora's gradient to right edge, etc. So the
 * same SVG fills any container (small preview card OR full workspace)
 * without distortion, just clipping the parts that don't fit.
 */

import type { CSSProperties } from 'react';
import type { Theme } from './types';

interface CoverArtProps {
  theme: Theme;
  /** True when rendering on a dark-tone surface (cover slide for dark themes).
   *  Drives the neutral fill color (white vs. ink). */
  dark: boolean;
}

/* eslint-disable react/no-array-index-key -- ports SVG keying patterns from source */

export function CoverArt({ theme, dark }: CoverArtProps) {
  const id = theme.id;
  const wrap: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  };
  const ink = dark ? '#FFFFFF' : '#0B1F3A';

  switch (id) {
    case 'counsel':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMax slice" style={wrap}>
          <g transform="translate(248, 140)" opacity="0.18">
            <circle cx="0" cy="0" r="46" fill="none" stroke={ink} strokeWidth="0.6" />
            <circle cx="0" cy="0" r="38" fill="none" stroke={ink} strokeWidth="0.4" />
            <circle cx="0" cy="0" r="30" fill="none" stroke={ink} strokeWidth="0.4" />
            {Array.from({ length: 24 }).map((_, i) => {
              const a = (i / 24) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 38}
                  y1={Math.sin(a) * 38}
                  x2={Math.cos(a) * 46}
                  y2={Math.sin(a) * 46}
                  stroke={ink}
                  strokeWidth="0.5"
                />
              );
            })}
            <path d="M -14 -6 L 0 -18 L 14 -6 L 14 14 L -14 14 Z" fill="none" stroke={ink} strokeWidth="0.6" />
            <line x1="-8" y1="2" x2="8" y2="2" stroke={ink} strokeWidth="0.5" />
          </g>
        </svg>
      );
    case 'aurora':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice" style={wrap}>
          <defs>
            <linearGradient id={`art-${id}-a`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6B2C8E" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#E8602C" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id={`art-${id}-b`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B33C7A" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#E8602C" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M 180 -10 C 240 40, 280 80, 360 60 L 360 120 C 280 100, 240 160, 200 220 L 320 220 L 320 -20 Z" fill={`url(#art-${id}-a)`} />
          <path d="M 220 0 Q 280 90, 240 220 L 200 220 Q 250 110, 200 0 Z" fill={`url(#art-${id}-b)`} />
          <circle cx="270" cy="50" r="28" fill="#FFFFFF" opacity="0.35" />
          <circle cx="270" cy="50" r="28" fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="0.5" />
        </svg>
      );
    case 'cobalt':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice" style={wrap}>
          <g opacity="0.18">
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`v${i}`} x1={200 + i * 12} y1="0" x2={200 + i * 12} y2="200" stroke="#0F2654" strokeWidth="0.4" />
            ))}
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`h${i}`} x1="200" y1={20 + i * 20} x2="320" y2={20 + i * 20} stroke="#0F2654" strokeWidth="0.4" />
            ))}
          </g>
          <circle cx="320" cy="100" r="80" fill="none" stroke="#1F3D8A" strokeOpacity="0.35" strokeWidth="1" />
          <circle cx="320" cy="100" r="60" fill="none" stroke="#2A4F9E" strokeOpacity="0.3" strokeWidth="0.6" />
          <circle cx="270" cy="60" r="14" fill="#1F3D8A" opacity="0.35" />
        </svg>
      );
    case 'foxit-glow':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMax slice" style={wrap}>
          <defs>
            <radialGradient id={`art-${id}-sun`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#FFE5C0" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#E8602C" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#B33C0F" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="280" cy="190" r="120" fill={`url(#art-${id}-sun)`} />
          <g transform="translate(280, 190)" opacity="0.4">
            {Array.from({ length: 14 }).map((_, i) => {
              const a = (-Math.PI / 2) - (i - 7) * 0.18;
              const r1 = 70, r2 = 110;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * r1}
                  y1={Math.sin(a) * r1}
                  x2={Math.cos(a) * r2}
                  y2={Math.sin(a) * r2}
                  stroke="#B33C0F"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        </svg>
      );
    case 'volt':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" style={wrap}>
          <defs>
            <radialGradient id={`art-${id}-neb1`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#C8A8FF" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#C8A8FF" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`art-${id}-neb2`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#FFB4D4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#FFB4D4" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="240" cy="60" rx="100" ry="60" fill={`url(#art-${id}-neb1)`} />
          <ellipse cx="280" cy="160" rx="80" ry="50" fill={`url(#art-${id}-neb2)`} />
          {[[40, 30], [70, 150], [120, 40], [180, 170], [230, 30], [260, 110], [300, 60], [55, 180], [140, 100], [220, 140], [290, 180]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.2 : 0.7} fill="#FFFFFF" opacity={0.5 + (i % 3) * 0.15} />
          ))}
        </svg>
      );
    case 'quartz':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice" style={wrap}>
          <g transform="translate(255, 100)" opacity="0.85">
            <polygon points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25" fill="none" stroke="#0B1F3A" strokeWidth="0.8" opacity="0.5" />
            <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" fill="#0B1F3A" opacity="0.08" />
            <line x1="-43" y1="-25" x2="43" y2="25" stroke="#0B1F3A" strokeWidth="0.4" opacity="0.4" />
            <line x1="-43" y1="25" x2="43" y2="-25" stroke="#0B1F3A" strokeWidth="0.4" opacity="0.4" />
            <line x1="0" y1="-50" x2="0" y2="50" stroke="#0B1F3A" strokeWidth="0.4" opacity="0.4" />
          </g>
        </svg>
      );
    case 'solstice':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMax slice" style={wrap}>
          <g opacity="0.55">
            <circle cx="320" cy="200" r="170" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="0.8" />
            <circle cx="320" cy="200" r="135" fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="0.6" />
            <circle cx="320" cy="200" r="100" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.5" />
            <circle cx="320" cy="200" r="65" fill="#FFFFFF" opacity="0.3" />
            <circle cx="320" cy="200" r="40" fill="#FFE0CC" opacity="0.6" />
          </g>
        </svg>
      );
    case 'verdant':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMax slice" style={wrap}>
          <g transform="translate(260, 130)" opacity="0.5">
            <path d="M 0 60 Q -50 20 -30 -40 Q 10 -50 50 -10 Q 60 40 0 60 Z" fill="#3B6D2E" opacity="0.3" />
            <path d="M 0 60 Q -50 20 -30 -40 Q 10 -50 50 -10 Q 60 40 0 60 Z" fill="none" stroke="#1F3A1F" strokeWidth="0.6" />
            <path d="M -30 -40 Q 0 0 0 60" fill="none" stroke="#1F3A1F" strokeWidth="0.5" />
            <path d="M -20 -25 Q -5 -15 5 0 M -10 -5 Q 5 5 15 20 M 0 15 Q 10 25 20 35" stroke="#1F3A1F" strokeOpacity="0.6" strokeWidth="0.5" fill="none" />
          </g>
          <path d="M 60 200 Q 90 170 130 175 Q 180 180 220 200 Z" fill="#3B6D2E" opacity="0.18" />
        </svg>
      );
    case 'obsidian':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMax slice" style={wrap}>
          <g transform="translate(260, 200)" opacity="0.55">
            <circle cx="0" cy="0" r="100" fill="none" stroke="#D4B878" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="70" fill="none" stroke="#D4B878" strokeWidth="0.4" />
            <circle cx="0" cy="0" r="40" fill="#D4B878" opacity="0.18" />
            {Array.from({ length: 11 }).map((_, i) => {
              const a = (-Math.PI) + (i / 10) * Math.PI;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 40}
                  y1={Math.sin(a) * 40}
                  x2={Math.cos(a) * 100}
                  y2={Math.sin(a) * 100}
                  stroke="#D4B878"
                  strokeWidth="0.6"
                />
              );
            })}
          </g>
        </svg>
      );
    case 'mist':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" style={wrap}>
          <g opacity="0.55">
            <ellipse cx="160" cy="220" rx="220" ry="55" fill="#4A4F8A" opacity="0.18" />
            <ellipse cx="200" cy="240" rx="220" ry="40" fill="#7B5FA8" opacity="0.14" />
            <circle cx="245" cy="60" r="30" fill="#FFFFFF" opacity="0.5" />
            <circle cx="245" cy="60" r="30" fill="none" stroke="#4A4F8A" strokeOpacity="0.4" strokeWidth="0.5" />
          </g>
        </svg>
      );
    case 'velvet':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice" style={wrap}>
          <g transform="translate(255, 100)" opacity="0.55" stroke="#F5C0B0" fill="none" strokeWidth="0.6">
            <path d="M -50 0 Q -30 -40 0 -40 Q 30 -40 50 0 Q 30 40 0 40 Q -30 40 -50 0 Z" />
            <path d="M -35 0 Q -20 -25 0 -25 Q 20 -25 35 0 Q 20 25 0 25 Q -20 25 -35 0 Z" />
            <circle cx="0" cy="0" r="14" />
            <circle cx="0" cy="0" r="4" fill="#F5C0B0" opacity="0.5" />
            <path d="M 0 -55 L 0 -42 M 0 42 L 0 55 M -55 0 L -42 0 M 42 0 L 55 0" />
            <path d="M -38 -38 L -28 -28 M 38 -38 L 28 -28 M -38 38 L -28 28 M 38 38 L 28 28" strokeWidth="0.4" />
          </g>
        </svg>
      );
    case 'ledger':
      return (
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMaxYMid slice" style={wrap}>
          <g opacity="0.22">
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={i} x1={210 + i * 14} y1="0" x2={210 + i * 14} y2="200" stroke="#1A2B4A" strokeWidth="0.4" />
            ))}
            <line x1="210" y1="40" x2="320" y2="40" stroke="#1A2B4A" strokeWidth="0.5" />
            <line x1="210" y1="160" x2="320" y2="160" stroke="#1A2B4A" strokeWidth="0.5" />
          </g>
          <g fontFamily="'Source Serif 4', Georgia, serif" fill="#1A2B4A" opacity="0.5" fontSize="7" textAnchor="end">
            <text x="305" y="58">$ 1,240</text>
            <text x="305" y="76">$ 3,807</text>
            <text x="305" y="94">$ 9,512</text>
            <text x="305" y="112">$ 2,148</text>
            <text x="305" y="130">———————</text>
            <text x="305" y="148" fontWeight="700">$ 16,707</text>
          </g>
          <line x1="210" y1="100" x2="320" y2="100" stroke="#A8852E" strokeOpacity="0.4" strokeWidth="0.5" />
        </svg>
      );
    default:
      return null;
  }
}
