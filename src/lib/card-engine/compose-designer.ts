/**
 * Composing designer (AI Designer, primitive-composition model).
 *
 * Instead of picking one of ~5 named templates, this asks the model to COMPOSE
 * a slide from the freeform primitive set (text / rectangle / circle / line) on
 * the 960×540 canvas — reasoning about hierarchy, focal point, whitespace, and
 * arrangement to achieve a stated intent. Absence of a named shape is not a
 * limit: a "table" is lines + text cells, a crescent is two offset circles, a
 * comparison is two columns + a rule. The model composes the intent from what
 * exists.
 *
 * Output is validated freeform blocks; the existing fit/auto-layout pass + the
 * VLM judge are the safety net on top. Goes through the AI provider abstraction
 * per CLAUDE.md — no direct SDK calls.
 */
import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';
import { visionUserMessage } from '@/lib/ai-provider/vision';
import type { Card, TemplateTheme, FreeformBlock } from '@/types/card-template';

export interface ComposeInput {
  /** The slide's role — cover / stat / comparison / content / quote / etc. */
  role: string;
  /** One-line intent: what this slide should DO and feel like. */
  intent: string;
  /** The actual content to place — the designer arranges THIS, never invents copy. */
  title: string;
  points?: string[];
  subtitle?: string;
  theme: TemplateTheme;
  /** Specific failures from a prior judge pass — recompose to fix THESE. */
  feedback?: string[];
  /** Top-tier reference slide images — visual few-shot grounding. */
  references?: { data: string; mimeType: 'image/jpeg' | 'image/png' }[];
}

const BlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    // role = the SEMANTIC placeholder (PPT model). The geometry layer maps role
    // → a guaranteed type scale, so the title is always dominant and sizes are
    // consistent — the model never sets pixel sizes itself.
    role: z.enum(['title', 'subtitle', 'eyebrow', 'section', 'body', 'stat']).optional(),
    variant: z.enum(['heading', 'subheading', 'paragraph', 'metric']).optional(),
    content: z.string(),
    align: z.enum(['left', 'center', 'right']).optional(),
    color: z.string().optional(),
  }),
  z.object({
    kind: z.literal('shape'),
    shape: z.enum(['rectangle', 'circle', 'line']),
    x: z.number(), y: z.number(), w: z.number(), h: z.number(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    radius: z.number().optional(),
  }),
]);
const ComposeSchema = z.object({
  rationale: z.string(),
  blocks: z.array(BlockSchema).min(1),
});
type Composed = z.infer<typeof ComposeSchema>;

const TOOL_NAME = 'compose_slide';
const tool = {
  name: TOOL_NAME,
  description: 'Return the composed slide as ordered freeform blocks (back-to-front).',
  input_schema: {
    type: 'object' as const,
    properties: {
      rationale: { type: 'string', description: 'one line: the composition idea' },
      blocks: {
        type: 'array',
        description: 'Blocks in back-to-front order (first = furthest back). Geometry in % of a 960×540 canvas; x,y = top-left.',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['text', 'shape'] },
            x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
            role: { type: 'string', enum: ['title', 'subtitle', 'eyebrow', 'section', 'body', 'stat'], description: 'text only — the SEMANTIC role. Exactly ONE "title". The engine sizes each role; you do NOT set font size.' },
            content: { type: 'string', description: 'text only — use ONLY the provided copy' },
            align: { type: 'string', enum: ['left', 'center', 'right'], description: 'text only' },
            color: { type: 'string', description: 'text only — hex' },
            shape: { type: 'string', enum: ['rectangle', 'circle', 'line'], description: 'shape only' },
            fill: { type: 'string', description: 'shape only — hex' },
            stroke: { type: 'string', description: 'shape only — hex' },
            strokeWidth: { type: 'number', description: 'shape only — px' },
            radius: { type: 'number', description: 'shape only — rectangle corner radius px' },
          },
          required: ['kind', 'x', 'y', 'w', 'h'],
        },
      },
    },
    required: ['rationale', 'blocks'],
  },
};

