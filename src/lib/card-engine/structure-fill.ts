/**
 * Structure-fill generation — the manifest-driven generation path.
 *
 * Instead of IMPROVISING a layout from loosely-typed blocks (the index.ts
 * pipeline) and hoping the converter places them well, this path FILLS the
 * blanks of a VALIDATED Figma structure. The manifest
 * (figma-template-structures.json) defines, per layout, a set of role+group
 * slots with fixed geometry and a derived character budget. The generator's
 * only job is to write grounded copy for each blank within its budget; the
 * geometry, skin, and decorations come straight from the validated structure.
 *
 * This solves the R&D bottleneck the manifest was built for: mapping layout
 * STRUCTURE → element SEMANTICS. The model never decides where things go.
 *
 * Stages (greppable as `[structure-fill]`):
 *   PLAN   — pick an ordered list of validated layouts + one skin for the deck
 *            (grounding-gated: numeric layouts only when the topic supplies
 *            real numbers).
 *   FILL   — per slide, the model writes each blank keyed by role:group,
 *            respecting the slot's character budget (lock-the-box).
 *   ASSEMBLE — build each filled structure via buildStructureTemplate(fill)
 *            and merge into one multi-card CardTemplate.
 */

import { getProvider, getModel, type ToolUseBlock, type Tool } from '@/lib/ai-provider';
import { matchFact, parseMeasure, factsWithNumber, type SourceFact } from './source-facts';
import { extractSourceFactsCached } from './source-facts-extract';
import { z } from 'zod';
import type { Card, CardTemplate } from '@/types/card-template';
import { buildSkillVoiceInstructions, type SkillId } from '@/lib/document-skills';
import { fitCardText } from './text-fit';
import { logDeckGeneration, writeDeckDetail, appendCostRow } from './deck-metrics';
import { auditDeckGeometry, summarizeFit } from './geometry-audit';
import { beginUsageMeter, readUsageMeter } from './usage-meter';
import { applyCoverImage, applyManifestImage, applyOverlayScrim, pickForSlot } from './structure-images';
import { findLibraryImagesByIds } from '@/lib/imageLibrary';
// Deterministic editorial backstop ported from the legacy improvise path's
// enforce.ts onto the structured default (the renderer shows `**bold**` / `# `
// raw, and gpt-4o still emits it into slot values; structured had no guard).
// The module is KEPT and rewired, not duplicated — one source of truth.
import { stripMarkdownTokens, collapseStutters } from './enforce';
import { resolveComboFamily } from './combo-baseline';
import {
  buildStructureTemplate,
  coverAcceptsImage,
  describeLayoutSlots,
  imageSlotsFor,
  overlayInfoFor,
  layoutCatalogue,
  skinSummary,
  STRUCTURE_SKIN_IDS,
  type StructureFill,
  type LayoutSlotSpec,
} from '@/data/structureTemplates';

// ── Logging (content-free, dev-only) ─────────────────────────────────────────
const SF_LOG = process.env.NODE_ENV !== 'production';
function sfLog(stage: string, detail?: string): void {
  if (!SF_LOG) return;
  console.log(`[structure-fill] ${stage}${detail ? ` · ${detail}` : ''}`);
}

