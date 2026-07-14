// ── Shared image-generation engine — canonical styles ──────────────────────
//
// The 8 canonical art-direction styles, matching the
// `/api/ai/generate-image` route enum and the slides Media panel's `AiStyle`
// union. This REPLACES the divergent /editor/graphics set (flat / anime / pixel
// / oil).

import type { ImageStyle } from './types';

export const STYLES: { id: ImageStyle; label: string }[] = [
  { id: 'photographic', label: 'Photographic' },
  { id: 'illustration', label: 'Illustration' },
  { id: '3d-render', label: '3D render' },
  { id: 'watercolor', label: 'Watercolor' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'abstract', label: 'Abstract' },
];
