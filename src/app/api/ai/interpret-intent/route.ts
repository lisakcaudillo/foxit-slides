import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { interpretIntent } from '@/lib/claude';

const RequestSchema = z.object({
  instruction: z.string().min(1),
  blocks: z.array(z.object({
    id: z.string(),
    content: z.string(),
  })),
  selectedBlockId: z.string().optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        { status: 400 },
      );
    }

    const result = await interpretIntent(parsed.data);

    // Add unique IDs to each update
    const updates = result.updates.map((u) => ({
      ...u,
      id: crypto.randomUUID(),
      originalContent: parsed.data.blocks.find((b) => b.id === u.targetBlockId)?.content,
    }));

    return NextResponse.json({
      updates,
      summary: result.summary,
      interpretedIntent: result.interpretedIntent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Intent interpretation failed';
    console.error('[Interpret Intent API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
