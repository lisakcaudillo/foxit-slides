/**
 * Structured-engine images (POC, 2026-06-17).
 *
 * The structured generation path (structure-fill.ts → buildStructureTemplate)
 * builds cards in the FREEFORM layer but renders ZERO images — its decoration
 * model has no image primitive, so covers fall back to flat skin color. The
 * freeform layer ALREADY renders `type:'image'` blocks (the same path as a
 * clipboard image paste / library drag-drop), so an image can ride that layer
 * without a schema change.
 *
 * This module is the minimal, additive bridge: pick two DIFFERENT library
 * images and stamp them onto two slides of a built deck —
 *   • Cover  → a full-bleed image BEHIND the text (z=0). Legibility is handled
 *              by the renderer's built-in full-bleed scrim (it stamps
 *              slideDesign.imageRole='full-bleed' and clear the skin text color
 *              so the renderer forces a legible light color) — no pixel sampling.
 *   • Content → an image on ONE SIDE (right inset panel); the text column is
 *              narrowed to the left so the two never overlap, then re-fit.
 *
 * Image SELECTION (2026-06-17): cover matches the DECK topic; content matches the
 * SPLIT SLIDE's own focus (per-slide relevance). Either can be overridden by an
 * explicit library image id (the user's pick) via pickDeckImages opts.
 *
 * SCOPE: this is the image POC only — NOT the full image-role system. It is
 * opt-in (generateStructuredDeck's `withImages`) and touches nothing else.
 */

import { z } from 'zod';
import OpenAI from 'openai';
import type { Card, FreeformBlock, FreeformImageBlock, FreeformShapeBlock } from '@/types/card-template';
import {
  searchLibrary,
  genericLibraryImages,
  findLibraryImagesByIds,
  findLibraryImageByPromptTag,
  saveImagesToLibrary,
  readLibraryImageDataUrl,
  type LibraryImage,
  type LibraryMatch,
} from '@/lib/imageLibrary';
import { searchStockImages, stockImagesAvailable } from '@/lib/stockImages';
import { fitCardText } from './text-fit';
import { recordUsage } from './usage-meter';

/** Library files are served statically by Next from /library/images/<filename>. */
function librarySrc(img: LibraryImage): string {
  return `/library/images/${img.filename}`;
}

/** % of the frame width that the text column may occupy on a split slide. The
 *  image panel starts past this, leaving a gutter — text and image never meet. */
const TEXT_RIGHT_LIMIT = 50;
/** Right-side image panel geometry (% of frame). Inset + rounded reads as an
 *  intentional split rather than an edge-bleed crop. */
const SIDE_PANEL = { x: 54, y: 9, w: 42, h: 82 } as const;

export interface DeckImages {
  cover?: LibraryImage;
  content?: LibraryImage;
}

export interface PickImagesOpts {
  /** Query the COVER image matches — the whole-deck topic (+ source). */
  coverQuery: string;
  /** Query the CONTENT (split-slide) image matches — that slide's own focus, so
   *  a "Solar Power" slide gets a solar image rather than a generic deck image. */
  contentQuery: string;
  /** Explicit user override: use exactly this library image id for the cover. */
  coverImageId?: string;
  /** Explicit user override: use exactly this library image id for the content. */
  contentImageId?: string;
  /** Skip the cover image entirely (faithful typographic covers take no image —
   *  see coverAcceptsImage). The content slide then gets the unrestricted best
   *  match instead of the runner-up. */
  skipCover?: boolean;
}

// ── Rate → threshold → generate (2026-07-01) ────────────────────────────────
// The library search (searchLibrary) does keyword-overlap prefilter well but
// misses semantic adjacency ("solar farm" ↔ "renewable energy"). This layers
// an LLM 1-5 rating on the top-N Jaccard candidates for a genuine relevance
// judgment; anything under RATING_THRESHOLD triggers a fresh gpt-image-1
// generation, saved back to the library so the next deck can reuse it.
//
// One LLM rating call handles all candidates at once (~$0.001/slot). The
// generation cost when it fires is ~$0.04-0.06 per image (medium quality).

const RATING_THRESHOLD = 4;  // 1-5 scale; below this, generate a new image
const RATING_TOP_N = 5;      // how many Jaccard candidates to send to the LLM
const RATING_MODEL = 'gpt-4o-mini';

const RatingSchema = z.object({
  ratings: z.array(z.object({
    // Index into the candidate list, so the model doesn't have to echo IDs
    // (which it sometimes hallucinates or truncates).
    index: z.number().int().min(0),
    rating: z.number().int().min(1).max(5),
    reason: z.string().max(120).optional().default(''),
  })),
});

interface RatedMatch {
  image: LibraryImage;
  rating: number;
  reason: string;
  jaccard: number;
}

/** Ask the LLM to rate each Jaccard-shortlisted candidate 1-5 for topic
 *  relevance to the slide. One call rates the whole shortlist. Returns matches
 *  sorted best-first. Fail-open: on any error it falls back to Jaccard order
 *  with the raw score mapped roughly to a 1-5. */