// ── Grounding (FR11) — does the topic supply real numbers? ────────────────────
// Mirrors index.ts topicSuppliesData/countTopicNumbers (years/quarters/version/
// ordinal numerals stripped) so the numeric-layout gate matches the rest of the
// engine. Kept local + minimal to avoid an index.ts export cycle.
function topicNumberSet(prompt: string): Set<string> {
  const stripped = (prompt || '')
    .replace(/\b(1[89]\d{2}|20\d{2})s?\b/g, ' ')
    .replace(/\bQ[1-4]\b/gi, ' ')
    .replace(/\b24\/7\b/g, ' ')
    .replace(/#\d+/g, ' ')
    .replace(/\bv\d+(?:\.\d+)*\b/gi, ' ');
  return new Set(stripped.match(/\d+(?:\.\d+)?/g) || []);
}
function countTopicNumbers(prompt: string): number {
  return topicNumberSet(prompt).size;
}

/** Does the source contain a REAL quote — a sentence-length passage in quotation
 *  marks? Quote layouts are offered only when this is true, so the writer has a
 *  genuine quote to place instead of fabricating one (FR11). Conservative: a
 *  quoted term/name ("AI", a product) doesn't count — the quote must be ≥5 words. */
function sourceHasQuote(text: string): boolean {
  if (!text) return false;
  const m = text.match(/[“"«]([^“”"«»]{25,})[”"»]/);
  if (!m) return false;
  return (m[1] ?? '').trim().split(/\s+/).length >= 5;
}

// FR11 fail-closed for the data layouts (02-stat / 12-diagram). A delta or
// metric value that carries a number the TOPIC never supplied is fabricated —
// replace it with an honest "N/A" rather than ship an invented statistic. This
// is the structured-path counterpart of stripUngroundedStats() in the improvise
// pipeline. Only the two number-claim layouts are policed; ordinals/dates in
// agenda/timeline/process (01-04, "March") are structural, not claims.
const NUMERIC_CLAIM_LAYOUTS = new Set(['02-stat', '12-diagram']);
export function groundNumericFill(
  fill: StructureFill,
  layoutKey: string,
  specs: LayoutSlotSpec[],
  topic: string,
  facts: SourceFact[] = [],
  subject: string | null = null,
): { fill: StructureFill; stripped: string[] } {
  if (!NUMERIC_CLAIM_LAYOUTS.has(layoutKey)) return { fill, stripped: [] };
  const topicNums = topicNumberSet(topic);
  const stripped: string[] = [];
  const policed = new Set(['delta', 'metric-value']);
  // A metric VALUE is grounded if every number it carries appears in the topic.
  const valueGrounded = (v: string): boolean => {
    const nums = v.match(/\d+(?:\.\d+)?/g) || [];
    return nums.every((n) => topicNums.has(n));
  };
  // A DELTA is a change-claim (↑ 12%, −3pts). FR11 / Path-B:
  // Foxit Slides must NOT DERIVE a numeric delta from two stated values — that
  // derivation path is exactly what fabricated "↑2pts YoY" on a metric whose
  // prior the source never gave. A source states LEVELS ("78%"); a stated CHANGE
  // reads "3 pts", "2 points", "5 bps". So a numeric delta is grounded ONLY when
  // its magnitude+unit phrase appears verbatim in the source — a bare digit is
  // not enough (it matches any of the dozens of figures in a data doc). A delta
  // with NO delta-unit ("↑ 5") cannot be grounded as a change and is dropped.
  // Numberless deltas ("Steady", "Stable") carry no figure and are always fine.
  const UNIT_ALT = '(?:pts?|points?|percentage\\s+points?|bps|basis\\s+points?|%)';
  const UP_WORDS = /↑|▲|\bup\b|\brose\b|\brise\b|\bgrew\b|\bgrowth\b|\bgain\w*|\bincreas\w*|\bimprov\w*/i;
  const DOWN_WORDS = /↓|▼|\bdown\b|\bfell\b|\bfall\w*|\bdrop\w*|\bdeclin\w*|\bdecreas\w*|\bcontract\w*/i;
  const dirIn = (s: string): number => (UP_WORDS.test(s) ? 1 : 0) - (DOWN_WORDS.test(s) ? 1 : 0);
  const deltaDir = (v: string): number => {
    const d = dirIn(v);
    if (d !== 0) return d;
    if (/(^|[^\d])\+\s*\d/.test(v)) return 1; // "+3"
    if (/(^|[^\d])[-−]\s*\d/.test(v)) return -1; // "-2" / "−2"
    return 0;
  };
  const deltaPhraseInSource = (v: string): boolean => {
    const m = v.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})`, 'i'));
    if (!m) return false; // numeric delta with no groundable unit → drop (conservative)
    const mag = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex specials
    const unit = m[2].toLowerCase();
    const found = new RegExp(`\\b${mag}\\s*${UNIT_ALT}`, 'i').exec(topic);
    if (!found) return false; // magnitude+unit not stated in the source
    // Direction agreement: a flipped arrow (source says "fell", deck shows "↑") is
    // a misrepresentation. When the source states a direction near the phrase AND
    // the delta states one, they must match; otherwise drop.
    const win = topic.slice(Math.max(0, found.index - 40), found.index + found[0].length + 40);
    const sd = dirIn(win);
    const dd = deltaDir(v);
    if (sd !== 0 && dd !== 0 && sd !== dd) return false; // flipped direction → drop
    // "%" is an ambiguous unit — a LEVEL ("78%") reads identically to a CHANGE.
    // Require an explicit change word next to the figure in the source; a bare
    // level like "66%" does not license a delta. Catches a delta that borrows a
    // real source % onto the wrong metric ("↑ From 66%" on the 78% tile). pts/bps
    // are unambiguous change units and are exempt. NOTE: cosmetic — true metric
    // attribution needs upstream per-metric facts.
    if (unit === '%' && sd === 0) return false;
    return true;
  };
  const deltaGrounded = (v: string): boolean => {
    const nums = v.match(/\d+(?:\.\d+)?/g) || [];
    if (nums.length === 0) return true; // qualitative delta ("Steady") — no figure to fabricate
    return deltaPhraseInSource(v); // numeric delta — magnitude+unit stated, direction agrees
  };
  const out: StructureFill = {};
  for (const spec of specs) {
    const entry = fill[spec.key];
    if (entry === undefined) continue;
    if (!policed.has(spec.role)) { out[spec.key] = entry; continue; }
    // METRIC-AWARE grounding (per-metric fact contract) — when it has extracted
    // facts, a metric VALUE must be the source's value FOR ITS METRIC, not just a
    // number that appears somewhere. Pair each value with its metric-label
    // (parallel arrays under the same group) and check via matchFact. CONSERVATIVE:
    // strip ONLY when the extractor CAPTURED this number but on a different metric
    // (factsWithNumber non-empty + no match). If the number isn't in the facts at
    // all, the extractor may be incomplete → fall back to the verbatim check, so an
    // incomplete extractor can't over-strip. subject is null (Foxit Slides doesn't thread
    // a per-slide subject yet) → this closes wrong-METRIC; wrong-SUBJECT activates
    // once a slide subject is threaded.
    if (spec.role === 'metric-value' && facts.length) {
      const group = spec.group ?? '';
      const lblEntry = fill[`metric-label:${group}`];
      const labels = Array.isArray(lblEntry) ? lblEntry : lblEntry !== undefined ? [String(lblEntry)] : [];
      const stripTo = (v: string, i: number, why: string): string => {
        stripped.push(`${spec.key}[${i}]="${v}"${why}`);
        return 'N/A';
      };
      const metricAware = (v: string, i: number): string => {
        const parsed = parseMeasure(v);
        // not a parseable measure, or the extractor never captured this number →
        // fall back to the verbatim number check (don't over-strip on incompleteness)
        if (!parsed || !factsWithNumber(facts, parsed.value, parsed.unit).length) {
          return valueGrounded(v) ? v : stripTo(v, i, '');
        }
        const label = labels[i] ?? '';
        // subject = the deck's primary subject → also catches a COMPETITOR's number
        // on this slide (a fact whose subject differs). matchFact keeps null-subject
        // facts, so single-subject decks don't over-strip.
        if (matchFact(label, subject, parsed.value, parsed.unit, facts)) return v;
        return stripTo(v, i, ` (wrong-metric/subject for "${label}"${subject ? ` · ${subject}` : ''})`);
      };
      out[spec.key] = Array.isArray(entry) ? entry.map(metricAware) : metricAware(entry, 0);
      continue;
    }
    const ok = spec.role === 'delta' ? deltaGrounded : valueGrounded;
    // An ungrounded DELTA is dropped to empty (the builder then skips its pill —
    // no floating "N/A" badge over the hero). An ungrounded metric VALUE keeps an
    // honest "N/A" (the cell must show something).
    const replacement = spec.role === 'delta' ? '' : 'N/A';
    const fixOne = (v: string): string => {
      if (ok(v)) return v;
      stripped.push(`${spec.key}="${v}"`);
      return replacement;
    };
    out[spec.key] = Array.isArray(entry) ? entry.map(fixOne) : fixOne(entry);
  }
  return { fill: out, stripped };
}

// FR11 fail-closed for contact details. An email / phone / website in a filled
// value that the source never supplied is fabricated. Mutates `fill` in place,
// blanking any value that carries an ungrounded contact token. Returns the list
// of stripped values (for logging). Empty values fall back to the (now blank)
// placeholder, so nothing fabricated renders.
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(?:com|io|ai|co|org|net|dev)\b/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
function stripUngroundedContact(fill: StructureFill, source: string): string[] {
  const stripped: string[] = [];
  const grounded = (v: string): boolean => {
    const m = v.match(EMAIL_RE) || v.match(URL_RE) || v.match(PHONE_RE);
    if (!m) return true; // no contact token → fine
    return source.toLowerCase().includes(m[0].toLowerCase()); // keep only if in source
  };
  for (const key of Object.keys(fill)) {
    const entry = fill[key];
    if (Array.isArray(entry)) {
      const cleaned = entry.map((v) => (grounded(v) ? v : (stripped.push(`${key}="${v}"`), '')));
      fill[key] = cleaned;
    } else if (typeof entry === 'string' && !grounded(entry)) {
      stripped.push(`${key}="${entry}"`);
      fill[key] = '';
    }
  }
  return stripped;
}

// FR11 fail-closed for IDENTITY slots — a presenter name (author) or a date the
// source never supplied is fabricated (the "Jordan Maxwell / October 2023"
// problem on the cover). These slots are inherently ungroundable for a bare
// prompt, yet the model fills them with invented values despite the prompt-level
// ban. Blank any author/date value whose text doesn't appear in the source, so
// nothing fabricated renders (an empty slot renders empty — no placeholder leak,
// the user types their own). Mutates `fill`; returns the stripped values.
const IDENTITY_ROLES = new Set(['author', 'date']);
function stripUngroundedIdentity(
  fill: StructureFill,
  specs: LayoutSlotSpec[],
  source: string,
): string[] {
  const src = source.toLowerCase();
  const stripped: string[] = [];
  const check = (key: string, v: string): string => {
    const t = String(v ?? '').trim();
    if (!t) return '';
    if (src.includes(t.toLowerCase())) return t; // value actually in the source
    stripped.push(`${key}="${t}"`);
    return '';
  };
  for (const spec of specs) {
    if (!IDENTITY_ROLES.has(spec.role)) continue;
    const entry = fill[spec.key];
    if (entry === undefined) continue;
    fill[spec.key] = Array.isArray(entry)
      ? entry.map((v) => check(spec.key, v))
      : check(spec.key, entry);
  }
  return stripped;
}

// How much source/prompt text feeds the planner + each slide fill. Raised from
// 6000 so a long pasted prompt or
// attached file isn't silently truncated. Kept to a generous ceiling rather than
// unbounded so a pathological paste can't overflow the model context and throw.
const SOURCE_CHAR_BUDGET = 60000;

// Layouts that demand multiple real numbers. Gated out when the topic can't
// supply them — otherwise the writer fabricates figures (FR11 violation).
const NUMERIC_LAYOUTS: Record<string, number> = {
  '02-stat': 4,    // hero metric + 3 sub-metrics (legacy, gated)
  '12-diagram': 5, // 5 bar values (legacy, gated)
  'combo-stat-1': 1,  // one real figure is the point
  'combo-metrics': 2, // a row of 2–4 real figures
};

// ── Stage PLAN: ordered validated layouts + skin ─────────────────────────────

const LAYOUT_ENUM = layoutCatalogue().map((l) => l.key);
// The plan tool may only offer SELECTABLE layouts — otherwise the model picks a
// gated layout (e.g. 03-comparison after combos replaced it) and it downgrades to
// 05-content instead of the model reaching for the combo equivalent.
const SELECTABLE_LAYOUT_ENUM = layoutCatalogue().filter((l) => l.selectable).map((l) => l.key);
// Structured planner skins = the Figma-validated skins only. Captured templates
// (Compass) have their OWN generation path (native-template.ts) and are NOT
// offered to the structured planner or the theme picker.
const SKIN_ENUM = [...STRUCTURE_SKIN_IDS];

const NARRATIVE_ROLES = ['hook', 'setup', 'evidence', 'cause', 'consequence', 'response', 'close'] as const;

const PlanSchema = z.object({
  skinId: z.string(),
  // Phase-D holistic planning: one sentence the whole deck must land. Threaded
  // into every slide's writer so each advances the same goal. Optional for
  // robustness (older/monolithic plans omit it).
  deckGoal: z.string().optional(),
  slides: z
    .array(
      z.object({
        layoutKey: z.string(),
        // Phase A (outline-first): a TOC-grade section title. Authoritative source
        // for the slide's title slot AND the deterministic agenda. Optional in the
        // schema (fallback to focus) for robustness against model drift.
        title: z.string().optional(),
        focus: z.string(),
        // The ONE takeaway this slide must land — a single specific point (not a
        // label). It becomes the heading's intent; the body supports ONLY it. This
        // is the "one idea per slide" contract, made explicit so the writer builds
        // to it and the judge verifies delivery. Optional for robustness.
        takeaway: z.string().optional(),
        // Phase-D: this slide's position in the narrative arc. Drives the writer's
        // role-shaping prose (a `cause` slide names its cause, a `consequence`
        // references what caused it) — kills floating-fact slides. `.catch`
        // drops an off-enum value rather than failing the whole plan parse.
        narrativeRole: z.enum(NARRATIVE_ROLES).optional().catch(undefined),
      }),
    )
    .min(1),
});
export type StructurePlan = z.infer<typeof PlanSchema>;

const PLAN_TOOL: Tool = {
  name: 'report_structure_plan',
  description:
    'Return the deck plan: the deck GOAL (one sentence the whole deck must land), which validated skin to use, and an ordered list of validated layouts (each with a TOC title, a one-line focus, and its narrative-arc role).',
  input_schema: {
    type: 'object',
    properties: {
      skinId: { type: 'string', enum: [...SKIN_ENUM] },
      deckGoal: { type: 'string', description: 'ONE sentence stating what the audience should leave with. Specific to the topic, not boilerplate. Every slide advances this.' },
      slides: {
        type: 'array',
        description: 'Ordered slides. First slide is the cover (01-cover); a closing/divider may end the deck.',
        items: {
          type: 'object',
          properties: {
            layoutKey: { type: 'string', enum: [...SELECTABLE_LAYOUT_ENUM] },
            title: { type: 'string', description: 'A short TOC-grade section title (punchy noun phrase, ≤ ~40 chars) naming THIS slide. These become the deck table of contents.' },
            focus: { type: 'string', description: 'One line: what THIS slide covers in the deck arc.' },
            takeaway: { type: 'string', description: 'The ONE takeaway this slide must land — a single, specific POINT the audience should leave with (e.g. "Match plants to the roof\'s real light and load", NOT a label like "Getting started"). One idea per slide: everything on the slide supports THIS. If a slide would need two unrelated takeaways, SPLIT it into two slides instead.' },
            narrativeRole: { type: 'string', enum: [...NARRATIVE_ROLES], description: 'This slide\'s job in the deck arc: hook (open) · setup (frame) · evidence (data/support) · cause (names WHY something happened) · consequence (names the effect / what a cause led to) · response (the answer/action) · close. Assign so the arc reads as a story, not a list of facts.' },
          },
          required: ['layoutKey', 'title', 'focus', 'takeaway', 'narrativeRole'],
        },
      },
    },
    required: ['skinId', 'deckGoal', 'slides'],
  },
};

/** STAGE PLAN — ask the model to lay out the deck as a sequence of validated
 *  structures + a skin. Grounding-gated: numeric layouts are removed from the
 *  catalogue the model sees when the topic supplies too few numbers, then
 *  re-checked post-hoc. */
export async function planStructureDeck(
  prompt: string,
  cardCount?: number,
  skinHint?: string,
  sourceText?: string,
  density?: string,
  structureHint?: string[],
  audience?: string,
  tone?: string,
  /** Phase-D pre-planner brief (engine-agnostic, from writeDeckBrief). When
   *  present, the planner maps each slide INTENTION to a validated structure
   *  and carries its narrative role — the same holistic pass the Compass path
   *  runs. Null → the planner reasons from topic/source alone (prior behaviour). */
  brief?: import('./deck-brief').DeckBrief | null,
  /** Whether deck images are on. Image-bearing imported layouts are offered ONLY
   *  when true (they'd render an empty image region otherwise). */
  withImages?: boolean,
): Promise<StructurePlan> {
  // Numbers can be grounded by the prompt OR the attached source.
  const numbers = countTopicNumbers(`${prompt}\n${sourceText ?? ''}`);
  const hasQuote = sourceHasQuote(`${prompt}\n${sourceText ?? ''}`);
  const src = (sourceText ?? '').trim();
  const isExtensive = density === 'extensive' || density === 'detailed';
  const allowedLayouts = layoutCatalogue().filter((l) => {
    // 06-quote is gated OUT of generation: it demands a pull-quote + an
    // attribution (name/company), and the engine can't tell a real quote from a
    // fabricated one — so it invented both (e.g. "Moons: Guardians of Planets"
    // — GenerationGenius). Never use a quote layout without a real quote
    //. It stays in the catalogue for manual/preview use.
    // Imported layouts flagged not-selectable (chart/diagram/intros/media overlay).
    if (l.selectable === false) return false;
    // Quote layouts (Foxit Slides's 06-quote + imported) ONLY when the source has a real
    // quote — never fabricate one (FR11,. No quote → not offered.
    if ((l.key === '06-quote' || l.needsQuote) && !hasQuote) return false;
    // Image layouts render an empty image region without the deck-image pipeline.
    if (l.hasImage && !withImages) return false;
    // Number-gate: Foxit Slides's own numeric layouts OR an imported layout's minNumbers.
    const need = NUMERIC_LAYOUTS[l.key] ?? l.minNumbers;
    return !need || numbers >= need;
  });

  const skinList = SKIN_ENUM.map((id) => {
    const s = skinSummary(id);
    return `- ${id}${s ? ` (${s.label}): ${s.character}` : ''}`;
  }).join('\n');
  const layoutList = allowedLayouts.map((l) => `- ${l.key} (${l.label}): ${l.purpose}`).join('\n');

  const countLine = cardCount && cardCount > 0
    ? `Produce EXACTLY ${cardCount} slides — the user picked this count; it is a hard requirement.${cardCount <= 6 ? ` This is a SHORT deck — every slide is precious. Do NOT spend a slide on a closing or a divider (they carry no content); use the cover plus ${cardCount - 1} SUBSTANTIVE content slides. Tell the whole story densely within them.` : ''}`
    : isExtensive
      ? 'Cover the source thoroughly: use as many slides as the material warrants (often 8–12). Prefer BREADTH — give each distinct point its own slide rather than cramming.'
      : 'Choose the smallest slide count that tells the story well (usually 5–8).';

  const sourceBlock = src
    ? `\nSOURCE MATERIAL (ground the deck in THIS — it is the authoritative content; plan slides that cover its real substance, in a coherent narrative arc):\n"""\n${src.slice(0, SOURCE_CHAR_BUDGET)}\n"""\n`
    : '';

  // Inspire-structure mode: the user's reference document supplied a section
  // outline. Bias the slide sequence toward it (the route now threads this in;
  // it used to be extracted and silently dropped before reaching the planner).
  const structureBlock = structureHint && structureHint.length
    ? `\nSUGGESTED OUTLINE (the user's reference followed this section order — use it as a strong guide for the slide SEQUENCE, mapping each section to an appropriate structure; merge or split only where it clearly improves the deck):\n${structureHint.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
    : '';

  // Audience/Tone framing (Customize popover) — bias the ARC and section titles
  // toward who's reading and the desired register. Facts unaffected (FR11).
  const aud = (audience ?? '').trim();
  const tn = (tone ?? '').trim();
  const framingLine = aud || tn
    ? `\nFRAMING:${aud ? ` this deck is for ${aud} — choose a structure sequence and section titles pitched to them.` : ''}${tn ? ` Overall tone: ${tn}.` : ''}\n`
    : '';

  // Phase-D: a pre-planner brief already decided the deck GOAL, narrative ARC,
  // and per-slide content INTENTIONS. When present, the planner's job narrows to
  // mapping each intention to the validated structure whose SHAPE matches it —
  // so layouts serve concrete content (no force-fit empty slots) and each slide
  // carries its narrative role forward to the writer.
  const briefBlock = brief
    ? `\n${(await import('./deck-brief')).formatDeckBriefForPlanner(brief)}\n\nMap the SLIDE INTENTIONS above onto the deck: produce ONE slide per intention IN ORDER, picking the validated structure whose shape matches that intention's content type (match on structure — item count, image/table/chart present or not — NOT topical keywords), and carry each intention's narrativeRole through to the slide. Use the pre-analyzed deck goal as \`deckGoal\`.\n`
    : '';

  const planPrompt = `You are a presentation art director. Plan a deck for this topic by choosing an ordered sequence of VALIDATED slide structures and ONE visual skin. You do NOT write the slide content here — only the structure.

TOPIC: "${prompt}"
${sourceBlock}${structureBlock}${framingLine}${briefBlock}
${countLine}

PICK ONE SKIN (visual style for the whole deck):
${skinList}
${skinHint ? `\nThe user leans toward: ${skinHint}.` : ''}

AVAILABLE STRUCTURES (choose from these ONLY — each is a validated layout):
${layoutList}

RULES:
- Slide 1 MUST be 01-cover.
- Use combo-body for general explanatory slides — it is the workhorse.
- Match the structure to the section's job: a two-option comparison → combo-table-cols, ordered steps or a milestone schedule → combo-timeline, three-to-four parallel points → combo-cards, a section break → 08-divider, a numbered overview → 10-agenda, a memorable exact line from the source → combo-quote.
${numbers < NUMERIC_LAYOUTS['combo-metrics'] ? '- This topic supplies few/no hard numbers, so number layouts (combo-stat, combo-metrics) are unavailable — do not fabricate metrics.' : '- Use combo-stat / combo-metrics only where the topic genuinely supplies real numbers.'}
- A closing slide (09-closing) is a good final slide for decks that end with a CTA/contact.
- Choose each structure by the section's ACTUAL content, never for variety. combo-body is the correct choice for any general explanatory section — use it as often as the content calls for it, even on consecutive slides. Reach for a specialized structure (combo-cards, combo-table, combo-timeline, combo-stat, combo-metrics, 10-agenda) ONLY when the section genuinely has that shape: three-to-four parallel items, a real two-option comparison, real ordered steps or schedule, real numbers. Do NOT pick a specialized layout just to avoid repeating combo-body — a forced cards/stat slide on general content leaves slots empty and reads as broken. Variety is a RESULT of matching content, not a goal.${withImages ? `
- IMAGES ARE ON: for 1–2 sections whose point is genuinely helped by SEEING a real subject — a place, building, artifact, scene, or a notable person's world — choose combo-body-image (prose beside a supporting photo). Pick it for the sections most improved by a visual, NOT every slide, and keep data/comparison/timeline/number sections in their own structural layouts (a photo fights their form). The image itself is sourced later to match that slide's focus.` : ''}
- Each slide's "title" is a short TOC-grade section title (a punchy noun phrase, ≤ ~40 chars) — these become the deck's table of contents, so make them specific and parallel.
- Each slide's "focus" is one line naming what that slide specifically covers (used to write its content next). Be specific to the topic.
- Each slide's "takeaway" is the ONE point that slide must land — a single, specific claim the audience leaves with, phrased as a real POINT ("Match plants to the roof's real light and load"), NOT a topic label ("Getting started"). ONE idea per slide: everything on the slide supports this single takeaway. If a focus would need two unrelated takeaways to cover it, SPLIT it into two slides — never put two competing points on one slide. The "title" stays a short topic label (for the heading + agenda); the "takeaway" is shown as the slide's lead/statement line, and the body supports it.
- Set "deckGoal" to ONE sentence naming what the whole deck must leave the audience with (specific to the topic).
- Give every slide a "narrativeRole" so the deck reads as a STORY, not a list of facts: hook → setup → evidence/cause/consequence → response → close. A "cause" slide names WHY something happened; a "consequence" slide names the effect of a cause shown elsewhere. Assign roles so each slide connects to its neighbors.

Return via the report_structure_plan tool.`;

  const provider = getProvider();
  // Port step 1 (document-studio-contracts.md §2.1): pin a LOW planner temperature
  // to attack the 0.33 structural-consistency churn (same prompt → different layout
  // picks at the provider default ~1.0). Only the PLANNER is pinned; the writer fill
  // call stays at default so prose stays varied. Env-overridable for A/B sweeps.
  const plannerTemp = Number(process.env.PLANNER_TEMPERATURE);
  const response = await provider.createMessage({
    model: getModel(),
    max_tokens: 1500,
    temperature: Number.isFinite(plannerTemp) ? plannerTemp : 0.3,
    tools: [PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'report_structure_plan' },
    messages: [{ role: 'user', content: planPrompt }],
  });
  const toolUse = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) throw new Error('No structure-plan tool_use response');

  const raw = (toolUse.input ?? {}) as Record<string, unknown>;
  const parsed = PlanSchema.parse(raw);

  // Coerce into the validated set + grounding gate (the model occasionally
  // drifts off-enum or picks a numeric layout it was told not to).
  let skinId = SKIN_ENUM.includes(parsed.skinId) ? parsed.skinId : SKIN_ENUM[0];
  if (skinHint && SKIN_ENUM.includes(skinHint)) skinId = skinHint;
  const validKeys = new Set(LAYOUT_ENUM);
  const gateByKey = new Map(layoutCatalogue().map((l) => [l.key, l]));
  // ── Structure-usage gates ────────────────────────────────
  // Data/specialized layouts (table, timeline, metrics, stat) get over-picked for
  // VARIETY on narrative topics — a forced comparison table, an empty timeline, a
  // fabricated metric all read as broken. A layout of this class is allowed ONLY
  // when the deck can genuinely ground it, and AT MOST ONE per deck; everything
  // else tells the story as prose (combo-body). Grounding signals:
  //   · table    → needs a real SOURCE document (topic-only can't ground a table)
  //   · timeline → needs real chronology (a year, a month, or ordered phases)
  //   · metrics/stat → needs real numbers (the existing NUMERIC_LAYOUTS gate)
  const corpus = `${prompt} ${src}`;
  const hasSource = src.length > 80;
  const dateSignal =
    /\b(1[5-9]\d{2}|20\d{2})\b/.test(corpus) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(corpus) ||
    /\b(step|phase|stage|day|week|month|quarter|year)\s*\d/i.test(corpus);
  let dataLayoutsUsed = 0;
  const slides = parsed.slides
    .filter((s) => validKeys.has(s.layoutKey))
    .map((s) => {
      const gate = gateByKey.get(s.layoutKey);
      const toBody = (tag: string, why: string) => {
        sfLog(tag, `${s.layoutKey}→combo-body (${why})`);
        return { layoutKey: 'combo-body', title: s.title, focus: s.focus, takeaway: s.takeaway, narrativeRole: s.narrativeRole };
      };
      // A not-selectable layout, or a quote layout on a source with NO real quote,
      // downgrades to the workhorse (never fabricate a quote — FR11).
      const quoteBlocked = (s.layoutKey === '06-quote' || gate?.needsQuote) && !hasQuote;
      if (gate?.selectable === false || quoteBlocked) {
        return toBody('plan-quote-swap', quoteBlocked ? 'no source quote' : 'not selectable');
      }
      const need = NUMERIC_LAYOUTS[s.layoutKey] ?? gate?.minNumbers;
      // Numeric layout the topic can't ground → downgrade to the workhorse.
      if (need && numbers < need) {
        return toBody('plan-ground-swap', `topic numbers=${numbers}<${need}`);
      }
      // Structure-usage gate: table needs a source, timeline needs dates, and no
      // deck carries more than one data layout total.
      const k = s.layoutKey;
      const isTable = k.startsWith('combo-table');
      const isTimeline = k.startsWith('combo-timeline');
      const isMetric = k.startsWith('combo-metrics') || k === 'combo-stat-1';
      if (isTable || isTimeline || isMetric) {
        if (isTable && !hasSource) return toBody('plan-structure-gate', 'a table needs a source document');
        if (isTimeline && !dateSignal) return toBody('plan-structure-gate', 'no real dates for a timeline');
        if (dataLayoutsUsed >= 1) return toBody('plan-structure-gate', 'one data layout per deck');
        dataLayoutsUsed += 1;
      }
      return s;
    });

  // Enforce cover-first.
  if (slides.length === 0 || slides[0].layoutKey !== '01-cover') {
    slides.unshift({ layoutKey: '01-cover', title: prompt.slice(0, 60), focus: `Title slide for: ${prompt.slice(0, 80)}`, narrativeRole: 'hook' });
  }

  // Enforce the requested count (truncate / pad with content slides).
  let finalSlides = slides;
  if (cardCount && cardCount > 0 && slides.length !== cardCount) {
    if (slides.length > cardCount) {
      finalSlides = slides.slice(0, cardCount);
    } else {
      const pad = Array.from({ length: cardCount - slides.length }, (_, i) => ({
        layoutKey: 'combo-body',
        title: `Additional detail ${i + 1}`,
        focus: `Additional supporting detail ${i + 1}`,
      }));
      // keep cover first, insert padding before a trailing closing slide if present
      const last = slides[slides.length - 1];
      if (last.layoutKey === '09-closing') {
        finalSlides = [...slides.slice(0, -1), ...pad, last];
      } else {
        finalSlides = [...slides, ...pad];
      }
    }
  }

  // Guarantee every slide has a non-empty title (fallback to focus) — the agenda
  // + title-slot stamping in generateStructuredDeck rely on it.
  finalSlides = finalSlides.map((s) => ({ ...s, title: s.title && s.title.trim() ? s.title : s.focus }));

  // Resolve combo FAMILIES the planner picked → the density's concrete variant
  // (e.g. combo-table-rows + detailed → combo-table-rows-5). Non-family keys pass
  // through unchanged. Everything downstream uses real, buildable geometry keys.
  finalSlides = finalSlides.map((s) => {
    const resolved = resolveComboFamily(s.layoutKey, density);
    return resolved === s.layoutKey ? s : { ...s, layoutKey: resolved };
  });

  const deckGoal = (brief?.deckGoal ?? parsed.deckGoal ?? '').trim() || undefined;
  sfLog('plan', `skin=${skinId} · ${finalSlides.length} slides · [${finalSlides.map((s) => `${s.layoutKey}${s.narrativeRole ? `:${s.narrativeRole}` : ''}`).join(', ')}]${deckGoal ? ` · goal="${deckGoal.slice(0, 70)}"` : ''}`);
  return { skinId, deckGoal, slides: finalSlides };
}

// ── Stage FILL: write each blank within its character budget ──────────────────

/** Optional per-key chart data. Writer produces this ONLY when the source
 *  supplies real numbers that fit a chart shape. Omitted → the chart slot
 *  is hidden (FR11: no fabricated numeric data). */
const ChartFillSchema = z.object({
  key: z.string(),
  chartType: z.enum(['bar', 'column', 'line', 'area', 'pie', 'donut']).catch('column'),
  categories: z.array(z.string()).min(1),
  series: z.array(z.object({
    name: z.string(),
    values: z.array(z.number()),
  })).min(1),
  title: z.string().optional(),
  numberFormat: z.enum(['number', 'currency', 'percent', 'compact']).optional().catch(undefined),
});
export type ChartFill = z.infer<typeof ChartFillSchema>;
/** Advertises a chart slot to the writer. Purpose is a short phrase
 *  describing what the chart is FOR, so the writer knows which numbers
 *  from the source to look for. */
export interface DataSlotSpec {
  key: string;
  purpose: string;
  /** Optional hint from the captured template (writer may choose differently). */
  suggestedType?: string;
}
/** fillStructureSlots return shape — text fills for slot keys + optional
 *  chart/table data (empty arrays when the layout has none, or when the
 *  writer produced no grounded data for them). */
export interface SlotFillResult {
  text: StructureFill;
  charts: ChartFill[];
  tables: TableFill[];
}

/** Optional per-key table data. Writer produces this ONLY when the source
 *  supplies row-shaped comparables. Omitted → the table slot is hidden. */
const TableFillSchema = z.object({
  key: z.string(),
  rows: z.array(z.array(z.string())).min(1),
  headerRow: z.boolean().optional().catch(true),
});
export type TableFill = z.infer<typeof TableFillSchema>;

const FillSchema = z.object({
  slots: z.array(
    z.object({
      key: z.string(),
      values: z.array(z.string()),
    }),
  ),
  charts: z.array(ChartFillSchema).optional().catch([]),
  tables: z.array(TableFillSchema).optional().catch([]),
});

const FILL_TOOL: Tool = {
  name: 'report_slot_fill',
  description:
    'Return the content for each named slot. Text slots go in `slots`. Chart and table slots (when the slide has them) go in the optional `charts` and `tables` arrays — but ONLY when the source supplies real data that fits. If the source has no matching numbers/rows, OMIT that chart or table entry entirely so the slot is hidden (FR11: never fabricate data).',
  input_schema: {
    type: 'object',
    properties: {
      slots: {
        type: 'array',
        description: 'Text-slot fills. One entry per text slot key; values is an array (one string per instance).',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The slot key exactly as given (role:group).' },
            values: {
              type: 'array',
              description: 'One string per instance, in order.',
              items: { type: 'string' },
            },
          },
          required: ['key', 'values'],
        },
      },
      charts: {
        type: 'array',
        description: 'Chart-slot fills. Omit or leave empty if the source has NO numeric data that fits this slide\'s chart shape (better to hide the chart than invent numbers). Each entry: which slot key, the chart type, category labels, and one or more numeric series.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The chart slot key exactly as given.' },
            chartType: { type: 'string', enum: ['bar', 'column', 'line', 'area', 'pie', 'donut'], description: 'Pick the type that best fits the DATA: column/bar for discrete category comparison, line/area for change over time, pie/donut for parts of a whole.' },
            categories: {
              type: 'array',
              description: 'X-axis / slice labels — one per data point.',
              items: { type: 'string' },
            },
            series: {
              type: 'array',
              description: 'One or more numeric series. Values length MUST equal categories length.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Series LEGEND label. Use a SHORT metric-family abbreviation (e.g. "ARR", "MRR", "Bookings", "Top line", "NRR%") — do NOT restate the topic word ("Revenue") if the slide title, subtitle, or a table row already references it. For a single-series chart where the title already names the metric, an empty string is acceptable.' },
                  values: { type: 'array', description: 'Numeric values matching the categories.', items: { type: 'number' } },
                },
                required: ['name', 'values'],
              },
            },
            title: { type: 'string', description: 'Optional chart title. Describe the TREND / PATTERN in the data ("4.5× compound growth Y1→Y3", "Steady 78% margin held for three years", "Q4 spike after ALO launch") — do NOT restate the topic word already used in the slide title/subtitle/table ("Revenue Growth Over Three Years" restates and FAILS). If no distinct trend framing fits, OMIT this field.' },
            numberFormat: { type: 'string', enum: ['number', 'currency', 'percent', 'compact'], description: 'Display format for values.' },
          },
          required: ['key', 'chartType', 'categories', 'series'],
        },
      },
      tables: {
        type: 'array',
        description: 'Table-slot fills. Omit or leave empty if the source has no row-shaped comparable data (better to hide than invent). Each entry: which slot key + the cell rows.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The table slot key exactly as given.' },
            rows: {
              type: 'array',
              description: 'Rows × columns. First row = column headers (unless headerRow=false); subsequent rows = data. Row-label cells (first column of a data row) must use SHORT metric-family abbreviations that do NOT restate the topic word already in the slide title/subtitle/chart. Prefer "ARR", "Top line", "Bookings" over "Revenue" if the slide already anchors on revenue. Prefer "Gross margin" over "Gross margin (%) revenue" — keep labels tight.',
              items: { type: 'array', items: { type: 'string' } },
            },
            headerRow: { type: 'boolean', description: 'Default true — first row renders as accent-styled header.' },
          },
          required: ['key', 'rows'],
        },
      },
    },
    required: ['slots'],
  },
};

