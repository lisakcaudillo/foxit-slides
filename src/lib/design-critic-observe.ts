'use client';

/**
 * design-critic-observe.ts — observe-only wiring of the vision Design critic (P5).
 *
 * The Design critic (PRD `slide-quality-critic-relay-prd.md` §2.2) judges the
 * RENDERED slide image — the highest-trust critic (PPTEval Design 0.90). Both
 * halves it needs already exist: the render-to-image (`captureSlideToPng` +
 * `SlideStage`) and the vision judge (`judgeSlideImage`, reached via
 * `/api/ai/judge-slide`). The only thing missing was a CALL SITE — this is it.
 *
 * Per PRD §2.4 it runs OBSERVE-ONLY first: after a deck finishes generating,
 * capture each slide offscreen → vision-score it → append the verdict to the
 * gitignored review CSV (`/api/design-log`, the same sink the cover Designer +
 * Judge already write to). It NEVER mutates the deck, blocks the reveal, or
 * throws into generation — it only records how the visual brain reasons so the
 * judge can be reviewed ("judge the judges") BEFORE any auto-fix loop is wired.
 *
 * OFF by default. Enable with NEXT_PUBLIC_DESIGN_CRITIC=observe in app/.env.local
 * (mirrors the design-log's own opt-in gating). Unlike the free deterministic
 * cover Judge, this is one vision API call per slide (~1¢ + an offscreen render),
 * so it does not silently fire on every generation.
 */

import { captureSlideToPng } from './captureSlideOffscreen';
import type { CardTemplate, Card, TemplateTheme } from '@/types/card-template';

/** The vlm-judge SlideType union (kept local so this client module needn't import
 *  the server-only judge). The route casts the string, so extra values fall back
 *  to 'content' there — but we only ever emit valid ones. */
type SlideType =
  | 'cover' | 'agenda' | 'stat' | 'comparison' | 'process' | 'quote'
  | 'content' | 'divider' | 'closing';

/** Verdict shape returned by /api/ai/judge-slide (mirrors vlm-judge's SlideVerdict). */
interface SlideVerdictWire {
  criteria: { id: string; pass: boolean; reason: string }[];
  overall: number;
  verdict: string;
  fails: string[];
  passed: boolean;
}

/** Whether the observe-only Design critic is enabled this run. */
export function designCriticEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DESIGN_CRITIC === 'observe';
}

/** Which visual rubric applies. The rubric only distinguishes COVER (C1–C7) from
 *  INTERIOR (L1–L6) — the finer slide types route to the same interior rubric — so
 *  this derives only that structural fact (slide 0 = cover) rather than guessing a
 *  sub-type from keywords (which was an injected heuristic, not a calibrated rule). */
function slideTypeOf(_card: Card, index: number): SlideType {
  return index === 0 ? 'cover' : 'content';
}

/** Capture one slide and vision-judge it. NEVER throws — on any failure it
 *  returns a `skip` reason instead of a verdict, so the caller can record the
 *  coverage gap honestly rather than silently dropping the slide (PRD §2.5). */
async function judgeOne(
  card: Card,
  theme: TemplateTheme,
  slideType: SlideType,
): Promise<{ verdict: SlideVerdictWire } | { skip: string }> {
  let base64: string;
  try {
    const png = await captureSlideToPng(card, theme);
    base64 = png.dataUrl.split(',')[1] ?? '';
    if (!base64) return { skip: 'capture produced no image data' };
  } catch {
    return { skip: 'slide capture failed (could not render to image)' };
  }
  try {
    const res = await fetch('/api/ai/judge-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, slideType }),
    });
    if (!res.ok) return { skip: `judge route returned ${res.status}` };
    const data = (await res.json()) as { verdict?: SlideVerdictWire; error?: string };
    if (!data?.verdict) return { skip: data?.error ? `judge error: ${data.error}` : 'judge returned no verdict' };
    return { verdict: data.verdict };
  } catch {
    return { skip: 'judge request failed (network/provider)' };
  }
}

/** Fire-and-forget POST of one review row. Never blocks or throws. */
function postRow(row: Record<string, unknown>): void {
  try {
    void fetch('/api/design-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    }).catch(() => {});
  } catch {
    /* logging must never affect generation */
  }
}

/**
 * Run the observe-only Design critic over a finished deck. Sequential (one
 * offscreen capture + vision call at a time, to avoid a burst of N captures) and
 * fully fire-and-forget — call it WITHOUT awaiting. No-op unless
 * NEXT_PUBLIC_DESIGN_CRITIC=observe.
 */
export async function runDesignCriticObserve(
  template: CardTemplate,
  theme: TemplateTheme,
  deckId: string,
): Promise<void> {
  console.log('[design-critic] invoked; enabled=', designCriticEnabled(), 'cards=', (template.cards ?? []).length);
  if (!designCriticEnabled()) return;
  const cards = template.cards ?? [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const slideType = slideTypeOf(card, i);

    // Belt-and-suspenders: judgeOne already never throws, but wrap the whole
    // iteration so NOTHING can break the loop and skip the remaining slides.
    let outcome: { verdict: SlideVerdictWire } | { skip: string };
    try {
      outcome = await judgeOne(card, theme, slideType);
    } catch (e) {
      outcome = { skip: `unexpected error: ${e instanceof Error ? e.message : 'unknown'}` };
    }

    // Honest handoff (PRD §2.5): a slide we could NOT visually judge is recorded
    // as an explicit coverage gap, never silently dropped — a dropped slide reads
    // as "fine" when it may be exactly the one with a problem.
    if ('skip' in outcome) {
      postRow({
        deckId,
        slideId: card.id,
        slideType,
        designerDecision: 'vision-design-critic (observe-only)',
        designerReasoning: 'not visually judged',
        result: '',
        judgeReasoning: `NOT JUDGED — ${outcome.skip}`,
        judgeRecommendation: 'coverage gap: the rendered slide could not be captured/scored',
      });
      continue;
    }
    const verdict = outcome.verdict;

    // Record the failing criteria with their reasons — the actionable "why",
    // matching the cover Judge's reasoning/recommendation logging (P2). The
    // rubric is design-scoped (composition / legibility / treatment), so this
    // stays DESIGN reasoning, not slide prose, per the design-log discipline.
    const failDetail = verdict.criteria
      .filter((c) => !c.pass)
      .map((c) => `${c.id}: ${c.reason}`)
      .join(' | ');

    postRow({
      deckId,
      slideId: card.id,
      slideType,
      designerDecision: 'vision-design-critic (observe-only)',
      designerReasoning: `overall ${verdict.overall}/5`,
      result: verdict.passed ? 'PASS' : 'FAIL',
      judgeReasoning: verdict.verdict,
      judgeRecommendation: failDetail,
    });
  }
}
