/**
 * native-template.ts — loader + adapter for editor-authored structured
 * templates saved via the PPTX-import → editor → Save-to-Library pipeline.
 *
 * The authoring path serializes a deck to app/src/data/templates/<id>.json.
 * Unlike the legacy Figma manifest (`figma-template-structures.json`), the
 * captured shape is `{ id, canvas, slides:[{index, slots:[...]}] }` with
 * slot geometry in PERCENT of the canvas (already the renderer's native unit).
 *
 * This module is intentionally SEPARATE from `structureTemplates.ts` (the Figma
 * builder). The consumer contract is small: describe slots to the writer, then
 * build a Card from a fill. Everything downstream (text-fit, FR11, visual
 * critic) is box-based and skin-agnostic — it rides on top for free.
 */

// ── Captured template schema (what template-serialize.ts produces) ──────────

/** A single slot from a captured slide. Percent geometry on the deck canvas. */
export interface CapturedSlot {
  role: string;
  group?: string;
  /** Percent of canvas.w */
  x: number;
  /** Percent of canvas.h */
  y: number;
  /** Percent of canvas.w */
  w: number;
  /** Percent of canvas.h */
  h: number;
  size?: number;
  align?: 'left' | 'center' | 'right';
  weight?: number;
  /** Non-authoritative writing hint for the model (never rendered verbatim). */
  example?: string;
  // Image slot
  image?: boolean;
  // Decoration slot
  shape?: string;
  fillToken?: string;
  // Table slot
  table?: boolean;
  tableRows?: string[][];
  headerRow?: boolean;
  // Chart slot
  chart?: boolean;
  chartType?: string;
  chartCategories?: string[];
  chartSeries?: { name: string; values: number[] }[];
  numberFormat?: string;
}

export interface CapturedSlide {
  index: number;
  slots: CapturedSlot[];
}

export interface CapturedTemplate {
  id: string;
  name: string;
  source: string;
  canvas: { w: number; h: number };
  slides: CapturedSlide[];
}

// ── Registry (add new templates here as they're authored) ───────────────────

import templateStructure from '@/data/templates/template-structure.json';

// Registry key = the public template id (what the theme picker sends as
// skinHint + what the API accepts). Distinct from the JSON's `id` field
// (which is metadata from the save-flow slugify). Compass is the friendly
// name for the "template-structure" data file. The ID LIST is exported from
// captured-registry.ts to break the circular import with structure-fill.ts
// (which needs the id list at init time to widen SKIN_ENUM).
const REGISTRY: Record<string, CapturedTemplate> = {
  compass: templateStructure as unknown as CapturedTemplate,
};

// Re-export the id-shaped API from the standalone registry so existing
// call-sites of native-template continue to work.
export { isCapturedTemplateId, capturedTemplateIds } from './captured-registry';

/** Load a captured template by id. Throws for unknown ids so callers see a
 *  loud failure instead of a silent fall-through to the Figma path. */
export function loadCapturedTemplate(id: string): CapturedTemplate {
  const t = REGISTRY[id];
  if (!t) throw new Error(`Unknown captured template: ${id}`);
  return t;
}

// ── Writer specs (Step 2) ───────────────────────────────────────────────────

import { slotCharCap, type LayoutSlotSpec } from '@/data/structureTemplates';
import type {
  Card,
  FreeformBlock,
  FreeformTextBlock,
  FreeformShapeBlock,
  FreeformChartBlock,
  FreeformTableBlock,
  FreeformTextVariant,
  FreeformChartType,
  SlideMetadata,
} from '@/types/card-template';
import type { StructureFill } from '@/data/structureTemplates';
import type { SlotFillResult, DataSlotSpec, ChartFill, TableFill } from './structure-fill';
import { getProvider, getModel, type ToolUseBlock, type Tool } from '@/lib/ai-provider';
import { z } from 'zod';

// ── Agentic planning (Step 2, ──────────────────────────────
//
// The template FIXES the shape (20 designed slides). Planning is agentic
// SELECTION: given the prompt/source, an LLM picks WHICH captured slides to
// use, in what ORDER, with a per-slide FOCUS grounded in the topic. The agent
// cannot invent new slide shapes — it selects from the template. This is the
// only agentic step; everything downstream (writer + image/chart/table
// sourcers) is deterministic matching.

/** One planned slide: which captured slide to use here + an editorial brief
 * (Phase B, that the writer uses to place content editorially. */
export interface SlidePlan {
  /** Index into template.slides (0..N-1). */
  capturedIndex: number;
  /** One-line focus for the writer — what THIS slide's content is about,
   *  grounded in the prompt/source. */
  focus: string;
  /** The ONE most important point on this slide. Writer places it in the
   *  anchor slot (usually the title, or the hero metric if the layout has
   *  one). If empty, no editorial hero was identified. */
  hero?: string;
  /** Anomalies/deltas/reversals that must be explicitly named in prose (with
   *  numbers, not just raw values). E.g., "dropped from 90% to 25%",
   *  "4.5× compound Y1 → Y3", "134% NRR vs 100% baseline". Empty when the
   *  section has no anomaly worth flagging. */
  callouts?: string[];
  /** The voice/framing angle for the slide's prose. */
  angle?: 'win' | 'warning' | 'comparison' | 'decision' | 'neutral';
  /** Phase C — cross-reference reasoning. Inferential links spanning multiple
   *  parts of the source. Each entry is a natural-language HYPOTHESIS with
   *  HEDGE LANGUAGE built in ("may reflect", "coincides with", "possibly
   *  driven by") — NOT a stated fact. Only surfaced to the writer when
   *  rewriteIntensity permits (build or inspire); stripped in verbatim mode.
   *  Example: "Missed sell target may reflect price sensitivity from the 20%
   *  cost rise noted elsewhere in the source." */
  crossRefs?: string[];
  /** DECK-LEVEL narrative role — the slide's JOB in the deck's story arc.
   *  Assigned by the plan agent's Phase 0 (holistic view). Every slide must
   *  have a role — no floating data points that don't serve the deck goal.
   *  Vocabulary is closed; unknown values fall back to 'evidence'. */
  narrativeRole?: 'hook' | 'setup' | 'evidence' | 'cause' | 'consequence' | 'response' | 'close';
}

/** The plan agent's full output — deck goal + arc + ordered slide plan. */
export interface DeckPlan {
  /** A short, prompt-grounded deck title (used as CardTemplate.name). */
  deckTitle: string;
  /** DECK GOAL — one sentence stating what this deck must ACHIEVE for its
   *  audience. Named explicitly by Phase 0 (holistic view) so every slide
   *  choice can be justified against it. This is the "what do it wants to
   * present?" question asked. */
  deckGoal: string;
  /** DECK ARC — the ordered narrative-role sequence the plan agent designed
   *  BEFORE picking any slide. Each slide's narrativeRole must map to a
   *  position in this arc. Example: ["hook","evidence","cause","cause",
   *  "consequence","response","close"]. */
  deckArc: SlidePlan['narrativeRole'][];
  slides: SlidePlan[];
}

const NARRATIVE_ROLES = ['hook', 'setup', 'evidence', 'cause', 'consequence', 'response', 'close'] as const;

const PlanCapturedSchema = z.object({
  deckTitle: z.string().min(1),
  deckGoal: z.string().min(1),
  deckArc: z.array(z.enum(NARRATIVE_ROLES)).min(1),
  slides: z.array(z.object({
    capturedIndex: z.number().int().min(0),
    focus: z.string(),
    hero: z.string().optional().catch(undefined),
    callouts: z.array(z.string()).optional().catch([]),
    angle: z.enum(['win', 'warning', 'comparison', 'decision', 'neutral']).optional().catch('neutral'),
    crossRefs: z.array(z.string()).optional().catch([]),
    narrativeRole: z.enum(NARRATIVE_ROLES).optional().catch('evidence'),
  })).min(1),
});

const PLAN_CAPTURED_TOOL: Tool = {
  name: 'report_deck_plan',
  description:
    "Return the full ordered deck plan: deck GOAL (what this deck must leave the audience with), deck ARC (the ordered narrative-role sequence), a short deck title, and per-slide layout pick + narrative role + editorial brief.",
  input_schema: {
    type: 'object',
    properties: {
      deckGoal: {
        type: 'string',
        description: 'ONE sentence stating what this deck must leave the audience with by the last slide. Every slide is chosen to advance this goal. Grounded in the topic — no boilerplate like "inform the audience". Example: "Give the board a candid read on Q3\'s decline and the specific three-part response plan we are asking them to approve."',
      },
      deckArc: {
        type: 'array',
        description: 'The ORDERED narrative-role sequence for the deck — designed BEFORE picking slides. Each slide\'s narrativeRole must map to a position in this arc. Vocabulary (closed): "hook" (attention-grabbing opener), "setup" (frame the situation), "evidence" (present facts), "cause" (why it happened), "consequence" (what it led to), "response" (what we do about it), "close" (call to action / wrap). A board-review arc for a warning deck: [hook, evidence, cause, cause, consequence, response, close]. A win deck: [hook, evidence, evidence, cause, response, close].',
        items: { type: 'string', enum: [...NARRATIVE_ROLES] as unknown as string[] },
      },
      deckTitle: {
        type: 'string',
        description: 'A short (2-8 word) deck title derived from the topic — this becomes the deck name, so make it specific and prompt-grounded (e.g. "Meridian FY2025 Board Review", not "Presentation Deck").',
      },
      slides: {
        type: 'array',
        description: 'Ordered slides. Only include slides that EARN their place — background details fold into other slides or omit entirely.',
        items: {
          type: 'object',
          properties: {
            capturedIndex: {
              type: 'number',
              description: "Index of the captured template slide to use here (0..N-1). Match on the layout's SHAPE, not its placeholder title.",
            },
            focus: {
              type: 'string',
              description: 'One line: what THIS slide covers in the deck arc, specific to the topic. Not a title — the focus a writer would use to draft its content.',
            },
            hero: {
              type: 'string',
              description: 'The ONE most important point on this slide — the writer will place this in the anchor slot (title / hero metric). If no single hero point exists (e.g., a divider or a summary), leave empty.',
            },
            callouts: {
              type: 'array',
              description: 'Anomalies, deltas, or reversals that must be explicitly named in prose with numbers. Examples: "ARR up 4.5× Y1→Y3", "NRR 134% (vs 100% baseline)", "customers dropped from 200 to 140 (-30%)". Empty when the section has no anomaly worth flagging.',
              items: { type: 'string' },
            },
            angle: {
              type: 'string',
              enum: ['win', 'warning', 'comparison', 'decision', 'neutral'],
              description: 'Voice / framing for this slide. "win" = confident/celebratory. "warning" = candid/decision-forcing. "comparison" = balanced. "decision" = implication + call-to-action. "neutral" = informative (default).',
            },
            crossRefs: {
              type: 'array',
              description: 'Cross-reference INFERENCES — natural-language hypotheses linking THIS slide\'s facts to related facts elsewhere in the source. HEDGE LANGUAGE required ("may reflect", "coincides with", "possibly driven by") — NEVER causal certainty ("caused by", "because of"). Example: "Missed sell target may reflect price sensitivity from the 20% input-cost rise noted in the operations section." Only surfaced to the writer when rewriteIntensity is build or inspire. Empty when no cross-section inference is warranted.',
              items: { type: 'string' },
            },
            narrativeRole: {
              type: 'string',
              enum: [...NARRATIVE_ROLES] as unknown as string[],
              description: 'This slide\'s JOB in the deck arc. Must match a position in deckArc. "hook" = attention-grabbing opener. "setup" = frame the situation (context, scope). "evidence" = present facts / numbers. "cause" = explain WHY something happened (must reference the cause explicitly). "consequence" = show WHAT it led to (must reference what caused this). "response" = the answer / plan / call to action. "close" = wrap / next steps. Every slide MUST have a role — a slide that does not serve the deck goal should be DROPPED, not shipped as a floating fact.',
            },
          },
          required: ['capturedIndex', 'focus', 'narrativeRole'],
        },
      },
    },
    required: ['deckGoal', 'deckArc', 'deckTitle', 'slides'],
  },
};

/** Shape signatures per Compass captured slide. Describe COMPOSITIONAL SHAPE
 *  (units + count-flex + arrangement + density + content-agnostic fit),
 *  NOT placeholder titles. The plan agent uses these to match content shape
 *  to layout shape — NOT to keyword-match topic words to slide titles.
 *
 *  Grammar per line:
 *    [compositional shape] · [item count with flex where adaptive] ·
 *    [density constraint] · Fits: [content patterns]. Avoid: [mismatches].
 *
 *  These are content-AGNOSTIC — same shape fits movie characters,
 *  team members, historical figures, or product features equally. The
 *  atomic unit is what matters, not what the source happened to name it. */
