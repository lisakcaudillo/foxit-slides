/**
 * Design Intelligence Layer — Planning Orchestrator: count-aware packing.
 *
 * Respects the user's count + notice; never silently truncates a must.
 *
 * The wizard frameworks (`app/src/data/frameworks.ts`) already encode, per
 * template, a priority-ranked category list:
 *   - tier `required`    → priority `must`   (never dropped)
 *   - tier `recommended` → priority `should`
 *   - tier `optional`    → priority `nice`
 * with declared order acting as the fine-grained rank inside each tier.
 *
 * `getStepsForCount()` already scales by tier, but it silently floors (count <
 * required → just uses required) and caps (count > total → just uses total)
 * with NO signal to the user that the deck was trimmed or couldn't fit. This
 * module wraps that selection and adds the honest, non-blocking NOTICE the spec
 * requires, plus priority tags the downstream planner/clarify can read.
 *
 * Pure + deterministic — same (framework, count) → same result. No AI, no I/O.
 * Additive: imports framework data, forks nothing.
 */

import type { Framework, FrameworkStep } from '@/data/frameworks';
import {
  getStepsForCount,
  getRequiredStepCount,
  getDefaultStepCount,
  getMaxStepCount,
} from '@/data/frameworks';

/** Priority of a category, mapped from the framework step tier. */
export type StepPriority = 'must' | 'should' | 'nice';

/** Map a framework step tier to a planning priority. */
export function tierToPriority(tier: FrameworkStep['tier']): StepPriority {
  if (tier === 'required') return 'must';
  if (tier === 'recommended') return 'should';
  return 'nice';
}

/** A selected step plus its planning priority. */
export interface PackedStep {
  step: FrameworkStep;
  priority: StepPriority;
}

/**
 * A non-blocking notice surfaced when the requested slide count couldn't carry
 * the framework's ideal coverage. Plain-language, human-voiced `message` is
 * ready to show in the UI; the numeric fields let the caller render its own.
 */
export interface PackNotice {
  kind: 'under-budget' | 'over-budget';
  /** What the user asked for. */
  requestedCount: number;
  /** What it actually delivereds (clamped to [required, total]). */
  deliveredCount: number;
  /** The framework's natural/default length (required + recommended). */
  idealCount: number;
  /** How many slides the framework can produce at most. */
  maxCount: number;
  /** Human-voiced, ready to display. */
  message: string;
}

/** Result of packing a framework to a target slide count. */
export interface PackResult {
  frameworkId: string;
  /** Selected steps in canonical (declared) order. */
  steps: FrameworkStep[];
  /** Same selection, each tagged with its planning priority. */
  packed: PackedStep[];
  requestedCount: number;
  deliveredCount: number;
  idealCount: number;
  /** Present only when coverage was constrained by the count (under/over). */
  notice?: PackNotice;
}

/**
 * Pack a framework's categories to the user's chosen slide count, prioritizing
 * what matters most and surfacing an honest notice when the count constrains
 * coverage.
 *
 * Rules (spec §3 / §8.2):
 *   - `must` (required) categories are NEVER dropped. If the user picks fewer
 *     slides than there are musts, it still delivers all the musts (the deck ends
 *     up slightly longer than asked) and say so — covering essentials wins over
 *     hitting an arbitrary count.
 *   - Otherwise it respects the count exactly, filling `should` then `nice` by
 *     declared priority order until the count is met.
 *   - When the framework's natural length exceeds the count, a notice explains
 *     that lower-priority categories were set aside (it never silentlies truncate).
 *   - When the count exceeds what the framework can produce, a notice explains
 *     it used everything rather than pad with filler. (Splitting/expanding to
 *     exceed the framework length is a later enhancement — spec §3 "over".)
 *
 * @param framework The chosen wizard template.
 * @param count     The user's selected slide count.
 */
export function packFrameworkToCount(framework: Framework, count: number): PackResult {
  const required = getRequiredStepCount(framework);
  const ideal = getDefaultStepCount(framework);
  const max = getMaxStepCount(framework);

  // Reuse the canonical tier-scaling selection (floors to required, caps to max).
  const steps = getStepsForCount(framework, count);
  const deliveredCount = steps.length;

  const packed: PackedStep[] = steps.map((step) => ({
    step,
    priority: tierToPriority(step.tier),
  }));

  const notice = buildNotice(framework.name, count, deliveredCount, required, ideal, max);

  return {
    frameworkId: framework.id,
    steps,
    packed,
    requestedCount: count,
    deliveredCount,
    idealCount: ideal,
    ...(notice ? { notice } : {}),
  };
}

/** Build the honest, human-voiced notice (or none when coverage is comfortable). */
function buildNotice(
  name: string,
  requested: number,
  delivered: number,
  required: number,
  ideal: number,
  max: number,
): PackNotice | undefined {
  // Asked for fewer than the essentials — it kept all the musts anyway.
  if (requested < required) {
    return {
      kind: 'under-budget',
      requestedCount: requested,
      deliveredCount: delivered,
      idealCount: ideal,
      maxCount: max,
      message: `A ${name} needs at least ${required} slides to land, so I kept the essentials — this deck is ${delivered} slides.`,
    };
  }

  // Asked for more than the framework can produce — used everything, no padding.
  if (requested > max) {
    return {
      kind: 'over-budget',
      requestedCount: requested,
      deliveredCount: delivered,
      idealCount: ideal,
      maxCount: max,
      message: `A ${name} is sharpest in about ${max} slides, so I used all ${max} rather than pad it out.`,
    };
  }

  // Asked for fewer than the framework's natural length — prioritized down.
  if (requested < ideal) {
    return {
      kind: 'under-budget',
      requestedCount: requested,
      deliveredCount: delivered,
      idealCount: ideal,
      maxCount: max,
      message: `A ${name} usually runs about ${ideal} slides. At ${delivered}, I focused on the ones that matter most and set the rest aside.`,
    };
  }

  // ideal ≤ requested ≤ max — comfortable coverage, no notice needed.
  return undefined;
}
