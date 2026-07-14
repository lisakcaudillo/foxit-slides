/**
 * treatments.ts — machine-readable TITLE & COVER treatment (Server-Designer Step 0).
 *
 * Until now the cover/title treatment lived only as PROSE in the design system
 * (slide-design-system.md §1/§17 + §10) — the engine couldn't apply it, so the
 * generated cover fell back to a plain title-on-card. This file makes the
 * treatment a SPEC the server-side Designer (designer/cover.ts) can read.
 *
 * THIS IS A GRAMMAR, NOT A STATIC LAYOUT. (Lisa 2026-06-11: "it shouldn't always
 * be left-aligned — that sets a static design.") It encodes what's INVARIANT —
 * the elements, their order, the constraints, the allowed forms — and leaves the
 * COMPOSITION DECISIONS (anchor left/center/right, which side the visual takes,
 * how wide, type-led vs photo) to the Designer, made per slide from content +
 * theme + image presence + deck variety. The spec says what's allowed and what
 * the rules are; the Designer composes the instance and DESIGN_STANDARD supplies
 * the padding/whitespace/safe-zone it derives positions from.
 *
 * Single-source discipline:
 *   - FONT SIZES / floors live in slide-typography.ts (ROLE_STYLE / ROLE_FLOOR).
 *     A treatment element names a `role`; the Designer builds that role's box and
 *     lock-the-box fits the text. This file never sets a font size.
 *   - TITLE CONTENT rules (short, takeaway, no leading article, title-case,
 *     subtitle-never-eclipses-title…) live in DESIGN_STANDARD.title — referenced
 *     here, NOT duplicated.
 *   - WHITESPACE / padding / rule-of-thirds / safe-zone live in
 *     DESIGN_STANDARD.composition + .padding — referenced, NOT duplicated.
 *   - This file owns only: which ELEMENTS, in what ORDER, the allowed FORMS +
 *     their free parameters, and the cover-specific CONSTRAINTS.
 *
 * Sources (all PROSE in the .md today, encoded here):
 *   - §1  Cover gold: "Title in a clean zone + a curved divide to the visual
 *         (loved), OR soft layered shapes + gradient title (Aurora, loved).
 *         Eyebrow + title + 1-line subtitle + divider + author + date."
 *   - §10 Cover: "Largest type in the deck, generous whitespace, no body/bullets.
 *         Editorial (type-led) + fullbleed (image + scrim) variants."
 *   - Lisa's editorial title-slide spec (2026-06-10): eyebrow → oversized headline
 *         with ONE accent word → hairline rule → 1-line subtitle; a slim accent
 *         column (CoverArt / hero photo); one cinematic entrance then static.
 *         NOTE: the LEFT anchor in that sketch was ONE instance, not a rule.
 *   - Anti-patterns (§1 cut-list): no page number; no stacked motif shapes; no
 *         vague/filler title; no pattern behind the title.
 *
 * INERT until designer/cover.ts (Step 1) imports it. Geometry is % of the 960×540
 * reference card (slide-typography.ts CANVAS) where any appears.
 */
import type { Role } from '../slide-typography';

/** Where an element's color comes from; the Designer resolves to a theme hex. */
export type TreatmentColor =
  | 'accent'    // theme accent (eyebrow, accent word, rule)
  | 'heading'   // theme heading color (title on a light cover)
  | 'muted'     // subdued (subtitle, byline)
  | 'onImage';  // forced-light over an image/scrim (fullbleed)

/**
 * One element of a treatment — a typography role + intent, in COMPOSITION ORDER.
 * Deliberately carries NO position: the Designer places it within the chosen
 * form/anchor using DESIGN_STANDARD padding + the stack rules. `rule` is the only
 * element with no text role (renders as a thin divider shape).
 */
export interface TreatmentElement {
  key: 'eyebrow' | 'title' | 'subtitle' | 'rule' | 'byline';
  /** Typography role (sizes + floor live in slide-typography ROLE_STYLE). Omitted for `rule`. */
  role?: Role;
  /**
   * `false` = required (title). `true` = AVAILABLE — the Designer decides whether
   * to include it per slide (when content supplies it, when the composition wants
   * it). The grammar never forces an optional element on; that's a design call.
   */
  optional?: boolean;
  color: TreatmentColor;
  /**
   * The title MAY emphasize ONE word with the accent/gradient (§1 gradient-title).
   * This only PERMITS it — the Designer decides whether to, and which word, per
   * slide (Lisa: "up to the designer").
   */
  accentWordAllowed?: boolean;
}