async function rateImageMatches(query: string, candidates: LibraryMatch[]): Promise<RatedMatch[]> {
  const fallback = (): RatedMatch[] => candidates.map((c) => ({
    image: c.image,
    // Jaccard 0-1 → 1-5 (coarse; only used when the LLM path fails).
    rating: Math.max(1, Math.min(5, Math.round(c.score * 5))),
    reason: 'jaccard-fallback',
    jaccard: c.score,
  }));
  if (!candidates.length) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback();
  try {
    const openai = new OpenAI({ apiKey });
    const summary = candidates.map((c, i) => `${i}. ${c.image.prompt.slice(0, 220)}`).join('\n');
    const system = 'You rate library images for how well their KEYWORD PROMPT matches a slide topic. Rate each 1 (unrelated) to 5 (a clear, on-topic match). Be strict — a topical-but-generic image is 3, not 4.';
    const user = `Slide topic: ${query.slice(0, 400)}\n\nCandidate library images (each line: index. keyword prompt):\n${summary}`;
    const completion = await openai.chat.completions.create({
      model: RATING_MODEL,
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'report_ratings',
          description: 'Return per-candidate 1-5 ratings.',
          parameters: {
            type: 'object',
            properties: {
              ratings: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer', minimum: 0 },
                    rating: { type: 'integer', minimum: 1, maximum: 5 },
                    reason: { type: 'string' },
                  },
                  required: ['index', 'rating'],
                },
              },
            },
            required: ['ratings'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'report_ratings' } },
    });
    if (completion.usage) {
      recordUsage('vision', {
        input: completion.usage.prompt_tokens,
        cached: completion.usage.prompt_tokens_details?.cached_tokens ?? 0,
        output: completion.usage.completion_tokens,
      });
    }
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return fallback();
    const parsed = RatingSchema.safeParse(JSON.parse(call.function.arguments));
    if (!parsed.success) return fallback();
    const rated: RatedMatch[] = [];
    for (const r of parsed.data.ratings) {
      const c = candidates[r.index];
      if (!c) continue;
      rated.push({ image: c.image, rating: r.rating, reason: r.reason || '', jaccard: c.score });
    }
    rated.sort((a, b) => b.rating - a.rating || b.jaccard - a.jaccard);
    return rated;
  } catch {
    return fallback();
  }
}

// ── Post-generation defect check (R-1 + R-2 + R-13) ──────────────────────
// gpt-image-1 disobeys "no text" instructions constantly, generates uncanny
// AI portraits when a prompt suggests a person, and sometimes returns a
// picture that visually has nothing to do with the topic. All three defects
// have been shipping in decks. This check runs on the raw PNG BEFORE it
// lands in the library: one gpt-4o-mini vision call inspects three things
// at once (shared call, ~$0.001):
//   R-1  hasText        — any visible letters/labels/logos/numbers.
//   R-2  hasPerson      — any human figure, face, or hand.
//   R-13 subjectMatch   — 1-5 how well the image matches the query brief.
// A defect (text, person, or subjectMatch < 3) → discard the PNG, retry ONCE
// with a preamble that names the previous failure. Second failure → return
// undefined; picker falls back to its next tier (library / icon).

const DefectCheckSchema = z.object({
  hasText: z.boolean(),
  hasPerson: z.boolean(),
  subjectMatch: z.number().int().min(1).max(5),
  reason: z.string().optional().default(''),
});

const SUBJECT_MATCH_THRESHOLD = 3;

async function checkImageDefects(
  imageDataUrl: string,
  query: string,
  openai: OpenAI,
): Promise<{
  hasText: boolean;
  hasPerson: boolean;
  subjectMatch: number;
  reason: string;
} | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'You inspect a generated illustration for defect classes:\n' +
            '  1. TEXT: readable WORDS or lettering that spells something — captions, labels, signs, watermarks, logos, storefront words, or paragraphs. AI renders these misspelled/garbled, so they are a defect. Do NOT flag: musical notation/notes on a staff, isolated numbers, mathematical symbols, or abstract marks/patterns — those are fine and are NOT text.\n' +
            '  2. PERSON: this is NO LONGER a defect on its own — people, faces, and portraits are allowed (real photographic people are fine). Only report hasPerson=true so the caller knows one is present.\n' +
            '  3. SUBJECT MATCH: how well the picture matches the query brief on a 1-5 scale (5 = clearly the requested subject; 3 = tangentially topical; 1 = unrelated).\n' +
            'Report via the report_image_defects tool.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Query brief: "${query.slice(0, 300)}"\n\nCheck this image against the three defect classes.` },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'report_image_defects',
          description: 'Report per-defect verdicts for this image.',
          parameters: {
            type: 'object',
            properties: {
              hasText: { type: 'boolean', description: 'True ONLY if readable WORDS/lettering that spell something are present (captions, labels, signs, logos). FALSE for musical notation, isolated numbers, or abstract marks.' },
              hasPerson: { type: 'boolean', description: 'True if a human figure/face/portrait is present. Informational only — not a defect.' },
              subjectMatch: { type: 'integer', minimum: 1, maximum: 5, description: '1-5 how well the picture matches the query brief. Strict: a topical-but-generic image is 3, not 4.' },
              reason: { type: 'string', description: 'One brief phrase naming the defect(s) if any (e.g. "brand logo bottom-right + figure of a worker"). Empty if clean.' },
            },
            required: ['hasText', 'hasPerson', 'subjectMatch'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'report_image_defects' } },
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return null;
    const parsed = DefectCheckSchema.safeParse(JSON.parse(call.function.arguments));
    if (!parsed.success) return null;
    return {
      hasText: parsed.data.hasText,
      hasPerson: parsed.data.hasPerson,
      subjectMatch: parsed.data.subjectMatch,
      reason: parsed.data.reason,
    };
  } catch {
    return null;
  }
}

