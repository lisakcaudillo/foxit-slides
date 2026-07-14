/**
 * deck-brief.ts — pre-planner content sketch (R-0.7).
 *
 * The bug this exists to fix: today's `planCapturedDeck` does five things in
 * one LLM call — deck goal, narrative arc, curation, layout shape-fit, and
 * editorial brief. When the model has to reason about layout choice at the
 * same time as content curation, layout choice often loses. Result: L1/L2
 * failures (wrong layout picked, blocks compete for focus) that no downstream
 * fixer can recover from.
 *
 * This agent splits the FIRST two phases out into a specialized call:
 *   PHASE 0 (holistic view) — deck goal, narrative arc
 *   PHASE 1 (curate)        — per-slide content intentions with shape hints
 *
 * The brief output is a concrete content sketch:
 *   deckGoal        one sentence — what the deck must leave the audience with
 *   narrativeArc    ordered sequence of narrative roles from the closed vocab
 *   slideIntentions per-slide: title, intendedContentType (shape description),
 *                   keyPoints (bullet list of concrete points the writer will
 *                   author), narrativeRole (the arc position)
 *
 * `intendedContentType` is a SHAPE description, not a layout key. Examples:
 *   "4-item feature grid, each item = icon + short label + one-line body"
 *   "3 metric tiles (TAM/SAM/SOM) with brief context under each"
 *   "hero image + title + 1 body paragraph"
 * The downstream planner reads these and picks captured layouts whose
 * SLIDE_AFFORDANCES match — content-driven layout choice.
 *
 * Cost: one gpt-4o-mini call, ~$0.003 per deck. Fail-open — a null return
 * lets planCapturedDeck fall back to its monolithic 5-phase reasoning.
 */
import OpenAI from 'openai';
import { z } from 'zod';

export interface SlideIntention {
  title: string;
  /** Shape description, not a layout key. What the slide's content LOOKS LIKE
   *  as content structure — "3 metric tiles with context", "4-icon grid",
   *  "hero image with title and one paragraph". The planner matches these
   *  against SLIDE_AFFORDANCES to pick a captured layout. */
  intendedContentType: string;
  /** Concrete points the writer will author on this slide, one per bullet.
   *  Numeric values, names, and specific facts BELONG here — the brief is a
   *  content sketch, not just metadata. */
  keyPoints: string[];
  /** Narrative-role vocabulary (from the closed set the planner uses):
   *  hook | setup | evidence | cause | consequence | response | close */
  narrativeRole?: string;
}

export interface DeckBrief {
  /** One sentence — what the deck must leave the audience with. */
  deckGoal: string;
  /** Ordered narrative-role sequence. Each entry maps to a slideIntention. */
  narrativeArc: string[];
  /** Per-slide content intentions in order. length === narrativeArc.length. */
  slideIntentions: SlideIntention[];
}

const SlideIntentionSchema = z.object({
  title: z.string(),
  intendedContentType: z.string(),
  keyPoints: z.array(z.string()).default([]),
  narrativeRole: z.string().optional(),
});
const DeckBriefSchema = z.object({
  deckGoal: z.string().min(1),
  narrativeArc: z.array(z.string()).min(1),
  slideIntentions: z.array(SlideIntentionSchema).min(1),
});

export interface WriteDeckBriefInput {
  prompt: string;
  sourceText?: string;
  standalone?: boolean;
  /** Effective slide count if the user asked for one (from cardCountHint or
   *  a regex-parsed "N slides" in the prompt). Absent → agent picks its
   *  own count. */
  effectiveCount?: number;
  audience?: string;
  tone?: string;
  density?: string;
}

const SYSTEM = `You are a presentation art director writing a CONTENT BRIEF before layouts are picked. Your job is to think through what each slide should SAY, and describe its content SHAPE — you do NOT pick a layout id (a downstream agent does that).

Think in two passes:

PASS 1 — HOLISTIC:
- deckGoal: ONE sentence stating what the audience should leave with. Specific to the topic. Not boilerplate.
- narrativeArc: an ordered sequence of narrative roles from this closed vocabulary — hook, setup, evidence, cause, consequence, response, close.

PASS 2 — PER SLIDE:
For each position in narrativeArc, write a slideIntention with:
- title: short TOC-grade heading for the slide (≤ 40 chars).
- intendedContentType: a CONCRETE shape description — what the content LOOKS LIKE as structure. Include the item count where relevant. Never name a layout id. Examples:
    · "cover — title + subtitle + author + date over a hero image"
    · "4-item feature grid, each item = icon + short label + one-line body"
    · "3 metric tiles (big number + short label) with short context under each"
    · "hero image + title + 1 body paragraph, single-topic impact story"
    · "comparison table, 2 columns × 4 rows"
    · "single hero chart with a caption"
    · "closing — big statement + subtitle + contact"
- keyPoints: concrete points the writer will author on this slide, one bullet each. INCLUDE numeric values, names, and specific facts if the topic or source supports them. The brief is a content sketch, not just metadata — the writer will lift these directly.
- narrativeRole: which arc role this slide plays.

RULES:
- Do NOT name layout ids (imp-#N, native-slide-N, or 05-content). Only describe SHAPES.
- Do NOT invent facts. If the topic supplies numbers, use them; if not, leave keyPoints qualitative ("three product principles: simplicity, speed, trust" is fine even without numbers).
- length(slideIntentions) === length(narrativeArc).
- The order of slideIntentions === the order of narrativeArc.`;

