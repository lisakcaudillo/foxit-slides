import { NextResponse } from 'next/server';
import { judgeSlideImage, type SlideType } from '@/lib/card-engine/vlm-judge';

/**
 * POST /api/ai/judge-slide
 * Body: { imageBase64: string (no data: prefix), slideType: SlideType }
 * → { verdict } | { error }
 *
 * The visual quality gate's server entry point: the client captures a rendered
 * slide to PNG (captureSlideToPng), POSTs it here, and the VLM scores it against
 * the AI Output Standard. Fail-open — a judge error returns { error }, never a
 * 500 that would block generation.
 */
export async function POST(req: Request) {
  try {
    const { imageBase64, slideType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }
    const result = await judgeSlideImage(imageBase64, (slideType as SlideType) ?? 'content');
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'judge-slide failed' },
      { status: 500 },
    );
  }
}
