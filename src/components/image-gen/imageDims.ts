// ── Shared image-generation engine — image dimension utils ─────────────────
//
// Client-safe pure functions extracted (verbatim) from CardEditor.tsx — the
// `probeImageDims` and `aspectAwareImageSize` helpers (CardEditor.tsx lines
// ~4184 and ~4211). Pulled out so both the future wizard (/editor/graphics) and
// the slides accordion shell can size inserted images consistently without
// importing the whole CardEditor. CardEditor itself is left untouched in this
// stage. No React.
//
//

/** Compute card-relative w/h (in %) for an inserted image, preserving its
 *  natural aspect ratio. Caps to leave room for surrounding content: width
 *  never exceeds 50% of the card, height never exceeds 60%. When the natural
 *  dimensions are unknown (legacy uploads that didn't probe, SVGs without
 *  intrinsic size), falls back to the legacy 32×32 square so the insert still
 *  works. */
export function aspectAwareImageSize(
  naturalDims?: { width: number; height: number },
): { w: number; h: number } {
  if (!naturalDims || naturalDims.width <= 0 || naturalDims.height <= 0) {
    return { w: 32, h: 32 };
  }
  const aspect = naturalDims.width / naturalDims.height; // >1 landscape, <1 portrait
  // Start with a comfortable default — 40% of card width.
  let w = 40;
  let h = w / aspect;
  // Tall portraits would blow past the card height — clamp h and reflow w.
  if (h > 60) {
    h = 60;
    w = h * aspect;
  }
  // Wide landscapes after the height clamp could still exceed the side cap.
  if (w > 50) {
    w = 50;
    h = w / aspect;
  }
  return { w, h };
}

/** Probe a data-URL or file URL for its natural pixel dimensions. Used by the
 *  upload path so the inserted block matches the image's true aspect ratio.
 *  Library items skip this — their dimensions are persisted in metadata.json
 *  by the server-side saver. */
export function probeImageDims(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window unavailable'));
      return;
    }
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
