'use client';

/**
 * SlideStage — a faithful, self-contained render of ONE slide at a fixed size.
 *
 * Mirrors the per-card structure SlideDeckPrint uses (background resolution +
 * FreeformLayer mount), but for a single card and reusable anywhere: the print
 * view, and — the reason it exists — the OFFSCREEN capture that feeds the VLM
 * quality gate (see lib/captureSlideOffscreen.tsx). Rendering the SAME
 * FreeformLayer the editor uses is what makes the captured PNG match what the
 * user sees, instead of a server-rebuilt approximation.
 *
 * Non-interactive + staticRender: no selection handles, no typewriter — the
 * final composed state, which is what the gate should judge.
 */

import type { CSSProperties } from 'react';
import type { Card, TemplateTheme } from '@/types/card-template';
import { FreeformLayer } from './FreeformLayer';
import CoverDecoration from './CoverDecoration';
import { COVER_LAYOUT_PIECES } from '@/lib/card-engine/cover-layout-pieces';

import { cardBackground, isHex } from './cardBackground';

interface SlideStageProps {
  card: Card;
  theme: TemplateTheme;
  /** Render size in px. Defaults to the canonical 960×540 (16:9). */
  width?: number;
  height?: number;
  style?: CSSProperties;
}

export function SlideStage({ card, theme, width = 960, height = 540, style }: SlideStageProps) {
  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        background: cardBackground(card, theme),
        fontFamily: theme.bodyFont,
        color: isHex(theme.bodyColor) ? theme.bodyColor : undefined,
        ...style,
      }}
    >
      {/* WI-1 cover decoration — SVG vector + PNG decal, BEHIND the freeform text.
          Mounted here so every SlideStage consumer (offscreen VLM capture,
          internal/slide-render headless PNG) gets it. Gated on an approved
          LayoutPiece cover (source:'piece'). pointer-events:none, z-index 0. */}
      {card.slideDesign?.source === 'piece' &&
        card.slideDesign?.coverLayoutId &&
        COVER_LAYOUT_PIECES[card.slideDesign.coverLayoutId] && (
          <CoverDecoration layoutId={card.slideDesign.coverLayoutId} width={width} height={height} />
        )}
      <FreeformLayer
        blocks={card.freeform ?? []}
        onChange={() => {}}
        cardWidth={width}
        cardHeight={height}
        interactive={false}
        staticRender
        slideDesign={card.slideDesign}
        regionBgHex={card.style === 'dark' ? '#1a1a3e' : (isHex(theme.cardBg) ? theme.cardBg : '#ffffff')}
        themeBodyHex={isHex(theme.bodyColor) ? theme.bodyColor : undefined}
        themeTitleHex={isHex(theme.headingColor) ? theme.headingColor : undefined}
      />
    </div>
  );
}
