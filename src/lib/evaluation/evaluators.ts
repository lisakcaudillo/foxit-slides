// Evaluation Engine — Automated quality checks for AI outputs.
// Pure TypeScript, no external dependencies beyond Zod.
// Implements checks for schema compliance, relevance, groundedness, density, and safety.

import { z } from 'zod';
import type { EvaluationCheck, EvaluationResult } from './types';

// ── Check 1: Schema Compliance ────────────────────────────────────────────
// Does the output match the expected Zod schema?

export function evaluateSchema(output: unknown, schema: z.ZodType): EvaluationCheck {
  const result = schema.safeParse(output);
  if (result.success) {
    return {
      name: 'Schema Compliance',
      score: 100,
      passed: true,
      threshold: 100,
      reasoning: 'Output matches the expected schema.',
    };
  }

  const issues = result.error.issues;
  const issueCount = issues.length;
  const topIssues = issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');

  return {
    name: 'Schema Compliance',
    score: 0,
    passed: false,
    threshold: 100,
    reasoning: `Schema validation failed with ${issueCount} issue(s): ${topIssues}`,
  };
}

// ── Check 2: Relevance ───────────────────────────────────────────────────
// Does the output address the prompt? Measured via word overlap scoring.

export function evaluateRelevance(prompt: string, output: string): EvaluationCheck {
  const threshold = 40;
  const promptTokens = tokenize(prompt);
  const outputTokens = tokenize(output);

  if (promptTokens.size === 0) {
    return {
      name: 'Relevance',
      score: 100,
      passed: true,
      threshold,
      reasoning: 'Empty prompt — relevance check skipped.',
    };
  }

  if (outputTokens.size === 0) {
    return {
      name: 'Relevance',
      score: 0,
      passed: false,
      threshold,
      reasoning: 'Output is empty — no relevance to prompt.',
    };
  }

  // Count how many prompt tokens appear in the output
  let matches = 0;
  for (const token of promptTokens) {
    if (outputTokens.has(token)) {
      matches++;
    }
  }

  const score = Math.round((matches / promptTokens.size) * 100);
  const passed = score >= threshold;

  return {
    name: 'Relevance',
    score,
    passed,
    threshold,
    reasoning: passed
      ? `Output covers ${matches}/${promptTokens.size} prompt terms (${score}%).`
      : `Output only covers ${matches}/${promptTokens.size} prompt terms (${score}%) — below ${threshold}% threshold.`,
  };
}

// ── Check 3: Groundedness ────────────────────────────────────────────────
// Does output reference provided sources? For source-only grounding policy (FR11).

export function evaluateGroundedness(output: string, sources: string[]): EvaluationCheck {
  const threshold = 50;

  if (sources.length === 0) {
    return {
      name: 'Groundedness',
      score: 100,
      passed: true,
      threshold,
      reasoning: 'No sources provided — groundedness check skipped.',
    };
  }

  const outputLower = output.toLowerCase();
  let sourcesReferenced = 0;

  for (const source of sources) {
    // Check if any meaningful segment of the source appears in the output
    const sourceTokens = tokenize(source);
    let tokenHits = 0;
    for (const token of sourceTokens) {
      if (outputLower.includes(token)) {
        tokenHits++;
      }
    }
    // Consider a source "referenced" if >= 30% of its tokens appear
    if (sourceTokens.size > 0 && (tokenHits / sourceTokens.size) >= 0.3) {
      sourcesReferenced++;
    }
  }

  const score = Math.round((sourcesReferenced / sources.length) * 100);
  const passed = score >= threshold;

  return {
    name: 'Groundedness',
    score,
    passed,
    threshold,
    reasoning: passed
      ? `Output references ${sourcesReferenced}/${sources.length} sources (${score}%).`
      : `Output only references ${sourcesReferenced}/${sources.length} sources (${score}%) — below ${threshold}% threshold.`,
  };
}

// ── Check 4: Density ─────────────────────────────────────────────────────
// Is content appropriate length? Not too sparse, not too dense.

export function evaluateDensity(
  output: string,
  targetWordCount: { min: number; max: number },
): EvaluationCheck {
  const threshold = 70;
  const words = output.trim().split(/\s+/).filter(Boolean);
  const count = words.length;
  const { min, max } = targetWordCount;

  let score: number;
  let reasoning: string;

  if (count >= min && count <= max) {
    score = 100;
    reasoning = `Word count ${count} is within target range [${min}, ${max}].`;
  } else if (count < min) {
    // Linear penalty: 0 at 0 words, 70 at min
    score = min > 0 ? Math.round((count / min) * threshold) : 0;
    score = Math.max(0, Math.min(score, threshold - 1));
    reasoning = `Word count ${count} is below minimum ${min} (too sparse).`;
  } else {
    // Over max — linear penalty, capped
    const overshoot = count - max;
    const penaltyRange = max * 0.5 || 100; // penalty fully applied at 50% overshoot
    score = Math.max(0, Math.round(threshold - (overshoot / penaltyRange) * threshold));
    reasoning = `Word count ${count} exceeds maximum ${max} by ${overshoot} words (too dense).`;
  }

  return {
    name: 'Density',
    score,
    passed: score >= threshold,
    threshold,
    reasoning,
  };
}

