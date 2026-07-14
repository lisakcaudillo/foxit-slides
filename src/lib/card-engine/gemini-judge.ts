/**
 * gemini-judge.ts — the INDEPENDENT eval judge.
 *
 * Grades a RENDERED slide image with Gemini (cross-vendor from the OpenAI
 * generator + OpenAI in-pipeline judge). This removes the circularity of a model
 * scoring work its own family just produced: the eval harness renders the
 * finished deck and sends it here for a fresh, clean-context verdict — the score
 * that counts toward the bar.
 *
 * Same render, same RUBRIC as the pipeline judge (visualRubric residual), so the
 * only difference is the grader. Deliberately NARROWER than vlm-judge: no element
 * addressing / change directives — the eval judge SCORES, it does not drive a
 * fixer loop. Fabrication / empties / leaks are owned by the deterministic layer
 * (vendor-neutral); the VLM's job here is taste / layout / hierarchy / contrast.
 *
 * Model: gemini-3.1-flash-lite by default (responsive, vision-capable, cheapest
 * tier — well-suited to a judge run per-slide), with an automatic fallback to
 * gemini-pro-latest when the flash pool is 503-overloaded (chain lives in
 * gemini.ts). Pinned at a LOW temperature + a fixed rubric so the score is stable
 * across runs (a wobbly judge would corrupt the reproducibility number the harness
 * measures). gemini-3.5-flash / -2.5-flash were 503/404 for this key — lite is the
 * reachable, stable pick. NOTE: a fallback verdict comes from a different model,
 * so availability is prioritised over perfect cross-run model identity. Override
 * with GEMINI_JUDGE_MODEL.
 */
import { z } from 'zod';
import { getProvider, visionUserMessage } from '@/lib/ai-provider';
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai-provider/gemini';
import type { Tool, ToolChoice } from '@/lib/ai-provider';
import { visualRubric, VISUAL_PASS_THRESHOLD } from './slide-standard';

/** Temperature for the judge — pinned LOW for a stable, calibratable verdict. */
export const EVAL_JUDGE_TEMPERATURE = 0.1;

// Tolerant coercions (the vision model occasionally returns "true"/"pass" or a
// stringified number) — an off-shape field must not reject the whole verdict.
const passField = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(true|yes|pass|ok|good)$/i.test(v.trim());
  return false;
}, z.boolean());

const VerdictSchema = z.object({
  criteria: z.array(z.object({
    id: z.string(),
    pass: passField,
    reason: z.string().optional().default(''),
  })),
  overall: z.preprocess((v) => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3;
  }, z.number().int().min(1).max(5)),
  verdict: z.string().optional().default(''),
});
export type EvalVerdict = z.infer<typeof VerdictSchema> & { fails: string[]; passed: boolean };

const TOOL_NAME = 'slide_verdict';
const verdictTool: Tool = {
  name: TOOL_NAME,
  description: 'Return the structured quality verdict for the rendered slide.',
  input_schema: {
    type: 'object',
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
      overall: { type: 'integer', description: 'overall quality 1-5' },
      verdict: { type: 'string', description: 'one-line overall verdict' },
    },
    required: ['criteria', 'overall', 'verdict'],
  },
};

export interface EvalJudgeResult {
  verdict?: EvalVerdict;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Judge one rendered slide image with the independent Gemini reviewer.
 * @param imageBase64 base64 PNG (no data: prefix)
 * @param isCover     cover slide? (selects the rubric variant — the residual
 *                    visual rubric only branches cover vs interior)
 * @param slideLabel  human label for the prompt ("cover", "stat", "content"…)
 */
export async function geminiJudgeSlide(
  imageBase64: string,
  isCover: boolean,
  slideLabel: string,
  opts: { passThreshold?: number; model?: string } = {},
): Promise<EvalJudgeResult> {
  // SAME calibrated rubric the pipeline judge uses — only the grader differs.
  const { criteria, hardIds } = visualRubric(isCover, { residual: true });
  const threshold = opts.passThreshold ?? VISUAL_PASS_THRESHOLD;
  const model = opts.model || process.env.GEMINI_JUDGE_MODEL || DEFAULT_GEMINI_MODEL;

  const system =
    'You are an INDEPENDENT external presentation-design reviewer. You did NOT create this slide — judge the finished artifact cold, on its own merits, using ONLY what you can see in the image. ' +
    'Hold a professional bar, but calibrate to the slide\'s PURPOSE: an informational/business slide should look RESTRAINED — clean, legible, aligned, consistent, well-spaced. Restraint is NOT a defect and a coherent template is NOT "generic"; do not require decorative flourish. ' +
    'PASS a slide that is clean, legible, and competently composed. FAIL only genuine problems: illegible text, elements that overlap / collide / are clipped or run off the edge, a flat focus-less dump with no hierarchy, an off-topic or broken image, or careless composition (misalignment, erratic spacing, clashing styles). When in doubt on taste alone, PASS.';

  const userText =
    `This is a "${slideLabel}" slide. Score it against these criteria, PASS/FAIL each with one concrete reason, then give an overall 1–5 and a one-line verdict.\n${criteria}\n\nReturn your answer via the ${TOOL_NAME} tool.`;

  try {
    const provider = getProvider('gcp-gemini');
    const toolChoice: ToolChoice = { type: 'tool', name: TOOL_NAME };
    const response = await provider.createMessage({
      model,
      max_tokens: 1200,
      temperature: EVAL_JUDGE_TEMPERATURE,
      system,
      messages: [visionUserMessage([{ data: imageBase64, mimeType: 'image/png' }], userText)],
      tools: [verdictTool],
      tool_choice: toolChoice,
    });

    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return { error: 'Gemini judge returned no verdict tool call', usage: response.usage };
    }

    const parsed = VerdictSchema.safeParse(block.input);
    if (!parsed.success) {
      return { error: `Gemini judge output failed validation: ${parsed.error.message}`, usage: response.usage };
    }

    const fails = parsed.data.criteria.filter((c) => !c.pass).map((c) => c.id);
    const hardFail = fails.some((id) => hardIds.includes(id));
    const passed = !hardFail && parsed.data.overall >= threshold;

    return { verdict: { ...parsed.data, fails, passed }, usage: response.usage };
  } catch (err) {
    // Fail-loud for the eval judge (unlike the in-pipeline gate, a judge error
    // here must be VISIBLE — it means a measurement didn't happen, not that the
    // deck should ship). The route surfaces the error per slide.
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
