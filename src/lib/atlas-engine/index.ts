/**
 * Atlas Engine — TypeScript port entry point.
 *
 * Chains chunking, classification, alignment, and formatting into a
 * single in-process pipeline. No Python, no HTTP calls to Atlas backend.
 *
 * Ported from: atlas/bridge.py
 */

import type { TextChunk } from "./types";
import { classifyClauseTypes, classifyChunk } from "./clause-classifier";
import { assessTerminationRisk } from "./termination-risk";
import {
  alignAndClassify,
  wordSimilarity,
  type AlignmentChunk,
  type AlignmentResult,
  type DeltaClassification,
  type MatchSignals,
  type ConfidenceBand,
  type CertaintyLevel,
  type SourceMode,
} from "./aligner";
import {
  buildJsonReport,
  buildHtmlReport,
  formatReport,
  wordDiffHtml,
  type JsonReport,
  type JsonChange,
  type FormattedReports,
  type DiffSegment,
} from "./formatter";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { classifyClauseTypes, classifyChunk } from "./clause-classifier";
export { alignAndClassify, wordSimilarity } from "./aligner";
export {
  buildJsonReport,
  buildHtmlReport,
  formatReport,
  wordDiffHtml,
} from "./formatter";
export type { TextChunk } from "./types";
export type {
  AlignmentChunk,
  AlignmentResult,
  DeltaClassification,
  MatchSignals,
  ConfidenceBand,
  CertaintyLevel,
  SourceMode,
} from "./aligner";
export type {
  JsonReport,
  JsonChange,
  FormattedReports,
  DiffSegment,
} from "./formatter";

// ---------------------------------------------------------------------------
// Section-anchored chunker (ported from ingestor.py)
// ---------------------------------------------------------------------------

const MAX_WORDS = 394;

// Anchor patterns for legal documents
const PAT_SECTION_SYMBOL = /^[ \t]*§\s*\d+(?:\.\d+)*/gm;
const PAT_NUMBERED_CLAUSE =
  /(?<![.\d])\d+(?:\.\d+)+[ \t]+[A-Z][^\n]{0,120}/gm;
const PAT_SINGLE_CLAUSE =
  /(?<![.\d])\d+\.[ \t]+[A-Z][a-zA-Z]{2,}[^\n]{0,120}/gm;
const PAT_KEYWORD = new RegExp(
  "^[ \\t]*(?:Article|Section|Clause|Schedule|Exhibit|Annex|Appendix|Addendum)\\b[^\\n]{0,120}",
  "gmi",
);
const PAT_ALLCAPS_3 = new RegExp(
  "(?:^[ \\t]*|(?<=\\. ))[A-Z][A-Z0-9\\-&,/]{1,}(?:[ \\t]+[A-Z][A-Z0-9\\-&,/]{1,}){2,}(?=[ \\t]*(?:\\n|$))",
  "gm",
);
const PAT_ALLCAPS_2 = new RegExp(
  "(?:^[ \\t]*|(?<=\\. ))[A-Z][A-Z0-9\\-&,/]{1,}(?:[ \\t]+[A-Z][A-Z0-9\\-&,/]{1,}){1,}(?=[ \\t]*(?:\\n|$))",
  "gm",
);
const PAT_SHORT_LABEL = /^[ \t]*[A-Z][^\n]{2,57}:[ \t]*$/gm;

// Citation filtering
const CITATION_CONTEXT_RE =
  /(?:§\s*|(?:section|see|per|under|pursuant\s+to|article|clause|exhibit)\s+)$/i;
const KEYWORD_CITATION_RE =
  /\b(?:above|below|herein|thereof|hereof|therein|supra|infra)\b|(?:\.\s+[a-z])/i;

type StrategyName = "legal" | "scientific" | "standards" | "general";

interface AnchorPattern {
  name: string;
  pattern: RegExp;
}

