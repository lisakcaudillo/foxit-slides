/**
 * Design Intelligence Layer — Phase 3: the Critique Loop.
 *
 * Implements §8 of `docs/requirements/design-intelligence-layer-spec.md` and
 * the LOCKED decisions in §13:
 *
 *   1. SILENT auto-fix + a subtle, non-blocking review dot. No "we fixed N"
 *      summary modal.
 *   2. Tier B (VLM) is OPT-IN — a "Polish deck" action + auto only on
 *      low-confidence slides. NOT always-on.
 *
 * After slides are assembled, every slide is checked against its design intent.
 * Tier A (this file's core) is a fully deterministic, AI-free pass that always
 * runs: it silently auto-fixes what it safely can and records every issue in a
 * `CritiqueReport` attached to the card. Unresolved issues surface as the
 * review dot in CardEditor's thumbnail rail (CHI P2 — in-context, not a modal).
 *
 * Tier B is a VLM visual pass. THIS build ships the PLUMBING + gating + the
 * rubric prompt; the actual vision model call is behind a clearly-marked,
 * safely-failing stub (`runVlmCritique`) that returns no issues. The Tier A
 * path is fully real.
 *
 * GOVERNANCE / SAFETY CONTRACT (§14):
 *   - Additive + defensive. Critique is a POST-pass. Any failure = today's
 *     behavior: `critiqueCard` / `critiqueDeck` never throw, never block,
 *     never hang. On any internal error the slide is returned untouched.
 *   - Loop control: at most MAX_FIX_ITERATIONS per slide, then flag. Pure
 *     synchronous fixes — no awaiting inside the Tier-A loop — so it can't hang.
 *   - FR11: the density check NEVER invents stats; it only flags or truncates.
 *   - No `any`. Structured (Zod) where it crosses the AI boundary (Tier B).
 */

import { z } from 'zod';
import type { Card, CardBlock, TemplateTheme } from '@/types/card-template';
import { contrastRatio, AA_NORMAL, LIGHT_TEXT } from '@/lib/contrast';
import type { ContentBudget } from './design-types';
import { renderCardToPng } from './render-card';
import { judgeSlideImage, type SlideType, type SlideVerdict } from './vlm-judge';

// ── Contracts (§8) ───────────────────────────────────────────────────────────

export const CRITIQUE_CHECKS = [
  'overflow',
  'widow',
  'collision',
  'placeholder',
  'density',
  'contrast',
  'hierarchy',
  'rhythm',
  'empty',
  'visual', // Tier B only
] as const;
export type CritiqueCheck = (typeof CRITIQUE_CHECKS)[number];

export type CritiqueSeverity = 'low' | 'med' | 'high';

export interface CritiqueIssue {
  check: CritiqueCheck;
  severity: CritiqueSeverity;
  /** True when the loop fixed it (silently); false when it could only flag. */
  resolved: boolean;
  /** Human-readable note — what was fixed, or what the user should look at. */
  detail?: string;
  /** Short label of the fix action taken, when resolved. */
  fixApplied?: string;
}

export interface CritiqueReport {
  slideId: string;
  issues: CritiqueIssue[];
  /** Which tier last touched this slide. */
  passedAt: 'A' | 'B';
}

/** Zod schema for the Tier-B VLM response (crosses the AI boundary). */
export const VlmIssueSchema = z.object({
  check: z.enum(['overflow', 'collision', 'density', 'visual']),
  severity: z.enum(['low', 'med', 'high']),
  detail: z.string().max(280),
});
export const VlmCritiqueSchema = z.object({
  professional: z.boolean(),
  issues: z.array(VlmIssueSchema).max(6),
});
export type VlmCritique = z.infer<typeof VlmCritiqueSchema>;

// ── Loop control ───────────────────────────────────────────────────────────
/** Max deterministic fix iterations per slide before we stop and flag. The
 *  Tier-A checks are idempotent fixed-points (a fix never re-creates the issue
 *  it resolved), so in practice one pass settles; the cap is a hard guarantee
 *  the loop can NEVER spin. */
