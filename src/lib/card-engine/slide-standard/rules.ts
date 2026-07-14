/**
 * rules.ts — the single source of truth for the slide quality RULES.
 *
 * Part of the slide design system (`slide-standard/`). Previously these rules
 * lived in TWO hand-typed copies — the judge's `RUBRIC` (in judge.ts) and the
 * writer's inline prompt blocks (in index.ts) — which drifted. This file owns
 * them once; the judge imports `RUBRIC` for grading, and the writer imports its
 * imperative phrasings (below) for instruction. Change a rule here and both
 * sides move together.
 *
 * Two renderings of the same policy, by design (a writer needs an imperative
 * "do this"; a judge needs a pass/fail criterion):
 *   - RUBRIC[id]   — the JUDGE's grading criterion (terse, evaluative).
 *   - WRITER_RULES — the WRITER's instruction prose (richer, with examples).
 * The mapping comment on each WRITER_RULES entry names the rubric dimension(s)
 * it satisfies so the two never silently diverge.
 *
 * The GOLD STANDARD rubric (Lisa: "I dont want to have to READ the slides" +
 * "the judge must also review the format of the slides"). Each dimension is a
 * hard bar a strong slide clears. These strings are injected verbatim into the
 * judge prompt AND form the enum the judge tags failures with, so prompt and
 * schema never drift.
 *
 * Two groups:
 *   CONTENT — is the writing punchy, single-minded, concrete, grounded?
 *   FORMAT  — will the slide RENDER well: fit without clipping, not be sparse,
 *             and use a layout that suits its content? (Structural review —
 *             reasoned from blocks + layout + budget, NOT from pixels. The
 *             pixel-level pass is the VLM Tier B in critique.ts.)
 */

export const RUBRIC = {
  // ── Content ──
  'one-idea':
    'ONE idea per slide. The slide makes a single clear point, not two or three competing ones. The heading carries that point on its own.',
  glanceable:
    'Glanceable in ~3 seconds. Punchy fragments, not sentences or paragraphs. No body text that runs long or reads like prose. Bullets are short parallel fragments.',
  concrete:
    'Concrete, not corporate filler. Bodies open with a real subject — a number, a name, a literal entity, or an action verb — never an abstract/evaluative noun phrase ("strategic approach", "comprehensive analysis", "proven framework"). IMPORTANT: a friendly fill-in prompt to the user (e.g. "Your Q1 revenue number", "Name a launch customer here") COUNTS AS CONCRETE and PASSES — it is the correct, grounded choice when the topic gave no real figure. NEVER tell the writer to invent a number, metric, name, or statistic the topic did not provide.',
  grounded:
    'Grounded — no invented data. Every number, percentage, dollar amount, multiplier, named statistic, customer, or quote on the slide must be one the TOPIC actually provided (or uncontroversial general knowledge). A fabricated figure the topic never gave ("23% more commits", "$4.2M", "3x faster", "Sarah Chen, CTO") is a FAIL even though it reads concrete — invented data is the most damaging failure. When the real value is absent, the correct, passing choice is a short fill-in prompt to the user ("Your Q1 number here"). This dimension OVERRIDES `concrete`: a slick invented statistic fails here even if it satisfies `concrete`.',
  'earns-its-place':
    'Earns its place. Says something real and specific — not a vacuous truism, not a generic statement true of any deck, and the body does NOT merely restate the heading in other words.',
  voice:
    'Consistent voice. Written from one speaker\'s perspective for one audience, with no mid-slide POV drift (e.g. an internal kickoff slipping into talking to the customer as "you").',
  'well-formed':
    'Clean, correct prose — no garbled or malformed text. READ every line and FAIL any that looks wrong: a duplicated or stuttered word or phrase ("load-load-bearing", "and start and start", "the the"), a word run together or broken apart, a word cut off mid-way, a dangling/unfinished clause, or a sentence that reads as nonsensical or awkwardly non-native. This is about textual CORRECTNESS a careful editor would catch — not style; do NOT fail ordinary, well-formed phrasing.',
  // ── Format (structural) ──
  fits:
    'Fits its layout cleanly. Even within word limits, the slide will render without looking cramped or clipping: a cover/title keeps its title and one-line tagline SHORT (a long subtitle wraps or gets cut mid-word). No single element runs much longer than its siblings (lopsided grid/list cells). The total text comfortably fits the chosen layout.',
  balance:
    'Not sparse. A content slide carries enough substance to justify a full slide — not one stranded short line in a large empty area. (Cover, chapter-divider and quote slides are EXEMPT — minimal is correct for them; do not fault them for being short.)',
  'layout-match':
    'The content suits the chosen layout: a metric layout shows actual numbers, a list/grid has parallel comparable items, a comparison shows two real sides, a timeline/process has ordered steps. Flag when the content was forced into a layout it does not fill (e.g. a 3-cell grid with only one real item).',
} as const;

