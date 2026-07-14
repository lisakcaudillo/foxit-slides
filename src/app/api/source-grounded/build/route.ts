import { NextResponse } from 'next/server';
import type { TemplateTheme } from '@/types/card-template';
import { buildSourceGroundedBlueprint } from '@/lib/card-engine/source-blueprint';
import { generateDeckFromSourceBlueprint } from '@/lib/card-engine/from-source';
import { saveSourceBytes } from '@/lib/source-storage';
import { PROJECT_BRIEF_TEMPLATE } from '@/data/cardTemplates';

// Phase E entry point. Accepts a source document upload (PDF / DOCX / PPTX),
// runs the source-grounded pipeline (Layers 0/2/3/4 + OCR), and returns a
// CardTemplate whose cards carry provenance back to the source.
//
// On `stream=true`, results stream as SSE with these event types:
//   - `pipeline`    : { stage, ... } — progress signals (after build, after generate-start, etc.)
//   - `card`        : { cardIndex, card, total } — one card finished generating
//   - `done`        : { template, stats, failedSlides }
//   - `error`       : { error }
//
// Without `stream=true`, returns JSON once everything completes.

export const maxDuration = 300;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with a `file` field' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: '`file` is required' }, { status: 400 });
  }

  const filename = (file instanceof File && file.name) || 'upload';
  const docTypeHint = (formData.get('docTypeHint') as string | null) ?? undefined;
  const topic = (formData.get('topic') as string | null) ?? undefined;
  const targetSlidesRaw = formData.get('targetSlides') as string | null;
  const targetSlides = targetSlidesRaw ? Math.max(3, Math.min(30, parseInt(targetSlidesRaw, 10))) : undefined;
  const themeJson = formData.get('theme') as string | null;
  const stream = formData.get('stream') === 'true';

  let theme: TemplateTheme = PROJECT_BRIEF_TEMPLATE.theme;
  if (themeJson) {
    try {
      theme = JSON.parse(themeJson) as TemplateTheme;
    } catch {
      return NextResponse.json({ error: 'Invalid `theme` JSON' }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!stream) {
    const built = await buildSourceGroundedBlueprint(buffer, filename, {
      targetSlides,
      docTypeHint,
      topic,
    });
    if ('error' in built) {
      return NextResponse.json({ error: built.error }, { status: 422 });
    }
    // Persist source bytes for the Inspector source drawer (E-9).
    saveSourceBytes(built.source.contentHash, buffer);
    const generated = await generateDeckFromSourceBlueprint(
      built.blueprint,
      built.source,
      built.annotated,
      theme,
    );
    return NextResponse.json({
      template: generated.template,
      stats: built.stats,
      failedSlides: generated.failedSlides,
    });
  }

  // Streaming path: SSE
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: 'pipeline', stage: 'extract-start' });
        const built = await buildSourceGroundedBlueprint(buffer, filename, {
          targetSlides,
          docTypeHint,
          topic,
        });
        if ('error' in built) {
          send({ type: 'error', error: built.error });
          controller.close();
          return;
        }
        // Persist source bytes for the Inspector source drawer (E-9).
        saveSourceBytes(built.source.contentHash, buffer);
        send({
          type: 'pipeline',
          stage: 'blueprint-ready',
          deckTitle: built.blueprint.deckTitle,
          slideCount: built.blueprint.slides.length,
          stats: built.stats,
        });

        const generated = await generateDeckFromSourceBlueprint(
          built.blueprint,
          built.source,
          built.annotated,
          theme,
          {
            onSlideComplete: (cardIndex, card) => {
              send({ type: 'card', cardIndex, card, total: built.blueprint.slides.length });
            },
          },
        );

        send({
          type: 'done',
          template: generated.template,
          stats: built.stats,
          failedSlides: generated.failedSlides,
        });
        controller.close();
      } catch (err) {
        send({
          type: 'error',
          error: err instanceof Error ? err.message : 'Pipeline failed',
        });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
