/**
 * New-deck entry point. The create surface is the dedicated `/editor/generate`
 * page — reached ONLY from +New / +Create. The old global
 * modal over the editor is retired; this helper now just navigates there.
 *
 * Kept in a NON-component module so callers (Sidebar, home Recents) import a
 * plain function without dragging a component in.
 */

// Retained for back-compat with any lingering imports; no longer dispatched.
export const NEW_DECK_OPEN_EVENT = 'compose:open-new-deck';

/** Go to the dedicated new-deck (generate) page. */
export function openNewDeckModal(): void {
  if (typeof window === 'undefined') return;
  window.location.assign('/editor/generate');
}