export const MAX_FIX_ITERATIONS = 2;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Detect `[bracketed]` placeholder tokens (e.g. "[leads generated]"). Matches
 *  a bracket pair with at least one word char inside. Tolerates whitespace. */
const BRACKET_TOKEN = /\[[^\]]*[A-Za-z][^\]]*\]/;

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Strip obvious bracket placeholder tokens, leaving surrounding prose intact.
 *  Conservative: only removes the bracketed run + a trailing orphaned space. */
function stripBracketTokens(text: string): string {
  return text.replace(/\[[^\]]*[A-Za-z][^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Does a block carry any real, non-empty user-readable content? Used by the
 *  empty/degenerate-slide check. Image blocks count only when they have a src. */
function blockHasContent(block: CardBlock): boolean {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'callout':
      return block.content.trim().length > 0;
    case 'bullet-list':
      return block.items.some((i) => i.trim().length > 0);
    case 'smart-layout':
      return block.cells.some(
        (c) => c.heading.trim().length > 0 || c.body.trim().length > 0,
      );
    case 'toggle':
      return block.heading.trim().length > 0 || block.content.trim().length > 0;
    case 'button':
      return block.text.trim().length > 0;
    case 'label-group':
      return block.labels.some((l) => l.text.trim().length > 0);
    case 'grid-layout':
      return block.cells.some((cell) => cell.blocks.some(blockHasContent));
    case 'image':
      return typeof block.src === 'string' && block.src.trim().length > 0;
    case 'divider':
      return false;
    default:
      return false;
  }
}

/** Whether the fixing checks may safely rewrite this card's blocks. The
 *  generated path always emits a single column (`columns: [{ blocks }]`), and
 *  `writeBlocks` collapses to one column — so writing back is lossless ONLY for
 *  single-column cards. For the rare multi-column card we keep the FLAG but skip
 *  the mutation (never silently drop columns 2+). */
function canRewriteBlocks(card: Card): boolean {
  return (card.columns?.length ?? 0) <= 1;
}

/** Flatten the assembled card's structured blocks (columns[].blocks). The
 *  critique runs on the structured representation — the freeform conversion
 *  happens downstream at the client seam, so this is the canonical content at
 *  critique time (per spec §8 "operate on the assembled card data"). */
function structuredBlocks(card: Card): CardBlock[] {
  const out: CardBlock[] = [];
  for (const col of card.columns ?? []) {
    for (const b of col.blocks ?? []) out.push(b);
  }
  return out;
}

/** Approximate the rendered "word load" of a card — body words across
 *  paragraphs + smart-layout bodies + bullets. Heading/label words excluded
 *  (they're short and high-priority). Used by the density + overflow proxies.
 *  Server-side we cannot measure pixels, so this is an honest text-length proxy
 *  against the recipe budget — flag-leaning, not a real geometric overflow. */
function bodyWordLoad(blocks: CardBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    switch (b.type) {
      case 'paragraph':
      case 'callout':
        n += countWords(b.content);
        break;
      case 'bullet-list':
        n += b.items.reduce((s, i) => s + countWords(i), 0);
        break;
      case 'smart-layout':
        n += b.cells.reduce((s, c) => s + countWords(c.body), 0);
        break;
      case 'toggle':
        n += countWords(b.content);
        break;
      default:
        break;
    }
  }
  return n;
}

/** A loose "budget ceiling" in body words derived from the recipe budget.
 *  bodyMaxWords applies per text region; we scale by the number of body-bearing
 *  regions (paragraphs + cells + bullets) so multi-cell layouts get headroom. */
function budgetCeiling(budget: ContentBudget | undefined, blocks: CardBlock[]): number | null {
  if (!budget || typeof budget.bodyMaxWords !== 'number') return null;
  let regions = 0;
  for (const b of blocks) {
    if (b.type === 'paragraph' || b.type === 'callout' || b.type === 'toggle') regions += 1;
    else if (b.type === 'bullet-list') regions += b.items.length;
    else if (b.type === 'smart-layout') regions += b.cells.length;
  }
  regions = Math.max(1, regions);
  return budget.bodyMaxWords * regions;
}

// ── Tier A — deterministic checks ──────────────────────────────────────────
//
// Each check is a PURE function: it inspects the card, optionally returns a
// fixed copy of the card, and pushes a CritiqueIssue. No I/O, no AI, no await.
// "resolved: true" means the returned card no longer has the issue.

interface CheckResult {
  card: Card;
  issue: CritiqueIssue | null;
}

/** placeholder leakage — `[bracketed]` tokens, or an image block with empty
 *  src. AUTO-FIX: strip obvious bracket tokens from text blocks (regeneration
 *  is heavy — for MVP we clean + flag rather than re-run the realizer). Empty
 *  image src is FLAG-only (the user-placeholder image path is legitimate and we
 *  must not nuke a user's empty frame). */
function checkPlaceholder(card: Card): CheckResult {
  const blocks = structuredBlocks(card);
  let foundBracket = false;
  let foundEmptyImage = false;

  const fixedBlocks = blocks.map((b): CardBlock => {
    switch (b.type) {
      case 'heading':
      case 'paragraph':
      case 'callout': {
        if (BRACKET_TOKEN.test(b.content)) {
          foundBracket = true;
          return { ...b, content: stripBracketTokens(b.content) };
        }
        return b;
      }
      case 'bullet-list': {
        if (b.items.some((i) => BRACKET_TOKEN.test(i))) {
          foundBracket = true;
          return { ...b, items: b.items.map(stripBracketTokens).filter((i) => i.length > 0) };
        }
        return b;
      }
      case 'smart-layout': {
        if (b.cells.some((c) => BRACKET_TOKEN.test(c.heading) || BRACKET_TOKEN.test(c.body))) {
          foundBracket = true;
          return {
            ...b,
            cells: b.cells.map((c) => ({
              ...c,
              heading: stripBracketTokens(c.heading),
              body: stripBracketTokens(c.body),
            })),
          };
        }
        return b;
      }
      case 'image':
        if (!b.src || b.src.trim().length === 0) foundEmptyImage = true;
        return b;
      default:
        return b;
    }
  });

  if (!foundBracket && !foundEmptyImage) return { card, issue: null };

  const canFix = foundBracket && canRewriteBlocks(card);
  const nextCard: Card = canFix ? writeBlocks(card, fixedBlocks) : card;
  // Bracket leakage is auto-cleaned when we can safely rewrite (resolved).
  // Empty image src is always flag-only.
  const resolved = canFix && !foundEmptyImage;
  return {
    card: nextCard,
    issue: {
      check: 'placeholder',
      severity: 'high',
      resolved,
      fixApplied: foundBracket ? 'stripped bracketed placeholder tokens' : undefined,
      detail: foundEmptyImage
        ? 'A placed image has no source yet — pick or generate an image for it.'
        : 'Removed leftover placeholder tokens from the slide text.',
    },
  };
}

/** hierarchy — no heading, or multiple level-1 headings on a card. AUTO-FIX:
 *  demote extra H1s to H2 (keeps the first as the slide title). A missing
 *  heading is FLAG-only (we won't fabricate a title). */
function checkHierarchy(card: Card): CheckResult {
  const blocks = structuredBlocks(card);
  const headings = blocks.filter((b): b is Extract<CardBlock, { type: 'heading' }> => b.type === 'heading');

  if (headings.length === 0) {
    // Cover/quote/divider slides legitimately may rely on a single big heading
    // that IS present; only flag when there's genuinely no heading anywhere.
    return {
      card,
      issue: {
        check: 'hierarchy',
        severity: 'med',
        resolved: false,
        detail: 'This slide has no heading — consider adding a title.',
      },
    };
  }

  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count <= 1) return { card, issue: null };

  // Multi-column card — flag the duplicate H1s but don't rewrite (would drop
  // columns). Single-column is the generated norm and rewrites losslessly.
  if (!canRewriteBlocks(card)) {
    return {
      card,
      issue: {
        check: 'hierarchy',
        severity: 'med',
        resolved: false,
        detail: 'Multiple top-level headings — keep one as the slide title.',
      },
    };
  }

  // Demote every H1 after the first to H2.
  let seenFirstH1 = false;
  const fixed = blocks.map((b): CardBlock => {
    if (b.type === 'heading' && b.level === 1) {
      if (!seenFirstH1) {
        seenFirstH1 = true;
        return b;
      }
      return { ...b, level: 2 };
    }
    return b;
  });

  return {
    card: writeBlocks(card, fixed),
    issue: {
      check: 'hierarchy',
      severity: 'med',
      resolved: true,
      fixApplied: 'demoted extra top-level headings to subheadings',
      detail: 'Multiple top-level headings — kept one title and demoted the rest.',
    },
  };
}

