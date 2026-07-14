import { NextRequest, NextResponse } from 'next/server';
import { generateBlocks, generateFromSpec } from '@/lib/claude';
import type { FXDATemplate, FXDAField } from '@/types/fxda';
import type { GenerationSpec, StructuredGenerationOutput } from '@/types/generation';
import { structuredOutputToFXDA } from '@/lib/structured-to-fxda';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // V2 path: GenerationSpec-driven pipeline
    if (body.generationSpec) {
      const spec = body.generationSpec as GenerationSpec;
      const structured = await generateFromSpec(spec);
      const fxdaTemplate = structuredOutputToFXDA(spec, structured);
      return NextResponse.json({
        template: fxdaTemplate,
        structured,
        pipelineVersion: 2,
      });
    }

    // V1 path: backward-compatible simple prompt
    const { prompt } = body;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt or generationSpec is required' },
        { status: 400 },
      );
    }

    const result = await generateBlocks({
      documentContent: prompt,
    });

    const documentId = `fxda-${Date.now()}`;
    const documentName = extractDocumentName(result.blocks);

    const pageContent = result.blocks
      .map((b) => b.content)
      .join('\n\n');

    const fields = inferBasicFields(result.blocks);

    const fxdaTemplate: FXDATemplate = {
      version: '1.0',
      documentId,
      documentName,
      description: '',
      category: detectCategory(prompt),
      pages: [
        {
          pageNumber: 1,
          width: 612,
          height: 792,
          content: pageContent,
        },
      ],
      fields,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'Foxit Slides AI',
        templateType: detectCategory(prompt).toLowerCase(),
        version: 1,
      },
      workflowPresetId: suggestWorkflow(prompt),
      tags: detectTags(prompt),
    };

    return NextResponse.json(fxdaTemplate);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractDocumentName(
  blocks: Array<{ type: string; content: string }>,
): string {
  const heading = blocks.find((b) => b.type === 'heading');
  if (heading) return heading.content.slice(0, 80);
  return 'Untitled Document';
}

function detectCategory(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('nda') || lower.includes('legal') || lower.includes('confidential'))
    return 'Legal';
  if (lower.includes('hr') || lower.includes('employee') || lower.includes('offer'))
    return 'HR';
  if (lower.includes('vendor') || lower.includes('procurement') || lower.includes('contract'))
    return 'Procurement';
  return 'General';
}

function detectTags(prompt: string): string[] {
  const tags: string[] = [];
  const lower = prompt.toLowerCase();
  if (lower.includes('nda')) tags.push('nda', 'confidential');
  if (lower.includes('vendor')) tags.push('vendor', 'procurement');
  if (lower.includes('employee') || lower.includes('hr')) tags.push('hr', 'hiring');
  if (lower.includes('contract')) tags.push('contract');
  return tags.length > 0 ? tags : ['general', 'document'];
}

function suggestWorkflow(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('nda')) return 'nda-standard';
  if (lower.includes('offer')) return 'hr-offer';
  if (lower.includes('vendor')) return 'vendor-contract';
  return 'simple-agreement';
}

function inferBasicFields(
  blocks: Array<{ type: string; content: string }>,
): FXDAField[] {
  const fields: FXDAField[] = [];
  const sigBlocks = blocks.filter((b) => b.type === 'signature-block');
  let fieldY = 650;

  // Create fields for each signature block found
  sigBlocks.forEach((_, idx) => {
    const party = idx + 1;
    const label = party === 1 ? 'First' : party === 2 ? 'Second' : `Party ${party}`;

    fields.push(
      {
        id: `party${party}_name`,
        type: 'text',
        name: `${label} Party Name`,
        x: 50,
        y: fieldY - idx * 140,
        width: 250,
        height: 30,
        page: 1,
        required: true,
        party,
        placeholder: `Enter ${label.toLowerCase()} party name`,
      },
      {
        id: `party${party}_signature`,
        type: 'signature',
        name: `${label} Party Signature`,
        x: 50,
        y: fieldY - 40 - idx * 140,
        width: 200,
        height: 50,
        page: 1,
        required: true,
        party,
      },
      {
        id: `party${party}_date`,
        type: 'date',
        name: 'Date Signed',
        x: 270,
        y: fieldY - 40 - idx * 140,
        width: 150,
        height: 30,
        page: 1,
        required: true,
        party,
      },
    );
  });

  // If no signature blocks found, add default 2-party fields
  if (fields.length === 0) {
    for (let party = 1; party <= 2; party++) {
      const label = party === 1 ? 'First' : 'Second';
      fields.push(
        {
          id: `party${party}_signature`,
          type: 'signature',
          name: `${label} Party Signature`,
          x: 50,
          y: fieldY - (party - 1) * 100,
          width: 200,
          height: 50,
          page: 1,
          required: true,
          party,
        },
        {
          id: `party${party}_date`,
          type: 'date',
          name: 'Date Signed',
          x: 270,
          y: fieldY - (party - 1) * 100,
          width: 150,
          height: 30,
          page: 1,
          required: true,
          party,
        },
      );
    }
  }

  return fields;
}
