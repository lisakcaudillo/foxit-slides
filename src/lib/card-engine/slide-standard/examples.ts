/**
 * gold-examples.ts — the few-shot taste corpus + design principles.
 *
 * Part of the Standard & Judgment spine
 *. Where
 * `design-standard.ts` holds the NUMBERS (hard rules), this holds the
 * JUDGMENT: labeled gold / anti / revise slides + the generalizable principles,
 * authored from votes in the Slide Standard Program
 *
 * Consumers (later, reviewed step): injected as few-shot into the writer prompt
 * (`index.ts`) and the judges (`judge.ts`, `vlm-judge.ts`). Inert today — nothing
 * imports it yet.
 *
 * Calibration log:
 *   v1 — 2026-06-09 — Composition Vote, session 1 (quartz/counsel/cobalt/obsidian).
 *        12 slides labeled. Same-layout/different-theme pairs isolate variables.
 */

export type SlideType =
  | 'cover' | 'stat' | 'comparison' | 'process' | 'content'
  | 'agenda' | 'timeline' | 'infographic' | 'diagram' | 'quote' | 'divider' | 'closing';

/** gold = loved (defines beautiful) · keep = simple-but-works tier · revise = keep-with-major-fixes · anti = cut. */
export type Verdict = 'gold' | 'keep' | 'revise' | 'anti';

export interface SlideExample {
  id: string;
  type: SlideType;
  theme: string;
  verdict: Verdict;
  /** What the slide is, concretely. */
  description: string;
  /** reasoning — the rule the model should learn from this example. */
  rationale: string;
}

export const SLIDE_EXAMPLES: SlideExample[] = [
  // ── GOLD ────────────────────────────────────────────────────────────────
  {
    id: 'compare-1', type: 'comparison', theme: 'quartz', verdict: 'gold',
    description: 'Before vs After: a muted/bland "Before" card and a colorful accent "After" card, with a center VS badge.',
    rationale: 'Easy to read; the stage-to-stage improvement is clear. The accent "After" card vs the bland "Before" directs the eye to the better option — the color does the persuading. (To improve: add a light icon per list item, at least on the After card.)',
  },
  {
    id: 'stat-1b', type: 'stat', theme: 'obsidian', verdict: 'gold',
    description: 'One huge hero metric (127%) with a supporting caption ("Up from 112% last quarter") in a DISTINCT accent color.',
    rationale: 'Works because the caption uses a different font color and pops, so the context is not drowned by the hero number. (Still imperfect: the hero number is a touch too large, and the caption has less left padding than the number so its left edge looks off — fix the alignment.)',
  },
  {
    id: 'process-1b', type: 'process', theme: 'obsidian', verdict: 'gold',
    description: 'Horizontal numbered steps (1–4) on a connecting line, each with a one-word label.',
    rationale: 'Good structure. Needs a short detail keyword UNDER each step (e.g. Polish → "customize the content"), and ideally who-does-what (user prompts → Foxit Slides creates a blueprint → generates a reusable, brand-customizable template). Watch contrast: white numbers on a bright-yellow circle are hard to read.',
  },
  {
    id: 'cover-2', type: 'cover', theme: 'obsidian', verdict: 'gold',
    description: 'Editorial cover, dark (obsidian) theme, large title (same title text as the CUT cover-1).',
    rationale: 'CONFIRMED by "the color combo works." The SAME large title that fails on the light counsel theme (cover-1) succeeds here purely on the dark obsidian palette pairing. Rule: a strong theme/palette pairing can carry a borderline-large title that a weak pairing cannot.',
  },

  // ── ANTI ──────────────────────────────────────────────────────────────────
  {
    id: 'stat-crowd', type: 'stat', theme: 'quartz', verdict: 'anti',
    description: 'A grid of six metrics (NRR, ARR, QoQ, Logos, NPS, Sales cycle) at roughly equal visual weight, titled "The numbers".',
    rationale: 'Unclear takeaway. (1) Vague title "The numbers" says nothing AND undersells the story — needs a real punchline; (2) all six metrics get equal weight but are NOT equally important — revenue (NRR/ARR/QoQ) deserves the focus; (3) logos/NPS/sales-cycle have no story (up? down? good? bad?) so they add noise — cut them; (4) split into two columns (revenue vs rest) and highlight the ONE number to remember with a distinct color. Equal weight for unequal importance is the core failure.',
  },
  {
    id: 'content-wall', type: 'content', theme: 'counsel', verdict: 'anti',
    description: 'A single dense paragraph of corporate prose under the heading "Overview".',
    rationale: 'Reads like a book page — too much text, not scannable. The takeaway does not stick; you skim and nothing lands. Text-heavy AND boring, so it is forgettable. A slide must give its takeaway fast.',
  },
  {
    id: 'cover-weak', type: 'cover', theme: 'quartz', verdict: 'anti',
    description: 'A centered cover whose title is a long full sentence.',
    rationale: 'Too wordy for a cover — high cognitive load to read it. Covers must be minimal.',
  },
  {
    id: 'cover-1', type: 'cover', theme: 'counsel', verdict: 'anti',
    description: 'Editorial cover, light (counsel) theme, very large multi-clause title with a comma.',
    rationale: 'Title is too big AND has a comma / multiple clauses — that does not fit a title-slide layout. A cover title should be one clean, short phrase.',
  },
  {
    id: 'stat-1', type: 'stat', theme: 'cobalt', verdict: 'anti',
    description: 'One huge hero metric (127%) with a same-color supporting caption below.',
    rationale: 'The 127% is so large it takes all the attention, so "Up from 112% last quarter" gets none. The caption is the same color (no differentiation) and its left edge is misaligned with the number (less left padding) so it looks off. Compare stat-1b, which fixes the color.',
  },
  {
    id: 'compare-1b', type: 'comparison', theme: 'cobalt', verdict: 'anti',
    description: 'Same Before/After comparison layout as compare-1, on the cobalt (blue) theme.',
    rationale: 'Same good structure, but the cobalt background makes the "Before" card blend into it, and the two cards fight for attention — the "After" card no longer clearly wins. The theme broke the directional contrast that made compare-1 work.',
  },
  {
    id: 'process-1', type: 'process', theme: 'counsel', verdict: 'anti',
    description: 'Same horizontal numbered-step layout as process-1b, on the counsel (red/brown) theme.',
    rationale: 'Missing per-step detail keywords (same gap as process-1b). And the red/brown palette is boring — it reads dead. Palette energy matters.',
  },
  {
    id: 'content-1', type: 'content', theme: 'cobalt', verdict: 'anti',
    description: 'A heading ("What changed this quarter") over a few bullets, spread loosely across the card.',
    rationale: 'The heading reads like a sentence, not a title (consider title-case emphasis on key words). Content looks spread out — needs more padding on all sides. And there is a huge empty gap between the title and the bullets (the recurring header→body gap bug). Could use a subtitle if needed.',
  },
];

/**
 * Batch 2 — full layout coverage (Composition Vote, 2026-06-09, 35 slides).
 * Verdicts: 4 love (gold) + ~6 enthusiastic, 11 keep (simple-but-works), 20 cut (anti).
 * Rationales condensed from transcripts; the rule is preserved, not the prose.
 */
