// Pure OOXML color normalization — the single choke-point every color must
// pass through before it reaches the pptxgenjs writer.
//
// LOAD-BEARING: PowerPoint's OOXML format expects BARE hex (e.g. `1A1C20`).
// A leading `#` makes the color silently VANISH in PowerPoint. So text fills,
// shape fills, device-frame bodies, and recolored icons all normalize here
// first. Internally (web / Figma) colors are stored as `#RRGGBB`; this strips
// the `#` on the way out.
//
// Authored as `.mjs` (not `.ts`) on purpose: a zero-dependency `node --test`
// can import this EXACT implementation, so the test guards the same code the
// app runs — no TS loader, no test-runner devDependency. The TS app imports it
// fine (tsconfig has `allowJs` + bundler resolution).

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Normalize a CSS hex color to a bare 6-digit UPPERCASE hex (no `#`), suitable
 * for OOXML / pptxgenjs. 3-digit shorthand is expanded. Returns `undefined`
 * for null / empty / non-hex input (`none`, `rgb(...)`, `currentColor`, etc.).
 *
 * @param {string} [input]
 * @returns {string | undefined}
 */
export function toOoxmlColor(input) {
  if (!input) return undefined;
  const m = String(input).trim().match(HEX_RE);
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((d) => d + d).join('');
  return h.toUpperCase();
}
