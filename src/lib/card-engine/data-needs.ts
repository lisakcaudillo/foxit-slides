// ── deriveDataNeeds — turn the deck plan's figure-hungry slides into questions ──
//
// Increment 2 of the Clarify → Orchestrator refactor.
// See docs/requirements/clarify-orchestrator-refactor-spec.md.
//
// The grounding gate (index.ts guards + enforce.ts + the judge `grounded`
// dimension) keeps emitting fill-in prompts ("Your team's bug-rate data here")
// because the topic supplied no numbers. Lisa's insight (2026-06-10): those
// fill-in prompts are EXACTLY the questionnaire — they should be collected up
// front, not rendered as holes. This function reads the planned slides and
// lists the figures the deck wants, so Clarify can ASK for them.
//
// Pure + defensive: no AI calls, never throws on a malformed plan. Output is
// ORDERED by priority (the recipes that force fabrication hardest come first)
// so a magic-first caller can take just the top few — the upfront form must
// stay light (Lisa's standing rule), so this lists candidates, it does not
// mandate a heavy questionnaire.

import type { DeckPlan } from './design-types';
import type { CardBlueprint } from './types';

/** One figure the deck wants — surfaced as an optional Clarify question instead
 *  of a rendered fill-in placeholder. The SAME information the grounding gate
 *  would otherwise leave as a hole. */
export interface DataNeed {
  /** Stable id, unique within the deck (`${slideId}-{kind}-{n}`). */
  id: string;
  /** Conversational question label (Lisa's microcopy rule — human, not
   *  corporate). */
  label: string;
  /** Example/hint for the field — what a good answer looks like. */
  placeholder: string;
  /** Which slide this figure feeds, for grouping/context in the modal. */
  slideTitle: string;
}

/** blockTemplates that demand real numbers — each cell forces an invented figure
 *  when the topic carries none. Value = how many figures the slide wants.
 *  Recipe-retirement (a), S3a: re-keyed from recipe → blockTemplate (the metric
 *  templates that the old stat-trio/stat-grid/image-plus-stats recipes mapped to). */
const NUMERIC_BLOCKTEMPLATES: Record<string, number> = {
  'key-metric-trio': 3,
  'key-metric-quad': 4,
  'grid-2x2': 4,
};

/**
 * Derive the deck's figure needs from its plan. Ordered by priority:
 *   1. numeric recipes (stat-trio / stat-grid / image-plus-stats) — hardest to
 *      fake, so asked first;
 *   2. comparison recipes (compare-2col) — the two sides' figures;
 *   3. sequence recipes (process-row) — durations/dates, lowest priority
 *      (often qualitative, so genuinely optional).
 *
 * @param deckPlan The plan from `planDeckTemplate` (its slides align 1:1 with
 *                 `blueprint.cards` — planDeck only returns a plan when the
 *                 counts match).
 * @param blueprint Supplies each slide's title (the plan carries slideId, not
 *                  the title).
 */
export function deriveDataNeeds(deckPlan: DeckPlan, blueprint: CardBlueprint): DataNeed[] {
  const numeric: DataNeed[] = [];
  const comparison: DataNeed[] = [];
  const sequence: DataNeed[] = [];

  deckPlan.slides.forEach((slide, i) => {
    // Slides align 1:1 with cards; fall back to slideId if a title is missing.
    const card = blueprint.cards[i];
    const title = card?.title?.trim() || slide.slideId;
    const blockTemplate = card?.blockTemplate;

    const numericCount = blockTemplate ? NUMERIC_BLOCKTEMPLATES[blockTemplate] : undefined;
    if (numericCount) {
      const n = numericCount;
      for (let k = 0; k < n; k++) {
        numeric.push({
          id: `${slide.slideId}-stat-${k + 1}`,
          label:
            n === 1
              ? `A real number for "${title}"`
              : `Key number ${k + 1} of ${n} for "${title}"`,
          placeholder: 'e.g. 42% growth, $1.2M, 3x faster',
          slideTitle: title,
        });
      }
      return;
    }

    if (blockTemplate === 'comparison-2col') {
      comparison.push(
        {
          id: `${slide.slideId}-compare-a`,
          label: `One side's figure for "${title}"`,
          placeholder: 'e.g. before: 12 hrs/week',
          slideTitle: title,
        },
        {
          id: `${slide.slideId}-compare-b`,
          label: `The other side's figure for "${title}"`,
          placeholder: 'e.g. after: 2 hrs/week',
          slideTitle: title,
        },
      );
      return;
    }

    if (blockTemplate === 'process-horizontal' || blockTemplate === 'timeline') {
      sequence.push({
        id: `${slide.slideId}-duration`,
        label: `Roughly how long does "${title}" take? (optional)`,
        placeholder: 'e.g. 6 weeks, Q1–Q3, 3 phases',
        slideTitle: title,
      });
    }
  });

  return [...numeric, ...comparison, ...sequence];
}