export const SLIDE_EXAMPLES_BATCH2: SlideExample[] = [
  // ── GOLD (loved — these define "beautiful") ──
  { id: 'compare-matrix', type: 'comparison', theme: 'counsel', verdict: 'gold',
    description: 'Feature comparison styled as a near-table: rows of features, Us ✓ vs Them ✗, with "partial" as text where honest.',
    rationale: '"My boss would love it." Simplicity + directness win; a comparison styled like a table (but not a literal one) reads refreshing and high-level-clear. A little qualifying text ("partial") is fine.' },
  { id: 'process-detail', type: 'process', theme: 'cobalt', verdict: 'gold',
    description: 'Horizontal numbered steps WITH a one-line detail under each (Prompt→"you describe it", Generate→"draft appears", Polish→"you refine it").',
    rationale: 'One of the best. Instantly understandable flow; the detail line under each step is what makes it executive-clear. The per-step detail is REQUIRED, not optional.' },
  { id: 'content-bullets', type: 'content', theme: 'quartz', verdict: 'gold',
    description: 'Title + 4 clean bullets that tell the story.',
    rationale: 'Tells the story; simple and complete. A lowercase title works HERE because it carries the story. Elevate simple slides with a SUBTLE related pattern/image (not more text). Avoid unexplained jargon ("real brand voice"?).' },
  { id: 'content-sub', type: 'content', theme: 'counsel', verdict: 'gold',
    description: 'Title + accent SUBHEADER + bullets.',
    rationale: 'Great, simple. The subheader pattern is a winner. Fixes: the highlighted subheader eclipses the title → make the title 1–2 words; add breathing space between subheader and bullets; consider shortening bullets. (Red/brown palette disliked but the slide works.)' },
  { id: 'stat-single', type: 'stat', theme: 'volt', verdict: 'gold',
    description: 'ONE big number + a bold delta caption ("↑15 pts from 112%") in a distinct accent color + an all-caps title.',
    rationale: 'Loved. "Gives the story right away." All-caps title suits it; the colored delta tells the story. THE stat pattern. (Could use slightly more padding — gets away with it here.)' },
  { id: 'info-icongrid', type: 'infographic', theme: 'quartz', verdict: 'gold',
    description: 'Clean 2×2 icon grid; each icon matches its label; blue + dark-gray + light-gray body.',
    rationale: 'Called it "love." Clean; the icons MATCH their labels (meaningful, not decorative). The winning pattern for an icon grid when icons carry meaning.' },

  // ── KEEP (simple-but-works tier; valid for many audiences with the listed fixes) ──
  { id: 'cover-min', type: 'cover', theme: 'quartz', verdict: 'keep',
    description: 'Minimal cover: eyebrow + short title + author line.',
    rationale: 'Basic but works. Niggles: "Compounding gains" may be the wrong title; lowercase "g". Fine as a simple cover.' },
  { id: 'cover-split', type: 'cover', theme: 'cobalt', verdict: 'keep',
    description: 'Split cover: text left, accent panel with icon right.',
    rationale: 'Basic. Missing an author name + a divider. "Foxit Slides" must fit ONE line — shrink the font OR widen the accent panel; keep padding. (No two-line headers.)' },
  { id: 'cover-sub', type: 'cover', theme: 'aurora', verdict: 'keep',
    description: 'Cover with title + subtitle.',
    rationale: 'Liked — good title size, subtitle, purple accent. The winning cover skeleton, but INCOMPLETE: add a divider + author + date.' },
  { id: 'compare-cols', type: 'comparison', theme: 'quartz', verdict: 'keep',
    description: 'Before (muted) vs After (accent card + accent text) columns.',
    rationale: 'A bit boring but a valid simple option. The accent on "After" (card bg AND blue text) catches the eye — good. Fixes: rename the title (not "old way vs our way"), add a subheader stating the point, padding, lowercase.' },
  { id: 'compare-icons', type: 'comparison', theme: 'verdant', verdict: 'keep',
    description: 'Before/After columns with icons replacing bullets (After uses check/bolt/schedule, Before uses ✗).',
    rationale: 'Likes icons replacing bullets. Confusing: the ✗ marks on "Before" don\'t communicate anything — drop or rethink. Fixes: padding, title. (Green theme just OK.)' },
  { id: 'process-vertical', type: 'process', theme: 'quartz', verdict: 'keep',
    description: 'Vertical numbered steps with blue step icons.',
    rationale: 'Basic but broadly applicable; the blue step icons add a nice accessory. Fix: rename "The workflow" (uppercase / "how it works"). Keep as a general-purpose simple option.' },
  { id: 'timeline', type: 'timeline', theme: 'aurora', verdict: 'keep',
    description: 'Horizontal Q1–Q4 milestone timeline.',
    rationale: 'Likes the timeline + background. MISSING the takeaway: where are we NOW? target date? more detail per milestone. Rename "The road to launch" → Milestones/Roadmap/Launch plan. Title color vs magenta dots clash. Padding. Keep for now but "won\'t meet my standards later."' },
  { id: 'quote', type: 'quote', theme: 'obsidian', verdict: 'keep',
    description: 'Centered pull-quote with a large quote mark + attribution.',
    rationale: 'Loves the quote mark; centered works. Works despite a disliked palette. Fix: left padding. A simple win.' },
  { id: 'info-funnel', type: 'infographic', theme: 'cobalt', verdict: 'keep',
    description: 'Funnel: Visitors→Signups→Active→Paid with shrinking accent bars.',
    rationale: 'Clean; the funnel reads well. Wants more detail (funnel for what? from where?) and optionally a KPI/goal. Good look & feel.' },

  // ── ANTI (cut) ──
  { id: 'cover-typo', type: 'cover', theme: 'obsidian', verdict: 'anti',
    description: 'Typographic cover: one huge word-pair "ONE WORKSPACE".',
    rationale: '"One workspace" says nothing — reads like a mid-sentence fragment, not a deck title. Disliked palette. A cover title must be meaningful (the workspace\'s actual name).' },
  { id: 'cover-long', type: 'cover', theme: 'counsel', verdict: 'anti',
    description: 'Cover with a long multi-clause sentence title.',
    rationale: 'Makes you READ a cover. Instant delete.' },
  { id: 'agenda-plain', type: 'agenda', theme: 'quartz', verdict: 'anti',
    description: 'Plain numbered agenda (01–04).',
    rationale: 'Padding (top + left — sits too high). Misalignment: items 2/3/4 indent differently than item 1. Sent back purely on padding + alignment.' },
  { id: 'agenda-icons', type: 'agenda', theme: 'cobalt', verdict: 'anti',
    description: 'Agenda with an icon per line.',
    rationale: 'Likes the colors, but icons on an agenda read as CLUTTER and feel unrelated (a trending-up graph next to "what changed"?). Agendas need no icons. + padding.' },
  { id: 'stat-trio', type: 'stat', theme: 'quartz', verdict: 'anti',
    description: 'Three spelled-out metrics (NRR/ARR/QoQ) under "The quarter in three numbers".',
    rationale: 'Better than the grid but: "The quarter in three numbers" is a SUBTITLE, not a title (title should be simple, e.g. "Performance"). The first metric (NRR 127%) lacks the story/delta the design implies. "Annual recurring revenue" wraps to 2 lines — must be one (shrink/reword). Padding top + left.' },
  { id: 'stat-grid6', type: 'stat', theme: 'cobalt', verdict: 'anti',
    description: 'Six mixed metrics at equal weight (NRR/ARR/QoQ/Logos/NPS/Cycle), titled "The numbers".',
    rationale: 'Reconfirms stat-crowd. Vague title; mixing revenue with logos/NPS/cycle tells no story — keep only the revenue numbers. Specify WHICH quarter for QoQ. Padding. A metric with no trend/context says nothing.' },
  { id: 'stat-context', type: 'stat', theme: 'obsidian', verdict: 'anti',
    description: 'A "3×" with a phrase, plus a supporting sentence.',
    rationale: 'Disliked brown palette ("not exciting"). The "3×" is not aligned with its sentence — center the sentence under the number. The supporting sentence ("median dropped 9→<3") RESTATES "3× faster" → adds no new value; it should explain WHY it got faster.' },
  { id: 'process-steps', type: 'process', theme: 'obsidian', verdict: 'anti',
    description: 'Horizontal numbered steps, label only, dark-number-on-gold contrast.',
    rationale: 'The darker number-on-gold contrast is an improvement, but cut on disliked palette AND the missing per-step detail line (compare process-detail).' },
  { id: 'process-badcontrast', type: 'process', theme: 'volt', verdict: 'anti',
    description: 'Horizontal steps with white numbers on bright-yellow circles, on a purple ground.',
    rationale: 'Yellow + purple clash; white-on-yellow numbers fail contrast; missing the detail line. Worse than the obsidian version.' },
  { id: 'content-icons', type: 'content', theme: 'cobalt', verdict: 'anti',
    description: 'Title + 4 items each with a leading icon.',
    rationale: 'Padding (top + left); the last icon is CLIPPED at the edge; too blue; the icons "look like blobs" → wrong icon/color choice.' },
  { id: 'content-twocol', type: 'content', theme: 'verdant', verdict: 'anti',
    description: 'Two columns: Wins | Watch-outs.',
    rationale: 'Too high-level — needs a real story to tell verbally. The title just repeats the column labels (rename → Pros/Cons/Trade-offs) and add a light subheader. Cut for unclear purpose.' },
  { id: 'content-wall', type: 'content', theme: 'counsel', verdict: 'anti',
    description: 'A dense paragraph under "Overview".',
    rationale: '"This is not a book." Too much text. (Reconfirms.)' },
  { id: 'info-callouts', type: 'infographic', theme: 'volt', verdict: 'anti',
    description: 'Row of three big stats with icons, titled "By the numbers".',
    rationale: 'Too much pink; pink icons clash; "By the numbers" is a bad title (→ say something about growth); bad font color; padding.' },
  { id: 'info-pyramid', type: 'infographic', theme: 'obsidian', verdict: 'anti',
    description: 'Three-layer pyramid: Taste / Judgment / Foundation.',
    rationale: 'Disliked palette; the layers are too general → no takeaway, "don\'t know what you\'re telling me."' },
  { id: 'diagram-flow', type: 'diagram', theme: 'quartz', verdict: 'anti',
    description: 'Boxes connected by arrows: Plan→Generate→Gate→Render.',
    rationale: 'Rename the title; padding top + left; needs VISUALS/icons so the viewer doesn\'t have to imagine the flow; "Gate" is unexplained jargon; should sell the OUTCOME (quality check → user satisfaction), not just label stages.' },
  { id: 'diagram-hub', type: 'diagram', theme: 'cobalt', verdict: 'anti',
    description: 'Central "Source doc" node with four output spokes (PDF/Slides/eSign/Web).',
    rationale: '"Looks homemade." Unclear goal; the hub label is unclear; padding/title. Poor overall.' },
  { id: 'diagram-hierarchy', type: 'diagram', theme: 'counsel', verdict: 'anti',
    description: 'Orchestrator over three child boxes (Plan/Foxit Slides/Gate).',
    rationale: '"How it\'s organized" isn\'t the takeaway. Needs ARROWS to show flow/handover + light body text under each node; without arrows the relationship is unclear; a pyramid might fit better. Cut.' },
  { id: 'diagram-quadrant', type: 'diagram', theme: 'verdant', verdict: 'anti',
    description: '2×2 positioning quadrant (Us vs Legacy/DIY/Other).',
    rationale: '"Where we play" implies a competitor/market graph, but there\'s no data/axes/numbers → too empty to justify a graph. Padding; unclear what\'s measured. Don\'t draw a graph without data to fill it.' },
  { id: 'divider', type: 'divider', theme: 'volt', verdict: 'anti',
    description: 'Section divider: "02 — What we shipped" + rule.',
    rationale: 'Disliked palette; everything bold; "no design beyond the background color"; padding. Cut.' },
  { id: 'closing', type: 'closing', theme: 'aurora', verdict: 'anti',
    description: '"Let\'s build it" + contact line.',
    rationale: '"Let\'s build it" is unclear — selling? motivational? Fails as motivation. A closing should be contact/CTA ("reach out / more info"). Liked the dot separator between email · web. Cut.' },
];