/** Truncate to a hard character cap so the result reads FINISHED, not chopped
 *  mid-clause (no ellipsis — a slot must fit, and "…" wastes the budget). The
 *  generator should write within the cap (see the FILL prompt) so this rarely
 *  fires; when it must, it prefers a complete-sentence cut, then a word boundary
 *  with any dangling connective stripped — so it never ships "…insights and set".
 */
function capText(text: string, cap: number): string {
  // Strip an author-supplied trailing ellipsis first — the generator sometimes
  // trails off ("…revenue…") even within budget; that reads unfinished.
  const t = text.trim().replace(/\s*(\.{3}|…)\s*$/, '').trim();
  if (t.length <= cap) return t;
  const cut = t.slice(0, cap);
  // 1. Prefer ending on a complete sentence within the cap.
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd > cap * 0.4) return cut.slice(0, sentenceEnd + 1).trim();
  // 2. Else end on a CLAUSE boundary (comma / semicolon / dash) — a complete
  //    clause reads finished ("…tidal patterns, crucial" → "…tidal patterns"),
  //    far better than a dangling word for the tight item boxes that can't grow.
  const clauseEnd = Math.max(
    cut.lastIndexOf(', '),
    cut.lastIndexOf('; '),
    cut.lastIndexOf(' — '),
    cut.lastIndexOf(' – '),
  );
  if (clauseEnd > cap * 0.5) return cut.slice(0, clauseEnd).trim();
  // 3. Else cut at a word boundary…
  const lastSpace = cut.lastIndexOf(' ');
  let out = (lastSpace > cap * 0.55 ? cut.slice(0, lastSpace) : cut).trim();
  // …then drop trailing punctuation + a dangling connective/preposition/article
  // (and, to, of, the…) so the value doesn't end mid-clause.
  out = out.replace(/[\s,;:.–—-]+$/, '');
  out = out.replace(/\s+(and|or|but|to|of|in|on|for|with|the|a|an|by|as|at|from|that|which|its|our|their|your|&)$/i, '');
  return out.trim();
}