const STRATEGIES: Record<StrategyName, AnchorPattern[]> = {
  legal: [
    { name: "section_symbol", pattern: PAT_SECTION_SYMBOL },
    { name: "numbered_clause", pattern: PAT_NUMBERED_CLAUSE },
    { name: "single_clause", pattern: PAT_SINGLE_CLAUSE },
    { name: "keyword", pattern: PAT_KEYWORD },
    { name: "allcaps", pattern: PAT_ALLCAPS_3 },
  ],
  scientific: [
    { name: "numbered_clause", pattern: PAT_NUMBERED_CLAUSE },
    { name: "single_clause", pattern: PAT_SINGLE_CLAUSE },
    {
      name: "imrad_keyword",
      pattern: new RegExp(
        "^[ \\t]*(?:Abstract|Introduction|Background|Methods?|Methodology|" +
          "Materials?|Results?|Discussion|Conclusions?|Limitations?|" +
          "References?|Appendix|Appendices|Acknowledgements?)\\b[^\\n]{0,120}",
        "gmi",
      ),
    },
    { name: "allcaps", pattern: PAT_ALLCAPS_3 },
  ],
  standards: [
    {
      name: "req_id",
      pattern: new RegExp(
        "^[ \\t]*(?:REQ|SEC|ITEM|SPEC|FUNC|PERF)-\\d+(?:\\.\\d+)*\\b[^\\n]{0,120}",
        "gm",
      ),
    },
    { name: "numbered_clause", pattern: PAT_NUMBERED_CLAUSE },
    { name: "single_clause", pattern: PAT_SINGLE_CLAUSE },
    {
      name: "req_keyword",
      pattern: new RegExp(
        "^[ \\t]*(?:Requirement|Specification|Compliance|Shall|Should)\\b[^\\n]{0,120}",
        "gmi",
      ),
    },
    { name: "allcaps", pattern: PAT_ALLCAPS_3 },
  ],
  general: [
    { name: "numbered_clause", pattern: PAT_NUMBERED_CLAUSE },
    { name: "single_clause", pattern: PAT_SINGLE_CLAUSE },
    { name: "allcaps", pattern: PAT_ALLCAPS_2 },
    { name: "short_label", pattern: PAT_SHORT_LABEL },
  ],
};

const NUMERIC_CITATION_NAMES = new Set(["numbered_clause", "single_clause"]);
const KEYWORD_CITATION_NAMES = new Set([
  "keyword",
  "imrad_keyword",
  "req_keyword",
]);

// Strategy auto-detection signals
interface DetectSignal {
  pattern: RegExp;
  weight: number;
}

const DETECT_SIGNALS: Record<string, DetectSignal[]> = {
  legal: [
    { pattern: /§/gi, weight: 4 },
    { pattern: /\bWHEREAS\b/g, weight: 4 },
    { pattern: /\bHEREINAFTER\b/gi, weight: 4 },
    { pattern: /\bWITNESSETH\b/gi, weight: 4 },
    { pattern: /\bINDEMNIF/gi, weight: 3 },
    {
      pattern:
        /\b(?:Agreement|Contract|Covenant|Exhibit|Schedule|Annex)\b/g,
      weight: 2,
    },
    {
      pattern:
        /\b(?:party|parties|client|provider|vendor|licensor|licensee)\b/gi,
      weight: 1,
    },
  ],
  scientific: [
    { pattern: /\bAbstract\b/gi, weight: 4 },
    { pattern: /\bMethodolog(?:y|ies)\b/gi, weight: 4 },
    { pattern: /\bHypothes[ie]/gi, weight: 4 },
    { pattern: /\b(?:et al\.|doi:|arXiv|p\s*[<>=]\s*0\.\d)/gi, weight: 4 },
    {
      pattern:
        /\b(?:Introduction|Methods?|Results?|Discussion|Conclusions?)\b/gi,
      weight: 2,
    },
    { pattern: /\b(?:Figure|Table|Equation)\s+\d/gi, weight: 2 },
  ],
  standards: [
    { pattern: /\bREQ-\d+/gi, weight: 5 },
    { pattern: /\b(?:SEC|SPEC|FUNC|PERF)-\d+/gi, weight: 5 },
    { pattern: /\bSHALL\b/g, weight: 2 },
    { pattern: /\bSHOULD\b/g, weight: 1 },
    {
      pattern: /\b(?:Requirement|Specification|Compliance)\b/gi,
      weight: 2,
    },
  ],
};

