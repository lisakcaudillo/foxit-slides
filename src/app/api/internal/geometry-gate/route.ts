/**
 * /api/internal/geometry-gate — run the DETERMINISTIC DOM-geometry gate over a
 * POSTed deck and return the per-slide reports (overflow / overlap / off-canvas /
 * contrast / font / ink-density + deterministic fix instructions). Internal only.
 * No LLM — pure measurement of the real headless render. Can prove the gate
 * on an existing deck without regenerating.
 */
import { NextResponse } from 'next/server';
import type { CardTemplate } from '@/types/card-template';
import { measureDeckDomGeometry } from '@/lib/card-engine/render-card';

export const maxDuration = 180;

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  let body: { template?: CardTemplate };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const cards = body?.template?.cards;
  const theme = body?.template?.theme;
  if (!cards?.length || !theme) {
    return NextResponse.json({ error: 'template with cards + theme required' }, { status: 400 });
  }

  const reports = await measureDeckDomGeometry(cards, theme, { baseUrl: origin });
  const slides = reports.map((r, i) => ({
    index: i,
    rendered: r != null,
    pass: r?.pass ?? null,
    inkDensity: r?.inkDensity ?? null,
    hard: r ? r.failures.filter((f) => f.severity === 'hard').length : null,
    advisory: r ? r.failures.filter((f) => f.severity === 'advisory').length : null,
    failures: r?.failures ?? [],
  }));
  const rendered = slides.filter((s) => s.rendered).length;
  const failing = slides.filter((s) => s.pass === false).length;
  return NextResponse.json({
    aggregate: { slides: cards.length, rendered, passing: rendered - failing, failing },
    slides,
  });
}
