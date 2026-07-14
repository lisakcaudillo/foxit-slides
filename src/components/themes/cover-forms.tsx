'use client';

/**
 * Cover forms — title-slide compositions for the template gallery.
 *
 * Raised to the quality bar set with two references:
 *   · round2-expressive cover  — immersive GLASSMORPHISM: theme-tinted blurred
 *     color blobs + a frosted overlay + the title on a FROSTED GLASS PANEL.
 *   · designer-2-organic       — subtle ATMOSPHERIC motifs behind the title
 *     (aurora gradient mesh, drifting bokeh, soft glows), theme-tinted, the
 *     title always the legible hero.
 *
 * Atmospheric premium forms (glass / aurora / bokeh / darkGlow) are mixed with
 * structural ones grounded in the shared visual set (arc-split, full-bleed
 * photo, geometric pattern panel, diagonal photo wedge, solo-type). Spread
 * across themes by a stable index rotation so adjacent cards differ. Restrained
 * titles, designed-deck foot (author chip + page no). Auto-scaled to the card.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Theme } from './types';
import { THEMES } from './themes';
import { Motif, type MotifName } from './cover-motifs';

const REF_W = 480;
const REF_H = 300;
const SUB = 'A subhead with a bit of supporting context.';

function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function isGrad(bg: string): boolean { return bg.startsWith('linear') || bg.startsWith('radial'); }
function fill(theme: Theme): CSSProperties { return isGrad(theme.pageBg) ? { backgroundImage: theme.pageBg } : { backgroundColor: theme.pageBg }; }
function solidHex(bg: string): string { const m = bg.match(/#[0-9a-fA-F]{3,8}/); return m ? m[0] : '#6B3FA0'; }
function solidPrimary(theme: Theme): string { return solidHex(theme.primaryBg); }
/** hex (#rgb/#rrggbb) + 0..1 alpha → rgba(); passthrough for non-hex. */
function hexA(hex: string, a: number): string {
  let h = hex.trim();
  if (h[0] !== '#') return hex;
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// 28 distinct library images — assigned by THEME INDEX so no two templates
// share a photo (pool length > theme count → unique per template).
const IMAGES = [
  'img_mpm8i7ok_uikvr', 'img_mpmwe4z9_rozcr', 'img_mpmwe50a_fsx4u', 'img_mpmwe51f_ov38u',
  'img_mpmwe523_nv7d3', 'img_mpmwe53e_r5xnv', 'img_mpmwe54a_yvzo7', 'img_mpmwe556_dqb50',
  'img_mpmwe561_tcagz', 'img_mpmwe57b_o6tyt', 'img_mpmwe587_eykqs', 'img_mpmwe593_8c7n3',
  'img_mpmwe59y_2nog9', 'img_mpmygcr1_tz9jm', 'img_mpmygcrx_wo9ge', 'img_mpmygcsc_j75tr',
  'img_mpmygct9_70vit', 'img_mpmygcu4_4le48', 'img_mpmygcv0_s4ycz', 'img_mpmygcvw_wq5np',
  'img_mpmygcwb_jefsf', 'img_mpmygcx8_noobi', 'img_mpmygcy4_w6722', 'img_mpmygczf_ol965',
  'img_mpmygd0b_fuiez', 'img_mpmygd2t_mjczd', 'img_mpmygd44_mspui', 'img_mpmygd6c_tyrmj',
];
function imageFor(theme: Theme): string {
  const idx = Math.max(0, THEMES.findIndex((t) => t.id === theme.id));
  return `/library/images/${IMAGES[idx % IMAGES.length]}.png`;
}

// Title TREATMENTS — characterful display/serif headline faces (
// curated favorites: editorial Source Serif 4 / Fraunces). Assigned by theme
// index so the title TYPOGRAPHY varies template-to-template, not just the
// backdrop. `null` keeps the theme's own face, for variety.
const TREATMENTS: Array<{ font: string | null; weight: number }> = [
  { font: "'Source Serif 4', Georgia, serif", weight: 600 },     // editorial serif (curated favorite)
  { font: "'Fraunces', Georgia, serif", weight: 600 },           // display serif
  { font: "'Space Grotesk', system-ui, sans-serif", weight: 700 }, // grotesk
  { font: "'Playfair Display', Georgia, serif", weight: 700 },   // high-contrast serif
  { font: "'Manrope', system-ui, sans-serif", weight: 800 },     // modern heavy sans
  { font: null, weight: 700 },                                   // theme's own face
];

interface Vars { ink: string; accent: string; accent2: string; eyebrow: string; sub: string; primary: string; dark: boolean; pattern: CSSProperties | null; titleFont: string; titleWeight: number; }
function varsFor(theme: Theme): Vars {
  const grad = theme.titleStyle === 'gradient';
  const dark = theme.tone === 'dark';
  const ink = !grad && theme.titleColor.startsWith('#') ? theme.titleColor : dark ? '#f4f1fb' : '#191427';
  const idx = Math.max(0, THEMES.findIndex((t) => t.id === theme.id));
  const tr = TREATMENTS[idx % TREATMENTS.length];
  const pattern: CSSProperties | null = theme.pagePattern
    ? { position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: theme.pagePattern, backgroundSize: theme.pagePatternSize ?? undefined, backgroundRepeat: theme.pagePatternSize ? 'repeat' : 'no-repeat' }
    : null;
  return { ink, accent: theme.linkColor, accent2: solidPrimary(theme), eyebrow: theme.linkColor, sub: theme.bodyColor, primary: theme.primaryBg, dark, pattern, titleFont: tr.font ?? theme.titleFont, titleWeight: tr.weight };
}

function Photo({ theme }: { theme: Theme }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageFor(theme)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
  );
}

