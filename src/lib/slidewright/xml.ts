// Foxit Slidewright — XML helpers.
//
// A tiny, dependency-free XML string layer. OOXML parts are plain text it builds
// by concatenation; the only correctness-critical parts are (a) escaping text and
// attribute values, and (b) the standalone XML declaration every part needs.

/** The XML declaration OOXML parts begin with (standalone="yes", per the spec). */
export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Escape a string for use as XML element text (`<`, `>`, `&`). */
export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape a string for use inside a double-quoted XML attribute value. */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Serialize an attribute map to ` k="v"` pairs, skipping null/undefined values.
 *  Numbers and booleans are stringified; strings are attr-escaped. Preserving a
 *  leading space so callers can inline it directly after a tag name. */
export function attrs(map: Record<string, string | number | boolean | undefined | null>): string {
  let out = '';
  for (const key of Object.keys(map)) {
    const v = map[key];
    if (v === undefined || v === null) continue;
    out += ` ${key}="${escapeAttr(String(v))}"`;
  }
  return out;
}
