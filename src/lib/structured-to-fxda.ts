// Convert StructuredGenerationOutput → FXDATemplate
// Shared between generate route and generation pipeline

import type { FXDATemplate, FXDAField } from '@/types/fxda';
import type { GenerationSpec, StructuredGenerationOutput } from '@/types/generation';

export function structuredOutputToFXDA(
  spec: GenerationSpec,
  output: StructuredGenerationOutput,
): FXDATemplate {
  const documentId = `fxda-${Date.now()}`;

  // Flatten sections into page content
  const pageContent = output.sections
    .map((section) => {
      const sectionContent = section.blocks
        .map((block) => {
          if (block.blockType === 'data' && (block as Record<string, unknown>).dataItems) {
            // Data blocks: render as formatted text with metadata marker
            const items = (block as Record<string, unknown>).dataItems as Array<{ label: string; value: string | number; unit?: string }>;
            const layout = ((block as Record<string, unknown>).dataLayout as string) ?? 'stat-row';
            return `__DATA_BLOCK__${layout}__${JSON.stringify(items)}`;
          }
          if (Array.isArray(block.content)) {
            return block.content.map((item) => `• ${item}`).join('\n');
          }
          return block.content;
        })
        .join('\n\n');
      return `## ${section.name}\n\n${sectionContent}`;
    })
    .join('\n\n');

  // Extract signature blocks for field inference
  const sigBlocks = output.sections.flatMap((s) =>
    s.blocks.filter((b) => b.blockType === 'signature-block'),
  );
  const fields = inferBasicFieldsFromStructured(sigBlocks);

  return {
    version: '2.0',
    documentId,
    documentName: output.documentTitle,
    description: '',
    category: detectCategory(spec.rawPrompt),
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
      createdBy: 'Compose AI',
      templateType: output.artifactMetadata.artifactType,
      version: 1,
    },
    workflowPresetId: suggestWorkflow(spec.rawPrompt),
    tags: detectTags(spec.rawPrompt),
  };
}

function inferBasicFieldsFromStructured(
  sigBlocks: Array<{ blockType: string; content: string | string[] }>,
): FXDAField[] {
  const fields: FXDAField[] = [];
  const fieldY = 650;

  if (sigBlocks.length > 0) {
    sigBlocks.forEach((_, idx) => {
      const party = idx + 1;
      const label = party === 1 ? 'First' : party === 2 ? 'Second' : `Party ${party}`;
      fields.push(
        {
          id: `party${party}_signature`,
          type: 'signature',
          name: `${label} Party Signature`,
          x: 50,
          y: fieldY - idx * 100,
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
          y: fieldY - idx * 100,
          width: 150,
          height: 30,
          page: 1,
          required: true,
          party,
        },
      );
    });
  } else {
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
