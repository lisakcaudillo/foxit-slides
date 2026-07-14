'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from './types';
import type { Card, TemplateTheme } from '@/types/card-template';
import { CoverArt } from './CoverArt';
import { SlideStage } from '@/components/card-template/SlideStage';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import { buildStructureTemplate, imageSlotsFor, type StructureFill } from '@/data/structureTemplates';

/** Apply a CSS gradient to text via background-clip. */
function gradientText(value: string): CSSProperties {
  return {
    backgroundImage: value,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: 'transparent',
  };
}

// Helper: build the slide background. `withPattern=true` only applies the
// theme's pagePattern (used on slide 1). Other slides stay clean.
//
// Always emits the same long-form properties so React's style diffing
// doesn't warn about shorthand-vs-longhand transitions when the active
// theme changes (some themes have pagePattern, some don't).
function slideBg(theme: Theme, withPattern: boolean): CSSProperties {
  const isGrad = theme.pageBg.startsWith('linear') || theme.pageBg.startsWith('radial');
  if (!withPattern || !theme.pagePattern) {
    return {
      backgroundImage: isGrad ? theme.pageBg : 'none',
      backgroundColor: isGrad ? undefined : theme.pageBg,
      backgroundSize: undefined,
      backgroundRepeat: undefined,
    };
  }
  return {
    backgroundImage: isGrad ? `${theme.pagePattern}, ${theme.pageBg}` : theme.pagePattern,
    backgroundColor: !isGrad ? theme.pageBg : undefined,
    backgroundSize: theme.pagePatternSize ? `${theme.pagePatternSize}${isGrad ? ', auto' : ''}` : undefined,
    backgroundRepeat: theme.pagePatternSize ? 'repeat, no-repeat' : undefined,
  };
}

const SLIDE_WRAP = (theme: Theme, withPattern: boolean, subtleBorder: string, bare = false): CSSProperties => ({
  ...slideBg(theme, withPattern),
  border: bare ? 'none' : `0.5px solid ${subtleBorder}`,
  borderRadius: bare ? 0 : 8,
  padding: '20px 22px',
  aspectRatio: '16 / 10',
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  flexShrink: 0,
});

// ── Cover layout variants ─────────────────────────────────────────────────
// Different templates get different title-slide layouts so they don't all
// share the same text positioning. Assigned by a stable hash of the theme id
// (deterministic, good spread). Fonts already differ per theme.
type CoverLayout = 'top' | 'centered' | 'bottom' | 'rule';
const COVER_LAYOUTS: CoverLayout[] = ['top', 'centered', 'bottom', 'rule'];
function coverLayoutFor(theme: Theme): CoverLayout {
  let h = 0;
  for (let i = 0; i < theme.id.length; i++) h = (h * 31 + theme.id.charCodeAt(i)) >>> 0;
  return COVER_LAYOUTS[h % COVER_LAYOUTS.length];
}
const COVER_LAYOUT_STYLES: Record<CoverLayout, {
  justify: CSSProperties['justifyContent'];
  align: CSSProperties['alignItems'];
  textAlign: CSSProperties['textAlign'];
  titleSize: number;
  maxWidth: string;
}> = {
  top:      { justify: 'flex-start', align: 'flex-start', textAlign: 'left',   titleSize: 27, maxWidth: '80%' },
  centered: { justify: 'center',     align: 'center',     textAlign: 'center', titleSize: 30, maxWidth: '86%' },
  bottom:   { justify: 'flex-end',   align: 'flex-start', textAlign: 'left',   titleSize: 31, maxWidth: '82%' },
  rule:     { justify: 'center',     align: 'flex-start', textAlign: 'left',   titleSize: 26, maxWidth: '80%' },
};

// CoverArt has been extracted to ./CoverArt.tsx so the editor's
// WorkspacePattern can reuse the same artwork at lower opacity.