const SLIDE_AFFORDANCES: Record<number, string> = {
  0:  "Cover: title + subtitle + author + date + accent bar over a full-bleed background image. Any deck's opening slide.",
  1:  "Text-left + right-image: 1 title + 1 body paragraph on the left, full-height image on the right. Fits any 1-idea slide that benefits from an evocative photo — section intros, chapter leads, single-topic story slides.",
  2:  "2×2 grid: 4 cards, each = icon + short label (~15 chars) + brief description (~50 chars). Parallel comparables. Adapts down. Fits any 2-4 comparable items each earning a visual mark — problems, principles, categories, risks, characteristics.",
  3:  "Row of up to 4 icon + short label + brief description units. Parallel. Same shape family as #2, wider row layout. Fits 4 comparable items with icons.",
  4:  "2×2 grid: 4 cards, each = icon + short label + brief description. Parallel. Fits 4 features, capabilities, aspects, principles, dimensions.",
  5:  "Subtitle + row of 3 units, each = icon + short label + brief description. Parallel. Fits 3 pillars, 3 benefits, 3 phases at high level.",
  6:  "Hero image + title + 1 body paragraph. Single-topic impact slide — mission statement, founder narrative, inflection moment, thesis intro.",
  7:  "3-column narrative grid: each column has header + body block. Fits 3 mechanisms, revenue streams, approaches, methods, models side-by-side.",
  8:  "3 metric tiles (each = big number + short label) + supporting narrative body. Fits headline KPIs with context — TAM/SAM/SOM, key metrics row, dashboard stats, headcount-by-department, quantitative overview.",
  9:  "3×3 grid of text cells for parallel comparison without a chart. Fits feature matrix, criteria × options, evaluation grid.",
  10: "Subtitle + comparison table (2-5 rows × 2-5 columns of tight cells). DIRECT COMPARISON. Fits then-vs-now, product-vs-product, before-vs-after, feature matrix, characteristic-by-characteristic.",
  11: "3-4 sequential steps, each = short label + brief body. Ordered SEQUENCE. Fits process, journey, funnel stages, methodology steps, phases in order.",
  12: "Sparse: 1 short title + 1 table (2-5 rows × 2-5 cols, tight cells). Fits KPI table, milestone list, results at-a-glance, metric snapshot.",
  13: "Timeline/Gantt grid: up to 8 time-positions (e.g. Q1-Q4 across 2 years) × 1 body per position. SEQUENTIAL over time. Fits roadmaps, project plans, quarter-by-quarter breakdowns, milestone timelines.",
  14: "Subtitle + hero chart (left) + supporting table (right) + caption. Fits any content where a chart IS the story with supporting metrics — financial performance, growth trajectory with breakdown, dashboard with lead metric.",
  15: "Row of up to 4 portrait cards, each = image + short label (~15 chars) + brief description (~40 chars). Parallel comparables. Adapts to 2, 3, or 4 items. Fits any content where items each earn a face + short caption — people, book/film characters, principles personified, case studies with photos, historical vignettes, artifacts with descriptions.",
  16: "Grid of up to 8 portrait cards, each = image + short label + brief description. Same shape family as #15, doubled capacity. Adapts down to 5. Fits 5-8 comparable items each earning a face + caption.",
  17: "Subtitle + single hero chart. Writer picks chart type. Fits any content where one chart is the whole story — funding history, revenue trajectory, cost breakdown, market share pie, user growth.",
  18: "1 hero image + title + 1 body paragraph. Fits closing summaries, key-takeaway cards, section wrap-ups, thesis restatements.",
  19: "Closing: 1 title + 1 body paragraph (left) + full-height right image. Fits closings — thank-yous, contact info, calls-to-action, next steps.",
};

/** Build a compact profile of a captured slide for the planner's menu. Reads
 *  the shape signature from SLIDE_AFFORDANCES — the plan agent matches on
 *  SHAPE, not on the captured slide's placeholder title example. */
function slideProfile(slide: CapturedSlide): string {
  const affordance = SLIDE_AFFORDANCES[slide.index]
    ?? `(no affordance description for #${slide.index})`;
  return `#${String(slide.index).padStart(2)}: ${affordance}`;
}

/** Measured text capacity per Compass captured layout (in approximate words).
 *  Computed from the real `slotCharCap` formula summed across writer-fillable
 *  slots on the 960x540 canvas at each slot's authored font size — divided by
 *  6 to convert chars → words. Used by the swap-layout fixer: when a slide
 *  comes back with too little text for its current layout, pick a layout
 *  whose capacity brackets the actual word count.
 *
 *  Bucketed for quick reference:
 *   THIN   (≤20 words):  #6, #12, #19
 *   SMALL  (~30-45):     #10, #0, #1, #5
 *   MED    (~45-75):     #17, #15, #14, #18
 *   LARGE  (~75-100):    #9, #13, #8, #4, #16, #7
 *   XLARGE (>100):       #3, #11, #2
 *
 *  Regenerate with the one-liner in the swap-layout PR description. */
const LAYOUT_CAPACITY_WORDS: Record<number, number> = {
  0: 28, 1: 42, 2: 232, 3: 112, 4: 90, 5: 42, 6: 5, 7: 96, 8: 82, 9: 73,
  10: 28, 11: 126, 12: 14, 13: 82, 14: 50, 15: 47, 16: 91, 17: 47, 18: 70, 19: 19,
};

/** Detect an explicit slide-count request typed in the prompt — "7 slides",
 *  "7-slide deck", "make it 10 slides", "a 6 slide presentation". A typed
 *  count is the most deliberate signal, so it overrides the picker hint.
 *  Digits only (word-numbers like "seven" are rare in this ask and add
 *  false-positive risk). Clamped to a sane 1-30. */
export function extractExplicitSlideCount(text: string): number | undefined {
  // "<n> slide(s)" or "<n>-slide" — the number immediately qualifying "slide".
  const m = text.match(/\b(\d{1,2})\s*[-\s]?\s*slides?\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 30) return n;
  }
  return undefined;
}

/** Compact record of a prior deck sent from the client for silent memory.
 *  Mirrors PriorDeckContext in cardDeckStorage — SHAPE only, no facts. */
export interface PriorDeckShape {
  name: string;
  audience?: string;
  tone?: string;
  angle?: string;
  cardCount: number;
  arc: string[];
  layouts: string[];
  createdAt: string;
}

/** Ask the planning LLM to name + pick + order captured slides for this
 *  prompt. Returns a validated DeckPlan — deck title + slide plan entries. */
