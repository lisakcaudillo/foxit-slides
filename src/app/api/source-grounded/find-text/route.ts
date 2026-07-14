import { NextRequest, NextResponse } from 'next/server';
import { loadSourceBytes } from '@/lib/source-storage';
import { findTextOnPage } from '@/lib/foxit-sdk-server';

// POST /api/source-grounded/find-text
// Body JSON: { hash: string, page: number (1-indexed), text: string }
// Returns: { pageWidth, pageHeight, rects: [{ x, y, w, h }] }
//   Rects are normalized 0..1 in image-space coords (top-left origin) so the
//   client can overlay them on a rendered page image at any display size.
//
// POST not GET because passage text can be long (kilobytes for full
// paragraphs) and shouldn't sit in URL params.

export const maxDuration = 30;

interface ReqBody {
  hash?: string;
  page?: number;
  text?: string;
}

export async function POST(request: NextRequest) {
  let body: ReqBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hash = body.hash;
  const page = body.page;
  const text = body.text;

  if (!hash || !/^[a-f0-9]{16,64}$/.test(hash)) {
    return NextResponse.json({ error: '`hash` (16-64 hex chars) required' }, { status: 400 });
  }
  if (!Number.isFinite(page) || (page as number) < 1) {
    return NextResponse.json({ error: '`page` (1-indexed positive integer) required' }, { status: 400 });
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: '`text` required and non-empty' }, { status: 400 });
  }

  const buffer = loadSourceBytes(hash);
  if (!buffer) {
    return NextResponse.json({ error: 'Source bytes not found' }, { status: 404 });
  }

  const result = await findTextOnPage(buffer, (page as number) - 1, text);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result, {
    headers: {
      // Cache by URL (POST so we still use route-level caching at fetch boundary)
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
