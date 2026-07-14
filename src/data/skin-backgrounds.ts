/**
 * Per-category skin backgrounds — the SINGLE SOURCE for "each slide category
 * (cover / content / divider / data / quote / closing) can carry its own
 * background within a skin, while staying on the skin's palette."
 *
 * Both the generation path (structureTemplates.ts) AND the theme-picker preview
 * (ThemePreview / ThemeCard) read from here, so the preview shows exactly what a
 * generated deck looks like per category — not a second, drifting copy.
 *
 * A category absent from a skin's map falls back to the skin's single ground.
 * A `panel` (frosted glass) is applied on every category EXCEPT `content`.
 */
import type { Card } from '@/types/card-template';

export type LayoutCategory = 'cover' | 'divider' | 'content' | 'data' | 'quote' | 'closing';

export interface CategoryBg {
  bg: NonNullable<Card['background']>;
  /** The bg is DARK → paint text in the skin's ground (light) so it stays legible. */
  invert?: boolean;
}

// Inset frosted glass panels — the rounded card content sits on, over the backdrop.
// Verbatim from the Figma frames (24px inset, 912×492 on 960×540). Applied on every
// category EXCEPT `content`.
export interface SkinPanel {
  xPct: number; yPct: number; wPct: number; hPct: number;
  fill: string; stroke: string; strokeWidth: number; borderRadius: number; boxShadow: string;
}

// Glacier's single full-bleed sky-blue/cyan backdrop (Figma "Sky" export). `color`
// is the flat fallback the theme-css reads when the image can't load / in export.
const GLACIER_BG: NonNullable<Card['background']> = {
  image: '/textures/glacier/glacier-bg.png',
  color: '#DCE7F2',
};

// Volt's single full-bleed dark/magenta-glow backdrop (Figma-exported asset).
const VOLT_BG: NonNullable<Card['background']> = {
  image: '/textures/volt/volt-bg.png',
  color: '#131D2E',
};

// Cerulean's translucent glass-ribbon backdrop (Figma "Blue" export). Used only on
// cover/quote/closing; other categories fall back to the light ground (#F3F8FD).
const CERULEAN_BG: NonNullable<Card['background']> = {
  image: '/textures/cerulean/cerulean-bg.png',
  color: '#F5FAFE',
};

const GLACIER_PANEL: SkinPanel = {
  xPct: 24 / 960 * 100, yPct: 24 / 540 * 100, wPct: 912 / 960 * 100, hPct: 492 / 540 * 100,
  fill: 'rgba(231,239,247,0.9)', stroke: 'rgba(0,0,0,0.1)', strokeWidth: 1,
  borderRadius: 20, boxShadow: '0px 16px 46px 0px rgba(0,0,0,0.2)',
};
const VOLT_PANEL: SkinPanel = {
  xPct: 24 / 960 * 100, yPct: 24 / 540 * 100, wPct: 912 / 960 * 100, hPct: 492 / 540 * 100,
  fill: 'linear-gradient(140.18deg, rgba(19,29,46,0.9) 14%, rgba(31,41,64,0.9) 86%)',
  stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1,
  borderRadius: 20, boxShadow: '0px 16px 46px 0px rgba(0,0,0,0.5)',
};

export const SKIN_PANEL: Record<string, SkinPanel> = { glacier: GLACIER_PANEL, volt: VOLT_PANEL };

// ── Cosmos content backdrops ────────────────────────────────────────────────
// The cosmos skin only authored a nebula image for cover + closing; every other
// category fell back to the flat deep-space ground (#0A0814), which reads as
// "all black" on the many content slides. These variants give content/data/
// quote/divider a real galaxy feel — soft nebula glows plus a sparse starfield —
// while staying on the skin's deep base so light text stays legible. A few
// variants are cycled across the content slides (see cosmosContentVariant) so
// they don't all look identical.
const COSMOS_BASE = '#0A0814';

// Deterministic sparse starfield built from layered radial-gradients. Seeded
// (no runtime Math.random) so the same slide renders identically on screen and
// in export.
function starfield(seed: number, count = 28): string {
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const stars: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 100).toFixed(2);
    const y = (rnd() * 100).toFixed(2);
    const r = rnd() < 0.14 ? 1.6 : rnd() < 0.5 ? 1.1 : 0.7; // a few brighter stars
    const a = (0.32 + rnd() * 0.5).toFixed(2);
    stars.push(`radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(255,255,255,${a}) 0, transparent 60%)`);
  }
  return stars.join(', ');
}

