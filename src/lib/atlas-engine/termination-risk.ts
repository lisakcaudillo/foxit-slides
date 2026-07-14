/**
 * Termination risk aggregation — TypeScript port of
 * atlas/engine/comparison/termination_risk.py (ATLAS-026)
 *
 * Scans AlignmentResult objects for termination-related clauses and produces
 * a structured risk assessment. Deterministic — no LLM calls.
 */

import type { AlignmentResult, RiskLevel, TerminationRiskSummary } from './types';

// ---------------------------------------------------------------------------
// Recommendations by risk level
// ---------------------------------------------------------------------------

const RECOMMENDATIONS: Record<RiskLevel, string> = {
  high: 'Immediate legal review required',
  moderate: 'Review recommended',
  low: 'Standard review',
  none: 'No termination changes detected',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isTermination(result: AlignmentResult): boolean {
  return result.clause_type_a === 'termination' || result.clause_type_b === 'termination';
}

function isChanged(result: AlignmentResult): boolean {
  return result.classification !== 'unchanged';
}

function computeRiskLevel(
  highestPriority: number,
  hasUnverified: boolean,
  hasNumericOverride: boolean,
  changeCount: number,
): RiskLevel {
  if (changeCount === 0) return 'none';
  if (highestPriority >= 0.7 || hasUnverified || hasNumericOverride) return 'high';
  if (highestPriority >= 0.4) return 'moderate';
  return 'low';
}

function buildKeyFindings(
  changedResults: AlignmentResult[],
  hasUnverified: boolean,
  hasNumericOverride: boolean,
): string[] {
  const findings: string[] = [];

  // Deletions first (highest impact)
  for (const r of changedResults) {
    if (r.classification === 'deleted' && findings.length < 5) {
      const cn = r.clause_number ?? 'unknown';
      findings.push(`Termination clause ${cn} was deleted`);
    }
  }

  // Unverified summaries
  if (hasUnverified) {
    for (const r of changedResults) {
      if (findings.length >= 5) break;
      if (r.summary_verified === false) {
        const cn = r.clause_number ?? 'unknown';
        findings.push(
          `Impact summary for clause ${cn} could not be verified against source text`,
        );
      }
    }
  }

  // Numeric overrides
  if (hasNumericOverride) {
    for (const r of changedResults) {
      if (findings.length >= 5) break;
      if (r.match_signals?.numeric_override) {
        const cn = r.clause_number ?? 'unknown';
        findings.push(`Numeric values changed in termination clause ${cn}`);
      }
    }
  }

  // Type reclassifications involving termination (ATLAS-027)
  for (const r of changedResults) {
    if (findings.length >= 5) break;
    if (r.type_change) {
      const cn = r.clause_number ?? 'unknown';
      findings.push(`Clause ${cn} reclassified: ${r.type_change}`);
    }
  }

  // Added clauses
  for (const r of changedResults) {
    if (r.classification === 'added' && findings.length < 5) {
      const cn = r.clause_number ?? 'unknown';
      findings.push(`Termination clause ${cn} was added`);
    }
  }

  // Remaining changes by descending priority
  const remaining = changedResults.filter(
    (r) => r.classification === 'changed' || r.classification === 'moved',
  );
  remaining.sort((a, b) => b.review_priority - a.review_priority);
  for (const r of remaining) {
    if (findings.length >= 5) break;
    const cn = r.clause_number ?? 'unknown';
    findings.push(`Termination clause ${cn} was ${r.classification}`);
  }

  // Count summary if multiple changes
  if (changedResults.length > 1) {
    const countFinding = `${changedResults.length} termination clauses modified across both document versions`;
    if (!findings.includes(countFinding) && findings.length < 5) {
      findings.unshift(countFinding);
      if (findings.length > 5) {
        findings.length = 5;
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assess termination risk across all alignment results.
 *
 * Filters to termination clauses, aggregates signals, and returns a
 * structured risk summary with findings and recommendations.
 */
export function assessTerminationRisk(results: AlignmentResult[]): TerminationRiskSummary {
  const termination = results.filter(isTermination);
  const changed = termination.filter(isChanged);

  if (changed.length === 0) {
    return {
      risk_level: 'none',
      termination_change_count: 0,
      avg_calibrated_confidence: 0.0,
      has_unverified: false,
      has_numeric_override: false,
      highest_review_priority: 0.0,
      key_findings: [],
      affected_clauses: [],
      recommendation: RECOMMENDATIONS.none,
    };
  }

  // Aggregate signals
  const confidences: number[] = [];
  const priorities: number[] = [];
  let hasUnverified = false;
  let hasNumericOverride = false;
  const affected: string[] = [];

  for (const r of changed) {
    if (r.match_signals) {
      confidences.push(r.match_signals.calibrated_confidence);
      if (r.match_signals.numeric_override) {
        hasNumericOverride = true;
      }
    }
    priorities.push(r.review_priority);
    if (r.summary_verified === false) {
      hasUnverified = true;
    }
    const cn = r.clause_number;
    if (cn && !affected.includes(cn)) {
      affected.push(cn);
    }
  }

  const avgConf =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10000) / 10000
      : 0.0;
  const highestPriority = priorities.length > 0 ? Math.max(...priorities) : 0.0;

  const riskLevel = computeRiskLevel(highestPriority, hasUnverified, hasNumericOverride, changed.length);
  const findings = buildKeyFindings(changed, hasUnverified, hasNumericOverride);

  return {
    risk_level: riskLevel,
    termination_change_count: changed.length,
    avg_calibrated_confidence: avgConf,
    has_unverified: hasUnverified,
    has_numeric_override: hasNumericOverride,
    highest_review_priority: Math.round(highestPriority * 10000) / 10000,
    key_findings: findings,
    affected_clauses: affected,
    recommendation: RECOMMENDATIONS[riskLevel],
  };
}