/** Ask the brief agent to sketch the deck's content BEFORE the planner picks
 *  captured layouts. Fail-open: returns null on any error so the planner
 *  falls back to its monolithic 5-phase reasoning. */
export async function writeDeckBrief(input: WriteDeckBriefInput): Promise<DeckBrief | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const openai = new OpenAI({ apiKey });
    const src = (input.sourceText ?? '').trim();
    const sourceBlock = src
      ? (input.standalone
          ? `\nBRIEF (the user's own topic — develop the deck around it):\n"""\n${src.slice(0, 8000)}\n"""\n`
          : `\nSOURCE MATERIAL (ground the deck in THIS):\n"""\n${src.slice(0, 8000)}\n"""\n`)
      : '';
    const framing: string[] = [];
    if ((input.audience ?? '').trim()) framing.push(`audience: ${input.audience!.trim()}`);
    if ((input.tone ?? '').trim()) framing.push(`tone: ${input.tone!.trim()}`);
    const framingLine = framing.length ? `\nFRAMING: ${framing.join('; ')}\n` : '';
    const countLine = input.effectiveCount
      ? `SLIDE COUNT: produce EXACTLY ${input.effectiveCount} slides.`
      : input.density === 'extensive'
        ? 'SLIDE COUNT: as many as the material warrants (typical 10-15).'
        : input.density === 'concise'
          ? 'SLIDE COUNT: smallest count that tells the story (typical 4-6).'
          : 'SLIDE COUNT: as many or as few as the material warrants (typical 5-10).';

    const user = `TOPIC: "${input.prompt}"\n${sourceBlock}${framingLine}\n${countLine}\n\nProduce the deck brief. Return via the report_deck_brief tool.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'report_deck_brief',
          description: 'Return the pre-planner content brief.',
          parameters: {
            type: 'object',
            properties: {
              deckGoal: { type: 'string', description: 'One sentence stating what the audience must leave with. Specific to the topic.' },
              narrativeArc: {
                type: 'array',
                items: { type: 'string', enum: ['hook', 'setup', 'evidence', 'cause', 'consequence', 'response', 'close'] },
                description: 'Ordered narrative roles for the deck.',
              },
              slideIntentions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Short TOC-grade heading, ≤ 40 chars.' },
                    intendedContentType: { type: 'string', description: 'Concrete shape description of the slide content. NEVER name a layout id.' },
                    keyPoints: { type: 'array', items: { type: 'string' }, description: 'Concrete points the writer will author on this slide.' },
                    narrativeRole: { type: 'string', enum: ['hook', 'setup', 'evidence', 'cause', 'consequence', 'response', 'close'] },
                  },
                  required: ['title', 'intendedContentType', 'keyPoints'],
                },
              },
            },
            required: ['deckGoal', 'narrativeArc', 'slideIntentions'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'report_deck_brief' } },
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return null;
    const parsed = DeckBriefSchema.safeParse(JSON.parse(call.function.arguments));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Format the brief as a compact text block that plugs directly into the
 *  downstream planner's prompt. The planner reads this instead of guessing
 *  content shapes from the raw user prompt. */
export function formatDeckBriefForPlanner(brief: DeckBrief): string {
  const lines: string[] = [];
  lines.push(`DECK GOAL (pre-analyzed): ${brief.deckGoal}`);
  lines.push(`NARRATIVE ARC (pre-analyzed): [${brief.narrativeArc.join(' → ')}]`);
  lines.push('SLIDE INTENTIONS (pre-analyzed — pick layouts to FIT these content shapes):');
  brief.slideIntentions.forEach((s, i) => {
    const roleTag = s.narrativeRole ? ` (${s.narrativeRole})` : '';
    lines.push(`  ${i + 1}. "${s.title}"${roleTag}`);
    lines.push(`     shape: ${s.intendedContentType}`);
    if (s.keyPoints.length) {
      lines.push('     key points:');
      for (const k of s.keyPoints.slice(0, 10)) lines.push(`       - ${k}`);
    }
  });
  return lines.join('\n');
}
