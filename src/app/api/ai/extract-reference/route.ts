/**
 * Reference-upload extraction route.
 *
 * Phase 1: accepted only a textual content string. Phase 1.5 expands this to
 * also accept binary files (PDF / DOCX / PPTX) via multipart upload — the
 * route detects the format, runs the file through Foxit text extraction
 * (Conversion SDK for Office → PDF, then PDF text extraction), and feeds the
 * extracted text to Claude. A second tool call now produces theme tokens
 * (palette + fonts) modelled after theme-from-inspiration skill so the
 * generated deck can adopt the reference's visual character.
 *
 * Request shapes
 *   - JSON  { content, fileName?, mode }                  — text-like refs (.txt, .md, pasted)
 *   - Multipart { file, mode } as FormData                — binary refs (PDF/DOCX/PPTX)
 *
 * Response: ReferenceHints (tone, audience, audienceDescription,
 *   optional structureHint, optional theme).
 *
 * Spec: .apm/design-specs/reference-upload-phase1.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getProvider, getModel } from '@/lib/ai-provider';

// ── Schemas ───────────────────────────────────────────────────────────────

const ThemeHintSchema = z.object({
  /** Palette: 3–5 hex strings (#RRGGBB). First is the dominant accent. */
  accentColors: z.array(z.string()).min(1).max(8),
  /** Hex page background. */
  pageBg: z.string(),
  /** Hex card surface background. */
  cardBg: z.string(),
  /** Hex heading text color. */
  headingColor: z.string(),
  /** Hex body text color. */
  bodyColor: z.string(),
  /** Heading font family (Google Fonts name). */
  headingFont: z.string(),
  /** Body font family (Google Fonts name). */
  bodyFont: z.string(),
});
export type ThemeHint = z.infer<typeof ThemeHintSchema>;

const ReferenceHintsSchema = z.object({
  tone: z.string(),
  audience: z.string(),
  audienceDescription: z.string(),
  structureHint: z.array(z.string()).optional(),
  theme: ThemeHintSchema.optional(),
});
export type ReferenceHints = z.infer<typeof ReferenceHintsSchema>;

const MODE_VALUES = ['inspire', 'inspire-structure'] as const;
type Mode = (typeof MODE_VALUES)[number];

// ── Claude tool definitions ───────────────────────────────────────────────

const EXTRACT_TOOL = {
  name: 'extract_reference_hints',
  description: 'Extract tone, audience, and (optionally) structural outline from a reference document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tone: {
        type: 'string',
        description: 'A vivid one-line tone description (e.g., "polished and authoritative with crisp data callouts", "warm conversational founder voice").',
      },
      audience: {
        type: 'string',
        description: 'Short label for who the reference is written for (e.g., "Series-A investors", "engineering team leads", "newly hired sales reps").',
      },
      audienceDescription: {
        type: 'string',
        description: 'One-sentence elaboration of the audience — what they care about, their context.',
      },
      structureHint: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional outline — 3 to 10 short section titles that mirror the reference\'s structural shape. Only populate when explicitly asked for.',
      },
    },
    required: ['tone', 'audience', 'audienceDescription'],
  },
};