// Words that, when a value ENDS on them, signal an unfinished clause — a
// participle/connective/preposition/article that grammatically demands more.
const DANGLING_TAIL =
  /[\s,;:–—-]*\s+(?:and|or|but|to|of|in|on|for|with|the|a|an|by|as|at|from|that|which|its|our|their|your|while|where|when|whose|featuring|including|leading|offering|ranging|affecting|distinguishing|giving|making|creating|providing|causing|known|filled|composed|forming|allowing|enabling|resulting|containing|consisting|spanning|covering|reaching|marking|driven|surrounded|characterized|&)$/i;

/** Make a BODY value read as a FINISHED thought. The generator (gpt-4o) often
 *  trails off on the small repeated item boxes ("…atmospheric makeup, affecting",
 *  "…ranging from rocky to gaseous") — a hanging participle/clause with no
 *  terminal punctuation. Prompt rules don't reliably stop it, so terminate it
 *  deterministically: keep it if already finished, else fall back to the last
 *  complete sentence, else the last clause + a period, else strip the dangling
 *  tail + a period. Only touches values that AREN'T already cleanly ended. */
function ensureFinished(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.!?:"'»”’)\]]$/.test(t)) return t; // already ends clean
  // 1. Fall back to the last complete sentence within the value.
  const sEnd = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? '));
  if (sEnd > t.length * 0.4) return t.slice(0, sEnd + 1).trim();
  // 2. Strip a dangling connective/participle tail ("…makeup, affecting" →
  //    "…makeup") and terminate — but only if that actually removed something.
  const stripped = t.replace(DANGLING_TAIL, '').replace(/[\s,;:–—-]+$/, '').trim();
  if (stripped !== t && stripped.length >= Math.min(24, t.length * 0.5)) return stripped + '.';
  // 3. Ends mid-thought on a content word ("…rocky surfaces to gaseous") — fall
  //    back to the last complete CLAUSE ("…unique landscapes.") and terminate.
  const cEnd = Math.max(t.lastIndexOf(', '), t.lastIndexOf('; '));
  if (cEnd > t.length * 0.4) {
    const clause = t.slice(0, cEnd).replace(/[\s,;:–—-]+$/, '').trim();
    if (clause.length >= Math.min(24, t.length * 0.45)) return clause + '.';
  }
  return t; // no safe complete cut — leave as written rather than fake a period
}

export interface SlideFillContext {
  index: number;
  total: number;
  layoutKey: string;
  layoutPurpose: string;
  focus: string;
  /** The ONE takeaway this slide must land (the "one idea per slide" contract).
   *  The writer makes the heading STATE it and every body slot SUPPORT only it —
   *  no second topic, no restating the heading. Absent on cover/scaffold slides. */
  takeaway?: string;
  deckOutline: string[];
  topic: string;
  /** Visual-critic feedback from a prior render+judge. When present, the writer
   *  is told to FIX these specific visual problems (e.g. "text overflowed,
   *  shorten it") on the re-fill — this is how the visual judge drives revision. */
  feedback?: string[];
  /** Authoritative source material to ground the slide in (prompt + attached
   *  file). When present the writer pulls REAL, specific content from it rather
   *  than improvising from the one-line prompt. */
  sourceText?: string;
  /** True when `sourceText` is the user's OWN typed prompt (no file attached) —
   *  the writer then AUTHORS substantive content expanding the brief instead of
   *  transcribing a document (FR11 still bars invented specific facts). */
  standalone?: boolean;
  /** Detail TIER — graduated body fill: 'concise' < 'detailed' < 'extensive'
   *  (≈ 45 / 72 / 95% of each body slot's budget). Fixed-by-role slots (title,
   *  label, number, date) don't scale; only body-type slots do. */
  density?: string;
  /** Source MODE (rewriteIntensity) — how much to DEVELOP beyond the source:
   *  'verbatim' = stay tight to the source, no added points; 'build' = use the
   *  source as a base and develop it; 'inspire' (default) = springboard, author
   *  substantive content. All modes FR11-bounded (no invented specific facts). */
  rewriteIntensity?: string; // 'verbatim' | 'build' | 'inspire' (normalized at use; default inspire)
  /** Who the deck is for (Customize → Audience). Frames who the prose addresses.
   *  Empty/absent → no audience framing (generic). */
  audience?: string;
  /** Desired register (Customize → Tone, e.g. "Confident", "Authoritative").
   *  Empty/absent → defaults to a neutral professional register. */
  tone?: string;
  /** Resolved document-skill voice (Customize → Voice / framework default).
   *  null/absent → no voice biasing. Injected as concrete voice rules. */
  voice?: SkillId | null;
  /** Phase B editorial brief — the plan agent's per-slide guidance:
   *  hero (goes to anchor slot), callouts (explicit prose call-outs of
   *  deltas/anomalies), and angle (framing voice for the slide). Optional;
   *  Figma path doesn't set these today. */
  hero?: string;
  callouts?: string[];
  angle?: 'win' | 'warning' | 'comparison' | 'decision' | 'neutral';
  /** Phase C — cross-reference inferences. Natural-language hypotheses linking
   *  facts across the source, WITH hedge language. Gated by rewriteIntensity
   *  upstream — this field is EMPTY in verbatim mode (only stated facts
   *  render); populated in build/inspire (writer may weave inferences with
   *  the source's hedge language). */
  crossRefs?: string[];
  /** Phase D — DECK-LEVEL context. The whole-deck goal and this slide's role
   *  in the arc. Used to shape the writer's prose so a "cause" slide names
   *  the cause explicitly, a "consequence" slide references what caused it,
   *  etc. Prevents floating-fact slides that don't serve the deck's story. */
  deckGoal?: string;
  narrativeRole?: 'hook' | 'setup' | 'evidence' | 'cause' | 'consequence' | 'response' | 'close';
  /** Neighboring slides' focus lines — the writer can reference what comes
   *  before and after when producing prose that ties this slide to the arc. */
  arcContext?: { prev?: string; next?: string };
}

// Icon vocabulary the generator may choose from for icon-badge layouts. Same
// names the improvise path uses (resolve via PictographicIcon → Iconify, and
// export as SVG via pptxExport.addIcon).
const ICON_SET = [
  'rocket', 'target', 'lightbulb', 'zap', 'sparkles', 'star', 'trophy', 'award',
  'shield', 'check', 'briefcase', 'building', 'users', 'chart', 'clock', 'calendar',
  'book', 'flag', 'gift', 'compass', 'settings', 'layers', 'edit', 'file', 'download',
  'wallet', 'dollar', 'lock', 'globe', 'heart',
] as const;
// Layouts whose decorations include fillable icon badges → how many.
const ICON_BADGE_COUNT: Record<string, number> = { '11-infographic': 3 };

/** STAGE FILL — write grounded copy for one layout's blanks, each within its
 *  character budget. Returns a role:group-keyed fill map for
 *  buildStructureTemplate. Never throws — on any error returns {} so the slide
 *  renders its neutral placeholders (honest blank, never a crash). */
