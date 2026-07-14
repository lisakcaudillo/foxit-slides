/**
 * /api/internal/pptx-export-test — drive the REAL native pptx export
 * (exportDeckToPptx) on a posted deck so its output can be inspected for
 * native/editable objects. Internal only; never linked from the product.
 *
 * pptxgenjs.writeFile() runs in Node here and writes the .pptx to the server's
 * cwd (app/). The response reports the absolute path so a caller can unzip and
 * analyze the slide XML (native text/shape/chart vs flattened image).
 */
import { NextResponse } from 'next/server';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildDeckPptxBlob } from '@/lib/pptxExport';
import type { CardTemplate } from '@/types/card-template';

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { template?: CardTemplate; fileName?: string };
  try {
    body = (await req.json()) as { template?: CardTemplate; fileName?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body?.template?.cards) {
    return NextResponse.json({ error: 'template with cards required' }, { status: 400 });
  }
  const fileName = (body.fileName || 'p3-structure-deck').replace(/[^a-z0-9\-_]/gi, '');
  try {
    // Use the SERVER-SAFE blob builder (buildDeckPptxBlob) — NOT exportDeckToPptx,
    // which is the browser download helper (document.createElement('a')) and
    // throws "document is not defined" in Node. Write the bytes via fs so the
    // harness can unzip + inspect the slide XML.
    const blob = await buildDeckPptxBlob(body.template);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const safe = fileName.toLowerCase();
    const absPath = path.join(process.cwd(), `${safe}.pptx`);
    await writeFile(absPath, bytes);
    return NextResponse.json({
      ok: true,
      file: `${safe}.pptx`,
      cwd: process.cwd(),
      absPath,
      bytes: bytes.length,
      cards: body.template.cards.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) },
      { status: 500 },
    );
  }
}