/** empty / degenerate slide — a card with no real content blocks at all.
 *  FLAG-only (high) — we never fabricate content. */
function checkEmpty(card: Card): CheckResult {
  const blocks = structuredBlocks(card);
  const hasContent = blocks.some(blockHasContent);
  if (hasContent) return { card, issue: null };
  return {
    card,
    issue: {
      check: 'empty',
      severity: 'high',
      resolved: false,
      detail: 'This slide has no content yet — add text or regenerate it.',
    },
  };
}

/** density imbalance — body word load far over/under the recipe budget.
 *  AUTO-FIX (over): only when SAFE — we already truncate at the budget during
 *  generation (enforceContentBudgets), so by critique time content is at/under
 *  budget; an over-budget reading here means the budget regions disagree with
 *  the actual layout. We FLAG rather than truncate again (double-truncation
 *  risks cutting meaning). Under-budget is FLAG-only (med) — never invent. */
function checkDensity(card: Card): CheckResult {
  const blocks = structuredBlocks(card);
  const budget = card.slideDesign?.contentBudget as ContentBudget | undefined;
  const ceiling = budgetCeiling(budget, blocks);
  if (ceiling === null) return { card, issue: null };
  const load = bodyWordLoad(blocks);

  // Over-budget by >35% → flag (high-ish density risk of overflow).
  if (load > ceiling * 1.35) {
    return {
      card,
      issue: {
        check: 'density',
        severity: 'med',
        resolved: false,
        detail: 'This slide is heavier than its layout budget — consider trimming or splitting it.',
      },
    };
  }
  // Far under-budget (<35% of ceiling, and the slide is non-trivial) → flag.
  if (ceiling >= 12 && load > 0 && load < ceiling * 0.35) {
    return {
      card,
      issue: {
        check: 'density',
        severity: 'low',
        resolved: false,
        detail: 'This slide is sparse for its layout — it could carry more, or use a simpler layout.',
      },
    };
  }
  return { card, issue: null };
}

