/**
 * Card generation from a SourceGroundedBlueprint.
 *
 * E-8 of Phase E. Bridges the source-doc pipeline (E-7) with the card
 * renderer. Each slide brief in the blueprint becomes a real Card with
 * generated blocks AND provenance set, faithful to the slide's claimType.
 *
 * Sits alongside the existing prompt-driven card-engine/index.ts — does
 * not modify that path. Callers opt into source-grounded generation by
 * passing a SourceGroundedBlueprint instead of a free-form prompt.
 */

import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';
import type {
  Card,
  CardBlock,
  CardLayout,
  CardTemplate,
  SourceDocument,
  SourcePassage,
  TemplateTheme,
} from '@/types/card-template';
import type { SourceGroundedBlueprint, SourceGroundedSlide } from '@/types/generation';
import type { AnnotatedElement } from '@/lib/atlas-engine/layer4-semantic';
import { GeneratedBlockSchema, type GeneratedCard } from './types';
import { BLOCK_BRANCHES } from './generation-tools';

// ── Per-slide block generation ──────────────────────────────────────────────

const SlideGenSchema = z.object({
  blocks: z.array(GeneratedBlockSchema),
});

const SYSTEM_PROMPT = `You generate the content for one slide of a deck, grounded in source-document excerpts.

Claim-type rules:
- verbatim: include the exact quoted source text. Prefer a heading + a 'quote'-style callout block. Do not paraphrase.
- paraphrase: faithfully restate one specific passage. Use the source's facts and structure. Do not add framing the source doesn't support.
- derived: synthesize across the supplied elements. You may add brief connective phrasing, but every factual claim must trace to the supplied content.

Never fabricate. If the supplied elements don't support the brief, return fewer blocks rather than invent.

HEADING RULE: lead with a concrete noun phrase. No evaluative-adjective openers ("Strong", "Comprehensive", "Strategic", "Proven", "Robust", "Dynamic", "Powerful", "Innovative", "Cutting-edge").

BODY RULE: open each paragraph or cell body with a concrete subject (number, named entity, action verb). Avoid corporate-filler openers like "Strategic approach", "Comprehensive analysis", "Data-driven methodology".

Output via the submit_slide tool. Block types available:
- heading (level 1/2/3, content)
- paragraph (content)
- bullet-list (items)
- callout (icon optional, content)
- smart-layout (variant: grid-2x2 | grid-1x3 | grid-1x4 | list | timeline; cells)
- divider
- toggle (heading, content)`;

const TOOL_NAME = 'submit_slide';

const slideTool = {
  name: TOOL_NAME,
  description: 'Submit the blocks for this slide.',
  input_schema: {
    type: 'object' as const,
    properties: {
      blocks: {
        type: 'array',
        description: 'Ordered content blocks for this slide. Use varied block types.',
        items: { anyOf: BLOCK_BRANCHES },
      },
    },
    required: ['blocks'],
  },
};

function formatSourceElements(elements: AnnotatedElement[]): string {
  if (elements.length === 0) return '(no source elements available for this slide)';
  return elements
    .map((el, i) => {
      const head = `[s${i}] p${el.page} · ${el.type}${el.level ? ` h${el.level}` : ''} · role=${el.semanticRole}`;
      const body = el.content.length > 500 ? el.content.slice(0, 500) + '…' : el.content;
      return `${head}\n${body}`;
    })
    .join('\n\n');
}

function pickLayoutFor(slide: SourceGroundedSlide, index: number, total: number): CardLayout {
  // First slide is often a cover — use split-left for visual variety.
  if (index === 0) return 'split-left';
  // Last slide is often a CTA / next-step — split-right.
  if (index === total - 1 && total > 1) return 'split-right';
  // Quote-heavy slides stay single (let the quote dominate).
  if (slide.claimType === 'verbatim') return 'single';
  // Default: single layout, content reads naturally.
  return 'single';
}

