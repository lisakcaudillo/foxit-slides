'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Users,
  Palette,
  Loader2,
  Upload,
  X,
  LayoutTemplate,
  Settings2,
  ChevronDown,
  Pencil,
  Mic2,
  ImagePlus,
  Check,
} from 'lucide-react';
import DeckViewer from '@/components/card-template/DeckViewer';
import SlideDeckPrint from '@/components/card-template/SlideDeckPrint';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FrameworkThumbnail } from '@/components/framework/FrameworkThumbnail';
import type { CardTemplate, Card, CardImageIntent, FreeformBlock, FreeformImageBlock, FreeformTextBlock } from '@/types/card-template';
import { PROJECT_BRIEF_TEMPLATE } from '@/data/cardTemplates';
import {
  FRAMEWORKS,
  CATEGORIES,
  suggestFramework,
  type Framework,
  type FrameworkCategory,
} from '@/data/frameworks';
import { THEMES, getThemeById, DEFAULT_THEME_ID } from '@/components/themes/themes';
import type { Theme } from '@/components/themes/types';
import { DOCUMENT_SKILLS, type SkillId } from '@/lib/document-skills';
import { categoryLabel } from '@/components/image-gen/library';
import { ThemesModal } from '@/components/themes/ThemesModal';
import { useTheme } from '@/lib/theme/useTheme';
import { getDeck, saveDeck, generateDeckId, getPriorDeckContext } from '@/lib/cardDeckStorage';
import { templateToUnified, cardToUnified } from '@/lib/structuredToFreeform';
import {
  coverTierForTheme,
  coverTierImageRole,
  coverTierWantsImage,
  type CoverTier,
} from '@/lib/card-engine/cover-tiers';
import {
  selectCompositionFromAllowed,
  compositionWantsImage,
  compositionGeometry,
  headlineLengthOf,
  type CompositionResult,
} from '@/lib/card-engine/cover-composition';
import { applyCoverComposition } from '@/lib/card-engine/cover-compose';
import { designCover, type CoverColors } from '@/lib/card-engine/designer/cover';
import { COVER_LAYOUT_PIECES } from '@/lib/card-engine/cover-layout-pieces';
import { layoutCoverFromPiece, resolveCoverPiece } from '@/lib/card-engine/layout-cover-from-piece';
import { judgeCover } from '@/lib/card-engine/judge/cover-judge';
import { runDesignCriticObserve } from '@/lib/design-critic-observe';
import { DraftingOverlay } from '@/components/card-template/DraftingOverlay';
import { LAYOUT_PICKS, LayoutPreview } from '@/components/card-template/layout-picks';
import { estimateTypeDuration } from '@/components/card-template/Typewriter';


// ── Types ──────────────────────────────────────────────────────────────────

type Density = 'concise' | 'detailed' | 'extensive';

// Pull the first hex color out of a value that may be a gradient string.
// Used when adapting a Theme for the legacy TemplateTheme shape the engine
// still expects (engine fields like headingColor and accentColors must be
// solid hexes for the AI prompt to reference them).
function extractFirstHex(value: string, fallback = '#6B3FA0'): string {
  const m = value.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : fallback;
}

// Map the 12-theme document Theme shape (the source of truth, used by
// ThemeProvider + ThemesModal) into the legacy TemplateTheme shape that the
// card-engine internals consume. Fonts and colors come straight from the
// document theme; cards visually render via CSS variables (var(--theme-*))
// so most of the cardBg/cardRadius defaults here are just for engine
// metadata that the AI prompt references.
function themeToTemplate(t: Theme): import('@/types/card-template').TemplateTheme {
  const headingHex = extractFirstHex(t.titleColor, t.bodyColor);
  const primaryHex = extractFirstHex(t.primaryBg, t.linkColor);
  return {
    pageBg: t.pageBg,
    cardBg: t.pageBg, // cards consume var(--theme-page-bg) at render time; this field is just metadata
    cardBgOpacity: 1,
    cardRadius: 16,
    cardPadding: 48,
    accentColors: [primaryHex, t.linkColor],
    headingFont: t.titleFont,
    bodyFont: t.bodyFont,
    headingColor: headingHex,
    bodyColor: t.bodyColor,
    // Design Intelligence Layer (Phase 2) — carry the theme's archetype onto the
    // runtime theme so the card-engine deck planner reads the per-theme recipe
    // whitelist + image-role weighting instead of the single DEFAULT_ARCHETYPE.
    archetype: t.archetype,
  };
}

// Pull the human-readable family names out of a font stack to know which
// Google Fonts to load for the active theme.
// Auto-generated deck name = the deck title, lowercase-hyphenated,
// e.g. "sustainable-meal-kit-startup". The format signals "this was
// auto-generated, rename me". Editable by the user.
// Light filler-stripping keeps it reading like a title rather than the raw prompt.
const _SLUG_FILLER = new Set([
  'a', 'an', 'the', 'for', 'of', 'to', 'our', 'my', 'new', 'about', 'on', 'with',
  'and', 'or', 'in', 'is', 'pitch', 'deck', 'presentation', 'slides', 'slide',
  'create', 'make', 'generate', 'build', 'short', 'punchy',
]);
function slugifyTopic(text: string): string {
  const words = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !_SLUG_FILLER.has(w));
  return (words.length ? words.slice(0, 6) : ['untitled']).join('-');
}

// Auto deck name = the cover heading (first text block of the first card), which
// reads as a real, human title (e.g. "Mozart's Defining Classical Elegance").
// The user can rename it from the editor.
function coverHeading(cards: CardTemplate['cards'] | undefined): string {
  for (const c of cards ?? []) {
    for (const b of c.freeform ?? []) {
      if (b.type === 'text' && typeof b.content === 'string' && b.content.trim()) {
        return b.content.trim().slice(0, 80);
      }
    }
  }
  return '';
}

function getThemeFonts(themeId: string): string[] {
  const t = getThemeById(themeId);
  const stripStack = (s: string) => s.replace(/^['"]?([^,'"]+).*/, '$1').trim();
  return Array.from(new Set([stripStack(t.titleFont), stripStack(t.bodyFont)]));
}

// Random topic pool for the no-framework Inspire Me pill. When the user
// hasn't picked a template yet, clicking Inspire Me drops a topical prompt
// into the textarea so they have a starting point. When a framework IS
// picked, the wizard switches to a chip row of that framework's
// `inspireTopics` instead (added in commit c9348a3).
// Static preset lists for the Customize popover. AI-suggested audiences/tones
// (debounced from the prompt via /api/ai/suggest-context) are merged in front
// of these so they appear first; the static fallbacks make sure the menu has
// useful options even before the user has typed a prompt.
const AUDIENCE_PRESETS: string[] = [
  'Executives',
  'Engineers',
  'Designers',
  'Sales team',
  'Customers',
  'General public',
  'Investors',
  'Students',
];

const TONE_PRESETS: string[] = [
  'Professional',
  'Casual',
  'Friendly',
  'Authoritative',
  'Inspirational',
  'Educational',
  'Conversational',
  'Technical',
];

const INSPIRE_POOL: string[] = [
  'Q4 product roadmap for engineering team',
  'Series A pitch for an AI legal tech startup',
  'Onboarding deck for new sales hires',
  'Customer success kickoff for an enterprise SaaS account',
  'Annual marketing strategy review for a B2B SaaS company',
  'Lessons from rebuilding our deployment pipeline',
  'How we ship code at a 50-person startup',
  'Partnership proposal for a fintech integration',
  'Field guide to running effective 1:1s',
  'Year-in-review for a product design team',
];

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)',
  border: '1px solid rgba(0,0,0,0.06)', borderRadius: '16px',
  boxShadow: '0 2px 12px rgba(0,0,40,0.06)',
};

// Reusable +/- stepper button style (used by the Slides stepper inside the
// prompt-card bottom toolbar). Hover background is applied via onMouseEnter
// rather than CSS :hover so it doesn't have to ship another keyframe.
const stepperBtn: React.CSSProperties = {
  width: '22px', height: '22px', borderRadius: '6px',
  border: 'none', background: 'transparent',
  color: '#475569', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 150ms ease',
};

// ── Auto-image placement ───────────────────────────────────────────────────
// Design Intelligence Layer (Phase 1): placement is decided BY the slide's
// image ROLE (full-bleed / column / band / texture / background), not bolted
// onto leftover space. The deck planner assigns the role; `imageRoleBox` maps
// it to a freeform box (percent of the 960×540 card). Full-bleed / texture /
// background sit BEHIND the text (z=0) with the text-safe zone kept clear;
// column / band sit in their own region (z on top) so text stays readable.
//
// `autoImageBox` (the legacy placement-driven path) is preserved as a fallback
// for cards without a slideDesign (planner didn't run / older decks).
type ImageRole =
  | 'none' | 'full-bleed' | 'column' | 'band' | 'texture' | 'duotone' | 'background';

interface AutoImageBox { x: number; y: number; w: number; h: number; behind: boolean }

function imageRoleBox(role: ImageRole, placement: CardImageIntent['placement']): AutoImageBox {
  switch (role) {
    case 'full-bleed':
    case 'duotone':
      // Fills the card, behind the text. The text-safe zone keeps copy legible.
      return { x: 0, y: 0, w: 100, h: 100, behind: true };
    case 'texture':
    case 'background':
      // Low-presence wash behind the type.
      return { x: 0, y: 0, w: 100, h: 100, behind: true };
    case 'band':
      // Thin top strip; content sits below.
      return { x: 0, y: 0, w: 100, h: 30, behind: false };
    case 'column':
      // One half anchors the image; the side follows the resolved placement.
      return placement === 'left'
        ? { x: 0, y: 0, w: 46, h: 100, behind: false }
        : { x: 54, y: 0, w: 46, h: 100, behind: false };
    case 'none':
    default:
      return autoImageBox(placement);
  }
}

// Per-role image opacity. Two distinct
// treatments for behind-text images:
//   • texture / background → FAINT WASH (~0.18). The photo recedes to a subtle
//     texture so the theme's normal (dark-on-light) text stays legible on top
//     with NO scrim. This is the fix for "dark body copy unreadable over a
//     full-strength mid-tone photo".
//   • duotone / full-bleed → undefined (full strength). The photo stays rich;
//     FreeformLayer paints an assertive scrim and FORCES light text instead.
//   • everything else (column/band/none) → undefined; the image is in its own
//     region, not behind text, so no opacity change is needed.
function imageRoleOpacity(role: ImageRole | undefined): number | undefined {
  switch (role) {
    case 'texture':
    case 'background':
      return 0.18;
    default:
      return undefined;
  }
}

// Legacy placement-driven box (fallback when no slideDesign present). Auto-
// images land in their own region so text is always readable.
function autoImageBox(
  placement: CardImageIntent['placement'],
): AutoImageBox {
  switch (placement) {
    case 'left':  return { x: 4,  y: 14, w: 42,  h: 72,  behind: false };
    case 'right': return { x: 54, y: 14, w: 42,  h: 72,  behind: false };
    case 'top':   return { x: 8,  y: 6,  w: 84,  h: 32,  behind: false };
    case 'background':
    case 'hero':
    default:      return { x: 54, y: 14, w: 42,  h: 72,  behind: false };
  }
}

// ── Cover tier (slide 0) ────────────────────────────────────────────────────
// The cover's image (photo / split tiers) reuses the SAME freeform-image
// pipeline + scrim + contrast as every other slide — only the box differs:
//   photo → full-bleed fills the card behind the title (scrim + legible title)
//   split → image anchors the LEFT half; the title freeform flows right
//           (imageAwareBounds for imageRole 'column' + placement 'left')
// 'type' never calls this (no image).
function coverImageBox(tier: CoverTier): AutoImageBox {
  if (tier === 'split') return { x: 0, y: 0, w: 46, h: 100, behind: false };
  // photo (and any non-split image tier)
  return { x: 0, y: 0, w: 100, h: 100, behind: true };
}

// Clean a raw deck title / prompt into a short topic phrase safe to use as an
// image subject. The cover deckTitle is the raw user prompt sliced to 90 chars
// (see call sites), which produced broken image prompts:
// "Prompt: Create a 7-slide…Includ" (instruction prefix + mid-word truncation)
// and one-word names rendered literally ("Volt" → a lightning bolt). This
// strips instruction scaffolding, de-slugs, and caps
// to a short clause so the result is a real topic, not a truncated paragraph.
function cleanCoverTopic(raw: string): string {
  let t = (raw || '').replace(/\s+/g, ' ').trim();
  // Strip an instruction label ("Prompt:", "Topic -", …).
  t = t.replace(/^\s*(prompt|topic|subject)\s*[:\-]\s*/i, '');
  // Strip a generation instruction lead-in ("Create a 7-slide deck on …").
  t = t.replace(/^\s*(create|generate|make|build|design|write|draft)\b[^.]*?\b(on|about|for|covering|regarding)\s+/i, '');
  // De-slug kebab-cased names ("q1-marketing-results" → "q1 marketing results").
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(t)) t = t.replace(/-/g, ' ');
  // Cap to a short clause so the art-director sparse-check fires and it nevers
  // feed a truncated paragraph as a subject.
  if (t.length > 70) {
    const cut = t.slice(0, 70);
    const lastSpace = cut.lastIndexOf(' ');
    t = (lastSpace > 35 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return t;
}

// Build the cover image SUBJECT — a short, clean topic seed. Kept short on
// purpose so the route's art-director pass (enhanceImagePrompt) expands it into
// a real cover scene; brightness rides the `bright` flag and the no-text +
// color-grade come from the route. A long pre-baked sentence here bypassed the
// enhancer entirely (that's why covers came out literal / clip-art).
function coverImageSubject(deckTitle: string, theme: Theme): string {
  void theme;
  return cleanCoverTopic(deckTitle) || 'an abstract, professional editorial backdrop';
}

// The cover-tier slideDesign stamped onto card 0. Carries the tier + the
// matching imageRole so the existing scrim / imageAwareBounds / contrast all
// apply, plus a 'cover' role + a minimal recipe/budget for shape completeness.
function coverSlideDesign(
  cardId: string,
  tier: CoverTier,
): NonNullable<Card['slideDesign']> {
  return {
    slideId: cardId,
    role: 'cover',
    imageRole: coverTierImageRole(tier),
    contentBudget: { headingMaxWords: 10, bodyMaxWords: 16 },
    textSafeZone: tier === 'split' ? 'right' : tier === 'photo' ? 'lower-third' : 'left',
    themeArchetype: 'editorial',
    source: 'auto',
    coverTier: tier,
  };
}

// ── Orchestrator cover composition (Unit 4) ─────────────────────────────────
// The deck engine PICKS the cover's composition form from the theme + headline
// + whether auto-images is on, then lays out the title region for it. Runs on
// the already-unified template (post templateToUnified). The cover image, when
// auto-images is on, lands later via placeCoverImage at the same geometry.
// ── Cover Designer wiring (P2 — Server-Designer) ────────────────────────────
const isHexColor = (s?: string): boolean => !!s && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());

/** Map the editor Theme to the plain accent/heading/muted hexes designCover needs.
 *  titleColor may be a CSS gradient (titleStyle='gradient') — fall back to a solid. */
function coverColorsFromTheme(theme: Theme): CoverColors {
  const heading = isHexColor(theme.titleColor) ? theme.titleColor : (isHexColor(theme.bodyColor) ? theme.bodyColor : '#1f2937');
  const muted = isHexColor(theme.bodyColor) ? theme.bodyColor : '#6b7280';
  const accent = (theme.chartPalette || []).find(isHexColor) ?? (isHexColor(theme.linkColor) ? theme.linkColor : heading);
  return { accent, heading, muted };
}

/** The cover's subtitle, if the writer emitted one. cover-subtitle emits the
 *  supporting line as a PARAGRAPH (index.ts), so take the first non-heading text
 *  block with content — the title is the heading; the subtitle is everything else. */
function coverSubtitleFrom(ff: FreeformBlock[]): string | undefined {
  const sub = ff.find(
    (b) => b.type === 'text'
      && (b as { variant?: string }).variant !== 'heading'
      && !!(b as { content?: string }).content?.trim(),
  ) as FreeformTextBlock | undefined;
  return sub?.content?.trim() || undefined;
}

/** A short kicker DERIVED from the deck name for the cover eyebrow — a label, not
 *  authored prose. Strips a leading article + stops at the first stopword; capped. */
function deriveKicker(deckName?: string): string | undefined {
  if (!deckName) return undefined;
  const STOP = new Set(['for', 'of', 'to', 'in', 'on', 'and', 'with', 'a', 'an', 'the', 'that', 'our', 'your']);
  const words = deckName.replace(/^(the|a|an)\s+/i, '').trim().split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (STOP.has(w.toLowerCase())) break;
    kept.push(w);
    if (kept.length >= 4) break;
  }
  const k = kept.join(' ').trim();
  return k.length >= 3 && k.length <= 40 ? k : undefined;
}