export async function fillStructureSlots(
  ctx: SlideFillContext,
  skinId: string,
  /** OPTIONAL — inject per-slot specs directly (for the native / captured
   *  template path). Absent → resolve from the Figma manifest as before. */
  specsOverride?: LayoutSlotSpec[],
  /** Chart/table specs to advertise to the writer. Only used on captured
   *  templates (Figma layouts don't have chart/table slot types). The writer
   *  will populate `charts`/`tables` in its return ONLY when the source has
   *  matching data — else it omits, and the caller hides the slot (FR11). */
  dataSlotSpecs?: { charts: DataSlotSpec[]; tables: DataSlotSpec[] },
): Promise<SlotFillResult> {
  const specs = specsOverride ?? describeLayoutSlots(ctx.layoutKey, skinId);
  if (specs.length === 0) return { text: {}, charts: [], tables: [] };

  // FROZEN BUDGET (imported document-studio layouts): a slot carrying an explicit
  // per-mode budget uses budget[mode] as its char cap for the active density —
  // overriding the geometry-derived cap. This is the imported density contract
  // (a "concise" body is genuinely shorter, not just a smaller box). Foxit Slides's own
  // 12 layouts have no budget → unchanged (derived cap).
  {
    const mode = ctx.density === 'concise' ? 'concise' : ctx.density === 'extensive' ? 'extensive' : 'detailed';
    for (const s of specs) if (s.budget) s.charCap = s.budget[mode];
  }

  // Graduated fill: only BODY-type slots scale by tier (fixed roles — titles,
  // labels, numbers, dates — stay short regardless). The target doubles as a
  // FLOOR: body blanks should reach it, not just stay under the cap.
  // Headroom matters: aiming at ~95% of the cap (as a FLOOR) made the model
  // write to the brim, overflow the fixed box, and the fit then trimmed it to
  // an incomplete fragment ("…and may even"). Extensive's EXTRA depth comes from
  // MORE SLIDES (the planner prefers breadth), not crammed boxes — so keep a
  // comfortable margin under every cap.
  const fillFraction = ctx.density === 'extensive' ? 0.88 : ctx.density === 'concise' ? 0.45 : 0.72;
  // MULTI-INSTANCE body slots (item grids: comparison cells, infographic /
  // process item descriptions) are the smaller, repeated boxes — aim them a
  // touch lower so each holds ONE complete, self-contained sentence rather than
  // a run-on that trails off; the single lead paragraph keeps the high floor.
  // (grow the box where there's room, write to fit where there
  // isn't — and ALWAYS a finished thought, never a dangling fragment.)
  const itemFillFraction = ctx.density === 'concise' ? 0.45 : 0.7;
  const slotFloor = (s: LayoutSlotSpec) =>
    s.count > 1 ? itemFillFraction : fillFraction;
  const slotLines = specs
    .map((s) => {
      // VERBATIM (a quote): reproduce the source quote EXACTLY — no length limit,
      // no retitling. The char budget does not apply to quoted content.
      if (s.verbatim) {
        return `- "${s.key}" — THE VERBATIM QUOTE. Copy the exact quoted passage from the source WORD FOR WORD: keep its original wording, capitalization, and punctuation. Do NOT shorten, paraphrase, retitle, title-case, or truncate it, and IGNORE any character limit. If the source contains no quote, leave this blank.`;
      }
      const inst = s.count > 1 ? `${s.count} instances (fill ALL)` : '1 instance';
      const example = Array.isArray(s.placeholder)
        ? s.placeholder.join(' / ')
        : s.placeholder;
      const target = s.role === 'body'
        ? (s.count > 1
            ? ` — aim ~${Math.round(s.charCap * slotFloor(s))} chars: ONE complete, self-contained sentence ending in a period (never a run-on that trails off)`
            : ` — aim for ~${Math.round(s.charCap * slotFloor(s))} chars of real content (a FLOOR, don't undershoot)`)
        : '';
      return `- "${s.key}" — ${describeRole(s)}, ${inst}, max ${s.charCap} chars EACH${target}${example ? ` (e.g. ${example})` : ''}`;
    })
    .join('\n');

  const outline = ctx.deckOutline.map((f, i) => `${i + 1}. ${f}`).join('  ');

  const iconCount = ICON_BADGE_COUNT[ctx.layoutKey] ?? 0;
  const iconInstruction = iconCount
    ? `\nICONS: this layout has ${iconCount} icon badges (one per card). ALSO return a slot with key "icon:card-badge" whose values is an array of EXACTLY ${iconCount} icon names, in card order, each matching that card's meaning. Choose only from: ${ICON_SET.join(', ')}.\n`
    : '';

  const src = (ctx.sourceText ?? '').trim();
  const standalone = !!ctx.standalone;
  // STANDALONE (no file): the "source" is the user's own brief — material to
  // DEVELOP into full slide content, not a document to transcribe. WITH A FILE:
  // the source is authoritative; pull real content and don't generalize.
  const sourceBlock = src
    ? (standalone
        ? `\nBRIEF (the user's own topic/instructions — this is your material to DEVELOP into real slide content. AUTHOR substantive, specific copy that expands this brief into full explanatory prose; do NOT just restate the brief, and do NOT leave blanks empty that you can legitimately write from it):\n"""\n${src.slice(0, SOURCE_CHAR_BUDGET)}\n"""\n`
        : `\nSOURCE MATERIAL (authoritative — pull this slide's REAL content from here; be specific and accurate to it, do not generalize into vague filler):\n"""\n${src.slice(0, SOURCE_CHAR_BUDGET)}\n"""\n`)
    : '';
  // DEPTH TIER — graduated body fill (concise < detailed < extensive). Only
  // body slots scale (slotLines carries the per-slot floor); the tier % here
  // reinforces it.
  const tier = ctx.density === 'extensive' ? 'EXTENSIVE' : ctx.density === 'concise' ? 'CONCISE' : 'DETAILED';
  const depthRule = `- DEPTH (${tier} tier): body/description blanks should reach ~${Math.round(fillFraction * 100)}% of their character budget with substantive, specific content — ${ctx.density === 'concise' ? 'tight but COMPLETE (no one-word or half-empty answers)' : ctx.density === 'extensive' ? 'rich and substantive, but every blank a COMPLETE thought that fits COMFORTABLY within its cap with margin to spare — do NOT fill to the brim; the deck gets its depth from MORE slides, not crammed boxes' : 'a solid sentence or two of real substance per body blank'}. Fixed slots (titles, eyebrow labels, numbers, dates) stay short regardless. Never exceed any cap.`;
  // SOURCE MODE (rewriteIntensity) — how far to DEVELOP beyond the source.
  const mode = ctx.rewriteIntensity ?? 'inspire';
  const modeRule = mode === 'verbatim'
    ? `- SOURCE MODE — VERBATIM: stay tight to the ${standalone ? 'brief' : 'source'}. Restate/condense ONLY the points it actually makes; do not add new points or elaborate beyond it.`
    : mode === 'build'
      ? `- SOURCE MODE — BUILD: use the ${standalone ? 'brief' : 'source'} as the base and DEVELOP it — add explanatory depth, implications, and connective framing around its real content.`
      : `- SOURCE MODE — INSPIRE: treat the ${standalone ? 'brief' : 'source/topic'} as a springboard — author substantive explanatory content that fully develops the topic.`;
  const noDropRule = '- FILL EVERY INSTANCE. For a multi-instance blank (e.g. 4 item descriptions), write ALL of them with parallel, substantive content — a partly-filled list (some items blank) is a FAILURE.';
  // VOICE / AUDIENCE / TONE (Customize popover) — these steer the prose REGISTER,
  // never the facts (FR11 grounding above is unaffected). Empty controls leave the
  // prompt generic. Mirrors the legacy generate path's AUDIENCE/TONE/VOICE block.
  const audienceClean = (ctx.audience ?? '').trim();
  const toneClean = (ctx.tone ?? '').trim();
  const voiceInstructions = buildSkillVoiceInstructions(ctx.voice);
  const framingBlock = (audienceClean || toneClean || voiceInstructions)
    ? `\n${audienceClean ? `AUDIENCE (who reads this — pitch the content depth and vocabulary to them): ${audienceClean}\n` : ''}${toneClean ? `TONE (the register every value should adopt): ${toneClean}\n` : ''}${voiceInstructions ? `${voiceInstructions}` : ''}`
    : '';
  // FR11 (Hard Constraint): every mode bars invented specific facts. VERBATIM is
  // strictest (source-only); BUILD/INSPIRE may develop descriptive prose (which
  // is NOT fabrication) but still never invent unstated specifics.
  const groundingRule = mode === 'verbatim'
    ? `- GROUNDING (FR11, verbatim): use ONLY what the ${standalone ? 'brief' : 'source'} states. NEVER invent statistics, metrics, percentages, dates, names, quotes, emails, phones, URLs, or contact details. If a blank has no grounded value, leave it EMPTY rather than invent — never a placeholder like "contact@company.com".`
    : `- GROUNDING (FR11): developing the ${standalone ? 'brief' : 'source'} into full explanatory prose is NOT fabrication — DO write substantive content for every blank. But NEVER invent specific UNSTATED facts: no statistics, metrics, percentages, dollar amounts, dates, proper names, quotes, emails, phone numbers, or URLs not supplied. Omit a blank only if filling it needs such an unstated specific — never output a placeholder like "contact@company.com".`;

  // Chart / table slot advertisements. Empty when no data slots on this slide
  // (all Figma slides, most captured slides). Present tells the writer it MAY
  // populate `charts`/`tables` in the tool response — but only when the source
  // has real data. FR11-critical: hidden-if-blank is the correct fallback.
  const chartLines = (dataSlotSpecs?.charts ?? []).map((s) => {
    const hint = s.suggestedType ? ` (template hint: ${s.suggestedType})` : '';
    return `- "${s.key}"${hint} — ${s.purpose}`;
  }).join('\n');
  const tableLines = (dataSlotSpecs?.tables ?? []).map((s) => `- "${s.key}" — ${s.purpose}`).join('\n');
  const dataBlock = (chartLines || tableLines) ? `

DATA SLOTS ON THIS SLIDE (populate ONLY if the ${standalone ? 'brief' : 'source'} supplies real matching data — else OMIT so the slot hides; DO NOT invent numbers or rows):
${chartLines ? `\nCHART SLOTS (return via the tool's \`charts\` array — one entry per key with chartType + categories + numeric series):\n${chartLines}` : ''}${tableLines ? `\nTABLE SLOTS (return via the tool's \`tables\` array — one entry per key with rows[][]):\n${tableLines}` : ''}
` : '';

  // Phase B editorial brief block — plan agent's per-slide guidance. Absent
  // on the Figma path (ctx.hero/callouts/angle undefined), so it renders as
  // an empty string and the prompt shape is unchanged there.
  const heroLine = ctx.hero
    ? `\n- HERO POINT (place this in the ANCHOR slot — the title, or the hero metric if the layout has one): "${ctx.hero}"`
    : '';
  const calloutLines = (ctx.callouts ?? []).length
    ? `\n- CALLOUTS (must appear in prose EXPLICITLY with numbers/deltas, not just raw values):\n${(ctx.callouts ?? []).map((c) => `    · ${c}`).join('\n')}`
    : '';
  const angleLine = (() => {
    switch (ctx.angle) {
      case 'win': return `\n- ANGLE — WIN: confident, celebratory register. Name the achievement clearly.`;
      case 'warning': return `\n- ANGLE — WARNING: candid, decision-forcing register. Name the risk/miss clearly with its scale (delta, magnitude).`;
      case 'comparison': return `\n- ANGLE — COMPARISON: balanced register. Present both sides parallel and comparable, no lopsided framing.`;
      case 'decision': return `\n- ANGLE — DECISION: implication + call-to-action register. Name what the audience should decide or do next.`;
      case 'neutral': return '';
      default: return '';
    }
  })();
  // Phase C — cross-reference inferences. Only surfaced when rewriteIntensity
  // permits (upstream in generateNativeDeck gates verbatim mode by clearing
  // the array). Each entry MUST use hedge language (writer preserves the
  // hedges — never converts to causal certainty).
  const crossRefLines = (ctx.crossRefs ?? []).length
    ? `\n- CROSS-REFERENCE INFERENCES (weave these into prose using the SAME HEDGE LANGUAGE they arrived with — "may reflect", "coincides with", "appears linked to". NEVER upgrade to causal certainty like "caused by" or "because of"):\n${(ctx.crossRefs ?? []).map((c) => `    · ${c}`).join('\n')}`
    : '';
  // Phase D — deck-level context. The whole-deck GOAL + this slide's narrative
  // ROLE + neighboring focus lines. Shapes the writer's prose so a "cause"
  // slide names the cause, a "consequence" slide references what caused it.
  // Prevents floating-fact slides that don't serve the deck's story.
  const roleGuidance = (() => {
    switch (ctx.narrativeRole) {
      case 'hook':        return `\n- NARRATIVE ROLE — HOOK: this is the deck's opener. Frame the whole story in one line. Minimal supporting text.`;
      case 'setup':       return `\n- NARRATIVE ROLE — SETUP: frame the situation (context, scope, players) so later slides can build on it. Do NOT deliver conclusions yet.`;
      case 'evidence':    return `\n- NARRATIVE ROLE — EVIDENCE: deliver the facts / numbers. Concrete, grounded. A later slide will explain WHY or WHAT this led to.`;
      case 'cause':       return `\n- NARRATIVE ROLE — CAUSE: this slide MUST explicitly name the cause of something that appears elsewhere in the deck. Do NOT ship a floating fact. Prose pattern: "<what happened> reveals / is driven by / stems from <the cause>". If the deck's neighboring slides show a decline or reversal, this slide names WHY.`;
      case 'consequence': return `\n- NARRATIVE ROLE — CONSEQUENCE: this slide MUST explicitly reference what caused it (a fact from an earlier slide) and what it LED TO. Prose pattern: "<upstream cause> drove / led to / resulted in <this consequence, with number>". Do NOT ship as an isolated data point.`;
      case 'response':    return `\n- NARRATIVE ROLE — RESPONSE: name what we are proposing to DO about the situation. Concrete action, owner, or plan. Not analysis, not evidence — the answer.`;
      case 'close':       return `\n- NARRATIVE ROLE — CLOSE: wrap the deck's argument. Short. May restate the ask or next step.`;
      default: return '';
    }
  })();
  const goalLine = ctx.deckGoal
    ? `\n- DECK GOAL (what the WHOLE deck must leave the audience with — this slide advances that goal): "${ctx.deckGoal}"`
    : '';
  const arcLines = (ctx.arcContext?.prev || ctx.arcContext?.next)
    ? `\n- ARC POSITION:${ctx.arcContext.prev ? `\n    · previous slide: "${ctx.arcContext.prev}"` : ''}${ctx.arcContext.next ? `\n    · next slide:     "${ctx.arcContext.next}"` : ''}\n  Reference or set up these neighbors when the role calls for it (cause → name what it explains; consequence → name what caused it).`
    : '';
  const holisticBlock = (goalLine || roleGuidance || arcLines)
    ? `\n\nHOLISTIC VIEW (deck-level context — every slide must serve the whole):${goalLine}${roleGuidance}${arcLines}`
    : '';
  const editorialBrief = (heroLine || calloutLines || angleLine || crossRefLines)
    ? `\n\nEDITORIAL BRIEF FOR THIS SLIDE (the plan agent identified these — follow them):${heroLine}${calloutLines}${angleLine}${crossRefLines}`
    : '';
  // The ONE-TAKEAWAY contract: everything on the slide supports one point. The
  // heading is a short topic label; the takeaway is shown in the point/lead slot
  // (stamped separately) and the body supports it. "One idea per slide", built in.
  const takeawayLine = ctx.takeaway?.trim()
    ? `\nSLIDE TAKEAWAY — the ONE point this slide must land: "${ctx.takeaway.trim()}"\n  · Everything on the slide SUPPORTS this single point with concrete, non-overlapping detail — no second, unrelated topic.\n  · The heading is a short topic LABEL; the takeaway itself is shown in the slide's lead/statement line, so do NOT repeat it verbatim in the body — add support for it. One idea per slide.`
    : '';

  const fillPrompt = `You are writing the content for ONE slide of a presentation. The slide's STRUCTURE is fixed — you only fill its named blanks. Do not add, remove, or rename blanks.

TOPIC: "${ctx.topic}"
${sourceBlock}${framingBlock}THIS SLIDE (${ctx.index + 1} of ${ctx.total}) — ${ctx.layoutKey}: ${ctx.layoutPurpose}
SLIDE FOCUS: ${ctx.focus}${takeawayLine}${holisticBlock}${editorialBrief}
DECK ARC: ${outline}
- Cover ONLY this slide's focus. Do not repeat another slide's content. Make it connect to the slides around it so the deck reads as one coherent narrative.

FILL THESE BLANKS (return one entry per key; values is one string per instance):
${slotLines}
${dataBlock}

HARD RULES:
- CHARACTER BUDGET IS A HARD CAP. Every value MUST fit within its slot's max chars — count characters. Text over the cap is clipped on the rendered slide.
- WRITE COMPLETE THOUGHTS THAT FIT. Each value must be a grammatically COMPLETE, self-contained phrase or sentence WITHIN its cap — never start a clause you can't finish in the budget. A trimmed fragment like "Conclude Q3 insights and set" is a FAILURE; write a shorter complete version instead ("Set Q4 priorities and next steps"). End on a finished word, not a dangling "and / to / of / the". NEVER end a value with an ellipsis ("…" or "...") — that is an unfinished thought; if the full idea won't fit, write a SHORTER complete idea that does.
- EVERY body/description value MUST END IN TERMINAL PUNCTUATION (a period, "?" or "!"). A value ending on a participle, preposition, adjective, or comma ("…and atmospheric makeup, affecting", "…ranging from rocky to gaseous") is an UNFINISHED sentence and a FAILURE — finish the thought or write a shorter complete sentence that ends in a period.
${depthRule}
${modeRule}
${noDropRule}
- Write REAL, specific content from the ${standalone ? 'brief/topic' : 'SOURCE/topic'} — not the example text (the examples only show the slot's shape).
${groundingRule}
- Parallel multi-instance blanks (e.g. three item titles) must be genuinely parallel and comparable.
- Eyebrow labels are SHORT all-caps section tags. Titles are punchy noun phrases.
- EDITORIAL HERO PLACEMENT: if an EDITORIAL BRIEF above supplied a HERO POINT, that point MUST appear in the slide's ANCHOR slot — the primary title, OR a hero metric slot if the layout has one. Do NOT put the hero in a body slot. If the layout has a title AND a hero metric, put the metric there and use the title for the framing phrase around it.
- EDITORIAL CALL-OUTS: if an EDITORIAL BRIEF supplied CALLOUTS, EACH one MUST appear in the slide's body prose EXPLICITLY with its number/delta. Do NOT report the raw value only — name the change. "ARR reached \$18M" is weaker than "ARR expanded 4.5× to \$18M". "Customer count 140" is weaker than "Customer count dropped from 200 to 140 (-30%)". The delta IS the story; the raw value is background.
- CROSS-REFERENCE HEDGE LANGUAGE: if an EDITORIAL BRIEF supplied CROSS-REFERENCE INFERENCES, weave them into prose using the SAME hedge language they arrived with. NEVER upgrade "may reflect" to "caused by", "coincides with" to "led to", "appears linked to" to "the reason was". Inferences must READ as inferences — they are the writer's interpretation, not the source's stated fact. This is FR11-adjacent: a stated inference (with hedges) is different from a stated fact (without hedges); the reader must be able to tell them apart.
- NO CROSS-SLOT REPETITION. Within THIS slide, a key noun (e.g. "revenue", "team", "roadmap") appears in ONE anchor position — usually the title. Every OTHER slot must carry DIFFERENT information: the driver, the implication, the trend descriptor, the metric family, the mechanism. Do NOT restate the topic word across title + subtitle + chart caption + chart title + chart series name + table row labels. Specifically, for chart/table data slots:
  · Chart series name = short metric family abbreviation (ARR, MRR, NRR%, bookings, top line) — NEVER "Revenue" if the title already anchors on revenue.
  · Chart title = trend descriptor ("4.5× compound Y1→Y3", "Steady 78% margin", "Q4 spike after ALO") — NEVER "Revenue Growth Over Three Years" (restates the anchor).
  · Table row-label cells = short metric family (ARR, gross margin, CAC payback, magic number) — NEVER "Revenue ($M)" if the slide already says revenue.
  A slide that says "revenue" in four places has FAILED the "earns-its-place" bar.
${iconInstruction}${ctx.feedback && ctx.feedback.length ? `\nA design reviewer looked at the RENDERED slide and flagged these visual problems — fix them this time by writing SHORTER, tighter content that fits each blank:\n${ctx.feedback.map((f) => `• ${f}`).join('\n')}\n` : ''}
Return via the report_slot_fill tool.`;

  try {
    const provider = getProvider();
    const response = await provider.createMessage({
      model: getModel(),
      // Generous ceiling: a content/comparison/infographic slide has a lead
      // paragraph + several item titles + several item bodies of extensive copy.
      // 1500 could clip the JSON mid-string on the densest slides; 4000 leaves
      // ample headroom so the model always emits complete values.
      max_tokens: 4000,
      tools: [FILL_TOOL],
      tool_choice: { type: 'tool', name: 'report_slot_fill' },
      messages: [{ role: 'user', content: fillPrompt }],
    });
    const toolUse = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) return { text: {}, charts: [], tables: [] };
    const parsed = FillSchema.safeParse(toolUse.input);
    if (!parsed.success) return { text: {}, charts: [], tables: [] };

    const coerced = coerceFill(parsed.data.slots, specs);
    const groundText = `${ctx.topic}\n${ctx.sourceText ?? ''}`;
    // Per-metric fact store — extracted ONCE per source (cached), and only for
    // layouts that carry numeric claims, so a text-only deck never pays for it.
    // Fail-open (empty) → groundNumericFill keeps its verbatim check unchanged.
    const { facts, primarySubject } = NUMERIC_CLAIM_LAYOUTS.has(ctx.layoutKey)
      ? await extractSourceFactsCached(groundText)
      : { facts: [] as SourceFact[], primarySubject: null };
    // FR11 fail-closed: strip fabricated numbers from data-layout metric/delta
    // slots (an invented statistic must never reach the user). Grounded against
    // prompt + source. With `facts`, a metric VALUE must match the source's value
    // FOR ITS METRIC (catches a real number on the wrong metric), not just appear;
    // `primarySubject` also catches a competitor's number on this deck's slide.
    const { fill, stripped } = groundNumericFill(coerced, ctx.layoutKey, specs, groundText, facts, primarySubject);
    if (stripped.length) {
      sfLog('fr11-strip', `${ctx.layoutKey}: ${stripped.join(', ')}`);
    }
    // FR11 fail-closed for CONTACT info: an email / phone / URL the source never
    // supplied is fabricated (the "contact@company.com" problem). Drop the whole
    // value to empty rather than ship invented contact details.
    const contactStripped = stripUngroundedContact(fill, groundText);
    if (contactStripped.length) {
      sfLog('fr11-contact-strip', `${ctx.layoutKey}: ${contactStripped.join(', ')}`);
    }
    // FR11 fail-closed for IDENTITY: blank an author/date the source never gave
    // (the fabricated cover presenter name + date). No deterministic guard
    // covered names/dates before — only numbers and contact tokens.
    const identityStripped = stripUngroundedIdentity(fill, specs, groundText);
    if (identityStripped.length) {
      sfLog('fr11-identity-strip', `${ctx.layoutKey}: ${identityStripped.join(', ')}`);
    }
    // Deterministic markdown-bleed strip (ported from enforce.ts). gpt-4o
    // sometimes emits `**bold**` / leading `# `/`- ` inside slot values; the
    // freeform renderer shows them literally. Strip formatting markers only —
    // never words or numbers — across every filled string. Behaviour-preserving.
    let mdStripped = 0;
    for (const key of Object.keys(fill)) {
      const v = fill[key];
      if (typeof v === 'string') {
        const cleaned = stripMarkdownTokens(v);
        if (cleaned !== v) { fill[key] = cleaned; mdStripped++; }
      } else if (Array.isArray(v)) {
        fill[key] = v.map((s) => {
          const cleaned = stripMarkdownTokens(s);
          if (cleaned !== s) mdStripped++;
          return cleaned;
        });
      }
    }
    if (mdStripped) {
      sfLog('md-strip', `${ctx.layoutKey}: ${mdStripped} value(s)`);
    }
    // Generator-chosen icons for icon-badge layouts (not a text slot — attached
    // separately so the builder can place SVG-backed FreeformIconBlocks).
    if (iconCount) {
      const iconSlot = parsed.data.slots.find((s) => s.key === 'icon:card-badge');
      const icons = (iconSlot?.values ?? [])
        .slice(0, iconCount)
        .map((v) => String(v ?? '').trim().toLowerCase())
        .filter(Boolean);
      if (icons.length) {
        fill['icon:card-badge'] = icons;
        sfLog('icons', `${ctx.layoutKey}: ${icons.join(', ')}`);
      }
    }
    // Guarantee the slide is never titleless: if the model omitted the main
    // title, fall back to the slide's focus (from the plan). Without this an
    // unfilled title now renders EMPTY (placeholders no longer leak), which would
    // leave a blank-headed slide. Only the primary `title:` heading — not the
    // quote/section-number title groups.
    const titleSpec = specs.find((s) => s.role === 'title' && !s.group);
    if (titleSpec) {
      const cur = fill[titleSpec.key];
      const hasTitle = typeof cur === 'string' && cur.trim().length > 0;
      if (!hasTitle && ctx.focus.trim()) {
        fill[titleSpec.key] = capText(ctx.focus.trim(), titleSpec.charCap);
        sfLog('title-fallback', `${ctx.layoutKey}: focus→title`);
      }
    }
    // Chart + table data — only surface writer output when the writer both
    // (a) has SPECS for these slots (caller advertised them), AND (b) produced
    // grounded values. Filter to the specs' keys so an off-key entry is
    // dropped rather than shipped.
    const chartKeys = new Set((dataSlotSpecs?.charts ?? []).map((s) => s.key));
    const tableKeys = new Set((dataSlotSpecs?.tables ?? []).map((s) => s.key));
    const charts: ChartFill[] = (parsed.data.charts ?? []).filter((c) => chartKeys.has(c.key));
    const tables: TableFill[] = (parsed.data.tables ?? []).filter((t) => tableKeys.has(t.key));
    if (chartKeys.size || tableKeys.size) {
      sfLog('data-fill', `${ctx.layoutKey}: charts=${charts.length}/${chartKeys.size} tables=${tables.length}/${tableKeys.size}`);
    }
    return { text: fill, charts, tables };
  } catch (err) {
    sfLog('fill-error', `${ctx.layoutKey}: ${err instanceof Error ? err.message : String(err)}`);
    return { text: {}, charts: [], tables: [] };
  }
}

