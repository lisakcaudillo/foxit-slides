<!-- Moved from CLAUDE.md 2026-06-11 during the lean-CLAUDE restructure. This is the
canonical home for the Document Understanding Engine subsystem documentation.
Referenced from CLAUDE.md. -->

## Document Understanding Engine — Five Layers

Compose's document understanding engine (the subsystem in `app/src/lib/atlas-engine/` and `app/src/lib/foxit-sdk-server.ts`, served via `/api/atlas/*`) is a five-layer pipeline that uses every available signal source, prioritized by cost and accuracy. Higher layers short-circuit lower ones where they have signal; lower layers fill gaps. Final output combines all available signals before reaching the editor / canvas / compare consumers.

All layers run **in-process** inside the same Next.js Node.js application. Layers 0–2 use the Node.js Foxit SDK directly. Layers 3–4 call Claude / ChatGPT.

### The Layers

- **Layer 0 — Bookmarks** (PDF outline / table of contents). Free (SDK calls only). Coverage: ~30–50% of business documents. Trigger: always check first. ✅ **Wired.**
- **Layer 1 — Tag tree** (PDF/UA, PDF 2.0 structure tree). Free (SDK calls only). Provides headings, paragraphs, tables with cell spans, lists, MathML formulas, reading order. Coverage: minority of docs today, growing under EAA / ADA pressure. Trigger: check when bookmarks insufficient or as accuracy cross-reference. ⏸ **Not yet wired.**
- **Layer 2 — Foxit SDK Layout Recognition**. Included in SDK license. Provides headings, tables, figures, captions, reading order on untagged input. Throughput: 4–11ms per page. Coverage: 100% of inputs, quality varies by document type. Trigger: always runs for elements not covered by Layers 0 or 1. A numbered-clause regex post-pass upgrades legal-style "1. DEFINITIONS" / "2.3 Termination" headings that Foxit LR misses. ✅ **Wired (LR + post-pass).**
- **Layer 3 — VLM** (Claude or ChatGPT vision). Per-token cost, higher latency. Catches complex layouts, ambiguous reading order, scanned content, handwriting, diagrams, charts, embedded images. Trigger: low Layer 2 confidence, image-heavy pages, or document type signals likely complexity. ⏸ **Not yet wired.**
- **Layer 4 — AI semantic annotation** (Claude or ChatGPT). Operates on Layer 0–3 output. Provides element roles, cross-references between elements, domain meaning. Per-token cost, depth determined by Compose feature requirement. Trigger: after structure is settled, per Compose feature consuming the output. ⏸ **Not yet wired.**

### Routing Logic

For each input, the engine asks in order:
1. Bookmarks present? Use them for outline (Layer 0).
2. Tag tree present? Consume tags directly for structure, formulas, tables (Layer 1).
3. For elements not covered by Layers 0 or 1, run Foxit SDK LR (Layer 2).
4. For pages where LR confidence is low or content is image-heavy, call VLM (Layer 3).
5. After structure is settled, run AI semantic annotation per Compose feature requirement (Layer 4).

### Strategic Positioning

Compose's document understanding engine is not a MinerU clone. It uses every available signal source, prioritized by cost and accuracy, with semantic meaning as the final layer.

What this gives Compose:
- **Cost efficiency**: most documents resolve at Layers 0 or 1 with no per-token cost.
- **Quality ceiling**: when all layers run, output combines structural fidelity (tags), ML layout (LR), vision understanding (VLM), and meaning (LLM) in ways no single competitor has.
- **Differentiation**: Layer 4 is the part competitors don't have. Extraction tools stop at content; Compose understands meaning.

### AI Provider Naming Convention

When referring to AI providers in roadmap and architecture docs: "Claude" and "ChatGPT". No model versions ("GPT-4o", "Claude Opus 4.7"), no API names ("Anthropic SDK", "OpenAI API"). Future-proofs against model churn.

### Roadmap Status

- **Phase 1a — Single-process merge**: ✅ **Complete.** Python `atlas/` source code deleted (~15K lines, 68 files). Legacy atlas/engine/ prototype (React app, Python test scripts, FAISS index) also removed 2026-04-30. All atlas API routes (`/api/atlas/{extract,compare,compliance,fields}` and `/api/export/pdf`) call the in-process TypeScript engine directly via the Node.js Foxit SDK. No Python sidecar. `npm run dev` runs everything.
- **Phase 1b — Layer 0/1/2 foundation**: 🟡 **Partial.** Layer 0 wired, Layer 2 wired with numbered-clause post-pass, Layer 1 not yet wired (low priority — only helps already-tagged PDFs). Office (DOCX/XLSX/PPTX) upload via Foxit Conversion SDK now works (trial license).
- **Phase 1c — Vision backstop**: ⏸ Layer 3 not yet wired. Required for stylized PDFs without bookmarks AND without tag tree.
- **Phase 1d — First semantic feature**: ⏸ Layer 4 not yet wired. Recommended first feature: reference-slide / inspiration import for the card generator (currently broken — reads file as truncated text into prompt).
- **Phase 1e — Semantic expansion**: ⏸ Layer 4 across additional Compose features.
- **Phase 2** (post-MVP, conditional): MinerU-equivalent capability if Compare feature reactivates with stricter quality target; multi-language OCR breadth assessment; AGPL implications review if external system adoption considered; Foxit Comparison module wire-up; TableMaker module wire-up for proper table cell structure.

Full roadmap detail with dependencies and milestones: [docs/roadmap.md](docs/roadmap.md).

### Open Decisions / Required for Phase 1c+ Build

- Define MVP document types (concrete list) — drives Layer 3 trigger logic and test corpus
- Define MVP feature list driving Layer 4 depth — which Compose features get semantic annotation, in what order
- Output contract: Markdown format spec and JSON manifest schema for the engine output
- Sentinel interaction model: where sanitization happens in the pipeline (before Layer 3, not after), what happens to sanitized regions, how it affects Layer 4 quality
- Layer 3 routing and trigger logic (signals that fire VLM, per-page or per-element granularity, fallback if VLM fails or times out)
- Layer 4 caching architecture (per-document cache, invalidation rules, storage backend)
- AI provider abstraction (multi-model scope) — currently all AI calls hardcode Anthropic; abstraction needs to land before adding more AI features

### Deferred

- Cost analysis and per-document cost modeling
- AGPL implications review (if external system adoption considered Phase 2)
- MinerU-equivalent capability for Compare feature reactivation
- Multi-language OCR coverage assessment
- OCR add-on integration (license + add-on package downloaded; code wiring not yet done)
- Foxit Comparison module wire-up (license has it; we currently use TS keyword/Jaccard)
- Foxit TableMaker module wire-up (license has it; tables currently emit as flat text)
- Production Conversion SDK license (currently on trial)

