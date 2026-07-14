/**
 * Clause-type classifier for legal document chunks.
 *
 * Categorizes each chunk by legal function using keyword and pattern matching.
 * Runs post-chunking, pre-alignment -- no API calls, fully local.
 *
 * Five clause types:
 *   - definition:          Defined terms, interpretations, meanings
 *   - obligation:          Duties, requirements, payment terms, covenants
 *   - condition-precedent: Prerequisites that must be satisfied before rights activate
 *   - termination:         Exit rights, events of default, cure periods
 *   - representation:      Warranties, representations, guarantees
 *
 * Ported from: atlas/engine/comparison/clause_classifier.py
 */

import type { TextChunk } from "./types";

// ---------------------------------------------------------------------------
// Clause types
// ---------------------------------------------------------------------------

export type ClauseType =
  | "definition"
  | "obligation"
  | "condition-precedent"
  | "termination"
  | "representation";

// ---------------------------------------------------------------------------
// Clause-type keyword sets (English + German)
// ---------------------------------------------------------------------------

const DEFINITION_KEYWORDS: ReadonlyArray<string> = [
  // English
  "means", "shall mean", "defined as", "has the meaning",
  "interpretation", "definitions", "defined term",
  "for the purposes of", "as used herein",
  "the following terms", "shall have the meaning",
  // German
  "bedeutet", "im sinne", "begriffsbestimmung", "definitionen",
  "hat die bedeutung", "wird definiert als", "bezeichnung",
  "nachfolgend", "im folgenden",
];

const OBLIGATION_KEYWORDS: ReadonlyArray<string> = [
  // English
  "shall", "must", "agrees to", "undertakes to", "is obligated",
  "covenant", "covenants", "payment", "pay", "deliver",
  "provide", "perform", "comply", "maintain", "ensure",
  "financial covenant", "leverage ratio", "interest cover",
  "reporting", "report", "certificate",
  // German
  "verpflichtet", "hat zu", "schuldet", "zahlung", "zahlen",
  "leistung", "liefern", "erbringen", "einhalten",
  "finanzkennzahlen", "berichtspflicht",
  "kreditrahmen", "darlehen", "zinsen", "marge",
  "euribor", "zinsperiode", "tilgung", "rückzahlung",
  "gebühren", "bereitstellungsprovision",
];

const CONDITION_PRECEDENT_KEYWORDS: ReadonlyArray<string> = [
  // English
  "condition precedent", "conditions precedent", "subject to",
  "provided that", "on the condition", "prerequisite",
  "prior to", "before the", "upon satisfaction",
  "conditions to", "conditions for",
  // German
  "aufschiebende bedingung", "bedingungen", "voraussetzung",
  "vorbehaltlich", "unter der bedingung", "vor der",
  "bedingungen für die", "auszahlungsvoraussetzung",
];

const TERMINATION_KEYWORDS: ReadonlyArray<string> = [
  // English
  "terminat", "default", "event of default", "acceleration",
  "cure period", "remedy", "breach", "material adverse",
  "insolvency", "bankruptcy", "winding up",
  "cross-default", "change of control",
  "right to cancel", "cancellation",
  // German
  "kündigung", "kündig", "verzug", "zahlungsverzug",
  "vertragsverletzung", "heilungsfrist", "fälligstellung",
  "insolvenz", "insolvenzverfahren", "kontrollwechsel",
  "wesentliche nachteilige veränderung", "wesentliche verschlechterung",
  "auflösung", "abwicklung",
];

const REPRESENTATION_KEYWORDS: ReadonlyArray<string> = [
  // English
  "represent", "warrant", "representation", "warranty",
  "guarantees", "guarantee", "certif", "declare",
  "confirms", "acknowledges", "assurance",
  "indemnif", "indemnity", "hold harmless",
  // German
  "zusicherung", "gewährleistung", "garantie",
  "erklärt", "versichert", "bestätigt",
  "freistellung", "schadloshaltung", "haftung",
];

// ---------------------------------------------------------------------------
// Heading patterns that strongly signal clause type
// ---------------------------------------------------------------------------

interface HeadingPattern {
  regex: RegExp;
  clauseType: ClauseType;
}