/** Title-block anchor — a CHOICE the Designer makes per slide, never a constant. */
export type CoverAnchor = 'left' | 'center' | 'right';

/**
 * A cover FORM — the family of composition, with its FREE parameters expressed as
 * options/ranges (not fixed values). The Designer selects a form (from image
 * presence + theme) then resolves the free parameters.
 */
export interface CoverForm {
  id: 'type-led' | 'split' | 'fullbleed';
  intent: string;
  /** Anchors this form allows; the Designer picks one (varying it, not always left). */
  allowedAnchors: CoverAnchor[];
  /** A visual zone shares the card with the title (split forms). Width is a RANGE. */
  visual?: {
    /** Which side the visual MAY take — Designer chooses. */
    sideOptions: ('left' | 'right')[];
    /** Visual width as a % range of the card; Designer resolves within it. */
    widthPctRange: [number, number];
    /** Curved boundary between title zone and visual (§1 "loved" divide). */
    curvedDivideAllowed: boolean;
    /**
     * When NO real image is present, the Designer decides the visual zone from
     * these options — use CoverArt, or drop the zone (pure type-led). It KNOWS
     * whether an image exists and designs accordingly (Lisa). NOT a fixed default.
     */
    whenNoImage: ('coverart' | 'none')[];
  };
  /** Image fills the card BEHIND the text → scrim + forced-light type. */
  fullBleedBehindText?: boolean;
  scrim?: boolean;
}

/**
 * COVER treatment grammar — elements + order + constraints + the three forms.
 */
