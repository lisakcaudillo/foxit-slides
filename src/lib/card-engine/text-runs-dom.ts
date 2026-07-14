/**
 * The contentEditable ↔ rich-text-runs bridge — the DOM side of per-word
 * formatting. Kept separate from the pure model (`text-runs.ts`) and from the
 * React component so it can be exercised against a real DOM in tests.
 *
 * INVARIANT — the editable is a FLAT tree while editing: the root holds
 * <span data-m="…">s (marked runs) and bare text nodes (unmarked runs), with
 * literal '\n' characters for line breaks. Because the tree is flat and uses
 * real newline characters, the character offset of any DOM point is simply
 * `Range.toString().length`, which stays consistent with the concatenated run
 * text — no synthetic-newline bookkeeping. FreeformLayer intercepts Enter/paste
 * to preserve this shape.
 */
import type { TextRun, TextRunMarks } from '@/types/card-template';
import { normalizeRuns, asLinkTarget, linkHref } from './text-runs';

/** Inline CSS (camelCase keys, string values) for a run's marks. Usable as both
 *  a React `style={…}` object and an imperative `Object.assign(el.style, …)`
 *  target, so display and editing stay pixel-identical. Only the overridden
 *  keys are set; everything else inherits the box/variant default. */
export function runMarkStyle(m?: TextRunMarks): Record<string, string> {
  if (!m) return {};
  const out: Record<string, string> = {};
  if (m.bold) out.fontWeight = '700';
  if (m.italic) out.fontStyle = 'italic';
  const deco = [m.underline ? 'underline' : '', m.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) out.textDecoration = deco;
  if (m.color) {
    out.color = m.color;
    // A run colour must win even inside gradient-fill headings (transparent
    // fill clipped to the glyphs) — reset the clip so the solid colour paints.
    // Capital-W key is React's vendor-prefix form; cssName() maps it to
    // `-webkit-text-fill-color` for the imperative path.
    out.WebkitTextFillColor = m.color;
    out.backgroundImage = 'none';
  }
  if (m.highlight) out.backgroundColor = m.highlight;
  if (m.fontSize) out.fontSize = `${m.fontSize}px`;
  if (m.fontFamily) out.fontFamily = m.fontFamily;
  if (m.superscript) {
    out.verticalAlign = 'super';
    if (!m.fontSize) out.fontSize = '0.72em';
  } else if (m.subscript) {
    out.verticalAlign = 'sub';
    if (!m.fontSize) out.fontSize = '0.72em';
  }
  if (m.link) {
    // Link styling: underline + link colour, unless the run sets its own colour.
    if (!out.textDecoration) out.textDecoration = 'underline';
    if (!m.color) { out.color = '#2563eb'; out.WebkitTextFillColor = '#2563eb'; out.backgroundImage = 'none'; }
    out.cursor = 'pointer';
  }
  return out;
}

/** Read the marks off an element — prefers the data-m attribute we emit; infers
 *  from tag/inline style for any node the browser created during typing. */
export function parseMarksFromEl(el: HTMLElement): TextRunMarks | undefined {
  const raw = el.dataset.m;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as TextRunMarks;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* fall through to inference */
    }
  }
  const m: TextRunMarks = {};
  const tag = el.tagName;
  const s = el.style;
  const weight = s.fontWeight;
  if (tag === 'B' || tag === 'STRONG' || weight === 'bold' || (weight && parseInt(weight, 10) >= 600)) m.bold = true;
  if (tag === 'I' || tag === 'EM' || s.fontStyle === 'italic') m.italic = true;
  const deco = `${s.textDecoration || ''} ${s.textDecorationLine || ''}`;
  if (tag === 'U' || /underline/.test(deco)) m.underline = true;
  if (tag === 'S' || tag === 'STRIKE' || /line-through/.test(deco)) m.strike = true;
  if (s.color) m.color = s.color;
  const bg = s.backgroundColor;
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') m.highlight = bg;
  if (s.fontSize && !/em$/.test(s.fontSize)) {
    const n = parseFloat(s.fontSize);
    if (n > 0) m.fontSize = n;
  }
  if (s.fontFamily) m.fontFamily = s.fontFamily.replace(/["']/g, '');
  if (tag === 'SUP' || s.verticalAlign === 'super') m.superscript = true;
  if (tag === 'SUB' || s.verticalAlign === 'sub') m.subscript = true;
  if (tag === 'A') {
    const href = el.getAttribute('href');
    if (href) m.link = href;
  }
  return Object.keys(m).length ? m : undefined;
}

/** Serialise the editable DOM back to normalised runs. Text nodes inherit the
 *  marks of their nearest ancestor span; BR and block boundaries become '\n'. */
export function serializeEditable(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (node: Node, inherited?: TextRunMarks) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const text = child.textContent ?? '';
        if (text) runs.push({ text, ...(inherited ? { marks: inherited } : {}) });
        return;
      }
      if (child.nodeType !== 1 /* ELEMENT_NODE */) return;
      const el = child as HTMLElement;
      if (el.tagName === 'BR') {
        runs.push({ text: '\n', ...(inherited ? { marks: inherited } : {}) });
        return;
      }
      const own = parseMarksFromEl(el);
      const merged = own || inherited ? { ...(inherited ?? {}), ...(own ?? {}) } : undefined;
      const isBlock = /^(DIV|P)$/.test(el.tagName);
      const last = runs[runs.length - 1];
      if (isBlock && last && !last.text.endsWith('\n')) runs.push({ text: '\n' });
      walk(el, merged);
    });
  };
  walk(root);
  return normalizeRuns(runs);
}

