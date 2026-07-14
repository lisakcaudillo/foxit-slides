/**
 * dom-geometry.ts — DETERMINISTIC visual gate over the REAL rendered DOM.
 *
 * Extends what `renderAndMeasureCard` already reads (overflow + out-of-bounds)
 * with the rest of the geometric visual check: coverage ("ink" comfort band),
 * pairwise overlap, contrast (WCAG), and font-size — measured from the actual
 * headless-Chromium render, not a model estimate. Ports the math from Document
 * Studio's `slide-checks.js` (coverage/overlap) and fixes DS's known weaknesses
 * (cramping → comfort band; browser-only → runs server-side here).
 *
 * Split by design:
 *   - `extractDomGeometryInBrowser()` runs INSIDE the page (page.evaluate) — it
 *     is self-contained (no imports) so puppeteer can serialize it, and returns
 *     RAW numbers only.
 *   - the check functions + `runDomGeometryGate()` are PURE Node code over that
 *     raw data — unit-testable with synthetic geometry, no browser needed.
 *
 * Every failure carries a DETERMINISTIC fix instruction (what to do, on which
 * block), so the gate can drive a deterministic fixer with no LLM.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** Raw per-block geometry read from the live DOM. All px, rect relative to the
 *  slide root. `bgComplex` = the background is an image/gradient, so contrast is
 *  undecidable (skip it) — mirrors checkContrast's image/gradient skip. */
export interface RawBlock {
  id: string;
  text: string;
  x: number; y: number; w: number; h: number;
  scrollH: number; clientH: number;
  scrollW: number; clientW: number;
  fontPx: number;
  color: [number, number, number] | null;
  bg: [number, number, number] | null;
  bgComplex: boolean;
}
export interface RawSlideGeometry {
  slideW: number;
  slideH: number;
  blocks: RawBlock[];
}

/** Tunable thresholds. Defaults from DS + the taste-score spec; per-density and
 * the exact font/word minimums are open decisions (kept parameterized). */
export interface GeometryThresholds {
  // NOTE on "ink": Foxit Slides freeform blocks are CONTENT-SIZED (the box hugs the
  // text → scrollH == clientH), so per-block "coverage vs own box" is always ~1.0
  // and useless here (unlike DS's fixed-height slots). "Ink" is therefore a
  // SLIDE-LEVEL density: Σ block areas ÷ slide area. Advisory only until calibrated.
  inkDensityFloor: number;   // slide density below this → likely too sparse (ADVISORY)
  overlapTolPx: number;      // AABB intersection over this on BOTH axes → overlap
  overflowTolPx: number;     // scroll − client over this → clipping (a constrained box)
  offCanvasTolPx: number;    // rect outside slide by more than this → off-canvas
  contrastBody: number;      // WCAG AA normal text
  contrastLarge: number;     // WCAG AA large text (≥ largePx)
  largePx: number;           // font size at/above which "large text" contrast applies
  fontMinPx: number; // below → too small (ADVISORY until fixes the number)
}

export const DEFAULT_THRESHOLDS: GeometryThresholds = {
  inkDensityFloor: 0.10, // conservative near-empty flag; calibrate against labels.
  overlapTolPx: 2,
  overflowTolPx: 8,
  offCanvasTolPx: 2,
  contrastBody: 4.5,
  contrastLarge: 3.0,
  largePx: 24,
  fontMinPx: 12, // conservative (Foxit Slides text-fit floor). Spec suggests 18 — call.
};

export type GeometryCheck =
  | 'ink-density' | 'overlap' | 'overflow'
  | 'off-canvas' | 'contrast' | 'font-size';

export interface GeometryFailure {
  check: GeometryCheck;
  /** Whether this hard-gates (must fix) or is advisory (log, don't block). */
  severity: 'hard' | 'advisory';
  target: string;         // block id or text snippet
  measured: string;       // the measured value
  threshold: string;      // the bar it missed
  fix: string;            // deterministic fix instruction
}
export interface GeometryReport {
  pass: boolean;          // no HARD failures
  failures: GeometryFailure[];
  blockCount: number;
  inkDensity: number;     // Σ block areas ÷ slide area (reported for calibration)
}

// ── The browser-side extractor (self-contained; runs in page.evaluate) ────────

/** Returns the raw geometry of one slide root. MUST be self-contained (no outer
 *  refs) — puppeteer serializes it by .toString(). `rootSel` selects the slide. */
export function extractDomGeometryInBrowser(rootSel: string): RawSlideGeometry {
  const root = document.querySelector(rootSel) as HTMLElement | null;
  if (!root) return { slideW: 0, slideH: 0, blocks: [] };
  const R = root.getBoundingClientRect();

  const parseRgb = (s: string): [number, number, number] | null => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((v) => parseFloat(v));
    if (p.length >= 4 && p[3] === 0) return null; // transparent
    return [p[0], p[1], p[2]];
  };
  // Nearest ancestor solid background; note if any ancestor paints an image/gradient.
  const effectiveBg = (el: HTMLElement): { bg: [number, number, number] | null; complex: boolean } => {
    let node: HTMLElement | null = el;
    let complex = false;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') complex = true;
      const bg = parseRgb(cs.backgroundColor);
      if (bg) return { bg, complex };
      node = node.parentElement;
    }
    return { bg: null, complex };
  };

  const leaves = Array.from(root.querySelectorAll('*')).filter(
    (el) => (el.textContent || '').trim().length > 0 && el.children.length === 0,
  ) as HTMLElement[];

  const blocks: RawBlock[] = leaves.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const { bg, complex } = effectiveBg(el);
    return {
      id: el.id || '',
      text: (el.textContent || '').trim().slice(0, 40),
      x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height,
      scrollH: el.scrollHeight, clientH: el.clientHeight,
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      fontPx: parseFloat(cs.fontSize) || 0,
      color: parseRgb(cs.color),
      bg, bgComplex: complex,
    };
  });
  return { slideW: R.width, slideH: R.height, blocks };
}