// ── Atmospheric backdrops ──────────────────────────────────────────────────

/** Immersive glassmorphism: blurred theme-tinted blobs + a frosted overlay. */
function GlassField({ v }: { v: Vars }) {
  const blob = (s: CSSProperties): CSSProperties => ({ position: 'absolute', borderRadius: '50%', filter: 'blur(26px)', ...s });
  const base = v.dark ? '#0e1020' : '#ffffff';
  // Translucent frost (no backdrop-filter — the blobs are already blurred, and
  // backdrop-filter across 25 thumbnails janks the renderer).
  const frost = v.dark ? 'rgba(14,16,32,0.5)' : 'rgba(245,244,250,0.72)';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: base }}>
      <span style={blob({ width: 240, height: 240, left: -50, top: -70, background: hexA(v.accent, v.dark ? 0.6 : 0.85) })} />
      <span style={blob({ width: 210, height: 210, right: 70, bottom: -80, background: hexA(v.accent2, v.dark ? 0.6 : 0.8) })} />
      <span style={blob({ width: 160, height: 160, left: '46%', top: '40%', background: hexA(v.accent, 0.45) })} />
      <span style={blob({ width: 190, height: 190, right: -40, top: -24, background: hexA(v.accent2, 0.38) })} />
      <span style={{ position: 'absolute', inset: 0, background: frost }} />
    </div>
  );
}

// Atmospheric backdrops now use the vetted Motif pool — see cover-motifs.tsx.

// ── Type ────────────────────────────────────────────────────────────────────

function Eyebrow({ theme, color, rule = true, pill = false }: { theme: Theme; color: string; rule?: boolean; pill?: boolean }) {
  const label = <span style={{ fontFamily: theme.bodyFont, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color }}>{theme.name}</span>;
  if (pill) return <span style={{ alignSelf: 'flex-start', border: `1px solid ${color}`, borderRadius: 999, padding: '4px 11px', marginBottom: 14, opacity: 0.85 }}>{label}</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {rule && <span style={{ width: 16, height: 2, borderRadius: 2, background: color }} />}
      {label}
    </div>
  );
}