const HEADING_TYPE_MAP: ReadonlyArray<HeadingPattern> = [
  // English headings
  { regex: /\bdefinitions?\b|\binterpretation\b/i, clauseType: "definition" },
  { regex: /\bconditions?\s+precedent\b/i, clauseType: "condition-precedent" },
  { regex: /\btermination\b|\bevents?\s+of\s+default\b|\bdefault\b/i, clauseType: "termination" },
  { regex: /\brepresentation|\bwarrant|\bindemnit/i, clauseType: "representation" },
  { regex: /\bcovenant|\bfinancial\s+covenant/i, clauseType: "obligation" },
  // German headings
  { regex: /\bbegriffsbestimmung|\bdefinitionen\b/i, clauseType: "definition" },
  { regex: /\baufschiebende\s+bedingung|\bauszahlungsvoraussetzung/i, clauseType: "condition-precedent" },
  { regex: /\bkündigung|\bverzug|\bfälligstellung/i, clauseType: "termination" },
  { regex: /\bzusicherung|\bgewährleistung|\bhaftung/i, clauseType: "representation" },
  { regex: /\bverpflichtung|\bfinanzkennzahl/i, clauseType: "obligation" },
  // Schedule / Anlage patterns
  { regex: /\bconditions\s+precedent\b.*schedule|schedule.*\bconditions\s+precedent\b/i, clauseType: "condition-precedent" },
  // ESG / sustainability
  { regex: /\bnachhaltigkeitsziele\b|\besg\b.*\bmargin\b/i, clauseType: "obligation" },
  // Security / Sicherheiten
  { regex: /\bsicherheiten\b|\bsecurity\b|\bpledge\b|\bcollateral\b/i, clauseType: "obligation" },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const TYPE_KEYWORDS: Record<ClauseType, ReadonlyArray<string>> = {
  "definition": DEFINITION_KEYWORDS,
  "obligation": OBLIGATION_KEYWORDS,
  "condition-precedent": CONDITION_PRECEDENT_KEYWORDS,
  "termination": TERMINATION_KEYWORDS,
  "representation": REPRESENTATION_KEYWORDS,
};

const CLAUSE_TYPES: ReadonlyArray<ClauseType> = [
  "definition",
  "obligation",
  "condition-precedent",
  "termination",
  "representation",
];

/** Minimum keyword hits to assign a type (prevents noise classification). */
const MIN_HITS = 2;

/**
 * Score chunk text against each clause-type keyword set.
 *
 * Returns a record of clause_type to score.
 * Score is the count of distinct keyword matches.
 */
function scoreChunk(text: string): Record<ClauseType, number> {
  const t = text.toLowerCase();
  const scores = {} as Record<ClauseType, number>;
  for (const clauseType of CLAUSE_TYPES) {
    const keywords = TYPE_KEYWORDS[clauseType];
    let hits = 0;
    for (const kw of keywords) {
      if (t.includes(kw)) {
        hits++;
      }
    }
    scores[clauseType] = hits;
  }
  return scores;
}

/**
 * Check heading text against strong heading patterns.
 *
 * Returns clause type if a strong match is found, else null.
 */
function classifyHeading(heading: string): ClauseType | null {
  for (const { regex, clauseType } of HEADING_TYPE_MAP) {
    if (regex.test(heading)) {
      return clauseType;
    }
  }
  return null;
}

/**
 * Classify a single chunk by legal function.
 *
 * Priority:
 *   1. Heading match (strongest signal)
 *   2. Keyword density scoring (fallback)
 *   3. Default to "obligation" if no clear signal (most common clause type)
 */
export function classifyChunk(chunk: TextChunk): ClauseType {
  // Try heading first
  const heading = chunk.heading_text ?? "";
  const sectionId = chunk.section_id ?? "";
  const headingCombined = `${heading} ${sectionId}`;

  const headingType = classifyHeading(headingCombined);
  if (headingType) {
    return headingType;
  }

  // Fall back to keyword scoring on full text
  const text = chunk.text ?? "";
  // Include heading in scoring text for context
  const fullText = `${headingCombined} ${text}`;

  const scores = scoreChunk(fullText);

  // Find the highest-scoring type
  let bestType: ClauseType = "obligation";
  let bestScore = 0;
  for (const clauseType of CLAUSE_TYPES) {
    if (scores[clauseType] > bestScore) {
      bestScore = scores[clauseType];
      bestType = clauseType;
    }
  }

  if (bestScore >= MIN_HITS) {
    return bestType;
  }

  // Not enough signal -- default to obligation (most common in contracts)
  return "obligation";
}

/**
 * Add `clause_type` to each chunk.
 *
 * Mutates chunks in-place and returns the same array.
 * This is a pure local operation -- no API calls.
 */
export function classifyClauseTypes(chunks: TextChunk[]): TextChunk[] {
  for (const chunk of chunks) {
    chunk.clause_type = classifyChunk(chunk);
  }
  return chunks;
}
