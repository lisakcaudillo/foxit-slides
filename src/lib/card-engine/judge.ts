/**
 * Design Intelligence Layer — Enforcement: the LLM JUDGE tier.
 *
 * `enforce.ts` is the cheap DETERMINISTIC floor — it measures what a regex can
 * see (paragraph density, bracket placeholders, evaluative-adjective headings).
 * This module is the SUBJECTIVE tier asked for (2026-06-03: "deepen the
 * gate"): a fast LLM editor that scores ONE generated card against the deck
 * "gold standard" rubric and catches what regex can't — "is this punchy? one
 * idea? concrete, not corporate filler? does it earn its slot?".
 *
 * Placement: it runs INSIDE `generateCard`'s generate→check→regenerate loop,
 * AFTER the deterministic checks pass (no point judging prose that's already
 * structurally broken — fix that first, cheaply). When the judge says "revise"
 * it returns actionable, ready-to-inject feedback lines (same `{ pass, issues }`
 * shape as enforce.ts) so the loop appends them to the next attempt verbatim.
 *
 * Bounded + fail-OPEN: the loop caps judge-driven regenerations (so it costs at
 * most a small, fixed number of extra calls), never runs the judge on the final
 * attempt, and ANY failure here — AI error, timeout, malformed tool call —
 * returns a PASS. Generation is never blocked or stalled by the judge.
 *
 * Distinct from the VLM pass in `critique.ts` (that "Tier B" judges a RENDERED
 * slide IMAGE, is opt-in, and is stubbed). This judge reads the card's TEXT and
 * is part of the always-on content gate.
 *
 * No `any`; the AI boundary is Zod-validated; all calls go through the provider
 * abstraction (getProvider/getModel).
 */

import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';
import type { Tool, ToolUseBlock } from '@/lib/ai-provider';
import type { GeneratedCard } from './types';
// The GOLD STANDARD rubric now lives in the single source of truth
// (slide-standard/rules.ts) so the judge's grading criteria and the writer's
// instructions can't drift. Re-exported for back-compat with any importer that
// reached RUBRIC via './judge'.
import { RUBRIC, RUBRIC_DIMENSIONS, type RubricDimension, designStandardBlock } from './slide-standard';
export { RUBRIC, type RubricDimension };

/** Result shape mirrors enforce.ts `QualityResult` so the loop treats both the
 *  deterministic and judge tiers uniformly. `issues` empty ⇔ passed. */
export interface JudgeVerdict {
  pass: boolean;
  /** Actionable, ready-to-inject feedback lines (one per failed dimension). */
  issues: string[];
}

/** Context for judging a single card. */
export interface JudgeCardInput {
  title: string;
  blocks: GeneratedCard['blocks'];
  blockTemplate?: string;
  /** Slide layout (single / split-left / split-right / three-col) — lets the
   *  judge reason about whether the content fits the space (FORMAT review). */
  layout?: string;
  /** The card's content budget (word/item caps) — lets the judge reason about
   *  density/overflow relative to the intended limits. */
  contentBudget?: Record<string, unknown> | null;
  /** The user's deck topic — lets the judge tell concrete-from-prompt apart
   *  from invented filler. */
  topic?: string;
  /** The ONE takeaway this slide was planned to land. When present, `one-idea`
   *  and `earns-its-place` are graded against DELIVERY of this specific point:
   *  the heading should state it, the body support it, with no second topic. */
  takeaway?: string;
  audience?: string;
  tone?: string;
  /** Requested density tier (concise/detailed/extensive) — lets the judge relax
   *  the glanceable/fits bar for intentionally denser decks instead of
   *  collapsing every card back to terse. */
  density?: string;
}

/** Global kill-switch (ops escape hatch, no code change). Default ON. */
const JUDGE_DISABLED = process.env.DIL_JUDGE_DISABLED === '1';
/** Don't let a slow judge eat the per-card budget — fail open fast. */
const JUDGE_TIMEOUT_MS = 20_000;

/** Whether the judge tier should run at all (respects the env kill-switch). */
export function isJudgeEnabled(): boolean {
  return !JUDGE_DISABLED;
}

const FailureSchema = z.object({
  dimension: z.enum(RUBRIC_DIMENSIONS),
  fix: z.string(),
});

const JudgementSchema = z.object({
  verdict: z.enum(['pass', 'revise']),
  failures: z.array(FailureSchema).optional(),
});

