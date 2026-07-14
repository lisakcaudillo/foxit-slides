// Foxit Slidewright — units.
//
// OOXML (DrawingML) measures length in EMUs (English Metric Units): 914,400 per
// inch, 12,700 per point. Font sizes are in centipoints (pt × 100). Angles are in
// 60,000ths of a degree. These converters are the single source of truth for the
// whole engine so geometry never drifts.

/** EMUs per inch. */
export const EMU_PER_INCH = 914_400;
/** EMUs per point (72 pt = 1 in). */
export const EMU_PER_PT = 12_700;

/** Inches → EMU (rounded to an integer — EMUs are integers). */
export const inchToEmu = (inches: number): number => Math.round(inches * EMU_PER_INCH);

/** Points → EMU. */
export const ptToEmu = (pt: number): number => Math.round(pt * EMU_PER_PT);

/** Point size → OOXML centipoints (the `sz` attribute on a:rPr / a:defRPr). */
export const ptToCentipoint = (pt: number): number => Math.round(pt * 100);

/** Degrees (CSS/standard, clockwise) → OOXML 60000ths-of-a-degree, normalized to
 *  [0, 21_600_000). Used for shape/text rotation (`rot`) and line-gradient angle. */
export const degToOoxmlAngle = (deg: number): number => {
  const a = ((Math.round(deg * 60_000) % 21_600_000) + 21_600_000) % 21_600_000;
  return a;
};

/** A fraction 0..1 → OOXML per-mille-of-a-percent (0..100000), clamped. Used for
 *  gradient stop positions and alpha/transparency. */
export const fracToPerMille = (frac: number): number =>
  Math.max(0, Math.min(100_000, Math.round(frac * 100_000)));
