// Factual Safety Validator — PRD v2 FR11 / AC7
// Scans structured output for potential fabricated claims.
// Used by QA for validation and optionally in the pipeline for runtime checks.

import type { StructuredGenerationOutput, GeneratedBlock } from '@/types/generation';

// ── Fabrication patterns ───────────────────────────────────────────────────

const FABRICATION_PATTERNS = [
  // Specific percentages not in placeholders
  /\b\d{1,3}(?:\.\d+)?%\b(?!\])/,
  // Dollar amounts not in placeholders
  /\$\d[\d,.]+(?!\])/,
  // Specific years in claims (not in dates/placeholders)
  /(?:in|since|by|from)\s+\d{4}\b(?!\])/,
  // "Studies show", "Research indicates" — unsourced claims
  /\b(?:studies?\s+(?:show|indicate|suggest|reveal|found)|research\s+(?:shows?|indicates?|suggests?|reveals?|found)|according\s+to\s+(?:a\s+)?(?:recent|new|latest)\s+(?:study|report|survey|analysis))\b/i,
  // Specific company references that look invented
  /\b(?:our\s+(?:research|data|analysis)\s+(?:shows?|indicates?|reveals?))\b/i,
  // "X out of Y" claims
  /\b\d+\s+out\s+of\s+\d+\b/,
  // Market size claims
  /\b(?:market\s+(?:size|value|worth)\s+(?:of|is|was|reached)\s+\$?\d)/i,
  // ROI/growth claims
  /\b(?:\d+[xX]\s+(?:ROI|return|growth|increase)|(?:ROI|return)\s+of\s+\d)/i,
];

// Placeholder pattern — content inside brackets is safe
const PLACEHOLDER_PATTERN = /\[[\w\s,./%-]+\]/g;

// ── Safety check result ────────────────────────────────────────────────────

export interface SafetyFlag {
  sectionName: string;
  blockIndex: number;
  blockType: string;
  match: string;
  pattern: string;
  severity: 'warning' | 'critical';
}

export interface SafetyCheckResult {
  passed: boolean;
  flags: SafetyFlag[];
  totalBlocksChecked: number;
  flaggedBlockCount: number;
}

// ── Main validator ─────────────────────────────────────────────────────────

/**
 * Scan structured output for potential fabricated claims.
 * Returns safety check result with detailed flags.
 */
export function checkFactualSafety(
  output: StructuredGenerationOutput,
  groundingPolicy: 'source-only' | 'infer-safe' | 'creative' = 'source-only',
): SafetyCheckResult {
  const flags: SafetyFlag[] = [];
  let totalBlocksChecked = 0;

  for (const section of output.sections) {
    for (let blockIdx = 0; blockIdx < section.blocks.length; blockIdx++) {
      const block = section.blocks[blockIdx];
      totalBlocksChecked++;

      const text = getBlockText(block);
      // Strip placeholders before checking — they're safe
      const cleanText = text.replace(PLACEHOLDER_PATTERN, '');

      for (const pattern of FABRICATION_PATTERNS) {
        const match = cleanText.match(pattern);
        if (match) {
          // In creative mode, some patterns are only warnings
          const severity = groundingPolicy === 'creative' ? 'warning' : 'critical';

          flags.push({
            sectionName: section.name,
            blockIndex: blockIdx,
            blockType: block.blockType,
            match: match[0],
            pattern: pattern.source,
            severity,
          });
        }
      }
    }
  }

  const flaggedBlocks = new Set(flags.map((f) => `${f.sectionName}-${f.blockIndex}`));

  return {
    passed: flags.filter((f) => f.severity === 'critical').length === 0,
    flags,
    totalBlocksChecked,
    flaggedBlockCount: flaggedBlocks.size,
  };
}

function getBlockText(block: GeneratedBlock): string {
  if (Array.isArray(block.content)) {
    return block.content.join(' ');
  }
  return block.content;
}
