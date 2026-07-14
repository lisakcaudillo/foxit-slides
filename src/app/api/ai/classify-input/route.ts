import { NextRequest, NextResponse } from 'next/server';
import { InputClassificationSchema } from '@/types/generation';
import { getProvider, getModel } from '@/lib/ai-provider';

const CLASSIFY_INPUT_TOOL = {
  name: 'classify_input_result',
  description: 'Classify the type and characteristics of user input for document generation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      inputType: {
        type: 'string',
        enum: ['topic', 'notes', 'outline', 'paste', 'import', 'template-first'],
        description: 'The classified input type. "topic" = bare topic prompt, "notes" = rough unstructured notes, "outline" = structured outline with sections/headers, "paste" = pasted prose from another source, "import" = imported document content, "template-first" = user selected a template before providing content.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0-100 for the classification.',
      },
      hasStructure: {
        type: 'boolean',
        description: 'Whether the input contains structural elements (headers, numbered items, sections).',
      },
      estimatedDepth: {
        type: 'string',
        enum: ['shallow', 'medium', 'deep'],
        description: 'How much detail the user provided. "shallow" = topic only, "medium" = some context/requirements, "deep" = extensive content or notes.',
      },
      containsSourceMaterial: {
        type: 'boolean',
        description: 'Whether the input contains content that should be preserved/transformed rather than generated from scratch.',
      },
    },
    required: ['inputType', 'confidence', 'hasStructure', 'estimatedDepth', 'containsSourceMaterial'],
  },
};

export async function POST(request: NextRequest) {
  try {
    const { prompt, hasTemplate } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    // Short-circuit: if user already selected a template, classify as template-first
    if (hasTemplate) {
      return NextResponse.json({
        inputType: 'template-first',
        confidence: 100,
        hasStructure: true,
        estimatedDepth: 'medium',
        containsSourceMaterial: false,
      });
    }

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 512,
      system: [
        'You classify user input for a document generation system.',
        'Analyze the input and determine what kind of content the user provided.',
        'Be precise: a short sentence like "NDA for two companies" is a "topic".',
        'Bullet points or scattered notes are "notes".',
        'Content with clear headers/sections is an "outline".',
        'Long prose paragraphs copied from elsewhere are "paste".',
        'Always use the classify_input_result tool.',
      ].join(' '),
      tools: [CLASSIFY_INPUT_TOOL],
      tool_choice: { type: 'tool', name: 'classify_input_result' },
      messages: [{ role: 'user', content: `Classify this input:\n\n${prompt}` }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');

    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'Classification failed' }, { status: 500 });
    }

    const result = InputClassificationSchema.parse(toolBlock.input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Classification failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
