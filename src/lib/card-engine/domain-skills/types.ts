/**
 * Design Intelligence Layer — Expertise phase contracts.
 *
 * Implements §4 of `docs/requirements/dil-expertise-phase-spec.md`.
 *
 * The expertise phase is ONE expert pass per template whose output conditions
 * three downstream layers:
 *   - STRUCTURE  → tailored category list (feeds packing.ts)
 *   - SUBSTANCE  → per-slide guidance/proof (feeds the generation prompt)
 *   - LAYOUT     → per-slide recipe hint (feeds the planner's recipe scoring)
 * plus UNKNOWNS → plan-gap clarify questions.
 *
 * Industry is a REASONING INPUT to the hand-authored per-template expert, not a
 * template×industry matrix (locked decision, Lisa 2026-06-03).
 *
 * `ExpertPlan` crosses the AI boundary, so it carries a Zod schema. Additive —
 * forks no existing contract.
 */

import { z } from 'zod';
import type { DeckCategoryPlan } from '../deck-planning';

// ── Plan-gap clarify question (orchestrator spec §2/§4) ─────────────────────
// A question the expert needs answered to plan well. Becomes the clarify
// "plan-gap" lens. `suggestionKind` controls how AI suggestions render under the
// field: 'starter' = real example answers; 'format-hint' = format only (used for
// data/number questions so we never propose fabricated figures — FR11).
export const PlanGapSchema = z.object({
  question: z.string(),
  type: z.enum(['text', 'select']),
  options: z.array(z.string()).optional(),
  leverage: z.number(),
  affects: z.array(z.string()).default([]),
  /** AI-suggested starter answers shown as chips under an open-ended field.
   *  Context-aware; the user can click one or type their own ("Other…"). For
   *  data/number questions use `suggestionKind: 'format-hint'` so the chips are
   *  format examples, never fabricated values (FR11). */
  suggestions: z.array(z.string()).optional(),
  suggestionKind: z.enum(['starter', 'format-hint']).optional(),
});
export type PlanGap = z.infer<typeof PlanGapSchema>;

// ── Category priority (mirrors packing.StepPriority) ────────────────────────
export const CategoryPrioritySchema = z.enum(['must', 'should', 'nice']);
export type CategoryPriority = z.infer<typeof CategoryPrioritySchema>;

// ── A single category in the expert's tailored plan ─────────────────────────
export const ExpertCategorySchema = z.object({
  /** Stable id for override / merge tracking. */
  id: z.string(),
  /** Slide-type label, tailored to the subject. */
  title: z.string(),
  /** must (never dropped) | should | nice. */
  priority: CategoryPrioritySchema,
  /** What this slide is, tailored to subject/industry. */
  purpose: z.string(),
  /** SUBSTANCE — what it must accomplish for THIS subject/industry. Threads
   *  into the per-slide generation prompt. */
  guidance: z.string(),
  /** The KIND of proof/evidence that matters here. FR11-safe: names the proof
   *  type (e.g. "% who saw improvement"), never an invented figure. */
  proof: z.string().optional(),
  /** LAYOUT — a hint to the planner's recipe pick. Lenient string: a Recipe or
   *  BlockTemplate name; an unrecognized hint is ignored downstream. */
  layoutHint: z.string().optional(),
  /** Recipe gating signal. */
  requires: z.enum(['numbers', 'comparison', 'sequence']).optional(),
  /** Category ids this can fuse with under count pressure (packing §3). */
  canMergeWith: z.array(z.string()).optional(),
  /** May expand into multiple slides when the budget allows. */
  canSplit: z.boolean().optional(),
  /** Provenance vs the generic framework. */
  origin: z.enum(['template', 'added', 'reframed']),
});
export type ExpertCategory = z.infer<typeof ExpertCategorySchema>;

// ── Output of one expert pass ───────────────────────────────────────────────
export const ExpertPlanSchema = z.object({
  templateId: z.string(),
  /** The expert's read of the industry/domain from the material. */
  detectedIndustry: z.string().optional(),
  industryConfidence: z.number().optional(),
  /** The tailored, priority-ranked category list. */
  categories: z.array(ExpertCategorySchema),
  /** Detail the expert needs → plan-gap clarify lens. */
  unknowns: z.array(PlanGapSchema).default([]),
  /** 1-2 lines, for provenance/transparency (CHI P4). */
  rationale: z.string().optional(),
});
export type ExpertPlan = z.infer<typeof ExpertPlanSchema>;

// ── Expert input ────────────────────────────────────────────────────────────
export interface ExpertContext {
  /** The user's prompt, or text extracted from an upload. */
  subject: string;
  /** Selected slide count. */
  count: number;
  audience?: string;
  goal?: string;
  tone?: string;
  /** The deterministic packing result (units 1-2) — starting point + floor. */
  baseline: DeckCategoryPlan;
  /** Optional industry-guidance notes for the detected industry, when authored. */
  industryNotes?: string;
}

// ── A hand-authored template expert ─────────────────────────────────────────
export interface TemplateExpert {
  /** Matches a framework id (e.g. 'product-launch'). */
  templateId: string;
  /** One structured AI call (via the provider abstraction) returning a
   *  Zod-validated ExpertPlan. Throws on failure — the registry falls back to
   *  the deterministic baseline. */
  plan: (ctx: ExpertContext) => Promise<ExpertPlan>;
}
