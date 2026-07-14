/**
 * Document aligner — local structural alignment and 5-class delta classification.
 *
 * Replaces the Python aligner.py with a pure TypeScript implementation that
 * runs entirely in-process (no Python, no Atlas HTTP calls).
 *
 * Uses Jaccard word similarity instead of embeddings, and SequenceMatcher-style
 * ratio (via LCS) for text comparison.
 *
 * Ported from: atlas/engine/comparison/aligner.py
 */

import type { TextChunk } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DeltaClassification =
  | "unchanged"
  | "changed"
  | "deleted"
  | "added"
  | "moved";

export type ConfidenceBand = "high" | "medium" | "low";
export type CertaintyLevel = "definitive" | "conditional" | "ambiguous";
export type SourceMode = "extraction" | "synthesis" | "hybrid";

export interface MatchSignals {
  confidence_score: number;
  clause_id_match: boolean;
  anchor_term_overlap: number;
  calibrated_confidence: number;
  confidence_band: ConfidenceBand;
  text_similarity: number;
  numeric_override: boolean;
}

export interface AlignmentResult {
  chunk_id_a: number | null;
  chunk_id_b: number | null;
  classification: DeltaClassification;
  section_id: string | null;
  clause_number: string | null;
  page_a: number | null;
  page_b: number | null;
  combined_score: number;
  text_a: string | null;
  text_b: string | null;
  impact_summary: string | null;
  match_signals: MatchSignals | null;
  summary_verified: boolean | null;
  hedged_summary: string | null;
  certainty_level: CertaintyLevel | null;
  clause_type_a: string | null;
  clause_type_b: string | null;
  page_span_end_a: number | null;
  page_span_end_b: number | null;
  source_mode: SourceMode;
  review_priority: number;
  type_change: string | null;
}

// ---------------------------------------------------------------------------
// Numeric diff detection (European formats)
// ---------------------------------------------------------------------------

const NUMBER_RE =
  /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+(?:\.\d+)?\s*%|\b\d{4}\b|\b\d+\b/g;

function extractNumbers(text: string): Set<string> {
  return new Set(text.match(NUMBER_RE) ?? []);
}