/** camelCase style key → CSS property name. `WebkitTextFillColor` →
 *  `-webkit-text-fill-color`, `backgroundImage` → `background-image`, etc. */
function cssName(k: string): string {
  return k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Replace the editable's children with spans built from `runs`. Flat tree:
 *  marked runs → <span data-m>…</span>, unmarked runs → bare text node. */
export function fillEditable(root: HTMLElement, runs: TextRun[]): void {
  root.textContent = '';
  for (const r of runs) {
    if (r.marks) {
      // Linked runs are <a> so the tag alone survives even without data-m;
      // everything else is a <span>. Both carry data-m for exact round-trip.
      const el = document.createElement(r.marks.link ? 'a' : 'span');
      el.dataset.m = JSON.stringify(r.marks);
      // A slide-jump link has no navigable href; url/download carry theirs.
      const href = linkHref(asLinkTarget(r.marks.link));
      if (href) el.setAttribute('href', href);
      const style = runMarkStyle(r.marks);
      for (const [k, v] of Object.entries(style)) {
        el.style.setProperty(cssName(k), v);
      }
      el.textContent = r.text;
      root.appendChild(el);
    } else {
      root.appendChild(document.createTextNode(r.text));
    }
  }
}

/** Character offset of a DOM point within `root` — the length of the text from
 *  root-start to the point (consistent with the flat run text). */
function pointOffset(root: HTMLElement, container: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(root, 0);
  try {
    r.setEnd(container, offset);
  } catch {
    return 0;
  }
  return r.toString().length;
}

/** The current selection as [start, end) character offsets, or null when the
 *  selection isn't inside `root`. */
export function getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const a = pointOffset(root, range.startContainer, range.startOffset);
  const b = pointOffset(root, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Resolve a character offset back to a (text node, local offset) pair. */
function locateOffset(root: HTMLElement, target: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let last: Node | null = null;
  let n = walker.nextNode();
  while (n) {
    const len = (n.textContent ?? '').length;
    if (target <= acc + len) return { node: n, offset: target - acc };
    acc += len;
    last = n;
    n = walker.nextNode();
  }
  if (last) return { node: last, offset: (last.textContent ?? '').length };
  return { node: root, offset: 0 };
}

/** Bounding rect (viewport coords) of the character range [start, end) inside
 *  `root` — used to anchor the link editor under the selected words. Null when
 *  the range can't be resolved. */
export function rangeRectFor(root: HTMLElement, start: number, end: number): DOMRect | null {
  const s = locateOffset(root, start);
  const e = locateOffset(root, end);
  const range = document.createRange();
  try {
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
  } catch {
    return null;
  }
  const rect = range.getBoundingClientRect();
  return rect && rect.width + rect.height > 0 ? rect : null;
}

/** Client rects (viewport coords) of the character range [start, end) — one per
 *  line the range spans. Used to paint the synthetic selection highlight while
 *  the link editor holds focus. */
export function rangeClientRects(root: HTMLElement, start: number, end: number): DOMRect[] {
  const s = locateOffset(root, start);
  const e = locateOffset(root, end);
  const range = document.createRange();
  try {
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
  } catch {
    return [];
  }
  return Array.from(range.getClientRects());
}

/** Restore a selection from character offsets. */
export function setSelectionOffsets(root: HTMLElement, start: number, end: number): void {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel) return;
  const s = locateOffset(root, start);
  const e = locateOffset(root, end);
  const range = document.createRange();
  try {
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
  } catch {
    return;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
