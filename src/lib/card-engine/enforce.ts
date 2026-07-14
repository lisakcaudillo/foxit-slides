/**
 * Design Intelligence Layer — Enforcement (the quality gate).
 *
 * "this must be added to the design intelligence. it doesn't
 * exist without enforcement." Rules in the generation prompt are only an ASK;
 * this is where the output is actually MEASURED against them and sent back when
 * it misses. The core inversion: instead of "generate → truncate → accept,"
 * the engine does "generate → check → regenerate WITH the reason → accept."
 *
 * This module is the DETERMINISTIC tier (cheap, no AI, always runs). It returns
 * actionable feedback strings that are injected verbatim into the regeneration
 * prompt so the next attempt fixes the specific failure. A future LLM "judge"
 * tier (scored against the gold-example rubric) layers on top for the
 * subjective bar ("is this punchy / one idea / not boring") that regex can't see.
 *
 * Pure + defensive — never throws; unknown block shapes are skipped, not failed.
 */

const BANNED_HEADING_OPENERS =
  /^\s*(strong|comprehensive|strategic|proven|robust|dynamic|powerful|innovative|cutting-edge|seamless|holistic|next-gen|world-class)\b/i;

// Bracket placeholder like [leads generated] / [stat] — renders as broken UI.
const PLACEHOLDER_TOKEN = /\[[^\]\n]{2,48}\]/;

// Fabricated-statistic shapes: a percentage (23%), money ($4.82M / $1,200),
// a multiplier (3x / 3×), or a grouped big number (1,284). These are the
// signatures of an INVENTED metric. Deliberately NARROW — plain counts like
// "3 steps", "8 hours", "30-day", a year "2025", or "16:9" do NOT match, so the
// check only fires on real statistics, not incidental numbers.
const FABRICATED_STAT = /\d+(\.\d+)?\s?%|\$\s?\d|\b\d+(\.\d+)?\s?[x×]\b|\b\d{1,3}(,\d{3})+\b/;

const wordCount = (s: string): number => (s || '').trim().split(/\s+/).filter(Boolean).length;

/** Recursively collect every string leaf from a block (content, body, items,
 *  cells, labels, etc.) so the checks are robust to block shape. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.trim()) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
  return out;
}

/** Like collectStrings, but skips STRUCTURAL keys (NON_CONTENT_KEYS — `variant`,
 *  `type`, `icon`, …). The grounding check must see only real prose: a
 *  smart-layout `variant` of "grid-1x3"/"grid-2x2" otherwise reads as a "1x"/"2x"
 *  figure and triggers a PHANTOM fabrication flag. Mirrors what rewriteProse (the
 *  strip) skips, so detection and stripping agree. */
function collectContentStrings(value: unknown, out: string[] = [], key?: string): string[] {
  if (typeof value === 'string') {
    if (value.trim() && !(key && NON_CONTENT_KEYS.has(key))) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectContentStrings(v, out, key);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (NON_CONTENT_KEYS.has(k)) continue;
      collectContentStrings(v, out, k);
    }
  }
  return out;
}

export interface QualityResult {
  /** Actionable feedback lines — empty means the card passed. Each line is
   *  written to be injected straight into a regeneration prompt. */
  issues: string[];
}

// Keys whose string values are structural, not prose — never rewrite them.
const NON_CONTENT_KEYS = new Set([
  'id', 'type', 'variant', 'icon', 'color', 'accentColor', 'fontFamily',
  'frameShape', 'src', 'href', 'align', 'textAlign', 'placement', 'style',
]);

/** Remove a fabricated statistic token, leaving the qualitative remainder.
 *  "23% higher commit frequency" → "higher commit frequency"; "3x faster" →
 *  "faster"; "$4.2M saved" → "saved". Then tidy spacing/punctuation and
 *  re-capitalize if the strip removed a sentence-leading number. */
