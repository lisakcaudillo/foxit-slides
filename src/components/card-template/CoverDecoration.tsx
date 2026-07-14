'use client';

/**
 * CoverDecoration.tsx — the decorative background of the three approved
 * Quartz/Editorial cover designs (Design Table, 2026-06-13), rendered as
 * SVG VECTOR + PNG DECAL.
 *
 * ARCHITECTURE:
 *   Per ELEMENT — render as SVG vector if representable; render the frost /
 *   blend-mode / heavy-blur elements as a transparent-background PNG decal
 *   layered via <image>. One <svg viewBox="0 0 960 540"> per treatment scales
 *   to whatever box the caller sizes (full slide, thumbnail, PDF) — pure vector
 *   plus at most one raster decal.
 *
 *   A2-glass-ribbon.html    → 'glass-ribbon'   — vector radial base wash + decal
 *                             (glows + frosted ribbon + speculars, baked together
 *                              because the frost samples the glows).
 *   C2-fullbleed-waves.html → 'warm-waves'     — FULLY VECTOR, no decal. The two
 *                             CSS blur classes become SVG feGaussianBlur filters.
 *   D-diagonal-split.html   → 'diagonal-split' — vector base + clipped art
 *                             linear/radial gradients + vector arcs + vector seam
 *                              + blobs decal (the 3 mix-blend-mode .blobs).
 *
 * Decal registry → PATTERN_ASSETS in cover-layout-pieces.ts. Every <defs>
 * gradient/filter id is treatment-prefixed (cd-ww-… / cd-gr-… / cd-ds-…) so
 * multiple covers on one page never collide on url(#id). No text, no fonts —
 * decoration only. Returns null for an unknown layoutId/treatment.
 */

import {
  COVER_LAYOUT_PIECES,
  PATTERN_ASSETS,
  type CoverTreatment,
} from '@/lib/card-engine/cover-layout-pieces';

export interface CoverDecorationProps {
  /** One of cover-glass-ribbon | cover-warm-waves | cover-diagonal-split. */
  layoutId: string;
  /** Card width in px (reference 960). Defaults to 960. */
  width?: number;
  /** Card height in px (reference 540). Defaults to 540. */
  height?: number;
}

// ── warm-waves — FULLY VECTOR (lifted verbatim from C2-fullbleed-waves.html) ───
// The two CSS blur classes become SVG filters:
//   .wave-soft  blur(6px)   → feGaussianBlur stdDeviation 6  (+ opacity 0.85)
//   .wave-blur  blur(0.6px) → feGaussianBlur stdDeviation 0.6
function WarmWavesDecoration(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 960 540"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        {/* base sky: warm dawn peach top-left, cooling to a soft blue */}
        <linearGradient id="cd-ww-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbeee6" />
          <stop offset="45%" stopColor="#f3e8ef" />
          <stop offset="100%" stopColor="#e3e7f7" />
        </linearGradient>
        {/* far wave: peach → lavender */}
        <linearGradient id="cd-ww-w1" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor="#f6d8c8" />
          <stop offset="100%" stopColor="#cfd0ef" />
        </linearGradient>
        {/* mid wave: rose → periwinkle */}
        <linearGradient id="cd-ww-w2" x1="0.05" y1="0" x2="0.95" y2="0.4">
          <stop offset="0%" stopColor="#eebcb4" />
          <stop offset="55%" stopColor="#c2b6e2" />
          <stop offset="100%" stopColor="#9aa6e0" />
        </linearGradient>
        {/* deeper wave: warm dusk rose → periwinkle → ocean */}
        <linearGradient id="cd-ww-w3" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stopColor="#d99aa0" />
          <stop offset="50%" stopColor="#8a8fd0" />
          <stop offset="100%" stopColor="#6a96c6" />
        </linearGradient>
        {/* darkest accent crest: muted plum-indigo → ocean blue */}
        <linearGradient id="cd-ww-w4" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#a06a9a" />
          <stop offset="55%" stopColor="#5f6fbf" />
          <stop offset="100%" stopColor="#5b8fbf" />
        </linearGradient>
        {/* curved-divide soft shadow band */}
        <linearGradient id="cd-ww-divshade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a2e3e" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#5a2e3e" stopOpacity="0" />
        </linearGradient>
        {/* CSS blur(6px) ≈ feGaussianBlur stdDeviation 6 */}
        <filter id="cd-ww-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {/* CSS blur(0.6px) ≈ feGaussianBlur stdDeviation 0.6 */}
        <filter id="cd-ww-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>

      {/* base sky fills the whole card, bleeds all edges */}
      <rect x="-20" y="-20" width="1000" height="580" fill="url(#cd-ww-sky)" />

      {/* soft far wave, blurred, bleeding off top + sides (.wave-soft) */}
      <path
        d="M-40,-40 C 220,40 470,-10 720,70 C 880,120 980,60 1000,40 L1000,-60 L-40,-60 Z"
        fill="url(#cd-ww-w1)"
        opacity="0.85"
        filter="url(#cd-ww-soft)"
      />

      {/* mid wave layer, bleeds off right + top (.wave-blur) */}
      <path
        d="M-40,-40 C 200,90 430,40 660,130 C 820,190 940,150 1000,120 L1000,-60 L-40,-60 Z"
        fill="url(#cd-ww-w2)"
        opacity="0.9"
        filter="url(#cd-ww-blur)"
      />

      {/* deeper wave, the visual mass, bleeds off top/left/right */}
      <path
        d="M-40,-40 C 180,120 420,70 640,170 C 800,240 920,200 1000,180 L1000,-60 L-40,-60 Z"
        fill="url(#cd-ww-w3)"
        opacity="0.95"
      />

      {/* darkest accent crest, hugs upper band, bleeds left + right (.wave-blur) */}
      <path
        d="M-40,-40 C 160,70 360,30 540,90 C 700,140 860,110 1000,90 L1000,-60 L-40,-60 Z"
        fill="url(#cd-ww-w4)"
        opacity="0.5"
        filter="url(#cd-ww-blur)"
      />

      {/* CURVED DIVIDE — soft shadow band above + the white curved divide */}
      <path d="M0,232 C 260,300 620,232 960,288 L960,360 L0,360 Z" fill="url(#cd-ww-divshade)" />
      <path d="M0,250 C 260,318 620,250 960,306 L960,540 L0,540 Z" fill="#ffffff" />
    </svg>
  );
}