/** Map the model's returned slots onto the layout's specs: keep only known
 *  keys, pad/truncate each to its instance count, hard-cap each string to its
 *  character budget. Unfilled blanks are simply absent → placeholder renders. */
function coerceFill(
  raw: { key: string; values: string[] }[],
  specs: LayoutSlotSpec[],
): StructureFill {
  const byKey = new Map(raw.map((r) => [r.key, r.values]));
  const fill: StructureFill = {};
  for (const spec of specs) {
    const values = byKey.get(spec.key);
    if (!values || values.length === 0) continue;
    // HEADROOM over the design cap for body slots that have room for a longer
    // value — so the model's full sentence isn't hard-trimmed mid-phrase. Two
    // shapes qualify: a tall paragraph box (cap >= 150) and a FULL-WIDTH row
    // (w >= 520px) — the latter has a LOW char-cap (one line at the manifest
    // font) yet easily holds a longer single line at the fitted size, and can
    // also grow DOWN into the gap below (grow-to-fit). Narrow columns keep the
    // tight cap. Fixed slots (titles, labels, numbers) keep it too.
    const bodyHasRoom = spec.role === 'body' && (spec.charCap >= 150 || spec.w >= 520);
    // A verbatim quote is never capped — text-fit shrinks the font to fit it whole.
    const cap = spec.verbatim ? Number.MAX_SAFE_INTEGER : bodyHasRoom ? Math.round(spec.charCap * 1.6) : spec.charCap;
    // Body values also get a deterministic completeness pass — the generator
    // trails off on the small repeated item boxes and prompt rules don't fully
    // stop it, so guarantee a finished thought here.
    const finish = (v: string) => (spec.role === 'body' ? ensureFinished(v) : v);
    const capped = values
      .slice(0, spec.count)
      .map((v) => finish(capText(String(v ?? ''), cap)))
      .filter((v) => v.length > 0);
    if (capped.length === 0) continue;
    fill[spec.key] = spec.count > 1 ? capped : capped[0];
  }
  return fill;
}

function describeRole(spec: LayoutSlotSpec): string {
  const r = spec.role;
  const g = spec.group;
  if (r === 'eyebrow-label') return 'short all-caps section tag';
  if (r === 'title') return 'slide title (noun phrase)';
  if (r === 'author') return "presenter's name";
  if (r === 'date') return 'date';
  if (r === 'metric-value') return g ? `${g} number/value` : 'big number/value';
  if (r === 'metric-label') return g ? `${g} label` : 'metric label';
  if (r === 'delta') return 'change indicator (e.g. ↑ 12%)';
  if (r === 'RECOMMENDED') return 'recommended tag text';
  if (r === 'body') return g ? `${g} text` : 'supporting text';
  return r;
}

// ── Orchestrator: plan → fill (parallel) → assemble ──────────────────────────

