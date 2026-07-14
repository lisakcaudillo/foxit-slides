/**
 * Design Intelligence Layer — Expertise phase: Product Launch expert.
 *
 * The first hand-authored template expert (spec §8 step 2). It takes the generic
 * Product Launch scaffold and makes it EXPERT for the specific subject/industry:
 * adds the industry-critical slide, drops what doesn't belong, reframes purpose
 * + guidance, picks industry-appropriate layouts, and raises the plan-gap
 * questions it needs answered.
 *
 * One structured AI call via the provider abstraction (getProvider/getModel),
 * forced through a tool, Zod-validated. Throws on failure — the registry falls
 * back to the deterministic packing baseline.
 *
 * Industry is a REASONING INPUT (the prompt instructs the model to detect and
 * tailor); it does not maintain a template×industry matrix.
 */

import { getProvider, getModel } from '@/lib/ai-provider';
import type { Tool, ToolUseBlock } from '@/lib/ai-provider';
import { BLOCK_TEMPLATES } from '../types';
import { ExpertPlanSchema } from './types';
import type { ExpertContext, ExpertPlan, TemplateExpert } from './types';

const SYSTEM_PROMPT = [
  'You are a world-class presentation strategist who designs PRODUCT LAUNCH decks.',
  'You have launched products across many industries and you know that a great launch deck is not a fixed outline — it is tailored to the specific product and the industry it lives in.',
  '',
  '## Your job',
  'Given a launch subject, produce a TAILORED slide plan. You are handed a generic Product Launch scaffold as a starting point. Do NOT just return it. Make it expert:',
  '- ADD the slide(s) that this industry demands and the generic scaffold lacks (e.g. a fintech/payments launch needs Security & Compliance; a consumer product needs Proven Results / social proof; a developer tool needs Developer Experience).',
  '- DROP slides that do not belong for this subject (e.g. "Technical Implementation" makes no sense for a skincare serum).',
  '- REFRAME every kept slide: rewrite its title, purpose, and guidance in the language and priorities of THIS product and audience.',
  '- RE-PRIORITIZE: mark each category must / should / nice. Musts are the slides without which the launch fails to land. Never exceed what the count can hold with low-value slides — lead with the essentials.',
  '',
  '## Detect the industry yourself',
  'Read the subject and infer the industry/domain (fintech, developer tooling, healthcare, consumer/CPG, enterprise SaaS, hardware, etc.). Set detectedIndustry + a confidence. Let it drive category emphasis, the KIND of proof that is credible in that industry, the terminology, and the layout choices. If industry guidance notes are provided, weave them in.',
  '',
  '## Three outputs per category',
  '1. STRUCTURE — title + priority + origin (template = kept, reframed = kept-but-retoned, added = new for this industry).',
  '2. SUBSTANCE — `guidance`: what this slide must accomplish for THIS product/industry; `proof`: the KIND of evidence that matters here.',
  '3. LAYOUT — `layoutHint`: the blockTemplate that best suits this slide. Choose from: ' + BLOCK_TEMPLATES.join(', ') + '. Set `requires` (numbers | comparison | sequence) when the slide needs that kind of content.',
  '',
  '## Grounding — non-negotiable (FR11)',
  'You decide STRUCTURE and what KIND of proof to include. You NEVER invent the user\'s figures, metrics, names, or claims. If a slide needs real data the subject did not provide (a latency number, a clinical result, a price), do NOT fabricate it — instead raise it as an `unknowns` question. Tag numeric/data questions with suggestionKind "format-hint" (so the UI offers a format example, never a fake value); tag judgement/story questions "starter".',
  '',
  '## Clarify (unknowns)',
  'Raise only the few questions that would materially change the deck — the detail only the user knows (which compliance certs, the hero ingredient + its proven benefit, usage-based vs tiered pricing, the real metric). Each gets a leverage score 0-1 and the category ids it affects. If the subject is already rich, return an empty unknowns array — under-asking beats over-asking.',
  '',
  'Return your plan ONLY via the build_expert_plan tool.',
].join('\n');