/** Build the gpt-image-1 prompt. On the retry pass, an extra clause names
 *  what went wrong the first time — empirically this doubles the compliance
 *  rate versus repeating the same generic rule. */
function buildGenerationPrompt(
  query: string,
  retryReason?: string,
  retryFlags?: { hasText?: boolean; hasPerson?: boolean; offSubject?: boolean },
): string {
  const parts: string[] = [];
  if (retryReason && retryFlags) {
    const rules: string[] = [];
    if (retryFlags.hasText) rules.push('ZERO readable WORDS or lettering — no captions, labels, signs, logos, storefront words, or paragraphs. (Musical notation and abstract marks are fine; readable words are not.)');
    if (retryFlags.hasPerson) rules.push('NO identifiable people or faces — an AI-invented face reads as fake. Show the subject itself (place, object, scene) with people absent or, at most, a distant silhouette.');
    if (retryFlags.offSubject) rules.push('The image MUST clearly and directly depict the query subject, not a tangentially-related scene.');
    parts.push(`PREVIOUS ATTEMPT FAILED: ${retryReason.slice(0, 140)}. This attempt MUST correct: ${rules.join(' ')}`);
  }
  parts.push('IMPORTANT: The image must contain NO readable WORDS or lettering — no captions, labels, signs, logos, watermarks, or paragraphs of any kind (AI renders text misspelled and garbled). Musical notation, abstract marks, and numbers that are part of a real object are fine.');
  parts.push('Do NOT depict identifiable people or faces — an AI-invented face looks fake and uncanny. Show the subject itself: places, buildings, interiors, objects, landscapes, textures, hands or a distant silhouette at most. (Real, specific historical people are sourced as known photographs elsewhere — never generated here.)');
  parts.push('A realistic, editorial-quality photograph: sharp focus, natural lighting, clean composition, modern aesthetic.');
  parts.push(`Subject: ${query}`);
  parts.push('Keep the image BRIGHT, well-exposed, and naturally lit. Tasteful and natural, never oversaturated, never dim.');
  return parts.join('\n\n');
}

/** Generate a fresh image via gpt-image-1 and save it to the library. Same
 *  provider path as /api/ai/generate-image (single image, medium quality) —
 *  called directly instead of through the route to avoid a server-to-server
 *  fetch during structured generation.
 *
 *  R-1: the raw PNG is checked for baked-in text BEFORE saving. On defect,
 *  the PNG is discarded (never enters the library) and one retry fires with
 *  a stricter preamble. If the retry also fails, returns undefined so the
 *  caller falls back to its next tier (best library match or icon).
 *
 *  Returns undefined on any failure so the caller falls back to the
 *  best-available library match. */
