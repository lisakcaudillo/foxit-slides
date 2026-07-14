import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getModel } from '@/lib/ai-provider';

const SUGGEST_TOOL = {
  name: 'suggest_context',
  description:
    'Return 2 audience suggestions and 2 tone suggestions tailored to the user’s prompt. Each suggestion is a short phrase (4–10 words) the user can click to fill an input field.',
  input_schema: {
    type: 'object' as const,
    properties: {
      audiences: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Exactly two distinct, specific audience descriptions tailored to the prompt. Avoid generic labels like "general audience". 4–10 words each.',
      },
      tones: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Exactly two distinct tone/voice descriptions appropriate for the prompt. Use vivid, concrete language ("data-driven confidence, no filler" not "professional"). 4–10 words each.',
      },
    },
    required: ['audiences', 'tones'],
  },
};

const SYSTEM = `You help a user configure a document generator by suggesting contextual audience and tone options based on their topic prompt. Both must be specific to the topic — never generic.

Examples for "San Antonio tourist guide for college students":
  audiences: ["College students on a budget", "Young adults exploring for the first time"]
  tones: ["Like a friend texting their favorite spots", "Upbeat travel blog with insider tips"]

Examples for "Q4 board update on revenue and runway":
  audiences: ["Board members reviewing quarterly performance", "Investors tracking burn and milestones"]
  tones: ["Calm executive briefing, numbers-forward", "Direct and defensible, no spin"]

Examples for "Onboarding handbook for new engineers":
  audiences: ["New hires in week one of orientation", "Engineering managers shipping the program"]
  tones: ["Welcoming and concrete, action-oriented", "Plain-spoken, peer-to-peer voice"]

Always tailor both lists to the actual prompt. If the prompt is generic, infer the most likely use case before generating.`;

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const response = await getProvider().createMessage({
      model: getModel(),
      max_tokens: 512,
      system: SYSTEM,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: 'tool', name: 'suggest_context' },
      messages: [
        {
          role: 'user',
          content: `Topic prompt: "${prompt}"\n\nReturn 2 audience suggestions + 2 tone suggestions tailored to this prompt.`,
        },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json({ audiences: [], tones: [] });
    }

    const result = toolBlock.input as { audiences: string[]; tones: string[] };
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to suggest context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
