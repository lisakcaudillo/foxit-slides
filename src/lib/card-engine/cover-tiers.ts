/**
 * Cover Tier system — theme-distinct title/cover slides.
 *
 * Implements the approved "tiered hybrid" cover direction
 * ( + the Manager recommendation
 * prototype). Every theme's cover (slide 0) is auto-assigned one of three
 * tiers from the theme's own identity; the user can swap. The old flat
 * gradient cover (pageBg-only, same shape for all 42 themes) is gone.
 *
 *   • photo — full-bleed mood-matched image + theme-colored scrim + title.
 *             For dramatic dark/branded themes an image amplifies.
 *   • split — image panel beside a type panel. For corporate/data themes
 *             where type must stay crisp; image adds warmth without fighting.
 *   • type  — NO imagery. The theme's pageBg + pattern + fonts + an oversized
 *             gradient-clipped title + a corner motif (CoverArt). This is also
 *             the GUARANTEED FALLBACK: when no image is available/needed the
 *             cover falls back to `type`, NEVER to the deleted flat gradient
 *             and NEVER to a broken image box.
 *
 * Tier → imageRole reconcile (so the existing image pipeline + scrim +
 * imageAwareBounds + contrast all work unchanged):
 *   photo → 'full-bleed'  (image behind text, scrim + forced legible title)
 *   split → 'column'      (image in its own half, text in the complement)
 *   type  → 'none'        (no image; corner motif only)
 *
 * This module is DATA + pure functions only — no React, no SDK, no deps.
 * Phase 2 (full 42-theme archetype tagging) is a separate task; the per-theme
 * map below is the minimal data this cover feature needs and intentionally
 * does not block on it.
 */

import type { Theme } from '@/components/themes/types';
import type { ImageRole } from './design-types';

export const COVER_TIERS = ['photo', 'split', 'type'] as const;
export type CoverTier = (typeof COVER_TIERS)[number];

/**
 * Explicit per-theme overrides for the named examples in the spec's tier
 * table. Anything NOT listed here falls through to `deriveCoverTier` below.
 * Keep this list small — it's for themes whose right tier isn't obvious from
 * (category, tone, titleStyle) alone.
 */
const THEME_COVER_TIER: Readonly<Record<string, CoverTier>> = {
  // Photo full-bleed — dramatic dark/branded themes a real image amplifies.
  volt: 'photo',
  obsidian: 'photo',
  velvet: 'photo',
  'midnight-index': 'photo',
  'signal-punch': 'photo',
  quill: 'photo',
  voltage: 'photo',

  // Split editorial — corporate/data-heavy themes where type must stay crisp.
  aperture: 'split',
  tide: 'split',
  cobalt: 'split',
  'foxit-glow': 'split',
  quartz: 'split',
  strata: 'split',
  mist: 'split',
  'slate-plane': 'split',
  polaris: 'split',

  // Typographic stage — themes whose pattern + font ARE the identity.
  counsel: 'type',
  ledger: 'type',
  schoolbook: 'type',
  vellum: 'type',
  souvenir: 'type',
  apartamento: 'type',
};

/**
 * Derive a cover tier from a theme's identity when it isn't in the explicit
 * map. Data-driven so new themes get a sensible default without code changes:
 *
 *   - Dark + (branded | creative) → photo. Cinematic/branded dark themes beg
 *     for a full-bleed image.
 *   - Business (corporate/data) → split. Type must stay crisp; an image panel
 *     adds warmth without overlapping the words.
 *   - Legal, or a light theme with a strong page pattern (ruled/marbled paper)
 *     → type. The pattern + font carry the identity; imagery dilutes it.
 *   - Everything else → type (the safe, never-breaks baseline).
 */
function deriveCoverTier(theme: Theme): CoverTier {
  if (theme.category === 'legal') return 'type';
  if (theme.tone === 'dark' && (theme.category === 'branded' || theme.category === 'creative')) {
    return 'photo';
  }
  if (theme.category === 'business') return 'split';
  // Light creative/branded themes with a meaningful page pattern read best as
  // typographic stages; otherwise split gives them an image without risk.
  if (theme.pagePattern) return 'type';
  return 'split';
}

/** The auto-picked cover tier for a theme. Pure + deterministic. */
export function coverTierForTheme(theme: Theme): CoverTier {
  return THEME_COVER_TIER[theme.id] ?? deriveCoverTier(theme);
}

/** Tier → the design-layer imageRole the cover uses, so all existing image
 *  placement / scrim / contrast / text-bounds logic applies unchanged. */
export function coverTierImageRole(tier: CoverTier): ImageRole {
  switch (tier) {
    case 'photo':
      return 'full-bleed';
    case 'split':
      return 'column';
    case 'type':
    default:
      return 'none';
  }
}

/** Cycle to the next tier (used by the one-click swap affordance). Order:
 *  photo → split → type → photo. */
export function nextCoverTier(tier: CoverTier): CoverTier {
  const i = COVER_TIERS.indexOf(tier);
  return COVER_TIERS[(i + 1) % COVER_TIERS.length];
}

/** True when the tier wants a real image (photo / split). `type` does not. */
export function coverTierWantsImage(tier: CoverTier): boolean {
  return tier === 'photo' || tier === 'split';
}
