import { NextRequest, NextResponse } from 'next/server';
import { loadSourceBytes } from '@/lib/source-storage';
import { renderPDFPageToPNG } from '@/lib/foxit-sdk-server';

// GET /api/source-grounded/render-page?hash=<contentHash>&page=<1-indexed>&maxDim=<px>
//
// Returns a PNG of the requested page from the persisted source PDF.
// Used by the Inspector source drawer (E-9, D2 design) to render cited
// pages on demand. Source bytes are persisted during /api/source-grounded/build
// keyed by the same contentHash.

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get('hash');
  const pageRaw = searchParams.get('page');
  const maxDimRaw = searchParams.get('maxDim');

  if (!hash || !/^[a-f0-9]{16,64}$/.test(hash)) {
    return NextResponse.json({ error: '`hash` (16-64 hex chars) required' }, { status: 400 });
  }
  const page = pageRaw ? parseInt(pageRaw, 10) : NaN;
  if (!Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: '`page` (1-indexed positive integer) required' }, { status: 400 });
  }
  const maxDim = maxDimRaw ? Math.min(3072, Math.max(128, parseInt(maxDimRaw, 10))) : 1200;

  const buffer = loadSourceBytes(hash);
  if (!buffer) {
    return NextResponse.json({ error: 'Source bytes not found — re-upload the source document.' }, { status: 404 });
  }

  const rendered = await renderPDFPageToPNG(buffer, page - 1, { maxDimension: maxDim });
  if ('error' in rendered) {
    return NextResponse.json({ error: rendered.error }, { status: 500 });
  }

  return new Response(new Uint8Array(rendered.pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      // Content hash + page makes the URL immutable — cache aggressively.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