function systemPrompt(theme: TemplateTheme): string {
  return [
    'You are a top-tier presentation slide designer. You COMPOSE a slide from primitives on a 960×540 canvas (work in PERCENT, 0–100; x,y is the top-left corner of each block).',
    'Primitives: text (variant heading/subheading/paragraph/metric), rectangle (fill/stroke/radius), circle, line. You are NOT limited to named layouts — compose the intent from primitives (a table = lines + text cells; a divider = a line; an accent = a colored rectangle or circle behind text).',
    'Design bar (enforce all): ONE clearly dominant element; a real focal point; generous whitespace, nothing crammed to the edge; ≤3 colors with a near-neutral; legible contrast (never place text on a similar-colored fill); a committed composition, not centered-everything default. Never let blocks overlap unless intentional (e.g. text on a panel you placed behind it). Keep every block fully inside 0–100.',
    'PREMIUM is the bar — a "clean, polished template" is a FAILURE. Top-tier slides read as INTENTIONALLY DESIGNED, not safe. Do NOT default to "heading + a tidy list of points" (numbered or bulleted) — that is the template look we reject. Commit to a real composition: e.g. a large color PANEL (rectangle) holding the title on one side with content on the other; an OVERSIZED focal element (a huge number, one word, or a key phrase at 2–3× the body size); a strong asymmetric split; an editorial EYEBROW label (small all-caps, letter-spaced) above the title; a thin rule line as structure. Use the accent color as a bold surface, not just tiny markers. Make a clear compositional decision the viewer can name.',
    'GEOMETRY note: the canvas is 16:9, so a CIRCLE must be sized with width ≈ height×0.5625 in percent (e.g. w 11.25, h 20) or it renders as an oval. Prefer rectangles/panels over circles unless a round badge is truly the idea.',
    `Theme — heading font ${theme.headingFont}; body font ${theme.bodyFont}; heading color ${theme.headingColor}; body color ${theme.bodyColor}; accents ${(theme.accentColors || []).join(', ')}; page background ${theme.pageBg}. Use the theme palette; do not introduce off-palette colors.`,
    'TYPE ROLES (like PowerPoint placeholders): tag every text block with a role — "title" (the ONE main heading, must exist exactly once and be the dominant element), "subtitle" (one supporting line under the title), "eyebrow" (a small all-caps kicker above the title), "section" (a heading inside content, e.g. a card heading — ALWAYS smaller than the title), "body" (paragraph copy), "stat" (a big number). You do NOT set font sizes — the engine sizes each role and guarantees the title is largest and text never clips. Just pick the right role and give each block a sensible box.',
    'Place ONLY the copy you are given — never invent or fabricate text or numbers. Order blocks back-to-front (first = furthest back, e.g. a panel; text on top of it comes after). Return via the compose_slide tool.',
  ].join('\n\n');
}

