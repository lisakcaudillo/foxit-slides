/**
 * Server-side render-to-PNG — the real prerequisite for the Design (visual)
 * critic. Launches headless Chromium (puppeteer), hands ONE card+theme to the
 * existing slide-render handoff (/api/internal/slide-render), navigates the
 * headless page to /internal/slide-render which draws the REAL SlideStage (the
 * same FreeformLayer the editor renders), and screenshots #slide-capture-root.
 * The captured PNG matches exactly what the user sees.
 *
 * Puppeteer is in serverExternalPackages (next.config) and imported DYNAMICALLY
 * so it never enters the client/edge bundle — only loaded when a render is
 * actually requested. One browser is reused across calls (the in-loop critic
 * renders many slides); it is closed on idle to avoid leaking Chromium.
 */
import type { Card, TemplateTheme } from '@/types/card-template';
import { extractDomGeometryInBrowser, runDomGeometryGate, type GeometryReport, type GeometryThresholds } from './dom-geometry';

// puppeteer has no bundled types we import here; treat the dynamic module loosely.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyBrowser = any;

const W = 960;
const H = 540;

let browserPromise: Promise<AnyBrowser> | null = null;

/** Block the dev HMR socket on a page: in headless Chromium it can't handshake and
 *  RETRIES, keeping the network non-idle and starving React's hydration under
 *  generation load (data-ready never flips → the render returns null). The captured
 *  slide needs no HMR. */
async function blockHmr(page: AnyBrowser): Promise<void> {
  await page.setRequestInterception(true).catch(() => {});
  page.on('request', (req: { url: () => string; abort: () => Promise<void>; continue: () => Promise<void> }) => {
    if (req.url().includes('webpack-hmr')) req.abort().catch(() => {});
    else req.continue().catch(() => {});
  });
}

async function getBrowser(): Promise<AnyBrowser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const mod = await import('puppeteer');
      const puppeteer = (mod as { default?: unknown }).default ?? mod;
      return (puppeteer as { launch: (o: unknown) => Promise<AnyBrowser> }).launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    })().catch((e) => {
      browserPromise = null; // allow a retry on the next call
      throw e;
    });
  }
  return browserPromise;
}

export interface SlideGeometryIssue {
  kind: 'overflow' | 'out-of-bounds';
  text: string;
  detail: string;
}

/** Render a card AND measure its real rendered geometry. Returns the PNG plus
 *  any DETERMINISTIC composition defects the vision model is unreliable at
 *  seeing: text that overflows its own box (a likely collision with the element
 *  below — e.g. a size-200 number spilling onto its label) or runs off the
 *  slide edge. Single-glyph decorations (→, ") are excluded so a 4px arrow
 *  overhang isn't flagged. Never throws — returns null on render failure. */
export async function renderAndMeasureCard(
  card: Card,
  theme: TemplateTheme,
  opts: { baseUrl?: string; scale?: number } = {},
): Promise<(RenderResult & { geometry: SlideGeometryIssue[] }) | null> {
  const baseUrl = resolveRenderBaseUrl(opts.baseUrl);
  let page: AnyBrowser | null = null;
  try {
    const postRes = await fetch(`${baseUrl}/api/internal/slide-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, theme }),
    });
    if (!postRes.ok) return null;
    const { token } = (await postRes.json()) as { token?: string };
    if (!token) return null;

    const browser = await getBrowser();
    page = await browser.newPage();
    await blockHmr(page);
    await page.setViewport({ width: W, height: H, deviceScaleFactor: opts.scale ?? 2 });
    await page.goto(`${baseUrl}/internal/slide-render?token=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () => document.querySelector('#slide-capture-root')?.getAttribute('data-ready') === 'true',
        { timeout: 45000, polling: 100 },
      )
      .catch(() => {});
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
    await new Promise((res) => setTimeout(res, 400));

    const geometry: SlideGeometryIssue[] = await page.evaluate(() => {
      const root = document.querySelector('#slide-capture-root');
      if (!root) return [];
      const R = root.getBoundingClientRect();
      const out: { kind: 'overflow' | 'out-of-bounds'; text: string; detail: string }[] = [];
      const leaves = Array.from(root.querySelectorAll('*')).filter(
        (el) => (el.textContent || '').trim().length > 0 && el.children.length === 0,
      );
      for (const el of leaves) {
        const text = (el.textContent || '').trim();
        if (text.length <= 2) continue; // skip single-glyph decorations (→, ")
        const ovh = (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight;
        const ovw = (el as HTMLElement).scrollWidth - (el as HTMLElement).clientWidth;
        if (ovh > 8 || ovw > 8) {
          out.push({ kind: 'overflow', text: text.slice(0, 32), detail: `text overflows its box by ${Math.max(ovh, ovw)}px (collides with neighbours)` });
        }
        const r = el.getBoundingClientRect();
        if (r.left < R.left - 2 || r.top < R.top - 2 || r.right > R.right + 2 || r.bottom > R.bottom + 2) {
          out.push({ kind: 'out-of-bounds', text: text.slice(0, 32), detail: 'element runs off the slide edge' });
        }
      }
      return out;
    });

    const buf = (await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } })) as Buffer;
    return { base64: Buffer.from(buf).toString('base64'), width: W, height: H, geometry };
  } catch (err) {
    console.warn('[render-card] measure failed:', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    if (page) { try { await page.close(); } catch { /* ignore */ } }
  }
}

