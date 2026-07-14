# Strategy 2 — Data-grounding / Numbers-first

## Philosophy
Every AI deck tool can write paragraphs. None of them can responsibly produce a chart, KPI tile, or comparison table — because the model doesn't have the numbers, and FR11 forbids fabricating them. Clarify's highest-leverage job is to **detect implied quantitative claims** in the prompt and accept the real data the engine needs to render them. Without this, "we beat the target" becomes a paragraph with a stock bar chart of made-up bars. With it, Compose produces a deck grounded in the user's actual numbers — which is the only deck a salesperson can show their CEO.

## Anchor prompt analysis
> "Make a deck about our Q1 sales — we beat the target"

**Quantitative claims detected:**
- "Q1 sales" → a sales total exists (value missing)
- "the target" → a target value exists (value missing)
- "beat" → a positive delta exists (magnitude + % missing)
- Implicit: breakdown by product / region / segment / rep (any of which would justify a second chart)
- Implicit: comparison to prior period (Q4, Q1 last year) — common framing for "beat"

**Data questions to ask:**

1. **"What were the headline numbers?"** — *multiline text, skippable.*
   *Why:* without target + actual, the title slide's KPI tile and the cover claim "beat the target" have no grounding.
   *Renders as:* Slide 1 KPI tile pair (Target / Actual / Delta %) + cover slide stat callout.
   *Suggested format hint shown under the textarea:* `Target: $2M  Actual: $2.4M  (or paste however you have it)`

2. **"Any breakdown you want to show?"** — *multiline text, skippable.*
   *Why:* a deck about Q1 sales with only the headline is one slide of content. A breakdown by product/region/rep is what justifies slides 2–4.
   *Renders as:* a bar chart slide + a top-performers list slide.
   *Format hint:* `By product, region, rep, segment — paste rows in any format, e.g. "Enterprise $1.1M, Mid-market $0.8M, SMB $0.5M"`

3. **"What's the comparison story?"** — *select, skippable.*
   *Options:* `vs Target` / `vs Q4` / `vs Q1 last year` / `Both target and YoY` / `Just the absolute numbers`
   *Why:* "beat" is comparative — picking the comparison axis decides whether slide 2 is a target gauge, a QoQ bar, or a YoY trendline.
   *Renders as:* the chart type and axis labels on the comparison slide.

**Non-data questions:** None from me. Strategy 1 (narrative) and Strategy 3 (disambiguation) cover those; my lens is purely "what numbers does this claim need?"

**Skip behavior:** If user skips all three, the deck still generates — but the AI is instructed to use **qualitative language only** ("Q1 exceeded target", "growth was strongest in our core segment") and to **omit chart blocks entirely**, replacing them with text or icon-grid blocks. No fake charts, no placeholder `[$X]` tokens.

## A worked example of paste-format
User pastes into question 1:
```
Target $2M, Actual $2.4M
Q4 was $1.9M, Q1 last year was $1.8M
```
Engine parses to:
```json
{ "kpis": [
    { "label": "Target",  "value": 2.0, "unit": "$M" },
    { "label": "Actual",  "value": 2.4, "unit": "$M" },
    { "label": "Delta",   "value": 20,  "unit": "%", "derived": true }
  ],
  "comparisons": [
    { "axis": "QoQ", "prior": 1.9, "current": 2.4 },
    { "axis": "YoY", "prior": 1.8, "current": 2.4 }
  ]
}
```
Parser is forgiving: `$`, `M`, `K`, commas, line breaks, "vs", "→" all tolerated. If parse fails on any token, the engine drops that token (not the whole answer) and continues.

## Second prompt
> "Our user base doubled this year — show me a deck."

**Quantitative claims detected:** "doubled" → starting count + ending count missing, time period implied as "this year" (start date ambiguous), growth curve shape (linear/exponential/stepwise) missing, breakdown by acquisition channel implied.

**Data questions:**
1. *"Starting and ending user counts?"* — text. Renders as headline KPI + growth arc on slide 1.
2. *"Was the growth steady or did it accelerate at a point?"* — select (`Steady` / `Accelerated mid-year` / `Big launch spike` / `Not sure`). Decides whether chart is a smooth line or a stepped curve.
3. *"Where did the growth come from?"* — multiline, skippable. Paste channel splits if known. Renders as a stacked area chart or channel-attribution slide.

**Skip behavior:** same — qualitative language, no charts, swap chart slides for "what drove growth" narrative slides.

## Edge case: prompt has NO quantitative claim
> "Make a deck about the history of coffee."

Data-grounding strategy detects **zero quantitative claims** and **asks nothing in this lane.** It yields the floor to the narrative strategy (Strategy 1) and/or disambiguation strategy (Strategy 3). The Clarify orchestrator should run all three lenses and only surface questions that fired — never pad with data questions that have no claim to ground.

(A soft secondary heuristic: if the topic is *historically* numeric — "history of coffee" has dates, production volumes — the strategy *could* offer one optional question like "any specific stats you want featured?" But default is silence. Over-asking is worse than under-asking.)

## How my answers flow into the deck

| If user provides | Blueprint changes | Generation changes |
|---|---|---|
| Headline numbers | KPI-tile block reserved on slide 1; cover claim grounded with actual delta | AI prompt receives `{ target: 2.0, actual: 2.4, delta: 20 }` as a hard fact, instructed to never substitute |
| Breakdown rows | Adds 1–2 chart slides to blueprint with `chartType` hinted by data shape (categorical → bar, time → line, parts-of-whole → donut) | Chart block emitted as structured data, not as image placeholder |
| Comparison axis | Sets chart axis labels + secondary series | Decides comparison-slide layout (gauge vs. side-by-side bar vs. trendline) |
| Skips everything | Blueprint omits all chart blocks; substitutes text/icon-grid blocks of equal weight | Prompt instructs Claude: qualitative language only, no numeric specifics, no `[bracketed]` placeholders |

The single most valuable downstream effect: **the engine never needs to invent a number.** Either it has the real one (rendered), or it has explicit permission to speak qualitatively (rendered differently). The third option — hallucinate a plausible-looking chart — is structurally eliminated.

---

**Report:**
- File path: `C:\Users\LisaEnglund\compose\app\public\design-table\clarify-questions\strategy-2.md`
- Highest-leverage data question on the anchor prompt: **"What were the headline numbers?"** with a multiline textarea and the hint `Target: $2M  Actual: $2.4M  (or paste however you have it)`. One question, skippable, unlocks the KPI tile + cover claim + the delta % the entire deck is built around. Without it, "we beat the target" is unsupported; with it, every downstream slide can ground itself in real numbers.