/** Fire-and-forget POST of the paired design-log row. Never blocks or throws. */
function postDesignLog(row: Record<string, unknown>): void {
  try {
    void fetch('/api/design-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }).catch(() => {});
  } catch { /* ignore — logging must never affect generation */ }
}

/** A structured-engine deck arrives already freeform-positioned (the validated
 *  Figma structure fills geometry directly), so its cards carry `freeform`
 *  blocks and NO populated `columns` — unlike the legacy engine, which emits
 *  `columns` the client converts. The structured 01-cover IS the theme's real,
 *  faithful cover, so the client must NOT run composeGeneratedCover/designCover
 *  on it (that would overwrite it with the legacy composed cover). Detect by
 *  shape — mirrors the generate-cards route's own anyFreeform/anyColumns signal,
 *  so it's robust even if the request flag and response ever diverge. */
function isStructuredTemplate(tpl: CardTemplate): boolean {
  const c0 = tpl?.cards?.[0];
  if (!c0) return false;
  const hasFreeform = (c0.freeform?.length ?? 0) > 0;
  const hasColumns = (c0.columns ?? []).some((col) => (col.blocks?.length ?? 0) > 0);
  return hasFreeform && !hasColumns;
}

function composeGeneratedCover(
  finalTemplate: CardTemplate,
  theme: Theme,
  autoImages: boolean,
): { template: CardTemplate; coverResult: CompositionResult } {
  const cover = finalTemplate.cards[0];
  const ffRaw = cover?.freeform ?? [];
  // INVARIANT ("title slide is not allowed to have that
  // layout"): the cover renders as a clean, title-only slide — one dominant
  // title (+ an optional cover image), NEVER the writer's multi-section body.
  // A card-0 whose content came back as a smart-layout / sections with no
  // heading block previously fell through to a crammed half-width content list.
  // Enforce it HERE, where the deck title is available: pick the best title (an
  // existing heading, else the deck name), make it the SOLE heading block, and
  // drop any body/section content. Covers are title-only by definition.
  const existingHeading = ffRaw.find(
    (b) => b.type === 'text' && (b as { variant?: string }).variant === 'heading',
  ) as FreeformTextBlock | undefined;
  const coverImg = ffRaw.find((b) => b.type === 'image') as FreeformImageBlock | undefined;
  const titleText =
    existingHeading?.content?.trim() || finalTemplate.name?.trim() || 'Presentation';
  const titleBlock: FreeformTextBlock = existingHeading
    ? { ...existingHeading, content: titleText }
    : {
        id: `ff-cover-title-${cover?.id ?? '0'}`,
        type: 'text', variant: 'heading', content: titleText,
        x: 7, y: 40, w: 86, h: 20, rotation: 0, z: 2,
      };
  const ff: FreeformBlock[] = coverImg ? [coverImg, titleBlock] : [titleBlock];
  const headingText = titleText;
  // Pick the cover FORM from whether an image is ACTUALLY present, not the
  // auto-images toggle. The toggle is an intent; the cover image lands async and
  // often never arrives — selecting a split form (image one side, title the
  // other) on that intent jammed the title into a half with an empty image
  // region beside it ("looks like there's supposed to be an
  // image; placement not approved"). No real image → a full-width / centered
  // title form. (When a cover image actually lands, the split form is correct;
  // wiring that reflow is the production follow-up.)
  void autoImages;
  const coverResult = selectCompositionFromAllowed(
    {
      hasImage: !!coverImg,
      orientation: 'landscape',
      brightness: 0.5,
      themeArchetype: theme.archetype,
      themeTone: theme.tone,
      headlineLength: headlineLengthOf(headingText),
    },
    undefined,
    0,
  );
  if (!cover) return { template: finalTemplate, coverResult };

  // Reload guard: a cover already composed by the Designer OR by replaying an
  // approved LayoutPiece (WI-1) renders as-is and is never re-composed (idempotent
  // — survives save→reload). Widened to 'piece' so an approved-layout cover freezes
  // the same way (only line 437 reads source; verified safe to extend).
  if (
    (cover.slideDesign?.source === 'designer' || cover.slideDesign?.source === 'piece')
    && (cover.freeform?.length ?? 0) > 0
  ) {
    return { template: finalTemplate, coverResult };
  }

  // WI-1 (layout-as-data) BYPASS — sits in FRONT of designCover. A no-image cover
  // that resolves to an approved LayoutPiece replays that piece's saved {x,y,w,h}
  // geometry VERBATIM (never recomputed) + its named decorative treatment, and
  // SHORT-CIRCUITS so designCover never overwrites it. resolveCoverPiece returns
  // null for covers with no approved layout → flow falls through to the unchanged
  // designCover path below (legacy/fallback preserved). Image covers are excluded
  // by resolveCoverPiece (hasImage → null), so applyCoverComposition is untouched.
  const pieceId = resolveCoverPiece({
    coverLayoutId: cover.slideDesign?.coverLayoutId,
    archetype: theme.archetype,
    hasImage: !!coverImg,
    deckId: finalTemplate.id ?? cover.id,
  });
  if (pieceId && COVER_LAYOUT_PIECES[pieceId]) {
    const piece = COVER_LAYOUT_PIECES[pieceId];
    const composedPiece: Card = {
      ...cover,
      freeform: layoutCoverFromPiece(piece, {
        title: titleText,
        subtitle: coverSubtitleFrom(ffRaw),
        eyebrow: deriveKicker(finalTemplate.name),
        // author/date: only when the deck carries a byline (none today → omitted,
        // the slots simply don't render — geometry stays in the piece data).
      }),
      slideDesign: {
        slideId: cover.slideDesign?.slideId ?? cover.id,
        role: 'cover',
        imageRole: 'none',
        contentBudget: cover.slideDesign?.contentBudget ?? { headingMaxWords: 10, bodyMaxWords: 16 },
        textSafeZone: cover.slideDesign?.textSafeZone ?? 'left',
        themeArchetype: cover.slideDesign?.themeArchetype ?? theme.archetype,
        source: 'piece',
        coverLayoutId: pieceId,
      },
    };
    return {
      template: { ...finalTemplate, cards: finalTemplate.cards.map((c, i) => (i === 0 ? composedPiece : c)) },
      coverResult,
    };
  }

  // P2 — Server-Designer: with NO cover image, the cover Designer composes the
  // full type-led treatment (eyebrow/title/rule/subtitle, anchored, lock-the-box)
  // and logs its decision + the observe-only Judge's verdict. Image covers keep
  // the existing applyCoverComposition path until the image decision lands (P3).
  if (!coverImg) {
    const designed = designCover({
      title: titleText,
      subtitle: coverSubtitleFrom(ffRaw),
      kicker: deriveKicker(finalTemplate.name),
      hasImage: false,
      archetype: theme.archetype,
      colors: coverColorsFromTheme(theme),
      rotationIndex: 0,
    });
    const verdict = judgeCover({ title: titleText, blocks: designed.blocks, decision: designed.decision });
    postDesignLog({
      deckId: finalTemplate.id ?? '', slideId: cover.id, slideType: 'cover',
      designerDecision: designed.decision, designerReasoning: designed.reasoning,
      result: verdict.result, judgeReasoning: verdict.reasoning, judgeRecommendation: verdict.recommendation,
    });
    const composedDesigner: Card = {
      ...cover,
      freeform: designed.blocks,
      slideDesign: {
        slideId: cover.slideDesign?.slideId ?? cover.id,
        role: 'cover',
        imageRole: 'none',
        contentBudget: cover.slideDesign?.contentBudget ?? { headingMaxWords: 10, bodyMaxWords: 16 },
        textSafeZone: cover.slideDesign?.textSafeZone ?? 'left',
        themeArchetype: cover.slideDesign?.themeArchetype ?? theme.archetype,
        source: 'designer',
      },
    };
    return {
      template: { ...finalTemplate, cards: finalTemplate.cards.map((c, i) => (i === 0 ? composedDesigner : c)) },
      coverResult,
    };
  }

  const applied = applyCoverComposition(ff, coverResult);
  const base = cover.slideDesign;
  const composed: Card = {
    ...cover,
    freeform: applied.freeform,
    slideDesign: {
      slideId: base?.slideId ?? cover.id,
      role: 'cover',
      imageRole: applied.imageRole,
      contentBudget: base?.contentBudget ?? { headingMaxWords: 10, bodyMaxWords: 16 },
      textSafeZone: base?.textSafeZone ?? 'left',
      themeArchetype: base?.themeArchetype ?? theme.archetype,
      source: 'auto',
      coverTier: applied.coverTier,
      compositionForm: coverResult.form,
      titlePosition: coverResult.titlePosition,
    },
  };
  return {
    template: { ...finalTemplate, cards: finalTemplate.cards.map((c, i) => (i === 0 ? composed : c)) },
    coverResult,
  };
}

// ── Suggestions (LLM-backed, debounced) ────────────────────────────────────
//
// The chips below the Audience and Tone fields used to be hardcoded keyword
// matches. Now they're a real LLM call so any prompt produces tailored
// suggestions. Caller debounces to avoid spamming the endpoint while typing.

async function fetchContextSuggestions(
  prompt: string,
  signal: AbortSignal,
): Promise<{ audiences: string[]; tones: string[] }> {
  const res = await fetch('/api/ai/suggest-context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok) return { audiences: [], tones: [] };
  const data = (await res.json()) as { audiences?: string[]; tones?: string[] };
  return {
    audiences: Array.isArray(data.audiences) ? data.audiences : [],
    tones: Array.isArray(data.tones) ? data.tones : [],
  };
}

// FrameworkModal removed 2026-05-16 — the always-visible right-column
// template gallery on /editor/slides is now the only template picker.
// See the <aside> block at the bottom of the page render for the inline
// gallery that replaced this modal.

// LAYOUT_PICKS + LayoutPreview moved to @/components/card-template/layout-picks
// 2026-05-22 so the per-slide layout-swap menu (ThumbnailSidebar) can reuse them.

/** @deprecated — superseded by LayoutPreview / LAYOUT_PICKS as of task #20.
 *  Kept temporarily during the transition; safe to remove. */
function VariantPreview({ kind }: { kind: 'data' | 'narrative' | 'visual' }) {
  const accent = '#6B3FA0';
  const muted = 'rgba(15, 23, 42, 0.18)';
  if (kind === 'data') {
    return (
      <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
        {/* title bar */}
        <rect x="10" y="9" width="80" height="6" rx="1.5" fill={accent} />
        {/* 3 stat tiles in a row */}
        {[0, 1, 2].map((i) => {
          const x = 10 + i * 50;
          return (
            <g key={i}>
              <rect x={x} y="28" width="40" height="48" rx="3" fill={accent} fillOpacity="0.06" stroke={accent} strokeOpacity="0.30" strokeWidth="0.5" />
              {/* big number */}
              <text x={x + 20} y="52" fontSize="16" fontWeight="700" fill={accent} textAnchor="middle">42%</text>
              {/* caption line */}
              <rect x={x + 8} y="62" width="24" height="2" rx="0.5" fill={muted} />
              <rect x={x + 8} y="67" width="18" height="2" rx="0.5" fill={muted} />
            </g>
          );
        })}
      </svg>
    );
  }
  if (kind === 'narrative') {
    return (
      <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
        {/* title */}
        <rect x="10" y="11" width="90" height="6" rx="1.5" fill={accent} />
        {/* paragraph lines */}
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="10" y={28 + i * 7} width={[140, 132, 138, 110][i]} height="3" rx="1" fill={muted} />
        ))}
        {/* pull quote — indented with accent bar */}
        <rect x="20" y="64" width="2" height="18" fill={accent} />
        <rect x="26" y="66" width="120" height="3" rx="1" fill={accent} fillOpacity="0.45" />
        <rect x="26" y="73" width="100" height="3" rx="1" fill={accent} fillOpacity="0.45" />
      </svg>
    );
  }
  // visual
  return (
    <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
      {/* split-left: image placeholder on left, content on right */}
      <rect x="6" y="6" width="62" height="78" rx="3" fill={accent} fillOpacity="0.10" stroke={accent} strokeOpacity="0.30" strokeWidth="0.5" strokeDasharray="2 2" />
      {/* image-glyph in the placeholder */}
      <circle cx="22" cy="34" r="4" fill={accent} fillOpacity="0.40" />
      <polyline points="14,50 26,38 36,46 46,38 54,46 54,58 14,58" fill={accent} fillOpacity="0.20" />
      {/* right column: title + body + icon row */}
      <rect x="78" y="14" width="64" height="6" rx="1.5" fill={accent} />
      <rect x="78" y="28" width="72" height="3" rx="1" fill={muted} />
      <rect x="78" y="35" width="64" height="3" rx="1" fill={muted} />
      <rect x="78" y="42" width="68" height="3" rx="1" fill={muted} />
      {/* icon-row */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={84 + i * 22} cy="68" r="6" fill={accent} fillOpacity="0.20" stroke={accent} strokeOpacity="0.5" strokeWidth="0.5" />
      ))}
    </svg>
  );
}

/** Chip style for the Voice picker inside the Customize popover. Active
 *  chip uses the row's accent (Voice = green); inactive chips read as
 *  hairline-outlined pills. Mirrors the row's per-section visual tone so
 *  the picker doesn't blast violet over the green row badge. */
function voiceChipStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 9px',
    borderRadius: '999px',
    border: active ? '1px solid #059669' : '1px solid rgba(15, 23, 42, 0.10)',
    background: active ? 'linear-gradient(135deg, #34d399 0%, #059669 100%)' : '#ffffff',
    color: active ? '#ffffff' : '#475569',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    fontFamily: 'inherit',
    lineHeight: 1.2,
  };
}

// ── Customize Popover — Accordion Row + Preset Grid ────────────────────────
// Reusable building blocks for the Customize dropdown (Audience / Tone /
// Detail level). Each row collapses to show a one-line summary; click to
// expand and reveal the row's options inline. Only one row open at a time
// (controlled from the parent via isExpanded + onToggle).