/**
 * Batch 3 — iteration round (Composition Vote, 2026-06-09, 16 slides). Themes
 * restricted to liked ones. KEY: first surviving diagram (dia-flow-v2), agenda
 * solved (agenda-v2), compare-matrix loved a 3rd time. stat-single REVERSED to
 * cut (hero number too large → size ceiling).
 */
export const SLIDE_EXAMPLES_BATCH3: SlideExample[] = [
  // ── GOLD ──
  { id: 'win-compare-matrix', type: 'comparison', theme: 'quartz', verdict: 'gold',
    description: 'Feature comparison as a near-table (Us ✓ / Them ✗ / "partial"), padding fixed.',
    rationale: 'Loved a THIRD time across rounds — the firm gold anchor. Simple, direct, high-level-clear.' },

  // ── KEEP (work, with the listed fixes) ──
  { id: 'win-process-detail', type: 'process', theme: 'cobalt', verdict: 'keep',
    description: 'Numbered steps with a one-line detail under each.', rationale: '"Does the job." Solid, reliable.' },
  { id: 'win-content-bullets', type: 'content', theme: 'quartz', verdict: 'keep',
    description: 'Title + clean bullets + subtle accent pattern.', rationale: 'Kept (no objection).' },
  { id: 'win-info-grid', type: 'infographic', theme: 'mist', verdict: 'keep',
    description: '2×2 icon grid of pillars.', rationale: 'Plain but works — BUT needs a title/takeaway stating WHAT the four are (features? strengths? selling points?). Even a grid must declare its category.' },
  { id: 'cover-done', type: 'cover', theme: 'aurora', verdict: 'keep',
    description: 'Complete cover: eyebrow + title + subtitle + divider + author + date.', rationale: 'The completed-cover skeleton works. Fixes: title TEXT needs rework; the purple eyebrow wants a darker font beneath it (color harmony).' },
  { id: 'cover-done-2', type: 'cover', theme: 'volt', verdict: 'keep',
    description: 'Same complete cover skeleton, dark theme.', rationale: 'Works; title text needs rework.' },
  { id: 'cover-split-done', type: 'cover', theme: 'cobalt', verdict: 'keep',
    description: 'Split cover with single-line header + divider + author.', rationale: '"Foxit Slides in one line looks much better" — the fix landed. Formatting works; use a more exciting image than the rocket icon.' },
  { id: 'dia-flow-v2', type: 'diagram', theme: 'quartz', verdict: 'keep',
    description: 'Four-step flow: icon + label + sublabel per node, left-to-right arrows, takeaway title.',
    rationale: '★ FIRST diagram to survive. "Clean, reads instantly; arrows make the sequence obvious." THE diagram pattern to build on. Fixes: title floats (tie it to the row — center or left-align to match; tighten title→row gap); nodes not on one baseline (Generate/Check sublabels misalign — equalize); anchor the key step (e.g. Check) with size/color if it is the point; thicken the arrows.' },
  { id: 'agenda-v2', type: 'agenda', theme: 'solstice', verdict: 'keep',
    description: 'Numbered agenda, no icons, aligned.', rationale: '★ Agenda SOLVED — "looks good," just more left padding. No-icons + aligned was right.' },

  // ── ANTI (cut) ──
  { id: 'win-stat-single', type: 'stat', theme: 'volt', verdict: 'anti',
    description: 'Single hero number (127%) + colored delta caption.',
    rationale: 'REVERSES the earlier gold: the hero number is TOO LARGE. A hero stat has a SIZE CEILING — oversized reads as imbalance, not impact. Keep the colored-delta story; shrink the number.' },
  { id: 'win-content-sub', type: 'content', theme: 'aurora', verdict: 'anti',
    description: 'Title "The shifts" + accent subheader + bullets.',
    rationale: 'Title/subtitle COLOR clash — use the bullet-text color (or another pink) for the title. "The shifts" is vague and doesn\'t match the subtitle (short ≠ meaningless — overcorrected). REMOVE leading "The" from titles. Left padding.' },
  { id: 'dia-hub-v2', type: 'diagram', theme: 'mist', verdict: 'anti',
    description: 'Central "Your document" node, four output spokes with connector lines.',
    rationale: 'No design beyond the icons; the hub shape is too plain; "why is Web by itself? half-done." The hub layout still isn\'t working.' },
  { id: 'dia-quadrant-v2', type: 'diagram', theme: 'quartz', verdict: 'anti',
    description: '2×2 positioning quadrant with labeled axes + plotted points.',
    rationale: '"How is this measured?" A graph implies a numerical value — name the metric on each axis (edit features? custom branding?). Needs competitors as reference. Add light gridlines so near-equal points are distinguishable.' },
  { id: 'dia-hierarchy-v2', type: 'diagram', theme: 'cobalt', verdict: 'anti',
    description: 'Orchestrator over Plan/Foxit Slides/Gate with arrows + sublabels.',
    rationale: '"Is this a flowchart?" Likes the per-node body text, but as an ownership diagram it is INCOMPLETE — missing the human input (the prompt) and the writer. A flow/ownership diagram must be complete.' },
  { id: 'timeline-v2', type: 'timeline', theme: 'aurora', verdict: 'anti',
    description: 'Q1–Q4 dot timeline with a "we are here" marker + target date.',
    rationale: 'Likes the highlighted dot, but purple+magenta clash; lowercase title; padding; "we are here" says nothing without milestone detail; "what is Beta?" unclear. BETTER: quarter BULLETS with checkmarks + status ("Q3: Testing & GTM — in progress, due 6/29") + "Target launch Nov". Reframe a thin-data roadmap as status bullets.' },
  { id: 'stat-story', type: 'stat', theme: 'cobalt', verdict: 'anti',
    description: 'Three metrics, each with a delta line, under title "Performance".',
    rationale: '"11 days" wraps to TWO LINES — not acceptable (recurring). The metric is unclear — "42% faster sales cycle" reads cleaner than a raw "11 days". Pick the clearest unit (percent vs absolute).' },
];

