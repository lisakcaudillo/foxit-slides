/**
 * Design Intelligence Layer — recipe catalog + archetype tables.
 *
 * Implements §4 (recipe catalog) and §5 (theme → archetype map) of
 * `docs/requirements/design-intelligence-layer-spec.md`, plus the
 * imageRole → existing-placement reconcile table from §3.
 *
 * All data — tunable without code changes (§14 risk mitigation: budgets are
 * data in this file).
 */

import type {
  ImageRole,
  ImagePlacement,
  ThemeArchetype,
  SlideRole,
} from './design-types';

// ── imageRole → existing IMAGE_PLACEMENTS reconcile (§3) ──────────────────────
// So the realizer / client placement reuses the current image pipeline.
// `behind` reflects whether the image sits behind the text (z=0) per the
// existing autoImageBox semantics.
export interface PlacementResolution {
  placement: ImagePlacement;
  /** True when the image goes behind the text (full-bleed / texture / wash). */
  behind: boolean;
  /** Treatment hint for the realizer (scrim, opacity, recolor, wash). */
  treatment: 'scrim' | 'none' | 'texture' | 'duotone' | 'wash';
}

/** Map a design-level imageRole to a concrete placement + treatment. The
 *  `archetype` parameter only affects `column` (editorial/product lean left;
 *  cinematic/warm lean right) — everything else is archetype-independent. */
export function resolveImageRole(
  imageRole: ImageRole,
  archetype: ThemeArchetype,
): PlacementResolution | null {
  switch (imageRole) {
    case 'full-bleed':
      return { placement: 'hero', behind: true, treatment: 'scrim' };
    case 'column': {
      // Archetype bias: editorial/product anchor the image left; cinematic/
      // warm anchor right. Keeps the same content reading differently per
      // theme (Phase 2 leans on this further).
      const left = archetype === 'editorial' || archetype === 'product';
      return { placement: left ? 'left' : 'right', behind: false, treatment: 'none' };
    }
    case 'band':
      return { placement: 'top', behind: false, treatment: 'none' };
    case 'texture':
      return { placement: 'background', behind: true, treatment: 'texture' };
    case 'duotone':
      return { placement: 'hero', behind: true, treatment: 'duotone' };
    case 'background':
      return { placement: 'background', behind: true, treatment: 'wash' };
    case 'none':
    default:
      return null;
  }
}

// ── Archetype tables (§5) ─────────────────────────────────────────────────────
// Each archetype supplies image-role weights (bias). Recipe-retirement (a), S3b:
// the per-archetype `recipeWhitelist` is retired with the recipe layer; the
// archetype now contributes only its image-role bias.
// Phase 2 (wired): all 42 themes are hand-tagged with `archetype` in
// themes.ts, carried onto the runtime TemplateTheme via themeToTemplate, and
// read by the deck planner (index.ts). DEFAULT_ARCHETYPE stays as the
// defensive fallback for any theme that somehow lacks the field. See spec §5.
export const DEFAULT_ARCHETYPE: ThemeArchetype = 'product';

export interface ArchetypeProfile {
  archetype: ThemeArchetype;
  /** Image roles this archetype prefers, in priority order. Always includes
   *  'none' so type-only slides remain first-class. */
  imageRoleBias: ImageRole[];
}

export const ARCHETYPE_PROFILES: Record<ThemeArchetype, ArchetypeProfile> = {
  editorial: {
    archetype: 'editorial',
    imageRoleBias: ['none', 'column', 'band', 'texture'],
  },
  cinematic: {
    archetype: 'cinematic',
    imageRoleBias: ['full-bleed', 'texture', 'none', 'duotone'],
  },
  warm: {
    archetype: 'warm',
    imageRoleBias: ['band', 'column', 'duotone', 'none'],
  },
  product: {
    archetype: 'product',
    imageRoleBias: ['column', 'none', 'duotone', 'band'],
  },
};

export function getArchetypeProfile(archetype: ThemeArchetype): ArchetypeProfile {
  return ARCHETYPE_PROFILES[archetype] ?? ARCHETYPE_PROFILES[DEFAULT_ARCHETYPE];
}

// ── Slide role inference helper ───────────────────────────────────────────────
// Maps a card's position + blockTemplate to a slide role. Pure + deterministic.
export function inferSlideRole(
  index: number,
  total: number,
  blockTemplate: string | undefined,
): SlideRole {
  if (index === 0) return 'cover';
  if (index === total - 1) return 'close';
  switch (blockTemplate) {
    case 'key-metric-trio':
    case 'key-metric-quad':
    case 'grid-2x2':
      return 'stats';
    case 'comparison-2col':
    case 'features-grid':
      return 'evidence';
    case 'process-horizontal':
    case 'timeline':
    case 'agenda':
      return 'context';
    case 'quote-pull':
      return 'point';
    default:
      return 'point';
  }
}