function stripStatTokens(s: string): string {
  if (!FABRICATED_STAT.test(s)) return s;
  const out = s
    .replace(/\$?\s?\d[\d,]*(\.\d+)?\s*(%|[x×])/g, '')   // 23% / 3x / $5%
    .replace(/\$\s?\d[\d,]*(\.\d+)?\s*[KMB]?/gi, '')       // $4.2M / $1,200
    .replace(/\b\d{1,3}(,\d{3})+\b/g, '')                  // 1,284
    .replace(/\s{2,}/g, ' ')                                 // collapse gaps
    .replace(/\s+([.,;:!?])/g, '$1')                         // space before punct
    .replace(/^[\s,;:–—-]+/, '')                             // leading junk
    .trim();
  return out.length > 0 ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/** Deep-rewrite every prose string in a block tree, skipping structural keys. */
function rewriteProse(value: unknown, fn: (s: string) => string, key?: string): unknown {
  if (typeof value === 'string') return key && NON_CONTENT_KEYS.has(key) ? value : fn(value);
  if (Array.isArray(value)) return value.map((v) => rewriteProse(v, fn, key));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = NON_CONTENT_KEYS.has(k) ? v : rewriteProse(v, fn, k);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic grounding backstop. The gate ASKS the writer to drop invented
 * numbers, but a stubborn model can exhaust the regeneration budget and ship
 * them anyway. When the topic gave NO figures, this strips any surviving
 * fabricated stat from the final blocks — a guarantee the regenerate-loop can't
 * make. No-op when the topic supplied numbers (then statistics are legitimate).
 */
export function stripFabricatedStats<T extends unknown[]>(blocks: T, topicHasNumbers: boolean): T {
  if (topicHasNumbers || !Array.isArray(blocks)) return blocks;
  return blocks.map((b) => rewriteProse(b, stripStatTokens)) as T;
}

/** Remove literal Markdown that leaks into generated content. The slide renderer
 *  shows it raw — `**Finance/Dec 5**` renders the asterisks — so strip the bold/
 *  italic markers and any leading heading/bullet markup. Conservative: only `**`
 *  / `__` pairs and line-leading `#`/`-`/`*`/`+ ` markup are removed; inline
 *  hyphens, single asterisks, and minus signs in prose are left untouched. */
export function stripMarkdownTokens(s: string): string {
  const out = s
    .replace(/\*\*/g, '')             // **bold**
    .replace(/__/g, '')               // __bold__
    .replace(/^\s*#{1,6}\s+/, '')     // leading "# heading"
    .replace(/^\s*[-*+]\s+/, '')      // leading "- bullet" / "* item"
    .replace(/\s{2,}/g, ' ')
    .trim();
  return collapseStutters(out);
}

/** Collapse an ADJACENT duplication artifact — the mechanical "stutter" a model
 *  occasionally emits when condensing under a hard char cap (e.g. the reshorten
 *  rewriter): "load-load-bearing", "and start and start", "the the". Only truly
 *  adjacent repeats are collapsed, so real prose is untouched. Cheap, deterministic
 *  safety net so the defect never ships even when the LLM stutters. */
export function collapseStutters(s: string): string {
  return s
    // "load-load-bearing" → "load-bearing": a duplicated head of a HYPHENATED
    // COMPOUND (lookahead requires another "-word" after the repeat). Narrow on
    // purpose so legit reduplicatives ("win-win", "bye-bye") are left alone.
    .replace(/\b(\w{3,})-\1(?=-\w)/gi, '$1')
    .replace(/\b(\w+\s+\w+)\s+\1\b/gi, '$1')      // "and start and start" → "and start"
    .replace(/\b(\w{2,})\s+\1\b/gi, '$1')         // "the the" / "start start" → one
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')                // tidy any space left before punctuation
    .trim();
}

/**
 * Deterministic markdown-bleed backstop. gpt-4o sometimes emits `**bold**` /
 * heading / bullet markup inside content the renderer treats as plain text, so
 * the markers show literally. Strip them from every prose string. Behavior-
 * preserving: removes only formatting characters, never words or numbers.
 */
export function stripMarkdownBleed<T extends unknown[]>(blocks: T): T {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => rewriteProse(b, stripMarkdownTokens)) as T;
}

// Shared stat matcher — %, $X[k/m/b], Nx, big comma-numbers. A factory (fresh
// regex per use) so matchAll and replace never collide on lastIndex.
const STAT_PATTERN = '(\\d+(?:\\.\\d+)?)\\s*%|\\$\\s*(\\d+(?:\\.\\d+)?)\\s*([kmb])?|\\b(\\d+(?:\\.\\d+)?)\\s*[x×]|\\b(\\d{1,3}(?:,\\d{3})+)\\b';
const statRe = () => new RegExp(STAT_PATTERN, 'gi');

/** Canonical token for a stat match, so a topic figure and the same figure on a
 *  slide compare equal (e.g. "$1.2M" and "$ 1.2 m" → "$1.2m"). */
function normStat(p1?: string, p2?: string, p3?: string, p4?: string, p5?: string): string {
  if (p1 != null) return `${p1}%`;
  if (p2 != null) return `$${p2}${(p3 || '').toLowerCase()}`;
  if (p4 != null) return `${p4}x`;
  if (p5 != null) return p5.replace(/,/g, '');
  return '';
}

function statTokenList(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(statRe())) out.push(normStat(m[1], m[2], m[3], m[4], m[5]));
  return out;
}

/** The figures the TOPIC actually supplied — the grounded set everything is
 *  checked against (plus the money magnitudes, for simple derivation). */
function groundedStat(topic: string): { grounded: Set<string>; money: number[] } {
  const grounded = new Set(statTokenList(topic));
  const money = [...grounded].filter((t) => t.startsWith('$')).map((t) => parseFloat(t.slice(1)));
  return { grounded, money };
}

/** Is this figure grounded? Exact topic match, or a simple money derivation
 *  ($180K over 3yr → $60K/yr). */
function tokenGrounded(tok: string, grounded: Set<string>, money: number[]): boolean {
  if (grounded.has(tok)) return true;
  if (tok.startsWith('$')) {
    const v = parseFloat(tok.slice(1));
    return money.some((pv) => {
      for (let k = 2; k <= 12; k++) if (Math.abs(pv / k - v) < 0.01 || Math.abs(pv * k - v) < 0.01) return true;
      return false;
    });
  }
  return false;
}

/** First %/$/x figure on the slide that the TOPIC never supplied → fabricated
 *  (FR11). Prompt-aware + always-on: catches the data-less slot in a deck that
 *  has OTHER real numbers (which the deck-level gate misses). */
function firstUngroundedStat(slideText: string, topic: string): string | null {
  const { grounded, money } = groundedStat(topic);
  for (const tok of statTokenList(slideText)) if (!tokenGrounded(tok, grounded, money)) return tok;
  return null;
}

/** Strip ungrounded stat tokens from ONE prose string, preserving grounded
 *  figures; collects what it removed. Tidies the spacing/punctuation the removed
 *  token left behind. */
function stripUngroundedFrom(s: string, grounded: Set<string>, money: number[], collected: string[]): string {
  const out = s
    .replace(statRe(), (full, p1, p2, p3, p4, p5) => {
      const tok = normStat(p1, p2, p3, p4, p5);
      if (tokenGrounded(tok, grounded, money)) return full;
      collected.push(full.trim());
      return '';
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?%])/g, '$1')
    .replace(/^[\s,;:–—-]+/, '')
    .trim();
  return out.length ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/**
 * FR11 FAIL-CLOSED backstop. After the revision loop, strip any figure the slide
 * states that the TOPIC never supplied — leaving the qualitative remainder — so
 * a fabricated number is NEVER shipped (grounded-or-silent). Prompt-aware, so
 * unlike stripFabricatedStats (number-free topics only) it preserves grounded
 * figures and removes only the invented ones — it works on decks that DO carry
 * real data. Returns the cleaned blocks plus the stripped figures (for logging).
 */
export function stripUngroundedStats<T extends unknown[]>(blocks: T, topic: string): { blocks: T; stripped: string[] } {
  if (!Array.isArray(blocks)) return { blocks, stripped: [] };
  const { grounded, money } = groundedStat(topic);
  const stripped: string[] = [];
  const cleaned = blocks.map((b) => rewriteProse(b, (s) => stripUngroundedFrom(s, grounded, money, stripped))) as T;
  return { blocks: cleaned, stripped };
}

/**
 * Deterministic quality check for one generated card. Catches the failures we
 * can measure: paragraph-density (the "make me read" problem), bracket
 * placeholders, evaluative-adjective headings, and fabricated (ungrounded)
 * figures. Returns feedback the regeneration loop appends to the prompt.
 */
/** Templates that are terse BY DESIGN — the depth FLOOR is not applied to them
 *  (a cover, divider, quote, stat grid or bullet list is correctly short). */
const TERSE_TEMPLATES = new Set([
  'cover-minimal', 'cover-subtitle', 'quote-pull', 'chapter-divider',
  'key-metric-trio', 'key-metric-quad', 'label-group', 'divider', 'agenda',
  'bullet-list', 'icon-list',
]);

export function checkCardQuality(
  blocks: unknown[],
  budget?: Record<string, unknown> | null,
  opts?: { topicHasNumbers?: boolean; topic?: string; blockTemplate?: string },
): QualityResult {
  const issues: string[] = [];
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { issues: ['The slide came back empty. Produce real content for every block.'] };
  }

  // 1. Placeholder tokens anywhere.
  const allText = blocks.flatMap((b) => collectStrings(b));
  if (allText.some((t) => PLACEHOLDER_TOKEN.test(t))) {
    issues.push(
      'Remove bracket placeholder tokens like "[example]" or "[stat]" — write a real value, or a short plain-language prompt to the user (e.g. "Your Q1 number"). Brackets render as broken UI.',
    );
  }

  // 2. Evaluative-adjective headings.
  const headings = blocks
    .filter((b) => (b as { type?: string }).type === 'heading')
    .map((b) => (b as { content?: string }).content || '');
  if (headings.some((h) => BANNED_HEADING_OPENERS.test(h))) {
    issues.push(
      'A heading opens with an evaluative adjective (Strong / Comprehensive / Proven / etc.). Name the subject as a concrete noun phrase instead.',
    );
  }

  // 3. Density — the "don't make me read" gate. Compare the longest non-heading
  //    text to the body budget; flag paragraphs that should be fragments.
  const capRaw = budget?.bodyMaxWords;
  const cap = typeof capRaw === 'number' ? capRaw : 28;
  const bodyTexts = blocks
    .filter((b) => (b as { type?: string }).type !== 'heading')
    .flatMap((b) => collectStrings(b));
  const longest = bodyTexts.reduce((m, t) => Math.max(m, wordCount(t)), 0);
  if (longest > Math.ceil(cap * 1.3)) {
    issues.push(
      `A slide body runs ${longest} words — too long to glance at. Cut to ${cap} words or fewer, as a punchy fragment, not a sentence or paragraph. One idea per slide.`,
    );
  }

  // 4. Grounding — prompt-aware fabricated-metric gate (FR11). Any %/$/x figure
  //    on the slide that the TOPIC never supplied was invented. This runs ALWAYS
  //    and compares against the actual topic, so it catches the data-less slot in
  //    a deck that HAS other real numbers (e.g. a pitch invents a $4M raise the
  //    prompt never gave) — the case the deck-level "topic has no numbers" gate
  //    structurally missed. The LLM judge's `grounded` dimension is unreliable
  //    here (it almost never flags fabrication), so this deterministic check is
  //    the dependable net feeding the revision loop.
  if (opts?.topic) {
    // Content-only (skip structural keys) so a smart-layout variant like
    // "grid-1x3" can't masquerade as a "1x" figure — that phantom flag wasted
    // revisions and faked SHIPPED-UNRESOLVED records.
    const contentText = blocks.flatMap((b) => collectContentStrings(b)).join('\n');
    const ungrounded = firstUngroundedStat(contentText, opts.topic);
    if (ungrounded) {
      issues.push(
        `This slide states "${ungrounded}" — a figure the topic never provided, so it is ` +
          'fabricated data (FR11, the most damaging failure). Replace it with the real value ' +
          'only if the topic gave one; otherwise use a short fill-in prompt ("Your figure here") ' +
          'or restate the point without a number. Never invent a statistic.',
      );
    }
  }

  // 5. Density FLOOR — "detailed" must READ detailed. Detail-level is a word
  //    FLOOR (bodyMinWords), not just a ceiling: a prose slide whose fullest
  //    paragraph falls below it is under-developed and renders "concise" even
  //    when the user asked for depth. Route it back to add GROUNDED depth.
  //    Skipped for terse-by-design templates (covers/stats/lists). The floor is
  //    best-effort, NOT fail-closed: the FR11 grounding gate above OVERRIDES it,
  //    so a writer that can only hit the floor by inventing must stay short.
  const floorRaw = budget?.bodyMinWords;
  const floor = typeof floorRaw === 'number' ? floorRaw : 0;
  if (floor > 0 && !TERSE_TEMPLATES.has(opts?.blockTemplate ?? '')) {
    const paragraphs = blocks
      .filter((b) => (b as { type?: string }).type === 'paragraph')
      .map((b) => (b as { content?: string }).content || '');
    const longestPara = paragraphs.reduce((m, t) => Math.max(m, wordCount(t)), 0);
    if (paragraphs.length > 0 && longestPara < floor) {
      issues.push(
        `This deck is set to a DETAILED depth, but the fullest body on this slide is only ${longestPara} words — under-developed; it will read sparse. ` +
          `Expand the body to roughly ${floor}-${cap} words by EXPLAINING and CONTEXTUALIZING the real content (the why, the how, a concrete example drawn FROM THE TOPIC). ` +
          'Do NOT invent facts, numbers, names, or dates to reach length — grounded elaboration only. If you cannot deepen it without inventing, keep it short.',
      );
    }
  }

  return { issues };
}