const EXPERT_PLAN_TOOL: Tool = {
  name: 'build_expert_plan',
  description:
    'Return the tailored, industry-aware Product Launch slide plan: structure (categories), substance (guidance/proof), layout hints, and any plan-gap questions.',
  input_schema: {
    type: 'object',
    properties: {
      templateId: { type: 'string', description: 'Always "product-launch".' },
      detectedIndustry: { type: 'string', description: 'The industry/domain you inferred from the subject.' },
      industryConfidence: { type: 'number', description: '0-1 confidence in the detected industry.' },
      categories: {
        type: 'array',
        description: 'The tailored, priority-ordered slide categories. Lead with musts.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable kebab-case id, e.g. "security-compliance".' },
            title: { type: 'string', description: 'Slide-type label tailored to the subject.' },
            priority: { type: 'string', enum: ['must', 'should', 'nice'] },
            purpose: { type: 'string', description: 'What this slide is, in one line, tailored to the subject.' },
            guidance: { type: 'string', description: 'What this slide must accomplish for THIS product/industry.' },
            proof: { type: 'string', description: 'The KIND of evidence that matters here. Never an invented figure.' },
            layoutHint: { type: 'string', description: 'Best-fit layout (blockTemplate): ' + BLOCK_TEMPLATES.join(', ') + '.' },
            requires: { type: 'string', enum: ['numbers', 'comparison', 'sequence'], description: 'Content the layout needs, if any.' },
            canMergeWith: { type: 'array', items: { type: 'string' }, description: 'Category ids this can fuse with under count pressure.' },
            canSplit: { type: 'boolean', description: 'Whether this can expand into multiple slides when the count allows.' },
            origin: { type: 'string', enum: ['template', 'added', 'reframed'], description: 'template=kept as-is, reframed=kept but retoned, added=new for this industry.' },
          },
          required: ['id', 'title', 'priority', 'purpose', 'guidance', 'origin'],
        },
      },
      unknowns: {
        type: 'array',
        description: 'Plan-gap questions — only what materially changes the deck. Empty is fine.',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            type: { type: 'string', enum: ['text', 'select'] },
            options: { type: 'array', items: { type: 'string' }, description: 'Concrete choices for select questions. No "Other/None" catch-alls — the UI appends its own.' },
            suggestions: { type: 'array', items: { type: 'string' }, description: '2-4 starter answers shown as chips under the field. For format-hint questions these are FORMAT examples (e.g. "Target: $2M · Actual: $2.4M"), never fabricated real values.' },
            leverage: { type: 'number', description: '0-1; how much the plan depends on the answer.' },
            affects: { type: 'array', items: { type: 'string' }, description: 'Category ids that depend on this answer.' },
            suggestionKind: { type: 'string', enum: ['starter', 'format-hint'], description: 'format-hint for numeric/data questions (no fabricated values); starter otherwise.' },
          },
          required: ['question', 'type', 'leverage'],
        },
      },
      rationale: { type: 'string', description: 'One or two lines on why this structure fits the subject.' },
    },
    required: ['templateId', 'categories'],
  },
};

function buildUserMessage(ctx: ExpertContext): string {
  const baselineTitles = ctx.baseline.pack.steps.map((s) => `- ${s.title} (${s.tier})`).join('\n');
  const parts = [
    `Launch subject:\n"""${ctx.subject.trim()}"""`,
    `Target slide count: ${ctx.count}`,
    ctx.audience ? `Audience: ${ctx.audience}` : '',
    ctx.goal ? `Goal: ${ctx.goal}` : '',
    ctx.tone ? `Tone: ${ctx.tone}` : '',
    '',
    'Generic Product Launch scaffold to adapt (do not just return it):',
    baselineTitles,
    ctx.industryNotes ? `\nIndustry guidance for the detected industry:\n${ctx.industryNotes}` : '',
    '',
    `Produce the tailored plan, fit to about ${ctx.count} slides, leading with the musts. Call build_expert_plan exactly once.`,
  ];
  return parts.filter(Boolean).join('\n');
}

async function plan(ctx: ExpertContext): Promise<ExpertPlan> {
  const response = await getProvider().createMessage({
    model: getModel(),
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXPERT_PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'build_expert_plan' },
    messages: [{ role: 'user', content: buildUserMessage(ctx) }],
  });

  const toolBlock = response.content.find(
    (b): b is ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolBlock) {
    throw new Error('Product Launch expert did not return a tool_use response');
  }

  // Force the templateId regardless of what the model echoed.
  const parsed = ExpertPlanSchema.parse(toolBlock.input);
  return { ...parsed, templateId: 'product-launch' };
}

export const productLaunchExpert: TemplateExpert = {
  templateId: 'product-launch',
  plan,
};
