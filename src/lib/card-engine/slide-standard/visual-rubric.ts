/**
 * visual-rubric.ts — the SINGLE source for the Design critic's visual rubric.
 *
 * This used to live as an inline copy inside `vlm-judge.ts`, hand-forked from the
 * doc. That meant the VISION judge
 * graded against a copy while the TEXT judge graded against `rules.ts` RUBRIC and
 * the Designer applied `treatments.ts` — three representations of "the standard"
 * that could drift. Per PRD §2.3 ("bound by the settled"), the visual rubric now
 * lives here in `slide-standard` so the Designer, the Content judge, and the
 * Design critic all read ONE calibrated source. Calibrate it here and every
 * consumer picks it up.
 *
 * Cover slides use the fully-observed Cover rubric (C1–C7); interiors use the
 * layout rubric (L1–L6). HARD criteria fail the slide regardless of overall score.
 */

export const COVER_CRITERIA = `C1 Composition commitment — commits to ONE clear family (split editorial / photo full-bleed / texture full-bleed / typographic). FAIL = centered-everything default or a muddy mix.
C2 One dominant title — exactly one element is clearly largest, in a deliberate zone with margin. FAIL = title same size as other text, or crammed to an edge.
C3 Type-size restraint — ≤2 type sizes besides body, ≤2 font families. FAIL = 3+ competing sizes/faces.
C4 Color discipline — ≤3 hues, one a near-neutral. FAIL = 4+ unrelated colors / rainbow.
C5 Title legibility (HARD) — title clearly readable vs its background (scrim/dark zone over an image). FAIL = any dark-on-dark or light-on-light.
C6 Whitespace — a calm zone for the title; nothing collides or crowds the edge. FAIL = cramped/cluttered.
C7 Premium feel — reads "this was designed" (curved divide, editorial eyebrow, confident type, premium image). FAIL = looks like a default office template.
C8 Clean composition (HARD) — NO element overlaps, collides with, or is buried under another; NO text is clipped, cut off, or runs off the slide edge; NO empty/stranded shape (a pill, box, or badge with no text in it). FAIL = any overlap, collision, buried or clipped text, or empty floating shape — even a small one.`;

export const INTERIOR_CRITERIA = `L1 Type-appropriate layout — the layout matches the slide's type (stats show big numbers; a comparison shows parallel columns; a timeline shows a sequence). FAIL = every slide is the same heading-over-bullets stack.
L2 One focal element — a clear focal point (the big number, the heading, the diagram). FAIL = 3+ equal-weight blocks competing.
L3 Content density — scannable: short parallel bullets, no paragraph wall, no overcrowding. FAIL = wall of bullets or dense prose dump.
L4 Structural consistency — headings, accent color, margins look like one system. FAIL = each slide invents its own look.
L5 Legibility (HARD) — passes contrast, including text over any tint/image. FAIL = dark-on-dark.
L6 Premium feel — composed and intentional, not a default template. FAIL = generic filler.
L7 Clean composition (HARD) — inspect element-by-element: NO element overlaps, collides with, or is buried under another (e.g. a label sitting under a big number); NO text is clipped, cut off, or runs off the slide edge; NO empty/stranded shape (a pill, box, card, or badge that contains no text). FAIL = any overlap, collision, buried or clipped text, or empty floating shape — even a small one.`;

// ── DESIGN-ONLY rubric (2026-06-26) ─────────────────────────────────────────
// The trimmed rubric for the visual judge once the deterministic checks own the
// mechanical criteria. Removed from the VLM and reassigned:
//   L5 / C5 (contrast)          → deterministic contrast check (known colors).
//   L7 / C8 (clean composition) → the geometry gate (overflow/clip/overlap/empty).
//   L3 (content density)        → the writer + char-budget (already governs it).
// What remains is pure design taste, which is the only thing that genuinely
// needs vision. A shorter rubric on a lower-detail image is the speed lever.
export const COVER_CRITERIA_DESIGN = `C1 Composition commitment — commits to ONE clear family (split editorial / photo full-bleed / texture full-bleed / typographic). FAIL = centered-everything default or a muddy mix.
C2 One dominant title — exactly one element is clearly largest, in a deliberate zone with margin. FAIL = title same size as other text, or crammed to an edge.
C3 Type-size restraint — ≤2 type sizes besides body, ≤2 font families. FAIL = 3+ competing sizes/faces.
C4 Color discipline — ≤3 hues, one a near-neutral. FAIL = 4+ unrelated colors / rainbow.
C7 Premium feel (HARD) — reads "this was designed" (curved divide, editorial eyebrow, confident type, premium image). FAIL = looks like a default office template.`;

export const INTERIOR_CRITERIA_DESIGN = `L1 Type-appropriate layout — the layout matches the slide's type (stats show big numbers; a comparison shows parallel columns; a timeline shows a sequence). FAIL = every slide is the same heading-over-bullets stack.
L2 One focal element — a clear focal point (the big number, the heading, the diagram). FAIL = 3+ equal-weight blocks competing.
L4 Structural consistency — headings, accent color, margins look like one system. FAIL = each slide invents its own look.
L6 Premium feel (HARD) — composed and intentional, not a default template. FAIL = generic filler.`;

