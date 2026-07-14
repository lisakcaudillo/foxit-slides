/**
 * slide-gates.ts — the SHARED per-deck judge + content-judge + revise loop.
 *
 * Extracted from generateStructuredDeck's inner block (formerly ~150 lines of
 * inline logic) so BOTH orchestrators call the same gates:
 *   • generateStructuredDeck  (Figma / Counsel / Volt)
 *   • generateNativeDeck      (Compass / captured templates)
 *
 * The caller supplies a `rebuildSlide(index, feedback) => Promise<Card>`
 * closure that re-runs its own per-slide build (fill + assemble + fit) when
 * a slide needs revision. The gates themselves are path-agnostic: they only
 * see `cards`, `layoutKeys` (used as VLM context and log labels), and the
 * theme. Structure-fill's `sfLog('judge-start', ...)` naming is preserved
 * so tests + downstream tooling that grep for those markers don't break.
 */
import type { Card, TemplateTheme } from '@/types/card-template';
import type { SlideVerdictTrace } from './judge-deck';
import { applyGeometryFixes } from './geometry-fixer';
import { applyTextStyleFixes } from './text-style-fixer';
import { snapshotCard, fixMadeItWorse } from './fixer-contract';
import { parseMeasure, type SourceFact } from './source-facts';
import { extractSourceFactsCached } from './source-facts-extract';

type LogFn = (stage: string, detail?: string) => void;

// Prose-number FR11 (2026-07-10): body/prose slots aren't policed by
// groundNumericFill (that only guards metric-value/delta on data layouts), so a
// writer can invent a figure in a SENTENCE ("last year's growth was 10%") on any
// layout. Flag CLAIM numbers (%, $, pts, bps, ×) in prose that appear NEITHER
// verbatim in the source NOR as an extracted fact value, and feed them to the
// revise loop so the writer rewrites without them. Conservative (verbatim OR
// fact-value = grounded) to avoid over-revising on format variants; skips
// metric-value/delta blocks (already policed) and bare integers/years.
const CLAIM_NUM = /\$\s?\d[\d,]*\.?\d*|\d[\d,]*\.?\d*\s?(?:%|pts?|points?|bps|×)/gi;
export function findFabricatedNumbers(card: Card, source: string, facts: SourceFact[]): string[] {
  const srcNorm = source.toLowerCase().replace(/,/g, '');
  const out = new Set<string>();
  for (const b of card.freeform ?? []) {
    if ((b as { type?: string }).type !== 'text') continue;
    if (/metric-value|delta/.test(String((b as { id?: string }).id ?? ''))) continue;
    const content = String((b as { content?: string }).content ?? '');
    for (const raw of content.match(CLAIM_NUM) ?? []) {
      const norm = raw.replace(/\s+/g, '').replace(/,/g, '').toLowerCase();
      if (srcNorm.includes(norm)) continue; // stated verbatim in the source
      const parsed = parseMeasure(raw);
      if (parsed && facts.some((f) => f.value === parsed.value)) continue; // value is a real fact
      out.add(raw.trim());
    }
  }
  return [...out];
}