function userPrompt(input: ComposeInput): string {
  const lines = [
    `Role: ${input.role}`,
    `Intent: ${input.intent}`,
    `Title: ${input.title}`,
  ];
  if (input.subtitle) lines.push(`Subtitle: ${input.subtitle}`);
  if (input.points?.length) lines.push(`Points (arrange these — do not pad or drop):\n${input.points.map((p) => `- ${p}`).join('\n')}`);
  if (input.feedback?.length) {
    lines.push(`\nYour PREVIOUS attempt was REJECTED by the design judge for:\n${input.feedback.map((f) => `- ${f}`).join('\n')}\nRecompose to fix these specifically. Be BOLDER — commit to a real designed composition, not a cleaner version of the same template.`);
  }
  lines.push('\nCompose the slide. Decide the arrangement, hierarchy, and any primitive shapes (panels, rules, accents) that serve the intent.');
  return lines.join('\n');
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
let seq = 0;

// ── Type-role geometry layer (the PPT-placeholder guarantee) ────────────────
// The designer picks a ROLE; this layer owns the pixels: a fixed type scale
// (title is always dominant) + autofit (shrink-to-floor, then grow the box) so
// text NEVER clips. Px sizes are for the 960×540 canvas.
type Role = 'title' | 'subtitle' | 'eyebrow' | 'section' | 'body' | 'stat';
const ROLE_STYLE: Record<Role, { variant: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing?: number }> = {
  title:    { variant: 'heading',    fontSize: 42, fontWeight: 800, lineHeight: 1.1 },
  subtitle: { variant: 'subheading', fontSize: 19, fontWeight: 400, lineHeight: 1.35 },
  eyebrow:  { variant: 'subheading', fontSize: 13, fontWeight: 700, lineHeight: 1.2, letterSpacing: 2 },
  section:  { variant: 'subheading', fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
  body:     { variant: 'paragraph',  fontSize: 16, fontWeight: 400, lineHeight: 1.4 },
  stat:     { variant: 'metric',     fontSize: 46, fontWeight: 800, lineHeight: 1.0 },
};
const ROLE_FLOOR: Record<Role, number> = { title: 26, subtitle: 13, eyebrow: 11, section: 14, body: 12, stat: 24 };

const VARIANT_TO_ROLE: Record<string, Role> = { heading: 'section', subheading: 'section', paragraph: 'body', metric: 'stat' };

/** Estimate rendered text height (px) for a box of the given pixel width. */
function estHeight(text: string, fontSize: number, boxWpx: number, lineHeight: number): number {
  const cpl = Math.max(1, Math.floor((boxWpx - 10) / (fontSize * 0.55)));
  let lines = 0;
  for (const ln of String(text).split('\n')) lines += Math.max(1, Math.ceil((ln.length || 1) / cpl));
  return lines * fontSize * lineHeight + 8;
}

/** Map the designer's output to FreeformBlock[], enforcing the type scale +
 *  autofit so the title is dominant and text never clips. */
function toFreeform(composed: Composed): FreeformBlock[] {
  const W = 960, H = 540;
  // 1. Resolve a role for every text block.
  const roles = composed.blocks.map((b) =>
    b.kind === 'text' ? ((b.role as Role) ?? VARIANT_TO_ROLE[b.variant ?? 'paragraph'] ?? 'body') : null,
  );
  // 2. Guarantee exactly ONE title: if none, promote the topmost text block; if
  //    several, keep the topmost and demote the rest to section.
  const titleIdx = roles.map((r, i) => (r === 'title' ? i : -1)).filter((i) => i >= 0);
  if (titleIdx.length === 0) {
    let best = -1, bestY = Infinity;
    composed.blocks.forEach((b, i) => { if (b.kind === 'text' && b.y < bestY) { bestY = b.y; best = i; } });
    if (best >= 0) roles[best] = 'title';
  } else if (titleIdx.length > 1) {
    const keep = titleIdx.reduce((a, i) => (composed.blocks[i].y < composed.blocks[a].y ? i : a), titleIdx[0]);
    titleIdx.forEach((i) => { if (i !== keep) roles[i] = 'section'; });
  }

  return composed.blocks.map((b, i): FreeformBlock => {
    const base = { id: `cmp-${++seq}-${i}`, x: clamp(b.x), y: clamp(b.y), w: clamp(b.w, 1, 100), h: clamp(b.h, 1, 100), rotation: 0, z: i + 1 };
    if (b.kind !== 'text') {
      return {
        ...base, type: 'shape', shape: b.shape,
        ...(b.fill ? { fill: b.fill } : {}),
        ...(b.stroke ? { stroke: b.stroke } : {}),
        ...(b.strokeWidth != null ? { strokeWidth: b.strokeWidth } : {}),
        ...(b.radius != null ? { borderRadius: b.radius } : {}),
      } as FreeformBlock;
    }
    const role = roles[i] as Role;
    const rs = ROLE_STYLE[role];
    // Autofit: shrink to the role floor to fit the box; if it still overflows,
    // grow the box height (clamped to the canvas) — never clip.
    const boxW = base.w / 100 * W;
    let fs = rs.fontSize;
    const floor = ROLE_FLOOR[role];
    while (fs > floor && estHeight(b.content, fs, boxW, rs.lineHeight) > base.h / 100 * H) fs -= 1;
    const needPx = estHeight(b.content, fs, boxW, rs.lineHeight);
    if (needPx > base.h / 100 * H) base.h = Math.min(100 - base.y, (needPx / H) * 100);
    return {
      ...base, type: 'text', variant: rs.variant, content: b.content,
      style: {
        fontSize: fs, fontWeight: rs.fontWeight, lineHeight: rs.lineHeight,
        ...(rs.letterSpacing ? { letterSpacing: rs.letterSpacing } : {}),
        ...(b.color ? { color: b.color } : {}),
        ...(b.align ? { textAlign: b.align } : {}),
      },
    } as FreeformBlock;
  });
}

export async function composeSlide(
  input: ComposeInput,
): Promise<{ blocks: FreeformBlock[]; rationale: string } | { error: string }> {
  try {
    const provider = getProvider();
    // Visual few-shot: when references are supplied, show the model the top-tier
    // exemplars FIRST, then ask it to compose in the same spirit.
    const refIntro =
      'The image(s) above are TOP-TIER reference slides. Study their composition — the dominant title, the editorial eyebrow, the structured panels/cards, the rules, the generous whitespace, the restraint and hierarchy. Foxit Slides THIS slide to that same standard (your own content, not theirs):\n\n';
    const messages = input.references?.length
      ? [visionUserMessage(input.references, refIntro + userPrompt(input))]
      : [{ role: 'user' as const, content: userPrompt(input) }];
    const response = await provider.createMessage({
      model: getModel(),
      max_tokens: 2000,
      system: systemPrompt(input.theme),
      messages,
      tools: [tool],
      tool_choice: { type: 'tool', name: TOOL_NAME },
    });
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return { error: 'Designer returned no composition' };
    // Robustness: the model occasionally omits the `kind` discriminator. Infer it
    // from the block's fields (a `shape` field ⇒ shape; `variant`/`content` ⇒ text)
    // so one stray block never drops the whole composition to a fallback.
    const raw = toolUse.input as { blocks?: Record<string, unknown>[] };
    const SHAPES = ['rectangle', 'circle', 'line', 'arrow'];
    const VARIANTS = ['heading', 'subheading', 'paragraph', 'metric'];
    if (Array.isArray(raw?.blocks)) {
      raw.blocks = raw.blocks.map((b) => {
        const k = b.kind as string | undefined;
        if (k === 'text' || k === 'shape') return b;
        // Missing OR wrong discriminator — derive it from the block's real fields
        // (a `shape` field or shape-named kind ⇒ shape; otherwise text).
        if (b.shape || SHAPES.includes(k ?? '')) {
          return { ...b, kind: 'shape', shape: (b.shape as string) ?? k };
        }
        return {
          ...b, kind: 'text',
          variant: VARIANTS.includes((b.variant as string) ?? '') ? b.variant
            : VARIANTS.includes(k ?? '') ? k : 'paragraph',
        };
      });
    }
    const parsed = ComposeSchema.safeParse(raw);
    if (!parsed.success) return { error: `Composition failed validation: ${parsed.error.message}` };
    return { blocks: toFreeform(parsed.data), rationale: parsed.data.rationale };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Build a Card whose freeform layer IS the composed slide (for SlideStage/capture). */
export function composedCard(blocks: FreeformBlock[], base?: Partial<Card>): Card {
  return {
    id: base?.id ?? 'composed', layout: 'single', style: base?.style ?? 'default',
    columns: [], freeform: blocks, ...base,
  } as Card;
}