function CustomizeRow({
  icon, iconBadgeColor, label, currentValue, placeholder, isExpanded, onToggle, isLast, children,
}: {
  icon: React.ReactNode;
  /** Background gradient for the icon's rounded-square badge. Each row gets
   *  a different accent so the popover scans visually instead of reading as
   * three identical rows., more
   *  distinctive. */
  iconBadgeColor: string;
  label: string;
  currentValue: string;
  placeholder: string;
  isExpanded: boolean;
  onToggle: () => void;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      borderBottom: isLast ? 'none' : '1px solid rgba(0, 0, 0, 0.05)',
    }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: isExpanded ? 'rgba(107, 63, 160, 0.04)' : 'transparent',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          textAlign: 'left', transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
        onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
      >
        <span aria-hidden style={{
          flexShrink: 0,
          width: '28px', height: '28px', borderRadius: '8px',
          background: iconBadgeColor,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18)',
        }}>{icon}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1f36' }}>{label}</span>
        <span style={{
          marginLeft: 'auto', fontSize: '0.8rem',
          color: currentValue ? '#475569' : '#94a3b8',
          fontWeight: currentValue ? 500 : 400,
          textTransform: label === 'Detail level' ? 'capitalize' : 'none',
          maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentValue || placeholder}
        </span>
        <ChevronDown size={14} style={{
          color: '#94a3b8', flexShrink: 0,
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 150ms ease',
        }} />
      </button>
      {isExpanded && (
        <div style={{ padding: '0.25rem 1rem 0.875rem', animation: 'rowExpand 180ms ease-out' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function PresetGrid({
  presets, selected, onSelect, customLabel, onCustomChange,
}: {
  presets: string[];
  selected: string;
  onSelect: (v: string) => void;
  customLabel: string;
  onCustomChange: (v: string) => void;
}) {
  // Minimalistic field: text input is the primary affordance. A faint
  // "Try …" row below offers up to 5 one-tap shortcuts that fill the
  // input. Chips have no "selected" state — the input value is the
  // single source of truth. Replaces the busy chip grid flagged
  // 2026-05-21 as messy.
  const suggestions = presets.slice(0, 5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        type="text"
        value={selected}
        onChange={(e) => onCustomChange(e.target.value)}
        placeholder={customLabel}
        style={{
          width: '100%', padding: '0.55rem 0.75rem',
          border: '1px solid rgba(15, 23, 42, 0.10)', borderRadius: '8px',
          fontSize: '0.85rem', background: '#ffffff',
          outline: 'none', fontFamily: 'inherit', color: '#1a1f36',
        }}
      />
      {suggestions.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          paddingLeft: '2px', fontSize: '0.72rem', color: '#94a3b8',
        }}>
          <span style={{ marginRight: '4px' }}>Try</span>
          {suggestions.map((p, idx) => (
            <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                style={{
                  padding: '2px 6px', borderRadius: '5px',
                  background: 'transparent', border: 'none',
                  color: '#6B3FA0',
                  fontSize: '0.74rem', fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'background 120ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,63,160,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {p}
              </button>
              {idx < suggestions.length - 1 && (
                <span style={{ color: '#cbd5e1', padding: '0 1px' }}>·</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Slide-shaped icon used in the Detail-level picker. The page outline plus
// N evenly-spaced text bars reads as "a slide with this much content" —
// far closer to the slide metaphor than Lucide's Rows2/3/4 which read as
// tables..
function DocumentDensityIcon({ lines, size = 22 }: { lines: number; size?: number }) {
  const pageX = 3;
  const pageY = 5;
  const pageW = 18;
  const pageH = 14;
  const innerPadX = 2;
  const innerPadY = 2;
  const lineH = 0.9;
  const lineSpacing = 1.6;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x={pageX} y={pageY} width={pageW} height={pageH} rx="1.5"
        stroke="currentColor" strokeWidth="1.3"
      />
      {Array.from({ length: lines }).map((_, i) => {
        const isShort = i === lines - 1 && lines > 1;
        const lineW = isShort ? pageW - innerPadX * 2 - 4 : pageW - innerPadX * 2;
        const y = pageY + innerPadY + i * lineSpacing;
        return (
          <rect
            key={i}
            x={pageX + innerPadX}
            y={y}
            width={lineW}
            height={lineH}
            rx="0.45"
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

// ── Suggestion Chips ───────────────────────────────────────────────────────

function SuggestionChips({ suggestions, onAccept }: { suggestions: string[]; onAccept: (s: string) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '0.5rem' }}>
      {suggestions.map((s, i) => (
        <button key={i} type="button" onClick={() => onAccept(s)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem',
          fontWeight: 500, fontFamily: 'Inter, system-ui, sans-serif',
          color: '#6B3FA0', background: 'rgba(107,63,160,0.04)',
          border: '1px solid rgba(107,63,160,0.12)', cursor: 'pointer',
          transition: 'all 120ms ease', whiteSpace: 'nowrap',
        }}><Sparkles size={10} />{s}</button>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CardEditorPage() {
  const [prompt, setPrompt] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  /** Reference-upload mode (Phase 1 — see .apm/design-specs/reference-upload-phase1.md):
   *   'inspire'           — file influences theme/tone/audience only; content from user prompt
   *   'inspire-structure' (default) — above + outline shape borrowed from reference
   *   'source'            — existing source-grounded build: file IS the deck content
   *  Mode pills surface only when a file is uploaded. */
  const [uploadMode, setUploadMode] = useState<'inspire' | 'inspire-structure' | 'source'>('inspire-structure');
  // Attach-on-Generate (#1): true while a home-handoff file is being hydrated into
  // fileBlob. The auto-generate effect waits on this so handleGenerate never reads
  // a null fileBlob (the file's text must be extractable when Generate fires).
  const [fileHandoffPending, setFileHandoffPending] = useState(false);
  // Phase E: keep the raw upload around so binary files (PDF/DOCX/PPTX) can go
  // to /api/source-grounded/build instead of being mangled into truncated text.
  const [fileBlob, setFileBlob] = useState<File | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  // (showFrameworks state removed — FrameworkModal is gone, the right-
  // column gallery is now the only template picker.)
  // Right-column inline template gallery — sub-filter chip state. 'all' shows
  // every framework. Mirrors the Slides sub-filter in CreateModal so the two
  // surfaces feel like one system. Tiles read from FRAMEWORKS directly so
  // adding a framework in data/frameworks.ts surfaces here automatically.
  const [galleryFilter, setGalleryFilter] = useState<'all' | FrameworkCategory>('all');
  // Pagination for the template gallery — keeps the panel scannable when the
  // library grows. 6 tiles per page works at the current sticky panel width
  // (660px → 3 cols × 2 rows). Filter change resets to page 1.
  const [galleryPage, setGalleryPage] = useState(1);
  const GALLERY_PAGE_SIZE = 6;
  useEffect(() => { setGalleryPage(1); }, [galleryFilter]);
  // Customize popover state — single dropdown that surfaces Audience /
  // Tone / Detail level as expandable rows. Replaces the old "Advanced
  // settings" multi-card accordion. `customizeOpen`
  // controls the whole popover. `customizeExpanded` tracks which inner
  // row is currently expanded (only one open at a time).
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeExpanded, setCustomizeExpanded] = useState<null | 'audience' | 'tone' | 'detail' | 'voice' | 'intensity'>(null);
  // Rewrite intensity (Phase 1 — Invisible AI). How much license the AI
  // has to rewrite the user's prompt text. Defaults to 'inspire' (today's
  // behavior — AI writes freely). 'build' preserves user phrases where
  // possible. 'verbatim' treats the prompt as canonical content and only
  // structures it into card slots. Power-user surface; most users leave
  // it on the default.
  const [rewriteIntensity, setRewriteIntensity] = useState<'inspire' | 'build' | 'verbatim'>('inspire');
  // Voice override (Phase 1 — Invisible AI). null = use the template/framework
  // default Skill (or no skill if none bound). A SkillId here overrides
  // whatever the framework would have picked; flows to generateCardTemplate
  // as skillIdOverride and into the Generate-stage Claude prompt as voice
  // rules from document-skills.ts.
  const [skillOverride, setSkillOverride] = useState<SkillId | null>(null);
  // Tracks whether the user has explicitly chosen a Voice. When false, the
  // override is invisible and the framework default wins. When true, the
  // override flows to the API (even when set to null = explicit "no voice").
  const [hasPickedVoice, setHasPickedVoice] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  // (showAdvanced removed 2026-05-16 — the old Advanced-settings accordion
  // was replaced by the Customize popover above. The popover handles its
  // own open state via `customizeOpen`.)
  const [density, setDensity] = useState<Density>('detailed');
  // Document theme is owned by ThemeProvider (one of the 12 themes from
  // themes.ts). The picker tiles below + the "More details" ThemesModal
  // both write to it via setActiveTheme. Reading via useTheme keeps step 2
  // and the in-editor Theme button perfectly in sync.
  const { theme: activeTheme, setTheme: setActiveTheme } = useTheme();
  const [themesModalOpen, setThemesModalOpen] = useState(false);
  // True once the user explicitly picks a theme (via ThemesModal) or a saved
  // deck restores one. While false, generation rolls a random theme so a fresh
  // deck isn't always the default — but the empty create-wizard stays on the
  // light default so the nav rail + content don't mismatch.
  const [userPickedTheme, setUserPickedTheme] = useState(false);
  // Slide count: 0 = AUTO (the plan agent picks an adaptive count from the
  // content). Auto is the DEFAULT — a fixed default forced
  // a length onto every deck. 0 flows to the route as `cardCount: 0` → mapped
  // to undefined → adaptive.
  const [cardCount, setCardCount] = useState(0);
  // Auto-image-at-creation opt-in. Default OFF — flipping it
  // on lets each slide that earns an image get one at creation time. Now sourced
  // from FREE stock (Pexels/Pixabay), so it defaults ON — pure upside, no AI cost
  //. Degrades to "no image" when no stock key is set. AI image
  // generation remains the explicit opt-in on the manual Media-panel surface.
  const [autoImages, setAutoImages] = useState(true);
  // Image subject/domain category from the home generator (''=none). Forwarded
  // into the stock-image search so auto-images come from that domain. Mirrored
  // into a ref so the fire-and-forget placeAutoImage/placeCoverImage callbacks
  // read the current value without re-creating on every keystroke.
  const [imageCategory, setImageCategory] = useState('');
  const imageCategoryRef = useRef('');
  useEffect(() => { imageCategoryRef.current = imageCategory; }, [imageCategory]);
  const [suggestedAudiences, setSuggestedAudiences] = useState<string[]>([]);
  const [suggestedTones, setSuggestedTones] = useState<string[]>([]);
  // Error modal: holds the title + message to surface in a centered dialog
  // (null = no error). Set in the generation catch blocks (instead of collapsing
  // the deck to a cryptic 1-card "error" slide) and by the storage-quota listener
  // below (so a deck that fails to persist tells the user instead of vanishing).
  const [genError, setGenError] = useState<{ title: string; message: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  // The loading overlay sits ON TOP of the committed editor (Decision A): the deck
  // is saved and rendered at fill-complete so it can't be lost, but the end user
  // only sees it once it's VERIFIED. True from generate-start until the judge's
  // `done`, regardless of whether the deck is already committed underneath.
  const [overlayUp, setOverlayUp] = useState(false);
  // True only for a freshly generated, judge-verified deck being revealed —
  // tells CardEditor to run its sequential per-slide reveal queue from empty
  // even though `streaming` is already false at the moment the overlay lifts
  // (Decision A). A loaded deck keeps this false and reveals instantly. CardEditor
  // unmounts under the overlay and remounts at `done`, so it reads this fresh
  // each generation; its own one-shot `revealActive` clears after the reveal.
  const [stagedReveal, setStagedReveal] = useState(false);
  const [template, setTemplate] = useState<CardTemplate | null>(null);
  const [streamProgress, setStreamProgress] = useState<{ cardIndex: number; total: number } | null>(null);
  // Completion gate: the editor + thumbnails must NOT appear
  // until the WHOLE deck is assembled — all cards generated AND all images
  // landed — then reveal once so the per-slide typewriter plays one slide at a
  // time. Default true (loaded/empty decks show immediately); set false at the
  // start of a generation and back true on completion (or a max-wait fallback).
  const [revealReady, setRevealReady] = useState(true);
  // A generation handed off from Home (sessionStorage payload) is in flight from
  // the very first render. Track it so the drafting overlay shows immediately and
  // the old standalone creation page never flashes. Cleared once generation
  // actually starts / a deck exists, or via a short safety timeout if the
  // handoff turned out to be empty.
  const [pendingGen, setPendingGen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('foxitSlides.pendingPrompt') !== null;
    } catch {
      return false;
    }
  });
  // Deep-link target from ?slide=N (deck detail page) — passed to CardEditor.
  const [initialCard, setInitialCard] = useState<number | null>(null);
  // Opening an existing deck (?deck=<id>) — the mount effect hydrates `template`
  // a frame later, so without a synchronous guard the create-wizard return below
  // paints for one frame (the "flash of the old generation page" when clicking a
  // slide from the deck detail). True from the first render when the URL carries
  // a deck id; cleared once the deck loads (template set) or the id is unknown.
  const [pendingDeck, setPendingDeck] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return new URLSearchParams(window.location.search).has('deck');
    } catch {
      return false;
    }
  });
  // SSR and the first client render must agree: pendingGen/pendingDeck above read
  // sessionStorage/location (undefined on the server), so gate the page on a
  // post-mount flag to avoid a hydration mismatch on the loading overlay.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pendingImagesRef = useRef(0);
  const generationDoneRef = useRef(false);
  // True once a generation has committed its deck (at `fill-complete`). A later
  // failure (stream drop during the judge) must NOT wipe an already-saved deck.
  const committedRef = useRef(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Deck identity for persistence. Set when:
  //   (a) URL contains ?deck=<id> on mount and it successfully loads that deck
  //   (b) generation completes and it mints a new id for the fresh deck
  // Once set, theme changes auto-resave so reopening the URL restores it.
  const [deckId, setDeckId] = useState<string | null>(null);
  // Mirror of deckId for use inside the fire-and-forget auto-image callback,
  // which can resolve after `done` has minted/changed the id. Reading state
  // there would close over a stale value; the ref stays current.
  const deckIdRef = useRef<string | null>(null);
  useEffect(() => { deckIdRef.current = deckId; }, [deckId]);

  // A deck save can fail (most commonly localStorage quota exceeded once many
  // decks accumulate). saveDeck dispatches `compose:deck-save-failed` instead of
  // swallowing it — surface it in the error modal so a freshly-generated deck
  // that can't persist tells the user, rather than silently vanishing on the
  // next reload and leaving them on an empty 1-slide editor.
  useEffect(() => {
    const onSaveFailed = (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason;
      setGenError(
        reason === 'quota'
          ? {
              title: 'Your browser storage is full',
              message:
                "This deck couldn't be saved — your saved decks have filled up this browser's storage. Open the deck library and delete some old decks to free up space, then generate again.",
            }
          : {
              title: "Couldn't save the deck",
              message:
                'Your deck was generated but could not be saved to this browser. Try again, or free up space by deleting old decks.',
            },
      );
    };
    window.addEventListener('compose:deck-save-failed', onSaveFailed);
    return () => window.removeEventListener('compose:deck-save-failed', onSaveFailed);
  }, []);
  // Live mirror of the template + a once-per-generation guard, both for the
  // observe-only Design critic (P5): it must judge the FULLY-SETTLED deck (images
  // landed), so it reads templateRef at reveal time, not a closed-over snapshot.
  const templateRef = useRef<CardTemplate | null>(null);
  useEffect(() => { templateRef.current = template; }, [template]);
  const designCriticRanRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load existing deck from ?deck=<id> URL param. Hydrates both the cards
  // and the saved theme. Runs once on mount; if the id is unknown (deck
  // was deleted, or shared from another browser) it silently falls through
  // to the wizard. Theme application on the editor route is handled by
  // ThemeProvider — calling setActiveTheme here flows through to the same
  // CSS-var injection path as the in-editor ThemeButton.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    // Deck load takes precedence — when present, hydrate cards + theme and bail.
    const deckIdFromUrl = params.get('deck');
    if (deckIdFromUrl) {
      const stored = getDeck(deckIdFromUrl);
      if (stored) {
        setDeckId(deckIdFromUrl);
        setTemplate(stored.template);
        const slideParam = params.get('slide');
        if (slideParam !== null) {
          const n = parseInt(slideParam, 10);
          if (!Number.isNaN(n)) setInitialCard(n);
        }
        if (stored.template.themeId) {
          const restored = getThemeById(stored.template.themeId);
          setActiveTheme(restored);
          // A reopened deck already has a theme — treat it as explicit so
          // generation doesn't randomize over the restored choice.
          setUserPickedTheme(true);
        }
        return;
      }
      // Unknown deck id (deleted, or from another browser) — drop the open-deck
      // guard so the create wizard can take over instead of hanging on a loader.
      setPendingDeck(false);
    }

    // Fresh generation page (no deck in URL) — DO NOT apply a random theme on
    // mount. Half the themes are dark; a dark theme darkens the nav rail while
    // the empty create-wizard content stays light, which reads as broken
    //. The wizard stays on the light default theme; the
    // "random theme when none chosen" behavior is deferred to generation time
    // (see handleGenerate), so the generated DECK still gets a random theme.

    // Pre-select framework from URL (Create+ entry points pass this).
    const fwId = params.get('framework');
    if (fwId) {
      const fw = FRAMEWORKS.find((f) => f.id === fwId);
      if (fw) {
        setFramework(fw);
        // ?use=1 → "Use" hover action from the Create modal: prefill the
        // prompt with the framework's sample prompt and auto-fire
        // generation once both state updates have settled. The
        // autoGenRef is consumed in the framework+prompt effect below.
        if (params.get('use') === '1' && fw.samplePrompt) {
          setPrompt(fw.samplePrompt);
          autoGenRef.current = true;
        }
      }
    }

    // Home "Generate" handoff: the landing-page generator stashes the prompt +
    // facets in sessionStorage and routes here. Consume it, seed the wizard
    // state, and auto-generate — no wizard step. Cleared immediately so a
    // refresh / back-nav doesn't re-fire. Malformed payload falls through to
    // the normal wizard. (Deck-load already returned above, so this only runs
    // on a fresh generation arrival.)
    try {
      const raw = sessionStorage.getItem('foxitSlides.pendingPrompt');
      if (raw) {
        sessionStorage.removeItem('foxitSlides.pendingPrompt');
        const p = JSON.parse(raw) as {
          prompt?: string; audience?: string; tone?: string; detail?: string;
          voice?: string; treat?: 'inspire' | 'build' | 'verbatim';
          cardCount?: number; autoImages?: boolean; imageCategory?: string;
          theme?: string;
          fileUrl?: string; fileName?: string; fileType?: string; uploadMode?: string;
        };
        if (p.prompt && p.prompt.trim()) {
          setPrompt(p.prompt);
          // Respect the theme picked on the home card. Without this the editor
          // dropped it, so chooseThemeForContent re-rolled a DIFFERENT theme at
          // generation — the selection was ignored and palettes mixed (the
          // generated template.theme diverged from the active theme). Empty
          // string = "Auto" → leave it to the design layer.
          if (p.theme) {
            setActiveTheme(getThemeById(p.theme));
            setUserPickedTheme(true);
          }
          if (p.audience) setAudience(p.audience);
          if (p.tone) setTone(p.tone);
          if (p.detail) setDensity(p.detail.toLowerCase() as Density);
          if (typeof p.cardCount === 'number') {
            // 0 = Auto — pass it through untouched (do NOT clamp to 3, that
            // would silently pin a count when the user chose Auto). A real
            // number still clamps to the 3-15 usable range.
            setCardCount(p.cardCount === 0 ? 0 : Math.max(3, Math.min(15, Math.round(p.cardCount))));
          }
          if (typeof p.autoImages === 'boolean') setAutoImages(p.autoImages);
          if (typeof p.imageCategory === 'string') setImageCategory(p.imageCategory);
          // voice → document-skill override ('Default' = let the engine choose).
          if (p.voice && p.voice !== 'Default') {
            if (p.voice === 'No voice') {
              setSkillOverride(null);
              setHasPickedVoice(true);
            } else {
              const sk = DOCUMENT_SKILLS.find(
                (s) => s.label.toLowerCase() === p.voice!.toLowerCase(),
              );
              if (sk) {
                setSkillOverride(sk.id);
                setHasPickedVoice(true);
              }
            }
          }
          if (p.treat) setRewriteIntensity(p.treat);
          if (p.fileUrl) {
            // Attach-on-Generate handoff (#1): hydrate the blob URL into fileBlob +
            // source mode BEFORE auto-generate fires. `fileHandoffPending` gates the
            // autoGen effect so handleGenerate never reads a null fileBlob.
            setFileHandoffPending(true);
            const fileUrl = p.fileUrl;
            const fileName = p.fileName || 'upload';
            const fileType = p.fileType || '';
            void (async () => {
              try {
                const resp = await fetch(fileUrl);
                const blob = await resp.blob();
                setFileBlob(new File([blob], fileName, { type: fileType || blob.type }));
                setFileName(fileName);
                setUploadMode('source');
              } catch {
                // Handoff failed — fall through to prompt-only generation.
              } finally {
                setFileHandoffPending(false);
              }
            })();
          }
          autoGenRef.current = true;
        }
      }

      // Source attachment from the home Attach button. Reconstruct the File
      // from its base64 data URL and queue generation: binary docs (PDF/DOCX/
      // PPTX) run through the source-grounded build (uploadMode 'source'); text
      // (.txt/.md) is read inline and used as inspire-structure reference.
      const fraw = sessionStorage.getItem('foxitSlides.pendingFile');
      if (fraw) {
        sessionStorage.removeItem('foxitSlides.pendingFile');
        const f = JSON.parse(fraw) as { name?: string; type?: string; data?: string };
        if (f.data && f.name) {
          const comma = f.data.indexOf(',');
          const bin = atob(comma >= 0 ? f.data.slice(comma + 1) : f.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const file = new File([bytes], f.name, { type: f.type || 'application/octet-stream' });
          setFileBlob(file);
          setFileName(file.name);
          const lower = f.name.toLowerCase();
          if (lower.endsWith('.txt') || lower.endsWith('.md')) {
            setFileContent(new TextDecoder().decode(bytes));
            setUploadMode('inspire-structure');
          } else {
            setUploadMode('source');
          }
          autoGenRef.current = true;
        }
      }
    } catch {
      /* malformed payload — ignore, fall back to the wizard */
    }

    // Bare editor: no deck loaded and no generation queued → start with ONE
    // blank slide so "Slides" opens a usable editor (not the create surface,
    // which now lives at /editor/generate). Legacy ?new=true links redirect
    // there. autoGenRef is set true by the framework "Use" path and the home
    // Generate handoff above, so it gates the blank fallback.
    if (!autoGenRef.current) {
      if (params.get('new') === 'true') {
        window.location.replace('/editor/generate');
        return;
      }
      const now = Date.now();
      const blankCard: Card = {
        id: `card-${now}`,
        layout: 'single',
        style: 'default',
        blank: true,
        columns: [{ blocks: [
          { type: 'heading', level: 2, content: '' },
          { type: 'paragraph', content: '' },
        ] }],
      };
      setDeckId(null);
      setTemplate({
        ...PROJECT_BRIEF_TEMPLATE,
        id: `blank-${now}`,
        name: '',
        description: '',
        // Follow the CURRENT theme for the page BACKGROUND only (e.g. Quill's
        // paper bg) — the blank flag suppresses the cover motif + shimmer so the
        // slide reads as genuinely empty, not a loading/cover slide.
        themeId: activeTheme.id,
        cards: [blankCard],
      });
    }
    // Run-once on mount; setActiveTheme is stable from useTheme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generate trigger for the "Use" hover action. Fires handleGenerate
  // once when framework + prompt are both populated by the mount effect.
  // Ref ensures it never re-fires on subsequent state changes.
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (!autoGenRef.current) return;
    // Attach-on-Generate (#1): wait for the handoff file to hydrate into fileBlob
    // before firing — else handleGenerate's source extraction reads a null fileBlob.
    if (fileHandoffPending) return;
    // framework is optional — the home "Generate" handoff has a prompt but no
    // pre-picked framework, and the engine generates fine without one.
    if (!prompt) return;
    if (generating) return;
    autoGenRef.current = false;
    void handleGenerate();
    // handleGenerate intentionally omitted — it's recreated each render
    // and is not safe as a dep here (would re-fire). The ref guards single fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framework, prompt, generating, fileHandoffPending]);

  // Clear the pending-generation flag once generation starts (generating flips
  // true) or a deck exists. Safety timeout covers an empty/invalid handoff so it
  // never hang on the overlay with nothing generating.
  useEffect(() => {
    if (template || generating) {
      setPendingGen(false);
      return;
    }
    if (!pendingGen) return;
    const t = setTimeout(() => setPendingGen(false), 2500);
    return () => clearTimeout(t);
  }, [pendingGen, generating, template]);

  // Auto-resave the deck whenever the active theme changes — but only after
  // a deck identity exists (i.e. the user has generated or loaded a deck).
  // Pre-generation theme picks just sit on the picker; they get baked in at
  // the first save below. Bails if the persisted themeId already matches so
  // the effect doesn't loop on its own state writes.
  //
  // It regenerates template.theme alongside themeId on every switch. The
  // CSS-variable layer (var(--theme-page-bg), var(--theme-title-color),
  // var(--theme-link-color), etc.) updates reactively via ThemeProvider —
  // but the legacy `template.theme.accentColors[i]` array (used by
  // CardBlockView's smart-layout / timeline / grid renderers) does not.
  // Without this regeneration, switching themes left smart-layout cell
  // borders, icon gradients, and timeline node circles stuck on the
  // previously-active palette while the rest of the page re-colored.
  // themeToTemplate is pure (hex extraction + font + color rewiring), so
  // calling it on every theme change is cheap.
  useEffect(() => {
    if (!deckId || !template) return;
    if (template.themeId === activeTheme.id) return;
    const updated = {
      ...template,
      themeId: activeTheme.id,
      theme: themeToTemplate(activeTheme),
    };
    saveDeck(deckId, updated);
    setTemplate(updated);
  }, [activeTheme.id, deckId, template]);

  // Auto-save status reflected in the SlideTopToolbar. Flips to 'saving' on
  // every mutation, then 'saved' when the debounce fires the localStorage
  // write. Default 'idle' until the user makes a first change.
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  // Debounced content auto-save. CardEditor calls this whenever the user
  // edits a block, changes a layout, duplicates, deletes, or regenerates
  // a card. It updates the template cache and persist 600ms after the last
  // edit so a burst of typing collapses into one localStorage write.
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCardsChange = useCallback(
    (nextCards: import('@/types/card-template').Card[]) => {
      // ALWAYS update the in-memory template so the editor reflects edits —
      // including added cards on a brand-new blank deck (deckId === null).
      // Previously this bailed when deckId was null, so "Add card" on a fresh
      // blank deck mutated CardEditor's local state but never bumped
      // template.cards.length → the reveal queue (visibleCards) never advanced
      // and the new card was sliced off, invisible.
      setTemplate((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, cards: nextCards };
        // Persist only once the deck is real (has a deckId). Unsaved scratch
        // decks update in memory but don't write to the library.
        if (deckId) {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          setSaveStatus('saving');
          saveTimeoutRef.current = setTimeout(() => {
            saveDeck(deckId, updated);
            setSaveStatus('saved');
          }, 600);
        }
        return updated;
      });
    },
    [deckId],
  );

  // Ctrl/Cmd+S — flush the deck to storage now instead of firing the browser's
  // "Save page" dialog. The deck already auto-saves (debounced); this just
  // commits immediately and confirms via the 'saved' status. Read through refs
  // so the listener stays mounted (no re-subscribe on every edit). Always
  // preventDefault so the browser dialog never appears, even on a scratch deck.
  const templateSaveRef = useRef(template);
  templateSaveRef.current = template;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== 's' && e.key !== 'S')) return;
      e.preventDefault();
      const id = deckIdRef.current;
      const tpl = templateSaveRef.current;
      if (!id || !tpl) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveDeck(id, tpl);
      setSaveStatus('saved');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Title edits flow through the same debounced save channel. Empty title is
  // allowed; the toolbar shows "Untitled deck" as placeholder.
  const handleTitleChange = useCallback(
    (nextName: string) => {
      if (!deckId) return;
      setTemplate((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, name: nextName };
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaveStatus('saving');
        saveTimeoutRef.current = setTimeout(() => {
          saveDeck(deckId, updated);
          setSaveStatus('saved');
        }, 600);
        return updated;
      });
    },
    [deckId],
  );

  // File ▸ Save — force an immediate persist (auto-save already runs on edits;
  // this is the explicit affordance users expect in a menu)..
  const handleSave = useCallback(() => {
    if (!deckId || !template) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveDeck(deckId, template);
    setSaveStatus('saved');
  }, [deckId, template]);

  // File ▸ Save as — duplicate the deck under a new id + "<name> copy" and open
  // it. Full navigation is fine here (the copy is already persisted).
  const handleSaveAs = useCallback(() => {
    if (!template) return;
    const newId = generateDeckId();
    const base = template.name?.trim() || 'Untitled deck';
    saveDeck(newId, { ...template, name: `${base} copy` });
    window.location.assign(`/editor/slides?deck=${newId}`);
  }, [template]);

  // File ▸ Open — import a .pptx as a NEW deck (role-mapped editor cards) and open
  // it. Triggers the hidden file input below; on a chosen file it POST it to
  // /api/pptx/import, wrap the returned cards in a deck under the active theme,
  // persist, and navigate to it.
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const handleOpenPptx = useCallback(() => { pptxInputRef.current?.click(); }, []);
  const onPptxFileChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaveStatus('saving');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/pptx/import', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || `Import failed (${res.status})`);
      }
      const data = (await res.json()) as { name: string; cards: import('@/types/card-template').Card[]; warnings: string[] };
      const newId = generateDeckId();
      const imported: import('@/types/card-template').CardTemplate = {
        id: newId,
        name: data.name || 'Imported deck',
        description: '',
        category: 'imported',
        thumbnail: '',
        themeId: activeTheme.id,
        theme: themeToTemplate(activeTheme),
        cards: data.cards,
      };
      saveDeck(newId, imported);
      window.location.assign(`/editor/slides?deck=${newId}`);
    } catch (err) {
      setSaveStatus('saved');
      setGenError({ title: 'Could not open file', message: err instanceof Error ? err.message : 'Failed to open the PPTX file.' });
    }
  }, [activeTheme]);

  // File ▸ Save to template library — serialize the current (imported + fine-tuned)
  // deck into a structured-template JSON committed to the project (authoring only).
  const handleSaveToLibrary = useCallback(async () => {
    if (!template) return;
    try {
      const res = await fetch('/api/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, name: template.name }),
      });
      const data = await res.json().catch(() => ({} as { error?: string; slides?: number; path?: string }));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setGenError({ title: 'Saved to template library', message: `${data.slides} slides → ${data.path}` });
    } catch (err) {
      setGenError({ title: 'Could not save template', message: err instanceof Error ? err.message : 'Failed to save the template.' });
    }
  }, [template]);

  // Keep the tab/document title in sync with the deck name so Print / Save-as-PDF
  // suggests a meaningful filename (browsers default the PDF name to
  // document.title). Untitled decks get a general default instead of the
  // generic app title "Foxit Slides" (untitled artifacts should get
  // a sensible name).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // A deck always gets a real default name from its topic (the prompt becomes
    // template.name at generation; the user can rename). If somehow unset, fall
    // back to the deck's own first heading — never a generic "Untitled".
    const explicit = template?.name?.trim();
    let firstHeading: string | undefined;
    for (const c of template?.cards ?? []) {
      for (const b of c.freeform ?? []) {
        if (b.type === 'text' && typeof b.content === 'string' && b.content.trim()) {
          firstHeading = b.content.trim();
          break;
        }
      }
      if (firstHeading) break;
    }
    const resolved = explicit || firstHeading || 'Presentation';
    document.title = resolved;
    return () => {
      document.title = 'Foxit Slides';
    };
  }, [template?.name, template?.cards]);

  // Theme edits from the Brand rail panel — overwrites template.theme and
  // persists. Routes through the same save debounce so rapid swatch / font
  // changes collapse into one localStorage write.
  const handleThemeChange = useCallback(
    (nextTheme: import('@/types/card-template').TemplateTheme) => {
      if (!deckId) return;
      setTemplate((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, theme: nextTheme };
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        setSaveStatus('saving');
        saveTimeoutRef.current = setTimeout(() => {
          saveDeck(deckId, updated);
          setSaveStatus('saved');
        }, 600);
        return updated;
      });
    },
    [deckId],
  );

  // Flush any pending content save on unmount so navigating away doesn't
  // lose the last burst of edits sitting in the debounce window.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Best-effort flush: re-read the most recent template from state
        // is impossible after unmount, but the debounce already fired the
        // most recent edit if it was older than 600ms. Closer-to-zero
        // edits get dropped — acceptable tradeoff vs. saving on every
        // keystroke and thrashing localStorage.
      }
    };
  }, []);

  // Auto-suggest framework from prompt (chips below the prompt textarea)
  const suggested = prompt.trim().length > 5 ? suggestFramework(prompt) : null;

  // Audience + tone chips: live LLM-backed suggestions tailored to the
  // current prompt. Debounced so it doesn't fire on every keystroke; aborts
  // any in-flight call when the prompt changes again. Empty prompts clear
  // the chips so a stale Try-Me suggestion never sticks around.
  useEffect(() => {
    const trimmed = prompt.trim();
    if (trimmed.length < 5) {
      setSuggestedAudiences([]);
      setSuggestedTones([]);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      fetchContextSuggestions(trimmed, ac.signal)
        .then(({ audiences, tones }) => {
          setSuggestedAudiences(audiences);
          setSuggestedTones(tones);
        })
        .catch(() => { /* aborted or network — ignore */ });
    }, 600);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [prompt]);

  // Close the Customize popover when the user clicks outside it or presses
  // Escape. Standard popover dismiss behavior.
  useEffect(() => {
    if (!customizeOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false);
        setCustomizeExpanded(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCustomizeOpen(false);
        setCustomizeExpanded(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [customizeOpen]);

  // When the user picks a framework for the FIRST TIME (going from null →
  // Framework no longer overrides cardCount, the user
  // owns the slide-count selection exclusively. Picking a framework provides
  // structural flavour (what kinds of cards to make), but the user's
  // explicit count is always honoured. The card-engine's expansion /
  // compression logic distributes the framework's steps across the user's
  // chosen N cards.

  /** Multi-select layout picker — user picks which specific layout TYPES to
   *  include in the generated deck. Each picked layout appears exactly once.
   *  cardCount auto-bumps if the number of picked layouts exceeds it. Per
   * / task #20 (refined from the earlier 3-flavor variant
   *  approach which she replaced with this more granular picker). */
  const [selectedLayouts, setSelectedLayouts] = useState<string[]>([]);
  // Keep cardCount in sync: if user picks more layouts than current count,
  // bump cardCount to match. Never reduce — user can shrink layouts later.
  useEffect(() => {
    if (selectedLayouts.length > cardCount) {
      setCardCount(Math.min(15, selectedLayouts.length));
    }
  }, [selectedLayouts.length, cardCount]);
  // Reset picks when framework changes — stale picks shouldn't carry over.
  useEffect(() => { setSelectedLayouts([]); }, [framework?.id]);
  // Which framework's layout-customize modal is open (null = closed).
  const [customizeLayoutsFor, setCustomizeLayoutsFor] = useState<Framework | null>(null);

  // Typewriter animation for inspire-text → prompt textarea.
  // 2026-05-21: clicking any inspire affordance should type the suggestion
  // into the prompt rather than appearing instantly. After typing completes,
  // briefly flag the Generate button for the attention-pulse animation so
  // the user sees the deck is ready to go.
  const typewriterAbortRef = useRef<{ cancel: () => void } | null>(null);
  const [generateAttention, setGenerateAttention] = useState(false);

  const typewriteIntoPrompt = useCallback((text: string) => {
    typewriterAbortRef.current?.cancel();
    let i = 0;
    const intervalMs = 22;
    const interval = setInterval(() => {
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        setPrompt(text);
        typewriterAbortRef.current = null;
        // Pulse the Generate button twice — animation is 0.7s × 2 = 1.4s.
        setGenerateAttention(true);
        window.setTimeout(() => setGenerateAttention(false), 1600);
      } else {
        setPrompt(text.slice(0, i));
      }
    }, intervalMs);
    typewriterAbortRef.current = { cancel: () => clearInterval(interval) };
  }, []);

  // Pick a random topic from INSPIRE_POOL and drop it into the prompt.
  // Used by the no-framework Inspire Me pill; when a framework is selected,
  // the wizard renders the framework's inspireTopics as chips that call
  // typewriteIntoPrompt directly.
  const handleInspireMe = useCallback(() => {
    const choice =
      INSPIRE_POOL[Math.floor(Math.random() * INSPIRE_POOL.length)];
    typewriteIntoPrompt(choice);
  }, [typewriteIntoPrompt]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileBlob(file);
    // Text-like formats (.txt/.md) get read inline so the prompt-only flow
    // can still receive them as reference. Binary formats (PDF/DOCX/PPTX)
    // bypass readAsText entirely — they go to /api/source-grounded/build
    // (Source mode) or /api/ai/extract-reference via multipart (Inspire
    // modes — Phase 1.5) when the user clicks Generate.
    const lower = file.name.toLowerCase();
    const isTextLike = lower.endsWith('.txt') || lower.endsWith('.md');
    if (isTextLike) {
      const reader = new FileReader();
      reader.onload = () => setFileContent(reader.result as string);
      reader.readAsText(file);
    } else {
      setFileContent(null);
    }
  };

  // Completion gate — reveal the editor only once generation is done AND every
  // fired image has settled (so no half-built deck, no images popping in after).
  const maybeReveal = useCallback(() => {
    if (!generationDoneRef.current) return;
    if (pendingImagesRef.current > 0) return;
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setRevealReady(true);
  }, []);

  // P5 — Design critic (vision), OBSERVE-ONLY. Fire once the deck is fully
  // revealed: maybeReveal flips revealReady true ONLY after generation is done
  // AND every image has settled, so this is exactly "what the user sees" — images
  // included. Capturing in the `done` handler instead would judge a pre-image
  // slide and miss image-over-text defects (the whole point of a visual judge).
  // Reads the live templateRef (not a stale closure), runs sequentially, and is
  // a no-op unless NEXT_PUBLIC_DESIGN_CRITIC=observe.
  useEffect(() => {
    if (!revealReady || !generationDoneRef.current || designCriticRanRef.current) return;
    designCriticRanRef.current = true;
    const t = templateRef.current;
    const id = deckIdRef.current;
    if (!t || !id) return;
    const timer = setTimeout(() => { void runDesignCriticObserve(t, t.theme, id); }, 600);
    return () => clearTimeout(timer);
  }, [revealReady]);

  // Track a fire-and-forget image promise so the gate knows when imagery is
  // complete. Increments on fire, decrements + re-checks on settle.
  const trackImage = useCallback((p: Promise<unknown>) => {
    pendingImagesRef.current += 1;
    void p.finally(() => {
      pendingImagesRef.current = Math.max(0, pendingImagesRef.current - 1);
      maybeReveal();
    });
  }, [maybeReveal]);

  // No-image reflow: when a slide's planned image never
  // arrives (no key, no stock match, no good library match), the layout must
  // NOT leave the reserved image region empty — that's the "title shoved to one
  // side, blank half" bug. These two helpers reflow the affected card to a clean
  // no-image form instead.

  // Cover → recompose to a no-image (type-only) form so the title fills the
  // slide. Mirrors composeGeneratedCover with hasImage:false, on a single card.
  const recomposeCoverNoImage = useCallback((cardId: string, theme: Theme) => {
    setTemplate((prev) => {
      if (!prev) return prev;
      const cards = [...prev.cards];
      const idx = cards.findIndex((c) => c.id === cardId);
      if (idx < 0) return prev;
      const target = cards[idx];
      // Drop any cover image block, then recompose the title region for a
      // no-image form (selectCompositionFromAllowed returns type-only when
      // hasImage is false — the same contract composeGeneratedCover relies on).
      const ff = (target.freeform ?? []).filter(
        (b) => !(b.type === 'image' && b.id.startsWith('ff-autoimg-cover-')),
      );
      const headingText =
        (ff.find(
          (b) => b.type === 'text' && (b as { variant?: string }).variant === 'heading',
        ) as { content?: string } | undefined)?.content ?? '';
      const noImage = selectCompositionFromAllowed(
        {
          hasImage: false,
          orientation: 'landscape',
          brightness: 0.5,
          themeArchetype: theme.archetype,
          themeTone: theme.tone,
          headlineLength: headlineLengthOf(headingText),
        },
        undefined,
        0,
      );
      const applied = applyCoverComposition(ff, noImage);
      cards[idx] = {
        ...target,
        freeform: applied.freeform,
        slideDesign: target.slideDesign
          ? {
              ...target.slideDesign,
              imageRole: applied.imageRole,
              coverTier: applied.coverTier,
              compositionForm: noImage.form,
              titlePosition: noImage.titlePosition,
            }
          : target.slideDesign,
      };
      const next = { ...prev, cards };
      if (deckIdRef.current) saveDeck(deckIdRef.current, next);
      return next;
    });
  }, []);

  // Interior → reflow to full-width. Only column/band layouts reserve a half for
  // the image (full-bleed/texture/background put text full-width already), so
  // only those need reflowing. Re-converting with imageRole cleared makes
  // templateForRecipe return the full-width structured layout (see cardHasImage
  // / templateForRecipe in structuredToFreeform).
  const reflowInteriorNoImage = useCallback((
    cardIndex: number,
    structuredCard: Card,
    theme: import('@/types/card-template').TemplateTheme,
  ) => {
    const role = structuredCard.slideDesign?.imageRole;
    if (role !== 'column' && role !== 'band') return;
    const downgraded: Card = {
      ...structuredCard,
      slideDesign: structuredCard.slideDesign
        ? { ...structuredCard.slideDesign, imageRole: 'none' }
        : structuredCard.slideDesign,
    };
    const reflowed = cardToUnified(downgraded, theme);
    setTemplate((prev) => {
      if (!prev) return prev;
      const cards = [...prev.cards];
      const existing = cards[cardIndex];
      if (!existing) return prev;
      // Keep the existing card id so thumbnail + reveal tracking stay stable.
      cards[cardIndex] = { ...reflowed, id: existing.id };
      const next = { ...prev, cards };
      if (deckIdRef.current) saveDeck(deckIdRef.current, next);
      return next;
    });
  }, []);

  // Auto-image-at-creation: fire-and-forget per card the AI designer flagged
  // (imageIntent.wanted). Generates ONE image (n=1) from the slide's concept,
  // places it as a freeform image at the recommended position, and stamps it
  // with `autoGen` so clicking it later can fan out to n=4 for the swap picker.
  // Failures are swallowed — a missing image never blocks deck generation, and
  // the card reflows to full-width so no empty image region is left behind.
  const placeAutoImage = useCallback(async (
    cardIndex: number,
    structuredCard: Card,
    themePalette: string,
    deckTitle: string,
    theme: import('@/types/card-template').TemplateTheme,
  ) => {
    const intent = structuredCard.imageIntent;
    if (!intent?.wanted) return;
    // B2b: the card crossing the seam is now CONVERTED (columns emptied, content
    // in freeform). Read the heading from the freeform 'heading' text block,
    // falling back to a structured columns heading for any non-converted card.
    const freeformHeading = (structuredCard.freeform ?? []).find(
      (b) => b.type === 'text' && b.variant === 'heading',
    ) as { content?: string } | undefined;
    const columnsHeading = structuredCard.columns?.[0]?.blocks?.find(
      (b) => b.type === 'heading',
    ) as { content?: string } | undefined;
    const slideHeading = (freeformHeading?.content || columnsHeading?.content || '').trim();
    const subject = (intent.subject || slideHeading).trim();
    if (!subject) return;
    // PRIMARY IMAGE SOURCE = FREE STOCK. The slide's visual
    // concept becomes a stock SEARCH QUERY (Pexels/Pixabay) — free, instant, and
    // reliably relevant, vs AI gen ($/slow/prone to literal/dark output). The
    // route returns the same shape as /api/ai/generate-image. If no stock match
    // (or no API key), it SKIP the image rather than silently spend on AI — AI
    // generation stays an explicit opt-in on the manual image surface.
    try {
      const res = await fetch('/api/images/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: imageCategoryRef.current
            ? `${categoryLabel(imageCategoryRef.current)} ${subject}`
            : subject,
          n: 1,
          aspect: '16:9',
        }),
      });
      if (!res.ok) { reflowInteriorNoImage(cardIndex, structuredCard, theme); return; }
      const data = await res.json();
      const img = data.images?.[0] ?? (data.src ? { src: data.src, libraryId: data.libraryId } : null);
      if (!img?.src) { reflowInteriorNoImage(cardIndex, structuredCard, theme); return; }

      // Preload/decode the image so it only appears on the card once it's ready
      // to paint — no pop-in. Resolve on error too so a failed load never hangs;
      // the !img.src guard above already ensures it has a src to attempt.
      await new Promise<void>((resolve) => {
        const im = new window.Image();
        im.onload = () => resolve();
        im.onerror = () => resolve();
        im.src = img.src;
      });

      // Design Intelligence Layer: place by ROLE when the planner assigned one;
      // fall back to the placement-driven box for cards without a design.
      const imageRole = structuredCard.slideDesign?.imageRole as ImageRole | undefined;
      const box = imageRole
        ? imageRoleBox(imageRole, intent.placement)
        : autoImageBox(intent.placement);
      // Per-role opacity. texture/background
      // are FAINT WASHES (~0.18) so the theme's normal text reads on top with
      // no scrim. duotone/full-bleed stay full strength (undefined) — they get
      // the assertive scrim + forced light text in FreeformLayer instead.
      const imageOpacity = imageRoleOpacity(imageRole);
      const block: FreeformImageBlock = {
        id: `ff-autoimg-${structuredCard.id}-${Date.now()}`,
        type: 'image',
        x: box.x, y: box.y, w: box.w, h: box.h,
        rotation: 0,
        // Behind the text for full-bleed hero/background; on top for side/top
        // placements so the image is visible in its own region.
        z: box.behind ? 0 : 999,
        src: img.src,
        alt: subject,
        fit: 'cover',
        frameShape: 'rectangle',
        ...(imageOpacity !== undefined ? { opacity: imageOpacity } : {}),
        autoGen: {
          subject,
          style: intent.style,
          slideHeading,
          deckTitle,
          themePalette,
          variantIds: img.libraryId ? [img.libraryId] : [],
        },
      };

      setTemplate((prev) => {
        if (!prev) return prev;
        const cards = [...prev.cards];
        const target = cards[cardIndex];
        if (!target) return prev;
        const existing = target.freeform ?? [];
        cards[cardIndex] = {
          ...target,
          freeform: box.behind ? [block, ...existing] : [...existing, block],
        };
        const next = { ...prev, cards };
        // Persist late arrivals (image resolved after `done` already saved the
        // deck). Idempotent localStorage write; only fires once a deck id
        // exists. The `done` handler covers images that land mid-stream.
        if (deckIdRef.current) saveDeck(deckIdRef.current, next);
        return next;
      });
    } catch {
      // Fire-and-forget — never surface an image failure as a generation error.
      // Still reflow so a planned image region doesn't render empty.
      reflowInteriorNoImage(cardIndex, structuredCard, theme);
    }
  }, [reflowInteriorNoImage]);

  // Cover-image placement (photo / split tiers only). Fire-and-forget, mirrors
  // placeAutoImage but for slide 0: generates ONE mood-matched cover image from
  // the deck title + theme vibe and places it as a full-bleed (photo) or column
  // (split) freeform block so the existing scrim / contrast / image-aware text
  // bounds keep the title legible. If generation fails, the cover silently
  // stays the typographic tier — the title still renders on the theme surface
  // with its corner motif. NEVER the deleted flat gradient, NEVER a broken box.
  const placeCoverImage = useCallback(async (
    cardId: string,
    result: CompositionResult,
    theme: Theme,
    deckTitle: string,
  ) => {
    if (!compositionWantsImage(result.form)) return;
    const topic = cleanCoverTopic(deckTitle);
    const subject = coverImageSubject(deckTitle, theme);
    const themePalette = theme.chartPalette?.join(', ') ?? '';
    try {
      // Cover image = free stock too. The cleaned deck topic
      // is the stock search query. Skip silently if no match / no key.
      const res = await fetch('/api/images/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: imageCategoryRef.current
            ? `${categoryLabel(imageCategoryRef.current)} ${topic}`
            : topic,
          n: 1,
          aspect: '16:9',
        }),
      });
      if (!res.ok) { recomposeCoverNoImage(cardId, theme); return; }
      const data = await res.json();
      const img = data.images?.[0] ?? (data.src ? { src: data.src, libraryId: data.libraryId } : null);
      if (!img?.src) { recomposeCoverNoImage(cardId, theme); return; }

      await new Promise<void>((resolve) => {
        const im = new window.Image();
        im.onload = () => resolve();
        im.onerror = () => resolve();
        im.src = img.src;
      });

      const geo = compositionGeometry(result.form, result.imageSide);
      const behind = result.form === 'full-bleed-overlay' || result.form === 'diagonal-split';
      const block: FreeformImageBlock = {
        id: `ff-autoimg-cover-${cardId}-${Date.now()}`,
        type: 'image',
        x: geo.image?.x ?? 0, y: geo.image?.y ?? 0, w: geo.image?.w ?? 100, h: geo.image?.h ?? 100,
        rotation: 0,
        z: behind ? 0 : 1,
        src: img.src,
        alt: `Cover image — ${topic}`.trim(),
        fit: 'cover',
        frameShape:
          result.form === 'diagonal-split'
            ? (result.imageSide === 'left' ? 'diagonal-left' : 'diagonal-right')
            : 'rectangle',
        autoGen: {
          subject,
          style: 'photographic',
          slideHeading: topic,
          deckTitle: topic,
          themePalette,
          variantIds: img.libraryId ? [img.libraryId] : [],
        },
      };

      setTemplate((prev) => {
        if (!prev) return prev;
        const cards = [...prev.cards];
        const cardIndex = cards.findIndex((c) => c.id === cardId);
        if (cardIndex < 0) return prev;
        const target = cards[cardIndex];
        // Drop any prior cover image, add the new one, and re-run the composition
        // so the image + title regions are finalized together.
        const withoutOldCover = (target.freeform ?? []).filter(
          (b) => !(b.type === 'image' && b.id.startsWith('ff-autoimg-cover-')),
        );
        const applied = applyCoverComposition([...withoutOldCover, block], result);
        cards[cardIndex] = {
          ...target,
          freeform: applied.freeform,
          slideDesign: target.slideDesign
            ? {
                ...target.slideDesign,
                imageRole: applied.imageRole,
                coverTier: applied.coverTier,
                compositionForm: result.form,
                titlePosition: result.titlePosition,
              }
            : target.slideDesign,
        };
        const next = { ...prev, cards };
        if (deckIdRef.current) saveDeck(deckIdRef.current, next);
        return next;
      });
    } catch {
      // Fire-and-forget — a failed cover image reflows to the no-image
      // (type-only) tier so the title fills the slide, never an empty box.
      recomposeCoverNoImage(cardId, theme);
    }
  }, [recomposeCoverNoImage]);

  const handleGenerate = async () => {
    // Snapshot the deck BEFORE generation so a failure can restore it instead of
    // stranding the user on a 1-card "error" deck (null = fresh gen → create screen).
    const prevTemplate = template;
    setGenerating(true);
    setStreamProgress(null);
    committedRef.current = false;
    setOverlayUp(true); // overlay covers the editor until the judge verifies (Decision A)
    setStagedReveal(true); // reveal one slide at a time when the overlay lifts (item 3)
    // Close the completion gate — hide the editor + thumbnails until the whole
    // deck (cards + images) is assembled, then reveal once.
    setRevealReady(false);
    generationDoneRef.current = false;
    designCriticRanRef.current = false;
    pendingImagesRef.current = 0;
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    // ── Auto-image budget ──────────────────────────────
    // Generated images NEVER happen unless the user opted in via the toggle.
    // Even then, cap fresh OpenAI image calls at MAX_AUTO_IMAGES_PER_DECK for
    // the initial generation, so a big deck can't quietly fan out 15 images.
    // One slot is reserved for the cover (when its tier wants one) so content
    // slides can't starve it. `autoImageBudget` is decremented synchronously
    // at each fire site below (both fires live in this closure).
    const MAX_AUTO_IMAGES_PER_DECK = 3;
    // The orchestrator gives the cover an image whenever auto-images is on
    // (it then picks an image-bearing composition form). Reserve a slot.
    const coverMayWantImage = autoImages;
    let autoImageBudget = autoImages ? MAX_AUTO_IMAGES_PER_DECK : 0;

    // Reference-upload mode routing:
    //   'source'            → the file IS the deck's content. A .docx/.pptx/.pdf
    //                          attachment is extracted (native OOXML for Office,
    //                          Foxit for PDF) via /api/source-grounded/extract and
    //                          fed here as `effectiveFileContent`, so it rides the
    //                          SAME faithful structured engine as a typed prompt
    //                          (real Figma skins, structured-aware cover) instead
    //                          of the legacy source-grounded card path. Legacy
    //                          binary .doc/.ppt keep the old build.
    //   'inspire' / 'inspire-structure' → extract tone/audience/structure hints
    //                          from the file as overrides; content from the prompt.
    let effectiveFileContent: string | null = fileContent;
    if (fileBlob && uploadMode === 'source') {
      const lower = fileBlob.name.toLowerCase();
      const isExtractable = lower.endsWith('.docx') || lower.endsWith('.pptx') || lower.endsWith('.pdf');
      if (isExtractable) {
        try {
          const fd = new FormData();
          fd.append('file', fileBlob);
          const exRes = await fetch('/api/source-grounded/extract', { method: 'POST', body: fd });
          if (!exRes.ok) {
            const eb = await exRes.json().catch(() => ({ error: 'Could not read the attached document' }));
            throw new Error(eb.error || 'Could not read the attached document');
          }
          const { text } = (await exRes.json()) as { text: string };
          effectiveFileContent = text; // grounds the structured generate below
        } catch (err) {
          // Fail cleanly — never fall back to a legacy/garbage deck.
          throw err instanceof Error ? err : new Error('Document extraction failed');
        }
      } else if (lower.endsWith('.doc') || lower.endsWith('.ppt')) {
        await handleGenerateFromSource();
        return;
      }
    }

    // Default theme when none is picked: Mono Light. Only the
    // three mapped themes are selectable now, so an unpicked deck generates in
    // the default (Mono Light) rather than a content-derived pick across the old
    // library. `setActiveTheme` is async to keep the choice in a local —
    // `themeForGeneration` — for this closure's reads.
    let themeForGeneration = activeTheme;
    if (!userPickedTheme) {
      themeForGeneration = getThemeById(DEFAULT_THEME_ID);
      setActiveTheme(themeForGeneration);
    }

    // Inspire mode: extract reference hints (tone, audience, optional
    // structure, optional theme) before generation, then layer them over
    // the user's prompt. Phase 1.5 unblocks binary files (PDF/DOCX/PPTX)
    // by routing them through Foxit text extraction on the server side.
    let effectiveAudience = audience;
    let effectiveTone = tone;
    let structureHint: string[] | undefined;
    let referenceTheme: import('@/types/card-template').TemplateTheme | undefined;
    if (fileBlob && (uploadMode === 'inspire' || uploadMode === 'inspire-structure')) {
      const lower = fileBlob.name.toLowerCase();
      const isBinaryDoc =
        lower.endsWith('.pdf') || lower.endsWith('.docx') ||
        lower.endsWith('.doc') || lower.endsWith('.pptx') ||
        lower.endsWith('.ppt');
      try {
        let refRes: Response;
        if (isBinaryDoc) {
          const fd = new FormData();
          fd.append('file', fileBlob);
          fd.append('mode', uploadMode);
          refRes = await fetch('/api/ai/extract-reference', { method: 'POST', body: fd });
        } else if (fileContent) {
          refRes = await fetch('/api/ai/extract-reference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: fileContent, fileName: fileBlob.name, mode: uploadMode }),
          });
        } else {
          refRes = new Response(null, { status: 204 });
        }
        if (refRes.ok && refRes.status !== 204) {
          const hints = await refRes.json() as {
            tone?: string;
            audience?: string;
            structureHint?: string[];
            theme?: import('@/types/card-template').TemplateTheme & { accentColors: string[] };
          };
          if (hints.tone) effectiveTone = hints.tone;
          if (hints.audience) effectiveAudience = hints.audience;
          if (hints.structureHint?.length) structureHint = hints.structureHint;
          if (hints.theme) {
            // Merge over the activeTheme-derived TemplateTheme so anything the
            // hint didn't specify (radius, padding) falls back to the editor's
            // current visual theme defaults.
            const base = themeToTemplate(themeForGeneration);
            referenceTheme = {
              ...base,
              accentColors: hints.theme.accentColors?.length ? hints.theme.accentColors : base.accentColors,
              pageBg: hints.theme.pageBg ?? base.pageBg,
              cardBg: hints.theme.cardBg ?? base.cardBg,
              headingColor: hints.theme.headingColor ?? base.headingColor,
              bodyColor: hints.theme.bodyColor ?? base.bodyColor,
              headingFont: hints.theme.headingFont ?? base.headingFont,
              bodyFont: hints.theme.bodyFont ?? base.bodyFont,
            };
          }
        }
      } catch {
        // Non-fatal — fall through to plain generation. User still gets a deck.
      }
    }

    try {
      // Source-mode binary docs were already extracted ONCE above through the
      // native-OOXML path (`/api/source-grounded/extract`), which preserves the
      // document's heading/list/table structure. `effectiveFileContent` (declared
      // before this try) carries that structured text into the body below. it does
      // NOT re-extract here: a second pass through the PDF-flattening route used to
      // shadow and discard the OOXML result, grounding decks on the worse copy.
      const res = await fetch('/api/ai/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt, docType: framework?.category || 'presentation',
          audience: effectiveAudience, tone: effectiveTone, density,
          structureHint,
          // Route the editor's default generation through the STRUCTURED engine
          // (validated Figma themes + faithful covers) instead of the legacy
          // improvise engine. skinHint = the picked theme id; selectable theme
          // ids ARE the structured skin ids (the 5 faithful), so it's a direct
          // pass, and no-pick already defaulted themeForGeneration to mono-light.
          structured: true,
          skinHint: themeForGeneration.id,
          // Honor the Auto-images toggle on the structured path too. The engine
          // places library images on the 05-content split layout (the safe
          // content-image win) and, for NON-faithful covers only, a full-bleed
          // cover; faithful typographic covers are protected (coverAcceptsImage
          // is false → applyCoverImage is skipped). No image is reused across
          // slides; full-bleed contrast is handled by the renderer's scrim.
          images: autoImages,
          // Map picked layout IDs to the underlying block templates the
          // card-engine understands.
          selectedLayouts: selectedLayouts.length > 0
            ? selectedLayouts.map((id) => LAYOUT_PICKS.find((lp) => lp.id === id)?.blockTemplate).filter(Boolean)
            : undefined,
          theme: referenceTheme ?? themeToTemplate(themeForGeneration),
          fileContent: effectiveFileContent, framework, cardCount,
          // Voice override from Customize popover. undefined = framework default;
          // SkillId = explicit override; null = explicit "no voice" (generic).
          skillIdOverride: hasPickedVoice ? skillOverride : undefined,
          // Rewrite intensity — how much license AI has to rewrite the user's
          // prompt prose. Default 'inspire' = today's behavior. Power users
          // opt down to 'build' or 'verbatim' when they brought their own copy.
          rewriteIntensity,
          // Silent agent memory — the client scans localStorage for prior
          // decks with a similar shape (audience, keyword overlap in the
          // sourcePrompt), picks up to 3, and sends their SHAPE (arc +
          // layouts + angle + tone) so the plan agent can reuse the same
          // narrative structure. NEVER surfaced to the user. Shape only,
          // never facts (FR11). Empty when no prior deck is relevant.
          priorDecks: getPriorDeckContext(prompt, effectiveAudience, 3),
          stream: true,
        }),
      });
      if (!res.ok) throw new Error('Generation failed');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentTheme = themeToTemplate(themeForGeneration);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const dataMatch = line.match(/^data: (.+)$/);
          if (!dataMatch) continue;
          try {
            const event = JSON.parse(dataMatch[1]);
            if (event.type === 'blueprint') {
              // Show skeleton shells immediately — cards with just titles, no content
              currentTheme = event.theme || currentTheme;
              const skeletonCards = event.cards.map((c: { id: string; title: string; layout: string; style: string }) => ({
                id: c.id,
                layout: c.layout,
                style: c.style,
                columns: [{ blocks: [
                  { type: 'heading' as const, level: 2 as const, content: c.title },
                  { type: 'paragraph' as const, content: '' },
                ] }],
                ...(c.layout === 'split-left' ? { accent: { type: 'gradient' as const, value: `linear-gradient(135deg, ${currentTheme.accentColors?.[0] ?? '#6B3FA0'}, ${currentTheme.accentColors?.[1] ?? currentTheme.accentColors?.[0] ?? '#6B3FA0'})`, position: 'left' as const } } : {}),
                ...(c.layout === 'split-right' ? { accent: { type: 'gradient' as const, value: `linear-gradient(135deg, ${currentTheme.accentColors?.[0] ?? '#6B3FA0'}, ${currentTheme.accentColors?.[1] ?? currentTheme.accentColors?.[0] ?? '#6B3FA0'})`, position: 'right' as const } } : {}),
              }));
              setTemplate({
                // Untitled by default (Google-Docs style) — the deck suggests
                // its title (cover heading) when the user edits it. The prompt is
                // preserved in `description` for now (future: a dedicated
                // sourcePrompt field for generation tracking).
                id: `streaming-${Date.now()}`, name: '', description: prompt,
                category: 'presentation', thumbnail: '', theme: currentTheme, cards: skeletonCards,
              });
            } else if (event.type === 'verdict') {
              // Visual critic (on by default). The judge runs after the cards
              // stream, so verdicts arrive at the tail. Observe-mode: report each
              // flagged slide loudly (never silent) so a bad render/overflow is
              // visible. A visible in-editor badge is design-gated follow-up; for
              // now this surfaces in the console + drives the auto-revise loop
              // when that lands.
              const v = event.trace;
              if (v?.ran && !v.passed) {
                console.warn(
                  `[visual-critic] slide ${v.index + 1} (${v.layoutKey}) FLAGGED · score ${v.overall}/5 · ${(v.fails ?? []).join(', ')}`,
                  v.reasons ?? [],
                );
              } else if (v?.ran) {
                console.info(`[visual-critic] slide ${v.index + 1} (${v.layoutKey}) ok · ${v.overall}/5`);
              }
            } else if (event.type === 'card') {
              // Replace skeleton with real content. Convert THIS card to the
              // unified freeform format immediately (instead of waiting for
              // the `done` event to convert the whole template at once) —
              // that lets each card render through FreeformLayer as soon as
              // it arrives. Also tag every freeform text block with
              // __animateOnMount so the renderer plays a typewriter reveal
              // on first paint. — restores the per-slide
              // typewriter that was lost when the unified-format rewrite
              // moved generation output to freeform without rewiring the
              // animation hook.
              const unifiedCard = cardToUnified(event.card, currentTheme);
              const animatedCard = {
                ...unifiedCard,
                freeform: (unifiedCard.freeform ?? []).map((b) =>
                  b.type === 'text' ? { ...b, __animateOnMount: true } : b,
                ),
              };
              setTemplate((prev) => {
                if (!prev) return prev;
                const newCards = [...prev.cards];
                // Bounds-guard: a desync between the skeleton length and an
                // incoming cardIndex must not write past the array. The `done`
                // event re-delivers the full template, so skipping is lossless.
                if (event.cardIndex < 0 || event.cardIndex >= newCards.length) return prev;
                newCards[event.cardIndex] = animatedCard;
                return { ...prev, cards: newCards };
              });
              setStreamProgress({ cardIndex: event.cardIndex, total: event.total });
              // Auto-image-at-creation (opt-in): if the toggle is on and the AI
              // designer flagged this slide as one that earns an image, fan out
              // a single image generation in the background. It patches the card
              // when it resolves — never blocks the stream. The title slide
              // (cardIndex 0) is always protected — it never receives an
              // auto-image (text-over-photo on the cover looked bad).
              // DESIGN-OWNED GATE: generate an image only where
              // the DESIGNER marked the slide (slideDesign.imageRole !== 'none'),
              // not on the generator's raw imageIntent. The engine already ranked
              // + capped the selection at plan time; the budget counter below is
              // just a client-side backstop.
              // B2b: only the server-CONVERTED card crosses the seam (event.card).
              // The auto-image gate reads the converted card's design directly —
              // `imageRole` (preserved through conversion) and the
              // `isFullCanvasComposition` stamp (set by the converter, B2a). No raw
              // pre-conversion card and no client-side composition recompute.
              const convertedCard = event.card;
              if (
                autoImages &&
                event.cardIndex !== 0 &&
                !!convertedCard?.slideDesign?.imageRole &&
                convertedCard.slideDesign.imageRole !== 'none' &&
                // P3a lock-the-box: a slide that resolves to a full-canvas
                // composition gets NO image (the composition IS the visual) —
                // the converter stamped this decision, so they can't collide.
                !convertedCard.slideDesign.isFullCanvasComposition &&
                autoImageBudget > (coverMayWantImage ? 1 : 0) // keep 1 for cover
              ) {
                autoImageBudget -= 1;
                trackImage(placeAutoImage(
                  event.cardIndex,
                  convertedCard,
                  currentTheme.accentColors?.join(', ') ?? '',
                  prompt.slice(0, 80),
                  currentTheme,
                ));
              }
            } else if (event.type === 'fill-complete') {
              // FILL COMPLETE (~10s, BEFORE the judge). Commit the deck now —
              // save it, reveal it, mint its id — so a long-running judge, the
              // 120s request cap, or the user navigating away can no longer lose
              // it. The judge runs after this; revised slides stream in as `card`
              // events and the `done` event re-saves the final state.
              setGenerating(false);
              committedRef.current = true;
              // Bake the active theme id into the persisted template so a
              // future load restores both cards and theme. Mint a deck id if
              // one isn't already set, save, and reflect it in the URL so a
              // refresh hydrates from storage.
              //
              // Unified-format adapter (Phase A, 2026-05-21): the generator
              // still emits structured `columns[].blocks`; it converts each
              // card to the unified freeform model here at the seam so the
              // editor sees ONE block format end-to-end.
              const themedSource: CardTemplate = { ...event.template, themeId: themeForGeneration.id };
              // STRUCTURED decks arrive as the theme's faithful Figma render —
              // cover + interiors already freeform-positioned. Honor them as-is:
              // templateToUnified is a safe no-op on freeform cards, but
              // composeGeneratedCover/designCover would OVERWRITE the structured
              // 01-cover with the legacy composed cover (and select an image
              // form). So bypass cover composition for structured decks.
              //
              // LEGACY decks: orchestrator picks the cover composition (Unit 4) —
              // the deck engine chooses the image+title form and lays out the
              // title region; the cover image (if any) lands later via
              // placeCoverImage at the SAME geometry. NEVER the deleted gradient.
              const structuredDeck = isStructuredTemplate(themedSource);
              let finalTemplate: CardTemplate;
              let coverResult: CompositionResult | null;
              if (structuredDeck) {
                finalTemplate = templateToUnified(themedSource);
                // Mark slide-0 so the editor canvas honors the structured cover
                // as-is and suppresses the legacy CoverArt motif (not in Figma).
                if (finalTemplate.cards[0]) {
                  finalTemplate = {
                    ...finalTemplate,
                    cards: finalTemplate.cards.map((c, i) => (i === 0 ? { ...c, structuredCover: true } : c)),
                  };
                }
                coverResult = null;
              } else {
                ({ template: finalTemplate, coverResult } = composeGeneratedCover(
                  templateToUnified(themedSource),
                  themeForGeneration,
                  autoImages,
                ));
              }
              const idForSave = deckId ?? generateDeckId();
              const coverCard0 = finalTemplate.cards[0];
              // Merge any auto-images placed during streaming back in — the
              // final-template replacement would otherwise wipe them, since the
              // server payload doesn't know about the client-side image fetches.
              // (Late images that resolve AFTER this re-save themselves via the
              // deckIdRef path in placeAutoImage.) Behind-images (z=0) go first
              // so they stay under the text; on-top images keep their order.
              setTemplate((prev) => {
                // Sequential typewriter reveal: walk every card in deck order
                // and assign each text block a cumulative start delay so the
                // deck reveals one card at a time — card 1's text types out,
                // THEN card 2's, THEN card 3's — rather than every tagged block
                // animating simultaneously. `cursor` is the running offset in
                // ms; it advances by each text block's estimated type duration
                // (same speed 55 the freeform Typewriter uses), plus a small
                // inter-card beat. Both __animateOnMount and __animateDelay are
                // stripped by stripSessionFlags in saveDeck, so they never
                // persist; reloaded decks render instantly.
                const merged: CardTemplate = {
                  ...finalTemplate,
                  // Auto-named from the cover heading (a real, human title); the
                  // user can rename it by clicking the name in the editor. The
                  // prompt still lives in `description` so it isn't lost.
                  name: coverHeading(finalTemplate.cards),
                  cards: finalTemplate.cards.map((card, i) => {
                    // PER-CARD delay chain. The sequential reveal queue gates
                    // WHEN each card mounts (one at a time); within a card the
                    // blocks chain off a cursor that RESETS to 0 per card, so
                    // heading types first, then body, etc. — starting the moment
                    // that card is revealed, NOT after a deck-wide offset. (A
                    // cross-deck cumulative cursor would leave a just-revealed
                    // card sitting blank for the sum of every earlier card.)
                    // Only `text` blocks animate — auto-images/shapes/icons
                    // appear instantly.
                    let cursor = 0;
                    const animatedFreeform = (card.freeform ?? []).map((b) => {
                      if (b.type !== 'text') return b;
                      const delay = cursor;
                      cursor += estimateTypeDuration(b.content, 55);
                      return { ...b, __animateOnMount: true, __animateDelay: delay };
                    });
                    // The cover (slide 0) already carries its tier-derived
                    // slideDesign from themedSource above (set pre-conversion so
                    // imageAwareBounds could place the split title); `card`
                    // preserves it through the spread.
                    const autoImgs = (prev?.cards?.[i]?.freeform ?? []).filter(
                      (b) => b.id.startsWith('ff-autoimg-'),
                    );
                    if (autoImgs.length === 0) {
                      return { ...card, freeform: animatedFreeform };
                    }
                    return {
                      ...card,
                      freeform: [
                        ...autoImgs.filter((b) => b.z === 0),
                        ...animatedFreeform,
                        ...autoImgs.filter((b) => b.z !== 0),
                      ],
                    };
                  }),
                };
                saveDeck(idForSave, merged, { sourcePrompt: prompt });
                return merged;
              });
              if (!deckId) {
                setDeckId(idForSave);
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.set('deck', idForSave);
                  window.history.replaceState({}, '', url);
                }
              }
              // Make deckIdRef available to the fire-and-forget cover-image
              // placement (it re-saves the deck when the image lands).
              deckIdRef.current = idForSave;
              // (The observe-only Design critic fires from the revealReady effect
              // above — AFTER images settle — so it judges the slide the user
              // actually sees, not this pre-image template.)
              // Cover image (photo / split tiers only). Fire-and-forget; the
              // typographic tier needs no image and the cover already renders.
              // Gated on the auto-images toggle (— covers must
              // NOT auto-generate when the user hasn't opted in) and on the
              // per-deck budget.
              if (
                autoImages &&
                autoImageBudget > 0 &&
                coverCard0 &&
                coverResult &&
                compositionWantsImage(coverResult.form)
              ) {
                autoImageBudget -= 1;
                trackImage(placeCoverImage(
                  coverCard0.id,
                  coverResult,
                  themeForGeneration,
                  (prompt || finalTemplate.name || '').slice(0, 90),
                ));
              }
              // All cards generated + every image fired — open the gate once
              // imagery settles. Max-wait fallback so a slow/failed image never
              // hangs the reveal.
              generationDoneRef.current = true;
              revealTimerRef.current = setTimeout(() => setRevealReady(true), 35000);
              maybeReveal();
            } else if (event.type === 'done') {
              // VERIFIED. The deck already committed at `fill-complete`; any slides
              // the judge's revise rewrote already streamed in as `card` events and
              // are in the live template. Re-tag the FINAL content for the reveal:
              // re-apply each card's per-card typewriter delay chain (revised cards
              // arrive via `card` events carrying __animateOnMount but no delay), so
              // every slide — original or revised — types exactly once, from the
              // start, on the content the user actually sees. The editor was
              // unmounted under the overlay during revision, so nothing typed early.
              // Then re-persist and LIFT the overlay — the first moment the end user
              // sees the deck, and it is the verified one (Decision A).
              setTemplate((prev) => {
                if (!prev) return prev;
                const tagged: CardTemplate = {
                  ...prev,
                  cards: prev.cards.map((card) => {
                    let cursor = 0;
                    const freeform = (card.freeform ?? []).map((b) => {
                      if (b.type !== 'text') return b;
                      const delay = cursor;
                      cursor += estimateTypeDuration(b.content, 55);
                      return { ...b, __animateOnMount: true, __animateDelay: delay };
                    });
                    return { ...card, freeform };
                  }),
                };
                if (deckIdRef.current) saveDeck(deckIdRef.current, tagged, { sourcePrompt: prompt });
                return tagged;
              });
              setOverlayUp(false);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Generation failed') {
              // Ignore JSON parse errors from partial chunks
            } else {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      console.error('Card generation failed:', err);
      // If the deck already committed at `fill-complete`, this error is a
      // post-commit hiccup (e.g. the stream dropped during the judge). The deck
      // is saved and on screen — do NOT wipe it or alarm the user.
      if (committedRef.current) {
        console.warn('Post-commit generation error (deck already saved):', err);
      } else {
        // Surface the failure in a centered error modal and restore the deck the
        // user had before — never strand them on a cryptic 1-card "error" deck.
        setGenError({
          title: "Couldn't generate the deck",
          message: err instanceof Error && err.message ? err.message : 'Check your connection and try again.',
        });
        setTemplate(prevTemplate);
      }
    } finally {
      setGenerating(false);
      setStreamProgress(null);
      // Always lift the overlay when generation ends. On success `done` already
      // lifted it at the verified moment; this covers error/abort/cap-cutoff so the
      // user is never stuck on the loader (they see the committed deck, or the
      // error modal + create surface if nothing committed).
      setOverlayUp(false);
      // If generation never reached `done` (error/abort), don't hang on the
      // loader — reveal whatever template state exists (incl. the error card).
      if (!generationDoneRef.current) setRevealReady(true);
    }
  };

  // TODO(cleanup): PARKED / UNUSED as of the attach-files feature (2026-06-22).
  // Source-mode attach now extracts raw text into fileContent and rides the
  // structured engine via handleGenerate (see the generate `try`), so this legacy
  // source-grounded build path is no longer called. Kept for reference; remove in a
  // dedicated cleanup commit (also drops the slides path's only caller of
  // /api/source-grounded/build).
  // Phase E branch: upload a binary source doc → grounded slide deck.
  // Same UX shell as handleGenerate but talks to /api/source-grounded/build.
  async function handleGenerateFromSource() {
    // Snapshot the deck BEFORE generation (see handleGenerate) so a failure
    // restores it rather than collapsing to a single error card.
    const prevTemplate = template;
    if (!fileBlob) return;
    // Honor the picked theme through generation; default to Mono Light when none
    // was picked (mirrors handleGenerate). setActiveTheme is async, so this
    // closure reads the local `themeForGeneration` rather than `activeTheme`.
    let themeForGeneration = activeTheme;
    if (!userPickedTheme) {
      themeForGeneration = getThemeById(DEFAULT_THEME_ID);
      setActiveTheme(themeForGeneration);
    }
    try {
      const fd = new FormData();
      fd.append('file', fileBlob);
      fd.append('theme', JSON.stringify(themeToTemplate(themeForGeneration)));
      fd.append('stream', 'true');
      if (prompt.trim()) fd.append('topic', prompt.trim());
      if (cardCount) fd.append('targetSlides', String(cardCount));

      const res = await fetch('/api/source-grounded/build', { method: 'POST', body: fd });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Source-grounded build failed' }));
        throw new Error(errBody.error || 'Source-grounded build failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();
      let buffer = '';
      let currentTheme = themeToTemplate(themeForGeneration);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const dataMatch = line.match(/^data: (.+)$/);
          if (!dataMatch) continue;
          try {
            const event = JSON.parse(dataMatch[1]);
            if (event.type === 'pipeline' && event.stage === 'blueprint-ready') {
              // Skeleton: title from deckTitle, one shell per slide with the
              // brief title (it doesn't have brief titles yet, just slide count).
              const skeletons = Array.from({ length: event.slideCount }, (_, i) => ({
                id: `card-shell-${i}`,
                layout: 'single' as const,
                style: 'default' as const,
                columns: [{ blocks: [
                  { type: 'paragraph' as const, content: '' },
                ] }],
              }));
              setTemplate({
                id: `streaming-src-${Date.now()}`,
                name: slugifyTopic(event.deckTitle || fileBlob.name),
                description: `Generated from ${fileBlob.name}`,
                category: 'source-grounded',
                thumbnail: '',
                theme: currentTheme,
                cards: skeletons,
              });
            } else if (event.type === 'card') {
              setTemplate(prev => {
                if (!prev) return prev;
                const newCards = [...prev.cards];
                // Bounds-guard (see the streaming-card handler above): a stray
                // cardIndex must not write past the skeleton array. `done`
                // re-delivers the full template, so skipping is lossless.
                if (event.cardIndex < 0 || event.cardIndex >= newCards.length) return prev;
                newCards[event.cardIndex] = event.card;
                return { ...prev, cards: newCards };
              });
              setStreamProgress({ cardIndex: event.cardIndex, total: event.total });
            } else if (event.type === 'done') {
              // Orchestrator picks the cover composition (Unit 4) — see
              // handleGenerate's `done` handler for the rationale.
              const themedSource: CardTemplate = { ...event.template, themeId: themeForGeneration.id };
              const { template: finalTemplate, coverResult } = composeGeneratedCover(
                templateToUnified(themedSource),
                themeForGeneration,
                autoImages,
              );
              const coverCard0 = finalTemplate.cards[0];
              setTemplate(finalTemplate);
              const idForSave = deckId ?? generateDeckId();
              saveDeck(idForSave, finalTemplate, { sourcePrompt: prompt });
              if (!deckId) {
                setDeckId(idForSave);
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.set('deck', idForSave);
                  window.history.replaceState({}, '', url);
                }
              }
              deckIdRef.current = idForSave;
              // Source path: cover image also gated on the auto-images toggle
              //.
              if (autoImages && coverCard0 && compositionWantsImage(coverResult.form)) {
                trackImage(placeCoverImage(
                  coverCard0.id,
                  coverResult,
                  themeForGeneration,
                  (prompt || finalTemplate.name || '').slice(0, 90),
                ));
              }
              generationDoneRef.current = true;
              revealTimerRef.current = setTimeout(() => setRevealReady(true), 35000);
              maybeReveal();
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message.length > 0 && !parseErr.message.startsWith('Unexpected')) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      console.error('Source-grounded generation failed:', err);
      // Centered error modal + restore the prior deck (see handleGenerate).
      setGenError({
        title: "Couldn't generate the deck",
        message: err instanceof Error && err.message ? err.message : "Couldn't build the deck from your file. Check the file and try again.",
      });
      setTemplate(prevTemplate);
    } finally {
      setGenerating(false);
      setStreamProgress(null);
      if (!generationDoneRef.current) setRevealReady(true);
    }
  }

  // Opening an existing deck — hold a neutral loader (NOT the create wizard,
  // NOT the "drafting" copy) until `template` hydrates one frame later. This is
  // what kills the half-second flash of the old generation page when clicking a
  // slide from the deck detail page.
  // Until mounted, render a neutral loader identical on server + first client
  // paint so the window-dependent guards below can't cause a hydration mismatch.
  if (!mounted) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(247,246,252,0.92)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Loader2 className="size-6 animate-spin" style={{ color: '#5037C3' }} />
      </div>
    );
  }

  if (pendingDeck && !template) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(247,246,252,0.92)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Loader2 className="size-6 animate-spin" style={{ color: '#5037C3' }} />
      </div>
    );
  }

  // Generation-failure dialog — surfaces the error in a CENTERED modal rather
  // than collapsing the deck to a cryptic 1-card "error" slide. Portals to
  // <body>, so it's included in every branch below and overlays whatever screen
  // is active (the restored prior deck, or the create surface on a fresh gen).
  const errorModal = (
    <Dialog open={!!genError} onOpenChange={(open) => { if (!open) setGenError(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{genError?.title}</DialogTitle>
          <DialogDescription>{genError?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setGenError(null)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Reveal gate (Decision A + typewriter). While `overlayUp` (from generate-start
  // until the judge's verified `done`) show ONLY the loading screen. The deck is
  // SAVED at fill-complete underneath for safety, but it does NOT render it here, so
  // the end user never sees the unverified deck AND the per-slide typewriter plays
  // FRESH the moment the overlay lifts (rather than uselessly under the overlay).
  // `pendingGen` covers the pre-generation mount before `overlayUp` is set.
  if (overlayUp || pendingGen) {
    return (
      <>
        <GoogleFonts fonts={getThemeFonts(activeTheme.id)} />
        <DraftingOverlay />
        {errorModal}
      </>
    );
  }

  if (template && revealReady) return (
    <>
      <GoogleFonts fonts={getThemeFonts(activeTheme.id)} />
      <DeckViewer
        template={template}
        streaming={generating}
        initialCard={initialCard ?? undefined}
        deckId={deckId ?? undefined}
        revealOnMount={stagedReveal}
        onNameChange={handleTitleChange}
      />
      {/* File ▸ Open — hidden picker for importing a .pptx as a new deck. */}
      <input
        ref={pptxInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        onChange={onPptxFileChosen}
        style={{ display: 'none' }}
      />
      {/* Hidden on screen; renders the deck full-size (faithful FreeformLayer)
          one card per page for a clean Print / Save-as-PDF. */}
      <SlideDeckPrint template={template} />
      {errorModal}
    </>
  );

  // New-deck modal mode (retires the legacy inline wizard): with no deck and
  // nothing generating, render only a calm backdrop — the global NewDeckModal
  // (auto-opened by the effect above) is the create surface. The original inline
  // wizard JSX below is kept intact but is no longer reached at runtime (the
  // guard catches every no-template case), so its locals stay type-valid.
  if (!template) {
    return (
      <>
        <GoogleFonts fonts={getThemeFonts(activeTheme.id)} />
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(247,246,252,0.92)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
        />
        {errorModal}
      </>
    );
  }

  const canProceed = prompt.trim().length > 0;

  // Load all theme fonts for previews. The Theme shape names them
  // titleFont/bodyFont, and each is a font-stack string — strip to the
  // primary family before passing to GoogleFonts.
  const stripStack = (s: string) => s.replace(/^['"]?([^,'"]+).*/, '$1').trim();
  const allFonts = [
    ...new Set(THEMES.flatMap((t) => [stripStack(t.titleFont), stripStack(t.bodyFont)])),
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '3rem 2rem',
      // Retired the standalone full-page creation screen: the create experience
      // is now a blurred dialog overlay, so generation never resolves to a bare
      // page (it shows drafting; failure reopens this dialog for retry).
      background: 'rgba(247,246,252,0.80)',
      backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <GoogleFonts fonts={allFonts} />
      <div style={{ height: '8vh', flexShrink: 0 }} />

      {/* Two-column shell — prompt column stays at 600px, the inline
          template gallery is widened to ~660px so a 3-column tile grid
          fits. Shell maxWidth bumped to 1320px to
          accommodate. On screens narrower than the total the gallery
          wraps below so the wizard remains usable on a laptop. */}
      <div style={{
        display: 'flex', gap: '2.5rem', alignItems: 'flex-start',
        justifyContent: 'center', width: '100%', maxWidth: '1320px',
        flexWrap: 'wrap',
      }}>

      <div style={{ maxWidth: '600px', width: '100%', flex: '0 1 600px' }}>

        {/* Title */}
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1a1f36', textAlign: 'center' }}>
          What would you like to create?
        </h1>
        <p style={{ fontSize: '1rem', color: '#697386', textAlign: 'center', marginTop: '0.375rem' }}>
          Type your topic, upload notes, or describe what you need
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {/* Inspire affordance — floats ABOVE the prompt card
              2026-05-21. The "Inspire Me" button is ALWAYS visible; when a
              framework is also picked, the framework name + slides-picked
              indicator sit alongside it so the user sees both at once.
              Clicking Inspire Me sends a topic through typewriteIntoPrompt
              and pulses the Generate button when ready. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleInspireMe}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.55rem 0.9rem', borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(107,63,160,0.08) 0%, rgba(139,92,246,0.13) 100%)',
                border: '1px solid rgba(107,63,160,0.22)',
                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                color: '#6B3FA0', fontFamily: 'inherit',
                transition: 'all 150ms ease',
                letterSpacing: '-0.01em',
              }}
            >
              <Sparkles size={13} style={{ opacity: 0.85 }} />
              Inspire Me
            </button>
            {framework && (
              <>
                {/* Selected-template chip — moved up next to Inspire Me per
                     so the user sees their selection alongside
                    the action. Replaces the prior plain caps label here AND
                    the duplicate full-width chip that used to live below the
                    Customize popover (deleted at the same time). */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.5rem 0.4rem 0.65rem', borderRadius: '10px',
                  background: 'rgba(107,63,160,0.06)',
                  border: '1px solid rgba(107,63,160,0.18)',
                }}>
                  <LayoutTemplate size={12} style={{ color: '#6B3FA0' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1a1f36', letterSpacing: '-0.01em' }}>
                    {framework.name}
                  </span>
                  <button type="button" onClick={() => setFramework(null)} aria-label="Clear template" style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '1px',
                    color: '#697386', display: 'flex', borderRadius: '4px',
                  }}>
                    <X size={11} />
                  </button>
                </div>
                {selectedLayouts.length > 0 && (
                  <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B3FA0' }}>
                    {selectedLayouts.length} slide{selectedLayouts.length === 1 ? '' : 's'} picked
                  </span>
                )}
              </>
            )}
          </div>

          {/* Prompt card — textarea + integrated bottom toolbar.
              Layout consolidated 2026-05-16: Upload / Slides stepper /
              Customize / Theme all live in the bottom row of this card so
              the wizard reads short and the Generate button stays above
              the fold. The card itself is the customizeRef anchor — the
              Customize popover positions absolutely below the card. */}
          {/* Framework inspire-topic suggestion cards — rendered ABOVE the
              prompt card. Replaces the prior chip/button
              row (rejected as poor UX). Up to 3 cards, equal width, lighter
              explanatory text. Clicking a card types its scenario into the
              prompt textarea via the existing typewriter animation. */}
          {framework && framework.inspireTopics.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(framework.inspireTopics.length, 3)}, minmax(0, 1fr))`,
                gap: '0.625rem',
              }}
            >
              {framework.inspireTopics.slice(0, 3).map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => typewriteIntoPrompt(topic)}
                  style={{
                    textAlign: 'left',
                    padding: '0.875rem 1rem',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.7)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: '#475569',
                    fontSize: '0.82rem',
                    fontWeight: 400,
                    lineHeight: 1.45,
                    transition: 'all 160ms ease',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(107,63,160,0.32)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(107,63,160,0.10)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.color = '#1a1f36';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.08)';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.04)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.color = '#475569';
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          )}

          <div ref={customizeRef} style={{ ...glassCard, padding: '1.25rem 1.5rem', position: 'relative' }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Paste your notes, outline, or describe what you'd like to create..."
              style={{
                width: '100%', minHeight: '100px', border: 'none', background: 'transparent',
                fontSize: '1rem', lineHeight: 1.6, color: '#1a1f36', outline: 'none', resize: 'none',
              }}
            />
            <div style={{
              borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '0.75rem', marginTop: '0.5rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
            }}>
              {/* Upload (text-light when empty, chip when filled). When a
                  file is present, the reference-upload mode pills appear
                  inline next to the chip so the user picks how the file
                  influences generation. */}
              {fileName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0.625rem', borderRadius: '8px', background: 'rgba(107,63,160,0.04)', border: '1px solid rgba(107,63,160,0.15)' }}>
                    <Upload size={14} style={{ color: '#6B3FA0' }} />
                    <span style={{ fontSize: '0.85rem', color: '#1a1f36', fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                    <button type="button" onClick={() => { setFileName(null); setFileContent(null); setFileBlob(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#697386', display: 'flex' }}><X size={14} /></button>
                  </div>
                  <div role="radiogroup" aria-label="How to use this file" style={{ display: 'inline-flex', padding: '2px', background: 'rgba(15, 23, 42, 0.05)', borderRadius: '8px' }}>
                    {([
                      { value: 'inspire', label: 'Inspire', desc: 'File influences theme + tone + audience. Content from your prompt.' },
                      { value: 'inspire-structure', label: 'Inspire + structure', desc: 'Above + borrow the outline shape of the reference.' },
                      { value: 'source', label: 'Use as source', desc: 'File content becomes the deck. Theme still adapts.' },
                    ] as const).map((opt) => {
                      const active = uploadMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          title={opt.desc}
                          onClick={() => setUploadMode(opt.value)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: 'none',
                            background: active ? '#ffffff' : 'transparent',
                            color: active ? '#6B3FA0' : '#475569',
                            fontSize: '0.78rem', fontWeight: active ? 600 : 500,
                            cursor: 'pointer', fontFamily: 'inherit',
                            boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
                            transition: 'all 150ms ease',
                          }}
                        >{opt.label}</button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.3rem 0.7rem 0.3rem 0.35rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(65, 152, 255, 0.22)',
                    background: 'linear-gradient(135deg, rgba(159, 199, 254, 0.18) 0%, rgba(65, 152, 255, 0.10) 100%)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.82rem', fontWeight: 600, color: '#1e40af',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(65, 152, 255, 0.45)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(65, 152, 255, 0.22)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(65, 152, 255, 0.22)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <span aria-hidden style={{
                    width: '22px', height: '22px', borderRadius: '6px',
                    background: 'linear-gradient(135deg, #4198FF 0%, #2563eb 100%)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 1px 3px rgba(65, 152, 255, 0.35)',
                  }}><Upload size={13} strokeWidth={2.4} /></span>
                  Upload
                </button>
              )}
              <input ref={fileRef} type="file" accept=".txt,.md,.doc,.docx,.pdf" style={{ display: 'none' }} onChange={handleFile} />

              {/* Push the right-side controls to the right */}
              <div style={{ flex: 1 }} />

              {/* Slides stepper — only when no framework is selected.
                  Slide count stepper — ALWAYS visible
                  so the user can adjust the count whether or not a framework
                  is picked. The framework chip below no longer carries a
                  duplicate count control. */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.2rem 0.5rem 0.2rem 0.625rem',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.5)',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(14px) saturate(1.05)',
                WebkitBackdropFilter: 'blur(14px) saturate(1.05)',
              }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1f36', marginRight: '0.2rem' }}>Slides</span>
                <button type="button" aria-label="Decrease slide count"
                  onClick={() => setCardCount(Math.max(3, cardCount - 1))}
                  style={stepperBtn}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >−</button>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1f36', minWidth: '1.1rem', textAlign: 'center' }}>
                  {cardCount}
                </span>
                <button type="button" aria-label="Increase slide count"
                  onClick={() => setCardCount(Math.min(15, cardCount + 1))}
                  style={stepperBtn}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >+</button>
              </div>

              {/* Auto-images toggle — opt-in (default OFF). Design spec
                  2026-05-30: a peer pill (wanted it visible in the
                  generation stage, not buried in Customize). OFF reads calm
                  (slate badge, glass pill) per P-UX10; ON gains the violet AI
                  accent + "· On" text + a check so the state never relies on
                  colour alone. role=switch, disabled during generation. */}
              <button
                type="button"
                role="switch"
                aria-checked={autoImages}
                aria-label="Auto-generate images during slide creation"
                aria-disabled={generating}
                disabled={generating}
                title="On: the AI picks the slides that need a picture and makes one for each. Uses AI credits."
                onClick={() => setAutoImages((v) => !v)}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.3rem 0.7rem 0.3rem 0.35rem',
                  borderRadius: '10px',
                  fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  opacity: generating ? 0.45 : 1,
                  transition: 'all 150ms ease',
                  border: autoImages ? '1px solid rgba(107, 63, 160, 0.45)' : '1px solid rgba(0, 0, 0, 0.06)',
                  background: autoImages
                    ? 'linear-gradient(135deg, rgba(167, 139, 250, 0.20) 0%, rgba(107, 63, 160, 0.14) 100%)'
                    : 'rgba(255, 255, 255, 0.5)',
                  backdropFilter: autoImages ? 'none' : 'blur(14px) saturate(1.05)',
                  WebkitBackdropFilter: autoImages ? 'none' : 'blur(14px) saturate(1.05)',
                  color: autoImages ? '#4a3270' : '#475569',
                }}
                onMouseEnter={(e) => {
                  if (generating) return;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  if (autoImages) {
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(107, 63, 160, 0.28)';
                  } else {
                    e.currentTarget.style.borderColor = 'rgba(107, 63, 160, 0.30)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(107, 63, 160, 0.18)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  if (!autoImages) e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.06)';
                }}
              >
                <span aria-hidden style={{
                  width: '22px', height: '22px', borderRadius: '6px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ffffff',
                  background: autoImages
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #6B3FA0 100%)'
                    : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                  boxShadow: autoImages ? '0 1px 3px rgba(107, 63, 160, 0.35)' : 'none',
                }}><ImagePlus size={13} strokeWidth={2.4} /></span>
                {autoImages ? 'Auto images · On' : 'Auto images'}
                {autoImages && <Check size={11} style={{ color: '#6B3FA0' }} />}
              </button>

              {/* Customize dropdown trigger — violet-tinted pill, badge icon. */}
              <button
                type="button"
                onClick={() => setCustomizeOpen((v) => !v)}
                aria-expanded={customizeOpen}
                aria-haspopup="menu"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.3rem 0.7rem 0.3rem 0.35rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(107, 63, 160, 0.22)',
                  background: customizeOpen
                    ? 'linear-gradient(135deg, rgba(167, 139, 250, 0.20) 0%, rgba(107, 63, 160, 0.14) 100%)'
                    : 'linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(107, 63, 160, 0.06) 100%)',
                  color: '#4a3270',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.82rem', fontWeight: 600,
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (customizeOpen) return;
                  e.currentTarget.style.borderColor = 'rgba(107, 63, 160, 0.45)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(107, 63, 160, 0.22)';
                }}
                onMouseLeave={(e) => {
                  if (customizeOpen) return;
                  e.currentTarget.style.borderColor = 'rgba(107, 63, 160, 0.22)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span aria-hidden style={{
                  width: '22px', height: '22px', borderRadius: '6px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6B3FA0 100%)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 1px 3px rgba(107, 63, 160, 0.35)',
                }}><Settings2 size={13} strokeWidth={2.4} /></span>
                Customize
                <ChevronDown size={11} style={{
                  color: '#6B3FA0',
                  transform: customizeOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 150ms ease',
                }} />
              </button>

              {/* Theme button — opens the full ThemesModal popup. Palette
                  icon in a multi-color badge
                  board with colors" reads more obviously as a look-and-
                  feel control than the previous swatch. */}
              <button
                type="button"
                onClick={() => setThemesModalOpen(true)}
                aria-label="Change theme"
                title={`Theme: ${activeTheme.name}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.3rem 0.7rem 0.3rem 0.35rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(226, 103, 228, 0.22)',
                  background: 'linear-gradient(135deg, rgba(226, 103, 228, 0.10) 0%, rgba(159, 199, 254, 0.10) 50%, rgba(65, 152, 255, 0.10) 100%)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.82rem', fontWeight: 600, color: '#4a3270',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(226, 103, 228, 0.45)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(226, 103, 228, 0.20)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(226, 103, 228, 0.22)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Palette icon inside a multi-color gradient badge — pink
                    → lavender → sky → blue (kit gradient). The icon itself
                    is white, so the badge's gradient carries the "many
                    colors to choose from" signal. */}
                <span aria-hidden style={{
                  width: '22px', height: '22px', borderRadius: '6px',
                  background: 'linear-gradient(135deg, #F0A8F2 0%, #E267E4 30%, #9FC7FE 65%, #4198FF 100%)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 1px 3px rgba(226, 103, 228, 0.35)',
                }}><Palette size={13} strokeWidth={2.4} /></span>
                Theme
                <ChevronDown size={11} style={{ color: '#6B3FA0' }} />
              </button>
            </div>

            {/* Customize popover — anchored to the prompt card, drops below.
                Solid white surface (no glass blur)
                see-through look made the row labels hard to read against the
                lavender wash. */}
            {customizeOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                  zIndex: 30,
                  borderRadius: '16px',
                  background: '#ffffff',
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  boxShadow: '0 20px 48px rgba(15, 23, 42, 0.12)',
                  overflow: 'hidden',
                  animation: 'customizeOpen 180ms ease-out',
                }}
              >
                <CustomizeRow
                  icon={<Users size={15} strokeWidth={2.2} />}
                  iconBadgeColor="linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)"
                  label="Audience"
                  currentValue={audience}
                  placeholder="Select or type custom"
                  isExpanded={customizeExpanded === 'audience'}
                  onToggle={() => setCustomizeExpanded(customizeExpanded === 'audience' ? null : 'audience')}
                >
                  <PresetGrid
                    presets={[...suggestedAudiences, ...AUDIENCE_PRESETS.filter(p => !suggestedAudiences.includes(p))]}
                    selected={audience}
                    onSelect={setAudience}
                    customLabel="Describe who this is for"
                    onCustomChange={setAudience}
                  />
                </CustomizeRow>

                <CustomizeRow
                  icon={<Palette size={15} strokeWidth={2.2} />}
                  iconBadgeColor="linear-gradient(135deg, #f472b6 0%, #E267E4 100%)"
                  label="Tone"
                  currentValue={tone}
                  placeholder="Select or type custom"
                  isExpanded={customizeExpanded === 'tone'}
                  onToggle={() => setCustomizeExpanded(customizeExpanded === 'tone' ? null : 'tone')}
                >
                  <PresetGrid
                    presets={[...suggestedTones, ...TONE_PRESETS.filter(p => !suggestedTones.includes(p))]}
                    selected={tone}
                    onSelect={setTone}
                    customLabel="Describe the tone"
                    onCustomChange={setTone}
                  />
                </CustomizeRow>

                <CustomizeRow
                  icon={<Sparkles size={15} strokeWidth={2.2} />}
                  iconBadgeColor="linear-gradient(135deg, #a78bfa 0%, #6B3FA0 100%)"
                  label="Detail level"
                  currentValue={density}
                  placeholder=""
                  isExpanded={customizeExpanded === 'detail'}
                  onToggle={() => setCustomizeExpanded(customizeExpanded === 'detail' ? null : 'detail')}
                >
                  <div style={{ display: 'flex', gap: '8px', padding: '4px 0' }}>
                    {/* Icon is a slide outline with N text lines — visually
                        depicts the slide's content density. */}
                    {([
                      { id: 'concise', label: 'Concise', lines: 2 },
                      { id: 'detailed', label: 'Detailed', lines: 4 },
                      { id: 'extensive', label: 'Extensive', lines: 6 },
                    ] as { id: Density; label: string; lines: number }[]).map(({ id, label, lines }) => {
                      const active = density === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDensity(id)}
                          style={{
                            flex: 1,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: active ? '1px solid #6B3FA0' : '1px solid rgba(15, 23, 42, 0.10)',
                            background: active ? '#6B3FA0' : '#ffffff',
                            color: active ? 'white' : '#475569',
                            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 150ms ease',
                            fontFamily: 'inherit',
                          }}
                        >
                          <DocumentDensityIcon lines={lines} size={22} />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </CustomizeRow>

                {/* Voice — Phase 1 of Invisible AI PRD. Sets the Skill that
                    drives Generate-stage prose voice (Persuasive / Legal /
                    Executive / etc.). Templates pre-pick a default; this row
                    is the override surface. "Default" = use the framework's
                    chosen Skill; "No voice" = explicit generic generation. */}
                <CustomizeRow
                  icon={<Mic2 size={15} strokeWidth={2.2} />}
                  iconBadgeColor="linear-gradient(135deg, #34d399 0%, #059669 100%)"
                  label="Voice"
                  currentValue={
                    hasPickedVoice
                      ? (skillOverride === null ? 'No voice' : DOCUMENT_SKILLS.find((s) => s.id === skillOverride)?.label ?? '')
                      : (framework?.defaultSkillId
                          ? `${DOCUMENT_SKILLS.find((s) => s.id === framework.defaultSkillId)?.label} (default)`
                          : 'Default')
                  }
                  placeholder="Default"
                  isExpanded={customizeExpanded === 'voice'}
                  onToggle={() => setCustomizeExpanded(customizeExpanded === 'voice' ? null : 'voice')}
                  isLast={!!fileBlob}
                >
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 0',
                  }}>
                    {/* "Default" chip — clears the override, framework default wins again */}
                    <button
                      type="button"
                      onClick={() => { setHasPickedVoice(false); setSkillOverride(null); }}
                      style={voiceChipStyle(!hasPickedVoice)}
                    >
                      Default
                    </button>
                    {DOCUMENT_SKILLS.map((s) => {
                      const active = hasPickedVoice && skillOverride === s.id;
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          title={s.description}
                          onClick={() => { setHasPickedVoice(true); setSkillOverride(s.id); }}
                          style={voiceChipStyle(active)}
                        >
                          <Icon size={12} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                          {s.label}
                        </button>
                      );
                    })}
                    {/* Explicit "no voice" — force null override, generic
                        generation. Useful for users who want a totally neutral
                        baseline even when a template would have picked one. */}
                    <button
                      type="button"
                      onClick={() => { setHasPickedVoice(true); setSkillOverride(null); }}
                      style={voiceChipStyle(hasPickedVoice && skillOverride === null)}
                    >
                      No voice
                    </button>
                  </div>
                </CustomizeRow>

                {/* Rewrite intensity — Phase 1 of Invisible AI PRD.
                    Mirrors the reference-upload toggle pattern. Most users
                    leave on Inspire (today's behavior). Power users with
                    their own draft can opt down to Build or Verbatim so
                    AI doesn't rewrite their prose.
                    Hidden when a reference file is uploaded — the reference
                    toggle (Inspire / Inspire+structure / Use as source)
                    shown next to the file chip serves the same purpose and
                    showing both at once was duplicate UI (UAT-flagged
                    2026-05-24). */}
                {!fileBlob && <CustomizeRow
                  icon={<Pencil size={15} strokeWidth={2.2} />}
                  iconBadgeColor="linear-gradient(135deg, #fb923c 0%, #ea580c 100%)"
                  label="How to treat my text"
                  currentValue={
                    rewriteIntensity === 'inspire' ? 'Inspire from this' :
                    rewriteIntensity === 'build' ? 'Build on this' :
                    'Use as the text'
                  }
                  placeholder="Inspire from this"
                  isExpanded={customizeExpanded === 'intensity'}
                  onToggle={() => setCustomizeExpanded(customizeExpanded === 'intensity' ? null : 'intensity')}
                  isLast
                >
                  <div style={{ display: 'flex', gap: '8px', padding: '4px 0' }}>
                    {([
                      { id: 'inspire',  label: 'Inspire from this', sub: 'AI writes freely from my intent' },
                      { id: 'build',    label: 'Build on this',     sub: 'Keep my key phrases, AI fills the rest' },
                      { id: 'verbatim', label: 'Use as the text',   sub: "Don't paraphrase, just structure it" },
                    ] as { id: typeof rewriteIntensity; label: string; sub: string }[]).map(({ id, label, sub }) => {
                      const active = rewriteIntensity === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setRewriteIntensity(id)}
                          title={sub}
                          style={{
                            flex: 1,
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: active ? '1px solid #ea580c' : '1px solid rgba(15, 23, 42, 0.10)',
                            background: active ? 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)' : '#ffffff',
                            color: active ? '#ffffff' : '#475569',
                            fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 150ms ease',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                            lineHeight: 1.2,
                          }}
                        >
                          <span>{label}</span>
                          <span style={{
                            fontSize: '0.66rem', fontWeight: 400,
                            color: active ? 'rgba(255,255,255,0.85)' : '#94a3b8',
                          }}>{sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </CustomizeRow>}
              </div>
            )}
          </div>

          {/* Framework inspire-topic chips moved INSIDE the prompt card above
              the textarea (2026-05-22). The full-width framework-selected
              chip that used to live here is also gone — the chip now sits
              next to the Inspire Me button at the top of the column. The
              only thing kept below the card is the "Use suggested template"
              prompt-driven affordance for the no-framework case. */}
          {!framework && suggested && prompt.trim().length > 5 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button type="button" onClick={() => setFramework(suggested)} style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.5rem 0.75rem', borderRadius: '8px',
                background: 'rgba(107,63,160,0.04)', border: '1px solid rgba(107,63,160,0.12)',
                cursor: 'pointer', fontSize: '0.8rem', color: '#6B3FA0', fontWeight: 500,
              }}>
                <Sparkles size={12} /> Use {suggested.name} template
              </button>
            </div>
          )}

          {/* Old standalone Customize toolbar + inline Theme grid were
              here before 2026-05-16. Both consolidated into the prompt
              card's bottom toolbar above (Slides stepper, Customize
              popover, Theme button). The Theme button now opens the
              existing ThemesModal so users get the big theme preview
               liked rather than the cramped inline tiles. */}
        </div>

        {/* Generate */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '1.5rem' }}>
          <button
            type="button"
            disabled={generating || !canProceed}
            onClick={handleGenerate}
            data-attention={generateAttention && canProceed && !generating ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontSize: '1rem', fontWeight: 600, color: 'white',
              background: !generating && canProceed ? 'linear-gradient(135deg, #6B3FA0, #8B5CF6)' : 'rgba(0,0,0,0.12)',
              border: 'none', borderRadius: '12px', padding: '0.875rem 2rem',
              cursor: !generating && canProceed ? 'pointer' : 'not-allowed', minHeight: '48px',
              transition: 'all 200ms ease',
              boxShadow: !generating && canProceed ? '0 2px 12px rgba(107,63,160,0.25)' : 'none',
              animation: generateAttention && canProceed && !generating
                ? 'generateAttention 0.7s ease-in-out 2'
                : undefined,
            }}
          >
            {generating ? (
              <><Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} /> {streamProgress ? `Card ${streamProgress.cardIndex + 1} of ${streamProgress.total}...` : 'Starting...'}</>
            ) : (
              <><Sparkles style={{ width: '18px', height: '18px' }} /> Generate</>
            )}
          </button>
        </div>
      </div>

      {/* ── Right column — inline image-tile template gallery ──────────────
          Tile sizing/styling matches the home CreateModal verbatim per
           same padding (16px), border radius (14px),
          thumbnail radius (10px), label/description/cardCount font sizes.
          Same data source (FRAMEWORKS) and same Slides sub-filter chips.
          Sticky so it stays in view while the left column scrolls. */}
      <aside style={{
        width: '660px', maxWidth: '100%', flex: '0 1 660px',
        position: 'sticky', top: '2rem',
        background: 'white', borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,40,0.06)',
        border: '1px solid rgba(0,0,0,0.04)',
        padding: '20px 24px',
        maxHeight: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column',
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '16px' }}>
          Templates
        </h3>

        {/* Sub-filter chips — All / Business / Education / Personal */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {(['all', ...CATEGORIES.map((c) => c.id)] as ('all' | FrameworkCategory)[]).map((id) => {
            const label = id === 'all' ? 'All' : CATEGORIES.find((c) => c.id === id)?.label || id;
            const active = galleryFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setGalleryFilter(id)}
                style={{
                  padding: '5px 12px', borderRadius: '8px',
                  border: active ? '1px solid #6B3FA0' : '1px solid rgba(0,0,0,0.08)',
                  background: active ? '#6B3FA0' : 'white',
                  color: active ? 'white' : '#475569',
                  fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Tile grid — same minmax(180px, 1fr) pattern as CreateModal.
            Paginated below; this grid only renders the current page. */}
        {(() => {
          const filtered = galleryFilter === 'all'
            ? FRAMEWORKS
            : FRAMEWORKS.filter((f) => f.category === galleryFilter);
          const totalPages = Math.max(1, Math.ceil(filtered.length / GALLERY_PAGE_SIZE));
          const safePage = Math.min(galleryPage, totalPages);
          const pageStart = (safePage - 1) * GALLERY_PAGE_SIZE;
          const pageItems = filtered.slice(pageStart, pageStart + GALLERY_PAGE_SIZE);
          return (
        <>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px',
          paddingRight: '4px',
        }}>
          {pageItems.map((fw) => {
            const isSelected = framework?.id === fw.id;
            const accent = '#6B3FA0';
            return (
              <div
                key={fw.id}
                role="button"
                tabIndex={0}
                onClick={() => setFramework(fw)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFramework(fw); } }}
                style={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  padding: '16px', borderRadius: '14px',
                  border: isSelected ? '2px solid #6B3FA0' : '1px solid rgba(0,0,0,0.06)',
                  background: 'white', cursor: 'pointer', textAlign: 'left',
                  transition: 'all 200ms ease', fontFamily: 'inherit',
                  boxShadow: isSelected ? '0 0 0 3px rgba(107,63,160,0.1)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (isSelected) return;
                  e.currentTarget.style.borderColor = accent + '40';
                  e.currentTarget.style.boxShadow = `0 4px 16px ${accent}15`;
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  if (isSelected) return;
                  e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Pencil icon — opens the layout customization modal for
                    this template. Click also selects the framework so the
                    user doesn't have to do it separately. stopPropagation
                    keeps the outer tile click from firing twice. */}
                <button
                  type="button"
                  aria-label={`Customize layouts for ${fw.name}`}
                  title="Pick which slide types to include"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFramework(fw);
                    setCustomizeLayoutsFor(fw);
                  }}
                  style={{
                    position: 'absolute', top: '10px', right: '10px',
                    width: '28px', height: '28px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.95)',
                    border: '1px solid rgba(107,63,160,0.18)',
                    borderRadius: '8px',
                    color: '#6B3FA0', cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
                    transition: 'all 150ms ease',
                    zIndex: 2,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#6B3FA0';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.95)';
                    e.currentTarget.style.color = '#6B3FA0';
                  }}
                >
                  <Pencil size={13} />
                </button>
                {/* Thumbnail — inline SVG infographic preview. */}
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  width: '100%', aspectRatio: '4/3', borderRadius: '10px',
                  border: `1px solid ${accent}15`,
                  display: 'flex',
                }}>
                  <FrameworkThumbnail layout={fw.thumbnailLayout} category={fw.category} />
                </div>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>{fw.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>{fw.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination — chevron + dots + chevron. Dots stay light-weight for
            the at-a-glance "where am I" cue; chevrons flank them so users
            can advance one page at a time without aiming at a tiny target. */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: '10px', paddingTop: '16px', marginTop: 'auto',
          }}>
            <button
              type="button"
              onClick={() => setGalleryPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label="Previous page"
              style={{
                width: '28px', height: '28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: safePage === 1 ? '#cbd5e1' : '#475569',
                cursor: safePage === 1 ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: '1.1rem', lineHeight: 1,
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (safePage !== 1) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >‹</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const active = p === safePage;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setGalleryPage(p)}
                    aria-label={`Page ${p} of ${totalPages}`}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      width: active ? '24px' : '8px',
                      height: '8px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '999px',
                      background: active ? '#6B3FA0' : 'rgba(15, 23, 42, 0.16)',
                      cursor: 'pointer',
                      transition: 'all 180ms ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.32)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.16)';
                    }}
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setGalleryPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label="Next page"
              style={{
                width: '28px', height: '28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: safePage === totalPages ? '#cbd5e1' : '#475569',
                cursor: safePage === totalPages ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: '1.1rem', lineHeight: 1,
                transition: 'background 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (safePage !== totalPages) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >›</button>
          </div>
        )}
        </>
        ); })()}
      </aside>

      </div>{/* /two-column shell */}

      {/* FrameworkModal removed 2026-05-16 — the right-column gallery is
          the only template picker now. */}

      {/* "More details" entry point on the step-2 theme picker. Same modal
          the Theme button in the editor toolbar opens — single source of
          truth for theme selection. */}
      <ThemesModal
        open={themesModalOpen}
        onClose={() => setThemesModalOpen(false)}
        activeThemeId={activeTheme.id}
        onApply={(t) => { setActiveTheme(t); setUserPickedTheme(true); }}
      />

      {/* Layout customization modal — opens when the user clicks the pencil
          on a template tile. Shows the generic-shape layout picker for that
          template. Selections persist to selectedLayouts state and drive
          the next generation.. */}
      {customizeLayoutsFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Customize layouts for ${customizeLayoutsFor.name}`}
          onClick={() => setCustomizeLayoutsFor(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            animation: 'modalFadeIn 180ms ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff', borderRadius: '16px',
              width: '720px', maxWidth: '100%',
              maxHeight: '90vh', overflow: 'auto',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
              padding: '24px',
              position: 'relative',
            }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setCustomizeLayoutsFor(null)}
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none', borderRadius: '8px',
                cursor: 'pointer', color: '#64748b',
                transition: 'background 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={16} />
            </button>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: '0 0 4px' }}>
              Customize {customizeLayoutsFor.name}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#697386', margin: '0 0 18px' }}>
              Pick which slide types to include. Each layout becomes one slide. Your slide count adjusts to fit.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
              {LAYOUT_PICKS.map((lp) => {
                const active = selectedLayouts.includes(lp.id);
                return (
                  <button
                    key={lp.id}
                    type="button"
                    onClick={() => {
                      setSelectedLayouts((prev) =>
                        active ? prev.filter((id) => id !== lp.id) : [...prev, lp.id],
                      );
                    }}
                    title={lp.desc}
                    aria-pressed={active}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: '6px',
                      padding: '10px',
                      borderRadius: '10px',
                      border: active ? '1.5px solid #6B3FA0' : '1px solid rgba(107,63,160,0.18)',
                      background: active
                        ? 'linear-gradient(135deg, rgba(107,63,160,0.10) 0%, rgba(139,92,246,0.16) 100%)'
                        : 'white',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 150ms ease',
                      boxShadow: active ? '0 2px 8px rgba(107,63,160,0.18)' : 'none',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.borderColor = 'rgba(107,63,160,0.40)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.borderColor = 'rgba(107,63,160,0.18)';
                    }}
                  >
                    {active && (
                      <span aria-hidden style={{
                        position: 'absolute', top: '5px', right: '5px',
                        width: '16px', height: '16px', borderRadius: '50%',
                        background: '#6B3FA0', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700,
                      }}>✓</span>
                    )}
                    <div style={{
                      width: '100%', aspectRatio: '16/9',
                      borderRadius: '6px', overflow: 'hidden',
                      background: '#ffffff',
                      border: '1px solid rgba(15, 23, 42, 0.08)',
                      display: 'flex',
                    }}>
                      <LayoutPreview kind={lp.id} />
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: active ? '#4a3270' : '#1a1f36', textAlign: 'center' }}>
                      {lp.label}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '18px',
            }}>
              <span style={{ fontSize: '0.82rem', color: '#697386' }}>
                {selectedLayouts.length === 0
                  ? 'No layouts picked — AI chooses the mix.'
                  : selectedLayouts.length === 1
                    ? '1 layout picked.'
                    : `${selectedLayouts.length} layouts picked.`}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedLayouts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLayouts([])}
                    style={{
                      padding: '8px 14px', borderRadius: '8px',
                      background: 'transparent',
                      border: '1px solid rgba(0,0,0,0.10)',
                      color: '#475569', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit',
                    }}
                  >Clear</button>
                )}
                <button
                  type="button"
                  onClick={() => setCustomizeLayoutsFor(null)}
                  style={{
                    padding: '8px 18px', borderRadius: '8px',
                    background: '#6B3FA0', border: 'none',
                    color: '#fff', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                    boxShadow: '0 1px 4px rgba(107,63,160,0.30)',
                  }}
                >Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes customizeOpen {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowExpand {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        /* Generate-button attention pulse — fires twice after the inspire
           typewriter finishes so the user notices the deck is ready to go.
           Scale + glow grow at the midpoint, then settle back. */
        @keyframes generateAttention {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 2px 12px rgba(107,63,160,0.25);
          }
          50% {
            transform: scale(1.045);
            box-shadow: 0 6px 24px rgba(107,63,160,0.55), 0 0 0 4px rgba(107,63,160,0.18);
          }
        }
        input:focus { border-color: #6B3FA0 !important; }
        textarea::placeholder, input::placeholder { color: #a0aec0; }
        @media (prefers-reduced-motion: reduce) {
          [data-attention] { animation: none !important; }
        }
      `}</style>

    </div>
  );
}
