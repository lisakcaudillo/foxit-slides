'use client';

/**
 * FrameworkThumbnail — inline SVG preview rendered inside framework tiles
 * (cards gallery and home Create modal). Replaces the prior random nature
 * photos with topic-relevant infographic-style schematics
 * (2026-05-16): "for the templates images, think infographics, diagrams,
 * image and text simplified."
 *
 * Each framework declares a `thumbnailLayout` in data/frameworks.ts that
 * picks one of four mini-diagrams:
 *
 *   chart     — heading line + bar chart (good for analytics, reviews,
 *               pitches, financial work)
 *   timeline  — horizontal milestone strip (good for roadmaps, project
 *               briefs, lesson plans, post-mortems)
 *   grid      — 2x2 icon-card grid (good for team updates, onboarding,
 *               group projects, frameworks)
 *   story     — single hero image area + caption + bullets (good for
 *               product launches, personal stories, trip recaps, legal
 *               memos)
 *
 * Category drives the accent color so frameworks from the same domain
 * share a visual family at a glance:
 *
 *   business / go-to-market / executive — violet (#6B3FA0) — primary brand
 *   educational                          — teal   (#0891B2)
 *   personal                             — orange (#EA580C)
 *
 * All layouts use viewBox="0 0 400 300" with preserveAspectRatio so they
 * scale crisply into the 4:3 thumbnail slot. No external dependencies,
 * no <img> tag — pure inline SVG.
 */

import type { FrameworkCategory, ThumbnailLayout } from '@/data/frameworks';

type Props = {
  layout: ThumbnailLayout;
  category: FrameworkCategory;
  /** Optional override for the accent hex. Falls back to the category color. */
  accent?: string;
};

const CATEGORY_ACCENT: Record<FrameworkCategory, string> = {
  'go-to-market': '#6B3FA0',
  'educational': '#0891B2',
  'storytelling': '#EA580C',
};

