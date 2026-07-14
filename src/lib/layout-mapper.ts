// Deterministic Layout Mapper — PRD v2 FR8
// Maps structured blocks to layouts using deterministic rules.
// Same input always produces same layout (AC5).

import type { GeneratedBlock, GeneratedSection } from '@/types/generation';
import type { LayoutHint, VisualHint } from './block-tokens';

// ── FR8 Content Pattern → Layout Rules ─────────────────────────────────────

interface LayoutDecision {
  layout: LayoutHint;
  visual: VisualHint;
}

/**
 * Determine the layout for a block based on its type, content, and context.
 * This is deterministic: same input → same output, always.
 */
export function mapBlockLayout(
  block: GeneratedBlock,
  sectionIndex: number,
  blockIndex: number,
  sectionBlockCount: number,
): LayoutDecision {
  // 1. If block already has hints from generation, validate and use them
  if (block.layoutHint && isValidLayoutHint(block.layoutHint)) {
    return {
      layout: block.layoutHint as LayoutHint,
      visual: (block.visualHint && isValidVisualHint(block.visualHint))
        ? block.visualHint as VisualHint
        : 'none',
    };
  }

  // 2. Apply deterministic rules based on block type and content pattern
  const text = Array.isArray(block.content)
    ? block.content.join(' ')
    : block.content;

  // Rule: Hero blocks are always full-width with accent border
  if (block.blockType === 'hero') {
    return { layout: 'full-width', visual: 'accent-border' };
  }

  // Rule: CTA blocks are always centered
  if (block.blockType === 'cta') {
    return { layout: 'centered', visual: 'none' };
  }

  // Rule: Signature blocks are always full-width with muted background
  if (block.blockType === 'signature-block') {
    return { layout: 'full-width', visual: 'muted-bg' };
  }

  // Rule: Summary blocks get accent border
  if (block.blockType === 'summary') {
    return { layout: 'full-width', visual: 'accent-border' };
  }

  // Rule: Definition blocks are indented with muted background
  if (block.blockType === 'definition') {
    return { layout: 'indented', visual: 'muted-bg' };
  }

  // Rule: 3 quantified items → stat row (FR8 table)
  if (block.blockType === 'bullets' && Array.isArray(block.content)) {
    const items = block.content;
    if (items.length === 3 && items.every((item) => /\d/.test(item))) {
      return { layout: 'stat-row', visual: 'none' };
    }
  }

  // Rule: Table blocks are always full-width
  if (block.blockType === 'table') {
    return { layout: 'full-width', visual: 'none' };
  }

  // Rule: Heading blocks
  if (block.blockType === 'heading') {
    // First heading in a section — no special layout
    return { layout: 'full-width', visual: 'none' };
  }

  // Rule: Long paragraphs (dense evidence) — two-column if in middle of section
  if (block.blockType === 'paragraph' && text.length > 500 && blockIndex > 0 && blockIndex < sectionBlockCount - 1) {
    return { layout: 'full-width', visual: 'muted-bg' };
  }

  // Default: full-width, no visual treatment
  return { layout: 'full-width', visual: 'none' };
}

/**
 * Apply layout mapping to an entire section's blocks.
 * Returns blocks with resolved layout and visual hints.
 */
export function mapSectionLayouts(
  section: GeneratedSection,
  sectionIndex: number,
): Array<GeneratedBlock & { resolvedLayout: LayoutHint; resolvedVisual: VisualHint }> {
  return section.blocks.map((block, blockIndex) => {
    const decision = mapBlockLayout(block, sectionIndex, blockIndex, section.blocks.length);
    return {
      ...block,
      resolvedLayout: decision.layout,
      resolvedVisual: decision.visual,
    };
  });
}

/**
 * Apply layout mapping to an entire document.
 * Enforces density rhythm: no more than 2 consecutive high-visual blocks.
 */
export function mapDocumentLayouts(
  sections: GeneratedSection[],
): Array<{
  section: GeneratedSection;
  blocks: Array<GeneratedBlock & { resolvedLayout: LayoutHint; resolvedVisual: VisualHint }>;
}> {
  const result = sections.map((section, sectionIndex) => ({
    section,
    blocks: mapSectionLayouts(section, sectionIndex),
  }));

  // Post-process: enforce visual rhythm
  let consecutiveVisual = 0;
  for (const sectionResult of result) {
    for (const block of sectionResult.blocks) {
      if (block.resolvedVisual !== 'none') {
        consecutiveVisual++;
        if (consecutiveVisual > 2) {
          // Reset visual treatment to maintain rhythm
          block.resolvedVisual = 'none';
          consecutiveVisual = 0;
        }
      } else {
        consecutiveVisual = 0;
      }
    }
  }

  return result;
}

// ── Validation helpers ─────────────────────────────────────────────────────

const VALID_LAYOUTS: Set<string> = new Set([
  'full-width', 'two-column', 'indented', 'centered', 'stat-row', 'card-grid',
]);

const VALID_VISUALS: Set<string> = new Set([
  'accent-border', 'muted-bg', 'highlight', 'none',
]);

function isValidLayoutHint(hint: string): hint is LayoutHint {
  return VALID_LAYOUTS.has(hint);
}

function isValidVisualHint(hint: string): hint is VisualHint {
  return VALID_VISUALS.has(hint);
}
