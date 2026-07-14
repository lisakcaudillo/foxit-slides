/**
 * Shared types for the Atlas engine TypeScript port.
 */

export interface TextChunk {
  clause_number?: string;
  heading_text?: string;
  text: string;
  page_number: number;
  page_span_end?: number;
  char_offset?: number;
  char_end?: number;
  token_count_approx?: number;
  clause_type?: string;
  /** Optional section identifier used in heading-based classification. */
  section_id?: string;
}

/** Page text extracted from a document. */
export interface PageText {
  page_number: number;
  text: string;
}

/** A section-anchored chunk produced by the chunker. */
export interface SectionChunk {
  clause_number: string;
  heading_text: string;
  text: string;
  page_number: number;
  page_span_end: number;
  char_offset: number;
  char_end: number;
  token_count_approx: number;
}

/** Explainability signals for a single chunk alignment decision. */
export interface MatchSignals {
  confidence_score: number;
  clause_id_match: boolean;
  anchor_term_overlap: number;
  calibrated_confidence: number;
  confidence_band: ConfidenceBand;
  text_similarity: number;
  numeric_override: boolean;
}

/** Confidence band thresholds. */
export type ConfidenceBand = 'high' | 'medium' | 'low';

/** Certainty level for hedged summaries. */
export type CertaintyLevel = 'definitive' | 'conditional' | 'ambiguous';

/** Classification of a chunk alignment. */
export type AlignmentClassification = 'unchanged' | 'changed' | 'deleted' | 'added' | 'moved';

/** Result of aligning two document chunks. */
export interface AlignmentResult {
  chunk_id_a: number | null;
  chunk_id_b: number | null;
  classification: AlignmentClassification;
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
  source_mode: string;
  review_priority: number;
  type_change: string | null;
}

/** Result of applying hedging to an impact summary. */
export interface HedgedResult {
  hedged_summary: string;
  certainty_level: CertaintyLevel;
  original_summary: string;
}

/** Risk level for termination risk assessment. */
export type RiskLevel = 'high' | 'moderate' | 'low' | 'none';

/** Aggregated termination risk assessment. */
export interface TerminationRiskSummary {
  risk_level: RiskLevel;
  termination_change_count: number;
  avg_calibrated_confidence: number;
  has_unverified: boolean;
  has_numeric_override: boolean;
  highest_review_priority: number;
  key_findings: string[];
  affected_clauses: string[];
  recommendation: string;
}

/** Chunking strategy name. */
export type ChunkStrategy = 'legal' | 'scientific' | 'standards' | 'general' | 'auto';