// ── glass-ribbon — vector radial base wash + PNG decal ─────────────────────────
// Base: the approved .card radial-gradient(120% 90% at 8% 0%, …) as an SVG
// radialGradient. The glows + frosted ribbon + speculars are the baked decal
// (the frost samples the glows, so they ship together as one PNG).
function GlassRibbonDecoration(): React.JSX.Element | null {
  const decal = PATTERN_ASSETS['glass-ribbon'];
  if (!decal) return null;
  return (
    <svg
      viewBox="0 0 960 540"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        {/*
          CSS: radial-gradient(120% 90% at 8% 0%, #fdfbf9 0%, #f6f5f8 42%, #eef0f6 100%)
          → ellipse centered at (8%,0%) with radii (120% width, 90% height).
          userSpaceOnUse: cx=76.8 cy=0, rx=1152 ry=486.
        */}
        <radialGradient
          id="cd-gr-base"
          gradientUnits="userSpaceOnUse"
          cx="76.8"
          cy="0"
          r="1152"
          fx="76.8"
          fy="0"
          gradientTransform="matrix(1 0 0 0.421875 0 0)"
        >
          <stop offset="0%" stopColor="#fdfbf9" />
          <stop offset="42%" stopColor="#f6f5f8" />
          <stop offset="100%" stopColor="#eef0f6" />
        </radialGradient>
      </defs>

      {/* vector base wash */}
      <rect x="0" y="0" width="960" height="540" fill="url(#cd-gr-base)" />

      {/* baked decal: glows + frosted glass ribbon + speculars */}
      <image href={decal.path} x="0" y="0" width="960" height="540" preserveAspectRatio="none" />
    </svg>
  );
}

