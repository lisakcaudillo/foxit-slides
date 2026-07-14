// ── Shared image-generation engine — types ─────────────────────────────────
//
// Stage 1 of the unified image-gen engine (see
// §1). Pure type contracts
// shared by the future wizard (/editor/graphics) and accordion (slides Media
// panel) shells. No React, no styling.
//
// The canonical style / aspect / quality values are kept in lockstep with the
// `/api/ai/generate-image` route's RequestSchema so the hook can post them
// without translation.

/** The 8 canonical art-direction styles the route enum accepts. This REPLACES
 *  the divergent /editor/graphics set (flat / anime / pixel / oil). */
export type ImageStyle =
  | 'photographic'
  | 'illustration'
  | '3d-render'
  | 'watercolor'
  | 'sketch'
  | 'minimal'
  | 'cinematic'
  | 'abstract';

/** Aspect presets. 16:9 default (slides are 16:9). */
export type AspectId = '1:1' | '16:9' | '9:16';

/** Quality tier surfaced to the user. 'standard' maps to the route's
 *  'medium' tier; 'high' opts into the slower photoreal pass. */
export type Quality = 'standard' | 'high';

/** A single generated variant returned by the route's `images` array. */
export interface AiResult {
  src: string;
  width: number;
  height: number;
  libraryId?: string;
}

/** The fields posted to /api/ai/generate-image. `prompt` is load-bearing;
 *  everything else qualifies it. Reference + auto-context fields are
 *  optional and only populated by the slides accordion shell. */
export interface GenParams {
  prompt: string;
  style: ImageStyle;
  aspect: AspectId;
  quality: Quality;
  /** Variant count. Defaults to 4 (Firefly pattern) inside the hook. */
  n?: number;
  styleRef?: string;
  compositionRef?: string;
  slideHeading?: string;
  deckTitle?: string;
  themePalette?: string;
}

// ── Structured-prompt (MadLibs) shapes ──────────────────────────────────────
// Redefined here (data-only, no JSX) so promptModel.ts stays free of React.
// The original lives in components/image-editor/MadLibsBuilder.tsx, which is
// intentionally left untouched.

export type PromptCategoryId =
  | 'all'
  | 'objects'
  | 'people'
  | 'nature'
  | 'tech'
  | 'scene';

export interface PromptSlot {
  id: string;
  placeholder: string;
  defaultValue: string;
}

export interface PromptTemplate {
  id: string;
  category: Exclude<PromptCategoryId, 'all'>;
  title: string;
  description: string;
  /** Icon id (string) — the visual layer maps these to Lucide components.
   *  Kept as a string here so this remains a pure data file. */
  iconId: string;
  /** Sentence parts: plain strings are static grammar, `{ slot }` objects are
   *  swappable values referenced by slot id. */
  sentence: (string | { slot: string })[];
  slots: PromptSlot[];
  legend: { label: string; hint: string }[];
}

/** A rendered prompt segment — `static` for grammar words, `slot` for
 *  swappable values — so callers can style brackets / hover previews without
 *  re-implementing the sentence shapes. */
export interface PromptSegment {
  type: 'static' | 'slot';
  text: string;
}
