// ── Shared image-generation engine — section taxonomy ──────────────────────
//
// The single source of truth for the three create-flow sections, shared by
// BOTH shells (the wizard's step rail and the accordion's collapsibles).
// Resolves the parity drift the UX review flagged: wizard and slides panel
// must read as one product, so the labels live here once.
//
// See docs/uiux/prototypes/image-prompt-flow-PLAN.md §10 (UX must-fix #1).

export const SECTIONS = [
  { id: 'describe', label: 'Describe' },
  { id: 'style', label: 'Style & color' },
  { id: 'size', label: 'Size' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