function sampleText(text: string, total: number = 8000): string {
  const n = text.length;
  if (n <= total) return text;
  const part = Math.floor(total / 3);
  const mid = Math.floor(n / 2);
  return (
    text.slice(0, part) +
    text.slice(Math.max(0, mid - Math.floor(part / 2)), mid + Math.floor(part / 2)) +
    text.slice(Math.max(0, n - part))
  );
}

function detectStrategy(text: string): StrategyName {
  const sample = sampleText(text);
  const scores: Record<string, number> = {};

  for (const [strategy, signals] of Object.entries(DETECT_SIGNALS)) {
    scores[strategy] = 0;
    for (const { pattern, weight } of signals) {
      // Reset lastIndex for global regexps
      pattern.lastIndex = 0;
      const hits = (sample.match(pattern) ?? []).length;
      if (hits) {
        scores[strategy] += weight * Math.min(hits, 3);
      }
    }
  }

  let best: StrategyName = "general";
  let bestScore = 0;
  for (const [strategy, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = strategy as StrategyName;
    }
  }

  return bestScore > 0 ? best : "general";
}

function normalizeText(text: string): string {
  return text
    .replace(/-\n(\w)/g, "$1") // rejoin hyphenated line-breaks
    .replace(/(?<!\n)\n(?!\n)/g, " ") // collapse single newlines
    .replace(/ {2,}/g, " ") // collapse multiple spaces
    .trim();
}

function isInlineCitation(combined: string, matchStart: number): boolean {
  const window = combined.slice(Math.max(0, matchStart - 50), matchStart);
  return CITATION_CONTEXT_RE.test(window.trimEnd());
}

function isKeywordCitation(matchText: string): boolean {
  return KEYWORD_CITATION_RE.test(matchText.slice(0, 80));
}

function splitAtSentenceBoundaries(
  text: string,
  maxWords: number,
): string[] {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const subChunks: string[] = [];
  let current: string[] = [];
  let currentCount = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    const count = words.length;
    if (currentCount + count > maxWords && current.length > 0) {
      subChunks.push(current.join(" "));
      current = words;
      currentCount = count;
    } else {
      current.push(...words);
      currentCount += count;
    }
  }
  if (current.length > 0) {
    subChunks.push(current.join(" "));
  }
  return subChunks.length > 0 ? subChunks : [text];
}

/**
 * Chunk text by structural section anchors.
 *
 * Auto-detects document type (legal, scientific, standards, general)
 * and uses appropriate anchor patterns.
 */
export function chunkBySection(
  text: string,
  strategy: StrategyName | "auto" = "auto",
): TextChunk[] {
  if (!text.trim()) return [];

  const resolved = strategy === "auto" ? detectStrategy(text) : strategy;
  const anchorPatterns = STRATEGIES[resolved] ?? STRATEGIES.general;

  // Find all anchor positions
  interface AnchorMatch {
    start: number;
    end: number;
    text: string;
    name: string;
  }

  const posToMatch = new Map<number, AnchorMatch>();

  for (const { name, pattern } of anchorPatterns) {
    // Clone the regex to reset state
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      if (posToMatch.has(start)) continue;

      if (
        NUMERIC_CITATION_NAMES.has(name) &&
        isInlineCitation(text, start)
      ) {
        continue;
      }
      if (
        KEYWORD_CITATION_NAMES.has(name) &&
        isKeywordCitation(match[0])
      ) {
        continue;
      }

      posToMatch.set(start, {
        start,
        end: start + match[0].length,
        text: match[0].trim(),
        name,
      });
    }
  }

  const anchors = [...posToMatch.values()].sort((a, b) => a.start - b.start);
  const docLen = text.length;

  // Build spans
  interface Span {
    start: number;
    end: number;
    clauseNumber: string;
  }

  const spans: Span[] = [];
  if (anchors.length === 0) {
    spans.push({ start: 0, end: docLen, clauseNumber: "" });
  } else {
    if (anchors[0].start > 0) {
      const preamble = text.slice(0, anchors[0].start).trim();
      if (preamble) {
        spans.push({ start: 0, end: anchors[0].start, clauseNumber: "" });
      }
    }
    for (let i = 0; i < anchors.length; i++) {
      const nextStart =
        i + 1 < anchors.length ? anchors[i + 1].start : docLen;
      spans.push({
        start: anchors[i].start,
        end: nextStart,
        clauseNumber: anchors[i].text,
      });
    }
  }

  // Build raw chunks
  const rawChunks: TextChunk[] = [];
  for (const span of spans) {
    const rawText = text.slice(span.start, span.end).trim();
    if (!rawText) continue;
    const normalized = normalizeText(rawText);
    const headingText = normalized.split("\n")[0].trim();
    const wordCount = normalized.split(/\s+/).length;

    rawChunks.push({
      clause_number: span.clauseNumber,
      heading_text: headingText,
      text: normalized,
      page_number: 1, // page detection requires PDF structure
      char_offset: span.start,
      char_end: span.end,
      token_count_approx: wordCount,
    });
  }

  // Split oversized chunks at sentence boundaries
  const finalChunks: TextChunk[] = [];
  for (const chunk of rawChunks) {
    if ((chunk.token_count_approx ?? 0) <= MAX_WORDS) {
      finalChunks.push(chunk);
      continue;
    }
    const subTexts = splitAtSentenceBoundaries(chunk.text, MAX_WORDS);
    let charCursor = chunk.char_offset ?? 0;
    for (const subText of subTexts) {
      const subWords = subText.split(/\s+/).length;
      const subEnd = charCursor + subText.length;
      finalChunks.push({
        clause_number: chunk.clause_number,
        heading_text: subText.split("\n")[0].trim(),
        text: subText,
        page_number: 1,
        char_offset: charCursor,
        char_end: subEnd,
        token_count_approx: subWords,
      });
      charCursor = subEnd + 1;
    }
  }

  return finalChunks;
}

