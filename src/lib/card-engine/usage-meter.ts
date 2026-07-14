/**
 * usage-meter.ts — per-generation token-usage accumulator, so deck cost can be
 * logged to docs/metrics/deck-cost-log.csv from the LIVE pipeline (it was only
 * ever backfilled by hand before).
 *
 * Request-scoped via AsyncLocalStorage: `beginUsageMeter()` is called once at the
 * top of generateStructuredDeck, then every OpenAI call (text-gen in the provider,
 * vision in vlm-judge) calls `recordUsage(...)`. Because each generation request
 * runs in its own async context, concurrent generations DON'T co-mingle — each
 * sees its own store. `recordUsage` is a no-op outside a metered generation, so
 * unrelated callers (e.g. image-gen elsewhere) are unaffected.
 *
 * Tokens stored as billed: `input` = full prompt tokens (INCLUDING cached),
 * `cached` = the cached portion (billed at half), `output` = completion tokens.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export type UsageKind = 'textgen' | 'vision' | 'image';

export interface UsageBucket {
  input: number;
  cached: number;
  output: number;
  calls: number;
}
export interface UsageStore {
  textgen: UsageBucket;
  vision: UsageBucket;
  image: UsageBucket;
}

const freshBucket = (): UsageBucket => ({ input: 0, cached: 0, output: 0, calls: 0 });
const freshStore = (): UsageStore => ({ textgen: freshBucket(), vision: freshBucket(), image: freshBucket() });

const als = new AsyncLocalStorage<UsageStore>();

/** Start a usage meter for the current generation's async context. */
export function beginUsageMeter(): void {
  als.enterWith(freshStore());
}

/** Record one API call's token usage into the active meter (no-op if none active). */
export function recordUsage(kind: UsageKind, u: { input: number; cached: number; output: number }): void {
  const store = als.getStore();
  if (!store) return;
  const b = store[kind];
  b.input += u.input || 0;
  b.cached += u.cached || 0;
  b.output += u.output || 0;
  b.calls += 1;
}

/** Read the active meter's totals (null if no metered generation is running). */
export function readUsageMeter(): UsageStore | null {
  return als.getStore() ?? null;
}
