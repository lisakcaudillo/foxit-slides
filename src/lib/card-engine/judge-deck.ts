/**
 * Deck-level visual judge — fires the VLM judge on EVERY slide of a deck and
 * returns a per-slide verdict trace. This is the "prove it ran" artifact: each
 * entry records whether the judge actually executed, the score, and the failing
 * criteria — so a pass is never silent and a fail is loud + inspectable.
 *
 * Renders each card server-side (headless SlideStage) → judges the PNG against
 * the matching rubric (judgeSlideImage). Sequential to avoid hammering the
 * single headless browser + the vision API. Fail-LOUD: every slide logs its
 * verdict; a render/judge error is recorded on the trace (not swallowed).
 */
import { renderDeckToPngs, type RenderResult } from './render-card';
import { judgeSlideImage, type SlideType } from './vlm-judge';
import { buildSlideManifest } from './slide-manifest';
import { checkOverlap, checkContrast, checkEmptyShape } from './deterministic-checks';
import type { Card, TemplateTheme } from '@/types/card-template';

const FRAME_W = 960;
const FRAME_H = 540;

/** DETERMINISTIC geometry gate — computed from the card's own freeform geometry
 *  (no render guesswork). The vision model is unreliable at seeing precise
 *  overlaps; this catches the structural cause directly: a text block whose font
 *  is taller than its box WILL spill below and collide with the element beneath
 *  it (the size-200-number-on-its-label bug), and any block that extends past
 *  the slide edge is clipped. Returns human-readable defect strings. */
export function analyzeCardGeometry(card: Card, theme?: TemplateTheme): string[] {
  const issues: string[] = [];
  const ff = card.freeform ?? [];
  for (const b of ff) {
    if (b.type !== 'text') continue;
    const text = (b.content ?? '').trim();
    if (text.length <= 2) continue; // skip single-glyph marks (→, ")
    const fontSize = (b as { style?: { fontSize?: number; lineHeight?: number } }).style?.fontSize;
    if (!fontSize) continue;
    const lineHeight = (b as { style?: { lineHeight?: number } }).style?.lineHeight ?? 1.15;
    const boxHpx = (b.h / 100) * FRAME_H;
    const oneLine = fontSize * lineHeight;
    // A single line taller than the whole box ⇒ the glyphs overflow downward
    // onto whatever sits below (collision). Multi-line bodies are fine: their
    // box is sized for N lines, so one line is always < box height.
    if (oneLine > boxHpx + 6) {
      issues.push(`"${text.slice(0, 28)}" (font ${Math.round(fontSize)}px) overflows its ${Math.round(boxHpx)}px box and collides with the element below`);
    }
    // Out of bounds (top/left/bottom edges; right is content-sized so skip).
    const topPct = b.y;
    const bottomPct = b.y + b.h;
    if (topPct < -0.5 || bottomPct > 100.5 || b.x < -0.5) {
      issues.push(`"${text.slice(0, 28)}" runs off the slide edge`);
    }
  }
  // Deterministic overlap + empty-shape + contrast (conservative;
  // deterministic-checks.ts). These are the code-owned versions of the VLM's
  // clean-composition + legibility (L5/L7/C5/C8). Empty-shape closes the last
  // clean-composition gap so the VLM's L7/C8 can be trimmed to taste.
  issues.push(...checkOverlap(card));
  issues.push(...checkEmptyShape(card));
  if (theme) issues.push(...checkContrast(card, theme));
  return issues;
}

/** Map a structure layout key → the rubric slide type. */
export function layoutToSlideType(layoutKey: string): SlideType {
  const m: Record<string, SlideType> = {
    '01-cover': 'cover',
    '02-stat': 'stat',
    '03-comparison': 'comparison',
    '04-process': 'process',
    '05-content': 'content',
    '06-quote': 'quote',
    '07-timeline': 'content',
    '08-divider': 'divider',
    '09-closing': 'closing',
    '10-agenda': 'agenda',
    '11-infographic': 'content',
    '12-diagram': 'content',
  };
  return m[layoutKey] ?? 'content';
}

export interface SlideVerdictTrace {
  index: number;
  layoutKey: string;
  slideType: SlideType;
  /** Did the judge actually execute on a rendered image? (false ⇒ see error) */
  ran: boolean;
  passed?: boolean;
  overall?: number;
  fails?: string[];
  reasons?: string[];
  /** Element-addressed fix directives from the VLM (failing criteria that named a
   *  role + change). The revise loop routes these by change-type: shorten → the
   *  writer; fill/swap-layout → editorial (deferred); shrink/rebalance/remove →
   *  deterministic geometry (deferred, gated on the overlap check). */
  directives?: { id: string; element: string; change: string; reason: string }[];
  error?: string;
  /** base64 PNG of the rendered slide the judge saw (proof artifact). */
  pngBase64?: string;
}

