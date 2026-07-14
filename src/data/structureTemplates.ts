/**
 * Structure templates — turns the Figma template-structure manifest
 * (the single canonical app/src/data/figma-template-structures.json) into renderable,
 * selectable CardTemplate decks.
 *
 * Each manifest layout is a set of role-named slots with absolute geometry on a
 * 960×540 frame. The slide renderer (FreeformLayer) positions freeform blocks by
 * PERCENT of the card surface and sizes text by an explicit px fontSize, so this
 * builder converts each slot px → % and carries the manifest fontSize through.
 *
 * The "skin" (font + color) is applied as EXPLICIT per-block style rather than a
 * document themeId, because the 3 Figma skins are not 1:1 with components/themes
 * (mono-light has no document theme; quill/chroma-fold differ in fonts). Explicit
 * style keeps each template faithful to its Figma frame and theme-independent.
 *
 * IMPORTANT: the semantic key is role + group, NOT role alone. The same role
 * (body, metric-value, metric-label, title) appears in very different slots,
 * disambiguated by `group` (e.g. body/lead vs body/item-body). All mapping and
 * placeholder lookup keys on `${role}:${group}`.
 *
 * Phase 1 ships ONE layout (05-content) on ONE skin (mono-light). Phase 2 adds
 * the remaining layouts + skins by extending PLACEHOLDERS + STRUCTURE_TEMPLATES.
 */

import type {
  Card,
  CardTemplate,
  FreeformBlock,
  FreeformIconBlock,
  FreeformShapeBlock,
  FreeformTextBlock,
  FreeformTextVariant,
} from '@/types/card-template';
import manifestJson from './figma-template-structures.json';
// Layouts imported from document-studio (converter: scripts/import-ds-layouts.mjs).
// Merged into the manifest at load so they're first-class selectable layouts, kept
// in a SEPARATE file so Compose's own figma-template-structures.json stays untouched
// and the import is fully regenerable. Keys are prefixed `ds-`.
import dsImportedJson from './ds-imported-layouts.json';
import comboLayoutsJson from './combo-layouts.json';
import { COMBO_FAMILIES, COMBO_DIRECT } from '@/lib/card-engine/combo-baseline';
import { DECORATIONS, type Decoration, type FillToken } from './structureDecorations';
import { CATEGORY_BACKGROUNDS, SKIN_PANEL, type LayoutCategory, type CategoryBg, type SkinPanel } from './skin-backgrounds';

// ── Manifest shape (subset this builder reads) ──────────────────────────────

interface ManifestSkin {
  order: number;
  /** Whether this skin is a Figma-validated ("mapped") structure skin. Only
   *  mapped skins are offered in the generation + editor theme pickers. */
  mapped?: boolean;
  /** Cover-fidelity tag. `treatment` = the cover's intended visual treatment
   *  (flat = renders truthfully today; gradient/glass/photo may fall back).
   *  `fidelity` = whether the cover we actually render matches Figma. Only
   *  `faithful` covers are offered for generation + the picker (HIDDEN-until-
   *  faithful gate, Lisa 2026-06-17); `approximation` covers still render in
   *  /internal/structure-preview for QA but never reach a user, because slide 1
   *  is too prominent to ship unfaithful. An approximation returns to the
   *  selectable set once its real (glass/photo/gradient) cover asset lands. */
  cover?: { treatment: 'flat' | 'gradient' | 'glass' | 'photo'; fidelity: 'faithful' | 'approximation' };
  label: string;
  fonts: { display: string; body: string };
  ground: string;
  ink: string;
  accent: string;
  /** Card/elevated-panel fill — a contrast STEP from `ground` (lighter on dark
   *  skins, darker on light skins) so cards separate from the slide background.
   *  Falls back to `ground` if unset (old behaviour). */
  surface?: string;
  /** Dedicated EDITOR (workspace) background — theme-related but CONTRASTING with
   *  the slide, so the deck pops off the canvas. Drives `theme.pageBg` +
   *  `--theme-workspace-base`. Falls back to the slide bg (old behaviour) if unset. */
  editorBg?: string;
}

interface ManifestSlot {
  role: string;
  group?: string;
  type?: string;
  /** Scalar, or an array of column/row positions for a multi-instance slot. */
  x?: number | number[];
  y?: number | number[];
  w?: number;
  h?: number;
  size?: number;
  count?: number;
  align?: string;
  /** Imported layouts (document-studio) carry a FROZEN per-mode character budget —
   *  the measured density contract. When present it OVERRIDES the geometry-derived
   *  cap for the active density mode (consumed in fillStructureSlots). */
  budget?: { concise: number; detailed: number; extensive: number };
  /** VERBATIM slot (a quote): reproduce exactly. Exempt from the char budget and
   *  the fit's last-resort trim (the writer copies the source quote word-for-word;
   *  text-fit shrinks the font, never the words). */
  verbatim?: boolean;
}

interface ManifestLayout {
  purpose?: string;
  shared?: ManifestSlot[];
  perTemplate?: Record<string, ManifestSlot[]>;
  /** Imported-layout metadata (set by the document-studio converter). */
  label?: string;
  /** Imported kind (content|stat|…) for provenance/logging. */
  importedKind?: string;
  /** false → present in the manifest but NOT offered to the planner (quote=FR11,
   *  media=image-dependent). Undefined on Compose's own layouts = selectable. */
  selectable?: boolean;
  /** Minimum grounded numbers required before this layout may be picked (numeric
   *  imported layouts: stat/chart/diagram). Mirrors NUMERIC_LAYOUTS. */
  minNumbers?: number;
  /** Offered ONLY when the source contains a real quote (imported quote layouts).
   *  Same idea as minNumbers, for quotes — never fabricate a quote (FR11). */
  needsQuote?: boolean;
  /** Imported layout carries an image slot → offered only when images are on. */
  hasImage?: boolean;
  /** Imported layout with text OVER the image → the renderer paints a legibility
   *  scrim in the text zone (below) + forces legible text. */
  overlay?: boolean;
  /** Renderer textSafeZone the overlay scrim concentrates in (matches where the
   *  overlaid text sits): 'lower-third' | 'left' | 'right' | 'full'. */
  overlayZone?: string;
}

interface Manifest {
  meta: { frame: { w: number; h: number } };
  templates: Record<string, ManifestSkin>;
  layouts: Record<string, ManifestLayout>;
}

const manifest = manifestJson as unknown as Manifest;
// Merge the document-studio imports into the layout set. Compose's own layouts win
// on any key collision (imported keys are `ds-`-prefixed, so there are none).
Object.assign(manifest.layouts, dsImportedJson as unknown as Record<string, ManifestLayout>);
// Merge the combo layouts (generateComboLayouts() → combo-layouts.json). Each entry
// carries its resolved section geometry (shared) + card/accent decorations, saved so
// the geometry is the source of truth at render time; register both halves.
for (const [key, combo] of Object.entries(
  comboLayoutsJson as unknown as Record<string, { shared: ManifestSlot[]; decorations: Decoration[] }>,
)) {
  manifest.layouts[key] = {
    purpose: 'combo',
    label: key,
    importedKind: 'combo',
    selectable: false, // variants are resolved from a family; never planner-picked
    shared: combo.shared,
  };
  DECORATIONS[key] = { shared: combo.decorations };
}
// Combos REPLACE the overlapping Figma content layouts (Lisa 2026-07-11): the planner
// picks combo FAMILIES for content; these legacy layouts are gated OUT of selection
// (kept in the manifest for back-compat + the 05-content fallback swap).
for (const k of ['05-content', '03-comparison', '07-timeline', '02-stat', '11-infographic', '04-process', '12-diagram']) {
  if (manifest.layouts[k]) manifest.layouts[k].selectable = false;
}
// Gate ALL document-studio (ds-*) layouts out of selection (Lisa 2026-07-11): the
// combos are the content system now; the ds-* layouts carry old rough edges (cut-off
// titles, undifferentiated leads). They stay in the manifest for back-compat + saved
// decks, and come back as combos, one shape at a time, replace them.
for (const k of Object.keys(manifest.layouts)) {
  if (k.startsWith('ds-')) manifest.layouts[k].selectable = false;
}
// Register the combo FAMILIES as the selectable content candidates. A family carries
// its affordance purpose + the DETAILED variant's geometry (a safety net if density
// resolution is skipped); planStructureDeck swaps the key to the density variant.
for (const f of COMBO_FAMILIES) {
  const detailed = manifest.layouts[f.byDensity.detailed];
  manifest.layouts[f.key] = {
    purpose: f.purpose,
    label: f.label,
    importedKind: 'combo-family',
    selectable: true,
    ...(f.hasImage ? { hasImage: true } : {}),
    shared: detailed?.shared,
  };
  DECORATIONS[f.key] = DECORATIONS[f.byDensity.detailed];
  // Carry the family's affordance onto its variants so the writer prompt (which
  // reads the RESOLVED variant's purpose) gets real context, not "combo".
  for (const vk of Object.values(f.byDensity)) if (manifest.layouts[vk]) manifest.layouts[vk].purpose = f.purpose;
}
// Single-layout combos are planner-picked directly — flip selectable + real purpose.
for (const d of COMBO_DIRECT) {
  const l = manifest.layouts[d.key];
  if (l) { l.selectable = true; l.purpose = d.purpose; l.label = d.label; }
}
// combo-quote replaces 06-quote as the pull-quote layout. It is writer-filled (not a
// scaffold slide) and FR11-gated by needsQuote — offered ONLY when the source has a
// real quote; never fabricate one. The other chrome combos (cover/divider/closing)
// are scaffold slides with bespoke stamping and are wired separately.
if (manifest.layouts['combo-quote']) {
  Object.assign(manifest.layouts['combo-quote'], {
    selectable: true,
    needsQuote: true,
    label: 'Quote',
    purpose: 'A pull quote — the source’s exact words, with attribution. Offered only when the source contains a real quote.',
  });
}
if (manifest.layouts['06-quote']) manifest.layouts['06-quote'].selectable = false;
// Chrome combos: ALIAS the structural scaffold keys to the house-grid combo geometry
// so every theme renders the combo LAYOUT — the theme still supplies its own
// background/gradient/colors/fonts (the combo is the sections, not the design; Lisa
// 2026-07-11). Keeps ALL planner structural + stamping logic on the existing keys, so
// the cover stays force-first, the closing/divider keep their handling, and the agenda
// still seeds its items from the deck's section titles.
{
  const comboJson = comboLayoutsJson as unknown as Record<string, { shared: ManifestSlot[]; decorations: Decoration[] }>;
  const CHROME_ALIAS: Record<string, string> = {
    '01-cover': 'combo-cover',
    '08-divider': 'combo-divider',
    '09-closing': 'combo-closing',
    '10-agenda': 'combo-agenda-4',
  };
  for (const [oldKey, comboKey] of Object.entries(CHROME_ALIAS)) {
    const combo = comboJson[comboKey];
    const old = manifest.layouts[oldKey];
    if (old && combo) {
      old.shared = combo.shared;
      delete old.perTemplate; // every theme uses the combo layout, skinned via tokens
      DECORATIONS[oldKey] = { shared: combo.decorations };
    }
  }
}
const FRAME_W = manifest.meta.frame.w; // 960
const FRAME_H = manifest.meta.frame.h; // 540

