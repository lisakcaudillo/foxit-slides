import type { CSSProperties } from 'react';

/**
 * Universal title-text style for the theme system.
 *
 * Returns inline styles that paint text with `--theme-title-color` via the
 * `background-clip: text` pattern. The CSS variable is normalized to a valid
 * `background-image` value upstream in ThemeProvider (solid hexes are wrapped
 * as single-stop gradients), so this helper works for both gradient and
 * solid themes without any runtime branching.
 *
 * Use on every title surface that should respond to the active document theme.
 */
export function themedTitleStyle(): CSSProperties {
  return {
    backgroundImage: 'var(--theme-title-color)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  };
}