const cosmosVariant = (nebula: string, seed: number): NonNullable<Card['background']> => ({
  gradient: `${starfield(seed)}, ${nebula}, ${COSMOS_BASE}`,
  color: COSMOS_BASE,
});

export const COSMOS_CONTENT_VARIANTS: NonNullable<Card['background']>[] = [
  // violet nebula, upper-right
  cosmosVariant(
    'radial-gradient(70% 90% at 82% 12%, rgba(124,74,214,0.30) 0%, transparent 55%), radial-gradient(60% 80% at 8% 90%, rgba(58,102,204,0.20) 0%, transparent 55%)',
    1011,
  ),
  // teal / blue nebula, left
  cosmosVariant(
    'radial-gradient(65% 85% at 12% 20%, rgba(46,150,180,0.26) 0%, transparent 55%), radial-gradient(55% 78% at 92% 84%, rgba(120,60,200,0.18) 0%, transparent 55%)',
    2027,
  ),
  // magenta / rose nebula, lower-right
  cosmosVariant(
    'radial-gradient(72% 92% at 86% 84%, rgba(196,70,150,0.26) 0%, transparent 55%), radial-gradient(55% 80% at 16% 8%, rgba(92,70,210,0.20) 0%, transparent 55%)',
    3041,
  ),
];

/** Cycle a galaxy content backdrop by (content-)slide index. Cosmos only. */
export function cosmosContentVariant(index: number): NonNullable<Card['background']> {
  const n = COSMOS_CONTENT_VARIANTS.length;
  return COSMOS_CONTENT_VARIANTS[((index % n) + n) % n];
}

// Fixed skins with hand-authored per-category maps.
export const CATEGORY_BACKGROUNDS: Record<string, Partial<Record<LayoutCategory, CategoryBg>>> = {
  'mono-light': {
    // Cover/quote stay on the plain white ground (— no warm
    // paper). Data on a soft grey; the divider is the one bold dark moment.
    data: { bg: { color: '#F2F2F2' } },
    divider: { bg: { color: '#111111' }, invert: true },
  },
  // Glacier (Figma "Sky") — the sky-blue/cyan backdrop on EVERY category; the
  // per-category difference is the glass PANEL (all categories except `content`).
  glacier: {
    cover: { bg: GLACIER_BG },
    content: { bg: GLACIER_BG },
    divider: { bg: GLACIER_BG },
    data: { bg: GLACIER_BG },
    quote: { bg: GLACIER_BG },
    closing: { bg: GLACIER_BG },
  },
  // Volt — one shared dark magenta-glow backdrop on every category; dark glass
  // panel on all but content.
  volt: {
    cover: { bg: VOLT_BG },
    content: { bg: VOLT_BG },
    divider: { bg: VOLT_BG },
    data: { bg: VOLT_BG },
    quote: { bg: VOLT_BG },
    closing: { bg: VOLT_BG },
  },
  // Cerulean (Figma "Blue") — glass-ribbon backdrop on cover/quote/closing ONLY;
  // content/data/divider fall back to the solid light ground (#F3F8FD), matching
  // the Figma (solid light there). No panel.
  cerulean: {
    cover: { bg: CERULEAN_BG },
    quote: { bg: CERULEAN_BG },
    closing: { bg: CERULEAN_BG },
  },
  // Cosmos (Quartz "Cosmos") — full-bleed nebula on the cover + closing "moment"
  // slides; content/data/divider/quote fall back to the solid deep-space ground
  // (#0A0814), matching the Figma (the nebula does NOT carry into content).
  cosmos: {
    cover: { bg: { image: '/textures/cosmos/cosmos-bg.png', color: '#0A0814' } },
    closing: { bg: { image: '/textures/cosmos/cosmos-bg.png', color: '#0A0814' } },
    // Galaxy backdrops (nebula + starfield) instead of the flat #0A0814 ground.
    // The deck-assembly step cycles the variants across content slides; these
    // single values keep the theme-picker preview and any non-cycled caller rich.
    content: { bg: COSMOS_CONTENT_VARIANTS[0] },
    data: { bg: COSMOS_CONTENT_VARIANTS[1] },
    quote: { bg: COSMOS_CONTENT_VARIANTS[2] },
    divider: { bg: COSMOS_CONTENT_VARIANTS[0], invert: true },
  },
  // MUBI (Quartz) — Figma ships ~4 slide designs; it maps them across the
  // categories and get creative for the gaps. Each is a full CSS `background`
  // (layered patterns + positions over the #09060A base):
  //   cover   → right pink→peach strip (the "01" is a title-slide element)
  //   content → strip + soft pink glow top-left
  //   data    → plain near-black (Figma's stat slide)
  //   divider → the dramatic crimson light-streaks "moment" (from the agenda)
  //   quote   → content treatment · closing → cover treatment
  mubi: {
    cover: { bg: { gradient: 'linear-gradient(180deg, #F59EC2 0%, #F7CC9E 100%) no-repeat right / 8.5% 100%, #09060A' } },
    content: { bg: { gradient: 'radial-gradient(80% 55% at 28% -12%, rgba(232,90,160,0.28) 0%, transparent 60%), linear-gradient(180deg, #F59EC2 0%, #F7CC9E 100%) no-repeat right / 8.5% 100%, #09060A' } },
    data: { bg: { color: '#09060A' } },
    divider: { bg: { gradient: 'radial-gradient(65% 120% at 10% 8%, rgba(210,40,95,0.42) 0%, transparent 46%), radial-gradient(60% 115% at 92% 88%, rgba(235,65,125,0.36) 0%, transparent 46%), radial-gradient(45% 85% at 82% 6%, rgba(185,32,74,0.30) 0%, transparent 50%), #0B0308' } },
    quote: { bg: { gradient: 'radial-gradient(80% 55% at 28% -12%, rgba(232,90,160,0.24) 0%, transparent 60%), #09060A' } },
    closing: { bg: { gradient: 'linear-gradient(180deg, #F59EC2 0%, #F7CC9E 100%) no-repeat right / 8.5% 100%, #09060A' } },
  },
};

