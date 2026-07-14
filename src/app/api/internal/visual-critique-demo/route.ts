/**
 * /api/internal/visual-critique-demo — end-to-end proof of the visual-critic
 * loop (Phase 2). Internal only; never linked from the product.
 *
 * Flow:
 *   1. Build a DELIBERATELY-BROKEN structured slide (overlong content stuffed
 *      into fixed boxes → overflow/overlap on render).
 *   2. Render it to a PNG server-side (headless SlideStage) and JUDGE the image
 *      (judgeSlideImage) → real visual issues.
 *   3. Feed those issues back as feedback and RE-FILL the same structure with
 *      the AI (fillStructureSlots) → tight content within budget.
 *   4. Render + judge the revised slide.
 *   5. Return both verdicts + both PNGs so a caller can show before/after.
 *
 * This is the genuine wire: render → judge → revise-in-response → re-judge.
 */
import { NextResponse } from 'next/server';
import { buildStructureTemplate } from '@/data/structureTemplates';
import { fillStructureSlots, type SlideFillContext } from '@/lib/card-engine/structure-fill';
import { renderCardToPng } from '@/lib/card-engine/render-card';
import { judgeSlideImage, type SlideType } from '@/lib/card-engine/vlm-judge';
import { verdictToVlmCritique } from '@/lib/card-engine/critique';
import type { StructureFill } from '@/data/structureTemplates';

export const maxDuration = 120;

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  let body: { topic?: string; layoutKey?: string; skinId?: string; slideType?: SlideType } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  const topic = body.topic
    || 'A guide to onboarding new enterprise customers onto our document platform.';
  const layoutKey = body.layoutKey || '05-content';
  const skinId = body.skinId || 'mono-light';
  const slideType: SlideType = body.slideType || 'content';

  // 1. Deliberately-broken fill — long strings stuffed into fixed boxes.
  const brokenFill: StructureFill = {
    'eyebrow-label:': 'THIS IS AN EXCESSIVELY LONG EYEBROW LABEL THAT WILL NOT FIT ON ONE LINE AT ALL',
    'title:': 'An Extraordinarily Long and Overstuffed Slide Title That Keeps Going Well Past Any Reasonable Width and Will Overflow Its Box Badly',
    'body:lead':
      'This lead paragraph has been deliberately overstuffed with far too much text so that it cannot possibly fit inside the space the structure allocates for it, causing the rendered text to overflow downward and overlap with the items beneath it, which is exactly the kind of visual defect a real design reviewer should catch when looking at the rendered slide image.',
    'metric-label:item-title': [
      'A first item title that is itself much too long to fit on the single line the structure provides',
      'A second item title that is also far too long and will collide with neighbouring text on the slide',
      'A third overlong item title that overflows and makes the slide look broken and unprofessional',
    ],
    'body:item-body': [
      'The supporting body text for the first item is also vastly too long and runs many words past the small region reserved for it, spilling over and overlapping adjacent content in an obviously broken way.',
      'The second item body is equally overstuffed and will overlap with the first and third items because none of this text fits the fixed geometry of the validated structure at all.',
      'The third item body continues the pattern of being far too long for its allotted space, guaranteeing a messy, overlapping, overflowing render that no one would ship.',
    ],
  };

  const baseCtx: Omit<SlideFillContext, 'feedback'> = {
    index: 1,
    total: 3,
    layoutKey,
    layoutPurpose: 'Workhorse content slide',
    focus: topic,
    deckOutline: ['Cover', topic, 'Closing'],
    topic,
  };

  try {
    // Build + render + judge the BROKEN slide.
    const brokenTpl = buildStructureTemplate(layoutKey, skinId, brokenFill);
    const theme = brokenTpl.theme;
    const brokenCard = brokenTpl.cards[0];
    const beforePng = await renderCardToPng(brokenCard, theme, { baseUrl: origin });
    if (!beforePng) {
      return NextResponse.json(
        { error: 'render-to-PNG unavailable in this environment (headless launch failed)' },
        { status: 503 },
      );
    }
    const beforeJudged = await judgeSlideImage(beforePng.base64, slideType);
    if ('error' in beforeJudged) {
      return NextResponse.json({ error: `judge error: ${beforeJudged.error}` }, { status: 502 });
    }
    const beforeCritique = verdictToVlmCritique(beforeJudged.verdict);
    const feedback = beforeCritique.issues.map((i) => i.detail);

    // 2. Revise: re-fill the SAME structure with the judge's feedback (real AI).
    const revisedFillResult = await fillStructureSlots({ ...baseCtx, feedback }, skinId);
    // fillStructureSlots now returns { text, charts, tables }. Downstream
    // buildStructureTemplate wants the text-only StructureFill map.
    const revisedTpl = buildStructureTemplate(layoutKey, skinId, revisedFillResult.text);
    const revisedCard = revisedTpl.cards[0];
    const afterPng = await renderCardToPng(revisedCard, theme, { baseUrl: origin });
    const afterJudged = afterPng ? await judgeSlideImage(afterPng.base64, slideType) : null;

    return NextResponse.json({
      layoutKey,
      skinId,
      slideType,
      before: {
        verdict: beforeJudged.verdict,
        critique: beforeCritique,
        pngBase64: beforePng.base64,
      },
      feedbackFedToReviser: feedback,
      revisedFill: revisedFillResult.text,
      after: afterPng && afterJudged && !('error' in afterJudged)
        ? {
            verdict: afterJudged.verdict,
            critique: verdictToVlmCritique(afterJudged.verdict),
            pngBase64: afterPng.base64,
          }
        : { error: afterJudged && 'error' in afterJudged ? afterJudged.error : 'after render failed' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
