import { NextRequest, NextResponse } from 'next/server';
import { htmlToPdf } from '@/lib/foxit-sdk-server';

// This route renders HTML to PDF in-process via the Foxit SDK.
// localhost:8001/export/pdf. Now uses the in-process Node Foxit SDK
// HTML→PDF helper, same path as /api/foxit/export.

export async function POST(request: NextRequest) {
  try {
    const { htmlContent, documentName } = await request.json();

    if (!htmlContent || typeof htmlContent !== 'string') {
      return NextResponse.json({ error: 'htmlContent is required' }, { status: 400 });
    }

    const result = await htmlToPdf(htmlContent, { documentName });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Buffer/Uint8Array is valid BodyInit at runtime; cast bridges a stricter
    // generic in @types/node (Uint8Array<ArrayBufferLike>) vs Next.js's BodyInit.
    return new NextResponse(result.pdfBuffer as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${documentName ?? 'compose-document'}.pdf"`,
        'X-Page-Count': String(result.pageCount),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