async function generateImageForQuery(query: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<LibraryImage | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  const openai = new OpenAI({ apiKey });
  // The body+image column is a tall full-bleed slot; a landscape photo crops to an
  // awkward strip. Match the generation
  // aspect to the slot: portrait for the side column, landscape for a cover.
  const size = orientation === 'portrait' ? '1024x1536' : '1536x1024';
  const [genW, genH] = orientation === 'portrait' ? [1024, 1536] : [1536, 1024];

  // Attempt up to 2 generations. Each attempt: generate → defect-check.
  // First-attempt defect flags feed the second attempt's preamble.
  let lastReason: string | undefined;
  let lastFlags: { hasText?: boolean; hasPerson?: boolean; offSubject?: boolean } | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const prompt = buildGenerationPrompt(query, attempt === 2 ? lastReason : undefined, attempt === 2 ? lastFlags : undefined);
      const response = await openai.images.generate({
        model: 'gpt-image-1',
        prompt,
        size,
        quality: 'medium',
        n: 1,
      });
      const item = response.data?.[0];
      if (!item?.b64_json) continue;

      // R-1 + R-2 + R-13 gate: reject on text, person, or subject-mismatch.
      // If the check itself fails (null return), it conservatively TRUSTs the
      // image (fail-open) so a defect-checker outage doesn't block generation.
      const defects = await checkImageDefects(`data:image/png;base64,${item.b64_json}`, query, openai);
      if (defects) {
        const offSubject = defects.subjectMatch < SUBJECT_MATCH_THRESHOLD;
        // Generation runs only for GENERIC subjects (real entities are sourced as
        // KNOWN photos upstream), so any person here is an AI-invented face — reject
        // it. Also reject readable WORDS and off-subject images.
        if (defects.hasText || defects.hasPerson || offSubject) {
          const flags: string[] = [];
          if (defects.hasText) flags.push('text');
          if (defects.hasPerson) flags.push('ai-person');
          if (offSubject) flags.push(`subject-mismatch ${defects.subjectMatch}/5`);
          // eslint-disable-next-line no-console
          console.log(`[gen-check] reject [${flags.join(', ')}] attempt=${attempt} · "${defects.reason.slice(0, 80)}"`);
          lastReason = defects.reason;
          lastFlags = {
            hasText: defects.hasText,
            hasPerson: defects.hasPerson,
            offSubject,
          };
          continue;
        }
      }

      const [saved] = await saveImagesToLibrary([{
        dataUrl: `data:image/png;base64,${item.b64_json}`,
        prompt: `[generated] ${query}`.slice(0, 400),
        type: 'photo',
        quality: 'medium',
        width: genW,
        height: genH,
      }]);
      if (saved) {
        // eslint-disable-next-line no-console
        console.log(`[gen-check] accepted attempt=${attempt}${lastReason ? ' (after retry)' : ''}${defects ? ` · match=${defects.subjectMatch}/5` : ''}`);
      }
      return saved ?? undefined;
    } catch {
      continue;
    }
  }
  // Both attempts failed the defect check. Return undefined so the picker
  // falls back to its next tier (best-available library match or icon).
  // eslint-disable-next-line no-console
  console.log(`[gen-check] both attempts failed · giving up (query="${query.slice(0, 60)}")`);
  return undefined;
}

/** Derive the single best PHOTOGRAPHIC image subject for a slide's content, and
 *  whether it names a SPECIFIC real/historical entity (person, place, building,
 *  artwork) whose true appearance matters — those must use a KNOWN image, never a
 * fabricated AI likeness. */
async function deriveImageBrief(
  query: string,
  apiKey: string,
  avoid: string[] = [],
): Promise<{ subject: string; kind: 'real' | 'generic'; wikiTitle?: string } | null> {
  try {
    const openai = new OpenAI({ apiKey });
    const avoidLine = avoid.length
      ? `\nAlready used in THIS deck (pick a genuinely DIFFERENT subject — do NOT repeat these or a near-duplicate): ${avoid.join('; ')}. A deck reads better with variety: the person's portrait once, then their world (their instrument, a manuscript, a hall, a city) — not the same face on every slide.`
      : '';
    const c = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content:
            'Given a slide topic, name the single best PHOTOGRAPHIC image subject for it. Return {subject, kind, wikiTitle}.\n' +
            'kind="real" when the subject is a SPECIFIC real/historical named person, place, building, or artwork whose actual appearance matters (Mozart, the Eiffel Tower, the Mona) — it should use a KNOWN image, not a generated one. Set wikiTitle to the exact Wikipedia article title for it.\n' +
            'kind="generic" when it is a concept/object/scene that can be freely illustrated (a grand piano, a candlelit music room, a laboratory, autumn light). Leave wikiTitle empty.\n' +
            'Prefer a concrete, evocative, photograph-able subject. The image will contain NO readable words.' +
            avoidLine,
        },
        { role: 'user', content: `Slide topic: "${query.slice(0, 240)}"` },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'image_brief',
          parameters: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: 'The concrete photographic subject.' },
              kind: { type: 'string', enum: ['real', 'generic'] },
              wikiTitle: { type: 'string', description: 'Exact Wikipedia article title if kind=real; else empty.' },
            },
            required: ['subject', 'kind'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'image_brief' } },
    });
    const call = c.choices[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function') return null;
    const p = JSON.parse(call.function.arguments) as { subject?: string; kind?: string; wikiTitle?: string };
    if (!p.subject) return null;
    return { subject: String(p.subject), kind: p.kind === 'real' ? 'real' : 'generic', wikiTitle: p.wikiTitle || undefined };
  } catch {
    return null;
  }
}

const WIKI_UA = 'Foxit Slides/1.0 (slide image sourcing; contact via app)';

/** Non-photo Wikimedia media it never wants as an entity's image: logos, icons,
 *  SVG line-art, maps, flags, seals, and drawn caricatures/calligrams (the last
 *  two are text/line art, not photographs). */
const NON_PHOTO_TITLE = /(logo|icon|\bseal\b|flag|coat[_ ]of[_ ]arms|_map|locator|caricature|calligramme|calligram|diagram|\.svg$)/i;

/** Pull an ORDERED list of candidate PHOTO URLs for a Wikipedia article from its
 *  media list — the summary endpoint often returns a LOGO (e.g. Eiffel_Tower →
 *  Eiffel_Tower_logo.svg), whereas the media list holds the real photographs.
 *  Photos (jpg) first, logos/SVGs/line-art dropped. Largest srcset per item. */