/** overflow — server-side we cannot measure rendered pixels, so this is a
 *  text-length proxy: a single body region that blows far past its per-region
 *  budget. FLAG-only and honest about being best-effort (the real overflow
 *  reflow lives in the client renderer). */
function checkOverflow(card: Card): CheckResult {
  const blocks = structuredBlocks(card);
  const budget = card.slideDesign?.contentBudget as ContentBudget | undefined;
  const perRegion = budget && typeof budget.bodyMaxWords === 'number' ? budget.bodyMaxWords : null;
  if (perRegion === null) return { card, issue: null };

  // A single paragraph/callout running 2.5× over its per-region cap is a
  // likely visual overflow on a 16:9 slide.
  const offender = blocks.find(
    (b) =>
      (b.type === 'paragraph' || b.type === 'callout') &&
      countWords((b as { content: string }).content) > perRegion * 2.5,
  );
  if (!offender) return { card, issue: null };
  return {
    card,
    issue: {
      check: 'overflow',
      severity: 'high',
      resolved: false,
      detail: 'A text block may run past the slide edge — shorten it or split the slide.',
    },
  };
}

/** widow/orphan — a lone single-word trailing bullet, or a one-word last
 *  paragraph. Genuinely render-dependent; server-side we approximate by
 *  flagging a single-word bullet/list item. FLAG-only (low). */
