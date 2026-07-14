/**
 * Layer 3 — VLM (vision language model) page extraction.
 *
 * Calls a vision-capable model (Claude by default) on a rendered PDF page.
 * Used when Layers 0+2 return low-confidence structure for a page —
 * stylized layouts, scanned pages, image-heavy pages, handwriting.
 *
 * This module is the primitive. The decision of WHEN to fire Layer 3 lives
 * in the Phase E source-doc pipeline (E-7), which calls this per-page based
 * on confidence signals.
 */

import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';
import { visionUserMessage } from '@/lib/ai-provider/vision';
import { renderPDFPageToPNG } from '@/lib/foxit-sdk-server';
import type { PDFLayoutElement } from '@/lib/foxit-sdk-server';
import { contentKey, getCached } from './content-hash-cache';

// ── Output schema ────────────────────────────────────────────────────────────

const VLMElementSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'list', 'table', 'figure']),
  level: z.number().int().min(1).max(6).optional(),
  content: z.string(),
});

const VLMSignalsSchema = z.object({
  hasFigures: z.boolean(),
  hasCharts: z.boolean(),
  hasTables: z.boolean(),
  hasHandwriting: z.boolean(),
  isMostlyImage: z.boolean(),
});

const VLMResponseSchema = z.object({
  elements: z.array(VLMElementSchema),
  summary: z.string().optional(),
  signals: VLMSignalsSchema,
});

export type VLMSignals = z.infer<typeof VLMSignalsSchema>;

export interface VLMPageExtraction {
  page: number;
  elements: PDFLayoutElement[];
  summary?: string;
  signals: VLMSignals;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You analyze a single rendered PDF page and return its structural content.

Output strict JSON via the tool. Order elements top-to-bottom, left-to-right (or column-by-column for multi-column layouts). Each element:
- type: heading | paragraph | list | table | figure
- level (only for heading): 1=document title, 2=section, 3=subsection, 4-6=deeper
- content: plain text. For lists, separate items with newlines. For tables, separate rows with newlines and cells with tabs. For figures, write a brief description (one sentence).

Signal flags describe what the page contains overall:
- hasFigures: photos, illustrations, diagrams
- hasCharts: bar/line/pie/area charts with data
- hasTables: tabular data with rows and columns
- hasHandwriting: any handwritten text
- isMostlyImage: more than 50% of page area is non-text content

Skip page numbers, headers, and footers unless they are the only content.`;

const TOOL_NAME = 'submit_page_extraction';

const tool = {
  name: TOOL_NAME,
  description: 'Submit the structured extraction of the page.',
  input_schema: {
    type: 'object' as const,
    properties: {
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['heading', 'paragraph', 'list', 'table', 'figure'] },
            level: { type: 'integer', minimum: 1, maximum: 6 },
            content: { type: 'string' },
          },
          required: ['type', 'content'],
        },
      },
      summary: { type: 'string', description: 'One-sentence summary of the page content.' },
      signals: {
        type: 'object',
        properties: {
          hasFigures: { type: 'boolean' },
          hasCharts: { type: 'boolean' },
          hasTables: { type: 'boolean' },
          hasHandwriting: { type: 'boolean' },
          isMostlyImage: { type: 'boolean' },
        },
        required: ['hasFigures', 'hasCharts', 'hasTables', 'hasHandwriting', 'isMostlyImage'],
      },
    },
    required: ['elements', 'signals'],
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface ExtractPageViaVLMOptions {
  /** Optional hint to guide the VLM (e.g., "legal contract", "sales deck"). */
  hint?: string;
  /** Max render dimension for the page image. Default 1568px. */
  maxDimension?: number;
}

/**
 * Render PDF page `pageIndex` (0-based) and run VLM extraction on it.
 * Returns 1-based page number in the result.
 */
export async function extractPageViaVLM(
  pdfBuffer: Buffer,
  pageIndex: number,
  options: ExtractPageViaVLMOptions = {},
): Promise<VLMPageExtraction | { error: string }> {
  // Cache key: content hash + page index + hint + dimension cap + model.
  // Same source + same page + same prompt parameters → cache hit.
  const key = contentKey(
    pdfBuffer,
    'vlm-page',
    pageIndex,
    options.hint ?? '',
    options.maxDimension ?? 1568,
    getModel(),
  );

  return getCached('vlm-page', key, async () => {
    const rendered = await renderPDFPageToPNG(pdfBuffer, pageIndex, {
      maxDimension: options.maxDimension,
    });
    if ('error' in rendered) return { error: rendered.error };

    const userText = options.hint
      ? `This page is from a document of type: ${options.hint}. Extract its structural content.`
      : 'Extract the structural content of this page.';

    const provider = getProvider();
    const response = await provider.createMessage({
      model: getModel(),
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        visionUserMessage(
          [{ data: rendered.pngBuffer, mimeType: 'image/png' }],
          userText,
        ),
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    });

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { error: 'VLM did not return a tool_use block' };
    }

    const parsed = VLMResponseSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      return { error: `VLM output failed schema validation: ${parsed.error.message}` };
    }

    const page1Indexed = pageIndex + 1;
    return {
      page: page1Indexed,
      elements: parsed.data.elements.map(el => ({
        type: el.type,
        level: el.level,
        content: el.content,
        page: page1Indexed,
        rawType: `vlm-${el.type}${el.level ? el.level : ''}`,
      })),
      summary: parsed.data.summary,
      signals: parsed.data.signals,
    };
  });
}