function Headline({ v, color, accent, size }: { v: Vars; color: string; accent: string; size: number }) {
  return (
    <h1 style={{ fontFamily: v.titleFont, fontSize: size, fontWeight: v.titleWeight, lineHeight: 1.06, letterSpacing: '-0.02em', color, margin: 0 }}>
      Your <em style={{ fontStyle: 'italic', fontWeight: 600, color: accent }}>title</em> goes here.
    </h1>
  );
}

function Foot({ theme, color, onDark }: { theme: Theme; color: string; onDark?: boolean }) {
  const txt = onDark ? 'rgba(255,255,255,0.82)' : color;
  // Foxit Slides badge removed.
  return (
    <div style={{ position: 'absolute', left: 34, right: 34, bottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', zIndex: 3 }}>
      <span style={{ fontFamily: theme.titleFont, fontSize: 9.5, letterSpacing: '0.06em', color: txt }}>01 / 12</span>
    </div>
  );
}

/** Eyebrow → headline (italic accent) → hairline rule → italic subtitle. */
function TitleBlock({ theme, v, align = 'left', onDark = false, size = 26, eyebrowPill = false }: {
  theme: Theme; v: Vars; align?: 'left' | 'center'; onDark?: boolean; size?: number; eyebrowPill?: boolean;
}) {
  const center = align === 'center';
  const ink = onDark ? '#fff' : v.ink;
  const sub = onDark ? 'rgba(255,255,255,0.84)' : v.sub;
  const eb = onDark ? 'rgba(255,255,255,0.8)' : v.eyebrow;
  const accent = onDark ? '#fff' : v.accent;
  const ruleBg = onDark ? 'rgba(255,255,255,0.55)' : v.accent;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: center ? 'center' : 'flex-start', textAlign: center ? 'center' : 'left' }}>
      <Eyebrow theme={theme} color={eb} pill={eyebrowPill} />
      <Headline v={v} color={ink} accent={accent} size={size} />
      <span style={{ width: 44, height: 2, borderRadius: 2, background: ruleBg, margin: '13px 0 12px' }} />
      <div style={{ fontFamily: theme.bodyFont, fontStyle: 'italic', fontSize: 12, color: sub, lineHeight: 1.45, maxWidth: center ? '80%' : '94%' }}>{SUB}</div>
    </div>
  );
}

/** Frosted glass panel (round2 cover panel vocabulary). */
function GlassPanel({ v, children }: { v: Vars; children: ReactNode }) {
  return (
    <div style={{
      position: 'relative', borderRadius: 18, padding: '26px 30px',
      background: v.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.46)',
      border: `1px solid ${v.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.75)'}`,
      boxShadow: v.dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 24px 48px -28px rgba(0,0,0,0.6)'
        : 'inset 0 1px 0 rgba(255,255,255,0.6), 0 24px 48px -30px rgba(20,20,43,0.45)',
    }}>{children}</div>
  );
}

function Frame({ theme, children, style }: { theme: Theme; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: 'absolute', top: 0, left: 0, width: REF_W, height: REF_H, overflow: 'hidden', fontFamily: theme.bodyFont, ...fill(theme), ...style }}>{children}</div>;
}

type Form =
  | 'glassImmersive' | 'auroraMesh' | 'bokehField' | 'darkGlow'
  | 'arcSplit' | 'fullBleedPill' | 'diagonalSplit' | 'soloType';

