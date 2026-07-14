/**
 * Design Intelligence Layer — Pass 1: Deck Planner.
 *
 * Implements §6 of `docs/requirements/design-intelligence-layer-spec.md`.
 *
 * Input: the blueprint (card titles + blockTemplates), a theme archetype, and
 * the existing per-card `imageIntent` hints. Output: a `DeckPlan` assigning
 * every slide a recipe + imageRole under deck-wide rhythm rules.
 *
 * Fully DETERMINISTIC + pure. Reproducible for the same input. The spec allows
 * an optional LLM tie-break on ambiguous role calls; Phase 1 uses the
 * deterministic default (simpler, no extra AI call, degrades gracefully).
 *
 * Hard constraints enforced (§6 step 3):
 *   - no two adjacent slides share a recipe OR image role
 *   - ≤ ~50% of slides carry a "full-image" role (full-bleed / column / band)
 *   - cover is always distinct from slide 2
 *
 * The planner NEVER throws on bad input — callers wrap it defensively, but it
 * also self-guards (empty blueprint → empty plan).
 */

import type { CardBlueprint } from './types';
import type {
  DeckPlan,
  SlideDesign,
  ImageRole,
  ThemeArchetype,
} from './design-types';
import {
  getArchetypeProfile,
  inferSlideRole,
  resolveImageRole,
} from './recipes';
import { designForBlockTemplate } from './blocktemplate-design';
import type { ImageIntent } from './types';

// "Full-image" roles count toward the ≤50% cap.
const FULL_IMAGE_ROLES: ReadonlySet<ImageRole> = new Set<ImageRole>([
  'full-bleed', 'column', 'band',
]);

// Recipe-retirement (a), S3a: the recipe-scoring machinery
// (`contentSatisfiesRequirement`, `ContentSignals`, `deriveSignals`,
// `scoreRecipe`) is deleted. Recipe no longer drives layout (B2b), budget
// (S2 → budgetForTemplate), or image roles (S2 → blockTemplate table), so there
// is nothing left to score. The deck-level number gate that lived in
// `deriveSignals` is not lost — fabricated-number prevention is owned by the
// grounding guard (`topicHasNumbers` → enforce/judge `grounded`), independent of
// recipe selection.

/** Build the visual-weight curve — heavy at the ends, gentle rise/fall in
 *  the middle. Used as planning metadata (the realizer can lean on it later).
 */
function buildWeightCurve(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const curve: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0..1
    // Parabola dipping in the middle: ends ~1.0, middle ~0.6.
    const w = 0.6 + 0.4 * Math.abs(2 * t - 1);
    curve.push(Math.round(w * 100) / 100);
  }
  return curve;
}

// Recipe-retirement (a), S3a: `pickRecipe` deleted — the pre-gen recipe pick is
// gone. Composition is decided content-led at the converter (`pickTemplate`,
// keyed on blockTemplate); the planner no longer chooses a recipe.

/** Build the archetype-biased candidate order of image roles a blockTemplate
 *  allows. Archetype bias first (in priority order, intersected with allowed),
 *  then any remaining allowed roles as a tail. Pure. Recipe-retirement (a), S2:
 *  the allow-list is sourced from the blockTemplate-keyed design table, not the
 *  recipe catalog. */
function orderedImageRoles(blockTemplate: string | undefined, archetype: ThemeArchetype): ImageRole[] {
  const allowed = designForBlockTemplate(blockTemplate).allowedImageRoles;
  const bias = getArchetypeProfile(archetype).imageRoleBias;
  const ordered: ImageRole[] = [];
  for (const r of bias) if (allowed.includes(r) && !ordered.includes(r)) ordered.push(r);
  for (const r of allowed) if (!ordered.includes(r)) ordered.push(r);
  return ordered;
}

/** Choose an image role for a slide from the recipe's allowed set + the
 *  archetype bias, honoring adjacency + the ≤50% full-image cap + cover
 *  distinctness. Deterministic.
 *
 *  CRITICAL (Phase 1 bugfix 2026-06-03): `intent` is the REAL generated
 *  `imageIntent` produced BY the slide generator — it only exists AFTER
 *  generation. The generator is the authority on WHICH slides want an image
 *  (it chooses well — it produced good images before this layer existed); the
 *  planner's job is to VARY the role/placement across exactly those slides. So
 *  when the generator said `wanted:false` we honor `none` (restraint — a pro
 *  deck is ~half type-only). When it said `wanted:true` we pick a real image
 *  role and only fall back to `none` if nothing fits under the cap/adjacency. */
