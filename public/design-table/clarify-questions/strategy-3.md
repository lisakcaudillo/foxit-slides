# Strategy 3 — Topic-narrative / Story-angle

## Philosophy
An AI can guess the *structure* of any common deck — Q1 review, launch retro, offsite recap — because those templates are everywhere in its training data. What it cannot guess is the *specific perspective the human brings to this specific instance*: which thing won, what nearly broke, what the room needs to take away. A deck without that perspective is a tidy data dump that feels auto-generated. Strategy 3 surfaces the narrative beats only the human knows, so the blueprint reflects a point of view — not a generic template fill.

## Anchor prompt analysis
> "Make a deck about our Q1 sales — we beat the target"

**Narrative gaps detected:**
- *Causation* — "beat the target" is the outcome; the story is *why*. New product? Renewal cycle? A whale deal? Sales-team execution? Market tailwind? Each of these rewrites the deck.
- *Tension* — was this a comfortable beat or a near-miss? A beat with one product carrying three weak ones is a very different story than across-the-board strength.
- *Memorable moment* — the one thing the audience should walk out remembering. Without this, every slide has equal weight and nothing lands.
- *Forward setup* — does this beat make Q2 easier or harder? (Pull-forward risk, comp inflation, etc.)

**Questions to ask:**
1. **"What drove the beat?"** — type: `select` with chips `New product launch / Renewal cycle / Big single deal / Team execution / Market tailwind / Something else…` (last opens text). Why: this *is* the deck's thesis. The cause becomes the spine slide; supporting evidence becomes the body; everything else is context. Without it, the deck defaults to "here are the numbers in chronological order," which is the data-dump failure mode.
2. **"What's the one thing you most want people to remember?"** — type: `text` (short). Why: this becomes slide 1's hero line and the closing slide's takeaway. It forces the user to pick a single argument, which collapses the deck from a list into a story.
3. **"Anything you want to soften, caveat, or downplay?"** — type: `text` (optional, skippable). Why: surfaces tension the prompt hid. Answers like "Product C missed badly" or "We pulled Q2 deals forward" reshape the deck — they don't get hidden, they get *handled* with framing slides ("where we underperformed," "Q2 setup considerations"). This is where the deck stops sounding like a victory lap and starts sounding earned.

**Questions deliberately skipped:**
- "What were the actuals? Target vs achieved? Product breakdown?" — Strategy 2's territory. Asking for data here clutters the narrative pass and burns the user's patience before they get to the story decisions. Data can be collected in a second pass or pulled from a paste later.
- "Who's the audience / tone / detail?" — already settings (per Lisa 2026-05-26).

## Second prompt — pick one where narrative angle dominates
> "Post-mortem deck for the Atlas launch — what we learned"

**Narrative gaps detected:**
- *Honesty calibration* — is this a real autopsy or a polished retrospective for an exec audience? Determines whether failures are named or abstracted.
- *Hero vs villain* — which decisions look smart in hindsight, which look bad? The user has opinions; the AI doesn't.
- *What changes* — a learnings deck without "so next time we…" is therapy, not strategy.

**Questions to ask:**
1. **"What's the one decision you'd make differently?"** — `text`. Becomes the centerpiece slide; everything else orbits it.
2. **"Who comes out looking good — and is that the story you want to tell?"** — `select` chips `Team / Process / Strategy / Nobody — it was external / Prefer not to single out`. Calibrates honesty level and shapes the credit/blame slides.
3. **"What's the change you're proposing for next time?"** — `text`. Forces the deck to land somewhere actionable. Without it, post-mortems read as venting.

## Edge case: pure-data prompt with no narrative
> "Show me Q1 numbers in a deck."

Strategy 3 yields gracefully. If the prompt asks for *numbers, not a story*, narrative questions are wrong-tool. Strategy 3 detects this (no outcome verb like "beat / missed / launched / learned" — just a data request) and skips itself in favor of Strategy 2's data-extraction path. Asking "what's your thesis?" when the user just wants a dashboard slide is annoying. Strategy 3 owns *opinion-bearing* prompts.

## How my answers flow into the deck
The narrative answers reshape the BLUEPRINT — not just the content within fixed sections, but the *section list itself*:

- **"What drove the beat?"** → spawns a dedicated **Cause** section right after the headline slide. Cause = "New product launch" generates a product-spotlight section. Cause = "Big deal" generates a customer-story section. The downstream content blocks are *different*, not just labeled differently.
- **"One thing to remember"** → becomes the *opening hero slide* (slide 1, full-bleed, single sentence) AND the *closing takeaway slide* (last slide, restated). Two slides bookended by the same idea is the structural signature of a deck with a thesis.
- **"Anything to soften?"** → if non-empty, inserts a **"Where we underperformed"** or **"Caveats"** section before the forward-looking close. If empty, that section is omitted entirely. The presence/absence of this section is itself a narrative choice.

Net effect: the section *list* changes based on the answers, not just the prose within a fixed template. That's what makes the output feel authored rather than templated.

---

**Report:**
- File path: `C:\Users\LisaEnglund\compose\app\public\design-table\clarify-questions\strategy-3.md`
- The single narrative question impossible for the AI to guess on the anchor prompt: **"What drove the beat — new product, renewal cycle, big single deal, team execution, market tailwind, or something else?"** The AI knows Q1 sales decks exist; it cannot know which of those forces actually produced this specific beat, and the answer rewrites the deck's spine.
