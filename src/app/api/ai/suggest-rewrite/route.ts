import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';

const SuggestRewriteResponseSchema = z.object({
  suggested_text: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});

const SUGGEST_REWRITE_TOOL = {
  name: 'suggest_rewrite_result',
  description:
    'Return a suggested alternative clause that addresses the flagged risk while preserving the counterparty\'s likely intent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggested_text: {
        type: 'string',
        description:
          'The full text of the suggested alternative clause. Write it as it would appear in the agreement — no commentary, just the clause text.',
      },
      rationale: {
        type: 'string',
        description:
          'A 1-2 sentence explanation answering: (1) what risk was the counterparty\'s change creating, (2) what the suggested alternative preserves from the counterparty\'s intent, and (3) what protection the alternative restores.',
      },
      confidence: {
        type: 'number',
        description:
          'Confidence score from 0 to 1 indicating how well the suggestion balances both parties\' interests.',
      },
    },
    required: ['suggested_text', 'rationale', 'confidence'],
  },
};

interface SuggestRewriteBody {
  text_a: string;
  text_b: string;
  classification: string;
  clause_type: string;
  risk_reason: string;
  skill?: string;
  user_guidance?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SuggestRewriteBody;
    const { text_a, text_b, classification, clause_type, risk_reason, skill, user_guidance } = body;

    if (!text_a && !text_b) {
      return NextResponse.json({ data: null, error: 'At least one of text_a or text_b must be provided' }, { status: 400 });
    }

    const skillContext = skill
      ? `You are reviewing this document as a ${skill}. Frame your analysis and suggestions from this perspective.\n\n`
      : '';

    const guidanceContext = user_guidance
      ? `\n\nThe user has provided this guidance for the rewrite: "${user_guidance}"`
      : '';

    const systemPrompt = [
      skillContext,
      'You are a contract clause analysis engine for Foxit Slides, a professional document workspace.',
      'Your task is to produce a balanced alternative clause that addresses the flagged risk while preserving the counterparty\'s likely intent.',
      'The suggested clause should be written as it would appear in the agreement — professional, precise legal language.',
      'The rationale must explain: (1) what risk the counterparty\'s change creates, (2) what the suggestion preserves from their intent, (3) what protection the suggestion restores.',
      'Always use the suggest_rewrite_result tool to return your output.',
    ].join(' ');

    const userContent = [
      `Clause type: ${clause_type}`,
      `Change classification: ${classification}`,
      `Risk reason: ${risk_reason}`,
      '',
      `Original clause (Version A):`,
      text_a || '(clause not present — this is a new addition)',
      '',
      `Counterparty's version (Version B):`,
      text_b || '(clause removed)',
      '',
      'Produce a suggested alternative clause that addresses the identified risk while preserving the counterparty\'s likely intent.',
      guidanceContext,
    ].join('\n');

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 2048,
      system: systemPrompt,
      tools: [SUGGEST_REWRITE_TOOL],
      tool_choice: { type: 'tool', name: 'suggest_rewrite_result' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUseBlock = response.content.find((block) => block.type === 'tool_use');

    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      return NextResponse.json(
        { data: null, error: 'Claude did not return a tool_use response' },
        { status: 500 },
      );
    }

    const parsed = SuggestRewriteResponseSchema.parse(toolUseBlock.input);
    return NextResponse.json({ data: parsed, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rewrite suggestion failed';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
