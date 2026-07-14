/**
 * /api/internal/judge-deck — run the wired visual judge over a POSTed deck and
 * return the per-slide verdict trace. Internal only. Can re-judge an
 * existing deck (e.g. to prove a rubric change flips a verdict) without
 * regenerating content.
 */
import { NextResponse } from 'next/server';
import { judgeDeck } from '@/lib/card-engine/judge-deck';
import type { CardTemplate } from '@/types/card-template';

export const maxDuration = 180;

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  let body: { template?: CardTemplate; layoutKeys?: string[]; includePng?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const cards = body?.template?.cards;
  if (!cards?.length || !body.template?.theme) {
    return NextResponse.json({ error: 'template with cards + theme required' }, { status: 400 });
  }
  const layoutKeys = Array.isArray(body.layoutKeys) ? body.layoutKeys : cards.map(() => '');
  const trace = await judgeDeck(cards, body.template.theme, layoutKeys, origin, {
    includePng: !!body.includePng,
  });
  return NextResponse.json({ trace });
}