/**
 * Judge every slide. `baseUrl` is this server's origin (so the headless render
 * can reach /internal/slide-render). `layoutKeys[i]` selects each slide's rubric.
 */
export async function judgeDeck(
  cards: Card[],
  theme: TemplateTheme,
  layoutKeys: string[],
  baseUrl: string,
  opts: { includePng?: boolean } = {},
): Promise<SlideVerdictTrace[]> {
  // Results written by index so order is stable even though the parallel vision
  // calls finish out of order.
  const trace: SlideVerdictTrace[] = new Array(cards.length);

  // Judge a PRE-RENDERED slide: the geometry gate result is already computed, and
  // the PNG is already drawn. This part is ONLY the vision call + verdict assembly,
  // and it is the part that runs in PARALLEL (vision calls have no local cost and
  // no rate-limit contention, so firing all of them at once is free).
  const judgeRendered = async (
    i: number,
    png: { base64: string } | null,
    geomReasons: string[],
  ): Promise<void> => {
    const layoutKey = layoutKeys[i] ?? '';
    const slideType = layoutToSlideType(layoutKey);
    let t: SlideVerdictTrace = { index: i, layoutKey, slideType, ran: false };
    try {
      if (!png) {
        t.error = 'render-to-PNG returned null';
      } else {
        // Role manifest → element-addressed verdicts: the judge names which role
        // each failing criterion is about + the change that fixes it.
        const manifest = buildSlideManifest(cards[i]);
        const judged = await judgeSlideImage(png.base64, slideType, {
          manifest: manifest.text || undefined,
          roles: manifest.roles,
        });
        if ('error' in judged) {
          // Even if vision errored, surface geometry defects (don't lose them).
          t = { ...t, ran: geomReasons.length > 0, passed: geomReasons.length === 0, error: judged.error, reasons: geomReasons, fails: geomReasons.length ? ['GEOM'] : [] };
        } else {
          const v = judged.verdict;
          const passed = v.passed && geomReasons.length === 0;
          t = {
            ...t,
            ran: true,
            passed,
            overall: v.overall,
            fails: [...v.fails, ...(geomReasons.length ? ['GEOM'] : [])],
            reasons: [
              ...geomReasons,
              ...v.criteria
                .filter((c) => !c.pass)
                .map((c) => `${c.id}${c.element ? ` (${c.element}→${c.change ?? '?'})` : ''}: ${c.reason}`),
            ],
            directives: v.criteria
              .filter((c) => !c.pass && c.element && c.change)
              .map((c) => ({ id: c.id, element: c.element as string, change: c.change as string, reason: c.reason })),
            ...(opts.includePng ? { pngBase64: png.base64 } : {}),
          };
          // Proof line: which elements the judge addressed + the fix it suggested.
          const addressed = v.criteria.filter((c) => !c.pass && c.element).map((c) => `${c.element}→${c.change ?? '?'}`);
          if (addressed.length) console.warn(`[judge-deck]   slide ${i} element-addressed: ${addressed.join(', ')}`);
        }
      }
    } catch (e) {
      t.error = e instanceof Error ? e.message : String(e);
    }
    const tag = t.ran ? (t.passed ? 'PASS' : 'FAIL') : `ERROR(${t.error})`;
    // Fail-LOUD: every slide's verdict is logged, never silently passed.
    console.warn(
      `[judge-deck] slide ${i} (${layoutKey}/${slideType}): ${tag}` +
        (t.overall != null ? ` overall=${t.overall}/5` : '') +
        (t.fails?.length ? ` fails=[${t.fails.join(',')}]` : ''),
    );
    trace[i] = t;
  };

  // ONE-PASS render, PARALLEL judge. Previously each slide was a separate headless
  // page-load (navigation + data-ready wait + settle), serialized because parallel
  // page-loads thrash the single-process dev server. renderDeckToPngs collapses
  // that: ONE page load draws the whole deck and each slide is screenshotted from
  // its own element — so the deck pays the navigation cost ONCE. The vision calls
  // (no local contention) still all fire in parallel and overlap.
  let pngs: (RenderResult | null)[] = cards.map(() => null);
  try {
    pngs = await renderDeckToPngs(cards, theme, { baseUrl });
  } catch {
    pngs = cards.map(() => null); // judgeRendered records the render failure per slide
  }
  const judging: Promise<void>[] = [];
  for (let i = 0; i < cards.length; i++) {
    // Deterministic geometry gate (from card data) — reliable where vision isn't.
    const geomReasons = analyzeCardGeometry(cards[i], theme).map((g) => `GEOM: ${g}`);
    judging.push(judgeRendered(i, pngs[i], geomReasons));
  }
  await Promise.all(judging);

  const ran = trace.filter((t) => t.ran).length;
  const failed = trace.filter((t) => t.ran && !t.passed).length;
  console.warn(`[judge-deck] DONE: ${ran}/${cards.length} judged, ${failed} failed (one-pass render, vision parallel)`);
  return trace;
}