/**
 * Render each card and run the DETERMINISTIC DOM-geometry gate on its real DOM
 * (overflow / overlap / off-canvas / contrast / font / ink density). Returns one
 * GeometryReport per card (null if that card failed to render). No LLM, no
 * screenshot — pure measurement. `baseUrl` must be this server's origin.
 *
 * The extractor is passed to page.evaluate as a function; it is self-contained
 * (no outer refs) so serialization survives bundling — see dom-geometry.ts.
 */
export async function measureDeckDomGeometry(
  cards: Card[],
  theme: TemplateTheme,
  opts: { baseUrl?: string; scale?: number; thresholds?: Partial<GeometryThresholds> } = {},
): Promise<(GeometryReport | null)[]> {
  const baseUrl = resolveRenderBaseUrl(opts.baseUrl);
  const out: (GeometryReport | null)[] = [];
  const browser = await getBrowser();
  for (const card of cards) {
    let page: AnyBrowser | null = null;
    try {
      const postRes = await fetch(`${baseUrl}/api/internal/slide-render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card, theme }),
      });
      if (!postRes.ok) { out.push(null); continue; }
      const { token } = (await postRes.json()) as { token?: string };
      if (!token) { out.push(null); continue; }
      page = await browser.newPage();
      await blockHmr(page);
      await page.setViewport({ width: W, height: H, deviceScaleFactor: opts.scale ?? 2 });
      await page.goto(`${baseUrl}/internal/slide-render?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('#slide-capture-root')?.getAttribute('data-ready') === 'true', { timeout: 45000, polling: 100 }).catch(() => {});
      await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
      await new Promise((res) => setTimeout(res, 400));
      const raw = await page.evaluate(extractDomGeometryInBrowser, '#slide-capture-root');
      out.push(runDomGeometryGate(raw, opts.thresholds));
    } catch (err) {
      console.warn('[render-card] geometry gate failed:', err instanceof Error ? err.message : String(err));
      out.push(null);
    } finally {
      if (page) { try { await page.close(); } catch { /* ignore */ } }
    }
  }
  return out;
}

/**
 * ONE-PASS deck render: draw EVERY slide in a SINGLE page load and screenshot each
 * from its own #slide-capture-<i> element, instead of a page-load per slide. The
 * per-slide cost of renderCardToPng is the page navigation (networkidle0 + the
 * data-ready wait + a fonts/layout settle) — paying that once for the whole deck
 * collapses the judge's serial render phase from N×(navigation) to 1×(navigation)
 * + N cheap element screenshots. Never throws — a failed slide is `null` at its
 * index so the judge stays fail-open.
 */