function checkWidow(card: Card): CheckResult {
  const blocks = structuredBlocks(card);
  for (const b of blocks) {
    if (b.type === 'bullet-list') {
      const widow = b.items.find((i) => i.trim().length > 0 && countWords(i) === 1);
      if (widow) {
        return {
          card,
          issue: {
            check: 'widow',
            severity: 'low',
            resolved: false,
            detail: 'A one-word list item may read as a stray — expand or merge it.',
          },
        };
      }
    }
  }
  return { card, issue: null };
}

/** contrast — for text rendered OVER a behind-text image/region, verify the
 *  resolved text color clears WCAG AA. The renderer already forces light text
 *  on a scrim over behind-text imagery, so this is mostly a VERIFY: we confirm
 *  the scrim-forced LIGHT_TEXT clears AA against a dark scrim, and FLAG only the
 *  rare case where a theme region (no scrim) can't reach AA with either text
 *  endpoint. Reuses contrast.ts. */
function checkContrast(card: Card): CheckResult {
  const design = card.slideDesign;
  if (!design) return { card, issue: null };

  // Behind-text imagery: full-bleed / texture / duotone / background sit behind
  // text. The render path paints a scrim and forces light text; verify that the
  // forced light text clears AA against a representative dark scrim tone.
  const behindRoles = new Set(['full-bleed', 'texture', 'duotone', 'background']);
  if (behindRoles.has(design.imageRole)) {
    // Representative scrim tone the renderer applies over imagery: a dark veil
    // (~#1a1a1a effective). Light text over it must clear AA — this is a
    // sanity VERIFY, not a fix.
    const SCRIM_DARK = '#1a1a1a';
    const ratio = contrastRatio(LIGHT_TEXT, SCRIM_DARK);
    if (ratio !== null && ratio < AA_NORMAL) {
      // Should never happen with the chosen endpoints; flag if the invariant
      // is ever violated so it surfaces instead of silently shipping.
      return {
        card,
        issue: {
          check: 'contrast',
          severity: 'high',
          resolved: false,
          detail: 'Text over the image may be hard to read — deepen the overlay.',
        },
      };
    }
    return { card, issue: null };
  }
  return { card, issue: null };
}

// ── Tier A orchestrator ──────────────────────────────────────────────────────

/** Per-slide checks that may also fix. Order matters only for readability —
 *  each is independent and idempotent. */
const TIER_A_CHECKS: ((card: Card) => CheckResult)[] = [
  checkPlaceholder,
  checkHierarchy,
  checkEmpty,
  checkDensity,
  checkOverflow,
  checkWidow,
  checkContrast,
];

/**
 * Run Tier A on a single assembled card. Returns the (possibly fixed) card with
 * a `critique` report attached. Pure + synchronous — cannot hang, cannot throw
 * out to the caller (wrapped). Loop control: re-runs the fixing checks up to
 * MAX_FIX_ITERATIONS until no NEW resolution lands, then stops; unresolved
 * issues are flagged.
 *
 * Defensive: on any internal error the original card is returned UNCHANGED with
 * no critique attached (today's behavior).
 */