export const COVER_HARD_IDS_DESIGN = ['C7'] as const;
export const INTERIOR_HARD_IDS_DESIGN = ['L6'] as const;

// ── PARTIAL-TRIM rubric (2026-07-01) ────────────────────────────────────────
// The `designOnly` variant above drops BOTH contrast (C5/L5) and
// clean-composition (C8/L7), on the assumption code owns them fully. That
// assumption fails in one place: contrast OVER AN IMAGE cannot be computed
// deterministically (checkContrast intentionally skips image/gradient backgrounds
// — no pixels, no ratio). So this partial-trim variant drops clean-composition
// ONLY, and KEEPS contrast on the VLM. Empty-shape now lives in the
// deterministic gate (checkEmptyShape), so the trim closes the coverage loop
// without leaving contrast-over-image blind.
export const COVER_CRITERIA_PARTIAL = `C1 Composition commitment — commits to ONE clear family (split editorial / photo full-bleed / texture full-bleed / typographic). FAIL = centered-everything default or a muddy mix.
C2 One dominant title — exactly one element is clearly largest, in a deliberate zone with margin. FAIL = title same size as other text, or crammed to an edge.
C3 Type-size restraint — ≤2 type sizes besides body, ≤2 font families. FAIL = 3+ competing sizes/faces.
C4 Color discipline — ≤3 hues, one a near-neutral. FAIL = 4+ unrelated colors / rainbow.
C5 Title legibility (HARD) — title clearly readable vs its background (scrim/dark zone over an image). FAIL = any dark-on-dark or light-on-light.
C6 Whitespace — a calm zone for the title; nothing collides or crowds the edge. FAIL = cramped/cluttered.
C7 Premium feel — reads "this was designed" (curved divide, editorial eyebrow, confident type, premium image). FAIL = looks like a default office template.`;

export const INTERIOR_CRITERIA_PARTIAL = `L1 Type-appropriate layout — the layout matches the slide's type (stats show big numbers; a comparison shows parallel columns; a timeline shows a sequence). FAIL = every slide is the same heading-over-bullets stack.
L2 One focal element — a clear focal point (the big number, the heading, the diagram). FAIL = 3+ equal-weight blocks competing.
L3 Content density — scannable: short parallel bullets, no paragraph wall, no overcrowding. FAIL = wall of bullets or dense prose dump.
L4 Structural consistency — headings, accent color, margins look like one system. FAIL = each slide invents its own look.
L5 Legibility (HARD) — passes contrast, including text over any tint/image. FAIL = dark-on-dark.
L6 Premium feel — composed and intentional, not a default template. FAIL = generic filler.`;

// Contrast STAYS a hard criterion (it's the one thing the code can't own on
// image backgrounds); clean-composition (C8/L7) drops off the VLM entirely and
// is now the deterministic gate's job.
export const COVER_HARD_IDS_PARTIAL = ['C5', 'C7'] as const;
export const INTERIOR_HARD_IDS_PARTIAL = ['L5', 'L6'] as const;

// ── RESIDUAL rubric (2026-07-10) ────────────────────────────────────────────
// The trim for a FIXED-TEMPLATE engine, where type-size restraint (C3), colour
// discipline (C4), clean-composition (C8/L7), structural consistency (L4), and
// type-appropriate layout (L1) are owned by the theme + template + role-sizing +
// the deterministic geometry checks — so the VLM would only RE-judge them
// redundantly (and flakily). What's LEFT for the VLM is the genuinely-visual
// residual that code + construction cannot own: composition/focal gestalt
// (C1/C2/L2), contrast OVER AN IMAGE (C5/L5 — undecidable deterministically),
// and premium feel (C7/L6). See docs/architecture/design-standard mapping.
const pickLines = (block: string, ids: readonly string[]): string =>
  block.split('\n').filter((l) => ids.some((id) => l.trimStart().startsWith(id))).join('\n');