// Explicit per-theme cover form — locked to curation picks. Favorites/
// keeps stay on the form she loved; patternPanel was dropped (Volt → darkGlow);
// the 6 "cut" themes keep the theme but are restyled to a favorited form.
const FORM_BY_ID: Record<string, Form> = {
  counsel: 'glassImmersive', aurora: 'arcSplit', cobalt: 'auroraMesh', 'foxit-glow': 'fullBleedPill',
  quartz: 'bokehField', solstice: 'diagonalSplit', verdant: 'soloType', obsidian: 'darkGlow',
  mist: 'glassImmersive', quill: 'bokehField', strata: 'diagonalSplit', prism: 'soloType',
  voltage: 'glassImmersive', riot: 'arcSplit', 'midnight-index': 'auroraMesh', aperture: 'fullBleedPill',
  'signal-punch': 'bokehField', 'chroma-fold': 'diagonalSplit',
  volt: 'darkGlow',                // patternPanel dropped
  velvet: 'glassImmersive',        // cut(arcSplit) → restyled
  ledger: 'soloType',              // cut(auroraMesh) → restyled
  vellum: 'auroraMesh',            // cut(fullBleedPill) → restyled
  schoolbook: 'arcSplit',          // cut(patternPanel) → restyled
  tide: 'fullBleedPill',           // cut(auroraMesh) → restyled
  'slate-plane': 'diagonalSplit',  // cut(patternPanel) → restyled
};
function coverFormFor(theme: Theme): Form { return FORM_BY_ID[theme.id] ?? 'glassImmersive'; }

// Real vetted decoration motifs (title-decor/manager.html "Curated Pool") for
// the atmospheric / type-led forms — one per template, spread across the pool.
const MOTIF_BY_ID: Partial<Record<string, MotifName>> = {
  cobalt: 'aurora', 'midnight-index': 'fluid', vellum: 'grain',
  quartz: 'bokeh', quill: 'contours', 'signal-punch': 'halftone',
  verdant: 'ribbons', prism: 'arc', ledger: 'hexagon',
};
function MotifBg({ theme, v, fallback }: { theme: Theme; v: Vars; fallback: MotifName }) {
  return <Motif name={MOTIF_BY_ID[theme.id] ?? fallback} uid={theme.id} tint={v.accent} tint2={v.accent2} ink={v.ink} accent={v.accent} />;
}

