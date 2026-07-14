import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getModel, getProvider, type Tool } from '@/lib/ai-provider';

// ── /api/ai/deck-summary ─────────────────────────────────────────────────────
//
// On-demand presenter summary for the deck detail page ("5 minutes before you
// present"). Given each slide's title + body text, returns a synthesized gist,
// the arc (talk track), and the key numbers to remember. Structured output via
// a forced tool call through the provider abstraction (no free-form parsing,
// no mock AI — Hard Constraints). The caller caches the result on the deck, so
// this only runs when the user asks (or after content changes).
//
// FR11 grounding: numbers must be copied verbatim from the slide text — never
// invented or estimated.

const RequestSchema = z.object({
  title: z.string().optional(),
  slides: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .min(1)
    .max(80),
});

const SummarySchema = z.object({
  overview: z.string(),
  arc: z.string(),
  keyNumbers: z.array(z.string()),
});

const SUMMARY_TOOL: Tool = {
  name: 'deck_summary',
  description:
    'Return a tight presenter summary of the deck for someone about to present it.',
  input_schema: {
    type: 'object',
    properties: {
      overview: {
        type: 'string',
        description:
          '1-2 sentences: what this deck argues or covers — the gist a presenter needs in their head.',
      },
      arc: {
        type: 'string',
        description:
          "1-2 sentences: how the deck flows — how it opens, builds, and closes (the talk track).",
      },
      keyNumbers: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The most important figures/stats to remember, copied VERBATIM from the slide text (e.g. "$4.2M ARR", "+38% retention"). Never invent or estimate. Empty array if the deck has none.',
      },
    },
    required: ['overview', 'arc', 'keyNumbers'],
  },
};

const SYSTEM = `You help a presenter get up to speed on their OWN deck moments before presenting.
Given the slides (title + body), produce a tight, human summary:
- overview: 1-2 sentences on what the deck argues/covers.
- arc: 1-2 sentences on how it opens, builds, and closes — their talk track.
- keyNumbers: the figures worth remembering, copied VERBATIM from the slide text. Never invent, estimate, or round numbers that aren't there. Return an empty array if there are none.
Voice: warm and concise, like a sharp colleague — never corporate filler.`;

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, slides } = parsed.data;
    const deckText = slides
      .map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.body}`.trim())
      .join('\n\n');
    const userContent = `Deck title: ${title || 'Untitled'}\n\n${deckText}`;

    const provider = getProvider();
    const res = await provider.createMessage({
      model: getModel(),
      max_tokens: 700,
      system: SYSTEM,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: 'tool', name: 'deck_summary' },
      messages: [{ role: 'user', content: userContent }],
    });

    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return NextResponse.json({ error: 'No summary returned' }, { status: 502 });
    }

    const summary = SummarySchema.safeParse(block.input);
    if (!summary.success) {
      return NextResponse.json({ error: 'Malformed summary' }, { status: 502 });
    }

    return NextResponse.json(summary.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[deck-summary] error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
