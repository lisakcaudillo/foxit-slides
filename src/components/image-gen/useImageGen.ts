'use client';

// ── Shared image-generation engine — useImageGen hook ──────────────────────
//
// The one shared generation entry point. Both the future wizard
// (/editor/graphics) and the slides accordion shell call this instead of each
// re-implementing the fetch/parse against /api/ai/generate-image. Mirrors
// CardEditor.RailMediaContent's `handleAIGenerate` request + parse logic
// exactly (CardEditor.tsx ~4370): POST { prompt, style, aspect, quality,
// n: 4, ...optional refs/context }, read `{ images }`, drop empty-src
// variants. Errors surface as a friendly string — never thrown to an alert.
//
// See docs/uiux/prototypes/image-prompt-flow-PLAN.md §10–§11.

import { useCallback, useState } from 'react';
import type { AiResult, GenParams } from './types';

export interface UseImageGen {
  /** Variants from the most recent successful generation, or null before any
   *  generation / after reset(). Empty-src variants are filtered out. */
  results: AiResult[] | null;
  /** True while a generate() request is in flight. */
  generating: boolean;
  /** Friendly error string from the most recent failed generation, or null. */
  error: string | null;
  /** Fire a generation. Always posts n=4 (Firefly pattern) unless overridden
   *  in params. Resolves when results (or error) are set — never rejects. */
  generate: (params: GenParams) => Promise<void>;
  /** Clear results + error back to the initial state. */
  reset: () => void;
}

export function useImageGen(): UseImageGen {
  const [results, setResults] = useState<AiResult[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (params: GenParams): Promise<void> => {
    const prompt = params.prompt.trim();
    if (!prompt || generating) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          style: params.style,
          aspect: params.aspect,
          quality: params.quality,
          n: params.n ?? 4,
          ...(params.styleRef ? { styleRef: params.styleRef } : {}),
          ...(params.compositionRef ? { compositionRef: params.compositionRef } : {}),
          // Auto-context — heading + deck + theme only. Body text is never
          // sent (it caused literal slide text to render inside the image).
          ...(params.slideHeading ? { slideHeading: params.slideHeading } : {}),
          ...(params.deckTitle ? { deckTitle: params.deckTitle } : {}),
          ...(params.themePalette ? { themePalette: params.themePalette } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Generation failed (${res.status})`);
      }
      const json = (await res.json()) as { images?: AiResult[] };
      const images = (json.images ?? []).filter((i) => i && i.src);
      if (images.length === 0) {
        throw new Error('Generation succeeded but no images were returned.');
      }
      setResults(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  }, [generating]);

  const reset = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return { results, generating, error, generate, reset };
}