export const COVER_TREATMENT = {
  /** Title is the LARGEST type in the deck; generous whitespace; NO body/bullets (§10). */
  largestTypeInDeck: true,
  noBodyOrBullets: true,

  /**
   * A cover is NOT approved as a bare title (Lisa 2026-06-11). A complete cover
   * carries the editorial treatment — an eyebrow + a one-line subtitle alongside
   * the title. The Judge FAILS a title-only cover; the Designer supplies the
   * eyebrow (derived from deck metadata when the writer gives none) and uses the
   * writer's subtitle. (Encoded here so Designer + Judge read ONE source.)
   */
  bareTitleNotApproved: true,
  coverRequires: ['eyebrow', 'title', 'subtitle'] as const,

  /**
   * The element grammar — composition ORDER only (no positions). The Designer
   * lays these in the chosen form/anchor; optional elements appear when content
   * supplies them.
   */
  elements: [
    { key: 'eyebrow',  role: 'eyebrow',  optional: true,  color: 'accent' },
    { key: 'title',    role: 'title',    optional: false, color: 'heading', accentWordAllowed: true }, // dominant (only required element); Designer decides the accent word
    { key: 'rule',                       optional: true,  color: 'accent' }, // hairline divider
    { key: 'subtitle', role: 'subtitle', optional: true,  color: 'muted' },  // 1 line
    { key: 'byline',   role: 'eyebrow',  optional: true,  color: 'muted' },  // author · date — Designer includes it when content has it
  ] satisfies TreatmentElement[],

  /**
   * Anchor is a DECISION, not a default. The Designer varies it per slide (theme
   * archetype, the visual's side, deck variety) — NOT always left. This lists what
   * a cover MAY use; the selection logic lives in the Designer.
   */
  allowedAnchors: ['left', 'center', 'right'] as CoverAnchor[],
  anchorIsChosenNotFixed: true,

  /**
   * Element order is a Designer CHOICE with a recommendation + guidelines here
   * (Lisa: "designer choice but we should have recommendations/guidelines in the
   * design system"). The Designer follows the recommended order unless a
   * guideline says otherwise; deviation rules are CALIBRATED from real cases
   * (Loop 2), not invented up front.
   */
  recommendedOrder: ['eyebrow', 'title', 'rule', 'subtitle', 'byline'] as const,
  orderGuidelines: [
    'eyebrow sits above the title by default',
    'the rule always hugs directly under the title (never floats to the card edge)',
    'subtitle follows the rule',
    'byline is always last',
  ],

  /**
   * Byline (author · date) — optional, OFF by default. Proposed trigger (Lisa
   * asked "what turns it on?"): ON when the deck actually HAS author/date content,
   * OR when the artifact is a formal document type (report / proposal / whitepaper)
   * whose title-page convention includes it. Provisional — easy to retune.
   */
  bylineTrigger: {
    default: 'off' as const,
    onWhen: ['author-or-date-content-present', 'formal-doc-type'] as const,
  },

  /** The three forms; the Designer picks from image presence + theme, then resolves params. */
  forms: {
    /** Type-led — no photo required; title owns the card (anchored per the Designer's choice),
     *  optional slim accent column carrying CoverArt. Width/side of that column are free. */
    'type-led': {
      id: 'type-led',
      intent: 'Type as the hero. Title owns the card; an optional slim accent column carries CoverArt.',
      allowedAnchors: ['left', 'center', 'right'],
      visual: { sideOptions: ['left', 'right'], widthPctRange: [0, 34], curvedDivideAllowed: false, whenNoImage: ['coverart', 'none'] },
    },
    /** Split — title shares the card with a real visual; side, width, and curve are the Designer's. */
    split: {
      id: 'split',
      intent: 'Title shares the card with a visual zone — side, width, and a curved divide are the Designer\'s call.',
      allowedAnchors: ['left', 'right'],
      visual: { sideOptions: ['left', 'right'], widthPctRange: [34, 50], curvedDivideAllowed: true, whenNoImage: ['coverart', 'none'] },
    },
    /** Fullbleed — photo fills the card behind a scrim; title over it in forced-light type. */
    fullbleed: {
      id: 'fullbleed',
      intent: 'Photo fills the card behind a scrim; title over it in forced-light type.',
      allowedAnchors: ['left', 'center'],
      fullBleedBehindText: true,
      scrim: true,
    },
  } satisfies Record<string, CoverForm>,

  /**
   * Composition CONSTRAINTS the Designer honors when it resolves positions. These
   * reference DESIGN_STANDARD (padding / composition) rather than restating numbers.
   */
  composition: {
    titleIsDominant: true,            // largest element on the slide
    stackInElementOrder: true,        // eyebrow → title → rule → subtitle → byline, top→bottom
    ruleSitsUnderTitle: true,         // the divider hugs the title, not the card edge
    subtitleIsOneLine: true,          // lock-fit to 1 line; never wraps to a paragraph
    whitespaceFrom: 'DESIGN_STANDARD.composition.minEmptyPct', // 15–20% empty
    paddingFrom: 'DESIGN_STANDARD.padding.insetPx',            // safe-area inset
    focalOnThirds: 'DESIGN_STANDARD.composition.ruleOfThirds', // place the title block on a third
  },

  /** Title CONTENT rules are enforced via DESIGN_STANDARD.title — not duplicated here. */
  contentRulesRef: 'DESIGN_STANDARD.title',

  /** §1 cut-list — the Designer must NOT emit any of these on a cover. */
  antiPatterns: [
    'no-page-number-on-cover',
    'no-stacked-motif-shapes',
    'no-vague-or-filler-title',
    'no-pattern-behind-the-title',
    'no-body-or-bullets',
  ],
} as const;

/**
 * INTERIOR section-title treatment (Step 2 — declared here so the spec is one
 * place). A lighter echo of the cover: optional eyebrow + title + a short accent
 * rule. Same grammar discipline — order only, no fixed anchor; the Designer
 * places it. Compositions currently emit a bare role:'title'; Step 2 routes them
 * through this so interior titles get the eyebrow/rule treatment (issue #4).
 */
export const SECTION_TITLE_TREATMENT = {
  intent: 'Interior heading: optional eyebrow + title + a short accent rule (lighter than the cover).',
  elements: [
    { key: 'eyebrow', role: 'eyebrow', optional: true,  color: 'accent' },
    { key: 'title',   role: 'title',   optional: false, color: 'heading' },
    { key: 'rule',                     optional: true,  color: 'accent' },
  ] satisfies TreatmentElement[],
  composition: {
    stackInElementOrder: true,
    ruleSitsUnderTitle: true,
    paddingFrom: 'DESIGN_STANDARD.padding.insetPx',
  },
  contentRulesRef: 'DESIGN_STANDARD.title',
} as const;

export type CoverTreatment = typeof COVER_TREATMENT;
export type SectionTitleTreatment = typeof SECTION_TITLE_TREATMENT;