// ── Pure checks (Node side) ───────────────────────────────────────────────────

const rel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const L = (c: [number, number, number]) => 0.2126 * rel(c[0]) + 0.7152 * rel(c[1]) + 0.0722 * rel(c[2]);
  const l1 = L(fg), l2 = L(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Run every geometry check over one slide's raw blocks → a report with
 *  deterministic fix instructions. `pass` = no HARD failures. */
export function runDomGeometryGate(
  g: RawSlideGeometry,
  thresholds: Partial<GeometryThresholds> = {},
): GeometryReport {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const f: GeometryFailure[] = [];
  const label = (b: RawBlock) => b.id || `"${b.text}"`;

  for (const b of g.blocks) {
    // overflow — a block whose text spills its (constrained) box, vertically or
    // horizontally. Content-sized blocks read scroll==client (no false positive);
    // this fires only on a box that actually clips. (Same check renderAndMeasureCard uses.)
    const ovh = b.scrollH - b.clientH;
    const ovw = b.scrollW - b.clientW;
    if (ovh > t.overflowTolPx || ovw > t.overflowTolPx) {
      const px = Math.max(ovh, ovw);
      f.push({
        check: 'overflow', severity: 'hard', target: label(b),
        measured: `overflows by ${Math.round(px)}px`, threshold: `≤ ${t.overflowTolPx}px`,
        fix: `${label(b)} overflows its box by ${Math.round(px)}px (clips / collides with neighbours) — shorten the text or reduce font size.`,
      });
    }
    // off-canvas
    if (b.x < -t.offCanvasTolPx || b.y < -t.offCanvasTolPx
      || b.x + b.w > g.slideW + t.offCanvasTolPx || b.y + b.h > g.slideH + t.offCanvasTolPx) {
      f.push({
        check: 'off-canvas', severity: 'hard', target: label(b),
        measured: `rect [${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}]`,
        threshold: `within ${g.slideW}×${g.slideH}`,
        fix: `${label(b)} runs off the slide edge — reflow it inward to the safe area.`,
      });
    }
    // font size (ADVISORY until fixes the minimum)
    if (b.fontPx > 0 && b.fontPx < t.fontMinPx) {
      f.push({
        check: 'font-size', severity: 'advisory', target: label(b),
        measured: `${round2(b.fontPx)}px`, threshold: `≥ ${t.fontMinPx}px`,
        fix: `${label(b)} font is ${round2(b.fontPx)}px (below ${t.fontMinPx}px) — increase to the minimum or shorten the text so it fits larger.`,
      });
    }
    // contrast (skip when the background is an image/gradient — undecidable)
    if (b.color && b.bg && !b.bgComplex) {
      const cr = contrastRatio(b.color, b.bg);
      const large = b.fontPx >= t.largePx;
      const bar = large ? t.contrastLarge : t.contrastBody;
      if (cr < bar) {
        f.push({
          check: 'contrast', severity: 'hard', target: label(b),
          measured: `${round2(cr)}:1`, threshold: `≥ ${bar}:1${large ? ' (large)' : ''}`,
          fix: `${label(b)} contrast ${round2(cr)}:1 is below ${bar}:1 — darken/lighten the text or adjust its background to pass WCAG AA.`,
        });
      }
    }
  }

  // overlap — pairwise AABB, >tol on BOTH axes. Text leaves only (images/deco
  // carry no text so they're already excluded). Skip nested/near-duplicate rects.
  const bs = g.blocks;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > t.overlapTolPx && dy > t.overlapTolPx) {
        // ignore if one fully contains the other (nesting artifact)
        const aInB = a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
        const bInA = b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
        if (aInB || bInA) continue;
        f.push({
          check: 'overlap', severity: 'hard', target: `${label(a)} ∩ ${label(b)}`,
          measured: `${Math.round(dx)}×${Math.round(dy)}px`, threshold: `≤ ${t.overlapTolPx}px`,
          fix: `${label(a)} and ${label(b)} overlap by ${Math.round(dx)}×${Math.round(dy)}px — move one apart or shrink the taller/wider one.`,
        });
      }
    }
  }

  // slide-level ink density — Σ block areas ÷ slide area (advisory; the per-block
  // "coverage vs own box" is useless here because Foxit Slides blocks are content-sized).
  const slideArea = Math.max(1, g.slideW * g.slideH);
  const inked = g.blocks.reduce((s, b) => s + Math.max(0, b.w) * Math.max(0, b.h), 0);
  const inkDensity = round2(inked / slideArea);
  if (inkDensity < t.inkDensityFloor) {
    f.push({
      check: 'ink-density', severity: 'advisory', target: 'slide',
      measured: `density ${inkDensity}`, threshold: `≥ ${t.inkDensityFloor}`,
      fix: `Slide looks near-empty (content covers ${Math.round(inkDensity * 100)}% of the frame). Add grounded content or use a smaller layout — never filler. (Advisory: band needs calibration.)`,
    });
  }

  return { pass: !f.some((x) => x.severity === 'hard'), failures: f, blockCount: g.blocks.length, inkDensity };
}
