import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';

// ── /api/ai/slide-chat ─────────────────────────────────────────────────────
//
// Slide-flavored chat endpoint backing the SlideAIPanel. Takes the user's
// prompt + a thin deck context (card titles + the active card's text) and
// returns a single assistant message. No tool-use yet — the AI describes
// what it would do; actual deck mutations come in a later iteration.

const RequestSchema = z.object({
  prompt: z.string().min(1),
  deckContext: z
    .object({
      activeCardTitle: z.string().optional(),
      activeCardText: z.string().optional(),
      cardTitles: z.array(z.string()).optional(),
    })
    .optional(),
  history: z
    .array(z.object({ author: z.enum(['user', 'ai']), text: z.string() }))
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { prompt, deckContext, history } = parsed.data;

    const systemPrompt = `You are a slide-deck editing assistant inside the Compose editor. The user is working on a slide deck and may ask you to rewrite, restructure, expand, or summarize their content.

Be direct and brief. Reply in 1-3 short paragraphs maximum. When suggesting edits, describe them concretely (which slide, what change). Don't repeat the user's prompt back.

You cannot mutate the deck directly yet — describe what you would do and offer to draft it. The user will apply changes manually for now.${
      deckContext
        ? `\n\nDeck context:\n${
            deckContext.cardTitles?.length
              ? `- ${deckContext.cardTitles.length} cards: ${deckContext.cardTitles.join(', ')}`
              : ''
          }${
            deckContext.activeCardTitle
              ? `\n- Active card: "${deckContext.activeCardTitle}"`
              : ''
          }${
            deckContext.activeCardText
              ? `\n- Active card text: ${deckContext.activeCardText.slice(0, 800)}`
              : ''
          }`
        : ''
    }`;

    // Convert chat history to Anthropic message format. Filter out the
    // bootstrap demo conversation if it's present (caller may opt to send
    // only real messages).
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    if (history?.length) {
      for (const m of history) {
        messages.push({
          role: m.author === 'user' ? 'user' : 'assistant',
          content: m.text,
        });
      }
    }
    messages.push({ role: 'user', content: prompt });

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');

    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'No text response from Claude' },
        { status: 500 },
      );
    }

    return NextResponse.json({ text: textBlock.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
