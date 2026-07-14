/**
 * Design Intelligence Layer — Expertise phase: expert registry + entry point.
 *
 * `planWithExpertise(ctx)` is the single call the generation flow makes to get a
 * tailored, industry-aware plan. It:
 *   1. selects the hand-authored expert for the resolved template, if one exists;
 *   2. runs it (one AI call) and returns its Zod-validated ExpertPlan;
 *   3. falls back to a deterministic ExpertPlan synthesized from the packing
 *      baseline when there's no expert OR the AI call fails/times out.
 *
 * The result shape is uniform either way, so downstream (generation prompt,
 * planner layout hints, clarify plan-gaps) doesn't branch on whether an expert
 * ran. The expert is pure upside; the deck is never worse than today.
 */

import type { ExpertContext, ExpertPlan, ExpertCategory, PlanGap, TemplateExpert } from './types';
import { productLaunchExpert } from './product-launch';
import { intentClarify } from './intent-clarify';

/** Registry of hand-authored template experts, keyed by framework id. */
const EXPERTS: Record<string, TemplateExpert> = {
  [productLaunchExpert.templateId]: productLaunchExpert,
  // Next: sales-pitch, quarterly-review, … (spec §8 step 5).
};

/** Whether a hand-authored expert exists for a template. */
export function hasExpert(templateId: string): boolean {
  return templateId in EXPERTS;
}

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'slide'}-${index}`;
}

/**
 * Synthesize an ExpertPlan from the deterministic packing baseline. Used as the
 * fallback and for templates without a hand-authored expert. Carries the generic
 * category purpose forward as guidance so the generation prompt still gets a
 * per-slide instruction (just not industry-tailored).
 */
export function baselineToExpertPlan(ctx: ExpertContext): ExpertPlan {
  const { baseline } = ctx;
  const categories: ExpertCategory[] = baseline.pack.packed.map((p, i) => ({
    id: slugify(p.step.title, i),
    title: p.step.title,
    priority: p.priority,
    purpose: p.step.purpose,
    guidance: p.step.purpose,
    origin: 'template',
  }));

  return {
    templateId: baseline.framework.id,
    categories,
    unknowns: [],
  };
}

/**
 * Run the expertise phase. Returns a tailored ExpertPlan when an expert exists
 * and succeeds; otherwise the deterministic baseline plan. Never throws.
 */
export async function planWithExpertise(ctx: ExpertContext): Promise<ExpertPlan> {
  const templateId = ctx.baseline.framework.id;
  const expert = EXPERTS[templateId];
  if (!expert) return baselineToExpertPlan(ctx);

  try {
    const plan = await expert.plan(ctx);
    // Defensive: an expert that returned an empty category set is unusable —
    // fall back rather than ship a contentless deck.
    if (!plan.categories || plan.categories.length === 0) {
      return baselineToExpertPlan(ctx);
    }
    return plan;
  } catch {
    return baselineToExpertPlan(ctx);
  }
}

/** Below this, treat the deck as "doesn't clearly fit an industry/topic" and
 *  ask intent questions instead of relying on the expert's content gaps. */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Confidence-gated clarify (spec §4,. Decides what to ask
 * BEFORE generation, scaled to how confidently the deck was placed:
 *   - CONFIDENT (a matched expert with industryConfidence ≥ threshold) → ask the
 *     expert's targeted CONTENT-GAP questions (e.g. "which compliance certs?").
 *   - LOW / NO MATCH → ask INTENT questions (format/elements, artifact/use, goal)
 *     via `intentClarify`, which itself returns nothing when the prompt already
 *     implies format + goal (empty-state stays the success state).
 * Returns at most 3 questions; never throws. The route applies its own finer cap.
 */
export async function planClarify(ctx: ExpertContext): Promise<PlanGap[]> {
  const plan = await planWithExpertise(ctx);
  const confident =
    !!plan.detectedIndustry && (plan.industryConfidence ?? 0) >= CONFIDENCE_THRESHOLD;

  let questions: PlanGap[];
  if (confident) {
    questions = (plan.unknowns ?? []).filter((q) => q.leverage >= 0.6);
  } else {
    try {
      questions = await intentClarify({
        subject: ctx.subject,
        count: ctx.count,
        audience: ctx.audience,
        tone: ctx.tone,
      });
    } catch {
      questions = [];
    }
  }
  return questions.slice(0, 3);
}
