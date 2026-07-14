# Strategy 1 — Minimal / Under-ask

## Philosophy
Every Clarify question is a tax on the user's momentum, paid before they've seen a single result. Default to the AI's judgment plus the deck-revise loop; ask only when the AI literally cannot proceed without committing fabrication (FR11), making a coin-flip guess on ambiguous nouns, or producing a chart with invented numbers.

## Anchor prompt analysis
> "Make a deck about our Q1 sales — we beat the target"

**Gaps detected:**
- Implied chart with no data (target $? actual $? — FR11 says AI cannot make these up)
- Optional narrative gaps: what drove the beat, which products, by how much
- No noun ambiguity, no audience ambiguity (internal sales review is the dominant reading)

**Questions to ask:** (exactly 1)
1. **"Got the actual numbers? Paste them here — otherwise I'll use placeholders you can fill in later."** (type: `text`, multiline, optional). WHY: this is the only FR11-blocking gap. With numbers, slide 3 is a real chart; without, it's a labeled placeholder the user fills in. Optional skip is critical — the user may want a structural draft first.

**Questions deliberately SKIPPED and why:**
- *"What drove the beat?"* — Skipped. The AI can draft a generic "drivers" slide ("strong renewals, expanded mid-market, new product traction") that the user edits in 5 seconds. Asking forces them to write the deck before the deck writes itself.
- *"Which product lines?"* — Skipped. Covered by the data paste if relevant; otherwise the AI uses a single-line summary slide.
- *"Internal or board audience?"* — Skipped. Already a Customize setting. Default ("team review") is the safe read.
- *"How celebratory in tone?"* — Skipped. Tone is a Customize setting.

## Second prompt — stress-test ambiguity
> "Deck about Mercury for Friday"

**Gaps detected:** "Mercury" is genuinely ambiguous (planet / Queen band / chemical element / car brand / Roman god / Freddie Mercury biopic). The AI guessing wrong here wastes 30 seconds of generation on the wrong topic.

**Questions to ask:** (exactly 1)
1. **"Which Mercury?"** (type: `select`, options: `The planet`, `Freddie Mercury / Queen`, `The chemical element (Hg)`, `Roman god`, `Something else (tell me)`). WHY: disambiguation that the AI cannot resolve from context. One tap, no typing in 4 of 5 cases.

**Questions deliberately SKIPPED:**
- *"What's Friday — a deadline, a meeting, a class?"* — Skipped. Doesn't change deck content meaningfully.
- *"Educational or persuasive?"* — Skipped. The selected Mercury implies it (planet → educational; Queen → could go either way but Customize tone handles it).

## Edge case: no gaps detected
For a prompt like *"Onboarding deck for new sales hires — 5 sections covering tools, ICP, comp plan, key contacts, first-week goals"* — the user already supplied audience, structure, and content scope. **Clarify returns `{ questions: [] }` and the modal does NOT open.** Generation proceeds straight to blueprint. The empty-state IS the success state. No "Sounds good!" confirmation modal — that's friction theater. The visual feedback is the blueprint appearing.

For the Inspire-Me case specifically, Clarify is allowed one extra question (max 2 total) because the prompt was auto-generated and thinner by definition.

## How my answers flow into the deck
Answers are appended to the normalize-intent payload as a `clarifications` object (`{ data?: string, disambiguation?: string }`), which the blueprint stage treats as **higher priority than the original prompt** when sections conflict. Data pastes are parsed into a structured `metricsContext` that the chart-rendering layer references directly — no re-prompting, no hallucination, FR11 satisfied.

---

**Report:**

1. **File:** `C:\Users\LisaEnglund\compose\app\public\design-table\clarify-questions\strategy-1.md`

2. **Most provocative claim:** A maximalist strategy treats Clarify as a guided intake form (audience, scope, key message, framing, tone-check). I treat it as a **hallucination firewall**. The only questions that earn a slot are ones where silence forces the AI to either invent facts (FR11 violation) or coin-flip between unrelated topics. Everything else is the user's job to fix in 10 seconds with the deck already on screen — because seeing a draft and editing it is faster than answering questions about a draft that doesn't exist yet.