// ── diagonal-split — vector base + clipped art gradients + arcs + seam + decal ──
function DiagonalSplitDecoration(): React.JSX.Element | null {
  const decal = PATTERN_ASSETS['diagonal-split'];
  if (!decal) return null;
  // CSS clip-path: polygon(0 0, 38% 0, 70% 100%, 0 100%) on 960×540
  // → 0,0  364.8,0  672,540  0,540
  const artClip = '0,0 364.8,0 672,540 0,540';
  return (
    <svg
      viewBox="0 0 960 540"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id="cd-ds-artclip">
          <polygon points={artClip} />
        </clipPath>
        {/*
          .art linear-gradient(150deg, #FFD9C2 0%, #F2A9BE 46%, #A9BEE6 100%)
          150° on 960×540 → endpoints (computed per CSS spec, userSpaceOnUse):
          (243.09,-140.35) → (716.91,680.35).
        */}
        <linearGradient
          id="cd-ds-art"
          gradientUnits="userSpaceOnUse"
          x1="243.09"
          y1="-140.35"
          x2="716.91"
          y2="680.35"
        >
          <stop offset="0%" stopColor="#FFD9C2" />
          <stop offset="46%" stopColor="#F2A9BE" />
          <stop offset="100%" stopColor="#A9BEE6" />
        </linearGradient>
        {/* radial accent washes, in CSS paint order (peach, rose, blue) */}
        {/* radial-gradient(120% 90% at 8% 12%, #FFE3CE 0%, transparent 55%) */}
        <radialGradient
          id="cd-ds-peach"
          gradientUnits="userSpaceOnUse"
          cx="76.8"
          cy="64.8"
          r="1152"
          fx="76.8"
          fy="64.8"
          gradientTransform="matrix(1 0 0 0.405 0 38.556)"
        >
          <stop offset="0%" stopColor="#FFE3CE" stopOpacity="1" />
          <stop offset="55%" stopColor="#FFE3CE" stopOpacity="0" />
        </radialGradient>
        {/* radial-gradient(110% 100% at 22% 78%, #F4B6C2 0%, transparent 58%) */}
        <radialGradient
          id="cd-ds-rose"
          gradientUnits="userSpaceOnUse"
          cx="211.2"
          cy="421.2"
          r="1056"
          fx="211.2"
          fy="421.2"
          gradientTransform="matrix(1 0 0 0.511364 0 205.81)"
        >
          <stop offset="0%" stopColor="#F4B6C2" stopOpacity="1" />
          <stop offset="58%" stopColor="#F4B6C2" stopOpacity="0" />
        </radialGradient>
        {/* radial-gradient(130% 120% at -10% 100%, #B9C9E8 0%, transparent 60%) */}
        <radialGradient
          id="cd-ds-blue"
          gradientUnits="userSpaceOnUse"
          cx="-96"
          cy="540"
          r="1248"
          fx="-96"
          fy="540"
          gradientTransform="matrix(1 0 0 0.519231 0 259.62)"
        >
          <stop offset="0%" stopColor="#B9C9E8" stopOpacity="1" />
          <stop offset="60%" stopColor="#B9C9E8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* vector base — the clean Quartz title zone */}
      <rect x="0" y="0" width="960" height="540" fill="#FBFAF7" />

      {/* ART ZONE — clipped to the diagonal seam */}
      <g clipPath="url(#cd-ds-artclip)">
        {/* base linear gradient (bottom of the CSS stack) */}
        <rect x="0" y="0" width="960" height="540" fill="url(#cd-ds-art)" />
        {/* radial accent washes stacked above it */}
        <rect x="0" y="0" width="960" height="540" fill="url(#cd-ds-blue)" />
        <rect x="0" y="0" width="960" height="540" fill="url(#cd-ds-rose)" />
        <rect x="0" y="0" width="960" height="540" fill="url(#cd-ds-peach)" />

        {/* baked blobs decal (the 3 mix-blend-mode .blobs), clipped to art */}
        <image
          href={decal.path}
          x="0"
          y="0"
          width="960"
          height="540"
          preserveAspectRatio="none"
        />

        {/* faint petal-arc strokes for editorial texture (vector, verbatim) */}
        <g fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.2">
          <path d="M-40,120 C90,60 210,140 250,300 C280,420 180,520 60,560" />
          <path d="M-60,250 C60,210 170,280 200,420 C220,510 140,580 40,600" />
        </g>
        <g fill="none" stroke="#0B1F3A" strokeOpacity="0.10" strokeWidth="1">
          <path d="M-20,40 C120,40 230,180 290,360" />
        </g>
      </g>

      {/* SEAM hairline along the diagonal edge (vector, verbatim) */}
      <line x1="364.8" y1="0" x2="672" y2="540" stroke="#0B1F3A" strokeOpacity="0.16" strokeWidth="1" />
      <line x1="372" y1="0" x2="679" y2="540" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2" />
    </svg>
  );
}

const TREATMENT_RENDERERS: Record<CoverTreatment, () => React.JSX.Element | null> = {
  'glass-ribbon': GlassRibbonDecoration,
  'warm-waves': WarmWavesDecoration,
  'diagonal-split': DiagonalSplitDecoration,
};

/**
 * Renders the SVG-vector + PNG-decal decorative background for an approved
 * Quartz cover layout. A full-card absolutely-positioned layer behind the text
 * (z-index 0, pointer-events none) containing ONE scaling <svg>. Returns null
 * for an unknown layoutId/treatment.
 */
export default function CoverDecoration({
  layoutId,
  width = 960,
  height = 540,
}: CoverDecorationProps): React.JSX.Element | null {
  const piece = COVER_LAYOUT_PIECES[layoutId];
  if (!piece) return null;
  const Renderer = TREATMENT_RENDERERS[piece.treatment];
  if (!Renderer) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <Renderer />
    </div>
  );
}
