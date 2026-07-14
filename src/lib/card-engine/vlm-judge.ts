/**
 * VLM slide judge — scores a RENDERED slide image against the AI Output
 * Standard.
 *
 * This is the real brain behind the visual quality gate. It takes a PNG of a
 * rendered slide (captured client-side via captureSlideToPng) + the slide's
 * declared type, shows it to the vision model with the matching rubric, and
 * returns a structured verdict (per-criterion PASS/FAIL + overall 1–5).
 *
 * Vision provider: OpenAI GPT-4o (via OPENAI_API_KEY). This matches the PRD's
 * production path (Azure GPT-4o; Claude isn't on Azure) and the deployment's
 * existing OpenAI key (already used for image-gen). The shared AI-provider
 * abstraction is Anthropic-only today and has no OpenAI adapter, so the Design
 * critic calls the OpenAI SDK directly here until an OpenAI provider lands.
 *
 * Supersedes the `runVlmCritique(card)` stub: the gate now judges a captured
 * image, not a server-rebuilt card, so the input is image bytes + type.
 */
import { z } from 'zod';
import OpenAI from 'openai';
import { visualRubric, VISUAL_PASS_THRESHOLD } from './slide-standard';
import { recordUsage } from './usage-meter';

export type SlideType =
  | 'cover' | 'agenda' | 'stat' | 'comparison' | 'process' | 'quote'
  | 'content' | 'divider' | 'closing';

// `pass` is coerced — the vision model occasionally returns "true"/"false",
// "pass"/"fail", or "partial" instead of a real boolean, which used to reject the
// WHOLE verdict (the slide went unjudged). Map it tolerantly; anything ambiguous
// → false (conservative: surface the issue rather than silently pass it).
const passField = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(true|yes|pass|ok|good)$/i.test(v.trim());
  return false;
}, z.boolean());

/** Suggested change-type a FAILED criterion can attach to its `element`. The
 *  fixer/editorial layer routes on these (shrink/shorten/remove/rebalance are the
 *  subtractive gate's; fill/swap-layout are flagged here but executed by the
 * editorial improver —). */
export const CHANGE_TYPES = ['shrink', 'shorten', 'remove', 'rebalance', 'fill', 'swap-layout', 'reject-image', 'recolor', 'restyle', 'align', 'restructure-focal', 'move'] as const;

const VerdictSchema = z.object({
  criteria: z.array(z.object({
    id: z.string(),
    pass: passField,
    reason: z.string().optional().default(''),
    // Element-addressed verdict (optional, backward-compatible): which role the
    // criterion is about + the suggested change. LENIENT — an off-enum/garbage
    // value must NOT reject the whole verdict (that would un-judge the slide); it
    // falls back to undefined. The role is then validated against the slide's
    // manifest by the caller; an unrecognized value is dropped there too.
    element: z.string().optional().catch(undefined),
    change: z.enum(CHANGE_TYPES).optional().catch(undefined),
  })),
  // overall is sometimes returned as a string ("4") or out of range — coerce + clamp.
  overall: z.preprocess(
    (v) => {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3;
    },
    z.number().int().min(1).max(5),
  ),
  verdict: z.string().optional().default(''),
});
export type SlideVerdict = z.infer<typeof VerdictSchema> & { fails: string[]; passed: boolean };

const TOOL_NAME = 'slide_verdict';
const tool = {
  name: TOOL_NAME,
  description: 'Return the structured quality verdict for the rendered slide.',
  input_schema: {
    type: 'object' as const,
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'criterion id, e.g. C1 or L3' },
            pass: { type: 'boolean' },
            reason: { type: 'string', description: 'one concrete, slide-specific reason' },
          },
          required: ['id', 'pass', 'reason'],
        },
      },
      overall: { type: 'integer', minimum: 1, maximum: 5 },
      verdict: { type: 'string', description: 'one-line overall verdict' },
    },
    required: ['criteria', 'overall', 'verdict'],
  },
};

/**
 * Judge a rendered slide image against the standard.
 * @param imageBase64  base64 PNG (no data: prefix)
 * @param slideType    declared slide type — selects the rubric
 * @param opts.passThreshold  overall < this OR any HARD criterion fail ⇒ not passed (default 3)
 */