export type RubricDimension = keyof typeof RUBRIC;

/** The dimension keys, in rubric order — used to build the judge schema enum so
 *  the prompt and the tool can never disagree on the allowed values. */
export const RUBRIC_DIMENSIONS = Object.keys(RUBRIC) as [RubricDimension, ...RubricDimension[]];

// ─────────────────────────────────────────────────────────────────────────────
// WRITER RULES — the imperative side of the same rules, injected into the
// generate prompt (index.ts `generateCard`). Moved here verbatim so the writer's
// instructions live in ONE place alongside the judge's RUBRIC criteria. Each
// block names the rubric dimension(s) it pairs with, so the two never drift.
// (Mechanical prompt parts — JSON contract, icon list, output shape — stay in
// index.ts; only the TASTE rules live here.)
// ─────────────────────────────────────────────────────────────────────────────

/** Pairs with RUBRIC one-idea / glanceable / earns-its-place. */
export const PRESENTATION_VOICE = `PRESENTATION VOICE — THIS IS A SLIDE, NOT A DOCUMENT (the most important rule):
- A slide is GLANCED at in seconds, not read. ONE idea per slide. The heading carries the point.
- Write punchy fragments, not sentences or paragraphs. Cut articles, filler, and throat-clearing.
  - Good: "Payments live in 5 minutes." Bad: "Our platform enables developers to integrate payments in as little as five minutes."
  - Good: "Security built in, not bolted on." Bad: "We have taken a comprehensive approach to ensuring security is a core part of the platform."
- Body text is a SHORT support line (a handful of words), never a paragraph, and never just restates the heading. If a thought needs multiple sentences, it belongs in speaker notes — not on the slide.
- Bullets are short parallel fragments (~3–7 words each). No sub-clauses, no trailing explanation.
- Prefer ONE bold statement, a single number, or a sharp contrast over explanatory prose. When in doubt, cut words.
- Never stack a sub-header on top of body text. Heading + one tight supporting element is the whole slide.`;

/** Pairs with RUBRIC concrete (the grounding half). */
export const GROUNDING = `GROUNDING (CRITICAL — failure to follow this disqualifies the output):
- Use ONLY facts, numbers, names, statistics, and details that appear in the user's TOPIC prompt above, OR are general knowledge that any informed reader would already know about the subject area.
- DO NOT invent: forecasts, projections, growth rates, percentages, dollar amounts, market sizes, customer counts, retention rates, ARR figures, ACV values, case studies (e.g. "Fortune 500 firm achieved X"), customer testimonials, team backgrounds, technical architectures, product feature lists, contract values, timelines, or specific company / product names.
- When a slot needs a value you don't have, do NOT output bracketed tokens like "[stat]", "[customer example]", "[YoY growth]". Brackets render as broken UI on the slide and look unprofessional (Lisa flagged this 2026-05-25 — a title slide showed "[leads generated]", "[pipeline value]", "[revenue attributed]" as visible content).
- Instead, write a one-line PROSE description of what should be filled in there, phrased as a polite prompt to the user. Examples:
  - Instead of \`[leads generated]\` → "Your Q1 marketing-qualified-lead total"
  - Instead of \`[stat]\` → "Add the specific number from your team's report"
  - Instead of \`[customer example]\` → "Name a customer here, plus deal size and outcome"
  - Instead of \`[YoY growth]\` → "Your year-over-year growth rate"
- Prose prompts read as friendly placeholders the user fills in; brackets read as broken UI. Always use prose.
- This rule applies even when fabricating would make the card look better. Do not trade groundedness for polish.`;

/** Pairs with RUBRIC concrete (heading half — the judge has no heading-only
 *  dimension, so this writer rule is the sole enforcement of it). */
