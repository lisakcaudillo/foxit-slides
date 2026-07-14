/**
 * design-standard.ts — the hard-rule + tasteful-value config the slide engine reads.
 *
 * This is the keystone of the Standard & Judgment spine
 * (docs/requirements/artistic-content-intelligence-system.md). Numbers here are
 * CALIBRATED FROM TASTE via the Slide Standard Program
 * (docs/requirements/slide-standard-program.md), not guessed.
 *
 * Provisional values carry a `// TODO calibrate` until a vote confirms them.
 *
 * NOT yet wired into enforce.ts / FreeformLayer / contrast.ts — migrating those
 * consumers to read from here is a separate, reviewed step. This file is the
 * source of truth for the numbers; nothing imports it yet, so it is inert and
 * safe to evolve.
 *
 * Calibration log:
 *   v1 — 2026-06-09 — quartz pass (session 1). Padding, type-scale direction,
 *        fill rules captured. Type-scale midpoint + header→body gap pending a
 *        confirming pass.
 */

export const DESIGN_STANDARD = {
  /** Reference card the % geometry is relative to (slide-typography.ts CANVAS). */
  canvas: { w: 960, h: 540 },

  /**
   * Safe-area inset inside the card edge (px on 960×540).
   * v1: 64 works for left / top / bottom.
   */
  padding: {
    /**
     * v1 calibrated 64px. Batch-2 vote (35 slides): padding — especially
     * TOP and LEFT — is the #1 recurring defect; content reads tight on ~20/35.
     * Treat 64 as a FLOOR; top/left often want more.
     */
    insetPx: 64,
    topLeftEmphasis: true, // top + left need the most breathing room
    /**
     * Supporting bullets sit DIRECTLY under the title with a tight, controlled
     * gap — NEVER pushed to the opposite edge of the card (flagged the
     * auto-spaced gap as "not acceptable"). And the bullet block aligns to the
     * title's left edge.
     */
    headerToBodyGapPx: 20, // TODO calibrate — provisional
    bulletsAlignToTitle: true,
  },

  /**
   * Titles (Batch-2 vote). The title is short, direct, and carries the takeaway;
   * the descriptive line is a SUBTITLE, not the title.
   */
  title: {
    isShortAndDirect: true,
    descriptiveLineIsSubtitle: true,  // "The quarter in three numbers" → subtitle, not title
    titleCaseForEmphasis: true,
    mustCarryTakeaway: true,
    subtitleNeverEclipsesTitle: true, // a highlighted subheader must not out-shout the title
    noLeadingArticle: true,           // "Shifts", not "The shifts" (Batch-3)
    colorHarmonizesWithSubtitle: true,// title color must not clash with the subtitle (Batch-3)
    noFillerPhrases: true,            // strip ", at a glance" etc. (Batch-9)
    labelsAreSpecific: true,          // "Product health" not "Health" (Batch-9)
  },

  /**
   * Charts / data-viz (Batch 9). The loved chart was the donut; the failures were
   * decorative charts not tied to the data, and a chart bleeding to the edge.
   */
  chart: {
    /** Bars/line/donut ARE the real stats — never a generic decorative chart. */
    visualizesRealData: true,
    /** A chart shows its numbers (value labels), not just shapes. */
    labelsValues: true,
    /** A chart sits inside the slide padding — never bleeds to the edge. */
    respectsPadding: true,
  },

  /** Numbers (Batch 9): abbreviate large values (1,284 → 1.2K). */
  number: { abbreviateLarge: true },

  /**
   * Labels / captions (Batch-2 vote): fit on ONE line — shrink or reword rather
   * than wrap to two. Supporting text must add NEW info, never restate.
   */
  label: {
    singleLine: true,
    supportAddsNewInfo: true,
  },

  /**
   * Type scale = title font size ÷ body font size.
   * CONTEXT-DEPENDENT: an announcement / product launch wants a heavier
   * title; a dense informational slide wants less. 3.1 is too much, 2.6 too
   * little — the default lands between.
   */
  typeScale: {
    default: 2.85, // TODO calibrate — midpoint to confirm next pass
    byContext: {
      announcement: 3.0, // product launch / hero statement
      content: 2.5,      // dense informational slide
    },
    bodyPx: 16, // engine ROLE_STYLE body size
  },

  /**
   * Content fill = number of supporting points on a content slide.
   * v1: 4 is right.
   */
  fill: {
    default: 4,
    /** 3 is acceptable ONLY when paired with a complementary visual or subheader. */
    min: 3,
    minRequiresSupport: true,
    /** 5 is acceptable but an edge case — should be an approved exception. */
    max: 5,
    maxIsException: true,
  },

  /**
   * Stat / big-number slides (Composition Vote 2026-06-09: stat-1 vs stat-1b).
   * The hero number must NOT be so large it drowns its caption, and the caption
   * must be visually differentiated and aligned to the number's left edge.
   */
  stat: {
    /**
     * Hero font ÷ caption font. Too high drowns the context line. Batch-3:
     * CUT win-stat-single for "too large text for 127%" — the hero number
     * has a SIZE CEILING; oversized reads as imbalance, not impact.
     */
    heroToCaptionRatioMax: 2.0, // lowered from 2.6 after the batch-3 cut
    /** The hero number should not exceed ~this share of card height (960×540). */
    heroMaxHeightPct: 34,
    /** The caption needs a DISTINCT color so it pops (the only reason stat-1b beat stat-1). */
    captionDistinctColor: true,
    /** Hero number and caption share the same left edge (stat-1 bug: caption under-padded). */
    captionSharesLeftEdge: true,
  },

  /**
   * Contrast / legibility (non-negotiable). Composition Vote: white numbers on a
   * bright-yellow accent circle (process-1b) failed.
   */
  contrast: {
    minRatio: 4.5, // WCAG AA normal text
    /** No light text on a bright accent fill — check the pairing, not just the theme. */
    noLightTextOnBrightAccent: true,
  },

  /**
   * Imagery (Batch 5 — the clearest rule in the program). "Image is unrelated to
   * the content" was the #1 cut reason (×5). Literal photos must relate; abstract
   * glass renders are a relevance-free premium accessory; absent a relevant image,
   * use a subtle pattern — never a random photo.
   */
  imagery: {
    /** A literal photo MUST be content-relevant / part of the story, else cut. */
    literalPhotoMustRelate: true,
    /** No relevant image → faded abstract pattern/texture, NOT a random photo. */
    fallbackToSubtlePattern: true,
    /** Abstract 3D glass renders = premium accessory, no relevance required. */
    glassRenderIsPremiumAccessory: true,
    /**
     * IT DEPENDS ON ASSET TYPE:
     * - ABSTRACT/decorative (glass render, brand-wave motif, light-art): reuse
     *   ONE signature asset across the deck in varied crops/angles/scales/washes
     *   for cohesion. Foxit's brand-wave or a single glass render, not a new one
     *   per slide.
     * - LITERAL/CORPORATE photos (real humans, teams, products): use DIFFERENT,
     *   content-relevant images per slide. Reusing one human photo cropped reads
     *   cheap, not cohesive.
     */
    signatureAssetReusedAcrossDeck: 'abstract-only',
    literalPhotosAreDistinctPerSlide: true,
    /** A pattern must be woven into the composition, not a shape pasted in a corner (Batch 6). */
    patternMustBeIntegrated: true,
    /** Reused crops of one asset must look visibly distinct, not near-identical (Batch 6). */
    reusedCropsMustBeDistinct: true,
  },

  /**
   * Top-tier LOOK. The recipe that
   * reads "a designer made this on purpose":
   */
  style: {
    /** Soft, blurred, LAYERED organic shapes that bleed off the edge — integrated, not pasted. */
    subtleAbstractShapes: true,
    /** Gradient text on titles/accents = premium, more interesting. */
    gradientText: true,
    /** Frosted translucent panels (CSS glass: translucent fill + blur + soft border) for cards/charts. */
    glassPanels: 'css-frosted',
    /** A CURVED divide between the visual zone and the title zone = designed, not a flat split. */
    curvedDivide: true,
  },

  /**
   * Global composition geometry (design-system spec 2026-06-10 —
   * docs/requirements/foxit-slides-design-system.html §8 "global rules every
   * type inherits"). Consolidated here as the single source for the numbers;
   * inert like the rest of DESIGN_STANDARD until enforce.ts / the renderer
   * migrate to read it. The CONTENT-side rules are already enforced via
   * SLIDE_PRINCIPLES (padding-generous, legibility, etc.) — these are the
   * measurable geometry the text stage can't act on.
   */
  composition: {
    /** Keep 15–20% of the slide empty — breathing room is a rule, not leftover. */
    minEmptyPct: 15,
    maxEmptyPctTarget: 20,
    /** Place the main focal point on a rule-of-thirds (3×3) intersection. */
    ruleOfThirds: true,
    /** Safe zone = outer ~1/20 of width (~0.66in on 16:9 ≈ the 64px padding.insetPx). */
    safeZoneOuterFraction: 1 / 20,
  },

  /**
   * Bullet / text discipline — the "1-6-6" cap (spec §8). The CONTENT side is
   * already enforced via SLIDE_PRINCIPLES (cover-minimal, title-shaped) +
   * density.ts word caps; the explicit numbers live here for one source.
   */
  bullets: { maxCount: 6, maxWordsEach: 6, noFullSentences: true },

  /** Text padding inside shapes/fills (spec §8), inches on the print canvas. */
  shapeTextPadding: { defaultIn: 0.1, largeOrFilledIn: 0.3 },

  /** Minimum type sizes (spec §8), in pt — the floor the renderer must not go
   *  below (engine renders px; these are the design floor). */
  minType: { titlePt: 24, bodyPt: 20 },

  /**
   * Deck rhythm (spec §8) — cross-slide. Recipe-retirement (a): the
   * adjacent-repeat rule is enforced by the critique pass (`critiqueDeckRhythm`,
   * critique.ts), keyed on blockTemplate (not the retired recipe). Documented
   * here for one source.
   */
  deckRhythm: {
    noAdjacentSameLayout: true,
    noAdjacentSameImageRole: true,
    maxConsecutiveTextHeavy: 5,
    weightHeavyAtEnds: true,
  },
} as const;

/**
 * verbatim rationale, kept beside the numbers so the *why* is never lost
 * (Slide Standard Program rule). Source: value-calibration export 2026-06-09.
 */
export const STANDARD_NOTES = {
  padding:
    'This padding from left hand side, bottom and top, works. But note: bullet points must align with the text, and the gap between header and bullet points must be tight (not split to opposite edges).',
  typeScale:
    'It depends on context — an announcement / new product wants more title weight. 3.1× is a bit too much and 2.6× is too little; somewhere in between fits better.',
  fill:
    '4 is right. 3 is OK if you have a complementary visual or a subheader. 5 is OK but should be an edge-case, approved exception.',
} as const;

export type DesignStandard = typeof DESIGN_STANDARD;
