/**
 * Design Intelligence Layer — Expertise phase: intent clarify (low-confidence path).
 *
 * When the expert can't confidently place a request in an industry/topic
 * (`industryConfidence` low, or no template expert exists), the system should
 * ASK what the user wants rather than silently fall back to a generic deck
 * (Lisa 2026-06-03: "if the slide doesn't fit into an industry or topic — that's
 * okay. ask what they would like — images, infographics, a one-pager for X,
 * what the goal is").
 *
 * This pass asks INTENT questions — format/elements, the artifact/use, the goal —
 * each suggestion-backed and with an "Other…" escape. It is disciplined: if the
 * prompt ALREADY implies the format and goal, it returns an EMPTY list (the
 * empty-state is still the success state — never over-ask). One structured AI
 * call via the provider abstraction, Zod-validated; throws on failure (the
 * caller treats a failure as "no questions").
 */

import { getProvider, getModel } from '@/lib/ai-provider';
import type { Tool, ToolUseBlock } from '@/lib/ai-provider';
import { z } from 'zod';
import { PlanGapSchema } from './types';
import type { PlanGap } from './types';

const SYSTEM_PROMPT = [
  'You help Foxit Slides figure out what a user actually wants when their request does NOT clearly fit a known deck type (product launch, sales pitch, quarterly review, etc.).',
  'In that case, asking beats guessing. Ask at most 2-3 short INTENT questions, drawn from:',
  '- FORMAT / ELEMENTS — should it be image-led, data/infographic-heavy, text-led, a mix? What visual elements do they want?',
  '- THE ARTIFACT / USE — what is this for (a one-pager, a pitch, an internal readout, a teaching deck, a recap…)?',
  '- THE GOAL — what should it accomplish, or the single thing the audience should take away?',
  '',
  'DISCIPLINE — do not over-ask:',
  '- If the prompt ALREADY implies the format AND the goal, return an EMPTY questions array. Empty is the success state. Under-asking beats over-asking.',
  '- NEVER ask generic settings questions: audience, tone, or length/detail — those are controls the user already has.',
  '- Each question must be genuinely decision-changing. Skip filler.',
  '',
  'CRAFT:',
  '- Human, conversational voice — like a thoughtful colleague. Not business-speak.',
  '- For each question provide 2-4 concrete `suggestions` (starter answers shown as chips). The UI appends its own "Other…", so do NOT add catch-alls like "None" or "Not sure".',
  '- Use suggestionKind "starter" (these are example answers, not numeric data).',
  '- Give each a leverage score 0-1; only include questions with leverage >= 0.6.',
  '',
  'Call the intent_questions tool exactly once.',
].join('\n');

const INTENT_TOOL: Tool = {
  name: 'intent_questions',
  description:
    'Return 0-3 intent questions (format/elements, artifact/use, goal) for a request that does not fit a known deck type. Return an empty array when the prompt already implies format + goal.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            type: { type: 'string', enum: ['text', 'select'] },
            options: { type: 'array', items: { type: 'string' }, description: 'Concrete choices for select questions. No "Other/None" catch-alls.' },
            suggestions: { type: 'array', items: { type: 'string' }, description: '2-4 starter answers shown as chips under the field.' },
            leverage: { type: 'number', description: '0-1; only include >= 0.6.' },
          },
          required: ['question', 'type', 'leverage'],
        },
      },
    },
    required: ['questions'],
  },
};

const IntentResultSchema = z.object({ questions: z.array(PlanGapSchema).default([]) });

export interface IntentClarifyContext {
  subject: string;
  count: number;
  audience?: string;
  tone?: string;
}

/** Ask intent questions for an unplaceable request. Returns [] when the prompt
 *  already implies format + goal (the common, calm case). */
export async function intentClarify(ctx: IntentClarifyContext): Promise<PlanGap[]> {
  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [INTENT_TOOL],
    tool_choice: { type: 'tool', name: 'intent_questions' },
    messages: [
      {
        role: 'user',
        content: `Request: """${ctx.subject.trim()}"""\nTarget slide count: ${ctx.count}\n\nThis didn't clearly fit a known deck type. Ask only what genuinely helps shape it — or return empty if the format and goal are already clear.`,
      },
    ],
  });

  const toolBlock = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
  if (!toolBlock) return [];

  const parsed = IntentResultSchema.parse(toolBlock.input);
  // Tag as starter suggestions + filter low-leverage, defensively.
  return parsed.questions
    .filter((q) => q.leverage >= 0.6)
    .map((q) => ({ ...q, suggestionKind: q.suggestionKind ?? 'starter', affects: q.affects ?? [] }));
}
