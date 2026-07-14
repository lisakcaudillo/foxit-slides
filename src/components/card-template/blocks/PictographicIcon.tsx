'use client';

/**
 * PictographicIcon — renders rich icons via the Iconify CDN.
 *
 * Uses the Iconify API which serves 200K+ icons from open-source sets.
 * For the card template system, it uses these icon sets:
 * - "material-symbols" (Google) — Foxit marketing standard, Apache 2.0
 * - "ph" (Phosphor) — clean alternative
 * - "fluent" — a fluent-style set
 *
 * Usage: <PictographicIcon name="ph:map-pin" size={24} color="#6B3FA0" />
 *
 * NOTE: Pictographic.ai icons require manual download (no API).
 * This uses Iconify as a drop-in replacement with similar quality.
 * Legal review needed if switching to actual Pictographic.ai assets.
 */

import { useEffect, useState } from 'react';
import { getIcon } from '@/data/figmaAssets';
// Pure id-map + resolver live in a non-client module so server code (the pptx
// exporter) can resolve icon ids too. Re-exported below for existing importers.
import { resolveIconId } from './icon-map';
export { resolveIconId } from './icon-map';

interface PictographicIconProps {
  name: string;        // Format: "set:icon-name" e.g., "ph:map-pin", or "figma:<id>" for a local pictogram
  size?: number;
  color?: string;
  className?: string;
}

/** A `figma:<id>` name resolves to a LOCAL pictogram from the figma-assets
 *  manifest (ink recolored to currentColor) — no Iconify CDN fetch. */
const FIGMA_PREFIX = 'figma:';

export default function PictographicIcon({ name, size = 24, color, className }: PictographicIconProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const iconId = resolveIconId(name);
  const figmaId = name.startsWith(FIGMA_PREFIX) ? name.slice(FIGMA_PREFIX.length) : null;
  const figmaIcon = figmaId ? getIcon(figmaId) : undefined;

  useEffect(() => {
    if (figmaId) return; // local pictogram — rendered inline below, no fetch
    const url = `https://api.iconify.design/${iconId}.svg?width=${size}&height=${size}${color ? `&color=${encodeURIComponent(color)}` : ''}`;
    fetch(url)
      .then(res => res.ok ? res.text() : null)
      .then(text => { if (text) setSvg(text); })
      .catch(() => {});
  }, [iconId, size, color, figmaId]);

  // Local Figma pictogram: render the manifest markup inline. The ink is
  // `currentColor`, so applying `color` on the wrapper recolors the whole
  // pictogram (export-safe — no hardcoded hex baked into the asset).
  if (figmaIcon) {
    return (
      <span
        className={className}
        style={{ display: 'inline-flex', flexShrink: 0, width: size, height: size, color: color ?? undefined }}
      >
        <svg
          viewBox={figmaIcon.viewBox}
          width={size}
          height={size}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          dangerouslySetInnerHTML={{ __html: figmaIcon.body }}
        />
      </span>
    );
  }

  if (!svg) {
    // Fallback: colored circle placeholder
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: color ? `${color}22` : 'rgba(107,63,160,0.1)',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexShrink: 0, width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