const JUDGE_TOOL: Tool = {
  name: 'report_judgement',
  description:
    'Report whether the slide clears the quality bar, and for each rubric dimension it fails, a concrete one-line fix the writer can act on.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['pass', 'revise'],
        description: 'pass = clears every rubric dimension. revise = fails one or more.',
      },
      failures: {
        type: 'array',
        description:
          'One entry per FAILED dimension only. Empty/omitted when verdict is pass. Do NOT list dimensions that passed.',
        items: {
          type: 'object',
          properties: {
            dimension: {
              type: 'string',
              enum: [...RUBRIC_DIMENSIONS],
            },
            fix: {
              type: 'string',
              description:
                'A concrete, specific instruction to fix THIS slide — name what to cut/change, not generic advice. e.g. "Cut the second sentence; the heading already says it." Not "make it punchier".',
            },
          },
          required: ['dimension', 'fix'],
        },
      },
    },
    required: ['verdict'],
  },
};

const SYSTEM_PROMPT = [
  'You are a ruthless presentation editor enforcing a hard quality bar for ONE slide — reviewing BOTH its writing AND whether it will render as a clean, well-composed slide.',
  'A slide is GLANCED at in seconds on a screen — it is not a document. Catch slides that make the reader WORK (walls of text, two ideas fighting for one slide, generic filler, bodies that restate the heading, drifting voice) AND slides that will look BAD (a cover whose subtitle is so long it wraps or clips, a near-empty slide with one stranded line, content forced into a layout it does not fill, lopsided grid cells).',
  '',
  'Judge the slide against these dimensions. A slide passes ONLY if it clears every one:',
  ...Object.entries(RUBRIC).map(([k, v]) => `- ${k}: ${v}`),
  '',
  designStandardBlock('judge'),
  '',
  'GROUNDING (non-negotiable — this OVERRIDES `concrete`): NEVER invent data and NEVER coach the writer to. Your FIX text must not contain a number, percentage, dollar amount, or statistic the topic did not provide — do NOT suggest headings or bodies like "Remote teams ship 40% faster" or "eliminates 67% of meetings" unless those exact figures appear in the topic. That is the single worst thing you can do: it manufactures hallucinated content. To satisfy `concrete` without real data, suggest a fill-in PROMPT ("Your team\'s velocity gain here") or a qualitative claim ("Remote teams ship faster") — never a fabricated figure. An invented statistic FAILS `grounded`; it does not pass `concrete`.',
  '',
  'Be strict but FAIR: a genuinely sharp, well-composed slide should PASS — do not invent problems or nitpick word choice. Cover/title, chapter-divider and quote slides are correctly minimal (a title + one short line); do not fault them on `balance` for being short — but DO hold them to `fits` (keep the title/subtitle short enough to render on one line).',
  'CALIBRATION — avoid over-revising: a slide that is accurate, within its word budget, and clearly structured PASSES even if it is information-dense. Do NOT stack `fits` / `glanceable` / `earns-its-place` revisions on a thorough, correct (e.g. technical) slide merely for carrying real substance — reserve those for slides that genuinely overflow, restate the heading, or read as filler. For `layout-match`, fail ONLY when the content truly cannot fill the layout (a 3-cell grid with one real item), NOT when cells are merely uneven. On a borderline-but-accurate slide, PASS: an extra revision costs tokens and risks degrading good content. (Grounding is the exception — a fabricated figure always fails, never let that slide.)',
  'For every dimension the slide FAILS, give one concrete, slide-specific fix the writer can act on immediately — name the exact offending text/element and what to do with it. Never give generic advice like "make it more concise".',
  '',
  'Report your decision ONLY via the report_judgement tool.',
].join('\n');

/** Render a card's blocks as a clean, readable text view for the judge —
 *  labelled by role so the model can reason about heading vs body vs bullets
 *  vs cells without parsing raw JSON. */
export function serializeCardForJudge(title: string, blocks: GeneratedCard['blocks']): string {
  const lines: string[] = [`SLIDE TITLE: "${title}"`, ''];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        lines.push(`HEADING (h${block.level}): ${block.content}`);
        break;
      case 'paragraph':
        lines.push(`BODY: ${block.content}`);
        break;
      case 'bullet-list':
        lines.push('BULLETS:');
        for (const item of block.items) lines.push(`  • ${item}`);
        break;
      case 'smart-layout':
        lines.push(`${block.variant.toUpperCase()} CELLS:`);
        for (const cell of block.cells) {
          const h = cell.heading ? `${cell.heading}` : '';
          const b = cell.body ? ` — ${cell.body}` : '';
          lines.push(`  - ${h}${b}`);
        }
        break;
      case 'callout':
        lines.push(`CALLOUT: ${block.content}`);
        break;
      case 'toggle':
        lines.push(`TOGGLE "${block.heading}": ${block.content}`);
        break;
      case 'label-group':
        lines.push(`TAGS: ${block.labels.map((l) => l.text).join(', ')}`);
        break;
      case 'button':
        lines.push(`BUTTON: ${block.text}`);
        break;
      default:
        // divider and any future block types carry no judgeable text.
        break;
    }
  }
  return lines.join('\n');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('judge timed out')), ms)),
  ]);
}

