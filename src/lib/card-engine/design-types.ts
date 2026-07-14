/**
 * Design Intelligence Layer — Phase 1 contracts.
 *
 * Implements §3 of `docs/requirements/design-intelligence-layer-spec.md`.
 *
 * These types are ADDITIVE to the existing card-engine. They reference the
 * existing `BlockTemplate` / `IMAGE_PLACEMENTS` enums — no type-contract fork.
 *
 * The unifying idea (§1 of the spec): content shape and image role are ONE
 * decision (the "composition recipe"), not two bolted-together choices. A
 * recipe simultaneously fixes the content budget (word/bullet/stat caps) AND
 * the image role + text-safe zone.
 *
 * Phase 1 ships §3 (contracts), §4 (recipe catalog), §6 (deck planner), §7
 * (budget-aware realizer integration) and the imageRole→placement reconcile
 * table. Phase 2 (per-theme archetypes across 42 themes) and Phase 3 (critique
 * loop) are deliberately NOT implemented here.
 */

import { z } from 'zod';
import type { BlockTemplate } from './types';
import { IMAGE_PLACEMENTS } from './types';

// ── Theme archetype ────────────────────────────────────────────────────────
// Four buckets that drive image-role bias + recipe whitelist + type rules.
// Phase 2 will hand-assign all 42 themes to one of these; Phase 1 uses a
// single default archetype (see recipes.ts DEFAULT_ARCHETYPE).
export const THEME_ARCHETYPES = ['editorial', 'cinematic', 'warm', 'product'] as const;
export type ThemeArchetype = (typeof THEME_ARCHETYPES)[number];

export const ThemeArchetypeSchema = z.enum(THEME_ARCHETYPES);

// ── Image role ─────────────────────────────────────────────────────────────
// The design-level decision about imagery — richer than the current
// placement enum. `none` is a first-class role (about half of a pro deck is
// type-only).
export const IMAGE_ROLES = [
  'none',        // type-only slide
  'full-bleed',  // image fills; scrim creates a type safe-zone
  'column',      // image anchors one half; text the other
  'band',        // thin top/side strip; content below
  'texture',     // ~18-25% opacity behind type
  'duotone',     // image recolored to two theme stops
  'background',  // full-canvas low-contrast wash
] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

export const ImageRoleSchema = z.enum(IMAGE_ROLES);

// ── Existing placement enum (re-exported for reconcile consumers) ───────────
export type ImagePlacement = (typeof IMAGE_PLACEMENTS)[number];

// Recipe-retirement (a), S3b: the `RECIPES` list, the `Recipe` type,
// `RecipeSchema`, and `RecipeRequirement` are retired. Recipe no longer drives
// layout (B2b), budget (S2 → budgetForTemplate), or image roles (S2 → the
// blockTemplate design table). `ContentBudget` survives as the generic
// per-slide content-budget shape (no longer recipe-derived; renamed from
// `RecipeContentBudget` in S3b).

/** Hard caps the generator must respect — the per-slide content budget. */
export interface ContentBudget {
  headingMaxWords: number;
  bodyMaxWords: number;
  bullets?: number;
  stats?: number;
}

export type TextSafeZone = 'full' | 'left' | 'right' | 'lower-third' | 'corner' | 'none' | 'center';

// Recipe-retirement (a), S3b: `RecipeDef` (the recipe-catalog entry shape) retired
// with `RECIPE_CATALOG`.

// ── Slide role ───────────────────────────────────────────────────────────────
export const SLIDE_ROLES = ['cover', 'point', 'evidence', 'stats', 'context', 'close'] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];

// ── Cover tier (slide 0 only) ──────────────────────────────────────────────
// The title/cover treatment a cover slide uses. See lib/card-engine/
// cover-tiers.ts for the theme→tier decision + the imageRole reconcile.
export const COVER_TIERS = ['photo', 'split', 'type'] as const;
export type CoverTier = (typeof COVER_TIERS)[number];

// ── Title treatment (slide 0 only) ─────────────────────────────────────────
// The type-only grammar of the cover — the THIRD cover axis, independent of
// Theme (look) and CoverTier (composition). See lib/card-engine/
// title-treatments.ts for the catalog, per-treatment spec, and the
// theme→treatment selector. Duplicated here as its own const (mirrors
// COVER_TIERS) so this contract carries no cross-module import.
export const TITLE_TREATMENTS = [
  'anchor',
  'drop-cap',
  'chapter-divider',
  'numbered-index',
  'ledger-folio',
  'all-caps-masthead',
  'centered-colophon',
  'statement',
  'stacked-baseline',
  'sunrise-wash',
  'stacked-poster',
] as const;
export type TitleTreatment = (typeof TITLE_TREATMENTS)[number];

