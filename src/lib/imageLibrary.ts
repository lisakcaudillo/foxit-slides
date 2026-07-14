/**
 * Image Library — server-side helper for the shared stock image library.
 *
 * Purpose: bootstrap a stock image collection by auto-saving every image
 * generated through /api/ai/generate-image during dev/test. The library
 * ships pre-populated with whatever was generated before launch. End
 * users browse and select; they don't contribute.
 *
 * Storage: filesystem under app/public/library/. Files served statically
 * by Next.js from /library/images/<filename>.png. Metadata index at
 * app/public/library/metadata.json. Atomic write pattern (tmp + rename)
 * keeps the index from corrupting on concurrent writes.
 *
 * Production migration path: same API shape, swap fs reads/writes for
 * Foxit DMS or object storage calls. The route + UI don't change.
 */

import { promises as fs } from 'fs';
import path from 'path';

const LIBRARY_DIR = path.join(process.cwd(), 'public', 'library');
const IMAGES_DIR = path.join(LIBRARY_DIR, 'images');
const METADATA_PATH = path.join(LIBRARY_DIR, 'metadata.json');

export interface LibraryImage {
  id: string;
  filename: string;
  prompt: string;
  type: 'photo' | 'diagram';
  quality: string;
  width: number;
  height: number;
  createdAt: string;
  /** Attribution for images NOT created by us (e.g. a Wikipedia photo): the web
   *  page we sourced it from + a short label. Absent on images we generated —
   *  those need no credit. Drives the small "Source: …" caption on the slide. */
  sourceUrl?: string;
  sourceLabel?: string;
}

export interface LibraryMetadata {
  images: LibraryImage[];
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

export async function readMetadata(): Promise<LibraryMetadata> {
  try {
    const raw = await fs.readFile(METADATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as LibraryMetadata;
    if (!parsed || !Array.isArray(parsed.images)) return { images: [] };
    return parsed;
  } catch {
    // File missing or unparseable → treat as empty library.
    return { images: [] };
  }
}

async function writeMetadata(meta: LibraryMetadata): Promise<void> {
  await ensureDirs();
  // Atomic write: write to .tmp then rename. Prevents partial-write
  // corruption if the process is killed mid-save.
  const tmpPath = METADATA_PATH + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(meta, null, 2), 'utf-8');
  await fs.rename(tmpPath, METADATA_PATH);
}

// Process-level mutex serialising every read-update-write of metadata.json.
// Without this, two concurrent route handlers can each readMetadata(),
// each prepend their entry, and each writeMetadata() — last writer wins
// and the other's entry is lost. Promise-chain pattern: each caller awaits
// the previous lock-holder before running its critical section.
let metadataLock: Promise<void> = Promise.resolve();

async function withMetadataLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = metadataLock;
  let release: () => void = () => {};
  metadataLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    return await fn();
  } finally {
    release();
  }
}

interface SaveArgs {
  dataUrl: string;
  prompt: string;
  type: 'photo' | 'diagram';
  quality: string;
  width: number;
  height: number;
  sourceUrl?: string;
  sourceLabel?: string;
}

/** Build an in-memory LibraryImage entry and write its PNG to disk.
 *  Does NOT touch metadata.json — that's a separate, locked step. */
