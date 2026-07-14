/**
 * Visual storage — localStorage-backed persistence for AI-generated visuals
 * and graphics created in /editor/graphics. Mirrors the shape and pattern of
 * documentStorage / cardDeckStorage: single index key → array of stored
 * entries, each identified by a visual id.
 *
 * A "visual" is a single image generation result with the prompt and style
 * settings that produced it, so reopening one in the editor restores the
 * full context (prompt, style pick, color pick, advanced settings) and the
 * rendered image alongside.
 *
 * The image itself is stored as a URL — either a remote CDN url returned
 * by the generation backend, or a `data:` URL for local results. It nevers
 * store raw image bytes (binary in localStorage is wasteful and base64
 * blows up the 5–10 MB quota fast).
 *
 * A visual may also be a re-editable **composition** (the Asset Editor / Option B):
 * `kind: 'composition'` carries a Freeform `blocks` tree + artboard `width`/`height`,
 * so it reopens as an editable graphic (vector source of truth) rather than a flat
 * image. `imageUrl` then holds a rendered PNG thumbnail. Absent `kind` = `'image'`
 * (back-compat: every existing visual stays a flat image).
 */
import type { FreeformBlock } from '@/types/card-template';

const STORAGE_KEY = 'compose:visuals';

export interface StoredVisual {
  /** Unique visual id. */
  visualId: string;
  /** Display name — typically the first 60 chars of the prompt. */
  name: string;
  /** The prompt the user typed (or the assembled segments for the example tiles). */
  prompt: string;
  /** Image URL — remote (https://) or data: URL. */
  imageUrl: string;
  /** Style pick id, e.g. "photo", "illustration", "minimal". Optional. */
  stylePickId?: string;
  /** Color pick id. Optional. */
  colorPickId?: string;
  /** Free-form metadata captured from the generator's advanced panel. */
  meta?: Record<string, unknown>;
  /** Optional folder this visual lives in. null/undefined = root of /compose. */
  folderId?: string | null;
  /**
   * Visual kind. Absent or `'image'` = a flat generated/uploaded image (legacy
   * + default). `'composition'` = a re-editable Asset Editor graphic whose source
   * of truth is `blocks` (+ `width`/`height`); `imageUrl` is then a PNG thumbnail.
   */
  kind?: 'image' | 'composition';
  /** Freeform block tree — the editable source for a `'composition'` visual. */
  blocks?: FreeformBlock[];
  /** Artboard width in px (compositions). */
  width?: number;
  /** Artboard height in px (compositions). */
  height?: number;
  createdAt: string;
  updatedAt: string;
}

/** Get all stored visuals, sorted most-recently-updated first. */
export function getAllVisuals(): StoredVisual[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const visuals = JSON.parse(raw) as StoredVisual[];
    if (!Array.isArray(visuals)) return [];
    return [...visuals].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

/** Get a single visual by id, or null if not found. */
export function getVisual(visualId: string): StoredVisual | null {
  return getAllVisuals().find((v) => v.visualId === visualId) ?? null;
}

/** Save (upsert) a visual. Updates `updatedAt`; preserves `createdAt` if existing. */
export function saveVisual(visual: Omit<StoredVisual, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
}): StoredVisual {
  const now = new Date().toISOString();
  if (typeof window === 'undefined') {
    return { ...visual, createdAt: visual.createdAt ?? now, updatedAt: now };
  }
  const visuals = getAllVisuals();
  const existing = visuals.findIndex((v) => v.visualId === visual.visualId);
  const entry: StoredVisual = {
    ...visual,
    createdAt: existing >= 0 ? visuals[existing].createdAt : (visual.createdAt ?? now),
    updatedAt: now,
  };
  if (existing >= 0) {
    visuals[existing] = entry;
  } else {
    visuals.unshift(entry);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visuals));
  } catch {
    // Quota or private mode — silently ignore.
  }
  return entry;
}

/** Delete a visual by id. Returns true if anything was removed. */
export function deleteVisual(visualId: string): boolean {
  if (typeof window === 'undefined') return false;
  const visuals = getAllVisuals();
  const filtered = visuals.filter((v) => v.visualId !== visualId);
  if (filtered.length === visuals.length) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    return false;
  }
  return true;
}

/** Generate a visual id. Time-prefixed so most-recent sorts cleanly. */
export function generateVisualId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `vis_${ts}_${rand}`;
}

/**
 * Persist a generated image the user KEPT — placed on a slide via the Media
 * panel, or confirmed in the /editor/graphics studio — so it surfaces under
 * Studio → Graphics ("My Generated Images").
 *
 * Stores the lightweight library-served URL: the generation route already
 * writes every variant to the server image library and returns a `libraryId`,
 * which maps to /library/images/<id>.png. Falls back to the raw data: URL only
 * when no libraryId came back (e.g. the server-side library write was skipped),
 * so a single kept image stays recoverable without bloating the localStorage
 * quota with base64 on every save.
 */