export interface RunGatesOpts {
  /** Cards to judge. Mutated in place if any get revised. */
  cards: Card[];
  /** One-per-card layout label — passed to the VLM for its rubric selection
   *  and used as log context. Fabricated keys (e.g. `native-slide-3`) are
   *  fine; the VLM uses this as a slot name only. */
  layoutKeys: string[];
  /** TemplateTheme the judge renders slides against. */
  theme: TemplateTheme;
  /** Server origin so headless render can reach `/internal/slide-render`. */
  baseUrl: string;
  /** Per-slide rebuilder — the caller re-runs its own fill + build + fit for
   *  a slide with feedback baked in. Return the new Card; the gate mutates
   *  `cards[index]` in place. */
  rebuildSlide: (index: number, feedback: string[]) => Promise<Card>;
  /** Optional swap-layout fixer — the caller re-plans this ONE slide to a
   *  better-fitting layout (its plan agent's job) and rebuilds it. Called
   *  when the judge asks for `fill` / `swap-layout`, or when a slide fails
   *  its balance dimension (L2 — half-empty). Return `null` if no swap is
   *  possible (already tried, no candidates left, etc.); the gate then falls
   *  through to a regular rebuild. Only the native path provides this today;
   *  the Figma path leaves it undefined and the change is deferred as before. */
  swapLayout?: (index: number, judgeReason: string) => Promise<Card | null>;
  /** Optional image-reject fixer (R-3). Called when the VLM emits
   *  `change: 'reject-image'` on one or more image blocks — the model thinks
   *  the current pick is off-topic / bad quality. The caller clears its per-
   *  slot cache for those block ids and re-picks with a "pick a different
   *  visual angle" bias, then rebuilds the slide. Only the native path
   *  provides this today (structure-fill doesn't cache per-slot images). */
  imageReject?: (index: number, blockIds: string[], judgeReason: string) => Promise<Card | null>;
  /** Optional rich layout DESCRIPTION per slide — passed to the content
   *  judge's `blockTemplate` field so `layout-match` can grade against a
   *  meaningful description (e.g. "3-column narrative grid, each column =
   *  header + body block, parallel"), NOT a fabricated key like
   *  `native-slide-7` the judge can't resolve. Native path supplies the
   *  affordance from SLIDE_AFFORDANCES. Figma path can pass the layout
   *  purpose. When absent, falls back to `layoutKeys[i]` (today's behaviour). */
  blockTemplateFor?: (index: number) => string | undefined;
  /** The ONE takeaway each slide was planned to land — passed to the content
   *  judge so it verifies the slide DELIVERS that single point (not just "one
   *  idea" in the abstract). Undefined for cover/scaffold slides. */
  takeawayFor?: (index: number) => string | undefined;
  /** Deck-level context threaded into the CONTENT judge (judgeCard). */
  topic: string;
  /** Full source text (topic + attached source) — used for prose-number FR11
   *  (fabricated figures in body sentences). Falls back to topic when absent. */
  sourceText?: string;
  audience?: string;
  tone?: string;
  density?: string;
  /** Deterministic DOM-geometry gate (default ON): measures the real rendered
   *  slide (overflow / off-canvas / overlap / contrast) and unions hard failures
   *  into the revise set. Set `false` only to skip the extra render pass (e.g. a
   *  cheap smoke test). Gates stay on by default. */
  domGate?: boolean;
  /** Optional: called after every slide is judged (initial + revise pass) so
   *  the caller can stream verdicts to the client. */
  onSlideJudged?: (trace: SlideVerdictTrace) => void;
  /** Optional log function — defaults to a no-op so unit tests stay quiet. */
  log?: LogFn;
}

export interface GatesResult {
  judgedCount: number;
  judgeFailCount: number;
  revisedCount: number;
  judgeMs: number;
  reviseMs: number;
  /** Final per-slide verdict trace, keyed by index. */
  verdictByIndex: Map<number, string>;
}

/** Change-type routing tables — copied verbatim from structure-fill.ts so the
 *  revise policy is identical on both paths. */
const WRITER_CHANGES = new Set(['shorten']);
const EDITORIAL_CHANGES = new Set(['fill', 'swap-layout']);
const DEFERRED_GEOMETRY = new Set<string>(); // R-5/R-6: rebalance + move + restructure-focal now handled in applyGeometryFixes
const IMAGE_CHANGES = new Set(['reject-image']); // R-3: image-pick replacement
const TEXT_STYLE_CHANGES = new Set(['recolor', 'restyle', 'align']); // R-4/R-9/R-10

const MAX_REVISE_PASSES = 1;

/** Run the full judge stage: VLM per-slide verdict, content judge (dormant
 *  today per HANDOVER 2026-06-26 comment, but wired), then one capped revise
 *  pass on hard-fails. Non-fatal — any internal error is swallowed and the
 *  cards ship as-built. */