export async function planCapturedDeck(
  prompt: string,
  template: CapturedTemplate,
  opts: {
    sourceText?: string;
    standalone?: boolean;
    cardCountHint?: number;
    audience?: string;
    tone?: string;
    density?: string;
    /** Silent memory — prior decks whose shape may inform this one. */
    priorDecks?: PriorDeckShape[];
    /** R-0.7 pre-planner brief. When present, the planner reads this in
     *  place of guessing content shapes from the raw prompt, and its layout
     *  picks serve the brief's intended slide-content shapes. Null → falls
     *  back to the monolithic 5-phase reasoning. */
    brief?: import('./deck-brief').DeckBrief | null;
  } = {},
): Promise<DeckPlan> {
  const src = (opts.sourceText ?? '').trim();
  const menu = template.slides.map(slideProfile).join('\n');
  const maxIdx = template.slides.length - 1;

  // Slide-count resolution order (deterministic — not left to the LLM):
  //   1. An explicit count TYPED in the prompt ("do 10 slides", "a 6-slide
  //      deck") — the most deliberate signal — detected by regex, OVERRIDES.
  //   2. The picker hint (cardCountHint) — the stepper value.
  //   3. Auto (no hint) — adaptive to the material + density.
  const promptCount = extractExplicitSlideCount(prompt);
  const effectiveCount = promptCount ?? (opts.cardCountHint && opts.cardCountHint > 0 ? opts.cardCountHint : undefined);
  const countLine = effectiveCount
    ? `SLIDE COUNT: produce EXACTLY ${effectiveCount} slides — a hard requirement.${promptCount ? ' (This count was requested in the prompt.)' : ''}`
    : opts.density === 'extensive'
      ? 'SLIDE COUNT: AUTO — use as many captured slides as the material genuinely warrants (typical 10-15 for a heavy source). Prefer depth: give each substantive point its own slide.'
      : opts.density === 'concise'
        ? 'SLIDE COUNT: AUTO — choose the smallest count that tells the story well (typical 4-6).'
        : 'SLIDE COUNT: AUTO — use as many or as few captured slides as the material genuinely warrants (typical 5-10); not every captured slide needs to be used.';

  const sourceBlock = src
    ? (opts.standalone
        ? `\nBRIEF (the user's own topic — develop the deck around it):\n"""\n${src.slice(0, 8000)}\n"""\n`
        : `\nSOURCE MATERIAL (ground the deck in THIS — plan slides that cover its real substance):\n"""\n${src.slice(0, 8000)}\n"""\n`)
    : '';

  const aud = (opts.audience ?? '').trim();
  const tn = (opts.tone ?? '').trim();
  const framingLine = aud || tn
    ? `\nFRAMING:${aud ? ` audience: ${aud}.` : ''}${tn ? ` tone: ${tn}.` : ''}\n`
    : '';

  // Silent agent memory — prior decks by this user whose shape is similar.
  // Never surfaced in the UI. Purpose: reuse the arc/angle/tone the user has
  // already committed to for similar decks so the shape stays consistent
  // across their work. Facts are NEVER carried — only shape signals.
  const priorLines = (opts.priorDecks ?? [])
    .filter((p) => p && Array.isArray(p.arc) && p.arc.length > 0)
    .map((p) => {
      const parts = [`  · "${p.name}"`, `${p.cardCount} slides`];
      if (p.audience) parts.push(`audience: ${p.audience}`);
      if (p.angle) parts.push(`angle: ${p.angle}`);
      parts.push(`arc: ${p.arc.join('→')}`);
      return parts.join(' · ');
    });
  const priorBlock = priorLines.length
    ? `\nPRIOR DECKS BY THIS USER (context for SHAPE decisions ONLY — never carry over facts):\n${priorLines.join('\n')}\nThe user has committed to these shapes before for similar content — the shape is a signal about how THIS user thinks presentations should be structured. When the current deck's content genuinely fits one of these shapes, reuse its ARC verbatim and its ANGLE (this is the load-bearing default: matching the user's established style beats reinventing). Deviate ONLY when the new content clearly demands a different shape (e.g. a warning arc for a win deck, or the prior shape is nonsensical for this content). When you DO reuse a prior arc, state it in your reasoning implicitly by producing the same role sequence. Facts on the current deck come from the current source alone — never reuse numbers, names, or quotes from prior decks.\n`
    : '';

  // R-0.7: when a pre-planner brief is provided, PHASES 0-1 are already
  // decided (deckGoal, narrativeArc, per-slide content intentions). The
  // planner then focuses on PHASES 2-4 (layout shape-fit, editorial,
  // cross-reference) with the brief as its source of truth. Fall back to
  // the monolithic 5-phase reasoning when the brief is absent.
  const briefBlock = opts.brief
    ? `\n════════════════════════════════════════════════════════════\nPRE-PLANNER BRIEF (PHASES 0-1 already decided — DO NOT RE-DO)\n════════════════════════════════════════════════════════════\n${(await import('./deck-brief')).formatDeckBriefForPlanner(opts.brief)}\n\nYour job: PHASE 2 (SHAPE-FIT) — for each SLIDE INTENTION above, pick the captured layout whose SHAPE MATCHES the intended content type. Match on structure (item count, image/no-image, table/no-table, chart/no-chart), NOT on topical keywords. Then PHASE 3 (editorial polish) and PHASE 4 (cross-reference).\n`
    : '';

  const planPrompt = `You are a presentation art director planning a deck. You think HOLISTICALLY — the deck is a single argument, not a list of slides. You think in FIVE PHASES, IN ORDER:
  PHASE 0 · HOLISTIC VIEW     — deck GOAL + narrative ARC (deck-level, done FIRST)
  PHASE 1 · CURATE            — what content EARNS a slide within that arc
  PHASE 2 · SHAPE-FIT         — pick the right layout for each earned slide
  PHASE 3 · EDITORIAL BRIEF   — hero + callouts + angle per slide
  PHASE 4 · CROSS-REFERENCE   — inferential links across the source${briefBlock}

TOPIC: "${prompt}"
${sourceBlock}${framingLine}${priorBlock}
${countLine}

AVAILABLE LAYOUTS (choose from THESE only — each entry describes the layout's SHAPE, not a topic label. Prefix is the capturedIndex.):
${menu}

════════════════════════════════════════════════════════════
PHASE 0 · HOLISTIC VIEW — Deck goal and narrative arc FIRST.
════════════════════════════════════════════════════════════
Before you pick any slides, answer TWO questions at the deck level:

Q0.1 · WHAT DOES THIS DECK NEED TO LEAVE THE AUDIENCE WITH?
  Write ONE sentence stating the deck's goal — grounded in the topic, specific, not boilerplate. This is the "what do we want to present" question. Every slide you pick will be justified against this goal.
  Examples:
    · "Give the board a candid read on Q3's decline and the specific three-part response plan we are asking them to approve."
    · "Convince investors that Meridian's 4.5× ARR growth is repeatable in 2026 based on our unit economics and expansion motion."
    · "Teach a middle-school class how photosynthesis converts sunlight into food, and why it starts the food chain."

Q0.2 · WHAT NARRATIVE ARC DELIVERS THAT GOAL?
  Design the arc BEFORE picking slides. Choose an ordered sequence of narrative roles from this closed vocabulary:
    · hook         — attention-grabbing opener (cover / provocative image)
    · setup        — frame the situation (context, scope, players)
    · evidence     — present facts, numbers, data
    · cause        — WHY something happened (must reference the cause explicitly)
    · consequence  — WHAT it led to (must reference what caused this)
    · response     — the answer / plan / call to action
    · close        — wrap / next steps

  Board-review of a decline: [hook, evidence, cause, cause, consequence, response, close]
  Board-review of a strong quarter: [hook, evidence, evidence, cause, response, close]
  Educational (photosynthesis): [hook, setup, evidence, cause, evidence, close]
  Product pitch: [hook, setup, evidence, response, response, close]

The arc is your story spine. Every slide's narrativeRole must map to a position in this arc.

════════════════════════════════════════════════════════════
PHASE 1 · CURATE — Decide what EARNS a slide within the arc.
════════════════════════════════════════════════════════════
Before you pick any slides, read the entire source and identify:
- The HERO: what's the ONE most important story of this deck? (a hero metric, a strategic decision, a milestone)
- ANOMALIES: what's memorably surprising? (deltas, misses, spikes, reversals, firsts)
- DECISION-FORCING: what does the audience need to act on?
- BACKGROUND: what's just informational context? (headcounts, org details, minor facts)

Only SLIDE-WORTHY content gets a slide. A section is slide-worthy when it's the hero, an anomaly worth flagging, or a decision-forcing point. Simple facts that don't move the story do NOT earn dedicated slides.

Background details (like "team headcount 42 people across 4 depts") should either:
- Fold into another slide's supporting body (as one line on a Company Overview slide), OR
- Be omitted entirely if not needed for the story.

Example — for a board review: "we grew ARR 4.5× and hit 134% NRR" is the hero and earns the strongest slide. "We have 42 employees" is background — fold into a company slide or drop.

════════════════════════════════════════════════════════════
PHASE 2 · SHAPE-FIT — For each surviving section, pick the RIGHT layout.
════════════════════════════════════════════════════════════
Ask these three questions IN ORDER:

Q1 · Did the user EXPLICITLY ask for a specific shape?
Scan for: "show a table of", "compare X vs Y", "roadmap", "chart the growth", "timeline of", "three main points", "before and after", "grid of", "list of". If yes, that shape WINS.

Q2 · If not, what shape does the CONTENT itself have?
  - How many ITEMS?
  - What does each item HOLD? (a number, short label, image + label + description, chart data, table cells, a paragraph)
  - How are items RELATED? (parallel, sequential/time, comparison, hero + supporting)
  - How much text PER ITEM? (word, short label, brief phrase, paragraph)
Pick a layout whose SHAPE carries this content — layout's unit types match content's units, count fits within count-flex, arrangement matches relationship, density fits.

Q3 · Does this pick VARY from neighboring slides and serve the deck arc?

════════════════════════════════════════════════════════════
PHASE 3 · EDITORIAL BRIEF — For each planned slide, provide guidance.
════════════════════════════════════════════════════════════
For every slide in your plan, produce:

- focus: what THIS slide specifically covers (one line, grounded in source)

- hero: the ONE most important point on THIS slide. The writer will place this in the anchor slot (title or hero metric). Empty for dividers/summaries where no single hero exists.

- callouts: any anomaly / delta / reversal that must be EXPLICITLY named in prose with numbers. Not just the raw value — the DELTA. Examples:
    · "ARR expanded 4.5× Y1 → Y3 (\$4M → \$18M)"
    · "NRR held 134% (vs 100% baseline)"
    · "Customer count dropped from 200 to 140 (-30% YoY)"
    · "Missed 90% sell target — actual 25%"
  Empty when the slide has no anomaly worth explicit prose call-out.

- angle: one of win / warning / comparison / decision / neutral. Frames the writer's voice. Board-review deck with strong metrics → "win". Missed target → "warning". Product comparison → "comparison". Strategic pivot → "decision". Info slide → "neutral".

- narrativeRole: the slide's JOB in the deckArc (from Phase 0). REQUIRED. If you can't name a role for a slide, that slide does NOT belong — cut it. Rules per role:
    · "cause" slides — the focus/hero MUST reference the cause explicitly. Not "Drop in Customer Engagement" but "Ad spend miss reveals broken targeting — engagement fell 22%".
    · "consequence" slides — the focus/hero MUST reference what caused this. Not "NPS Collapse" but "Weak engagement drove NPS to 31 (from 62)".
    · "evidence" slides — carry the raw facts / numbers that a later cause or consequence slide will reference.
    · "response" slides — must name what we are proposing to DO about the situation.
    · "hook" / "setup" / "close" — framing slides, less content-heavy but must contribute to the arc.
  A "floating fact" slide — a data point that neither sets up, evidences, causes, nor consequences anything else in the deck — is a FAIL. Cut it or merge it into a neighbor.

════════════════════════════════════════════════════════════
PHASE 4 · CROSS-REFERENCE — Connect facts across the source (inferentially).
════════════════════════════════════════════════════════════
For each planned slide, scan the ENTIRE source for facts elsewhere that PLAUSIBLY connect to this slide's content. Then produce inferential links.

When the source contains MULTIPLE anomalies (misses, drops, cost rises, reversals) in DIFFERENT sections, you MUST scan for cross-references between them. A deck that just LISTS anomalies without inferring plausible connections lacks editorial intelligence — the reader wants to understand WHAT HAPPENED, not just WHAT.

Examples of connections worth surfacing:
- "Missed 90% sell target (actual 25%)" AND "cost of goods +20% due to manufacturing/transportation" → INFERENCE: sell miss may reflect price pressure from cost inflation reducing demand.
- "Revenue down 42%" AND "NPS dropped from 68 to 42" AND "sell miss" → INFERENCE: the revenue drop and sell miss appear linked to a customer-satisfaction issue surfaced by the NPS decline.
- "ARR grew 4.5×" AND "sales team doubled" AND "avg deal size flat" → INFERENCE: growth appears driven by pipeline volume, not deal expansion.
- "Customer count dropped 30%" AND "NPS dropped from 68 to 42" → INFERENCE: churn may be driven by satisfaction issues surfaced in the NPS trend.

For a WARNING-angle deck with multiple anomalies, expect at LEAST one cross-reference inference — even if the specific link is uncertain, hedge language ("may reflect", "appears linked to") makes it safe to surface.

MANDATORY HEDGE LANGUAGE — every crossRef entry MUST use inference vocabulary, NEVER causal certainty:
- OK: "may reflect", "coincides with", "possibly driven by", "appears linked to", "consistent with", "correlates with", "could explain", "may point to"
- NOT OK: "caused by", "because of", "led to", "resulted in", "the reason was", "due to" (unless the source itself uses these words explicitly to link the two facts)

If the source EXPLICITLY states a causal link ("we missed target BECAUSE costs rose"), don't put it in crossRefs — it's already grounded fact, belongs in callouts. crossRefs are ONLY for links the source implies but doesn't state.

DIRECTIVE — CROSS-REFERENCE IS EXPECTED, NOT OPTIONAL, WHEN ANOMALIES CO-EXIST:
- If the source contains 2+ warning-signal facts (misses, drops, cost rises, reversals), you MUST attempt at least ONE cross-reference inference per slide that touches those signals.
- "The source doesn't offer plausible connections" is rarely true when multiple anomalies co-exist — cost rises next to sell misses next to NPS drops almost always warrant an inferential hypothesis about their relationship, hedged with "may reflect" or "coincides with".
- Empty crossRefs is ONLY correct when the slide's content genuinely stands alone (e.g., a summary slide, a strategic-focus slide with no numeric anomalies). For any slide covering an anomaly, produce at least one crossRef.

════════════════════════════════════════════════════════════
HARD RULES (violation = broken plan):
════════════════════════════════════════════════════════════
- deckGoal MUST be produced FIRST (Phase 0), then deckArc, then slides.
- Every slide MUST have a narrativeRole from the closed vocabulary.
- Every slide's narrativeRole MUST appear in deckArc. A role not in the arc means either the arc is incomplete or the slide doesn't belong.
- Every role in deckArc SHOULD have at least one slide covering it (a missing role = an incomplete argument).
- A "cause" slide MUST explicitly name the cause in its focus/hero. A "consequence" slide MUST explicitly reference what caused it. Floating facts get CUT or MERGED.
- Cover (capturedIndex 0) MUST be the first slide.
- Every capturedIndex MUST be valid (0..${maxIdx}).
- NEVER pick a layout whose UNIT TYPE mismatches content units. Example: content is "4 label + number pairs" (headcount, metric row) → do NOT pick a portrait-card layout expecting "image + label + description" (would force fabrication — invented names/photos).
- Do NOT pick a chart layout unless source has real numeric data.
- Do NOT pick a table layout unless source has row × column comparable data with tight cells.
- COUNT-FIT RULE: if a section has MORE items than a layout's max slots, either (a) SPLIT the section across two slides of that shape, or (b) pick a different layout with more slots. NEVER pick a layout that will silently drop items. Example: 4 items into a 3-slot layout → split into two slides (3+1) OR pick a 4+slot layout.
- Layouts are CONTENT-AGNOSTIC. Match SHAPE, not the placeholder-example word.
- A capturedIndex may be reused only if genuinely necessary; prefer variety.

deckTitle: 2-8 word name derived from topic. Specific and grounded. Not generic.

Return via the report_deck_plan tool.`;

  // Verification log — proves priorBlock actually appears in the LLM prompt
  // when opts.priorDecks is non-empty. Logged in dev only; never in prod.
  if ((opts.priorDecks?.length ?? 0) > 0) {
    const hasPriorBlock = planPrompt.includes('PRIOR DECKS BY THIS USER');
    // eslint-disable-next-line no-console
    console.log(`[native-plan-memory-verify] priorBlock in constructed prompt: ${hasPriorBlock ? 'YES' : 'NO'} · prior decks in block: ${priorLines.length}`);
    if (process.env.NODE_ENV !== 'production') {
      // Log the actual PRIOR block that ended up in the prompt, exactly as
      // the LLM sees it. Truncated to the block only (not the full prompt).
      const start = planPrompt.indexOf('PRIOR DECKS BY THIS USER');
      const end = planPrompt.indexOf('\n\n', start);
      const block = start >= 0 ? planPrompt.slice(start, end > start ? end : start + 800) : '(none)';
      // eslint-disable-next-line no-console
      console.log(`[native-plan-memory-verify] block sent to LLM:\n${block}`);
    }
  }

  const provider = getProvider();
  const response = await provider.createMessage({
    model: getModel(),
    max_tokens: 1500,
    tools: [PLAN_CAPTURED_TOOL],
    tool_choice: { type: 'tool', name: 'report_deck_plan' },
    messages: [{ role: 'user', content: planPrompt }],
  });

  const toolUse = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw new Error('planCapturedDeck: no tool_use response');

  const parsed = PlanCapturedSchema.parse(toolUse.input ?? {});
  const validated: SlidePlan[] = [];
  const dropped: { entry: unknown; reason: string }[] = [];
  for (const s of parsed.slides) {
    if (s.capturedIndex < 0 || s.capturedIndex > maxIdx) {
      dropped.push({ entry: s, reason: `out-of-range capturedIndex ${s.capturedIndex} (max=${maxIdx})` });
      continue;
    }
    const focus = s.focus.trim();
    if (!focus) {
      dropped.push({ entry: s, reason: 'empty focus' });
      continue;
    }
    validated.push({
      capturedIndex: s.capturedIndex,
      focus,
      hero: s.hero?.trim() || undefined,
      callouts: (s.callouts ?? []).map((c) => c.trim()).filter(Boolean),
      angle: s.angle ?? 'neutral',
      crossRefs: (s.crossRefs ?? []).map((c) => c.trim()).filter(Boolean),
      narrativeRole: s.narrativeRole,
    });
  }
  if (validated.length === 0) {
    throw new Error(`planCapturedDeck: no valid entries after validation (dropped ${dropped.length})`);
  }
  const deckTitle = parsed.deckTitle.trim() || opts.audience || 'Untitled Deck';
  const deckGoal = parsed.deckGoal.trim();
  const deckArc = parsed.deckArc;
  // eslint-disable-next-line no-console
  console.log(`[native-plan] "${deckTitle}" · ${validated.length} slides · order=[${validated.map((p) => p.capturedIndex).join(', ')}]${dropped.length ? ` · dropped=${dropped.length}` : ''}`);
  // eslint-disable-next-line no-console
  console.log(`[native-plan-goal] ${deckGoal}`);
  // eslint-disable-next-line no-console
  console.log(`[native-plan-arc]  planned=[${deckArc.join(' → ')}] · assigned=[${validated.map((p) => p.narrativeRole ?? '?').join(' → ')}]`);
  return { deckTitle, deckGoal, deckArc, slides: validated };
}

