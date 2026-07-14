import { getProvider, getModel, type Tool, type ToolUseBlock, type MessageParam } from '@/lib/ai-provider';
export { getApiKey } from '@/lib/ai-provider';
import { z } from 'zod';
import { FXDAField } from '@/types/fxda';
import {
  StructuredGenerationOutputSchema,
  type GenerationSpec,
  type StructuredGenerationOutput,
} from '@/types/generation';
import type { Card, CardBlock } from '@/types/card-template';

// --- Zod Schemas ---

const GenerateBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.string(),
  page: z.number(),
});

const GenerateBlocksResponseSchema = z.object({
  blocks: z.array(GenerateBlockSchema),
});

const FXDAFieldSchema = z.object({
  id: z.string(),
  type: z.enum(['signature', 'initial', 'text', 'textbox', 'date', 'checkbox', 'radiobutton', 'dropdown', 'attachment', 'image', 'secure', 'accept', 'decline']),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  page: z.number(),
  required: z.boolean(),
  party: z.number().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  validation: z.string().optional(),
});

const InferFieldsResponseSchema = z.object({
  roleMap: z.record(z.string(), z.string()),
  fields: z.array(FXDAFieldSchema),
});

const RewriteBlockResponseSchema = z.object({
  rewritten: z.string(),
  diff: z.object({
    original: z.string(),
    modified: z.string(),
  }),
});

const GenerateMetadataResponseSchema = z.object({
  documentType: z.string(),
  sensitivityLevel: z.enum(['low', 'medium', 'high', 'critical']),
  fieldMap: z.record(z.string(), z.string()),
  aiGenerated: z.literal(true),
  summary: z.string(),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

// --- Types ---

interface GenerateBlocksRequest {
  documentContent: string;
  instructions?: string;
}

type GenerateBlocksResponse = z.infer<typeof GenerateBlocksResponseSchema>;

interface LayoutHint {
  text: string;
  lineNumber: number;
  suggestedY: number;
  suggestedFieldType: string;
}

interface InferFieldsRequest {
  documentContent: string;
  existingFields?: FXDAField[];
  layoutHints?: LayoutHint[];
}

type InferFieldsResponse = z.infer<typeof InferFieldsResponseSchema>;

interface RewriteBlockRequest {
  blockContent: string;
  instructions: string;
  context?: string;
}

type RewriteBlockResponse = z.infer<typeof RewriteBlockResponseSchema>;

interface GenerateMetadataRequest {
  documentContent: string;
  existingFields?: FXDAField[];
}

export type GenerateMetadataResponse = z.infer<typeof GenerateMetadataResponseSchema>;

// --- Client ---
// getApiKey is re-exported from '@/lib/ai-provider' at the top of this file.
// AI calls use getProvider().createMessage() — see ai-provider/ for the abstraction.

// --- API Functions ---

const GENERATE_BLOCKS_TOOL: Tool = {
  name: 'generate_blocks_result',
  description: 'Return an array of document content blocks for the requested template.',
  input_schema: {
    type: 'object',
    properties: {
      blocks: {
        type: 'array',
        description: 'Array of document content blocks.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique block identifier (e.g., block-001).' },
            type: {
              type: 'string',
              enum: ['heading', 'paragraph', 'clause', 'definition', 'list', 'signature-block'],
              description: 'The block type.',
            },
            content: { type: 'string', description: 'The full text content of this block.' },
            page: { type: 'number', description: 'Page number (always 1 for generated docs).' },
          },
          required: ['id', 'type', 'content', 'page'],
        },
      },
    },
    required: ['blocks'],
  },
};

export async function generateBlocks(
  request: GenerateBlocksRequest
): Promise<GenerateBlocksResponse> {
  const systemPrompt = [
    'You are a professional document template generator for Compose, an intelligent document workspace.',
    'Generate complete, realistic document content based on the user\'s description.',
    'Each block should have a type: heading for titles/sections, clause for numbered legal provisions,',
    'definition for defined terms, paragraph for body text, list for enumerated items,',
    'signature-block for signature areas.',
    'Generate realistic legal/business language. Include numbered clauses, defined terms, and standard provisions.',
    'Generate at least 8-12 blocks for a complete document.',
    'Always use the generate_blocks_result tool to return your output.',
  ].join(' ');

  const userMessage = request.instructions
    ? `Generate a document template: ${request.documentContent}\n\nAdditional instructions: ${request.instructions}`
    : `Generate a document template: ${request.documentContent}`;

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 8192,
    system: systemPrompt,
    tools: [GENERATE_BLOCKS_TOOL],
    tool_choice: { type: 'tool', name: 'generate_blocks_result' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for generateBlocks');
  }

  return GenerateBlocksResponseSchema.parse(toolUseBlock.input);
}

