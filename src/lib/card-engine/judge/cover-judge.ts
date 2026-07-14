/**
 * judge/cover-judge.ts — the OBSERVE-ONLY cover Judge (P2). PURE.
 *
 * Evaluates the cover Designer's decision + blocks against the design standard and
 * returns PASS/FAIL + reasoning + a recommendation — FOR THE REVIEW LOG ONLY. It
 * does NOT act: no relayout, no guideline change. This is the deterministic,
 * no-pixels ancestor of the real VLM judge (P5); it checks the structure +
 * geometry the rules can verify without rendering, so its reasoning can be
 * reviewed before any feedback loop is wired.
 *
 * Pure: no fs / React / SDK. The caller records the verdict via design-log.
 */
import type { FreeformBlock } from '@/types/card-template';

export interface CoverJudgeInput {
  title: string;
  blocks: FreeformBlock[];
  /** The Designer's one-line decision (context for the log). */
  decision: string;
}

export interface CoverJudgeResult {
  result: 'PASS' | 'FAIL';
  reasoning: string;
  recommendation: string;
}

type TextLike = FreeformBlock & { style?: { fontSize?: number }; variant?: string };
const fontSizeOf = (b: TextLike): number => b.style?.fontSize ?? 0;

/**
 * Deterministic cover check. Each rule traces a standard:
 *   - one dominant title (title is the largest text)            [DESIGN_STANDARD.title]
 *   - subtitle never eclipses the title                         [subtitleNeverEclipsesTitle]
 *   - all elements within the card bounds                       [lock-the-box]
 *   - no body / bullets on a cover                              [COVER_TREATMENT antiPatterns]
 *   - title doesn't lead with an article                        [noLeadingArticle]
 */
export function judgeCover(input: CoverJudgeInput): CoverJudgeResult {
  const text = input.blocks.filter((b) => b.type === 'text') as TextLike[];
  const fails: string[] = [];
  const recs: string[] = [];

  const title = text.find((b) => b.id === 'cv-title');
  if (!title) {
    fails.push('no title block');
    recs.push('Emit one dominant title — a cover must have it.');
  } else {
    const biggest = Math.max(...text.map(fontSizeOf));
    if (fontSizeOf(title) < biggest) {
      fails.push('title is not the largest text');
      recs.push('Size the title above every other element — it is the hero.');
    }
    const sub = text.find((b) => b.id === 'cv-sub');
    if (sub && fontSizeOf(sub) >= fontSizeOf(title)) {
      fails.push('subtitle eclipses the title');
      recs.push('Drop the subtitle size below the title.');
    }
  }

  for (const b of input.blocks) {
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > 100.5 || b.y + b.h > 100.5) {
      fails.push(`block ${b.id} is out of bounds`);
      recs.push(`Keep ${b.id} inside the card (lock its box to the slot).`);
    }
  }

  const body = text.find((b) => b.variant === 'paragraph' && b.id !== 'cv-sub');
  if (body) {
    fails.push('body/bullet text on the cover');
    recs.push('Covers carry no body or bullets — move that to an interior slide.');
  }

  if (/^(the|a|an)\s/i.test(input.title.trim())) {
    fails.push('title leads with an article');
    recs.push('Drop the leading "The/A/An" — start on the strong word.');
  }

  // A cover is NOT approved as a bare title — it must carry the editorial
  // treatment (eyebrow + subtitle).
  const hasEyebrow = text.some((b) => b.id === 'cv-eyebrow');
  const hasSub = text.some((b) => b.id === 'cv-sub');
  if (title && (!hasEyebrow || !hasSub)) {
    const missing = [!hasEyebrow && 'eyebrow', !hasSub && 'subtitle'].filter(Boolean).join(' + ');
    fails.push(`bare cover — missing ${missing}`);
    recs.push('A cover is not approved as a bare title — add an eyebrow + a one-line subtitle (the editorial treatment).');
  }

  const pass = fails.length === 0;
  return {
    result: pass ? 'PASS' : 'FAIL',
    reasoning: pass
      ? 'Meets the cover standard: one dominant title, subtitle subordinate, all elements within bounds, no body/bullets.'
      : `Standard violations: ${fails.join('; ')}.`,
    recommendation: pass ? '' : recs.join(' '),
  };
}
