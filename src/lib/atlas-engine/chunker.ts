/**
 * Section-anchored chunking — TypeScript port of atlas/engine/comparison/ingestor.py
 *
 * Chunks text into semantic sections based on heading patterns, with support for
 * legal, scientific, standards, and general document types. Pure functions with
 * no external dependencies.
 */

import type { PageText, SectionChunk, ChunkStrategy } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 512 tokens / 1.3 words-per-token ~ 394 words */
const MAX_WORDS = 394;

// ---------------------------------------------------------------------------
// Anchor patterns
// ---------------------------------------------------------------------------

/** Numbered clause: 1.2.3 Title */
const PAT_NUMBERED_CLAUSE = /(?<![.\d])\d+(?:\.\d+)+[ \t]+[A-Z][^\n]{0,120}/gm;

/** Single clause: 1. Title */
const PAT_SINGLE_CLAUSE = /(?<![.\d])\d+\.[ \t]+[A-Z][a-zA-Z]{2,}[^\n]{0,120}/gm;

/** All caps heading (3+ words) */
const PAT_ALLCAPS_3 = /(?:^[ \t]*|(?<=\. ))[A-Z][A-Z0-9\-&,/]{1,}(?:[ \t]+[A-Z][A-Z0-9\-&,/]{1,}){2,}(?=[ \t]*(?:\n|$))/gm;

/** All caps heading (2+ words) */
const PAT_ALLCAPS_2 = /(?:^[ \t]*|(?<=\. ))[A-Z][A-Z0-9\-&,/]{1,}(?:[ \t]+[A-Z][A-Z0-9\-&,/]{1,}){1,}(?=[ \t]*(?:\n|$))/gm;

interface AnchorPattern {
  name: string;
  pattern: RegExp;
}

const STRATEGIES: Record<string, AnchorPattern[]> = {
  legal: [
    { name: 'section_symbol', pattern: /^[ \t]*§\s*\d+(?:\.\d+)*/gm },
    { name: 'numbered_clause', pattern: PAT_NUMBERED_CLAUSE },
    { name: 'single_clause', pattern: PAT_SINGLE_CLAUSE },
    {
      name: 'keyword',
      pattern: /^[ \t]*(?:Article|Section|Clause|Schedule|Exhibit|Annex|Appendix|Addendum)\b[^\n]{0,120}/gim,
    },
    { name: 'allcaps', pattern: PAT_ALLCAPS_3 },
  ],
  scientific: [
    { name: 'numbered_clause', pattern: PAT_NUMBERED_CLAUSE },
    { name: 'single_clause', pattern: PAT_SINGLE_CLAUSE },
    {
      name: 'imrad_keyword',
      pattern:
        /^[ \t]*(?:Abstract|Introduction|Background|Methods?|Methodology|Materials?|Results?|Discussion|Conclusions?|Limitations?|References?|Appendix|Appendices|Acknowledgements?)\b[^\n]{0,120}/gim,
    },
    { name: 'allcaps', pattern: PAT_ALLCAPS_3 },
  ],
  standards: [
    {
      name: 'req_id',
      pattern: /^[ \t]*(?:REQ|SEC|ITEM|SPEC|FUNC|PERF)-\d+(?:\.\d+)*\b[^\n]{0,120}/gm,
    },
    { name: 'numbered_clause', pattern: PAT_NUMBERED_CLAUSE },
    { name: 'single_clause', pattern: PAT_SINGLE_CLAUSE },
    {
      name: 'req_keyword',
      pattern: /^[ \t]*(?:Requirement|Specification|Compliance|Shall|Should)\b[^\n]{0,120}/gim,
    },
    { name: 'allcaps', pattern: PAT_ALLCAPS_3 },
  ],
  general: [
    { name: 'numbered_clause', pattern: PAT_NUMBERED_CLAUSE },
    { name: 'single_clause', pattern: PAT_SINGLE_CLAUSE },
    { name: 'allcaps', pattern: PAT_ALLCAPS_2 },
    { name: 'short_label', pattern: /^[ \t]*[A-Z][^\n]{2,57}:[ \t]*$/gm },
  ],
};

const NUMERIC_CITATION_NAMES = new Set(['numbered_clause', 'single_clause']);
const KEYWORD_CITATION_NAMES = new Set(['keyword', 'imrad_keyword', 'req_keyword']);

const CITATION_CONTEXT_RE =
  /(?:§\s*|(?:section|see|per|under|pursuant\s+to|article|clause|exhibit)\s+)$/i;
const KEYWORD_CITATION_RE =
  /\b(?:above|below|herein|thereof|hereof|therein|supra|infra)\b|(?:\.\s+[a-z])/i;