/**
 * Batch 5 — Design level-up: real images + columns (2026-06-09, 12 slides).
 * DOMINANT finding: "image is unrelated to the content" (×5 cuts). All 3 GLASS
 * treatments LOVED. Literal photos must relate; abstract glass is relevance-free
 * premium accessory; no relevant image → subtle pattern, not a random photo.
 */
export const SLIDE_EXAMPLES_BATCH5: SlideExample[] = [
  // ── GOLD (loved) — the glass direction ──
  { id: 't-glass-crystal', type: 'cover', theme: 'halo', verdict: 'gold',
    description: 'Full-bleed real 3D crystal-glass render; title sits in the clean negative space; light bg.',
    rationale: 'Loved. Glass works as a PREMIUM ABSTRACT accessory — it carries mood, not a literal claim, so it does not need to "relate" to the content the way a photo does. The negative-space title placement is clean.' },
  { id: 't-glass-amber', type: 'cover', theme: 'paper', verdict: 'gold',
    description: 'Glass split: real amber-ribbon render on one side, editorial title on the other.',
    rationale: 'Loved. The split + real glass render reads premium. Same rule: abstract glass needs no content-relevance.' },
  { id: 'a-glass-panel', type: 'content', theme: 'lilac', verdict: 'gold',
    description: 'Content slide with a real glass-render side panel, faded into the text via a gradient.',
    rationale: 'Loved. THE winning content accessory — an abstract glass render as a faded side panel elevates a plain content slide without competing with it.' },

  // ── KEEP ──
  { id: 'c-compare-visual', type: 'comparison', theme: 'quartz', verdict: 'keep',
    description: 'Comparison as two designed cards: muted "Before" vs accent-gradient "After" with icons.',
    rationale: '"The cards do their work — clean." Fix: title (still disliked) + missing padding.' },
  { id: 'c-three-cards', type: 'infographic', theme: 'quartz', verdict: 'keep',
    description: 'Three designed feature cards (icon + heading + body, accent top border, soft shadow).',
    rationale: 'Kept (no objection). Designed cards are a valid column layout.' },
  { id: 't-photo-volt', type: 'cover', theme: 'volt', verdict: 'keep',
    description: 'Photo full-bleed (ocean) + dark scrim + gradient-clipped serif title + gradient divider.',
    rationale: 'Loves the TEXT FORMAT and the gradient-colored divider — the photo full-bleed format works. BUT the image is unrelated to the content, and the subtitle ("where the platform goes after the inflection point") is unclear / maybe its own slide. Format is gold; swap to a relevant image or glass.' },
  { id: 'c-stat-image', type: 'stat', theme: 'midnight', verdict: 'keep',
    description: 'Hero stat (left) + a glass-render image column (right); palette matched to the image.',
    rationale: '"Looks good even with the image"; loves how the colors match the image. BUT the image must be PART OF THE STORY — if it is not, use the figure as a SUBTLE PATTERN instead of a literal panel.' },

  // ── ANTI (cut) ──
  { id: 'c-twocol-image', type: 'content', theme: 'quartz', verdict: 'anti',
    description: 'Two columns: text ("Why now") + a real architecture photo.',
    rationale: 'The image is UNRELATED to the content, and the copy does not actually answer "Why now". Layout is fine; image relevance + weak content killed it.' },
  { id: 'c-image-left', type: 'content', theme: 'quartz', verdict: 'anti',
    description: 'Image left (ocean) / text right (heading + subhead + 2 bullets).',
    rationale: 'Image unrelated. "The shift in one line" reads as a subtitle, not a title, and 2 bullets is thin. Relevance + thinness.' },
  { id: 't-split-photo', type: 'cover', theme: 'cobalt', verdict: 'anti',
    description: 'Split editorial: color panel + real nature photo. Title "American West National Parks Adventure, eight days".',
    rationale: 'Rename — the comma + "eight days" is awkward. "8 days in the American West". Title wording, not the layout.' },
  { id: 't-photo-arch', type: 'cover', theme: 'counsel', verdict: 'anti',
    description: 'Photo full-bleed architecture + "Prepared for the Board of Directors" in the subtitle.',
    rationale: 'Drop "Prepared for the Board of Directors" — should not be called out on the cover.' },
  { id: 'a-photo-corner', type: 'content', theme: 'paper', verdict: 'anti',
    description: 'Content slide with a framed real nature photo in the bottom-right corner.',
    rationale: 'The photo is unrelated to the content, and the copy does not answer "Why now". A corner photo accessory fails when the photo is random — unlike the glass panel, a literal photo must relate.' },
];

