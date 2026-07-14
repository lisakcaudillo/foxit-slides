import { NextRequest, NextResponse } from 'next/server';
import { ContentBlueprintSchema } from '@/types/generation';
import type { NormalizedIntent } from '@/types/generation';
import type { TemplateSchemaDef } from '@/types/template-schema';
import { getStarterTemplate } from '@/data/starterTemplates';
import { getProvider, getModel } from '@/lib/ai-provider';

const BLUEPRINT_TOOL = {
  name: 'content_blueprint_result',
  description: 'Generate a content blueprint — a structured plan for document generation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      titleDirection: {
        type: 'string',
        description: 'A suggested title direction for the document (not the final title, but guidance for generation).',
      },
      sections: {
        type: 'array',
        description: 'Ordered list of planned sections.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Section name (e.g. "Introduction", "Confidentiality Obligations", "Signature Block").' },
            purpose: { type: 'string', description: 'What this section accomplishes in the document narrative.' },
            density: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Content density target. "low" = scannable/visual, "medium" = balanced, "high" = detailed text.',
            },
            preferredBlockTypes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['hero', 'heading', 'paragraph', 'bullets', 'clause', 'definition', 'summary', 'cta', 'signature-block', 'list', 'table'],
              },
              description: 'Block types suitable for this section.',
            },
            estimatedWordCount: {
              type: 'number',
              description: 'Approximate word count target for this section.',
            },
          },
          required: ['name', 'purpose', 'density', 'preferredBlockTypes'],
        },
      },
      estimatedTotalLength: {
        type: 'string',
        enum: ['short', 'medium', 'long'],
        description: 'Overall document length. "short" = 1-2 pages, "medium" = 3-5 pages, "long" = 6+ pages.',
      },
      suggestedPageCount: {
        type: 'number',
        description: 'Estimated number of pages.',
      },
    },
    required: ['titleDirection', 'sections', 'estimatedTotalLength', 'suggestedPageCount'],
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, clarifiedPrompt, intent, templateId } = body as {
      prompt: string;
      clarifiedPrompt?: string;
      intent: NormalizedIntent;
      templateId?: string;
    };

    if (!prompt || !intent) {
      return NextResponse.json(
        { error: 'prompt and intent are required' },
        { status: 400 },
      );
    }

    const effectivePrompt = clarifiedPrompt || prompt;

    // Template-first mode: if a template is selected, constrain the blueprint
    const template: TemplateSchemaDef | undefined = templateId
      ? getStarterTemplate(templateId)
      : undefined;

    const templateConstraint = template
      ? [
          '',
          'TEMPLATE CONSTRAINT — You MUST follow this template structure:',
          `Template: ${template.name} (${template.description})`,
          `Narrative arc: ${template.narrativeArc}`,
          `Density rules: max ${template.densityRules.maxConsecutiveHighDensity} consecutive high-density sections, max ${template.densityRules.maxBulletsPerBlock} bullets per block, max ${template.densityRules.maxWordsPerBullet} words per bullet.`,
          '',
          'Required sections (MUST include all):',
          ...template.sections
            .filter((s) => s.required)
            .map((s) => `- "${s.name}" (${s.density} density, blocks: ${s.allowedBlockTypes.join(', ')}): ${s.purpose}`),
          '',
          'Optional sections (include if relevant):',
          ...template.sections
            .filter((s) => !s.required)
            .map((s) => `- "${s.name}" (${s.density} density, blocks: ${s.allowedBlockTypes.join(', ')}): ${s.purpose}`),
          '',
          'Use ONLY the allowed block types listed for each section.',
          'Follow the section order exactly as listed above.',
        ].join('\n')
      : '';

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 2048,
      system: [
        'You are a content planning engine for Compose, a professional document workspace.',
        'Given a user\'s prompt and normalized intent, create a content blueprint — a structured plan that will guide document generation.',
        '',
        'BLUEPRINT RULES:',
        '- Plan structure first, prose second.',
        '- Each section must have a clear purpose in the document narrative.',
        '- Vary density across sections — not everything should be "high".',
        '- For legal agreements: use clauses, definitions, and signature blocks.',
        '- For proposals: use hero, bullets, summary, CTA.',
        '- For reports: use headings, paragraphs, tables, summary.',
        '',
        'DENSITY CONTROL (FR9):',
        '- No more than 2 consecutive high-density sections.',
        '- Include at least 1 low-density section per 3 sections.',
        '- Signature blocks and CTA sections are always "low" density.',
        '',
        'Match section count to desiredDepth:',
        '- concise: 3-5 sections',
        '- standard: 5-8 sections',
        '- detailed: 8-12 sections',
        '- comprehensive: 12+ sections',
        templateConstraint,
        '',
        'Always use the content_blueprint_result tool.',
      ].join('\n'),
      tools: [BLUEPRINT_TOOL],
      tool_choice: { type: 'tool', name: 'content_blueprint_result' },
      messages: [{
        role: 'user',
        content: [
          `User prompt: "${effectivePrompt}"`,
          `Normalized intent: ${JSON.stringify(intent)}`,
          template ? `Selected template: ${template.name} (${template.id})` : '',
          'Create a content blueprint for document generation.',
        ].filter(Boolean).join('\n\n'),
      }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');

    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'Blueprint generation failed' }, { status: 500 });
    }

    const result = ContentBlueprintSchema.parse(toolBlock.input);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blueprint generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
