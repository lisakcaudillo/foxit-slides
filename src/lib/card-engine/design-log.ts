/**
 * design-log.ts — observe-only review log of Designer + Judge decisions (P1).
 *
 * Writes one CSV row per slide to app/docs/design-decisions.csv (GITIGNORED) for
 * to review. The Designer logs its decision + reasoning; the observe-only
 * Judge appends its verdict + reasoning + recommendation. There is NO feedback
 * loop — this is purely a window into how both brains reason, so their judgment
 * can be reviewed BEFORE they are ever wired to act on each other.
 *
 * Deployment-agnostic: plain fs append, runs in any Node context (a cloud
 * back-end OR a desktop app's main process). The Designer itself stays a PURE
 * module that RETURNS its reasoning as data; this is just the sink that records
 * it, kept at the I/O edge so the deployment target (cloud vs desktop) can change
 * without touching the Designer.
 *
 * ⚠ SERVER/NODE ONLY — imports `fs`. Never import this from a client component;
 * the Designer returns log data and a server caller (the engine / an API route)
 * passes it here.
 *
 * Content discipline: log DESIGN reasoning (why this form / anchor / treatment),
 * NOT the user's slide prose. Disable entirely with DESIGN_LOG=off.
 */
import { appendFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

/** app/docs/design-decisions.csv — cwd is the app root when `next dev` runs. */
const LOG_PATH = join(process.cwd(), 'docs', 'design-decisions.csv');

const COLUMNS = [
  'timestamp', 'deckId', 'slideId', 'slideType',
  'designer_decision', 'designer_reasoning',
  'result', 'judge_reasoning', 'judge_recommendation',
] as const;

export interface DesignLogRow {
  deckId: string;
  slideId: string;
  /** The slide type / role the Designer worked on (e.g. 'cover', 'process'). */
  slideType: string;
  /** What the Designer chose — form, anchor, elements, image y/n. One line. */
  designerDecision: string;
  /** WHY — which rules/signals drove the choice. The Designer's rationale. */
  designerReasoning: string;
  /** Filled by the observe-only Judge; left '' until the Judge runs. */
  result?: 'PASS' | 'FAIL' | '';
  /** WHY the Judge passed/failed it (vs which standard rule). */
  judgeReasoning?: string;
  /** How the Judge would resolve a FAIL. */
  judgeRecommendation?: string;
  /** ISO timestamp; defaults to now if omitted. */
  timestamp?: string;
}

/** CSV-escape a field (quote when it contains a comma / quote / newline). */
function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Append one review row. NEVER throws into the caller — logging must not be able
 * to break generation. No-op when DESIGN_LOG=off. Creates the file with a header
 * row on first write.
 */
export function logDesignDecision(row: DesignLogRow): void {
  if (process.env.DESIGN_LOG === 'off') return;
  try {
    if (!existsSync(LOG_PATH)) writeFileSync(LOG_PATH, COLUMNS.join(',') + '\n');
    const line = [
      row.timestamp ?? new Date().toISOString(),
      row.deckId, row.slideId, row.slideType,
      row.designerDecision, row.designerReasoning,
      row.result ?? '', row.judgeReasoning ?? '', row.judgeRecommendation ?? '',
    ].map(cell).join(',') + '\n';
    appendFileSync(LOG_PATH, line);
  } catch {
    // Dev review artifact — swallow any fs error (missing dir, read-only fs, …).
  }
}

/** The header columns, exported so the README / tests stay in sync with the code. */
export const DESIGN_LOG_COLUMNS = COLUMNS;