function pickImageRole(
  blockTemplate: string | undefined,
  archetype: ThemeArchetype,
  intent: ImageIntent | undefined,
  prevImageRole: ImageRole | null,
  fullImageBudgetLeft: number,
): ImageRole {
  const allowed = designForBlockTemplate(blockTemplate).allowedImageRoles;

  // The generator decides WHETHER this slide earns an image. No intent /
  // wanted:false → honor 'none' (type-only) when the recipe permits it.
  const wantsImage = intent?.wanted === true;
  if (!wantsImage) return allowed.includes('none') ? 'none' : 'none';

  // Generator wants an image. Pick a real (non-'none') role, varied by
  // archetype bias + adjacency + the ≤50% full-image cap.
  const ordered = orderedImageRoles(blockTemplate, archetype).filter((r) => r !== 'none');

  for (const role of ordered) {
    if (role === prevImageRole) continue;                       // adjacency
    if (FULL_IMAGE_ROLES.has(role) && fullImageBudgetLeft <= 0) continue; // ≤50% cap
    return role;
  }
  // Relax adjacency, keep the cap.
  for (const role of ordered) {
    if (FULL_IMAGE_ROLES.has(role) && fullImageBudgetLeft <= 0) continue;
    return role;
  }
  // Relax the cap too (the slide genuinely wants an image and only full-image
  // roles are allowed) — better an image than silently dropping the intent.
  if (ordered.length > 0) return ordered[0];
  // Recipe allows no real image role at all → fall back to none.
  return 'none';
}

/**
 * Build a deterministic DeckPlan from a blueprint + archetype + per-card image
 * intents.
 *
 * TIMING (pre-generation): this pass runs BEFORE generation, so the real
 * per-card `imageIntent` does not exist yet. After recipe retirement (a), its
 * job is per-slide ROLE assignment + a provisional imageRole; the FINAL image
 * roles are assigned post-generation by `selectImageBudget`, which has the real
 * intents and the blockTemplate ranking. It makes NO recipe/composition/budget
 * decision (those are content-led downstream — AC1).
 *
 * @param blueprint   The card blueprint (titles + blockTemplates per card).
 * @param themeId     The active theme id (carried through for provenance).
 * @param archetype   The theme archetype.
 * @param imageIntents Per-card image-intent hints, indexed parallel to
 *                     blueprint.cards. Sparse/undefined entries are fine.
 */
export function planDeck(
  blueprint: CardBlueprint,
  themeId: string,
  archetype: ThemeArchetype,
  imageIntents: (ImageIntent | undefined)[] = [],
): DeckPlan {
  const cards = blueprint?.cards ?? [];
  const total = cards.length;

  if (total === 0) {
    return { themeId, themeArchetype: archetype, slides: [], weightCurve: [] };
  }

  // ≤50% of slides may carry a full-image role.
  let fullImageBudget = Math.floor(total / 2);

  const slides: SlideDesign[] = [];
  let prevImageRole: ImageRole | null = null;

  for (let i = 0; i < total; i++) {
    const card = cards[i];
    const role = inferSlideRole(i, total, card.blockTemplate);

    const imageRole = pickImageRole(
      card.blockTemplate,
      archetype,
      imageIntents[i],
      prevImageRole,
      fullImageBudget,
    );
    if (FULL_IMAGE_ROLES.has(imageRole)) fullImageBudget -= 1;

    slides.push({
      slideId: card.id,
      role,
      imageRole,
      // Recipe-retirement (a): `recipe` removed in S3b. `contentBudget` here is
      // INERT — the writer budget comes from `budgetForTemplate` (S2); this field
      // is unread, kept only to satisfy the SlideDesign shape (residual cleanup).
      contentBudget: { headingMaxWords: 8, bodyMaxWords: 16 },
      textSafeZone: designForBlockTemplate(card.blockTemplate).textSafeZone,
      themeArchetype: archetype,
      source: 'auto',
    });

    prevImageRole = imageRole;
  }

  return {
    themeId,
    themeArchetype: archetype,
    slides,
    weightCurve: buildWeightCurve(total),
  };
}

// Recipe-retirement (a), S2: `assignImageRoles` (a dead export — superseded by
// `selectImageBudget`, zero live callers) removed. It keyed image roles off
// `slide.recipe`; the live image-role path now sources from the blockTemplate.