// Muted/body text color per skin (the manifest carries ink + accent + ground;
// the secondary text tone is a render concern, defined here).
const SKIN_SUB: Record<string, string> = {
  'mono-light': '#555555',
  'chroma-fold': '#6B6385',
  quill: '#B8AE92',
  blue: '#5A6B82',
  counsel: '#5C6770',
  'mono-dark': '#A8A8A8',
  schoolbook: '#50412E',
  ledger: '#4A5568',
  vellum: '#4A4338',
  ledgerline: '#64748B',
  volt: '#C8B8D8',
  glacier: '#45576B',
  cerulean: '#5B6B80',
  'obsidian': '#B8A88C',
  'cobalt': '#3B4A6B',
  'prism': '#A6AEC2',
  'velvet': '#D8B8C8',
  'solstice': '#6B2A3D',
  'nocturne': '#C4B6DB',
  'tide': '#37524A',
  'mist': '#4A4F6E',
  'strata': '#3F4856',
  'riot': '#4A3A5E',
  'verdant': '#3D5230',
  'midnight-index': '#E4E1F5',
  'aurora': '#D8B8DA',
  'nebulae': '#A8A0C8',
  'northern-lights': '#BCC6DC',
  'glasshouse': '#41464D',
};

// Per-skin COVER accent — some covers use an index/rule color distinct from the
// skin's interior accent (e.g. Schoolbook's cover is maroon, its link is rust).
const COVER_ACCENT: Record<string, string> = {
  schoolbook: '#8a3344',
};

// Delta is semantic, not skin-toned: ↑ positive (green), ↓ negative (red).
const DELTA_POS = '#3c7e6b';
const DELTA_NEG = '#b3261e';

// Gradient-fill display headings — per-skin gradient text (titles + the big
// numbers), mirroring each Figma frame's gradient treatment. Volt = magenta→
// violet; MUBI = pink→peach (its signature strip colors).
const SKIN_TITLE_GRADIENT: Record<string, string> = {
  volt: 'linear-gradient(105deg, #FFB4D4 0%, #C77DEA 50%, #8E6CF2 100%)',
  mubi: 'linear-gradient(120deg, #F59EC2 0%, #E85AA0 45%, #F7CC9E 100%)',
};
// Display headings that take the gradient fill (titles + the big numbers).
const GRADIENT_METRIC_GROUPS = new Set(['hero', 'section-number', 'item-number', 'takeaway-stat']);
// Skins whose TITLE also takes the gradient. Volt = yes (Figma gradient titles);
// MUBI keeps WHITE titles per Figma — the gradient is only on its big numbers.
const GRADIENT_TITLE_SKINS = new Set(['volt']);
function voltGradientFor(skinId: string, role: string, group: string | undefined): string | undefined {
  const grad = SKIN_TITLE_GRADIENT[skinId];
  if (!grad) return undefined;
  if (role === 'title' && group !== 'cover-subtitle' && GRADIENT_TITLE_SKINS.has(skinId)) return grad;
  if (role === 'metric-value' && GRADIENT_METRIC_GROUPS.has(group ?? '')) return grad;
  return undefined;
}

// Badge roles render as SQUARE tags, not rounded pills (Lisa 2026-06-17 — "square
// tags, no pill"). Radius is dropped at build time regardless of where the
// decoration is defined (the PILL constant or inline per-skin), so it's uniform
// across every template. Other rounded shapes (content cards, the CTA button,
// the chart plot) keep their radius — only the small label badges square off.
const SQUARE_TAG_ROLES = new Set(['eyebrow-pill', 'delta-pill', 'tag']);

// ── Placeholder copy (neutral; FR11 — never fabricated metrics/claims) ───────
// Keyed by `${role}:${group ?? ''}`. Array entries map to multi-instance slots
// by index; a scalar repeats. Add layouts here in Phase 2.

const PLACEHOLDERS: Record<string, Record<string, string | string[]>> = {
  '01-cover': {
    'eyebrow-label:': 'SECTION',
    'title:': 'Your title goes here',
    'title:cover-title': 'Your title goes here',
    'title:cover-subtitle': 'FY2026',
    'title:section-title': 'Your title goes here',
    'metric-value:cover-index': '01',
    'author:': 'Presenter name',
    'date:': 'Month 2026',
  },
  '02-stat': {
    'eyebrow-label:': 'KEY METRICS',
    'metric-value:hero': '3.4×',
    'metric-label:hero': 'Primary metric',
    'delta:hero': '↑ 12%',
    'metric-value:sub': ['256', '94%', '2.3×'],
    'metric-label:sub': ['METRIC ONE', 'METRIC TWO', 'METRIC THREE'],
    'delta:sub': ['↑ 8%', '↑ 5%', '↓ 2%'],
  },
  '03-comparison': {
    'eyebrow-label:': 'VS',
    'title:': 'Compare your options',
    'RECOMMENDED:': 'RECOMMENDED',
    'metric-label:column-header': ['Option A', 'Option B'],
    'metric-label:criterion': ['Criterion one', 'Criterion two', 'Criterion three', 'Criterion four'],
    'body:left-values': ['Included', 'Standard', 'Up to 3', 'Basic'],
    'body:right-values': ['Included', 'Premium', 'Unlimited', 'Advanced'],
  },
  '04-process': {
    'eyebrow-label:': 'PROCESS',
    'title:': 'Your process in four steps',
    'metric-value:step-number': ['01', '02', '03', '04'],
    'icon:arrow': '→',
    'body:step-title': ['Step one', 'Step two', 'Step three', 'Step four'],
    'body:step-desc': [
      'Short description of this step.',
      'Short description of this step.',
      'Short description of this step.',
      'Short description of this step.',
    ],
  },
  '06-quote': {
    'decoration:': '“',
    'title:quote': 'A short, memorable quote that captures the key idea for the reader.',
    'metric-label:attribution': 'Full Name',
    'body:attribution-role': 'Title, Company',
  },
  '05-content': {
    'eyebrow-label:': 'SECTION',
    'title:': 'Your title goes here',
    'body:lead':
      'A short supporting sentence that frames the points below for the reader.',
    'metric-label:item-title': ['Point one', 'Point two', 'Point three'],
    'body:item-body': [
      'Supporting detail for the first point.',
      'Supporting detail for the second point.',
      'Supporting detail for the third point.',
    ],
  },
  '07-timeline': {
    'eyebrow-label:': 'TIMELINE',
    'title:': 'Project timeline',
    'metric-label:milestone-label': ['Q1', 'Q2', 'Q3', 'Q4'],
    'metric-value:milestone-date': ['Mar', 'Jun', 'Sep', 'Dec'],
    'body:milestone-desc': [
      'Milestone description.', 'Milestone description.',
      'Milestone description.', 'Milestone description.',
    ],
  },
  '08-divider': {
    'eyebrow-label:': 'SECTION',
    'metric-value:section-number': '02',
    'title:section-title': 'Section title',
  },
  '09-closing': {
    'eyebrow-label:': 'GET IN TOUCH',
    'title:': 'Thank you',
    'body:lead': 'A closing line that invites the reader to take the next step.',
    'body:cta-label': 'Get started',
    'icon:cta-arrow': '→',
    'body:footer': '',
  },
  '10-agenda': {
    'eyebrow-label:': 'AGENDA',
    'title:': 'Agenda',
    'metric-value:item-number': ['01', '02', '03', '04'],
    'metric-label:item-title': ['Topic one', 'Topic two', 'Topic three', 'Topic four'],
    'body:item-desc': [
      'Short description of this agenda item.',
      'Short description of this agenda item.',
      'Short description of this agenda item.',
      'Short description of this agenda item.',
    ],
  },
  '11-infographic': {
    'eyebrow-label:': 'HIGHLIGHTS',
    'title:': 'Key highlights',
    'metric-label:card-title': ['Feature one', 'Feature two', 'Feature three'],
    'body:card-body': [
      'Short description of this feature for the reader.',
      'Short description of this feature for the reader.',
      'Short description of this feature for the reader.',
    ],
  },
  '12-diagram': {
    'eyebrow-label:': 'DATA',
    'title:': 'Results',
    'metric-value:bar-value': ['18', '26', '31', '44', '58'],
    'metric-label:bar-label': ['Cat A', 'Cat B', 'Cat C', 'Cat D', 'Cat E'],
    // Volt diagram takeaway panel (right column). Other skins' shared geometry
    // has no takeaway slots, so these keys only surface on Volt.
    'metric-label:takeaway-label': 'KEY TAKEAWAY',
    'metric-value:takeaway-stat': '+38%',
    'body:takeaway-caption': 'A one-line read on what the data shows.',
    'body:takeaway-point': ['First supporting takeaway', 'Second supporting takeaway'],
  },
};