// ── Check 5: Safety ──────────────────────────────────────────────────────
// Does output contain fabricated data? Pattern matching for fake stats/citations.
// Aligned with factual-safety.ts patterns but standalone for evaluation.

const FABRICATION_PATTERNS: RegExp[] = [
  // Specific percentages not in placeholders
  /\b\d{1,3}(?:\.\d+)?%\b(?!\])/,
  // Dollar amounts not in placeholders
  /\$\d[\d,.]+(?!\])/,
  // "Studies show" / "Research indicates" — unsourced claims
  /\b(?:studies?\s+(?:show|indicate|suggest|reveal|found)|research\s+(?:shows?|indicates?|suggests?|reveals?|found)|according\s+to\s+(?:a\s+)?(?:recent|new|latest)\s+(?:study|report|survey|analysis))\b/i,
  // "The research/data/analysis shows"
  /\b(?:our\s+(?:research|data|analysis)\s+(?:shows?|indicates?|reveals?))\b/i,
  // "X out of Y" claims
  /\b\d+\s+out\s+of\s+\d+\b/,
  // Market size claims
  /\b(?:market\s+(?:size|value|worth)\s+(?:of|is|was|reached)\s+\$?\d)/i,
  // ROI/growth multiplier claims
  /\b(?:\d+[xX]\s+(?:ROI|return|growth|increase)|(?:ROI|return)\s+of\s+\d)/i,
];

const PLACEHOLDER_PATTERN = /\[[\w\s,./%-]+\]/g;

export function evaluateSafety(output: string): EvaluationCheck {
  const threshold = 80;

  // Strip placeholders before scanning — content inside brackets is safe
  const cleaned = output.replace(PLACEHOLDER_PATTERN, '');

  const violations: string[] = [];
  for (const pattern of FABRICATION_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      violations.push(match[0]);
    }
  }

  // Score: 100 if no violations, decrease by 15 per violation
  const score = Math.max(0, 100 - violations.length * 15);
  const passed = score >= threshold;

  return {
    name: 'Safety',
    score,
    passed,
    threshold,
    reasoning: violations.length === 0
      ? 'No fabrication patterns detected.'
      : `Found ${violations.length} potential fabrication(s): ${violations.slice(0, 3).map((v) => `"${v}"`).join(', ')}${violations.length > 3 ? '...' : ''}.`,
  };
}

// ── Run All Checks ───────────────────────────────────────────────────────

export function runEvaluation(params: {
  prompt: string;
  output: string;
  schema?: z.ZodType;
  sources?: string[];
  targetDensity?: { min: number; max: number };
}): EvaluationResult {
  const checks: EvaluationCheck[] = [];

  // Schema compliance (only if schema provided)
  if (params.schema) {
    // Try parsing the output as JSON for schema validation
    let parsed: unknown = params.output;
    try {
      parsed = JSON.parse(params.output);
    } catch {
      // If output is not JSON, validate as-is
    }
    checks.push(evaluateSchema(parsed, params.schema));
  }

  // Relevance
  checks.push(evaluateRelevance(params.prompt, params.output));

  // Groundedness (only if sources provided)
  if (params.sources && params.sources.length > 0) {
    checks.push(evaluateGroundedness(params.output, params.sources));
  }

  // Density (only if target provided)
  if (params.targetDensity) {
    checks.push(evaluateDensity(params.output, params.targetDensity));
  }

  // Safety — always runs
  checks.push(evaluateSafety(params.output));

  // Overall score: average of all checks
  const overall = checks.length > 0
    ? Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length)
    : 0;

  const passed = checks.every((c) => c.passed);

  return {
    overall,
    checks,
    passed,
    timestamp: new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Tokenize a string into a set of lowercase, meaningful words (3+ chars). */
function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'some',
    'them', 'than', 'its', 'over', 'such', 'that', 'this', 'with', 'will',
    'each', 'from', 'they', 'were', 'which', 'their', 'said', 'what',
    'about', 'would', 'make', 'like', 'into', 'could', 'time', 'very',
    'when', 'come', 'made', 'find', 'more', 'after', 'also', 'did',
    'many', 'before', 'must', 'through', 'back', 'should', 'well',
    'where', 'just', 'only', 'these', 'those', 'then', 'your',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  return new Set(words);
}
