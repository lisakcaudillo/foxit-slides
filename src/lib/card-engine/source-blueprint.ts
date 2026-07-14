/**
 * Phase E orchestrator: source document → SourceGroundedBlueprint.
 *
 * Ties together Layers 0/2 (extractTextFromPDF), 3 (VLM), 4 (semantic
 * annotation), OCR (for scanned PDFs), and Office conversion (DOCX/PPTX/XLSX).
 * Final stage is a Claude call that turns annotated elements into a deck
 * blueprint with provenance per slide.
 *
 * Consumer: E-8 wires this into the card engine. The card engine accepts a
 * SourceGroundedBlueprint instead of a free-form prompt and produces cards
 * with Card.provenance set.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';
import {
  convertOfficeToPdf,
  detectOfficeFormat,
  extractTextFromPDF,
  isOCRReady,
  ocrPDFBuffer,
  type PDFLayoutElement,
} from '@/lib/foxit-sdk-server';
import { extractPageViaVLM } from '@/lib/source-engine/layer3-vlm';
import {
  annotateElementsWithRoles,
  SEMANTIC_ROLES,
  type AnnotatedElement,
} from '@/lib/source-engine/layer4-semantic';
import { extractOfficeStructure, isNativeOfficeFormat } from './office-extract';
import type { SourceDocument } from '@/types/card-template';
import {
  SourceGroundedBlueprintSchema,
  type SourceGroundedBlueprint,
} from '@/types/generation';

// ── Source detection ────────────────────────────────────────────────────────

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function detectFileType(filename: string): SourceDocument['fileType'] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'pptx';
  return 'image';
}

// ── Step 1: get a PDF buffer (with OCR if needed) ───────────────────────────

async function ensurePDFWithText(
  fileBuffer: Buffer,
  filename: string,
): Promise<{ pdfBuffer: Buffer; ocred: boolean } | { error: string }> {
  // Office formats: convert to PDF first.
  const office = detectOfficeFormat(filename);
  let pdfBuffer = fileBuffer;
  if (office) {
    const conv = await convertOfficeToPdf(fileBuffer, office);
    if ('error' in conv) return { error: conv.error };
    try {
      const fs = await import('fs');
      pdfBuffer = fs.readFileSync(conv.pdfPath);
    } finally {
      conv.cleanup();
    }
  }

  // Probe for extractable text. If none, try OCR.
  const probe = await extractTextFromPDF(pdfBuffer);
  if (probe.error) return { error: probe.error };
  const totalChars = probe.pages.reduce((sum, p) => sum + p.text.length, 0);
  if (totalChars > 0 || !isOCRReady()) {
    return { pdfBuffer, ocred: false };
  }

  // Zero extractable text AND OCR is available → run OCR.
  const ocred = await ocrPDFBuffer(pdfBuffer);
  if ('error' in ocred) return { error: ocred.error };
  return { pdfBuffer: ocred.pdfBuffer, ocred: true };
}

// ── Step 2: extract elements (Layers 0+2 + optional Layer 3 backstop) ───────

interface ExtractedContent {
  pageCount: number;
  elements: PDFLayoutElement[];
  pagesAugmentedByVLM: number[];
}

async function extractElements(
  pdfBuffer: Buffer,
  options: { hint?: string; maxVLMPages?: number } = {},
): Promise<ExtractedContent | { error: string }> {
  const base = await extractTextFromPDF(pdfBuffer);
  if (base.error) return { error: base.error };

  const pageCount = base.pages.length || base.layoutElements.reduce((max, el) => Math.max(max, el.page), 0);

  // Pages with no LR elements AND no extracted text are candidates for Layer 3 VLM.
  const layer2PagesCovered = new Set(base.layoutElements.map(el => el.page));
  const textPagesCovered = new Set(base.pages.map(p => p.page));
  const lowConfidencePages: number[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const hasLR = layer2PagesCovered.has(p);
    const hasText = textPagesCovered.has(p);
    if (!hasLR && !hasText) lowConfidencePages.push(p);
  }

  // Cap VLM pages per call — vision tokens are expensive.
  const vlmBudget = options.maxVLMPages ?? 6;
  const pagesToVLM = lowConfidencePages.slice(0, vlmBudget);
  const vlmElements: PDFLayoutElement[] = [];
  for (const pageNum of pagesToVLM) {
    const vlm = await extractPageViaVLM(pdfBuffer, pageNum - 1, { hint: options.hint });
    if ('error' in vlm) continue;
    vlmElements.push(...vlm.elements);
  }

  // Merge: Layer 2 + Layer 3 (where Layer 2 had nothing). Sort by page, then by original order.
  const allElements = [...base.layoutElements, ...vlmElements];
  allElements.sort((a, b) => a.page - b.page);

  return {
    pageCount,
    elements: allElements,
    pagesAugmentedByVLM: pagesToVLM,
  };
}

// ── Step 3: build the blueprint via Claude ──────────────────────────────────

const SYSTEM_PROMPT = `You build a slide deck blueprint from annotated source-document content.

Rules:
- Each slide focuses on one coherent idea
- Lead with the most important content
- Cite source pages accurately — only include pages that genuinely support the slide
- Choose claimType honestly:
  - verbatim: the slide will quote source text directly (rare; use only when wording matters)
  - paraphrase: restates a specific passage from one or two pages
  - derived: synthesizes across multiple pages, or adds framing/connective material
- Don't pad. If the source supports fewer than the target slide count, return fewer slides.

Output via the tool. Suggested block types come from: heading, paragraph, bullet-list, callout, smart-layout, image, quote.`;

const TOOL_NAME = 'submit_blueprint';

const blueprintTool = {
  name: TOOL_NAME,
  description: 'Submit the slide deck blueprint.',
  input_schema: {
    type: 'object' as const,
    properties: {
      deckTitle: { type: 'string' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            contentBrief: { type: 'string' },
            sourcePages: { type: 'array', items: { type: 'integer', minimum: 1 } },
            sourceSection: { type: 'string' },
            claimType: { type: 'string', enum: ['verbatim', 'paraphrase', 'derived'] },
            suggestedBlocks: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'contentBrief', 'sourcePages', 'claimType'],
        },
      },
    },
    required: ['deckTitle', 'slides'],
  },
};

function formatAnnotated(elements: AnnotatedElement[]): string {
  return elements
    .map((el, i) => {
      const role = el.semanticRole;
      const head = `[${i}] p${el.page} · ${el.type}${el.level ? ` h${el.level}` : ''} · role=${role}`;
      const body = el.content.length > 360 ? el.content.slice(0, 360) + '…' : el.content;
      return `${head}\n${body}`;
    })
    .join('\n\n');
}

const BlueprintResponseSchema = z.object({
  deckTitle: z.string(),
  slides: z.array(
    z.object({
      title: z.string(),
      contentBrief: z.string(),
      sourcePages: z.array(z.number().int().positive()),
      sourceSection: z.string().optional(),
      claimType: z.enum(['verbatim', 'paraphrase', 'derived']),
      suggestedBlocks: z.array(z.string()).optional(),
    }),
  ),
});

async function buildBlueprint(
  sourceDoc: SourceDocument,
  annotated: AnnotatedElement[],
  options: { targetSlides?: number; docTypeHint?: string; topic?: string },
): Promise<Omit<SourceGroundedBlueprint, 'sourceDocId'> | { error: string }> {
  const target = options.targetSlides ?? 10;
  // An explicit targetSlides (user picked it) is a firm requirement; the
  // default (10) stays a soft ceiling.
  const explicit = options.targetSlides != null;
  const countLine = explicit
    ? `Slide count: you MUST return EXACTLY ${target} slides — the user explicitly chose this number, it is a hard requirement. Give each distinct point, list item, table row-group, or sub-section its OWN slide, and split multi-point material across slides to reach ${target} (a deck of ${target} focused slides beats fewer dense ones). Return fewer ONLY if the source genuinely contains fewer than ${target} distinct grounded points — never invent content to pad.`
    : `Target slide count: ${target} (return fewer if the source doesn't support that many).`;
  const contextLines = [
    `Source filename: ${sourceDoc.filename}`,
    `Page count: ${sourceDoc.pageCount}`,
    options.docTypeHint ? `Document type: ${options.docTypeHint}` : null,
    options.topic ? `Topic focus: ${options.topic}` : null,
    countLine,
  ].filter(Boolean).join('\n');

  const provider = getProvider();
  const response = await provider.createMessage({
    model: getModel(),
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${contextLines}\n\nAnnotated source elements (semantic role tags from Layer 4):\n\n${formatAnnotated(annotated)}`,
      },
    ],
    tools: [blueprintTool],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return { error: 'Blueprint builder did not return a tool_use block' };
  }
  const parsed = BlueprintResponseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return { error: `Blueprint output failed schema validation: ${parsed.error.message}` };
  }
  // Hard-cap to an explicit user target if the model overshot. it never pads
  // when it returns fewer — fabricating grounded slides would violate FR11.
  if (explicit && parsed.data.slides.length > target) {
    return { ...parsed.data, slides: parsed.data.slides.slice(0, target) };
  }
  return parsed.data;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface BuildSourceGroundedBlueprintOptions {
  targetSlides?: number;
  docTypeHint?: string;
  topic?: string;
  maxVLMPages?: number;
}

export interface BuildBlueprintResult {
  blueprint: SourceGroundedBlueprint;
  source: SourceDocument;
  /** Layer-4 annotated elements — passed downstream to generateDeckFromSourceBlueprint. */
  annotated: AnnotatedElement[];
  stats: {
    elementCount: number;
    pagesAugmentedByVLM: number[];
    ocred: boolean;
  };
}

