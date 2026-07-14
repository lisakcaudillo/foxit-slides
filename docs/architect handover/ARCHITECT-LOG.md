# Architect Log

The persistent memory of the reviewing architect for Foxit Slides / Compose. A fresh architect session reads this plus CLAUDE.md at checkin, and hands back updates to it at checkout. The top three sections are stable and rarely change. Everything below "Current Position" is updated each session.

## Role boundary (never changes)

The architect diagnoses, maps, and recommends. The architect may write exactly one file, ARCHITECT-LOG.md, which is its own memory and ships nothing. Everything else is forbidden: no code, no other docs, no commits, no pushes, no branch create/delete/merge. The log is the one allowed write because changing it cannot break the build. Read-only inspection (git status, log, grep, reading files) is expected for everything else. Any change outside ARCHITECT-LOG.md is surfaced as a recommendation for Lisa to action elsewhere. This holds even when a task seems to require acting; in that case the architect stops and tells Lisa rather than acting. Committing and pushing the log stays Lisa's or a builder's action, since git operations are where the no-act boundary still applies.

## North star (rarely changes)

Product thesis: Foxit Slides is a render-agnostic design intelligence layer. It decides what a slide contains and how it is laid out together, upstream of any template or rendering vendor. The differentiation is that the intelligence lives above the renderer, so the layout decision is made once, from the content, before any pixels are drawn. This is more ambitious than Gamma (holistic on theme, not on content allocation) and than template-fill tools (which pick a template and pour content in).

Quality bar (from R&D): reproducible 80/100 on first generation, consistently. Four sub-bars:
1. Template consistency: same template feels identical run to run, not close, identical in structure and style.
2. Stable output quality: low variance between runs on similar inputs.
3. 80/100 on first generation, only cosmetic polish left, under 10 minutes, no content restructuring or layout rebuilding.
4. Manual editing as the last mile, not the main job.

Honest status against the bar: cannot currently claim any of the four. Three require measurement that does not yet exist (a 0-100 score, variance data, a committed quality metric). One requires Phase E (fit-parity), which is held. The work so far built the architecture that makes these bars achievable; it has not built the measurement.

## Standing disciplines (rarely changes)

- Design before code. Shape approved at altitude before anything is built.
- Trust the artifact, not the claim. "Built" needs the grep, diff, trace line, count, or before/after render that proves it. Claims without artifacts are treated as not done.
- Behavior-preserving steps first, behavior-changing steps last, with a verified committed checkpoint between. Never accept a half-migrated state as a stopping point.
- Name the risk the test will not catch, every change. Acceptance criteria are the floor, not the whole job. Layout correctness passing is not content quality passing.
- Flag forks, do not guess through them. Surface a real decision with a recommendation; do not pick silently.
- Self-grade then verify independently. The builder grades its own work against the bar; the architect checks the green rows, hardest-to-fake first.
- Move, do not delete. Archive superseded files; keep them in git.
- One source of truth. No second table or doc kept in sync by hand.
- Commit and push for backup. A machine was lost; work that lives only on one disk is exposure. Push is backup, not just version control.

## Current position (updated each session)

Last updated: end of the session that designed recipe retirement scope (a) and wired S1/S2.