// ---------------------------------------------------------------------------
// Block type mapping (from bridge.py)
// ---------------------------------------------------------------------------

type FXDABlockType =
  | "paragraph"
  | "heading"
  | "clause"
  | "definition"
  | "exhibit";

function mapClauseTypeToBlockType(chunk: TextChunk): FXDABlockType {
  const clauseType = chunk.clause_type ?? "";
  const heading = (chunk.heading_text ?? "").trim();

  // Check for exhibit/schedule/appendix headings
  if (heading) {
    const upper = heading.toUpperCase();
    for (const prefix of [
      "EXHIBIT",
      "SCHEDULE",
      "APPENDIX",
      "ANNEX",
      "ATTACHMENT",
    ]) {
      if (upper.startsWith(prefix)) return "exhibit";
    }
  }

  // Map clause types
  const mapping: Record<string, FXDABlockType> = {
    definition: "definition",
    obligation: "clause",
    "condition-precedent": "clause",
    termination: "clause",
    representation: "clause",
  };
  if (clauseType in mapping) return mapping[clauseType];

  // Heading detection
  if (heading && !chunk.clause_number) {
    if ((chunk.text ?? "").length < 100) return "heading";
  }

  return "paragraph";
}

function extractTerm(chunk: TextChunk): string | null {
  const text = chunk.text ?? "";
  const match = text.match(
    /["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]\s+(?:means|shall\s+mean|refers?\s+to)/i,
  );
  return match?.[1] ?? null;
}

export interface ExtractedBlock {
  id: string;
  type: FXDABlockType;
  content: string;
  page: number;
  bookmark: string | null;
  clauseNumber: string | null;
  term: string | null;
  exhibitLabel: string | null;
}

/**
 * Extract typed blocks from raw text.
 *
 * Chains: text → chunkBySection → classifyClauseTypes → map to blocks
 */
export function extractBlocks(text: string): ExtractedBlock[] {
  const chunks = chunkBySection(text);
  const classified = classifyClauseTypes(chunks);

  return classified.map((chunk, i) => {
    const blockType = mapClauseTypeToBlockType(chunk);
    return {
      id: `block-${String(i).padStart(4, "0")}`,
      type: blockType,
      content: chunk.text,
      page: chunk.page_number ?? 1,
      bookmark: chunk.heading_text ?? null,
      clauseNumber: chunk.clause_number ?? null,
      term: blockType === "definition" ? extractTerm(chunk) : null,
      exhibitLabel:
        blockType === "exhibit" ? (chunk.heading_text ?? null) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Document comparison pipeline
// ---------------------------------------------------------------------------

export interface ComparisonResponse {
  additions: ComparisonEntry[];
  removals: ComparisonEntry[];
  modifications: ComparisonModification[];
  summary: string;
  strategy: string;
  totalSections: number;
  /**
   * Termination risk in camelCase API shape (mirrors Python bridge.py output).
   * Internal `TerminationRiskSummary` uses snake_case; this is the converted
   * form returned over the wire to clients.
   */
  terminationRisk?: {
    riskLevel: 'high' | 'moderate' | 'low' | 'none';
    terminationChangeCount: number;
    avgCalibratedConfidence: number;
    hasUnverified: boolean;
    hasNumericOverride: boolean;
    highestReviewPriority: number;
    keyFindings: string[];
    affectedClauses: string[];
    recommendation: string;
  };
}

export interface ComparisonEntry {
  classification: DeltaClassification;
  sectionId: string | null;
  clauseType: string | null;
  confidence: number;
  reviewPriority: number;
  impactSummary: string | null;
  hedgedSummary: string | null;
  certaintyLevel: CertaintyLevel | null;
  content: string;
}

export interface ComparisonModification {
  classification: DeltaClassification;
  sectionId: string | null;
  clauseType: string | null;
  confidence: number;
  reviewPriority: number;
  impactSummary: string | null;
  hedgedSummary: string | null;
  certaintyLevel: CertaintyLevel | null;
  before: string;
  after: string;
  similarity: number;
}

/**
 * Compare two documents end-to-end.
 *
 * Chains: text → chunk → classify → align → format response
 */
export function compareDocuments(
  textA: string,
  textB: string,
  nameA: string = "Document A",
  nameB: string = "Document B",
): ComparisonResponse {
  // Step 1: Chunk both documents
  const chunksA = chunkBySection(textA);
  const chunksB = chunkBySection(textB);

  // Step 2: Classify clause types
  classifyClauseTypes(chunksA);
  classifyClauseTypes(chunksB);

  // Step 3: Convert to alignment chunks (add chunk_id)
  const alignChunksA: AlignmentChunk[] = chunksA.map((c, i) => ({
    chunk_id: i,
    text: c.text,
    clause_number: c.clause_number,
    heading_text: c.heading_text,
    page_number: c.page_number,
    page_span_end: c.page_span_end,
    section_id: c.section_id,
    clause_type: c.clause_type,
  }));
  const alignChunksB: AlignmentChunk[] = chunksB.map((c, i) => ({
    chunk_id: i + 10000, // offset to avoid ID collision
    text: c.text,
    clause_number: c.clause_number,
    heading_text: c.heading_text,
    page_number: c.page_number,
    page_span_end: c.page_span_end,
    section_id: c.section_id,
    clause_type: c.clause_type,
  }));

  // Step 4: Align
  const deltaResults = alignAndClassify(alignChunksA, alignChunksB);

  // Step 5: Map to response format
  const additions: ComparisonEntry[] = [];
  const removals: ComparisonEntry[] = [];
  const modifications: ComparisonModification[] = [];

  const counts: Record<string, number> = {};

  for (const result of deltaResults) {
    counts[result.classification] = (counts[result.classification] ?? 0) + 1;

    const base = {
      classification: result.classification,
      sectionId: result.section_id,
      clauseType: result.clause_type_b ?? result.clause_type_a,
      confidence: result.match_signals?.confidence_score ?? result.combined_score,
      reviewPriority: result.review_priority,
      impactSummary: result.impact_summary,
      hedgedSummary: result.hedged_summary,
      certaintyLevel: result.certainty_level,
    };

    if (result.classification === "added") {
      additions.push({ ...base, content: result.text_b ?? "" });
    } else if (result.classification === "deleted") {
      removals.push({ ...base, content: result.text_a ?? "" });
    } else if (
      result.classification === "changed" ||
      result.classification === "moved"
    ) {
      modifications.push({
        ...base,
        before: result.text_a ?? "",
        after: result.text_b ?? "",
        similarity: result.match_signals?.text_similarity ?? result.combined_score,
      });
    }
    // "unchanged" omitted
  }

  // Build summary
  const summaryParts: string[] = [];
  if (counts["added"]) summaryParts.push(`${counts["added"]} section(s) added`);
  if (counts["deleted"])
    summaryParts.push(`${counts["deleted"]} section(s) removed`);
  if (counts["changed"])
    summaryParts.push(`${counts["changed"]} section(s) modified`);
  if (counts["moved"])
    summaryParts.push(`${counts["moved"]} section(s) moved`);

  // Step 6: Assess termination risk and convert snake_case → camelCase
  // (matches Python bridge.py:254-264 output mapping).
  const termRisk = assessTerminationRisk(deltaResults);
  const terminationRiskCamel = termRisk.risk_level !== 'none'
    ? {
        riskLevel: termRisk.risk_level,
        terminationChangeCount: termRisk.termination_change_count,
        avgCalibratedConfidence: termRisk.avg_calibrated_confidence,
        hasUnverified: termRisk.has_unverified,
        hasNumericOverride: termRisk.has_numeric_override,
        highestReviewPriority: termRisk.highest_review_priority,
        keyFindings: termRisk.key_findings,
        affectedClauses: termRisk.affected_clauses,
        recommendation: termRisk.recommendation,
      }
    : undefined;

  return {
    additions,
    removals,
    modifications,
    summary: summaryParts.length > 0
      ? summaryParts.join("; ") + "."
      : "Documents are identical.",
    strategy: detectStrategy(textA),
    totalSections: deltaResults.length,
    terminationRisk: terminationRiskCamel,
  };
}

// ---------------------------------------------------------------------------
// /fields/infer — derive eSign field suggestions from document text.
// Ported from atlas/api/main.py:fields_infer (Phase 1a).
// ---------------------------------------------------------------------------

export interface FieldSuggestion {
  name: string;
  type: 'text' | 'date' | 'signature' | 'checkbox' | 'initial';
  party?: number;
}

export interface FieldInferenceResult {
  roleMap: Record<string, string>;
  fieldSuggestions: FieldSuggestion[];
}

/**
 * Infer eSign field suggestions from already-extracted document text.
 * Walks the chunked document, looks for definitions, termination clauses,
 * and party references, then assembles a roleMap + field suggestion list.
 *
 * Mirrors atlas/api/main.py:fields_infer (Python). Returns synchronously
 * (the route is async-compatible because dynamic imports are async).
 */
export function inferFieldsFromText(content: string): FieldInferenceResult {
  const fieldSuggestions: FieldSuggestion[] = [];
  const roleMap: Record<string, string> = {};

  if (!content.trim()) {
    return { roleMap, fieldSuggestions };
  }

  // Chunk + classify (same pipeline as extractBlocks, but we use chunks
  // directly without the FXDA mapping step — we need clause_type per chunk).
  const chunks = chunkBySection(content);
  classifyClauseTypes(chunks);

  for (const chunk of chunks) {
    const clauseType = chunk.clause_type ?? '';

    // Map clause type to FXDA block type (same logic as Python bridge).
    const blockType = mapClauseTypeToBlockType(chunk);

    if (blockType === 'definition') {
      const term = chunk.heading_text ?? '';
      fieldSuggestions.push({
        name: term || 'defined_term',
        type: 'text',
      });
    } else if (clauseType === 'termination') {
      fieldSuggestions.push({
        name: 'termination_date',
        type: 'date',
      });
    } else if (clauseType === 'obligation') {
      // Detect party references in obligation text.
      const text = (chunk.text ?? '').toLowerCase();
      if (text.includes('party a') || text.includes('company')) {
        roleMap['1'] = 'Company';
      }
      if (
        text.includes('party b') ||
        text.includes('contractor') ||
        text.includes('employee')
      ) {
        roleMap['2'] = 'Counterparty';
      }
    }
  }

  // Standard signature/name/date fields per discovered party.
  for (const [partyNum, role] of Object.entries(roleMap)) {
    const party = Number.parseInt(partyNum, 10);
    fieldSuggestions.push(
      { name: `${role} Signature`, type: 'signature', party },
      { name: `${role} Name`, type: 'text', party },
      { name: `${role} Date`, type: 'date', party },
    );
  }

  return { roleMap, fieldSuggestions };
}