/**
 * Batch 6 — Cohesive visual system (2026-06-09, 7 slides). Glass cover + wash
 * kept; the cropped-thumbnail execution + the crude SVG brand-wave both failed.
 * KEY: a pattern must be INTEGRATED, not pasted; reused crops must be DISTINCT.
 */
export const SLIDE_EXAMPLES_BATCH6: SlideExample[] = [
  // ── KEEP ──
  { id: 'g-cover', type: 'cover', theme: 'lilac', verdict: 'keep',
    description: 'Full-split cover: real glass render right, faded into the title left.',
    rationale: 'Works (glass cover holds). Rename the title — e.g. "Freelance Services" + a slogan ("Elevating your business") + the company/author. Glass stays the premium accessory.' },
  { id: 'g-wash', type: 'cover', theme: 'lilac', verdict: 'keep',
    description: 'Glass render blurred to a low-opacity background wash + centered title.',
    rationale: '"Pattern is fine, content is basic — it\'s ok." A valid quiet treatment; the wash works.' },

  // ── ANTI ──
  { id: 'g-cards', type: 'content', theme: 'lilac', verdict: 'anti',
    description: 'Four feature cards, each using the SAME glass image cropped to a different region.',
    rationale: 'Concept ok, execution failed: (1) the 4 crops look TOO SIMILAR (1-2 and 3-4 pair up) — reused crops must be visibly distinct; (2) the body text is identical under every card (repetitive filler); (3) the section titles are too large and wrap to two lines; (4) inconsistent title-case ("brand identity" — set the caps); (5) cards too cramped — more spacing between them.' },
  { id: 'g-expert', type: 'cover', theme: 'lilac', verdict: 'anti',
    description: 'Intro slide: glass left, a "★ Featured Expert" chip, "Meet Sarah Chen…", and a bright purple bio card.',
    rationale: 'Doing too much for a title slide — is it a title or an intro? Cluttered with text; the bright purple card COMPETES with the glass for focus (two focal points); "Featured Expert" and "Meet" are unnecessary chrome. A title slide needs ONE focus and minimal chrome.' },
  { id: 'f-cover', type: 'cover', theme: 'paper', verdict: 'anti',
    description: 'Foxit cover with an SVG orange "brand-wave" blob shape in the corner + testimonial card.',
    rationale: '"No thought to the waves pattern — it looks like you just pasted on something." A decorative pattern must be INTEGRATED into the composition, not a hard shape slapped in a corner. (Superseded by the flowing-contour-line pattern, which IS integrated.)' },
  { id: 'f-content', type: 'content', theme: 'paper', verdict: 'anti',
    description: 'Content slide with the same SVG wave blob, bottom-left.',
    rationale: 'Same failure — the pasted-on wave reads cheap. Pattern must be woven through, not stamped.' },
  { id: 'f-cards', type: 'infographic', theme: 'paper', verdict: 'anti',
    description: 'Feature-card row with the SVG wave blob in the corner.',
    rationale: 'Same — "looks pasted." The crude wave motif is rejected; the real Foxit pattern is the flowing contour lines.' },
];

/**
 * Batch 7 — Abstract art + color combos (2026-06-10, 13 slides). ALL cut, but
 * on EXECUTION bugs, not the direction: hexagon motif too much, page-number on a
 * title slide, too little top padding, patterns too strong / over the title.
 * Spectrum was explicitly LIKED; flowlines critique was "make it subtle."
 */
export const SLIDE_EXAMPLES_BATCH7: SlideExample[] = [
  { id: 'art-spectrum', type: 'cover', theme: 'dawn', verdict: 'anti',
    description: 'Prism spectrum streak across the slide over the dawn gradient.',
    rationale: 'LIKED ("I like it") — the most-promising art. Fix: it left an unintentional GAP on the right; extend it full-bleed. Plus the shared bugs (no page number on a title slide; much more top padding).' },
  { id: 'art-flowlines', type: 'cover', theme: 'dawn', verdict: 'anti',
    description: 'Flowing contour lines (Foxit-style) sweeping the whole slide.',
    rationale: 'Right direction, wrong intensity: "too much — the pattern should be SUBTLE, it\'s taking over the slide." Far lower density/opacity, concentrated to one side.' },
  { id: 'art-rays', type: 'cover', theme: 'dawn', verdict: 'anti',
    description: 'Dawn Prism triangular light-rays + a hexagon outline motif.',
    rationale: 'The hexagon "shape on top of the rays is too much" — remove stacked motif shapes; keep one clean treatment. + no page number, + top padding.' },
  { id: 'art-glow', type: 'cover', theme: 'dawn', verdict: 'anti',
    description: 'Soft glow blooms in the corners.',
    rationale: 'The top-left bloom is too strong → "Strategic" and "Forward" are hard to read. Keep strong blooms OUT of the title zone so the title stays legible.' },
  { id: 'art-geometric', type: 'cover', theme: 'dawn', verdict: 'anti',
    description: 'Geometric constellation (hexagon + circles + lines).',
    rationale: 'Disliked the shape outright. Plus the strong top-left area hurts title legibility. Drop the geometric motif.' },
  { id: 'art-rays-left', type: 'cover', theme: 'dawn', verdict: 'anti',
    description: 'Rays fanning from the LEFT corner.',
    rationale: '"Too much going on on the left — cluttered." The pattern landed on the title side. Keep it off the content/title side.' },
  // combo-dawn/twilight/ocean/ember/sunset/porcelain/foxit — all cut for the SAME
  // shared template bugs (hexagon, page-number-on-title, top padding), NOT the
  // palettes. Re-test the palettes once the template is fixed.
];

/**
 * Batch 9 — Top-tier element-rich layouts (2026-06-10, 6 slides). Donut LOVED.
 * THE rule: a chart must MEASURE the real data on the slide, not be decorative.
 */
