/**
 * slide-standard — the single source of truth for slide generation quality.
 *
 * One import path (`./slide-standard`), sorted into sections. The writer
 * (index.ts `generateCard`) and the judge (judge.ts) both read from here so the
 * rules are defined ONCE and can't drift between the two.
 *
 *   - rules    → the quality RULES — judge RUBRIC (+ writer imperatives, WI-C)
 *   - density  → the Detail-level → word-cap scale (concise/detailed/extensive)
 *   - standard → the calibrated NUMBERS (DESIGN_STANDARD): padding, type scale,
 *                stat ratios, contrast, imagery, top-tier look
 *   - examples → the gold / anti / revise EXAMPLE corpus + the principles list
 *   - treatments → machine-readable cover/title TREATMENT (composition the
 *                  Designer applies; sizes live in slide-typography)
 */
export * from './rules';
export * from './density';
export * from './standard';
export * from './examples';
export * from './expectations';
export * from './treatments';
export * from './visual-rubric';