// ─── Swap-layout fixer ──────────────────────────────────────────────────────
// When the judge flags a slide as too empty (or wrong-layout), it hands the
// case BACK to the plan agent — the single owner of "which layout fits what
// content."
//   1. It uses the same SLIDE_AFFORDANCES catalogue the plan agent uses.
//   2. It re-reads the ACTUAL text produced (word count + hero + callouts).
//   3. It excludes the current layout from candidates (never picks itself).
// The LLM chooses among the candidates using content-fit reasoning. There is
// NO heuristic fallback — if the LLM errors or picks invalid, it THROW. The
// caller (slide-gates → swapLayoutForNative) catches, logs, and lets the
// writer-rebuild path handle it. No silent heuristic picks — everything must
// be reasoned or the swap doesn't happen.

const SwapLayoutSchema = z.object({
  capturedIndex: z.number().int().min(0).max(19),
  reason: z.string().max(500),
});
const SWAP_LAYOUT_TOOL: Tool = {
  name: 'pick_swap_layout',
  description: 'Pick one captured-template layout index (0-19) that fits the given content amount + shape better than the current one.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      capturedIndex: { type: 'integer', minimum: 0, maximum: 19, description: 'The new layout to swap TO. Must NOT equal the current index.' },
      reason: { type: 'string', description: 'One sentence: why this fits better than the current layout.' },
    },
    required: ['capturedIndex', 'reason'],
  },
};

/** Bucket a word count to a capacity band label. */
function capacityBand(words: number): 'thin' | 'small' | 'med' | 'large' | 'xlarge' {
  if (words <= 20) return 'thin';
  if (words <= 45) return 'small';
  if (words <= 75) return 'med';
  if (words <= 100) return 'large';
  return 'xlarge';
}

export interface SwapLayoutInput {
  /** Deck prompt — same one the original plan agent saw. */
  prompt: string;
  /** The plan entry it is re-planning (its focus, hero, callouts, angle). */
  planEntry: SlidePlan;
  /** Actual text the writer produced, joined by spaces. Used for word-count
   *  and to give the picker something concrete to reason about. */
  actualText: string;
  /** Current captured layout index — excluded from candidates. */
  currentIdx: number;
  /** Layouts eligible for swap. Typically the full 0-19 minus indices already
   *  used elsewhere in the deck (to avoid duplicate slides). */
  allowedIdxs: number[];
  /** Reason the judge flagged this slide — passed to the picker so it knows
   *  what to correct for ("too empty", "wrong shape", etc.). */
  judgeReason?: string;
}

/** Re-run the plan agent for ONE slide with the ACTUAL text in hand. Returns
 *  the new captured layout index (0-19) — MUST differ from `currentIdx`.
 *  THROWS on LLM error or invalid pick — no heuristic fallback (see comment
 *  above). */
export async function swapLayoutForSlide(input: SwapLayoutInput): Promise<{ capturedIndex: number; reason: string }> {
  const words = input.actualText.trim().split(/\s+/).filter(Boolean).length;
  const band = capacityBand(words);
  const currentCap = LAYOUT_CAPACITY_WORDS[input.currentIdx] ?? 0;

  const catalogue = input.allowedIdxs
    .filter((i) => i !== input.currentIdx)
    .map((i) => `  #${String(i).padStart(2)} (~${LAYOUT_CAPACITY_WORDS[i]}w): ${SLIDE_AFFORDANCES[i] ?? '(no description)'}`)
    .join('\n');

  const systemLines = [
    'You pick the captured-template layout that best fits a slide\'s ACTUAL produced content.',
    'A layout is a container. Each has a measured word capacity (~w) and a shape (single statement, multi-item row, comparison, dense grid, etc.).',
    'The current slide was placed in a layout too BIG (or too small) for its content, so it looks broken.',
    'Pick a layout whose capacity is CLOSE TO the actual word count, and whose SHAPE matches what the content is (a single statement vs. items vs. a comparison).',
    'NEVER pick the current layout. NEVER exceed the closed candidate list.',
  ];
  const userLines = [
    `PROMPT (deck topic): ${input.prompt}`,
    '',
    `SLIDE FOCUS: ${input.planEntry.focus}`,
    input.planEntry.hero ? `HERO: ${input.planEntry.hero}` : '',
    (input.planEntry.callouts ?? []).length ? `CALLOUTS:\n${(input.planEntry.callouts ?? []).map((c) => `  - ${c}`).join('\n')}` : '',
    input.planEntry.angle ? `ANGLE: ${input.planEntry.angle}` : '',
    '',
    `CURRENT LAYOUT: #${input.currentIdx} (~${currentCap} words) — flagged by judge${input.judgeReason ? ' — ' + input.judgeReason : ''}.`,
    `ACTUAL PRODUCED TEXT (${words} words, band=${band}):`,
    `"${input.actualText.slice(0, 500)}${input.actualText.length > 500 ? '…' : ''}"`,
    '',
    'CANDIDATE LAYOUTS (choose ONE):',
    catalogue,
    '',
    `Pick the layout whose capacity best fits ${words} words AND whose shape matches the content type.`,
  ].filter(Boolean);

  const provider = getProvider();
  const res = await provider.createMessage({
    model: getModel(),
    messages: [{ role: 'user', content: userLines.join('\n') }],
    system: systemLines.join(' '),
    tools: [SWAP_LAYOUT_TOOL],
    max_tokens: 200,
  });
  const toolUse = res.content.find((b): b is ToolUseBlock => b.type === 'tool_use' && b.name === SWAP_LAYOUT_TOOL.name);
  if (!toolUse) throw new Error('swap-layout: LLM returned no tool use');
  const parsed = SwapLayoutSchema.parse(toolUse.input ?? {});
  if (parsed.capturedIndex === input.currentIdx) {
    throw new Error(`swap-layout: LLM picked the current layout (#${parsed.capturedIndex})`);
  }
  if (!input.allowedIdxs.includes(parsed.capturedIndex)) {
    throw new Error(`swap-layout: LLM picked layout #${parsed.capturedIndex} which is not in the allowed candidates`);
  }
  return { capturedIndex: parsed.capturedIndex, reason: parsed.reason };
}

// ─── Slide-metadata extraction ────────────────────────────────────────────
// Small stopword list — dropped from keywords so search matches meaningful
// words. Not exhaustive; covers the top ~30 fillers found in slide prose.
const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','these','those','have','has',
  'had','was','were','been','being','are','you','your','our','their','they',
  'them','its','his','her','she','him','one','two','three','all','any','not',
  'but','can','will','into','over','under','about','more','than','then','also',
  'per','via','via','of','in','on','at','to','by','as','is','be','a','an','it',
]);

/** Extract search metadata from a card. Reads title + body + freeform text
 *  blocks — pulls keywords (lowercased words ≥3 chars, stopwords removed,
 *  deduped) and entities (proper nouns + numbers-with-units + dates). Runs
 *  ONCE per slide at generation time. Cheap — no LLM call. */
export function extractSlideMetadata(
  card: Card,
  ctx: {
    narrativeRole?: SlideMetadata['narrativeRole'];
    angle?: SlideMetadata['angle'];
    audience?: string;
    tone?: string;
    layoutId?: string;
    deckGoal?: string;
  },
): SlideMetadata {
  const texts: string[] = [];
  for (const b of card.freeform ?? []) {
    if (b.type === 'text' && (b as { content?: string }).content) {
      texts.push((b as { content: string }).content);
    }
  }
  const joined = texts.join(' ');

  // Keywords — lowercased alpha tokens ≥3 chars, stopwords out, deduped.
  const kwSet = new Set<string>();
  for (const raw of joined.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    kwSet.add(raw);
  }
  const keywords = Array.from(kwSet).slice(0, 40);

  // Entities — three cheap deterministic patterns:
  //   1. Proper nouns (Capitalized words, not sentence-start).
  //   2. Numbers with units / percents (18%, $4.5M, 62, 40).
  //   3. Dates + quarter markers (Q3 2025, 2026, Jan, Nov).
  const entSet = new Set<string>();
  // Capitalized runs of 1-3 words: "Zenithly", "Q3 2025", "Sales Decline". Skip
  // sentence-start words by requiring they follow another cap word OR appear
  // mid-sentence (crude but effective on slide-fragment prose).
  const propRx = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+){0,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = propRx.exec(joined)) !== null) {
    const phrase = m[1].trim();
    if (phrase.length < 3) continue;
    entSet.add(phrase);
  }
  // Numeric entities.
  const numRx = /\$?\d[\d,\.]*(?:\s?[%×xM]|\s?(?:pts|points|bps|K|B|M)\b)?/g;
  while ((m = numRx.exec(joined)) !== null) {
    const num = m[0].trim();
    if (num.length < 2) continue;
    entSet.add(num);
  }
  // Quarter / year markers.
  const qRx = /\bQ[1-4]\s?(?:20\d\d|19\d\d)?|20\d\d\b/g;
  while ((m = qRx.exec(joined)) !== null) {
    entSet.add(m[0].trim());
  }
  const entities = Array.from(entSet).slice(0, 30);

  const meta: SlideMetadata = {
    keywords,
    entities,
    narrativeRole: ctx.narrativeRole,
    angle: ctx.angle,
    layoutId: ctx.layoutId,
    audience: ctx.audience && ctx.audience.trim() ? ctx.audience.trim() : undefined,
    tone: ctx.tone && ctx.tone.trim() ? ctx.tone.trim() : undefined,
    deckGoal: ctx.deckGoal && ctx.deckGoal.trim() ? ctx.deckGoal.trim() : undefined,
    createdAt: new Date().toISOString(),
  };
  return meta;
}

/** Roles the writer FILLS (produces text for). Everything else is either
 *  auto-computed (slide-number), rendered as-authored (table/chart/image),
 *  or pure geometry (decoration). */
const WRITER_ROLES = new Set(['title', 'body', 'subtitle', 'date', 'metric']);

/** Non-word slot roles: writer never touches these. Keep as a positive skip
 *  list rather than negating WRITER_ROLES so future captured roles (a new
 *  auto-computed one, say) get an explicit decision instead of a default. */
const NON_WRITER_ROLES = new Set([
  'image', 'image-side',   // rendered as authored (or from image library)
  'decoration',            // pure geometry (rects, keylines)
  'slide-number',          // auto from slide index
  'table', 'chart',        // Phase 1: render as authored; writer fill later
]);

/** Key format for a captured chart/table slot — mirrors the text-slot key
 *  scheme (`role:group:slotIndex`) so lookups stay consistent. */
function dataSlotKey(role: string, group: string | undefined, i: number): string {
  return `${role}:${group ?? ''}:${i}`;
}

/** Human-readable "purpose" line for a chart/table slot. Feeds the writer
 *  prompt so the LLM knows what data to look for in the source. */
function chartPurpose(slide: CapturedSlide, slot: CapturedSlot): string {
  const title = (slide.slots.find((s) => s.role === 'title')?.example ?? '').trim();
  const seriesName = slot.chartSeries?.[0]?.name ?? '';
  const categories = (slot.chartCategories ?? []).join('/');
  const parts: string[] = [];
  if (title) parts.push(`for the "${title}" slide`);
  if (seriesName) parts.push(`series-shape: "${seriesName}"`);
  if (categories) parts.push(`captured categories: ${categories}`);
  return parts.length ? parts.join(', ') : 'numeric data for this slide';
}
function tablePurpose(slide: CapturedSlide, slot: CapturedSlot): string {
  const title = (slide.slots.find((s) => s.role === 'title')?.example ?? '').trim();
  const rows = slot.tableRows?.length ?? 0;
  const cols = slot.tableRows?.[0]?.length ?? 0;
  const shape = rows && cols ? `${rows}×${cols} rows/cols` : 'rows of comparables';
  return title ? `for the "${title}" slide (${shape})` : `${shape} for this slide`;
}

/** Advertise chart + table slots on THIS slide to the writer. Emits one
 *  DataSlotSpec per data slot; the writer then decides (per FR11) whether
 *  the source supplies real data for each. Empty arrays when the slide has
 *  no chart/table slots — most slides. */
