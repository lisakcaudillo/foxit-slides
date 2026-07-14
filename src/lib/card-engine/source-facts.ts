/**
 * source-facts.ts — the SHARED per-metric fact-grounding primitives.
 *
 * Reference implementation drafted by Foxit Slides; the adaptive engine adopts it
 * behind a thin DOM adapter (ownership call, 2026-07-10). Pure TS, ZERO engine
 * dependencies, so it can be lifted verbatim into either codebase.
 *
 * Full contract + rationale: docs/architecture/per-metric-fact-contract.md
 * Shared test set: source-facts.fixtures.json (the keep/strip table IS the contract).
 *
 * The job: stop grounding from asking "is this number anywhere in the source?"
 * and start asking "is this the source's value FOR THIS measure AND subject?" —
 * catching a real number pinned to the wrong metric ("margin's 78%" as growth)
 * or the wrong subject ("Acme's 20%" as ours).
 */

/** A number extracted from the source, tagged with what it's ABOUT. */
export interface SourceFact {
  value: number;
  unit: string;
  /** the measure — "gross margin", "revenue growth". */
  metric: string;
  /** WHO/WHAT — "our company", "Acme", "Product A", "Europe". Optional: many
   *  sources are single-subject and state no subject per number. */
  subject?: string | null;
  /** WHEN — "Q3 2025", "last year". Not yet used by matchFact (finer, later). */
  period?: string | null;
  direction?: 'up' | 'down' | 'flat' | null;
  /** verbatim source phrase; MUST contain value+unit (provenance + keeps the
   *  extractor honest). NOTE: the span check verifies value+unit are real — it
   *  does NOT verify metric/subject attribution, which is the unverified surface
   *  the eval must watch (a cheap model's errors hide here and pass the span). */
  sourceSpan: string;
}

// Multi-char generic stopwords only. Single characters are KEPT significant so
// "Product A" ≠ "Product B" (the distinguishing token is the letter). 'a' is
// deliberately NOT a stopword for the same reason.
const STOP = new Set(['the', 'an', 'of', 'in', 'for', 'our', 'their', 'its', 'and', 'to', 'vs', 'per', 'total', 'overall']);

/** Significant tokens of a phrase: lowercase, drop punctuation + stopwords. */
function tokens(s: string): string[] {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9%$ ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

/** Lexical match (Q2a: normalized-string/synonym first — NO embeddings; the
 *  value+unit pre-narrowing already does most disambiguation, so the matcher
 *  only breaks ties among facts sharing the same number). Match = every
 *  significant token of the SHORTER phrase appears in the longer, so a generic
 *  label ("margin") matches a specific fact ("gross margin") but distinct
 *  phrases ("Product A" vs "Product B") do not. Escalate to embeddings only on a
 *  MEASURED miss rate, never preemptively. */
export function phraseMatches(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t));
}

const normUnit = (u: string): string => String(u ?? '').trim().toLowerCase();

/** Facts carrying exactly this value + unit — the "narrow by the number" step,
 *  exported so a caller can tell "the extractor never captured this number"
 *  (empty → fall back to a weaker check) from "captured it, but for a different
 *  measure" (non-empty + matchFact null → confident wrong-metric → strip). */
export function factsWithNumber(facts: SourceFact[], value: number, unit: string): SourceFact[] {
  return facts.filter((f) => f.value === value && normUnit(f.unit) === normUnit(unit));
}

/**
 * Ground ONE rendered number against the fact set. Returns the fact it's tied to,
 * or null → the caller STRIPS the number (fail-closed, per FR11).
 *
 * Two-step narrowing:
 *   1. keep only facts with the SAME value + unit          (narrow by the number)
 *   2. of those, the measure must match the label, AND — only if the slide
 *      carries a subject — the subject must line up.
 *
 * Single-subject default (confirmed with document-studio): when the SLIDE has no
 * subject, match on measure + value alone (single-subject decks must not
 * over-strip). When the slide HAS a subject, drop facts whose subject clearly
 * differs; a fact with NO subject can't contradict, so it survives.
 */
export function matchFact(
  label: string,
  subject: string | null | undefined,
  value: number,
  unit: string,
  facts: SourceFact[],
): SourceFact | null {
  // 1. narrow by the number itself
  const byNumber = factsWithNumber(facts, value, unit);
  if (!byNumber.length) return null; // not in the source at all → invented

  // 2. the measure must line up
  const byMetric = byNumber.filter((f) => phraseMatches(f.metric, label));
  if (!byMetric.length) return null; // real number, WRONG measure

  // 3. the subject must line up — only when the slide carries one
  if (subject && subject.trim()) {
    const bySubject = byMetric.filter((f) => !f.subject || phraseMatches(f.subject, subject));
    if (!bySubject.length) return null; // number belongs to a DIFFERENT subject
    return bySubject[0];
  }
  return byMetric[0];
}

/** Adapter helper: parse a rendered measure ("78%", "$5M", "20 pts", "600") into
 *  a {value, unit} an adapter can hand to matchFact. Both sides must parse the
 *  same way so a fact's unit and a slide's unit compare equal. */
export function parseMeasure(text: string): { value: number; unit: string } | null {
  const m = String(text ?? '').trim().match(/^([$€£]?)\s*(-?\d[\d,]*\.?\d*)\s*([%a-zA-Z]{0,4})/);
  if (!m) return null;
  const value = parseFloat(m[2].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return { value, unit: (m[1] || '') + (m[3] || '') };
}