export const HEADING_RULE = `HEADING RULE:
- The card heading must NOT begin with an evaluative adjective. Forbidden first words: "Strong", "Comprehensive", "Strategic", "Proven", "Robust", "Dynamic", "Powerful", "Innovative", "Cutting-edge".
- Headings should name the subject of the card (a concrete noun phrase), not describe its quality. "Q1 2025 Forward Guidance" is good (assuming the prompt asked for it). "Strong Q1 Outlook" is bad.`;

/** Pairs with RUBRIC concrete. */
export const BODY_TEXT_RULE = `BODY TEXT RULE (D3 — kill generic corporate filler):
- Open every paragraph and every cell body with a CONCRETE subject — a number, a person, a literal entity from the prompt, or an action verb. Do NOT open with an abstract noun phrase or evaluative adjective.
- Forbidden first phrases (or close variants): "Strategic approach", "Comprehensive analysis", "Data-driven methodology", "Proven framework", "Robust strategy", "Establishing", "Demonstrating", "Implementing strategic", "Leveraging", "Our shared commitment", "Mutual accountability".
- Good: "Q4 revenue reached $4.82M with 12.4% growth..." (opens with a number)
- Good: "New hires complete onboarding in three steps..." (opens with concrete subject)
- Bad: "Strong revenue performance demonstrates sustainable growth..."
- Bad: "Comprehensive analysis reveals distinct opportunities..."
- This applies to paragraph blocks, smart-layout cell bodies, callout content, toggle content. Headings already covered above.`;

/** Pairs with RUBRIC voice. Interpolated with the resolved speaker/audience. */
export function perspectiveRule(speakerRole?: string, audienceRole?: string): string {
  return `PERSPECTIVE RULE (D6 — keep speaker / audience identity straight):${speakerRole ? `
- This deck is being written BY ${speakerRole}.` : ''}${audienceRole ? `
- This deck is being read BY ${audienceRole}.` : ''}
- Write FROM the speaker's perspective FOR the audience. Don't slip into a different POV mid-deck.
- Common drift to avoid: an INTERNAL kickoff (e.g. CS team aligning on a customer engagement plan) accidentally written AS IF the customer is reading it ("Our shared commitment to your success" / "your enterprise transformation"). The customer is NOT reading an internal kickoff. Fix: use third-person about the customer ("the [customer] account", "our engagement with [customer]"), first-person plural for the speaker team ("we will...", "our approach...").
- If unsure who the audience is, default to internal-team / first-person plural ("we / us / our team") rather than external-customer ("you / your"). Internal voice rarely offends; external voice on internal docs always feels off.`;
}

/** Pairs with the writer's image-placement judgment (no rubric dimension — the
 *  judge reasons on text, not the image decision). */
export const IMAGE_JUDGMENT = `IMAGE JUDGMENT (act as a seasoned presentation designer deciding image placement):
- Decide whether THIS slide is genuinely stronger WITH a generated image, or with its text/data alone. Default to restraint — most slides are NOT improved by a decorative photo, and a weak image is worse than none.
- Say wanted: true ONLY when an image carries meaning the words can't: an emotional cover/opener, a concept helped by a visual metaphor, a place/product/scene the audience should picture, or a section divider that sets a mood.
- Say wanted: false when the slide already earns its space with content: metric grids, comparison tables, dense bullet lists, agendas, process/timeline diagrams, pull quotes, closing action items. An image there competes with the content and clutters the slide.
- Weigh AUDIENCE and GOAL: an executive/board deck stays restrained (few images, "photographic" or "minimal"); educational or marketing decks tolerate more imagery ("illustration" / "3d-render"); a formal report leans "minimal"; a creative pitch leans richer. Match the register, don't fight it.
- When wanted: true, write "subject" as a concrete VISUAL concept to DEPICT — a scene, object, or metaphor. NEVER slide text, headings, numbers, or words to render inside the image (e.g. "a sunrise over a modern city skyline, warm light" — NOT "Q1 Growth" or "Revenue Up 12%").
- Pick "style" from: photographic, illustration, 3d-render, watercolor, sketch, minimal, cinematic, abstract.
- Pick "placement" to match the layout: split-left → "left", split-right → "right", a cover or hero slide → "hero" or "background", otherwise → "top".`;