async function generateOneSlide(
  slide: SourceGroundedSlide,
  sourceElements: AnnotatedElement[],
): Promise<{ blocks: CardBlock[] } | { error: string }> {
  const provider = getProvider();
  const userMsg = [
    `Slide title: ${slide.title}`,
    `Content brief: ${slide.contentBrief}`,
    `Claim type: ${slide.claimType}`,
    slide.sourceSection ? `Source section: ${slide.sourceSection}` : null,
    slide.suggestedBlocks?.length ? `Suggested block types: ${slide.suggestedBlocks.join(', ')}` : null,
    '',
    'Source elements you may draw from:',
    formatSourceElements(sourceElements),
  ]
    .filter(Boolean)
    .join('\n');

  const response = await provider.createMessage({
    model: getModel(),
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
    tools: [slideTool],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return { error: `Slide "${slide.title}" did not return a tool_use block` };
  }
  const parsed = SlideGenSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return { error: `Slide "${slide.title}" output failed validation: ${parsed.error.message}` };
  }
  return { blocks: parsed.data.blocks as CardBlock[] };
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface GenerateFromBlueprintOptions {
  /** Stream callback fired as each slide completes. */
  onSlideComplete?: (slideIndex: number, card: Card) => void;
}

export interface GenerateFromBlueprintResult {
  template: CardTemplate;
  failedSlides: Array<{ slideIndex: number; reason: string }>;
}

/**
 * Generate a deck (CardTemplate) from a SourceGroundedBlueprint.
 *
 * Slides are generated in parallel for throughput. Each card carries
 * provenance pointing back to the source. The deck's sources registry
 * is populated with the single source document.
 */
export async function generateDeckFromSourceBlueprint(
  blueprint: SourceGroundedBlueprint,
  source: SourceDocument,
  annotated: AnnotatedElement[],
  theme: TemplateTheme,
  options: GenerateFromBlueprintOptions = {},
): Promise<GenerateFromBlueprintResult> {
  const total = blueprint.slides.length;

  // Index annotated elements by page for fast per-slide filtering.
  const elementsByPage = new Map<number, AnnotatedElement[]>();
  for (const el of annotated) {
    const list = elementsByPage.get(el.page) ?? [];
    list.push(el);
    elementsByPage.set(el.page, list);
  }

  // Generate each slide. Run in parallel — Promise.all preserves order.
  const cardResults = await Promise.all(
    blueprint.slides.map(async (slide, i): Promise<{ card: Card } | { error: string; slideIndex: number }> => {
      const sourceElements = slide.sourcePages.flatMap(p => elementsByPage.get(p) ?? []);
      const result = await generateOneSlide(slide, sourceElements);
      if ('error' in result) return { error: result.error, slideIndex: i };

      const layout = pickLayoutFor(slide, i, total);
      const passages: SourcePassage[] = sourceElements.map((el) => ({
        page: el.page,
        text: el.content,
        section: slide.sourceSection,
        role: el.semanticRole,
        type: el.type,
      }));
      const card: Card = {
        id: `card-src-${blueprint.sourceDocId.slice(0, 8)}-${i}`,
        layout,
        style: 'default',
        columns: [{ blocks: result.blocks }],
        provenance: {
          sourceDocId: blueprint.sourceDocId,
          sourcePages: slide.sourcePages,
          sourceSection: slide.sourceSection,
          claimType: slide.claimType,
          passages,
        },
      };

      // Apply layout-driven accent zone, matching the prompt-driven assembleTemplate path.
      if (layout === 'split-left' || layout === 'split-right') {
        card.accent = {
          type: 'gradient',
          value: `linear-gradient(135deg, ${theme.accentColors[0]}, ${theme.accentColors[1] || theme.accentColors[0]})`,
          position: layout === 'split-left' ? 'left' : 'right',
        };
      }

      options.onSlideComplete?.(i, card);
      return { card };
    }),
  );

  const cards: Card[] = [];
  const failedSlides: GenerateFromBlueprintResult['failedSlides'] = [];
  for (const r of cardResults) {
    if ('error' in r) {
      failedSlides.push({ slideIndex: r.slideIndex, reason: r.error });
    } else {
      cards.push(r.card);
    }
  }

  const template: CardTemplate = {
    id: `tpl-src-${Date.now()}`,
    name: blueprint.deckTitle,
    description: `Generated from ${source.filename}`,
    category: 'source-grounded',
    thumbnail: '',
    theme,
    cards,
    sources: [source],
  };

  return { template, failedSlides };
}