export const SLIDE_EXAMPLES_BATCH9: SlideExample[] = [
  // ── GOLD ──
  { id: 'donut-mix', type: 'infographic', theme: 'volt', verdict: 'gold',
    description: 'Donut proportion chart + a color legend (Enterprise 52% / Mid-market 30% / SMB 18%).',
    rationale: 'LOVED — "design-wise it looks good." The winning chart type. Fixes: change the title and the vague category label ("Mix" → something specific).' },

  // ── KEEP ──
  { id: 'chart-stat-combo', type: 'stat', theme: 'volt', verdict: 'keep',
    description: 'Bar+line combo chart + a stat list (Revenue $4.82M +12.4%, etc.).',
    rationale: 'The hero data layout, but: a little crowded; abbreviate 1,284 → 1.2K; add breathing space between the title and the Revenue stat; remove the filler ", at a glance". CRITICAL: the chart must MEASURE the actual numbers — right now it is a generic decorative chart not tied to the stats beside it.' },
  { id: 'support-cards', type: 'content', theme: 'volt', verdict: 'keep',
    description: 'Heading + body + inline link + two glass point-cards + primary/secondary buttons.',
    rationale: 'Kept (no objection). The element-rich section layout works.' },
  { id: 'stat-deltas', type: 'stat', theme: 'volt', verdict: 'keep',
    description: 'Three big gradient numbers, each with a colored delta.',
    rationale: '"Love the gradient" BUT the numbers "disappear" — when everything is gradient there is no hierarchy. The key number must STAND OUT more (don\'t style every element the same).' },
  { id: 'kpi-sparklines', type: 'infographic', theme: 'volt', verdict: 'keep',
    description: 'Three KPI cards, each with value + delta + a mini-sparkline.',
    rationale: 'Abbreviate 3,120 → 3.1K; more breathing space between cards; remove ", at a glance"; be specific in the heading ("HEALTH" of WHAT — Product health?). And the sparklines must measure the real numbers, not be generic.' },

  // ── ANTI ──
  { id: 'bar-chart', type: 'stat', theme: 'volt', verdict: 'anti',
    description: 'A bar chart + a one-line takeaway.',
    rationale: 'No metrics — the actual values are not labeled on/near the bars. And the chart extends all the way to the bottom edge of the slide (no padding). A chart must show its numbers and respect the slide padding.' },
];

/**
 * Batch 10 — Aurora top-tier + curved divide (2026-06-10, 5 slides). The CURVED
 * divide + the Aurora cover were LOVED (composition direction is right). The
 * element-rich slides failed on CROWDING + an unrelated chart + filler title —
 * rules already known, not applied. Lone shapes need intent; busy content needs
 * a simple background.
 */
export const SLIDE_EXAMPLES_BATCH10: SlideExample[] = [
  // ── GOLD ──
  { id: 'a-cover', type: 'cover', theme: 'aurora', verdict: 'gold',
    description: 'Aurora cover: soft layered shapes + gradient title + subhead.',
    rationale: 'Loved the colors + gradient. Fix: the lone circle "looks strange placed by itself, no thought behind it" — compose shapes intentionally (e.g. a small circle overlapping the big one). Go LIGHTER on blur/shadow.' },
  { id: 'curve-bottom', type: 'cover', theme: 'aurora', verdict: 'gold',
    description: 'Curved divide: blue gradient visual top, a curved white panel under the title (Root Cause).',
    rationale: 'LOVED — the curve reads designed. Fix: move the white shape up a bit for more breathing room; reduce the subtitle font so it fits ONE line.' },

  // ── ANTI ──
  { id: 'curve-side', type: 'cover', theme: 'aurora', verdict: 'anti',
    description: 'Title left, a curved-cropped real glass render on the right (Project Timeline).',
    rationale: 'The render looks deformed and awkwardly cropped (cuts off the glass form); it OUT-COMPETES the title for focus; the subtitle is too long. A visual must not distract from the title, and crops must not look broken.' },
  { id: 'a-section', type: 'content', theme: 'aurora', verdict: 'anti',
    description: 'Aurora section: pattern background + heading + subtitle + link + 4 cards + buttons.',
    rationale: 'Too crowded — a busy pattern behind busy content (4 cards + category + title + subtitle). When the content is rich, make the BACKGROUND simple. The lone circle needs intent (overlap a small circle on the big one, on a simpler/white bg). Lighter blur.' },
  { id: 'a-performance', type: 'stat', theme: 'aurora', verdict: 'anti',
    description: 'Aurora performance: pattern background + chart panel + stat list.',
    rationale: 'Too crowded; the chart is NOT related to the numbers (again); the stats need simplifying; no breathing space between title / image / numbers; ", at a glance" is STILL in the title (should have been removed). Simple background, related chart, tighter title — all already-known rules.' },
];

/**
 * The generalizable design principles extracted from the votes above. These are
 * the JUDGMENT rubric — what the writer few-shot and the judges enforce. Each
 * cites the example(s) it came from so the source reasoning is traceable.
 */