export function describeCapturedDataSlots(slide: CapturedSlide): { charts: DataSlotSpec[]; tables: DataSlotSpec[] } {
  const charts: DataSlotSpec[] = [];
  const tables: DataSlotSpec[] = [];
  for (let i = 0; i < slide.slots.length; i += 1) {
    const s = slide.slots[i];
    const key = dataSlotKey(s.role, s.group, i);
    if (s.role === 'chart' && s.chart) {
      charts.push({ key, purpose: chartPurpose(slide, s), suggestedType: s.chartType });
    } else if (s.role === 'table' && s.table) {
      tables.push({ key, purpose: tablePurpose(slide, s) });
    }
  }
  return { charts, tables };
}

/** Build the writer-facing spec list for ONE captured slide. Mirrors the
 *  Figma path's `describeLayoutSlots` shape so the existing writer prompt +
 *  fill machinery consume this without change.
 *
 *  Keys are `${role}:${group ?? ''}:${slotIndex}` — the trailing slotIndex
 *  disambiguates slides where the same role:group repeats (e.g. six
 *  team-member body slots). The Figma path avoids this via `count`+array
 *  geometry; captured slides use N separate slots.
 */
export function describeCapturedSlots(
  slide: CapturedSlide,
  canvas: { w: number; h: number },
): LayoutSlotSpec[] {
  const specs: LayoutSlotSpec[] = [];
  for (let i = 0; i < slide.slots.length; i += 1) {
    const slot = slide.slots[i];
    if (NON_WRITER_ROLES.has(slot.role)) continue;
    if (!WRITER_ROLES.has(slot.role)) continue; // unknown role → skip loudly (logged by caller)

    // Percent → px on the deck canvas (LayoutSlotSpec.w and slotCharCap
    // both expect px on the 960-wide frame).
    const wPx = (slot.w / 100) * canvas.w;
    const hPx = (slot.h / 100) * canvas.h;
    const size = slot.size ?? 16;
    const charCap = slotCharCap(wPx, hPx, size);

    specs.push({
      key: `${slot.role}:${slot.group ?? ''}:${i}`,
      role: slot.role,
      group: slot.group,
      count: 1, // captured slides never use array geometry
      charCap,
      w: wPx,
      size,
      placeholder: slot.example ?? '',
    });
  }
  return specs;
}

// ── Step 3 · buildCapturedCard (renderable card from a captured slide) ──────

/** Minimal theme surface buildCapturedCard consumes. Resolved from the active
 *  Theme record at generation time; kept small so the native path doesn't
 *  couple to the wider Theme shape (which carries editor-only concerns). */
export interface NativeTheme {
  ink: string;
  /** Heading color (title / subtitle). Falls back to `ink` when absent. */
  titleColor?: string;
  accent: string;
  ground: string;
  surface: string;
  displayFont: string;
  bodyFont: string;
}

function resolveFillToken(token: string | undefined, theme: NativeTheme): string {
  switch (token) {
    case 'accent': return theme.accent;
    case 'ink':    return theme.ink;
    case 'ground': return theme.ground;
    case 'surface':return theme.surface;
    default:       return theme.ink;
  }
}

/** Map a captured role + size to a FreeformTextBlock variant. The renderer
 *  uses variant for default type-scale; per-slot fontSize still wins. */
function variantForRole(role: string): FreeformTextVariant {
  if (role === 'title') return 'heading';
  if (role === 'subtitle') return 'subheading';
  if (role === 'metric') return 'metric';
  return 'paragraph';
}

/** Fill-key lookup. Prefers the slot's exact key `role:group:idx`; falls back
 *  to `role:group` for a writer that emitted the bare form (kept lenient
 *  because the writer prompt exposes the full key but it doesn't want a
 *  key-format bump to blank a slide). */
function contentFor(fill: StructureFill, key: string, role: string, group?: string): string {
  const v = fill[key];
  if (typeof v === 'string' && v.trim()) return v;
  if (Array.isArray(v) && v[0]) return v[0];
  const bare = fill[`${role}:${group ?? ''}`];
  if (typeof bare === 'string' && bare.trim()) return bare;
  if (Array.isArray(bare) && bare[0]) return bare[0];
  return '';
}

/** Build a renderable Card from a captured slide + writer fill + theme. The
 *  captured geometry is already in percent (the renderer's native unit) so
 *  no unit conversion here. Non-writer slots (table/chart/decoration) render
 *  as-authored; slide-number auto-fills from the slide index; images are
 *  deferred (Phase 1 leaves the image slot empty rather than dropping in
 *  a wrong asset). */
export function buildCapturedCard(
  slide: CapturedSlide,
  fill: StructureFill,
  theme: NativeTheme,
  totalSlides: number,
  /** Position of this slide in the FINAL deck (0..totalSlides-1). Distinct
   *  from `slide.index` which is the captured-template index. slide-number
   *  auto-fill uses this so users see "03 / 11" (deck position) instead of
   *  "15 / 11" (captured index) after the plan agent picks a subset. */
  deckPos?: number,
  /** Writer-filled chart + table data (FR11-gated: writer only supplies
   *  these when the source has real matching data). If a captured chart
   *  or table slot has no matching entry here, that slot is HIDDEN — the
   *  captured Contoso placeholder is NOT rendered. */
  data?: { charts?: ChartFill[]; tables?: TableFill[] },
): Card {
  const chartByKey = new Map<string, ChartFill>((data?.charts ?? []).map((c) => [c.key, c]));
  const tableByKey = new Map<string, TableFill>((data?.tables ?? []).map((t) => [t.key, t]));
  const freeform: FreeformBlock[] = [];
  let textZ = 100;   // text blocks on top
  let decoZ = 1;     // decorations behind text

  for (let i = 0; i < slide.slots.length; i += 1) {
    const slot = slide.slots[i];

    // 1) Writer-filled text slots
    if (WRITER_ROLES.has(slot.role)) {
      const key = `${slot.role}:${slot.group ?? ''}:${i}`;
      const content = contentFor(fill, key, slot.role, slot.group) || (slot.example ?? '');
      if (!content.trim()) continue; // FR11-empty slot → no block (matches Figma path)
      const block: FreeformTextBlock = {
        id: `ff-native-${slot.role}-${slot.group ?? 'x'}-${i}`,
        type: 'text',
        variant: variantForRole(slot.role),
        content,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        rotation: 0,
        z: textZ++,
        style: {
          fontFamily: (slot.role === 'title' || slot.role === 'subtitle') ? theme.displayFont : theme.bodyFont,
          fontSize: slot.size,
          fontWeight: slot.weight,
          color: (slot.role === 'title' || slot.role === 'subtitle')
            ? (theme.titleColor ?? theme.ink)
            : theme.ink,
          textAlign: slot.align ?? 'left',
        },
      };
      freeform.push(block);
      continue;
    }

    // 2) Slide numbers — DISABLED on generation. The
    //    captured template carries slide-number slots on 16/20 slides, but
    //    page numbers are suppressed at generation time. Skip the slot
    //    entirely (renders nothing). Re-enable by restoring the block below.
    if (slot.role === 'slide-number') {
      continue;
    }

    // 3) Decoration → shape block (only 'rectangle' seen in captured data today)
    if (slot.role === 'decoration') {
      const block: FreeformShapeBlock = {
        id: `ff-native-deco-${slot.group ?? 'x'}-${i}`,
        type: 'shape',
        shape: 'rectangle',
        fill: resolveFillToken(slot.fillToken, theme),
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        rotation: 0,
        z: decoZ++,
      };
      freeform.push(block);
      continue;
    }

    // 4) Table — use writer-filled data if the writer produced grounded rows
    //    for this slot key. Else HIDE (no Contoso fallback: rendering the
    //    captured placeholder rows on an unrelated deck is a fabrication —
    //    the whole point of the FR11 writer gate).
    if (slot.role === 'table' && slot.table) {
      const filled = tableByKey.get(dataSlotKey(slot.role, slot.group, i));
      if (!filled) continue; // FR11: no source data → hide the table slot
      const block: FreeformTableBlock = {
        id: `ff-native-table-${slot.group ?? 'x'}-${i}`,
        type: 'table',
        rows: filled.rows,
        headerRow: filled.headerRow ?? true,
        style: { fontFamily: theme.bodyFont, color: theme.ink },
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        rotation: 0,
        z: textZ++,
      };
      freeform.push(block);
      continue;
    }

    // 5) Chart — same FR11 gate. Writer's chart data wins; else hide.
    if (slot.role === 'chart' && slot.chart) {
      const filled = chartByKey.get(dataSlotKey(slot.role, slot.group, i));
      if (!filled) continue; // FR11: no source numbers → hide the chart slot
      const validChart: FreeformChartType[] = ['bar','column','line','area','pie','donut'];
      const chartType = (validChart as string[]).includes(filled.chartType)
        ? (filled.chartType as FreeformChartType)
        : 'column';
      const numberFormat = (['number','currency','percent','compact'] as const).includes(
        (filled.numberFormat ?? 'number') as 'number'|'currency'|'percent'|'compact',
      ) ? (filled.numberFormat as 'number'|'currency'|'percent'|'compact') : 'number';
      const block: FreeformChartBlock = {
        id: `ff-native-chart-${slot.group ?? 'x'}-${i}`,
        type: 'chart',
        chartType,
        categories: filled.categories,
        series: filled.series.map((s) => ({ name: s.name, values: s.values })),
        title: filled.title,
        numberFormat,
        x: slot.x, y: slot.y, w: slot.w, h: slot.h,
        rotation: 0,
        z: textZ++,
      };
      freeform.push(block);
      continue;
    }

    // 6) Image / image-side: Phase 1 skip. Adding a placeholder here would
    //    ship a broken image reference; leaving it blank is the honest state
    //    until the image-source decision lands.
  }

  return {
    id: `card-native-${slide.index}`,
    layout: 'single',
    style: 'default',
    columns: [],
    freeform,
    structuredCover: slide.index === 0,
    background: { color: theme.ground },
  };
}

// ── Step 5 · generateNativeDeck (orchestrator) ──────────────────────────────

import type { CardTemplate, TemplateTheme } from '@/types/card-template';
import type { Theme } from '@/components/themes/types';
import type { SkillId } from '@/lib/document-skills';
import { fillStructureSlots, type SlideFillContext } from './structure-fill';
import { fitCardText } from './text-fit';
import { runJudgeAndReviseStage } from './slide-gates';
import type { SlideVerdictTrace } from './judge-deck';
import { searchLibrary, type LibraryImage } from '@/lib/imageLibrary';
import { pickForSlot } from './structure-images';
import { listIcons } from '@/data/figmaAssets';
import OpenAI from 'openai';

/** A palette-aware NativeTheme derived from a full Theme record. Extracts a
 *  solid-hex fallback when the source theme uses a gradient for its title (the
 *  captured builder needs a concrete color; gradient rendering is per-block via
 *  style.gradient which the native builder doesn't set in Phase 1). */
function firstHex(css: string): string | undefined {
  const m = css.match(/#([0-9a-f]{3,8})\b/i);
  return m ? `#${m[1]}` : undefined;
}

/** Extract the FIRST family name from a CSS font stack for text-fit's font
 *  loader. Text-fit keys on short names (Inter, Roboto, Fraunces, Work Sans)
 *  because that's how opentype loads bundled TTFs. Passing the full stack
 *  `"'Inter', -apple-system,..."` returned null in the font map — fit then
 *  silently skipped every block. This extractor strips the first quoted
 *  family (or first bare token) so fit can measure. */
function firstFontFamily(stack: string): string {
  const quoted = stack.match(/'([^']+)'|"([^"]+)"/);
  if (quoted) return (quoted[1] ?? quoted[2] ?? '').trim();
  const bare = stack.split(',')[0]?.trim();
  return bare ?? stack;
}

export function buildNativeTheme(theme: Theme): NativeTheme {
  const titleSolid = theme.titleStyle === 'solid' ? theme.titleColor : firstHex(theme.titleColor);
  return {
    ink: theme.bodyColor,
    titleColor: titleSolid ?? theme.bodyColor,
    accent: theme.linkColor,
    ground: theme.pageBg,
    surface: theme.secondaryBg,
    displayFont: firstFontFamily(theme.titleFont),
    bodyFont: firstFontFamily(theme.bodyFont),
  };
}

/** Build a TemplateTheme (the CardTemplate carrier) from the Theme + NativeTheme. */
function buildCarrierTheme(theme: Theme, native: NativeTheme): TemplateTheme {
  return {
    pageBg: native.ground,
    cardBg: native.ground,
    cardBgOpacity: 1,
    cardRadius: 12,
    cardPadding: 0,
    accentColors: theme.chartPalette,
    headingFont: native.displayFont,
    bodyFont: native.bodyFont,
    headingColor: native.titleColor ?? native.ink,
    bodyColor: native.ink,
    archetype: theme.archetype,
  };
}