function renderForm(theme: Theme, form: Form) {
  const v = varsFor(theme);

  switch (form) {
    // round2 cover — immersive glass + frosted glass title panel
    case 'glassImmersive':
      return (
        <Frame theme={theme}>
          <GlassField v={v} />
          <div style={{ position: 'absolute', inset: 0, padding: '0 38px', display: 'flex', alignItems: 'center' }}>
            <GlassPanel v={v}>
              <TitleBlock theme={theme} v={v} />
            </GlassPanel>
          </div>
          <Foot theme={theme} color={v.accent} onDark={v.dark} />
        </Frame>
      );

    // aurora gradient mesh behind the title
    case 'auroraMesh':
      return (
        <Frame theme={theme}>
          <MotifBg theme={theme} v={v} fallback="aurora" />
          <div style={{ position: 'absolute', inset: 0, padding: '0 38px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <TitleBlock theme={theme} v={v} />
          </div>
          <Foot theme={theme} color={v.accent} onDark={v.dark} />
        </Frame>
      );

    // drifting bokeh behind a centered title
    case 'bokehField':
      return (
        <Frame theme={theme}>
          <MotifBg theme={theme} v={v} fallback="bokeh" />
          <div style={{ position: 'absolute', inset: 0, padding: '0 44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TitleBlock theme={theme} v={v} align="center" />
          </div>
          <Foot theme={theme} color={v.accent} onDark={v.dark} />
        </Frame>
      );

    // dark field, corner radial glow, accent word + foot (029)
    case 'darkGlow': {
      const glow = v.accent2;
      const base = theme.tone === 'dark' && !isGrad(theme.pageBg) ? theme.pageBg : '#0f0b1a';
      return (
        <Frame theme={theme} style={{ background: base }}>
          <div style={{ position: 'absolute', right: -60, bottom: -60, width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${glow} 0%, transparent 68%)`, opacity: 0.55, filter: 'blur(8px)' }} />
          <div style={{ position: 'absolute', left: 38, top: 0, bottom: 0, right: '30%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Headline v={v} color="#f4f1fb" accent={glow} size={30} />
            <div style={{ fontFamily: theme.bodyFont, fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45, marginTop: 14, maxWidth: '92%' }}>{SUB}</div>
          </div>
          <Foot theme={theme} color={glow} onDark />
        </Frame>
      );
    }

    // 047 — big convex arc masking a photo right; title + vertical rule left
    case 'arcSplit':
      return (
        <Frame theme={theme}>
          {v.pattern && <div style={v.pattern} />}
          {/* asymmetric, slightly-tilted arc — lopsided top vs
              bottom radius + a few degrees of tilt reads "designed", not a
              uniform stadium. Oversized + clipped by the Frame. */}
          <div style={{ position: 'absolute', right: -16, top: -24, bottom: -24, width: '52%', background: v.primary, borderTopLeftRadius: 300, borderBottomLeftRadius: 88, overflow: 'hidden', transform: 'rotate(4deg)', transformOrigin: 'center' }}>
            <Photo theme={theme} />
          </div>
          <div style={{ position: 'absolute', left: 34, top: 0, bottom: 0, width: '42%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Headline v={v} color={v.ink} accent={v.accent} size={27} />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <span style={{ width: 3, borderRadius: 2, background: v.accent, alignSelf: 'stretch' }} />
              <div style={{ fontFamily: theme.bodyFont, fontStyle: 'italic', fontSize: 12, color: v.sub, lineHeight: 1.45 }}>{SUB}</div>
            </div>
          </div>
        </Frame>
      );

    // 003/116 — full-bleed photo + scrim, title + accent pill
    case 'fullBleedPill':
      return (
        <Frame theme={theme} style={{ background: v.primary }}>
          <Photo theme={theme} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,6,18,0.05) 22%, rgba(8,6,18,0.38) 58%, rgba(8,6,18,0.74) 100%)' }} />
          <span style={{ position: 'absolute', top: 24, left: 34, background: v.accent2, color: '#fff', borderRadius: 999, padding: '5px 13px', fontFamily: theme.bodyFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{theme.name}</span>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 34px 30px' }}>
            <Headline v={v} color="#fff" accent="#fff" size={30} />
            <div style={{ fontFamily: theme.bodyFont, fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 12 }}>{SUB}</div>
          </div>
        </Frame>
      );

    // 123 — angled clip between photo and title wedge
    case 'diagonalSplit':
      return (
        <Frame theme={theme}>
          {v.pattern && <div style={v.pattern} />}
          <div style={{ position: 'absolute', inset: 0, background: v.primary, clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 42% 100%)', overflow: 'hidden' }}>
            <Photo theme={theme} />
          </div>
          <div style={{ position: 'absolute', left: 34, top: 0, bottom: 0, width: '52%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <TitleBlock theme={theme} v={v} />
          </div>
        </Frame>
      );

    // 093/124 — solid field over a faint aurora wash, confident type + pill
    case 'soloType':
    default:
      return (
        <Frame theme={theme}>
          <MotifBg theme={theme} v={v} fallback="ribbons" />
          <div style={{ position: 'absolute', inset: 0, padding: '0 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Eyebrow theme={theme} color={v.eyebrow} pill />
            <Headline v={v} color={v.ink} accent={v.accent} size={33} />
            <div style={{ fontFamily: theme.bodyFont, fontStyle: 'italic', fontSize: 12, color: v.sub, lineHeight: 1.45, marginTop: 14, maxWidth: '70%' }}>{SUB}</div>
          </div>
          <Foot theme={theme} color={v.accent} onDark={v.dark} />
        </Frame>
      );
  }
}

/** The template thumbnail: a distinct cover form, auto-scaled to the card. */
export function ThemeCoverSlide({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / REF_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const form = coverFormFor(theme);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: REF_W, height: REF_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {renderForm(theme, form)}
      </div>
    </div>
  );
}