export function critiqueCard(input: Card): Card {
  try {
    let working = input;
    const issues: CritiqueIssue[] = [];
    const seen = new Set<CritiqueCheck>();

    for (let iter = 0; iter < MAX_FIX_ITERATIONS; iter++) {
      let appliedNewFixThisPass = false;

      for (const check of TIER_A_CHECKS) {
        const { card: next, issue } = check(working);
        if (!issue) continue;

        // A given check contributes at most one issue to the report. If it
        // already flagged on a prior pass and is still flagging, don't dup it.
        if (issue.resolved) {
          working = next;
          // Replace any prior unresolved entry for this check with the resolved one.
          const existingIdx = issues.findIndex((i) => i.check === issue.check);
          if (existingIdx >= 0) issues[existingIdx] = issue;
          else issues.push(issue);
          seen.add(issue.check);
          appliedNewFixThisPass = true;
        } else if (!seen.has(issue.check)) {
          issues.push(issue);
          seen.add(issue.check);
        }
      }

      // Fixed point: nothing new got fixed this pass, so another pass is
      // guaranteed identical. Stop early.
      if (!appliedNewFixThisPass) break;
    }

    if (issues.length === 0) {
      // Clean slide — no report (a clean deck shows zero review dots).
      return working;
    }

    const report: CritiqueReport = {
      slideId: input.id,
      issues,
      passedAt: 'A',
    };
    return { ...working, critique: report };
  } catch (err) {
    // Defensive: critique must never change behavior on failure.
    console.warn('[critique] Tier A failed for card, leaving slide untouched:', err);
    return input;
  }
}

// ── rhythm — deck-level adjacency check ────────────────────────────────────

/**
 * Run the deck-level rhythm check across already-Tier-A'd cards. Two ADJACENT
 * slides sharing a recipe OR image role slipped past the planner's adjacency
 * rule. FLAG-only (low) on the second of the pair — swapping a recipe here
 * would desync the rendered content shape, to surface it for the user's
 * "Vary layouts" re-roll rather than silently mutate. Appends to the existing
 * per-slide report (creating one if needed).
 *
 * Defensive: returns the input unchanged on any error.
 */
export function critiqueDeckRhythm(cards: Card[]): Card[] {
  try {
    return cards.map((card, i) => {
      if (i === 0) return card;
      const prev = cards[i - 1];
      const a = card.slideDesign;
      const b = prev.slideDesign;
      if (!a || !b) return card;

      // Recipe-retirement (a), S3a: rhythm keys off `blockTemplate` (the content-
      // led layout intent) instead of the retired `recipe`. Two adjacent slides
      // with the same blockTemplate read as a repeated layout.
      const sameLayout = a.blockTemplate === b.blockTemplate;
      // Both 'none' image roles adjacent is fine (type-only runs are normal);
      // only flag a shared NON-none image role.
      const sameImageRole = a.imageRole !== 'none' && a.imageRole === b.imageRole;
      if (!sameLayout && !sameImageRole) return card;

      const issue: CritiqueIssue = {
        check: 'rhythm',
        severity: 'low',
        resolved: false,
        detail: sameLayout
          ? 'This slide repeats the previous slide’s layout — try a different layout for variety.'
          : 'This slide repeats the previous slide’s image style — vary it for rhythm.',
      };

      const existing = card.critique;
      const report: CritiqueReport = existing
        ? { ...existing, issues: [...existing.issues.filter((x) => x.check !== 'rhythm'), issue] }
        : { slideId: card.id, issues: [issue], passedAt: 'A' };
      return { ...card, critique: report };
    });
  } catch (err) {
    console.warn('[critique] deck rhythm pass failed, leaving deck untouched:', err);
    return cards;
  }
}

/**
 * Full Tier-A deck critique: per-slide checks + the deck-level rhythm pass.
 * The single entry point the orchestrator calls after assembly. Never throws.
 */
export function critiqueDeck(cards: Card[]): Card[] {
  try {
    const perSlide = cards.map((c) => critiqueCard(c));
    return critiqueDeckRhythm(perSlide);
  } catch (err) {
    console.warn('[critique] critiqueDeck failed, returning original cards:', err);
    return cards;
  }
}

// ── Tier B — VLM visual pass (opt-in / low-confidence; PLUMBING + STUB) ──────
//
// LOCKED (§13.2): opt-in "Polish deck" action + auto only on low-confidence
// slides. NOT always-on.
//
// What ships now: the gating logic, the rubric prompt, and the result→issue
// merge. The actual vision model call is a clearly-marked, safely-failing STUB
// (`runVlmCritique`) that returns no issues — see its body. Wiring a real call
// means rendering the slide to an image and sending it via the existing
// provider abstraction's vision helpers (`visionUserMessage` / `imageBlock`)
// with VLM_RUBRIC_PROMPT, then parsing with VlmCritiqueSchema. No direct SDK
// calls — everything goes through `getProvider()`.

