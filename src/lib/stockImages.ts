/**
 * Stock image search — free stock photos from Pexels (primary) and Pixabay
 * (fallback). Used as the PRIMARY image source at slide generation: a real,
 * relevant photo is free, instant, and reliably good — vs AI generation which
 * is ~$0.04–0.06/image, ~20s each, and prone to literal/dark/garbage output
 * (Lisa 2026-06-06). AI generation is demoted to an explicit opt-in upgrade.
 *
 * Graceful degradation: no API key → returns []. The caller then skips the
 * image (never silently falls back to a paid AI call).
 *
 * Licensing: Pexels and Pixabay are both free for commercial use with no
 * attribution required. We still capture a credit string for provenance.
 *
 * No new npm dependency — native fetch only. Keys via env:
 *   PEXELS_API_KEY   (https://www.pexels.com/api/)
 *   PIXABAY_API_KEY  (https://pixabay.com/api/docs/)
 */

export type StockSource = 'pexels' | 'pixabay';

export interface StockResult {
  /** Direct image URL (CDN). */
  url: string;
  width: number;
  height: number;
  /** Provenance string, e.g. "Photo by Jane Doe on Pexels". */
  credit: string;
  source: StockSource;
}

export type StockOrientation = 'landscape' | 'portrait' | 'square';

export interface StockSearchOptions {
  /** How many candidates to fetch (a pool to pick/vary/dedup from). */
  perPage?: number;
  /** Slides are 16:9 → landscape by default. */
  orientation?: StockOrientation;
}

/**
 * Turn a visual-concept phrase (the slide's `imageIntent.subject`, which can be
 * a full descriptive sentence) into a concise keyword query that stock search
 * engines match well. Stock APIs do keyword matching, not semantic — a short
 * noun-phrase beats a long sentence. Strips trailing clauses + filler.
 */
export function toStockQuery(subject: string): string {
  let q = (subject || '').replace(/\s+/g, ' ').trim();
  if (!q) return '';
  // Drop anything after the first sentence-ish boundary (— , ; .) so we keep
  // the core subject, not the lighting/mood tail ("…, warm light, soft focus").
  q = q.split(/[—,;.]/)[0].trim();
  // Cap to ~6 words — stock relevance drops fast with long queries.
  const words = q.split(' ').filter(Boolean);
  if (words.length > 6) q = words.slice(0, 6).join(' ');
  return q;
}

interface PexelsPhoto {
  width: number;
  height: number;
  photographer?: string;
  src?: { large2x?: string; large?: string; original?: string; landscape?: string };
}
interface PexelsResponse { photos?: PexelsPhoto[] }

async function searchPexels(
  query: string,
  perPage: number,
  orientation: StockOrientation,
): Promise<StockResult[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    orientation,
  });
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
    });
    if (!res.ok) {
      console.warn(`[stockImages] Pexels ${res.status} for "${query}"`);
      return [];
    }
    const data = (await res.json()) as PexelsResponse;
    return (data.photos ?? [])
      .map((p): StockResult | null => {
        const url = p.src?.large2x ?? p.src?.large ?? p.src?.original;
        if (!url) return null;
        return {
          url,
          width: p.width,
          height: p.height,
          credit: `Photo by ${p.photographer ?? 'Pexels'} on Pexels`,
          source: 'pexels',
        };
      })
      .filter((r): r is StockResult => r !== null);
  } catch (err) {
    console.error('[stockImages] Pexels error:', err);
    return [];
  }
}

interface PixabayHit {
  largeImageURL?: string;
  webformatURL?: string;
  imageWidth: number;
  imageHeight: number;
  user?: string;
}
interface PixabayResponse { hits?: PixabayHit[] }

async function searchPixabay(
  query: string,
  perPage: number,
  orientation: StockOrientation,
): Promise<StockResult[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    key,
    q: query,
    per_page: String(perPage),
    image_type: 'photo',
    safesearch: 'true',
    orientation: orientation === 'landscape' ? 'horizontal' : orientation === 'portrait' ? 'vertical' : 'all',
  });
  try {
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) {
      console.warn(`[stockImages] Pixabay ${res.status} for "${query}"`);
      return [];
    }
    const data = (await res.json()) as PixabayResponse;
    return (data.hits ?? [])
      .map((h): StockResult | null => {
        const url = h.largeImageURL ?? h.webformatURL;
        if (!url) return null;
        return {
          url,
          width: h.imageWidth,
          height: h.imageHeight,
          credit: `Image by ${h.user ?? 'Pixabay'} on Pixabay`,
          source: 'pixabay',
        };
      })
      .filter((r): r is StockResult => r !== null);
  } catch (err) {
    console.error('[stockImages] Pixabay error:', err);
    return [];
  }
}

/**
 * Search free stock photos for a query. Pexels first (better curation),
 * Pixabay as fallback. Returns a candidate pool (caller picks/varies/dedups).
 * Empty array when no key is set or nothing matches — the caller treats that
 * as "no stock image" and skips, rather than spending on AI.
 */
export async function searchStockImages(
  rawQuery: string,
  opts: StockSearchOptions = {},
): Promise<StockResult[]> {
  const query = toStockQuery(rawQuery);
  if (!query) return [];
  const perPage = opts.perPage ?? 15;
  const orientation = opts.orientation ?? 'landscape';

  const pexels = await searchPexels(query, perPage, orientation);
  if (pexels.length > 0) return pexels;
  return searchPixabay(query, perPage, orientation);
}

/** True when at least one stock provider key is configured. */
export function stockImagesAvailable(): boolean {
  return !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}
