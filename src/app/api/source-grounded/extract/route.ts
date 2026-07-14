import { NextRequest, NextResponse } from 'next/server';
import { extractOfficeStructure, isNativeOfficeFormat } from '@/lib/card-engine/office-extract';
import { extractTextFromPDF, type PDFLayoutElement } from '@/lib/foxit-sdk-server';

// Lightweight native extraction (no LLM): DOCX/PPTX → a structured plain-text
// rendering the structured engine can ground in. Used by the editor to route an
// attached Office doc through the FAITHFUL structured engine (generate-cards
// structured) instead of the legacy source-grounded card path. Page provenance
// is intentionally dropped here (faithful-themes-now); the page-citation path
// stays on /api/source-grounded/build.

function elementsToText(elements: PDFLayoutElement[]): string {
  return elements
    .map((el) => {
      switch (el.type) {
        case 'heading':
          return `${'#'.repeat(Math.min(6, el.level ?? 1))} ${el.content}`;
        case 'list':
          return `- ${el.content}`;
        case 'table':
          return el.content; // already row-joined ("a | b\nc | d")
        default:
          return el.content;
      }
    })
    .filter((s) => s.trim().length > 0)
    .join('\n\n');
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a `file` field' }, { status: 400 });
  }
  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '`file` is required' }, { status: 400 });
  }
  const filename = (file instanceof File ? file.name : '') || 'document';
  const lower = filename.toLowerCase();
  const kind = isNativeOfficeFormat(filename);
  if (!kind && !lower.endsWith('.pdf')) {
    return NextResponse.json({ error: 'Native extraction supports .docx, .pptx and .pdf' }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let elements: PDFLayoutElement[];
    if (kind) {
      elements = await extractOfficeStructure(buffer, kind);
    } else {
      // PDF: Foxit layout extraction. Prefer the tagged/recognized layout
      // elements; fall back to per-page raw text when the PDF carries no tags.
      const res = await extractTextFromPDF(buffer);
      if (res.error) {
        return NextResponse.json({ error: res.error }, { status: 422 });
      }
      elements = res.layoutElements.length
        ? res.layoutElements
        : res.pages
            .filter((p) => p.text.trim())
            .map((p) => ({ type: 'paragraph' as const, content: p.text, page: p.page, rawType: 'P' }));
    }
    const text = elementsToText(elements);
    if (!text.trim()) {
      return NextResponse.json({ error: 'No extractable text in this document' }, { status: 422 });
    }
    return NextResponse.json({ text, elementCount: elements.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 },
    );
  }
}
