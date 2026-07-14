/**
 * source-facts-extract.ts — the LLM extraction pass for the per-metric fact
 * contract (Foxit Slides side; the adaptive engine wires its own provider around the
 * same prompt + schema).
 *
 * Turns source text into metric-bound facts (see source-facts.ts / the contract
 * doc). Structured output only, then a SPAN CHECK drops any fact the model
 * invented (value must appear in a sourceSpan that is a real substring of the
 * source). Cheap model is fine — but note the span check proves value+unit are
 * real, NOT the metric/subject attribution, which is the surface the eval must
 * watch (docs/architecture/per-metric-fact-contract.md §8.4).
 */
import { z } from 'zod';
import { getProvider, getModel, type ToolUseBlock, type Tool } from '@/lib/ai-provider';
import type { SourceFact } from './source-facts';

const FactSchema = z.object({
  value: z.number(),
  unit: z.string().optional().default(''),
  metric: z.string(),
  subject: z.string().nullish(),
  period: z.string().nullish(),
  direction: z.enum(['up', 'down', 'flat']).nullish(),
  sourceSpan: z.string(),
});
const FactsSchema = z.object({
  facts: z.array(FactSchema),
  // The single entity the source is primarily ABOUT (the "we/the" company, or the
  // named subject). Used as the deck subject so a stat slide showing a COMPETITOR's
  // number (tagged with a different subject) can be caught. null when the source
  // isn't about a specific entity.
  primarySubject: z.string().nullish(),
});

export interface ExtractResult {
  facts: SourceFact[];
  primarySubject: string | null;
}

const TOOL: Tool = {
  name: 'report_source_facts',
  description: 'Return every quantitative fact stated in the source, each bound to the measure and subject it is about.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        description: 'One entry per number actually stated in the source. Do not invent.',
        items: {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'the number, no unit (e.g. 78)' },
            unit: { type: 'string', description: 'its unit: "%", "pts", "bps", "$M", "operas", or "" if none' },
            metric: { type: 'string', description: 'the measure it names — "gross margin", "revenue growth", "symphonies written"' },
            subject: { type: 'string', description: 'WHO/WHAT it is about IF the source names one — a company, product, division, person. Omit if the source states no subject.' },
            period: { type: 'string', description: 'WHEN, if stated — "Q3 2025", "last year". Omit if none.' },
            direction: { type: 'string', enum: ['up', 'down', 'flat'], description: 'ONLY if the source frames the number as a change. Omit for a level/count.' },
            sourceSpan: { type: 'string', description: 'the VERBATIM sentence/phrase from the source containing this number — copied exactly, must contain the value.' },
          },
          required: ['value', 'metric', 'sourceSpan'],
        },
      },
      primarySubject: {
        type: 'string',
        description: 'The single entity this source is primarily ABOUT — the "we/our" company or the named subject. Omit if the source is not about a specific entity.',
      },
    },
    required: ['facts'],
  },
};

const buildPrompt = (source: string): string => `Extract EVERY quantitative fact stated in the SOURCE below, each bound to what it is ABOUT. For each number the source states, return:
- value: the number (no unit)
- unit: "%", "pts", "bps", "$M", "operas", or "" if none
- metric: the measure it names ("gross margin", "revenue growth", "symphonies written")
- subject: WHO or WHAT the number is about IF the source names one (a company, product, division, person). Omit if the source states no subject.
- period: WHEN if stated. Omit if none.
- direction: "up"/"down"/"flat" ONLY if the source frames the number as a change. Omit for a level or count.
- sourceSpan: the VERBATIM sentence/phrase from the source that contains this number — copied EXACTLY, and it must contain the value.

Also return primarySubject: the single entity the source is primarily ABOUT (the "we/our" company, or the named subject). For facts about THAT entity — including first-person "we/our/us" facts — set their subject to the primarySubject's name (so our own numbers and a competitor's don't collide). Omit primarySubject if the source is not about a specific entity.

RULES:
- Extract ONLY numbers actually stated in the source. Never invent, derive, or infer a number.
- sourceSpan must be copied verbatim from the source and must contain the value.
- If the source gives the SAME measure for two different subjects (e.g. two companies, two products), emit TWO facts with different subjects.

SOURCE:
"""
${source}
"""

Return via the report_source_facts tool.`;

const norm = (f: z.infer<typeof FactSchema>): SourceFact => ({
  value: f.value,
  unit: f.unit ?? '',
  metric: f.metric,
  subject: f.subject ?? null,
  period: f.period ?? null,
  direction: f.direction ?? null,
  sourceSpan: f.sourceSpan,
});

/** Drop any fact the model didn't ground: its sourceSpan must be a real substring
 *  of the source, and the value must appear in that span. Fail-safe — a dropped
 *  fact just isn't in the store, so the caller falls back to its weaker check. */
function spanCheck(facts: SourceFact[], source: string): SourceFact[] {
  const src = source.toLowerCase();
  return facts.filter((f) => {
    const span = (f.sourceSpan || '').toLowerCase().trim();
    if (!span || !src.includes(span)) return false;
    // the value must actually be in its own span (plain digits, comma-stripped)
    const digits = String(f.value);
    return span.replace(/,/g, '').includes(digits);
  });
}

/** Extract metric-bound facts + the deck's primary subject. Structured + span-checked. */
export async function extractSourceFacts(source: string): Promise<ExtractResult> {
  const provider = getProvider();
  const response = await provider.createMessage({
    model: getModel(),
    max_tokens: 2000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'report_source_facts' },
    messages: [{ role: 'user', content: buildPrompt(source) }],
  });
  const toolUse = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) return { facts: [], primarySubject: null };
  const parsed = FactsSchema.safeParse(toolUse.input);
  if (!parsed.success) return { facts: [], primarySubject: null };
  return {
    facts: spanCheck(parsed.data.facts.map(norm), source),
    primarySubject: parsed.data.primarySubject ?? null,
  };
}

// Per-source cache — extraction is deck-level (one source), so a per-slide caller
// hits this once and reuses. Keyed by the source text; facts for a source don't
// change within a process.
const cache = new Map<string, ExtractResult>();
const EMPTY: ExtractResult = { facts: [], primarySubject: null };

/** Cached, fail-open extraction. Returns empty when the source has no numbers or
 *  the extractor errors — the caller then keeps its existing (weaker) grounding,
 *  so this can never make grounding WORSE, only tighter when it succeeds. */
export async function extractSourceFactsCached(source: string): Promise<ExtractResult> {
  const key = (source ?? '').trim();
  if (!key || !/\d/.test(key)) return EMPTY; // no numbers → nothing to bind
  const hit = cache.get(key);
  if (hit) return hit;
  let result: ExtractResult = EMPTY;
  try {
    result = await extractSourceFacts(key);
  } catch {
    result = EMPTY; // fail-open
  }
  cache.set(key, result);
  return result;
}
