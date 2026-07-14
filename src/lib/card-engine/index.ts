/**
 * Card Engine — intelligence layer for card-based content generation.
 *
 * Similar to Atlas Engine (compare feature), this engine understands
 * the user's intent before generating. Instead of throwing a raw prompt
 * at the AI, it classifies, structures, and generates in stages.
 *
 * Pipeline: Classify → Structure → Generate → Assemble
 */

import { getProvider, getModel, type ToolUseBlock } from '@/lib/ai-provider';
import { z } from 'zod';
import type { CardTemplate, Card, CardBlock, TemplateTheme } from '@/types/card-template';
import { buildSkillVoiceInstructions, type SkillId } from '@/lib/document-skills';
import {
  ContentClassificationSchema,
  CardBlueprintSchema,
  GeneratedCardSchema,
  type ContentClassification,
  type CardBlueprint,
  type GeneratedCard,
  type BlockTemplate,
} from './types';
import {
  planDeck,
  selectImageBudget,
  resolveImageRole,
} from './planner';
import { CLASSIFY_TOOL, GENERATE_CARD_TOOL } from './generation-tools';
import { DEFAULT_ARCHETYPE } from './recipes';
import { critiqueCard, critiqueDeck } from './critique';
import type { DeckPlan, SlideDesign, ContentBudget } from './design-types';
import { checkCardQuality, stripUngroundedStats, stripMarkdownBleed } from './enforce';
import { judgeCard, isJudgeEnabled } from './judge';
import {
  scaleBudgetForDensity,
  PRESENTATION_VOICE,
  GROUNDING,
  HEADING_RULE,
  BODY_TEXT_RULE,
  perspectiveRule,
  IMAGE_JUDGMENT,
  designStandardBlock,
} from './slide-standard';

// ── Stage 1: Classify ─────────────────────────────────────────────────────
// Understands: What goal is the user trying to achieve?
// Who is the audience? What structure serves this goal best?

// ── Pipeline flow logging (dev-only, content-free) ───────────────────────────
// Greppable stage trace so the generation flow is observable in the dev log:
//   grep '\[pipeline\]'  →  classify → blueprint → grounding-guard → plan-deck
//   → generate → enforce×N → generate-done → assemble → done
// Stage names + counts + timings + layout identifiers ONLY — never prompt or
// card content (Security: no user data in logs). Silent in production.
const PIPELINE_LOG = process.env.NODE_ENV !== 'production';
function pipelineLog(stage: string, detail?: string): void {
  if (!PIPELINE_LOG) return;
  console.log(`[pipeline] ${stage}${detail ? ` · ${detail}` : ''}`);
}

// AC8 handover-log schema (additive instrumentation, 2026-06-11). One decision-level
// line per stage handover, on both paths; the unhappy branch is distinctly tagged
// (`[handover!]` + warn level) so it is greppable. Names/counts only — no slide content.
export function handoverLog(
  stage: string,
  received: string,
  decided: string,
  passedOn: string,
  reason?: string,
): void {
  if (!PIPELINE_LOG) return;
  const base = `${stage} | received: ${received} | decided: ${decided} | passed-on: ${passedOn}`;
  if (reason) console.warn(`[handover!] ${base} | reason: ${reason}`);
  else console.log(`[handover] ${base}`);
}

export async function classifyContent(
  prompt: string,
  docType: string,
  fileContent?: string | null,
  targetCardCount?: number,
): Promise<ContentClassification> {
  const provider = getProvider();

  const classifyPrompt = `You are a content strategist. Analyze this request and determine what the user is trying to achieve.

USER REQUEST: "${prompt}"
${fileContent ? `\nREFERENCE MATERIAL (first 2000 chars):\n${fileContent.slice(0, 2000)}` : ''}
FORMAT: ${docType}${targetCardCount ? `\nTARGET SLIDE COUNT: exactly ${targetCardCount} slides. Produce exactly ${targetCardCount} sections — no more, no fewer. The user picked this count and it is a HARD requirement.` : ''}

Think about:
1. What GOAL is this user trying to achieve? (inform, persuade, educate, sell, plan, document)
2. Who will READ this and what do they care about?
3. What SECTIONS does this content need to achieve that goal?
4. What VISUAL LAYOUTS best serve each section's purpose?

SCOPE RULE — read the request carefully:
- If the user EXPLICITLY LISTS topics (phrases like "cover X, Y, and Z" / "include sections for A, B, C" / "topics: ..."), produce EXACTLY those sections in the order given. Do NOT invent additional sections, welcomes, summaries, or appendices the user didn't ask for.
- If the user describes a topic at a high level without listing what to cover, you may infer the section structure — but stay conservative. Pick the smallest section count that delivers the goal (often 5-7, not 10-12).
- If the user gives a specific card count, never exceed it.

WEAK INPUT HANDLING — when the prompt is sparse:
- Sparse means: under ~15 words, OR no specific facts (numbers, names, audience details), OR no concrete subject beyond a topic noun.
- For sparse prompts, default to the SMALLEST useful section count (3-5, never more), and write each section's "purpose" as a SCAFFOLD — explicitly note what would need to be added (e.g. "framing — author to insert specifics on competitive positioning").
- A sparse prompt should produce a deck OUTLINE the user fills in, NOT finished generic content pretending to be specific. Generic finished content is worse than an honest scaffold.

HEADING RULE: avoid evaluative-adjective opens. The following are forbidden as the first word of a section title: "Strong", "Comprehensive", "Strategic", "Proven", "Robust", "Dynamic", "Powerful", "Innovative". Use specific noun phrases that name what the section IS (the subject), not what it's like (the quality). "Q4 Revenue Performance" is good. "Strong Revenue Performance" is bad.

ROLE DETECTION (REQUIRED — produces speakerRole + audienceRole):
- Read the prompt to identify WHO is speaking and WHO is being spoken to. These are different concepts than the looser "audiences" array.
- speakerRole = the entity authoring this deck. Often "the founder", "the customer success team", "the seller", "the new hire's manager", "the product team". The owner of the talking points.
- audienceRole = who reads this deck. Often "internal team alignment", "external customer / prospect", "investor", "new hire", "executive leadership". Different from describing the audience demographically.
- These can be subtle. Worked examples:
  * "Customer success kickoff for $250K enterprise account" → speakerRole = "the customer success team at our company", audienceRole = "internal CS team aligning on this account engagement". NOT "the customer."
  * "Series A pitch for an AI legal tech startup" → speakerRole = "the founder", audienceRole = "Series A investor".
  * "Onboarding deck for new sales hires" → speakerRole = "sales leadership / hiring manager", audienceRole = "new sales hire (internal)".
  * "Q4 earnings deck for institutional investors" → speakerRole = "CFO / company leadership", audienceRole = "institutional investor (external)".
- If you can't tell, write your best inference with a "(inferred)" note. Don't leave blank.

For each section, choose the layout that best serves its content:
- "single" — full-width text, good for detailed content
- "split-left" — image/accent left + content right, good for hero/intro cards
- "split-right" — content left + accent right, good for closing/CTA cards
- "three-col" — three equal columns, good for comparisons

TEMPLATE SELECTION (CRITICAL):
For each section, pick exactly ONE template that best serves its content. This is a HARD requirement — every section MUST have a template. Do NOT default to paragraph-content unless the section is genuinely a wall of explanation with no metrics, comparisons, lists, or quotes.

Available templates and when to pick each:
- "cover-minimal" — first card only, when a clean big-title cover is wanted (no subtitle).
- "cover-subtitle" — first card only, when title + one supporting line is wanted.
- "hero-title" — early intro card with title + paragraph + optional tags. Sets the stage.
- "agenda" — overview/table-of-contents slide listing what's coming. Usually card 2.
- "paragraph-content" — narrative explanation. Use ONLY when content is genuinely prose, no list/metric/comparison structure available.
- "bullet-list" — discrete action items or key points, 3-6 short items.
- "key-metric-trio" — exactly 3 numbers/metrics to highlight. Use whenever section is "by the numbers" or "results so far" with 3 stats.
- "key-metric-quad" — exactly 4 numbers to highlight.
- "grid-2x2" — 4 concepts/features/pillars with icon + heading + body each.
- "grid-1x3" — 3 concepts/features/pillars with icon + heading + body each.
- "comparison-2col" — comparing 2 options/products/approaches side by side.
- "features-grid" — 4-6 product features with icons + descriptions.
- "timeline" — sequential phases or milestones with dates/order.
- "process-horizontal" — 3-5 stage workflow or how-it-works steps.
- "icon-list" — 3-5 itemized items where icons add scannability.
- "callout-list" — 2-3 items plus a key insight/decision callout.
- "quote-pull" — featuring a customer/expert/leader quote.
- "toggles" — FAQ or expandable detail items.
- "chapter-divider" — section break between thematic groups of cards.
- "summary-takeaways" — closing card with 3 key takeaways (✓ check icons).
- "cta-closing" — final card with action items + owner/deadline.

VARIETY RULE: Across the deck, AT LEAST half the cards should NOT be paragraph-content. If you find yourself picking paragraph-content for >50% of cards, you're being lazy — look at what each section is REALLY trying to show (numbers? options? steps? a quote?) and pick the matching template.

Respond with ONLY valid JSON matching this schema:
{
  "contentType": "pitch|guide|report|brief|proposal|educational|creative",
  "suggestedCardCount": <number 3-15>,
  "sections": [
    {
      "title": "<section title — specific noun phrase, no evaluative-adjective opens>",
      "purpose": "<what this section achieves for the user's goal; for sparse prompts, write as a scaffold noting what's missing>",
      "suggestedLayout": "single|split-left|split-right|three-col",
      "template": "<one of the templates above — pick the BEST fit for the section's content>"
    }
  ],
  "audiences": ["<specific audience description 1>", "<specific audience description 2>"],
  "tones": ["<vivid tone description 1>", "<vivid tone description 2>"],
  "speakerRole": "<who authors this deck — see ROLE DETECTION above>",
  "audienceRole": "<who reads this deck — see ROLE DETECTION above>"
}

Be specific. "Executive Summary" is bad. "Hook the reader with the key outcome in 10 seconds" is good.`;

  // Forced tool call — on OpenAI this is Structured Outputs strict mode, which
  // enforces the contentType/suggestedLayout/template enums the prompt only
  // describes (free-text JSON let gpt-4o drift off-enum and broke generation).
  const response = await provider.createMessage({
    model: getModel(),
    max_tokens: 4000,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'report_classification' },
    messages: [{ role: 'user', content: classifyPrompt }],
  });

  const toolUse = response.content.find(
    (b): b is ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) throw new Error('No classification tool_use response');

  // gpt-4o's strict tool schema can't express min/max/minItems (OpenAI strips
  // those keywords), so an otherwise-valid response may carry suggestedCardCount
  // outside [3,15] or fewer than 2 audiences/tones — which would make .parse
  // throw and abort the ENTIRE deck. Coerce into the schema's bounds before
  // validating (coerce-don't-throw, matching the rest of the AI seam).
  const raw = (toolUse.input ?? {}) as Record<string, unknown>;
  const cnt = typeof raw.suggestedCardCount === 'number' ? raw.suggestedCardCount : 6;
  raw.suggestedCardCount = Math.min(15, Math.max(3, Math.round(cnt)));
  const pad2 = (v: unknown, fallback: readonly string[]): string[] => {
    const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    while (arr.length < 2) arr.push(fallback[arr.length] ?? fallback[0]);
    return arr;
  };
  raw.audiences = pad2(raw.audiences, ['General audience', 'Stakeholders']);
  raw.tones = pad2(raw.tones, ['Professional', 'Clear']);
  return ContentClassificationSchema.parse(raw);
}

