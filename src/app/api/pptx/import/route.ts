/**
 * POST /api/pptx/import — accept a .pptx upload and return its slides as
 * role-mapped editor cards (see lib/card-engine/pptx-import.ts). The client
 * wraps the returned cards in a deck (with the active theme) and opens it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { importPptx } from '@/lib/card-engine/pptx-import';

export const runtime = 'nodejs';
// PPTX files can be large (embedded media); allow a generous body.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  const name = file.name || 'Imported deck';
  if (!name.toLowerCase().endsWith('.pptx')) {
    return NextResponse.json({ error: 'Only .pptx files are supported' }, { status: 415 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const deck = await importPptx(buf);
    return NextResponse.json({
      name: name.replace(/\.pptx$/i, ''),
      cards: deck.cards,
      warnings: deck.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to import PPTX: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