async function writePngOnly(args: SaveArgs): Promise<LibraryImage | null> {
  // Parse the data URL — expect "data:image/png;base64,<data>".
  // NOTE: parse via string ops, NOT a regex. A `(.+)$` capture backtracks
  // and blows the call stack on multi-MB base64 bodies (e.g. downloaded
  // Wikipedia originals) — "Maximum call stack size exceeded".
  const comma = args.dataUrl.indexOf(',');
  const header = comma >= 0 ? args.dataUrl.slice(0, comma) : '';
  const headerMatch = /^data:image\/(png|jpeg|webp);base64$/.exec(header);
  if (comma < 0 || !headerMatch) {
    console.warn('[imageLibrary] dataUrl format not recognised — skipping save');
    return null;
  }
  const ext = headerMatch[1] === 'jpeg' ? 'jpg' : headerMatch[1];
  const b64 = args.dataUrl.slice(comma + 1);

  // Time-prefixed id so chronological listing is the file-system order
  // and concurrent saves don't collide.
  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const filename = `${id}.${ext}`;
  const filePath = path.join(IMAGES_DIR, filename);

  try {
    await fs.writeFile(filePath, Buffer.from(b64, 'base64'));
  } catch (err) {
    console.error('[imageLibrary] PNG write failed:', err);
    return null;
  }

  return {
    id,
    filename,
    prompt: args.prompt,
    type: args.type,
    quality: args.quality,
    width: args.width,
    height: args.height,
    ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
    ...(args.sourceLabel ? { sourceLabel: args.sourceLabel } : {}),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Save a batch of generated images to the library in a single atomic
 * metadata update. PNGs write in parallel (unique filenames, no
 * collision); the metadata.json read-update-write happens once under
 * the process-level lock. Result array preserves input order — any
 * entry that failed to write is `null` at that index.
 *
 * This is the canonical save path. The singular saveImageToLibrary is a
 * thin wrapper. Callers generating n>1 images per request MUST use this
 * — calling saveImageToLibrary in a Promise.all loses entries to the
 * read-update-write race (the bug that orphaned 12 PNGs pre-2026-05-26).
 */
export async function saveImagesToLibrary(
  items: SaveArgs[],
): Promise<Array<LibraryImage | null>> {
  if (items.length === 0) return [];
  try {
    await ensureDirs();

    // PNG writes parallelise safely — unique filenames per call.
    const entries = await Promise.all(items.map(writePngOnly));

    // Metadata update is the only critical section.
    const successful = entries.filter((e): e is LibraryImage => e !== null);
    if (successful.length > 0) {
      await withMetadataLock(async () => {
        const meta = await readMetadata();
        meta.images = [...successful, ...meta.images]; // most-recent-first
        await writeMetadata(meta);
      });
    }

    return entries;
  } catch (err) {
    // Library is best-effort — generation success is the primary outcome,
    // library save is a side effect. Log and swallow so the caller still
    // gets its image even if the disk write fails.
    console.error('[imageLibrary] batch save failed:', err);
    return items.map(() => null);
  }
}

/**
 * Save a single generated image. Thin wrapper around saveImagesToLibrary
 * — kept for backwards compatibility. New code generating n>1 images
 * should call saveImagesToLibrary directly with the full array.
 */
export async function saveImageToLibrary(args: SaveArgs): Promise<LibraryImage | null> {
  const [result] = await saveImagesToLibrary([args]);
  return result;
}

/** A library entry scored against a search query. */
export interface LibraryMatch {
  image: LibraryImage;
  score: number;
}

/**
 * Keyword-search the local image library by token-overlap similarity (Jaccard)
 * against each entry's stored `prompt` string. This is the keyless fallback
 * image source: when no stock API key is configured (or stock returns nothing),
 * a slide can still get a relevant picture from the ~145 pre-seeded library
 * images — at zero cost and with no network.
 *
 * Mirrors the client-side `rankLibraryBySimilarity` (image-gen/library.ts), but
 * runs server-side over `readMetadata()` so the /api/images/stock route can use
 * it without shipping the whole index to the client. No embeddings, no infra.
 *
 * `minScore` gates quality: below it, the match is considered too loose and the
 * caller gets nothing rather than a tonally-wrong photo (Lisa 2026-06-10 — a
 * weak match is worse than no image; the layout reflows to a clean no-image
 * form instead). Returns matches sorted best-first, capped at `n`.
 */
const LIBRARY_SEARCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'with', 'and', 'or',
  'from', 'at', 'by', 'is', 'that', 'this', 'it', 'as', 'be', 'are',
  'into', 'photograph', 'illustration', 'image', 'picture', 'professional',
  // Library prompt-prefix noise (e.g. "[stock:pexels]", "[architecture]") and
  // provenance tails ("— Photo by Jane on Pexels") shouldn't drive relevance.
  'stock', 'pexels', 'pixabay', 'photo', 'by', 'on',
]);