const THEME_TOOL = {
  name: 'extract_theme_tokens',
  description: 'Extract a visual theme (palette + typography) inspired by the reference document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      accentColors: {
        type: 'array',
        items: { type: 'string' },
        description: '3–5 hex color codes (#RRGGBB). First is the dominant accent. Inspired by the reference\'s vibe — not copied from any embedded brand palette.',
      },
      pageBg: { type: 'string', description: 'Hex color for the page/canvas background.' },
      cardBg: { type: 'string', description: 'Hex color for individual slide/card surfaces.' },
      headingColor: { type: 'string', description: 'Hex color for headings.' },
      bodyColor: { type: 'string', description: 'Hex color for body text.' },
      headingFont: { type: 'string', description: 'Google Fonts family name for headings (e.g., "Inter", "Playfair Display", "Space Grotesk").' },
      bodyFont: { type: 'string', description: 'Google Fonts family name for body text.' },
    },
    required: ['accentColors', 'pageBg', 'cardBg', 'headingColor', 'bodyColor', 'headingFont', 'bodyFont'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract text from a binary reference file. PDFs go through Foxit text
 * extraction directly; Office files (DOCX/XLSX/PPTX) get converted to PDF
 * first via the Foxit Conversion SDK, then the same PDF path. .txt/.md
 * fall back to the raw bytes decoded as UTF-8.
 */
async function extractTextFromUpload(
  file: File,
): Promise<{ text: string } | { error: string }> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: buffer.toString('utf8') };
  }

  if (name.endsWith('.pdf')) {
    const { extractTextFromPDF } = await import('@/lib/foxit-sdk-server');
    const result = await extractTextFromPDF(buffer);
    if (result.error) return { error: result.error };
    if (result.pages.length === 0) {
      return { error: 'PDF contained no extractable text. Scanned PDFs need OCR (not yet wired in reference flow).' };
    }
    return { text: result.pages.map((p) => p.text).join('\n\n') };
  }

  const { detectOfficeFormat, convertOfficeToPdf, extractTextFromPDF } = await import('@/lib/foxit-sdk-server');
  const fmt = detectOfficeFormat(name);
  if (!fmt) {
    return { error: `Unsupported file type for reference extraction: ${name}` };
  }
  const conv = await convertOfficeToPdf(buffer, fmt);
  if ('error' in conv) return { error: conv.error };
  try {
    const fs = await import('fs');
    const pdfBuffer = fs.readFileSync(conv.pdfPath);
    const result = await extractTextFromPDF(pdfBuffer);
    if (result.error) return { error: result.error };
    if (result.pages.length === 0) {
      return { error: 'Office file converted but no text could be extracted.' };
    }
    return { text: result.pages.map((p) => p.text).join('\n\n') };
  } finally {
    conv.cleanup();
  }
}

/** Build the Claude prompt + run both tool calls in parallel. */
async function callClaude(opts: {
  content: string;
  fileName?: string;
  mode: Mode;
}): Promise<ReferenceHints> {
  const { content, fileName, mode } = opts;
  // Cap content length — sending an entire 50-page PDF would burn tokens
  // without improving the hint quality. 12k chars ≈ 3 pages is plenty to
  // pick up tone + audience + outline signals.
  const truncated = content.length > 12000 ? content.slice(0, 12000) + '\n…[truncated]' : content;
  const wantStructure = mode === 'inspire-structure';

  const baseSystem = [
    'You analyze a reference document the user uploaded and extract hints for a slide deck generator.',
    'Your job is to identify VOICE (tone) and READER (audience) signals from the reference, without copying its content.',
    'The reference is INSPIRATION, not a template — the deck being generated will have its own subject matter.',
    wantStructure
      ? 'Also produce a structureHint: 3–10 short section titles that mirror the reference\'s outline shape (the rhythm of how it builds an argument), without copying its specific topics.'
      : 'Do NOT populate structureHint in inspire-only mode.',
    'Be specific. "Professional" is bad; "polished and authoritative with crisp data callouts" is good.',
    'Always use the extract_reference_hints tool.',
  ].join(' ');

  const themeSystem = [
    'You derive a VISUAL THEME inspired by the reference document.',
    'Read the reference\'s vibe — its tone, era, formality, energy — and choose colors + fonts that feel like a *spiritual cousin* of the reference, not a literal copy of any embedded brand assets.',
    'Pick fonts that are available on Google Fonts. Suggested heading/body pairings: Inter+Inter, Playfair Display+Inter, Space Grotesk+Inter, Bricolage Grotesque+Inter, DM Serif Display+DM Sans, Manrope+Manrope.',
    'Hex colors must be #RRGGBB. Page bg and card bg are usually light unless the reference reads as a dark/editorial piece.',
    'Always use the extract_theme_tokens tool.',
  ].join(' ');

  const userMessage = [
    fileName ? `Reference file: ${fileName}` : 'Reference document content below.',
    '',
    truncated,
    '',
    `Extract the hints (mode = ${mode}).`,
  ].join('\n');

  const themeUserMessage = [
    fileName ? `Reference file: ${fileName}` : 'Reference document content below.',
    '',
    truncated,
    '',
    'Derive the visual theme.',
  ].join('\n');

  const [hintsResp, themeResp] = await Promise.all([
    getProvider().createMessage({
      model: getModel(),
      max_tokens: 1024,
      system: baseSystem,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_reference_hints' },
      messages: [{ role: 'user', content: userMessage }],
    }),
    getProvider().createMessage({
      model: getModel(),
      max_tokens: 512,
      system: themeSystem,
      tools: [THEME_TOOL],
      tool_choice: { type: 'tool', name: 'extract_theme_tokens' },
      messages: [{ role: 'user', content: themeUserMessage }],
    }),
  ]);

  const hintsTool = hintsResp.content.find((b) => b.type === 'tool_use');
  if (!hintsTool || hintsTool.type !== 'tool_use') {
    throw new Error('Reference extraction failed — no hints tool response');
  }
  const hintsParsed = ReferenceHintsSchema.omit({ theme: true }).parse(hintsTool.input);

  // Theme is best-effort; if Claude returns malformed tokens, fall through
  // without theme rather than failing the whole request.
  let theme: ThemeHint | undefined;
  const themeTool = themeResp.content.find((b) => b.type === 'tool_use');
  if (themeTool && themeTool.type === 'tool_use') {
    const parsed = ThemeHintSchema.safeParse(themeTool.input);
    if (parsed.success) theme = parsed.data;
  }

  return { ...hintsParsed, theme };
}