export interface StructuredDeckOptions {
  prompt: string;
  cardCount?: number;
  /** A skin id to force (mono-light | chroma-fold | quill); else the planner picks. */
  skinHint?: string;
  /** Authoritative source material to ground the deck in. When a file is
   *  attached this is its extracted text; when the user only typed a prompt this
   *  is the prompt itself (see `standalone`). */
  sourceText?: string;
  /** True when `sourceText` is the user's typed prompt (no file). The fill stage
   *  then AUTHORS substantive content expanding the brief rather than
   *  transcribing a document — so a typed prompt alone fills a full deck. */
  standalone?: boolean;
  /** Detail TIER (concise | detailed | extensive) — graduated body fill. */
  density?: string;
  /** Inspire-structure mode: an ordered section outline extracted from the user's
   *  reference document. Biases the planner's slide SEQUENCE. */
  structureHint?: string[];
  /** Source mode (verbatim | build | inspire) — how far to develop beyond the
   *  source. Threaded into each slide's fill. Default 'inspire'. */
  rewriteIntensity?: string; // 'verbatim' | 'build' | 'inspire' (normalized at use; default inspire)
  /** Customize → Audience: who the deck addresses. Steers prose register + depth,
   *  not facts. Empty/absent → generic. Threaded into PLAN framing + every FILL. */
  audience?: string;
  /** Customize → Tone (e.g. "Confident", "Authoritative"). Empty/absent → neutral. */
  tone?: string;
  /** Customize → Voice (resolved document-skill id, or framework default). null →
   *  no voice biasing. Injected as concrete voice rules into every slide's fill. */
  voice?: SkillId | null;
  /** Called when the plan is ready (card shells, before fill). */
  onPlanReady?: (plan: StructurePlan, skinId: string) => void;
  /** Called as each slide's content is filled and built. */
  onSlideComplete?: (index: number, card: Card, total: number) => void;
  /** Called the instant the deck is fully FILLED (~10s), BEFORE the judge runs.
   *  The deck is complete and renderable at this point; the client saves and
   *  reveals here so a slow judge (or the 120s request cap, or the user
   *  navigating away) can never lose the deck. The judge then runs and the
   *  `done` event re-saves any revised slides. */
  onFillComplete?: (template: CardTemplate) => void;
  /** POC (2026-06-17): place real library images on two slides — a full-bleed
   *  cover + one content slide with a side image. Opt-in; off leaves the
   *  imageless behavior untouched. */
  withImages?: boolean;
  /** Explicit user pick (library image id) for the cover image. Overrides the
   *  topic-matched auto-pick. */
  coverImageId?: string;
  /** Explicit user pick (library image id) for the content split image.
   *  Overrides the per-slide-focus auto-pick. */
  contentImageId?: string;
  /** Run the VLM visual judge on every built slide (renders → judges → trace).
   *  Requires baseUrl (this server's origin). Off by default — it adds a render
   *  + vision call per slide. */
  judge?: boolean;
  /** This server's origin, needed for the judge's headless render. */
  baseUrl?: string;
  /** Receives each slide's verdict trace as the judge fires (proof it ran). */
  onSlideJudged?: (trace: import('./judge-deck').SlideVerdictTrace) => void;
}

/** Generate a full deck by FILLING validated structures. Returns a multi-card
 *  CardTemplate whose cards each carry the structure's freeform geometry with
 *  real content in the slots. */
