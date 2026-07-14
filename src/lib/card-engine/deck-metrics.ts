/**
 * deck-metrics.ts — append one row per generated deck to docs/metrics so we can
 * watch generation health over time: how long it took (fill vs judge vs revise),
 * how the visual critic scored it, and whether it stayed under the request cap.
 *
 * Writes are best-effort and fully guarded: a failure here (read-only FS in
 * serverless, permissions, a concurrent write) NEVER affects generation — the
 * deck is already built by the time this runs. Intended for the LOCAL dev/bench
 * workflow (Lisa's machine), where docs/metrics is writable; in a read-only
 * deploy it silently no-ops.
 *
 * The companion `deck-cost-log.csv` (the June-2026 benchmark) tracks COST but no
 * timing; this live log is timing-first (the lever for the 120s request cap) and
 * keeps the per-slide critic verdicts inline for quick scanning.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { UsageStore, UsageBucket } from './usage-meter';

export interface DeckGenMetric {
  timestamp: string; // ISO
  deckId: string;
  prompt: string;
  source: string; // attached file name, or 'prompt-only'
  skin: string;
  slideCount: number;
  layouts: string[]; // per-slide layout keys, in order
  density: string;
  judgeEnabled: boolean;
  judgeConcurrency: number;
  totalMs: number;
  fillMs: number; // plan + fill (the part that actually builds the deck)
  judgeMs: number; // first visual-critic pass
  reviseMs: number; // auto-revise pass(es)
  judged: number; // slides the critic actually scored
  judgeFails: number; // slides failing after revise
  revisions: number; // slides re-built by the revise loop
  verdicts: string[]; // e.g. ["0:PASS", "3:FAIL[L2,L6]"] — only non-passes + summary
  status: 'ok' | 'error';
  // Deterministic fit gate (geometry-audit) — math, not vision. Summary counts;
  // full per-block detail goes to the per-deck geometry.json (writeDeckDetail).
  geomBlocks: number; // structured text blocks audited
  geomOverBudget: number; // content exceeds the slot's char budget
  geomFontShrunk: number; // font shrank well below the slot's intended size
  geomSparse: number; // content well under the density target
  geomOverflowV: number; // a line taller than its box
  geomWorstShrink: number; // largest font shrink (0..1)
  geomFlagged: string[]; // layout-qualified refs of flagged blocks, e.g. "cover-block2:fontShrunk"
}

const CSV_NAME = 'generation-log.csv';
const COLUMNS: (keyof DeckGenMetric)[] = [
  'timestamp', 'deckId', 'prompt', 'source', 'skin', 'slideCount', 'layouts',
  'density', 'judgeEnabled', 'judgeConcurrency', 'totalMs', 'fillMs', 'judgeMs',
  'reviseMs', 'judged', 'judgeFails', 'revisions', 'verdicts', 'status',
  'geomBlocks', 'geomOverBudget', 'geomFontShrunk', 'geomSparse', 'geomOverflowV',
  'geomWorstShrink', 'geomFlagged',
];

/** Find docs/metrics from the running process. `next dev` runs with cwd=app/, so
 *  it's usually ../docs/metrics; a repo-root launch makes it ./docs/metrics. */