// ---------------------------------------------------------------------------
// Strategy auto-detection
// ---------------------------------------------------------------------------

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
    { pattern: /\b(?:Agreement|Contract|Covenant|Exhibit|Schedule|Annex)\b/g, weight: 2 },
    { pattern: /\b(?:party|parties|client|provider|vendor|licensor|licensee)\b/gi, weight: 1 },
  ],
  scientific: [
    { pattern: /\bAbstract\b/gi, weight: 4 },
    { pattern: /\bMethodolog(?:y|ies)\b/gi, weight: 4 },
    { pattern: /\bHypothes[ie]/gi, weight: 4 },
    { pattern: /\b(?:et al\.|doi:|arXiv|p\s*[<>=]\s*0\.\d)/gi, weight: 4 },
    { pattern: /\b(?:Introduction|Methods?|Results?|Discussion|Conclusions?)\b/gi, weight: 2 },
    { pattern: /\b(?:Figure|Table|Equation)\s+\d/gi, weight: 2 },
  ],
  standards: [
    { pattern: /\bREQ-\d+/gi, weight: 5 },
    { pattern: /\b(?:SEC|SPEC|FUNC|PERF)-\d+/gi, weight: 5 },
    { pattern: /\bSHALL\b/g, weight: 2 },
    { pattern: /\bSHOULD\b/g, weight: 1 },
    { pattern: /\b(?:Requirement|Specification|Compliance)\b/gi, weight: 2 },
  ],
};