// ── Stage 2: Structure ────────────────────────────────────────────────────
// Maps classification into a concrete card blueprint — which cards,
// which layouts, which block types in each position.

export function structureCards(classification: ContentClassification, targetCardCount?: number): CardBlueprint {
  // Hard-enforce the user-requested count post-classification — Claude
  // occasionally overshoots even with the explicit instruction in the
  // classifier prompt. Truncate by middle-sampling (keeps intro + conclusion
  // bookends), expand by padding with varied templates so extras don't all
  // collapse to paragraph slides. UAT-found 2026-05-24: user asked for 3
  // slides and got 7. This guarantees the contract.
  let workingSections = classification.sections;
  if (targetCardCount && targetCardCount > 0 && workingSections.length !== targetCardCount) {
    if (workingSections.length > targetCardCount) {
      if (targetCardCount === 1) {
        workingSections = [workingSections[0]];
      } else if (targetCardCount === 2) {
        workingSections = [workingSections[0], workingSections[workingSections.length - 1]];
      } else {
        const intro = workingSections[0];
        const conclusion = workingSections[workingSections.length - 1];
        const middle = workingSections.slice(1, -1);
        const middleNeeded = targetCardCount - 2;
        const middlePicked = middleNeeded >= middle.length
          ? middle
          : middle.filter((_, i) => Math.round((i / middle.length) * middleNeeded) !==
                                    Math.round(((i - 1) / middle.length) * middleNeeded));
        workingSections = [intro, ...middlePicked.slice(0, middleNeeded), conclusion];
      }
    } else {
      const extraNeeded = targetCardCount - workingSections.length;
      const intro = workingSections[0];
      const conclusion = workingSections.length > 1 ? workingSections[workingSections.length - 1] : undefined;
      const middle = workingSections.length > 1 ? workingSections.slice(1, -1) : [];
      const expansion = Array.from({ length: extraNeeded }, (_, i) => {
        const tpl = DEFAULT_ROTATION[i % DEFAULT_ROTATION.length];
        return {
          title: `Additional Detail ${i + 1}`,
          purpose: 'Expand on the topic with another supporting angle, example, or insight.',
          suggestedLayout: 'single' as const,
          template: tpl as BlockTemplate,
          suggestedBlocks: undefined,
        };
      });
      workingSections = conclusion
        ? [intro, ...middle, ...expansion, conclusion]
        : [intro, ...expansion];
    }
  }

  const cards = workingSections.map((section, i) => {
    // Prefer the new `template` enum (added 2026-05-21 for hybrid template
    // selection). Fall back to inferring from suggestedBlocks for any cached
    // classifications still in transit.
    const template = section.template ?? inferTemplateFromBlocks(section.suggestedBlocks ?? []);
    // Per-template default content budgets — gives the AI tighter constraints
    // so it actually fits the visual treatment. Heading levels stay at the
    // section's natural level; item counts and word limits vary by template.
    const contentBudget = budgetForTemplate(template);
    return {
      id: `card-${i}`,
      title: section.title,
      layout: section.suggestedLayout,
      style: 'default' as const,
      blockPlan: [
        { type: template, instruction: `Generate ${template} content for the "${section.title}" section. Purpose: ${section.purpose}` },
      ],
      blockTemplate: template,
      contentBudget,
    };
  });

  return { cards };
}

/** Fallback when an older classification only has `suggestedBlocks`. Pick the
 *  template that best matches the block types present. */
function inferTemplateFromBlocks(blocks: string[]): string {
  if (blocks.includes('smart-layout')) return 'grid-2x2';
  if (blocks.includes('bullet-list')) return 'bullet-list';
  if (blocks.includes('callout')) return 'callout-list';
  if (blocks.includes('toggle')) return 'toggles';
  return 'paragraph-content';
}

/** Default content budget for each template. Tuned so the AI produces the
 *  right shape (count of cells, word limits per item) without overflow. */
// Per-template content budgets — drive the prompt's word/item caps AND the
// post-generation enforceContentBudgets truncation pass.
//
// Tuned 2026-05-22 (P0 #2.3 closeout) against the actual rendered slide
// area (540px card height, ~92% usable). Previous budgets allowed
// itemMaxWords=14 across most multi-cell templates, which wraps to 2
// lines per cell body on a 960px card; 4 cells × 2 lines + heading +
// optional callout consistently overflowed the card. New rule of thumb:
//   - 2 cells per row  → ~22 words/body (longer copy OK, plenty of room)
//   - 3 cells per row  → ~12 words/body (one-line bodies)
//   - 4+ cells per row → ~8 words/body  (tight one-line bodies)
// callout-list maxItems dropped to 3 to match the directive cap (it was
// already only emitting 3 cells regardless of the budget); paragraph-content
// bodyMaxWords trimmed so multi-paragraph slides still fit.
export function budgetForTemplate(template: string): Record<string, unknown> {
  switch (template) {
    case 'cover-minimal':
    case 'cover-subtitle':
      return { headingLevel: 1 };
    case 'hero-title':
      return { headingLevel: 1, bodyMaxWords: 25, includeLabels: true };
    case 'agenda':
      return { headingLevel: 2, maxItems: 6, itemMaxWords: 8 };
    case 'paragraph-content':
      return { headingLevel: 2, bodyMaxWords: 35 };
    case 'bullet-list':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    case 'key-metric-trio':
      return { headingLevel: 2, maxItems: 3, itemMaxWords: 8 };
    case 'key-metric-quad':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 8 };
    case 'grid-2x2':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    case 'grid-1x3':
      return { headingLevel: 2, maxItems: 3, itemMaxWords: 12 };
    case 'comparison-2col':
      return { headingLevel: 2, maxItems: 2, itemMaxWords: 22 };
    case 'features-grid':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    case 'timeline':
    case 'process-horizontal':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    case 'icon-list':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    case 'callout-list':
      // 3 cells + callout — the callout takes space below so each cell
      // gets less than icon-list would. The directive already caps at 3.
      return { headingLevel: 2, maxItems: 3, itemMaxWords: 12, includeCallout: true };
    case 'quote-pull':
      return { headingLevel: 1 };
    case 'toggles':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    case 'chapter-divider':
      return { headingLevel: 1 };
    case 'summary-takeaways':
      return { headingLevel: 2, maxItems: 3, itemMaxWords: 12 };
    case 'cta-closing':
      return { headingLevel: 2, maxItems: 4, itemMaxWords: 10 };
    default:
      return { headingLevel: 2, bodyMaxWords: 35 };
  }
}

// Recipe-retirement (a), S2: `mergeDesignBudget` removed. The recipe budget used
// to TIGHTEN the per-template budget (a `min()` merge); recipe retirement drops
// that tightening, so the per-template budget (`budgetForTemplate`, already the
// single blockTemplate-keyed source) governs directly. See `budgetForTemplate`.

// ── Block Template → Exact JSON Shape ─────────────────────────────────────
// Maps each blockTemplate to the exact JSON the AI must produce.