export async function judgeSlideImage(
  imageBase64: string,
  slideType: SlideType,
  opts: { passThreshold?: number; manifest?: string; roles?: string[] } = {},
): Promise<{ verdict: SlideVerdict } | { error: string }> {
  const isCover = slideType === 'cover';
  // Rubric + HARD-criteria ids come from the ONE calibrated source
  // (slide-standard/visual-rubric) — not an inline fork — so the Design critic,
  // the Content judge, and the Designer can't drift (PRD §2.3 standard binding).
  //
  // 2026-07-10: use the RESIDUAL variant — the fixed-template trim. Beyond the
  // clean-composition drop (deterministic gate owns overlap/empty/clip), this
  // also drops type-size (C3), colour (C4), structural (L4), and type-appropriate
  // (L1) because the THEME + TEMPLATE + role-sizing already guarantee them, so
  // the VLM was only re-judging them redundantly (and flakily). What remains is
  // the genuine residual: composition/focal gestalt (C1/C2/L2), contrast over an
  // image (C5/L5 — undecidable in code), and premium feel (C7/L6). Revert to
  // `{ dropCleanComposition: true }` if the eval shows construction misses one.
  const { criteria, hardIds } = visualRubric(isCover, { residual: true });
  const threshold = opts.passThreshold ?? VISUAL_PASS_THRESHOLD;
  const roles = opts.roles ?? [];

  const system =
    'You are a fair, experienced presentation-design judge. Judge ONLY what you can see in the image. ' +
    'Hold a professional bar, but calibrate to the slide\'s PURPOSE: an informational/business slide should look RESTRAINED — clean, legible, aligned, consistent, well-spaced. Restraint is NOT a defect and a coherent template is NOT "generic"; do not require decorative flourish. ' +
    'PASS a slide that is clean, legible, and competently composed. FAIL only genuine problems: illegible text, elements that overlap / collide / are clipped or run off the edge, a flat focus-less dump with no hierarchy, an off-topic or broken image, or careless composition (misalignment, erratic spacing, clashing styles). When in doubt on taste alone, PASS.';
  // The ELEMENTS manifest (when provided) lets the judge return ELEMENT-ADDRESSED
  // verdicts: name the role each failing criterion is about + the change that fixes
  // it, so the fixer can act on a specific block instead of re-writing the slide.
  const manifestBlock = opts.manifest ? `\n\n${opts.manifest}\n` : '';
  const elementInstruction = roles.length
    ? ' For each criterion you FAIL that is about ONE specific element, set `element` to that element\'s role (from the ELEMENTS list) and `change` to the single fix from this list: shrink, shorten, remove, rebalance, move, fill, swap-layout, reject-image, recolor, restyle, align, restructure-focal. Use `reject-image` when the failing element is an IMAGE that is off-topic, low-quality, or visually wrong for this slide. Use `recolor` when a TEXT element fails legibility (L5) or premium feel (L6) due to low contrast. Use `restyle` when a text element reads too generic and needs a font-weight bump for premium feel (L6). Use `align` when a text element\'s alignment feels off (L4). Use `restructure-focal` when L2 fails (multiple blocks competing for focus) AND you can name the ONE block that should visually dominate — the fixer will bump its font size up so it wins the focal spot. Use `move` (or `rebalance`) when a block feels out of place — include a direction word in `reason` ("shift the title to the left", "move up") so the fixer can nudge accordingly. Leave both empty for whole-slide criteria.'
    : '';
  const userText =
    `This is a "${slideType}" slide. Score it against these criteria, PASS/FAIL each with one concrete reason, then give an overall 1–5 and a one-line verdict.${elementInstruction}${manifestBlock}\n${criteria}\n\nReturn your answer via the ${TOOL_NAME} tool.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { error: 'OPENAI_API_KEY is not set — the Design critic uses OpenAI GPT-4o vision' };
  }

  try {
    // Build the verdict tool schema. When the slide's role manifest is present,
    // constrain `element` to the slide's ACTUAL roles (an enum) so the model can
    // only address real elements and the parse maps role→block deterministically.
    const criterionProperties: Record<string, unknown> = {
      id: { type: 'string', description: 'criterion id, e.g. C1 or L3' },
      pass: { type: 'boolean' },
      reason: { type: 'string', description: 'one concrete, slide-specific reason' },
      element: {
        type: 'string',
        description: 'role of the element this criterion is about, from the ELEMENTS list. Omit for whole-slide criteria.',
        ...(roles.length ? { enum: roles } : {}),
      },
      change: {
        type: 'string',
        enum: CHANGE_TYPES,
        description: 'for a FAILED element-specific criterion: the single fix. Omit on pass / whole-slide.',
      },
    };
    const parameters = {
      type: 'object',
      properties: {
        criteria: { type: 'array', items: { type: 'object', properties: criterionProperties, required: ['id', 'pass', 'reason'] } },
        overall: { type: 'integer', minimum: 1, maximum: 5 },
        verdict: { type: 'string', description: 'one-line overall verdict' },
      },
      required: ['criteria', 'overall', 'verdict'],
    };
    // Vision via image_url with a base64 data URL at detail:'high' — low's 512²
    // would miss the very defects it cares about (overlap, clipped/illegible text).
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' } },
          ],
        },
      ],
      tools: [{ type: 'function', function: { name: TOOL_NAME, description: tool.description, parameters } }],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
    });

    if (completion.usage) {
      // Feed the per-generation usage meter (the vision call is a separate OpenAI
      // path, so it's invisible to the provider's meter) → deck-cost-log.csv judge_$.
      recordUsage('vision', {
        input: completion.usage.prompt_tokens,
        cached: completion.usage.prompt_tokens_details?.cached_tokens ?? 0,
        output: completion.usage.completion_tokens,
      });
    }

    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return { error: 'Judge returned no tool call' };

    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      return { error: 'Judge returned unparseable tool arguments' };
    }

    const parsed = VerdictSchema.safeParse(args);
    if (!parsed.success) return { error: `Judge output failed validation: ${parsed.error.message}` };

    // Sanitize element-addressing: keep `element` only when it names a REAL role on
    // this slide (deterministic role→block mapping); drop a dangling change.
    const validRoles = new Set(roles);
    const criteria = parsed.data.criteria.map((c) => {
      const element = c.element && validRoles.has(c.element) ? c.element : undefined;
      return { ...c, element, change: element ? c.change : undefined };
    });
    const data = { ...parsed.data, criteria };

    const fails = data.criteria.filter((c) => !c.pass).map((c) => c.id);
    const hardFail = fails.some((id) => hardIds.includes(id));
    const passed = !hardFail && data.overall >= threshold;

    return { verdict: { ...data, fails, passed } };
  } catch (err) {
    // Fail-open: the gate must never hard-block generation on a judge error.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
