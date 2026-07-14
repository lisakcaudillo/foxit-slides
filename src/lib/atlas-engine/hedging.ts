/**
 * Deterministic hedging for AI-generated impact summaries — TypeScript port of
 * atlas/engine/comparison/hedging.py
 *
 * Post-processes Claude's impact summaries with uncertainty language calibrated
 * to confidence signals. No additional LLM calls — pure string manipulation.
 *
 * ATLAS-024: Research-elevated priority. Overreliance risk > hallucination risk
 * for high-volume legal/finance workflows.
 */

import type { CertaintyLevel, HedgedResult } from './types';

// ---------------------------------------------------------------------------
// Hedging prefix lookup
// ---------------------------------------------------------------------------

type HedgeKey = `${string}:${string}`;

function hedgeKey(band: string, verified: boolean | null): HedgeKey {
  return `${band}:${String(verified)}` as HedgeKey;
}

/** Hedging prefixes by (confidence_band, summary_verified) combination. */
const HEDGE_PREFIX: Record<HedgeKey, string> = {
  [hedgeKey('high', true)]: '',
  [hedgeKey('high', null)]: 'This analysis indicates that ',
  [hedgeKey('high', false)]: 'This analysis suggests that ',
  [hedgeKey('medium', true)]: 'It appears that ',
  [hedgeKey('medium', null)]: 'It appears that ',
  [hedgeKey('medium', false)]: 'It appears that ',
  [hedgeKey('low', true)]: 'It may be the case that ',
  [hedgeKey('low', null)]: 'It may be the case that ',
  [hedgeKey('low', false)]: 'It may be the case that ',
};

/** Certainty level mapping. */
const CERTAINTY_MAP: Record<HedgeKey, CertaintyLevel> = {
  [hedgeKey('high', true)]: 'definitive',
  [hedgeKey('high', null)]: 'conditional',
  [hedgeKey('high', false)]: 'ambiguous',
  [hedgeKey('medium', true)]: 'conditional',
  [hedgeKey('medium', null)]: 'conditional',
  [hedgeKey('medium', false)]: 'conditional',
  [hedgeKey('low', true)]: 'ambiguous',
  [hedgeKey('low', null)]: 'ambiguous',
  [hedgeKey('low', false)]: 'ambiguous',
};

const VERIFICATION_WARNING =
  ' (Note: this summary could not be fully verified against the source text.)';
const JURISDICTION_NOTE = ' Jurisdiction-specific interpretation may apply.';
const JURISDICTION_TYPES = new Set(['termination', 'condition-precedent']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lowercase the first character unless it's an acronym or proper noun.
 *
 * Heuristic: keep uppercase if the first word is all-caps (e.g. "EUR", "MAC")
 * or if the second character is also uppercase (e.g. "EURIBOR").
 */
function lowercaseFirst(text: string): string {
  if (!text) return text;
  if (text.length >= 2 && text[1] === text[1].toUpperCase() && text[1] !== text[1].toLowerCase()) {
    return text; // likely acronym: "EURIBOR", "MAC", "EUR"
  }
  const firstWord = text.split(/\s+/)[0] ?? text;
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) {
    return text; // all-caps word: "ESG", "KPI"
  }
  return text[0].toLowerCase() + text.slice(1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply deterministic hedging to an impact summary.
 *
 * @param impactSummary - Raw AI-generated summary. null for non-changed classifications.
 * @param confidenceBand - "high" | "medium" | "low" from calibration.
 * @param summaryVerified - true = verified, false = flagged, null = not checked.
 * @param clauseType - Clause type for jurisdiction-specific scope notes.
 * @returns HedgedResult or null if impactSummary is falsy.
 */
export function applyHedging(
  impactSummary: string | null,
  confidenceBand: string,
  summaryVerified: boolean | null,
  clauseType: string | null = null,
): HedgedResult | null {
  if (!impactSummary) return null;

  const key = hedgeKey(confidenceBand, summaryVerified);
  const prefix = HEDGE_PREFIX[key] ?? 'It appears that ';
  const certainty: CertaintyLevel = CERTAINTY_MAP[key] ?? 'conditional';

  // Build hedged summary
  let hedged: string;
  if (prefix) {
    hedged = prefix + lowercaseFirst(impactSummary);
  } else {
    hedged = impactSummary;
  }

  // Append scope warning if verification failed
  if (summaryVerified === false) {
    hedged += VERIFICATION_WARNING;
  }

  // Append jurisdiction note for high-risk clause types at low confidence
  if (confidenceBand === 'low' && clauseType && JURISDICTION_TYPES.has(clauseType)) {
    hedged += JURISDICTION_NOTE;
  }

  return {
    hedged_summary: hedged,
    certainty_level: certainty,
    original_summary: impactSummary,
  };
}