function buildBlockDirective(
  step: { title: string; purpose: string; blockTemplate?: string; contentBudget?: Record<string, unknown> },
  accentColors: string[],
): string {
  const budget = (step.contentBudget || {}) as Record<string, unknown>;
  const hLevel = (budget.headingLevel as number) || 2;
  const maxItems = (budget.maxItems as number) || 4;
  const itemMaxWords = (budget.itemMaxWords as number) || 15;
  const bodyMaxWords = (budget.bodyMaxWords as number) || 40;
  const includeLabels = budget.includeLabels as boolean;
  const includeCallout = budget.includeCallout as boolean;
  const template = step.blockTemplate || 'paragraph-content';

  const colorAssign = accentColors.slice(0, maxItems).map((c, i) => `cell ${i + 1}: "${c}"`).join(', ');

  let directive = `CARD TITLE: "${step.title}"\nPURPOSE: ${step.purpose}\n\nGenerate EXACTLY this JSON structure:\n`;

  switch (template) {
    case 'hero-title':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<compelling title, max 8 words>"},
  {"type": "paragraph", "content": "<${bodyMaxWords} words max, one punchy sentence about ${step.purpose}>"}${includeLabels ? `,
  {"type": "label-group", "labels": [{"text": "<tag 1>", "style": "outline"}, {"text": "<tag 2>", "style": "outline"}]}` : ''}
]`;
      break;
    case 'paragraph-content':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "paragraph", "content": "<${bodyMaxWords} words max. Be specific to the topic.>"}${includeCallout ? `,
  {"type": "callout", "icon": "warning", "content": "<key insight or decision needed, max 20 words>"}` : ''}
]`;
      break;
    case 'grid-2x2':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "grid-2x2", "cells": [
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[0]}"},
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[1] || accentColors[0]}"},
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[2] || accentColors[0]}"},
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[3] || accentColors[0]}"}
  ]}
]`;
      break;
    case 'grid-1x3':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "grid-1x3", "cells": [
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[0]}"},
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[1] || accentColors[0]}"},
    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[2] || accentColors[0]}"}
  ]}
]`;
      break;
    case 'timeline':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "timeline", "cells": [
${Array.from({ length: Math.min(maxItems, 4) }, (_, i) => `    {"heading": "<phase/step name, 3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}
]`;
      break;
    case 'icon-list':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "list", "cells": [
${Array.from({ length: Math.min(maxItems, 4) }, (_, i) => `    {"icon": "<choose icon matching the content: map-pin, food, music, bus, camera, ticket, budget, star, etc>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}
]`;
      break;
    case 'bullet-list':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "bullet-list", "items": [
${Array.from({ length: Math.min(maxItems, 6) }, () => `    "<${itemMaxWords} words max — one actionable point>"`).join(',\n')}
  ]}
]`;
      break;
    case 'toggles':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
${Array.from({ length: Math.min(maxItems, 4) }, () => `  {"type": "toggle", "heading": "<item name, 3-6 words>", "content": "<${itemMaxWords} words explaining this item>"}`).join(',\n')}
]`;
      break;
    case 'callout-list':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "list", "cells": [
${Array.from({ length: Math.min(maxItems, 3) }, (_, i) => `    {"icon": "<icon>", "heading": "<3-5 words>", "body": "<${itemMaxWords} words max>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}${includeCallout ? `,
  {"type": "callout", "icon": "warning", "content": "<key takeaway or decision needed, max 20 words>"}` : ''}
]`;
      break;
    case 'cta-closing':
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<action-oriented title, max 6 words>"},
  {"type": "bullet-list", "items": [
${Array.from({ length: Math.min(maxItems, 4) }, () => `    "<${itemMaxWords} words — action item with **owner/deadline** bolded>"`).join(',\n')}
  ]}
]`;
      break;
    case 'cover-minimal':
      // Just a title, optionally a single supporting line. For deck covers
      // when no eyebrow / labels are needed.
      directive += `[
  {"type": "heading", "level": 1, "content": "<deck title, max 8 words, declarative or curious — not a question>"}
]`;
      break;
    case 'cover-subtitle':
      // Title + one-line subtitle. Standard polished cover.
      directive += `[
  {"type": "heading", "level": 1, "content": "<deck title, max 7 words>"},
  {"type": "paragraph", "content": "<subtitle, max 12 words, expands on the title>"}
]`;
      break;
    case 'agenda':
      // Numbered overview of sections. Always uses bullet-list for clean
      // alignment; the auto-layout pass handles spacing.
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title — usually 'Agenda' or 'What we'll cover'>"},
  {"type": "bullet-list", "items": [
${Array.from({ length: Math.min(maxItems, 6) }, (_, i) => `    "${i + 1}. <agenda item, ${itemMaxWords} words max>"`).join(',\n')}
  ]}
]`;
      break;
    case 'key-metric-trio':
      // 3 big metrics side by side. Use this for "by the numbers" slides.
      // Each cell's heading is the NUMBER, body is the caption.
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 5 words>"},
  {"type": "smart-layout", "variant": "grid-1x3", "cells": [
    {"icon": "<icon matching metric: chart, target, trophy, etc>", "heading": "<the number with unit, e.g. '42%', '$1.2M', '3×'>", "body": "<what this number measures, max 8 words>", "accentColor": "${accentColors[0]}"},
    {"icon": "<icon>", "heading": "<the number with unit>", "body": "<caption, max 8 words>", "accentColor": "${accentColors[1] || accentColors[0]}"},
    {"icon": "<icon>", "heading": "<the number with unit>", "body": "<caption, max 8 words>", "accentColor": "${accentColors[2] || accentColors[0]}"}
  ]}
]`;
      break;
    case 'key-metric-quad':
      // 4 metrics in 2×2.
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 5 words>"},
  {"type": "smart-layout", "variant": "grid-2x2", "cells": [
${Array.from({ length: 4 }, (_, i) => `    {"icon": "<icon>", "heading": "<the number with unit>", "body": "<caption, max 8 words>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}
]`;
      break;
    case 'comparison-2col':
      // Two options compared side by side. Each column has its own heading
      // + body. Uses the `list` variant with exactly 2 cells — `list` accepts
      // any cell count, so the variant and the 2-cell skeleton agree and the
      // converter lays the two options out cleanly.
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words — name the comparison>"},
  {"type": "smart-layout", "variant": "list", "cells": [
    {"icon": "<icon left option>", "heading": "<left option name>", "body": "<key points about left option, ${itemMaxWords * 2} words max>", "accentColor": "${accentColors[0]}"},
    {"icon": "<icon right option>", "heading": "<right option name>", "body": "<key points about right option, ${itemMaxWords * 2} words max>", "accentColor": "${accentColors[1] || accentColors[0]}"}
  ]}
]`;
      break;
    case 'quote-pull':
      // Centered pull quote. Big heading-as-quote + attribution paragraph.
      directive += `[
  {"type": "heading", "level": 1, "content": "<the quote in quotation marks, max 25 words>"},
  {"type": "paragraph", "content": "— <attribution: name, role, source>"}
]`;
      break;
    case 'chapter-divider':
      // Section break / chapter marker. Big number + section name.
      directive += `[
  {"type": "heading", "level": 1, "content": "<two-line: 'Part <N>' or 'Chapter <N>' on one line, section name on another — use a newline>"}
]`;
      break;
    case 'summary-takeaways':
      // Closing summary. 3 key takeaways as labeled rows.
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, e.g. 'Key takeaways' or 'In summary'>"},
  {"type": "smart-layout", "variant": "list", "cells": [
${Array.from({ length: 3 }, (_, i) => `    {"icon": "check", "heading": "<takeaway ${i + 1} headline, 3-6 words>", "body": "<one-line elaboration, ${itemMaxWords} words max>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}
]`;
      break;
    case 'features-grid': {
      // 3-6 product features with icon + name + description. The variant and
      // the emitted cell count are derived from the SAME number so they always
      // agree: 3 → grid-1x3 (3 cells), 4 → grid-2x2 (4 cells), >4 → list
      // (any count). The model is never handed a grid variant whose canonical
      // cell count contradicts the number of cells in the skeleton.
      const featureCount = Math.min(maxItems, 6);
      const featureVariant =
        featureCount === 3 ? 'grid-1x3' : featureCount === 4 ? 'grid-2x2' : 'list';
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "${featureVariant}", "cells": [
${Array.from({ length: featureCount }, (_, i) => `    {"icon": "<icon matching feature>", "heading": "<feature name, 2-4 words>", "body": "<feature description, ${itemMaxWords} words max>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}
]`;
      break;
    }
    case 'process-horizontal':
      // 3-5 stage process with arrows. Uses timeline variant for now;
      // converter could be enhanced to render arrows between cells.
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title, max 6 words>"},
  {"type": "smart-layout", "variant": "timeline", "cells": [
${Array.from({ length: Math.min(maxItems, 5) }, (_, i) => `    {"heading": "<stage ${i + 1} name, 2-4 words>", "body": "<what happens at this stage, ${itemMaxWords} words max>", "accentColor": "${accentColors[i % accentColors.length]}"}`).join(',\n')}
  ]}
]`;
      break;
    default:
      directive += `[
  {"type": "heading", "level": ${hLevel}, "content": "<section title>"},
  {"type": "paragraph", "content": "<${bodyMaxWords} words about ${step.purpose}>"}
]`;
  }

  return directive;
}

// ── Stage 3: Generate ─────────────────────────────────────────────────────
// Generates content for each card with EXACT visual structure from the
// framework's layout directives. The AI fills in content, not structure.

/** Per-slide narrative context threaded into the generate prompt so the writer
 *  understands WHAT this slide should cover, how it connects to the others, and
 *  WHY its layout was chosen. All fields optional + additive: the call site
 *  supplies what it has, the prompt builder emits only the sections present. */
export interface DeckContext {
  /** Ordered titles of EVERY card in the deck, so the writer sees the whole arc
   *  and does not repeat another slide's content. */
  allTitles?: string[];
  /** 0-based index of THIS slide within the deck. */
  index?: number;
  /** Total number of slides in the deck. */
  total?: number;
  /** Previous slide's title (continuity / no repetition). Omitted for slide 1. */
  prevTitle?: string;
  /** The richest one-line brief of what THIS slide specifically covers
   *  (typically the blockPlan step instruction, or a source-enriched brief). */
  brief?: string;
  /** The deck planner has allocated an image to THIS slide (imageRole != none).
   *  When true, the writer is told to produce a concrete visual concept rather
   *  than defaulting to restraint — otherwise the planner wants an image but the
   *  writer emits none, and the slide ends up image-less (the planner/writer
   *  coordination gap). */
  wantsImage?: boolean;
}

/**
 * Does the USER'S TOPIC actually supply quantitative DATA the deck can ground
 * metric/stat layouts in?
 *
 * This single gate decides whether the planner may pick number-requiring
 * recipes (stat-trio / stat-grid) and whether the grounding guard downgrades
 * metric block templates. It must NOT fire on incidental numerals that carry no
 * data — a YEAR ("2026"), a quarter label ("Q1"), a clock idiom ("24/7"), an
 * ordinal ("#1"), or a version ("v2"). Before this fix, a bare `/\d/` test made
 * "the state of remote work in 2026" read as numeric: the planner then chose a
 * stat layout and the writer was forced to fabricate figures the topic never
 * supplied (the JUDGE rejected them on `grounded`, the loop exhausted, and the
 * slide shipped broken). We strip those incidental forms first, then require a
 * remaining digit OR an explicit quantity word.
 *
 * Single source of truth: the per-card grounding signal AND the planner's
 * `allowNumbers` gate both call this, so they can never drift (they were
 * previously two hand-copied regex blocks "kept in sync intentionally").
 */
function topicSuppliesData(prompt: string): boolean {
  const stripped = (prompt || '')
    .replace(/\b(1[89]\d{2}|20\d{2})s?\b/g, ' ') // years incl. "1990s" / "2020s"
    .replace(/\bQ[1-4]\b/gi, ' ')                // fiscal-quarter labels
    .replace(/\b24\/7\b/g, ' ')                  // "around the clock" idiom
    .replace(/#\d+/g, ' ')                       // ordinals "#1"
    .replace(/\bv\d+(?:\.\d+)*\b/gi, ' ');       // version numbers "v2", "v1.3"
  return (
    /\d/.test(stripped) ||
    /\b(percent|percentage|half|third|quarter|double|triple|majority|dozens?|hundreds?|thousands?|millions?|billions?)\b/i.test(prompt)
  );
}

/** How many distinct real numbers the topic supplies (years/quarters/versions/
 *  ordinals stripped first, same as topicSuppliesData). Lets the grounding guard
 *  be slot-COUNT-aware: a stat layout with more cells than the topic has numbers
 *  forces the writer to invent the shortfall. */
function countTopicNumbers(prompt: string): number {
  const stripped = (prompt || '')
    .replace(/\b(1[89]\d{2}|20\d{2})s?\b/g, ' ')
    .replace(/\bQ[1-4]\b/gi, ' ')
    .replace(/\b24\/7\b/g, ' ')
    .replace(/#\d+/g, ' ')
    .replace(/\bv\d+(?:\.\d+)*\b/gi, ' ');
  return new Set(stripped.match(/\d+(?:\.\d+)?/g) || []).size;
}

export async function generateCard(
  prompt: string,
  cardPlan: CardBlueprint['cards'][0],
  classification: ContentClassification,
  audience: string,
  tone: string,
  accentColors: string[],
  /** Resolved Skill for the deck (framework default, template default, or
   *  user override from the Customize popover Voice picker). null = no
   *  Skill biasing, generic generation. PRD §5.1 / §5.3. */
  skillId?: SkillId | null,
  /** How much license AI has over the prompt prose. Defaults to 'inspire'
   *  (today's behavior). See generateCardTemplate options for full semantics. */
  rewriteIntensity?: 'inspire' | 'build' | 'verbatim',
  /** Design Intelligence Layer (Phase 1) — when the deck planner assigned a
   *  recipe to this slide, its content budget overrides the per-template
   *  default. Threaded into BOTH the generate prompt AND the post-generation
   *  enforcement so the recipe's caps are respected end-to-end. Optional —
   *  when absent the existing per-template budget is used unchanged. */
  designBudget?: ContentBudget,
  /** DIL enforcement — run the subjective LLM judge tier inside the
   *  regenerate loop (after the deterministic checks pass). Defaults to the
   *  module default (on, unless the DIL_JUDGE_DISABLED env kill-switch is set).
   *  Pass false to force the cheap deterministic-only gate. */
  enforceJudge?: boolean,
  /** Per-slide context so the writer knows what THIS slide should cover, how it
   *  fits the deck's arc, and why its layout was chosen. ALL fields optional —
   *  absent → current (context-starved) behavior, never an empty/broken prompt.
   *  This is the highest-leverage wiring fix: without it the writer only sees
   *  the whole-deck topic + a 2–3 word card title and produces thin, repetitive
   *  content. */
  deckContext?: DeckContext,
  /** User's "Detail level" (concise | detailed | extensive). Scales the body
   *  word caps so the slide carries as much copy as the user asked for.
   *  Absent/unknown → DEFAULT_DENSITY ('detailed'). Previously this control was
   *  collected and dropped; threading it here is what un-freezes the density. */
  density?: string,
): Promise<GeneratedCard> {
  const provider = getProvider();

  // Grounding signal for the enforcement gate: when the TOPIC carries no
  // figures, any statistic the writer emits is fabricated. Shared with the
  // planner's allowNumbers gate via topicSuppliesData() so they can't drift.
  const topicHasNumbers = topicSuppliesData(prompt);

  // Recipe-retirement (a), S2: the per-template budget (`budgetForTemplate`,
  // carried on `cardPlan.contentBudget`) governs directly — the recipe-budget
  // tightening merge is gone. Scale the WORD caps by the user's Detail level
  // (concise/detailed/extensive). One scaled object drives the writer caps, the
  // quality check, AND the post-generation enforcement — all honor the detail
  // choice. (`designBudget` is now unused; removed with recipe-scoring in S3.)
  void designBudget;
  const effectiveBudget = scaleBudgetForDensity(
    cardPlan.contentBudget,
    density,
  );

  const blockDirective = buildBlockDirective(
    {
      title: cardPlan.title,
      purpose: cardPlan.blockPlan[0]?.instruction || cardPlan.title,
      blockTemplate: cardPlan.blockTemplate,
      contentBudget: effectiveBudget,
    },
    accentColors,
  );

  const speakerRole = classification.speakerRole || '';
  const audienceRole = classification.audienceRole || audience || '';
  const voiceInstructions = buildSkillVoiceInstructions(skillId);

  // Rewrite intensity — controls how much license the AI takes with the
  // user's prompt prose. 'inspire' is the default (today's behavior, no
  // extra rules). 'build' and 'verbatim' add explicit preservation rules
  // so power users with their own copy keep it intact. Phase 1 of
  // Invisible AI PRD.
  const intensityInstructions =
    rewriteIntensity === 'build'
      ? `PROMPT FIDELITY (BUILD ON IT):\n- Preserve direct phrases from the user's TOPIC text wherever they fit naturally into card content. Quote them as written; don't paraphrase distinctive language.\n- Paraphrase only when restructuring or condensing requires it. When in doubt, keep the user's wording.\n- Fill gaps (transitions, headings, missing connective tissue) with AI prose that matches the user's tone.\n`
      : rewriteIntensity === 'verbatim'
        ? `PROMPT FIDELITY (USE AS THE TEXT):\n- Treat the user's TOPIC text as the canonical content of the deck. Do not paraphrase, rewrite, or substitute synonyms for the user's prose.\n- Your job is to STRUCTURE the user's text into card slots (heading, body, bullets, etc.) — not to re-author it.\n- The only new prose you may write is: short connective transitions between cards, headings that don't already appear in the user's text, and minimal labels (e.g. cell titles in a grid). Everything else MUST come from the user's text verbatim.\n- If a card's slot needs content the user didn't provide, write a one-line PROSE prompt describing what should go there (e.g. "Your team's specific Q1 number") — never invent prose and never output bracketed tokens like [stat].\n`
        : '';

  // Per-slide narrative context (additive — each line emitted only when its
  // field is present). Placed high in the prompt, right after TOPIC/CARD, so
  // the writer reads the deck arc + this slide's brief + its layout's purpose
  // BEFORE the block directive. With no deckContext this resolves to '' and the
  // prompt is byte-for-byte the prior behavior.
  const dc = deckContext ?? {};
  const contextLines: string[] = [];
  if (dc.brief && dc.brief.trim() && dc.brief.trim() !== cardPlan.title) {
    contextLines.push(`SLIDE BRIEF (what THIS slide must cover): ${dc.brief.trim()}`);
  }
  if (dc.allTitles && dc.allTitles.length > 1) {
    const pos =
      typeof dc.index === 'number' && typeof dc.total === 'number'
        ? ` (this is slide ${dc.index + 1} of ${dc.total})`
        : '';
    const outline = dc.allTitles.map((t, k) => `${k + 1}. ${t}`).join('  ');
    contextLines.push(
      `DECK OUTLINE${pos}: ${outline}\n- Cover ONLY this slide's part of the arc. Do NOT repeat content that belongs to another slide above.`,
    );
  }
  if (dc.prevTitle && dc.prevTitle.trim()) {
    contextLines.push(`PREVIOUS SLIDE: "${dc.prevTitle.trim()}" — continue from it; do not restate it.`);
  }
  const contextBlock = contextLines.length ? `\n${contextLines.join('\n')}\n` : '';

  // Planner→writer image coordination: when the deck designer allocated an image
  // to this slide, override the writer's default restraint and require a real
  // visual concept. Without this the planner wants an image but the writer emits
  // wanted:false / empty subject, and the slide ends up image-less.
  const imageMandate = dc.wantsImage
    ? `\nIMAGE ALLOCATED TO THIS SLIDE: the deck's designer has reserved space for an image here. You MUST set imageIntent.wanted = true and give imageIntent.subject as a concrete VISUAL concept — a scene, object, or metaphor that adds meaning the words can't (NEVER the slide's text, heading, numbers, or words to render in the image). Choose a fitting style and placement. Do NOT default to restraint for this slide.`
    : '';

  // FIT & FORMAT — surface to the WRITER the exact same bar the JUDGE enforces
  // (judge.ts RUBRIC.fits / balance / layout-match). The writer and judge share
  // `effectiveBudget`, but the writer previously saw the caps only as scattered
  // inline "<max N words>" hints buried in the JSON skeleton, while the judge
  // applied a crisp holistic fit/fill review — so every card failed attempt 1
  // for a bar it was never plainly told. This closes that loop: same caps, same
  // rules, stated once and prominently, so the slide fits and fills on the first
  // try. Caps come from the merged budget; minimal slides are exempt from the
  // "not sparse" rule (a cover/divider/quote is correctly short).
  const eb = effectiveBudget ?? {};
  const capParts = [
    typeof eb.bodyMaxWords === 'number' ? `each paragraph/body ≤ ${eb.bodyMaxWords} words` : '',
    typeof eb.itemMaxWords === 'number' ? `each bullet/cell body ≤ ${eb.itemMaxWords} words` : '',
    typeof eb.maxItems === 'number' ? `at most ${eb.maxItems} items/cells` : '',
  ]
    .filter(Boolean)
    .join('; ');
  const minimalTemplates = new Set(['cover-minimal', 'cover-subtitle', 'quote-pull', 'chapter-divider']);
  const isMinimalSlide = minimalTemplates.has(cardPlan.blockTemplate ?? '');
  // Depth FLOOR: detail-level is a floor, not just a ceiling (see density.ts).
  // Tell the writer to fill bodies to it with GROUNDED elaboration — the
  // under-depth gate enforces it, the FR11 gate forbids inventing to reach it.
  const bodyMin = typeof eb.bodyMinWords === 'number' ? eb.bodyMinWords : 0;
  const depthLine =
    bodyMin > 0 && !isMinimalSlide
      ? `\n- DEPTH (this deck is "detailed"): write FULL bodies — aim for ${bodyMin}-${typeof eb.bodyMaxWords === 'number' ? eb.bodyMaxWords : bodyMin} words per paragraph, EXPLAINING and CONTEXTUALIZING the real content (the why, the how, a concrete example from the topic). A terse one-liner under-delivers. But NEVER invent facts, numbers, names, or dates to reach length — grounded depth only; if you cannot deepen without inventing, stay short (grounding wins).`
      : '';
  const fitFormatBlock = `
FIT & FORMAT — the slide renders in a FIXED 16:9 box and an editor REJECTS slides that overflow or don't fill their layout. Clear this bar on the first try:
- FITS (hard): ${capParts ? `caps for this layout — ${capParts}. ` : ''}Text past the cap CLIPS or shrinks on the rendered slide, so write WITHIN the caps and count your words. Keep the title short; a subtitle long enough to wrap past one line gets cut mid-word.${depthLine}
${
    isMinimalSlide
      ? '- MINIMAL SLIDE: this is a cover / divider / quote — a short title plus at most one short line is CORRECT. Do not pad it with extra body or bullets.'
      : '- BALANCE: carry enough real substance to fill the slide — never one stranded short line floating in a large empty area. If you can only think of one real point, the layout is wrong: say so by filling the structure with genuine parallel points.'
  }
- LAYOUT-MATCH: fill the layout with REAL, parallel, comparable items — a metric layout needs actual numbers (or an honest "Your … here" fill-in prompt), a grid/list needs items of similar weight and length, a comparison needs two genuine sides, a timeline needs ordered steps. Never stretch one idea across many cells, and never collapse the required structure into plain headings + paragraphs.
`;

  const generatePrompt = `Generate content for ONE presentation card.

TOPIC: "${prompt}"
CARD: "${cardPlan.title}"
${contextBlock}${speakerRole ? `SPEAKER (who's writing this): ${speakerRole}\n` : ''}${audienceRole ? `AUDIENCE (who reads this): ${audienceRole}\n` : ''}TONE: ${tone || 'professional'}
${voiceInstructions ? `\n${voiceInstructions}` : ''}${intensityInstructions ? `\n${intensityInstructions}` : ''}
${blockDirective}

${PRESENTATION_VOICE}
${fitFormatBlock}
CRITICAL STRUCTURE RULES:
- You MUST produce the EXACT JSON structure shown above. Do not simplify, flatten, or substitute block types.
- If the structure says "smart-layout" with variant "grid-2x2", you MUST output a smart-layout block with exactly 4 cells. Do NOT replace it with headings and paragraphs.
- If the structure says "bullet-list", output a bullet-list. Do NOT replace with paragraphs.
- If the structure says "toggle", output toggle blocks. Do NOT replace with paragraphs.
- EVERY word limit is a HARD maximum. Count your words. Content that exceeds the limit will be truncated.
- Fill in the <placeholders> with real, relevant content for the topic.

${GROUNDING}

${HEADING_RULE}

${BODY_TEXT_RULE}

${designStandardBlock('writer')}

${perspectiveRule(speakerRole, audienceRole)}

ICONS:
- Choose icons that MATCH the content meaning: map-pin for locations, food/utensils for dining, music for nightlife, bus for transport, piggy-bank for budget, camera for photo spots, ticket for discounts, star for highlights, compass for directions, heart for favorites
- Available icons: map-pin, location, map, compass, food, utensils, restaurant, music, nightlife, camera, photo, ticket, bus, car, plane, star, heart, thumbs-up, gift, budget, piggy-bank, savings, discount, shopping, wallet, dollar, clock, calendar, users, target, warning, lightbulb, zap, sparkles, building, mountain, waves, sunrise, sunset, moon, sun, trophy, award, briefcase, rocket, graduation-cap, book, shield, flag, check
- Accent colors: ${accentColors.join(', ')}

${IMAGE_JUDGMENT}
${imageMandate}
Respond with ONLY valid JSON:
{"id": "${cardPlan.id}", "blocks": [...], "imageIntent": {"wanted": <true|false>, "subject": "<visual concept, or empty when wanted is false>", "style": "<one of the styles above>", "placement": "<one of the placements above>"}}
When wanted is false, you may omit subject/style/placement or leave subject empty.
Do NOT wrap in markdown code fences. Output raw JSON only.`;

  // Generate one attempt. `feedback` (when present) is the gate's actionable
  // critique of the prior attempt, appended so the model fixes the SPECIFIC
  // failures rather than blindly retrying. NOTE: budgets are NOT truncated here
  // — the gate must see the RAW output to judge density and send it back.
  const callAI = async (feedback: string): Promise<GeneratedCard> => {
    const response = await provider.createMessage({
      model: getModel(),
      max_tokens: 2000,
      tools: [GENERATE_CARD_TOOL],
      tool_choice: { type: 'tool', name: 'report_card' },
      messages: [{ role: 'user', content: generatePrompt + feedback }],
    });

    const toolUse = response.content.find(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) throw new Error(`No generation tool_use response for card ${cardPlan.id}`);

    return GeneratedCardSchema.parse(toolUse.input);
  };

  // PRD §6: the Content critic is a FIXER — it rewrites the weak bits DIRECTLY,
  // NOT note→re-roll. This sends ONLY the current slide + the editor's flagged
  // (unapproved) bits, with NO from-scratch prompt, and asks for the SAME slide
  // back with only those bits rewritten. Fail-safe: returns the current card on
  // any error so a bad revise never crashes or blanks generation.
  const reviseCard = async (current: GeneratedCard, issues: string[]): Promise<GeneratedCard> => {
    const slideJson = JSON.stringify({ id: current.id, blocks: current.blocks, imageIntent: current.imageIntent });
    const revisePrompt = [
      'You are an editor REVISING ONE presentation slide — not writing a new one.',
      'Below is the slide as JSON, and the SPECIFIC parts an editor did not approve.',
      'Rewrite ONLY what each flagged item names. Keep every other word, block, and the JSON structure EXACTLY as-is — do not re-order, re-style, or rewrite anything that was not flagged.',
      '',
      GROUNDING,
      '',
      `TOPIC: "${prompt}"`,
      'CURRENT SLIDE:',
      slideJson,
      '',
      'NOT APPROVED — fix only these:',
      ...issues.map((f) => `• ${f}`),
      '',
      'Return the corrected slide as raw JSON only — same shape {"id":"...","blocks":[...],"imageIntent":{...}}. No markdown fences.',
    ].join('\n');
    try {
      const response = await provider.createMessage({
        model: getModel(),
        max_tokens: 2000,
        tools: [GENERATE_CARD_TOOL],
        tool_choice: { type: 'tool', name: 'report_card' },
        messages: [{ role: 'user', content: revisePrompt }],
      });
      const toolUse = response.content.find(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );
      if (!toolUse) return current;
      return GeneratedCardSchema.parse(toolUse.input);
    } catch {
      return current; // fail-safe: keep the current slide if the revise call fails
    }
  };

  // ── Enforcement — the PRD critic-relay flow ───────────────────────────────
  // TWO tiers:
  //   1. DETERMINISTIC gate (enforce.ts + validateBlockStructure) — the cheap
  //      floor. A STRUCTURAL miss is REGENERATED (re-roll) up to MAX_GEN_ATTEMPTS,
  //      because a broken block structure isn't a "fix a bit" job.
  //   2. CONTENT CRITIC (judge.ts) — runs once the card is structurally clean.
  //      Per PRD §2.1/§6 it is a FIXER: each round it rewrites the weak bits it
  //      flags DIRECTLY (reviseCard) — NOT note→re-roll — bounded by
  //      MAX_JUDGE_REVISIONS. No-op when clean. PRD §2.5: if it can't clear after
  //      its budget, do NOT ship silently — the unresolved verdict is surfaced
  //      (honest handoff) below. A final deterministic safety net runs after
  //      (an LLM fix can introduce overflow). Generation is NEVER hard-blocked.
  const MAX_GEN_ATTEMPTS = 4;     // structural re-rolls (deterministic tier)
  const MAX_JUDGE_REVISIONS = 3;  // content-critic surgical fix rounds (PM: 3)
  const judgeOn = (enforceJudge ?? true) && isJudgeEnabled();
  let judgeRevisionsUsed = 0;
  // Non-empty at the end ⇒ the card shipped with an unresolved content verdict,
  // surfaced loudly below (honest handoff) instead of the old silent fail-open.
  let lastJudgeIssues: string[] = [];

  const deterministicIssues = (c: GeneratedCard): string[] => {
    const fb: string[] = [];
    if (!validateBlockStructure(c.blocks, cardPlan.blockTemplate)) {
      fb.push(
        `Output did not use the required layout "${cardPlan.blockTemplate}". Produce EXACTLY that block structure — do not flatten it to plain headings/paragraphs.`,
      );
    }
    fb.push(...checkCardQuality(c.blocks, effectiveBudget, { topicHasNumbers, topic: prompt, blockTemplate: cardPlan.blockTemplate }).issues);
    return fb;
  };

  // Tier 1 — generate, re-rolling STRUCTURAL failures until deterministically clean.
  let card: GeneratedCard = await callAI('');
  for (let a = 1; a < MAX_GEN_ATTEMPTS; a++) {
    const fb = deterministicIssues(card);
    if (fb.length === 0) break;
    console.warn(`[card-engine] card "${cardPlan.id}" failed gate (attempt ${a}): ${fb.join(' | ')}`);
    card = await callAI(
      `\n\n— REVISION REQUIRED — your previous attempt failed these quality checks. Fix ALL of them and return the corrected slide as raw JSON:\n${fb.map((f) => `• ${f}`).join('\n')}`,
    );
  }

  // Tier 2 — Content critic FIXES its flagged bits directly (no re-roll), bounded.
  // judge → if it passes, done (no-op when clean); else rewrite the weak bits and
  // re-judge, up to MAX_JUDGE_REVISIONS. A final judge runs after the last revise,
  // so `lastJudgeIssues` reflects the TRUE end state for the honest handoff.
  if (judgeOn && deterministicIssues(card).length === 0) {
    for (let rev = 0; ; rev++) {
      const verdict = await judgeCard({
        title: cardPlan.title,
        blocks: card.blocks,
        blockTemplate: cardPlan.blockTemplate,
        layout: cardPlan.layout,
        contentBudget: effectiveBudget,
        topic: prompt,
        audience: audienceRole,
        tone,
        density,
      });
      if (verdict.pass) { lastJudgeIssues = []; break; }
      lastJudgeIssues = verdict.issues;
      if (rev >= MAX_JUDGE_REVISIONS) break; // budget spent → honest handoff
      judgeRevisionsUsed++;
      console.warn(
        `[card-engine] card "${cardPlan.id}" failed JUDGE (revision ${rev + 1}): ${verdict.issues.join(' | ')}`,
      );
      card = await reviseCard(card, verdict.issues); // fix the weak bits directly
    }
  }

  pipelineLog('enforce', `${cardPlan.blockTemplate} · judge=${judgeOn ? 'on' : 'off'} · revisions=${judgeRevisionsUsed}`);

  // ── Deterministic backstops (run BEFORE the honest-handoff surface, so an
  //    issue a backstop RESOLVES is not falsely reported as "unresolved"). ──
  // Last-resort safety net so nothing overflows even if the gate didn't fully
  // converge (never hard-block the user).
  if (card) card.blocks = enforceContentBudgets(card.blocks, effectiveBudget);
  // FR11 FAIL-CLOSED: a fabricated figure is a Hard-Constraint violation — it
  // must NEVER reach the user. If the revision loop exhausted its budget with an
  // ungrounded number still on the slide, strip it to the qualitative remainder
  // (grounded-or-silent), rather than the old fail-OPEN that shipped it. Prompt-
  // aware, so grounded figures survive and only invented ones are removed.
  if (card) {
    const { blocks, stripped } = stripUngroundedStats(card.blocks, prompt);
    card.blocks = blocks;
    if (stripped.length) {
      console.warn(
        `[card-engine] FR11 FAIL-CLOSED — card "${cardPlan.id}" shipped grounded after stripping unverified figure(s): ${stripped.join(', ')}`,
      );
    }
  }
  // Deterministic markdown-bleed backstop: strip literal **/#/- markup the
  // renderer would otherwise show raw. Behavior-preserving (formatting only).
  if (card) card.blocks = stripMarkdownBleed(card.blocks);

  // Don't ship failures silently. After the backstops above, surface anything
  // STILL unresolved (e.g. an under-depth body the writer couldn't deepen, or a
  // judge verdict it never cleared) so the deck-level report sees which slides
  // settled — instead of a green 200 hiding it. Grounding is no longer in this
  // list: the fail-closed strip above guarantees it's resolved by here.
  if (card) {
    const allUnresolved = [...deterministicIssues(card), ...lastJudgeIssues.map((i) => `JUDGE: ${i}`)];
    if (allUnresolved.length) {
      console.warn(
        `[card-engine] SHIPPED WITH UNRESOLVED ISSUES — card "${cardPlan.id}" never cleared the bar: ${allUnresolved.join(' | ')}`,
      );
    }
  }
  return card as GeneratedCard;
}

// ── Design Intelligence Layer — attach design + reconcile placement ───────
// Mutates the card in place: records the planner's SlideDesign (for the client
// + future critique pass) and rewrites the image placement BY ROLE so the
// auto-image flow places full-bleed/column/band/... images in their proper
// region rather than the old uniform heuristic. Defensive: a missing design is
// a no-op, so callers without a deck plan behave exactly as before.
function applyDesign(card: Card, design: SlideDesign | undefined, blockTemplate?: string): void {
  if (!design) return;
  // Carry the design decision through. Structural shape matches the optional
  // `slideDesign` field on Card (no fork).
  card.slideDesign = design;
  // B2a: carry the blueprint's blockTemplate intent onto the design so the
  // layout stage (B2b converter) can decide composition from intent + realized
  // content. UNREAD in B2a — additive metadata only, no behavior change.
  if (blockTemplate) card.slideDesign.blockTemplate = blockTemplate;

  // Reconcile imageRole → existing placement enum. The image role is the
  // deck-level authority on which slides carry imagery (rhythm + ≤50% cap),
  // assigned post-generation from the real `imageIntent` the generator emitted.
  const resolution = resolveImageRole(design.imageRole, design.themeArchetype);

  if (!resolution) {
    // Role is 'none' (or a role with no placement) — type-only slide. Suppress
    // the generator's intent so the client auto-image flow places nothing here.
    if (card.imageIntent) {
      card.imageIntent = { ...card.imageIntent, wanted: false };
    }
    return;
  }

  // Real image role from the planner — but an image is only EARNED when the
  // generator actually emitted a visual concept for this slide. We deliberately
  // do NOT fall back to the slide heading: depicting the title literally
  // produced clip-art (a slide "Norwegian Text Recognition Accuracy" became a
  // literal magnifier-on-Norwegian-text image). The planner proposes which
  // slides MAY bear imagery (rhythm + ≤cap); the generator's concept is what
  // makes one appear. No concept → leave the slide image-less. Better no image
  // than an image of the slide's own text.
  const generatedSubject = card.imageIntent?.subject?.trim();
  if (!generatedSubject) {
    if (card.imageIntent) card.imageIntent = { ...card.imageIntent, wanted: false };
    return;
  }
  card.imageIntent = {
    ...card.imageIntent,
    wanted: true,
    subject: generatedSubject,
    placement: resolution.placement,
  };
}

// ── Stage 4: Assemble ─────────────────────────────────────────────────────
// Combines generated cards with theme and layout into a CardTemplate.

export function assembleTemplate(
  name: string,
  description: string,
  category: string,
  blueprint: CardBlueprint,
  generatedCards: GeneratedCard[],
  theme: TemplateTheme,
  /** Design Intelligence Layer — per-slide design decisions, parallel to
   *  blueprint.cards. Optional: absent when the planner didn't run. */
  deckPlan?: DeckPlan | null,
): CardTemplate {
  const cards: Card[] = blueprint.cards.map((plan, i) => {
    const generated = generatedCards[i];
    const blocks: CardBlock[] = generated?.blocks as CardBlock[] || [];

    const card: Card = {
      id: plan.id,
      layout: plan.layout,
      style: plan.style,
      columns: [{ blocks }],
    };
    if (generated?.imageIntent) card.imageIntent = generated.imageIntent;
    applyDesign(card, deckPlan?.slides[i], plan.blockTemplate);

    // Add accent zone for split layouts
    if (plan.layout === 'split-left') {
      card.accent = {
        type: 'gradient',
        value: `linear-gradient(135deg, ${theme.accentColors[0]}, ${theme.accentColors[1] || theme.accentColors[0]})`,
        position: 'left',
      };
    } else if (plan.layout === 'split-right') {
      card.accent = {
        type: 'gradient',
        value: `linear-gradient(135deg, ${theme.accentColors[0]}, ${theme.accentColors[1] || theme.accentColors[0]})`,
        position: 'right',
      };
    }

    return card;
  });

  return {
    id: `tpl-${Date.now()}`,
    name,
    description,
    category,
    thumbnail: '',
    theme,
    cards,
  };
}

// ── Post-Generation Validation & Enforcement ─────────────────────────────

function truncateToWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

function enforceContentBudgets(
  blocks: GeneratedCard['blocks'],
  contentBudget?: Record<string, unknown>,
): GeneratedCard['blocks'] {
  if (!contentBudget) return blocks;
  const bodyMaxWords = (contentBudget.bodyMaxWords as number) || 40;
  const itemMaxWords = (contentBudget.itemMaxWords as number) || 15;
  const maxItems = (contentBudget.maxItems as number) || 4;

  return blocks.map((block) => {
    switch (block.type) {
      case 'paragraph':
        return { ...block, content: truncateToWordLimit(block.content, bodyMaxWords) };
      case 'heading':
        return { ...block, content: truncateToWordLimit(block.content, 10) };
      case 'smart-layout':
        return {
          ...block,
          cells: block.cells.slice(0, maxItems).map((cell) => ({
            ...cell,
            heading: truncateToWordLimit(cell.heading, 6),
            body: truncateToWordLimit(cell.body, itemMaxWords),
          })),
        };
      case 'bullet-list':
        return {
          ...block,
          items: block.items.slice(0, maxItems + 2).map((item) =>
            truncateToWordLimit(item, itemMaxWords),
          ),
        };
      case 'toggle':
        return { ...block, content: truncateToWordLimit(block.content, itemMaxWords) };
      case 'callout':
        return { ...block, content: truncateToWordLimit(block.content, 25) };
      default:
        return block;
    }
  });
}

function validateBlockStructure(
  blocks: GeneratedCard['blocks'],
  expectedTemplate?: string,
): boolean {
  if (!expectedTemplate) return true;
  const blockTypes = new Set(blocks.map((b) => b.type));

  // B2b — LOOSENED. Layout is now content-led: the converter composes the slide
  // from whatever structured content exists (smart-layout cells OR bullet items),
  // gated by count, with a graceful fallback. So we no longer re-roll on an exact
  // block-shape mismatch (that fought the content-led decision). For the templates
  // that imply MULTIPLE items, we only insist the writer produced SOME structured
  // multi-item block — smart-layout, bullet-list, or toggle, interchangeably (any
  // of them composes). Everything else passes.
  switch (expectedTemplate) {
    case 'grid-2x2':
    case 'grid-1x3':
    case 'grid-1x4':
    case 'timeline':
    case 'icon-list':
    case 'callout-list':
    case 'bullet-list':
    case 'cta-closing':
    case 'toggles':
      return blockTypes.has('smart-layout')
        || blockTypes.has('bullet-list')
        || blockTypes.has('toggle');
    default:
      return true;
  }
}

// ── Framework → Blueprint (skip classification when framework provided) ───

/** Layout-variant rotations per task #20. Each variant biases the framework
 *  expansion toward block templates that match its visual flavor. The
 *  unselected case falls back to a balanced mixed rotation. */
const VARIANT_ROTATIONS: Record<string, string[]> = {
  data: ['key-metric-trio', 'key-metric-quad', 'grid-2x2', 'comparison-2col', 'grid-1x3', 'callout-list'],
  narrative: ['paragraph-content', 'quote-pull', 'callout-list', 'paragraph-content', 'bullet-list', 'summary-takeaways'],
  visual: ['features-grid', 'hero-title', 'icon-list', 'grid-2x2', 'process-horizontal', 'chapter-divider'],
};
const DEFAULT_ROTATION = ['key-metric-trio', 'grid-2x2', 'bullet-list', 'comparison-2col', 'timeline', 'quote-pull', 'icon-list', 'callout-list'];

function frameworkToBlueprint(
  framework: { steps: { title: string; purpose: string; layout?: string; blockTemplate?: string; contentBudget?: Record<string, unknown> }[] },
  cardCount?: number,
  layoutVariant?: string,
  selectedLayouts?: string[],
): CardBlueprint {
  // Resolve target count: honour the user's request, fall back to the
  // framework's natural step count when not provided.
  const target = cardCount && cardCount > 0 ? cardCount : framework.steps.length;
  const fwSteps = framework.steps;
  let steps: typeof fwSteps;

  if (target <= fwSteps.length) {
    // Fewer cards than the framework defines: keep intro + conclusion as
    // bookends, sample from the middle so the user still gets the framework's
    // intent rather than just the opening setup.
    if (target === 1) {
      steps = [fwSteps[0]];
    } else if (target === 2) {
      steps = [fwSteps[0], fwSteps[fwSteps.length - 1]];
    } else {
      const intro = fwSteps[0];
      const conclusion = fwSteps[fwSteps.length - 1];
      const middle = fwSteps.slice(1, -1);
      const middleNeeded = target - 2;
      // Evenly-spaced middle pick (preserves framework rhythm rather than
      // just the first N).
      const middlePicked = middleNeeded >= middle.length
        ? middle
        : middle.filter((_, i) => Math.round((i / middle.length) * middleNeeded) !==
                                  Math.round(((i - 1) / middle.length) * middleNeeded));
      steps = [intro, ...middlePicked.slice(0, middleNeeded), conclusion];
    }
  } else {
    // More cards than the framework defines: keep the intro + conclusion as
    // bookends and fill the gap with VARIED templates so extras don't all
    // collapse to paragraph-content. Cycles through visually-distinct shapes
    // so a "+5 cards" expansion produces a list, a stat row, a quote, a
    // grid, etc. rather than five identical paragraph slides.
    const extraNeeded = target - fwSteps.length;
    const intro = fwSteps[0];
    const conclusion = fwSteps[fwSteps.length - 1];
    const middle = fwSteps.slice(1, -1);
    // Template rotation — pulls from the chosen layout variant when set
    // (data / narrative / visual), otherwise the balanced default rotation.
    const varietyRotation = layoutVariant && VARIANT_ROTATIONS[layoutVariant]
      ? VARIANT_ROTATIONS[layoutVariant]
      : DEFAULT_ROTATION;
    const expansion: typeof fwSteps = [];
    for (let i = 0; i < extraNeeded; i++) {
      const tpl = varietyRotation[i % varietyRotation.length];
      expansion.push({
        title: `Additional Detail ${i + 1}`,
        purpose: 'Expand on the topic with another supporting angle, example, or insight that fits the chosen template.',
        layout: 'single',
        blockTemplate: tpl,
        contentBudget: budgetForTemplate(tpl),
      });
    }
    steps = fwSteps.length === 1
      ? [intro, ...expansion]
      : [intro, ...middle, ...expansion, conclusion];
  }

  // selectedLayouts override: when the user picks specific layout types on
  // the create page, each picked layout becomes exactly one slide's
  // blockTemplate, in order. Framework still provides slide titles +
  // purposes; only the visual treatment is replaced. Past the picks, fall
  // back to the framework's own blockTemplate.
  const layoutOverrides = selectedLayouts && selectedLayouts.length > 0
    ? selectedLayouts
    : null;

  return {
    cards: steps.map((step, i) => {
      // SLIDE 0 IS SACROSANCT — always a cover layout, regardless of what
      // the user picked in the layout picker or what the framework's first
      // step said. Lisa 2026-05-25 generated a deck and saw the title slide
      // rendered as a `key-metric-quad` with bracketed placeholder tokens
      // ([leads generated], [pipeline value]...) because the layout-picker
      // override fired on index 0. A title slide is a title slide; the
      // user's layout picks apply from slide 2 onward.
      const isFirst = i === 0;
      const isLast = i === steps.length - 1;
      const overrideTpl = isFirst ? null : layoutOverrides?.[i];
      const tpl = isFirst
        ? (step.blockTemplate?.startsWith('cover') ? step.blockTemplate : 'cover-subtitle')
        : (overrideTpl || step.blockTemplate || 'paragraph-content');
      const budget = overrideTpl ? budgetForTemplate(overrideTpl) : (step.contentBudget as Record<string, unknown> | undefined);
      // Slide layout: framework wins, else first → 'single' (no accent
      // zone — that was creating a colored stripe on every title slide
      // that read as a placeholder), last → 'split-right', middle → 'single'.
      // The `split-left` default for slide 0 was always wrong here; the
      // cover doesn't need an accent.
      const slideLayout = (step.layout
        || (isFirst ? 'single'
          : isLast ? 'split-right'
          : 'single')
      ) as 'single' | 'split-left' | 'split-right' | 'three-col';
      return {
        id: `card-${i}`,
        title: step.title,
        layout: slideLayout,
        style: 'default' as const,
        blockPlan: [
          {
            type: tpl,
            // SLIDE 0 IS A CLEAN COVER (Lisa 2026-06-03: data on the title slide
            // is unacceptable unless asked). Force a title + one-line tagline
            // only — no bullets, stats, numbers, or body. Content starts slide 2.
            instruction: isFirst
              ? `Title / cover slide. Output ONLY the deck's title (a short, punchy noun phrase for the subject) and a single one-line tagline as the subtitle. Absolutely NO bullets, statistics, numbers, metrics, or body paragraphs — a cover is the title and one tagline, nothing else.`
              : step.purpose,
          },
        ],
        blockTemplate: tpl,
        contentBudget: budget,
      };
    }),
  };
}

// ── Full Pipeline ─────────────────────────────────────────────────────────
// When a framework is provided: skip classification, use framework as blueprint, parallel generation.
// When no framework: full classify → structure → generate pipeline.

export async function generateCardTemplate(options: {
  prompt: string;
  docType: string;
  audience: string;
  tone: string;
  density: string;
  theme: TemplateTheme;
  fileContent?: string | null;
  framework?: { id: string; name: string; steps: { title: string; purpose: string }[]; defaultSkillId?: SkillId | null } | null;
  cardCount?: number;
  /** Layout variant picked on the create page (data / narrative / visual) —
   *  biases the framework-expansion template rotation. Task #20. */
  layoutVariant?: string;
  /** Specific layouts the user explicitly picked — each appears once,
   *  in the order picked. Overrides the framework's per-step blockTemplate.
   *  Task #20 (refined from layoutVariant). */
  selectedLayouts?: string[];
  /** User-chosen Skill override (Voice picker in Customize popover). Wins
   *  over framework.defaultSkillId. Pass `null` to explicitly force generic
   *  generation; omit to fall back to the framework's default. */
  skillIdOverride?: SkillId | null;
  /** How much license the AI has over the user's prompt prose.
   *  'inspire'  — AI writes freely from intent (default, today's behavior).
   *  'build'    — Preserve key phrases from the prompt verbatim; paraphrase
   *               only when restructuring requires it; fill gaps with AI prose.
   *  'verbatim' — Treat the prompt as canonical content. Don't paraphrase.
   *               AI only structures it into card slots + writes connective
   *               headings/transitions. */
  rewriteIntensity?: 'inspire' | 'build' | 'verbatim';
  /** DIL enforcement — run the subjective LLM judge tier per card (default on,
   *  unless the DIL_JUDGE_DISABLED env kill-switch is set). Pass false to use
   *  the cheap deterministic-only gate. */
  enforceJudge?: boolean;
  onCardGenerated?: (cardIndex: number, total: number) => void;
  /** Called when blueprint is ready — before generation starts. Provides card shells with titles/layouts. */
  onBlueprintReady?: (blueprint: CardBlueprint, theme: TemplateTheme) => void;
  /** Called when an individual card's content is generated. Provides the assembled Card object. */
  onCardComplete?: (cardIndex: number, card: Card, total: number) => void;
}): Promise<CardTemplate> {
  const { prompt, docType, audience, tone, density, theme, fileContent, framework, cardCount, layoutVariant, selectedLayouts, skillIdOverride, rewriteIntensity, enforceJudge, onCardGenerated, onBlueprintReady, onCardComplete } = options;
  const t0 = Date.now();

  let blueprint: CardBlueprint;
  let resolvedAudience = audience;
  let resolvedTone = tone;
  // Resolve Skill: explicit override wins (Voice picker in Customize), else
  // framework's defaultSkillId, else null = generic generation. Templates
  // also carry defaultSkillId but flow through a different surface (the
  // starter-template seeding path); when that path threads through here,
  // it should be merged into this resolution.
  const resolvedSkillId: SkillId | null =
    skillIdOverride !== undefined ? skillIdOverride : (framework?.defaultSkillId ?? null);

  if (framework) {
    // Fast path: framework defines the structure, skip classification.
    // Expertise phase removed (Lisa 2026-06-10): always build from the baseline
    // framework blueprint. The domain-skills module is retained on disk but no
    // longer called — the quality lever is layout/visual, not content tailoring.
    blueprint = frameworkToBlueprint(framework, cardCount, layoutVariant, selectedLayouts);
  } else {
    // Organic path (no explicit template): classify then structure.
    // Expertise phase removed (Lisa 2026-06-10) — always use the flexible
    // classify→structure path. cardCount flows into both so the classifier is
    // told the target up front AND structureCards enforces it post-hoc (UAT
    // 2026-05-24: Claude overshoots even with the explicit instruction, so the
    // post-hoc clamp is the contract).
    const classification = await classifyContent(prompt, docType, fileContent, cardCount);
    pipelineLog('classify', `${Date.now() - t0}ms`);
    blueprint = structureCards(classification, cardCount);
    if (!resolvedAudience) resolvedAudience = classification.audiences[0] || '';
    if (!resolvedTone) resolvedTone = classification.tones[0] || '';
  }
  pipelineLog('blueprint', `${framework ? 'framework' : 'organic'} · ${blueprint.cards.length} cards`);

  // ── Grounding guard: don't force fabricated metrics ──────────────────────
  // Metric/stat layouts (key-metric-trio/quad) demand a real number per cell.
  // When the user's TOPIC contains no numbers at all, those layouts force the
  // writer to invent figures ("73%", "240% ROI") — the named anti-pattern in
  // ai-output-standard.md and Lisa's #1 grounding concern. Downgrade them to the
  // qualitative icon-grid equivalent so the SAME content renders as real points
  // (force names + descriptions) instead of fabricated percentages. Runs BEFORE
  // planDeck so the recipe/budget the planner assigns stays coherent with the
  // corrected template. Only fires when the topic is genuinely number-free —
  // topics that supply data keep their metric layouts untouched. Shared
  // detector (topicSuppliesData) — same gate the grounding signal + planner use.
  const topicHasNumbers = topicSuppliesData(prompt);
  // Slot-COUNT-aware: a figure-forcing template whose cell count exceeds the
  // numbers the topic actually supplies forces the writer to invent the
  // shortfall. Downgrade to the qualitative equivalent. This generalizes the old
  // deck-level "topic has zero numbers" gate: a deck with 1 real number that
  // lands a 3-stat layout still fabricates 2 — now caught. No slot → nothing to
  // invent. (Prose fabrication is not slot-driven and is handled by the judge +
  // checkCardQuality grounding net, not here.)
  const topicNumberCount = countTopicNumbers(prompt);
  const NUMERIC_TEMPLATE: Record<string, { cells: number; downgrade: string }> = {
    'key-metric-trio': { cells: 3, downgrade: 'grid-1x3' },
    'key-metric-quad': { cells: 4, downgrade: 'grid-2x2' },
  };
  for (const c of blueprint.cards) {
    const spec = NUMERIC_TEMPLATE[c.blockTemplate ?? ''];
    if (spec && topicNumberCount < spec.cells) {
      console.warn(
        `[card-engine] grounding guard: topic supplies ${topicNumberCount} number(s) < ${spec.cells} cells — "${c.title}" ${c.blockTemplate} → ${spec.downgrade} (avoids fabricated metrics)`,
      );
      c.blockTemplate = spec.downgrade;
    }
  }

  // Same guard for pull-quotes: a quote-pull slide demands a quote + attribution.
  // With no real quote/testimonial in the topic the writer invents one with a
  // fake name + company ("Sarah Chen, CTO, TechFlow") — a fabricated-testimonial
  // anti-pattern. When the topic carries no quote source, render the slide as a
  // punchy statement (paragraph-content) with no attribution to invent.
  const topicHasQuoteSource = /["“”]|\b(said|quote|testimonial|according to|in the words of)\b/i.test(prompt);
  if (!topicHasQuoteSource) {
    for (const c of blueprint.cards) {
      if (c.blockTemplate === 'quote-pull') {
        console.warn(
          `[card-engine] grounding guard: topic has no quote source — "${c.title}" quote-pull → paragraph-content (avoids fabricated testimonial)`,
        );
        c.blockTemplate = 'paragraph-content';
      }
    }
  }

  // ── Design Intelligence Layer — Pass 1a: Deck Planner (pre-generation) ──
  // Additive + defensive. This pre-gen pass assigns every slide a composition
  // recipe + contentBudget. Budgets MUST be known here so they can be injected
  // into the generate prompt. Image ROLES are NOT finalized here — the real
  // per-card `imageIntent` (produced BY the generator) doesn't exist yet, so
  // every role is provisionally 'none'. Final image roles are assigned AFTER
  // generation by assignImageRoles() (Pass 1b below), which has the real
  // intents and varies roles deck-wide. If planning throws or returns nothing,
  // `deckPlan` stays null and the engine runs exactly as before. Phase 2 will
  // supply per-theme archetypes; Phase 1 uses a single default archetype.
  let deckPlan: DeckPlan | null = null;
  try {
    // Phase 2 (wired): all 42 themes are tagged in themes.ts and the archetype
    // is carried onto the runtime TemplateTheme via themeToTemplate, so this
    // reads the real per-theme archetype (recipe whitelist + image-role
    // weighting). DEFAULT_ARCHETYPE remains the defensive fallback for any theme
    // that somehow lacks the field. themeId is left empty here — the client
    // stamps the real active theme id at persist time.
    const archetype = theme.archetype ?? DEFAULT_ARCHETYPE;
    // Recipe-retirement (a), S3a: the planner no longer scores recipes, so the
    // deck-level numbers gate is gone from here (fabricated-number prevention
    // lives in the grounding guard — `topicHasNumbers` → enforce/judge). planDeck
    // now only assigns role + provisional imageRole.
    const plan = planDeck(blueprint, '', archetype, []);
    if (plan && plan.slides.length === blueprint.cards.length) {
      // DESIGN-OWNED IMAGE GATE (Lisa 2026-06-03): the designer decides which
      // slides earn an image at plan time, ranked by recipe, under a hard
      // per-deck cap of MAX_DECK_IMAGES (cover + content). One slot is reserved
      // for the cover (the client owns the cover image via its theme's cover
      // tier — the engine can't resolve the tier from the runtime TemplateTheme).
      // Reserving here keeps the engine's marked count equal to what the client
      // will actually place, so no slide ends up with reserved image space but
      // no image. Content budget = MAX_DECK_IMAGES - 1.
      const MAX_DECK_IMAGES = 3;
      // B2b: the image gate ranks by blockTemplate (the content-led layout
      // authority), so pass each slide's blockTemplate parallel to plan.slides.
      deckPlan = selectImageBudget(
        plan,
        MAX_DECK_IMAGES - 1,
        blueprint.cards.map((c) => c.blockTemplate),
      );
    }
  } catch (err) {
    console.warn('[card-engine] deck planner failed, falling back to default path:', err);
    deckPlan = null;
  }

  // Notify: blueprint is ready (card shells can be shown immediately)
  pipelineLog('grounding-guard', `topicHasNumbers=${topicHasNumbers}`);
  // Recipe-retirement (a), S3b: renamed `plan-deck` → `plan-images`. This pre-gen
  // step no longer scores recipes/compositions (deleted in S3a) — it only plans
  // the deck-wide image budget (role + ≤50% cap). AC1: no recipe/layout decision
  // crosses before `generate`; composition is decided content-led downstream.
  pipelineLog('plan-images', deckPlan ? `${deckPlan.slides.filter((s) => s.imageRole && s.imageRole !== 'none').length} image slides` : 'no plan');
  onBlueprintReady?.(blueprint, theme);

  // Generate all cards in PARALLEL.
  //
  // Two failure modes had to be defended against here:
  //   a) Promise.all rejection — a single bad card rejecting kills the whole
  //      batch. Fix: per-promise .catch that produces a fallback card and
  //      always calls onCardComplete so the UI replaces the skeleton.
  //   b) Hanging promises — the Anthropic SDK silently retries some transient
  //      errors with exponential backoff, which can stall a card for minutes.
  //      .catch can't handle a hang, only a reject. Fix: race each call
  //      against a 60s timeout that rejects so .catch can run.
  //
  // Symptom both fixes address: blueprint shows skeletons; only the first
  // and last cards (the smallest/cheapest prompts) ever fill in.
  const PER_CARD_TIMEOUT_MS = 60_000;
  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s — ${label}`)), ms)
      ),
    ]);

  // Ordered titles for the whole deck — the writer's view of the deck arc, so
  // each slide covers ITS part and doesn't repeat another. Built once, shared.
  const allTitles = blueprint.cards.map((c) => c.title);

  const tGen = Date.now();
  pipelineLog('generate', `${blueprint.cards.length} cards (parallel)`);
  const generationPromises = blueprint.cards.map((cardPlan, i) => {
    // Assemble per-slide narrative context (all fields optional; the prompt
    // builder emits only what's present).
    // AC8 handover: blueprint→writer. The blockTemplate (blueprint intent) + the
    // content budget are handed to the writer. B2b: no recipe is chosen here —
    // the layout is decided later, content-led, at the converter (pickTemplate
    // reconciles the blockTemplate intent against the realized content).
    const bt = cardPlan.blockTemplate ?? '(none)';
    handoverLog(
      'blueprint→writer',
      `blockTemplate=${bt}`,
      `blockTemplate+budget→writer`,
      `blockTemplate+budget→writer`,
    );
    const plannedImageRole = deckPlan?.slides[i]?.imageRole;
    const deckContext: DeckContext = {
      allTitles,
      index: i,
      total: blueprint.cards.length,
      prevTitle: i > 0 ? blueprint.cards[i - 1].title : undefined,
      brief: cardPlan.blockPlan[0]?.instruction || undefined,
      // The planner reserved an image here → tell the writer to produce a
      // concept (otherwise applyDesign suppresses the image for lack of one).
      wantsImage: !!plannedImageRole && plannedImageRole !== 'none',
    };
    return withTimeout(
      generateCard(
        prompt,
        cardPlan,
        {
          contentType: (framework?.id || docType) as ContentClassification['contentType'],
          suggestedCardCount: blueprint.cards.length,
          sections: [],
          audiences: [resolvedAudience],
          tones: [resolvedTone],
        },
        resolvedAudience,
        resolvedTone,
        theme.accentColors,
        resolvedSkillId,
        rewriteIntensity,
        deckPlan?.slides[i]?.contentBudget,
        enforceJudge,
        deckContext,
        density,
      ),
      PER_CARD_TIMEOUT_MS,
      `card ${i} "${cardPlan.title}"`,
    ).then(generatedCard => {
      onCardGenerated?.(i, blueprint.cards.length);

      // Assemble this individual card and notify
      const blocks = generatedCard?.blocks as CardBlock[] || [];
      const card: Card = {
        id: cardPlan.id,
        layout: cardPlan.layout,
        style: cardPlan.style,
        columns: [{ blocks }],
      };
      // Carry the AI designer's image recommendation through to the client so
      // the auto-image-at-creation flow can use its subject/style hints.
      if (generatedCard?.imageIntent) card.imageIntent = generatedCard.imageIntent;
      // DESIGN-OWNED IMAGE GATE (Lisa 2026-06-03): the plan ALREADY decided which
      // slides bear an image (selectImageBudget, ranked + capped at plan time).
      // Use that decision verbatim — do NOT recompute the role from the per-card
      // generator intent here. The client gates image generation on this
      // `slideDesign.imageRole` (non-'none' → generate), so the deck-wide cap is
      // honored and the selection is ranked, not stream-order arbitrary.
      const streamDesign = deckPlan?.slides[i];
      applyDesign(card, streamDesign, cardPlan.blockTemplate);
      if (cardPlan.layout === 'split-left') {
        card.accent = {
          type: 'gradient',
          value: `linear-gradient(135deg, ${theme.accentColors[0]}, ${theme.accentColors[1] || theme.accentColors[0]})`,
          position: 'left',
        };
      } else if (cardPlan.layout === 'split-right') {
        card.accent = {
          type: 'gradient',
          value: `linear-gradient(135deg, ${theme.accentColors[0]}, ${theme.accentColors[1] || theme.accentColors[0]})`,
          position: 'right',
        };
      }
      // Design Intelligence Layer — Pass 3 (Tier A), streaming arm. Run the
      // per-slide deterministic critique so silent fixes (e.g. bracket-token
      // strip, extra-H1 demote) land before the card streams in, and any
      // unresolved issue rides on `card.critique` → the review dot appears the
      // moment the slide shows. The deck-level rhythm pass re-runs at assembly
      // (it needs final, deck-wide image roles). Defensive: critiqueCard never
      // throws — a failure returns the card unchanged.
      const critiquedCard = critiqueCard(card);
      onCardComplete?.(i, critiquedCard, blueprint.cards.length);

      return generatedCard;
    }).catch((err: unknown) => {
      // Per-card failure: log to console for debugging, build a minimal
      // placeholder card the user can fill in. CRITICAL: never put the
      // raw error message in user-visible content — Lisa hit a Zod
      // validation error 2026-05-25 that surfaced as `(Generation failed
      // — [{"code":"invalid_value","values":[...]}])` rendered AS THE
      // SLIDE CONTENT. Embarrassing and unactionable. Now the user gets
      // their planned heading + a friendly invitation to write the body,
      // and the technical reason stays in the server logs.
      const reason = err instanceof Error ? err.message : 'Generation failed';
      console.error(`[card-engine] Card ${i} ("${cardPlan.title}") failed:`, reason);

      const fallbackBlocks: CardBlock[] = [
        { type: 'heading', level: 2, content: cardPlan.title },
        { type: 'paragraph', content: 'Add your content here, or regenerate this slide from the card menu.' },
      ];
      const card: Card = {
        id: cardPlan.id,
        layout: cardPlan.layout,
        style: cardPlan.style,
        columns: [{ blocks: fallbackBlocks }],
      };
      // Carry the design decision onto the fallback so the slide still reads
      // as planned (placement reconcile is a no-op without an imageIntent).
      applyDesign(card, deckPlan?.slides[i], cardPlan.blockTemplate);
      onCardComplete?.(i, card, blueprint.cards.length);
      return { id: cardPlan.id, blocks: fallbackBlocks } as unknown as GeneratedCard;
    });
  });

  // allSettled is no longer needed because every promise above resolves
  // (failures are caught into a fallback card). We still await to assemble.
  const generatedCards = await Promise.all(generationPromises);
  pipelineLog('generate-done', `${Date.now() - tGen}ms`);

  // DESIGN-OWNED IMAGE GATE (Lisa 2026-06-03): image roles were finalized at
  // plan time by selectImageBudget (ranked + capped, cover slot reserved). We no
  // longer re-derive them post-generation from the per-card generator intent —
  // that path had no count cap and let the generator over-flag images. The
  // plan's selection is authoritative; assembly just uses it.

  // Assemble full template
  const template = assembleTemplate(
    prompt.slice(0, 60),
    prompt,
    docType,
    blueprint,
    generatedCards,
    theme,
    deckPlan,
  );

  // ── Design Intelligence Layer — Pass 3 (Tier A): the Critique Loop ──────
  // Run the deterministic critique over the fully assembled deck: per-slide
  // checks (silent auto-fix + flag) PLUS the deck-level rhythm adjacency pass
  // (which needs the final deck-wide image roles assigned just above). This is
  // the authoritative critique on the returned (non-streaming) deck and the
  // re-run that adds rhythm flags the streaming arm couldn't compute. Tier B
  // (VLM) is opt-in / low-confidence only and is NOT run here — it's a gated
  // entry point (`critiqueDeckTierB`) invoked by the "Polish deck" action.
  //
  // Defensive: critiqueDeck never throws — on any failure it returns the
  // original cards, so the deck renders exactly as it does today.
  pipelineLog('assemble');
  template.cards = critiqueDeck(template.cards);
  pipelineLog('done', `total ${Date.now() - t0}ms`);
  return template;
}

// Re-exports
export type { ContentClassification, CardBlueprint, GeneratedCard, ImageIntent } from './types';
