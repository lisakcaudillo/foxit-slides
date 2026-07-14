import { NextRequest, NextResponse } from 'next/server';
import { rewriteBlock } from '@/lib/claude';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await rewriteBlock({
      blockContent: body.blockContent,
      instructions: body.instructions,
      context: body.context,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rewrite failed';
    console.error('[Rewrite API] Error:', message);
    if (error instanceof Error && error.stack) {
      console.error('[Rewrite API] Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