// ── Composition form (cover slide image+title structure) ────────────────────
// The DYNAMIC composition axis (approved design table 2026-06-05; see
// lib/card-engine/composition.ts + app/public/design-table/title-treatments/
// composition-designer-2.html). Where CoverTier (photo|split|type) is the
// coarse theme-derived tier, a CompositionForm is the fine, image-AWARE
// decision the engine makes when a cover image exists: it places the image in
// a specific form and seats the title in the region OPPOSITE it. Each form
// reconciles to one CoverTier + ImageRole so the existing image pipeline,
// scrim, and contrast guarantees apply unchanged. Additive — does not alter
// CoverTier or TitleTreatment.
export const COMPOSITION_FORMS = [
  'vertical-half',      // image one half, title the opposite column
  'diagonal-split',     // clip-path slash; title in the open triangle
  'band-image-top',     // image top band, title below
  'band-image-bottom',  // image bottom band, title above
  'full-bleed-overlay', // image fills; title overlaid on a brightness-tuned scrim
  'type-only',          // no image — the guaranteed fallback
] as const;
export type CompositionForm = (typeof COMPOSITION_FORMS)[number];

// Where the title block sits — always computed OPPOSITE the image so the two
// never fight for the same region.
export const TITLE_POSITIONS = [
  'left-column',
  'right-column',
  'top-band',
  'bottom-band',
  'bottom-overlay',
  'centered-overlay',
] as const;
export type TitlePosition = (typeof TITLE_POSITIONS)[number];

// ── Per-slide design decision ────────────────────────────────────────────────
export interface SlideDesign {
  slideId: string;
  role: SlideRole;
  imageRole: ImageRole;
  contentBudget: ContentBudget;
  textSafeZone: TextSafeZone;
  themeArchetype: ThemeArchetype;
  /** Override tracking (CHI P4 provenance). 'auto' = planner picked it. */
  source: 'auto' | 'user';
  /** Cover slides only — the title/cover treatment. Absent on non-cover
   *  slides. Auto-picked from the theme identity, overridable via the
   *  per-slide "Try different cover" swap. */
  coverTier?: CoverTier;
  /** Cover slides only — the type-only title treatment (third cover axis,
   *  independent of theme + coverTier). Auto-picked via
   *  titleTreatmentForTheme(), overridable via the "Try a different title"
   *  swap. Absent on non-cover slides + on decks generated before this axis. */
  titleTreatment?: TitleTreatment;
  /** Cover slides only — the dynamic image+title composition form. Picked by
   *  selectComposition() from image + theme + headline signals (or restricted
   *  to a user-chosen allowed set), overridable per slide. Absent when no
   *  cover image exists (the cover falls back to coverTier/titleTreatment on
   *  the type-only stage). See lib/card-engine/composition.ts. */
  compositionForm?: CompositionForm;
  /** Cover slides only — where the title block sits, computed opposite the
   *  image region. Pairs with compositionForm. */
  titlePosition?: TitlePosition;
}

/** Zod schema for SlideDesign — used where the design crosses the API/AI
 *  boundary (the design rides on the card output sent to the client). */
export const SlideDesignSchema = z.object({
  slideId: z.string(),
  role: z.enum(SLIDE_ROLES),
  imageRole: ImageRoleSchema,
  contentBudget: z.object({
    headingMaxWords: z.number(),
    bodyMaxWords: z.number(),
    bullets: z.number().optional(),
    stats: z.number().optional(),
  }),
  textSafeZone: z.enum(['full', 'left', 'right', 'lower-third', 'corner', 'none', 'center']),
  themeArchetype: ThemeArchetypeSchema,
  source: z.enum(['auto', 'user']),
  coverTier: z.enum(COVER_TIERS).optional(),
  titleTreatment: z.enum(TITLE_TREATMENTS).optional(),
  compositionForm: z.enum(COMPOSITION_FORMS).optional(),
  titlePosition: z.enum(TITLE_POSITIONS).optional(),
});

// ── Deck-level plan ──────────────────────────────────────────────────────────
export interface DeckPlan {
  themeId: string;
  themeArchetype: ThemeArchetype;
  slides: SlideDesign[];
  /** Visual-weight target per slide (heavy at ends, rising/falling middle). */
  weightCurve: number[];
}