async function wikimediaPhotoCandidates(title: string): Promise<string[]> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`, {
      headers: { accept: 'application/json', 'User-Agent': WIKI_UA },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: { type?: string; title?: string; srcset?: { src?: string }[] }[] };
    const imgs = (data.items ?? []).filter((i) => i.type === 'image' && !NON_PHOTO_TITLE.test(i.title ?? ''));
    // Photos are almost always JPG; PNG on Wikimedia is usually graphics/line-art.
    imgs.sort((a, b) => (/\.jpe?g$/i.test(b.title ?? '') ? 1 : 0) - (/\.jpe?g$/i.test(a.title ?? '') ? 1 : 0));
    return imgs
      .map((i) => i.srcset?.[i.srcset.length - 1]?.src ?? i.srcset?.[0]?.src ?? '')
      .filter(Boolean)
      .map((u) => (u.startsWith('//') ? `https:${u}` : u));
  } catch {
    return [];
  }
}

/** Source a real PHOTOGRAPH of a known entity from Wikimedia and save it to the
 *  library. No auth needed. LIBRARY-FIRST: an entity it has already sourced is
 *  reused (matched by a canonical `[known:<title>]` tag) — no duplicate save
 *. Picks from the article's MEDIA LIST (not the summary lead,
 *  which is often a logo) and skips any candidate with baked-in text/lettering,
 * so posters, logos, and calligrams never slip through. */
async function fetchKnownImage(subject: string, wikiTitle?: string): Promise<LibraryImage | undefined> {
  const title = (wikiTitle || subject).trim().replace(/\s+/g, '_');
  const tag = `[known:${title}]`;
  // Reuse a previously-saved known image of this same entity.
  const existing = await findLibraryImageByPromptTag(tag);
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[known-image] reuse "${existing.filename}" for ${tag} (no re-fetch)`);
    return existing;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  try {
    // The web page it credits (Wikipedia/Wikimedia images require attribution).
    const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { accept: 'application/json', 'User-Agent': WIKI_UA },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as { originalimage?: { source?: string }; content_urls?: { desktop?: { page?: string } } } | null;
    const sourceUrl = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;

    // Real photos from the media list, then the summary lead as a last resort.
    const candidates = await wikimediaPhotoCandidates(title);
    const lead = summary?.originalimage?.source;
    if (lead && !/\.svg/i.test(lead) && !candidates.includes(lead)) candidates.push(lead);

    for (const url of candidates.slice(0, 5)) {
      const imgRes = await fetch(url, { headers: { 'User-Agent': WIKI_UA } }).catch(() => null);
      if (!imgRes || !imgRes.ok) continue;
      const ct = imgRes.headers.get('content-type') || 'image/jpeg';
      if (ct.includes('svg')) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const dataUrl = `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
      // Reject any candidate with readable words baked in (poster / logo / caption).
      if (apiKey) {
        const d = await checkImageDefects(dataUrl, subject, new OpenAI({ apiKey }));
        if (d && d.hasText) {
          // eslint-disable-next-line no-console
          console.log(`[known-image] skip text-in-image candidate for "${subject}"`);
          continue;
        }
      }
      const [saved] = await saveImagesToLibrary([{
        dataUrl,
        // The `[known:<title>]` tag is the dedup key the library-first lookup matches.
        prompt: `${tag} ${subject}`.slice(0, 400),
        type: 'photo',
        quality: 'medium',
        width: 800,
        height: 600,
        sourceUrl,
        sourceLabel: 'Wikipedia',
      }]);
      if (saved) return saved;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Source a free STOCK photo (Pexels → Pixabay) for a generic subject and save it
 *  to the library. Real photos, free for commercial use, no attribution required —
 *  so this is preferred over AI generation (no cost, no fake people / garbled text)
 *  for generic subjects. Rejects a candidate with baked-in TEXT (a real person is
 *  fine — unlike an AI-invented face). Orientation matches the slot. Returns
 *  undefined when no key is set or nothing clean matches (caller falls back to gen). */
async function fetchStockImage(query: string, orientation: 'portrait' | 'landscape'): Promise<LibraryImage | undefined> {
  if (!stockImagesAvailable()) return undefined;
  const apiKey = process.env.OPENAI_API_KEY;
  try {
    const results = await searchStockImages(query, { perPage: 12, orientation });
    for (const r of results.slice(0, 6)) {
      const imgRes = await fetch(r.url).catch(() => null);
      if (!imgRes || !imgRes.ok) continue;
      const ct = imgRes.headers.get('content-type') || 'image/jpeg';
      if (ct.includes('svg')) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const dataUrl = `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
      // Stock photos are real, so PEOPLE are fine; reject only readable words.
      if (apiKey) {
        const d = await checkImageDefects(dataUrl, query, new OpenAI({ apiKey }));
        if (d && d.hasText) {
          // eslint-disable-next-line no-console
          console.log(`[stock] skip text-in-image candidate for "${query}"`);
          continue;
        }
      }
      const [saved] = await saveImagesToLibrary([{
        dataUrl,
        // Credit kept for provenance (Pexels/Pixabay need no on-slide attribution).
        prompt: `[stock:${r.source}] ${query} — ${r.credit}`.slice(0, 400),
        type: 'photo',
        quality: 'medium',
        width: r.width || 1200,
        height: r.height || 800,
        sourceLabel: r.credit,
      }]);
      if (saved) {
        // eslint-disable-next-line no-console
        console.log(`[stock] ${r.source} photo for "${query}" (${r.credit})`);
        return saved;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Pick the best image for a slide's content. The subject is DERIVED from the content
 *  (the system decides what image fits the story); a real/historical entity uses a
 *  KNOWN image, a generic subject prefers a library match → a free STOCK photo →
 *  (last resort) a fresh AI generation. Returns no image rather than an off-topic
 *  one. `taken` prevents duplicate picks. */
export async function pickForSlot(
  query: string,
  taken: Set<string>,
  usedSubjects?: Set<string>,
  orientation: 'portrait' | 'landscape' = 'portrait',
): Promise<{ image: LibraryImage | undefined; note: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const brief = apiKey ? await deriveImageBrief(query, apiKey, usedSubjects ? [...usedSubjects] : []) : null;
  const subject = brief?.subject || query;
  // Remember the subject so later slides in the same deck pick something different
  // (a biography shouldn't be the same portrait on every slide).
  if (usedSubjects && subject) usedSubjects.add(subject);

  // Real/historical entity → a KNOWN image (never a fabricated likeness).
  if (brief?.kind === 'real') {
    const known = await fetchKnownImage(subject, brief.wikiTitle);
    if (known && !taken.has(known.id)) return { image: known, note: `known-image "${subject}"${brief.wikiTitle ? ` (wiki:${brief.wikiTitle})` : ''}` };
  }

  // Library match on the derived subject → threshold or generate a fresh image.
  const shortlist = (await searchLibrary(subject, RATING_TOP_N)).filter((m) => !taken.has(m.image.id));
  const rated = await rateImageMatches(subject, shortlist);
  const best = rated[0];
  if (best && best.rating >= RATING_THRESHOLD) {
    // Quality gate for OLDER library images (AI-generated batches / imports) that
    // may carry uncanny faces or garbled words. Already-vetted
    // real photos — stock / known — are exempt: their people are REAL, not fake.
    const vetted = /^\[(stock|known)/.test(best.image.prompt || '');
    let libClean = true;
    if (!vetted && apiKey) {
      const dataUrl = await readLibraryImageDataUrl(best.image.filename);
      if (dataUrl) {
        const d = await checkImageDefects(dataUrl, subject, new OpenAI({ apiKey }));
        if (d && (d.hasPerson || d.hasText)) {
          libClean = false;
          // eslint-disable-next-line no-console
          console.log(`[lib-quality] reject "${best.image.filename}" [${[d.hasPerson && 'person', d.hasText && 'text'].filter(Boolean).join(', ')}] → stock/generate "${subject}"`);
        }
      }
    }
    if (libClean) return { image: best.image, note: `library ${best.rating}/5 · "${subject}"` };
  }
  // Generic subjects: a free STOCK photo (real, no cost, no fake people) BEFORE an
  // AI generation. A generated portrait of a REAL entity would be a fabricated
  // likeness, so a real entity with no known image is simply skipped.
  if (brief?.kind !== 'real') {
    const stock = await fetchStockImage(subject, orientation);
    if (stock && !taken.has(stock.id)) {
      return { image: stock, note: `stock "${subject}" (best library ${best ? `${best.rating}/5` : 'none'})` };
    }
    const generated = await generateImageForQuery(subject, orientation);
    if (generated && !taken.has(generated.id)) {
      return { image: generated, note: `generated "${subject}" (stock unavailable)` };
    }
  }
  return { image: undefined, note: `skipped: no image for "${subject}" (kind=${brief?.kind ?? 'unknown'})` };
}

/**
 * Pick the cover + content images. Each runs the rating pipeline
 * (Jaccard prefilter → LLM 1-5 rating → threshold or generate). An explicit
 * library image id skips the pipeline entirely. The two are always DIFFERENT
 * when the library has the choice. Returns `{}` slots the pipeline can't fill.
 *
 * `pickNotes` is a shared array the caller may pass to collect the per-slot
 * decision trail — mainly for the structure-fill log.
 */
export interface PickResult extends DeckImages {
  /** Per-slot notes describing which path chose each image ("library 5/5 …",
   *  "generated (best 3/5)", etc.). Same order as the DeckImages fields. */
  notes: { slot: 'cover' | 'content'; note: string }[];
}

export async function pickDeckImages(opts: PickImagesOpts): Promise<PickResult> {
  const overrides = await findLibraryImagesByIds(
    [opts.coverImageId, opts.contentImageId].filter((x): x is string => !!x),
  );
  const taken = new Set<string>();
  const notes: PickResult['notes'] = [];

  let cover: LibraryImage | undefined;
  if (!opts.skipCover) {
    if (opts.coverImageId) {
      cover = overrides[opts.coverImageId];
      notes.push({ slot: 'cover', note: `override id=${opts.coverImageId}` });
    } else {
      const r = await pickForSlot(opts.coverQuery, taken);
      cover = r.image;
      notes.push({ slot: 'cover', note: r.note });
    }
  }
  if (cover) taken.add(cover.id);

  let content: LibraryImage | undefined;
  if (opts.contentImageId) {
    content = overrides[opts.contentImageId];
    notes.push({ slot: 'content', note: `override id=${opts.contentImageId}` });
  } else {
    const r = await pickForSlot(opts.contentQuery, taken);
    content = r.image;
    notes.push({ slot: 'content', note: r.note });
  }

  return { cover, content, notes };
}

/**
 * Stamp a full-bleed cover image BEHIND the card's text, then hand legibility to
 * the renderer's built-in full-bleed treatment: setting `slideDesign.imageRole =
 * 'full-bleed'` makes FreeformLayer paint a soft dark scrim over the photo and
 * force light text (SCRIM_PRESET['full-bleed'], alpha 0.68). it deliberately does
 * NOT set text colors ourselves — an explicit `style.color` makes resolveTextColor
 * bail out (it respects deliberate user colors), which would defeat the flip.
 * Mutates `card`.
 */
/** A DISCREET credit for an image it dids NOT create: a Wikimedia photo (its
 *  page — attribution required) or a stock photo (photographer credit — the
 *  Pexels/Pixabay API guidelines ask for it). Returns null for images it
 *  generated. A tiny italic tag hugged to the image's bottom-right — sized to the
 *  text (not a wide bar), faint dark backing just enough to stay legible over any
 *  image AND survive the PPTX export (a plain text shadow does not). FRAME %. */
function sourceCaptionBlock(img: LibraryImage, box: { x: number; y: number; w: number; h: number }): FreeformShapeBlock | null {
  // Stock photos carry a photographer credit (sourceLabel); Wikimedia carries the
  // page URL (sourceUrl). Either one → render the credit.
  let content = '';
  if (img.sourceUrl) {
    const url = img.sourceUrl.replace(/^https?:\/\//, '').replace(/^www\./, '');
    content = `Source: ${url.length > 40 ? `${url.slice(0, 39)}…` : url}`;
  } else if (img.sourceLabel) {
    content = img.sourceLabel.length > 44 ? `${img.sourceLabel.slice(0, 43)}…` : img.sourceLabel;
  } else {
    return null;
  }
  const FRAME_W = 960;
  const fontSize = 7;
  // Size the tag GENEROUSLY to the text so it stays on ONE line (a too-tight box
  // wraps + clips inside the ~14px pill). Over-estimate the glyph advance; the
  // credit is capped at 44 chars so it never exceeds the image width.
  const textPct = ((content.length * fontSize * 0.64 + 20) / FRAME_W) * 100;
  const w = Math.min(box.w - 1.4, textPct);
  const h = 2.7; // declared one-line height
  const SAFE = 0.7; // % margin from the slide edge
  // Hug the image's bottom-right, but CLAMP into the slide's safe area. Two things
  // push the credit off-canvas otherwise: (1) image boxes can BLEED off the slide
  // edge (full-bleed layouts), carrying the credit with them; (2) the pill renders
  // CONTENT-sized (padding + line-height) — ~28px ≈ 5.5% tall, NOT the tiny declared
  // h — and grows symmetrically around the box CENTER, so its rendered bottom sits
  // ~2.6% below the declared box. Both were verified against a measured DOM rect
  // ([799,515 154×28] → bottom 543 > 540). Width renders ≈ the declared w (the text
  // estimate already sizes it), so only Y needs the render-growth headroom.
  const RENDER_H = 5.5; // over-estimate of the rendered pill height, in %
  const x = Math.max(SAFE, Math.min(box.x + box.w - w - 0.7, 100 - w - SAFE));
  const yMax = 100 - SAFE - (RENDER_H + h) / 2; // declared top s.t. rendered bottom stays on-slide
  const y = Math.max(SAFE, Math.min(box.y + box.h - 3.3, yMax));
  return {
    id: `ff-img-source-${img.id}`,
    type: 'shape',
    shape: 'rectangle',
    borderRadius: 2,
    fill: 'rgba(0,0,0,0.32)',
    content,
    x,
    y,
    w,
    h,
    rotation: 0,
    z: 200, // above the image (and its scrim)
    textStyle: {
      fontSize,
      fontWeight: 400,
      color: '#EDEDED',
      italic: true,
      textAlign: 'right',
    },
  };
}

/** Place a sourced image into an imported layout's manifest image slot — at the
 *  slot's own geometry (960×540 design points → %), behind the text (z<100). No
 *  scrim, no text reflow: side-by-side image layouts keep image and text in
 *  separate regions, so the theme paints the background + text unchanged. A small
 *  source credit is added for images it didn't create (Wikipedia etc.). */
export function applyManifestImage(
  card: Card,
  img: LibraryImage,
  geo: { x: number; y: number; w: number; h: number },
): void {
  const FRAME_W = 960;
  const FRAME_H = 540;
  const boxPct = {
    x: (geo.x / FRAME_W) * 100,
    y: (geo.y / FRAME_H) * 100,
    w: (geo.w / FRAME_W) * 100,
    h: (geo.h / FRAME_H) * 100,
  };
  const block: FreeformImageBlock = {
    id: `ff-img-slot-${Math.round(geo.x)}-${Math.round(geo.y)}-${img.id}`,
    type: 'image',
    src: librarySrc(img),
    alt: '',
    fit: 'cover',
    ...boxPct,
    rotation: 0,
    z: 1, // behind text (z≥100), above the skin background
  };
  const caption = sourceCaptionBlock(img, boxPct);
  card.freeform = [...(card.freeform ?? []), block, ...(caption ? [caption] : [])];
}

/** Turn an imported OVERLAY image layout (text sits on the image) legible: clear
 *  the skin's ink so the renderer measures text against the scrim and forces a
 *  legible color, and trigger the renderer's assertive scrim concentrated in the
 *  overlaid text's zone. The scrim is dark-over-photo (theme-independent — it sits
 *  on the image, not the theme background), so this reads on any skin. Call AFTER
 *  applyManifestImage has placed the image. */
export function applyOverlayScrim(card: Card, zone: NonNullable<Card['slideDesign']>['textSafeZone']): void {
  for (const b of card.freeform ?? []) {
    if (b.type === 'text' && b.style) b.style = { ...b.style, color: undefined };
  }
  const base: NonNullable<Card['slideDesign']> = card.slideDesign ?? {
    slideId: card.id,
    role: 'point',
    contentBudget: { headingMaxWords: 12, bodyMaxWords: 40 },
    themeArchetype: 'editorial',
    source: 'auto',
    imageRole: 'none',
    textSafeZone: zone,
  };
  card.slideDesign = { ...base, imageRole: 'full-bleed', textSafeZone: zone };
}

export function applyCoverImage(card: Card, img: LibraryImage): void {
  const blocks = card.freeform ?? [];
  // The structure builder stamps the skin's ink color on every text block, but
  // resolveTextColor (FreeformLayer) bails on an explicit color — which would
  // defeat the scrim's forced-light flip. Clear it so the renderer measures the
  // text against the scrim and pins a legible (light) color over the photo.
  for (const b of blocks) {
    if (b.type === 'text' && b.style) b.style = { ...b.style, color: undefined };
  }
  const bleed: FreeformImageBlock = {
    id: `ff-img-cover-${img.id}`,
    type: 'image',
    src: librarySrc(img),
    alt: '',
    fit: 'cover',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    z: 0, // behind decorations (z≥1) and text (z≥100)
  };
  const caption = sourceCaptionBlock(img, { x: 0, y: 0, w: 100, h: 100 });
  card.freeform = [bleed, ...blocks, ...(caption ? [caption] : [])];

  // Trigger the renderer's scrim + forced-light text. Preserve any existing
  // slideDesign fields; override only the image role + a full-card safe zone.
  const base: NonNullable<Card['slideDesign']> = card.slideDesign ?? {
    slideId: card.id,
    role: 'cover',
    contentBudget: { headingMaxWords: 12, bodyMaxWords: 40 },
    themeArchetype: 'editorial',
    source: 'auto',
    imageRole: 'none',
    textSafeZone: 'full',
  };
  card.slideDesign = { ...base, imageRole: 'full-bleed', textSafeZone: 'full' };
}

/**
 * Reserve the RIGHT panel for the image and keep all text in the LEFT column, so
 * the two can never overlap. A block that STARTS in the right column (e.g. Volt's
 * 05-content places its 3 item cards at x≈56%) would collide with — or hide
 * behind — the image, so it is DROPPED rather than crammed under the left-column
 * title (the old behavior stacked title↔items and they overlapped). The result
 * is a clean "content + image" slide: eyebrow / title / lead on the left, image
 * on the right. Left-column blocks that merely spill past the gutter are clamped.
 * Mutates `card`.
 */
export function applySplitImage(card: Card, img: LibraryImage): void {
  const blocks: FreeformBlock[] = card.freeform ?? [];

  // Keep the image + any block that starts left of the gutter; drop right-column
  // blocks (they belong where the image now lives).
  const kept = blocks.filter((b) => b.type === 'image' || b.x < TEXT_RIGHT_LIMIT);
  for (const b of kept) {
    if (b.type !== 'image' && b.x + b.w > TEXT_RIGHT_LIMIT) {
      b.w = Math.max(4, TEXT_RIGHT_LIMIT - b.x);
    }
  }

  const panel: FreeformImageBlock = {
    id: `ff-img-side-${img.id}`,
    type: 'image',
    src: librarySrc(img),
    alt: '',
    fit: 'cover',
    frameShape: 'rounded',
    x: SIDE_PANEL.x,
    y: SIDE_PANEL.y,
    w: SIDE_PANEL.w,
    h: SIDE_PANEL.h,
    rotation: 0,
    z: 1,
  };
  card.freeform = [...kept, panel];

  // Text boxes are now narrower — re-fit (shrink/trim, never grow) so nothing
  // spills past the gutter into the image.
  fitCardText(card);
}
