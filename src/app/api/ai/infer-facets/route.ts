import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getModel } from '@/lib/ai-provider';

// Structured facet inference for the home prompt's "intent sentence". Reads the
// user's topic prompt (and any attached file name) and infers the deck type,
// audience, tone, detail level, and writing voice — the SAME facets the local
// keyword matcher (`inferFacets` in GenerationPrompt) produces, but semantically
// instead of by exact-word match. The client calls this as the PRIMARY path and
// falls back to the keyword guess if it errors/aborts.

const DETAIL_VALUES = ['Concise', 'Detailed', 'Extensive'] as const;
// Mirrors VOICE_OPTS in GenerationPrompt.tsx — keep in sync if that list changes.
const VOICE_VALUES = [
  'Default', 'No voice', 'Legal', 'Executive', 'Technical', 'Persuasive',
  'Simple', 'HR', 'Research', 'Government', 'Educational', 'Financial',
] as const;

const INFER_TOOL = {
  name: 'infer_facets',
  description:
    'Infer how to configure a slide-deck generator from the user’s topic prompt (and optional attached file name): the deck type, audience, tone, detail level, and writing voice that best fit the topic.',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        description:
          'The kind of deck, as a short label (1–3 words). Use a business label when it fits (Pitch deck, Sales deck, Business review, Report, Proposal, Roadmap, Training deck, Case study, Marketing strategy, Product launch). For a general topic being explained or taught, use a fitting label like "Explainer", "Overview", "Walkthrough", or "Guide". Never return a generic value like "slide deck".',
      },
      audience: {
        type: 'string',
        description:
          'Who the deck is for, as a short specific phrase (2–6 words). If the topic really is for everyone, a clear general descriptor like "Curious general readers" is fine, but avoid the bare words "general audience".',
      },
      tone: {
        type: 'string',
        description:
          'Tone, one short word or phrase. Prefer one of: Professional, Casual, Friendly, Authoritative, Inspirational, Educational, Conversational, Technical. Use "Educational" for teaching/explainer topics.',
      },
      detail: {
        type: 'string',
        enum: [...DETAIL_VALUES],
        description: 'Content per slide. Use "Extensive" for comprehensive/deep-dive/thorough requests, "Concise" for quick/brief ones, else "Detailed".',
      },
      voice: {
        type: 'string',
        enum: [...VOICE_VALUES],
        description: 'Writing voice. Use "Educational" for teaching/explainer topics; "Default" when nothing more specific clearly fits.',
      },
    },
    required: ['type', 'audience', 'tone', 'detail', 'voice'],
  },
};

const SYSTEM = `You configure a slide-deck generator by reading the user's topic prompt (and any attached file name) and inferring the best settings.

Rules:
- Infer meaning, not keywords. "A comprehensive deck about space, galaxies, and black holes" is a general EDUCATIONAL explainer for a broad audience — tone "Educational", voice "Educational", type "Explainer" or "Overview", detail "Extensive".
- Only use a business type (Pitch deck, Sales deck, Business review, etc.) when the topic is clearly a business deliverable.
- Keep the audience specific to the topic; use a general descriptor only when the topic truly is for everyone.
- Never return a generic or empty type like "slide deck".`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, fileName } = await request.json();
    const promptText = typeof prompt === 'string' ? prompt : '';
    const fileText = typeof fileName === 'string' ? fileName : '';
    if (!promptText.trim() && !fileText.trim()) {
      return NextResponse.json({ error: 'prompt or fileName is required' }, { status: 400 });
    }
    const fileLine = fileText.trim() ? `\nAttached file: "${fileText}"` : '';

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 256,
      system: SYSTEM,
      tools: [INFER_TOOL],
      tool_choice: { type: 'tool', name: 'infer_facets' },
      messages: [
        {
          role: 'user',
          content: `Topic prompt: "${promptText}"${fileLine}\n\nInfer the deck type, audience, tone, detail level, and voice.`,
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ error: 'no suggestion' }, { status: 502 });
    }
    return NextResponse.json(toolBlock.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to infer facets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