interface SlideProps {
  theme: Theme;
  tStyle: CSSProperties;
  accent: string;
  dark: boolean;
  subtleBorder: string;
  /** Optional library image for the cover slide. When set, the cover uses
   *  the photo (with a scrim + light text) instead of the CoverArt motif. */
  coverImage?: string;
  /** Drop the slide's own border + radius (used when the cover is rendered
   *  flush as a template thumbnail). */
  bare?: boolean;
}

// SLIDE 1 — Cover: big title + eyebrow + per-theme decorative art (or a
// library photo when coverImage is provided).
function SlideCover({ theme, tStyle, accent, dark, subtleBorder, coverImage, bare }: SlideProps) {
  if (coverImage) {
    return (
      <div style={SLIDE_WRAP(theme, true, subtleBorder, bare)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImage}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(8,6,18,0.04) 28%, rgba(8,6,18,0.34) 62%, rgba(8,6,18,0.66) 100%)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}>
          <div style={{ fontFamily: theme.bodyFont, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
            {theme.name} · Title slide
          </div>
          <div style={{ fontFamily: theme.titleFont, fontSize: 28, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#ffffff', marginBottom: 8, maxWidth: '78%', textShadow: '0 1px 16px rgba(0,0,0,0.42)' }}>
            Your title goes here.
          </div>
          <div style={{ fontFamily: theme.bodyFont, fontSize: 12, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5, maxWidth: '70%' }}>
            A subhead lives here, with a bit of supporting context for the cover.
          </div>
        </div>
      </div>
    );
  }
  const layout = coverLayoutFor(theme);
  const L = COVER_LAYOUT_STYLES[layout];
  return (
    <div style={{ ...SLIDE_WRAP(theme, true, subtleBorder, bare), justifyContent: L.justify, alignItems: L.align }}>
      <CoverArt theme={theme} dark={dark} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: L.align, textAlign: L.textAlign, maxWidth: L.maxWidth }}>
        {layout === 'rule' && (
          <div style={{ width: 30, height: 3, borderRadius: 2, background: theme.primaryBg, marginBottom: 12 }} />
        )}
        <div style={{
          fontFamily: theme.bodyFont, fontSize: 9.5, fontWeight: 600,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: theme.bodyColor, opacity: 0.7, marginBottom: 8,
        }}>
          {theme.name} · Document theme
        </div>
        <div style={{ ...tStyle, fontSize: L.titleSize, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Your title goes here.
        </div>
        <div style={{ fontFamily: theme.bodyFont, fontSize: 12, color: theme.bodyColor, lineHeight: 1.5 }}>
          A subhead lives here, with a bit of supporting context for the cover.
        </div>
      </div>
    </div>
  );
}

// SLIDE 2 — Content: heading, body w/ link, two smart-layout boxes, buttons.
function SlideContent({ theme, tStyle, dark, subtleBorder }: SlideProps) {
  const smartBoxBg = dark ? 'rgba(255,255,255,0.06)' : 'rgba(20,34,60,0.05)';
  const linkStyle: CSSProperties = {
    color: theme.linkColor,
    textDecoration: 'underline', textDecorationThickness: 1, textUnderlineOffset: 2,
    fontWeight: 600,
  };
  return (
    <div style={SLIDE_WRAP(theme, false, subtleBorder)}>
      <div style={{ fontFamily: theme.bodyFont, fontSize: 9.5, fontWeight: 600, color: theme.bodyColor, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Section
      </div>
      <div style={{ ...tStyle, fontSize: 19, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.014em', marginBottom: 8 }}>
        This is a heading
      </div>
      <div style={{ fontFamily: theme.bodyFont, fontSize: 11.5, color: theme.bodyColor, lineHeight: 1.55, marginBottom: 12 }}>
        Body text supports your heading. Change fonts, colors, and layout later.{' '}
        <span style={linkStyle}>This is a link.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: smartBoxBg, padding: '9px 11px', borderRadius: 6, fontFamily: theme.bodyFont, fontSize: 10.5, color: theme.bodyColor, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, color: dark ? 'rgba(255,255,255,0.9)' : '#0f172a', marginBottom: 2 }}>First point</div>
          A short supporting sentence.
        </div>
        <div style={{ background: smartBoxBg, padding: '9px 11px', borderRadius: 6, fontFamily: theme.bodyFont, fontSize: 10.5, color: theme.bodyColor, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, color: dark ? 'rgba(255,255,255,0.9)' : '#0f172a', marginBottom: 2 }}>Second point</div>
          Equally important detail.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button style={{
          background: theme.primaryBg, color: theme.primaryFg,
          border: '0.5px solid transparent', padding: '7px 14px',
          fontSize: 11.5, borderRadius: theme.btnRadius,
          fontFamily: theme.bodyFont, fontWeight: 600, cursor: 'pointer',
        }}>Primary button</button>
        <button style={{
          background: theme.secondaryBg, color: theme.secondaryFg,
          border: `0.5px solid ${theme.secondaryBorder}`,
          padding: '7px 14px', fontSize: 11.5, borderRadius: theme.btnRadius,
          fontFamily: theme.bodyFont, fontWeight: 600, cursor: 'pointer',
        }}>Secondary button</button>
      </div>
    </div>
  );
}

// SLIDE 3 — Data: title + chart visual + body text.
function SlideData({ theme, tStyle, accent, dark, subtleBorder }: SlideProps) {
  const inkSoft = dark ? 'rgba(255,255,255,0.3)' : 'rgba(20,34,60,0.25)';
  return (
    <div style={SLIDE_WRAP(theme, false, subtleBorder)}>
      <div style={{ fontFamily: theme.bodyFont, fontSize: 9.5, fontWeight: 600, color: theme.bodyColor, opacity: 0.7, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Performance
      </div>
      <div style={{ ...tStyle, fontSize: 17, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.012em', marginBottom: 12 }}>
        Quarterly results, at a glance
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'stretch', flex: 1 }}>
        {/* Chart */}
        <div style={{ borderRadius: 6, overflow: 'hidden', border: `0.5px solid ${subtleBorder}`, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.5)', padding: 10 }}>
          <svg viewBox="0 0 200 110" width="100%" height="100%" preserveAspectRatio="none">
            {/* grid */}
            {[20, 45, 70, 95].map((y) => (
              <line key={y} x1="6" y1={y} x2="194" y2={y} stroke={inkSoft} strokeWidth="0.4" strokeDasharray="1 1.5" />
            ))}
            {/* bars */}
            {[
              [16, 70, 30], [42, 58, 42], [68, 76, 24], [94, 42, 58], [120, 52, 48], [146, 30, 70], [172, 18, 82],
            ].map(([x, y, h], i) => (
              <rect key={i} x={x} y={y} width="14" height={h} rx="1.2" fill={accent} opacity={0.45 + i * 0.07} />
            ))}
            {/* trendline */}
            <path d="M 23 78 L 49 64 L 75 70 L 101 50 L 127 56 L 153 38 L 179 24" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="179" cy="24" r="2.4" fill={accent} />
            <circle cx="179" cy="24" r="4.5" fill={accent} opacity="0.25" />
          </svg>
        </div>
        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          {[
            { label: 'Revenue', value: '$4.82M', delta: '+12.4%' },
            { label: 'Active accounts', value: '1,284', delta: '+8.1%' },
            { label: 'Renewal rate', value: '94%', delta: '+2.0%' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: theme.bodyFont, fontSize: 9.5, color: theme.bodyColor, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ ...tStyle, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{s.value}</span>
                <span style={{ fontFamily: theme.bodyFont, fontSize: 10, fontWeight: 600, color: accent }}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ThemePreviewProps {
  theme: Theme;
  /** Optional library image used on the cover slide only. */
  coverImage?: string;
}

// Live document preview — three slide-style cards (cover, content, data).
// Subtle pattern (if any) appears on slide 1 only.
/** Shared cover-slide params (title style, accent, tone, border). */
function coverParams(theme: Theme) {
  const tStyle: CSSProperties = theme.titleStyle === 'gradient'
    ? { ...gradientText(theme.titleColor), fontFamily: theme.titleFont }
    : { color: theme.titleColor, fontFamily: theme.titleFont };
  const accent = theme.tone === 'dark'
    ? (theme.linkColor || '#C8A8FF')
    : (typeof theme.titleColor === 'string' && theme.titleColor.startsWith('#'))
      ? theme.titleColor
      : (theme.linkColor || '#475569');
  const dark = theme.tone === 'dark';
  const subtleBorder = dark ? 'rgba(255,255,255,0.12)' : 'rgba(20,34,60,0.12)';
  return { tStyle, accent, dark, subtleBorder };
}

// ── TRUE-layout preview ──────────────────────────────────────────────────────
// Instead of schematic mock slides, render the skin's REAL layouts through the
// same builder + renderer the generator/editor use (buildStructureTemplate →
// SlideStage/FreeformLayer), so the picker shows exactly what a generated deck
// produces. Representative set: a cover, a content page, a data/stat page.
// The REAL combo layouts the generator ships (NOT the legacy 05-content/02-stat,
// which are gated out of generation): a cover, a cards page, a metrics page.
// Combo layouts are writer-filled skeletons with no built-in placeholders, so it
// supply neutral placeholder content keyed by each layout's `role:group` slots.
const PREVIEW_LAYOUTS: { layout: string; fill: StructureFill }[] = [
  {
    layout: 'combo-cover',
    fill: {
      'title:': 'Your title goes here',
      'body:lead': 'A short supporting line for the cover.',
      'author:': 'Presenter name',
      'date:': 'Month 2026',
    },
  },
  {
    // Content slide WITH an image — two subheadered sections beside a photo
    // (the image is injected below). A real content layout, not a lone paragraph.
    layout: 'combo-body-image-2',
    fill: {
      'eyebrow-label:': 'OVERVIEW',
      'title:': 'Your title goes here',
      'subheader:s1': 'First point',
      'body:p1': 'A short supporting line explaining the first point beside the image.',
      'subheader:s2': 'Second point',
      'body:p2': 'A short supporting line explaining the second point.',
    },
  },
  {
    // Icon cards — three points, each with a pictogram (auto-filled from the
    // library on the icon-badge decorations).
    layout: '11-infographic',
    fill: {
      'eyebrow-label:': 'HOW IT WORKS',
      'title:': 'Your title goes here',
      'metric-label:card-title': ['Discover', 'Design', 'Deliver'],
      'body:card-body': [
        'A short line about this step.',
        'A short line about this step.',
        'A short line about this step.',
      ],
    },
  },
];

const PLACEHOLDER_IMAGE = '/theme-examples/winter-lake.webp';
const FRAME_W = 960;
const FRAME_H = 540;

/** Build the skin's real layouts. Returns [] for non-structure skins so the
 *  caller can fall back to the schematic mock preview. */
function useTrueLayouts(skinId: string) {
  return useMemo(() => {
    const out: { card: Card; theme: TemplateTheme }[] = [];
    for (const { layout, fill } of PREVIEW_LAYOUTS) {
      try {
        const tpl = buildStructureTemplate(layout, skinId, fill);
        const card = tpl.cards[0];
        if (!card) continue;
        // Images come from the deck-image pipeline, not the text fill — so drop a
        // neutral placeholder photo into any image slot for the preview.
        const imgSlots = imageSlotsFor(layout, skinId);
        if (imgSlots.length) {
          card.freeform = [
            ...(card.freeform ?? []),
            ...imgSlots.map((s, si) => ({
              id: `preview-img-${si}`,
              type: 'image' as const,
              x: (s.x / FRAME_W) * 100,
              y: (s.y / FRAME_H) * 100,
              w: (s.w / FRAME_W) * 100,
              h: (s.h / FRAME_H) * 100,
              rotation: 0,
              z: 5,
              src: PLACEHOLDER_IMAGE,
              fit: 'cover' as const,
            })),
          ];
        }
        out.push({ card, theme: tpl.theme });
      } catch {
        /* skin has no structure build → skip this layout */
      }
    }
    return out;
  }, [skinId]);
}

function TrueLayoutColumn({ built, dark }: { built: { card: Card; theme: TemplateTheme }[]; dark: boolean }) {
  const colRef = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(0);
  useEffect(() => {
    const el = colRef.current;
    if (!el) return;
    const update = () => setColW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Render each real slide at its canonical 960×540 and scale the whole thing to
  // the column width (fonts are baked in px, so uniform transform-scale is the
  // only faithful way to shrink it).
  const scale = colW ? colW / FRAME_W : 0;
  const border = dark ? 'rgba(255,255,255,0.14)' : 'rgba(20,34,60,0.12)';
  const fonts = [...new Set(built.flatMap((b) => [b.theme.headingFont, b.theme.bodyFont].filter((f): f is string => !!f)))];
  return (
    <div ref={colRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'auto', paddingRight: 4 }}>
      <GoogleFonts fonts={fonts} />
      {scale > 0 && built.map((b, i) => (
        <div key={i} style={{ width: '100%', height: FRAME_H * scale, flexShrink: 0, borderRadius: 8, border: `0.5px solid ${border}`, overflow: 'hidden' }}>
          <div style={{ width: FRAME_W, height: FRAME_H, transformOrigin: 'top left', transform: `scale(${scale})` }}>
            <SlideStage card={b.card} theme={b.theme} width={FRAME_W} height={FRAME_H} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThemePreview({ theme, coverImage }: ThemePreviewProps) {
  const built = useTrueLayouts(theme.id);
  const { tStyle, accent, dark, subtleBorder } = coverParams(theme);

  // Structure skins → show the REAL layouts. Non-structure themes (approximation
  // covers in the studio gallery) → fall back to the schematic mock below.
  if (built.length > 0) return <TrueLayoutColumn built={built} dark={dark} />;

  // Entrance animation: on first mount the three slides appear stacked behind
  // the middle slide (Cover translated DOWN, Data translated UP, both slightly
  // scaled and dimmed). They then fan out into their natural positions —
  // Cover slides up, Data slides down, Content gently fades in. The animation
  // only fires when ThemePreview first mounts (modal open). On theme switch
  // the theme prop changes but the wrappers stay mounted, so the animation
  // doesn't replay.
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      height: '100%',
      overflow: 'auto',
      paddingRight: 4,
    }}>
      <div style={{ animation: 'theme-fan-top 520ms cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '60ms' }}>
        <SlideCover theme={theme} tStyle={tStyle} accent={accent} dark={dark} subtleBorder={subtleBorder} coverImage={coverImage} />
      </div>
      <div style={{ animation: 'theme-fan-middle 360ms ease-out both' }}>
        <SlideContent theme={theme} tStyle={tStyle} accent={accent} dark={dark} subtleBorder={subtleBorder} />
      </div>
      <div style={{ animation: 'theme-fan-bottom 520ms cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '60ms' }}>
        <SlideData theme={theme} tStyle={tStyle} accent={accent} dark={dark} subtleBorder={subtleBorder} />
      </div>
      <style>{`
        @keyframes theme-fan-top {
          from {
            transform: translateY(calc(100% + 12px)) scale(0.96);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes theme-fan-middle {
          from { opacity: 0.55; transform: scale(0.985); }
          to   { opacity: 1;    transform: scale(1); }
        }
        @keyframes theme-fan-bottom {
          from {
            transform: translateY(calc(-100% - 12px)) scale(0.96);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes theme-fan-top    { from, to { transform: none; opacity: 1; } }
          @keyframes theme-fan-middle { from, to { transform: none; opacity: 1; } }
          @keyframes theme-fan-bottom { from, to { transform: none; opacity: 1; } }
        }
      `}</style>
    </div>
  );
}