/** Extract the deck arc from the captured template — one focus line per slide.
 *  Prefers the title slot's `example` (upper-cased); falls back to a role summary
 *  when a slide has no title (dividers, image-only). */
function deriveDeckOutline(template: CapturedTemplate): string[] {
  return template.slides.map((slide) => {
    const title = slide.slots.find((s) => s.role === 'title');
    if (title?.example) return title.example.trim();
    // No title example: describe by writer-fillable roles present on the slide
    const roles = slide.slots.filter((s) => WRITER_ROLES.has(s.role)).map((s) => s.role);
    const uniq = Array.from(new Set(roles));
    return uniq.length ? `Slide ${slide.index + 1} (${uniq.join(', ')})` : `Slide ${slide.index + 1}`;
  });
}

/** Compact purpose line for a single captured slide — feeds the writer's
 *  "THIS SLIDE — ${layoutKey}: ${layoutPurpose}" header. Derived from the
 *  slot mix so the writer knows what shape it's filling. */
function derivePurpose(slide: CapturedSlide): string {
  const writerRoles = slide.slots.filter((s) => WRITER_ROLES.has(s.role)).map((s) => `${s.role}${s.group ? `/${s.group}` : ''}`);
  const hasTable = slide.slots.some((s) => s.role === 'table');
  const hasChart = slide.slots.some((s) => s.role === 'chart');
  const hasImage = slide.slots.some((s) => s.role === 'image' || s.role === 'image-side');
  const extras: string[] = [];
  if (hasTable) extras.push('table');
  if (hasChart) extras.push('chart');
  if (hasImage) extras.push('image');
  const base = writerRoles.length ? `${writerRoles.join(', ')}` : 'divider';
  return extras.length ? `${base} · with ${extras.join(' + ')}` : base;
}

// ── Image selection + placement (tasks 25/26/27) ────────────────────────────

/** Library files are served statically by Next from /library/images/<filename>. */
function librarySrc(img: LibraryImage): string {
  return `/library/images/${img.filename}`;
}

/** Deck-level state: image ids already placed on prior slides, so it doesn't
 *  reuse the same library image across the deck. */
interface DeckImageState {
  used: Set<string>;
  /** Cost gate: cap fresh gpt-image-1 calls per deck. Beyond this, it hides
   *  unfilled image slots rather than run up the bill. */
  genBudget: number;
  /** Rolling generation-cost tally in dollars (for logging). Medium quality
   *  n=1 ≈ $0.04; may vary. */
  genSpentUsd: number;
  /** Absolute origin so a fetch to /api/ai/generate-image works when called
   *  server-side from generateNativeDeck. */
  baseUrl?: string;
  /** Deck title for the generate-image prompt (context, not text-in-image). */
  deckTitle: string;
  /** Deck-level topic string for library queries. */
  topicQuery: string;
  /** Cache: deckPos:slotIndex → picked fill (image OR icon) so the revise
   *  pass doesn't re-run library search / re-generate / re-pick an icon for
   *  the same slot. */
  perSlideCache: Map<string, SlotPick>;
  /** FEATURE FLAG — used to gate generation off by default
   *  because gpt-image-1 base64 data URLs (~1MB) bloated localStorage past its
   *  practical limit. Retained for now so callers can force library-only, but
   *  the DEFAULT is TRUE: the swapped-in picker (`pickForSlot`) saves generated
   *  PNGs to the library and returns a small `/library/images/<file>.png` URL,
   *  so the original localStorage-bloat concern no longer applies. */
  allowGeneration: boolean;
}

// ── Image brief agent ────────────────────────────────────────────────────
// gpt-image-1 interprets its prompt LITERALLY. Handing it the raw user prompt
// ("5-slide investor pitch for a solar-panel startup: mission...") produces
// a mockup of five slides with baked-in gibberish text. The picker's library
// search likewise works best against a concrete photographic subject
// description — not a meta-prompt about a presentation.
//
// This agent writes one image brief per slide, using the writer's filled
// content as context. Output: a single sentence naming a specific,
// photographable subject — no meta-terms (no "slide" / "pitch" / "deck" /
// "presentation" / "cover"), no baked-in text words like "chart" or "table",
// no compositing multiple scenes into one frame. The brief becomes the query
// passed to both library search and gpt-image-1 for this slide.

interface ImageBriefContext {
  slideTitle: string;
  slideBody: string;   // condensed writer-filled body content
  focus: string;
  deckGoal?: string;
  narrativeRole?: string;
  /** R-3 rebias: the previous brief the VLM rejected. When set, the agent is
   *  asked to pick a DIFFERENT visual angle (change composition / subject
   *  emphasis / setting) so the re-picked image isn't a near-duplicate. */
  rejectPreviousBrief?: string;
}

async function writeImageBrief(ctx: ImageBriefContext): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const openai = new OpenAI({ apiKey });
    const rebiasLine = ctx.rejectPreviousBrief
      ? ` The previous brief was REJECTED as off-topic or unsuitable: "${ctx.rejectPreviousBrief.slice(0, 160)}". Pick a DIFFERENT visual angle — different setting, subject emphasis, or scene type. Do NOT repeat the previous subject.`
      : '';
    const system = `You write a single-sentence photographic subject description for a slide illustration. Rules: name ONE concrete, photographable subject (a place, an object, a scene). NO meta-terms — never say "slide", "pitch", "deck", "presentation", "cover", "chart", "graph", "diagram", "icon", "logo", or "text". NO composite scenes — one setting only, not multiple slides in one frame. NO people (portraits generate poorly). Prefer wide/scenic subjects (landscape, infrastructure, technology in situ, workplace details without faces). Include lighting mood if relevant. Return ONLY the sentence — no preamble.${rebiasLine}`;
    const context = [
      `Slide title: ${ctx.slideTitle}`,
      ctx.slideBody ? `Slide content: ${ctx.slideBody.slice(0, 400)}` : null,
      `Slide focus: ${ctx.focus}`,
      ctx.narrativeRole ? `Narrative role: ${ctx.narrativeRole}` : null,
      ctx.deckGoal ? `Deck goal: ${ctx.deckGoal}` : null,
    ].filter(Boolean).join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;
    // Strip any accidental meta-terms just in case the model slipped one in.
    const cleaned = text
      .replace(/^["'`\s]+|["'`\s]+$/g, '')
      .replace(/\b(slide|pitch|deck|presentation|cover|chart|graph|diagram|icon|logo)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned.length > 8 ? cleaned : null;
  } catch {
    return null;
  }
}

// ── Icon picker (recolored SVG fallback) ─────────────────────────────────
// When a captured image slot is too small for a photograph to read (a badge
// or grid mark, roughly ≤ 8 × 10 % of the slide), a cropped photograph looks
// bad. When one of these small slots comes up — OR when a normal-sized photo
// slot can't be filled from the library and generation is exhausted — pick
// an icon from the local figma-assets manifest instead. The icon's SVG uses
// `currentColor`, so setting `color: theme.accent` on the FreeformIconBlock
// recolors it in one step; no per-pick recolor work needed.
//
// Icon-sized threshold: matches the small-image classification the writer
// uses for figma icon-badge layouts (imp-02/03/04/05 have 3×5% slots).
const ICON_SIZED_W_PCT = 8;
const ICON_SIZED_H_PCT = 10;

function isIconSizedSlot(slot: CapturedSlot): boolean {
  return slot.w <= ICON_SIZED_W_PCT && slot.h <= ICON_SIZED_H_PCT;
}

const IconPickSchema = z.object({
  id: z.string(),
  reason: z.string().optional().default(''),
});

/** Ask the LLM to pick one icon whose semantic label best matches the topic.
 *  The manifest carries 96 icons across 10 categories. Fail-open: on any
 *  error, fall back to a deterministic first-not-taken match. */
async function pickIconForSlot(
  query: string,
  taken: Set<string>,
): Promise<{ id: string; label: string; note: string } | null> {
  const icons = listIcons();
  const candidates = icons.filter((i) => !taken.has(`icon:${i.id}`));
  if (candidates.length === 0) return null;
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = (): { id: string; label: string; note: string } => ({
    id: candidates[0].id,
    label: candidates[0].label,
    note: 'first-available (llm unavailable)',
  });
  if (!apiKey) return fallback();
  try {
    const openai = new OpenAI({ apiKey });
    // Compact catalogue: `id · category · label`. Under 4KB even for 96 icons.
    const list = candidates
      .map((i) => `${i.id} · ${i.category} · ${i.label}`)
      .join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        { role: 'system', content: 'You pick the ONE icon whose semantic meaning best matches a slide topic. Return only the icon id from the list — nothing else.' },
        { role: 'user', content: `Topic: ${query.slice(0, 300)}\n\nAvailable icons (id · category · label):\n${list}` },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'pick_icon',
          description: 'Return the chosen icon id.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The chosen icon id (exact match from the list).' },
              reason: { type: 'string', description: 'One phrase.' },
            },
            required: ['id'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'pick_icon' } },
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return fallback();
    const parsed = IconPickSchema.safeParse(JSON.parse(call.function.arguments));
    if (!parsed.success) return fallback();
    const chosen = candidates.find((i) => i.id === parsed.data.id);
    if (!chosen) return fallback();
    return { id: chosen.id, label: chosen.label, note: parsed.data.reason || 'llm-pick' };
  } catch {
    return fallback();
  }
}

/** Discriminated result: a picked image (photo) or a picked icon (vector). */
type SlotPick =
  | { kind: 'image'; src: string; source: 'library' | 'generated'; imageId?: string }
  | { kind: 'icon'; iconId: string; label: string };

/** Pick a fill for THIS slide's image slot. Route:
 *   - icon-sized slot  → icon library (LLM-picked, recolored to theme)
 *   - photo-sized slot → pickForSlot (library rated 1-5, else generate+save);
 *                        on null, fall back to an icon as decoration
 *  Returns null only when both paths fail. */
async function pickImageForCapturedSlot(
  focus: string,
  state: DeckImageState,
  slot: CapturedSlot,
  imageBrief: string | null,
): Promise<SlotPick | null> {
  // Query priority: writer-authored image brief (a proper photographic subject)
  // > slide focus + deck topic (fallback when the brief couldn't be produced).
  // The brief is deliberately used for BOTH library search and generation —
  // the library's stored prompts are photographic-subject strings too, so a
  // better subject brief improves both paths.
  const query = imageBrief && imageBrief.length > 8
    ? imageBrief
    : `${focus} ${state.topicQuery}`.trim();

  // Route icon-sized slots straight to the icon library. A photo cropped
  // to ~3×5% of the slide reads as noise; a recolored pictogram reads as
  // intentional.
  if (isIconSizedSlot(slot)) {
    const icon = await pickIconForSlot(query, state.used);
    if (icon) {
      state.used.add(`icon:${icon.id}`);
      console.log(`[native-deck] icon-pick · ${icon.id} (${icon.label}) · ${icon.note}`);
      return { kind: 'icon', iconId: icon.id, label: icon.label };
    }
    return null;
  }

  // Photo-sized slot — LLM-rated library, else generate + save. Same policy
  // as the structure-fill path.
  const r = await pickForSlot(query, state.used);
  if (r.image) {
    state.used.add(r.image.id);
    const src = `/library/images/${r.image.filename}`;
    const wasGenerated = /^\[generated\]/.test(r.image.prompt ?? '');
    if (wasGenerated) {
      state.genBudget -= 1;
      state.genSpentUsd += 0.04;
    }
    console.log(`[native-deck] image-pick · ${r.note}`);
    return {
      kind: 'image',
      src,
      source: wasGenerated ? 'generated' : 'library',
      imageId: r.image.id,
    };
  }

  // Photo path failed.
  const icon = await pickIconForSlot(query, state.used);
  if (icon) {
    state.used.add(`icon:${icon.id}`);
    console.log(`[native-deck] icon-fallback · ${icon.id} (${icon.label}) · photo path exhausted`);
    return { kind: 'icon', iconId: icon.id, label: icon.label };
  }
  return null;
}

/** Native fill applier — places EITHER a FreeformImageBlock (photo) or a
 *  FreeformIconBlock (recolored vector) at the CAPTURED slot's exact
 *  geometry. Also sets slideDesign.imageRole = 'full-bleed' when a photo
 *  effectively covers the slide, so FreeformLayer paints the legibility
 *  scrim + forces a light text color (same mechanism the Figma path uses). */
