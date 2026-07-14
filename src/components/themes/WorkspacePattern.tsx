'use client';

/**
 * Workspace pattern — renders the active theme's curated cover art behind
 * the editor card stack as a subtle, low-opacity background. Lisa wanted
 * the same visual identity she sees in the theme picker preview, just
 * dialed *way* down so it reads as breathing room rather than wallpaper.
 *
 * No opt-in field on Theme. We just delegate to CoverArt — every theme
 * that defines its own art gets one in the workspace, themes whose
 * CoverArt returns null (none currently, but the door is open) just
 * render no overlay.
 *
 * Opacity tuning: ~35-40% of the cover-slide strength. CoverArt's
 * internal opacities were authored for a small slide-preview card at
 * full strength; behind a full-size card stack we want them barely
 * perceptible so the cards stay the focal point. The wrapper opacity
 * multiplies through to all child SVG fills/strokes uniformly.
 */

import type { Theme } from './types';
import { CoverArt } from './CoverArt';

interface WorkspacePatternProps {
  theme: Theme;
  /** Multiplier on the wrapper opacity. Default 1; lower for "even quieter,"
   *  higher for emphasis. Cap is 1.0 — going above 1 has no effect. */
  intensity?: number;
}

export function WorkspacePattern({ theme, intensity = 1 }: WorkspacePatternProps) {
  const dark = theme.tone === 'dark';
  // Cap at 1.0 so callers can't accidentally over-saturate.
  const opacity = Math.min(1, 0.35 * intensity);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        // Soften any hard edges from the SVG strokes; gives the art a
        // diffused, atmospheric quality at workspace scale.
        filter: 'blur(0.5px)',
        pointerEvents: 'none',
      }}
    >
      <CoverArt theme={theme} dark={dark} />
    </div>
  );
}
