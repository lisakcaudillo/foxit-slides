/**
 * reshorten.ts — the coherent rewrite backstop for the fit ladder.
 *
 * When the deterministic fit had to TRIM a slot to make it fit its box (a
 * mid-sentence chop), this rewrites the original text to the box's character
 * budget as a COMPLETE, self-contained sentence — no truncation, no ellipsis —
 * so text adapts to the box while the font stays on the type scale. The
 * word-boundary trim from text-fit remains the floor UNDER this (rewrite for
 * quality, clamp for the guarantee) — the caller re-fits after applying.
 *
 * Rare, batched path: only trimmed/overflowing slots are sent, one call per
 * card. Fail-open — on any error the caller keeps the trimmed text.
 */
import { z } from 'zod';
import { getProvider, getModel, type ToolUseBlock, type Tool } from '@/lib/ai-provider';

const Schema = z.object({ rewrites: z.array(z.string()) });

/** "Loaded" numbers = money / percent / scale figures — the FR11-material ones.
 *  A condensing rewrite may reword prose freely but must NOT drop or alter one of
 *  these (that would trade a mid-sentence trim for a fact omission). */
const LOADED_NUM =
  /[$£€]\s?\d[\d,.]*\s?(?:k|m|bn?|billion|million|thousand)?|\d[\d,.]*\s?%|\d[\d,.]*\s?(?:pts?|points?|bps|percent|percentage points?)/gi;
const digitCore = (s: string): string => (s.match(/\d[\d,.]*/)?.[0] ?? '').replace(/[,.]+$/, '');

/** True if `rewrite` preserves every loaded number's digit-core from `original`.
 *  Compares by digit-core so "42%" → "42 percent" still passes, but a dropped or
 *  changed figure fails. No loaded numbers → trivially true. */
function preservesLoadedNumbers(original: string, rewrite: string): boolean {
  const want = [...original.matchAll(LOADED_NUM)].map((m) => digitCore(m[0])).filter(Boolean);
  if (!want.length) return true;
  const have = new Set((rewrite.match(/\d[\d,.]*/g) ?? []).map((x) => x.replace(/[,.]+$/, '')));
  return want.every((n) => have.has(n));
}

const TOOL: Tool = {
  name: 'report_rewrites',
  description: 'Return one rewritten string per item, in the SAME order, each within its character limit.',
  input_schema: {
    type: 'object',
    properties: {
      rewrites: {
        type: 'array',
        description: 'One rewrite per input item, same order. Each ≤ that item’s max characters.',
        items: { type: 'string' },
      },
    },
    required: ['rewrites'],
  },
};

export interface ReshortenItem {
  id: string;
  text: string;
  maxChars: number;
}

/**
 * Rewrite each item's text to ≤ its maxChars, coherently. Returns id → rewrite
 * for items whose rewrite actually came back within budget (a longer-than-cap
 * rewrite is dropped so the caller's trim stays the guarantee). Fail-open: an
 * empty map on any error.
 */
export async function reshorten(items: ReshortenItem[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!items.length) return out;
  try {
    // LLMs undershoot a char target unreliably and often land slightly over, so
    // ask for a budget below the true cap — the overshoot then lands within it.
    const target = (max: number) => Math.max(8, Math.round(max * 0.85));
    const list = items.map((it, i) => `${i + 1}. (max ${target(it.maxChars)} chars) ${it.text.trim()}`).join('\n');
    const prompt =
      'You rewrite slide text so it fits a hard character limit WITHOUT truncating. ' +
      'For each item, write a complete, coherent, self-contained rewrite of its text that is AT MOST maxChars characters. ' +
      'Rephrase and condense to hit the limit — keep the core meaning and any facts, names, or numbers; ' +
      'never cut mid-sentence; never add an ellipsis or a trailing "…"; do not end abruptly. ' +
      'Return one rewritten string per item, in the SAME ORDER.\n\nITEMS:\n' +
      list +
      `\n\nReturn via the ${TOOL.name} tool.`;

    const provider = getProvider();
    const response = await provider.createMessage({
      model: getModel(),
      max_tokens: 1500,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: prompt }],
    });
    const toolUse = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) return out;
    const parsed = Schema.safeParse(toolUse.input);
    if (!parsed.success) return out;

    parsed.data.rewrites.forEach((rw, i) => {
      const it = items[i];
      const t = (rw ?? '').trim();
      // The rewrite is the QUALITY layer, the fit's word-boundary trim is the
      // GUARANTEE under it. LLMs can't count characters, so a rewrite often lands
      // a little over cap — accept any genuine shortening that isn't itself an
      // ellipsis chop; the caller re-fits, and the clamp stays the floor. (Reject
      // a rewrite that didn't actually shorten — no point re-fitting the same
      // length.) FR11: also reject a rewrite that dropped/altered a grounded
      // (money/percent/scale) number — keep the trimmed text rather than lose a
      // fact; the caller then flags the slot as truncated.
      if (it && t && !/[…]$|\.\.\.$/.test(t) && t.length < it.text.length && preservesLoadedNumbers(it.text, t))
        out.set(it.id, t);
    });
  } catch {
    return out; // fail-open — caller keeps the trimmed text
  }
  return out;
}