The single-layout-stage refactor is the live engineering line. Status:
- Phase A (composition server-side, behavior-preserving): done, in main.
- B1 (collapse templateForRecipe + fallback into pickTemplate): done, in main.
- B2a (populate slideDesign.blockTemplate, stamp isFullCanvasComposition, behavior-preserving): done, in main.
- B2b (flip converter to blockTemplate, remove recipeIntent, remove planDeck recipe-scoring, delete Table #1, loosen validateBlockStructure, drop raw card from seam): done and verified, in main at adad806. The original layout-collapse bug is fixed on the exact bug deck (Tools renders as a category list, metrics hold their grid). Content quality held (denser, not flatter).
- Recipe retirement, scope (a) only: S1 done (additive blocktemplate-design.ts table, image-roles + safe-zone only, budget deliberately not duplicated). S2 done (dropped the mergeDesignBudget recipe-tightening so budgetForTemplate governs directly; image-roles sourced from the new table; two dead recipe-coupled exports removed). S3 pending (the contract removal: delete recipe from SlideDesign, SlideDesignSchema, the SSE seam, retire RECIPE_CATALOG / recipeWhitelist / the Recipe type).

AC status: AC1 partial (closes with S3), AC2 not met (needs the separate pass (b): name the single chooseComposition deck-stage; today pickTemplate is a named function, not the single owner the grep demands), AC3 largely met, AC4 not fully met (closes with S3), AC5 mostly met.

Restore points: 99e32fc (clean B1), 9dc564d (B2a), da4f067 (B2b).

Branch/worktree state: messy. B2b is merged to main at adad806. The S1/S2 recipe work was done in a separate session and may be uncommitted in another worktree (it was deliberately stopped uncommitted at the S2/S3 boundary). There is heavy worktree sprawl (around 13 worktrees, most stale behind main, a couple possibly ahead with unmerged work, the auto-image-library-fallback branch most notably). Locating and securing the uncommitted recipe work is the immediate exposure to close. A deliberate worktree-consolidation pass is owed: pick main as the single line, merge anything ahead-of-main worth keeping, delete the rest, then work on one branch going forward.

## Open forks awaiting decision (updated each session)

- Worktree consolidation: when, and which ahead-of-main branches hold work worth merging before deletion. Deferred to its own session. Merge before delete, always.
- Recipe full retirement reaches into the SSE schema (S3b). The contract change must be sequenced behind a zero-readers proof that nothing on the client still reads slideDesign.recipe.
- toggles default: teach the converter to count toggle blocks, or remove the dead toggles to content-grid mapping so the code does not claim a mapping it cannot reach. Decide in the toggles fix pass.
- The four unmapped blockTemplate defaults (agenda to process; summary-takeaways, toggles, cta-closing to content-grid) carry Lisa's reserved veto, cta-closing especially.

## Known risks and debt being watched (updated each session)

- Measurement ruler debt: the cmpWords/seqWords capture script that produced the baseline (7 and 5) was never committed, so the baseline is not reproducible. Content-quality checks are currently by-mechanism, not by-measurement. A committed, reproducible metric must be re-established before the variance harness can mean anything.
- toggles finding: toggle content renders as title-body because toggle blocks are not counted by structuredItemCount, so the intended toggles to content-grid mapping never fires. Pre-existing, not introduced by the refactor, but real. A consistency and last-mile break.
- Phase E clipping: text can clip until the fit-parity harness lands and the client autofit net is removed. This is a "user fixes a break" failure against R&D bar 4.
- Model dependency: writing and judging route through one integration file, so a model swap is a contained code change, but prompts and judge calibration are tuned to one model, so a swap re-earns quality. Not a lock-in, but not free.

## Next priorities, ordered (updated each session)

1. Finish recipe retirement (S3). Closes AC1, AC4, AC3-residue. Touches the SSE schema, sequence behavior-preserving deletions before the contract change, with a zero-readers proof between.
2. Build a 0-100 quality score. Extend the vlm-judge to emit a calibrated number, not just dimension pass/fail. Three of the four R&D bars are stated as this number; nothing downstream can be claimed without it.
3. Re-establish a committed, reproducible content-quality metric, then build the variance harness (run one fixed prompt N times, report mean and spread). Bar 2 is entirely about variance and is currently unmeasured.
4. Fix toggles.
5. Phase E: fit-parity harness, then delete the client autofit net. The clipping fix and bar-4 closer. Puppeteer plus Chromium dependency, held pending explicit go. Check for local-only Phase E work on the laptop first.
6. Template-consistency test: same template twice, structural diff. Reuses the score and the variance machinery.

Held: pass (b) for AC2 (the named chooseComposition owner), Phase E, Phase F (vision/design-critic PRD). Do not start recipe retirement and measurement in the same pass.

## Session history (append-only short log)

- Designed recipe retirement scope (a), wired S1 (additive table) and S2 (budget de-tighten + image-role re-key). Found that contentBudget was already blockTemplate-keyed, so the new table holds only image-roles and safe-zone, avoiding a second budget source of truth. Accepted S2 by-mechanism (zero-delta budgets), deferred the empirical magnitude check as logged debt because the baseline metric is not reproducible. Stopped at the S2/S3 boundary.