export async function runJudgeAndReviseStage(opts: RunGatesOpts): Promise<GatesResult> {
  const log: LogFn = opts.log ?? (() => {});
  const result: GatesResult = {
    judgedCount: 0,
    judgeFailCount: 0,
    revisedCount: 0,
    judgeMs: 0,
    reviseMs: 0,
    verdictByIndex: new Map(),
  };
  const { cards, layoutKeys, theme, baseUrl, onSlideJudged } = opts;

  const fmtVerdict = (t: { ran?: boolean; passed?: boolean; fails?: string[] }) =>
    !t.ran ? 'ERR' : t.passed ? 'PASS' : `FAIL[${(t.fails ?? []).join(',')}]`;

  try {
    // ── VLM JUDGE ─────────────────────────────────────────────────────────
    const { judgeDeck } = await import('./judge-deck');
    log('judge-start', `${cards.length} slides`);
    const judgeStart = Date.now();
    const trace = await judgeDeck(cards, theme, layoutKeys, baseUrl, { includePng: false });
    result.judgeMs = Date.now() - judgeStart;
    for (const t of trace) {
      onSlideJudged?.(t);
      result.verdictByIndex.set(t.index, fmtVerdict(t));
    }
    result.judgedCount = trace.filter((t) => t.ran).length;
    // VLM is ADVISORY (2026-07-10). Its taste verdict (premium C7/L6, composition
    // C1/L2) is too noisy to hard-gate on a single call — a live spot-check showed
    // the SAME real slide swinging PASS↔FAIL and overall 3↔5 run-to-run. So a bare
    // VLM fail (low overall / taste criterion) no longer gates a slide by itself:
    // only slides carrying an ACTIONABLE directive — a concrete element+change a
    // fixer can act on (shorten/shrink/remove/recolor/restyle/align/swap-layout/
    // reject-image) — enter the revise set. Taste-only fails are logged as
    // telemetry and SHIP as-built. The deterministic geometry + content gates are
    // the hard bar (docs/architecture/design-standard.md). Contrast-over-image is
    // preserved: an L5 fail emits a `recolor` directive, so it stays actionable.
    const vlmFailed = trace.filter((t) => t.ran && !t.passed);
    let failed = vlmFailed.filter((t) => (t.directives ?? []).length > 0);
    const advisoryOnly = vlmFailed.length - failed.length;
    result.judgeFailCount = failed.length;
    log('judge-done', `${result.judgedCount}/${cards.length} judged · ${vlmFailed.length} VLM-fail → ${failed.length} actionable, ${advisoryOnly} advisory-only (shipped)`);

    // ── CONTENT JUDGE (text-only, in parallel — hides behind VLM time) ────
    // Adds slides the VLM PASSED but content-judge flags into the revise set,
    // so writing problems the image-judge misses still get fixed.
    const contentIssues = new Map<number, string[]>();
    try {
      const { judgeCard } = await import('./judge');
      const { checkCardQuality } = await import('./enforce');
      const toContentInput = (card: Card, i: number) => {
        const blocks: { type: 'heading' | 'paragraph'; level?: number; content: string }[] = [];
        let title = '';
        for (const b of card.freeform ?? []) {
          if (b.type !== 'text') continue;
          const content = (b.content ?? '').trim();
          if (!content) continue;
          if (b.variant === 'heading') {
            if (!title) title = content;
            blocks.push({ type: 'heading', level: 2, content });
          } else {
            blocks.push({ type: 'paragraph', content });
          }
        }
        return {
          title,
          blocks: blocks as unknown as import('./judge').JudgeCardInput['blocks'],
          layout: layoutKeys[i],
          // Prefer the rich affordance description so `layout-match` grades
          // against something the judge can actually resolve, not a fabricated
          // `native-slide-N` key. Fall back to the short key when a caller
          // didn't provide the descriptor (Figma path today).
          blockTemplate: opts.blockTemplateFor?.(i) ?? layoutKeys[i],
          takeaway: opts.takeawayFor?.(i),
          topic: opts.topic,
          audience: opts.audience,
          tone: opts.tone,
          density: String(opts.density ?? 'detailed'),
        };
      };
      // Prose-number FR11: the fact store (cached — the fill pass already
      // extracted it for this source, so this is a free cache hit) can flag
      // fabricated figures buried in body sentences, which groundNumericFill
      // (metric-value/delta slots only) can't see. Fail-open to [].
      const factSource = `${opts.topic}\n${opts.sourceText ?? ''}`;
      let factStore: SourceFact[] = [];
      try { factStore = (await extractSourceFactsCached(factSource)).facts; } catch { /* fail-open */ }
      await Promise.all(cards.map(async (card, i) => {
        const input = toContentInput(card, i);
        let det: string[] = [];
        try { det = checkCardQuality(input.blocks, { bodyMaxWords: 9999 }, {}).issues; } catch { /* fail-open */ }
        let llm: string[] = [];
        try { const v = await judgeCard(input); if (!v.pass) llm = v.issues; } catch { /* fail-open */ }
        const fab = findFabricatedNumbers(card, factSource, factStore);
        const fabIssue = fab.length
          ? [`These figures do not appear in the source and look fabricated — rewrite this slide using ONLY figures the source provides (or describe the change in words, with no number): ${fab.join(', ')}`]
          : [];
        const all = [...det, ...llm, ...fabIssue];
        if (all.length) contentIssues.set(i, all);
        log('content-judge', `slide ${i}: ${all.length ? `${all.length} issue(s) (det:${det.length} fab:${fab.length}) — ${all.join(' | ')}` : 'pass'}`);
      }));
    } catch (e) {
      log('content-judge-error', e instanceof Error ? e.message : String(e));
    }
    // Merge content-only fails into the revise set — union by slide index.
    const failedIdx = new Set(failed.map((f) => f.index));
    for (const i of contentIssues.keys()) {
      const t = trace[i];
      if (t && !failedIdx.has(i)) { failed.push(t); failedIdx.add(i); }
    }
    result.judgeFailCount = failed.length;
    log('content-judge-done', `${contentIssues.size} content fail(s); revise set now ${failed.length}`);

    // ── DOM-GEOMETRY GATE (deterministic, on the REAL rendered DOM) ────────
    // Measures the ACTUAL rendered slide (overflow / off-canvas / overlap /
    // contrast) — catches what the data-MODEL geometry check can't see: real
    // wrapped-text overflow and computed (CSS-var-resolved) colors. HARD failures
    // union into the revise set; their deterministic prose `fix` routes to the
    // writer via contentIssues (the same whole-slide path the content judge uses).
    // Advisory checks (ink-density / font-size) log only. Non-fatal: a gate/render
    // error can't break a deck (a null report = that slide is skipped, fail-safe).
    // NOTE: own render pass today — sharing the VLM judge's render is a perf
    // follow-up; and overflow is the cleanly writer-fixable case (contrast /
    // off-canvas are surfaced but want dedicated fixers, also a follow-up).
    if (opts.domGate !== false) {
      try {
        const { measureDeckDomGeometry } = await import('./render-card');
        const reports = await measureDeckDomGeometry(cards, theme, { baseUrl });
        let domFailSlides = 0;
        reports.forEach((report, i) => {
          if (!report || report.pass) return; // render-null or clean → skip
          const hard = report.failures.filter((fl) => fl.severity === 'hard');
          if (!hard.length) return;
          domFailSlides += 1;
          const fixes = hard.map((fl) => fl.fix);
          contentIssues.set(i, [...(contentIssues.get(i) ?? []), ...fixes]);
          const t = trace[i];
          if (t && !failedIdx.has(i)) { failed.push(t); failedIdx.add(i); }
          log('dom-gate', `slide ${i}: ${hard.map((h) => h.check).join(', ')} — ${fixes.join(' | ')}`);
        });
        result.judgeFailCount = failed.length;
        log('dom-gate-done', `${domFailSlides} slide(s) with hard DOM-geometry fail(s); revise set now ${failed.length}`);
      } catch (e) {
        log('dom-gate-error', e instanceof Error ? e.message : String(e));
      }
    }

    // ── REVISE ROUTER + LOOP ──────────────────────────────────────────────
    const writerFeedbackFor = (f: (typeof failed)[number]): string[] => {
      const writer: string[] = [];
      const editorial: string[] = [];
      const geometry: string[] = [];
      for (const d of f.directives ?? []) {
        if (WRITER_CHANGES.has(d.change)) writer.push(`Shorten the "${d.element}" text — ${d.reason}`);
        else if (EDITORIAL_CHANGES.has(d.change)) editorial.push(`${d.element}→${d.change}`);
        else if (DEFERRED_GEOMETRY.has(d.change)) geometry.push(`${d.element}→${d.change}`);
        // IMAGE_CHANGES handled directly in the routing loop below, not via
        // writer feedback — the image picker replaces the src without any
        // writer or geometry work.
      }
      if (editorial.length) log('revise-defer', `slide ${f.index} editorial: [${editorial.join(', ')}]`);
      if (geometry.length) log('revise-defer', `slide ${f.index} geometry: [${geometry.join(', ')}]`);
      const wholeSlide = (f.reasons ?? []).filter((r) => !/→/.test(r) && !/^GEOM:/.test(r));
      const content = contentIssues.get(f.index) ?? [];
      return [...writer, ...wholeSlide, ...content];
    };

    const reviseStart = Date.now();
    for (let pass = 0; pass < MAX_REVISE_PASSES && failed.length > 0; pass += 1) {
      const touched = await Promise.all(
        failed.map(async (f) => {
          // 1) SWAP-LAYOUT — if the judge asked for `fill`/`swap-layout`, OR
          //    the slide failed balance (L2, half-empty), and the caller
          //    provided a swapLayout callback, try that FIRST. It reassigns
          //    the slide to a better-fitting layout via the plan agent.
          //    Falls through to writer/geometry fixes if swap returns null
          //    or errors.
          const editorialDirectives = (f.directives ?? []).filter((d) => EDITORIAL_CHANGES.has(d.change));
          const imageDirectives = (f.directives ?? []).filter((d) => IMAGE_CHANGES.has(d.change));
          const failedBalance = (f.fails ?? []).some((k) => /^L2/i.test(k)) || (f.fails ?? []).includes('balance');
          const wantSwap = editorialDirectives.length > 0 || failedBalance;
          let did = false;
          // Fixer contract: snapshot BEFORE any mutation so a fix that empties the
          // slide or adds new blockers can be reverted (verify-result at the end).
          const snapshot = snapshotCard(cards[f.index]);
          if (wantSwap && opts.swapLayout) {
            const reason = editorialDirectives.length
              ? editorialDirectives.map((d) => `${d.element}→${d.change}`).join(', ')
              : 'balance/L2 (half-empty)';
            try {
              const swapped = await opts.swapLayout(f.index, reason);
              if (swapped) {
                cards[f.index] = swapped;
                did = true;
                log('swap-layout', `slide ${f.index}: swapped (${reason})`);
              } else {
                log('swap-skip', `slide ${f.index}: swapLayout returned null (${reason})`);
              }
            } catch (e) {
              log('swap-error', `slide ${f.index}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          // 1.5) IMAGE-REJECT (R-3) — only if swap-layout didn't already fire.
          //      A swap rebuilds the slide from scratch and re-picks images,
          //      so image-reject on top would be redundant. When there was no
          //      swap, image-reject clears the cached pick(s) for the named
          //      block(s) and rebuilds the slide with the picker biased toward
          //      a different visual angle.
          if (!did && imageDirectives.length && opts.imageReject) {
            const blockIds = imageDirectives
              .map((d) => d.element)
              .filter((s): s is string => typeof s === 'string' && s.length > 0);
            const reason = imageDirectives.map((d) => `${d.element}→${d.change}: ${d.reason}`).join(' · ');
            try {
              const replaced = await opts.imageReject(f.index, blockIds, reason);
              if (replaced) {
                cards[f.index] = replaced;
                did = true;
                log('image-reject', `slide ${f.index}: replaced ${blockIds.length} image(s) [${blockIds.join(', ')}]`);
              } else {
                log('image-reject-skip', `slide ${f.index}: imageReject returned null`);
              }
            } catch (e) {
              log('image-reject-error', `slide ${f.index}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          // 2) WRITER REBUILD — only if the swap didn't already happen. A
          //    swap already re-fills the slide from scratch, so re-rewording
          //    on top of it would double-work and lose the swap benefit.
          const feedback = writerFeedbackFor(f);
          if (!did && feedback.length) {
            try {
              cards[f.index] = await opts.rebuildSlide(f.index, feedback);
              did = true;
            } catch (e) {
              log('rebuild-error', `slide ${f.index}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          // 3) GEOMETRY FIXES — cheap direct edits (shrink / remove empty).
          //    Safe to apply after a swap or rebuild.
          try {
            if (applyGeometryFixes(cards[f.index], f.directives ?? [])) {
              did = true;
              const g = (f.directives ?? [])
                .filter((d) => ['shrink', 'remove', 'restructure-focal', 'rebalance', 'move'].includes(d.change))
                .map((d) => `${d.element}→${d.change}`);
              log('geom-fix', `slide ${f.index}: ${g.join(', ')}`);
            }
          } catch (e) {
            // Fail-safe: a throwing sync fixer must not brick the loop.
            log('geom-fix-error', `slide ${f.index}: ${e instanceof Error ? e.message : String(e)}`);
          }
          // 4) TEXT-STYLE FIXES (R-4/R-9/R-10) — recolor / restyle / align.
          //    Pure `style.*` edits; no geometry work, no rebuild. Safe to
          //    apply after any of the above.
          try {
            if (applyTextStyleFixes(cards[f.index], f.directives ?? [])) {
              did = true;
              const s = (f.directives ?? []).filter((d) => TEXT_STYLE_CHANGES.has(d.change)).map((d) => `${d.element}→${d.change}`);
              log('text-style-fix', `slide ${f.index}: ${s.join(', ')}`);
            }
          } catch (e) {
            log('text-style-error', `slide ${f.index}: ${e instanceof Error ? e.message : String(e)}`);
          }
          // Fixer contract: VERIFY the result. If any fix above emptied the slide
          // or added NEW geometry blockers (overlap / clip / empty / off-edge),
          // REVERT to the pre-fix snapshot — a fix must never ship a slide worse
          // than the one it set out to repair (the bee531e lesson).
          if (did) {
            const worse = fixMadeItWorse(snapshot, cards[f.index], theme);
            if (worse) {
              cards[f.index] = snapshot;
              did = false;
              log('fix-reverted', `slide ${f.index}: reverted — ${worse}`);
            }
          }
          if (!did) log('revise-skip', `slide ${f.index}: nothing actionable (all deferred)`);
          return did ? f.index : -1;
        }),
      );
      const idxs = touched.filter((i) => i >= 0);
      if (idxs.length === 0) break;
      result.revisedCount += idxs.length;
      log('revise-start', `pass ${pass + 1}: ${idxs.length} slide(s) [${idxs.join(', ')}]`);
      const reTrace = await judgeDeck(
        idxs.map((i) => cards[i]),
        theme,
        idxs.map((i) => layoutKeys[i]),
        baseUrl,
        { includePng: false },
      );
      // judgeDeck indexes 0..n-1 for the subset — remap.
      const remapped = reTrace.map((rt, k) => ({ ...rt, index: idxs[k] }));
      for (const rt of remapped) {
        onSlideJudged?.(rt);
        result.verdictByIndex.set(rt.index, fmtVerdict(rt));
      }
      failed = remapped.filter((rt) => rt.ran && !rt.passed);
      // RE-VERIFY DOM geometry on the touched slides. The VLM re-judge above is
      // taste-only and can PASS a slide whose geometry defect (off-canvas / overlap
      // / overflow) the writer couldn't resolve — so without this, the loop reports
      // "now pass" while a real defect still ships. Any slide with a persistent HARD
      // geometry fail is kept in the failed set (flagged, not silently passed).
      // Renders only the TOUCHED slides.
      if (opts.domGate !== false && idxs.length) {
        try {
          const { measureDeckDomGeometry } = await import('./render-card');
          const reReports = await measureDeckDomGeometry(idxs.map((i) => cards[i]), theme, { baseUrl });
          const stillFailed = new Set(failed.map((f) => f.index));
          reReports.forEach((report, k) => {
            if (!report || report.pass) return;
            const hard = report.failures.filter((fl) => fl.severity === 'hard');
            if (!hard.length) return;
            const slideIdx = idxs[k];
            const checks = hard.map((fl) => fl.check).join(',');
            if (!stillFailed.has(slideIdx)) {
              const t = remapped.find((rt) => rt.index === slideIdx);
              if (t) { failed.push({ ...t, passed: false }); stillFailed.add(slideIdx); }
            }
            result.verdictByIndex.set(slideIdx, `FAIL[GEOM:${checks}]`);
            log('dom-gate-persist', `slide ${slideIdx}: geometry still failing after revise (${checks}) — flagged, not silently passed`);
          });
        } catch (e) {
          log('dom-gate-reverify-error', e instanceof Error ? e.message : String(e));
        }
      }
      result.judgeFailCount = failed.length;
      const nowPass = idxs.filter((i) => !failed.some((f) => f.index === i)).length;
      log('revise-done', `pass ${pass + 1}: ${nowPass}/${idxs.length} now pass · ${failed.length} still failing`);
    }
    result.reviseMs = result.revisedCount > 0 ? Date.now() - reviseStart : 0;
  } catch (err) {
    log('judge-error', err instanceof Error ? err.message : String(err));
  }
  return result;
}
