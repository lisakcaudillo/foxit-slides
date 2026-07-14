// Shared rotating phrases for both the fullscreen DraftingOverlay (shown
// before any card has rendered) and the inline BuildingIndicator (shown
// below the visible cards while the rest stream in). Same voice in both
// places — playful, evocative, just shy of serious.
//
// By the time these are visible the user already knows it is making slides,
// so the phrasing leans into the *act* of making, not the artifact.

export const LOADING_PHRASES: ReadonlyArray<string> = [
  'Drafting beautiful content',
  'Composing the storyline',
  'Sketching ideas into shape',
  'Sharpening the throughline',
  'Polishing every detail',
  'Stitching it together',
  'Pulling the strands together',
  'Brewing something good',
  'Layering in nuance',
  'Setting the scene',
  'Tightening the narrative',
  'Pondering the angle',
];

export function pickLoadingPhrase(exclude?: string): string {
  if (LOADING_PHRASES.length <= 1) return LOADING_PHRASES[0];
  let next = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
  while (next === exclude) {
    next = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
  }
  return next;
}