export function FrameworkThumbnail({ layout, category, accent }: Props) {
  const color = accent ?? CATEGORY_ACCENT[category] ?? '#6B3FA0';
  const soft = color + '22'; // ~13% alpha
  const softer = color + '11';
  const ink = '#1a1f36';
  const muted = '#cbd5e1';

  // Background is a very light tinted card so the SVG reads as a "mini
  // slide" rather than a free-floating diagram.
  const bg = (
    <>
      <rect width="400" height="300" fill="white" />
      <rect width="400" height="300" fill={softer} />
    </>
  );

  // Shared heading bar — every layout opens with a colored heading line +
  // a thin underline accent so the previews feel like uniform slide types.
  const heading = (
    <>
      <rect x="24" y="28" width="180" height="14" rx="3" fill={ink} opacity="0.85" />
      <rect x="24" y="50" width="60" height="3" rx="1.5" fill={color} />
    </>
  );

  switch (layout) {
    case 'chart':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
          {bg}
          {heading}
          {/* Bar chart — 5 ascending bars */}
          <g transform="translate(24, 92)">
            <rect x="0"   y="80" width="50" height="40" rx="3" fill={soft} />
            <rect x="64"  y="60" width="50" height="60" rx="3" fill={color} opacity="0.55" />
            <rect x="128" y="38" width="50" height="82" rx="3" fill={color} opacity="0.75" />
            <rect x="192" y="20" width="50" height="100" rx="3" fill={color} />
            <rect x="256" y="48" width="50" height="72" rx="3" fill={color} opacity="0.55" />
            {/* x-axis baseline */}
            <rect x="0" y="122" width="306" height="2" rx="1" fill={muted} />
          </g>
          {/* Caption lines */}
          <rect x="24" y="244" width="280" height="6" rx="3" fill={muted} />
          <rect x="24" y="258" width="200" height="6" rx="3" fill={muted} opacity="0.55" />
        </svg>
      );

    case 'timeline':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
          {bg}
          {heading}
          {/* Horizontal timeline track with 4 milestones */}
          <g transform="translate(24, 130)">
            <rect x="0" y="14" width="352" height="3" rx="1.5" fill={muted} />
            {[0, 1, 2, 3].map((i) => (
              <g key={i} transform={`translate(${i * 117}, 0)`}>
                <circle cx="16" cy="15.5" r="12" fill={i === 0 ? color : 'white'} stroke={color} strokeWidth="2.5" />
                <rect x="0" y="38" width="56" height="6" rx="3" fill={ink} opacity="0.7" />
                <rect x="0" y="50" width="40" height="5" rx="2.5" fill={muted} />
              </g>
            ))}
          </g>
          {/* Two text rows at bottom */}
          <rect x="24" y="244" width="240" height="6" rx="3" fill={muted} />
          <rect x="24" y="258" width="160" height="6" rx="3" fill={muted} opacity="0.55" />
        </svg>
      );

    case 'grid':
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
          {bg}
          {heading}
          {/* 2x2 card grid — each card has a colored block + two text lines */}
          {[
            { x: 24,  y: 80,  fill: color, opacity: 0.85 },
            { x: 212, y: 80,  fill: color, opacity: 0.55 },
            { x: 24,  y: 178, fill: color, opacity: 0.4  },
            { x: 212, y: 178, fill: color, opacity: 0.7  },
          ].map((c, i) => (
            <g key={i} transform={`translate(${c.x}, ${c.y})`}>
              <rect x="0" y="0" width="164" height="88" rx="8" fill="white" stroke={muted} strokeWidth="1" />
              <rect x="12" y="12" width="22" height="22" rx="5" fill={c.fill} opacity={c.opacity} />
              <rect x="12" y="46" width="120" height="6" rx="3" fill={ink} opacity="0.65" />
              <rect x="12" y="60" width="80" height="5" rx="2.5" fill={muted} />
              <rect x="12" y="72" width="100" height="5" rx="2.5" fill={muted} opacity="0.55" />
            </g>
          ))}
        </svg>
      );

    case 'story':
    default:
      return (
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
          {bg}
          {heading}
          {/* Hero "image" area — gradient block with abstract shapes */}
          <g transform="translate(24, 80)">
            <defs>
              <linearGradient id={`heroGrad-${layout}-${category}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.75" />
                <stop offset="100%" stopColor={color} stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="200" height="140" rx="10" fill={`url(#heroGrad-${layout}-${category})`} />
            <circle cx="44" cy="44" r="20" fill="white" opacity="0.35" />
            <rect x="80" y="80" width="80" height="6" rx="3" fill="white" opacity="0.55" />
            <rect x="80" y="94" width="50" height="6" rx="3" fill="white" opacity="0.4" />
            {/* Right-side body bullets */}
            <g transform="translate(220, 4)">
              <rect x="0" y="0" width="120" height="6" rx="3" fill={ink} opacity="0.7" />
              <rect x="0" y="16" width="140" height="5" rx="2.5" fill={muted} />
              <rect x="0" y="28" width="100" height="5" rx="2.5" fill={muted} />
              <rect x="0" y="48" width="120" height="6" rx="3" fill={ink} opacity="0.7" />
              <rect x="0" y="64" width="140" height="5" rx="2.5" fill={muted} />
              <rect x="0" y="76" width="80"  height="5" rx="2.5" fill={muted} />
              <rect x="0" y="96" width="120" height="6" rx="3" fill={ink} opacity="0.7" />
              <rect x="0" y="112" width="100" height="5" rx="2.5" fill={muted} />
              <rect x="0" y="124" width="120" height="5" rx="2.5" fill={muted} />
            </g>
          </g>
          {/* Bottom caption */}
          <rect x="24" y="244" width="200" height="6" rx="3" fill={muted} />
          <rect x="24" y="258" width="280" height="6" rx="3" fill={muted} opacity="0.55" />
        </svg>
      );
  }
}
