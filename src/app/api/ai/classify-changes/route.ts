import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';

const CLAUSE_CATEGORIES = [
  'fee/payment',
  'termination',
  'indemnification',
  'liability',
  'confidentiality',
  'ip',
  'governing-law',
  'other',
] as const;

type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

const ClassifiedChangeSchema = z.object({
  index: z.number(),
  clause_category: z.enum(CLAUSE_CATEGORIES),
  natural_language_summary: z.string(),
});

const ClassifyResponseSchema = z.object({
  executive_summary: z.string(),
  classifications: z.array(ClassifiedChangeSchema),
});

interface ChangeInput {
  text_a: string | null;
  text_b: string | null;
  classification: string;
}

const CLASSIFY_TOOL = {
  name: 'classify_changes_result',
  description:
    'Return clause classification and natural-language summary for each document change.',
  input_schema: {
    type: 'object' as const,
    properties: {
      executive_summary: {
        type: 'string',
        description: 'A 2-3 sentence executive summary of the overall comparison. State what changed, how serious it is, and what the reviewer should focus on. Write for a busy decision-maker who needs to know if they should be worried.',
      },
      classifications: {
        type: 'array',
        description: 'One entry per change, in the same order as the input.',
        items: {
          type: 'object',
          properties: {
            index: {
              type: 'number',
              description: 'Zero-based index of the change in the input array.',
            },
            clause_category: {
              type: 'string',
              enum: [...CLAUSE_CATEGORIES],
              description: 'The clause category this change belongs to.',
            },
            natural_language_summary: {
              type: 'string',
              description:
                'A plain-language summary explaining what changed and why it matters, written for a legal-ops reviewer.',
            },
          },
          required: ['index', 'clause_category', 'natural_language_summary'],
        },
      },
    },
    required: ['executive_summary', 'classifications'],
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { changes: ChangeInput[] };
    const { changes } = body;

    if (!changes || changes.length === 0) {
      return NextResponse.json({ data: [], error: null });
    }

    const changesDescription = changes
      .map((c, i) => {
        const textA = c.text_a ? `Text A: ${c.text_a.slice(0, 500)}` : 'Text A: (none)';
        const textB = c.text_b ? `Text B: ${c.text_b.slice(0, 500)}` : 'Text B: (none)';
        return `Change ${i} [${c.classification}]:\n${textA}\n${textB}`;
      })
      .join('\n\n---\n\n');

    const systemPrompt = [
      'You are a legal document analysis engine for Compose, a professional document workspace.',
      'Classify each document change into exactly one clause category and write a plain-language summary.',
      'Categories: fee/payment (pricing, fees, payment terms), termination (termination rights, notice periods),',
      'indemnification (indemnity, hold harmless), liability (limitation of liability, damages caps),',
      'confidentiality (NDA provisions, confidential information), ip (intellectual property, licensing, ownership),',
      'governing-law (jurisdiction, dispute resolution, choice of law), other (anything else).',
      'Summaries should be 1-2 sentences explaining the practical impact for a legal-ops reviewer.',
      'Also provide an executive_summary: a 2-3 sentence overview of the entire comparison for a busy decision-maker.',
      'The executive summary should state what changed, how serious it is, and what to focus on.',
      'Always use the classify_changes_result tool to return your output.',
    ].join(' ');

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 4096,
      system: systemPrompt,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_changes_result' },
      messages: [
        {
          role: 'user',
          content: `Classify these ${changes.length} document changes:\n\n${changesDescription}`,
        },
      ],
    });

    const toolUseBlock = response.content.find((block) => block.type === 'tool_use');

    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      return NextResponse.json(
        { data: null, error: 'Claude did not return a tool_use response' },
        { status: 500 },
      );
    }

    const parsed = ClassifyResponseSchema.parse(toolUseBlock.input);
    return NextResponse.json({
      data: parsed.classifications,
      executive_summary: parsed.executive_summary,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Classification failed';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