function countMatches(pattern: RegExp, text: string): number {
  const re = new RegExp(pattern.source, pattern.flags);
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function sampleText(text: string, total = 8000): string {
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

/**
 * Score each strategy against a distributed sample and return the best match.
 */
export function detectStrategy(text: string): Exclude<ChunkStrategy, 'auto'> {
  const sample = sampleText(text);
  const scores: Record<string, number> = {};
  for (const strategy of Object.keys(DETECT_SIGNALS)) {
    scores[strategy] = 0;
  }

  for (const [strategy, signals] of Object.entries(DETECT_SIGNALS)) {
    for (const { pattern, weight } of signals) {
      const hits = countMatches(pattern, sample);
      if (hits > 0) {
        scores[strategy] += weight * Math.min(hits, 3);
      }
    }
  }

  let best = 'general';
  let bestScore = 0;
  for (const [strategy, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = strategy;
    }
  }
  return (bestScore > 0 ? best : 'general') as Exclude<ChunkStrategy, 'auto'>;
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise extraction artefacts before comparison.
 * - Rejoins soft-hyphenated line breaks
 * - Collapses mid-paragraph newlines to spaces
 * - Collapses multiple spaces to one
 */
export function normalizeText(text: string): string {
  let result = text;
  // Rejoin hyphenated line-breaks
  result = result.replace(/-\n(\w)/g, '$1');
  // Collapse single newlines within a paragraph to spaces
  result = result.replace(/(?<!\n)\n(?!\n)/g, ' ');
  // Collapse multiple spaces
  result = result.replace(/ {2,}/g, ' ');
  return result.trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PageStart {
  offset: number;
  pageNumber: number;
}

function buildCombined(pages: PageText[]): { combined: string; pageStarts: PageStart[] } {
  const parts: string[] = [];
  const pageStarts: PageStart[] = [];
  let cursor = 0;
  for (const pt of pages) {
    pageStarts.push({ offset: cursor, pageNumber: pt.page_number });
    parts.push(pt.text);
    cursor += pt.text.length + 1;
  }
  return { combined: parts.join('\n'), pageStarts };
}

function pageAt(offset: number, pageStarts: PageStart[]): number {
  let page = pageStarts[0]?.pageNumber ?? 1;
  for (const ps of pageStarts) {
    if (ps.offset <= offset) {
      page = ps.pageNumber;
    } else {
      break;
    }
  }
  return page;
}

function normalizeSectionId(text: string): string {
  let result = text.toLowerCase();
  // Remove punctuation characters
  result = result.replace(/[^\w\s]/g, '');
  return result.split(/\s+/).filter(Boolean).join(' ');
}

function isInlineCitation(combined: string, matchStart: number): boolean {
  const window = combined.slice(Math.max(0, matchStart - 50), matchStart);
  return CITATION_CONTEXT_RE.test(window.trimEnd());
}

function isKeywordCitation(matchText: string): boolean {
  return KEYWORD_CITATION_RE.test(matchText.slice(0, 80));
}

function splitAtSentenceBoundaries(text: string, maxWords: number): string[] {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const subChunks: string[] = [];
  let current: string[] = [];
  let currentCount = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    const count = words.length;
    if (currentCount + count > maxWords && current.length > 0) {
      subChunks.push(current.join(' '));
      current = words;
      currentCount = count;
    } else {
      current.push(...words);
      currentCount += count;
    }
  }
  if (current.length > 0) {
    subChunks.push(current.join(' '));
  }
  return subChunks.length > 0 ? subChunks : [text];
}

// ---------------------------------------------------------------------------
// Regex match collection (shared by findAnchors)
// ---------------------------------------------------------------------------

interface AnchorMatch {
  start: number;
  end: number;
  text: string;
  patternName: string;
}

function findAllMatches(pattern: RegExp, text: string): Array<{ start: number; end: number; text: string }> {
  // Create a fresh regex to avoid stale lastIndex
  const re = new RegExp(pattern.source, pattern.flags);
  const results: Array<{ start: number; end: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() });
    // Prevent infinite loop on zero-length matches
    if (m[0].length === 0) re.lastIndex++;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Section-anchor chunker
// ---------------------------------------------------------------------------

/**
 * Chunk a document by structural section anchors.
 *
 * @param pages - Array of PageText objects extracted from a document
 * @param strategy - Chunking strategy: 'legal' | 'scientific' | 'standards' | 'general' | 'auto'
 * @returns Array of SectionChunk objects
 */
export function chunkBySection(
  pages: PageText[],
  strategy: ChunkStrategy = 'auto',
): SectionChunk[] {
  if (pages.length === 0) return [];

  const { combined, pageStarts } = buildCombined(pages);
  const docLen = combined.length;

  const resolved = strategy === 'auto' ? detectStrategy(combined) : strategy;
  const anchorPatterns = STRATEGIES[resolved];
  if (!anchorPatterns) {
    throw new Error(
      `Unknown strategy "${resolved}". Valid options: ${Object.keys(STRATEGIES).sort().join(', ')}`,
    );
  }

  // Collect anchor matches, deduplicating by position
  const posToMatch = new Map<number, AnchorMatch>();
  for (const { name, pattern } of anchorPatterns) {
    const matches = findAllMatches(pattern, combined);
    for (const m of matches) {
      if (posToMatch.has(m.start)) continue;
      if (NUMERIC_CITATION_NAMES.has(name) && isInlineCitation(combined, m.start)) continue;
      if (KEYWORD_CITATION_NAMES.has(name) && isKeywordCitation(m.text)) continue;
      posToMatch.set(m.start, { start: m.start, end: m.end, text: m.text, patternName: name });
    }
  }

  const anchors = Array.from(posToMatch.values()).sort((a, b) => a.start - b.start);

  // Build spans
  const spans: Array<{ start: number; end: number; clauseNumber: string }> = [];
  if (anchors.length === 0) {
    spans.push({ start: 0, end: docLen, clauseNumber: '' });
  } else {
    if (anchors[0].start > 0) {
      const preamble = combined.slice(0, anchors[0].start).trim();
      if (preamble) {
        spans.push({ start: 0, end: anchors[0].start, clauseNumber: '' });
      }
    }
    for (let i = 0; i < anchors.length; i++) {
      const nextStart = i + 1 < anchors.length ? anchors[i + 1].start : docLen;
      spans.push({ start: anchors[i].start, end: nextStart, clauseNumber: anchors[i].text });
    }
  }

  // Build raw chunks
  const rawChunks: SectionChunk[] = [];
  for (const { start, end, clauseNumber } of spans) {
    const rawText = combined.slice(start, end).trim();
    if (!rawText) continue;
    const text = normalizeText(rawText);
    const headingText = (text.split('\n')[0] ?? '').trim();
    const wordCount = text.split(/\s+/).length;
    rawChunks.push({
      clause_number: clauseNumber,
      heading_text: headingText,
      text,
      page_number: pageAt(start, pageStarts),
      page_span_end: pageAt(Math.max(end - 1, start), pageStarts),
      char_offset: start,
      char_end: end,
      token_count_approx: wordCount,
    });
  }

  // Split oversized chunks at sentence boundaries
  const finalChunks: SectionChunk[] = [];
  for (const chunk of rawChunks) {
    if (chunk.token_count_approx <= MAX_WORDS) {
      finalChunks.push(chunk);
      continue;
    }
    const subTexts = splitAtSentenceBoundaries(chunk.text, MAX_WORDS);
    let charCursor = chunk.char_offset;
    for (const subText of subTexts) {
      const subWords = subText.split(/\s+/).length;
      const subEnd = charCursor + subText.length;
      finalChunks.push({
        clause_number: chunk.clause_number,
        heading_text: (subText.split('\n')[0] ?? '').trim(),
        text: subText,
        page_number: pageAt(charCursor, pageStarts),
        page_span_end: pageAt(subEnd, pageStarts),
        char_offset: charCursor,
        char_end: subEnd,
        token_count_approx: subWords,
      });
      charCursor = subEnd + 1;
    }
  }

  return finalChunks;
}

/**
 * Normalize a section identifier for comparison (lowercase, strip punctuation, collapse whitespace).
 */
export { normalizeSectionId };