function placeholderText(
  layoutKey: string,
  role: string,
  group: string | undefined,
  index: number,
): string {
  const key = `${role}:${group ?? ''}`;
  const entry = PLACEHOLDERS[layoutKey]?.[key];
  if (Array.isArray(entry)) return entry[index] ?? entry[entry.length - 1] ?? '';
  if (typeof entry === 'string') return entry;
  return ''; // unknown slot — render empty rather than leaking a role name
}

/**
 * Content map the generator passes to FILL a structure's blanks. Keyed by
 * `${role}:${group ?? ''}` — the SAME key as PLACEHOLDERS — so a multi-instance
 * slot (count/array) takes an array and a scalar slot takes a string. When a
 * key is absent the structure falls back to its neutral placeholder (so a
 * partially-filled structure still renders, never leaks a role name).
 */
export type StructureFill = Record<string, string | string[]>;

/** Resolve a slot's content: generator fill first (by role:group + index),
 *  else the neutral placeholder. Empty-string fills fall back too (an empty
 *  blank should show the placeholder, not nothing). */
function resolveSlotContent(
  fill: StructureFill | undefined,
  layoutKey: string,
  role: string,
  group: string | undefined,
  index: number,
): string {
  if (fill) {
    const entry = fill[`${role}:${group ?? ''}`];
    if (Array.isArray(entry)) {
      const v = entry[index];
      if (typeof v === 'string' && v.trim()) return v;
    } else if (typeof entry === 'string' && entry.trim()) {
      return entry;
    }
    // GENERATION MODE (fill provided): an unfilled FILLABLE slot must render
    // EMPTY, not the generic placeholder — otherwise "Your title goes here" /
    // "Short description of this item" leak into a real deck and read as fake.
    // Decorative glyphs (icon arrows, the quote mark) are NOT generator-filled,
    // so they keep their placeholder so the layout's marks still render.
    const isDecorativeGlyph = role === 'icon' || role === 'decoration';
    if (!isDecorativeGlyph) return '';
  }
  return placeholderText(layoutKey, role, group, index);
}

// ── role+group → text variant + style ───────────────────────────────────────

interface SlotStyle {
  variant: FreeformTextVariant;
  fontFamily: string;
  fontWeight: number;
  color: string;
  letterSpacing?: number;
  lineHeight?: number;
}

/** Relative luminance (0=black … 1=white) of a #hex color. */
function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 1;
  const c = [0, 2, 4].map((i) => {
    const x = parseInt(h.slice(i, i + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function styleForSlot(role: string, group: string | undefined, skin: ManifestSkin): SlotStyle {
  // On a DARK-ground theme the muted `sub` color reads as low-contrast for the
  // cover/closing subtitle (Lisa 2026-07-11: cover text "not seen on the dark
  // background — it should be lighter"). Brighten the subtitle (`lead`) to the
  // theme's bright ink on dark grounds; light themes keep the muted sub.
  const groundDark = hexLuminance(skin.ground) < 0.25;
  const sub = group === 'lead' && groundDark
    ? skin.ink
    : (SKIN_SUB[skinKeyOf(skin)] ?? skin.ink);
  // Some `body` slots act as a bold mini-heading (e.g. a process step title)
  // rather than running copy — render them like a label.
  if (role === 'body' && group === 'step-title') {
    return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, lineHeight: 1.2 };
  }
  switch (role) {
    case 'title':
      // 06-quote pull quote — Fraunces Light with looser leading (Figma).
      if (group === 'quote') {
        return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 300, color: skin.ink, lineHeight: 1.38 };
      }
      // 08-divider section title — oversized Fraunces Light, tight leading (Figma 80px).
      if (group === 'section-title') {
        return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 300, color: skin.ink, lineHeight: 1.0 };
      }
      // 09-closing title — Fraunces Light (Figma 58px).
      if (group === 'closing-title') {
        return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 300, color: skin.ink, lineHeight: 1.06 };
      }
      // Cover sub-header (e.g. Volt's fiscal-period line under the title) —
      // solid mid-gradient magenta on Volt, accent elsewhere.
      if (group === 'cover-subtitle') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 700, color: skinKeyOf(skin) === 'volt' ? '#B9B0D8' : skin.accent, letterSpacing: 1.5 };
      }
      // Cover title beside a big index (e.g. Counsel) — SemiBold display, tight.
      if (group === 'cover-title') {
        return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 600, color: skin.ink, lineHeight: 1.02 };
      }
      // Default title — Fraunces REGULAR (Figma uses 400 for cover/content/process/
      // timeline/comparison titles; the old 600 read too heavy / "amateur").
      return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 400, color: skin.ink, lineHeight: 1.1 };
    case 'statement':
      // A single-point statement — the skin's DISPLAY face in ink, light + open.
      // Theme-driven like every role: mono-light renders it Fraunces, a sans theme
      // renders it in its own display sans. No font is named at the layout level.
      return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 300, color: skin.ink, lineHeight: 1.32 };
    case 'subheader':
      // A section sub-heading inside a body — the skin's BODY face, semibold, ink.
      // Breaks a long body region into labelled sections (a density lever).
      return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: skin.ink, lineHeight: 1.3 };
    case 'eyebrow-label':
      return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 700, color: skin.accent, letterSpacing: 1.5 };
    case 'metric-value':
      // Oversized LIGHT figures (Figma: Fraunces Light) — the 02-stat hero, the
      // 10-agenda item numbers, and the 08-divider section number.
      if (group === 'hero' || group === 'item-number' || group === 'section-number') {
        return { variant: 'metric', fontFamily: skin.fonts.display, fontWeight: 300, color: skin.ink };
      }
      // 12-diagram bar values — Inter SemiBold ink (sans, NOT the serif metric face).
      if (group === 'bar-value') {
        return { variant: 'metric', fontFamily: skin.fonts.body, fontWeight: 600, color: skin.ink };
      }
      // Cover-element primitive: the oversized index number on a cover (e.g.
      // Counsel's / Schoolbook's "01"). Defaults to the skin accent, but some
      // covers use a distinct cover-accent (Schoolbook's maroon ≠ its rust link).
      if (group === 'cover-index') {
        const coverInk = COVER_ACCENT[skinKeyOf(skin)] ?? skin.accent;
        return { variant: 'metric', fontFamily: skin.fonts.display, fontWeight: 600, color: coverInk };
      }
      return { variant: 'metric', fontFamily: skin.fonts.display, fontWeight: 600, color: skin.ink };
    case 'metric-label':
      // Comparison column headers (03): elegant DISPLAY serif in the soft sub
      // tone, centered — matches the Figma validated template (Fraunces 22, #4a4a4a).
      if (group === 'column-header') {
        return { variant: 'subheading', fontFamily: skin.fonts.display, fontWeight: 400, color: sub, lineHeight: 1.2 };
      }
      // Combo table column headers — a clean, prominent header row: body-font
      // semibold in INK (not the soft sub tone, which read too small/weak), lightly
      // tracked. Sized on the slot to match the row labels.
      if (group === 'thead') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: skin.ink, letterSpacing: 0.4, lineHeight: 1.2 };
      }
      // Comparison criterion labels (03): tracked uppercase mini-labels in the
      // sub tone (Figma: Inter SemiBold 10, tracking 1.2, #4a4a4a).
      if (group === 'criterion') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, letterSpacing: 1.2 };
      }
      // Content row titles (05) read in the soft sub tone, not full ink (Figma).
      if (group === 'item-title') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, lineHeight: 1.2 };
      }
      // 02-stat hero caption — medium-weight sub tone (Figma: Inter Medium 18 #4a4a4a).
      if (group === 'hero') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 500, color: sub, lineHeight: 1.2 };
      }
      // 02-stat sub-metric labels — tracked uppercase caption in sub tone.
      if (group === 'sub') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, letterSpacing: 1.32 };
      }
      // 06-quote attribution name — sub tone (Figma: Inter SemiBold 15 #4a4a4a).
      if (group === 'attribution') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, lineHeight: 1.2 };
      }
      // 07-timeline milestone label — small tracked caption in sub tone.
      if (group === 'milestone-label') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, letterSpacing: 1.4 };
      }
      // 11-infographic card title — sub tone (Figma: Inter SemiBold 17 #4a4a4a).
      if (group === 'card-title') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, lineHeight: 1.2 };
      }
      // 12-diagram bar axis label — tracked uppercase caption in sub tone.
      if (group === 'bar-label') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: sub, letterSpacing: 0.88 };
      }
      // Volt diagram takeaway label — tracked accent caps (an eyebrow for the panel).
      if (group === 'takeaway-label') {
        return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 700, color: skin.accent, letterSpacing: 1.5 };
      }
      return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 600, color: skin.ink, lineHeight: 1.2 };
    case 'delta':
      return { variant: 'metric', fontFamily: skin.fonts.body, fontWeight: 600, color: skin.ink };
    case 'decoration':
      // Oversized pull-quote mark — light weight, top-aligned (tight line height).
      return { variant: 'heading', fontFamily: skin.fonts.display, fontWeight: 300, color: skin.accent, lineHeight: 1.0 };
    case 'RECOMMENDED':
      // Sits on a solid tag pill — use the ground color so it reads on the fill.
      return { variant: 'subheading', fontFamily: skin.fonts.body, fontWeight: 700, color: skin.ground, letterSpacing: 1 };
    case 'body':
    default:
      return { variant: 'paragraph', fontFamily: skin.fonts.body, fontWeight: 400, color: sub, lineHeight: 1.4 };
  }
}