export async function renderDeckToPngs(
  cards: Card[],
  theme: TemplateTheme,
  opts: { baseUrl?: string; scale?: number } = {},
): Promise<(RenderResult | null)[]> {
  if (cards.length === 0) return [];
  const baseUrl = resolveRenderBaseUrl(opts.baseUrl);
  let page: AnyBrowser | null = null;
  try {
    const postRes = await fetch(`${baseUrl}/api/internal/slide-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards, theme }),
    });
    if (!postRes.ok) { console.warn(`[render-card] deck POST ${baseUrl} not ok: ${postRes.status}`); return cards.map(() => null); }
    const { token } = (await postRes.json()) as { token?: string };
    if (!token) { console.warn('[render-card] deck POST returned no token'); return cards.map(() => null); }

    const browser = await getBrowser();
    page = await browser.newPage();
    await blockHmr(page);
    // The page stacks the slides vertically, so the viewport is N slides tall.
    await page.setViewport({ width: W, height: H * cards.length, deviceScaleFactor: opts.scale ?? 2 });
    await page.goto(`${baseUrl}/internal/slide-render?token=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const ready = await page
      .waitForFunction(
        () => document.querySelector('#slide-capture-root')?.getAttribute('data-ready') === 'true',
        { timeout: 45000, polling: 100 },
      )
      .then(() => true)
      .catch(() => false);
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
    await new Promise((res) => setTimeout(res, 450)); // fonts + auto-layout settle (once for the deck)
    if (!ready) {
      const count = await page.evaluate(() => document.querySelector('#slide-capture-root')?.getAttribute('data-count') ?? '?').catch(() => '?');
      console.warn(`[render-card] deck page not ready (count=${count}, slides=${cards.length})`);
    }

    // Strip the Next dev badge so it can't leak into any captured slide.
    await page
      .evaluate(() => {
        document
          .querySelectorAll('nextjs-portal, #__next-build-watcher, [data-next-badge-root], [data-nextjs-toast], [data-nextjs-dev-tools-button]')
          .forEach((el) => el.remove());
      })
      .catch(() => {});

    // Screenshot each slide by its y-offset clip (slides stack vertically at H each)
    // — the same proven page.screenshot({clip}) path renderCardToPng uses.
    const results: (RenderResult | null)[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      try {
        const buf = (await page.screenshot({ clip: { x: 0, y: i * H, width: W, height: H } })) as Buffer;
        results.push({ base64: Buffer.from(buf).toString('base64'), width: W, height: H });
      } catch (e) {
        console.warn(`[render-card] deck slide ${i} screenshot failed:`, e instanceof Error ? e.message : String(e));
        results.push(null);
      }
    }
    return results;
  } catch (err) {
    console.warn('[render-card] deck render failed:', err instanceof Error ? err.message : String(err));
    return cards.map(() => null);
  } finally {
    if (page) { try { await page.close(); } catch { /* ignore */ } }
  }
}

/** Close the shared browser (call when a batch of renders is done). */
export async function closeRenderBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch { /* already gone */ } finally {
    browserPromise = null;
  }
}

/** Resolve the base URL of this running server for the headless page to hit.
 *  Prefer an explicit override, else the request origin, else localhost:PORT. */
export function resolveRenderBaseUrl(explicit?: string): string {
  // 0.0.0.0 is a bind-all address you can't CONNECT to — when the dev server binds it
  // (H 0.0.0.0), the derived origin is unusable for the headless render. Normalize it.
  const norm = (u: string) => u.replace(/\/$/, '').replace('//0.0.0.0', '//127.0.0.1');
  if (explicit) return norm(explicit);
  if (process.env.INTERNAL_RENDER_BASE_URL) return norm(process.env.INTERNAL_RENDER_BASE_URL);
  const port = process.env.PORT || '3000';
  return `http://127.0.0.1:${port}`;
}

export interface RenderResult {
  /** base64 PNG (no data: prefix) — ready for judgeSlideImage. */
  base64: string;
  width: number;
  height: number;
}

/**
 * Render a single card to a PNG. Returns null (never throws) when render fails
 * so the visual critic stays fail-open — a render hiccup must never block
 * generation.
 *
 * @param baseUrl  origin of THIS server (e.g. the request origin). Required so
 *                 the headless page fetches the slide from the same process.
 */
export async function renderCardToPng(
  card: Card,
  theme: TemplateTheme,
  opts: { baseUrl?: string; scale?: number } = {},
): Promise<RenderResult | null> {
  const baseUrl = resolveRenderBaseUrl(opts.baseUrl);
  let page: AnyBrowser | null = null;
  try {
    // 1. Hand the slide to the in-process token store.
    const postRes = await fetch(`${baseUrl}/api/internal/slide-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, theme }),
    });
    if (!postRes.ok) return null;
    const { token } = (await postRes.json()) as { token?: string };
    if (!token) return null;

    // 2. Headless-render the real SlideStage and screenshot it.
    const browser = await getBrowser();
    page = await browser.newPage();
    await blockHmr(page);
    await page.setViewport({ width: W, height: H, deviceScaleFactor: opts.scale ?? 2 });
    await page.goto(`${baseUrl}/internal/slide-render?token=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () => document.querySelector('#slide-capture-root')?.getAttribute('data-ready') === 'true',
        { timeout: 45000, polling: 100 },
      )
      .catch(() => {});
    await new Promise((res) => setTimeout(res, 350)); // fonts + auto-layout settle

    // Strip the Next.js dev-mode indicator before capture. It renders inside the
    // viewport corner on dev pages, so it would otherwise leak into the judged
    // image and the VLM would see a foreign badge on every slide (a confound for
    // "clean composition" criteria). No-op in production (no dev indicator).
    await page
      .evaluate(() => {
        document
          .querySelectorAll('nextjs-portal, #__next-build-watcher, [data-next-badge-root], [data-nextjs-toast], [data-nextjs-dev-tools-button]')
          .forEach((el) => el.remove());
      })
      .catch(() => {});

    const buf = (await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } })) as Buffer;
    return { base64: Buffer.from(buf).toString('base64'), width: W, height: H };
  } catch (err) {
    console.warn('[render-card] render failed:', err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    if (page) { try { await page.close(); } catch { /* ignore */ } }
  }
}