// ── Route ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') ?? '';

    let content: string;
    let fileName: string | undefined;
    let mode: Mode;

    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      const modeRaw = form.get('mode');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'file field is required' }, { status: 400 });
      }
      // Raw-text-only path (slides Attach-on-Generate flow): extract the
      // document's text and return it directly. NO Anthropic hint step, NO
      // inspire-mode requirement — this feeds the structured engine as
      // `fileContent` (→ sourceText), not the inspire/hints pipeline. Reuses the
      // SAME Foxit extractor (extractTextFromUpload) as the hint path, so the
      // "scanned PDF needs OCR" error surfaces here too (422).
      if (form.get('raw') === 'true') {
        const extracted = await extractTextFromUpload(file);
        if ('error' in extracted) {
          return NextResponse.json({ error: extracted.error }, { status: 422 });
        }
        return NextResponse.json({ text: extracted.text });
      }
      if (typeof modeRaw !== 'string' || !MODE_VALUES.includes(modeRaw as Mode)) {
        return NextResponse.json({ error: 'mode must be "inspire" or "inspire-structure"' }, { status: 400 });
      }
      mode = modeRaw as Mode;
      fileName = file.name;
      const extracted = await extractTextFromUpload(file);
      if ('error' in extracted) {
        return NextResponse.json({ error: extracted.error }, { status: 422 });
      }
      content = extracted.text;
    } else {
      const body = await request.json();
      const b = body as { content?: unknown; fileName?: unknown; mode?: unknown };
      if (typeof b.content !== 'string' || !b.content) {
        return NextResponse.json({ error: 'content (string) is required' }, { status: 400 });
      }
      if (typeof b.mode !== 'string' || !MODE_VALUES.includes(b.mode as Mode)) {
        return NextResponse.json({ error: 'mode must be "inspire" or "inspire-structure"' }, { status: 400 });
      }
      content = b.content;
      fileName = typeof b.fileName === 'string' ? b.fileName : undefined;
      mode = b.mode as Mode;
    }

    const result = await callClaude({ content, fileName, mode });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reference extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
