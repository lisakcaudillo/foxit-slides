/**
 * /api/internal/fit-test — proves closed-loop fit (acceptance test #1). Builds a
 * deliberately-OVERSTUFFED slide, then runs the placement-time fit. Returns
 * before/after geometry + PNGs and asserts: after fit, nothing overflows and the
 * boxes were never grown. Internal only.
 */
import { NextResponse } from 'next/server';
import { buildStructureTemplate, type StructureFill } from '@/data/structureTemplates';
import { fitCardText, measureOverflows } from '@/lib/card-engine/text-fit';
import { renderCardToPng } from '@/lib/card-engine/render-card';
import type { Card } from '@/types/card-template';

export const maxDuration = 60;

const OVERSTUFFED: StructureFill = {
  'eyebrow-label:': 'AN EXCESSIVELY LONG EYEBROW LABEL THAT CANNOT FIT ON ONE LINE',
  'title:': 'An Extraordinarily Long and Overstuffed Slide Title That Keeps Going Far Past Any Reasonable Width And Would Overflow Its Box Badly',
  'body:lead': 'This lead paragraph is deliberately stuffed with far more text than the box can hold, so that without a real fit pass it overflows downward and collides with everything beneath it on the slide.',
  'metric-label:item-title': [
    'A first item title that is itself much too long to fit on one line',
    'A second item title also far too long for its row',
    'A third overlong item title that would overflow its row badly',
  ],
  'body:item-body': [
    'Supporting text for the first item that is vastly too long for the small region reserved for it and would spill over.',
    'Second item body equally overstuffed so it cannot fit the fixed geometry at all without a fit pass.',
    'Third item body continuing the pattern of being far too long for its allotted space on the slide.',
  ],
};

function boxes(card: Card) {
  return (card.freeform ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => ({ id: b.id, w: +b.w.toFixed(3), h: +b.h.toFixed(3), size: (b as { style?: { fontSize?: number } }).style?.fontSize }));
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  let body: { layoutKey?: string; skinId?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const layoutKey = body.layoutKey || '05-content';
  const skinId = body.skinId || 'mono-light';

  try {
    const tpl = buildStructureTemplate(layoutKey, skinId, OVERSTUFFED);
    const theme = tpl.theme;

    // BEFORE — overstuffed, design sizes, no fit. Wrap-aware overflow measure.
    const before = JSON.parse(JSON.stringify(tpl.cards[0])) as Card;
    const beforeGeom = measureOverflows(before);
    const beforeBoxes = boxes(before);
    const beforePng = await renderCardToPng(before, theme, { baseUrl: origin });

    // AFTER — same card, run the placement fit, then re-measure overflow.
    const after = JSON.parse(JSON.stringify(tpl.cards[0])) as Card;
    const fitNotes = fitCardText(after);
    const afterGeom = measureOverflows(after);
    const afterBoxes = boxes(after);
    const afterPng = await renderCardToPng(after, theme, { baseUrl: origin });

    // Box-unchanged assertion: w/h identical before/after (only size/content change).
    const boxesUnchanged = beforeBoxes.every((b, i) => afterBoxes[i] && afterBoxes[i].w === b.w && afterBoxes[i].h === b.h);

    return NextResponse.json({
      layoutKey,
      skinId,
      before: { overflowCount: beforeGeom.length, overflow: beforeGeom, boxes: beforeBoxes, pngBase64: beforePng?.base64 },
      after: { overflowCount: afterGeom.length, overflow: afterGeom, boxes: afterBoxes, fitNotes, pngBase64: afterPng?.base64 },
      boxesUnchanged,
      verdict: afterGeom.length === 0 && boxesUnchanged ? 'PASS — fits, boxes never grown' : 'FAIL',
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) }, { status: 500 });
  }
}