// Rich skins batch (Figma-extracted) — data-driven. Each has ONE full-bleed
// backdrop (image or CSS gradient) on every category + an optional glass panel
// (all but content).
const NEW_RICH_SKINS: Record<string, { bg: NonNullable<Card['background']>; panel?: SkinPanel }> = {
  'obsidian': { bg: { image: '/textures/obsidian/obsidian-bg.png', color: '#1A1612' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'linear-gradient(140.18deg, rgba(26,22,18,0.9) 14%, rgba(45,38,32,0.9) 50%, rgba(31,26,23,0.9) 86%)', stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1, borderRadius: 18, boxShadow: '0px 16px 46px 0px rgba(0,0,0,0.5)' } },
  'cobalt': { bg: { gradient: 'linear-gradient(139deg, #E8F0FF 14%, #D4E0FF 50%, #BCD0FF 86%)', color: '#E8F0FF' }, panel: undefined },
  'prism': { bg: { image: '/textures/prism/prism-bg.png', color: '#0E1219' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'rgba(14,18,25,0.9)', stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1, borderRadius: 24, boxShadow: '0px 16px 46px 0px rgba(0,0,0,0.5)' } },
  'velvet': { bg: { image: '/textures/velvet/velvet-bg.png', color: '#2D1B3D' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'linear-gradient(140.18deg, rgba(45,27,61,0.9) 14%, rgba(74,40,81,0.9) 46%, rgba(107,46,77,0.9) 86%)', stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1, borderRadius: 20, boxShadow: '0px 16px 46px 0px rgba(0,0,0,0.5)' } },
  'solstice': { bg: { gradient: 'linear-gradient(139deg, #FFE0CC 14%, #FFB8A8 39%, #FF8A8E 61%, #E85A8C 86%)', color: '#FFE0CC' }, panel: undefined },
  'nocturne': { bg: { image: '/textures/nocturne/nocturne-bg.png', color: '#1E1640' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'linear-gradient(140.18deg, rgba(30,22,64,0.9) 14%, rgba(20,13,38,0.92) 86%)', stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, borderRadius: 20, boxShadow: '0px 16px 48px 0px rgba(0,0,0,0.45)' } },
  'tide': { bg: { gradient: 'linear-gradient(139deg, #F0F5F1 14%, #E5EFE9 86%)', color: '#F0F5F1' }, panel: undefined },
  'mist': { bg: { gradient: 'linear-gradient(139deg, #E8E5F5 14%, #D5D5E8 39%, #C8CFE5 64%, #B8C8DE 86%)', color: '#E8E5F5' }, panel: undefined },
  'strata': { bg: { color: '#F6F5F1' }, panel: undefined },
  'riot': { bg: { gradient: 'linear-gradient(139deg, #FFE9D6 14%, #FFD0E0 46%, #DCE2FF 86%)', color: '#FFE9D6' }, panel: undefined },
  'verdant': { bg: { gradient: 'linear-gradient(139deg, #EDF2E4 14%, #D5E4C0 46%, #B5CC95 86%)', color: '#EDF2E4' }, panel: undefined },
  'midnight-index': { bg: { image: '/textures/midnight-index/midnight-index-bg.png', color: '#0A0E1F' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'linear-gradient(140.18deg, rgba(10,14,31,0.9) 14%, rgba(19,26,53,0.9) 54%, rgba(24,31,68,0.9) 86%)', stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, borderRadius: 20, boxShadow: '0px 16px 48px 0px rgba(0,0,0,0.5)' } },
  'aurora': { bg: { image: '/textures/aurora/aurora-bg.png', color: '#220E44' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'linear-gradient(90deg, rgba(34,14,68,0.9) 0%, rgba(82,24,94,0.9) 40%, rgba(134,40,110,0.9) 70%, rgba(168,56,94,0.9) 100%)', stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1, borderRadius: 26, boxShadow: '0px 16px 44px 0px rgba(64,31,77,0.18)' } },
  'nebulae': { bg: { gradient: 'linear-gradient(132deg, #1C1648 0%, #080614 67%)', color: '#1C1648' }, panel: undefined },
  'northern-lights': { bg: { image: '/textures/northern-lights/northern-lights-bg.png', color: '#0B1430' }, panel: { xPct: 2.5, yPct: 4.444, wPct: 95, hPct: 91.111, fill: 'linear-gradient(140.18deg, rgba(11,20,48,0.88) 14%, rgba(10,16,36,0.9) 86%)', stroke: 'rgba(255,255,255,0.16)', strokeWidth: 1, borderRadius: 20, boxShadow: '0px 16px 48px 0px rgba(0,0,0,0.5)' } },
  'glasshouse': { bg: { color: '#EAEDF0' }, panel: undefined },
  // Quartz imports (2026-07-13). Aperture = graphite gradient everywhere;
  // MUBI = near-black solid everywhere. (Cosmos is per-category — see below.)
  'aperture': { bg: { gradient: 'linear-gradient(90deg, #21242C 0%, #101218 100%)', color: '#181B22' }, panel: undefined },
};
for (const [rid, r] of Object.entries(NEW_RICH_SKINS)) {
  CATEGORY_BACKGROUNDS[rid] = (['cover', 'content', 'divider', 'data', 'quote', 'closing'] as LayoutCategory[]).reduce(
    (m, c) => { (m as Record<string, CategoryBg>)[c] = { bg: r.bg }; return m; },
    {} as Partial<Record<LayoutCategory, CategoryBg>>,
  );
  if (r.panel) SKIN_PANEL[rid] = r.panel;
}

/** Map a full-res texture path to its optimized preview variant for the theme
 *  picker (`…-bg.png` → `…-bg-preview.webp`). Generation keeps the full PNG. */
export function previewImageSrc(src: string): string {
  return src.replace(/-bg\.png$/, '-bg-preview.webp');
}

/** Resolve a skin's background + panel for one functional category. Returns
 *  `bg: undefined` when the category isn't mapped (caller falls back to the
 *  skin's flat ground). The glass `panel` applies to every category but
 *  `content`. */
export function categoryBackground(
  skinId: string,
  category: LayoutCategory,
): { bg: NonNullable<Card['background']> | undefined; panel: SkinPanel | undefined; invert: boolean } {
  const entry = CATEGORY_BACKGROUNDS[skinId]?.[category];
  const panel = category === 'content' ? undefined : SKIN_PANEL[skinId];
  return { bg: entry?.bg, panel, invert: entry?.invert ?? false };
}
