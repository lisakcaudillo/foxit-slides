/**
 * Review priority scoring — TypeScript port of atlas/engine/comparison/scoring.py
 *
 * Computes a 0.0-1.0 review priority score for each alignment result,
 * ranking changes by how urgently they need human review.
 *
 * Weighted formula (ATLAS-027):
 *   confidence_penalty (0.30) + verification_flag (0.22) +
 *   certainty_penalty (0.13) + clause_risk (0.13) + override_flag (0.07) +
 *   type_change (0.15)
 *
 * "unchanged" classifications always return 0.0.
 */

import type { CertaintyLevel } from './types';

// Weight vector (ATLAS-027: rebalanced to include type_change)
const W_CONFIDENCE = 0.30;
const W_VERIFICATION = 0.22;
const W_CERTAINTY = 0.13;
const W_CLAUSE_RISK = 0.13;
const W_OVERRIDE = 0.07;
const W_TYPE_CHANGE = 0.15;

/** Clause types that carry higher inherent risk. */
const HIGH_RISK_TYPES = new Set(['termination', 'condition-precedent']);
const MEDIUM_RISK_TYPES = new Set(['obligation', 'representation']);

/** Confidence band thresholds: high >= 0.85, medium 0.70-0.84, low < 0.70 */
export function confidenceBand(calibratedConfidence: number): 'high' | 'medium' | 'low' {
  if (calibratedConfidence >= 0.85) return 'high';
  if (calibratedConfidence >= 0.70) return 'medium';
  return 'low';
}

export interface ReviewPriorityInput {
  classification: string;
  calibrated_confidence: number;
  confidence_band: string;
  summary_verified: boolean | null;
  certainty_level: CertaintyLevel | null;
  clause_type: string | null;
  numeric_override?: boolean;
  type_change?: string | null;
}

/**
 * Compute a review priority score in [0.0, 1.0].
 *
 * Higher = needs review more urgently.
 * "unchanged" always returns 0.0.
 */
export function computeReviewPriority(input: ReviewPriorityInput): number {
  const {
    classification,
    calibrated_confidence,
    summary_verified,
    certainty_level,
    clause_type,
    numeric_override = false,
    type_change = null,
  } = input;

  if (classification === 'unchanged') return 0.0;

  // 1. Confidence penalty: lower confidence -> higher priority
  const confPenalty = 1.0 - Math.min(Math.max(calibrated_confidence, 0.0), 1.0);

  // 2. Verification flag
  let verifScore: number;
  if (summary_verified === false) {
    verifScore = 1.0;
  } else if (summary_verified === null) {
    verifScore = 0.5;
  } else {
    verifScore = 0.0;
  }

  // 3. Certainty penalty
  const certMap: Record<string, number> = {
    ambiguous: 1.0,
    conditional: 0.5,
    definitive: 0.0,
  };
  const certScore = certMap[certainty_level ?? ''] ?? 0.5;

  // 4. Clause risk
  let riskScore: number;
  if (clause_type && HIGH_RISK_TYPES.has(clause_type)) {
    riskScore = 1.0;
  } else if (clause_type && MEDIUM_RISK_TYPES.has(clause_type)) {
    riskScore = 0.5;
  } else {
    riskScore = 0.2;
  }

  // 5. Override flag (numeric diff override fired)
  const overrideScore = numeric_override ? 1.0 : 0.0;

  // 6. Type change flag (ATLAS-027)
  const typeChangeScore = type_change ? 1.0 : 0.0;

  // Weighted sum
  const priority =
    W_CONFIDENCE * confPenalty +
    W_VERIFICATION * verifScore +
    W_CERTAINTY * certScore +
    W_CLAUSE_RISK * riskScore +
    W_OVERRIDE * overrideScore +
    W_TYPE_CHANGE * typeChangeScore;

  return Math.round(Math.min(Math.max(priority, 0.0), 1.0) * 10000) / 10000;
}
