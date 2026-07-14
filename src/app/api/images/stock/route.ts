import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchStockImages, stockImagesAvailable, toStockQuery, type StockResult } from '@/lib/stockImages';
import { saveImagesToLibrary, searchLibrary, genericLibraryImages, type LibraryImage } from '@/lib/imageLibrary';

// ── /api/images/stock ──────────────────────────────────────────────────────
//
// Primary image source at slide generation (Lisa 2026-06-06): free stock
// photos from Pexels/Pixabay. Free, instant, reliably relevant — vs AI gen
// ($0.04–0.06/image, ~20s, prone to literal/dark output). AI gen stays an
// explicit opt-in upgrade on the manual image surface, not the auto path.
//
// Flow: search a candidate pool → pick N (varied, to reduce deck-wide repeats)
// → download bytes → cache into the shared library (browsable + a stable local
// URL) → return the SAME shape as /api/ai/generate-image so callers can swap
// the endpoint with no other change: { images: [{ src, libraryId, width,
// height, credit, source }] }.
//
// Graceful: no PEXELS_API_KEY/PIXABAY_API_KEY → { images: [] } (caller skips
// the image; never silently falls back to a paid AI call).

const ASPECT_ORIENTATION = {
  '1:1': 'square',
  '16:9': 'landscape',
  '9:16': 'portrait',
} as const;

const RequestSchema = z.object({
  query: z.string().min(1),
  n: z.number().int().min(1).max(6).optional(),
  aspect: z.enum(['1:1', '16:9', '9:16']).optional(),
  /** Avoid re-picking photos already used elsewhere in the deck. */
  excludeUrls: z.array(z.string()).optional(),
});

interface ResultImage {
  src: string;
  width: number;
  height: number;
  libraryId?: string;
  credit: string;
  source: StockResult['source'] | 'library';
}

/** Deterministic-ish spread: take up to n from the pool, skipping excluded
 *  URLs, sampling across the pool so repeated calls for the same query don't
 *  all return the first hit. */
function pickFromPool(pool: StockResult[], n: number, exclude: Set<string>): StockResult[] {
  const available = pool.filter((p) => !exclude.has(p.url));
  if (available.length <= n) return available;
  // Even stride across the pool for variety without RNG (RNG is unavailable in
  // some sandboxed contexts and not needed here).
  const stride = Math.max(1, Math.floor(available.length / n));
  const picked: StockResult[] = [];
  for (let i = 0; i < available.length && picked.length < n; i += stride) {
    picked.push(available[i]);
  }
  return picked;
}

async function downloadAsDataUrl(
  url: string,
): Promise<{ dataUrl: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mime = /png|jpeg|webp/.test(contentType)
      ? contentType.replace('image/jpg', 'image/jpeg').split(';')[0]
      : 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    const b64 = buf.toString('base64');
    return { dataUrl: `data:${mime};base64,${b64}` };
  } catch (err) {
    console.error('[images/stock] download failed:', err);
    return null;
  }
}

function toResultImages(images: LibraryImage[]): ResultImage[] {
  // Library files already live under /library/images/ (no download/cache step).
  // `source: 'library'` lets the editor label it as a library pick so the
  // designer stays aware + can swap.
  return images.map((image) => ({
    src: `/library/images/${image.filename}`,
    width: image.width,
    height: image.height,
    libraryId: image.id,
    credit: 'Compose library',
    source: 'library' as const,
  }));
}

/** Keyless fallback over the local pre-seeded library, two tiers (Lisa
 *  2026-06-10): (1) keyword-match the slide topic; (2) if nothing matches, a
 *  generic "suits-all" abstract/shape image so the slide STILL gets a sensible
 *  visual instead of an empty region. Only an empty library returns nothing
 *  (then the caller reflows the layout to a clean no-image form). */
async function libraryFallback(query: string, n: number): Promise<{ images: ResultImage[]; tier: 'topic' | 'generic' | 'none' }> {
  const q = toStockQuery(query) || query;
  const matched = await searchLibrary(q, n);
  if (matched.length > 0) {
    return { images: toResultImages(matched.map((m) => m.image)), tier: 'topic' };
  }
  const generic = await genericLibraryImages(q, n);
  if (generic.length > 0) {
    return { images: toResultImages(generic), tier: 'generic' };
  }
  return { images: [], tier: 'none' };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { query, n: nIn, aspect, excludeUrls } = parsed.data;
    const n = nIn ?? 1;

    if (!stockImagesAvailable()) {
      // No stock key — fall back to the keyless local library before giving up.
      const lib = await libraryFallback(query, n);
      return NextResponse.json({
        images: lib.images,
        source: lib.images[0]?.source ?? null,
        src: lib.images[0]?.src,
        reason: lib.images.length ? `library-${lib.tier}` : 'no-stock-key',
      });
    }

    const orientation = aspect ? ASPECT_ORIENTATION[aspect] : 'landscape';
    const pool = await searchStockImages(query, { orientation, perPage: 20 });
    if (pool.length === 0) {
      // Key present but no stock match — try the local library before skipping.
      const lib = await libraryFallback(query, n);
      return NextResponse.json({
        images: lib.images,
        source: lib.images[0]?.source ?? null,
        src: lib.images[0]?.src,
        reason: lib.images.length ? `library-${lib.tier}` : 'no-match',
      });
    }

    const chosen = pickFromPool(pool, n, new Set(excludeUrls ?? []));

    // Download + cache the chosen photos into the shared library, so they get a
    // stable local URL and become browsable/swappable in the Media panel.
    const downloads = await Promise.all(chosen.map((c) => downloadAsDataUrl(c.url)));
    const savePayload = downloads
      .map((d, i) => (d ? { d, c: chosen[i] } : null))
      .filter((x): x is { d: { dataUrl: string }; c: StockResult } => x !== null)
      .map(({ d, c }) => ({
        dataUrl: d.dataUrl,
        prompt: `[stock:${c.source}] ${query} — ${c.credit}`,
        type: 'photo' as const,
        quality: 'stock',
        width: c.width,
        height: c.height,
      }));

    const saved = await saveImagesToLibrary(savePayload);

    let savedIdx = 0;
    const images: ResultImage[] = [];
    for (let i = 0; i < chosen.length; i++) {
      if (!downloads[i]) continue;
      const entry = saved[savedIdx++];
      const c = chosen[i];
      images.push({
        // Stable local URL if cached; fall back to the remote CDN URL.
        src: entry ? `/library/images/${entry.filename}` : c.url,
        width: c.width,
        height: c.height,
        libraryId: entry?.id,
        credit: c.credit,
        source: c.source,
      });
    }

    return NextResponse.json({
      images,
      source: images[0]?.source ?? null,
      // Legacy single-image field for parity with /api/ai/generate-image.
      src: images[0]?.src,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[images/stock] error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
