'use client';

/**
 * Link helpers + inert link-UI stubs.
 *
 * Foxit Slides is a read-only viewer: the interactive link EDITOR popover and
 * hover bubble are never shown (FreeformLayer runs with interactive=false).
 * It keeps only the pure helpers the renderer needs — file-name inference and
 * the slide-reference type — and expose no-op components so the render layer
 * compiles without the full editing panel.
 */

export interface DeckSlideRef {
  id: string;
  /** 0-based position in the deck. */
  index: number;
  title: string;
}

/** File name (last path segment) inferred from a URL, for a download label. */
export function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const tail = u.pathname.split('/').filter(Boolean).pop();
    return tail ? decodeURIComponent(tail) : u.hostname;
  } catch {
    return url.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? url;
  }
}

// Editing UI is intentionally inert in the read-only viewer.
export function LinkEditor(_props: Record<string, unknown>): null {
  return null;
}

export function LinkBubble(_props: Record<string, unknown>): null {
  return null;
}
