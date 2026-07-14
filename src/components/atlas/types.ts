export interface MatchSignals {
  confidence_score: number;
  clause_id_match: boolean;
  anchor_term_overlap: number;
  calibrated_confidence?: number;
  confidence_band?: "high" | "medium" | "low";
  text_similarity?: number;
  numeric_override?: boolean;
}

export type PageState = "upload" | "processing" | "complete" | "error";
export type ReviewStatus = "pending" | "accepted" | "rejected" | "flagged";

export interface ChangeProvenance {
  mode: "extraction" | "synthesis" | "hybrid";
  chunk_id_a: number | null;
  chunk_id_b: number | null;
  page_span_a: [number, number] | null;
  page_span_b: [number, number] | null;
  alignment_confidence: number;
  verified: boolean | null;
}

export interface ComparisonChange {
  classification: "changed" | "deleted" | "added" | "moved" | "unchanged";
  section_id: string;
  clause_number: string;
  page_a: number | null;
  page_b: number | null;
  text_a: string | null;
  text_b: string | null;
  impact_summary: string | null;
  match_signals: MatchSignals | null;
  summary_verified: boolean | null;
  hedged_summary?: string | null;
  certainty_level?: "definitive" | "conditional" | "ambiguous" | null;
  clause_type_a?: string;
  clause_type_b?: string;
  provenance?: ChangeProvenance;
  review_priority?: number;
  type_change?: string | null;
  clause_category?: string;
  ai_summary?: string | null;
}

export interface TerminationRiskSummary {
  risk_level: "high" | "moderate" | "low" | "none";
  termination_change_count: number;
  avg_calibrated_confidence: number;
  has_unverified: boolean;
  has_numeric_override: boolean;
  highest_review_priority: number;
  key_findings: string[];
  affected_clauses: string[];
  recommendation: string;
}

export interface ComparisonResult {
  doc_name_a: string;
  doc_name_b: string;
  summary: { changed: number; deleted: number; added: number; moved: number; unchanged: number };
  changes: ComparisonChange[];
  session_id?: string;
  ai_degraded?: boolean;
  termination_risk?: TerminationRiskSummary;
}

export type DiffPart = { text: string; highlighted: boolean };
export type RecommendPriority = "critical" | "recommended";
export interface ReviewRecommendation {
  priority: RecommendPriority;
  reason: string;
}

// --- 1:Many Comparison Types ---

export interface VariantUpload {
  id: string;
  file: File;
  label: string;
}

export interface VariantResult {
  variant_id: string;
  variant_name: string;
  file_name: string;
  result: ComparisonResult;
  error?: string;
}

export interface ConsensusPattern {
  section_id: string;
  description: string;
  clause_category?: string;
  variant_ids: string[];
  highest_severity: string;
  changes: Record<string, ComparisonChange>;
}

export interface MultiComparisonResult {
  base_doc_name: string;
  variants: VariantResult[];
  consensus_patterns: ConsensusPattern[];
}

export type MultiReviewStatuses = Record<string, Record<string, ReviewStatus>>;

// --- Clause Rewrite Suggestion Types ---

export interface ClauseRewriteSuggestion {
  section_id: string;
  suggested_text: string;
  rationale: string;
  confidence: number;
  status: 'pending' | 'accepted' | 'edited' | 'dismissed';
  edited_text?: string;
  user_guidance?: string;
  previousSuggestion?: {
    suggested_text: string;
    rationale: string;
    confidence: number;
  };
}

export interface AcceptedRewrite {
  section_id: string;
  original_text: string;
  suggested_text: string;
  rationale: string;
  was_edited: boolean;
}
