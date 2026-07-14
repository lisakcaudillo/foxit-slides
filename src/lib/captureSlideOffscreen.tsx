'use client';

/**
 * captureSlideToPng — render ONE slide offscreen and capture it to a PNG.
 *
 * The gate's "preview, hidden" step: mount SlideStage (the real FreeformLayer)
 * into an offscreen host the user never sees, wait for it to paint, capture it,
 * and tear it down. The caller (the generation gate) feeds the PNG to the VLM
 * judge; only passing slides are revealed. Nothing here is user-facing — the
 * host lives off the left edge of the page and is removed immediately after.
 */
import { createRoot } from 'react-dom/client';
import { SlideStage } from '@/components/card-template/SlideStage';
import { captureElementToPng, type CapturedPng } from './slide-capture';
import type { Card, TemplateTheme } from '@/types/card-template';

export async function captureSlideToPng(
  card: Card,
  theme: TemplateTheme,
  opts: { width?: number; height?: number; pixelRatio?: number } = {},
): Promise<CapturedPng> {
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;

  const host = document.createElement('div');
  host.setAttribute('data-slide-capture', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(<SlideStage card={card} theme={theme} width={width} height={height} />);
    // Wait for React to actually commit the child — createRoot renders async,
    // so poll up to ~1s rather than assuming a fixed number of frames.
    let stage = host.firstElementChild as HTMLElement | null;
    for (let i = 0; i < 60 && !stage; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      stage = host.firstElementChild as HTMLElement | null;
    }
    if (!stage) throw new Error('SlideStage failed to mount for capture');

    return await captureElementToPng(stage, { width, height, pixelRatio: opts.pixelRatio ?? 2 });
  } finally {
    root.unmount();
    host.remove();
  }
}
