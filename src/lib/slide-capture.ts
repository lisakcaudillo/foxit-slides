/**
 * slide-capture — turn a rendered slide DOM node into a PNG.
 *
 * This is the bitmap source for the VLM quality gate. We capture the SAME
 * FreeformLayer the editor renders (via SlideStage), so the judge grades the
 * real pixels the user will see — not a server-rebuilt approximation. The
 * standard doc names this the cost-effective path ("client html-to-image …
 * fastest to a real pixel, matches exactly what the user sees").
 */
import { toPng } from 'html-to-image';

export interface CapturedPng {
  /** data: URL (image/png) — convenient for <img src> and quick preview. */
  dataUrl: string;
  /** Raw PNG bytes — what the VLM vision call wants (base64-encode for the API). */
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Wait until the node is actually paint-ready: fonts loaded, every <img>
 *  settled, and two animation frames committed. Without this, captures race
 *  ahead of webfonts/images and come out with fallback fonts or blank images. */
export async function waitForRenderReady(el: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* fonts API absent — ignore */ }
  }
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            // resolve on either outcome — a broken image must not hang the gate
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** Capture `el` to a PNG at `pixelRatio`× its CSS size (2× → a 960×540 slide
 *  renders as 1920×1080, plenty of detail for the VLM without being huge). */
export async function captureElementToPng(
  el: HTMLElement,
  opts: { width?: number; height?: number; pixelRatio?: number } = {},
): Promise<CapturedPng> {
  const width = opts.width ?? el.offsetWidth;
  const height = opts.height ?? el.offsetHeight;
  const pixelRatio = opts.pixelRatio ?? 2;

  await waitForRenderReady(el);

  const dataUrl = await toPng(el, {
    width,
    height,
    pixelRatio,
    cacheBust: true,
    // skipFonts: html-to-image otherwise tries to read `cssRules` off every
    // stylesheet to inline @font-face — which THROWS a SecurityError on
    // cross-origin sheets (Google Fonts <link>), aborting the whole capture and
    // leaving image-bearing slides unjudged. We don't need embedded webfonts for
    // a visual-quality judgement (layout/overlap/legibility read fine in the
    // fallback face); skipping them makes the capture reliable on every slide.
    skipFonts: true,
    style: { margin: '0', transform: 'none', transformOrigin: 'top left' },
  });

  return { dataUrl, bytes: dataUrlToBytes(dataUrl), width: width * pixelRatio, height: height * pixelRatio };
}
