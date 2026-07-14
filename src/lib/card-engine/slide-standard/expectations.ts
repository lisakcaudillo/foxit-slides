/**
 * expectations.ts — the calibrated design-system EXPECTATIONS, rendered for the
 * writer prompt and the judge rubric.
 *
 * `SLIDE_PRINCIPLES` (examples.ts) is the full corpus of Lisa's votes — content,
 * layout, AND pure-visual rules. The writer and the text judge can only act on
 * the CONTENT/WRITING-relevant ones (a text model can't place a glass panel or
 * draw a curved divide — those are renderer concerns). This module selects that
 * subset ONCE, by principle id, so the two sides share one definition and stay
 * in sync with the calibration: edit a principle in examples.ts and both the
 * writer and the judge move with it.
 *
 * Pure-visual principles (curved-divide, glass-columns, pattern-*, top-tier-
 * styling, signature-asset-reuse, etc.) are intentionally EXCLUDED here — they
 * belong to the renderer / future VLM visual gate, not the text stage.
 */

import { SLIDE_PRINCIPLES } from './examples';

/** Content/writing-relevant principle ids — the ones a text writer and a text
 *  judge can actually honor and grade. Curated from SLIDE_PRINCIPLES. */
const CONTENT_PRINCIPLE_IDS: readonly string[] = [
  'story-punchline',
  'title-not-subtitle',
  'no-leading-article',
  'tight-titles-no-filler',
  'title-subtitle-harmony',
  'cover-complete',
  'specific-labels',
  'abbreviate-large-numbers',
  'clearest-metric-unit',
  'support-adds-new-info',
  'state-what-it-is',
  'no-repetitive-filler',
  'no-jargon',
  'hierarchy-key-element-stands-out',
  'no-awkward-wrap',
  'simple-is-a-valid-tier',
];

/** The selected content principles, in the curated order. */
export const CONTENT_PRINCIPLES = CONTENT_PRINCIPLE_IDS
  .map((id) => SLIDE_PRINCIPLES.find((p) => p.id === id))
  .filter((p): p is (typeof SLIDE_PRINCIPLES)[number] => Boolean(p));

/** Render the expectations as a prompt block. `voice` shapes the framing:
 *  - 'writer' → imperative ("Write to this standard").
 *  - 'judge'  → evaluative ("Hold the slide to this standard"). */
export function designStandardBlock(voice: 'writer' | 'judge'): string {
  const header =
    voice === 'writer'
      ? 'DESIGN STANDARD — write every slide to this calibrated bar (these are the house rules a top-tier deck follows):'
      : 'DESIGN STANDARD — also hold the slide to these calibrated expectations; flag any it clearly breaks:';
  const lines = CONTENT_PRINCIPLES.map((p) => `- ${p.rule}`);
  return [header, ...lines].join('\n');
}
