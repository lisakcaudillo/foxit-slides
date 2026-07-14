// ── Shared image-generation engine — size / aspect presets ─────────────────
//
// One aspect control, collapsing the old /editor/graphics size-vs-aspect
// duplication (SIZE_OPTIONS) into the route's 3 supported aspects, labeled
// with friendly size names + pixel dims. The route maps these to gpt-image-1
// sizes (1:1→1024×1024, 16:9→1536×1024, 9:16→1024×1536).
//
// The array shape is kept easily extensible so future social-format presets
// (story, poster, etc.) can be layered on once the route supports more sizes.
// See docs/uiux/prototypes/image-prompt-flow-PLAN.md §4 (#54).

import type { AspectId } from './types';

// Two shapes only: medium Square + medium Landscape.
// Portrait (9:16) retired — slides and most assets are landscape or square,
// and limiting shapes keeps the cost profile predictable. The route still
// accepts 9:16 for back-compat (collapses to square), but the UI doesn't
// offer it.
export const SIZES: { id: AspectId; label: string; dims: string }[] = [
  { id: '1:1', label: 'Square', dims: '1024 × 1024' },
  { id: '16:9', label: 'Landscape', dims: '1536 × 1024' },
];