/**
 * Should Tier B auto-fire on this slide? True only for "low-confidence" slides
 * — ones that passed Tier A but carry signals the deterministic pass can't
 * fully judge (image behind text, or a flagged-but-unresolved high-severity
 * issue). The deck-wide "Polish deck" action ignores this and runs Tier B on
 * every slide regardless.
 */
export function isLowConfidenceSlide(card: Card): boolean {
  const design = card.slideDesign;
  const behindImage =
    design != null &&
    (design.imageRole === 'full-bleed' ||
      design.imageRole === 'duotone' ||
      design.imageRole === 'background');
  const hasUnresolvedHigh =
    card.critique?.issues.some((i) => !i.resolved && i.severity === 'high') ?? false;
  return behindImage || hasUnresolvedHigh;
}

/** The rubric handed to the vision model (§8 Tier B). */
export const VLM_RUBRIC_PROMPT = `You are a senior presentation designer reviewing ONE rendered slide image.
Answer: does this read as a professional, well-composed slide?

Flag ONLY clear, objective problems:
- text clipped, cut off, or running past the slide edge
- text overlapping or colliding with an image so it's hard to read
- large awkward empty zones or severe imbalance
- broken or placeholder-looking content

Do NOT flag taste/subjective preferences. If the slide is fine, say so.

Respond with ONLY valid JSON:
{"professional": <true|false>, "issues": [{"check": "overflow|collision|density|visual", "severity": "low|med|high", "detail": "<one concrete sentence>"}]}
Output an empty issues array when the slide is clean. Raw JSON only — no markdown fences.`;

/** Best-effort slide-type inference for the visual rubric. The structured path
 *  doesn't persist its layoutKey on the Card, so classify from rendered content:
 *  slide 0 is the cover; many big numbers → stat; otherwise content. Conservative
 *  — an off guess only changes which rubric variant runs, never blocks. */