function tokenizeForSearch(s: string): string[] {
  const matches = (s || '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return matches.filter((t) => t.length > 2 && !LIBRARY_SEARCH_STOPWORDS.has(t));
}

export async function searchLibrary(
  query: string,
  n = 4,
  minScore = 0.12,
): Promise<LibraryMatch[]> {
  const queryTokens = new Set(tokenizeForSearch(query));
  if (queryTokens.size === 0) return [];
  const { images } = await readMetadata();
  return images
    .map((image): LibraryMatch => {
      const itemTokens = new Set(tokenizeForSearch(image.prompt));
      let intersection = 0;
      for (const t of queryTokens) if (itemTokens.has(t)) intersection += 1;
      const union = queryTokens.size + itemTokens.size - intersection;
      const score = union > 0 ? intersection / union : 0;
      return { image, score };
    })
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/**
 * Generic "suits-all" library images — abstract art, gradients, fluid/ribbon
 * shapes, minimal textures, glass renders. Topic-agnostic visuals that look
 * intentional on any slide. This is the SECOND fallback tier (Lisa 2026-06-10):
 * when no library image matches the slide topic, a slide should still get a
 * sensible generic visual rather than an empty region — only truly last-resort
 * (empty library) does the layout reflow to no-image.
 *
 * Selection is varied-but-deterministic: a tiny hash of the `seed` (the slide
 * subject) offsets the pick, so different slides in one deck get different
 * generic images without needing RNG (unavailable in some sandboxes) or shared
 * server state.
 */
const GENERIC_LIBRARY_ROOTS = [
  'abstract', 'fluid', 'minimal', 'gradient', 'glassmorphism',
  'ribbons', 'glass-render', 'glass-centerpiece', 'glass-set',
];

function libraryCategoryOf(prompt: string): string {
  const m = (prompt || '').match(/^\[([a-z0-9:_-]+)\]/i);
  return m ? m[1].toLowerCase() : '';
}

function isGenericLibraryCategory(cat: string): boolean {
  return GENERIC_LIBRARY_ROOTS.some((root) => cat.startsWith(root));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Resolve library entries by id (order preserved, misses dropped). Used by the
 *  explicit-image-pick path so a caller can name exactly which image to use. */
export async function findLibraryImagesByIds(ids: string[]): Promise<Record<string, LibraryImage>> {
  if (ids.length === 0) return {};
  const { images } = await readMetadata();
  const want = new Set(ids);
  const out: Record<string, LibraryImage> = {};
  for (const img of images) if (want.has(img.id)) out[img.id] = img;
  return out;
}

export async function genericLibraryImages(seed: string, n = 1): Promise<LibraryImage[]> {
  const { images } = await readMetadata();
  const pool = images.filter((img) => isGenericLibraryCategory(libraryCategoryOf(img.prompt)));
  if (pool.length === 0) return [];
  const start = hashString(seed || 'x') % pool.length;
  const stride = Math.max(1, Math.floor(pool.length / Math.max(1, n)));
  const out: LibraryImage[] = [];
  for (let k = 0; k < pool.length && out.length < n; k += 1) {
    out.push(pool[(start + k * stride) % pool.length]);
  }
  return out;
}

/**
 * Delete a library entry by id. Removes both the index entry and the
 * underlying file. Returns true if removed, false if not found.
 */
export async function deleteFromLibrary(id: string): Promise<boolean> {
  let entry: LibraryImage | undefined;
  const removed = await withMetadataLock(async () => {
    const meta = await readMetadata();
    const idx = meta.images.findIndex((img) => img.id === id);
    if (idx < 0) return false;
    entry = meta.images[idx];
    meta.images.splice(idx, 1);
    await writeMetadata(meta);
    return true;
  });
  if (!removed || !entry) return false;

  // Best-effort file delete — if the file is already missing, that's fine.
  try {
    await fs.unlink(path.join(IMAGES_DIR, entry.filename));
  } catch {
    // File missing or unlinkable — index is the source of truth, move on.
  }
  return true;
}

/** Find the FIRST library image whose prompt contains `tag` (an exact substring,
 *  e.g. a `[known:Wolfgang_Amadeus_Mozart]` dedup tag). Lets a caller reuse an
 *  already-saved image instead of re-fetching/re-generating it. */
export async function findLibraryImageByPromptTag(tag: string): Promise<LibraryImage | null> {
  try {
    const meta = await readMetadata();
    return meta.images.find((img) => img.prompt?.includes(tag)) ?? null;
  } catch {
    return null;
  }
}

/** Read a library image off disk as a data URL (for a VLM quality check). Returns
 *  null if the file is missing/unreadable. */
export async function readLibraryImageDataUrl(filename: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(IMAGES_DIR, filename));
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext || 'png';
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