export async function generateStructuredDeck(
  opts: StructuredDeckOptions,
): Promise<CardTemplate> {
  const t0 = Date.now();
  // Start the per-generation usage meter (request-scoped) so every text-gen +
  // vision call's tokens accrue here → a real cost row in deck-cost-log.csv.
  beginUsageMeter();
  // The planner already takes the prompt as TOPIC, so in standalone mode (source
  // IS the prompt) don't also feed it as "source material" — that would just
  // duplicate the topic. A real attached file is still passed as source.
  const planSource = opts.standalone ? undefined : opts.sourceText;
  // Heavier storyline on SHORT decks: floor the density so the few content slides are
  // DENSE, not thin. ≤6 slides
  // → extensive; otherwise honor the requested density.
  const effectiveDensity = opts.cardCount && opts.cardCount > 0 && opts.cardCount <= 6 ? 'extensive' : opts.density;
  // Phase-D (2026-07-10): a writer-authored brief runs BEFORE the planner so layout
  // picks serve concrete content shapes + a narrative arc — the same holistic pass
  // the Compass path runs. Fail-open: a null brief lets the planner reason from
  // topic/source alone (prior behaviour).
  const { writeDeckBrief } = await import('./deck-brief');
  const brief = await writeDeckBrief({
    prompt: opts.prompt,
    sourceText: planSource,
    standalone: opts.standalone,
    effectiveCount: opts.cardCount && opts.cardCount > 0 ? opts.cardCount : undefined,
    audience: opts.audience,
    tone: opts.tone,
    density: effectiveDensity,
  });
  sfLog('brief', brief
    ? `goal="${brief.deckGoal.slice(0, 70)}" · arc=[${brief.narrativeArc.join('→')}] · ${brief.slideIntentions.length} intentions`
    : 'unavailable (planner reasons from topic/source)');
  const plan = await planStructureDeck(opts.prompt, opts.cardCount, opts.skinHint, planSource, effectiveDensity, opts.structureHint, opts.audience, opts.tone, brief, opts.withImages);
  const { skinId } = plan;

  // ── Images (planner-driven) ─────────────────────────────────────────────────
  // The planner picks image-bearing layouts (combo-body-image) where a visual
  // helps the story; it sources a content-matched image for each, add a full-bleed
  // cover for non-faithful themes, and top up prose slides so a deck reads with a
  // modest set of supporting images — AT MOST 3 total. Each
  // image is DERIVED from the slide's own focus (per-slide relevance); an
  // off-topic or ungeneratable pick is SKIPPED, never forced. A slide left without
  // an image is never a combo-body-image (no blank image column) — it falls back
  // to the plain combo-body variant. Resolution runs BEFORE the parallel fill so
  // any layout coercion is in place when buildOneSlide reads plan.slides.
  type SlotImage = NonNullable<Awaited<ReturnType<typeof pickForSlot>>['image']>;
  const slotImages = new Map<number, SlotImage[]>();
  let coverImg: SlotImage | undefined;
  const MAX_DECK_IMAGES = 3;
  const MAX_CONTENT_IMAGES = 2; // + optional cover = 3 max
  if (opts.withImages) {
    const taken = new Set<string>();
    const usedSubjects = new Set<string>(); // drives per-slide subject variety
    let budget = MAX_DECK_IMAGES;
    // Faithful covers are typographic by design — their Figma cover carries no
    // image, so a full-bleed photo would clobber the fidelity-gated design. Only
    // non-faithful covers accept one.
    const wantCoverImage = coverAcceptsImage(skinId);
    if (wantCoverImage && plan.slides[0]?.layoutKey === '01-cover') {
      let r: { image: SlotImage | undefined; note: string };
      if (opts.coverImageId) {
        const ov = await findLibraryImagesByIds([opts.coverImageId]);
        r = { image: ov[opts.coverImageId], note: `override ${opts.coverImageId}` };
      } else {
        r = await pickForSlot(`${opts.prompt} ${opts.sourceText ?? ''}`.trim(), taken, usedSubjects, 'landscape');
      }
      if (r.image) { coverImg = r.image; taken.add(r.image.id); budget -= 1; }
      sfLog('images-pick', `cover: ${r.note}`);
    }

    // Candidate content slides (skip scaffold). The planner's own image layouts go
    // first; prose slides (body/statement/content) are eligible to be coerced INTO
    // an image layout only if a relevant image is actually found.
    const SCAFFOLD = new Set(['01-cover', '08-divider', '09-closing', '10-agenda']);
    const bodyVariant = resolveComboFamily('combo-body', effectiveDensity);
    const imgVariant = resolveComboFamily('combo-body-image', effectiveDensity);
    // Coercible = a slide whose content reads fine as prose beside an image. Prose
    // slides first, then card slides (a bulleted list → prose + image is natural).
    // Data/quote/timeline slides are LEFT structural — a photo there fights their
    // form — so a table-heavy deck still gets an image via its card/prose slides.
    const isProse = (k: string) => k === '05-content' || k.startsWith('combo-body') || k === 'combo-statement';
    const isCoercible = (k: string) => isProse(k) || k.startsWith('combo-cards');
    const content = plan.slides
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i >= 1 && !SCAFFOLD.has(s.layoutKey));
    const plannerImg = content.filter(({ s }) => imageSlotsFor(s.layoutKey, skinId).length > 0);
    const coercible = content.filter(({ s }) => imageSlotsFor(s.layoutKey, skinId).length === 0 && isCoercible(s.layoutKey));
    const candidates = [...plannerImg, ...coercible];

    let placed = 0;
    // Explicit content-image override (internal authoring surface): pin it to the
    // first candidate slide, coercing to the image variant if needed.
    if (opts.contentImageId && candidates.length) {
      const ov = await findLibraryImagesByIds([opts.contentImageId]);
      const img = ov[opts.contentImageId];
      if (img) {
        const { s, i } = candidates[0];
        if (imageSlotsFor(s.layoutKey, skinId).length === 0) plan.slides[i] = { ...s, layoutKey: imgVariant };
        slotImages.set(i, [img]);
        taken.add(img.id);
        budget -= 1;
        placed += 1;
        sfLog('images-pick', `slide ${i} ${plan.slides[i].layoutKey}: override ${opts.contentImageId}`);
      }
    }
    for (const { s, i } of candidates) {
      if (slotImages.has(i)) continue; // already placed (override)
      const hadImageSlot = imageSlotsFor(s.layoutKey, skinId).length > 0;
      if (budget <= 0 || placed >= MAX_CONTENT_IMAGES) {
        // Out of budget: a planner image layout with no image would show a blank
        // column — drop it to the plain prose variant.
        if (hadImageSlot) plan.slides[i] = { ...s, layoutKey: bodyVariant };
        continue;
      }
      const r = await pickForSlot(`${s.focus} ${opts.prompt}`.trim(), taken, usedSubjects, 'portrait');
      if (r.image) {
        taken.add(r.image.id);
        budget -= 1;
        placed += 1;
        // A prose slide needs an image slot to hold the picture — coerce it into
        // the combo-body-image variant (same density) before the fill runs.
        if (!hadImageSlot) plan.slides[i] = { ...s, layoutKey: imgVariant };
        slotImages.set(i, [r.image]);
        sfLog('images-pick', `slide ${i} ${plan.slides[i].layoutKey}: ${r.note}`);
      } else {
        // No relevant image — never leave a blank image column.
        if (hadImageSlot) plan.slides[i] = { ...s, layoutKey: bodyVariant };
        sfLog('images-pick', `slide ${i} ${s.layoutKey}: ${r.note}`);
      }
    }
    sfLog('images', `cover=${coverImg?.id ?? (wantCoverImage ? 'none' : 'skipped(faithful)')} · content-image-slides=[${[...slotImages.keys()].join(',')}] · budget-left=${budget}`);
  }

  opts.onPlanReady?.(plan, skinId);

  const deckOutline = plan.slides.map((s) => s.focus);

  // Phase A (outline-first): the deck's REAL content sections, in order. Their
  // titles seed BOTH each content slide's title slot AND the deterministic agenda
  // — one source of truth, so agenda items == slide titles by construction.
  const SCAFFOLD_LAYOUTS = new Set(['01-cover', '08-divider', '09-closing', '10-agenda']);
  const contentSectionTitles = plan.slides
    .filter((s) => !SCAFFOLD_LAYOUTS.has(s.layoutKey))
    .map((s) => (s.title && s.title.trim() ? s.title : s.focus).trim())
    .filter(Boolean);

  // Build ONE slide: fill → stamp → assemble → fit → image. Extracted from the
  // parallel map so the auto-revise loop can rebuild a single slide with the
  // judge's feedback (passed as ctx.feedback → the writer fixes the flagged
  // visual problems on the re-fill).
  const buildOneSlide = async (slide: (typeof plan.slides)[number], i: number, feedback?: string[]): Promise<Card> => {
      const layoutPurpose = layoutCatalogue().find((l) => l.key === slide.layoutKey)?.purpose ?? '';
      // Figma path: no chart/table slots exist in the manifest, to always
      // pass empty data-slot specs. Writer never populates charts/tables.
      const { text: fill } = await fillStructureSlots(
        {
          index: i,
          total: plan.slides.length,
          layoutKey: slide.layoutKey,
          layoutPurpose,
          focus: slide.focus,
          takeaway: slide.takeaway,
          deckOutline,
          topic: opts.prompt,
          sourceText: opts.sourceText,
          standalone: opts.standalone,
          density: effectiveDensity,
          rewriteIntensity: opts.rewriteIntensity,
          audience: opts.audience,
          tone: opts.tone,
          voice: opts.voice,
          // Phase-D deck-level context: the writer shapes prose to the slide's
          // arc role (a `cause` slide names its cause; a `consequence` references
          // what caused it) and can tie to its neighbors — no floating facts.
          deckGoal: plan.deckGoal,
          narrativeRole: slide.narrativeRole,
          arcContext: { prev: plan.slides[i - 1]?.focus, next: plan.slides[i + 1]?.focus },
          feedback,
        },
        skinId,
      );

      // Phase A — deterministic title + agenda. Overrides the AI fill for these
      // specific slots only; the rest of the fill (and FR11 grounding) is untouched.
      const stampSpecs = describeLayoutSlots(slide.layoutKey, skinId);
      // (a) HEADING = the short TOC topic label (a clean, scannable heading). The
      //     TAKEAWAY (the slide's one point) is shown in the layout's POINT slot
      //     instead — the hero statement if it has one, else the lead/subhead line
      //     under the title. So the slide reads "Topic label" + "the point it makes"
      // a label AND a takeaway,;
      //     don't force the point into the heading). Scaffold slides keep their title.
      if (!SCAFFOLD_LAYOUTS.has(slide.layoutKey) && slide.title) {
        const titleSpec = stampSpecs.find((s) => s.role === 'title' && !s.group);
        if (titleSpec) fill[titleSpec.key] = slide.title;
      }
      if (!SCAFFOLD_LAYOUTS.has(slide.layoutKey) && slide.takeaway?.trim()) {
        const pointSpec =
          stampSpecs.find((s) => s.role === 'statement') ??
          stampSpecs.find((s) => s.role === 'body' && (s.group === 'lead' || s.group === 'subhead'));
        if (pointSpec) fill[pointSpec.key] = slide.takeaway.trim();
      }
      // (b) Agenda: stamp item titles (+ numbers) from the content-section titles —
      //     a real table of contents, not an independent AI pass.
      if (slide.layoutKey === '10-agenda') {
        // Match the original agenda (item-title) OR the combo agenda (agenda-title).
        const itemSpec = stampSpecs.find((s) => s.role === 'metric-label' && (s.group === 'item-title' || s.group === 'agenda-title'));
        if (itemSpec) {
          const items = contentSectionTitles.slice(0, itemSpec.count);
          fill[itemSpec.key] = items;
          const numSpec = stampSpecs.find((s) => s.role === 'metric-value' && s.group === 'item-number');
          if (numSpec) fill[numSpec.key] = items.map((_, n) => String(n + 1).padStart(2, '0'));
          sfLog('agenda-stamp', `${items.length} items from outline: [${items.join(' · ')}]`);
        }
      }

      const built = buildStructureTemplate(slide.layoutKey, skinId, fill);
      const card: Card = { ...built.cards[0], id: `card-${i}` };
      // (Volt's per-slide bg-cycling was retired 2026-07-13 — Volt now uses the one
      //  shared Figma backdrop via CATEGORY_BACKGROUNDS, like Glacier.)
      // CLOSED-LOOP FIT (at placement): measure each text slot in the real font
      // and shrink→shorten→never-grow so nothing can spill. Bakes fontSize+text
      // into the card so the editor render and the .pptx export use the fitted
      // values. Deterministic; the model-rewrite quality path layers on top.
      let fitNotes = fitCardText(card);
      if (fitNotes.length) {
        sfLog('fit', `slide ${i} ${slide.layoutKey}: ${fitNotes.map((n) => `"${n.text}" ${n.fromSize}→${n.toSize}${n.shortened ? '+trim' : ''}${n.overflow ? '!OVERFLOW' : ''}`).join(' · ')}`);
      }
      // REWRITE-TO-FIT (bounded, grounded): the deterministic fit above may have
      // TRIMMED a slot mid-idea to make it fit. Rewrite those to the box's char
      // budget as COMPLETE sentences (reshorten rejects any rewrite that drops a
      // grounded number — FR11 over brevity), apply, re-fit, and repeat up to 2
      // passes so a still-over rewrite condenses further. The word-boundary trim
      // stays the floor under it; non-fatal / fail-open. Whatever still can't fit
      // after the ladder is STAMPED as a hard defect below — never silently clipped.
      for (let pass = 0; pass < 2; pass++) {
        const trimmed = fitNotes.filter((n) => (n.shortened || n.overflow) && n.id && n.full && n.cap && !n.verbatim);
        if (!trimmed.length) break;
        let applied = 0;
        try {
          const { reshorten } = await import('./reshorten');
          const rw = await reshorten(trimmed.map((n) => ({ id: n.id!, text: n.full!, maxChars: n.cap! })));
          if (rw.size) {
            for (const b of card.freeform ?? []) {
              if (b.type === 'text' && b.id && rw.has(b.id)) {
                // Collapse any adjacent-word stutter the condensing rewrite emitted
                // ("load-load-bearing") — this replacement bypasses the initial
                // fill's stripMarkdownTokens cleanup.
                (b as { content?: string }).content = collapseStutters(rw.get(b.id) ?? '');
                applied += 1;
              }
            }
          }
        } catch (e) {
          sfLog('reshorten-error', `slide ${i}: ${e instanceof Error ? e.message : String(e)}`);
          break; // fail-open — keep what it has; the stamp below flags any survivor
        }
        if (!applied) break; // nothing accepted (rejected on grounding/length) — stop
        fitNotes = fitCardText(card); // re-fit the rewritten (shorter) text
        sfLog('reshorten', `slide ${i} pass ${pass + 1}: rewrote ${applied}/${trimmed.length} trimmed slot(s)`);
      }
      // NO SILENT TRUNCATION: any non-verbatim slot the ladder still couldn't fit
      // is flagged `truncated` on the block — a machine-readable hard defect the
      // eval harness counts and the gate enforces. Cleared on slots that now fit
      // so a re-fit deck never carries a stale flag.
      const stillTrimmed = new Set(
        fitNotes.filter((n) => (n.shortened || n.overflow) && !n.verbatim && n.id).map((n) => n.id!),
      );
      for (const b of card.freeform ?? []) {
        if (b.type !== 'text' || !b.id) continue;
        if (stillTrimmed.has(b.id)) (b as { truncated?: boolean }).truncated = true;
        else if ((b as { truncated?: boolean }).truncated) delete (b as { truncated?: boolean }).truncated;
      }
      if (stillTrimmed.size) sfLog('truncated', `slide ${i}: ${stillTrimmed.size} slot(s) still don't fit after rewrite — flagged`);

      // Images POC: stamp the resolved library images onto the cover + the
      // chosen content slide. Additive — runs AFTER the build's compression/
      // centering passes so a full-bleed image can't perturb text layout.
      if (opts.withImages) {
        const imgSlots = imageSlotsFor(slide.layoutKey, skinId);
        const slotImgs = slotImages.get(i);
        if (i === 0 && slide.layoutKey === '01-cover' && coverImg) {
          applyCoverImage(card, coverImg);
          sfLog('images', `slide 0 cover full-bleed · ${coverImg.id}`);
        } else if (imgSlots.length && slotImgs?.length) {
          // Image layout: place one sourced image per manifest image slot at its
          // geometry (theme paints bg + text). A grid gets distinct images.
          imgSlots.forEach((geo, k) => applyManifestImage(card, slotImgs[k] ?? slotImgs[0], geo));
          // Overlay layouts (text on image): paint the renderer scrim + force
          // legible text in the overlaid text's zone.
          const ov = overlayInfoFor(slide.layoutKey);
          if (ov) applyOverlayScrim(card, ov.zone);
          sfLog('images', `slide ${i} ${slide.layoutKey} manifest-image · ${imgSlots.length} slot(s)${ov ? ` · overlay-scrim(${ov.zone})` : ''}`);
        }
      }

      opts.onSlideComplete?.(i, card, plan.slides.length);
      sfLog('fill-done', `slide ${i} ${slide.layoutKey} · ${Object.keys(fill).length} blanks filled${feedback?.length ? ' (revised)' : ''}`);
      return card;
  };

  // Initial build — all slides in parallel.
  const cards: Card[] = await Promise.all(plan.slides.map((slide, i) => buildOneSlide(slide, i)));

  // Theme comes from the first built structure (skin colors/fonts) — every card
  // shares the skin, so card[0]'s theme represents the deck.
  const skinTemplate = buildStructureTemplate(plan.slides[0].layoutKey, skinId);
  const template: CardTemplate = {
    id: `struct-deck-${skinId}`,
    name: opts.prompt.slice(0, 60),
    description: opts.prompt,
    category: 'structure',
    thumbnail: '',
    theme: skinTemplate.theme,
    cards,
  };

  // Deck is fully filled and renderable HERE, before the judge. Hand it to the
  // client now so it saves + reveals at ~10s; the judge below can no longer cost
  // it the deck if it runs long or the request is capped.
  opts.onFillComplete?.(template);

  // ── Generation metrics (timing-first; appended to docs/metrics) ──────────────
  // `fillMs` = everything up to here (plan + fill) = the deck itself. The judge
  // and revise phases are timed separately below so docs/metrics shows WHERE the
  // wall-clock goes (the lever for the 120s request cap).
  const fillMs = Date.now() - t0;
  let judgeMs = 0;
  let reviseMs = 0;
  let judgedCount = 0;
  let judgeFailCount = 0;
  let revisedCount = 0;
  let verdictByIndex = new Map<number, string>();

  // ── GATE (shared) ─────────────────────────────────────────────────────────
  // Migrated 2026-07-10 to the SHARED gate (slide-gates.ts) — the same judge +
  // content-judge + capped revise loop the native/Compass path uses. The Figma
  // path now gains the FIXER CONTRACT (verify-result + fail-safe revert), the
  // ADVISORY VLM (taste no longer hard-gates a slide), and the full fixer set
  // for free, and the ~150-line inline duplicate that used to live here is gone.
  // swapLayout / imageReject stay undefined (this path re-fills via buildOneSlide
  // and does not cache per-slot images), so the gate falls through to a writer
  // rebuild + geometry fix — the old inline behaviour, plus the new safety net.
  // Non-fatal: runJudgeAndReviseStage swallows its own errors and returns what
  // it has, so a judge hiccup can never take down the already-built deck.
  if (opts.judge && opts.baseUrl) {
    const { runJudgeAndReviseStage } = await import('./slide-gates');
    const gate = await runJudgeAndReviseStage({
      cards,
      layoutKeys: plan.slides.map((s) => s.layoutKey),
      theme: template.theme,
      baseUrl: opts.baseUrl,
      rebuildSlide: (index, feedback) => buildOneSlide(plan.slides[index], index, feedback),
      takeawayFor: (index) => plan.slides[index]?.takeaway,
      topic: opts.prompt,
      sourceText: opts.sourceText,
      audience: opts.audience,
      tone: opts.tone,
      density: String(opts.density ?? 'detailed'),
      onSlideJudged: opts.onSlideJudged,
      log: sfLog,
    });
    judgeMs = gate.judgeMs;
    reviseMs = gate.reviseMs;
    judgedCount = gate.judgedCount;
    judgeFailCount = gate.judgeFailCount;
    revisedCount = gate.revisedCount;
    verdictByIndex = gate.verdictByIndex;
  }

  const totalMs = Date.now() - t0;
  sfLog('done', `${cards.length} cards · ${totalMs}ms`);

  // DETERMINISTIC fit audit (math, no render/VLM) — does each block fit its
  // template slot? Logged for calibration before it becomes a wired hard gate;
  // the per-block detail goes to the deck's geometry.json, the counts to the CSV.
  const fitAudit = auditDeckGeometry(cards, plan.slides.map((s) => s.layoutKey), skinId, opts.density);
  const fit = summarizeFit(fitAudit);
  sfLog('fit-audit', `${fit.blocks} blocks · overBudget=${fit.overBudget} shrunk=${fit.fontShrunk} sparse=${fit.sparse} overflowV=${fit.overflowV} worstShrink=${Math.round(fit.worstShrink * 100)}%`);

  // Unique id PER GENERATION (template.id is the constant template name, e.g.
  // "struct-deck-volt", so it would overwrite). Used as the CSV deckId and the
  // per-deck geometry.json folder name.
  const genTimestamp = new Date().toISOString();
  const genId = `${skinId}-${genTimestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
  await logDeckGeneration({
    timestamp: genTimestamp,
    deckId: genId,
    prompt: opts.prompt ?? '',
    source: opts.sourceText && opts.sourceText.trim() ? 'source-grounded' : 'prompt-only',
    skin: skinId,
    slideCount: cards.length,
    layouts: plan.slides.map((s) => s.layoutKey),
    density: String(opts.density ?? 'detailed'),
    judgeEnabled: !!opts.judge,
    judgeConcurrency: Math.max(1, Number(process.env.JUDGE_CONCURRENCY) || 1),
    totalMs, fillMs, judgeMs, reviseMs,
    judged: judgedCount,
    judgeFails: judgeFailCount,
    revisions: revisedCount,
    verdicts: Array.from(verdictByIndex.entries()).filter(([, v]) => v !== 'PASS').map(([i, v]) => `${i}:${v}`),
    status: 'ok',
    geomBlocks: fit.blocks,
    geomOverBudget: fit.overBudget,
    geomFontShrunk: fit.fontShrunk,
    geomSparse: fit.sparse,
    geomOverflowV: fit.overflowV,
    geomWorstShrink: fit.worstShrink,
    geomFlagged: fit.flagged,
  });
  await writeDeckDetail(genId, { generatedAt: genTimestamp, deckId: genId, template: template.id ?? '', skin: skinId, density: opts.density ?? 'detailed', prompt: opts.prompt ?? '', slides: fitAudit });

  // COST row (deck-cost-log.csv) from the live usage meter — real per-deck $.
  const usage = readUsageMeter();
  if (usage) {
    const imagesUsed = cards.reduce(
      (n, c) => n + (c.freeform ?? []).filter((b) => b.type === 'image' && !!(b as { src?: string }).src).length,
      0,
    );
    const hasNumbers = countTopicNumbers([opts.prompt, opts.sourceText].filter(Boolean).join(' ')) > 0;
    await appendCostRow({
      date: genTimestamp.slice(0, 10),
      deckId: genId,
      model: getModel(),
      slideCount: cards.length,
      imagesUsed,
      hasNumbers,
      usage,
      judgeFails: judgeFailCount,
      revisions: revisedCount,
      status: 'ok',
      notes: 'live',
    });
  }
  return template;
}