const INFER_FIELDS_TOOL: Tool = {
  name: 'infer_fields_result',
  description:
    'Return the role map and inferred fields for a document. Each field must have a unique id, a type, placement coordinates, and party assignment.',
  input_schema: {
    type: 'object',
    properties: {
      roleMap: {
        type: 'object',
        description:
          'Map of party number (as string) to role label, e.g. {"1": "Employer", "2": "Employee"}.',
        additionalProperties: { type: 'string' },
      },
      fields: {
        type: 'array',
        description: 'Array of inferred document fields.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique field identifier.' },
            type: {
              type: 'string',
              enum: ['signature', 'initial', 'text', 'textbox', 'date', 'checkbox', 'radiobutton', 'dropdown', 'attachment', 'image', 'secure', 'accept', 'decline'],
              description: 'The field type.',
            },
            name: { type: 'string', description: 'Human-readable field name.' },
            x: { type: 'number', description: 'X position in points from left edge of page.' },
            y: { type: 'number', description: 'Y position in points from top edge of page.' },
            width: { type: 'number', description: 'Field width in points.' },
            height: { type: 'number', description: 'Field height in points.' },
            page: { type: 'number', description: 'Page number (1-based).' },
            required: { type: 'boolean', description: 'Whether the field is required.' },
            party: { type: 'number', description: 'Party number this field is assigned to.' },
            placeholder: { type: 'string', description: 'Placeholder text for the field.' },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Options for dropdown fields.',
            },
            fontSize: { type: 'number', description: 'Font size in points.' },
            fontFamily: { type: 'string', description: 'Font family name.' },
            validation: { type: 'string', description: 'Validation rule or regex.' },
          },
          required: ['id', 'type', 'name', 'x', 'y', 'width', 'height', 'page', 'required'],
        },
      },
    },
    required: ['roleMap', 'fields'],
  },
};

export async function inferFields(
  request: InferFieldsRequest
): Promise<InferFieldsResponse> {
  const systemPrompt = [
    'You are a document field inference engine for Compose, a professional document workspace.',
    'Analyze the document content and identify all parties involved, then infer the form fields that should be placed on the document.',
    'Build a role map that assigns a numeric party identifier (as a string key) to a human-readable role label (e.g. "Employer", "Employee", "Landlord", "Tenant").',
    'For each field, assign a unique id (e.g. "field-1"), choose the appropriate type, provide a descriptive name, estimate placement coordinates, and assign the correct party.',
    'Use reasonable default dimensions: text fields 200x24, signature fields 200x48, date fields 120x24, checkbox fields 20x20, dropdown fields 200x24, initial fields 60x36, company fields 200x24.',
    '',
    'PAGE DIMENSIONS: US Letter = 612 x 792 points. All x/y coordinates must be within these bounds.',
    'DOCUMENT LAYOUT CONVENTIONS:',
    '- Title area: y=50-100, typically centered (x~180-430)',
    '- Body text area: y=100-600, x=50-550 (with ~50pt margins on each side)',
    '- Signature area: y=600-750, fields placed in the lower portion of the page',
    '- Left column: x=50-300, Right column: x=300-560',
    '',
    'FIELD PLACEMENT RULES — place fields RELATIVE to the content that references them:',
    '- Signature fields: place in signature blocks at the bottom of the document (y=620-720). If multiple parties, stack vertically with ~60pt spacing or use left/right columns.',
    '- Date fields: place next to "Date:" labels. Use x position to the right of the label text (~x=150-300) at the same y position as the label.',
    '- Name/text fields: place next to "Name:", party references, or blank lines. Position the field where the fill-in value would go (to the right of the label).',
    '- Bracketed placeholders like [Company Name] or ___: place the field at the approximate position of the placeholder text in the document.',
    '- Initial fields: place near signature blocks, offset slightly (e.g., bottom-right corner of each page).',
    '- Checkbox fields: place to the left of the option text they correspond to.',
    '',
    'If layoutHints are provided in the user message, use the suggestedY values as strong guidance for vertical positioning.',
    'Always use the infer_fields_result tool to return your output.',
  ].join('\n');

  const existingFieldsContext = request.existingFields?.length
    ? `\n\nExisting fields already on this document (augment, do not replace):\n${JSON.stringify(request.existingFields, null, 2)}`
    : '';

  const layoutHintsContext = request.layoutHints?.length
    ? `\n\nLAYOUT HINTS — These indicate where key text appears in the document. Use suggestedY for vertical positioning:\n${JSON.stringify(request.layoutHints, null, 2)}`
    : '';

  const userMessage = `Analyze this document and infer the form fields and party roles:\n\n${request.documentContent}${existingFieldsContext}${layoutHintsContext}`;

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 8192,
    system: systemPrompt,
    tools: [INFER_FIELDS_TOOL],
    tool_choice: { type: 'tool', name: 'infer_fields_result' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for inferFields');
  }

  const parsed = InferFieldsResponseSchema.parse(toolUseBlock.input);
  return parsed;
}

