/**
 * /api/internal/eval-judge — the INDEPENDENT (cross-vendor) eval judge.
 *
 * Renders a POSTed deck and grades each slide with Gemini (see gemini-judge.ts),
 * returning a per-slide verdict + aggregate + real token cost. This is what the
 * eval harness calls INSTEAD of trusting the OpenAI in-pipeline judge's own
 * self-score (which is circular). Same render, different vendor → a fresh cold
 * verdict that actually counts toward the quality bar.
 *
 * Internal only. Requires GEMINI_API_KEY. Judges sequentially (judging isn't a
 * hot loop; sequential avoids Gemini RPM 429s and keeps the score deterministic).
 */
import { NextResponse } from 'next/server';
import type { CardTemplate } from '@/types/card-template';
import { renderDeckToPngs } from '@/lib/card-engine/render-card';
import { layoutToSlideType } from '@/lib/card-engine/judge-deck';
import { geminiJudgeSlide } from '@/lib/card-engine/gemini-judge';
import { DEFAULT_GEMINI_MODEL } from '@/lib/ai-provider/gemini';

export const maxDuration = 300;

// Gemini 3.5 Flash pricing (USD per 1M tokens). Keep in sync with
// DEFAULT_GEMINI_MODEL — update both together if the judge model changes.
const GEMINI_INPUT_PER_M = 1.5;
const GEMINI_OUTPUT_PER_M = 9;

interface EvalSlideTrace {
  index: number;
  slideLabel: string;
  isCover: boolean;
  ran: boolean;
  passed?: boolean;
  overall?: number;
  fails?: string[];
  reasons?: string[];
  error?: string;
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;

  let body: { template?: CardTemplate };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const cards = body?.template?.cards;
  const theme = body?.template?.theme;
  if (!cards?.length || !theme) {
    return NextResponse.json({ error: 'template with cards + theme required' }, { status: 400 });
  }

  const model = process.env.GEMINI_JUDGE_MODEL || DEFAULT_GEMINI_MODEL;

  // Render the whole deck once (one page load, screenshot each slide by y-offset).
  const pngs = await renderDeckToPngs(cards, theme, { baseUrl: origin });

  const trace: EvalSlideTrace[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let i = 0; i < cards.length; i += 1) {
    const isCover = i === 0 || cards[i].structuredCover === true;
    const layoutId = cards[i].metadata?.layoutId;
    const slideLabel = layoutId ? layoutToSlideType(layoutId) : isCover ? 'cover' : 'content';
    const png = pngs[i];

    if (!png) {
      trace.push({ index: i, slideLabel, isCover, ran: false, error: 'render-to-PNG returned null' });
      console.warn(`[eval-judge] slide ${i} (${slideLabel}): ERROR(render null)`);
      continue;
    }

    const result = await geminiJudgeSlide(png.base64, isCover, slideLabel, { model });
    if (result.usage) {
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;
    }

    if (result.error || !result.verdict) {
      trace.push({ index: i, slideLabel, isCover, ran: false, error: result.error ?? 'no verdict' });
      console.warn(`[eval-judge] slide ${i} (${slideLabel}): ERROR(${result.error})`);
      continue;
    }

    const v = result.verdict;
    trace.push({
      index: i,
      slideLabel,
      isCover,
      ran: true,
      passed: v.passed,
      overall: v.overall,
      fails: v.fails,
      reasons: v.criteria.filter((c) => !c.pass).map((c) => `${c.id}: ${c.reason}`),
    });
    console.warn(`[eval-judge] slide ${i} (${slideLabel}): ${v.passed ? 'PASS' : 'FAIL'} overall=${v.overall}/5${v.fails.length ? ` fails=[${v.fails.join(',')}]` : ''}`);
  }

  const ran = trace.filter((t) => t.ran);
  const passed = ran.filter((t) => t.passed).length;
  const meanOverall = ran.length ? ran.reduce((s, t) => s + (t.overall ?? 0), 0) / ran.length : null;
  const estCostUsd =
    (inputTokens / 1e6) * GEMINI_INPUT_PER_M + (outputTokens / 1e6) * GEMINI_OUTPUT_PER_M;

  return NextResponse.json({
    model,
    trace,
    aggregate: {
      slides: cards.length,
      judged: ran.length,
      passed,
      passRate: ran.length ? passed / ran.length : 0,
      // 1–5 mean, and a 0–100 rescale so the harness can headline it directly.
      meanOverall: meanOverall != null ? Math.round(meanOverall * 100) / 100 : null,
      vlmScore: meanOverall != null ? Math.round(meanOverall * 20) : null,
      totalFails: ran.reduce((s, t) => s + (t.fails?.length ?? 0), 0),
    },
    usage: {
      inputTokens,
      outputTokens,
      estCostUsd: Math.round(estCostUsd * 10000) / 10000,
    },
  });
}
