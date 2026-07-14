/**
 * Apply a composition decision to a cover slide's freeform blocks.
 *
 * Pure layout glue between the composition ENGINE (composition.ts — which form
 * + title position + scrim) and the freeform block model the cover actually
 * renders with. Given the cover's current freeform blocks + a CompositionResult,
 * it repositions:
 *   • the cover image block (`ff-autoimg-cover-*`) into the form's image region
 *     (full-card + a diagonal frame-shape for diagonal-split; its own half/band
 *     for the others; removed entirely for type-only), and
 *   • the title text blocks (heading / subheading / paragraph) into the region
 *     OPPOSITE the image, vertically centered.
 *
 * Returns the new freeform array plus the imageRole + coverTier the form
 * reconciles to, so the caller can stamp slideDesign and the existing scrim /
 * contrast / imageAwareBounds logic applies unchanged (full-bleed-overlay →
 * imageRole 'full-bleed' → the renderer's scrim + forced-legible title).
 *
 * Pure — no React, no SDK. Used by both the generation path (slides/page.tsx)
 * and the in-editor "Title layout" swap (CardEditor.tsx).
 */

import type {
  FreeformBlock,
  FreeformImageBlock,
  FreeformTextBlock,
  FrameShape,
} from '@/types/card-template';
import {
  compositionGeometry,
  compositionImageRole,
  compositionCoverTier,
  type CompositionResult,
  type Rect,
} from './cover-composition';
import type { CoverTier, ImageRole } from './design-types';
import { estHeight, CANVAS } from './slide-typography';

const COVER_IMAGE_PREFIX = 'ff-autoimg-cover-';

/** Rendered text height of a title block at a GIVEN placement width, as % of
 *  the card. The block was autofit at its original width; re-placing it at a
 *  different region width re-wraps it, so its real height must be re-measured
 *  there — otherwise a long title that wraps to more lines overflows its stale
 *  box and its text collides with the subtitle stacked below. */
function measuredTextHeightPct(t: FreeformTextBlock, wPct: number): number {
  const fs = t.style?.fontSize ?? 24;
  const lh = t.style?.lineHeight ?? 1.3;
  const boxWpx = (wPct / 100) * CANVAS.w;
  return (estHeight(t.content ?? '', fs, boxWpx, lh) / CANVAS.h) * 100;
}

export interface AppliedComposition {
  freeform: FreeformBlock[];
  imageRole: ImageRole;
  coverTier: CoverTier;
}

function isCoverImage(b: FreeformBlock): b is FreeformImageBlock {
  return b.type === 'image' && b.id.startsWith(COVER_IMAGE_PREFIX);
}

function isTitleText(b: FreeformBlock): b is FreeformTextBlock {
  return b.type === 'text';
}

/** The diagonal frame-shape for a diagonal-split form, else 'rectangle'. */
function frameShapeFor(result: CompositionResult): FrameShape {
  if (result.form !== 'diagonal-split') return 'rectangle';
  return result.imageSide === 'left' ? 'diagonal-left' : 'diagonal-right';
}

/** Re-stack a set of text blocks inside a region, vertically centered, keeping
 *  their order + heights. Mutates copies, returns new blocks. */
function stackInRegion(texts: FreeformTextBlock[], region: Rect, align: 'left' | 'center'): FreeformTextBlock[] {
  if (texts.length === 0) return [];
  const GAP = 3; // % of card height between title lines
  // Re-measure each block's height at the REGION width (not its stale h, which
  // was computed at the original width). This is what keeps the title's text
  // from overflowing into the subtitle: stacking advances by the REAL wrapped
  // height at the placement width.
  const heights = texts.map((t) => measuredTextHeightPct(t, region.w));
  const totalH = heights.reduce((sum, h) => sum + h, 0) + GAP * (texts.length - 1);
  let y = region.y + Math.max(0, (region.h - totalH) / 2);
  return texts.map((t, i) => {
    const h = heights[i];
    const placed: FreeformTextBlock = {
      ...t,
      x: region.x,
      y,
      w: region.w,
      h, // store the re-measured height so the box matches the text extent
      ...(align === 'center' ? { align: 'center' as const } : {}),
    };
    y += h + GAP;
    return placed;
  });
}

/**
 * Reposition a cover's freeform blocks to a composition form. `imageZBehind`
 * controls stacking: full-bleed + diagonal put the image behind the title
 * (z=0); half/band keep it beside (z=1, no overlap).
 */
export function applyCoverComposition(
  freeform: readonly FreeformBlock[],
  result: CompositionResult,
): AppliedComposition {
  const imageRole = compositionImageRole(result.form);
  const coverTier = compositionCoverTier(result.form);

  const others = freeform.filter((b) => !isCoverImage(b) && !isTitleText(b));
  const titles = freeform.filter(isTitleText);
  const coverImg = freeform.find(isCoverImage);

  // Title region — for full-bleed, centered-overlay sits mid-card; everything
  // else uses the form's computed title rect.
  const geo = compositionGeometry(result.form, result.imageSide);
  let titleRect: Rect = geo.title;
  let align: 'left' | 'center' = 'left';
  if (result.titlePosition === 'centered-overlay') {
    titleRect = { x: 10, y: 26, w: 80, h: 48 };
    align = 'center';
  }

  const placedTitles = stackInRegion(titles, titleRect, align);

  // type-only → drop the cover image entirely (theme/motif carries it).
  if (result.form === 'type-only' || !coverImg) {
    return { freeform: [...others, ...placedTitles], imageRole, coverTier };
  }

  const behind = result.form === 'full-bleed-overlay' || result.form === 'diagonal-split';
  const img: FreeformImageBlock = {
    ...coverImg,
    x: geo.image?.x ?? 0,
    y: geo.image?.y ?? 0,
    w: geo.image?.w ?? 100,
    h: geo.image?.h ?? 100,
    z: behind ? 0 : 1,
    fit: 'cover',
    frameShape: frameShapeFor(result),
  };

  // Image first when behind (so titles paint over it), else after.
  const ordered = behind ? [img, ...others, ...placedTitles] : [...others, img, ...placedTitles];
  return { freeform: ordered, imageRole, coverTier };
}
