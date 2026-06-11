import { NextResponse } from 'next/server';

// Simple mock rewrite endpoint — in production this would call a real LLM
export async function POST(request: Request) {
  const body = await request.json();
  const { text, style } = body || { text: '', style: 'formal' };

  // Small deterministic "rewrite" for demo: trim, normalize whitespace, and append note
  const normalized = (text || '').replace(/\s+/g, ' ').trim();

  // Very naive "formalization": capitalize first letter of each sentence
  const sentences = normalized.split(/(?<=[.!?])\s+/).map((s: string) => {
    const t = s.trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }).join(' ');

  const rewritten = `${sentences} [AI rewrite: ${style || 'formal'}]`;

  return NextResponse.json({ text: rewritten });
}