/** How image-worthy a blockTemplate is, for ranking which slides earn the
 *  limited image budget. B2b: the image gate is keyed to the blockTemplate (the
 *  content-led layout authority), NOT the recipe. 1 = a prose/intro template
 *  that resolves to a title-body/title-list/hero layout and can host a SUPPORTING
 *  image; 0 = a template that resolves to a full-canvas composition (process /
 *  comparison / content-grid / stat) or a quote — the composition IS the visual,
 *  so it stays type-only (P3a lock-the-box). */
function imageValueForBlockTemplate(blockTemplate: string | undefined): number {
  switch (blockTemplate) {
    case 'paragraph-content':
    case 'bullet-list':
    case 'hero-title':
    case 'chapter-divider':
    case 'cover-minimal':
    case 'cover-subtitle':
      return 1;
    default:
      return 0;
  }
}

/**
 * DESIGN-OWNED IMAGE GATE (Lisa 2026-06-03; B2b re-keyed to blockTemplate). The
 * designer — not the generator — decides which slides earn an image, at PLAN
 * TIME, under a hard count budget.
 *
 * Rationale: the per-card generator judges each slide in isolation with no
 * deck-wide view, so it can flag far too many images and there was no ranked
 * cap. This pass ranks content slides by how image-worthy their BLOCKTEMPLATE is
 * (B2b: the blockTemplate is the content-led layout authority; the recipe no
 * longer drives layout) and keeps only the top `contentBudget`; every other
 * slide (and the cover, which the client handles via its cover tier) is forced
 * to `imageRole: 'none'`. Selected slides get a real role varied by archetype
 * under the same adjacency + ≤50% full-image rules. The client then generates
 * images ONLY where this pass left a non-'none' role — making the count both
 * bounded and ranked, not stream-order arbitrary. Deterministic; never throws.
 *
 * @param plan           Plan from `planDeck`.
 * @param contentBudget  Max number of NON-cover slides that may bear an image.
 * @param blockTemplates Per-slide blockTemplates, indexed parallel to plan.slides
 *                       (the image-worthiness signal). Sparse entries score 0.
 */
export function selectImageBudget(
  plan: DeckPlan,
  contentBudget: number,
  blockTemplates: (string | undefined)[] = [],
): DeckPlan {
  const total = plan.slides.length;
  if (total === 0) return plan;

  // Rank content slides (skip cover at index 0) by blockTemplate image-value;
  // keep the top `contentBudget`. Tiebreak by slide order so the choice is stable.
  const selected = new Set(
    plan.slides
      .map((_s, i) => ({ i, value: imageValueForBlockTemplate(blockTemplates[i]) }))
      .filter((c) => c.i > 0 && c.value > 0)
      .sort((a, b) => b.value - a.value || a.i - b.i)
      .slice(0, Math.max(0, contentBudget))
      .map((c) => c.i),
  );

  let fullImageBudget = Math.floor(total / 2);
  let prevImageRole: ImageRole | null = null;

  const slides: SlideDesign[] = plan.slides.map((slide, i) => {
    if (i === 0 || !selected.has(i)) {
      prevImageRole = 'none';
      return { ...slide, imageRole: 'none' as ImageRole };
    }
    const ordered = orderedImageRoles(blockTemplates[i], slide.themeArchetype).filter(
      (r) => r !== 'none',
    );
    let chosen: ImageRole = 'none';
    for (const role of ordered) {
      if (role === prevImageRole) continue;
      if (FULL_IMAGE_ROLES.has(role) && fullImageBudget <= 0) continue;
      chosen = role;
      break;
    }
    if (chosen === 'none') {
      for (const role of ordered) {
        if (FULL_IMAGE_ROLES.has(role) && fullImageBudget <= 0) continue;
        chosen = role;
        break;
      }
    }
    if (chosen === 'none' && ordered.length > 0) chosen = ordered[0];
    if (FULL_IMAGE_ROLES.has(chosen)) fullImageBudget -= 1;
    prevImageRole = chosen;
    return { ...slide, imageRole: chosen };
  });

  return { ...plan, slides };
}

// Recipe-retirement (a), S2: `imageRoleForStreamingSlide` (a dead export, zero
// live callers) removed — it keyed off `design.recipe`.

/** Re-export so the realizer can map a slide's imageRole to a placement
 *  without importing recipes.ts separately. */
export { resolveImageRole };
