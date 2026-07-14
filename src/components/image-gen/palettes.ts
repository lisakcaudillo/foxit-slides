// ── Shared image-generation engine — color palettes ────────────────────────
//
// Ported from /editor/graphics `COLOR_PALETTES` (app/src/app/editor/graphics/
// page.tsx). The original stored each palette as a CSS gradient string; here
// the swatches are explicit hex arrays so the visual layer can render chips
// without parsing gradients. The id/label set is preserved 1:1.
//
// Multi-color swatches are content (the palette IS the choice), not UI chrome
// — allowed per the prototype plan. See image-prompt-flow-PLAN.md §3 (#41).
//
// Palette folds into the PROMPT STRING (no new route param), exactly as
// /editor/graphics already does: `parts.push("Color palette: <label>")`.

export interface Palette {
  id: string;
  label: string;
  swatches: string[];
}

export const PALETTES: Palette[] = [
  { id: 'vivid', label: 'Vivid', swatches: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'] },
  { id: 'muted', label: 'Muted', swatches: ['#b45309', '#6b7280', '#475569', '#4b5563'] },
  { id: 'pastel', label: 'Pastel', swatches: ['#fbcfe8', '#ddd6fe', '#bfdbfe', '#bbf7d0', '#fed7aa'] },
  { id: 'mono', label: 'Black & White', swatches: ['#000000', '#525252', '#a3a3a3', '#ffffff'] },
  { id: 'warm', label: 'Warm', swatches: ['#b91c1c', '#ea580c', '#d97706', '#ca8a04'] },
  { id: 'cool', label: 'Cool', swatches: ['#1d4ed8', '#0d9488', '#166534', '#6366f1'] },
  { id: 'earth', label: 'Earth tones', swatches: ['#57534e', '#78350f', '#b45309', '#15803d'] },
  // 'auto' = let the model pick. Renders with a soft Foxit-tint swatch in the
  // UI; contributes NO prompt fragment (see palettePromptFragment).
  { id: 'auto', label: 'Auto (let AI choose)', swatches: ['rgba(107,63,160,0.15)', 'rgba(129,140,248,0.20)'] },
];

/** The text appended to the prompt for a chosen palette id, matching how
 *  /editor/graphics folds the palette label into the prompt string
 *  (`Color palette: <label>`). Returns '' for unknown ids and for 'auto'
 *  (which means "let the model choose" — no constraint added). */
export function palettePromptFragment(id: string): string {
  if (!id || id === 'auto') return '';
  const palette = PALETTES.find((p) => p.id === id);
  if (!palette) return '';
  return `Color palette: ${palette.label}`;
}
