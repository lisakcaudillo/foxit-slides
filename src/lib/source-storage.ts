/**
 * Source-document persistence keyed by content hash.
 *
 * Phase E E-9. The Inspector's source drawer (D2 design) needs to render
 * arbitrary pages of the original source on demand. The pipeline only
 * has the PDF bytes during /api/source-grounded/build, to persist them
 * keyed by the same contentHash used for cache lookups.
 *
 * Storage dir defaults to `<COMPOSE_CACHE_DIR or tmpdir>/compose-sources/`.
 * Files are written as `<hash[0:2]>/<hash[2:]>.bin` for fanout. No expiry.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function sourcesDir(): string {
  const base = process.env.COMPOSE_CACHE_DIR || join(tmpdir(), 'compose-cache');
  const dir = join(base, 'sources');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sourcePath(contentHash: string): string {
  const shard = contentHash.slice(0, 2);
  const dir = join(sourcesDir(), shard);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, `${contentHash.slice(2)}.bin`);
}

/**
 * Persist the source bytes under the content hash. Idempotent — if the file
 * already exists, no-op (content hash collisions mean identical content).
 */
export function saveSourceBytes(contentHash: string, buffer: Buffer): void {
  const path = sourcePath(contentHash);
  if (existsSync(path)) return;
  try {
    writeFileSync(path, buffer);
  } catch {
    // Disk failure shouldn't break the build flow — drawer just won't open later.
  }
}

/**
 * Load source bytes by content hash. Returns null if not found.
 */
export function loadSourceBytes(contentHash: string): Buffer | null {
  const path = sourcePath(contentHash);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/** Whether source bytes are available for this hash. */
export function hasSourceBytes(contentHash: string): boolean {
  return existsSync(sourcePath(contentHash));
}
