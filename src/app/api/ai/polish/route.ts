import { NextRequest, NextResponse } from 'next/server';
import { StructuredGenerationOutputSchema } from '@/types/generation';
import type { StructuredGenerationOutput } from '@/types/generation';
import { getProvider, getModel } from '@/lib/ai-provider';

// FR10 thresholds — QA-testable
const POLISH_RULES = {
  headingMaxWords: 8,
  blockMaxWords: 150,
  maxBulletsPerBlock: 6,
  maxWordsPerBullet: 15,
  passiveVoiceMaxPercent: 20,
  fillerPhrases: [
    'it is important to note',
    'as mentioned above',
    'it should be noted that',
    'it goes without saying',
    'in order to',
    'at the end of the day',
    'for all intents and purposes',
    'needless to say',
    'it is worth mentioning',
    'as a matter of fact',
    'the fact that',
    'in terms of',
    'with regard to',
    'on the other hand',
    'at this point in time',
  ],
};

const POLISH_TOOL = {
  name: 'polished_output_result',
  description: 'Return the polished document with cleaned headings, removed filler, split overloaded blocks, and reduced passive voice.',
  input_schema: {
    type: 'object' as const,
    properties: {
      documentTitle: { type: 'string' },
      artifactMetadata: {
        type: 'object',
        properties: {
          artifactType: { type: 'string' },
          audience: { type: 'string' },
          tone: { type: 'string' },
        },
        required: ['artifactType', 'audience', 'tone'],
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            purpose: { type: 'string' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  blockType: {
                    type: 'string',
                    enum: ['hero', 'heading', 'paragraph', 'bullets', 'clause', 'definition', 'summary', 'cta', 'signature-block', 'list', 'table'],
                  },
                  content: { description: 'String or string array.' },
                  layoutHint: { type: 'string' },
                  visualHint: { type: 'string' },
                },
                required: ['blockType', 'content'],
              },
            },
          },
          required: ['name', 'purpose', 'blocks'],
        },
      },
    },
    required: ['documentTitle', 'artifactMetadata', 'sections'],
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { structured } = body as { structured: StructuredGenerationOutput };

    if (!structured?.sections) {
      return NextResponse.json({ error: 'structured output is required' }, { status: 400 });
    }

    // Pre-check: compute stats to guide the polish pass
    const stats = computeStats(structured);

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 8192,
      system: [
        'You are a document polish engine for Compose.',
        'Your job is to clean up a structured document output according to strict quality rules.',
        'Return the FULL document with all sections and blocks — do not omit anything.',
        '',
        'POLISH RULES (apply ALL of these):',
        `1. HEADINGS: Max ${POLISH_RULES.headingMaxWords} words. Shorten any heading block content that exceeds this.`,
        `2. FILLER PHRASES: Remove these exact phrases wherever they appear: ${POLISH_RULES.fillerPhrases.join(', ')}`,
        `3. OVERLOADED BLOCKS: Any block with more than ${POLISH_RULES.blockMaxWords} words must be split into two blocks of the same type.`,
        `4. PASSIVE VOICE: Rewrite passive constructions to active voice where possible. Target: <${POLISH_RULES.passiveVoiceMaxPercent}% passive per section.`,
        `5. BULLETS: Max ${POLISH_RULES.maxBulletsPerBlock} items per bullets block, max ${POLISH_RULES.maxWordsPerBullet} words per bullet.`,
        '6. REDUNDANCY: Remove duplicate phrases across consecutive blocks.',
        '7. Do NOT change the meaning, add new facts, or remove substantive content.',
        '8. Preserve all blockTypes, layoutHints, and visualHints exactly as given.',
        '',
        'Always use the polished_output_result tool.',
      ].join('\n'),
      tools: [POLISH_TOOL],
      tool_choice: { type: 'tool', name: 'polished_output_result' },
      messages: [{
        role: 'user',
        content: [
          'Polish this document according to the rules.',
          '',
          `Pre-check stats: ${JSON.stringify(stats)}`,
          '',
          `Document: ${JSON.stringify(structured)}`,
        ].join('\n'),
      }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');

    if (!toolBlock || toolBlock.type !== 'tool_use') {
      // Graceful degradation: return original if polish fails
      return NextResponse.json({ polished: structured, stats, polishApplied: false });
    }

    const polished = StructuredGenerationOutputSchema.parse(toolBlock.input);
    const polishedStats = computeStats(polished);

    return NextResponse.json({
      polished,
      stats: { before: stats, after: polishedStats },
      polishApplied: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Polish pass failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Stats for QA visibility ────────────────────────────────────────────────

interface PolishStats {
  totalBlocks: number;
  overloadedBlocks: number;
  longHeadings: number;
  fillerCount: number;
  avgWordsPerBlock: number;
}

function computeStats(output: StructuredGenerationOutput): PolishStats {
  let totalBlocks = 0;
  let overloadedBlocks = 0;
  let longHeadings = 0;
  let fillerCount = 0;
  let totalWords = 0;

  for (const section of output.sections) {
    for (const block of section.blocks) {
      totalBlocks++;
      const text = Array.isArray(block.content)
        ? block.content.join(' ')
        : block.content;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      totalWords += wordCount;

      if (wordCount > POLISH_RULES.blockMaxWords) overloadedBlocks++;
      if (block.blockType === 'heading' && wordCount > POLISH_RULES.headingMaxWords) longHeadings++;

      const lower = text.toLowerCase();
      for (const filler of POLISH_RULES.fillerPhrases) {
        if (lower.includes(filler)) fillerCount++;
      }
    }
  }

  return {
    totalBlocks,
    overloadedBlocks,
    longHeadings,
    fillerCount,
    avgWordsPerBlock: totalBlocks > 0 ? Math.round(totalWords / totalBlocks) : 0,
  };
}
