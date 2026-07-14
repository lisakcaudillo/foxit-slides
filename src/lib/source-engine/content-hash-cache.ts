/**
 * Content-hash cache for expensive Layer 3+4 outputs.
 *
 * Each cache entry is keyed by a SHA-256 hash of the input bytes (page
 * image, element JSON, etc.). Path-independent — if the same source
 * uploads twice (even renamed), the second upload hits cache.
 *
 * Two-tier:
 * - L1: in-process Map (per Node process) — fastest, lost on restart
 * - L2: file-backed JSON in COMPOSE_CACHE_DIR (or tmpdir/compose-cache)
 *
 * Entries never expire — content hash IS the invalidation key.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const memoryCache = new Map<string, unknown>();

function cacheDir(): string {
  const dir = process.env.COMPOSE_CACHE_DIR || join(tmpdir(), 'compose-cache');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function cachePath(namespace: string, key: string): string {
  // Two-level fanout to avoid thousands of files in one directory.
  const shard = key.slice(0, 2);
  const dir = join(cacheDir(), namespace, shard);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, `${key.slice(2)}.json`);
}

/**
 * Compute a stable content key from arbitrary input. Objects are serialized
 * via JSON.stringify with sorted keys for determinism. Buffers are hashed
 * directly.
 */
export function contentKey(...parts: Array<Buffer | string | number | object>): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    if (Buffer.isBuffer(part)) {
      hash.update(part);
    } else if (typeof part === 'string') {
      hash.update(part);
    } else if (typeof part === 'number') {
      hash.update(String(part));
    } else {
      hash.update(stableStringify(part));
    }
    hash.update('|'); // separator between parts
  }
  return hash.digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Get from cache or compute. The compute function only runs on miss.
 *
 * @param namespace  Logical bucket name (e.g. 'vlm-page', 'semantic').
 * @param key        Content hash from contentKey().
 * @param compute    Returns the value to cache on miss.
 */
export async function getCached<T>(
  namespace: string,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  const memKey = `${namespace}:${key}`;
  if (memoryCache.has(memKey)) {
    return memoryCache.get(memKey) as T;
  }

  const filePath = cachePath(namespace, key);
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as T;
      memoryCache.set(memKey, parsed);
      return parsed;
    } catch {
      // Corrupted entry — fall through to recompute.
    }
  }

  const value = await compute();
  memoryCache.set(memKey, value);
  try {
    writeFileSync(filePath, JSON.stringify(value), 'utf-8');
  } catch {
    // Disk write failures shouldn't break the call — memory still holds the result.
  }
  return value;
}

/** Clear in-process cache. Disk cache is not touched. */
export function clearMemoryCache(): void {
  memoryCache.clear();
}
