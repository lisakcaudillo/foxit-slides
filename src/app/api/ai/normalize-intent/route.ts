import { NextRequest, NextResponse } from 'next/server';
import { NormalizedIntentSchema } from '@/types/generation';
import type { InputClassification } from '@/types/generation';
import { getProvider, getModel } from '@/lib/ai-provider';

const NORMALIZE_INTENT_TOOL = {
  name: 'normalize_intent_result',
  description: 'Produce a normalized intent object from user input and classification.',
  input_schema: {
    type: 'object' as const,
    properties: {
      artifactType: {
        type: 'string',
        enum: ['agreement', 'proposal', 'brief', 'report', 'presentation', 'letter', 'policy', 'form'],
        description: 'The type of document artifact the user wants to create.',
      },
      audience: {
        type: 'string',
        description: 'Who will read this document (e.g. "executive leadership", "legal team", "all employees", "external client").',
      },
      communicationGoal: {
        type: 'string',
        description: 'What the document should accomplish (e.g. "establish confidentiality terms", "propose partnership", "summarize findings").',
      },
      tone: {
        type: 'string',
        enum: ['formal', 'professional', 'conversational', 'technical', 'persuasive'],
        description: 'The appropriate tone for this document.',
      },
      desiredDepth: {
        type: 'string',
        enum: ['concise', 'standard', 'detailed', 'comprehensive'],
        description: 'How detailed the output should be based on the input depth and artifact type.',
      },
      sourceConfidence: {
        type: 'string',
        enum: ['high', 'medium', 'low', 'none'],
        description: 'How much source material is available. "high" = user provided substantial content, "none" = topic-only prompt.',
      },
      needsVisuals: {
        type: 'boolean',
        description: 'Whether this artifact type benefits from visual elements (stats, charts, comparison layouts).',
      },
      narrativePattern: {
        type: 'string',
        enum: ['linear', 'problem-solution', 'compare-contrast', 'executive-summary', 'procedural'],
        description: 'The recommended narrative structure for this artifact.',
      },
    },
    required: ['artifactType', 'audience', 'communicationGoal', 'tone', 'desiredDepth', 'sourceConfidence', 'needsVisuals', 'narrativePattern'],
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, clarifiedPrompt, classification } = body as {
      prompt: string;
      clarifiedPrompt?: string;
      classification: InputClassification;
    };

    if (!prompt || !classification) {
      return NextResponse.json(
        { error: 'prompt and classification are required' },
        { status: 400 },
      );
    }

    const effectivePrompt = clarifiedPrompt || prompt;

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 1024,
      system: [
        'You normalize user intent for a document generation pipeline.',
        'Given the user\'s prompt and an input classification, determine the artifact type, audience, goal, tone, depth, and narrative pattern.',
        'For legal documents (NDAs, contracts, agreements) use artifact type "agreement" and tone "formal".',
        'For business proposals use "proposal" and tone "persuasive".',
        'For reports and summaries use "report" and tone "professional".',
        'Match desiredDepth to the input: topic prompts → "standard", detailed notes → "detailed", outlines → match the outline depth.',
        'Always use the normalize_intent_result tool.',
      ].join(' '),
      tools: [NORMALIZE_INTENT_TOOL],
      tool_choice: { type: 'tool', name: 'normalize_intent_result' },
      messages: [{
        role: 'user',
        content: [
          `User prompt: "${effectivePrompt}"`,
          `Input classification: ${JSON.stringify(classification)}`,
          'Normalize the intent for document generation.',
        ].join('\n\n'),
      }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');

    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'Intent normalization failed' }, { status: 500 });
    }

    const result = NormalizedIntentSchema.parse(toolBlock.input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Intent normalization failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