// Recalibrated 2026-07-12: the residual was OVER-failing clean, restrained
// combo slides — L2 read intentional card/section grids as "competing blocks", and
// "premium feel" (L6/C7) was a HARD auto-fail on a subjective taste call, so a
// correct informational slide hard-failed as "generic". These reframe focal as
// HIERARCHY (a deliberate grid IS organized), make premium CONTEXT-RELATIVE
// (restraint is premium; a good template is not "generic"), and DEMOTE premium out
// of HARD. Contrast (C5/L5) stays HARD (real legibility); overlap/clip/empty are
// still caught by the deterministic geometry gate.
export const COVER_CRITERIA_RESIDUAL = `C1 Composition commitment — the cover commits to ONE clear approach (split, full-bleed image, texture, or a confident typographic layout) rather than a muddy half-in-half mix. A clean typographic cover is a valid commitment. FAIL only a genuinely muddled composition.
C2 Dominant title — one element clearly leads (the title), with margin around it. FAIL only when the title carries no more weight than the surrounding text, or is crammed against an edge.
C5 Title legibility (HARD) — the title is clearly readable against its background (scrim / dark zone over an image). FAIL = dark-on-dark or light-on-light.
C7 Composition quality — composed and intentional FOR ITS PURPOSE. Premium is CONTEXT-RELATIVE: a restrained, confident, well-spaced cover IS premium — do NOT require decorative flourish, and a clean template is NOT "generic". FAIL only careless or broken composition (misaligned, erratic spacing, clashing), never restraint alone.`;
export const INTERIOR_CRITERIA_RESIDUAL = `L2 Visual hierarchy — the eye has a clear entry point and the content is organized. A deliberate card grid, metric row, table, or sectioned body is FINE — its repeating structure IS the organization, NOT "competing blocks". FAIL only a flat, undifferentiated dump with no hierarchy or entry point at all.
L5 Legibility (HARD) — text is clearly readable, including over any tint/image. FAIL = dark-on-dark or otherwise illegible.
L6 Composition quality — composed, aligned, and intentional FOR ITS PURPOSE. Premium is CONTEXT-RELATIVE: a restrained, consistent, well-spaced informational slide IS premium — do NOT require decorative flourish, and a clean template is NOT "generic". FAIL only genuinely careless composition (misalignment, erratic spacing, clashing styles, an unfinished look), never restraint alone.`;
export const COVER_HARD_IDS_RESIDUAL = ['C5'] as const;
export const INTERIOR_HARD_IDS_RESIDUAL = ['L5'] as const;

/** HARD criteria — any one failing means the slide does NOT pass, regardless of
 *  the overall score. Legibility + premium-feel are non-negotiable.
 *  Clean composition (C8/L7) added 2026-06-16 — the judge was passing slides with
 *  overlapping/buried text and empty stranded pills; this makes those a hard fail. */
export const COVER_HARD_IDS = ['C5', 'C7', 'C8'] as const;
export const INTERIOR_HARD_IDS = ['L5', 'L6', 'L7'] as const;

/** overall < this OR any HARD criterion fail ⇒ the slide does not pass.
 * Lowered 4 → 3: a clean, legible, consistent slide is "good"
 *  (a 3) and should PASS; only a genuinely broken/sloppy slide (1–2) fails. The
 *  old 4 bar demanded "impressive" on every slide, which over-failed restrained
 *  informational decks. Real defects are still caught by the HARD contrast gate +
 *  the deterministic geometry checks (overlap / clip / empty). */
export const VISUAL_PASS_THRESHOLD = 3;

/** The rubric + hard-criteria ids for a slide, by whether it's the cover.
 *
 *  Three variants, from strictest to lightest:
 *   - default (no opts): full rubric — cover C1–C8, interior L1–L7, hard
 *     includes C5/C8 and L5/L7.
 *   - `dropCleanComposition`: drops L7/C8 only. KEEPS contrast (L5/C5) on the
 *     VLM because the code can't compute contrast over an image. This is the
 *     partial trim used once checkEmptyShape closes the last clean-composition
 *     gap in the deterministic gate.
 *   - `designOnly`: drops BOTH contrast and clean-composition — taste-only.
 *     Retained for the all-or-nothing knob; do NOT default to this on
 *     image-heavy themes (would leave contrast-over-image unchecked).
 *
 *  `dropCleanComposition` wins over `designOnly` when both are set. */
export function visualRubric(
  isCover: boolean,
  optsOrDesignOnly: boolean | { designOnly?: boolean; dropCleanComposition?: boolean; residual?: boolean } = false,
): {
  criteria: string;
  hardIds: readonly string[];
} {
  const opts = typeof optsOrDesignOnly === 'boolean' ? { designOnly: optsOrDesignOnly } : optsOrDesignOnly;
  // `residual` wins over the others: the fixed-template trim (see the RESIDUAL
  // block above). Keeps only what code + construction can't own.
  if (opts.residual) {
    return isCover
      ? { criteria: COVER_CRITERIA_RESIDUAL, hardIds: COVER_HARD_IDS_RESIDUAL }
      : { criteria: INTERIOR_CRITERIA_RESIDUAL, hardIds: INTERIOR_HARD_IDS_RESIDUAL };
  }
  if (opts.dropCleanComposition) {
    return isCover
      ? { criteria: COVER_CRITERIA_PARTIAL, hardIds: COVER_HARD_IDS_PARTIAL }
      : { criteria: INTERIOR_CRITERIA_PARTIAL, hardIds: INTERIOR_HARD_IDS_PARTIAL };
  }
  if (opts.designOnly) {
    return isCover
      ? { criteria: COVER_CRITERIA_DESIGN, hardIds: COVER_HARD_IDS_DESIGN }
      : { criteria: INTERIOR_CRITERIA_DESIGN, hardIds: INTERIOR_HARD_IDS_DESIGN };
  }
  return isCover
    ? { criteria: COVER_CRITERIA, hardIds: COVER_HARD_IDS }
    : { criteria: INTERIOR_CRITERIA, hardIds: INTERIOR_HARD_IDS };
}