export function saveGeneratedVisual(args: {
  src: string;
  libraryId?: string;
  prompt: string;
  style?: string;
}): StoredVisual {
  const imageUrl = args.libraryId ? `/library/images/${args.libraryId}.png` : args.src;
  const trimmed = args.prompt.trim();
  return saveVisual({
    visualId: generateVisualId(),
    name: trimmed ? trimmed.slice(0, 60) : 'Generated image',
    prompt: trimmed,
    imageUrl,
    ...(args.style ? { stylePickId: args.style } : {}),
    meta: { source: 'generated' },
  });
}

// ── Re-editable compositions (Asset Editor) ──────────────────────────────────

/** Arguments for saving a Freeform composition as a re-editable asset. */
export interface SaveCompositionArgs {
  /** Existing visual id to update, or omit to create a new composition. */
  id?: string;
  /** Display name. Defaults to "Untitled graphic" when blank/absent. */
  name?: string;
  /** The Freeform block tree — the editable source of truth. */
  blocks: FreeformBlock[];
  /** Artboard width in px. */
  width: number;
  /** Artboard height in px. */
  height: number;
  /** Optional rendered PNG thumbnail (data: or library URL) stored as `imageUrl`. */
  thumbnailDataUrl?: string;
}

/** The editable payload reconstructed from a stored composition. */
export interface CompositionPayload {
  blocks: FreeformBlock[];
  width: number;
  height: number;
}

/**
 * PURE transform: build (or update) a `StoredVisual` composition record from
 * blocks + size. No localStorage, no `Date.now()` ambiguity beyond the caller's
 * control — timestamps are passed in so this is deterministic and unit-testable
 * in Node. `prior` carries an existing record (for updates) so createdAt and
 * fields like prompt/folder survive a re-save.
 */
export function buildCompositionRecord(
  args: SaveCompositionArgs,
  now: string,
  prior?: StoredVisual | null,
): StoredVisual {
  const trimmedName = args.name?.trim();
  const name = trimmedName || prior?.name || 'Untitled graphic';
  return {
    visualId: args.id ?? prior?.visualId ?? generateVisualId(),
    name,
    // Compositions have no generation prompt; preserve any prior prompt.
    prompt: prior?.prompt ?? '',
    imageUrl: args.thumbnailDataUrl ?? prior?.imageUrl ?? '',
    kind: 'composition',
    blocks: args.blocks,
    width: args.width,
    height: args.height,
    ...(prior?.stylePickId ? { stylePickId: prior.stylePickId } : {}),
    ...(prior?.colorPickId ? { colorPickId: prior.colorPickId } : {}),
    ...(prior?.meta ? { meta: prior.meta } : {}),
    ...(prior?.folderId !== undefined ? { folderId: prior.folderId } : {}),
    createdAt: prior?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * PURE transform: read the editable payload back out of a stored composition.
 * Returns null when the record is absent or is not a re-editable composition
 * (e.g. a flat image, or a composition missing its blocks/size).
 */
export function parseCompositionRecord(
  record: StoredVisual | null | undefined,
): CompositionPayload | null {
  if (!record) return null;
  if (record.kind !== 'composition') return null;
  if (!Array.isArray(record.blocks)) return null;
  if (typeof record.width !== 'number' || typeof record.height !== 'number') return null;
  return { blocks: record.blocks, width: record.width, height: record.height };
}

/**
 * Save (upsert) a Freeform composition as a re-editable asset. Thin wrapper over
 * the pure `buildCompositionRecord` transform + `saveVisual` localStorage I/O,
 * which preserves createdAt and refreshes updatedAt.
 */
export function saveComposition(args: SaveCompositionArgs): StoredVisual {
  const prior = args.id ? getVisual(args.id) : null;
  const record = buildCompositionRecord(args, new Date().toISOString(), prior);
  // saveVisual re-applies createdAt/updatedAt semantics; pass createdAt through
  // so an existing composition keeps its original creation time.
  return saveVisual({
    ...record,
    createdAt: record.createdAt,
  });
}

/**
 * Reopen a stored composition as its editable payload. Returns null for an
 * unknown id or a record that is not a re-editable composition.
 */
export function loadComposition(id: string): CompositionPayload | null {
  return parseCompositionRecord(getVisual(id));
}

/** Move a visual into a folder (or to root with null). Returns true if
 *  the visual existed. Updates `updatedAt`. */
export function setVisualFolder(visualId: string, folderId: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const visuals = getAllVisuals();
  const idx = visuals.findIndex((v) => v.visualId === visualId);
  if (idx < 0) return false;
  visuals[idx] = {
    ...visuals[idx],
    folderId: folderId ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visuals));
  } catch {
    return false;
  }
  return true;
}