function numbersDiffer(textA: string | null, textB: string | null): boolean {
  if (!textA || !textB) return false;
  const numsA = extractNumbers(textA);
  const numsB = extractNumbers(textB);
  if (numsA.size !== numsB.size) return true;
  for (const n of numsA) {
    if (!numsB.has(n)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Anchor term overlap (22 legal terms)
// ---------------------------------------------------------------------------

const ANCHOR_TERMS: ReadonlySet<string> = new Set([
  "terminat", "liabilit", "indemnif", "payment", "invoice", "fee",
  "notice", "confidential", "arbitrat", "governing", "jurisdiction",
  "intellectual", "warranty", "represent", "covenant", "default",
  "force majeure", "assignment", "subcontract", "amendment",
  "entire agreement", "non-compet", "solicit",
]);

function anchorOverlap(textA: string | null, textB: string | null): number {
  if (!textA || !textB) return 0.0;
  const aLower = textA.toLowerCase();
  const bLower = textB.toLowerCase();
  const hitsA = new Set<string>();
  const hitsB = new Set<string>();
  for (const t of ANCHOR_TERMS) {
    if (aLower.includes(t)) hitsA.add(t);
    if (bLower.includes(t)) hitsB.add(t);
  }
  const union = new Set([...hitsA, ...hitsB]);
  if (union.size === 0) return 0.0;
  const intersection = new Set([...hitsA].filter((t) => hitsB.has(t)));
  return Math.round((intersection.size / union.size) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Clause ID prefix matching
// ---------------------------------------------------------------------------

function clauseIdMatch(numA: string | null | undefined, numB: string | null | undefined): boolean {
  if (!numA || !numB) return false;
  const a = numA.trim();
  const b = numB.trim();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// ---------------------------------------------------------------------------
// Text similarity — Jaccard word overlap
// ---------------------------------------------------------------------------

export function wordSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// ---------------------------------------------------------------------------
// SequenceMatcher-style ratio (LCS-based)
// ---------------------------------------------------------------------------

function normalizeForComparison(text: string): string {
  // NFKC normalization + collapse whitespace
  return text.normalize("NFKC").split(/\s+/).join(" ").trim();
}

/**
 * Compute a SequenceMatcher-like ratio using LCS on words.
 * Returns 2 * lcs_length / (len_a + len_b).
 */
function sequenceRatio(textA: string, textB: string): number {
  const wordsA = textA.split(/\s+/).filter(Boolean);
  const wordsB = textB.split(/\s+/).filter(Boolean);
  const m = wordsA.length;
  const n = wordsB.length;
  if (m === 0 && n === 0) return 1.0;
  if (m === 0 || n === 0) return 0.0;

  // LCS via DP (word-level)
  // Use rolling array to save memory for large texts
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  const lcsLen = prev[n];
  return (2 * lcsLen) / (m + n);
}

// ---------------------------------------------------------------------------
// Type-aware alignment thresholds (ATLAS-023)
// ---------------------------------------------------------------------------

interface AlignmentThresholds {
  unchanged_min: number;
  changed_min: number;
  moved_min: number;
}

const TYPE_THRESHOLDS: Record<string, AlignmentThresholds> = {
  "definition":          { unchanged_min: 0.97, changed_min: 0.55, moved_min: 0.30 },
  "condition-precedent": { unchanged_min: 0.97, changed_min: 0.55, moved_min: 0.30 },
  "termination":         { unchanged_min: 0.96, changed_min: 0.58, moved_min: 0.30 },
  "obligation":          { unchanged_min: 0.95, changed_min: 0.60, moved_min: 0.30 },
  "representation":      { unchanged_min: 0.95, changed_min: 0.60, moved_min: 0.30 },
};

const DEFAULT_THRESHOLDS: AlignmentThresholds = {
  unchanged_min: 0.95,
  changed_min: 0.60,
  moved_min: 0.30,
};

function getThresholds(
  clauseTypeA: string | null | undefined,
  clauseTypeB: string | null | undefined,
): AlignmentThresholds {
  const thA = TYPE_THRESHOLDS[clauseTypeA ?? ""] ?? DEFAULT_THRESHOLDS;
  const thB = TYPE_THRESHOLDS[clauseTypeB ?? ""] ?? DEFAULT_THRESHOLDS;
  return {
    unchanged_min: Math.max(thA.unchanged_min, thB.unchanged_min),
    changed_min: Math.min(thA.changed_min, thB.changed_min),
    moved_min: Math.min(thA.moved_min, thB.moved_min),
  };
}

// ---------------------------------------------------------------------------
// Type change detection (ATLAS-027)
// ---------------------------------------------------------------------------

function detectTypeChange(
  clauseTypeA: string | null | undefined,
  clauseTypeB: string | null | undefined,
  classification: string,
): string | null {
  if (classification === "added" || classification === "deleted") return null;
  if (!clauseTypeA || !clauseTypeB) return null;
  if (clauseTypeA === clauseTypeB) return null;
  return `${clauseTypeA} \u2192 ${clauseTypeB}`;
}

// ---------------------------------------------------------------------------
// Confidence calibration (inlined from calibration.py)
// ---------------------------------------------------------------------------

const BAND_HIGH = 0.85;
const BAND_MEDIUM = 0.65;

const TYPE_DIFFICULTY: Record<string, number> = {
  "definition": 0.03,
  "condition-precedent": 0.03,
  "termination": 0.02,
};

function computeBand(score: number): ConfidenceBand {
  if (score >= BAND_HIGH) return "high";
  if (score >= BAND_MEDIUM) return "medium";
  return "low";
}

interface CalibratedScore {
  calibrated: number;
  band: ConfidenceBand;
  raw: number;
  text_similarity: number;
  signals_agree: boolean;
}

function calibrateConfidence(params: {
  rawConfidence: number;
  clauseIdMatch: boolean;
  anchorTermOverlap: number;
  textSimilarity: number | null;
  clauseType: string | null;
  classification: string;
  numericOverride: boolean;
  typeChange: string | null;
}): CalibratedScore {
  let score = params.rawConfidence;
  const hasTextSim = params.textSimilarity !== null;
  const textSim = hasTextSim ? params.textSimilarity! : params.rawConfidence;

  // 1. Structural agreement bonus/penalty
  if (params.classification === "changed" || params.classification === "unchanged") {
    if (params.clauseIdMatch) {
      score += 0.03;
    } else {
      score -= 0.10;
    }
  }

  // 2. Text similarity cross-check
  let signalsAgree = true;
  if (hasTextSim && (params.classification === "changed" || params.classification === "moved")) {
    signalsAgree = textSim < 0.90;
    if (!signalsAgree) {
      score -= (textSim - 0.80) * 0.5;
    }
  } else if (hasTextSim && params.classification === "unchanged") {
    signalsAgree = textSim >= 0.80;
    if (!signalsAgree) {
      score -= (0.80 - textSim) * 0.5;
    }
  }

  // 3. Type-difficulty adjustment
  if (params.clauseType && params.clauseType in TYPE_DIFFICULTY) {
    score -= TYPE_DIFFICULTY[params.clauseType] ?? 0;
  }

  // 4. Numeric override penalty
  if (params.numericOverride) {
    score -= 0.02;
  }

  // 5. Type change penalty (ATLAS-027)
  if (params.typeChange) {
    score -= 0.04;
  }

  // Clamp
  score = Math.max(0.0, Math.min(1.0, Math.round(score * 1000) / 1000));

  return {
    calibrated: score,
    band: computeBand(score),
    raw: params.rawConfidence,
    text_similarity: Math.round(textSim * 1000) / 1000,
    signals_agree: signalsAgree,
  };
}

// ---------------------------------------------------------------------------
// Hedging (inlined from hedging.py)
// ---------------------------------------------------------------------------

interface HedgedResult {
  hedged_summary: string;
  certainty_level: CertaintyLevel;
  original_summary: string;
}

type HedgeKey = `${ConfidenceBand}:${string}`;

const HEDGE_PREFIX: Record<string, string> = {
  "high:true": "",
  "high:null": "This analysis indicates that ",
  "high:false": "This analysis suggests that ",
  "medium:true": "It appears that ",
  "medium:null": "It appears that ",
  "medium:false": "It appears that ",
  "low:true": "It may be the case that ",
  "low:null": "It may be the case that ",
  "low:false": "It may be the case that ",
};

const CERTAINTY_MAP: Record<string, CertaintyLevel> = {
  "high:true": "definitive",
  "high:null": "conditional",
  "high:false": "ambiguous",
  "medium:true": "conditional",
  "medium:null": "conditional",
  "medium:false": "conditional",
  "low:true": "ambiguous",
  "low:null": "ambiguous",
  "low:false": "ambiguous",
};

const VERIFICATION_WARNING =
  " (Note: this summary could not be fully verified against the source text.)";
const JURISDICTION_NOTE = " Jurisdiction-specific interpretation may apply.";
const JURISDICTION_TYPES = new Set(["termination", "condition-precedent"]);

function lowercaseFirst(text: string): string {
  if (!text) return text;
  if (text.length >= 2 && text[1] === text[1].toUpperCase() && text[1] !== text[1].toLowerCase()) {
    return text; // likely acronym
  }
  const firstWord = text.split(/\s+/)[0] ?? text;
  if (firstWord === firstWord.toUpperCase() && firstWord.length > 1) {
    return text; // all-caps word
  }
  return text[0].toLowerCase() + text.slice(1);
}

function applyHedging(
  impactSummary: string | null,
  confidenceBand: ConfidenceBand,
  summaryVerified: boolean | null,
  clauseType: string | null,
): HedgedResult | null {
  if (!impactSummary) return null;

  const verifiedStr = summaryVerified === null ? "null" : String(summaryVerified);
  const key = `${confidenceBand}:${verifiedStr}`;
  const prefix = HEDGE_PREFIX[key] ?? "It appears that ";
  const certainty = CERTAINTY_MAP[key] ?? "conditional";

  let hedged: string;
  if (prefix) {
    hedged = prefix + lowercaseFirst(impactSummary);
  } else {
    hedged = impactSummary;
  }

  if (summaryVerified === false) {
    hedged += VERIFICATION_WARNING;
  }

  if (confidenceBand === "low" && clauseType && JURISDICTION_TYPES.has(clauseType)) {
    hedged += JURISDICTION_NOTE;
  }

  return {
    hedged_summary: hedged,
    certainty_level: certainty,
    original_summary: impactSummary,
  };
}

// ---------------------------------------------------------------------------
// Review priority scoring (inlined from scoring.py, ATLAS-025)
// ---------------------------------------------------------------------------

const W_CONFIDENCE = 0.30;
const W_VERIFICATION = 0.22;
const W_CERTAINTY = 0.13;
const W_CLAUSE_RISK = 0.13;
const W_OVERRIDE = 0.07;
const W_TYPE_CHANGE = 0.15;

const HIGH_RISK_TYPES = new Set(["termination", "condition-precedent"]);
const MEDIUM_RISK_TYPES = new Set(["obligation", "representation"]);

function computeReviewPriority(params: {
  classification: string;
  calibratedConfidence: number;
  confidenceBand: ConfidenceBand;
  summaryVerified: boolean | null;
  certaintyLevel: CertaintyLevel | null;
  clauseType: string | null;
  numericOverride: boolean;
  typeChange: string | null;
}): number {
  if (params.classification === "unchanged") return 0.0;

  const confPenalty = 1.0 - Math.min(Math.max(params.calibratedConfidence, 0.0), 1.0);

  let verifScore: number;
  if (params.summaryVerified === false) verifScore = 1.0;
  else if (params.summaryVerified === null) verifScore = 0.5;
  else verifScore = 0.0;

  const certMap: Record<string, number> = { ambiguous: 1.0, conditional: 0.5, definitive: 0.0 };
  const certScore = certMap[params.certaintyLevel ?? ""] ?? 0.5;

  let riskScore: number;
  if (params.clauseType && HIGH_RISK_TYPES.has(params.clauseType)) riskScore = 1.0;
  else if (params.clauseType && MEDIUM_RISK_TYPES.has(params.clauseType)) riskScore = 0.5;
  else riskScore = 0.2;

  const overrideScore = params.numericOverride ? 1.0 : 0.0;
  const typeChangeScore = params.typeChange ? 1.0 : 0.0;

  const priority =
    W_CONFIDENCE * confPenalty +
    W_VERIFICATION * verifScore +
    W_CERTAINTY * certScore +
    W_CLAUSE_RISK * riskScore +
    W_OVERRIDE * overrideScore +
    W_TYPE_CHANGE * typeChangeScore;

  return Math.round(Math.min(Math.max(priority, 0.0), 1.0) * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Chunk interface for alignment input
// ---------------------------------------------------------------------------

export interface AlignmentChunk {
  chunk_id: number;
  text: string;
  clause_number?: string;
  heading_text?: string;
  page_number?: number;
  page_span_end?: number;
  section_id?: string;
  clause_type?: string;
}

// ---------------------------------------------------------------------------
// Local alignment (no LLM)
// ---------------------------------------------------------------------------

interface LocalMatch {
  id_a: number | null;
  id_b: number | null;
  classification: DeltaClassification;
  confidence: number;
  impact_summary: string | null;
}

function localAlign(chunksA: AlignmentChunk[], chunksB: AlignmentChunk[]): LocalMatch[] {
  const matchedB = new Set<number>();
  const results: LocalMatch[] = [];

  for (const ca of chunksA) {
    let bestId: number | null = null;
    let bestRatio = 0.0;
    let bestCb: AlignmentChunk | null = null;
    const normA = normalizeForComparison(ca.text);

    // First pass: exact clause number match
    for (const cb of chunksB) {
      if (matchedB.has(cb.chunk_id)) continue;
      if (ca.clause_number && ca.clause_number === cb.clause_number) {
        const normB = normalizeForComparison(cb.text);
        const ratio = sequenceRatio(normA, normB);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = cb.chunk_id;
          bestCb = cb;
        }
      }
    }

    // Second pass: best text similarity if no clause match
    if (bestId === null) {
      for (const cb of chunksB) {
        if (matchedB.has(cb.chunk_id)) continue;
        const normB = normalizeForComparison(cb.text);
        const ratio = sequenceRatio(normA, normB);
        if (ratio > bestRatio && ratio > 0.3) {
          bestRatio = ratio;
          bestId = cb.chunk_id;
          bestCb = cb;
        }
      }
    }

    if (bestId !== null) {
      matchedB.add(bestId);

      // ATLAS-023: per-type thresholds
      const ctA = ca.clause_type ?? null;
      const ctB = bestCb?.clause_type ?? null;
      const th = getThresholds(ctA, ctB);

      // ATLAS-027: cross-type confidence penalty
      let adjustedRatio = bestRatio;
      if (ctA && ctB && ctA !== ctB) {
        adjustedRatio *= 0.95;
      }

      let cls: DeltaClassification;
      if (adjustedRatio >= th.unchanged_min) {
        cls = "unchanged";
      } else if (adjustedRatio >= th.changed_min) {
        cls = "changed";
      } else {
        cls = "moved";
      }

      results.push({
        id_a: ca.chunk_id,
        id_b: bestId,
        classification: cls,
        confidence: Math.round(adjustedRatio * 1000) / 1000,
        impact_summary: null,
      });
    } else {
      results.push({
        id_a: ca.chunk_id,
        id_b: null,
        classification: "deleted",
        confidence: 1.0,
        impact_summary: null,
      });
    }
  }

  // Unmatched B chunks are "added"
  const allBIds = new Set(chunksB.map((cb) => cb.chunk_id));
  for (const bid of allBIds) {
    if (!matchedB.has(bid)) {
      results.push({
        id_a: null,
        id_b: bid,
        classification: "added",
        confidence: 1.0,
        impact_summary: null,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Align two document versions and classify each pair.
 *
 * This is the pure TypeScript local-only alignment (no LLM calls).
 * Uses structural matching (clause numbers) + text similarity (LCS ratio).
 *
 * Applies:
 * - Numeric diff override for misclassified "unchanged" pairs
 * - Type-aware thresholds (ATLAS-023)
 * - Type change detection (ATLAS-027)
 * - Confidence calibration
 * - Deterministic hedging
 * - Review priority scoring (ATLAS-025)
 */
export function alignAndClassify(
  chunksA: AlignmentChunk[],
  chunksB: AlignmentChunk[],
): AlignmentResult[] {
  const indexA = new Map<number, AlignmentChunk>();
  const indexB = new Map<number, AlignmentChunk>();
  for (const ch of chunksA) indexA.set(ch.chunk_id, ch);
  for (const ch of chunksB) indexB.set(ch.chunk_id, ch);

  const matches = localAlign(chunksA, chunksB);
  const results: AlignmentResult[] = [];

  for (const m of matches) {
    const chA = m.id_a !== null ? indexA.get(m.id_a) ?? null : null;
    const chB = m.id_b !== null ? indexB.get(m.id_b) ?? null : null;

    // Primary metadata from A-side, fallback to B-side
    const primary = chA ?? chB;
    const sectionId = primary?.section_id ?? null;
    const clauseNumber = primary?.clause_number ?? primary?.heading_text ?? null;

    const textA = chA?.text ?? null;
    const textB = chB?.text ?? null;
    const clauseA = chA?.clause_number ?? null;
    const clauseB = chB?.clause_number ?? null;

    let classification = m.classification;
    let confidence = m.confidence;
    let impactSummary = m.impact_summary;
    let numericOverrideFired = false;

    // Numeric diff override
    if (classification === "unchanged" && numbersDiffer(textA, textB)) {
      classification = "changed";
      impactSummary = null;
      confidence = Math.min(confidence, 0.80);
      numericOverrideFired = true;
    }

    // ATLAS-023: Type-aware unchanged override
    if (classification === "unchanged" && textA && textB) {
      const ctA = chA?.clause_type ?? null;
      const ctB = chB?.clause_type ?? null;
      const th = getThresholds(ctA, ctB);
      if (th.unchanged_min > DEFAULT_THRESHOLDS.unchanged_min) {
        const normA = normalizeForComparison(textA);
        const normB = normalizeForComparison(textB);
        const ratio = sequenceRatio(normA, normB);
        if (ratio < th.unchanged_min) {
          classification = "changed";
          impactSummary = null;
          confidence = Math.min(confidence, Math.round(ratio * 1000) / 1000);
          numericOverrideFired = true;
        }
      }
    }

    // ATLAS-027: Type change detection
    const typeChange = detectTypeChange(
      chA?.clause_type ?? null,
      chB?.clause_type ?? null,
      classification,
    );

    // Match signals
    const signals: MatchSignals = {
      confidence_score: Math.round(confidence * 1000) / 1000,
      clause_id_match: clauseIdMatch(clauseA, clauseB),
      anchor_term_overlap: anchorOverlap(textA, textB),
      calibrated_confidence: 0,
      confidence_band: "medium",
      text_similarity: 0,
      numeric_override: numericOverrideFired,
    };

    // Compute text similarity for calibration
    let textSim: number | null = null;
    if (textA && textB) {
      const normA = normalizeForComparison(textA);
      const normB = normalizeForComparison(textB);
      textSim = sequenceRatio(normA, normB);
    }

    // Calibrate confidence
    const cal = calibrateConfidence({
      rawConfidence: confidence,
      clauseIdMatch: signals.clause_id_match,
      anchorTermOverlap: signals.anchor_term_overlap,
      textSimilarity: textSim,
      clauseType: chA?.clause_type ?? chB?.clause_type ?? null,
      classification,
      numericOverride: classification === "changed" ? numbersDiffer(textA, textB) : false,
      typeChange,
    });

    signals.calibrated_confidence = cal.calibrated;
    signals.confidence_band = cal.band;
    signals.text_similarity = cal.text_similarity;

    // No verification in local mode (no LLM)
    const summaryVerified: boolean | null = null;

    // Apply hedging
    const hedged = applyHedging(
      impactSummary,
      signals.confidence_band,
      summaryVerified,
      chA?.clause_type ?? chB?.clause_type ?? null,
    );

    // Compute review priority
    const reviewPriority = computeReviewPriority({
      classification,
      calibratedConfidence: signals.calibrated_confidence,
      confidenceBand: signals.confidence_band,
      summaryVerified,
      certaintyLevel: hedged?.certainty_level ?? null,
      clauseType: chA?.clause_type ?? chB?.clause_type ?? null,
      numericOverride: numericOverrideFired,
      typeChange,
    });

    // Source mode
    let srcMode: SourceMode;
    if (impactSummary && (textA || textB)) srcMode = "hybrid";
    else if (impactSummary) srcMode = "synthesis";
    else srcMode = "extraction";

    results.push({
      chunk_id_a: m.id_a,
      chunk_id_b: m.id_b,
      classification,
      section_id: sectionId,
      clause_number: clauseNumber,
      page_a: chA?.page_number ?? null,
      page_b: chB?.page_number ?? null,
      combined_score: confidence,
      text_a: textA,
      text_b: textB,
      impact_summary: impactSummary,
      match_signals: signals,
      summary_verified: summaryVerified,
      hedged_summary: hedged?.hedged_summary ?? null,
      certainty_level: hedged?.certainty_level ?? null,
      clause_type_a: chA?.clause_type ?? null,
      clause_type_b: chB?.clause_type ?? null,
      page_span_end_a: chA?.page_span_end ?? null,
      page_span_end_b: chB?.page_span_end ?? null,
      source_mode: srcMode,
      review_priority: reviewPriority,
      type_change: typeChange,
    });
  }

  return results;
}
