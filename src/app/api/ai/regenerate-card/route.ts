import { NextRequest, NextResponse } from 'next/server';
import { regenerateCard } from '@/lib/claude';
import { generateCard, budgetForTemplate } from '@/lib/card-engine';
import { cardToUnified } from '@/lib/structuredToFreeform';
import type { Card, CardBlock } from '@/types/card-template';
import type { SkillId } from '@/lib/document-skills';

interface RegenerateCardBody {
  card: Card;
  instruction?: string;
  /** When present, regenerate this card with a new layout (blockTemplate)
   *  by routing through the card-engine instead of the freeform regenerate
   *  path. Used by the "Try different layout" right-click action. */
  blockTemplate?: string;
  /** Only used with blockTemplate — deck prompt for generation context. */
  deckPrompt?: string;
  /** Deck's resolved Skill (from framework default or Voice picker override).
   *  Layout swap preserves the deck's voice — without this, swapping layout
   *  strips the persuasive/legal/etc. prose conventions the user picked. */
  skillId?: SkillId | null;
  context?: {
    deckTitle?: string;
    cardIndex?: number;
    totalCards?: number;
    theme?: string;
    audience?: string;
    tone?: string;
    accentColors?: string[];
  };
}

/** Pull a short "card subject" summary out of a Card's existing content.
 *  Used as the regeneration prompt context when swapping layouts so the new
 *  layout speaks to the same subject. Prefers the first heading; falls back
 *  to the first paragraph; finally the card id. */
function deriveCardSubject(card: Card): string {
  const blocks = card.columns?.flatMap((c) => c.blocks ?? []) ?? [];
  // Try to find existing heading + paragraph for richest context.
  const heading = blocks.find((b): b is Extract<CardBlock, { type: 'heading' }> => b.type === 'heading');
  const para = blocks.find((b): b is Extract<CardBlock, { type: 'paragraph' }> => b.type === 'paragraph');
  const list = blocks.find((b): b is Extract<CardBlock, { type: 'bullet-list' }> => b.type === 'bullet-list');
  const callout = blocks.find((b): b is Extract<CardBlock, { type: 'callout' }> => b.type === 'callout');

  // For unified-format cards the columns are wiped — pull from freeform text
  // blocks instead to still get a meaningful subject after the rewrite.
  if (!heading && !para && card.freeform) {
    const textBlocks = card.freeform.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text');
    const ffHeading = textBlocks.find((b) => b.variant === 'heading' || b.variant === 'subheading');
    const ffPara = textBlocks.find((b) => b.variant === 'paragraph');
    const title = ffHeading?.content || ffPara?.content?.slice(0, 80) || card.id;
    const body = ffPara?.content || textBlocks.map((b) => b.content).join(' ').slice(0, 240);
    return body ? `${title}. ${body}` : title;
  }

  const title = heading?.content || card.id;
  const body =
    para?.content ||
    list?.items?.join('; ') ||
    callout?.content ||
    blocks.map((b) => ('content' in b ? (b.content as string) : '')).filter(Boolean).join(' ').slice(0, 240);
  return body ? `${title}. ${body}` : title;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegenerateCardBody;

    if (!body.card || !body.card.id) {
      return NextResponse.json(
        { data: null, error: 'A valid card object with id is required' },
        { status: 400 },
      );
    }

    // Layout-swap path: synthesise a CardBlueprint card + run generateCard,
    // then convert to unified-format. Skips the freeform regenerate path.
    if (body.blockTemplate) {
      const subject = deriveCardSubject(body.card);
      const cardPlan = {
        id: body.card.id,
        title: subject.split('.')[0].slice(0, 80) || body.card.id,
        layout: body.card.layout ?? 'single',
        style: body.card.style ?? 'default',
        blockPlan: [{ type: 'paragraph', instruction: subject }],
        blockTemplate: body.blockTemplate,
        contentBudget: budgetForTemplate(body.blockTemplate),
      };

      const classification = {
        contentType: 'presentation' as const,
        keyAngle: subject,
        cardCount: body.context?.totalCards ?? 1,
        cards: [],
        audiences: [body.context?.audience ?? 'general'],
        tones: [body.context?.tone ?? 'professional'],
      } as unknown as Parameters<typeof generateCard>[2];

      const generated = await generateCard(
        body.deckPrompt ?? body.context?.deckTitle ?? subject,
        cardPlan,
        classification,
        body.context?.audience ?? 'general',
        body.context?.tone ?? 'professional',
        body.context?.accentColors?.length ? body.context.accentColors : ['#6B3FA0'],
        body.skillId ?? null,
      );

      // Build a temporary Card with the new blocks in column[0], then run
      // it through cardToUnified to produce the freeform layout. Preserve
      // any user-added freeform blocks from the original card so manual
      // edits aren't wiped on layout swap.
      const userFreeform =
        body.card.freeform?.filter((b) => !b.id.startsWith('ff-conv-') && !('__autoLayout' in b ? b.__autoLayout : false)) ?? [];
      const intermediate: Card = {
        ...body.card,
        columns: [{ blocks: generated.blocks as CardBlock[] }],
        freeform: userFreeform,
      };
      const unified = cardToUnified(intermediate);

      return NextResponse.json({ data: { card: unified, summary: `Layout swapped to ${body.blockTemplate}.` }, error: null });
    }

    // Original freeform-regenerate path (instruction-driven, structure-
    // preserving). Requires columns to summarise current blocks.
    if (!Array.isArray(body.card.columns)) {
      return NextResponse.json(
        { data: null, error: 'columns is required for instruction-based regenerate (or provide blockTemplate to swap layout)' },
        { status: 400 },
      );
    }

    const result = await regenerateCard({
      card: body.card,
      instruction: body.instruction,
      context: body.context,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Card regeneration failed';
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