// Reverse lookup so styleForSlot can read SKIN_SUB by id.
function skinKeyOf(skin: ManifestSkin): string {
  const found = Object.entries(manifest.templates).find(([, s]) => s === skin);
  return found?.[0] ?? '';
}

// ── Decoration helpers ──────────────────────────────────────────────────────

function tokenColor(skin: ManifestSkin, token: FillToken): string {
  switch (token) {
    case 'accent': return skin.accent;
    case 'sub': return SKIN_SUB[skinKeyOf(skin)] ?? skin.ink;
    case 'ground': return skin.ground;
    case 'surface': return skin.surface ?? skin.ground;
    case 'ink':
    default: return skin.ink;
  }
}

function hexToRgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || opacity >= 1) return hex;
  const int = parseInt(m[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${opacity})`;
}

/** Rough rendered width of a single-line label (caps + letter-spacing aware). */
function estimateLabelWidth(text: string, fontSize: number, letterSpacing = 0): number {
  return text.length * fontSize * 0.62 + Math.max(0, text.length - 1) * letterSpacing;
}

interface LabelMeta { x: number; y: number; h: number; size: number; content: string; ls: number }

// Resolve a skin's `ground` (hex, CSS gradient, or a textual description like
// Quill's "dark image + navy gradient panel") into a Card background. Quill's
// photographic + glass-panel ground is NOT yet rendered — it falls back to a
// dark solid so cream ink stays legible (flagged in handoff).
function backgroundFor(ground: string): NonNullable<Card['background']> {
  if (/^#[0-9a-fA-F]{3,8}$/.test(ground.trim())) return { color: ground.trim() };
  if (/-gradient\(/i.test(ground)) return { gradient: ground }; // actual CSS gradient fn
  return { color: '#16141f' }; // dark fallback for image/glass grounds (Quill)
}

// ── Per-category backgrounds (within a theme) ────────────────────────────────
// A theme can carry a DIFFERENT background per functional layout category while
// staying cohesive (still its palette). Categories are the ~6 functional groups.
// A category absent from a theme's map falls back to the single skin ground
// (today's behaviour) — so this is fully backward-compatible.

const CATEGORY_BY_KEY: Record<string, LayoutCategory> = {
  '01-cover': 'cover', '08-divider': 'divider', '09-closing': 'closing',
  '02-stat': 'data', '12-diagram': 'data', '06-quote': 'quote',
  // Combo layouts (the shipped content engine) map to their categories too, so
  // per-category backgrounds (e.g. Cosmos's nebula cover) apply to them.
  'combo-cover': 'cover', 'combo-divider': 'divider', 'combo-closing': 'closing',
  'combo-quote': 'quote',
};

/** Which functional category a layout belongs to (drives its background). */
function layoutCategory(layoutKey: string): LayoutCategory {
  const direct = CATEGORY_BY_KEY[layoutKey];
  if (direct) return direct;
  const kind = manifest.layouts[layoutKey]?.importedKind;
  if (kind === 'stat' || kind === 'chart' || kind === 'diagram') return 'data';
  if (kind === 'quote') return 'quote';
  return 'content'; // the workhorse default (05-content, comparison, process, media, …)
}

// ── Slot expansion (handles count + array x/y) ──────────────────────────────

function at(v: number | number[] | undefined, i: number, fallback = 0): number {
  if (Array.isArray(v)) return v[i] ?? v[v.length - 1] ?? fallback;
  return v ?? fallback;
}

function slotInstanceCount(slot: ManifestSlot): number {
  if (typeof slot.count === 'number') return slot.count;
  const arrLen = [slot.x, slot.y].reduce<number>(
    (m, v) => (Array.isArray(v) ? Math.max(m, v.length) : m),
    1,
  );
  return arrLen;
}

// ── Builder ─────────────────────────────────────────────────────────────────

/** Canonical layout order (matches the manifest keys). */
export const LAYOUT_KEYS = [
  '01-cover', '02-stat', '03-comparison', '04-process', '05-content', '06-quote',
  '07-timeline', '08-divider', '09-closing', '10-agenda', '11-infographic', '12-diagram',
] as const;

const LAYOUT_LABEL: Record<string, string> = {
  '01-cover': 'Cover', '02-stat': 'Stat', '03-comparison': 'Comparison', '04-process': 'Process',
  '05-content': 'Content', '06-quote': 'Quote', '07-timeline': 'Timeline', '08-divider': 'Divider',
  '09-closing': 'Closing', '10-agenda': 'Agenda', '11-infographic': 'Infographic', '12-diagram': 'Diagram',
};

// Short single-line label roles must never wrap: their manifest box width was
// measured from the original Figma label, so a longer placeholder would wrap.
// (RECOMMENDED is NOT here: it sits in a fixed, centred pill on 03-comparison —
// the 260px no-wrap min-width pushed its box off the card. Its short label fits
// its manifest box without wrapping.)
const NO_WRAP_ROLES = new Set(['eyebrow-label', 'delta']);

// role:group slots that should size to their placeholder (single line) — like
// metric-value, but identified by group (e.g. a quote attribution name/role).
const FIT_WIDTH_RG = new Set(['metric-label:attribution', 'body:attribution-role', 'body:footer', 'author:', 'date:']);

// Per-layout center-aligned slots (keyed role:group). Alignment is a layout
// concern, not a role one — a comparison title is centered, a content title is
// left. Comparison is a fully-centered two-column layout.
const CENTERED_BY_LAYOUT: Record<string, Set<string>> = {
  '03-comparison': new Set([
    // Title + eyebrow are LEFT-aligned like every other interior page (Lisa
    // 2026-06-17 — "keep it self aligned as the other pages"). The table cells
    // (column headers, criterion, values) stay centered within their columns.
    'RECOMMENDED:', 'metric-label:column-header', 'metric-label:criterion',
    'body:left-values', 'body:right-values',
  ]),
  '04-process': new Set([
    'metric-value:step-number', 'icon:arrow', 'body:step-title', 'body:step-desc',
  ]),
  '07-timeline': new Set([
    'metric-label:milestone-label', 'metric-value:milestone-date', 'body:milestone-desc',
  ]),
  '11-infographic': new Set([
    // Slide title is LEFT-aligned like every other layout (Lisa 2026-07-13 —
    // the true designs are left-aligned, not centered). Card title/body stay
    // centered under their icon badge.
    'metric-label:card-title', 'body:card-body',
  ]),
  '12-diagram': new Set([
    'metric-value:bar-value', 'metric-label:bar-label',
  ]),
};

// Volt's reworked skeletons are LEFT-aligned everywhere (Lisa) — it does NOT use
// the centered table/process/diagram treatments above. Only the process step
// number + rail arrow stay centered (they sit on/in a node). Keyed like
// CENTERED_BY_LAYOUT but consulted only for skinId === 'volt'.
const VOLT_CENTERED: Record<string, Set<string>> = {
  '04-process': new Set(['metric-value:step-number', 'icon:arrow']),
};

// Per-skin-cover right-aligned slots. Covers are per-skin, so alignment is keyed
// `layout:skin` (e.g. Counsel's cover date sits at the right margin).
const RIGHT_ALIGNED: Record<string, Set<string>> = {
  '01-cover:counsel': new Set(['date:']),
  '01-cover:mono-dark': new Set(['author:', 'date:']),
  '01-cover:schoolbook': new Set(['date:']),
};

// ── 02-stat count-adaptive geometry (Option A, 2026-06-25) ───────────────────
// The shared 02-stat skeleton is a fixed 2×2 (hero + 3 subs). FR11 leaves
// ungrounded metrics EMPTY, so a stat slide with <4 grounded metrics renders
// holes in the grid (and a stray mid-slide divider). This re-flows the *filled*
// metrics into a shape sized to their count: 1 → one feature metric, 2 →
// side-by-side pair, 3 → an even row of three. 4+ keeps the shared 2×2 (returns
// null). Metrics are compacted — gaps removed, the first promoted into the hero
// slot — so the builder's index→cell mapping stays contiguous. Applies only to
// skins on the shared skeleton; Volt ships its own perTemplate 02-stat and is
// left untouched. The eyebrow header is preserved; only the metric cells reflow.
const STAT_EYEBROW: ManifestSlot = { role: 'eyebrow-label', x: 72, y: 57, w: 271, h: 15, size: 12 };

/** One metric cell = value + label, stacked. `group` keeps the fill mapping
 *  ('hero' → scalar fill, 'sub' → array fill) and the per-group styling. No
 *  delta — the change-indicator was a hand-authored slot (not in the Figma
 *  frame) that read as misplaced, so 02-stat is value + label only (Lisa
 *  2026-06-25). The label gap scales with the value size. */
function statCellSlots(
  group: 'hero' | 'sub',
  xs: number[],
  valueY: number,
  valueSize: number,
  valueW: number,
  labelH: number,
): ManifestSlot[] {
  const n = xs.length;
  const valueH = Math.round(valueSize * 1.16);
  const labelDy = valueH + 14; // label sits just below the value
  const x: number | number[] = n === 1 ? xs[0] : xs;
  const yAt = (dy: number): number | number[] => (n === 1 ? valueY + dy : xs.map(() => valueY + dy));
  return [
    { role: 'metric-value', group, count: n, x, y: yAt(0), w: valueW, h: valueH, size: valueSize },
    { role: 'metric-label', group, count: n, x, y: yAt(labelDy), w: valueW, h: labelH, size: group === 'hero' ? 16 : 14 },
  ];
}

function asFillStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return typeof v === 'string' ? v : '';
}

/** 02-stat Option A: re-flow filled metrics to their count, or null to keep the
 *  shared 2×2. Returns the metric-cell slots (+ eyebrow) and a compacted fill. */
function adaptiveStatLayout(fill: StructureFill): { slots: ManifestSlot[]; fill: StructureFill } | null {
  const subVals = Array.isArray(fill['metric-value:sub']) ? (fill['metric-value:sub'] as string[]) : [];
  const subLabs = Array.isArray(fill['metric-label:sub']) ? (fill['metric-label:sub'] as string[]) : [];
  const metrics: { v: string; l: string }[] = [];
  const heroV = asFillStr(fill['metric-value:hero']);
  if (heroV.trim()) metrics.push({ v: heroV, l: asFillStr(fill['metric-label:hero']) });
  subVals.forEach((v, i) => {
    if (v && v.trim()) metrics.push({ v, l: subLabs[i] ?? '' });
  });

  const head = metrics[0];
  if (!head || metrics.length >= 4) return null; // 0 or 4+ metrics → keep the shared 2×2
  const n = metrics.length;

  const compactFill: StructureFill = {
    ...fill,
    'metric-value:hero': head.v,
    'metric-label:hero': head.l,
    'metric-value:sub': metrics.slice(1).map((m) => m.v),
    'metric-label:sub': metrics.slice(1).map((m) => m.l),
  };

  let cells: ManifestSlot[];
  if (n === 1) {
    // One feature metric — a touch larger than the grid hero (NOT the old 172px
    // monster), left-aligned and vertically centred in the band.
    cells = statCellSlots('hero', [72], 196, 88, 740, 26);
  } else if (n === 2) {
    // Two metrics side by side on one row (hero leads, sub supports).
    cells = [
      ...statCellSlots('hero', [72], 232, 68, 400, 24),
      ...statCellSlots('sub', [508], 232, 54, 360, 24),
    ];
  } else {
    // n === 3 → an even row of three.
    cells = [
      ...statCellSlots('hero', [72], 232, 68, 250, 36),
      ...statCellSlots('sub', [352, 632], 232, 54, 248, 36),
    ];
  }
  return { slots: [STAT_EYEBROW, ...cells], fill: compactFill };
}

/**
 * Build a renderable CardTemplate deck (one card) from a manifest layout + skin.
 * Internal — structure templates are backend, not surfaced in any gallery. The
 * caller renders card[0] via SlideStage/FreeformLayer (absolute %-geometry).
 */
export function buildStructureTemplate(
  layoutKey: string,
  skinId: string,
  /** Generator content for this layout's blanks (role:group keyed). Absent →
   *  the neutral placeholders render (the original behavior). */
  fill?: StructureFill,
): CardTemplate {
  const skin = manifest.templates[skinId];
  const layout = manifest.layouts[layoutKey];
  if (!skin || !layout) {
    throw new Error(`Unknown structure template: ${layoutKey} / ${skinId}`);
  }
  // Per-theme interior geometry: a skin may ship its OWN per-layout geometry
  // (e.g. Volt's reworked skeletons) under perTemplate[skinId]. Prefer it; other
  // skins fall back to the canonical `shared` interior geometry (unchanged).
  // Volt is retired from bespoke per-layout geometry — it now runs on the SHARED
  // (combo) interior geometry like every offered skin (Lisa 2026-07-13). Its old
  // perTemplate skeletons stay in the manifest for back-compat but aren't selected.
  let slots = (skinId === 'volt' ? undefined : layout.perTemplate?.[skinId]) ?? layout.shared ?? [];
  let activeFill = fill;
  let suppressStatDivider = false;
  // 02-stat count-adaptive geometry (Option A): when a stat slide has fewer than
  // 4 grounded metrics, reflow the filled metrics to their count so a sparse
  // slide doesn't leave holes in the 2×2 grid. Skins on the shared skeleton only
  // (Volt's own perTemplate 02-stat is untouched); only fires with a fill.
  if (layoutKey === '02-stat' && (skinId === 'volt' || !layout.perTemplate?.[skinId]) && fill) {
    const adapt = adaptiveStatLayout(fill);
    if (adapt) {
      slots = adapt.slots;
      activeFill = adapt.fill;
      suppressStatDivider = true;
    }
  }

  const freeform: FreeformBlock[] = [];
  // role[:group] (index 0) → geometry, so decorations can hug their label.
  const labelMeta: Record<string, LabelMeta> = {};

  // Text blanks sit ON TOP (z ≥ 100); decorations sit behind (z < 100).
  let z = 100;
  for (const slot of slots) {
    if (slot.type === 'image') continue; // text slots only (backgrounds are skin)
    // Comparison is neutral by default — no "RECOMMENDED" badge (see
    // structureDecorations 03-comparison). Skip the slot so no badge text renders.
    if (layoutKey === '03-comparison' && slot.role === 'RECOMMENDED') continue;
    const n = slotInstanceCount(slot);
    const st = styleForSlot(slot.role, slot.group, skin);
    const minWidthPx = NO_WRAP_ROLES.has(slot.role) ? 260 : 0;
    for (let i = 0; i < n; i += 1) {
      const xPx = at(slot.x, i);
      const yPx = at(slot.y, i);
      const hPx = slot.h ?? 0;
      let content = resolveSlotContent(activeFill, layoutKey, slot.role, slot.group, i);
      // Tracked UPPERCASE mini-labels (Figma): comparison criteria, stat sub-labels,
      // diagram bar labels.
      if (
        (layoutKey === '03-comparison' && slot.role === 'metric-label' && slot.group === 'criterion') ||
        (layoutKey === '02-stat' && slot.role === 'metric-label' && slot.group === 'sub') ||
        (layoutKey === '12-diagram' && slot.role === 'metric-label' && slot.group === 'bar-label')
      ) {
        content = content.toUpperCase();
      }
      const ls = st.letterSpacing ?? 0;
      // Width: most slots use the manifest box. Big numeric values (metric-value)
      // are content-sized — fit the placeholder so a different-width number than
      // the original never wraps and forces an autofit shrink (a fidelity miss).
      let wPx = Math.max(slot.w ?? 0, minWidthPx);
      if (slot.role === 'metric-value' || FIT_WIDTH_RG.has(`${slot.role}:${slot.group ?? ''}`)) {
        wPx = Math.max(wPx, estimateLabelWidth(content, slot.size ?? 0, ls) + 16);
      }
      const color = slot.role === 'delta'
        ? (content.includes('↓') ? DELTA_NEG : DELTA_POS)
        : (slot.role === 'icon' && layoutKey === '04-process')
          ? DELTA_POS // process rail arrows share the node's green accent
          : st.color;
      // Volt display headings paint a gradient fill instead of a solid color.
      const gradient = voltGradientFor(skinId, slot.role, slot.group);
      if (i === 0) {
        labelMeta[`${slot.role}:${slot.group ?? ''}`] = { x: xPx, y: yPx, h: hPx, size: slot.size ?? 0, content, ls };
      }
      freeform.push({
        id: `ff-struct-${slot.role}-${slot.group ?? 'x'}-${i}`,
        type: 'text',
        variant: st.variant,
        content,
        ...(slot.verbatim ? { verbatim: true } : {}),
        x: (xPx / FRAME_W) * 100,
        y: (yPx / FRAME_H) * 100,
        w: (wPx / FRAME_W) * 100,
        h: (hPx / FRAME_H) * 100,
        rotation: 0,
        z: z++,
        style: {
          fontFamily: st.fontFamily,
          fontSize: slot.size,
          fontWeight: st.fontWeight,
          ...(gradient ? { gradient } : { color }),
          // An explicit slot.align (imported layouts) wins; otherwise fall back to
          // Compose's per-layout centered/right maps (its own 12 set no slot.align).
          textAlign: slot.align === 'center' || slot.align === 'right' || slot.align === 'left' ? slot.align
            : CENTERED_BY_LAYOUT[layoutKey]?.has(`${slot.role}:${slot.group ?? ''}`) ? 'center'
            : RIGHT_ALIGNED[`${layoutKey}:${skinId}`]?.has(`${slot.role}:${slot.group ?? ''}`) ? 'right' : 'left',
          ...(st.letterSpacing != null ? { letterSpacing: st.letterSpacing } : {}),
          ...(st.lineHeight != null ? { lineHeight: st.lineHeight } : {}),
          // Section-divider title bottom-anchors in its box so it sits just
          // above the divider accent bar regardless of line count (matches the
          // Figma frame, where a 2-line title fills the box to the bar). Scoped
          // to 08-divider so the mono-dark COVER (same section-title group) is
          // unaffected.
          ...(layoutKey === '08-divider' && slot.role === 'title' && slot.group === 'section-title'
            ? { verticalAlign: 'bottom' as const }
            : {}),
        },
      });
    }
  }

  // Decorations (skin tokens → colors). Behind text (z 1..D).
  const decos = (DECORATIONS[layoutKey]?.[skinId] ?? DECORATIONS[layoutKey]?.shared ?? [])
    .filter((d) => !(suppressStatDivider && d.role === 'divider'));
  let dz = 1;
  for (const d of decos) {
    let { x, y, w, h } = d;
    if (d.hugRole) {
      const meta = labelMeta[`${d.hugRole}:${d.hugGroup ?? ''}`];
      // Skip the pill when the hugged label is absent OR empty — otherwise a
      // stripped/blank value (e.g. an ungrounded delta removed by FR11) leaves
      // an empty floating shape. No content → no pill.
      if (!meta || !meta.content.trim()) continue;
      const padX = d.padX ?? 0;
      const padY = d.padY ?? 0;
      const tw = estimateLabelWidth(meta.content, meta.size, meta.ls);
      x = meta.x - padX;
      y = meta.y - padY;
      w = tw + padX * 2;
      h = meta.h + padY * 2;
      // Center the hugged label INSIDE its pill: snap the text box to the pill's
      // bounds and center-align it. The label is then truly centered regardless
      // of estimateLabelWidth error or the text div's padding (which otherwise
      // left-shift a left-aligned label within its hug pill).
      const tb = freeform.find((b) => b.id === `ff-struct-${d.hugRole}-${d.hugGroup ?? 'x'}-0`);
      if (tb && tb.type === 'text') {
        // Snap the label box to the pill's full bounds and center it both ways —
        // horizontal (textAlign) + vertical (verticalAlign). Spanning the pill's
        // height + flex-centering puts the single line on the pill's midline
        // instead of riding the bottom edge (the text div's top padding offsets
        // a box shorter than the line-box otherwise).
        tb.x = (x / FRAME_W) * 100;
        tb.y = (y / FRAME_H) * 100;
        tb.w = (w / FRAME_W) * 100;
        tb.h = (h / FRAME_H) * 100;
        tb.style = { ...tb.style, textAlign: 'center', verticalAlign: 'center' };
      }
    }
    const shape: FreeformShapeBlock = {
      id: `ff-deco-${d.role}-${dz}`,
      type: 'shape',
      shape: d.shape,
      fill: hexToRgba(d.fillLiteral ?? tokenColor(skin, d.fillToken ?? 'ink'), d.fillOpacity ?? 1),
      ...((d.strokeColor || d.strokeToken)
        ? { stroke: hexToRgba(d.strokeColor ?? tokenColor(skin, d.strokeToken ?? 'ink'), d.strokeOpacity ?? 1), strokeWidth: d.strokeWeight ?? 1 }
        : {}),
      // Pill/tag badges square off (radius dropped); all other shapes keep theirs.
      ...(SQUARE_TAG_ROLES.has(d.role)
        ? {}
        : d.radius != null
          ? { borderRadius: d.radius }
          : {}),
      ...(d.boxShadow ? { boxShadow: d.boxShadow } : {}),
      x: ((x ?? 0) / FRAME_W) * 100,
      y: ((y ?? 0) / FRAME_H) * 100,
      w: ((w ?? 0) / FRAME_W) * 100,
      h: ((h ?? 0) / FRAME_H) * 100,
      rotation: 0,
      z: dz++,
    };
    freeform.push(shape);
  }

  // Comparison criterion chips (03): a translucent-ground chip that HUGS each
  // criterion label and is centred on the x=480 divider, so it masks the line
  // behind the middle word (matches the Figma validated template, where each
  // chip's width tracks its label — "DO" is narrow, "IPSUM DOLOR SIT" is wide).
  // Per-instance, so it can't be a static decoration. Painted above the divider
  // (z=dz++) and below the text (z≥100).
  // Volt keeps its criterion labels FAR-LEFT (Lisa 2026-06-24): its two value
  // columns sit at x320/x612 with only a ~42px gap, so the shared centered-on-the-
  // divider treatment below would drop each label on top of the left value column.
  // Volt's skeleton already places criterion at x≈84 (a left-margin row header),
  // left-aligned — so simply skip the recentering for it.
  if (layoutKey === '03-comparison' && skinId !== 'volt') {
    const DIV_X = 480;
    // The chip + label MUST stay inside the column gap — between the left values
    // (right edge ~392) and the recommended card (left edge 568). A long
    // criterion otherwise widens its chip past 568 and overlaps the card on the
    // right (Lisa 2026-06-17). Cap the chip half-width to the gap (~78px) and
    // WRAP a long label onto a second line within that width instead of letting
    // it grow rightward into the card.
    const MAX_CHIP_W = 168; // half-width 84 → spans 396..564, ~4px clear of the
                            // left values (392) and the recommended card (568)
    const INNER = MAX_CHIP_W - 24; // label wrap width inside the chip padding
    for (let i = 0; i < 4; i += 1) {
      const tb = freeform.find((b) => b.id === `ff-struct-metric-label-criterion-${i}`);
      if (!tb || tb.type !== 'text' || !tb.content.trim()) continue;
      const size = typeof tb.style?.fontSize === 'number' ? tb.style.fontSize : 10;
      const lsv = typeof tb.style?.letterSpacing === 'number' ? tb.style.letterSpacing : 0;
      const naturalW = estimateLabelWidth(tb.content, size, lsv);
      const lines = Math.max(1, Math.ceil(naturalW / INNER));
      const chipW = Math.min(naturalW + 24, MAX_CHIP_W);
      const labelW = chipW - 24;
      const chipH = Math.round(lines * size * 1.5 + 10); // line(s) + vertical padding
      // Center the chip on the criterion's row (its slot midline, which lines up
      // with the left/right value rows), then snap the label to the chip's FULL
      // bounds and center it BOTH ways. verticalAlign:'center' puts the (1- or
      // 2-line) label on the chip's vertical midline instead of riding an edge;
      // the narrow labelW wraps a long label within the gap. Mirrors the
      // hugged-pill centering.
      const rowCenterPx = (tb.y / 100) * FRAME_H + ((tb.h / 100) * FRAME_H) / 2;
      const chipTopPx = rowCenterPx - chipH / 2;
      tb.x = ((DIV_X - labelW / 2) / FRAME_W) * 100;
      tb.w = (labelW / FRAME_W) * 100;
      tb.y = (chipTopPx / FRAME_H) * 100;
      tb.h = (chipH / FRAME_H) * 100;
      tb.style = { ...tb.style, textAlign: 'center', verticalAlign: 'center' };
      // NO chip shape behind the criterion label (Lisa 2026-06-17): the chip was
      // a rounded `rectangle`, but PPTX export flattens it to a hard rectangle —
      // so the pill never survives export. We keep only the centered label (the
      // vertical divider it used to mask is removed in structureDecorations, so
      // nothing crosses the text). `chipW`/`chipH`/`chipTopPx` above still size +
      // center the LABEL box in its row.
      void chipW;
    }
  }

  // Icons: place a real SVG-backed icon (PictographicIcon, exported as SVG) in
  // each icon-badge decoration when the generator supplied one. Keyed
  // `icon:<group>` in the fill (e.g. `icon:card-badge`). Centered in the badge,
  // sized to ~48% of the badge so it reads inside the circle. Without a fill the
  // badges stay empty (today's behavior) — never a broken glyph.
  // Generator-chosen icons when filling; otherwise a neutral default set so the
  // icon-badge layouts (e.g. infographic) render WITH pictograms in the blank
  // preview + any deck the generator didn't supply icons for (Lisa: the
  // pictogram library should be utilized, not left as empty badges).
  const iconNames = fill?.['icon:card-badge']
    ?? (decos.some((d) => d.role === 'icon-badge') ? ['target', 'lightbulb', 'rocket'] : undefined);
  if (Array.isArray(iconNames) && iconNames.length) {
    const badges = decos.filter((d) => d.role === 'icon-badge');
    badges.forEach((badge, i) => {
      const name = iconNames[i];
      if (!name || typeof name !== 'string') return;
      const bx = badge.x ?? 0;
      const by = badge.y ?? 0;
      const bw = badge.w ?? 0;
      const bh = badge.h ?? 0;
      const side = Math.round(Math.min(bw, bh) * 0.48);
      const ix = bx + (bw - side) / 2;
      const iy = by + (bh - side) / 2;
      const icon: FreeformIconBlock = {
        id: `ff-icon-card-badge-${i}`,
        type: 'icon',
        name,
        color: skin.accent,
        x: (ix / FRAME_W) * 100,
        y: (iy / FRAME_H) * 100,
        w: (side / FRAME_W) * 100,
        h: (side / FRAME_H) * 100,
        rotation: 0,
        z: 200 + i,
      };
      freeform.push(icon);
    });
  }

  // Universal bottom-padding rule: keep all content above a bottom safe margin.
  // Several validated layouts place content as low as y≈506–514 (inside the 72px
  // bottom margin). Compress the whole composition toward its TOP anchor so the
  // lowest element ends at BOTTOM_LIMIT. Clamp ≤ 1 (never expand a short layout)
  // and to a gentle floor so nothing is squished illegibly. Applied uniformly to
  // text, decorations, and icons so alignment is preserved.
  //
  // Runs BEFORE the row-card vertical-centering below so centering uses the
  // FINAL (post-scale) font sizes — otherwise the scale re-introduces the very
  // top/bottom asymmetry centering just removed.
  const BOTTOM_LIMIT = 90; // % — leaves ~10% (54px) bottom padding
  {
    const tops = freeform.map((b) => b.y);
    const bottoms = freeform.map((b) => b.y + b.h);
    const minTop = Math.min(...tops);
    const maxBottom = Math.max(...bottoms);
    if (maxBottom > BOTTOM_LIMIT && maxBottom - minTop > 0.01) {
      const factor = Math.max(0.82, (BOTTOM_LIMIT - minTop) / (maxBottom - minTop));
      if (factor < 1) {
        for (const b of freeform) {
          b.y = minTop + (b.y - minTop) * factor;
          b.h = b.h * factor;
          // Scale font size with the box so text never outgrows its (now shorter)
          // container — otherwise shrinking h alone makes text overflow.
          if (b.type === 'text' && typeof b.style?.fontSize === 'number') {
            b.style = { ...b.style, fontSize: b.style.fontSize * factor };
          }
        }
      }
    }
  }

  // Vertical-centering in ROW cards: text inside a short, wide rectangle (the
  // "3 bullet points in a box" rows, e.g. 05-content) must sit vertically
  // centered — equal top + bottom padding — not top-aligned. Applies to ANY
  // layout using that pattern. Detected geometrically (short + wide rectangle)
  // so tall cards (e.g. infographic) keep their own top-anchored composition.
  //
  // Centering must use each text block's RENDERED height, not its manifest box
  // `h`. FreeformLayer renders the editable text div with 4px padding all round
  // and line-height ~1.2, with overflow:visible — so a single line of fontSize F
  // occupies `F·lineHeight + 8px`, which is taller than the (often ~16px) box.
  // Centering on the box `h` underestimated the group height and parked it ~8px
  // too low (body dipped past the card's bottom edge — the uneven padding bug).
  {
    const TEXT_PAD_PX = 8; // 4px top + 4px bottom (FreeformLayer text div)
    const DEFAULT_LH = 1.2;
    const ROW_MAX_H = (90 / FRAME_H) * 100;   // ≤ 90px tall → a "row" box
    const ROW_MIN_W = (300 / FRAME_W) * 100;  // ≥ 300px wide
    // Rendered height of a text block in PERCENT of the frame: the larger of its
    // declared box and one line of glyphs + the div's fixed padding.
    const renderedHpct = (b: FreeformTextBlock): number => {
      const boxPx = (b.h / 100) * FRAME_H;
      const fs = typeof b.style?.fontSize === 'number' ? b.style.fontSize : 0;
      const lh = typeof b.style?.lineHeight === 'number' ? b.style.lineHeight : DEFAULT_LH;
      const linePx = fs * lh + TEXT_PAD_PX;
      return (Math.max(boxPx, linePx) / FRAME_H) * 100;
    };
    const rowCards = freeform.filter(
      (b): b is FreeformShapeBlock =>
        b.type === 'shape' && b.shape === 'rectangle' && b.h <= ROW_MAX_H && b.w >= ROW_MIN_W,
    );
    for (const rc of rowCards) {
      const members = freeform.filter(
        (b): b is FreeformTextBlock =>
          b.type === 'text' &&
          b.y >= rc.y - 0.5 &&
          b.y + b.h <= rc.y + rc.h + 0.5 &&
          b.x >= rc.x - 0.5 &&
          b.x < rc.x + rc.w,
      );
      if (members.length === 0) continue;
      const top = Math.min(...members.map((b) => b.y));
      const bottom = Math.max(...members.map((b) => b.y + renderedHpct(b)));
      const desiredTop = rc.y + (rc.h - (bottom - top)) / 2;
      const shift = desiredTop - top;
      if (Math.abs(shift) > 0.05) for (const b of members) b.y += shift;
    }
  }

  // 10-agenda: independently center BOTH the big item NUMBER and the title+desc
  // pair on each card's vertical midline — equal top/bottom padding. The shared
  // group-centering above left the number low (it's much taller) and the text
  // top-aligned; this aligns everything to the card center. Cards are the wide
  // rectangles, top-to-bottom.
  if (layoutKey === '10-agenda') {
    const renderedHpctOf = (b: FreeformTextBlock): number => {
      const fs = typeof b.style?.fontSize === 'number' ? b.style.fontSize : 14;
      const lh = typeof b.style?.lineHeight === 'number' ? b.style.lineHeight : 1.2;
      return Math.max(b.h, ((fs * lh + 8) / FRAME_H) * 100);
    };
    const agendaCards = freeform
      // Real per-item cards only (tall rectangles) — NOT the combo agenda's thin
      // separator rules, which this original-agenda centering pass must ignore.
      .filter((b): b is FreeformShapeBlock => b.type === 'shape' && b.shape === 'rectangle' && b.w > 50 && b.h > 5)
      .sort((a, b) => a.y - b.y);
    agendaCards.forEach((rc, i) => {
      const center = rc.y + rc.h / 2;
      const num = freeform.find((b) => b.id === `ff-struct-metric-value-item-number-${i}`);
      if (num && num.type === 'text') {
        const h = renderedHpctOf(num);
        num.y = center - h / 2;
        num.h = h;
      }
      // Center the title + description PAIR as a unit (preserving their spacing).
      const pair = [
        freeform.find((b) => b.id === `ff-struct-metric-label-item-title-${i}`),
        freeform.find((b) => b.id === `ff-struct-body-item-desc-${i}`),
      ].filter((b): b is FreeformTextBlock => !!b && b.type === 'text');
      if (pair.length) {
        const top = Math.min(...pair.map((b) => b.y));
        const bottom = Math.max(...pair.map((b) => b.y + renderedHpctOf(b)));
        const shift = center - (top + bottom) / 2;
        for (const b of pair) b.y += shift;
      }
    });
  }

  let bg = backgroundFor(skin.ground);
  // Per-category background (within the theme). Absent → the single skin ground.
  const catBg = CATEGORY_BACKGROUNDS[skinId]?.[layoutCategory(layoutKey)];
  if (catBg) {
    bg = catBg.bg;
    // Dark category bg → repaint text in the skin's ground so it stays legible
    // (gradient-fill text, e.g. Volt, is left alone).
    if (catBg.invert) {
      for (const b of freeform) {
        if (b.type === 'text' && !(b as { style?: { gradient?: string } }).style?.gradient) {
          (b as { style?: Record<string, unknown> }).style = { ...(b as { style?: Record<string, unknown> }).style, color: skin.ground };
        }
      }
    }
  }
  // Glass-panel skins (Glacier, Volt): the inset frosted panel sits behind content on
  // every category EXCEPT `content` (which uses its own list cards). z:0 = backmost
  // freeform, above the full-bleed bg image, below all content (z≥100). Percent geom.
  const panel = SKIN_PANEL[skinId];
  if (panel && layoutCategory(layoutKey) !== 'content') {
    freeform.unshift({
      id: `ff-deco-${skinId}-panel`,
      type: 'shape',
      shape: 'rectangle',
      x: panel.xPct, y: panel.yPct, w: panel.wPct, h: panel.hPct,
      rotation: 0,
      z: 0,
      fill: panel.fill,
      stroke: panel.stroke,
      strokeWidth: panel.strokeWidth,
      borderRadius: panel.borderRadius,
      boxShadow: panel.boxShadow,
    });
  }
  const bgCss = bg.gradient ?? bg.color ?? '#ffffff';
  const card: Card = {
    id: `card-struct-${layoutKey}-${skinId}`,
    layout: 'single',
    style: 'default',
    background: bg,
    columns: [{ blocks: [] }],
    freeform,
  };

  return {
    id: `struct-${layoutKey}-${skinId}-${fill ? 'filled' : 'blank'}`,
    name: `${LAYOUT_LABEL[layoutKey] ?? layoutKey} — ${skin.label}`,
    description: layout.purpose ?? '',
    category: 'structure',
    thumbnail: '',
    theme: {
      // Editor workspace bg: a dedicated, theme-related but CONTRASTING backdrop so
      // the deck pops off the canvas. Falls back to the slide bg (old behaviour).
      pageBg: skin.editorBg ?? bgCss,
      ...(skin.editorBg ? { workspaceBg: skin.editorBg } : {}),
      cardBg: bgCss,
      cardBgOpacity: 1,
      cardRadius: 16,
      cardPadding: 48,
      accentColors: [skin.accent],
      headingFont: skin.fonts.display,
      bodyFont: skin.fonts.body,
      headingColor: skin.ink,
      bodyColor: SKIN_SUB[skinId] ?? skin.ink,
    },
    cards: [card],
  };
}

// ── Slot introspection (for the generator) ──────────────────────────────────
// The structure-fill generator needs the machine-readable list of a layout's
// fillable blanks — their semantic key (role:group), how many instances, and
// the per-instance CHARACTER BUDGET derived from the manifest budgetFormula:
//   charsPerLine = floor(w / (size * 0.52))
//   maxLines     = max(1, floor(h / (size * 1.25)))
//   charCap      = charsPerLine * maxLines
// "Lock-the-box": the generator writes WITHIN charCap so the slot never
// overflows and forces an autofit shrink (a fidelity miss).

export interface LayoutSlotSpec {
  /** `${role}:${group ?? ''}` — the fill key, same as PLACEHOLDERS. */
  key: string;
  role: string;
  group?: string;
  /** How many instances this blank has (1 for a scalar; N for count/array). */
  count: number;
  /** Per-instance character budget (lock-the-box cap). */
  charCap: number;
  /** Manifest box width px (in the 960-wide frame) — lets the filler tell a
   *  full-width row (can grow / hold a long single line) from a narrow column. */
  w: number;
  /** Manifest font size px (for reference / shorter slots). */
  size: number;
  /** The layout's neutral placeholder(s) — a writing example for the model. */
  placeholder: string | string[];
  /** Imported layouts only: the FROZEN per-mode budget. When present the filler
   *  uses budget[mode] as charCap for the active density (overriding the derived
   *  cap above) — carries document-studio's measured density. */
  budget?: { concise: number; detailed: number; extensive: number };
  /** VERBATIM slot (a quote): the fill reproduces it exactly (no cap), and the
   *  fit never trims it. */
  verbatim?: boolean;
}

/** Character budget for a single slot, from the manifest box geometry.
 *  charsPerLine × maxLines assumes PERFECT packing; real word-wrap leaves line
 *  ends ragged (a word that won't fit wraps early), so usable capacity is a bit
 *  lower — apply a mild realism haircut. The fit's grow-to-fit pass absorbs any
 *  remaining overflow (a box grows DOWN into empty space rather than the text
 *  shrinking/trimming), so the haircut stays gentle (Lisa 2026-06-22). */
const WRAP_EFFICIENCY = 0.92;
export function slotCharCap(w: number, h: number, size: number): number {
  if (!size || size <= 0) return 80;
  const charsPerLine = Math.max(1, Math.floor(w / (size * 0.52)));
  const maxLines = Math.max(1, Math.floor(h / (size * 1.25)));
  return Math.max(1, Math.round(charsPerLine * maxLines * WRAP_EFFICIENCY));
}

/** Describe a layout's fillable text blanks for the generator. Image and
 *  non-fill structural slots are omitted (the generator only writes text). */
/** Register a layout (+ its decorations) at runtime — used by the combo-baseline
 *  system that DERIVES a layout's geometry from a combo spec instead of hand
 *  authoring it. Overwrites any existing key. */
export function registerRuntimeLayout(key: string, layout: ManifestLayout, decos?: Decoration[]): void {
  manifest.layouts[key] = layout;
  if (decos) DECORATIONS[key] = { shared: decos };
}

/** Image-slot geometry (960-px design points) for an imported image layout, in
 *  manifest order. Empty for layouts with no image slot (Compose's own 12 — their
 *  images come from the deck-image pipeline, not manifest slots). The deck pipeline
 *  sources one image per slot and places it here (theme paints everything else). */
export function imageSlotsFor(layoutKey: string, skinId: string): { x: number; y: number; w: number; h: number }[] {
  const layout = manifest.layouts[layoutKey];
  const slots = (skinId === 'volt' ? undefined : layout?.perTemplate?.[skinId]) ?? layout?.shared ?? [];
  return slots
    .filter((s) => s.type === 'image' && typeof s.x === 'number' && s.w && s.h)
    .map((s) => ({ x: s.x as number, y: s.y as number, w: s.w as number, h: s.h as number }));
}

/** Overlay info for an imported layout with text over its image — the renderer
 *  scrim's text zone. Null for non-overlay layouts. */
export function overlayInfoFor(layoutKey: string): { zone: NonNullable<Card['slideDesign']>['textSafeZone'] } | null {
  const l = manifest.layouts[layoutKey];
  if (!l?.overlay) return null;
  const zone = (l.overlayZone ?? 'full') as NonNullable<Card['slideDesign']>['textSafeZone'];
  return { zone };
}

export function describeLayoutSlots(layoutKey: string, skinId: string): LayoutSlotSpec[] {
  const layout = manifest.layouts[layoutKey];
  if (!layout) throw new Error(`Unknown layout: ${layoutKey}`);
  // Per-theme interior geometry: a skin may ship its OWN per-layout geometry
  // (e.g. Volt's reworked skeletons) under perTemplate[skinId]. Prefer it; other
  // skins fall back to the canonical `shared` interior geometry (unchanged).
  const slots = (skinId === 'volt' ? undefined : layout.perTemplate?.[skinId]) ?? layout.shared ?? [];
  const specs: LayoutSlotSpec[] = [];
  for (const slot of slots) {
    if (slot.type === 'image') continue;
    // `icon` / `decoration` slots are glyph marks (→, ", quote mark), not
    // generator-writable copy — skip them so the model isn't asked to fill them.
    if (slot.role === 'icon' || slot.role === 'decoration') continue;
    const key = `${slot.role}:${slot.group ?? ''}`;
    const count = slotInstanceCount(slot);
    const size = slot.size ?? 16;
    const w = slot.w ?? 200;
    const h = slot.h ?? size * 1.3;
    // Content-sized slots auto-widen in the builder (estimateLabelWidth) so a
    // longer value than the original never overflows — the box grows to fit.
    // For these the box-derived cap is far too tight (a 200px hero number gives
    // ~4 chars, chopping "$4.2M" → "$4.2"). Floor them at a sane label length so
    // the writer keeps real values intact without risking a slide-spilling run.
    const contentSized =
      slot.role === 'metric-value' || FIT_WIDTH_RG.has(key) || NO_WRAP_ROLES.has(slot.role);
    let charCap = slotCharCap(w, h, size);
    if (contentSized) {
      const floor = slot.role === 'metric-value' ? 12 : 36;
      charCap = Math.max(charCap, floor);
    }
    specs.push({
      key,
      role: slot.role,
      group: slot.group,
      count,
      charCap,
      w,
      size,
      placeholder: PLACEHOLDERS[layoutKey]?.[key] ?? '',
      ...(slot.budget ? { budget: slot.budget } : {}),
      ...(slot.verbatim ? { verbatim: true } : {}),
    });
  }
  return specs;
}

/** The skins offered for GENERATION, manifest order. A skin must be both
 *  `mapped` (Figma-validated interiors) AND have a `faithful` cover — the
 *  HIDDEN-until-faithful gate (Lisa 2026-06-17). An `approximation` cover
 *  (glass/photo/gradient that currently falls back to flat, e.g. Quill /
 *  Chroma-fold / Vellum) is withheld until its real cover asset lands, because
 *  slide 1 is too prominent to ship unfaithful. Approximations still render in
 *  /internal/structure-preview (buildStructureTemplate doesn't filter), so QA
 *  keeps full coverage; they're simply never auto-selected for a generated deck.
 *  An unmapped palette (e.g. Blue) is never offered regardless. */
// The ONLY skins offered from prompt generation + the theme selection (Lisa
// 2026-07-13). Others stay in the manifest for saved-deck back-compat but are not
// offered. Keep in sync with SELECTABLE_THEME_IDS (themes.ts).
const OFFERED_SKIN_IDS = new Set(['mono-light', 'volt', 'mono-dark', 'obsidian', 'aperture', 'mubi', 'cosmos', 'cobalt', 'prism', 'velvet', 'solstice', 'nocturne', 'tide', 'mist', 'strata', 'riot', 'verdant', 'midnight-index', 'aurora', 'nebulae', 'northern-lights', 'glasshouse']);
export const STRUCTURE_SKIN_IDS = Object.entries(manifest.templates)
  .filter(([id, s]) => OFFERED_SKIN_IDS.has(id) && s.mapped && s.cover?.fidelity === 'faithful')
  .sort((a, b) => a[1].order - b[1].order)
  .map(([id]) => id);

/** Whether a skin's COVER may receive a full-bleed library image. FALSE for
 *  faithful covers — they are typographic by design (their Figma cover carries
 *  no image), so their cover image-role is effectively 'none' and a photo would
 *  clobber the very design the fidelity gate protects (Lisa 2026-06-17). Only a
 *  non-faithful cover (an approximation standing in until its real asset lands)
 *  accepts a library image. Content-slide images (05-content split) are
 *  unaffected — they're safe on every skin. */
export function coverAcceptsImage(skinId: string): boolean {
  return manifest.templates[skinId]?.cover?.fidelity !== 'faithful';
}

/** Human label + character for a skin (for the planner prompt / logging). */
export function skinSummary(skinId: string): { id: string; label: string; character: string } | null {
  const s = manifest.templates[skinId] as (ManifestSkin & { character?: string }) | undefined;
  if (!s) return null;
  return { id: skinId, label: s.label, character: (s as { character?: string }).character ?? '' };
}

/** The layout catalogue (key, purpose) for the planner prompt. */
export function layoutCatalogue(): { key: string; label: string; purpose: string; selectable: boolean; minNumbers?: number; hasImage?: boolean; needsQuote?: boolean }[] {
  // Compose's own 12 first (fixed order), then any imported `ds-` layouts (label +
  // purpose come from the imported entry). Order is cosmetic — the planner picks by
  // purpose; cover-first is enforced separately. `selectable`/`minNumbers` let the
  // planner gate imported layouts (quote/media not offered; stat/chart number-gated).
  const importedKeys = Object.keys(manifest.layouts).filter((k) => !LAYOUT_KEYS.includes(k as (typeof LAYOUT_KEYS)[number]));
  return [...LAYOUT_KEYS, ...importedKeys].map((key) => {
    const l = manifest.layouts[key];
    return {
      key,
      label: l?.label ?? LAYOUT_LABEL[key] ?? key,
      purpose: l?.purpose ?? '',
      selectable: l?.selectable !== false, // undefined (Compose's own) = selectable
      ...(l?.minNumbers ? { minNumbers: l.minNumbers } : {}),
      ...(l?.hasImage ? { hasImage: true } : {}),
      ...(l?.needsQuote ? { needsQuote: true } : {}),
    };
  });
}