/**
 * Judge ONE generated card against the rubric. Returns `{ pass, issues }`:
 * issues are ready-to-inject revision lines (empty when the card passes).
 *
 * FAIL-OPEN by contract: every failure path (disabled, AI error, timeout, no
 * tool call, malformed input) returns `{ pass: true, issues: [] }` so the
 * generation loop is never blocked or stalled by the judge.
 */
// AC8 handover (additive instrumentation, 2026-06-11). Exposes that the judge grades the
// IMAGINED `blockTemplate`, not the rendered composition. Unhappy on revise; reason names
// the layout-match case (the "critiquing a layout that never renders" finding).
function judgeHandover(input: JudgeCardInput, verdict: 'pass' | 'revise', issues: string[]): void {
  if (process.env.NODE_ENV === 'production') return;
  const received = `blockTemplate=${input.blockTemplate ?? '(none)'} (imagined layout), card.layout=${input.layout ?? '(none)'}; NOT the rendered composition`;
  const base = `judge | received: ${received} | decided: ${verdict} | passed-on: ${issues.length} fix(es)`;
  if (verdict === 'revise') {
    const layoutFail = issues.some((i) => i.startsWith('[layout-match]'));
    console.warn(`[handover!] ${base} | reason: ${layoutFail ? 'graded the imagined blockTemplate ([layout-match])' : 'revise'}`);
  } else {
    console.log(`[handover] ${base}`);
  }
}

export async function judgeCard(input: JudgeCardInput): Promise<JudgeVerdict> {
  if (JUDGE_DISABLED) return { pass: true, issues: [] };

  try {
    const slide = serializeCardForJudge(input.title, input.blocks);
    const b = input.contentBudget ?? {};
    const caps = [
      typeof b.bodyMaxWords === 'number' ? `body ≤ ${b.bodyMaxWords} words` : '',
      typeof b.itemMaxWords === 'number' ? `each item ≤ ${b.itemMaxWords} words` : '',
      typeof b.maxItems === 'number' ? `≤ ${b.maxItems} items/cells` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const ctx = [
      input.topic ? `DECK TOPIC: ${input.topic.slice(0, 600)}` : '',
      input.takeaway
        ? `SLIDE TAKEAWAY (the ONE point this slide was planned to land): "${input.takeaway}". Grade one-idea and earns-its-place against DELIVERY of THIS point — the slide states it (as a lead/statement line) and the body supports it, with no SECOND, unrelated takeaway. The heading may be a short TOPIC LABEL (e.g. "Getting Started") — that is fine, do not fault it for not being the point. A multi-card/section slide whose parts all support this one point is CORRECT (one idea, several supporting facets); fail one-idea only when a genuinely different topic is competing.`
        : '',
      input.audience ? `AUDIENCE: ${input.audience}` : '',
      input.tone ? `TONE: ${input.tone}` : '',
      input.blockTemplate ? `LAYOUT TEMPLATE: ${input.blockTemplate}` : '',
      input.layout ? `SLIDE COMPOSITION: ${input.layout}` : '',
      caps ? `DENSITY BUDGET (what the layout holds): ${caps}` : '',
      input.density === 'extensive'
        ? 'DENSITY TIER: extensive — full explanatory sentences up to the budget are EXPECTED. Do NOT flag "glanceable"/"fits" for prose-length body that stays within the caps above; only flag genuine overflow past them.'
        : input.density === 'detailed'
          ? 'DENSITY TIER: detailed — supporting sentences up to the budget are appropriate. Do NOT flag "glanceable"/"fits" for fuller body that stays within the caps; only flag genuine overflow.'
          : input.density === 'concise'
            ? 'DENSITY TIER: concise — keep it punchy; terse fragments preferred.'
            : '',
    ]
      .filter(Boolean)
      .join('\n');

    const userMessage = [
      ctx,
      ctx ? '' : '',
      'Judge this slide:',
      '"""',
      slide,
      '"""',
      '',
      'Call report_judgement exactly once.',
    ]
      .filter((l) => l !== undefined)
      .join('\n');

    const response = await withTimeout(
      getProvider().createMessage({
        model: getModel(),
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [JUDGE_TOOL],
        tool_choice: { type: 'tool', name: 'report_judgement' },
        messages: [{ role: 'user', content: userMessage }],
      }),
      JUDGE_TIMEOUT_MS,
    );

    const toolBlock = response.content.find(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolBlock) return { pass: true, issues: [] };

    const parsed = JudgementSchema.parse(toolBlock.input);
    const failures = parsed.failures ?? [];
    if (parsed.verdict === 'pass' || failures.length === 0) {
      judgeHandover(input, 'pass', []);
      return { pass: true, issues: [] };
    }

    const issues = failures.map((f) => `[${f.dimension}] ${f.fix}`);
    judgeHandover(input, 'revise', issues);
    return { pass: false, issues };
  } catch {
    // Fail open — never block generation on the judge.
    return { pass: true, issues: [] };
  }
}
