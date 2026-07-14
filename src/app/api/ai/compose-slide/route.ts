import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { composeSlide, type ComposeInput } from '@/lib/card-engine/compose-designer';

/**
 * POST /api/ai/compose-slide
 * Body: ComposeInput (+ useReferences?: boolean)
 * → { blocks, rationale } | { error }
 *
 * The composing designer. When useReferences is set, loads a few top-tier
 * interior reference slides from the curated library and passes them as visual
 * few-shot grounding so the designer composes to the exemplar standard.
 */

// A few strong interior content-slide exemplars (curated top-tier library).
const REFERENCE_SLIDES = ['003/03.jpg', '003/05.jpg', '088/03.jpg'];

function loadReferences(): { data: string; mimeType: 'image/jpeg' }[] {
  const base = join(process.cwd(), '..', 'docs', 'uiux', 'UIUX inspo', 'gamma-template-library', 'interiors');
  const out: { data: string; mimeType: 'image/jpeg' }[] = [];
  for (const rel of REFERENCE_SLIDES) {
    try {
      out.push({ data: readFileSync(join(base, rel)).toString('base64'), mimeType: 'image/jpeg' });
    } catch {
      /* missing reference — skip, never block composition */
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ComposeInput & { useReferences?: boolean };
    if (!body?.title || !body?.theme) {
      return NextResponse.json({ error: 'title and theme are required' }, { status: 400 });
    }
    const references = body.useReferences ? loadReferences() : undefined;
    const result = await composeSlide({ ...body, references });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'compose-slide failed' },
      { status: 500 },
    );
  }
}
