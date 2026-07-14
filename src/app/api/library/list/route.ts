import { NextResponse } from 'next/server';
import { readMetadata } from '@/lib/imageLibrary';

// GET /api/library/list — returns the full image-library index.
// Static files (the PNGs themselves) are served by Next.js from
// /library/images/<filename> automatically since they live in public/.
// The client just needs the metadata to render the grid.

export async function GET() {
  try {
    const meta = await readMetadata();
    return NextResponse.json(meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message, images: [] }, { status: 500 });
  }
}
