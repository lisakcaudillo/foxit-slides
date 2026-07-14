/**
 * density.ts — the Detail-level → content-budget scale.
 *
 * Part of the slide design system (the single source of truth for generation
 * rules). The user's "Detail level" control (concise | detailed | extensive)
 * decides how much body copy a slide carries. Each level is a MULTIPLIER on top
 * of the per-recipe base budget — so a stat slide stays tighter than a text
 * slide at the same level (the recipe sets the base; detail lifts the curve).
 *
 * Calibrated 2026-06-10 with. Before this, the engine hardcoded the
 * per-recipe bases (≈8–28 body words) and IGNORED the Detail control entirely
 * (`generateCardTemplate` accepted `density` and never read it) — freezing an
 * ultra-concise preference as the universal rule. Now:
 *   - `concise`   = the old per-recipe bases (the lean FLOOR, not the only mode)
 *   - `detailed`  = DEFAULT — lifts the curve well above the old frozen caps
 *   - `extensive` = restores paragraph-length captions
 */

export type Density = 'concise' | 'detailed' | 'extensive';

export const DEFAULT_DENSITY: Density = 'detailed';

/** Word-budget multiplier per detail level. */
export const DENSITY_MULTIPLIER: Record<Density, number> = {
  concise: 1.0,
  detailed: 1.75,
  extensive: 2.5,
};

/** Detail-level FLOOR as a fraction of the (scaled) body ceiling. Turns Detail
 *  from a ceiling-only hint — which gpt-4o satisfies by writing terse — into a
 *  real depth floor: a 'detailed' prose body must reach ~half its ceiling.
 *  `concise` has no floor (terse is the whole point of concise). */
export const DENSITY_FLOOR_FRACTION: Record<Density, number> = {
  concise: 0,
  detailed: 0.45,
  extensive: 0.55,
};

/** Coerce any inbound value — including the legacy `'balanced'` route default
 *  and `undefined` — to a valid Density, defaulting to `detailed`. */
export function resolveDensity(value: unknown): Density {
  return value === 'concise' || value === 'detailed' || value === 'extensive'
    ? value
    : DEFAULT_DENSITY;
}

/**
 * Scale a content budget's WORD caps by the detail level. Only verbosity caps
 * scale (`bodyMaxWords`, `itemMaxWords`); structural caps — `headingMaxWords`,
 * item/bullet/stat COUNTS, `maxItems` — are left untouched. Detail makes each
 * line fuller, not the title longer or the grid bigger. Non-destructive:
 * returns a new object; unknown keys pass through unchanged.
 */
export function scaleBudgetForDensity<T extends Record<string, unknown>>(
  budget: T | null | undefined,
  density: unknown,
): T {
  const base = { ...(budget ?? {}) } as Record<string, unknown>;
  const d = resolveDensity(density);
  const factor = DENSITY_MULTIPLIER[d];
  if (factor !== 1) {
    for (const key of ['bodyMaxWords', 'itemMaxWords'] as const) {
      const v = base[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        base[key] = Math.round(v * factor);
      }
    }
  }
  // Depth FLOOR (bodyMinWords): a fraction of the SCALED body ceiling, so
  // 'detailed'/'extensive' compel fuller bodies instead of merely permitting
  // them. Read by checkCardQuality's under-depth check + injected into the
  // writer prompt. Only set when there's a body ceiling and a non-zero fraction.
  const frac = DENSITY_FLOOR_FRACTION[d];
  const scaledBody = base.bodyMaxWords;
  if (frac > 0 && typeof scaledBody === 'number' && Number.isFinite(scaledBody)) {
    base.bodyMinWords = Math.round(scaledBody * frac);
  }
  return base as T;
}
