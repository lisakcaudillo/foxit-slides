/**
 * Layer 4 — Semantic annotation.
 *
 * Operates on the structured content produced by Layers 0/2/3 and tags each
 * element with a slide-relevant role: key-claim, supporting-evidence,
 * statistic, quote, definition, example, recommendation, risk, next-step.
 *
 * Used by Phase E's source-doc → blueprint pipeline (E-7) to decide which
 * extracted content should become slide content, in what order, with what
 * emphasis. Text-only model call — no vision needed.
 */

import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';
import type { PDFLayoutElement } from '@/lib/foxit-sdk-server';
import { contentKey, getCached } from './content-hash-cache';

export const SEMANTIC_ROLES = [
  'key-claim',
  'supporting-evidence',
  'statistic',
  'quote',
  'definition',
  'example',
  'recommendation',
  'risk',
  'next-step',
  'other',
] as const;

export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

export interface AnnotatedElement extends PDFLayoutElement {
  semanticRole: SemanticRole;
  /** Brief one-phrase justification for the role assignment. */
  rationale?: string;
}

const AnnotationSchema = z.object({
  annotations: z.array(
    z.object({
      index: z.number().int().min(0),
      role: z.enum(SEMANTIC_ROLES),
      rationale: z.string().optional(),
    }),
  ),
});

const SYSTEM_PROMPT = `You tag extracted document content with slide-relevant semantic roles.

For each numbered element, return the role that best describes its function in a slide deck made from this source:

- key-claim: the main assertion or thesis being argued
- supporting-evidence: data/reasoning that backs a claim
- statistic: a specific number, percentage, or quantitative fact
- quote: verbatim language attributed to a person or source
- definition: defines a term or concept
- example: an illustrative instance of a broader point
- recommendation: a call to action, suggestion, or directive
- risk: a warning, caveat, or downside
- next-step: a follow-up action, milestone, or planned future state
- other: doesn't fit the above (use sparingly)

Headings, page numbers, and pure section markers should usually be 'other' unless they make a substantive claim.

Return your answer via the tool. Add a short rationale only when the role isn't obvious from the content alone.`;

const TOOL_NAME = 'submit_annotations';

const tool = {
  name: TOOL_NAME,
  description: 'Submit semantic role annotations for each element.',
  input_schema: {
    type: 'object' as const,
    properties: {
      annotations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', minimum: 0 },
            role: { type: 'string', enum: SEMANTIC_ROLES as unknown as string[] },
            rationale: { type: 'string' },
          },
          required: ['index', 'role'],
        },
      },
    },
    required: ['annotations'],
  },
};

const MAX_ELEMENTS_PER_BATCH = 120;

function formatElementsForPrompt(elements: PDFLayoutElement[]): string {
  return elements
    .map((el, i) => {
      const head = `[${i}] page ${el.page} · ${el.type}${el.level ? ` h${el.level}` : ''}`;
      const body = el.content.length > 400 ? el.content.slice(0, 400) + '…' : el.content;
      return `${head}\n${body}`;
    })
    .join('\n\n');
}

export interface AnnotateOptions {
  /** Optional document-type hint (e.g., "legal contract", "sales report"). */
  docType?: string;
  /** Optional topic hint (e.g., "Q3 results", "termination clauses"). */
  topic?: string;
}

async function annotateBatch(
  batch: PDFLayoutElement[],
  options: AnnotateOptions,
): Promise<AnnotatedElement[] | { error: string }> {
  // Cache key: element content + options + model. Same input → cache hit.
  const key = contentKey(
    'semantic',
    batch,
    options.docType ?? '',
    options.topic ?? '',
    getModel(),
  );

  return getCached('semantic', key, async () => {
    const hint =
      options.docType || options.topic
        ? `\n\nDocument context: ${[options.docType, options.topic].filter(Boolean).join(' — ')}`
        : '';
    const provider = getProvider();
    const response = await provider.createMessage({
      model: getModel(),
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Annotate the following ${batch.length} elements:${hint}\n\n${formatElementsForPrompt(batch)}`,
        },
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    });

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { error: 'Semantic annotator did not return a tool_use block' };
    }
    const parsed = AnnotationSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      return { error: `Annotation output failed schema validation: ${parsed.error.message}` };
    }

    const byIndex = new Map<number, { role: SemanticRole; rationale?: string }>();
    for (const a of parsed.data.annotations) {
      byIndex.set(a.index, { role: a.role, rationale: a.rationale });
    }

    return batch.map((el, i) => {
      const ann = byIndex.get(i);
      return {
        ...el,
        semanticRole: ann?.role ?? 'other',
        rationale: ann?.rationale,
      };
    });
  });
}

/**
 * Tag each element with a slide-relevant semantic role. Batches large inputs
 * to keep per-call token usage bounded.
 */
export async function annotateElementsWithRoles(
  elements: PDFLayoutElement[],
  options: AnnotateOptions = {},
): Promise<AnnotatedElement[] | { error: string }> {
  if (elements.length === 0) return [];

  const result: AnnotatedElement[] = [];
  for (let start = 0; start < elements.length; start += MAX_ELEMENTS_PER_BATCH) {
    const batch = elements.slice(start, start + MAX_ELEMENTS_PER_BATCH);
    const annotated = await annotateBatch(batch, options);
    if ('error' in annotated) return { error: annotated.error };
    result.push(...annotated);
  }
  return result;
}