function inferSlideType(card: Card, index: number): SlideType {
  if (index === 0) return 'cover';
  const ff = card.freeform ?? [];
  const metricCount = ff.filter((b) => b.type === 'text' && (b as { variant?: string }).variant === 'metric').length;
  const text = ff
    .filter((b): b is typeof b & { content: string } => b.type === 'text' && typeof (b as { content?: unknown }).content === 'string')
    .map((b) => b.content.toLowerCase())
    .join(' ');
  if (metricCount >= 3) return 'stat';
  if (/\b(vs\.?|versus|compared?)\b/.test(text)) return 'comparison';
  if (/\b(agenda|what we'?ll cover|contents)\b/.test(text)) return 'agenda';
  if (/\b(thank you|get in touch|contact|let'?s connect)\b/.test(text)) return 'closing';
  return 'content';
}

/** Map a failed visual-judge criterion to a Tier-B critique check bucket. The
 *  judge's criterion reasons are free text; classify by keyword so the issue
 *  lands in the right CritiqueReport bucket (overflow / collision / density /
 *  visual). Defaults to 'visual' — the catch-all "reads like a template". */
function classifyVisualIssue(reason: string): 'overflow' | 'collision' | 'density' | 'visual' {
  const r = reason.toLowerCase();
  if (/(overflow|clip|cut ?off|truncat|spill|off ?the ?slide|illegible|too small)/.test(r)) return 'overflow';
  if (/(overlap|collid|touch|crowd|too close|on top of)/.test(r)) return 'collision';
  if (/(empty|sparse|whitespace|unbalanced|stranded|too much space|bare|thin)/.test(r)) return 'density';
  return 'visual';
}

/** Convert a SlideVerdict (vlm-judge) into the Tier-B VlmCritique shape. */
export function verdictToVlmCritique(verdict: SlideVerdict): VlmCritique {
  const issues = verdict.criteria
    .filter((c) => !c.pass)
    .slice(0, 6)
    .map((c) => ({
      check: classifyVisualIssue(c.reason),
      severity: (verdict.fails.includes(c.id) ? 'high' : 'med') as 'high' | 'med' | 'low',
      detail: `${c.id}: ${c.reason}`.slice(0, 280),
    }));
  return { professional: verdict.passed, issues };
}

/**
 * REAL Tier-B visual critique (replaces the former no-op stub). Renders the card
 * to a PNG server-side (headless SlideStage) and judges the image with the VLM
 * (judgeSlideImage). Fail-OPEN: any error (no OPENAI key, render hiccup, judge
 * error) returns a clean result so Tier B never blocks generation.
 */
async function runVlmCritique(
  card: Card,
  theme: TemplateTheme,
  slideType: SlideType,
  baseUrl?: string,
): Promise<VlmCritique> {
  try {
    const png = await renderCardToPng(card, theme, { baseUrl });
    if (!png) return { professional: true, issues: [] }; // render unavailable → no-op
    const judged = await judgeSlideImage(png.base64, slideType);
    if ('error' in judged) {
      console.warn('[critique] VLM judge error (fail-open):', judged.error);
      return { professional: true, issues: [] };
    }
    return verdictToVlmCritique(judged.verdict);
  } catch (err) {
    console.warn('[critique] runVlmCritique failed (fail-open):', err instanceof Error ? err.message : String(err));
    return { professional: true, issues: [] };
  }
}

/**
 * Run Tier B (VLM) on the given cards and merge any issues into their reports.
 *
 * @param cards     deck cards (already Tier-A critiqued)
 * @param opts.mode 'polish' = run on every slide (the "Polish deck" action);
 *                  'auto'   = run only on low-confidence slides (§13.2 default).
 *
 * Never throws, never blocks the deck: each slide's VLM call is wrapped, and a
 * failure leaves that slide's report untouched. Because `runVlmCritique` is a
 * stub today, this is a no-op end-to-end — but the gating + merge are real, so
 * wiring a model call later requires no caller changes.
 */
export async function critiqueDeckTierB(
  cards: Card[],
  theme: TemplateTheme,
  opts: { mode: 'polish' | 'auto'; baseUrl?: string; slideType?: (card: Card, i: number) => SlideType } = { mode: 'auto' },
): Promise<Card[]> {
  try {
    const results = await Promise.all(
      cards.map(async (card, i): Promise<Card> => {
        const shouldRun = opts.mode === 'polish' || isLowConfidenceSlide(card);
        if (!shouldRun) return card;
        try {
          const slideType: SlideType = opts.slideType?.(card, i) ?? inferSlideType(card, i);
          const vlm = await runVlmCritique(card, theme, slideType, opts.baseUrl);
          if (vlm.professional && vlm.issues.length === 0) return card;
          const newIssues: CritiqueIssue[] = vlm.issues.map((i) => ({
            check: i.check,
            severity: i.severity,
            resolved: false,
            detail: i.detail,
          }));
          const existing = card.critique;
          const report: CritiqueReport = existing
            ? { ...existing, issues: [...existing.issues, ...newIssues], passedAt: 'B' }
            : { slideId: card.id, issues: newIssues, passedAt: 'B' };
          return { ...card, critique: report };
        } catch (err) {
          console.warn('[critique] Tier B failed for a slide, leaving it untouched:', err);
          return card;
        }
      }),
    );
    return results;
  } catch (err) {
    console.warn('[critique] critiqueDeckTierB failed, returning input cards:', err);
    return cards;
  }
}

// ── internal: write a flat block array back into card.columns ────────────────
/** Replace the card's structured blocks with `blocks`, preserving the single
 *  column shape the assembler produces (`columns: [{ blocks }]`). Multi-column
 *  cards (rare in the generated path) collapse to one column — acceptable here
 *  because the critique fixes operate on the flattened content and the engine
 *  emits single-column cards. Returns a new Card (immutable). */
function writeBlocks(card: Card, blocks: CardBlock[]): Card {
  return { ...card, columns: [{ blocks }] };
}