export async function buildSourceGroundedBlueprint(
  fileBuffer: Buffer,
  filename: string,
  options: BuildSourceGroundedBlueprintOptions = {},
): Promise<BuildBlueprintResult | { error: string }> {
  const contentHash = sha256(fileBuffer);
  const sourceDocId = `src-${contentHash.slice(0, 16)}`;
  const fileType = detectFileType(filename);

  // Steps 1–2: produce structured elements + page count. DOCX/PPTX are parsed
  // NATIVELY from OOXML (declared headings/lists/tables + real provenance —
  // PPTX slide #, DOCX page-break-derived page) instead of being converted to
  // PDF first, which flattens the structure and forces Layer-2/4 to re-infer
  // it. PDF (and legacy binary .doc/.ppt via conversion) keep the PDF path.
  let elements: PDFLayoutElement[];
  let pageCount: number;
  let pagesAugmentedByVLM: number[] = [];
  let ocred = false;

  const nativeKind = isNativeOfficeFormat(filename);
  if (nativeKind) {
    try {
      elements = await extractOfficeStructure(fileBuffer, nativeKind);
    } catch (e) {
      return { error: `Failed to parse ${nativeKind.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (elements.length === 0) {
      return { error: 'No content could be extracted from this source.' };
    }
    pageCount = elements.reduce((max, el) => Math.max(max, el.page), 0) || 1;
  } else {
    const prepared = await ensurePDFWithText(fileBuffer, filename);
    if ('error' in prepared) return { error: prepared.error };
    ocred = prepared.ocred;
    const extracted = await extractElements(prepared.pdfBuffer, {
      hint: options.docTypeHint,
      maxVLMPages: options.maxVLMPages,
    });
    if ('error' in extracted) return { error: extracted.error };
    if (extracted.elements.length === 0) {
      return { error: 'No content could be extracted from this source.' };
    }
    elements = extracted.elements;
    pageCount = extracted.pageCount;
    pagesAugmentedByVLM = extracted.pagesAugmentedByVLM;
  }

  // Step 3: semantic annotation (Layer 4).
  const annotated = await annotateElementsWithRoles(elements, {
    docType: options.docTypeHint,
    topic: options.topic,
  });
  if ('error' in annotated) return { error: annotated.error };

  // Step 4: assemble source document metadata.
  const source: SourceDocument = {
    id: sourceDocId,
    filename,
    contentHash,
    fileType,
    pageCount,
    uploadedAt: new Date().toISOString(),
  };

  // Step 5: build the blueprint.
  const built = await buildBlueprint(source, annotated, options);
  if ('error' in built) return { error: built.error };

  const blueprint: SourceGroundedBlueprint = {
    sourceDocId,
    deckTitle: built.deckTitle,
    slides: built.slides,
  };

  // Validate end-to-end shape one more time.
  const finalCheck = SourceGroundedBlueprintSchema.safeParse(blueprint);
  if (!finalCheck.success) {
    return { error: `Final blueprint schema check failed: ${finalCheck.error.message}` };
  }

  return {
    blueprint,
    source,
    annotated,
    stats: {
      elementCount: elements.length,
      pagesAugmentedByVLM,
      ocred,
    },
  };
}

// Re-exports for convenience.
export type { SourceGroundedBlueprint, SourceGroundedSlide } from '@/types/generation';
export { SEMANTIC_ROLES };
