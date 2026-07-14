/**
 * /api/internal/slide-render — the slide-data handoff for the server-side
 * render-to-image foundation (PRD §6: "render-to-image is the real prerequisite
 * for the Design critic").
 *
 * The relay (server-side) POSTs ONE card + theme here and gets a short-lived
 * token; a headless Puppeteer page then GETs the same token from the render page
 * (`/internal/slide-render`) and draws the REAL SlideStage, which Puppeteer
 * screenshots. Passing the slide via a token avoids stuffing a large card into a
 * URL. In-memory + single-process is fine for dev; production would use a shared
 * store. Internal only — never linked from the product UI.
 */
import { NextResponse } from 'next/server';
import type { Card, TemplateTheme } from '@/types/card-template';

// A payload holds ONE theme and one-or-more cards. The single-card form (`card`)
// is kept for back-compat; the deck form (`cards`) lets one page load render an
// entire deck (the one-pass judge renderer) instead of a page-load per slide.
type SlidePayload = { card?: Card; cards?: Card[]; theme: TemplateTheme };

// Store on globalThis so it survives Next dev's per-request module re-evaluation
// (a plain module-level Map gets reset on HMR → tokens 404). Single-process dev
// only; production would use a shared store.
const g = globalThis as unknown as { __slideRenderStore?: Map<string, SlidePayload> };
const store: Map<string, SlidePayload> = (g.__slideRenderStore ??= new Map());

export async function POST(req: Request) {
  let body: SlidePayload;
  try {
    body = (await req.json()) as SlidePayload;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if ((!body?.card && !body?.cards?.length) || !body?.theme) {
    return NextResponse.json({ error: 'card(s) and theme are required' }, { status: 400 });
  }
  const token = `render-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  store.set(token, body);
  // Also expose under a fixed slot so a caller (and dev tests) can render the
  // most-recently-posted slide without round-tripping the random token.
  store.set('latest', body);
  // Auto-expire after 2 minutes — the render happens within seconds.
  setTimeout(() => store.delete(token), 120_000);
  return NextResponse.json({ token });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const data = token ? store.get(token) : null;
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}