function applyCapturedImage(
  card: Card,
  imageSlot: CapturedSlot,
  pick: SlotPick,
  accentColor: string,
): void {
  const isFullBleed = imageSlot.w >= 95 && imageSlot.h >= 95 && imageSlot.x <= 3 && imageSlot.y <= 3;
  const isSideImage = imageSlot.role === 'image-side' || (imageSlot.x >= 40 && imageSlot.w <= 60);
  const block: FreeformBlock = pick.kind === 'image'
    ? ({
        id: `ff-native-img-${imageSlot.role}-${imageSlot.group ?? 'x'}`,
        type: 'image',
        src: pick.src,
        alt: '',
        fit: 'cover' as const,
        x: imageSlot.x,
        y: imageSlot.y,
        w: imageSlot.w,
        h: imageSlot.h,
        rotation: 0,
        z: isFullBleed ? 0 : isSideImage ? 1 : 0,
      } as FreeformBlock)
    : ({
        // Vector pictogram: recolors via `currentColor`, so setting `color`
        // paints the whole icon in theme.accent.
        id: `ff-native-icon-${imageSlot.role}-${imageSlot.group ?? 'x'}`,
        type: 'icon',
        name: `figma:${pick.iconId}`,
        color: accentColor,
        x: imageSlot.x,
        y: imageSlot.y,
        w: imageSlot.w,
        h: imageSlot.h,
        rotation: 0,
        z: 2,
      } as FreeformBlock);
  // If full-bleed, prepend so it renders behind everything.
  const existing = card.freeform ?? [];
  card.freeform = isFullBleed && pick.kind === 'image' ? [block, ...existing] : [...existing, block];

  if (isFullBleed && pick.kind === 'image') {
    // Clear explicit text colors so FreeformLayer's scrim can force a light
    // color over the photo (same trick applyCoverImage uses on the Figma path).
    for (const b of card.freeform) {
      if (b.type === 'text' && b.style) b.style = { ...b.style, color: undefined };
    }
    // Stamp slideDesign so the renderer knows to paint the legibility scrim.
    const base: NonNullable<Card['slideDesign']> = card.slideDesign ?? {
      slideId: card.id,
      role: 'cover',
      contentBudget: { headingMaxWords: 12, bodyMaxWords: 40 },
      themeArchetype: 'editorial',
      source: 'auto',
      imageRole: 'none',
      textSafeZone: 'full',
    };
    card.slideDesign = { ...base, imageRole: 'full-bleed', textSafeZone: 'full' };
  }
}

/** Public orchestrator: given a prompt + captured-template id, produce a
 *  filled CardTemplate. Two stages:
 *    (1) PLAN — planCapturedDeck agentically picks which captured slides
 *        to use, in what order, with per-slide focus grounded in the topic.
 *        This replaces the earlier all-20-slides-in-captured-order behavior.
 *    (2) EXECUTE — for each planned slide, run the writer against the
 *        captured slot specs, build the card, apply text-fit. Deterministic
 *        matching — the plan already decided WHAT goes where.
 *
 *  Downstream gates (judgeCard, visual critic, revise) not wired yet. */
