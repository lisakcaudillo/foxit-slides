/**
 * Design Intelligence Layer — Planning Orchestrator: deck-category planning.
 *
 * Implements the front of §1 of `docs/requirements/dil-planning-orchestrator-spec.md`:
 *   classify → domain skill → count-aware packing → (draft category plan)
 *
 * This is the deterministic backbone the generation flow and Clarify call to
 * answer "what slides should this deck have, at the chosen length?". It composes
 * two existing, grounded pieces — no parallel taxonomy:
 *   1. TEMPLATE RESOLUTION (the "domain skill" key, per locked decision §8.3):
 *      the wizard template the user picked IS the domain signal. When none was
 *      picked (organic prompt), `suggestFramework` maps the prompt to the best
 *      fit. The chosen framework's priority-ranked steps ARE the category list.
 *   2. COUNT-AWARE PACKING (`packing.ts`): fit those categories to the user's
 *      slide count, with the honest under/over-budget notice.
 *
 * Pure + deterministic. The AI ADAPTATION layer (a hand-authored per-template
 * expert `plan()` that tailors categories to the actual material + emits
 * plan-gap clarify questions, spec §2/§4) lands as a later unit ON TOP of this
 * seam — this module is its deterministic floor and fallback.
 */

import type { Framework } from '@/data/frameworks';
import { FRAMEWORKS, suggestFramework } from '@/data/frameworks';
import { packFrameworkToCount } from './packing';
import type { PackResult } from './packing';

/** How the framework was chosen — provenance for UI + telemetry. */
export type FrameworkSource = 'explicit' | 'detected' | 'default';

export interface ResolvedFramework {
  framework: Framework;
  source: FrameworkSource;
}

const DEFAULT_FRAMEWORK_ID = 'product-launch';

/** Resolve the framework (domain skill key) from an explicit pick or the prompt.
 *  Never throws, never returns null — falls back to a sensible default so the
 *  planner always has a category vocabulary to work from. */
export function resolveFramework(opts: { frameworkId?: string; prompt?: string }): ResolvedFramework {
  // 1. Explicit wizard pick wins (the user told us the domain).
  if (opts.frameworkId) {
    const explicit = FRAMEWORKS.find((f) => f.id === opts.frameworkId);
    if (explicit) return { framework: explicit, source: 'explicit' };
  }
  // 2. Organic prompt → detect best-fit template.
  if (opts.prompt && opts.prompt.trim()) {
    const detected = suggestFramework(opts.prompt);
    if (detected) return { framework: detected, source: 'detected' };
  }
  // 3. Ultimate fallback.
  const fallback =
    FRAMEWORKS.find((f) => f.id === DEFAULT_FRAMEWORK_ID) ?? FRAMEWORKS[0];
  return { framework: fallback, source: 'default' };
}

/** The deterministic draft category plan for a deck. */
export interface DeckCategoryPlan {
  framework: Framework;
  /** How the framework was chosen. */
  source: FrameworkSource;
  /** The count-aware packing result (selected steps + priorities + notice). */
  pack: PackResult;
  /** Convenience: the ordered slide-category titles (the draft slide list). */
  categories: string[];
}

/**
 * Produce the deterministic draft category plan: which slides the deck should
 * have, in priority order, fit to the chosen count, with an honest notice when
 * the count constrained coverage.
 *
 * @param opts.frameworkId Explicit wizard template id, if the user picked one.
 * @param opts.prompt      The user's prompt — used to detect a template when no
 *                         explicit pick was made.
 * @param opts.count       The user's selected slide count.
 */
export function planDeckCategories(opts: {
  frameworkId?: string;
  prompt?: string;
  count: number;
}): DeckCategoryPlan {
  const { framework, source } = resolveFramework(opts);
  const pack = packFrameworkToCount(framework, opts.count);
  return {
    framework,
    source,
    pack,
    categories: pack.steps.map((s) => s.title),
  };
}