const REWRITE_TOOL: Tool = {
  name: 'rewrite_result',
  description: 'Return the rewritten block content with a diff showing changes.',
  input_schema: {
    type: 'object',
    properties: {
      rewritten: {
        type: 'string',
        description: 'The full rewritten block content.',
      },
      diff: {
        type: 'object',
        properties: {
          original: {
            type: 'string',
            description: 'The original block content before rewriting.',
          },
          modified: {
            type: 'string',
            description: 'The modified block content after rewriting.',
          },
        },
        required: ['original', 'modified'],
      },
    },
    required: ['rewritten', 'diff'],
  },
};

export async function rewriteBlock(
  request: RewriteBlockRequest
): Promise<RewriteBlockResponse> {
  const systemPrompt = [
    'You are a document editing assistant for Compose, a professional document workspace.',
    'You rewrite document blocks according to the user\'s instructions.',
    'Always use the rewrite_result tool to return your output.',
    'Set diff.original to the exact original content provided, and diff.modified to your rewritten version.',
    'Set rewritten to the same value as diff.modified.',
  ].join(' ');

  const userMessage = [
    `Original block content:\n${request.blockContent}`,
    `\nRewrite instructions: ${request.instructions}`,
    request.context ? `\nDocument context: ${request.context}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 4096,
    system: systemPrompt,
    tools: [REWRITE_TOOL],
    tool_choice: { type: 'tool', name: 'rewrite_result' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for rewriteBlock');
  }

  const parsed = RewriteBlockResponseSchema.parse(toolUseBlock.input);
  return parsed;
}

const GENERATE_METADATA_TOOL: Tool = {
  name: 'generate_metadata_result',
  description:
    'Return auto-generated metadata for a document including type classification, sensitivity level, field map, AI flag, summary, and tags.',
  input_schema: {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        description:
          'The document type classification, e.g. "NDA", "Employment Agreement", "Vendor Contract", "Lease Agreement".',
      },
      sensitivityLevel: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description:
          'Sensitivity level based on document content. "critical" for documents with PII or financial data, "high" for legal agreements, "medium" for internal business documents, "low" for general documents.',
      },
      fieldMap: {
        type: 'object',
        description:
          'Mapping of field names to their purposes, e.g. {"partyAName": "Full legal name of the first signing party", "effectiveDate": "Date the agreement becomes binding"}.',
        additionalProperties: { type: 'string' },
      },
      aiGenerated: {
        type: 'boolean',
        description: 'Must always be true — indicates this metadata was generated by AI.',
        enum: [true],
      },
      summary: {
        type: 'string',
        description: 'A single-line summary of the document.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Classification tags for the document, e.g. ["legal", "confidential", "two-party", "employment"].',
      },
      confidence: {
        type: 'number',
        description:
          'Confidence score from 0 to 100 indicating how confident the classification is. 90-100 for clear document types, 70-89 for likely classifications, below 70 for uncertain.',
      },
    },
    required: ['documentType', 'sensitivityLevel', 'fieldMap', 'aiGenerated', 'summary', 'tags', 'confidence'],
  },
};

export async function generateMetadata(
  request: GenerateMetadataRequest
): Promise<GenerateMetadataResponse> {
  const systemPrompt = [
    'You are a document metadata engine for Compose, a professional document workspace.',
    'Analyze the document content and generate structured metadata.',
    'Classify the document type (e.g. "NDA", "Employment Agreement", "Vendor Contract").',
    'Assess sensitivity: "critical" if PII, financial data, or trade secrets are present; "high" for binding legal agreements; "medium" for internal business documents; "low" for general informational documents.',
    'Build a field map that describes the purpose of each significant field or placeholder in the document.',
    'Write a concise one-line summary of the document.',
    'Generate classification tags that would help organize and search for this document.',
    'Provide a confidence score from 0 to 100 indicating how confident the classification is. Use 90-100 for clear document types, 70-89 for likely classifications, and below 70 for uncertain.',
    'Always set aiGenerated to true.',
    'Always use the generate_metadata_result tool to return your output.',
  ].join(' ');

  const existingFieldsContext = request.existingFields?.length
    ? `\n\nExisting fields on this document:\n${JSON.stringify(request.existingFields, null, 2)}`
    : '';

  const userMessage = `Analyze this document and generate its metadata:\n\n${request.documentContent}${existingFieldsContext}`;

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 4096,
    system: systemPrompt,
    tools: [GENERATE_METADATA_TOOL],
    tool_choice: { type: 'tool', name: 'generate_metadata_result' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for generateMetadata');
  }

  const parsed = GenerateMetadataResponseSchema.parse(toolUseBlock.input);
  return parsed;
}

// ── V2 Pipeline: GenerationSpec → Structured Output ──────────────────────

const STRUCTURED_GENERATION_TOOL: Tool = {
  name: 'structured_generation_result',
  description: 'Return a structured document with titled sections and typed content blocks.',
  input_schema: {
    type: 'object',
    properties: {
      documentTitle: {
        type: 'string',
        description: 'The document title.',
      },
      artifactMetadata: {
        type: 'object',
        properties: {
          // Must match ArtifactTypeSchema in types/generation.ts — strict mode enforces this enum.
          artifactType: {
            type: 'string',
            enum: ['agreement', 'proposal', 'brief', 'report', 'presentation', 'letter', 'policy', 'form'],
          },
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
            name: { type: 'string', description: 'Section name.' },
            purpose: { type: 'string', description: 'What this section accomplishes.' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  blockType: {
                    type: 'string',
                    enum: ['hero', 'heading', 'paragraph', 'bullets', 'clause', 'definition', 'summary', 'cta', 'signature-block', 'list', 'table', 'data'],
                  },
                  content: {
                    anyOf: [
                      { type: 'string' },
                      { type: 'array', items: { type: 'string' } },
                    ],
                    description: 'Block content — string for prose blocks, string array for bullet/list blocks. For data blocks, this is ignored (use dataItems instead).',
                  },
                  layoutHint: { type: 'string', description: 'Optional layout suggestion.' },
                  visualHint: { type: 'string', description: 'Optional visual treatment suggestion.' },
                  dataLayout: { type: 'string', enum: ['stat-row', 'card-grid'], description: 'For data blocks only: stat-row (horizontal metrics) or card-grid (grid cards).' },
                  dataItems: {
                    type: 'array',
                    description: 'For data blocks only: array of label/value pairs to display as metrics.',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        value: { anyOf: [{ type: 'string' }, { type: 'number' }], description: 'String or number' },
                        unit: { type: 'string', description: 'Optional unit suffix (%, $, etc.)' },
                      },
                      required: ['label', 'value'],
                    },
                  },
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

export async function generateFromSpec(
  spec: GenerationSpec,
): Promise<StructuredGenerationOutput> {
  const blueprintContext = spec.blueprint.sections
    .map((s, i) => `${i + 1}. ${s.name} (${s.density} density, blocks: ${s.preferredBlockTypes.join(', ')})`)
    .join('\n');

  const systemPrompt = [
    'You are a structured document generator for Compose, a professional document workspace.',
    'You generate documents by following a content blueprint exactly.',
    '',
    'RULES:',
    '- Follow the blueprint section order and density targets precisely.',
    '- Use the preferred block types listed for each section.',
    '- "low" density = short, scannable. "medium" = balanced. "high" = detailed.',
    '- Maximum 6 bullet items per bullets block.',
    '- Maximum 15 words per bullet item.',
    '- No more than 2 consecutive high-density blocks — insert a low-density block between.',
    '- Headings must be 8 words or fewer.',
    '- For sections with metrics/KPIs/statistics, use blockType "data" with dataLayout "stat-row" (horizontal row of metrics) or "card-grid" (grid of metric cards). Include dataItems array with label, value, and optional unit.',
    '',
    'FACTUAL SAFETY (FR11 — CRITICAL):',
    `- Factual grounding policy: ${spec.factualGroundingPolicy}`,
    '- NEVER invent specific metrics, statistics, percentages, dollar amounts, dates, or proper nouns.',
    '- NEVER fabricate customer names, case studies, research findings, or third-party claims.',
    '- If the user did not provide a specific fact, use a clear placeholder: [Company Name], [Date], [Amount], [Metric], [Percentage].',
    '- You MAY infer reasonable structure, framing, and section organization.',
    '- You MAY suggest generic industry context (e.g., "industry-standard terms") but NEVER specific data.',
    spec.factualGroundingPolicy === 'source-only'
      ? '- SOURCE-ONLY mode: Only use facts explicitly present in the user prompt or clarified input. All other specifics must be placeholders.'
      : spec.factualGroundingPolicy === 'infer-safe'
        ? '- INFER-SAFE mode: You may fill in commonly known facts (e.g., standard legal terms) but must not invent company-specific or market-specific claims.'
        : '- CREATIVE mode: You may generate illustrative content but must clearly mark any non-sourced claims as [Example] or [Illustrative].',
    '',
    `Artifact type: ${spec.intent.artifactType}`,
    `Audience: ${spec.intent.audience}`,
    `Tone: ${spec.intent.tone}`,
    `Depth: ${spec.intent.desiredDepth}`,
    `Narrative pattern: ${spec.intent.narrativePattern}`,
    `Factual grounding: ${spec.factualGroundingPolicy}`,
    '',
    'Always use the structured_generation_result tool.',
  ].join('\n');

  const userMessage = [
    `User prompt: "${spec.clarifiedPrompt || spec.rawPrompt}"`,
    '',
    `Title direction: ${spec.blueprint.titleDirection}`,
    '',
    'Content blueprint:',
    blueprintContext,
    '',
    `Target length: ${spec.blueprint.estimatedTotalLength} (~${spec.blueprint.suggestedPageCount} pages)`,
    '',
    'Generate the document following this blueprint.',
  ].join('\n');

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 8192,
    system: systemPrompt,
    tools: [STRUCTURED_GENERATION_TOOL],
    tool_choice: { type: 'tool', name: 'structured_generation_result' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for generateFromSpec');
  }

  return StructuredGenerationOutputSchema.parse(toolUseBlock.input);
}

// --- Intent Interpreter (Agent Chat → BlockUpdate[]) ---

const InterpretIntentResponseSchema = z.object({
  updates: z.array(z.object({
    operation: z.enum(['insert', 'replace', 'delete', 'move']),
    targetBlockId: z.string().optional(),
    content: z.string().optional(),
    afterBlockId: z.string().optional(),
    moveAfterId: z.string().optional(),
    rationale: z.string(),
  })),
  summary: z.string(),
  interpretedIntent: z.string(),
});

export type InterpretIntentResponse = z.infer<typeof InterpretIntentResponseSchema>;

const INTERPRET_INTENT_TOOL: Tool = {
  name: 'interpret_intent_result',
  description: 'Return block update operations based on the user\'s natural language instruction.',
  input_schema: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        description: 'Array of block update operations to apply to the document.',
        items: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['insert', 'replace', 'delete', 'move'],
              description: 'The type of operation: insert (add new block), replace (modify existing), delete (remove block), move (reorder block).',
            },
            targetBlockId: {
              type: 'string',
              description: 'The ID of the block to operate on (required for replace, delete, move).',
            },
            content: {
              type: 'string',
              description: 'The new content for the block (required for insert and replace).',
            },
            afterBlockId: {
              type: 'string',
              description: 'For insert: the block ID to insert after. Use "start" to insert at the beginning.',
            },
            moveAfterId: {
              type: 'string',
              description: 'For move: the block ID to move the target after. Use "start" to move to the beginning.',
            },
            rationale: {
              type: 'string',
              description: 'Brief explanation of why this change was made (shown to user for review).',
            },
          },
          required: ['operation', 'rationale'],
        },
      },
      summary: {
        type: 'string',
        description: 'One-sentence summary of all changes being proposed.',
      },
      interpretedIntent: {
        type: 'string',
        description: 'How the user\'s instruction was interpreted (for transparency).',
      },
    },
    required: ['updates', 'summary', 'interpretedIntent'],
  },
};

export async function interpretIntent(request: {
  instruction: string;
  blocks: { id: string; content: string }[];
  selectedBlockId?: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<InterpretIntentResponse> {
  const systemPrompt = [
    'You are the Compose document editing assistant.',
    'The user has a document made of blocks (paragraphs, headings, etc.).',
    'They will give you a natural language instruction about how to modify the document.',
    'You must interpret their intent and return precise block update operations.',
    'Always use the interpret_intent_result tool to return your response.',
    'Each update must include a rationale explaining the change.',
    'If the instruction is ambiguous, make your best interpretation and explain it in interpretedIntent.',
    'For replace operations, provide the full new content for the block, not a partial edit.',
    'Preserve the document\'s existing style and tone unless the user explicitly asks to change it.',
  ].join(' ');

  const blockList = request.blocks
    .map((b) => `[${b.id}]: ${b.content.slice(0, 500)}${b.content.length > 500 ? '...' : ''}`)
    .join('\n');

  const userMessage = [
    `Current document blocks:\n${blockList}`,
    request.selectedBlockId ? `\nCurrently selected block: ${request.selectedBlockId}` : '',
    `\nUser instruction: ${request.instruction}`,
  ].filter(Boolean).join('\n');

  const messages: MessageParam[] = [];

  // Include conversation history for context
  if (request.conversationHistory?.length) {
    for (const msg of request.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 4096,
    system: systemPrompt,
    tools: [INTERPRET_INTENT_TOOL],
    tool_choice: { type: 'tool', name: 'interpret_intent_result' },
    messages,
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for interpretIntent');
  }

  return InterpretIntentResponseSchema.parse(toolUseBlock.input);
}

// --- Card Regeneration ---

const CardBlockSchema: z.ZodType<CardBlock> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), content: z.string() }),
  z.object({ type: z.literal('paragraph'), content: z.string() }),
  z.object({
    type: z.literal('smart-layout'),
    variant: z.enum(['grid-2x2', 'grid-1x3', 'grid-1x4', 'list', 'timeline']),
    cells: z.array(z.object({ icon: z.string().optional(), heading: z.string(), body: z.string(), accentColor: z.string().optional() })),
  }),
  z.object({ type: z.literal('grid-layout'), gridColumns: z.number(), cells: z.array(z.object({ blocks: z.lazy(() => z.array(CardBlockSchema)) })) }),
  z.object({ type: z.literal('label-group'), labels: z.array(z.object({ text: z.string(), style: z.enum(['filled', 'outline', 'filled-light', 'outline-light']) })) }),
  z.object({ type: z.literal('toggle'), heading: z.string(), content: z.string() }),
  z.object({ type: z.literal('callout'), icon: z.string().optional(), content: z.string() }),
  z.object({ type: z.literal('button'), text: z.string(), url: z.string().optional(), style: z.enum(['primary', 'primary-light']) }),
  z.object({ type: z.literal('divider') }),
  z.object({ type: z.literal('bullet-list'), items: z.array(z.string()) }),
  z.object({ type: z.literal('image'), src: z.string(), alt: z.string().optional(), fit: z.enum(['cover', 'contain']).optional() }),
]);

const RegenerateCardResponseSchema = z.object({
  blocks: z.array(CardBlockSchema),
  summary: z.string(),
});

export type RegenerateCardResponse = z.infer<typeof RegenerateCardResponseSchema>;

export interface RegenerateCardRequest {
  card: Card;
  instruction?: string;
  context?: {
    deckTitle?: string;
    cardIndex?: number;
    totalCards?: number;
    theme?: string;
  };
}

const REGENERATE_CARD_TOOL: Tool = {
  name: 'regenerate_card_result',
  description: 'Return regenerated blocks for a single card in a presentation deck, plus a summary of changes.',
  input_schema: {
    type: 'object',
    properties: {
      blocks: {
        type: 'array',
        description: 'Array of card blocks to replace the existing card content. Use the same block types: heading, paragraph, smart-layout, bullet-list, callout, toggle, label-group, divider, image.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['heading', 'paragraph', 'smart-layout', 'grid-layout', 'label-group', 'toggle', 'callout', 'button', 'divider', 'bullet-list', 'image'] },
            content: { type: 'string', description: 'Text content (heading, paragraph, callout, toggle). May be omitted for non-text block types.' },
            level: { type: 'number', enum: [1, 2, 3], description: 'Heading level (heading blocks only).' },
            heading: { type: 'string', description: 'Heading text (toggle blocks only).' },
            items: { type: 'array', items: { type: 'string' }, description: 'List items (bullet-list blocks only).' },
            variant: { type: 'string', enum: ['grid-2x2', 'grid-1x3', 'grid-1x4', 'list', 'timeline'], description: 'Layout variant (smart-layout blocks only).' },
            cells: { type: 'array', description: 'Cells for smart-layout blocks.', items: { type: 'object', properties: { icon: { type: 'string' }, heading: { type: 'string' }, body: { type: 'string' } }, required: ['heading', 'body'] } },
            labels: { type: 'array', description: 'Labels for label-group blocks.', items: { type: 'object', properties: { text: { type: 'string' }, style: { type: 'string', enum: ['filled', 'outline', 'filled-light', 'outline-light'] } }, required: ['text', 'style'] } },
            icon: { type: 'string', description: 'Icon name (callout blocks).' },
            text: { type: 'string', description: 'Button text (button blocks only).' },
            style: { type: 'string', description: 'Button style (button blocks only).' },
          },
          required: ['type'],
        },
      },
      summary: {
        type: 'string',
        description: 'One-line summary of what was changed in the regenerated card.',
      },
    },
    required: ['blocks', 'summary'],
  },
};

export async function regenerateCard(
  request: RegenerateCardRequest
): Promise<{ card: Card; summary: string }> {
  const { card, instruction, context } = request;

  const currentBlocks = card.columns.flatMap((col) => col.blocks);
  const blockSummary = currentBlocks.map((b) => {
    if (b.type === 'heading') return `[heading ${b.level}] ${b.content}`;
    if (b.type === 'paragraph') return `[paragraph] ${b.content.slice(0, 120)}`;
    if (b.type === 'bullet-list') return `[bullet-list] ${b.items.length} items`;
    if (b.type === 'smart-layout') return `[smart-layout ${b.variant}] ${b.cells.length} cells`;
    if (b.type === 'callout') return `[callout] ${b.content.slice(0, 80)}`;
    if (b.type === 'toggle') return `[toggle] ${b.heading}`;
    return `[${b.type}]`;
  }).join('\n');

  const contextParts: string[] = [];
  if (context?.deckTitle) contextParts.push(`Deck title: "${context.deckTitle}"`);
  if (context?.cardIndex !== undefined && context?.totalCards !== undefined) {
    contextParts.push(`Card ${context.cardIndex + 1} of ${context.totalCards}`);
  }
  if (context?.theme) contextParts.push(`Theme: ${context.theme}`);

  const systemPrompt = [
    'You are regenerating a single card in a presentation deck for Compose, an intelligent document workspace.',
    'Preserve the card\'s block structure and variety. Generate new content that improves quality and clarity.',
    'Use diverse block types — do not collapse everything into headings and paragraphs.',
    'Keep the same approximate number of blocks unless the instruction implies otherwise.',
    'Always use the regenerate_card_result tool to return your output.',
  ].join(' ');

  const userMessage = [
    contextParts.length > 0 ? `Context: ${contextParts.join('. ')}` : '',
    `\nCurrent card blocks:\n${blockSummary}`,
    `\nInstruction: ${instruction || 'Improve the content quality and clarity.'}`,
  ].filter(Boolean).join('\n');

  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 4096,
    system: systemPrompt,
    tools: [REGENERATE_CARD_TOOL],
    tool_choice: { type: 'tool', name: 'regenerate_card_result' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUseBlock) {
    throw new Error('Claude did not return a tool_use response for regenerateCard');
  }

  const parsed = RegenerateCardResponseSchema.parse(toolUseBlock.input);

  const regeneratedCard: Card = {
    ...card,
    columns: [{ blocks: parsed.blocks }],
  };

  return { card: regeneratedCard, summary: parsed.summary };
}
