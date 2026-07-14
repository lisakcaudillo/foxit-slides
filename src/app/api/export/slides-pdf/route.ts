/**
 * /api/export/slides-pdf — Foxit-native PDF export for the SLIDES editor.
 *
 * Pipeline:  deck → buildDeckPptxBlob() (the same editable .pptx the user
 * downloads) → Foxit Conversion SDK ConvertFromPowerPoint → PDF.
 *
 * This keeps the slide PDF on Foxit's engine (Hard Constraint: Foxit SDK only
 * for PDF operations) AND guarantees the PDF is pixel-faithful to the editable
 * deck, since both derive from the SAME .pptx.
 *
 * The Conversion SDK is license- + res-path-gated and only installs on
 * allowlisted IPs, so it can be unavailable (e.g. cloud sandbox). When it is,
 * this route returns 503 with { fallback: true } and the client falls back to
 * the browser print dialog — export never hard-fails.
 */
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { buildDeckPptxBlob } from '@/lib/pptxExport';
import { convertOfficeToPdf } from '@/lib/foxit-sdk-server';
import type { CardTemplate } from '@/types/card-template';

export const maxDuration = 120;

function safeName(name: string | undefined, fallback: string): string {
  return (
    (name || fallback)
      .trim()
      .replace(/[^a-z0-9\-_ ]/gi, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || fallback
  );
}

export async function POST(req: Request) {
  let body: { template?: CardTemplate; fileName?: string };
  try {
    body = (await req.json()) as { template?: CardTemplate; fileName?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body?.template?.cards?.length) {
    return NextResponse.json({ error: 'template with cards required' }, { status: 400 });
  }

  // 1) Build the editable .pptx (identical to the "Export as PPT" download).
  let pptxBuffer: Buffer;
  try {
    const blob = await buildDeckPptxBlob(body.template);
    pptxBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      { error: `PPTX build failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  // 2) Convert PPTX → PDF via the Foxit Conversion SDK. If the SDK is
  // unavailable (license/res/IP), tell the client to fall back to print.
  const conv = await convertOfficeToPdf(pptxBuffer, 'powerpoint');
  if ('error' in conv) {
    return NextResponse.json({ error: conv.error, fallback: true }, { status: 503 });
  }

  try {
    const pdf = await readFile(conv.pdfPath);
    const name = safeName(body.fileName ?? body.template.name, 'presentation');
    // Buffer is a valid BodyInit at runtime; cast bridges @types/node vs Next BodyInit.
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}.pdf"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `reading converted PDF failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  } finally {
    conv.cleanup();
  }
}