export const SLIDE_PRINCIPLES = [
  { id: 'curved-divide', rule: 'A CURVED boundary between the visual zone and the title zone reads as intentionally DESIGNED — not a flat straight split. The title sits in a clean zone separated from the image/pattern by a smooth curve (a curved dune edge below the visual, or a curved/circular crop of the visual beside the title). "It looks designed. The curve."', from: [] },
  { id: 'lone-shape-needs-intent', rule: 'A single decorative shape dropped in alone "looks strange — no thought behind it". Foxit Slides shapes INTENTIONALLY (e.g. a small circle overlapping a big one), never one element placed at random.', from: ['a-cover', 'a-section'] },
  { id: 'busy-content-simple-background', rule: 'When a slide is element-rich (cards + chart + stats), keep the BACKGROUND simple — never stack a busy pattern behind busy content. Calm where the content is busy; pattern only where the content is sparse.', from: ['a-section', 'a-performance'] },
  { id: 'restraint-on-effects', rule: 'Go light on blur and shadow — subtle, not heavy. Effects support, they don\'t announce themselves.', from: ['a-cover', 'a-section'] },
  { id: 'chart-visualizes-real-data', rule: 'A chart must VISUALIZE the actual numbers on the slide — the bars/line/donut ARE the real stats, with their values labeled. A generic decorative chart not tied to the data reads as "nice but unrelated" and is a fail (the chart equivalent of image-must-relate). The loved chart was the donut (clean proportion); a bare bar chart with no value labels was cut.', from: ['chart-stat-combo', 'kpi-sparklines', 'bar-chart', 'donut-mix'] },
  { id: 'abbreviate-large-numbers', rule: 'Abbreviate large numbers — 1,284 → 1.2K, 3,120 → 3.1K. Cleaner and less crowded.', from: ['chart-stat-combo', 'kpi-sparklines'] },
  { id: 'tight-titles-no-filler', rule: 'Titles stay tight — strip filler phrases like ", at a glance". Every word earns its place.', from: ['chart-stat-combo', 'kpi-sparklines'] },
  { id: 'specific-labels', rule: 'Labels and category names must be SPECIFIC, not generic — "Product health" not "Health"; a real category name not "Mix". Don\'t make the viewer guess what a label refers to.', from: ['kpi-sparklines', 'donut-mix'] },
  { id: 'charts-respect-padding', rule: 'A chart never bleeds to the slide edge — it sits inside the slide padding like any other element.', from: ['bar-chart'] },
  { id: 'hierarchy-key-element-stands-out', rule: 'Don\'t style every element the same — when everything is gradient (or all equal weight), nothing stands out and the key element "disappears". The number/element you want remembered needs distinct emphasis.', from: ['stat-deltas'] },
  { id: 'top-tier-styling', rule: 'The top-tier LOOK = THREE ingredients applied together: (1) SUBTLE ABSTRACT SHAPES — soft, blurred, LAYERED organic curves/blobs that bleed off the edges and integrate into the composition (NOT hard-edged shapes pasted in a corner — that\'s the difference between this and the cut brand-wave); (2) GRADIENT TEXT on titles/accents — makes it more interesting and premium; (3) GLASS COLUMNS — frosted translucent panels/cards (CSS glassmorphism: translucent fill + blur + a soft light border) for supporting-point cards and chart panels. NB "glass columns" = CSS frosted panels, distinct from the 3D glass RENDER images. Apply all three to the element-rich layouts.', from: [] },
  { id: 'top-tier-element-vocabulary', rule: 'TOP-TIER layouts compose a RICHER element palette than title+bullets: data CHARTS (bar, line, bar+line combo, donut/proportion), STAT LISTS with colored deltas (LABEL / big value / +12.4%), CHART+STAT combos, supporting-POINT CARD pairs, KPI rows with mini-sparklines, primary/secondary BUTTONS, inline LINKS, avatar/image blocks, and 2×2 grids — presented as a cohesive themed SET (cover → section → performance). Top-tier SHOWS data (charts), it does not just list it. These are first-class elements, not decoration.', from: [] },
  { id: 'pattern-subtle', rule: 'Decorative patterns must be SUBTLE — they elevate, they never take over. Low opacity/density, concentrated to one side (away from the content), so the slide reads calm. A pattern that "takes over the whole slide" is a cut.', from: ['art-flowlines', 'art-rays-left', 'art-glow'] },
  { id: 'pattern-clear-of-title', rule: 'Keep the pattern AND any strong light bloom OUT of the title zone. The title sits in a clean, low-pattern, higher-contrast area (e.g. title left, pattern sweeping the right) so it stays legible. A strong area behind the title kills its contrast.', from: ['art-glow', 'art-geometric', 'art-rays-left'] },
  { id: 'no-page-number-on-title', rule: 'A title / cover slide carries NO page number.', from: ['art-rays', 'art-glow', 'art-spectrum'] },
  { id: 'no-stacked-motif-shapes', rule: 'Do not layer extra decorative shapes (a hexagon, geometric bits) on top of the pattern — it reads as "too much". One clean treatment per slide.', from: ['art-rays', 'art-geometric'] },
  { id: 'pattern-must-be-integrated', rule: 'A decorative pattern must be INTENTIONALLY INTEGRATED into the composition — woven through, flowing, intrinsic — NOT a hard shape stamped in a corner. A pasted-on motif reads cheap ("looks like you just pasted something on"). The flowing-contour-line pattern works because it is integrated; the crude corner blob did not.', from: ['f-cover', 'f-content', 'f-cards'] },
  { id: 'crops-must-be-distinct', rule: 'When reusing ONE asset as multiple crops, the crops must look VISIBLY DIFFERENT (genuinely different regions/angles). Near-identical crops defeat the cohesion — they just look like the same image twice.', from: ['g-cards'] },
  { id: 'no-repetitive-filler', rule: 'Every card/grid item needs distinct REAL content — never the same body text repeated under each. Identical placeholder text across items reads as unfinished.', from: ['g-cards'] },
  { id: 'title-slide-one-focus', rule: 'A title slide has ONE focal point and minimal chrome. Do not add competing elements (a bright bio card next to the hero visual), unnecessary badges ("Featured Expert"), or filler words ("Meet"). Two focal points fighting = cut.', from: ['g-expert'] },
  { id: 'pattern-elevates', rule: 'THE GOAL of the decoration layer: a subtle abstract pattern over a rich gradient ELEVATES an otherwise plain slide — it adds atmosphere + brand, it does not illustrate. \'s reference: the Foxit title slides where flowing contour lines sweep across a navy→purple→orange gradient and glow where they meet the orange. A plain title becomes premium purely from the pattern + gradient + glow.', from: ['t-glass-crystal'] },
  { id: 'signature-asset-reuse', rule: 'IT DEPENDS ON THE ASSET TYPE. For ABSTRACT/decorative visuals (a glass render, a brand-wave motif, light-art), cohesion comes from reusing ONE asset across the deck in varied crops/angles/scales/washes — like Foxit\'s brand-wave or a single glass render used full on the cover + cropped into the feature thumbnails + as a side accent. BUT for LITERAL/CORPORATE photos — real humans, teams, products — use DIFFERENT, content-relevant images per slide (reusing one human photo cropped reads cheap, not cohesive). Abstract → reuse one; literal/human → distinct per slide (see image-must-relate).', from: ['t-glass-crystal', 'a-glass-panel'] },
  { id: 'image-must-relate', rule: 'A literal photo must be CONTENT-RELEVANT — part of the story. An unrelated/decorative stock photo is a CUT, no matter how nice it looks. (The #1 finding of the image round — said 5 times.)', from: ['c-twocol-image', 'c-image-left', 't-photo-volt', 'c-stat-image', 'a-photo-corner'] },
  { id: 'pattern-not-random-photo', rule: 'When there is no content-relevant image, use a SUBTLE abstract pattern/texture (e.g. a faded glass render) instead of forcing a literal photo. Decorate, don\'t illustrate-with-something-random.', from: ['c-stat-image'] },
  { id: 'glass-is-premium-accessory', rule: 'Abstract 3D glass renders are the winning PREMIUM accessory — full-bleed (title in negative space), split, or a faded side panel. Unlike photos they carry MOOD, not a claim, so they need no content-relevance. (All 3 glass treatments loved.)', from: ['t-glass-crystal', 't-glass-amber', 'a-glass-panel'] },
  { id: 'gradient-title-divider-premium', rule: 'A gradient-clipped serif title + a gradient accent divider reads premium (the format loved on the photo full-bleed).', from: ['t-photo-volt'] },
  { id: 'columns-pair-with-structure', rule: 'Designed column/card layouts work — pair them with structure, icons, or glass, NOT a random literal photo. The column is fine; an unrelated image in it is what fails.', from: ['c-compare-visual', 'c-three-cards', 'c-twocol-image'] },
  { id: 'no-leading-article', rule: 'Drop leading articles from titles — "Shifts", not "The shifts". Short, but still meaningful and matched to the subtitle.', from: ['win-content-sub'] },
  { id: 'title-subtitle-harmony', rule: 'Title and subtitle colors must harmonize — a clashing title color reads off. The title may borrow the body/accent color. The title must RELATE to the subtitle, not contradict or under-describe it.', from: ['win-content-sub', 'cover-done'] },
  { id: 'hero-number-ceiling', rule: 'A hero stat number has a SIZE CEILING — oversized reads as imbalance, not impact. Keep the colored delta/story but do not let the number dominate the whole card.', from: ['win-stat-single', 'stat-1'] },
  { id: 'state-what-it-is', rule: 'Even a pillar/feature/icon grid needs a title or takeaway stating WHAT the items are (features? strengths? selling points?). Never make the viewer guess the category.', from: ['win-info-grid'] },
  { id: 'clearest-metric-unit', rule: 'Pick the clearest, least-ambiguous metric framing — "42% faster sales cycle" beats a raw "11 days". Choose percent vs absolute by what communicates best, and never let a metric label wrap to two lines.', from: ['stat-story'] },
  { id: 'diagram-flow-is-the-pattern', rule: 'The winning diagram = icon + label + sublabel per node + left-to-right arrows + a takeaway title. Polish: align all nodes to ONE baseline, tie the title to the row (don\'t let it float), anchor the key step with size/color, and give arrows real weight.', from: ['dia-flow-v2'] },
  { id: 'diagram-completeness', rule: 'An ownership/flow diagram must be COMPLETE — include the human/input (the prompt, the author), not only system stages. A graph/quadrant needs MEASURABLE named axes + reference points (competitors) + gridlines so near-equal items are distinguishable.', from: ['dia-hierarchy-v2', 'dia-quadrant-v2', 'dia-hub-v2'] },
  { id: 'roadmap-as-status-bullets', rule: 'When a timeline lacks rich data, use quarter bullets with status + dates ("Q3: Testing & GTM — in progress, due 6/29; Target launch Nov") rather than abstract dots. "We are here" must point to a dated, named milestone.', from: ['timeline-v2'] },
  { id: 'padding-generous', rule: 'Generous padding, especially TOP and LEFT — content must never start tight to the edge. This is the single most recurring defect. 64px is a FLOOR on 960×540; many layouts want more on top/left.', from: ['agenda-plain', 'stat-trio', 'content-icons', 'diagram-flow', 'info-callouts', 'quote'] },
  { id: 'title-not-subtitle', rule: 'The title is short, direct, and carries the takeaway; the descriptive line is a SUBTITLE, not the title (e.g. title "Performance", subtitle "The quarter in three numbers"). Use title-case for emphasis. Never let a highlighted subheader eclipse the title.', from: ['stat-trio', 'stat-grid6', 'content-sub'] },
  { id: 'support-adds-new-info', rule: 'Supporting text must add NEW information — never restate the headline or number. A caption that repeats "3× faster" is wasted; say WHY instead.', from: ['stat-context'] },
  { id: 'no-awkward-wrap', rule: 'Labels and captions fit on ONE line — shrink the font or reword rather than wrap to two lines.', from: ['stat-trio', 'cover-split'] },
  { id: 'consistent-alignment', rule: 'Items in a group share one alignment; a number and its caption share a center/left axis. Misaligned list items read as broken.', from: ['agenda-plain', 'stat-context'] },
  { id: 'icons-meaningful', rule: 'Icons only when they carry meaning and relate to the item — never decorative clutter (agendas need none), never ambiguous (before-side ✗ marks), never "blobs". Watch icon color/contrast and never let an icon clip the edge.', from: ['agenda-icons', 'content-icons', 'compare-icons', 'info-icongrid'] },
  { id: 'cover-complete', rule: 'A complete cover = short title + subtitle + a divider + author + date. A bare title — or a sentence-title — is not enough.', from: ['cover-sub', 'cover-split', 'cover-typo', 'cover-long'] },
  { id: 'no-jargon', rule: 'Explain or avoid unexplained jargon ("real brand voice", "Gate") — the audience must understand every term on the slide.', from: ['content-bullets', 'diagram-flow'] },
  { id: 'diagram-must-visualize', rule: 'A diagram must actually VISUALIZE the relationship (arrows, axes, real data, light per-node labels) and carry a clear takeaway. Labeled boxes alone read "homemade" and say nothing — all four diagram layouts were cut.', from: ['diagram-flow', 'diagram-hub', 'diagram-hierarchy', 'diagram-quadrant'] },
  { id: 'graph-needs-data', rule: 'Never draw a chart/graph/quadrant without real data to fill it — an empty axes frame is worse than a plain statement.', from: ['diagram-quadrant'] },
  { id: 'simple-is-a-valid-tier', rule: 'Simple/basic slides are a legitimate tier for many audiences IF they tell the story and are well-padded. Elevate them with a SUBTLE accessory (a faint related pattern/image, an accent) — never with more text.', from: ['cover-min', 'compare-cols', 'process-vertical', 'content-bullets'] },
  { id: 'story-punchline', rule: 'The title carries the story punchline — it must NOT undersell the content. A flat/literal/sentence-like title (or a vague one like "The numbers") wastes the slide. Lead with the takeaway, consider emphasis (e.g. title-case key words).', from: ['stat-crowd', 'compare-1', 'process-1b', 'compare-1b', 'process-1', 'content-1'] },
  { id: 'theme-pairing-carries', rule: 'A strong theme/palette pairing can carry a borderline element (e.g. a large title); a weak pairing breaks it. The SAME composition can be gold or anti depending on theme — so constrain the theme-on-composition pairing, not just the layout.', from: ['cover-2', 'cover-1', 'compare-1', 'compare-1b'] },
  { id: 'clear-takeaway', rule: 'Every slide has ONE clear takeaway, graspable in ~3 seconds.', from: ['content-wall', 'stat-crowd'] },
  { id: 'story-or-cut', rule: 'No metric without a story. A number needs context (up/down, good/bad) or it gets cut.', from: ['stat-crowd'] },
  { id: 'weight-equals-importance', rule: 'Visual weight maps to importance. The number to remember gets the most weight + a distinct color; never equal weight for unequal items.', from: ['stat-crowd', 'stat-1', 'stat-1b'] },
  { id: 'directional-contrast', rule: 'Use muted-vs-accent contrast to guide the eye (before/after, old/new); the "good" side must win.', from: ['compare-1', 'compare-1b'] },
  { id: 'one-focal-point', rule: 'One focal point per slide — elements must not fight for attention.', from: ['compare-1b'] },
  { id: 'legibility', rule: 'Legibility is non-negotiable. No light text on a bright accent (white-on-yellow fails); supporting text needs real differentiation.', from: ['process-1b', 'stat-1b'] },
  { id: 'tight-gap-aligned', rule: 'Tight, controlled header→body gap; body and title share a left edge. Never split title and body to opposite edges.', from: ['content-1', 'stat-1'] },
  { id: 'title-shaped', rule: 'Titles are meaningful and title-shaped: not vague ("The numbers"), not a full sentence, no commas/multi-clause, not oversized.', from: ['stat-crowd', 'cover-1', 'content-1'] },
  { id: 'cover-minimal', rule: 'Covers carry minimal cognitive load — one short phrase, not a sentence.', from: ['cover-weak', 'cover-1'] },
  { id: 'icons-add-life', rule: 'Light per-item icons add life, especially on the hero/"after" element.', from: ['compare-1'] },
  { id: 'palette-energy', rule: 'Palette must not be boring; flat red/brown reads dead.', from: ['process-1'] },
] as const;