async function resolveMetricsDir(): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), 'docs', 'metrics'),
    path.join(process.cwd(), '..', 'docs', 'metrics'),
  ];
  for (const dir of candidates) {
    try {
      await fs.access(dir);
      return dir;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** CSV-escape: wrap in quotes and double internal quotes; collapse newlines. */
function csv(value: unknown): string {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toRow(m: DeckGenMetric): string {
  return [
    csv(m.timestamp), csv(m.deckId), csv(m.prompt.slice(0, 240)), csv(m.source),
    csv(m.skin), m.slideCount, csv(m.layouts.join('|')), csv(m.density),
    m.judgeEnabled, m.judgeConcurrency, m.totalMs, m.fillMs, m.judgeMs, m.reviseMs,
    m.judged, m.judgeFails, m.revisions, csv(m.verdicts.join(' ')), m.status,
    m.geomBlocks, m.geomOverBudget, m.geomFontShrunk, m.geomSparse, m.geomOverflowV,
    Math.round(m.geomWorstShrink * 100) / 100, csv(m.geomFlagged.join(' ')),
  ].join(',');
}

/** Write the full per-deck detail (per-slide, per-block fit audit) as JSON under
 *  docs/metrics/decks/<deckId>/geometry.json — the deep-dive companion to the
 *  one-row CSV summary. Best-effort; never throws. */
export async function writeDeckDetail(deckId: string, detail: unknown): Promise<void> {
  try {
    const dir = await resolveMetricsDir();
    if (!dir) return;
    const safeId = (deckId || 'deck').replace(/[^a-zA-Z0-9_-]/g, '_');
    const deckDir = path.join(dir, 'decks', safeId);
    await fs.mkdir(deckDir, { recursive: true });
    await fs.writeFile(path.join(deckDir, 'geometry.json'), JSON.stringify(detail, null, 2), 'utf8');
  } catch {
    // Never let metrics logging affect generation.
  }
}

/** Append one generation to docs/metrics/generation-log.csv. Best-effort. */
export async function logDeckGeneration(metric: DeckGenMetric): Promise<void> {
  try {
    const dir = await resolveMetricsDir();
    if (!dir) return;
    const file = path.join(dir, CSV_NAME);
    let needsHeader = false;
    try {
      await fs.access(file);
    } catch {
      needsHeader = true;
    }
    const line = (needsHeader ? COLUMNS.join(',') + '\n' : '') + toRow(metric) + '\n';
    await fs.appendFile(file, line, 'utf8');
  } catch {
    // Never let metrics logging affect generation.
  }
}

// ── COST LOG (deck-cost-log.csv) ───────────────────────────────────────────────
// The June-2026 benchmark sheet was hand-backfilled; this appends a row per LIVE
// generation from the usage meter. Schema MUST match the existing 33-column header.
const COST_CSV = 'deck-cost-log.csv';
const COST_COLUMNS = [
  'date', 'deck_id', 'prompt_id', 'domain', 'difficulty', 'has_numbers', 'content_type',
  'pipeline_commit', 'model', 'slide_count', 'images_used', 'input_tokens',
  'cached_input_tokens', 'output_tokens', 'total_tokens', 'textgen_$', 'judge_$',
  'image_$', 'total_$', 'cost_per_slide', 'total_api_calls', 'gen_calls', 'judge_calls',
  'revise_calls', 'judge_fails', 'revisions', 'fabricated_metrics', 'markdown_bleed',
  'status', 'price_version', 'quality_score', 'notes', 'body_words_p50',
];

const PRICE_VERSION = '2026-06';
// $ per 1,000,000 tokens. cached input billed at half. price_version-stamped so a
// re-price is auditable. Vision tokens are billed at the same gpt-4o input rate.
const PRICES: Record<string, { in: number; cached: number; out: number }> = {
  'gpt-4o': { in: 2.5, cached: 1.25, out: 10.0 },
};

function bucketCost(b: UsageBucket, p: { in: number; cached: number; out: number }): number {
  return ((b.input - b.cached) * p.in + b.cached * p.cached + b.output * p.out) / 1e6;
}
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export interface DeckCostInput {
  date: string; // YYYY-MM-DD
  deckId: string;
  model: string;
  slideCount: number;
  imagesUsed: number;
  hasNumbers: boolean;
  usage: UsageStore;
  judgeFails: number;
  revisions: number;
  status?: string;
  notes?: string;
}

/** Append one live generation's cost to docs/metrics/deck-cost-log.csv. Best-effort. */
export async function appendCostRow(input: DeckCostInput): Promise<void> {
  try {
    const dir = await resolveMetricsDir();
    if (!dir) return;
    const p = PRICES[input.model] ?? PRICES['gpt-4o'];
    const u = input.usage;
    const textgen$ = bucketCost(u.textgen, p);
    const judge$ = bucketCost(u.vision, p);
    const image$ = bucketCost(u.image, p);
    const total$ = textgen$ + judge$ + image$;
    const inputTok = u.textgen.input + u.vision.input + u.image.input;
    const cachedTok = u.textgen.cached + u.vision.cached + u.image.cached;
    const outputTok = u.textgen.output + u.vision.output + u.image.output;
    const totalTok = inputTok + outputTok;
    const apiCalls = u.textgen.calls + u.vision.calls + u.image.calls;
    const cps = input.slideCount > 0 ? total$ / input.slideCount : 0;

    // Column order MUST match COST_COLUMNS / the existing header. Unknown fields
    // (domain, difficulty, content_type, fabricated_metrics, markdown_bleed,
    // quality_score, body_words_p50) are left blank — backfill is hand-tagged.
    const row = [
      csv(input.date), csv(input.deckId), '', '', '', input.hasNumbers ? 'true' : 'false', '',
      '', csv(input.model), input.slideCount, input.imagesUsed, inputTok,
      cachedTok, outputTok, totalTok, r4(textgen$), r4(judge$),
      r4(image$), r4(total$), r4(cps), apiCalls, u.textgen.calls, u.vision.calls,
      input.revisions, input.judgeFails, input.revisions, '', '',
      csv(input.status ?? 'ok'), PRICE_VERSION, '', csv(input.notes ?? 'live'), '',
    ].join(',');

    const file = path.join(dir, COST_CSV);
    let needsHeader = false;
    try { await fs.access(file); } catch { needsHeader = true; }
    await fs.appendFile(file, (needsHeader ? COST_COLUMNS.join(',') + '\n' : '') + row + '\n', 'utf8');
  } catch {
    // Never let cost logging affect generation.
  }
}
