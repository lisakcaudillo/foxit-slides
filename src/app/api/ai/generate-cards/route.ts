import { NextResponse } from 'next/server';
import { generateCardTemplate } from '@/lib/card-engine';
import { generateStructuredDeck } from '@/lib/card-engine/structure-fill';
import { generateNativeDeck } from '@/lib/card-engine/native-template';
import { isCapturedTemplateId } from '@/lib/card-engine/captured-registry';
import { THEMES } from '@/components/themes/themes';
import { PROJECT_BRIEF_TEMPLATE } from '@/data/cardTemplates';
// Phase A (2026-06-11): compose slides to the unified positioned-block format on the SERVER so
// positioned blocks cross the seam. The converter is Node-safe (import-chain audit), reused
// verbatim (byte-identical output), and idempotent.
import { cardToUnified, templateToUnified } from '@/lib/structuredToFreeform';
import type { TemplateTheme } from '@/types/card-template';
import type { SkillId } from '@/lib/document-skills';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, docType, audience, tone, density, theme, fileContent, framework, cardCount, stream, layoutVariant, selectedLayouts, skillIdOverride, rewriteIntensity, structured, skinHint, judge, images, coverImageId, contentImageId, structureHint, priorDecks } = body;
    const origin = new URL(request.url).origin;
    // Visual critic ON BY DEFAULT for all structured generation (Lisa 2026-06-25).
    // The capped auto-revise loop (one pass, hard-fails only) is wired in
    // structure-fill, so the judge earns its per-slide render+VLM cost. Callers
    // can still opt out with an explicit `judge: false`.
    const judgeEnabled = judge !== false;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    // A typed prompt with NO attached file must still produce a full deck: feed
    // the prompt itself as the structured engine's source material (and flag it
    // `standalone` so the fill stage AUTHORS content from the brief rather than
    // transcribing a document). With a file, the file is the source.
    const hasFile = typeof fileContent === 'string' && fileContent.trim().length > 0;
    const structuredSourceText = hasFile ? fileContent : prompt;

    // Customize → Voice: an explicit pick (incl. null = "No voice") wins; only
    // when unset (undefined) fall back to the framework's default skill. Mirrors
    // the legacy generate path's resolvedSkillId so both paths agree.
    const fwDefaultSkill: SkillId | null =
      framework && typeof framework === 'object' && framework.defaultSkillId
        ? (framework.defaultSkillId as SkillId)
        : null;
    const resolvedVoice: SkillId | null =
      skillIdOverride !== undefined ? (skillIdOverride as SkillId | null) : fwDefaultSkill;
    const audienceStr = typeof audience === 'string' ? audience : undefined;
    const toneStr = typeof tone === 'string' ? tone : undefined;

    // ── Native (editor-authored) template path ────────────────────────────
    // When `skinHint` names an editor-authored captured template (registered
    // in captured-registry.ts), route to the native path. The captured deck's
    // 20-slide shape is the deck; the writer fills each slide's slots from
    // the prompt via the same fillStructureSlots machinery, then the card is
    // built from captured percent geometry. Bypasses the Figma planner and
    // the Figma manifest entirely.
    //
    // Streaming: matches the editor's SSE handler contract in
    // app/editor/slides/page.tsx — per-slide `{type:'card', card, index}`,
    // final `{type:'done', template}`, errors `{type:'error', error}`.
    if (typeof skinHint === 'string' && isCapturedTemplateId(skinHint)) {
      const themeRecord = THEMES.find((t) => t.id === skinHint);
      if (!themeRecord) {
        return NextResponse.json({ error: `No THEMES entry for captured template id "${skinHint}"` }, { status: 500 });
      }
      const nativeOpts = {
        prompt,
        skinId: skinHint,
        themeRecord,
        sourceText: structuredSourceText,
        standalone: !hasFile,
        density: typeof density === 'string' ? density : undefined,
        rewriteIntensity: typeof rewriteIntensity === 'string' ? rewriteIntensity : undefined,
        audience: audienceStr,
        tone: toneStr,
        voice: resolvedVoice,
        // Client's slide-count picker (3-15) becomes the plan agent's hard hint.
        // Absent → agent picks its own adaptive count based on material.
        cardCountHint: typeof cardCount === 'number' && cardCount > 0 ? cardCount : undefined,
        // Shared per-slide gates (judge + content-judge + revise). Wired via
        // slide-gates.ts — same call site the Figma path uses. baseUrl is
        // required because the visual critic renders slides via
        // /internal/slide-render on this server; skip if unavailable.
        baseUrl: origin,
        judge: judgeEnabled,
        // Silent agent memory. Client scanned localStorage for prior decks
        // whose shape is similar to this request and passed up to 3. Plan
        // agent reads their arc/layout/angle as Phase 0 context — never
        // surfaced to the user, never carries facts (FR11).
        priorDecks: Array.isArray(priorDecks) ? priorDecks : undefined,
      };
      if (stream) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            const send = (data: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch { /* stream closed */ }
            };
            try {
              const template = await generateNativeDeck({
                ...nativeOpts,
                // Blueprint FIRST — the editor's SSE handler needs a skeleton
                // in place before any `card` event lands; without it,
                // setTemplate((prev) => prev == null ? prev : ...) short-
                // circuits and every card silently drops.
                onBlueprintReady: (bp) => send({
                  type: 'blueprint',
                  cards: bp.cards,
                  theme: bp.theme,
                }),
                // Per-slide: use `cardIndex` (client's field name) + `total`.
                onSlideReady: (index, card, total) => send({
                  type: 'card',
                  card,
                  cardIndex: index,
                  total,
                }),
              });
              // fill-complete commits the deck client-side (mints id, saves,
              // reveals) BEFORE the judge pass. Native path has no judge yet,
              // so `done` follows immediately.
              send({ type: 'fill-complete', template });
              send({ type: 'done', template });
              controller.close();
            } catch (error) {
              send({ type: 'error', error: error instanceof Error ? error.message : 'Native deck generation failed' });
              controller.close();
            }
          },
        });
        return new Response(readable, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });
      }
      try {
        // Collect per-slide judge verdict traces so callers can inspect the
        // actual per-criterion reasons (not just the fail-code summary).
        // Structure path already returns judgeTrace; native was returning just
        // { template }, which discarded the reason strings needed to diagnose
        // why a slide failed.
        const judgeTrace: import('@/lib/card-engine/judge-deck').SlideVerdictTrace[] = [];
        const template = await generateNativeDeck({
          ...nativeOpts,
          onSlideJudged: (t) => judgeTrace.push(t),
        });
        return NextResponse.json(judgeEnabled ? { template, judgeTrace } : { template });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Native deck generation failed' },
          { status: 500 },
        );
      }
    }

    // ── Structure-fill path ────────────────────────────────────────────────
    // When `structured` is set, generate by FILLING a validated Figma structure's
    // blanks (manifest role+group slots, char-budget constrained) instead of
    // improvising blocks. The cards come back already positioned (freeform
    // geometry from the structure), so they cross the seam without conversion.
    if (structured) {
      if (stream) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            const send = (data: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch { /* stream closed */ }
            };
            try {
              const template = await generateStructuredDeck({
                prompt,
                cardCount: cardCount || undefined,
                skinHint: typeof skinHint === 'string' ? skinHint : undefined,
                // Inspire-structure outline (was previously dropped at this route).
                structureHint: Array.isArray(structureHint) ? structureHint : undefined,
                sourceText: structuredSourceText,
                standalone: !hasFile,
                density: density || undefined,
                rewriteIntensity: typeof rewriteIntensity === 'string' ? rewriteIntensity : undefined,
                audience: audienceStr,
                tone: toneStr,
                voice: resolvedVoice,
                // Auto-fill images on every structured deck (Lisa 2026-07-01);
                // opt out by sending `images: false` explicitly.
                withImages: images !== false,
                coverImageId: typeof coverImageId === 'string' ? coverImageId : undefined,
                contentImageId: typeof contentImageId === 'string' ? contentImageId : undefined,
                // Visual critic ON BY DEFAULT (Lisa 2026-06-25) — the capped
                // auto-revise loop now earns the per-slide render+VLM cost; opt
                // out with judge:false. Non-fatal wrapped; verdict events stream.
                judge: judgeEnabled,
                baseUrl: origin,
                onSlideJudged: (t) => send({ type: 'verdict', trace: t }),
                onPlanReady: (plan, skinId) => {
                  send({
                    type: 'blueprint',
                    cards: plan.slides.map((s, i) => ({ id: `card-${i}`, title: s.focus, layout: 'single', style: 'default' })),
                    total: plan.slides.length,
                    skinId,
                  });
                },
                onSlideComplete: (cardIndex, card, total) => {
                  // Cards are already freeform-positioned — cardToUnified is a no-op.
                  send({ type: 'card', cardIndex, card, total });
                },
                // Deck fully filled (~10s), before the judge. Client saves +
                // reveals here so a long judge / cap / navigation can't lose it.
                onFillComplete: (template) => send({ type: 'fill-complete', template }),
              });
              send({ type: 'done', template });
              controller.close();
            } catch (error) {
              send({ type: 'error', error: error instanceof Error ? error.message : 'Generation failed' });
              controller.close();
            }
          },
        });
        return new Response(readable, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });
      }
      const judgeTrace: import('@/lib/card-engine/judge-deck').SlideVerdictTrace[] = [];
      const template = await generateStructuredDeck({
        prompt,
        cardCount: cardCount || undefined,
        skinHint: typeof skinHint === 'string' ? skinHint : undefined,
        // Inspire-structure outline (was previously dropped at this route).
        structureHint: Array.isArray(structureHint) ? structureHint : undefined,
        sourceText: structuredSourceText,
        standalone: !hasFile,
        density: density || undefined,
        rewriteIntensity: typeof rewriteIntensity === 'string' ? rewriteIntensity : undefined,
        audience: audienceStr,
        tone: toneStr,
        voice: resolvedVoice,
        // Auto-fill images on every structured deck (Lisa 2026-07-01);
        // opt out by sending `images: false` explicitly.
        withImages: images !== false,
        coverImageId: typeof coverImageId === 'string' ? coverImageId : undefined,
        contentImageId: typeof contentImageId === 'string' ? contentImageId : undefined,
        judge: judgeEnabled,
        baseUrl: origin,
        onSlideJudged: (t) => judgeTrace.push(t),
      });
      return NextResponse.json(judgeEnabled ? { template, judgeTrace } : { template });
    }

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (data: unknown) => {
            // Never let one card's enqueue/serialize failure (or an already-
            // closed controller) tear down the whole stream.
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              /* stream closed or payload unserializable — drop this event */
            }
          };

          try {
            // The resolved theme (for server-side conversion) is the same theme the client
            // would convert with (event.theme from the blueprint), captured in onBlueprintReady.
            let unifyTheme: TemplateTheme | undefined;
            const template = await generateCardTemplate({
              prompt,
              docType: docType || 'presentation',
              audience: audience || '',
              tone: tone || '',
              density: density || 'detailed',
              theme: theme || PROJECT_BRIEF_TEMPLATE.theme,
              fileContent: fileContent || null,
              framework: framework || null,
              cardCount: cardCount || undefined,
              layoutVariant: layoutVariant || undefined,
              selectedLayouts: Array.isArray(selectedLayouts) && selectedLayouts.length > 0 ? selectedLayouts : undefined,
              skillIdOverride: skillIdOverride === undefined ? undefined : skillIdOverride,
              rewriteIntensity: rewriteIntensity || undefined,
              onBlueprintReady: (blueprint, resolvedTheme) => {
                unifyTheme = resolvedTheme; // same theme the client uses to convert (event.theme)
                // Send card shells immediately — UI shows skeleton cards
                send({
                  type: 'blueprint',
                  cards: blueprint.cards.map((c) => ({
                    id: c.id,
                    title: c.title,
                    layout: c.layout,
                    style: c.style,
                  })),
                  theme: resolvedTheme,
                  total: blueprint.cards.length,
                });
              },
              onCardComplete: (cardIndex, card, total) => {
                // B2b: send ONLY the server-CONVERTED card (positioned blocks, for render).
                // The raw pre-conversion card no longer crosses the seam — the client auto-image
                // gate now reads the converted card's `slideDesign.isFullCanvasComposition` stamp
                // + `imageRole`, and placeAutoImage reads the heading from the converted freeform.
                send({ type: 'card', cardIndex, card: cardToUnified(card, unifyTheme), total });
              },
            });

            // AC8 handover (additive instrumentation, 2026-06-11): seam→client. Reports what
            // ACTUALLY crosses the SSE seam — recipe names + column content, or positioned
            // blocks. Unhappy (AC3) when no positioned blocks cross and the client must
            // reinterpret the recipe name.
            // Phase A: convert the final template SERVER-side so positioned blocks (not a recipe
            // name) cross the seam. Same `templateToUnified` the client used to call — byte-identical
            // and idempotent (the client's leftover templateToUnified is now a no-op).
            const unifiedTemplate = templateToUnified(template);
            if (process.env.NODE_ENV !== 'production') {
              const cards = unifiedTemplate?.cards ?? [];
              const anyFreeform = cards.some((c) => (c.freeform?.length ?? 0) > 0);
              const anyColumns = cards.some((c) => (c.columns ?? []).some((col) => (col.blocks?.length ?? 0) > 0));
              // Recipe-retirement (a), S3b: no recipe name on the wire — only the
              // AC3 block-crossing check remains (do positioned blocks cross?).
              const base = `seam→client | received: assembled template (${cards.length} cards) | decided: SSE payload | passed-on: positioned FreeformBlock[], hasFreeformBlocks=${anyFreeform}, hasColumnContent=${anyColumns}`;
              if (!anyFreeform) console.warn(`[handover!] ${base} | reason: NO positioned blocks cross (AC3)`);
              else console.log(`[handover] ${base}`);
            }
            send({ type: 'done', template: unifiedTemplate });
            controller.close();
          } catch (error) {
            send({ type: 'error', error: error instanceof Error ? error.message : 'Generation failed' });
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const template = await generateCardTemplate({
      prompt,
      docType: docType || 'presentation',
      audience: audience || '',
      tone: tone || '',
      // Unified default with the streaming path above (was the legacy 'balanced',
      // which resolveDensity coerced to 'detailed' anyway — now stated directly).
      density: density || 'detailed',
      theme: theme || PROJECT_BRIEF_TEMPLATE.theme,
      fileContent: fileContent || null,
      framework: framework || null,
      cardCount: cardCount || undefined,
      layoutVariant: layoutVariant || undefined,
      selectedLayouts: Array.isArray(selectedLayouts) && selectedLayouts.length > 0 ? selectedLayouts : undefined,
      skillIdOverride: skillIdOverride === undefined ? undefined : skillIdOverride,
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('[generate-cards] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