export async function generateNativeDeck(opts: {
  prompt: string;
  skinId: string;
  themeRecord: Theme;
  sourceText?: string;
  standalone?: boolean;
  density?: string;
  rewriteIntensity?: string;
  audience?: string;
  tone?: string;
  voice?: SkillId | null;
  /** Client-picked slide count. Passed to the plan agent as a hard hint. */
  cardCountHint?: number;
  /** Server origin — required for the visual critic's headless slide render.
   *  Absent → the critic + revise loop are skipped (deck ships un-judged). */
  baseUrl?: string;
  /** Toggle the shared judge+revise stage on/off. Default: on when baseUrl
   *  is set. Skipping is only for the tightest smoke tests. */
  judge?: boolean;
  /** Fired ONCE before any writer call. Emits the skeleton the client uses
   *  to render placeholders while slides fill in. */
  onBlueprintReady?: (blueprint: { cards: { id: string; title: string; layout: string; style: string }[]; theme: TemplateTheme; slideCount: number }) => void;
  /** Fired per slide as its card assembles. `total` supplied so the client
   *  can render a per-slide progress indicator. */
  onSlideReady?: (index: number, card: Card, total: number) => void;
  /** Fired after every slide's judge verdict lands (including revise pass). */
  onSlideJudged?: (trace: SlideVerdictTrace) => void;
  /** SILENT agent memory. Client-scored prior decks whose shape matches this
   *  request. Fed into the plan agent's Phase 0 context. Shape only (arc,
   *  layouts, angle, audience, tone) — NEVER carries content. Never surfaced
   *  to the user. */
  priorDecks?: PriorDeckShape[];
}): Promise<CardTemplate> {
  const captured = loadCapturedTemplate(opts.skinId);
  const native = buildNativeTheme(opts.themeRecord);
  const carrier = buildCarrierTheme(opts.themeRecord, native);

  // ── STAGE 1 · PLAN ────────────────────────────────────────────────────
  // R-0.7 preamble: writer-authored brief. Runs BEFORE the planner so that
  // layout picks serve concrete content shapes (not the other way around).
  // Fail-open — a null return lets the planner fall back to its monolithic
  // 5-phase reasoning.
  // eslint-disable-next-line no-console
  console.log(`[native-deck] START id=${opts.skinId} · brief...`);
  const { writeDeckBrief } = await import('./deck-brief');
  const effectiveCount = extractExplicitSlideCount(opts.prompt) ?? (opts.cardCountHint && opts.cardCountHint > 0 ? opts.cardCountHint : undefined);
  const brief = await writeDeckBrief({
    prompt: opts.prompt,
    sourceText: opts.sourceText,
    standalone: opts.standalone,
    effectiveCount,
    audience: opts.audience,
    tone: opts.tone,
    density: opts.density,
  });
  if (brief) {
    // eslint-disable-next-line no-console
    console.log(`[native-deck] brief · goal="${brief.deckGoal.slice(0, 80)}" · arc=[${brief.narrativeArc.join('→')}] · ${brief.slideIntentions.length} slides`);
    for (const [i, s] of brief.slideIntentions.entries()) {
      // eslint-disable-next-line no-console
      console.log(`[native-deck]   #${i + 1} "${s.title}" · shape="${s.intendedContentType.slice(0, 80)}"${s.keyPoints.length ? ` · ${s.keyPoints.length} key point(s)` : ''}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[native-deck] brief · unavailable (fallback to monolithic planner)');
  }

  // eslint-disable-next-line no-console
  console.log(`[native-deck] planning...`);
  if (opts.priorDecks && opts.priorDecks.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[native-plan-memory] using ${opts.priorDecks.length} prior deck(s) as silent context: ${opts.priorDecks.map((p) => `"${p.name}"`).join(', ')}`);
  }
  const deckPlan = await planCapturedDeck(opts.prompt, captured, {
    sourceText: opts.sourceText,
    standalone: opts.standalone,
    cardCountHint: opts.cardCountHint,
    audience: opts.audience,
    tone: opts.tone,
    density: opts.density,
    priorDecks: opts.priorDecks,
    brief,
  });
  const plan = deckPlan.slides;
  const { deckGoal } = deckPlan;
  const total = plan.length;
  // Deck-arc outline for the writer's context = the plan's focuses in order.
  const outline = plan.map((p) => p.focus);

  // Blueprint — reflects only the PLANNED slides, not all 20 captured.
  opts.onBlueprintReady?.({
    theme: carrier,
    slideCount: total,
    cards: plan.map((p, i) => {
      const slide = captured.slides[p.capturedIndex];
      return {
        id: `card-native-${i}`,
        title: (slide.slots.find((s) => s.role === 'title')?.example ?? `Slide ${i + 1}`).trim(),
        layout: 'single',
        style: 'default',
      };
    }),
  });

  // ── Deck-level image state (tasks 25/26/27) ─────────────────────────
  // Library-first per-slot selection with deck-level dedup + a bounded
  // generation budget for slots the library can't fill. Cost gate: no more
  // than MAX_GEN_IMAGES_PER_DECK generation calls per deck (≈$0.04 each).
  const MAX_GEN_IMAGES_PER_DECK = 5;
  const imageState: DeckImageState = {
    used: new Set<string>(),
    genBudget: MAX_GEN_IMAGES_PER_DECK,
    genSpentUsd: 0,
    baseUrl: opts.baseUrl,
    deckTitle: deckPlan.deckTitle,
    topicQuery: opts.prompt.slice(0, 200),
    perSlideCache: new Map(),
    // Generation is ON: pickForSlot (PR #73) saves each generated PNG to the
    // library and returns a `/library/images/<file>.png` URL, so the original
    // localStorage-bloat concern (data URLs in the persisted deck) no longer
    // applies. The generation budget (MAX_GEN_IMAGES_PER_DECK) still caps cost.
    allowGeneration: true,
  };

  // R-3: per-slide map of rejected briefs from the previous pass. When the
  // VLM emits `change: 'reject-image'` on a slide, the imageReject callback
  // stores the old brief here so the next writeImageBrief call gets a
  // "different visual angle" instruction. Cleared implicitly by scope
  // (per-generation state, no reset needed).
  const rejectedBriefByPos = new Map<number, string>();
  // Track the LAST brief actually used per slide (needed so imageReject knows
  // what to reject when it rebuilds). Populated inside buildOneSlide right
  // after the brief is computed.
  const lastBriefByPos = new Map<number, string>();

  // ── STAGE 2 · EXECUTE ────────────────────────────────────────────────
  // Per-slide build closure — reused by both the initial build loop AND
  // the shared judge/revise stage's rebuildSlide callback (so a revised
  // slide gets the same fill+fit treatment as its first pass).
  const buildOneSlide = async (deckPos: number, feedback?: string[]): Promise<Card> => {
    const planEntry = plan[deckPos];
    const slide = captured.slides[planEntry.capturedIndex];
    const specs = describeCapturedSlots(slide, captured.canvas);
    const dataSpecs = describeCapturedDataSlots(slide);
    const purpose = derivePurpose(slide);
    const focus = planEntry.focus;

    let fillResult: SlotFillResult = { text: {}, charts: [], tables: [] };
    if (specs.length > 0 || dataSpecs.charts.length > 0 || dataSpecs.tables.length > 0) {
      const ctx: SlideFillContext = {
        index: deckPos,
        total,
        layoutKey: `native-slide-${planEntry.capturedIndex}`,
        layoutPurpose: purpose,
        focus,
        deckOutline: outline,
        topic: opts.prompt,
        sourceText: opts.sourceText,
        standalone: opts.standalone,
        density: opts.density,
        rewriteIntensity: opts.rewriteIntensity,
        audience: opts.audience,
        tone: opts.tone,
        voice: opts.voice ?? null,
        feedback,
        // Phase B editorial brief passthrough — writer uses hero/callouts/angle
        // to place content editorially (hero → anchor slot; callouts → explicit
        // prose call-outs with deltas; angle → voice/framing).
        hero: planEntry.hero,
        callouts: planEntry.callouts,
        angle: planEntry.angle,
        // Phase C — cross-reference inferences. GATED by rewriteIntensity:
        // verbatim mode strips them (source-only content); build/inspire
        // surface them (writer weaves the hedged inference into prose).
        crossRefs: opts.rewriteIntensity === 'verbatim' ? [] : planEntry.crossRefs,
        // Phase D — HOLISTIC VIEW passthrough. Deck-level goal + this slide's
        // narrative role + neighbors' focus lines. Shapes the writer's prose
        // so a "cause" slide names the cause explicitly, a "consequence"
        // slide references what caused it, etc. Prevents floating-fact slides.
        deckGoal,
        narrativeRole: planEntry.narrativeRole,
        arcContext: {
          prev: deckPos > 0 ? plan[deckPos - 1].focus : undefined,
          next: deckPos < plan.length - 1 ? plan[deckPos + 1].focus : undefined,
        },
      };
      try {
        fillResult = await fillStructureSlots(ctx, opts.skinId, specs, dataSpecs);
      } catch (e) {
        console.log(`[native-deck] slide ${deckPos} fill FAILED: ${e instanceof Error ? e.message : e}`);
        fillResult = { text: {}, charts: [], tables: [] };
      }
    }

    const card = buildCapturedCard(slide, fillResult.text, native, total, deckPos, {
      charts: fillResult.charts,
      tables: fillResult.tables,
    });
    card.id = `card-native-${deckPos}`;
    card.structuredCover = deckPos === 0;

    // ── Image brief — computed ONCE per slide from the writer's actual
    // filled content. Skipped when the slide has no photo-sized image slot
    // (icon slots don't use the brief; they LLM-select by icon-label match).
    // Fires only when at least one photo slot exists so a text-only slide
    // doesn't pay for a wasted brief call.
    const hasPhotoSlot = slide.slots.some(
      (s) => (s.role === 'image' || s.role === 'image-side') && !isIconSizedSlot(s),
    );
    let imageBrief: string | null = null;
    if (hasPhotoSlot) {
      // Condense the writer's output into a short body summary for the brief.
      // Pick the longest few body values (the substantive writer content) and
      // join, capped at ~400 chars so the brief call stays cheap.
      const bodies = Object.values(fillResult.text)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 15)
        .sort((a, b) => b.length - a.length)
        .slice(0, 3)
        .join(' ');
      const title = (slide.slots.find((s) => s.role === 'title')?.example ?? '') as string;
      imageBrief = await writeImageBrief({
        slideTitle: (fillResult.text[`title:${slide.slots.find((s) => s.role === 'title')?.group ?? ''}:0`] as string | undefined) ?? title,
        slideBody: bodies,
        focus,
        deckGoal,
        narrativeRole: planEntry.narrativeRole,
        // R-3 rebias: if this slide had an image rejected on a prior pass,
        // pass the rejected brief so the agent picks a different angle.
        rejectPreviousBrief: rejectedBriefByPos.get(deckPos),
      });
      if (imageBrief) {
        console.log(`[native-deck] slide ${deckPos} image-brief · "${imageBrief.slice(0, 120)}"`);
        // Track the brief so the R-3 imageReject callback can log what it's
        // rejecting AND pass it back to writeImageBrief as the rebias hint.
        lastBriefByPos.set(deckPos, imageBrief);
      }
    }

    // ── Image slots — icon-sized slots pick from the recolorable vector
    // manifest; larger slots try the library-rated + gen-with-save picker,
    // and fall back to an icon-as-decoration if that returns nothing.
    // Per-slide cache prevents the revise pass from re-picking / re-generating.
    for (let si = 0; si < slide.slots.length; si += 1) {
      const s = slide.slots[si];
      if (s.role !== 'image' && s.role !== 'image-side') continue;
      const cacheKey = `${deckPos}:${si}`;
      let picked = imageState.perSlideCache.get(cacheKey);
      if (!picked) {
        const fresh = await pickImageForCapturedSlot(focus, imageState, s, imageBrief);
        if (fresh) {
          picked = fresh;
          imageState.perSlideCache.set(cacheKey, fresh);
        }
      }
      if (!picked) {
        console.log(`[native-deck] slide ${deckPos} image-slot ${s.role}/${s.group ?? ''} · no fill (photo + icon both empty) → hidden`);
        continue;
      }
      applyCapturedImage(card, s, picked, native.accent);
      const label = picked.kind === 'image'
        ? `${picked.source}${picked.imageId ? ' id=' + picked.imageId : ''}`
        : `icon:${picked.iconId}`;
      console.log(`[native-deck] slide ${deckPos} image-slot ${s.role}/${s.group ?? ''} · ${label}${feedback?.length ? ' (cached)' : ''}`);
    }

    const fitNotes = fitCardText(card);
    const shrunk = fitNotes.filter((n) => n.toSize < n.fromSize).length;
    const trimmed = fitNotes.filter((n) => n.shortened === true).length;
    const overflow = fitNotes.filter((n) => n.overflow === true).length;
    const filledKeys = Object.keys(fillResult.text).length;
    // eslint-disable-next-line no-console
    console.log(`[native-deck] slide ${deckPos}/${total - 1} · captured=#${planEntry.capturedIndex} · specs=${specs.length} filled=${filledKeys} blocks=${card.freeform?.length ?? 0} · charts=${fillResult.charts.length}/${dataSpecs.charts.length} tables=${fillResult.tables.length}/${dataSpecs.tables.length} · fit shrunk=${shrunk} trimmed=${trimmed} overflow=${overflow}${feedback?.length ? ' (revised)' : ''}`);

    // ── SEARCH METADATA (backend-only, not rendered on the slide) ────────
    // Stamped from what it already knows at this point: the plan agent's
    // narrative role + angle + audience + tone, the layout id, and simple
    // keyword/entity extraction from the slide's actual text. Powers the
    // cross-deck slide-search UX and the plan agent's silent prior-decks
    // memory. Rule: identity/shape signals only — never persist facts here
    // that a future deck might reuse (FR11).
    card.metadata = extractSlideMetadata(card, {
      narrativeRole: planEntry.narrativeRole,
      angle: planEntry.angle,
      audience: opts.audience,
      tone: opts.tone,
      layoutId: `native-slide-${planEntry.capturedIndex}`,
      deckGoal,
    });
    return card;
  };

  const cards: Card[] = [];
  for (let deckPos = 0; deckPos < plan.length; deckPos += 1) {
    const card = await buildOneSlide(deckPos);
    cards.push(card);
    opts.onSlideReady?.(deckPos, card, total);
  }
  // eslint-disable-next-line no-console
  console.log(`[native-deck] images · library=${imageState.used.size} generated=${MAX_GEN_IMAGES_PER_DECK - imageState.genBudget} spent=$${imageState.genSpentUsd.toFixed(2)}`);

  // ── STAGE 3 · SHARED JUDGE + REVISE ──────────────────────────────────
  // Same gate the Figma path uses. Fires when baseUrl is set and judge
  // hasn't been explicitly disabled. Mutates `cards` in place if revisions
  // land, so the final template picks up the revised versions below.
  const judgeEnabled = opts.judge !== false && !!opts.baseUrl;
  if (judgeEnabled && opts.baseUrl) {
    // Layout keys: recomputed on each pass (they change when swapLayout swaps
    // a slide's capturedIndex mid-loop). Passed by reference via a closure —
    // the gate only reads them for VLM context / log labels.
    const layoutKeys = plan.map((p) => `native-slide-${p.capturedIndex}`);

    // ── SWAP-LAYOUT CALLBACK ────────────────────────────────────────────
    // Owned by the plan agent. When the judge flags a slide as too empty (or
    // wrong shape), it asks the plan agent — the single owner of "which
    // layout fits what content" — to re-pick a layout for THIS one slide
    // given the ACTUAL text it produced. Then rebuild the slide against the
    // new layout via the existing buildOneSlide.
    const swapLayoutForNative = async (deckPos: number, judgeReason: string): Promise<Card | null> => {
      const planEntry = plan[deckPos];
      const oldIdx = planEntry.capturedIndex;
      const oldCard = cards[deckPos];
      // Extract actual text produced (writer-fillable text blocks only —
      // skip decorations, images, slide-numbers).
      const actualText = (oldCard.freeform ?? [])
        .filter((b) => b.type === 'text' && !b.id.includes('slide-num') && !b.id.includes('deco'))
        .map((b) => (b as { content?: string }).content ?? '')
        .join(' ')
        .trim();
      if (!actualText) {
        console.log(`[native-swap] slide ${deckPos}: no text to reason about — skip swap`);
        return null;
      }
      // Allowed layouts: every captured layout NOT currently used by another
      // slide (avoid duplicate layouts in the deck). Current index stays
      // eligible so the picker can compare; swapLayoutForSlide excludes it.
      const usedElsewhere = new Set(plan.filter((_, i) => i !== deckPos).map((p) => p.capturedIndex));
      const allowedIdxs = Array.from({ length: captured.slides.length }, (_, i) => i)
        .filter((i) => !usedElsewhere.has(i));
      if (allowedIdxs.length < 2) {
        console.log(`[native-swap] slide ${deckPos}: only ${allowedIdxs.length} layout(s) available — skip swap`);
        return null;
      }
      try {
        const pick = await swapLayoutForSlide({
          prompt: opts.prompt,
          planEntry,
          actualText,
          currentIdx: oldIdx,
          allowedIdxs,
          judgeReason,
        });
        if (pick.capturedIndex === oldIdx) {
          console.log(`[native-swap] slide ${deckPos}: picker returned same index — skip`);
          return null;
        }
        // Mutate the plan so subsequent revise passes see the new index.
        planEntry.capturedIndex = pick.capturedIndex;
        layoutKeys[deckPos] = `native-slide-${pick.capturedIndex}`;
        console.log(`[native-swap] slide ${deckPos}: #${oldIdx} → #${pick.capturedIndex} — ${pick.reason}`);
        // Rebuild the slide in the new layout. Feedback = the judge's reason
        // so the writer knows why it's being re-filled.
        const rebuilt = await buildOneSlide(deckPos, [`Layout swapped from #${oldIdx} to #${pick.capturedIndex} because: ${judgeReason}. Fill for the new layout's slots.`]);
        return rebuilt;
      } catch (e) {
        console.log(`[native-swap] slide ${deckPos}: error ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };

    // ── IMAGE-REJECT CALLBACK (R-3) ─────────────────────────────────────
    // When the VLM emits `change: 'reject-image'` on image block(s), clear
    // the cached pick(s), stash the previous brief as a rebias hint, and
    // rebuild the slide. buildOneSlide will re-compute the brief (with the
    // rebias hint in play) and re-pick the images for the cleared slots.
    const imageRejectForNative = async (deckPos: number, blockIds: string[], judgeReason: string): Promise<Card | null> => {
      const planEntry = plan[deckPos];
      const slide = captured.slides[planEntry.capturedIndex];
      // Map each block id back to its slotIndex to clear the cache.
      const clearedSlots: number[] = [];
      for (const blockId of blockIds) {
        // Block ids emitted by applyCapturedImage:
        //   photo: `ff-native-img-${role}-${group ?? 'x'}`
        //   icon:  `ff-native-icon-${role}-${group ?? 'x'}`
        // it only rejects photos (icons are LLM-picked already).
        const m = blockId.match(/^ff-native-img-([^-]+)-(.+)$/);
        if (!m) continue;
        const [_full, role, groupOrX] = m;
        void _full;
        const group = groupOrX === 'x' ? undefined : groupOrX;
        const slotIndex = slide.slots.findIndex(
          (s) => s.role === role && (s.group ?? undefined) === group,
        );
        if (slotIndex < 0) continue;
        imageState.perSlideCache.delete(`${deckPos}:${slotIndex}`);
        clearedSlots.push(slotIndex);
      }
      if (clearedSlots.length === 0) {
        console.log(`[native-reject-image] slide ${deckPos}: no matching image blocks — skip`);
        return null;
      }
      // Stash the previous brief so writeImageBrief picks a different angle.
      const prevBrief = lastBriefByPos.get(deckPos);
      if (prevBrief) rejectedBriefByPos.set(deckPos, prevBrief);
      console.log(`[native-reject-image] slide ${deckPos}: cleared ${clearedSlots.length} slot(s) [${clearedSlots.join(',')}] · rebias="${prevBrief?.slice(0, 60) ?? '(no prior brief)'}" · vlm="${judgeReason.slice(0, 80)}"`);
      try {
        const rebuilt = await buildOneSlide(deckPos);
        return rebuilt;
      } catch (e) {
        console.log(`[native-reject-image] slide ${deckPos}: rebuild error ${e instanceof Error ? e.message : e}`);
        return null;
      }
    };

    const gateResult = await runJudgeAndReviseStage({
      cards,
      layoutKeys,
      // Pass the real affordance description so content-judge's
      // `layout-match` grades a meaningful shape ("3-column narrative grid…"),
      // not a fabricated `native-slide-N` it can't resolve. Reads the CURRENT
      // capturedIndex (may have been swap-layout mutated), not a stale copy.
      blockTemplateFor: (i) => SLIDE_AFFORDANCES[plan[i]?.capturedIndex ?? -1],
      theme: carrier,
      baseUrl: opts.baseUrl,
      rebuildSlide: (index, feedback) => buildOneSlide(index, feedback),
      swapLayout: swapLayoutForNative,
      imageReject: imageRejectForNative,
      topic: opts.prompt,
      sourceText: opts.sourceText,
      audience: opts.audience,
      tone: opts.tone,
      density: opts.density,
      onSlideJudged: opts.onSlideJudged,
      // eslint-disable-next-line no-console
      log: (stage, detail) => console.log(`[native-deck] ${stage}${detail ? ` · ${detail}` : ''}`),
    });
    // eslint-disable-next-line no-console
    console.log(`[native-deck] gates · judged=${gateResult.judgedCount}/${cards.length} fails=${gateResult.judgeFailCount} revised=${gateResult.revisedCount} · judgeMs=${gateResult.judgeMs} reviseMs=${gateResult.reviseMs}`);
  } else if (!opts.baseUrl) {
    console.log('[native-deck] judge SKIPPED · no baseUrl provided');
  }

  const template: CardTemplate = {
    id: `native-${opts.skinId}-${Math.round(Math.random() * 1e9).toString(36)}`,
    // Deck title from the plan agent — a real prompt-grounded name, not the
    // theme label. Falls back to the theme name only if the agent returned
    // an empty title (validation upstream shouldn't allow this).
    name: deckPlan.deckTitle.trim() || opts.themeRecord.name,
    description: opts.prompt,
    category: opts.themeRecord.category,
    thumbnail: '',
    theme: carrier,
    themeId: opts.skinId,
    cards,
  };
  // eslint-disable-next-line no-console
  console.log(`[native-deck] DONE "${template.name}" cards=${cards.length}`);
  return template;
}
