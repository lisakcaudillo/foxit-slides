'use client';

import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, Fragment, type CSSProperties } from 'react';
import Link from 'next/link';
import { panelChrome, PanelSectionLabel, PanelSection, tileHoverIn, tileHoverOut } from './panelChrome';
import {
  Play,
  Plus,
  ChevronRight,
  X,
  Minimize2,
  Copy,
  Trash2,
  MessageSquare,
  MoreHorizontal,
  LayoutGrid,
  Sparkles,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link2,
  Palette,
  Square,
  Columns2,
  Columns3,
  RefreshCw,
  MessagesSquare,
  Download,
  ChevronDown,
  RotateCcw,
  ImageIcon,
  Loader2,
  Upload as UploadIcon,
  List,
  Check,
} from 'lucide-react';
import type { CardTemplate, Card, CardBlock, CardLayout, CardProvenance, FreeformBlock, FreeformImageBlock, FreeformTextBlock, FreeformChartBlock, FreeformChartType, FreeformTableBlock, FreeformListBlock, ChartSeries, SourceDocument, FrameShape } from '@/types/card-template';
import { FRAME_LABELS, FRAME_DEFAULT_SIZE, DeviceFrame } from './frames';
import { getDeviceFrame, getIcon, listIcons, listIconCategories, listDeviceGroups } from '@/data/figmaAssets';
import type { DeviceGroup } from '@/data/figmaAssets';
import { LAYOUT_PICKS, LayoutPreview } from './layout-picks';
import { FreeformLayer, ChartContent } from './FreeformLayer';
import type { DeckSlideRef } from './LinkEditor';
import { cardBackground } from './cardBackground';
import { saveLastSlide } from '@/lib/cardDeckStorage';
import CoverDecoration from './CoverDecoration';
import { COVER_LAYOUT_PIECES } from '@/lib/card-engine/cover-layout-pieces';
import PictographicIcon from './blocks/PictographicIcon';
import SlideInspectorPanel, { type BlockStyleOverride, type SelectedBlockEntry } from './SlideInspectorPanel';
import GraphicsInspector, { type ArrangeOp } from './GraphicsInspector';
import { align as arrangeAlign, bringForward as arrangeForward, sendBackward as arrangeBackward } from '@/lib/asset-engine/arrange';
import SourceDrawer from './SourceDrawer';
import SourceAppendix from './SourceAppendix';
import SlideToolRail, { type SlideRailPanel } from './SlideToolRail';
import SlideToolPanel from './SlideToolPanel';
import SlideAIPanel from './SlideAIPanel';
import ChartDataGrid from './ChartDataGrid';
import BrandingPanel from './BrandingPanel';
import TextPanel from './TextPanel';
import { ThemeButton } from '@/components/themes/ThemeButton';
import { useTheme } from '@/lib/theme/useTheme';
import { CoverArt } from '@/components/themes/CoverArt';
import { getThemeById } from '@/components/themes/themes';
import {
  coverTierForTheme,
  coverTierImageRole,
  coverTierWantsImage,
  nextCoverTier,
  type CoverTier,
} from '@/lib/card-engine/cover-tiers';
import {
  forceForm,
  nextCompositionForm,
  compositionWantsImage,
  headlineLengthOf,
  type CompositionForm,
  type CompositionResult,
} from '@/lib/card-engine/cover-composition';
import { applyCoverComposition } from '@/lib/card-engine/cover-compose';
import { Typewriter, estimateTypeDuration } from './Typewriter';
import { DraftingOverlay } from './DraftingOverlay';
import { BuildingIndicator } from './BuildingIndicator';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { ImageGenAccordion } from '@/components/image-gen/ImageGenAccordion';
import { GraphicsMediaPanel } from '@/components/card-template/GraphicsMediaPanel';
import { LibraryBrowser, LIBRARY_IMAGE_DND_MIME, type LibrarySelection } from '@/components/image-gen/LibraryBrowser';

// ── Freeform slot finder ───────────────────────────────────────────────────
// Computes a non-overlapping (x, y) for a new freeform block on a card given
// the existing freeform blocks and the new block's natural w/h. Per Lisa
// 2026-05-22 — the previous "fixed (35%, 40%) + cascade" anchor piled new
// blocks on top of any existing content (AI-generated titles, user blocks,
// images). All values in % of card width/height.
function findFreeformSlot(
  existing: FreeformBlock[],
  w: number,
  h: number,
): { x: number; y: number } {
  const MARGIN = 5;
  const GAP = 2;
  const maxX = 100 - MARGIN - w;
  const maxY = 100 - MARGIN - h;

  // AABB overlap with any existing block at (cx, cy).
  const overlaps = (cx: number, cy: number) =>
    existing.some(
      (b) =>
        cx < b.x + b.w &&
        cx + w > b.x &&
        cy < b.y + b.h &&
        cy + h > b.y,
    );

  // 1. Empty card → drop at the top-left content area.
  if (existing.length === 0) {
    return { x: MARGIN + 3, y: MARGIN + 7 };
  }

  // 2. Left-aligned slot directly below the lowest existing block's bottom.
  //    Best UX for the "Add a heading × N" stacking case. Only requires
  //    vertical clearance — full-width existing blocks (e.g. the AI's
  //    86%-wide content blocks) would never let us pass the AABB test, so
  //    we just need the new block's y range to not collide.
  const lowestBottom = existing.reduce(
    (mx, b) => Math.max(mx, b.y + b.h),
    0,
  );
  const candidateY = Math.min(maxY, lowestBottom + GAP);
  if (candidateY >= MARGIN && candidateY <= maxY) {
    const verticallyClear = !existing.some(
      (b) => candidateY < b.y + b.h && candidateY + h > b.y,
    );
    if (verticallyClear) {
      return { x: MARGIN + 3, y: candidateY };
    }
  }

  // 3. Coarse 6×8 grid sweep for any non-overlapping cell. Walks left-to-
  //    right, top-to-bottom so empty quadrants near the top fill first.
  const cols = 6;
  const rows = 8;
  for (let yi = 0; yi < rows; yi++) {
    for (let xi = 0; xi < cols; xi++) {
      const cx = MARGIN + (xi * (maxX - MARGIN)) / Math.max(1, cols - 1);
      const cy = MARGIN + (yi * (maxY - MARGIN)) / Math.max(1, rows - 1);
      if (cx > maxX || cy > maxY) continue;
      if (!overlaps(cx, cy)) return { x: cx, y: cy };
    }
  }

  // 4. Last resort — top-left cascade. Card is full; user gets a block at
  //    a deterministic top-left spot with a small offset per existing block
  //    so repeated clicks don't pile at the exact same coord. Better than
  //    the legacy (35, 40) middle anchor — at least it's near the corner.
  const cascade = Math.min(existing.length, 12) * 2;
  return {
    x: MARGIN + 3 + cascade,
    y: MARGIN + 7 + cascade,
  };
}

// Seed data for newly-inserted chart blocks. Returns a blank 7×7 Excel-style
// grid regardless of chartType: 7 numbered rows (categories '1'…'7'), 7
// Excel-lettered columns (series 'A'…'G'), every cell 0 (rendered blank in the
// data-grid editor). No title — the grid starts empty like a fresh spreadsheet.
// The caller fills id + position fields. The user fills the numbers + picks the
// shape in the chart data-grid (ChartDataGrid).
function buildSeedChart(chartType: FreeformChartType): Omit<FreeformChartBlock, 'id' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'z'> {
  // PowerPoint-style placeholders: a single used series with light sample values so
  // the rendered chart stays simple ("just 1 is used"). The data modal pads the grid
  // out to 5 columns for room — those empty placeholders are trimmed before the chart
  // renders, so only filled series show on the slide.
  const categories = ['Category 1', 'Category 2', 'Category 3', 'Category 4'];
  const series: ChartSeries[] = [{ name: 'Series A', values: [3, 2, 4, 3] }];
  return {
    type: 'chart',
    chartType,
    categories,
    series,
    numberFormat: 'number',
  };
}

// Seed for a newly-inserted table: a 3×3 grid with a header row of placeholder
// column names. The user edits cells in place (double-click) and adds/removes
// rows & columns from the in-table controls.
function buildSeedTable(): Omit<FreeformTableBlock, 'id' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'z'> {
  return {
    type: 'table',
    rows: [['Column 1', 'Column 2', 'Column 3'], ['', '', ''], ['', '', '']],
    headerRow: true,
    align: ['left', 'right', 'right'],
    style: { fontSize: 12 },
  };
}

function buildSeedList(): Omit<FreeformListBlock, 'id' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'z'> {
  return {
    type: 'list',
    items: [{ text: 'First point' }, { text: 'Second point' }, { text: 'Third point' }],
    marker: 'bullet',
    style: { fontSize: 16 },
  };
}

// ── Inline block renderers (card-sized, not slide-sized) ───────────────────

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// Detect if a color is "dark" (for contrast decisions)
function isDarkColor(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/** True when the value is a solid #rgb / #rrggbb hex (not a gradient / rgba /
 *  named color). Used to decide whether a theme color can be measured for the
 *  text-contrast guarantee — gradients are passed through as undefined so the
 *  renderer keeps the theme default. */
function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/**
 * Convert a BlockStyleOverride into CSS style props applied to the block wrapper.
 * Only sets properties present in the override (undefined = inherit existing styles).
 */
function overrideToStyle(o?: BlockStyleOverride): React.CSSProperties {
  if (!o) return {};
  const s: React.CSSProperties = {};
  if (o.fontFamily) s.fontFamily = `${o.fontFamily}, system-ui, sans-serif`;
  if (o.fontSize !== undefined) s.fontSize = `${o.fontSize}px`;
  if (o.fontWeight !== undefined) s.fontWeight = o.fontWeight;
  if (o.color) s.color = o.color;
  if (o.textAlign) s.textAlign = o.textAlign;
  if (o.lineHeight !== undefined) s.lineHeight = o.lineHeight;
  if (o.letterSpacing !== undefined) s.letterSpacing = `${o.letterSpacing}px`;
  if (o.width !== undefined) s.width = `${o.width}px`;
  if (o.height !== undefined) s.height = `${o.height}px`;
  if (o.gap !== undefined) s.gap = `${o.gap}px`;
  if (o.flexDirection) s.flexDirection = o.flexDirection;
  if (o.justifyContent) s.justifyContent = o.justifyContent === 'start' ? 'flex-start' : o.justifyContent === 'end' ? 'flex-end' : o.justifyContent;
  if (o.alignItems) s.alignItems = o.alignItems === 'start' ? 'flex-start' : o.alignItems === 'end' ? 'flex-end' : o.alignItems;
  if (o.opacity !== undefined) s.opacity = o.opacity;
  if (o.paddingTop !== undefined) s.paddingTop = `${o.paddingTop}px`;
  if (o.paddingRight !== undefined) s.paddingRight = `${o.paddingRight}px`;
  if (o.paddingBottom !== undefined) s.paddingBottom = `${o.paddingBottom}px`;
  if (o.paddingLeft !== undefined) s.paddingLeft = `${o.paddingLeft}px`;
  if (o.marginTop !== undefined) s.marginTop = `${o.marginTop}px`;
  if (o.marginRight !== undefined) s.marginRight = `${o.marginRight}px`;
  if (o.marginBottom !== undefined) s.marginBottom = `${o.marginBottom}px`;
  if (o.marginLeft !== undefined) s.marginLeft = `${o.marginLeft}px`;
  // Border (only apply when style is set to something visible)
  const borderStyle = o.borderStyle && o.borderStyle !== 'none' ? o.borderStyle : undefined;
  if (borderStyle) {
    const c = o.borderColor || '#e2e8f0';
    if (o.borderTop !== undefined) s.borderTop = `${o.borderTop}px ${borderStyle} ${c}`;
    if (o.borderRight !== undefined) s.borderRight = `${o.borderRight}px ${borderStyle} ${c}`;
    if (o.borderBottom !== undefined) s.borderBottom = `${o.borderBottom}px ${borderStyle} ${c}`;
    if (o.borderLeft !== undefined) s.borderLeft = `${o.borderLeft}px ${borderStyle} ${c}`;
  }
  if (o.borderRadius !== undefined) s.borderRadius = `${o.borderRadius}px`;
  return s;
}

function CardBlockView({
  block,
  theme,
  editable,
  onChange,
  typewriterDelay = 0,
  animate = true,
}: {
  block: CardBlock;
  theme: CardTemplate['theme'];
  editable?: boolean;
  onChange?: (next: CardBlock) => void;
  /**
   * Milliseconds to wait before any Typewriter in this block starts. Used
   * to chain blocks within a card so heading types first, then body /
   * cells start typing only once the heading finishes.
   */
  typewriterDelay?: number;
  /**
   * Whether to typewriter-animate text-bearing blocks. Forwarded to every
   * Typewriter inside this block. False = render text instantly (used for
   * duplicated, manually-added, edited, or already-settled cards).
   */
  animate?: boolean;
}) {
  // Helper: contentEditable props applied to text-bearing elements when editable
  const editProps = (currentText: string, apply: (text: string) => CardBlock): React.HTMLAttributes<HTMLElement> =>
    editable
      ? {
          contentEditable: true,
          suppressContentEditableWarning: true,
          onBlur: (e) => {
            const text = (e.target as HTMLElement).innerText;
            if (text !== currentText && onChange) onChange(apply(text));
          },
          onMouseDown: (e) => e.stopPropagation(),
          // Keep card-selection alive while typing in a block
          onClick: (e) => e.stopPropagation(),
          style: { outline: 'none' },
        }
      : {};
  const darkBg = isDarkColor(theme.pageBg || '#ffffff');
  // For icons on dark backgrounds, use headingColor (white) instead of accent
  const iconColor = darkBg ? (theme.headingColor || '#ffffff') : (theme.accentColors?.[0] || '#6B3FA0');
  // Universal gradient-text style for titles — works for both gradient and
  // solid themes because ThemeProvider wraps solid hexes as single-stop gradients.
  const titleStyle: React.CSSProperties = {
    backgroundImage: 'var(--theme-title-color)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    fontFamily: 'var(--theme-title-font)',
  };
  switch (block.type) {
    case 'heading': {
      const styles: Record<number, React.CSSProperties> = {
        1: { fontSize: '2.4rem', fontWeight: 900, lineHeight: 1.15 },
        2: { fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.08em', textTransform: 'uppercase' },
        3: { fontSize: '2rem', fontWeight: 900, lineHeight: 1.2 },
      };
      // Editable mode: render plain (so contentEditable behaves normally).
      // Non-editable: typewriter the content for the "AI is writing" feel.
      return (
        <div
          {...editProps(block.content, (text) => ({ ...block, content: text }))}
          style={{ ...titleStyle, ...styles[block.level], marginBottom: '0.5rem', ...(editable ? { outline: 'none' } : {}) }}
        >
          {editable ? block.content : <Typewriter text={block.content} speed={45} delay={typewriterDelay} animate={animate} />}
        </div>
      );
    }
    case 'paragraph':
      return editable ? (
        <p
          {...editProps(block.content, (text) => ({ ...block, content: text }))}
          style={{ fontSize: '1.05rem', color: 'var(--theme-body-color)', lineHeight: 1.7, margin: '0.5rem 0', fontFamily: 'var(--theme-body-font)', outline: 'none' }}
        >
          {block.content}
        </p>
      ) : (
        <p style={{ fontSize: '1.05rem', color: 'var(--theme-body-color)', lineHeight: 1.7, margin: '0.5rem 0', fontFamily: 'var(--theme-body-font)' }}>
          <Typewriter
            text={block.content}
            speed={45}
            delay={typewriterDelay}
            animate={animate}
            render={(revealed, done) => (done ? renderMarkdown(revealed) : revealed)}
          />
        </p>
      );
    case 'smart-layout': {
      // Compute per-cell delays so cells type sequentially top-to-bottom
      // (left-to-right for grids, where DOM order matches reading order).
      // Within a cell the heading types first, then the body picks up where
      // the heading left off; the next cell waits until the previous cell's
      // body finishes. Without this, every Typewriter starts at the same
      // base delay and the whole block reveals in parallel.
      const cellDelays = (() => {
        let cursor = typewriterDelay;
        return block.cells.map((cell) => {
          const headingDelay = cursor;
          cursor += estimateTypeDuration(cell.heading || '', 45);
          const bodyDelay = cursor;
          cursor += estimateTypeDuration(cell.body || '', 45);
          return { headingDelay, bodyDelay };
        });
      })();

      if (block.variant === 'timeline') {
        return (
          <div style={{ marginTop: '1rem' }}>
            {block.cells.map((cell, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '2rem' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: `linear-gradient(135deg, ${cell.accentColor || theme.accentColors[i % theme.accentColors.length]}, ${theme.accentColors[(i + 1) % theme.accentColors.length]})`,
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.9rem',
                  }}>{i + 1}</div>
                  {i < block.cells.length - 1 && <div style={{ width: '2px', flex: 1, background: `${theme.accentColors[0]}33`, minHeight: '1.5rem' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--theme-link-color)', fontFamily: 'var(--theme-title-font)', fontSize: '1.05rem', marginBottom: '0.25rem' }}><Typewriter text={cell.heading} speed={45} delay={cellDelays[i].headingDelay} animate={animate} /></div>
                  <div style={{ color: 'var(--theme-body-color)', fontFamily: 'var(--theme-body-font)', fontSize: '0.9rem', lineHeight: 1.6 }}><Typewriter text={cell.body} speed={45} delay={cellDelays[i].bodyDelay} animate={animate} /></div>
                </div>
              </div>
            ))}
          </div>
        );
      }
      if (block.variant === 'list') {
        return (
          <div style={{ marginTop: '0.5rem' }}>
            {block.cells.map((cell, i) => {
              return (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.5rem 0' }}>
                  {cell.icon && <div style={{ marginTop: '3px', flexShrink: 0 }}><PictographicIcon name={cell.icon} size={20} color={cell.accentColor || iconColor} /></div>}
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--theme-link-color)', fontFamily: 'var(--theme-title-font)', fontSize: '1.05rem', marginBottom: '0.125rem' }}>
                      <Typewriter text={cell.heading} speed={45} delay={cellDelays[i].headingDelay} animate={animate} />
                    </div>
                    <div style={{ color: 'var(--theme-body-color)', fontFamily: 'var(--theme-body-font)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                      <Typewriter text={cell.body} speed={45} delay={cellDelays[i].bodyDelay} animate={animate} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      // Grid — sequential DOM order matches reading order (top-to-bottom,
      // left-to-right) so the same per-cell cumulative delay works here too.
      const cols = block.variant === 'grid-1x3' ? 3 : block.variant === 'grid-1x4' ? 4 : 2;
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px', marginTop: '1.5rem' }}>
          {block.cells.map((cell, i) => {
            return (
              <div key={i} style={{
                border: `1.5px solid ${cell.accentColor || theme.accentColors[i % theme.accentColors.length]}33`, borderRadius: '14px', padding: '24px',
                background: `${cell.accentColor || theme.accentColors[i % theme.accentColors.length]}0a`,
              }}>
                {cell.icon && (
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: `linear-gradient(135deg, ${cell.accentColor || theme.accentColors[i % theme.accentColors.length]}, ${theme.accentColors[(i + 1) % theme.accentColors.length]})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px',
                  }}>
                    <PictographicIcon name={cell.icon || 'star'} size={20} color="white" />
                  </div>
                )}
                <div style={{ fontWeight: 700, color: 'var(--theme-link-color)', fontFamily: 'var(--theme-title-font)', fontSize: '1.15rem', marginBottom: '8px' }}><Typewriter text={cell.heading} speed={45} delay={cellDelays[i].headingDelay} animate={animate} /></div>
                <div style={{ color: 'var(--theme-body-color)', fontFamily: 'var(--theme-body-font)', fontSize: '0.95rem', lineHeight: 1.6 }}><Typewriter text={cell.body} speed={45} delay={cellDelays[i].bodyDelay} animate={animate} /></div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'label-group': {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px' }}>
          {block.labels.map((label, i) => {
            const isFilled = label.style === 'filled' || label.style === 'filled-light';
            return (
              <span key={i} style={{
                display: 'inline-block', fontSize: '0.78rem', fontWeight: 600,
                color: isFilled ? 'var(--theme-primary-fg)' : 'var(--theme-link-color)',
                background: isFilled ? 'var(--theme-primary-bg)' : 'transparent',
                border: isFilled ? 'none' : '1.5px solid var(--theme-link-color)',
                borderRadius: '6px', padding: '6px 14px',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {label.text}
              </span>
            );
          })}
        </div>
      );
    }
    case 'toggle':
      return (
        <div style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
          <div style={{ fontWeight: 600, color: 'var(--theme-link-color)', fontFamily: 'var(--theme-title-font)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ChevronRight size={16} style={{ color: 'var(--theme-link-color)' }} />
            {block.heading}
          </div>
        </div>
      );
    case 'callout':
      return (
        <div style={{
          background: 'rgba(207, 214, 252, 0.4)', borderRadius: '12px',
          padding: '20px 24px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ flexShrink: 0, fontSize: '1.1rem', marginTop: '2px' }}>💡</span>
          <p style={{ fontSize: '0.92rem', color: 'var(--theme-body-color)', fontFamily: 'var(--theme-body-font)', lineHeight: 1.6 }}>
            <Typewriter
              text={block.content}
              speed={45}
              animate={animate}
              render={(revealed, done) => (done ? renderMarkdown(revealed) : revealed)}
            />
          </p>
        </div>
      );
    case 'bullet-list': {
      // Stagger list items so each one starts only after the previous
      // finishes — same top-to-bottom reveal Lisa wants for smart-layout
      // cells. Without this, every item types in parallel.
      const itemDelays = (() => {
        let cursor = typewriterDelay;
        return block.items.map((item) => {
          const start = cursor;
          cursor += estimateTypeDuration(item || '', 45);
          return start;
        });
      })();
      return (
        <ul style={{ listStyle: 'none', marginTop: '16px' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ flexShrink: 0, color: iconColor, fontSize: '1.1rem', lineHeight: 1 }}>→</span>
              <div style={{ fontSize: '0.95rem', color: 'var(--theme-body-color)', fontFamily: 'var(--theme-body-font)', lineHeight: 1.6 }}>
                <Typewriter
                  text={item}
                  speed={45}
                  delay={itemDelays[i]}
                  animate={animate}
                  render={(revealed, done) => (done ? renderMarkdown(revealed) : revealed)}
                />
              </div>
            </li>
          ))}
        </ul>
      );
    }
    case 'divider':
      return <hr style={{ border: 'none', height: '1px', background: 'rgba(0,0,0,0.08)', margin: '16px 0' }} />;
    case 'button': {
      const isLight = block.style === 'primary-light';
      return (
        <div style={{ marginTop: '1rem' }}>
          <a href={block.url || '#'} style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px',
            borderRadius: 'var(--theme-btn-radius)',
            fontSize: '0.95rem', fontWeight: 600, textDecoration: 'none',
            fontFamily: 'var(--theme-title-font)',
            background: isLight ? 'var(--theme-secondary-bg)' : 'var(--theme-primary-bg)',
            color: isLight ? 'var(--theme-secondary-fg)' : 'var(--theme-primary-fg)',
            border: isLight ? '2px solid var(--theme-secondary-border)' : 'none',
            cursor: 'pointer', transition: 'opacity 200ms',
            minHeight: '44px',
          }}>
            {block.text}
          </a>
        </div>
      );
    }
    default:
      return null;
  }
}

// ── Card Component (Gamma-style white card on gradient bg) ─────────────────

function CardView({
  card,
  theme,
  index,
  isActive,
  onClick,
  themeId,
  isStreaming,
  onBlockChange,
  onFreeformChange,
  onFreeformGestureStart,
  onFreeformGestureEnd,
  onFreeformOpenFontPanel,
  freeformFontPanelOpen,
  onFreeformSelectionChange,
  onSelectedIdsChange,
  onImagePlaceholderClick,
  onEditChart,
  onImageDrop,
  scrollContainer,
  cardRef,
  selectedBlockKeys,
  onSelectBlock,
  blockOverrides,
  animate = true,
  rounded = true,
  radiusOverride,
  deckSlides,
  onNavigateToSlide,
}: {
  card: Card;
  theme: CardTemplate['theme'];
  index: number;
  isActive: boolean;
  /** Editor-only: render rounded corners on the card. Off → square (also the
   *  PPT/PDF export look). Per Lisa 2026-06-14. */
  rounded?: boolean;
  /** Hard radius (px) that wins over `rounded`/`theme.cardRadius`. Graphics mode
   *  passes a small value so the artboard reads as a sharp frame, not a rounded
   *  slide card (Lisa 2026-06-25 — "the corners are too round"). */
  radiusOverride?: number;
  onClick: () => void;
  /** Active document theme id — used by the cover (index 0) to look up the
   *  full Theme for its tier decision + corner motif. Optional for older
   *  call sites / decks without a themeId. */
  themeId?: string;
  isStreaming?: boolean;
  onBlockChange?: (blockIndex: number, next: CardBlock) => void;
  /** Replace this card's freeform blocks. Used by the FreeformLayer overlay. */
  onFreeformChange?: (next: FreeformBlock[]) => void;
  /** Forwarded to FreeformLayer. Bracket a drag/resize/crop gesture so the
   *  undo history records ONE entry per gesture instead of one per frame. */
  onFreeformGestureStart?: () => void;
  onFreeformGestureEnd?: () => void;
  /** Canva-model font field: the freeform toolbar's font button calls this to
   *  open the Text/Font side panel instead of an inline dropdown. */
  onFreeformOpenFontPanel?: () => void;
  /** True when that panel is open — lights the toolbar font field active. */
  freeformFontPanelOpen?: boolean;
  /** Reports whether the freeform layer has any block selected. Parent uses
   *  this to suppress the card-level toolbar when a block is selected. */
  onFreeformSelectionChange?: (hasSelection: boolean) => void;
  /** Forwarded to FreeformLayer — the currently-selected freeform block ids,
   *  so the side-panel Font dropdown can scope to the selection. */
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Forwarded to FreeformLayer. Fires when the user clicks an empty
   *  image placeholder block — parent opens the Media panel bound to
   *  fill that block. */
  onImagePlaceholderClick?: (blockId: string) => void;
  /** Forwarded to FreeformLayer. Fires when the user double-clicks a chart
   *  block or picks "Edit chart data" from its context menu — parent opens the
   *  ChartDataGrid modal bound to that block. */
  onEditChart?: (blockId: string) => void;
  /** Fires when a library image is dropped onto this card. xPct/yPct are the
   *  drop point as a 0–100 fraction of the card's width/height (top-left of
   *  the new block). Parent creates a FreeformImageBlock there. */
  onImageDrop?: (
    sel: { src: string; width: number; height: number; alt?: string },
    xPct: number,
    yPct: number,
  ) => void;
  /** Editor scroll container — forwarded to FreeformLayer so the portaled
   *  inline toolbar can reposition itself when the user scrolls. */
  scrollContainer?: HTMLElement | null;
  cardRef?: (el: HTMLDivElement | null) => void;
  /** Every slide in the deck (id/index/title) — forwarded to FreeformLayer for
   *  the link editor's Slide picker + "slide N" hover labels. */
  deckSlides?: DeckSlideRef[];
  /** Jump the editor to another slide when a slide-link is activated. */
  onNavigateToSlide?: (slideId: string) => void;
  /** Set of selected block keys ("cardIdx:blockIdx") */
  selectedBlockKeys?: Set<string>;
  onSelectBlock?: (blockIndex: number, additive: boolean) => void;
  blockOverrides?: Record<string, BlockStyleOverride>;
  /**
   * Forwarded to every Typewriter inside this card. False suppresses the
   * type-out animation — used for duplicates, manually-added cards, and
   * cards whose initial reveal has already settled (so user edits don't
   * re-animate).
   */
  animate?: boolean;
}) {
  const blocks = card.columns[0]?.blocks || [];
  const isHero = card.layout === 'split-left' || card.layout === 'split-right';
  const isChapter = card.style === 'chapter';
  const isDark = card.style === 'dark';
  // Surface tone for the text-contrast guarantee: a DARK theme makes every card
  // dark even when the card's own `style` is 'default'. Keying the contrast
  // stand-in off card.style alone made dark-theme cards fall back to a WHITE
  // region bg → pickTextColor chose dark text → invisible on the dark card
  // (Lisa 2026-06-05). Derive it from the document theme tone too.
  const surfaceIsDark = isDark || (!!themeId && getThemeById(themeId)?.tone === 'dark');

  // Detect skeleton card: only has heading + empty paragraph. A user-created
  // blank slide shares this shape but must render empty (no shimmer) — the
  // `blank` flag distinguishes it from a generation skeleton (Lisa 2026-06-16).
  const isSkeleton = !card.blank && blocks.length <= 2 && blocks.some(b => b.type === 'paragraph' && b.content === '');

  // Drop-target arming for library-image drag-and-drop. Set true while a
  // library image is dragged over this card; paints a dashed indigo border
  // + soft glow so the user sees where it will land. Cleared on drop/leave.
  const [dropArmed, setDropArmed] = useState(false);

  // Card surface uses the active document theme's page bg + optional pattern.
  // Each card is conceptually a "page" of the document; the editor wrapper
  // around the cards is the workspace. Author overrides on individual cards
  // (dark, chapter, explicit background) still win.
  //
  // pagePattern is a "showroom" texture — it's intentionally only on the
  // FIRST card (the cover) so the rest of the deck reads cleanly. Mirrors
  // ThemePreview's behavior where slide 1 demos the pattern and slides 2-N
  // are pure pageBg. Without this gate, themes with stripes/dots/grids
  // (Solstice, Counsel, Volt, Velvet, etc.) repeated their texture on every
  // slide and the rendered deck stopped matching the theme tile preview.
  const isCover = index === 0;

  // ── Cover tier (slide 0) ──────────────────────────────────────────────────
  // The approved tiered-hybrid cover: each theme's cover is photo / split /
  // type, auto-picked from the theme identity and overridable. The flat
  // gradient cover is gone — the surface below is the theme's pageBg + pattern
  // (the typographic baseline), and the photo/split image rides in as a
  // freeform full-bleed / column block via the existing image pipeline + scrim.
  // The 'type' tier additionally renders a corner motif (CoverArt). When no
  // themeId is available (older decks) we fall back to 'type' — the never-
  // breaks baseline (never the deleted gradient, never a broken image box).
  const coverTheme = isCover && themeId ? getThemeById(themeId) : null;
  const coverTier: CoverTier | null = isCover
    ? ((card.slideDesign?.coverTier as CoverTier | undefined)
        ?? (coverTheme ? coverTierForTheme(coverTheme) : 'type'))
    : null;

  // A structured card carries its OWN slide-ground (theme background + texture —
  // e.g. Volt's dark #131D2E + glow image) in `card.background`. Honor it exactly
  // as SlideStage / the PPTX export do, so the editor paints the SAME slide they
  // do (this is the fix for the editor-vs-export theme divergence). Falls through
  // to the per-card / theme treatment only when no card background is set, so
  // themes/cards without a baked background are unchanged. (Lisa 2026-06-24)
  const cb = card.background;
  const cbStyle: React.CSSProperties | null = cb?.image
    ? { background: `${cb.color ?? '#131D2E'} url('${cb.image}') center / cover no-repeat` }
    : cb?.gradient
      ? { background: cb.gradient }
      : cb?.color
        ? { background: cb.color }
        : null;
  const cardStyle: React.CSSProperties = cbStyle ?? (isDark
    ? { background: 'linear-gradient(135deg, #1a1a3e, #2a2a5a)' }
    : isChapter
    ? { background: 'linear-gradient(135deg, #e8eaf6 0%, #d6daf0 50%, #cfd6fc 100%)' }
    : card.blank
    // Blank slide: flat theme page bg only — no cover pattern/texture, so it
    // reads as a clean empty page (Lisa 2026-06-16).
    ? { backgroundImage: 'var(--theme-page-bg)' }
    : isCover
    ? { backgroundImage: 'var(--theme-page-pattern), var(--theme-page-bg)' }
    : { backgroundImage: 'var(--theme-page-bg)' });

  return (
    <div
      ref={cardRef}
      data-card-id={card.id}
      onClick={onClick}
      onDragOver={onImageDrop ? (e) => {
        // Only arm when the drag carries a library image (custom MIME). The
        // thumbnail-reorder drag uses text/plain — ignore it here so it
        // doesn't paint a drop-target on the canvas.
        if (!e.dataTransfer.types.includes(LIBRARY_IMAGE_DND_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dropArmed) setDropArmed(true);
      } : undefined}
      onDragLeave={onImageDrop ? (e) => {
        // Only disarm when the pointer actually left the card (not when
        // moving over a child element).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropArmed(false);
      } : undefined}
      onDrop={onImageDrop ? (e) => {
        const raw = e.dataTransfer.getData(LIBRARY_IMAGE_DND_MIME);
        if (!raw) return;
        e.preventDefault();
        setDropArmed(false);
        let sel: LibrarySelection;
        try {
          sel = JSON.parse(raw) as LibrarySelection;
        } catch {
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const xPct = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
        const yPct = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
        onImageDrop(sel, Math.max(0, Math.min(100, xPct)), Math.max(0, Math.min(100, yPct)));
      } : undefined}
      style={{
        ...cardStyle,
        // `position: relative` anchors the FreeformLayer (absolute, inset:0)
        // to the card's bounding box.
        position: 'relative',
        // Cap the slide-card corner radius — some legacy themes carry a very
        // large cardRadius (e.g. 38) that reads as over-rounded (Lisa 2026-07-13).
        borderRadius: radiusOverride != null ? `${radiusOverride}px` : rounded ? `${Math.min(theme.cardRadius || 12, 12)}px` : 0,
        padding: isHero ? 0 : `${theme.cardPadding || 48}px`,
        // Breathing room between slides in the scrolling stack (Lisa 2026-06-14).
        marginBottom: '56px',
        // Fixed 16:9 PowerPoint widescreen at 0.5× export resolution.
        // 960×540 here renders to 1920×1080 on PPT export.
        width: '960px',
        height: '540px',
        flexShrink: 0,
        boxSizing: 'border-box',
        boxShadow: dropArmed
          ? '0 0 0 4px rgba(129,140,248,0.22), var(--theme-card-shadow-active)'
          : isActive
          ? 'var(--theme-card-shadow-active)'
          : 'var(--theme-card-shadow)',
        outline: dropArmed ? '2px dashed #818cf8' : undefined,
        outlineOffset: dropArmed ? '-2px' : undefined,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 200ms ease, opacity 300ms ease, transform 300ms ease, outline-color 160ms ease',
        opacity: 1,
        animation: 'cardReveal 0.4s ease-out forwards',
        display: 'flex',
        flexDirection: isHero ? 'row' : 'column',
        justifyContent: isHero ? undefined : 'center',
        alignItems: isHero ? 'stretch' : undefined,
        color: isDark ? 'white' : theme.headingColor,
        fontFamily: `${theme.bodyFont || 'Inter'}, system-ui, sans-serif`,
      }}
    >
      {/* Cover corner motif — the 'type' tier renders the theme's CoverArt as
          a quiet decorative mark behind the title (the prototype's corner
          motif). Sits above the page bg/pattern but below the FreeformLayer
          (z:2) and the title text. Photo/split tiers let their imagery carry
          the visual weight, so no motif there. Decorative only — never
          intercepts pointers. CoverArt ships its own internal opacities. */}
      {isCover && !card.blank && !card.structuredCover && coverTier === 'type' && coverTheme && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit' }}>
          <CoverArt theme={coverTheme} dark={coverTheme.tone === 'dark'} />
        </div>
      )}

      {/* No accent zone for split layouts. The card-engine sets a theme-gradient
          `card.accent` on every split-left / split-right card, but that half-
          panel read as an empty "placeholder image" when nothing filled it
          (Issue #1, Lisa 2026-06-03). Imagery is now owned entirely by the
          Design Intelligence Layer (`slideDesign.imageRole` / `imageIntent`),
          which places real images as freeform blocks above this content; the
          freeform converter reflows text to full width (no reserved half). So
          we render no accent panel — content fills the card and the DIL decides
          if and where an image goes. */}

      {/* Content */}
      <div style={{
        flex: 1,
        padding: isHero ? `${theme.cardPadding || 48}px` : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {isSkeleton ? (
          /* Skeleton shimmer — card shell while AI generates content */
          <div style={{ animation: 'shimmer 1.5s ease-in-out infinite' }}>
            {blocks.filter(b => b.type === 'heading').map((block, i) => (
              <CardBlockView key={i} block={block} theme={isDark ? { ...theme, headingColor: '#ffffff', bodyColor: '#c8c8e0' } : theme} />
            ))}
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ height: '12px', borderRadius: '6px', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', width: '85%' }} />
              <div style={{ height: '12px', borderRadius: '6px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', width: '70%' }} />
              <div style={{ height: '12px', borderRadius: '6px', background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', width: '55%' }} />
            </div>
          </div>
        ) : (
          /* Real content — animate in when card completes. Heading types
             first, body / cells delay until the heading is finished so
             the read order matches the type order. */
          <div style={{ animation: 'contentFadeIn 0.5s ease-out' }}>
            {(() => {
              const headingBlock = blocks.find((b) => b.type === 'heading');
              const headingTypeMs = headingBlock
                ? estimateTypeDuration((headingBlock as { content: string }).content, 45, 250)
                : 0;
              return blocks.map((block, i) => {
                const blockKey = `${index}:${i}`;
                const isSelected = selectedBlockKeys?.has(blockKey) ?? false;
                const override = blockOverrides?.[blockKey];
                const wrapperStyle: React.CSSProperties = {
                  position: 'relative',
                  borderRadius: '4px',
                  outline: isSelected ? `2px solid ${FOXIT_PURPLE}` : '2px solid transparent',
                  outlineOffset: '2px',
                  transition: 'outline-color 120ms ease',
                  ...overrideToStyle(override),
                };
                // Heading: 0 delay (types first).
                // Everything else: delay by heading duration.
                const blockDelay = block.type === 'heading' ? 0 : headingTypeMs;
                return (
                  <div
                    key={i}
                    data-block-key={blockKey}
                    style={wrapperStyle}
                    onClick={(e) => {
                      if (!onSelectBlock) return;
                      e.stopPropagation();
                      onSelectBlock(i, e.shiftKey);
                    }}
                  >
                    <CardBlockView
                      block={block}
                      theme={isDark ? { ...theme, headingColor: '#ffffff', bodyColor: '#c8c8e0' } : theme}
                      editable={isActive}
                      onChange={onBlockChange ? (next) => onBlockChange(i, next) : undefined}
                      typewriterDelay={blockDelay}
                      animate={animate}
                    />
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Cover decoration (WI-1 layout-as-data) — the VERBATIM approved Quartz
          cover background, painted BEHIND the freeform text. Gated on a KNOWN
          coverLayoutId composed by the piece replayer (source==='piece') so it
          only ever paints under a cover the emitter actually stamped. z-index 0,
          pointer-events none → sits under the freeform blocks and never
          intercepts clicks. Same 960×540 surface coordinate space as the
          FreeformLayer below it. */}
      {card.slideDesign?.source === 'piece' &&
        card.slideDesign?.coverLayoutId &&
        COVER_LAYOUT_PIECES[card.slideDesign.coverLayoutId] && (
          <CoverDecoration layoutId={card.slideDesign.coverLayoutId} />
        )}

      {/* Freeform overlay — absolutely positioned above structured content.
          Renders user-added text/image/shape/icon blocks per the Phase 1
          spec (.apm/design-specs/freeform-blocks-phase1.md). Pointer events
          on the layer flow to the blocks themselves; clicks on empty layer
          area deselect. */}
      {onFreeformChange && (
        <FreeformLayer
          blocks={card.freeform ?? []}
          onChange={onFreeformChange}
          onGestureStart={onFreeformGestureStart}
          onGestureEnd={onFreeformGestureEnd}
          onOpenFontPanel={onFreeformOpenFontPanel}
          fontPanelOpen={freeformFontPanelOpen}
          cardWidth={960}
          cardHeight={540}
          interactive={isActive}
          onSelectionChange={onFreeformSelectionChange}
          onSelectedIdsChange={onSelectedIdsChange}
          onImagePlaceholderClick={onImagePlaceholderClick}
          onEditChart={onEditChart}
          scrollContainer={scrollContainer ?? null}
          // Text-contrast guarantee (Lisa 2026-06-03). slideDesign carries the
          // imageRole/text-safe zone so the layer can paint a scrim for
          // behind-text image roles. regionBgHex is a solid stand-in for the
          // card surface tone (dark cards ~#1a1a3e, light ~white) so adaptive
          // text color can flip when the theme color would wash out. Theme
          // body/title colors are passed so a legible theme color is kept.
          slideDesign={card.slideDesign}
          regionBgHex={surfaceIsDark ? '#1a1a3e' : (isHexColor(theme.cardBg) ? theme.cardBg : '#ffffff')}
          themeBodyHex={isHexColor(theme.bodyColor) ? theme.bodyColor : undefined}
          themeTitleHex={isHexColor(theme.headingColor) ? theme.headingColor : undefined}
          deckSlides={deckSlides}
          currentSlideId={card.id}
          onNavigateToSlide={onNavigateToSlide}
        />
      )}

    </div>
  );
}

// ── Thumbnail Sidebar ──────────────────────────────────────────────────────

const NOOP_FREEFORM = () => {};

/** Renders the REAL FreeformLayer scaled down so the thumbnail is pixel-faithful
 *  to the canvas — same component, same CSS-variable theme treatment (incl. the
 *  gradient-clipped title), same scrim/contrast logic. `staticRender` skips the
 *  auto-layout measurement (which would corrupt under transform:scale) and all
 *  mutation; `interactive={false}` disables drag/select. A ResizeObserver tracks
 *  the responsive thumb width so the 960×540 layer scales to fit exactly. */
function ScaledSlideThumb({ card, regionBgHex, themeBodyHex, themeTitleHex }: { card: Card; regionBgHex: string; themeBodyHex?: string; themeTitleHex?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.146);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth; if (w > 0) setScale(w / 960); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ width: 960, height: 540, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        {/* Cover decoration in the thumbnail too — same SVG layer, scales with the
            960×540 surface so the sidebar thumb matches the canvas (WI-1). */}
        {card.slideDesign?.source === 'piece' &&
          card.slideDesign?.coverLayoutId &&
          COVER_LAYOUT_PIECES[card.slideDesign.coverLayoutId] && (
            <CoverDecoration layoutId={card.slideDesign.coverLayoutId} />
          )}
        <FreeformLayer
          blocks={card.freeform ?? []}
          onChange={NOOP_FREEFORM}
          cardWidth={960}
          cardHeight={540}
          interactive={false}
          staticRender
          slideDesign={card.slideDesign}
          regionBgHex={regionBgHex}
          themeBodyHex={themeBodyHex}
          themeTitleHex={themeTitleHex}
        />
      </div>
    </div>
  );
}

// Legacy thumbnail re-implementation (superseded by ScaledSlideThumb above).
// Kept temporarily; no longer called. Walks `card.freeform[]` and
// positions each block absolutely using %-of-card coordinates so the thumbnail
// is pixel-faithful to the canvas at scale. Replaces the legacy CardBlock-type
// iteration that broke when the unified-format rewrite (2026-05-21) wiped
// `card.columns[0].blocks` and moved all content into `card.freeform[]`.
interface FreeformThumbCtx {
  isCardDark: boolean;
  headingColorStyle: React.CSSProperties;
  bodyColor: string;
  accentColor: string;
}

function renderFreeformThumbBlock(block: FreeformBlock, ctx: FreeformThumbCtx): React.ReactNode {
  const wrap: React.CSSProperties = {
    position: 'absolute',
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.w}%`,
    height: `${block.h}%`,
    transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    overflow: 'hidden',
    pointerEvents: 'none',
  };

  if (block.type === 'text') {
    const variant = block.variant;
    // Variant-driven type styles scaled to thumbnail. Matches FreeformLayer's
    // TextContent — just smaller font sizes that read at ~140px-wide thumbs.
    const variantStyle: React.CSSProperties =
      variant === 'heading'
        ? { fontSize: '0.5rem', fontWeight: 800, lineHeight: 1.15, ...ctx.headingColorStyle, fontFamily: 'var(--theme-title-font)' }
        : variant === 'subheading'
          ? { fontSize: '0.36rem', fontWeight: 600, lineHeight: 1.3, color: 'var(--theme-link-color)', fontFamily: 'var(--theme-title-font)' }
          : { fontSize: '0.28rem', fontWeight: 400, lineHeight: 1.4, color: ctx.bodyColor, fontFamily: 'var(--theme-body-font)' };
    // User color override wins. If the user set a solid color on a heading,
    // reset the gradient-clip technique so the new color renders.
    const userColor = block.style?.color;
    const overrides: React.CSSProperties = {
      ...(userColor
        ? { color: userColor, backgroundImage: 'none', WebkitTextFillColor: 'initial' }
        : {}),
      fontFamily: block.style?.fontFamily ?? (variantStyle.fontFamily as string | undefined),
      textAlign: block.style?.textAlign,
      fontStyle: block.style?.italic ? 'italic' : undefined,
      textDecoration: block.style?.underline ? 'underline' : undefined,
    };
    return (
      <div
        key={block.id}
        style={{
          ...wrap,
          ...variantStyle,
          ...overrides,
          display: '-webkit-box',
          WebkitLineClamp: variant === 'paragraph' ? 4 : variant === 'subheading' ? 3 : 2,
          WebkitBoxOrient: 'vertical',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {block.content}
      </div>
    );
  }

  if (block.type === 'image') {
    return (
      <div
        key={block.id}
        style={{
          ...wrap,
          background: block.src
            ? `url("${block.src}") center / ${block.fit ?? 'cover'} no-repeat`
            : ctx.isCardDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          // Honor the canvas image treatment so the thumbnail matches. For
          // texture/background roles the canvas fades the photo to a faint
          // wash via block.opacity (~0.18, see page.tsx imageRoleOpacity);
          // mirroring it here keeps the thumbnail readable instead of showing
          // a full-strength photo the canvas never displays. Full-bleed scrim
          // images (no block.opacity) render at full strength here — the
          // thumbnail omits the scrim overlay; acceptable at thumb scale.
          opacity: block.src && block.opacity !== undefined ? block.opacity : undefined,
          borderRadius: 1,
          border: !block.src ? '0.5px dashed rgba(0,0,0,0.15)' : undefined,
        }}
      />
    );
  }

  if (block.type === 'shape') {
    const fill = block.fill ?? ctx.accentColor;
    const stroke = block.stroke;
    const strokeWidth = stroke && block.strokeWidth ? Math.max(0.5, block.strokeWidth * 0.15) : 0.5;
    if (block.shape === 'rectangle') {
      return (
        <div
          key={block.id}
          style={{
            ...wrap,
            background: fill,
            borderRadius: block.borderRadius ? Math.max(0.5, block.borderRadius * 0.15) : 0.5,
            border: stroke ? `${strokeWidth}px solid ${stroke}` : undefined,
          }}
        />
      );
    }
    if (block.shape === 'circle') {
      return (
        <div
          key={block.id}
          style={{
            ...wrap,
            background: fill,
            borderRadius: '50%',
            border: stroke ? `${strokeWidth}px solid ${stroke}` : undefined,
          }}
        />
      );
    }
    if (block.shape === 'line') {
      return (
        <svg key={block.id} style={wrap} viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="0" y1="50" x2="100" y2="50" stroke={stroke ?? fill} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      );
    }
    // arrow
    return (
      <svg key={block.id} style={wrap} viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="50" x2="80" y2="50" stroke={stroke ?? fill} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polygon points="80,40 100,50 80,60" fill={stroke ?? fill} />
      </svg>
    );
  }

  if (block.type === 'icon') {
    // Approximate icon px size from block %. Card is 16:9 (~960x540) and the
    // thumbnail is ~140px wide, so 1% of width ≈ 1.4px. Bounded [4, 20].
    const approxSize = Math.max(4, Math.min(20, Math.round(Math.min(block.w, block.h * (9 / 16)) * 1.4)));
    return (
      <div
        key={block.id}
        style={{
          ...wrap,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: block.color ?? ctx.accentColor,
        }}
      >
        <PictographicIcon name={block.name} size={approxSize} color={block.color ?? ctx.accentColor} />
      </div>
    );
  }

  if (block.type === 'chart') {
    // Reuse the full ChartContent. The SVG viewBox naturally scales to the
    // thumbnail-sized wrapper, so the chart looks the same as on the canvas
    // — just smaller. ChartContent reads useTemplateTheme() which is in
    // scope here (the sidebar renders inside the same provider as the canvas).
    return (
      <div key={block.id} style={wrap}>
        <ChartContent block={block} />
      </div>
    );
  }

  return null;
}

// Skeleton placeholder thumbnail — shown for a slide that hasn't finished its
// canvas typewriter reveal yet. Matches the real thumbnail's 16:9 shape, border
// radius, and number strip so the rail's height/length is correct from the
// first frame (deck length is visible as progress) without spoiling content.
// The shimmer respects prefers-reduced-motion (static placeholder) via the
// `.thumb-skeleton-shimmer` class defined in the editor <style> block.
function SkeletonThumb({ index }: { index: number }) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          width: '100%',
          borderRadius: '6px',
          border: '1px solid var(--theme-chrome-border)',
          background: 'var(--theme-chrome-bg-elevated)',
          overflow: 'hidden',
        }}
      >
        <div
          className="thumb-skeleton-shimmer"
          style={{
            width: '100%',
            aspectRatio: '16/9',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '8%',
            padding: '12% 12%',
            boxSizing: 'border-box',
          }}
          aria-hidden
        >
          {/* Title bar + two body lines — abstract slide silhouette. */}
          <div style={{ height: '14%', width: '70%', borderRadius: '3px', background: 'var(--theme-chrome-hover)' }} />
          <div style={{ height: '8%', width: '90%', borderRadius: '3px', background: 'var(--theme-chrome-hover)' }} />
          <div style={{ height: '8%', width: '60%', borderRadius: '3px', background: 'var(--theme-chrome-hover)' }} />
        </div>
      </div>
      <div style={{ padding: '4px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--theme-chrome-fg-muted)' }}>
        {index + 1}
      </div>
    </div>
  );
}

// Short title for a slide, used by the navigator's title-list view: the
// freeform 'heading'-variant text block, else the first non-empty text
// block, else a legacy column heading, else "Slide N".
function slideTitle(card: Card, index: number): string {
  const texts = (card.freeform ?? []).filter(
    (b): b is FreeformTextBlock => b.type === 'text',
  );
  const heads = texts.find((b) => b.variant === 'heading' && b.content.trim().length >= 2);
  if (heads) return heads.content.trim();
  // Skip tiny fragments (step numbers, single glyphs) when guessing a title.
  const firstText = texts.find((b) => b.content.trim().length >= 3);
  if (firstText) return firstText.content.trim();
  const heading = (card.columns ?? [])
    .flatMap((c) => c.blocks)
    .find((b) => b.type === 'heading' && 'content' in b && (b as { content: string }).content.trim());
  if (heading && 'content' in heading) return (heading as { content: string }).content.trim();
  return `Slide ${index + 1}`;
}

function ThumbnailSidebar({
  cards,
  theme,
  activeIndex,
  onSelect,
  visibleCount,
  streaming = false,
  onAddCard,
  onDuplicate,
  onDelete,
  onMoveCard,
  onOpenLayoutsPanel,
  onSwapCoverTier,
  layoutSwapBusyIndex,
  surfaceIsDark,
}: {
  cards: Card[];
  /** Whether the active theme/surface is dark — mirrors the canvas's
   *  surfaceIsDark so thumbnail FreeformLayers resolve text contrast the same. */
  surfaceIsDark: boolean;
  theme: CardTemplate['theme'];
  activeIndex: number;
  onSelect: (i: number) => void;
  visibleCount: number;
  /** Generation in progress — sidebar collapses to a single "Building deck…"
   *  indicator and skips rendering per-card thumbnails until the deck is
   *  finished. Per Lisa 2026-05-21 — partial thumbnails were noisy and
   *  often blank because cells haven't streamed in yet. */
  streaming?: boolean;
  onAddCard: () => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  onMoveCard: (fromIndex: number, toIndex: number) => void;
  /** "Try different layout" — context-menu click on a thumbnail now opens the
   *  left-panel "Layouts" tab scoped to the right-clicked card. The actual
   *  layout-swap network call lives in the parent. Per Lisa 2026-05-23 —
   *  replaces the floating popover that shipped 2026-05-22 (P1 #6) with the
   *  left-panel pattern used by every other tool. */
  onOpenLayoutsPanel?: (cardIndex: number) => void;
  /** "Try different cover" — cover (index 0) only. Cycles the cover tier
   *  (photo → split → type → photo) and re-fetches a mood-matched image for
   *  photo/split. The parent owns the cycle + image fetch. */
  onSwapCoverTier?: (cardIndex: number) => void;
  /** When set, the matching thumbnail shows a spinner state — used to hint
   *  that a layout swap is in flight (driven from the Layouts panel). */
  layoutSwapBusyIndex?: number | null;
}) {
  // Track hovered thumbnail index for showing the inline action buttons
  // (Duplicate / Delete) only when the user is over a card.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // Right-click context menu state. Coordinates are viewport-relative because
  // the menu is rendered in a fixed-position layer.
  const [ctxMenu, setCtxMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  // Drag-and-drop reorder state. draggedIdx is the source; dragOverIdx is
  // the current hover target (used to render a drop indicator). Resets on
  // dragend so a cancelled drag doesn't leave stale state.
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Floating-navigator chrome (per Lisa 2026-06-14): the panel floats over the
  // canvas and can be minimized to a small launcher; the body switches between
  // slide thumbnails and a compact title list.
  const [minimized, setMinimized] = useState(false);
  const [viewMode, setViewMode] = useState<'thumbs' | 'list'>('thumbs');
  // ESC closes the context menu.
  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtxMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

  // Dismissed: the whole navigator is hidden; only a small floating launcher
  // icon remains so the user can bring it back (Gamma "open filmstrip"
  // pattern). No + here — adding slides happens from the open panel. Per Lisa
  // 2026-06-14.
  if (minimized) {
    return (
      <button
        type="button"
        data-print-hide
        title="Show slides"
        aria-label="Show slide navigator"
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed', right: '16px', top: '72px', zIndex: 30,
          width: '40px', height: '40px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--theme-chrome-bg)',
          border: '1px solid var(--theme-chrome-border)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(15,23,42,0.16)',
          color: 'var(--theme-chrome-fg)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--theme-chrome-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--theme-chrome-bg)'; }}
      >
        <LayoutGrid size={18} />
      </button>
    );
  }

  return (
    <div data-print-hide style={{
      // Floating navigator — overlays the canvas at the right edge (no longer
      // a docked flex column), so the top toolbar now reaches the true right
      // edge. Per Lisa 2026-06-14.
      position: 'fixed',
      right: '16px',
      top: '72px',
      // Clear the speaker-notes bar at the bottom so it (and the relocated
      // zoom control) stays reachable beneath the floating panel.
      bottom: '64px',
      width: '212px',
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--theme-chrome-bg)',
      border: '1px solid var(--theme-chrome-border)',
      borderRadius: '14px',
      boxShadow: '0 12px 36px rgba(15,23,42,0.16)',
      color: 'var(--theme-chrome-fg)',
      overflow: 'hidden',
    }}>
      {/* Header — view toggle (thumbnails / titles) + minimize. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 8px 8px 10px',
        borderBottom: '1px solid var(--theme-chrome-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--theme-chrome-bg-elevated)', borderRadius: '8px', padding: '2px' }}>
          {([
            ['thumbs', LayoutGrid, 'Thumbnails'] as const,
            ['list', List, 'Slide titles'] as const,
          ]).map(([mode, Icon, label]) => {
            const on = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={on}
                onClick={() => setViewMode(mode)}
                style={{
                  width: '30px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', borderRadius: '6px', cursor: 'pointer',
                  background: on ? 'var(--theme-chrome-bg)' : 'transparent',
                  color: on ? FOXIT_PURPLE : 'var(--theme-chrome-fg-muted)',
                  boxShadow: on ? '0 1px 2px rgba(15,23,42,0.10)' : 'none',
                }}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss slide navigator"
          onClick={() => setMinimized(true)}
          style={{ width: '30px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--theme-chrome-fg-muted)', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* + New slide — always visible below the header. Hidden during streaming
          since adding into a deck that's still being generated would race the
          SSE writer. (When the panel is minimized this collapses to just +.) */}
      {!streaming && (
        <div style={{ padding: '8px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onAddCard}
            aria-label="Add new slide"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px dashed var(--theme-chrome-border-strong)',
              background: 'transparent',
              color: 'var(--theme-chrome-fg)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              fontFamily: 'Inter, system-ui, sans-serif',
              minHeight: '36px',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--theme-chrome-hover)';
              e.currentTarget.style.borderStyle = 'solid';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderStyle = 'dashed';
            }}
          >
            <Plus size={14} /> New slide
          </button>
        </div>
      )}

      {/* Scroll body — thumbnails or compact title list. */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {viewMode === 'list' ? (
        (streaming ? cards : cards.slice(0, visibleCount)).map((card, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(i)}
              title={slideTitle(card, i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', textAlign: 'left',
                padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                border: isActive ? '1px solid #a78bfa' : '1px solid transparent',
                background: isActive ? 'rgba(167,139,250,0.12)' : 'transparent',
                color: 'var(--theme-chrome-fg)',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--theme-chrome-hover)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                flexShrink: 0, minWidth: '18px', fontSize: '0.7rem', fontWeight: 600,
                color: isActive ? '#a78bfa' : 'var(--theme-chrome-fg-subtle)',
              }}>{i + 1}</span>
              <span style={{
                fontSize: '0.8rem', fontWeight: isActive ? 600 : 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{slideTitle(card, i)}</span>
            </button>
          );
        })
      ) : (
        <>

      {/* During generation the rail shows one skeleton placeholder PER PLANNED
          slide immediately (deck length = progress), and each skeleton swaps
          to its real rendered miniature only AFTER that card has finished its
          canvas typewriter reveal. `visibleCount` (= the canvas's
          `visibleCards`) is that synced signal — it advances one card at a
          time as each card's reveal timer completes, so the rail never shows
          content the canvas hasn't revealed yet. (Lisa 2026-06-03 — replaces
          the prior "Building deck…" blob that hid all thumbnails until done.)
          A single map preserves slide order: each index renders a skeleton
          while the slide is at/after the reveal frontier OR still a blueprint
          shell (content not streamed yet), then the real thumbnail once
          revealed. When NOT streaming we slice to visibleCount as before
          (loaded decks reveal everything immediately). */}
      {(streaming ? cards : cards.slice(0, visibleCount)).map((card, i) => {
        if (streaming) {
          const blocks = card.columns?.[0]?.blocks ?? [];
          const isShell =
            (card.freeform?.length ?? 0) === 0 &&
            blocks.length <= 2 &&
            blocks.some((b) => b.type === 'paragraph' && (b as { content?: string }).content === '');
          const revealed = i < visibleCount && !isShell;
          if (!revealed) return <SkeletonThumb key={card.id} index={i} />;
        }
        const isActive = i === activeIndex;
        // Unified format (2026-05-21) — all card content lives in `freeform[]`.
        // `card.columns` is wiped to one empty column by `structuredToFreeform`
        // on AI generation, and pre-rewrite decks are filtered out at load
        // (cardDeckStorage `CURRENT_DECK_FORMAT = 2`). Fresh manual cards have
        // no content in either array → thumb renders empty, which is correct.
        const freeforms = card.freeform ?? [];
        const isCardDark = card.style === 'dark';
        const isCardChapter = card.style === 'chapter';
        const isHero = card.layout === 'split-left' || card.layout === 'split-right';

        // Paint the thumbnail with the EXACT same slide background the canvas
        // uses — cardBackground() resolves per-card image/gradient/color, then
        // dark/chapter styles, then the theme's SLIDE bg (theme.cardBg). This
        // is the single source of truth shared with SlideStage / SlideDeckPrint,
        // so the preview can never drift from the canvas. (It previously read
        // --theme-page-bg, the editor WORKSPACE bg — fine when a theme's slide
        // and page bg matched, but themes like Volt deliberately differ: dark
        // navy slide vs. a lighter page → the thumbnail rendered white while the
        // slide was navy.) The cover decoration is drawn inside ScaledSlideThumb
        // exactly as on the canvas, so no page-pattern overlay is needed here.
        const thumbStyle: React.CSSProperties = { background: cardBackground(card, theme) };

        // Heading + body color resolution. For per-card dark/chapter
        // overrides we hardcode legible defaults; otherwise consume the
        // active theme variables so switching themes refreshes thumbs.
        const headingColorStyle: React.CSSProperties = isCardDark
          ? { color: '#ffffff' }
          : isCardChapter
          ? { color: '#1a1f36' }
          : {
              backgroundImage: 'var(--theme-title-color)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            };
        const bodyColor = isCardDark
          ? 'rgba(255,255,255,0.7)'
          : isCardChapter
          ? '#475569'
          : 'var(--theme-body-color)';

        const showActions = hoveredIdx === i;
        const isDragging = draggedIdx === i;
        const isDragOver = dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
        // Indicate where the drop will land — above when dragging from below,
        // below when dragging from above. Cleaner than a single line either way.
        const showDropIndicatorAbove =
          isDragOver && draggedIdx !== null && draggedIdx > i;
        const showDropIndicatorBelow =
          isDragOver && draggedIdx !== null && draggedIdx < i;
        return (
          <div
            key={card.id}
            draggable
            onDragStart={(e) => {
              setDraggedIdx(i);
              e.dataTransfer.effectAllowed = 'move';
              // Some browsers require setData to begin the drag.
              try {
                e.dataTransfer.setData('text/plain', String(i));
              } catch {
                /* ignore */
              }
            }}
            onDragEnd={() => {
              setDraggedIdx(null);
              setDragOverIdx(null);
            }}
            onDragOver={(e) => {
              if (draggedIdx === null || draggedIdx === i) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverIdx(i);
            }}
            onDragLeave={() => {
              setDragOverIdx((prev) => (prev === i ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedIdx === null || draggedIdx === i) return;
              onMoveCard(draggedIdx, i);
              setDraggedIdx(null);
              setDragOverIdx(null);
            }}
            style={{
              position: 'relative',
              width: '100%',
              opacity: isDragging ? 0.4 : 1,
              transition: 'opacity 150ms ease',
              cursor: isDragging ? 'grabbing' : 'grab',
              // Drop indicator: a thick violet line above or below the target.
              boxShadow: showDropIndicatorAbove
                ? 'inset 0 3px 0 0 #6B3FA0'
                : showDropIndicatorBelow
                ? 'inset 0 -3px 0 0 #6B3FA0'
                : 'none',
              borderRadius: '6px',
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              // Clamp the menu origin so it stays fully inside the viewport
              // when the right-click lands near the right or bottom edge —
              // earlier behaviour pinned to (clientX, clientY) which clipped
              // labels on thumbnails near the right rail (UAT-found, 2026-05-24).
              // 200×240 is the conservative menu footprint (minWidth 180 +
              // padding, 6 items + 2 dividers).
              const MENU_W = 200;
              const MENU_H = 240;
              const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8);
              const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8);
              setCtxMenu({ index: i, x, y });
            }}
          >
          <button
            type="button"
            onClick={() => onSelect(i)}
            style={{
              width: '100%',
              display: 'block',
              borderRadius: '6px',
              border: isActive ? '2px solid #a78bfa' : '1px solid var(--theme-chrome-border)',
              background: 'var(--theme-chrome-bg-elevated)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 150ms ease',
              overflow: 'hidden',
              padding: 0,
              boxShadow: isActive ? '0 0 0 2px rgba(167,139,250,0.20)' : '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            {/* Scaled card preview — full-bleed position:relative so freeform
                blocks position absolutely with %-of-card coords, mirroring the
                canvas pixel-faithfully at scale. Pre-unified-format code used
                flex layout because content was structured (column-flow); under
                unified format every block carries its own absolute position. */}
            <div style={{
              ...thumbStyle,
              width: '100%',
              aspectRatio: '16/9',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* No accent half in the thumbnail — mirrors the canvas. Imagery
                  is owned by the Design Intelligence Layer and rendered as
                  freeform blocks below; the legacy split gradient placeholder
                  is gone (Issue #1, Lisa 2026-06-03). */}
              <ScaledSlideThumb
                card={card}
                regionBgHex={(surfaceIsDark || isCardDark) ? '#1a1a3e' : (isHexColor(theme.cardBg) ? theme.cardBg : '#ffffff')}
                themeBodyHex={isHexColor(theme.bodyColor) ? theme.bodyColor : undefined}
                themeTitleHex={isHexColor(theme.headingColor) ? theme.headingColor : undefined}
              />
            </div>
            {/* Card number — uses chrome vars so the strip below the preview
                stays legible on dark chrome */}
            <div style={{
              padding: '4px 8px',
              fontSize: '0.65rem',
              fontWeight: 600,
              color: isActive ? '#a78bfa' : 'var(--theme-chrome-fg-muted)',
            }}>
              {i + 1}
            </div>
          </button>

          {/* Layout-swap busy overlay — covers the thumbnail with a
              translucent veil + centered spinner whenever the parent's
              regenerate-card request is in flight against this thumbnail.
              Was state-tracked but invisible before (UAT-found, 2026-05-24);
              the only feedback was the small "Saving…" indicator in the
              top bar which users miss. */}
          {layoutSwapBusyIndex === i && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.65)',
                borderRadius: '6px',
                zIndex: 4,
                pointerEvents: 'none',
              }}
              aria-hidden
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  border: '2.5px solid rgba(107, 63, 160, 0.18)',
                  borderTopColor: '#6B3FA0',
                  borderRadius: '50%',
                  animation: 'spin 0.85s linear infinite',
                }}
              />
            </div>
          )}

          {/* Hover-only action chip group: Duplicate / Delete. Hidden until
              the user hovers the thumbnail. Right-click on the thumbnail
              opens a context menu with the same actions plus reorder. */}
          {showActions && (
            <div
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                display: 'flex',
                gap: '2px',
                zIndex: 3,
              }}
            >
              <button
                type="button"
                title="Duplicate slide"
                aria-label="Duplicate slide"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(i);
                }}
                style={thumbActionBtnStyle}
              >
                <Copy size={11} />
              </button>
              <button
                type="button"
                title="Delete slide"
                aria-label="Delete slide"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(i);
                }}
                style={thumbActionBtnStyle}
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
          </div>
        );
      })}

      {/* Trailing rail spinner removed 2026-06-03 — skeleton placeholders now
          cover every not-yet-revealed slide, so a separate "more coming"
          spinner is redundant. The skeletons themselves are the progress
          signal. */}

      {/* Right-click context menu — anchored at click position. */}
      {ctxMenu && (
        <>
          <div
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 80 }}
          />
          <div
            role="menu"
            style={{
              position: 'fixed',
              top: `${ctxMenu.y}px`,
              left: `${ctxMenu.x}px`,
              minWidth: '180px',
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
              padding: '6px 0',
              zIndex: 81,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            <CtxItem
              icon={<Copy size={13} />}
              label="Duplicate"
              onClick={() => {
                onDuplicate(ctxMenu.index);
                setCtxMenu(null);
              }}
            />
            <CtxItem
              icon={<ChevronRight size={13} style={{ transform: 'rotate(-90deg)' }} />}
              label="Move up"
              disabled={ctxMenu.index === 0}
              onClick={() => {
                onMoveCard(ctxMenu.index, ctxMenu.index - 1);
                setCtxMenu(null);
              }}
            />
            <CtxItem
              icon={<ChevronRight size={13} style={{ transform: 'rotate(90deg)' }} />}
              label="Move down"
              disabled={ctxMenu.index === cards.length - 1}
              onClick={() => {
                onMoveCard(ctxMenu.index, ctxMenu.index + 1);
                setCtxMenu(null);
              }}
            />
            {onOpenLayoutsPanel && (
              <>
                <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '4px 0' }} />
                <CtxItem
                  icon={<LayoutGrid size={13} />}
                  label="Try different layout"
                  onClick={() => {
                    // Open the left-panel Layouts tab scoped to the
                    // right-clicked card. Parent handles activeCard set +
                    // panel toggle (so the Layouts tab targets THIS card,
                    // not whatever was previously selected).
                    onOpenLayoutsPanel(ctxMenu.index);
                    setCtxMenu(null);
                  }}
                />
              </>
            )}
            {/* Cover only — cycle the cover COMPOSITION FORM (image+title
                layout: half → diagonal → bands → full-bleed → type-only). The
                auto-but-overridable swap from the title-cover spec. */}
            {onSwapCoverTier && ctxMenu.index === 0 && (
              <CtxItem
                icon={<ImageIcon size={13} />}
                label="Try a different title layout"
                onClick={() => {
                  onSwapCoverTier(ctxMenu.index);
                  setCtxMenu(null);
                }}
              />
            )}
            <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '4px 0' }} />
            <CtxItem
              icon={<Trash2 size={13} />}
              label="Delete"
              danger
              onClick={() => {
                onDelete(ctxMenu.index);
                setCtxMenu(null);
              }}
            />
          </div>
        </>
      )}

      {/* The Layouts picker grid lives in the left-panel "Layouts" tab now
          (rendered from CardEditor's rail-panel switch). The right-click
          "Try different layout" item above opens that tab via
          onOpenLayoutsPanel — no in-place popover. */}
        </>
      )}
      </div>
    </div>
  );
}

const thumbActionBtnStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#475569',
  padding: 0,
  fontFamily: 'inherit',
};

function CtxItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px 14px',
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '13px',
        color: disabled ? '#cbd5e1' : danger ? '#dc2626' : '#1a1f36',
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = '#f5f5f7';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ width: '14px', display: 'flex', justifyContent: 'center', color: 'inherit' }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// ── Floating Card Toolbar ──────────────────────────────────────────────────
// Appears above the selected card. Layout swap, Duplicate, Delete, Comment, More.

const FOXIT_PURPLE = '#6B3FA0';
const FOXIT_ORANGE = '#FF5F00';

const LAYOUT_OPTIONS: { value: CardLayout; label: string; icon: React.ReactNode }[] = [
  { value: 'single', label: 'Single', icon: <Square size={18} /> },
  { value: 'split-left', label: 'Split Left', icon: <Columns2 size={18} /> },
  { value: 'split-right', label: 'Split Right', icon: <Columns2 size={18} style={{ transform: 'scaleX(-1)' }} /> },
  { value: 'three-col', label: 'Three Column', icon: <Columns3 size={18} /> },
];

interface CardToolbarProps {
  cardEl: HTMLElement | null;
  scrollContainer: HTMLElement | null;
  currentLayout: CardLayout;
  onChangeLayout: (layout: CardLayout) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onComment: () => void;
  onRegenerate: () => void;
}

function CardToolbar({
  cardEl,
  scrollContainer,
  currentLayout,
  onChangeLayout,
  onDuplicate,
  onDelete,
  onComment,
  onRegenerate,
}: CardToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Track card position on scroll/resize and after layout changes
  useLayoutEffect(() => {
    if (!cardEl) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = cardEl.getBoundingClientRect();
      const toolbarHeight = 48;
      const margin = 12;
      // Clamp floor sits below the 56px full-width top bar (+margin) so a card
      // scrolled near the top doesn't tuck its toolbar behind the bar.
      const TOP_FLOOR = 56 + margin;
      // Spatial consistency: appear just above the selected card's top edge
      const top = Math.max(TOP_FLOOR, rect.top - toolbarHeight - margin);
      const left = rect.left + rect.width / 2;
      setPos({ top, left });
    };
    update();
    const target = scrollContainer ?? window;
    target.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      target.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [cardEl, scrollContainer]);

  // Close popovers when clicking outside
  useEffect(() => {
    if (!layoutOpen && !moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setLayoutOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [layoutOpen, moreOpen]);

  if (!pos || !cardEl) return null;

  const btnStyle: React.CSSProperties = {
    width: '44px',
    height: '44px',
    minWidth: '44px',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#1e293b', // slate-800
    cursor: 'pointer',
    borderRadius: '0.5rem',
    transition: 'background 150ms ease, color 150ms ease',
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Card actions"
      className="glass-panel"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 40,
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        animation: 'toolbarFadeIn 180ms ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Layout swap (D1 menu element) */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="Change layout"
          aria-label="Change card layout"
          aria-haspopup="menu"
          aria-expanded={layoutOpen}
          onClick={() => { setLayoutOpen((v) => !v); setMoreOpen(false); }}
          style={{
            ...btnStyle,
            background: layoutOpen ? 'rgba(107,63,160,0.08)' : 'transparent',
            color: layoutOpen ? FOXIT_PURPLE : btnStyle.color,
          }}
          onMouseEnter={(e) => { if (!layoutOpen) (e.currentTarget.style.background = 'rgba(107,63,160,0.06)'); }}
          onMouseLeave={(e) => { if (!layoutOpen) (e.currentTarget.style.background = 'transparent'); }}
        >
          <LayoutGrid size={16} />
        </button>
        {layoutOpen && (
          <div
            role="menu"
            className="glass-panel"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '12px',
              minWidth: '260px',
              zIndex: 50,
              animation: 'toolbarFadeIn 160ms ease-out',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '10px', paddingLeft: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Layout
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {LAYOUT_OPTIONS.map((opt) => {
                const active = opt.value === currentLayout;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    title={opt.label}
                    onClick={() => { onChangeLayout(opt.value); setLayoutOpen(false); }}
                    style={{
                      minHeight: '72px',
                      padding: '10px 8px',
                      borderRadius: '0.5rem',
                      border: active ? `1.5px solid ${FOXIT_PURPLE}` : '1px solid rgba(0,0,0,0.06)',
                      background: active ? 'rgba(107,63,160,0.06)' : '#ffffff',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      color: active ? FOXIT_PURPLE : '#475569',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(107,63,160,0.04)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#ffffff'; }}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.08)', margin: '0 2px' }} />

      <button
        type="button"
        title="Duplicate card"
        aria-label="Duplicate card"
        onClick={onDuplicate}
        style={btnStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(107,63,160,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Copy size={16} />
      </button>

      <button
        type="button"
        title="Regenerate card"
        aria-label="Regenerate card with AI"
        onClick={onRegenerate}
        style={btnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,63,160,0.06)'; e.currentTarget.style.color = FOXIT_PURPLE; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1e293b'; }}
      >
        <RefreshCw size={16} />
      </button>

      <button
        type="button"
        title="Add comment"
        aria-label="Add comment to card"
        onClick={onComment}
        style={btnStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(107,63,160,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <MessageSquare size={16} />
      </button>

      <button
        type="button"
        title="Delete card"
        aria-label="Delete card"
        onClick={onDelete}
        style={btnStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(107,63,160,0.06)'; e.currentTarget.style.color = FOXIT_ORANGE; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#1e293b'; }}
      >
        <Trash2 size={16} />
      </button>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => { setMoreOpen((v) => !v); setLayoutOpen(false); }}
          style={{
            ...btnStyle,
            background: moreOpen ? 'rgba(107,63,160,0.08)' : 'transparent',
            color: moreOpen ? FOXIT_PURPLE : btnStyle.color,
          }}
          onMouseEnter={(e) => { if (!moreOpen) (e.currentTarget.style.background = 'rgba(107,63,160,0.06)'); }}
          onMouseLeave={(e) => { if (!moreOpen) (e.currentTarget.style.background = 'transparent'); }}
        >
          <MoreHorizontal size={16} />
        </button>
        {moreOpen && (
          <div
            role="menu"
            className="glass-panel"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              padding: '6px',
              minWidth: '180px',
              zIndex: 50,
              animation: 'toolbarFadeIn 160ms ease-out',
            }}
          >
            {[
              { label: 'Move up', action: () => setMoreOpen(false) },
              { label: 'Move down', action: () => setMoreOpen(false) },
              { label: 'Reset card', action: () => setMoreOpen(false) },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={item.action}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  minHeight: '40px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(107,63,160,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Floating Text Toolbar ──────────────────────────────────────────────────
// Appears at the text selection origin. Bold, Italic, Underline, Link, Color, AI rewrite.

interface TextToolbarProps {
  selectionRect: DOMRect | null;
  onAIRewrite: () => void;
  onClose: () => void;
}

function TextToolbar({ selectionRect, onAIRewrite, onClose }: TextToolbarProps) {
  const [activeStates, setActiveStates] = useState({ bold: false, italic: false, underline: false });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [colorOpen, setColorOpen] = useState(false);

  const refreshStates = useCallback(() => {
    if (typeof document === 'undefined' || !document.queryCommandState) return;
    try {
      setActiveStates({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch {
      // queryCommandState may throw in some browsers; ignore
    }
  }, []);

  useEffect(() => {
    refreshStates();
  }, [selectionRect, refreshStates]);

  if (!selectionRect) return null;

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    refreshStates();
  };

  const handleLink = () => {
    const url = window.prompt('Enter URL');
    if (url) exec('createLink', url);
  };

  const margin = 8;
  const toolbarHeight = 44;
  const top = Math.max(margin, selectionRect.top - toolbarHeight - margin);
  const left = selectionRect.left + selectionRect.width / 2;

  const btnBase: React.CSSProperties = {
    width: '44px',
    height: '44px',
    minWidth: '44px',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: '#1e293b',
    cursor: 'pointer',
    borderRadius: '0.5rem',
    transition: 'background 150ms ease, color 150ms ease',
  };

  const fmtBtn = (active: boolean): React.CSSProperties => ({
    ...btnBase,
    background: active ? 'rgba(107,63,160,0.08)' : 'transparent',
    color: active ? FOXIT_PURPLE : btnBase.color,
  });

  const COLOR_SWATCHES = ['#1e293b', FOXIT_PURPLE, FOXIT_ORANGE, '#475569', '#0f172a'];

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text formatting"
      className="glass-panel"
      style={{
        position: 'fixed',
        top,
        left,
        transform: 'translateX(-50%)',
        zIndex: 50,
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        animation: 'toolbarFadeIn 180ms ease-out',
      }}
      onMouseDown={(e) => {
        // Prevent the editor from losing selection when clicking the toolbar
        e.preventDefault();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Bold (Ctrl+B)"
        aria-label="Bold"
        aria-pressed={activeStates.bold}
        onClick={() => exec('bold')}
        style={fmtBtn(activeStates.bold)}
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        title="Italic (Ctrl+I)"
        aria-label="Italic"
        aria-pressed={activeStates.italic}
        onClick={() => exec('italic')}
        style={fmtBtn(activeStates.italic)}
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        title="Underline (Ctrl+U)"
        aria-label="Underline"
        aria-pressed={activeStates.underline}
        onClick={() => exec('underline')}
        style={fmtBtn(activeStates.underline)}
      >
        <UnderlineIcon size={16} />
      </button>

      <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.08)', margin: '0 2px' }} />

      <button
        type="button"
        title="Add link"
        aria-label="Add link"
        onClick={handleLink}
        style={btnBase}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(107,63,160,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Link2 size={16} />
      </button>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          title="Text color"
          aria-label="Text color"
          aria-haspopup="true"
          aria-expanded={colorOpen}
          onClick={() => setColorOpen((v) => !v)}
          style={{ ...btnBase, background: colorOpen ? 'rgba(107,63,160,0.08)' : 'transparent', color: colorOpen ? FOXIT_PURPLE : btnBase.color }}
        >
          <Palette size={16} />
        </button>
        {colorOpen && (
          <div
            role="menu"
            className="glass-panel"
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px',
              display: 'flex',
              gap: '6px',
              zIndex: 60,
            }}
          >
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Color ${c}`}
                onClick={() => { exec('foreColor', c); setColorOpen(false); }}
                style={{
                  width: '28px',
                  height: '28px',
                  minWidth: '28px',
                  minHeight: '28px',
                  borderRadius: '50%',
                  border: '2px solid rgba(0,0,0,0.08)',
                  background: c,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '24px', background: 'rgba(0,0,0,0.08)', margin: '0 2px' }} />

      <button
        type="button"
        title="Rewrite with AI"
        aria-label="Rewrite selection with AI"
        onClick={() => { onAIRewrite(); onClose(); }}
        style={{
          ...btnBase,
          color: FOXIT_PURPLE,
          fontWeight: 600,
          paddingLeft: '12px',
          paddingRight: '12px',
          width: 'auto',
          gap: '6px',
          fontSize: '0.85rem',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(107,63,160,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Sparkles size={16} />
        AI
      </button>
    </div>
  );
}

// ── Slide Top Toolbar ──────────────────────────────────────────────────────
// Right-aligned controls above the canvas: Theme, Comment, Edit, Zoom, Present.

interface SlideTopToolbarProps {
  commentMode: boolean;
  documentTitle: string;
  onChangeTitle: (next: string) => void;
  saveStatus: 'saved' | 'saving' | 'idle';
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleComment: () => void;
  onPresent: () => void;
  /** Editor surface — 'graphics' hides Theme/Present and shows Save to Library. */
  mode?: 'slides' | 'graphics';
  /** Graphics mode only — top-right "Save to Library" primary. */
  onSaveToLibrary?: () => void;
  // File/View menu (top-left dropdown).
  onSave?: () => void;
  onSaveAs?: () => void;
  /** File ▸ Open — import a .pptx as a new deck. */
  onOpen?: () => void;
  /** File ▸ Save to template library — serialize this deck as a structured template. */
  onSaveTemplate?: () => void;
  roundedCorners: boolean;
  onToggleRounded: () => void;
  // Export (moved from the left rail to a top-right dropdown).
  template: CardTemplate;
  exportDeckName?: string;
  hasSources: boolean;
  includeSourceAppendix: boolean;
  onToggleSourceAppendix: (value: boolean) => void;
}

const ZOOM_OPTIONS: (number | 'fit')[] = [50, 75, 100, 125, 150, 'fit'];

// Google-Docs-style title suggestion: decks default to Untitled; when the user
// clicks the title to edit it we offer the deck's own title — the cover slide's
// heading (what the title slide already states), not the raw prompt. Falls back
// to the first words of the cover's text, then empty.
function suggestDeckTitle(cards: Card[]): string {
  const cover = cards[0];
  if (!cover) return '';
  const ff = (cover.freeform ?? []).filter(
    (b): b is FreeformTextBlock => b.type === 'text' && b.content.trim().length > 0,
  );
  const byVariant = (v: FreeformTextBlock['variant']) =>
    ff.find((b) => b.variant === v)?.content.trim() ?? '';
  const heading = byVariant('heading') || byVariant('subheading');
  if (heading) return heading;
  // Legacy column blocks (pre-freeform decks).
  for (const b of cover.columns?.[0]?.blocks ?? []) {
    if ((b.type === 'heading' || b.type === 'paragraph') && 'content' in b && b.content.trim()) {
      return b.content.trim();
    }
  }
  // Last resort: first words of any cover text, trimmed to a title length.
  const para = byVariant('paragraph') || ff[0]?.content.trim() || '';
  if (!para) return '';
  const words = para.split(/\s+/).slice(0, 8).join(' ');
  return words.length < para.length ? `${words}…` : words;
}

function SlideTopToolbar({
  commentMode,
  documentTitle,
  onChangeTitle,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onToggleComment,
  onPresent,
  mode = 'slides',
  onSaveToLibrary,
  onSave,
  onSaveAs,
  onOpen,
  onSaveTemplate,
  roundedCorners,
  onToggleRounded,
  template,
  exportDeckName,
  hasSources,
  includeSourceAppendix,
  onToggleSourceAppendix,
}: SlideTopToolbarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [exportOpen]);
  // Chrome-themed buttons: bg + text + border follow theme.tone via the
  // CSS vars set by ThemeProvider, so dark themes get a dark toolbar.
  const ghostBtn: React.CSSProperties = {
    minHeight: '44px',
    minWidth: '44px',
    height: '40px',
    padding: '0 14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: '1px solid var(--theme-chrome-border)',
    background: 'var(--theme-chrome-bg)',
    color: 'var(--theme-chrome-fg)',
    cursor: 'pointer',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: 500,
    fontFamily: 'inherit',
    transition: 'all 150ms ease',
  };

  const toggleBtn = (active: boolean, accent = false): React.CSSProperties => ({
    ...ghostBtn,
    background: accent && active ? FOXIT_ORANGE : active ? 'rgba(107,63,160,0.18)' : 'var(--theme-chrome-bg)',
    color: accent && active ? '#ffffff' : active ? FOXIT_PURPLE : 'var(--theme-chrome-fg)',
    borderColor: accent && active ? FOXIT_ORANGE : active ? FOXIT_PURPLE : 'var(--theme-chrome-border)',
  });

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
      ? 'Saved'
      : 'No changes to save';

  return (
    <div
      data-slide-toolbar
      role="toolbar"
      aria-label="Slide editor toolbar"
      style={{
        height: '56px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '0 20px',
        borderBottom: '1px solid var(--theme-chrome-border)',
        background: 'var(--theme-chrome-bg)',
        color: 'var(--theme-chrome-fg)',
        backdropFilter: 'var(--chrome-blur, none)',
        WebkitBackdropFilter: 'var(--chrome-blur, none)',
        // Graphics: float the bar as a rounded glass panel inset from the edges,
        // over the full-bleed canvas (Lisa 2026-06-25). Slides keeps the flat
        // full-width docked bar.
        ...(mode === 'graphics'
          ? {
              position: 'absolute' as const,
              top: 18,
              left: 18,
              right: 18,
              zIndex: 40,
              height: 52,
              padding: '0 12px',
              border: '1px solid var(--theme-chrome-border)',
              borderRadius: 14,
              boxShadow:
                '0 1px 2px rgba(0,0,0,.5), 0 26px 64px -14px rgba(0,0,0,.66), 0 0 130px -24px rgba(124,58,237,.26)',
            }
          : {}),
      }}
    >
      {/* Left cluster — wordmark (home) + editable document title + auto-save
          indicator + undo/redo. The SLIDES/WORKSPACE wordmark lives here in
          the top bar now (moved off the rail/panel) so it's a static, always-
          consistent mark like Home/Studio, and the tool panel expands purely
          as content. Per Lisa 2026-06-14. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minWidth: 0,
          flex: 1,
        }}
      >
        <Link href="/" aria-label="Slides Workspace — Home" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, textDecoration: 'none', flexShrink: 0, marginRight: 2 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4776E6,#A855F7)', boxShadow: '0 2px 8px rgba(103,76,245,0.30)' }}>
            <svg width="17" height="17" viewBox="0 0 1024 1024" fill="none"><path d="M550.92 757.41C541.61 760.4 532.75 763.28 524.24 766.08C523.99 766.17 523.89 766.47 524.03 766.69L576.88 846.16C576.95 846.27 577.08 846.33 577.21 846.33L810.96 846.34C811.27 846.34 811.46 846 811.3 845.73L708.23 673.58C708.12 673.38 707.86 673.32 707.67 673.45C667.43 700.83 625.34 728.47 553.87 756.35L550.92 757.41Z" fill="white"/><path d="M193.26 819.15C193.26 819.15 201.93 654.66 270.55 535.82C339.17 416.98 470.33 323.67 653.06 275.7C653.06 275.7 798.18 240.63 843.13 213.39C843.13 213.39 892.02 180.38 869.94 257.13C869.94 257.13 840.65 331.44 750.35 379.68C729.06 390.83 713.24 393.32 716.58 414.53C722.62 436.09 757.15 419.7 761.89 417.23C770.1 410.15 850.14 387.29 796.81 466.97C743.18 549.5 710.63 624.37 502.42 698.64C363.61 738.25 308.4 760.54 227.96 836.47C187.73 866.24 193.26 819.15 193.26 819.15Z" fill="white"/><path d="M322.48 117.38C329.53 236.44 348.73 261.33 462.1 298.36C343.04 305.41 318.16 324.61 281.12 437.98C274.07 318.92 254.88 294.03 141.5 257C260.56 249.95 285.45 230.75 322.48 117.38Z" fill="white"/></svg>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1 }}>
            <span style={{ fontSize: 16, fontWeight: mode === 'graphics' ? 600 : 700, letterSpacing: '0.12em', background: 'linear-gradient(135deg,#4776E6,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>WORKSPACE</span>
            <span aria-hidden="true" style={{ height: 1, width: '100%', background: 'linear-gradient(90deg, rgba(120,90,230,0.5), rgba(120,90,230,0))' }} />
            <span style={{ fontSize: 9.5, fontWeight: mode === 'graphics' ? 500 : 600, letterSpacing: '0.18em', color: mode === 'graphics' ? '#9a9aa0' : '#475569' }}>{mode === 'graphics' ? 'GRAPHICS' : 'SLIDES'}</span>
          </span>
        </Link>

        {/* File / View menu — Save, Save as, and View settings (rounded slide
            corners, editor-only). Per Lisa 2026-06-14. */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            aria-label="Menu"
            title="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            style={{ ...ghostBtn, minWidth: '34px', width: '34px', height: '34px', padding: 0 }}
          >
            <ChevronDown size={16} />
          </button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, width: 248, padding: '6px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.14), 0 2px 6px rgba(15,23,42,0.06)' }}>
              {([
                { label: 'New presentation', onClick: () => window.location.assign('/editor/slides?new=true') },
                { label: 'Open', onClick: () => onOpen?.() },
                { label: 'Open…', onClick: () => window.location.assign('/studio/slides') },
                { label: 'Save', onClick: () => onSave?.(), divider: true },
                { label: 'Save as…', onClick: () => onSaveAs?.() },
                { label: 'Save to template library', onClick: () => onSaveTemplate?.() },
                { label: 'Print', onClick: () => window.print(), divider: true },
              ] as { label: string; onClick: () => void; divider?: boolean }[]).map((it) => (
                <Fragment key={it.label}>
                  {it.divider && <div aria-hidden="true" style={{ height: 1, background: '#f1f5f9', margin: '6px 4px' }} />}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { it.onClick(); setMenuOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#1e293b', fontFamily: 'inherit', textAlign: 'left' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {it.label}
                  </button>
                </Fragment>
              ))}
              <div aria-hidden="true" style={{ height: 1, background: '#f1f5f9', margin: '6px 4px' }} />
              <div style={{ ...panelChrome.label, padding: '4px 10px 6px' }}>View</div>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={roundedCorners}
                onClick={() => { onToggleRounded(); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#1e293b', fontFamily: 'inherit', textAlign: 'left' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>Rounded slide corners</span>
                {roundedCorners && <Check size={15} style={{ color: '#6B3FA0', flexShrink: 0 }} />}
              </button>
              <div style={{ fontSize: 11, color: '#94a3b8', padding: '0 10px 4px', lineHeight: 1.4 }}>Editor only — PPT/PDF export stays square.</div>
            </div>
          )}
        </div>

        <span aria-hidden="true" style={{ width: 1, height: 24, background: 'var(--theme-chrome-border)', flexShrink: 0, margin: '0 4px' }} />
        <input
          type="text"
          value={documentTitle}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Untitled deck"
          aria-label="Document title"
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: 'var(--theme-chrome-fg)',
            outline: 'none',
            fontFamily: 'inherit',
            minWidth: 0,
            maxWidth: '320px',
            transition: 'all 150ms ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--theme-chrome-border)';
            e.currentTarget.style.background = 'var(--theme-chrome-bg-elevated)';
            // Google-Docs behavior: an Untitled deck suggests its own title (the
            // cover heading) on edit — selected, so Enter accepts or typing
            // replaces it. Only when empty, so it never clobbers a real name.
            if (!documentTitle.trim()) {
              const suggestion = suggestDeckTitle(template.cards);
              if (suggestion) {
                onChangeTitle(suggestion);
                requestAnimationFrame(() => e.currentTarget?.select());
              }
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.background = 'transparent';
          }}
        />
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--theme-chrome-fg-muted)',
            whiteSpace: 'nowrap',
            transition: 'opacity 200ms ease',
            opacity: saveStatus === 'saving' ? 0.7 : 1,
          }}
        >
          {saveLabel}
        </span>

        {(onUndo || onRedo) && (
          <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
            <button
              type="button"
              title="Undo"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={onUndo}
              style={{
                ...ghostBtn,
                minWidth: '36px',
                width: '36px',
                padding: '0',
                opacity: canUndo ? 1 : 0.35,
                cursor: canUndo ? 'pointer' : 'default',
              }}
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              title="Redo"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={onRedo}
              style={{
                ...ghostBtn,
                minWidth: '36px',
                width: '36px',
                padding: '0',
                opacity: canRedo ? 1 : 0.35,
                cursor: canRedo ? 'pointer' : 'default',
                transform: 'scaleX(-1)',
              }}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Right cluster — existing chrome */}
      {/* Theme — opens twelve-theme picker modal. Slide-only: a deck theme
          doesn't apply to a single standalone asset (graphics mode → Branding
          covers styling), so hide it there (asset-editor-mvp-spec §2). */}
      {mode === 'slides' && <ThemeButton buttonStyle={ghostBtn} />}

      {/* Comment toggle */}
      <button
        type="button"
        title="Comments"
        aria-label="Toggle comments"
        aria-pressed={commentMode}
        onClick={onToggleComment}
        style={toggleBtn(commentMode)}
      >
        <MessagesSquare size={16} /> Comment
      </button>

      {/* Edit toggle removed — block selection is always-on now, contextual
          toolbars (CardToolbar / TextToolbar) and the Inspector panel
          surface based on user intent rather than a static mode toggle.
          See P-UX2 (Progressive Disclosure) in CLAUDE.md. */}

      {/* Zoom moved to the bottom bar (next to slide nav) per Lisa 2026-06-14 —
          see SpeakerNotesPane. */}

      {/* Export — dropdown (Print/PDF, PPTX, …). Moved here from the left rail. */}
      <div ref={exportRef} style={{ position: 'relative' }}>
        <button
          type="button"
          title="Export"
          aria-label="Export"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          onClick={() => setExportOpen((v) => !v)}
          style={ghostBtn}
        >
          <Download size={16} /> Export
        </button>
        {exportOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
              width: '260px', padding: '10px',
              background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
              boxShadow: '0 12px 32px rgba(15,23,42,0.14), 0 2px 6px rgba(15,23,42,0.06)',
            }}
          >
            <RailExportContent
              template={template}
              deckName={exportDeckName}
              hasSources={hasSources}
              includeSourceAppendix={includeSourceAppendix}
              onToggleSourceAppendix={onToggleSourceAppendix}
            />
          </div>
        )}
      </div>

      {/* Primary action (top-right slot). Slides → Present (CTA gradient,
          matches the home Generate / +New CTA). Graphics → Save to Library
          (tasteful solid violet, NOT the present gradient) — the standalone
          asset has no presentation mode (asset-editor-mvp-spec §2). */}
      {mode === 'slides' ? (
        <button
          type="button"
          title="Present"
          aria-label="Present"
          onClick={onPresent}
          style={{
            ...ghostBtn,
            background: 'linear-gradient(135deg,#4776E6,#A855F7)',
            color: '#ffffff',
            border: '1px solid transparent',
            boxShadow: '0 4px 14px rgba(103,76,245,0.34)',
          }}
        >
          <Play size={16} /> Present
        </button>
      ) : (
        <button
          type="button"
          title="Save to Library"
          aria-label="Save to Library"
          onClick={onSaveToLibrary}
          style={{
            ...ghostBtn,
            background: '#5037C3',
            color: '#ffffff',
            border: '1px solid transparent',
            boxShadow: '0 4px 14px rgba(80,55,195,0.30)',
          }}
        >
          <Download size={16} /> Save to Library
        </button>
      )}
    </div>
  );
}

// ── Speaker Notes Pane ─────────────────────────────────────────────────────
// Below the canvas. Header bar (label + slide nav + collapse) sits flush
// against the workspace; the textarea is collapsed by default and reveals
// when the user clicks the chevron. Theme-aware via --theme-chrome-* vars
// so dark themes get a softened bar that blends with the workspace.

interface SpeakerNotesPaneProps {
  slideIndex: number;
  totalSlides: number;
  notes: string;
  onChangeNotes: (v: string) => void;
  onSaveNotes: () => void;
  onPrev: () => void;
  onNext: () => void;
  // Zoom — moved here from the top toolbar (replaces the old Reset button)
  // per Lisa 2026-06-14. The menu opens upward since the bar is at the bottom.
  zoom: number | 'fit';
  zoomOpen: boolean;
  onToggleZoom: () => void;
  onSelectZoom: (z: number | 'fit') => void;
}

function SpeakerNotesPane({
  slideIndex,
  totalSlides,
  notes,
  onChangeNotes,
  onSaveNotes,
  onPrev,
  onNext,
  zoom,
  zoomOpen,
  onToggleZoom,
  onSelectZoom,
}: SpeakerNotesPaneProps) {
  // Collapsed by default — Lisa's preference. The header still surfaces the
  // slide indicator so the user knows the notes exist; one click expands.
  const [collapsed, setCollapsed] = useState(true);

  const navBtn: React.CSSProperties = {
    minHeight: '44px',
    minWidth: '44px',
    height: '32px',
    width: '32px',
    border: 'none',
    background: 'transparent',
    color: 'var(--theme-chrome-fg-muted)',
    borderRadius: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      data-speaker-notes
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--theme-chrome-border)',
        background: 'var(--theme-chrome-bg)',
        padding: '10px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: collapsed ? 0 : '8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand notes' : 'Collapse notes'}
          title={collapsed ? 'Show notes' : 'Hide notes'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            minHeight: '44px',
            padding: '4px 6px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--theme-chrome-fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderRadius: 6,
          }}
        >
          <ChevronRight
            size={14}
            style={{
              transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
              transition: 'transform 180ms ease',
            }}
          />
          Notes
          <span style={{ color: 'var(--theme-chrome-fg-subtle)', marginLeft: '8px', fontWeight: 500 }}>
            Slide {slideIndex + 1} / {Math.max(1, totalSlides)}
          </span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            aria-label="Previous slide"
            title="Previous slide"
            onClick={onPrev}
            disabled={slideIndex <= 0}
            style={{
              ...navBtn,
              cursor: slideIndex <= 0 ? 'not-allowed' : 'pointer',
              opacity: slideIndex <= 0 ? 0.4 : 1,
            }}
          >
            <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--theme-chrome-fg-muted)', minWidth: '52px', textAlign: 'center' }}>
            {slideIndex + 1} / {Math.max(1, totalSlides)}
          </span>
          <button
            type="button"
            aria-label="Next slide"
            title="Next slide"
            onClick={onNext}
            disabled={slideIndex >= totalSlides - 1}
            style={{
              ...navBtn,
              cursor: slideIndex >= totalSlides - 1 ? 'not-allowed' : 'pointer',
              opacity: slideIndex >= totalSlides - 1 ? 0.4 : 1,
            }}
          >
            <ChevronRight size={16} />
          </button>
          {/* Zoom — relocated from the top toolbar. Menu opens UPWARD. */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="Zoom"
              aria-label="Zoom"
              aria-haspopup="menu"
              aria-expanded={zoomOpen}
              onClick={onToggleZoom}
              style={{
                minHeight: '44px',
                height: '32px',
                padding: '0 10px',
                border: '1px solid var(--theme-chrome-border)',
                background: 'var(--theme-chrome-bg-elevated)',
                color: 'var(--theme-chrome-fg)',
                cursor: 'pointer',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            >
              {zoom === 'fit' ? 'Fit' : `${zoom}%`} <ChevronDown size={14} />
            </button>
            {zoomOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: '120px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 6px 24px rgba(15,23,42,0.12)',
                  padding: '4px',
                  zIndex: 50,
                }}
              >
                {ZOOM_OPTIONS.map((z) => (
                  <button
                    key={String(z)}
                    type="button"
                    role="menuitemradio"
                    aria-checked={z === zoom}
                    onClick={() => onSelectZoom(z)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      textAlign: 'left',
                      border: 'none',
                      background: z === zoom ? 'rgba(107,63,160,0.06)' : 'transparent',
                      color: z === zoom ? FOXIT_PURPLE : '#1e293b',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      borderRadius: '6px',
                      minHeight: '40px',
                      fontFamily: 'inherit',
                    }}
                  >
                    {z === 'fit' ? 'Fit' : `${z}%`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {!collapsed && (
        <textarea
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          onBlur={onSaveNotes}
          placeholder="Add presenter notes for this slide..."
          aria-label="Notes"
          style={{
            width: '100%',
            minHeight: '60px',
            maxHeight: '120px',
            padding: '8px 0',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--theme-chrome-fg)',
            fontSize: '1rem',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      )}
    </div>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────

/** A deck always has a real, editable name. Prefer the explicit deck name (set
 *  from the topic at generation), else the deck's own first heading, else a
 *  neutral default — never "Untitled" (Lisa 2026-06-03). */
function deckDefaultName(template: CardTemplate): string {
  const explicit = template.name?.trim();
  if (explicit) return explicit;
  for (const card of template.cards ?? []) {
    for (const b of card.freeform ?? []) {
      if (b.type === 'text' && typeof b.content === 'string' && b.content.trim()) {
        return b.content.trim();
      }
    }
  }
  return 'Presentation';
}

export default function CardEditor({
  template,
  streaming = false,
  autoImages = false,
  onCardsChange,
  onTitleChange,
  onThemeChange,
  saveStatus = 'idle',
  onSave,
  onSaveAs,
  onOpen,
  onSaveTemplate,
  initialCard,
  deckId,
  mode = 'slides',
  onSaveToLibrary,
  revealOnMount = false,
}: {
  template: CardTemplate;
  streaming?: boolean;
  /**
   * Whether the auto-image-at-creation flow is active for this generation
   * run. When true, the sequential reveal queue waits for an image-bearing
   * card's auto-image to land before revealing that card — so the slide
   * appears COMPLETE (image already in place) and only THEN does its text
   * typewriter run. When false, no card is ever gated on an image and the
   * reveal cadence is exactly the legacy behavior. Lisa 2026-06-03.
   */
  autoImages?: boolean;
  /**
   * Called whenever the editor's local card state mutates (block edits,
   * layout changes, duplicates, deletes, regenerates). NOT called on the
   * initial sync from `template.cards` or while streaming is replacing
   * skeletons with real content — only on user-driven mutations after
   * the deck is settled. Page-level callers debounce-persist this.
   */
  onCardsChange?: (cards: Card[]) => void;
  /** Called when the user edits the document title in the top toolbar. */
  onTitleChange?: (next: string) => void;
  /** Called when the user changes deck theme via the Brand rail panel.
   *  Parent updates template.theme and persists. */
  onThemeChange?: (next: import('@/types/card-template').TemplateTheme) => void;
  /** Auto-save status for the indicator next to the title. Parent owns the
   *  actual save logic (debounced localStorage write) and reflects state via
   *  this prop. Defaults to 'idle'. */
  saveStatus?: 'saved' | 'saving' | 'idle';
  /** Force an immediate save (File ▸ Save). */
  onSave?: () => void;
  /** Duplicate the deck under a new name and open it (File ▸ Save as). */
  onSaveAs?: () => void;
  /** File ▸ Open — import a .pptx as a new deck. */
  onOpen?: () => void;
  /** File ▸ Save to template library — serialize this deck as a structured template. */
  onSaveTemplate?: () => void;
  /** Deep-link target: scroll to this 0-based card index on mount (?slide=N). */
  initialCard?: number;
  /** Deck id — used to remember the active slide for "pick up where you left off". */
  deckId?: string;
  /** Editor surface. 'slides' (default) is the full deck editor — byte-for-byte
   *  unchanged. 'graphics' hides slide-only chrome (Present, Notes, Theme, the
   *  slide-thumbnail rail) and turns the top-right primary into "Save to Library"
   *  for the standalone asset/graphics editor (asset-editor-mvp-spec §2). */
  mode?: 'slides' | 'graphics';
  /** Graphics mode only — invoked by the "Save to Library" primary button. */
  onSaveToLibrary?: () => void;
  /**
   * Run the sequential per-slide reveal queue from EMPTY even though
   * `streaming` is false. Set true by the page only when a freshly generated,
   * judge-verified deck is being revealed (Decision A: the overlay hides the
   * editor during streaming + revision, then lifts at `done` — so by the time
   * CardEditor mounts, streaming is already false and the legacy
   * streaming-gated reveal would dump every slide at once). With this flag the
   * editor mounts with `visibleCards = 0` and the existing reveal queue
   * advances one slide at a time (canvas + rail), each typing exactly once on
   * its FINAL content. A loaded deck (revealOnMount=false) still reveals
   * everything immediately. Lisa 2026-06-26. */
  revealOnMount?: boolean;
}) {
  // Active document theme — drives the optional workspacePattern overlay
  // behind the card stack. The legacy template.theme (TemplateTheme) is
  // still consumed by the renderer for fonts/colors; the document Theme
  // adds workspacePattern (and chrome variant data) on top.
  const { theme: activeTheme } = useTheme();

  // Editor-only "rounded slide corners" view pref (menu ▸ View). Persisted in
  // localStorage so it sticks across sessions. Purely a canvas-display setting
  // — PPT/PDF export always renders square corners. Per Lisa 2026-06-14.
  const [roundedCorners, setRoundedCorners] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('foxitSlides.roundedCorners') === 'false') {
      setRoundedCorners(false);
    }
  }, []);
  const toggleRoundedCorners = useCallback(() => {
    setRoundedCorners((prev) => {
      const next = !prev;
      try { window.localStorage.setItem('foxitSlides.roundedCorners', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Local copy of cards so the edit layer can mutate without lifting state.
  // Wrapped in useUndoRedo: setCards pushes to history (Cmd+Z / Cmd+Shift+Z
  // reverts and re-applies), setCardsDirect bypasses history for stream
  // sync from the parent so an in-flight generation doesn't leave a noisy
  // history of skeleton -> real-content frames the user could undo back
  // through.
  const {
    state: cards,
    setState: setCards,
    setStateDirect: setCardsDirect,
    undo: undoCards,
    redo: redoCards,
    beginCoalesce,
    endCoalesce,
    canUndo,
    canRedo,
  } = useUndoRedo<Card[]>(template.cards);

  // Latest cards, mirrored into a ref so the stream-sync effect below can tell
  // a GENUINE external/stream update (a brand-new cards array from the engine)
  // apart from the ECHO of the user's own edit — the page re-passes the exact
  // array we just emitted via onCardsChange. Without this guard every edit
  // round-trips template.cards → setCardsDirect → the undo history is wiped, so
  // Undo never has anything to revert (buttons stay disabled). Read via a ref
  // (not the effect deps) so the guard sees the current value without making
  // `cards` a dependency — which would re-fire the sync on user edits and
  // clobber them with the stale template.cards.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  // Track whether the most recent `cards` update came from a stream sync
  // (template.cards effect below) or from a user edit. We only emit
  // onCardsChange for user edits — emitting on stream sync would cause
  // the page to re-save the deck with whatever skeleton state the engine
  // pushed in that frame.
  const lastSyncWasStreamRef = useRef(true);

  // Set of card ids that should currently typewriter-animate. Populated as
  // fresh content arrives via SSE while `streaming` is true; emptied once
  // the visibleCards queue advances past a card. Manually-added /
  // duplicated / edited cards never enter this set, so they render their
  // text instantly. (Future "AI: create a new slide" flow will add the
  // newly-generated card's id here on demand.)
  const [animatingCardIds, setAnimatingCardIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Skip the ECHO of our own edit: when the parent re-passes the exact cards
    // array we just emitted, re-syncing it is a no-op that would only clear the
    // undo history (setCardsDirect wipes the stacks). Only a genuinely new
    // array (stream/skeleton content, or an externally-loaded deck) gets here.
    if (template.cards === cardsRef.current) return;
    lastSyncWasStreamRef.current = true;
    // Stream sync uses setStateDirect — incoming skeleton/streamed content
    // shouldn't pollute the user's undo history.
    setCardsDirect((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      return template.cards.map((incoming) => {
        const existing = map.get(incoming.id);
        if (!existing) return incoming;

        // Unified-format card (Phase A, 2026-05-21): empty columns + populated
        // freeform = the converter ran at the generation seam. Always take
        // incoming so the conversion actually reaches the editor — the
        // preserve-existing branch below would otherwise keep the pre-
        // conversion structured local copy on screen.
        const isUnified =
          (incoming.columns?.[0]?.blocks?.length ?? 0) === 0 &&
          (incoming.freeform?.length ?? 0) > 0;
        if (isUnified) return incoming;

        // Skeleton detection: a card is a skeleton if it's the exact shape
        // we generate in onBlueprintReady — heading + empty paragraph. Block
        // COUNT is not a reliable signal because real content like
        // [heading, smart-layout] is also 2 blocks (smart-layout is one
        // block with cells nested inside it). Always replace skeletons with
        // incoming streamed content; preserve only non-skeleton existing
        // cards (which may have been edited by the user).
        const existingBlocks = existing.columns[0]?.blocks ?? [];
        const isSkeleton =
          existingBlocks.length === 2 &&
          existingBlocks[0]?.type === 'heading' &&
          existingBlocks[1]?.type === 'paragraph' &&
          (existingBlocks[1] as { content: string }).content === '';
        return isSkeleton ? incoming : existing;
      });
    });
  }, [template.cards]);

  // Notify parent of user-driven card edits so the page can persist.
  // Skips frames triggered by the stream-sync effect above. Skips while
  // streaming so partial deck states don't get saved over the final
  // generated content.
  useEffect(() => {
    if (lastSyncWasStreamRef.current) {
      lastSyncWasStreamRef.current = false;
      return;
    }
    if (streaming) return;
    onCardsChange?.(cards);
  }, [cards, streaming, onCardsChange]);

  // When streaming flips false (generation done, or page loaded an existing
  // deck), drop every id from the set. Combined with the `streaming &&` gate
  // on CardView's `animate` prop, this guarantees no typewriter ever fires
  // on a settled deck — even if the parent later remounts a CardView (e.g.
  // user clicks the card to edit and clicks away, which toggles
  // contentEditable and rebuilds the inner Typewriter).
  useEffect(() => {
    if (streaming) return;
    setAnimatingCardIds((prev) => (prev.size > 0 ? new Set() : prev));
  }, [streaming]);

  // When streaming delivers real content for a card, mark its id as
  // currently animating. Loaded decks (streaming=false on mount) skip
  // this — their typewriter renders instantly. Idempotent: re-adding an
  // already-tracked id is a no-op.
  useEffect(() => {
    if (!streaming) return;
    setAnimatingCardIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const incoming of template.cards) {
        const blocks = incoming.columns[0]?.blocks ?? [];
        const isSkeleton =
          blocks.length === 2 &&
          blocks[0]?.type === 'heading' &&
          blocks[1]?.type === 'paragraph' &&
          (blocks[1] as { content: string }).content === '';
        if (isSkeleton) continue;
        if (!next.has(incoming.id)) {
          next.add(incoming.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [template.cards, streaming]);

  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [presentMode, setPresentMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  // Which card indices currently have a freeform block selected. Used to
  // suppress the card-level CardToolbar so users see a single set of controls
  // (the inline block toolbar inside FreeformLayer) when interacting with
  // a freeform block.
  const [freeformSelectedCards, setFreeformSelectedCards] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // The deck as {id, index, title} for the link editor's Slide picker + "slide N"
  // hover labels. `slideTitle` falls back to "Slide N"; drop that so the picker
  // shows "Untitled slide" instead of "3 · Slide 3".
  const deckSlides = useMemo<DeckSlideRef[]>(
    () => cards.map((c, i) => {
      const t = slideTitle(c, i);
      return { id: c.id, index: i, title: t === `Slide ${i + 1}` ? '' : t };
    }),
    [cards],
  );
  // Jump the editor to another slide (a slide-link was activated). Selects it
  // and scrolls it into view.
  const navigateToSlide = useCallback((slideId: string) => {
    const idx = cards.findIndex((c) => c.id === slideId);
    if (idx < 0) return;
    setActiveCard(idx);
    cardRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [cards, setActiveCard]);
  // Index of the card centered in the viewport, kept in a ref so it survives
  // the "click outside a card → deselect" handler that nulls activeCard. Used
  // as the insert anchor for "New slide" (the button click itself deselects).
  const inViewCardRef = useRef(0);
  // Per-card selected freeform block ids (reported by FreeformLayer) — lets the
  // Text panel's Font dropdown scope to the selection instead of the deck theme.
  const [selectedFreeformIds, setSelectedFreeformIds] = useState<Record<number, string[]>>({});
  // Sticky font picked in the Text panel (Canva model). Applied to the current
  // selection AND stamped on newly inserted text blocks, so "pick a font → Add
  // a heading" gives the heading that font even with nothing selected.
  const [panelFont, setPanelFont] = useState<string | undefined>(undefined);

  // ── Slide editor state additions (inspector + top toolbar + speaker notes) ──

  // Object-level (block-level) selection. Keys are "cardIdx:blockIdx".
  const [selectedBlockKeys, setSelectedBlockKeys] = useState<Set<string>>(new Set());
  // Per-block style overrides (sidecar — does not mutate Card type contract).
  const [blockOverrides, setBlockOverrides] = useState<Record<string, BlockStyleOverride>>({});

  // Top toolbar state
  // editMode removed — block selection and inspector visibility are always
  // available. Progressive disclosure handles surfacing tools per intent.

  // Slide tool rail panel — null when no panel is open; one of the rail
  // panel ids otherwise. Themes intentionally lives only in the toolbar
  // (ThemeButton) to keep ThemesModal's open-state single-sourced.
  const [activeRailPanel, setActiveRailPanel] = useState<SlideRailPanel | null>(null);
  // Open/close slide for the tool panel (per Lisa 2026-06-14): closing keeps
  // the panel mounted while it slides shut, then unmounts after the transition.
  const [panelClosing, setPanelClosing] = useState(false);
  const panelCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (panelCloseTimer.current) clearTimeout(panelCloseTimer.current); }, []);
  const openRailPanel = (panel: SlideRailPanel) => {
    if (panelCloseTimer.current) { clearTimeout(panelCloseTimer.current); panelCloseTimer.current = null; }
    setPanelClosing(false);
    setMediaTargetBlockId(null);
    setActiveRailPanel(panel);
  };
  const closeRailPanel = () => {
    if (!activeRailPanel) return;
    if (panelCloseTimer.current) clearTimeout(panelCloseTimer.current);
    setPanelClosing(true);
    panelCloseTimer.current = setTimeout(() => {
      setActiveRailPanel(null);
      setMediaTargetBlockId(null);
      setPanelClosing(false);
      panelCloseTimer.current = null;
    }, 280);
  };

  // Tracks the freeform image block that the Media panel is currently
  // bound to FILL. Set when the user clicks an empty image placeholder on
  // a card — Media panel then opens and the next Upload / Generate / URL
  // action writes that block's src instead of appending a new freeform
  // block. Cleared after the fill, when the panel closes, or when a
  // different rail panel is opened.
  const [mediaTargetBlockId, setMediaTargetBlockId] = useState<string | null>(null);

  // Chart Data-Table Editor target. Holds the id of the FreeformChartBlock
  // currently being edited in the ChartDataGrid modal, or null when closed.
  // Set by the double-click / context-menu / insert triggers; the modal reads
  // the block off the active card by this id and writes edits back via
  // handleFreeformChange.
  const [chartEditTargetId, setChartEditTargetId] = useState<string | null>(null);

  // Resolve the chart block + its card index from the edit-target id. Searches
  // all cards (not just activeCard) so the modal survives an active-card change.
  const chartEdit = useMemo(() => {
    if (!chartEditTargetId) return null;
    for (let ci = 0; ci < cards.length; ci++) {
      const block = (cards[ci].freeform ?? []).find(
        (b): b is FreeformChartBlock => b.id === chartEditTargetId && b.type === 'chart',
      );
      if (block) return { cardIndex: ci, block };
    }
    return null;
  }, [chartEditTargetId, cards]);

  // Two-step Escape behavior:
  //   1st Esc: deselect the active card (if any). Lets the user reach
  //           panel "no card selected" states the editor's mousedown-
  //           outside deselect rule was making unreachable — clicks
  //           almost always land inside SOME card/toolbar/inspector zone
  //           (UAT-found, 2026-05-24).
  //   2nd Esc: close the open rail panel (legacy behavior).
  // Skips when a text input / contentEditable has focus so the user can
  // still Esc out of inline text editing without losing their card.
  useEffect(() => {
    if (!activeRailPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = document.activeElement as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
      }
      if (activeCard !== null) {
        setActiveCard(null);
      } else {
        setActiveRailPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeRailPanel, activeCard]);

  // Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo, Mac convention),
  // Cmd/Ctrl+Y (redo, Windows convention). Scoped to when no text input
  // has focus — browsers handle native undo for contentEditable text edits,
  // and we don't want our card-level undo competing with that.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      const isUndoRedo = k === 'z' || k === 'y';
      if (!isUndoRedo) return;
      // If a text input / textarea / contentEditable has focus, let the
      // browser handle its own undo. Card-level undo only fires for
      // chrome interactions (selecting cards, etc.).
      const target = document.activeElement as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      // Y always means redo. Z means redo if shift is held, otherwise undo.
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if (isRedo) {
        if (canRedo) redoCards();
      } else {
        if (canUndo) undoCards();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canUndo, canRedo, undoCards, redoCards]);
  const [commentMode, setCommentMode] = useState(false);
  const [zoom, setZoom] = useState<number | 'fit'>(100);
  const [zoomOpen, setZoomOpen] = useState(false);
  // Live width of the scroll area — feeds the 'Fit' zoom calc.
  const [workspaceW, setWorkspaceW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWorkspaceW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Zoom rebaseline (Lisa 2026-06-14): the canvas was rendering 960px cards at
  // 1:1, which left no room above the first slide for the floating card toolbar.
  // Display "100%" now renders at RENDER_BASELINE of native size, so every label
  // in the zoom menu is remeasured against this smaller, roomier baseline. Cards
  // stay 960px logical (freeform measurement reads clientWidth, which CSS `zoom`
  // leaves untouched) — only the painted size shrinks.
  const RENDER_BASELINE = 0.875;
  const zoomScale =
    zoom === 'fit'
      ? workspaceW > 0
        ? Math.min((workspaceW - 48) / 960, 1.5)
        : RENDER_BASELINE
      : (zoom / 100) * RENDER_BASELINE;

  // ── Graphics infinite canvas (Figma-style) ────────────────────────────────
  // Pan: hold Space (or middle-mouse) and drag, or trackpad two-finger scroll.
  // Zoom: ⌘/Ctrl + wheel (or trackpad pinch), anchored to the cursor. Keeps the
  // CSS `zoom` scale (so freeform measurement stays exact) — only the scroll
  // position + zoom% change. All gated to graphics mode; slides is untouched.
  const spaceHeldRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    if (mode !== 'graphics') return;
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceHeldRef.current && !isTyping(e.target)) {
        spaceHeldRef.current = true;
        document.body.style.cursor = 'grab';
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        if (!panRef.current) document.body.style.cursor = '';
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.body.style.cursor = '';
    };
  }, [mode]);

  // ⌘/Ctrl + wheel → zoom toward the cursor (non-passive so we can preventDefault).
  useEffect(() => {
    if (mode !== 'graphics') return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll / trackpad pans natively
      e.preventDefault();
      const card = cardRefs.current[0];
      if (!card) return;
      const r = card.getBoundingClientRect();
      const curScale = r.width / 960; // on-screen scale of the 960-logical artboard
      const logicalX = (e.clientX - r.left) / curScale;
      const logicalY = (e.clientY - r.top) / curScale;
      const nextScale = Math.min(4, Math.max(0.1, curScale * Math.exp(-e.deltaY * 0.0015)));
      const sl = el.scrollLeft;
      const st = el.scrollTop;
      setZoom((nextScale / RENDER_BASELINE) * 100);
      // Keep the point under the cursor fixed: scroll shifts by logical·Δscale.
      requestAnimationFrame(() => {
        el.scrollLeft = sl + logicalX * (nextScale - curScale);
        el.scrollTop = st + logicalY * (nextScale - curScale);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mode]);

  // Center the artboard on the open canvas once it has laid out.
  useEffect(() => {
    if (mode !== 'graphics') return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);

  // Space/middle-drag pan. Capture phase so it pre-empts block drag only while
  // a pan gesture is actually armed (Space held or middle button).
  const onCanvasPointerDownCapture = (e: React.PointerEvent) => {
    if (mode !== 'graphics') return;
    if (!(spaceHeldRef.current || e.button === 1)) return; // let blocks handle normal clicks
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    setIsPanning(true);
    document.body.style.cursor = 'grabbing';
    const move = (ev: PointerEvent) => {
      if (!panRef.current) return;
      el.scrollLeft = panRef.current.sl - (ev.clientX - panRef.current.x);
      el.scrollTop = panRef.current.st - (ev.clientY - panRef.current.y);
    };
    const up = () => {
      panRef.current = null;
      setIsPanning(false);
      document.body.style.cursor = spaceHeldRef.current ? 'grab' : '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Speaker notes — keyed by card id. Local state, persists in component lifetime.
  const [speakerNotes, setSpeakerNotes] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [notesCardIndex, setNotesCardIndex] = useState<number>(0);
  // Sync notes draft when card changes
  useEffect(() => {
    const cardId = cards[notesCardIndex]?.id;
    if (cardId) setNotesDraft(speakerNotes[cardId] ?? '');
  }, [notesCardIndex, cards, speakerNotes]);
  // When user selects a different card, follow it for notes
  useEffect(() => {
    if (activeCard !== null) setNotesCardIndex(activeCard);
  }, [activeCard]);

  // Selection helpers
  const selectBlock = useCallback((cardIdx: number, blockIdx: number, additive: boolean) => {
    const key = `${cardIdx}:${blockIdx}`;
    setSelectedBlockKeys((prev) => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }
      return new Set([key]);
    });
    // Also sync card-level active state
    setActiveCard(cardIdx);
  }, []);

  const clearBlockSelection = useCallback(() => {
    setSelectedBlockKeys(new Set());
  }, []);

  // Auto-context for the Media panel's image generation. Derived from the
  // currently-active card + deck so the user doesn't have to retype context
  // for every image. Lisa 2026-05-24: without this, every generation was a
  // standalone prompt with no awareness of the slide it would land on, so
  // images felt generic and inconsistent across the deck. Recomputes when
  // the user navigates between cards or edits headings/bodies on the
  // active card; cheap enough that there's no need to debounce.
  const slideContextForMedia = useMemo<{
    slideHeading?: string;
    slideBody?: string;
    deckTitle?: string;
    themePalette?: string;
  }>(() => {
    const ctx: {
      slideHeading?: string;
      slideBody?: string;
      deckTitle?: string;
      themePalette?: string;
    } = {};
    if (template?.name) ctx.deckTitle = template.name;
    if (template?.theme) {
      const t = template.theme;
      const palette: string[] = [];
      if (t.accentColors?.length) palette.push(`accent ${t.accentColors.slice(0, 3).join(', ')}`);
      if (t.pageBg) palette.push(`background ${t.pageBg}`);
      if (palette.length) ctx.themePalette = palette.join('; ');
    }
    if (activeCard !== null) {
      const card = cards[activeCard];
      if (card) {
        const ff = card.freeform ?? [];
        // First heading-class text block becomes the slide title hint.
        const headingBlock = ff.find(
          (b) => b.type === 'text' && (b.variant === 'heading' || b.variant === 'subheading'),
        );
        if (headingBlock && headingBlock.type === 'text' && headingBlock.content) {
          ctx.slideHeading = headingBlock.content.trim().slice(0, 200);
        }
        // Concat paragraph + callout text to give the model the slide's
        // substance. Server-side cap kicks in at 400 chars; pre-truncate
        // here so we don't ship oversized payloads.
        const bodyParts = ff
          .filter((b) => b.type === 'text' && b.variant === 'paragraph')
          .map((b) => (b.type === 'text' ? b.content : ''))
          .filter(Boolean)
          .join(' ')
          .trim()
          .slice(0, 380);
        if (bodyParts) ctx.slideBody = bodyParts;
      }
    }
    return ctx;
  }, [activeCard, cards, template]);

  // Per-card selection helper (for thumbnail clicks etc.)
  const selectedKeysByCard = useMemo(() => {
    const map = new Map<number, Set<string>>();
    selectedBlockKeys.forEach((k) => {
      const idx = parseInt(k.split(':')[0], 10);
      if (!map.has(idx)) map.set(idx, new Set());
      map.get(idx)!.add(k);
    });
    return map;
  }, [selectedBlockKeys]);

  // Inspector entries: build SelectedBlockEntry[] from selected keys
  const inspectorEntries: SelectedBlockEntry[] = useMemo(() => {
    const entries: SelectedBlockEntry[] = [];
    selectedBlockKeys.forEach((key) => {
      const [cIdx, bIdx] = key.split(':').map((n) => parseInt(n, 10));
      const card = cards[cIdx];
      const block = card?.columns[0]?.blocks[bIdx];
      if (block) {
        entries.push({ key, block, override: blockOverrides[key] ?? {} });
      }
    });
    return entries;
  }, [selectedBlockKeys, cards, blockOverrides]);

  // Phase E: surface provenance to the inspector when the selection spans
  // blocks on a single source-grounded card. If selection straddles cards
  // with different provenance, hide the section (MVP — no Mixed state yet).
  const { cardProvenance, cardSource } = useMemo<{
    cardProvenance: CardProvenance | null;
    cardSource: SourceDocument | null;
  }>(() => {
    if (selectedBlockKeys.size === 0) return { cardProvenance: null, cardSource: null };
    const cardIndices = new Set<number>();
    selectedBlockKeys.forEach((key) => {
      const [cIdx] = key.split(':').map((n) => parseInt(n, 10));
      if (Number.isFinite(cIdx)) cardIndices.add(cIdx);
    });
    if (cardIndices.size !== 1) return { cardProvenance: null, cardSource: null };
    const [onlyIdx] = Array.from(cardIndices);
    const prov = cards[onlyIdx]?.provenance ?? null;
    if (!prov) return { cardProvenance: null, cardSource: null };
    const source = template.sources?.find((s) => s.id === prov.sourceDocId) ?? null;
    return { cardProvenance: prov, cardSource: source };
  }, [selectedBlockKeys, cards, template.sources]);

  // Source drawer state (E-9). Highlight text is the source passage to
  // call attention to on the rendered page (E-15 wires Foxit text-search).
  const [drawerPage, setDrawerPage] = useState<number | null>(null);
  const [drawerHighlight, setDrawerHighlight] = useState<string | undefined>(undefined);
  const handleOpenSource = useCallback((page: number, highlight?: string) => {
    setDrawerPage(page);
    setDrawerHighlight(highlight);
  }, []);
  const handleCloseSource = useCallback(() => {
    setDrawerPage(null);
    setDrawerHighlight(undefined);
  }, []);

  // Source appendix toggle for print (E-10). Defaults to true when the deck
  // has sources; user can turn it off in the Export rail panel.
  const hasSources = (template.sources?.length ?? 0) > 0;
  const [includeSourceAppendix, setIncludeSourceAppendix] = useState<boolean>(hasSources);

  // Update handlers passed to inspector
  const updateOverride = useCallback((key: string, partial: BlockStyleOverride) => {
    setBlockOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...partial } }));
  }, []);
  const updateAllOverrides = useCallback((partial: BlockStyleOverride) => {
    setBlockOverrides((prev) => {
      const next = { ...prev };
      selectedBlockKeys.forEach((key) => {
        next[key] = { ...next[key], ...partial };
      });
      return next;
    });
  }, [selectedBlockKeys]);

  // Speaker notes save on blur
  const saveNotes = useCallback(() => {
    const cardId = cards[notesCardIndex]?.id;
    if (!cardId) return;
    setSpeakerNotes((prev) => ({ ...prev, [cardId]: notesDraft }));
  }, [cards, notesCardIndex, notesDraft]);

  // Sequential reveal queue. During generation (streaming=true) we reveal
  // cards one at a time so the user reads each slide as it "writes itself"
  // before the next appears. For a loaded deck (streaming=false on mount)
  // we skip the queue entirely and reveal everything immediately — the
  // content was generated in a previous session and the user just wants
  // to see it.
  const [visibleCards, setVisibleCards] = useState(() =>
    streaming
      ? 0
      // Staged reveal: show card 0 right away (there's no streaming loading
      // overlay to cover a blank canvas), then the queue advances one card at
      // a time. A loaded deck reveals everything at once.
      : revealOnMount
        ? Math.min(1, template.cards.length)
        : template.cards.length,
  );

  // A staged reveal is in progress when the deck was handed to us for a fresh
  // post-verification reveal (revealOnMount). While it's active we must NOT let
  // the "streaming-done → reveal everything" effect below clobber the queue.
  // One-shot: cleared the moment the queue reaches the last slide, so later
  // user edits (adding a slide) reveal instantly again like a loaded deck.
  const [revealActive, setRevealActive] = useState(() => !!revealOnMount);
  useEffect(() => {
    if (
      revealActive &&
      template.cards.length > 0 &&
      visibleCards >= template.cards.length
    ) {
      setRevealActive(false);
    }
  }, [revealActive, visibleCards, template.cards.length]);

  // When generation completes (streaming flips false), instantly reveal
  // any remaining queued cards so the editor doesn't keep counting down
  // its read-along buffer after the deck is done. Skipped while a staged
  // post-verification reveal is active (revealActive) — that path WANTS the
  // queue to advance one slide at a time even though streaming is false.
  useEffect(() => {
    if (!streaming && !revealActive) setVisibleCards(template.cards.length);
  }, [streaming, revealActive, template.cards.length]);

  // ── Auto-image reveal gating (Lisa 2026-06-03) ──────────────────────────
  // A card that earns an auto-image must reveal COMPLETE: image already in
  // place, THEN its text typewriter runs. Today the text types in first and
  // the image pops in ~20-30s later. To fix the reveal moment we hold the
  // sequential reveal queue at the boundary BEFORE an image-bearing card —
  // the card doesn't render (and so its typewriter doesn't start) until its
  // auto-image has been patched into freeform[] by the page's placeAutoImage.

  // Does this card want an auto-image? The AI designer sets imageIntent.wanted
  // on the streamed card; the title slide (index 0) never gets one.
  const wantsAutoImage = useCallback((card: Card, index: number): boolean => {
    return autoImages && index !== 0 && card.imageIntent?.wanted === true;
  }, [autoImages]);

  // Has the auto-image already landed on this card? placeAutoImage stamps the
  // placed block with an `ff-autoimg-` id prefix.
  const hasAutoImage = useCallback((card: Card): boolean => {
    return (card.freeform ?? []).some((b) => b.id.startsWith('ff-autoimg-'));
  }, []);

  // Max time to wait for an image before revealing the card anyway (text
  // first, image fills in if/when it lands). HARD SAFETY so the deck can
  // never hang on a slow or failed image generation. 35s covers the slow
  // tail of /api/ai/generate-image (~20-30s typical).
  const AUTO_IMAGE_MAX_WAIT_MS = 35000;

  // Per-card-id timestamp of when we STARTED waiting for its image. Lets the
  // gating effect compute remaining wait and fall back after the deadline.
  const imageWaitStartedRef = useRef<Map<string, number>>(new Map());

  // Bumped when an image-wait deadline elapses, to force the gating effect to
  // re-run and release the gate (a referentially-equal setVisibleCards would
  // be bailed out by React and not re-fire the effect).
  const [imageGateTick, setImageGateTick] = useState(0);

  // Detect a skeleton card (heading + empty paragraph) — same shape as the
  // blueprint shells we render before SSE delivers real content.
  const isSkeletonCard = useCallback((card: Card): boolean => {
    if (card.blank) return false; // a user blank slide is real content, not an undelivered shell
    const blocks = card.columns[0]?.blocks ?? [];
    return (
      blocks.length === 2 &&
      blocks[0]?.type === 'heading' &&
      blocks[1]?.type === 'paragraph' &&
      (blocks[1] as { content: string }).content === ''
    );
  }, []);

  // Estimate how long a card needs on screen before the next card joins.
  //
  // Within a card: heading types first (~25 chars * 22ms ≈ 0.5s), then
  // body+cells type *after* the heading delay. This estimator includes the
  // heading delay (counted once for the longest non-heading block) plus
  // a generous read-along buffer so the user has a moment to scan the
  // card before the next one slides in.
  const estimateTypeMs = useCallback((card: Card): number => {
    const blocks = card.columns[0]?.blocks ?? [];
    const headingBlock = blocks.find((b) => b.type === 'heading');
    const headingChars = headingBlock
      ? ((headingBlock as { content: string }).content?.length ?? 0)
      : 0;
    let bodyChars = 0;
    for (const b of blocks) {
      if (b.type === 'heading') continue;
      if (b.type === 'paragraph' || b.type === 'callout') {
        bodyChars = Math.max(bodyChars, (b as { content: string }).content?.length ?? 0);
      } else if (b.type === 'bullet-list') {
        const items = (b as { items: string[] }).items ?? [];
        bodyChars = Math.max(bodyChars, items.reduce((n, item) => n + (item?.length ?? 0), 0));
      } else if (b.type === 'smart-layout') {
        const cells = (b as { cells: { heading: string; body: string }[] }).cells ?? [];
        const cellChars = cells.reduce((n, c) => n + (c.heading?.length ?? 0) + (c.body?.length ?? 0), 0);
        bodyChars = Math.max(bodyChars, cellChars);
      }
    }
    // Unified (AI-generated) cards keep their text in freeform[] — `columns`
    // is wiped to one empty column, so the counts above are 0. Sum the freeform
    // text blocks instead (they type sequentially, chained by __animateDelay),
    // so the queue holds each slide for as long as it actually types rather
    // than snapping to the 4s floor. Levels are mutually exclusive in practice
    // (a card has columns OR freeform), so adding both is safe.
    let freeformChars = 0;
    for (const b of card.freeform ?? []) {
      if (b.type === 'text') freeformChars += ((b as { content?: string }).content?.length ?? 0);
    }
    // Heading + body type sequentially, then a 2.5s read-along buffer.
    // Min 4s so even a tiny card stays on screen long enough to be read.
    // Max 18s so a massive grid doesn't trap the queue.
    const charMs = 22;
    const total = (headingChars + bodyChars + freeformChars) * charMs + 2500;
    return Math.max(4000, Math.min(18000, total));
  }, []);

  // Advance visibleCards as each card finishes "typing." Waits for SSE to
  // deliver real content for the next card before starting the timer.
  // Once the timer fires, the card has finished its initial reveal — remove
  // its id from animatingCardIds so subsequent renders (e.g. user edits)
  // don't re-trigger a typewriter.
  useEffect(() => {
    if (cards.length === 0) return;
    if (visibleCards >= cards.length) return;
    const next = cards[visibleCards];
    if (!next) return;
    if (isSkeletonCard(next)) return; // SSE hasn't delivered this one yet
    const settledId = next.id;
    const nextIndex = visibleCards;

    // Image-ready gate: if the incoming card earns an auto-image but the
    // image hasn't landed yet, HOLD the reveal here so the card never
    // renders (and its typewriter never starts) until the image is in place.
    // The card reveals complete — image first, text after. The gate releases
    // when (a) the image arrives — this effect re-runs because `cards`
    // changes — or (b) a max-wait deadline elapses (hard safety: never hang).
    if (wantsAutoImage(next, nextIndex) && !hasAutoImage(next)) {
      const startMap = imageWaitStartedRef.current;
      const startedAt = startMap.get(settledId) ?? Date.now();
      if (!startMap.has(settledId)) startMap.set(settledId, startedAt);
      const elapsed = Date.now() - startedAt;
      const remaining = AUTO_IMAGE_MAX_WAIT_MS - elapsed;
      if (remaining > 0) {
        // Re-arm a fallback timer; the effect will also re-run the moment the
        // image lands (cards reference changes) and pass the gate normally.
        const wait = window.setTimeout(() => {
          // Deadline reached without an image — release the gate. Reveal the
          // card anyway (text first; image fills in later if it ever lands).
          // Marking the start as 0 makes the re-run see `remaining <= 0`.
          imageWaitStartedRef.current.set(settledId, 0);
          // Bump the gate tick to force this effect to re-run; it will now see
          // `remaining <= 0` and fall through to the normal reveal path.
          setImageGateTick((t2) => t2 + 1);
        }, remaining);
        return () => window.clearTimeout(wait);
      }
      // remaining <= 0 → deadline passed; fall through to the normal reveal.
      // eslint-disable-next-line no-console
      console.warn(
        `[auto-image] reveal gate timed out for card ${nextIndex} ("${settledId}") after ${AUTO_IMAGE_MAX_WAIT_MS}ms — revealing text-first; image will fill in if it lands.`,
      );
    }

    // Hold `next` back until the card that's CURRENTLY revealing (the last one
    // in the visible slice) has finished typing — that's the "don't show the
    // next slide until the previous one completes" rule. Fall back to `next`'s
    // own estimate when nothing is shown yet (visibleCards 0, streaming).
    const currentlyRevealing = cards[visibleCards - 1] ?? next;
    const t = window.setTimeout(() => {
      setVisibleCards((n) => Math.min(cards.length, n + 1));
      setAnimatingCardIds((prev) => {
        if (!prev.has(settledId)) return prev;
        const out = new Set(prev);
        out.delete(settledId);
        return out;
      });
    }, estimateTypeMs(currentlyRevealing));
    return () => window.clearTimeout(t);
  }, [cards, visibleCards, isSkeletonCard, estimateTypeMs, wantsAutoImage, hasAutoImage, imageGateTick]);

  // The loading overlay shows until visibleCards >= 1, i.e. until at least
  // card 1 has real content delivered from streaming.
  const showLoadingOverlay = visibleCards === 0 && streaming;

  // Track text selection inside the active card → drives the text toolbar
  useEffect(() => {
    const handler = () => {
      if (activeCard === null) {
        setSelectionRect(null);
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelectionRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const cardEl = cardRefs.current[activeCard];
      // Selection must be inside the active card to show the toolbar
      if (!cardEl || !cardEl.contains(range.commonAncestorContainer)) {
        setSelectionRect(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // Some selections collapse to a zero-rect — guard against that
      if (rect.width === 0 && rect.height === 0) {
        setSelectionRect(null);
        return;
      }
      setSelectionRect(rect);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [activeCard]);

  // Deselect card when clicking outside any card (progressive disclosure: view state has no toolbars)
  useEffect(() => {
    if (activeCard === null && selectedBlockKeys.size === 0) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideAnyCard = cardRefs.current.some((el) => el && el.contains(target));
      // Also keep selection alive if click landed inside a floating toolbar, menu, or the inspector panel
      const el = target as HTMLElement;
      const inToolbar = el?.closest?.('[role="toolbar"]') !== null;
      const inMenu = el?.closest?.('[role="menu"]') !== null;
      const inInspector = el?.closest?.('[role="complementary"]') !== null;
      const inNotes = el?.closest?.('[data-speaker-notes]') !== null;
      const inTopBar = el?.closest?.('[data-slide-toolbar]') !== null;
      if (!insideAnyCard && !inToolbar && !inMenu && !inInspector && !inNotes && !inTopBar) {
        setActiveCard(null);
        setSelectionRect(null);
        clearBlockSelection();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeCard, selectedBlockKeys.size, clearBlockSelection]);

  // Card mutation handlers
  const updateCard = useCallback((index: number, updater: (card: Card) => Card) => {
    setCards((prev) => prev.map((c, i) => (i === index ? updater(c) : c)));
  }, []);

  const handleBlockChange = useCallback((cardIndex: number, blockIndex: number, next: CardBlock) => {
    updateCard(cardIndex, (card) => ({
      ...card,
      columns: card.columns.map((col, ci) =>
        ci === 0 ? { ...col, blocks: col.blocks.map((b, bi) => (bi === blockIndex ? next : b)) } : col
      ),
    }));
  }, [updateCard]);

  const handleFreeformChange = useCallback((cardIndex: number, nextFreeform: FreeformBlock[]) => {
    updateCard(cardIndex, (card) => ({ ...card, freeform: nextFreeform }));
  }, [updateCard]);

  /**
   * Append a freeform block to the active card. Uses non-overlapping
   * placement against the existing freeform blocks on the card so a new
   * "Add heading" doesn't land on top of the AI-generated title. Strategy:
   *   1. Peek the block at a stub position to read its w/h.
   *   2. Try a left-aligned slot just below the lowest existing block.
   *   3. If that overflows the card, walk a coarse 6×8 grid and pick the
   *      first cell with no AABB overlap against any existing block.
   *   4. Last resort: cascade from the legacy (35, 40) anchor so we never
   *      lose the user's click.
   * `make` receives the computed z + (x, y) and returns the block to add,
   * or null to skip insertion (used when a preset isn't freeform-compatible).
   */
  const appendFreeformBlock = useCallback((make: (z: number, x: number, y: number) => FreeformBlock | null) => {
    if (activeCard === null) return false;
    let added = false;
    setCards((prev) => {
      const next = [...prev];
      const target = next[activeCard];
      if (!target) return prev;
      const existing = target.freeform ?? [];
      const z = existing.length + 1;
      // Peek at the block's natural dimensions by calling make with a stub
      // position. Throw the peek away — we'll re-call make with the chosen
      // slot. (make() also generates the id; the discarded id is harmless.)
      const peek = make(z, 0, 0);
      if (!peek) return prev;
      const slot = findFreeformSlot(existing, peek.w, peek.h);
      const block = make(z, slot.x, slot.y);
      if (!block) return prev;
      added = true;
      next[activeCard] = { ...target, freeform: [...existing, block] };
      return next;
    });
    return added;
  }, [activeCard, setCards]);

  /** Insert a chart together with editable placeholder text blocks for the title
   *  (above), X-axis (below) and Y-axis (left, rotated). The title/axis labels now
   *  live on the slide as ordinary double-click-to-edit text — not in the chart
   *  modal. All four blocks are placed inside one non-overlapping slot. Returns the
   *  chart block's id (to auto-open the data editor) or null. */
  const appendChartWithLabels = useCallback((chartType: FreeformChartType): string | null => {
    if (activeCard === null) return null;
    const chartId = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let ok = false;
    setCards((prev) => {
      const next = [...prev];
      const target = next[activeCard];
      if (!target) return prev;
      const existing = target.freeform ?? [];
      // Large chart (CW×CH) with thin label margins around it: title above, X-axis
      // below, Y-axis at the left. The SVG axis text scales with the block size, so a
      // bigger chart keeps the numbers readable. The slot is sized for the whole region.
      const CW = 62, CH = 44, LPAD = 6, TPAD = 6, BPAD = 5;
      const slot = findFreeformSlot(existing, LPAD + CW, TPAD + CH + BPAD);
      const cx = slot.x, cy = slot.y;
      const chartX = cx + LPAD, chartY = cy + TPAD;
      let z = existing.length + 1;
      const text = (suffix: string, content: string, x: number, y: number, w: number, h: number, fontSize: number, fontWeight: number, rotation = 0): FreeformBlock => ({
        id: `ff-${Date.now()}-${suffix}`, type: 'text', variant: 'paragraph', content,
        x, y, w, h, rotation, z: z++,
        style: { fontSize, lineHeight: 1.2, fontWeight, textAlign: 'center' },
      } as FreeformBlock);
      const blocks: FreeformBlock[] = [
        text('t', 'Chart title', chartX, cy, CW, 5, 18, 700),
        { ...buildSeedChart(chartType), id: chartId, x: chartX, y: chartY, w: CW, h: CH, rotation: 0, z: z++ } as FreeformBlock,
        text('x', 'X-axis', chartX, chartY + CH + 0.8, CW, 4, 13, 600),
        text('y', 'Y-axis', chartX - LPAD - 5, chartY + CH / 2 - 2, 16, 4, 13, 600, -90),
      ];
      next[activeCard] = { ...target, freeform: [...existing, ...blocks] };
      ok = true;
      return next;
    });
    return ok ? chartId : null;
  }, [activeCard, setCards]);

  /** Append a structured CardBlock to the active card's first column.
   *  Used as a fallback for rail-panel presets whose type isn't yet supported
   *  as a freeform block (bullet-list, divider, button, smart-layout, toggle). */
  const appendStructuredBlock = useCallback((block: CardBlock) => {
    if (activeCard === null) return;
    setCards((prev) => {
      const next = [...prev];
      const target = next[activeCard];
      if (!target) return prev;
      const cols = target.columns.length > 0 ? [...target.columns] : [{ blocks: [] }];
      cols[0] = { blocks: [...cols[0].blocks, block] };
      next[activeCard] = { ...target, columns: cols };
      return next;
    });
  }, [activeCard, setCards]);

  /** Convert a structured-block preset into the equivalent freeform block for
   *  Phase 1 types (heading / subheading / paragraph / callout-as-quote /
   *  image). Returns null for types that don't have a freeform equivalent
   *  yet (bullet-list, divider, button, smart-layout, toggle) — those fall
   *  through to the existing structured-insert path. */
  const presetToFreeform = useCallback(
    (preset: Record<string, unknown>, z: number, x: number, y: number): FreeformBlock | null => {
      const id = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const type = preset.type as string;
      if (type === 'heading') {
        const level = (preset.level as number | undefined) ?? 1;
        const variant = level === 1 ? 'heading' : 'subheading';
        const w = variant === 'heading' ? 55 : 45;
        const h = variant === 'heading' ? 14 : 9;
        return {
          id, type: 'text', variant,
          content: (preset.content as string | undefined) ?? '',
          x, y, w, h, rotation: 0, z,
        };
      }
      if (type === 'paragraph') {
        return {
          id, type: 'text', variant: 'paragraph',
          content: (preset.content as string | undefined) ?? '',
          x, y, w: 45, h: 18, rotation: 0, z,
        };
      }
      // Quote preset on the Text panel arrives as a `callout` — render as
      // an italic paragraph in the freeform layer for now (Phase 1 doesn't
      // have a true callout freeform type).
      if (type === 'callout') {
        return {
          id, type: 'text', variant: 'paragraph',
          content: (preset.content as string | undefined) ?? '',
          style: { italic: true },
          x, y, w: 45, h: 18, rotation: 0, z,
        };
      }
      if (type === 'image') {
        return {
          id, type: 'image',
          src: (preset.src as string | undefined) ?? '',
          alt: preset.alt as string | undefined,
          fit: (preset.fit as 'cover' | 'contain' | undefined) ?? 'cover',
          x, y, w: 32, h: 32, rotation: 0, z,
        };
      }
      return null;
    },
    [],
  );

  const handleChangeLayout = useCallback((index: number, layout: CardLayout) => {
    updateCard(index, (card) => ({ ...card, layout }));
  }, [updateCard]);

  const handleDuplicate = useCallback((index: number) => {
    setCards((prev) => {
      const original = prev[index];
      if (!original) return prev;
      const copy: Card = { ...original, id: `${original.id}-copy-${Date.now()}` };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setActiveCard(index + 1);
  }, []);

  // Generic reorder used by both the right-click context menu (Move up /
  // Move down) and drag-and-drop on thumbnails. Splices the card out of
  // fromIndex and inserts at toIndex; bounds-checks both ends. Updates
  // activeCard so selection follows the moved card.
  const handleMoveCard = useCallback((fromIndex: number, toIndex: number) => {
    setCards((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setActiveCard((prev) => {
      if (prev === null) return prev;
      if (prev === fromIndex) return toIndex;
      // If the active card was between from and to, its index shifts by 1.
      if (fromIndex < prev && toIndex >= prev) return prev - 1;
      if (fromIndex > prev && toIndex <= prev) return prev + 1;
      return prev;
    });
  }, []);

  const handleDelete = useCallback((index: number) => {
    setCards((prev) => prev.filter((_, i) => i !== index));
    setActiveCard(null);
  }, []);

  // ── Cover-tier swap (cover / slide 0 only) ────────────────────────────────
  // The "auto but overridable" cover from the title-cover spec. Cycles the
  // tier (photo → split → type → photo), rewrites slide 0's slideDesign so the
  // renderer paints the new tier + the scrim/text-bounds get the matching
  // imageRole, strips any existing cover image, then fetches a fresh mood-
  // matched image for the photo/split tiers. 'type' needs no image — the
  // corner motif renders from the theme. Marked `source: 'user'` so a later
  // re-generate / planner pass won't silently revert the user's choice.
  // Failures leave the new tier in place with no image (degrades to type-like
  // typographic cover — never the deleted flat gradient, never a broken box).
  // ── "Try a different title layout" — cycles the cover COMPOSITION FORM ─────
  // Reuses the cover's existing image and re-lays-out the image + title regions
  // via applyCoverComposition (no re-fetch). Only fetches a fresh image when the
  // next form needs one and none exists yet. Marked source:'user' so a later
  // re-generate won't silently revert the choice.
  const stampComposition = useCallback((c: Card, result: CompositionResult): Card => {
    const applied = applyCoverComposition(c.freeform ?? [], result);
    const base = c.slideDesign;
    return {
      ...c,
      freeform: applied.freeform,
      slideDesign: {
        slideId: base?.slideId ?? c.id,
        role: 'cover',
        imageRole: applied.imageRole,
        contentBudget: base?.contentBudget ?? { headingMaxWords: 10, bodyMaxWords: 16 },
        textSafeZone: base?.textSafeZone ?? 'left',
        themeArchetype: base?.themeArchetype ?? activeTheme.archetype,
        source: 'user',
        coverTier: applied.coverTier,
        compositionForm: result.form,
        titlePosition: result.titlePosition,
      },
    };
  }, [activeTheme]);

  const handleSwapCoverTier = useCallback(async (cardIndex: number) => {
    if (cardIndex !== 0) return;
    const coverCard = cards[0];
    if (!coverCard) return;
    const ff = coverCard.freeform ?? [];
    const hasImg = ff.some(
      (b) => b.type === 'image' && b.id.startsWith('ff-autoimg-cover-'),
    );
    const current: CompositionForm =
      (coverCard.slideDesign?.compositionForm as CompositionForm | undefined)
      ?? (hasImg ? 'vertical-half' : 'type-only');
    const form = nextCompositionForm(current);

    const heading = ff.find(
      (b) => b.type === 'text' && b.variant === 'heading',
    ) as { content?: string } | undefined;
    const deckTitle = (heading?.content || '').trim() || activeTheme.name;
    const signals = {
      hasImage: hasImg || compositionWantsImage(form),
      orientation: 'landscape' as const,
      brightness: 0.5,
      themeArchetype: activeTheme.archetype,
      themeTone: activeTheme.tone,
      headlineLength: headlineLengthOf(deckTitle),
    };

    // Re-layout with the existing image (or none for type-only) — no re-fetch.
    if (!compositionWantsImage(form) || hasImg) {
      const result = forceForm(form, signals, 0);
      setCards((prev) => prev.map((c, i) => (i === 0 ? stampComposition(c, result) : c)));
      return;
    }

    // Next form needs an image but none exists — fetch one, add it, then apply.
    const vibe = 'bright, clean, naturally lit, airy, editorial';
    const subject = `An evocative ${vibe} cover image setting the mood for "${deckTitle}". Atmospheric and abstract — a scene, texture, or visual metaphor, not a poster. Well-exposed with bright, even light; not dark, not low-key, not moody. Absolutely no text, letters, words, or titles in the image.`;
    const themePalette = activeTheme.chartPalette?.join(', ') ?? '';
    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: subject,
          n: 1,
          style: 'photographic',
          aspect: '16:9',
          slideHeading: deckTitle,
          deckTitle,
          themePalette,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const img = data.images?.[0] ?? (data.src ? { src: data.src, libraryId: data.libraryId } : null);
      if (!img?.src) return;
      await new Promise<void>((resolve) => {
        const im = new window.Image();
        im.onload = () => resolve();
        im.onerror = () => resolve();
        im.src = img.src;
      });
      const block: FreeformImageBlock = {
        id: `ff-autoimg-cover-${coverCard.id}-${Date.now()}`,
        type: 'image',
        x: 0, y: 0, w: 100, h: 100,
        rotation: 0,
        z: 0,
        src: img.src,
        alt: `Cover image — ${deckTitle}`,
        fit: 'cover',
        frameShape: 'rectangle',
        autoGen: {
          subject,
          style: 'photographic',
          slideHeading: deckTitle,
          deckTitle,
          themePalette,
          variantIds: img.libraryId ? [img.libraryId] : [],
        },
      };
      const result = forceForm(form, { ...signals, hasImage: true }, 0);
      setCards((prev) => prev.map((c, i) => {
        if (i !== 0) return c;
        const withImg: Card = {
          ...c,
          freeform: [
            ...(c.freeform ?? []).filter(
              (b) => !(b.type === 'image' && b.id.startsWith('ff-autoimg-cover-')),
            ),
            block,
          ],
        };
        return stampComposition(withImg, result);
      }));
    } catch {
      // Fire-and-forget — leaves the form with no image (degrades to type-like).
    }
  }, [cards, activeTheme, stampComposition]);

  // P1 #6 (2026-05-22) — per-slide layout variant swap. Routes through the
  // /api/ai/regenerate-card endpoint with a blockTemplate override; on
  // success replaces the card in-place. User-added freeform blocks survive
  // because the route preserves them (skips ff-conv-* prefix on merge).
  const [layoutSwapBusyIndex, setLayoutSwapBusyIndex] = useState<number | null>(null);
  const handleTryLayout = useCallback(async (cardIndex: number, blockTemplate: string) => {
    const targetCard = cards[cardIndex];
    if (!targetCard) return;
    setLayoutSwapBusyIndex(cardIndex);
    try {
      const res = await fetch('/api/ai/regenerate-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card: targetCard,
          blockTemplate,
          deckPrompt: template.name || template.description,
          context: {
            deckTitle: template.name,
            cardIndex,
            totalCards: cards.length,
            theme: template.themeId,
            accentColors: template.theme.accentColors,
          },
        }),
      });
      if (!res.ok) throw new Error(`Layout swap failed (${res.status})`);
      const json = await res.json() as { data?: { card: Card }; error?: string };
      if (!json.data?.card) throw new Error(json.error || 'No card returned');
      setCards((prev) => prev.map((c, i) => (i === cardIndex ? json.data!.card : c)));
    } catch (err) {
      // Silent failure — surface via console for now. UAT note: hook up a
      // toast once Lisa picks a toast component for the editor.
      console.warn('[CardEditor] Layout swap failed:', err);
    } finally {
      setLayoutSwapBusyIndex(null);
    }
  }, [cards, template, setCards]);

  // Append a fresh blank card at the end. Default layout / style mirror what
  // the wizard produces for a clean section the user can edit immediately.
  // The id includes a timestamp so React's key stays stable across renders
  // and persistence (auto-save in the parent page) treats it as a new card.
  const handleAddCard = useCallback(() => {
    setCards((prev) => {
      // Fully blank card — no placeholder text, no AI, no auto-fill (Lisa
      // 2026-06-16). Empty heading + paragraph give editable placeholders; the
      // card renders the active theme's background/decorations (it's a normal
      // themed page), just with no content.
      const newCard: Card = {
        id: `card-${Date.now()}`,
        layout: 'single',
        style: 'default',
        blank: true,
        columns: [
          {
            blocks: [
              { type: 'heading', level: 2, content: '' },
              { type: 'paragraph', content: '' },
            ],
          },
        ],
      };
      // Insert right AFTER the selected (= in-view) slide, not at the end.
      // Uses inViewCardRef (not activeCard) because clicking the New-slide
      // button deselects the card (nulls activeCard) before this runs. Per
      // Lisa 2026-06-14.
      const anchor = activeCard ?? inViewCardRef.current;
      const insertAt = Math.min(anchor + 1, prev.length);
      const next = [...prev.slice(0, insertAt), newCard, ...prev.slice(insertAt)];
      // Defer until after React commits the new card so cardRefs is populated,
      // then select it AND scroll it into view. Scrolling is what makes the
      // selection stick — the viewport auto-select effect would otherwise snap
      // back to whatever card stayed centered.
      setTimeout(() => {
        inViewCardRef.current = insertAt;
        setActiveCard(insertAt);
        cardRefs.current[insertAt]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      return next;
    });
  }, [activeCard]);

  const handleComment = useCallback(() => {
    // Comments require a backend store; surface intent via console for now
    // (Wiring to the comment system is out of scope for this edit layer task.)
    if (typeof window !== 'undefined') console.info('[CardEditor] Comment requested on card', activeCard);
  }, [activeCard]);

  const handleRegenerate = useCallback((index: number) => {
    // Per Lisa 2026-05-23 — Regenerate now opens the left-panel AI tab
    // scoped to the active card (instead of the prior stub console.info).
    // The AI panel already reads deckContext from cards + activeCard, so
    // setting activeCard first ensures the panel's reply is grounded in
    // the card the user clicked Regenerate on.
    if (activeCard !== index) setActiveCard(index);
    setActiveRailPanel('ai');
  }, [activeCard]);

  const handleAIRewrite = useCallback(() => {
    if (typeof window !== 'undefined') console.info('[CardEditor] AI rewrite requested');
  }, []);

  // Auto-scroll to the latest card that received content
  useEffect(() => {
    if (!streaming) return;
    // Find the last non-skeleton card
    const lastContentIndex = cards.findIndex((c) => {
      const blocks = c.columns[0]?.blocks || [];
      return blocks.length <= 2 && blocks.some(b => b.type === 'paragraph' && b.content === '');
    });
    const scrollTo = lastContentIndex === -1 ? cards.length - 1 : Math.max(0, lastContentIndex - 1);
    cardRefs.current[scrollTo]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [streaming, cards]);

  // Auto-select the card centered in the viewport (on scroll + on mount) so
  // the on-screen slide reads as "selected" without a click, and inserts
  // (text styles, elements, media) always have a target card. Per Lisa
  // 2026-06-14 — previously activeCard stayed null until you clicked a card,
  // so the panels' insert buttons silently did nothing.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const cRect = container.getBoundingClientRect();
      const mid = cRect.top + cRect.height / 2;
      let best = -1;
      let bestDist = Infinity;
      cardRefs.current.forEach((el, i) => {
        if (!el || i >= visibleCards) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best >= 0) {
        inViewCardRef.current = best;
        setActiveCard((prev) => (prev === best ? prev : best));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    container.addEventListener('scroll', onScroll, { passive: true });
    update(); // initial selection (centers the first card on load)
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [visibleCards]);

  // Scroll the canvas to the chosen card AND set it active. Computes the
  // target scrollTop explicitly rather than relying on scrollIntoView so the
  // canvas reliably scrolls in environments where scrollIntoView's smooth
  // behavior is flaky (Turbopack dev preview, some embedded browsers).
  // UAT-found 2026-05-24: thumbnail clicks left the canvas pinned even
  // when the chosen card was below the viewport.
  const scrollToCard = (index: number) => {
    setActiveCard(index);
    const card = cardRefs.current[index];
    const container = scrollRef.current;
    if (!card || !container) return;
    const cardRect = card.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    // Offset from container scroll origin to card's top, then center
    // the card vertically inside the visible viewport.
    const cardOffsetTop = (cardRect.top - containerRect.top) + container.scrollTop;
    const target = cardOffsetTop - (container.clientHeight - cardRect.height) / 2;
    const clampedTarget = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
    container.scrollTo({ top: clampedTarget, behavior: 'smooth' });
    // Hard-fallback to non-animated scroll if the animated path didn't
    // engage within 600ms (covers smooth-scroll-disabled environments and
    // headless browsers). Comparing within 4px so a tiny rounding doesn't
    // re-trigger the assignment.
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if (Math.abs(container.scrollTop - clampedTarget) > 4) {
          container.scrollTop = clampedTarget;
        }
      }, 600);
    }
  };

  // Deep-link: opened with ?slide=N (from the deck detail page) → scroll to that
  // card once the deck has rendered. Single-fire via a ref guard.
  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (initialCard == null || cards.length === 0) return;
    const idx = Math.max(0, Math.min(initialCard, cards.length - 1));
    initialScrollDoneRef.current = true;
    const t = setTimeout(() => scrollToCard(idx), 200);
    return () => clearTimeout(t);
    // scrollToCard is recreated each render; the ref guards the single fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCard, cards.length]);

  // Remember the active slide per deck so the deck detail page can offer
  // "pick up where you left off".
  useEffect(() => {
    if (deckId && activeCard != null) saveLastSlide(deckId, activeCard);
  }, [deckId, activeCard]);

  // Present mode (scroll-snap slides)
  if (presentMode) {
    return (
      <PresentMode
        template={{ ...template, cards }}
        onExit={() => setPresentMode(false)}
      />
    );
  }

  // Inspector auto-open suppressed per Lisa 2026-05-21 — it was hijacking
  // the right side of the screen whenever a structured block got selected,
  // competing with the freeform inline toolbar for the user's attention.
  // The panel component stays available for a future opt-in surface (e.g.
  // a rail-button toggle); for now it never auto-opens.
  const inspectorVisible = false;
  const totalSlides = cards.length;

  // Graphics-mode skin — the dark-pro "blue glass" look (design table, 2026-06-23).
  // The entire editor chrome reads `var(--theme-chrome-*)` / `--theme-workspace-*`
  // tokens (ThemeProvider forces them LIGHT for all themes). Overriding those tokens
  // HERE — on the editor root, where they cascade to every chrome child — re-skins the
  // graphics editor to dark glass WITHOUT touching ThemeProvider or slides mode (which
  // keeps the inherited light tokens). `--chrome-blur` is consumed by the frosted chrome
  // containers (top bar / rail / panel / inspector); it defaults to `none` so slides is
  // byte-for-byte unchanged.
  const graphicsChromeVars: CSSProperties = mode === 'graphics' ? ({
    '--theme-workspace-base': '#161618',
    // Violet background bloom (Lisa 2026-06-23 — "keep it the violet color for the
    // background"). The chrome stays deep graphite; the selection accent below is a
    // blue↔purple in-between (`--gfx-accent`) so it reads distinct from the wash.
    '--theme-workspace-bg':
      'radial-gradient(900px 620px at 16% 10%, rgba(124,58,237,0.22), transparent 60%), radial-gradient(820px 580px at 90% 88%, rgba(139,124,246,0.16), transparent 62%), radial-gradient(760px 760px at 62% 36%, rgba(91,55,200,0.12), transparent 66%)',
    // Selected menu-option accent — a blue/magenta in-between (periwinkle-indigo).
    // Centralized here so the rail tab, inspector, and swatch selection share it
    // (and it's the single knob the future 6-theme picker will swap).
    '--gfx-accent': '#8B7CF6',
    '--gfx-accent-soft': 'rgba(139,124,246,0.16)',
    '--gfx-accent-soft-2': 'rgba(139,124,246,0.22)',
    // Deep graphite glass — high opacity so the chrome RECEDES (deep, not a flat
    // mid-grey that competes with the artboard). Lisa 2026-06-23: "the grey
    // navigation is really distracting" — the prior 0.62 read as light grey.
    '--theme-chrome-bg': 'rgba(17,17,20,0.82)',
    '--theme-chrome-bg-elevated': 'rgba(28,28,33,0.82)',
    '--theme-chrome-fg': '#f5f5f7',
    '--theme-chrome-fg-muted': '#9a9aa0',
    '--theme-chrome-fg-subtle': '#6e6e76',
    '--theme-chrome-border': 'rgba(255,255,255,0.07)',
    '--theme-chrome-border-strong': 'rgba(255,255,255,0.16)',
    '--theme-chrome-hover': 'rgba(255,255,255,0.06)',
    // Leading `0 0 0 1px` hairline = a crisp light rim so the white artboard edge
    // separates cleanly from the dark canvas (Lisa 2026-06-25 — "contrast against
    // the dark background isn't working"). Then the float shadow + violet glow.
    '--theme-card-shadow':
      '0 0 0 1px rgba(255,255,255,0.14), 0 1px 2px rgba(0,0,0,0.5), 0 26px 64px -14px rgba(0,0,0,0.66), 0 0 130px -24px rgba(124,58,237,0.26)',
    // The single artboard is the canvas itself, not a "selected element" — so the
    // slides active-card violet halo is wrong here. Match the resting float shadow
    // so the artboard never wears a harsh selection ring (element selection lives on
    // the canvas via the blue outline-ring token).
    '--theme-card-shadow-active':
      '0 0 0 1px rgba(255,255,255,0.14), 0 1px 2px rgba(0,0,0,0.5), 0 26px 64px -14px rgba(0,0,0,0.66), 0 0 130px -24px rgba(124,58,237,0.26)',
    '--chrome-blur': 'blur(24px) saturate(140%)',
    // Floating-chrome layout (2026-06-25): the editor root is the positioning
    // context; the canvas fills it full-bleed and the chrome panels float
    // absolutely over it (see the top bar / rail / inspector below).
    position: 'relative',
    overflow: 'hidden',
  } as CSSProperties) : {};
  // Floating-chrome float shadow shared by the graphics top bar / rail / inspector.
  const gfxFloatShadow =
    '0 1px 2px rgba(0,0,0,.5), 0 26px 64px -14px rgba(0,0,0,.66), 0 0 130px -24px rgba(124,58,237,.26)';

  // Graphics inspector wiring — the standalone artboard is always card 0. Show
  // element properties when exactly one block is selected; canvas settings
  // otherwise. Edits and arrange ops route through handleFreeformChange(0, …).
  const gfxFreeform = cards[0]?.freeform ?? [];
  const gfxSelIds = selectedFreeformIds[0] ?? [];
  const gfxBlock = gfxSelIds.length === 1
    ? (gfxFreeform.find((b) => b.id === gfxSelIds[0]) ?? null)
    : null;
  const gfxPalette = Array.from(new Set([
    ...(template.theme?.accentColors ?? []),
    '#0a84ff', '#60a5fa', '#7c3aed', '#FF5F00', '#10b981', '#1a1f36', '#ffffff',
  ])).slice(0, 8);
  const handleGfxChangeBlock = (next: FreeformBlock) => {
    handleFreeformChange(0, gfxFreeform.map((b) => (b.id === next.id ? next : b)));
  };
  const handleGfxArrange = (op: ArrangeOp) => {
    if (gfxSelIds.length === 0) return;
    const nextBlocks = op.kind === 'align'
      ? arrangeAlign(gfxFreeform, gfxSelIds, op.edge, 'canvas')
      : op.kind === 'forward'
        ? arrangeForward(gfxFreeform, gfxSelIds)
        : arrangeBackward(gfxFreeform, gfxSelIds);
    handleFreeformChange(0, nextBlocks);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Inter, system-ui, sans-serif', ...graphicsChromeVars }}>
      {/* Loading overlay — playful rotating phrase while AI drafts the
          first card. Sits over the entire editor until streaming delivers
          real content for card 1. */}
      {showLoadingOverlay && <DraftingOverlay />}

      {/* Full-width top bar — pinned across the top, OVER the rail (per Lisa
          2026-06-14). The rail + panels + canvas live in the row below it, so
          the logo/wordmark always shows with the bar's bottom-border divider
          beneath it, and the rail's tools start below the bar. */}
      <SlideTopToolbar
        commentMode={commentMode}
        documentTitle={template.name || ''}
        onChangeTitle={(next) => onTitleChange?.(next)}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undoCards}
        onRedo={redoCards}
        onToggleComment={() => setCommentMode((v) => !v)}
        onPresent={() => setPresentMode(true)}
        mode={mode}
        onSaveToLibrary={onSaveToLibrary}
        onSave={onSave}
        onSaveAs={onSaveAs}
        onOpen={onOpen}
        onSaveTemplate={onSaveTemplate}
        roundedCorners={roundedCorners}
        onToggleRounded={toggleRoundedCorners}
        template={template}
        exportDeckName={deckDefaultName(template)}
        hasSources={hasSources}
        includeSourceAppendix={includeSourceAppendix}
        onToggleSourceAppendix={setIncludeSourceAppendix}
      />

      {/* Editor row — rail + panels + canvas + navigator/inspector. In slides
          it sits below the full-width top bar; in graphics the top bar floats
          (absolute) so this row fills the whole editor and becomes the
          positioning context for the floating rail + inspector. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, ...(mode === 'graphics' ? { position: 'relative' } : {}) }}>

      {/* Left rail — slide-editor tool icons. Always visible; first flex
          child after the loading overlay. Per Lisa 2026-05-22 (P0 #2 D1)
          the rail is the entry-point for every panel; the panel slides
          out adjacent to it (not as a floating modal). */}
      <div
        style={{
          display: 'flex',
          // Graphics: float the rail (+ its expanded panel) as a glass island
          // over the canvas, below the floating top bar (Lisa 2026-06-25).
          ...(mode === 'graphics'
            ? { position: 'absolute' as const, left: 18, top: 86, bottom: 18, zIndex: 30, alignItems: 'flex-start' }
            : { height: '100%' }),
        }}
        // Both editors: the tool panel STAYS EXPANDED until the user explicitly
        // collapses it (clicks the active tab again) — no auto-close on
        // mouse-leave (Lisa 2026-06-25 graphics; extended to slides 2026-06-27).
      >
      <SlideToolRail
        mode={mode}
        active={activeRailPanel}
        onOpenPanel={(panel) => {
          // Switching panels (or closing the active one) drops any
          // pending Media fill-target — the user is no longer trying to
          // populate the placeholder they clicked earlier. (openRailPanel /
          // closeRailPanel clear it + drive the open/close slide.)
          if (activeRailPanel === panel && !panelClosing) closeRailPanel();
          else openRailPanel(panel);
        }}
        // No hover-open: panels are click-to-open / click-to-collapse and stay
        // put until the user explicitly toggles them (Lisa 2026-06-27 — applies
        // to both editors now). Omitting onHoverPanel makes the rail's hover a
        // no-op.
      />

      {/* Active rail panel — flex sibling adjacent to the rail. Renders for
          every panel EXCEPT 'ai', which has its own dock (SlideAIPanel
          below) because its content + interaction model are different
          (chat thread + deck context vs short tool palette). */}
      {activeRailPanel && activeRailPanel !== 'ai' && (
        <SlideToolPanel
          panel={activeRailPanel}
          wide={activeRailPanel === 'media'}
          // The Media panel (both editors) gets extra room for its 3-col photo
          // masonry — 400px vs the 272/328px panel defaults (Lisa 2026-06-27).
          panelWidth={activeRailPanel === 'media' ? '400px' : undefined}
          open={!panelClosing}
          onClose={() => closeRailPanel()}
        >
          {activeRailPanel === 'brand' && (
            <BrandingPanel
              currentTheme={template.theme}
              onThemeChange={(next) => onThemeChange?.(next)}
            />
          )}
          {activeRailPanel === 'text' && (
            <TextPanel
              onInsertBlock={(blockType, preset) => {
                if (activeCard === null) return;
                const rawPreset = (preset ?? { type: blockType }) as Record<string, unknown>;
                // Try the preset as a freeform block first. If presetToFreeform
                // returns null (bullet-list, etc.), appendFreeformBlock
                // bails and we fall through to structured insert. The sticky
                // panel font (if any) is stamped onto inserted text so "pick a
                // font → Add a heading" gives the heading that font.
                const inserted = appendFreeformBlock((z, x, y) => {
                  const blk = presetToFreeform(rawPreset, z, x, y);
                  if (blk && blk.type === 'text' && panelFont) {
                    blk.style = { ...(blk.style ?? {}), fontFamily: panelFont };
                  }
                  return blk;
                });
                if (!inserted) appendStructuredBlock(rawPreset as unknown as CardBlock);
              }}
              currentFont={(() => {
                // Show the selected block's font when one is selected; otherwise
                // the sticky panel font (what new inserts will use).
                const ci = activeCard ?? inViewCardRef.current;
                const ids = selectedFreeformIds[ci] ?? [];
                const blk = (cards[ci]?.freeform ?? []).find(
                  (b) => b.type === 'text' && ids.includes(b.id),
                );
                return (blk && blk.type === 'text' ? blk.style?.fontFamily : undefined) ?? panelFont;
              })()}
              onSelectFont={(font) => {
                // Remember it as the sticky font (used by new inserts), and
                // apply to the SELECTED freeform text block(s) on the in-view
                // card. inViewCardRef, not activeCard: clicking a side-panel
                // control nulls activeCard (gotcha #16). Selection now survives
                // the panel click (chrome exemption in FreeformLayer deselect),
                // so this no longer silently no-ops.
                setPanelFont(font);
                const ci = inViewCardRef.current;
                const ids = selectedFreeformIds[ci] ?? [];
                if (ids.length === 0) return;
                const ff = cards[ci]?.freeform ?? [];
                const next = ff.map((b) =>
                  b.type === 'text' && ids.includes(b.id)
                    ? { ...b, style: { ...(b.style ?? {}), fontFamily: font } }
                    : b,
                );
                handleFreeformChange(ci, next);
              }}
            />
          )}
          {activeRailPanel === 'search' && (
            <RailSearchContent
              cards={cards}
              onJump={(i) => {
                scrollToCard(i);
              }}
            />
          )}
          {activeRailPanel === 'media' && (() => {
            // Shared insert handler — both the graphics Media panel
            // (GraphicsMediaPanel, dark glass, approved 2026-06-26) and the
            // slides RailMediaContent (light, unchanged) insert through the same
            // path. `mode` gates which panel renders; the slides path is
            // behavior-identical to before.
            const onInsertImage = (src: string, alt?: string, naturalDims?: { width: number; height: number }) => {
                if (activeCard === null) return;
                // FILL-TARGET mode — set when the user clicked an empty
                // image placeholder on a card. We update THAT block's src
                // instead of appending a new freeform block. Placeholder
                // shape wins; the image's natural ratio is ignored on
                // purpose (the user explicitly chose this slot's frame).
                if (mediaTargetBlockId) {
                  setCards((prev) => prev.map((card, ci) => {
                    if (ci !== activeCard) return card;
                    const freeform = (card.freeform ?? []).map((b) =>
                      b.id === mediaTargetBlockId && b.type === 'image'
                        ? { ...b, src, alt: alt ?? b.alt }
                        : b,
                    );
                    return { ...card, freeform };
                  }));
                  setMediaTargetBlockId(null);
                  return;
                }
                // Default — append as a new freeform image block at a smart
                // non-overlapping slot. Size derives from the image's true
                // aspect ratio (when known) so portraits and landscapes
                // come in undistorted, not cropped into a forced square.
                // Lisa 2026-05-24: previously every image inserted as a
                // 32×32 square with fit:'cover', cutting off anything that
                // didn't sit centered in a 1:1 frame.
                const { w, h } = aspectAwareImageSize(naturalDims);
                appendFreeformBlock((z, x, y) => ({
                  id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  type: 'image',
                  src,
                  alt,
                  // 'contain' keeps the full image visible inside the box.
                  // Since the box matches the image ratio, 'contain' and
                  // 'cover' look identical at insertion — but if the user
                  // resizes manually later, 'contain' still shows everything.
                  fit: 'contain',
                  x, y, w, h, rotation: 0, z,
                }));
            };
            // Both editors use the new Media panel (Lisa 2026-06-27): graphics
            // gets the dark-glass scheme, slides the light scheme that matches
            // its existing chrome. The legacy RailMediaContent is retired.
            return (
              <GraphicsMediaPanel
                scheme={mode === 'graphics' ? 'dark' : 'light'}
                slideContext={slideContextForMedia}
                onInsertImage={onInsertImage}
              />
            );
          })()}
          {activeRailPanel === 'elements' && (
            <RailElementsContent
              onInsertBlock={(block) => appendStructuredBlock(block)}
              onInsertFreeformShape={(shape) => {
                if (activeCard === null) return;
                appendFreeformBlock((z, x, y) => {
                  const id = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                  // Default footprints chosen so each shape reads at a glance
                  // on first paint. User can resize from there.
                  if (shape === 'line' || shape === 'arrow') {
                    return { id, type: 'shape', shape, x, y, w: 30, h: 2, rotation: 0, z, fill: '#6B3FA0' };
                  }
                  return { id, type: 'shape', shape, x, y, w: 22, h: 22, rotation: 0, z, fill: '#6B3FA0' };
                });
              }}
              onInsertFreeformIcon={(name) => {
                if (activeCard === null) return;
                appendFreeformBlock((z, x, y) => ({
                  id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  type: 'icon',
                  name,
                  color: '#6B3FA0',
                  x, y, w: 8, h: 14, rotation: 0, z,
                }));
              }}
              onInsertFrame={(shape, deviceId) => {
                if (activeCard === null) return;
                // Insert an EMPTY frame block of the chosen shape. No src
                // — renders as the frame outline + placeholder icon. Click
                // opens Media bound to this block (existing workflow).
                // Default size per-shape so circles/hearts insert square
                // and laptops insert 16:9. User resizes after.
                let w: number;
                let h: number;
                const device = shape === 'device' ? getDeviceFrame(deviceId) : undefined;
                if (device) {
                  // Size from the device's outer aspect → ~70% of card height.
                  // wPx = hPx * aspect; convert to % of the 960×540 card.
                  const aspect = device.outer.w / device.outer.h;
                  h = 70;
                  w = +(h * (540 / 960) * aspect).toFixed(1);
                } else {
                  ({ w, h } = FRAME_DEFAULT_SIZE[shape]);
                }
                appendFreeformBlock((z, x, y) => ({
                  id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  type: 'image',
                  frameShape: shape,
                  ...(deviceId ? { deviceId } : {}),
                  fit: 'cover',
                  x, y, w, h, rotation: 0, z,
                }));
              }}
              onInsertChart={(chartType) => {
                if (activeCard === null) return;
                // Insert a chart with seed data so the user sees content
                // immediately rather than an empty axis. Type-specific seeds
                // make each chart feel meaningful at insert time. Position
                // routes through findFreeformSlot inside appendFreeformBlock,
                // so the chart drops into the first non-overlapping slot if
                // one exists. Footprint 40×30% (was 50×40%) so the slot
                // finder has a better chance of placing the chart on cards
                // already filled with unified-format text blocks — earlier
                // size frequently fell through to the cascade fallback and
                // landed on top of existing content (UAT-found, 2026-05-24).
                // Pre-generate the id so we can auto-open the Chart Data-Table
                // editor on the freshly-inserted chart (lets the user set data
                // immediately, per spec §5.5 trigger 2). appendFreeformBlock
                // peeks `make` once for sizing then calls it again for the real
                // insert — both calls return this same fixed id, so the block
                // that lands carries it.
                const newChartId = appendChartWithLabels(chartType);
                if (newChartId) setChartEditTargetId(newChartId);
              }}
              onInsertTable={() => {
                if (activeCard === null) return;
                appendFreeformBlock((z, x, y) => ({
                  ...buildSeedTable(),
                  id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  x, y, w: 56, h: 24, rotation: 0, z,
                }));
              }}
              onInsertList={() => {
                if (activeCard === null) return;
                appendFreeformBlock((z, x, y) => ({
                  ...buildSeedList(),
                  id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  x, y, w: 44, h: 22, rotation: 0, z,
                }));
              }}
            />
          )}
          {activeRailPanel === 'export' && (
            <RailExportContent
              template={template}
              deckName={deckDefaultName(template)}
              hasSources={hasSources}
              includeSourceAppendix={includeSourceAppendix}
              onToggleSourceAppendix={setIncludeSourceAppendix}
            />
          )}
          {activeRailPanel === 'layouts' && (
            <RailLayoutsContent
              cardIndex={activeCard}
              busy={
                activeCard !== null && layoutSwapBusyIndex === activeCard
              }
              onPick={(blockTemplate) => {
                if (activeCard === null) return;
                handleTryLayout(activeCard, blockTemplate);
              }}
            />
          )}
        </SlideToolPanel>
      )}
      </div>

      {/* Left dock: AI panel — built-in flex column when the rail's AI tool
          is active. Sibling of SlideToolPanel above; the two are mutually
          exclusive (the rail toggles between them). Deck context flows in
          so the AI grounds its replies in the user's current work. */}
      {activeRailPanel === 'ai' && (
        <SlideAIPanel
          onClose={() => setActiveRailPanel(null)}
          deckContext={{
            cardTitles: cards
              .map((c) => {
                const heading = c.columns[0]?.blocks.find(
                  (b) => b.type === 'heading',
                );
                return heading && 'content' in heading
                  ? (heading as { content: string }).content
                  : '';
              })
              .filter(Boolean),
            activeCardTitle:
              activeCard !== null && cards[activeCard]
                ? (() => {
                    const h = cards[activeCard].columns[0]?.blocks.find(
                      (b) => b.type === 'heading',
                    );
                    return h && 'content' in h
                      ? (h as { content: string }).content
                      : undefined;
                  })()
                : undefined,
            activeCardText:
              activeCard !== null && cards[activeCard]
                ? cards[activeCard].columns
                    .flatMap((col) => col.blocks)
                    .map((b) =>
                      'content' in b
                        ? (b as { content: string }).content
                        : 'items' in b
                        ? (b as { items: string[] }).items.join(' · ')
                        : '',
                    )
                    .filter(Boolean)
                    .join('\n')
                : undefined,
          }}
        />
      )}

      {/* Center column: scroll area + speaker notes. The top toolbar moved to
          the full-width bar above the editor row (per Lisa 2026-06-14). */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Center: Card stack. The editor wrapper consumes the ambient
            workspace background derived from the active theme's palette
            via OKLCH color math (see lib/theme/generateAmbientBackground.ts).
            The base color is the SSR fallback; the multi-radial gradient
            sits on top. Cards themselves consume var(--theme-page-bg) so
            they read as themed pages floating on the ambient workspace.
            Themes that opt in get a SVG pattern (ribbon/bloom/drift/...)
            rendered between the ambient sweeps and the cards — see
            <WorkspacePattern /> below. Color is theme-tinted via
            currentColor → var(--theme-link-color). */}
        <div
          ref={scrollRef}
          onPointerDownCapture={onCanvasPointerDownCapture}
          style={{
            flex: 1,
            backgroundColor: 'var(--theme-workspace-base)',
            backgroundImage: 'var(--theme-workspace-bg)',
            position: 'relative',
            // Graphics: borderless Figma-style INFINITE canvas — the artboard sits
            // on a large pannable "world" (the inner padding below); pan via
            // Space/middle-drag or trackpad scroll, zoom via ⌘/Ctrl+wheel. Slides
            // keeps the deck scroll behaviour (top padding clears the card toolbar).
            ...(mode === 'graphics'
              ? { overflow: 'auto', padding: 0, cursor: isPanning ? 'grabbing' : undefined }
              : { overflowY: 'auto', padding: '80px 20px 24px' }),
          }}
        >
          {/* Theme workspace pattern removed (Lisa 2026-06-16) — the canvas is a
              flat neutral grey, so no theme-tinted decorative watermark. */}
          {/* Card stack: cards are fixed 960×540 (16:9 PowerPoint widescreen).
              Wrapper centers them and lets users scroll vertically. CSS `zoom`
              scales the painted size to the current zoom level while keeping the
              960px logical coordinate space intact (clientWidth is unaffected, so
              freeform block measurement stays exact). */}
          {/* Graphics: large pannable "world" around the artboard (gives the
              infinite-canvas scroll room). Slides: display:contents — no extra
              box, layout identical to before. */}
          {/* Dot grid lives on the pannable WORLD (not the viewport) so it scrolls
              with the canvas — that parallax is the "this is an infinite canvas"
              cue (Lisa 2026-06-25). The violet bloom stays on the scroll container
              above as an ambient viewport wash. Graphics only. */}
          <div style={mode === 'graphics'
            ? { padding: '50vh 50vw', width: 'max-content', boxSizing: 'border-box',
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1.3px, transparent 1.5px)',
                backgroundSize: '26px 26px' }
            : { display: 'contents' }}>
          <div style={{ width: '960px', margin: mode === 'graphics' ? '0' : '0 auto', zoom: zoomScale }}>
            {cards.slice(0, visibleCards).map((card, i) => (
              <CardView
                key={card.id}
                card={card}
                theme={template.theme}
                themeId={template.themeId}
                index={i}
                isActive={i === activeCard}
                rounded={roundedCorners}
                radiusOverride={mode === 'graphics' ? 2 : undefined}
                onClick={() => setActiveCard(i)}
                cardRef={(el) => { cardRefs.current[i] = el; }}
                onBlockChange={(blockIndex, next) => handleBlockChange(i, blockIndex, next)}
                onFreeformChange={(next) => handleFreeformChange(i, next)}
                onFreeformGestureStart={beginCoalesce}
                onFreeformGestureEnd={endCoalesce}
                onFreeformOpenFontPanel={() => openRailPanel('text')}
                freeformFontPanelOpen={activeRailPanel === 'text'}
                onFreeformSelectionChange={(has) => {
                  setFreeformSelectedCards((prev) => {
                    const next = new Set(prev);
                    if (has) next.add(i); else next.delete(i);
                    return next;
                  });
                }}
                onSelectedIdsChange={(ids) => setSelectedFreeformIds((p) => ({ ...p, [i]: ids }))}
                onImagePlaceholderClick={(blockId) => {
                  // Empty image-block click → bind that block as the
                  // Media-panel fill target, then open the panel. The
                  // Media panel's onInsertImage handler branches on
                  // mediaTargetBlockId and writes the chosen src into
                  // this block instead of appending a new freeform.
                  setActiveCard(i);
                  setMediaTargetBlockId(blockId);
                  setActiveRailPanel('media');
                }}
                onEditChart={(blockId) => {
                  // Double-click / context-menu "Edit chart data" on a chart
                  // block → open the Chart Data-Table editor bound to it.
                  setActiveCard(i);
                  setChartEditTargetId(blockId);
                }}
                onImageDrop={(sel, xPct, yPct) => {
                  // A library image was dropped onto card i. Insert a freeform
                  // image block at the drop point, sized to the image's true
                  // aspect ratio (so portraits/landscapes aren't squared), and
                  // centered on the cursor (clamped fully inside the card).
                  setActiveCard(i);
                  const { w, h } = aspectAwareImageSize({ width: sel.width, height: sel.height });
                  const x = Math.max(0, Math.min(100 - w, xPct - w / 2));
                  const y = Math.max(0, Math.min(100 - h, yPct - h / 2));
                  setCards((prev) => prev.map((card, ci) => {
                    if (ci !== i) return card;
                    const existing = card.freeform ?? [];
                    const block: FreeformImageBlock = {
                      id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                      type: 'image',
                      src: sel.src,
                      alt: sel.alt,
                      fit: 'contain',
                      x, y, w, h, rotation: 0, z: existing.length + 1,
                    };
                    return { ...card, freeform: [...existing, block] };
                  }));
                }}
                scrollContainer={scrollRef.current}
                selectedBlockKeys={selectedKeysByCard.get(i)}
                onSelectBlock={(blockIdx, additive) => selectBlock(i, blockIdx, additive)}
                blockOverrides={blockOverrides}
                animate={streaming && animatingCardIds.has(card.id)}
                deckSlides={deckSlides}
                onNavigateToSlide={navigateToSlide}
              />
            ))}

            {visibleCards < cards.length && <BuildingIndicator />}

            {/* Add card button — appends a blank card at the end and
                activates it. Theme-aware so the dashed border + label stay
                legible on dark themes (rgba(0,0,0,...) was invisible on
                Volt / Obsidian / Velvet). */}
            {mode === 'slides' && visibleCards >= cards.length && (
              <button
                type="button"
                onClick={handleAddCard}
                aria-label="Add card"
                style={{
                  width: '100%', padding: '20px',
                  border: '2px dashed var(--theme-chrome-border-strong)',
                  borderRadius: '16px',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  color: 'var(--theme-chrome-fg-muted)',
                  fontSize: '0.95rem', fontWeight: 500,
                  minHeight: '44px', transition: 'all 200ms ease',
                  marginBottom: '24px',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--theme-chrome-hover)';
                  e.currentTarget.style.color = 'var(--theme-chrome-fg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--theme-chrome-fg-muted)';
                }}
              >
                <Plus size={16} /> Add card
              </button>
            )}
          </div>
          </div>
        </div>

        {/* Speaker notes — spec §4. Slide-only: a standalone graphic has no
            presenter notes (asset-editor-mvp-spec §2). */}
        {mode === 'slides' && (
        <SpeakerNotesPane
          slideIndex={notesCardIndex}
          totalSlides={totalSlides}
          notes={notesDraft}
          onChangeNotes={setNotesDraft}
          onSaveNotes={saveNotes}
          onPrev={() => setNotesCardIndex((i) => Math.max(0, i - 1))}
          onNext={() => setNotesCardIndex((i) => Math.min(totalSlides - 1, i + 1))}
          zoom={zoom}
          zoomOpen={zoomOpen}
          onToggleZoom={() => setZoomOpen((v) => !v)}
          onSelectZoom={(z) => { setZoom(z); setZoomOpen(false); }}
        />
        )}
      </div>

      {/* Right: Thumbnail sidebar — moved from the left edge per Lisa
          2026-05-22 (P0 #2 D1). Sits between the canvas and the Inspector
          (when the Inspector is open). Same component, same interactions
          (drag-to-reorder, right-click context, hover actions, +New slide);
          only the dividing border flipped to the left edge.
          Slide-only: a standalone asset is a single artboard, not a deck, so
          the slide-thumbnail rail is hidden in graphics mode
          (asset-editor-mvp-spec §2 — "Slides" hidden from the rail). */}
      {mode === 'slides' && (
      <ThumbnailSidebar
        cards={cards}
        surfaceIsDark={activeTheme.tone === 'dark'}
        theme={template.theme}
        activeIndex={activeCard ?? -1}
        onSelect={scrollToCard}
        visibleCount={visibleCards}
        streaming={streaming}
        onAddCard={handleAddCard}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onMoveCard={handleMoveCard}
        onOpenLayoutsPanel={(idx) => {
          // Right-click "Try different layout" → scope panel to that card.
          // Setting activeCard first keeps the Layouts panel content (which
          // reads activeCard) in sync with whatever the user right-clicked.
          // 2026-05-23 — replaces the floating popover (P1 #6, 2026-05-22)
          // with the left-panel pattern per Lisa's Canva-style restructure.
          setActiveCard(idx);
          setActiveRailPanel('layouts');
        }}
        onSwapCoverTier={handleSwapCoverTier}
        layoutSwapBusyIndex={layoutSwapBusyIndex}
      />
      )}

      {/* Right: Inspector panel (when objects selected in Edit mode) */}
      {inspectorVisible && (
        <SlideInspectorPanel
          selected={inspectorEntries}
          onUpdate={updateOverride}
          onUpdateAll={updateAllOverrides}
          cardProvenance={cardProvenance}
          cardSource={cardSource}
          onOpenSource={handleOpenSource}
        />
      )}

      {/* Phase E: source drawer (opens when user clicks a passage row or "Open source") */}
      {drawerPage !== null && cardSource && cardProvenance && (
        <SourceDrawer
          source={cardSource}
          citedPages={cardProvenance.sourcePages}
          initialPage={drawerPage}
          highlight={drawerHighlight}
          onClose={handleCloseSource}
        />
      )}

      {/* Graphics-mode right inspector — always present (Properties / Arrange),
          progressive disclosure, dark glass. Element props when one block is
          selected; canvas settings otherwise. */}
      {mode === 'graphics' && (
        <GraphicsInspector
          block={gfxBlock}
          canvasW={1920}
          canvasH={1080}
          palette={gfxPalette}
          onChangeBlock={handleGfxChangeBlock}
          onArrange={handleGfxArrange}
        />
      )}
      </div>{/* end editor row */}

      {/* Phase E: print-only source appendix. Hidden on screen; appears in
          browser PDF/print output when the user has the toggle on. */}
      <SourceAppendix template={template} cards={cards} include={includeSourceAppendix} />

      {/* Card-level floating toolbar — appears when a card is selected (and
          no block/text selection, and no freeform-block selection on this
          card). The freeform-block check keeps the user from seeing two
          toolbars stacked when they grab a freeform block. */}
      {activeCard !== null
        && cards[activeCard]
        && !selectionRect
        && selectedBlockKeys.size === 0
        && !freeformSelectedCards.has(activeCard)
        && (
        <CardToolbar
          cardEl={cardRefs.current[activeCard]}
          scrollContainer={scrollRef.current}
          currentLayout={cards[activeCard].layout}
          onChangeLayout={(layout) => handleChangeLayout(activeCard, layout)}
          onDuplicate={() => handleDuplicate(activeCard)}
          onDelete={() => handleDelete(activeCard)}
          onComment={handleComment}
          onRegenerate={() => handleRegenerate(activeCard)}
        />
      )}

      {/* Text-level floating toolbar — appears at text selection origin.
          Hidden when the selection sits inside a freeform block — that block
          has its own inline toolbar with the same Bold/Italic/Underline/align
          controls, so showing TextToolbar too would stack a second formatting
          menu over the first. */}
      {activeCard !== null && selectionRect && !freeformSelectedCards.has(activeCard) && (
        <TextToolbar
          selectionRect={selectionRect}
          onAIRewrite={handleAIRewrite}
          onClose={() => setSelectionRect(null)}
        />
      )}

      {/* Chart Data-Table editor — opens on double-click / context-menu / a
          fresh chart insert. Reads the target FreeformChartBlock off whatever
          card holds it (chartEdit) and writes edits back through the existing
          freeform-update path so the on-slide chart re-renders automatically. */}
      {chartEdit && (
        <ChartDataGrid
          key={chartEdit.block.id}
          block={chartEdit.block}
          onChange={(partial) => {
            const target = chartEdit;
            const nextFreeform = (cards[target.cardIndex].freeform ?? []).map((b) =>
              b.id === target.block.id && b.type === 'chart' ? { ...b, ...partial } : b,
            );
            handleFreeformChange(target.cardIndex, nextFreeform);
          }}
          onClose={() => setChartEditTargetId(null)}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes cardReveal { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        /* Thumbnail-rail skeleton shimmer (slide still mid-reveal). A soft
           opacity pulse on the placeholder silhouette — calm, slate-toned via
           the chrome vars. prefers-reduced-motion drops the animation to a
           static placeholder (handled in the media query below). */
        @keyframes thumbSkeletonShimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .thumb-skeleton-shimmer { animation: thumbSkeletonShimmer 1.5s ease-in-out infinite; }
        @keyframes contentFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toolbarFadeIn { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes snapPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; }
          .reveal.visible { animation: none; }
          html { scroll-behavior: auto; }
          [role="toolbar"], [role="menu"] { animation: none !important; }
          /* Snap pulse becomes static for users who prefer reduced motion. */
          [data-snap-guide] { animation: none !important; }
          /* Skeleton thumbnails stay static (no shimmer pulse). */
          .thumb-skeleton-shimmer { animation: none !important; }
        }

        /* ── Print / Save-as-PDF (unified-format Phase D) ─────────────────
           Each card prints as one landscape page (matches PowerPoint 16:9).
           Hides ALL chrome (sidebar, top toolbar, rails, thumbnails, etc.)
           so the output is just the cards. Freeform blocks render at their
           %-positions inside the card frame, exactly as on screen. */
        @media print {
          @page {
            size: 13.333in 7.5in;
            margin: 0;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide every non-card UI element. data-print-hide is the explicit
             marker we put on chrome elements that need to disappear. We also
             hide common roles (toolbar/menu) and the rail/sidebar regions. */
          [data-print-hide],
          [data-speaker-notes],
          [role="toolbar"],
          [role="menu"],
          [role="complementary"],
          nav,
          aside,
          header,
          footer,
          button[aria-label="Resize from nw"],
          button[aria-label="Resize from ne"],
          button[aria-label="Resize from sw"],
          button[aria-label="Resize from se"],
          button[aria-label="Resize from n"],
          button[aria-label="Resize from s"],
          button[aria-label="Resize from e"],
          button[aria-label="Resize from w"],
          [aria-label="Rotate"] {
            display: none !important;
          }
          /* Each card = one print page. The card's 960×540 px frame scales
             to the @page size. Strip the on-screen card chrome (shadow,
             rounded corners, outer margin) so the slide bleeds edge-to-edge. */
          [data-card-id] {
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            outline: none !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: none !important;
            max-height: none !important;
            display: block !important;
          }
          [data-card-id]:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          /* No animations during print. */
          * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Rail panel stub content ────────────────────────────────────────────────
//
// Placeholder content for each SlideToolRail panel until real implementations
// land. Each describes what the panel will host so reviewers can validate the
// click-through. Stubs replaced one panel at a time in subsequent commits:
//   - text: hooks into the existing TextPanel component (presets + fonts)
//   - brand: hooks into BrandingPanel (theme colors / fonts / tone)
//   - ai: slide-flavored AI chat (pattern from AgentChatPanel in document editor)
//   - media: image library + upload + URL paste
//   - elements: shapes / icons / charts / smart layouts
//   - search: in-deck text search
//   - export: PDF / PPT / image export trigger

// ── Rail panel content: Search ─────────────────────────────────────────────

function RailSearchContent({
  cards,
  onJump,
}: {
  cards: Card[];
  onJump: (i: number) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const results = q
    ? cards
        .map((c, i) => {
          const text = c.columns
            .flatMap((col) => col.blocks)
            .map((b) =>
              'content' in b
                ? (b as { content: string }).content
                : 'items' in b
                ? (b as { items: string[] }).items.join(' ')
                : '',
            )
            .join(' ')
            .toLowerCase();
          return text.includes(q) ? { i, card: c } : null;
        })
        .filter((r): r is { i: number; card: Card } => r !== null)
    : [];

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search cards…"
        autoFocus
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid rgba(0,0,0,0.10)',
          borderRadius: '8px',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          outline: 'none',
          marginBottom: '12px',
        }}
      />
      {q && results.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No matches.</div>
      )}
      {results.map(({ i, card }) => {
        const heading = card.columns[0]?.blocks.find((b) => b.type === 'heading');
        const title =
          heading && 'content' in heading
            ? (heading as { content: string }).content
            : 'Untitled card';
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onJump(i)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(0,0,0,0.06)',
              background: '#fff',
              cursor: 'pointer',
              marginBottom: '6px',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
              Card {i + 1}
            </div>
            <div
              style={{
                fontSize: '0.8rem',
                color: '#1a1f36',
                fontWeight: 500,
                marginTop: '2px',
              }}
            >
              {title}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Rail panel content: Media ──────────────────────────────────────────────
//
// LibraryImageMeta + rankLibraryBySimilarity now live in the shared module
// @/components/image-gen/library (Stage 4) so the slides Media panel and the
// /editor/graphics wizard render the library + "more like this" identically.

// Card is a fixed 16:9 frame (960×540 px). Because the block's w/h are
// percentages of DIFFERENT axes (w = % of 960px width, h = % of 540px
// height), equal percentages do NOT render as equal pixels — 40% × 40% is a
// 384×216 px landscape box, not a square. The card-axis ratio that converts
// between the two is 960/540 = 16/9.
const CARD_AXIS_RATIO = 960 / 540; // ≈ 1.7778

/** Compute card-relative w/h (in %) for an inserted image so the block's
 *  RENDERED PIXEL box matches the image's natural aspect ratio. With the box
 *  shaped to the image, `object-fit: contain` and `cover` look identical at
 *  insertion and the selection frame HUGS the image with no letterbox /
 *  pillarbox gap. Caps to leave room for surrounding content: width never
 *  exceeds 50% of the card, height never exceeds 60%. When the natural
 *  dimensions are unknown (legacy uploads that didn't probe, SVGs without
 *  intrinsic size), falls back to the legacy 32×32 square so the insert still
 *  works. Lisa 2026-05-24 — was the source of the "image cropped to a
 *  rectangle" complaint; 2026-06-03 — fixed the percent-axis mismatch that
 *  left a gap between the frame and the image. */
function aspectAwareImageSize(
  naturalDims?: { width: number; height: number },
): { w: number; h: number } {
  if (!naturalDims || naturalDims.width <= 0 || naturalDims.height <= 0) {
    return { w: 32, h: 32 };
  }
  const aspect = naturalDims.width / naturalDims.height; // >1 landscape, <1 portrait
  // Start with a comfortable default — 40% of card width.
  let w = 40;
  // Pixel height = pixel width / aspect; converting back to a % of the card's
  // SHORTER axis multiplies by the card-axis ratio. h% = w% * (960/540) / aspect.
  let h = (w * CARD_AXIS_RATIO) / aspect;
  // Tall portraits would blow past the card height — clamp h and reflow w.
  if (h > 60) {
    h = 60;
    w = (h * aspect) / CARD_AXIS_RATIO;
  }
  // Wide landscapes after the height clamp could still exceed the side cap.
  if (w > 50) {
    w = 50;
    h = (w * CARD_AXIS_RATIO) / aspect;
  }
  return { w, h };
}

/** Probe a data-URL or file URL for its natural pixel dimensions. Used by
 *  the upload path so the inserted block matches the image's true aspect
 *  ratio. Library items skip this — their dimensions are persisted in
 *  metadata.json by the server-side saver. */
function probeImageDims(src: string): Promise<{ width: number; height: number }> {
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

function RailMediaContent({
  onInsertImage,
  slideContext,
}: {
  // Third arg carries the source image's natural pixel dimensions so the
  // parent can size the inserted block to match the actual aspect ratio
  // (vs the legacy forced 32×32% square that cropped portraits and
  // letterboxed landscapes). Optional — uploads probe via Image(), library
  // items read from metadata, generated images await user pickup so they
  // arrive through the library path.
  onInsertImage: (src: string, alt?: string, naturalDims?: { width: number; height: number }) => void;
  // Auto-context for image generation + the library "Suggested for your
  // content" ranking — slide heading + deck title drive suggestions; the
  // palette/body bias the generator. Lisa 2026-05-24 / 2026-06-03.
  slideContext?: {
    slideHeading?: string;
    slideBody?: string;
    deckTitle?: string;
    themePalette?: string;
  };
}) {
  // ── Media panel — Editorial Feed (D2, design table 2026-06-03) ──────────
  // Browsing is the primary job: <LibraryBrowser> renders a varied-size
  // masonry led by content-matched suggestions (ranked against the slide +
  // deck), with drag-onto-slide + a keyboard Add on every thumbnail. Upload
  // sits below it; AI generation is demoted to a quiet collapsible footer.
  //
  // libraryVersion bumps after a successful AI generation so LibraryBrowser
  // remounts and re-fetches /api/library/list — the freshly-saved variants
  // become browsable without a manual refresh. (LibraryBrowser owns its own
  // fetch; remount via key is the cheap refresh seam.)
  const [libraryVersion, setLibraryVersion] = useState(0);
  // AI footer is collapsed by default — present but quiet (P-UX10 calm
  // default; AI secondary to browsing per the approved direction).
  const [aiOpen, setAiOpen] = useState(false);

  // Upload state (separate flow — inserts image as freeform content)
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read a File as a data URL so the freeform image block can render the
  // bytes directly without going through a server upload. Same pattern as
  // BrandingPanel's logo upload — data URLs are the stub until a real DMS
  // upload route lands. Per-card-deck localStorage already handles data
  // URLs in image freeform blocks (PowerPoint export rebases them at the
  // export seam).
  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });

  const handleUploadFile = async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('That file is not an image. Pick a PNG, JPG, SVG, or WebP.');
      return;
    }
    // 4 MB upper bound — bigger than the BrandingPanel logo cap because slide
    // images carry more visual weight; still well within the localStorage
    // ceiling for a typical deck.
    if (file.size > 4 * 1024 * 1024) {
      setUploadError('Image is over 4 MB. Compress it or use a smaller file for now.');
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      const altText = file.name.replace(/\.[a-z0-9]+$/i, '') || undefined;
      // Probe natural dimensions so the parent can insert the block at
      // the image's real aspect ratio rather than the legacy 32×32 square.
      // Best-effort: if the probe fails, fall through with no dims and the
      // parent uses its default footprint.
      let naturalDims: { width: number; height: number } | undefined;
      try {
        naturalDims = await probeImageDims(dataUrl);
      } catch {
        // Probe failure is non-fatal — insertion still works at default size.
      }
      onInsertImage(dataUrl, altText, naturalDims);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read the file.');
    }
  };

  // Fires when the shared accordion kicks off a generation — bumps the
  // library version so the masonry remounts + re-fetches, surfacing the
  // newly-saved variants in Browse.
  const handleGenerated = useCallback((_prompt: string) => {
    setLibraryVersion((v) => v + 1);
  }, []);

  const sectionDivider: React.CSSProperties = {
    height: '1px',
    background: 'var(--theme-chrome-border)',
    margin: '4px 0',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Browse + Suggested — the primary surface ─────────────────────
          <LibraryBrowser> renders a varied-size masonry led by content-
          matched suggestions (ranked against slide heading + deck title).
          Every thumbnail is draggable onto a slide and carries a keyboard
          Add button. No image-count language. Remounts on libraryVersion
          so AI-generated images appear in Browse after generation. */}
      <LibraryBrowser
        key={libraryVersion}
        slideContext={
          slideContext
            ? {
                ...(slideContext.slideHeading ? { slideHeading: slideContext.slideHeading } : {}),
                ...(slideContext.deckTitle ? { deckTitle: slideContext.deckTitle } : {}),
              }
            : undefined
        }
        onSelect={(item) => onInsertImage(item.src, item.alt, { width: item.width, height: item.height })}
      />

      <div style={sectionDivider} />

      {/* ── Upload from device ─────────────────────────────────────────── */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUploadFile(f);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        {/* Compact upload — single row (icon + label); the format/size detail
            moved to the tooltip per Lisa 2026-06-14 ("less text; icon where
            self-explanatory"). Was a tall dashed drop-zone. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload image from device"
          title="Upload image — PNG · JPG · SVG · WebP, up to 4 MB"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            minHeight: '40px',
            padding: '0 12px',
            borderRadius: '10px',
            border: '1px dashed rgba(107,63,160,0.3)',
            background: 'rgba(107,63,160,0.04)',
            cursor: 'pointer',
            transition: 'all 160ms ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(107,63,160,0.5)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(107,63,160,0.08)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(107,63,160,0.3)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(107,63,160,0.04)';
          }}
        >
          <UploadIcon size={16} style={{ color: '#6B3FA0' }} />
          <span style={{ fontSize: '13px', color: '#6B3FA0', fontWeight: 500 }}>Upload image</span>
        </button>
        {uploadError && (
          <div role="alert" style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#dc2626',
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.15)',
            padding: '6px 10px',
            borderRadius: '6px',
            lineHeight: 1.4,
          }}>{uploadError}</div>
        )}
      </div>

      <div style={sectionDivider} />

      {/* ── Generate with AI — quiet footer (secondary to browsing) ───────
          Collapsed by default per the approved direction: AI stays present
          but never competes with the library. Expanding reveals the shared
          ImageGenAccordion (prompt → style → size → generate → pick). On
          pick it inserts via onInsertImage; onGenerated bumps libraryVersion
          so the new variants appear in Browse. */}
      <div>
        <button
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          aria-expanded={aiOpen}
          style={panelChrome.btnSecondary}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-chrome-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--theme-chrome-bg)'; }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: 'linear-gradient(135deg, #818cf8, #60a5fa)',
              display: 'grid', placeItems: 'center', color: '#fff',
            }}
          >
            <Sparkles size={13} />
          </span>
          Generate a new image with AI
        </button>
        {aiOpen && (
          <div style={{ marginTop: 12 }}>
            <ImageGenAccordion
              slideContext={
                slideContext
                  ? {
                      ...(slideContext.slideHeading ? { slideHeading: slideContext.slideHeading } : {}),
                      ...(slideContext.deckTitle ? { deckTitle: slideContext.deckTitle } : {}),
                      ...(slideContext.themePalette ? { themePalette: slideContext.themePalette } : {}),
                    }
                  : undefined
              }
              onUse={(r, dims) => onInsertImage(r.src, undefined, dims)}
              onGenerated={handleGenerated}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rail panel content: Elements ───────────────────────────────────────────
// Quick inserters for non-text blocks. The image/icon/chart pickers come
// later; this is the fast-path for shapes, dividers, callouts, buttons.

// ── Keyword search model for the Elements panel (Design Table D1, 2026-06-16) ──
// Every element family carries a forgiving keyword set so one search box filters
// ALL six families at once. Matching: lowercase query → tokens → a token matches
// if it's a PREFIX of any whole word in the element's (label + keywords) set;
// multi-token = AND. So "phone" matches both phones via the `phone` keyword while
// "iphone" matches only iPhone via its label/keyword — no special-casing.
const ELEMENT_FRAME_KEYWORDS: Record<string, string[]> = {
  rectangle: ['rectangle', 'square', 'box'],
  rounded: ['rounded', 'radius', 'soft'],
  circle: ['circle', 'round', 'ellipse', 'oval'],
  heart: ['heart', 'love'],
  hexagon: ['hexagon', 'polygon', 'six'],
  laptop: ['laptop', 'computer', 'notebook', 'screen'],
};
const ELEMENT_FRAME_COMMON = ['frame', 'photo', 'image', 'picture', 'mask', 'crop', 'container'];
const ELEMENT_DEVICE_KEYWORDS: Record<string, string[]> = {
  iphone: ['iphone', 'apple', 'phone', 'mobile', 'smartphone', 'ios'],
  android: ['android', 'google', 'pixel', 'phone', 'mobile', 'smartphone'],
  ipad: ['ipad', 'apple', 'tablet', 'ios'],
  'android-tablet': ['android', 'google', 'tablet'],
  macbook: ['macbook', 'apple', 'laptop', 'computer', 'notebook'],
};
const ELEMENT_DEVICE_COMMON = ['device', 'mockup', 'frame', 'screen'];
const ELEMENT_SHAPE_KEYWORDS: Record<string, string[]> = {
  rectangle: ['rectangle', 'square', 'box'],
  circle: ['circle', 'round', 'ellipse'],
  line: ['line', 'divider', 'rule'],
  arrow: ['arrow', 'pointer', 'direction'],
};
const ELEMENT_CHART_KEYWORDS: Record<FreeformChartType, string[]> = {
  bar: ['bar', 'horizontal'],
  column: ['column', 'vertical', 'bar'],
  line: ['line', 'trend'],
  area: ['area', 'filled'],
  pie: ['pie', 'slice', 'proportion'],
  donut: ['donut', 'doughnut', 'ring'],
  scatter: ['scatter', 'plot', 'points'],
  funnel: ['funnel', 'pipeline', 'stage'],
  bubble: ['bubble', 'circle', 'plot'],
};
const ELEMENT_CHART_COMMON = ['chart', 'graph', 'data', 'visualization'];

/** Tokenize free text into lowercase whole-words. */
function elementTokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
/** Does the query match this element? Each query token must be a prefix of some
 *  whole word in the element's combined (label + keyword) word set (AND). */
function elementMatches(query: string, words: string[]): boolean {
  const qTokens = elementTokens(query);
  if (qTokens.length === 0) return true;
  const wordSet = words.flatMap(elementTokens);
  return qTokens.every((qt) => wordSet.some((w) => w.startsWith(qt)));
}

function RailElementsContent({
  onInsertBlock,
  onInsertFreeformShape,
  onInsertFreeformIcon,
  onInsertFrame,
  onInsertChart,
  onInsertTable,
  onInsertList,
}: {
  onInsertBlock: (block: CardBlock) => void;
  onInsertFreeformShape?: (shape: 'rectangle' | 'circle' | 'line' | 'arrow') => void;
  onInsertFreeformIcon?: (name: string) => void;
  /** Inserts an EMPTY freeform image block (a "frame") of the given shape
   *  on the active card. Empty frames render their shape outline + a
   *  placeholder icon; clicking opens the Media panel bound to that
   *  block. */
  onInsertFrame?: (shape: FrameShape, deviceId?: string) => void;
  /** Inserts a chart of the given type at a non-overlapping slot, seeded
   *  with type-appropriate sample data so the chart reads immediately. */
  onInsertChart?: (chartType: FreeformChartType) => void;
  /** Inserts a blank 3×3 table (header row + placeholder columns). */
  onInsertTable?: () => void;
  /** Inserts a 3-item bulleted list block. */
  onInsertList?: () => void;
}) {
  // Design Table D1 (Visual / browse-forward, 2026-06-16): SEARCH-FIRST panel.
  // One pinned search box filters ALL six element families at once. Default
  // (empty query) is a populated gallery — Recently used / Frames / Devices /
  // Shapes / Icons / Charts / Blocks — each a flat captioned section in one
  // scroll. Search-active groups hits BY FAMILY with count headers.
  const freeformShapes: { label: string; shape: 'rectangle' | 'circle' | 'line' | 'arrow'; preview: React.ReactNode }[] = [
    { label: 'Rectangle', shape: 'rectangle', preview: <ShapePreview shape="rectangle" /> },
    { label: 'Circle', shape: 'circle', preview: <ShapePreview shape="circle" /> },
    { label: 'Line', shape: 'line', preview: <ShapePreview shape="line" /> },
    { label: 'Arrow', shape: 'arrow', preview: <ShapePreview shape="arrow" /> },
  ];
  const frameShapes: FrameShape[] = ['rectangle', 'rounded', 'circle', 'heart', 'hexagon', 'laptop'];
  const chartTypes: FreeformChartType[] = ['bar', 'column', 'bubble', 'line', 'area', 'scatter', 'pie', 'donut', 'funnel'];
  const deviceGroups = useMemo(() => listDeviceGroups(), []);
  const allIcons = useMemo(() => listIcons(), []);
  const iconCats = useMemo(() => ['All', ...listIconCategories()], []);

  // ONE search box across all families (was icons-only). Plus an icon
  // sub-category chip row (browse only) and a "see all 96" expander.
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  const [iconsExpanded, setIconsExpanded] = useState(false);
  // Selected color per device key (defaults to 'black').
  const [deviceColor, setDeviceColor] = useState<Record<string, string>>({});
  // Recently-inserted frames + icons (localStorage, MRU, capped).
  const [recent, setRecent] = useState<{ kind: 'icon' | 'frame'; id: string }[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('compose:elements-recent');
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* private mode / bad JSON — start empty */ }
  }, []);
  const pushRecent = useCallback((entry: { kind: 'icon' | 'frame'; id: string }) => {
    setRecent((prev) => {
      const next = [entry, ...prev.filter((e) => !(e.kind === entry.kind && e.id === entry.id))].slice(0, 10);
      try { localStorage.setItem('compose:elements-recent', JSON.stringify(next)); } catch { /* best-effort */ }
      return next;
    });
  }, []);

  const insertIcon = (id: string) => { onInsertFreeformIcon?.(`figma:${id}`); pushRecent({ kind: 'icon', id }); };
  const insertDeviceFrame = (id: string) => { onInsertFrame?.('device', id); pushRecent({ kind: 'frame', id }); };
  const capWord = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const SWATCH_FILL: Record<string, string> = { black: '#1a1c20', silver: '#caced4', white: '#f3f4f6' };
  const structured: { label: string; sub: string; build: () => CardBlock; preview: React.ReactNode }[] = [
    { label: 'Divider', sub: 'Horizontal rule to split sections', build: () => ({ type: 'divider' }), preview: <StructuredPreview kind="divider" /> },
    { label: 'Callout', sub: 'Highlighted note with accent bar', build: () => ({ type: 'callout', content: 'Highlight a key idea here.' }), preview: <StructuredPreview kind="callout" /> },
    { label: 'Button', sub: 'Call-to-action pill', build: () => ({ type: 'button', text: 'Call to action', style: 'primary' } as CardBlock), preview: <StructuredPreview kind="button" /> },
    { label: 'Bullet list', sub: 'Stacked bulleted points', build: () => ({ type: 'bullet-list', items: ['First point', 'Second point', 'Third point'] }), preview: <StructuredPreview kind="bullets" /> },
    {
      label: '2×2 grid',
      sub: 'Four-cell layout block',
      build: () => ({
        type: 'smart-layout',
        variant: 'grid-2x2',
        cells: Array.from({ length: 4 }, (_, i) => ({
          heading: `Item ${i + 1}`,
          body: 'Short description.',
        })),
      } as CardBlock),
      preview: <StructuredPreview kind="grid" />,
    },
    { label: 'Toggle', sub: 'On / off switch control', build: () => ({ type: 'toggle', heading: 'Click to expand', content: 'Hidden body content.' }), preview: <StructuredPreview kind="toggle" /> },
  ];

  // Tiles use the shared panelChrome vocabulary (theme-var colors, one hover) so
  // Elements matches Text/Media/etc. Per Lisa 2026-06-14.
  const tileStyle = panelChrome.tile;
  const onTileEnter = tileHoverIn;
  const onTileLeave = tileHoverOut;
  const grid = (cols: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px' });
  // Captioned section label — a flat signpost (D1 uses one scroll, not accordions).
  const caption: React.CSSProperties = { ...panelChrome.label, marginBottom: 6, marginTop: 2 };
  // Section-head row with an optional trailing "See all ›" action.
  const secHead: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, marginTop: 2 };
  const seeAll: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6B3FA0', cursor: 'pointer', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' };
  const searchInput: React.CSSProperties = {
    width: '100%', padding: '8px 9px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
    border: '1px solid var(--theme-chrome-border)', background: 'var(--theme-chrome-bg)',
    color: 'var(--theme-chrome-fg)', boxSizing: 'border-box',
  };
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
    flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
    border: active ? '1px solid transparent' : '1px solid var(--theme-chrome-border)',
    background: active ? '#6B3FA0' : 'var(--theme-chrome-bg-elevated)',
    color: active ? '#fff' : 'var(--theme-chrome-fg-muted)',
  });
  const swatchDot = (color: string, active: boolean): React.CSSProperties => ({
    width: 13, height: 13, borderRadius: 999, padding: 0, cursor: 'pointer', boxSizing: 'border-box',
    background: SWATCH_FILL[color] ?? '#888',
    border: active ? '2px solid #6B3FA0' : '1px solid var(--theme-chrome-border)',
  });
  // Device tiles are landscape-ish (a phone/laptop silhouette), so override the
  // square aspectRatio of the shared tile.
  const deviceTile: React.CSSProperties = { ...panelChrome.tile, aspectRatio: undefined, height: 62, padding: 6 };
  // Block list-row styles (label-led rows, not tiles).
  const blockRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
    border: '1px solid var(--theme-chrome-border)', borderRadius: 10, padding: '9px 11px',
    background: 'var(--theme-chrome-bg-elevated)', cursor: 'pointer', fontFamily: 'inherit',
  };
  const blockIconBox: React.CSSProperties = {
    flex: '0 0 30px', width: 30, height: 30, borderRadius: 7, background: 'var(--theme-chrome-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const q = query.trim();
  const searching = q.length > 0;

  // ── Filtered families (each respects the single query) ──
  const matchedFrames = frameShapes.filter((s) =>
    elementMatches(q, [FRAME_LABELS[s], ...(ELEMENT_FRAME_KEYWORDS[s] ?? []), ...ELEMENT_FRAME_COMMON]));
  const matchedDevices = deviceGroups.filter((g) =>
    elementMatches(q, [g.label, g.device, ...(ELEMENT_DEVICE_KEYWORDS[g.device] ?? []), ...ELEMENT_DEVICE_COMMON]));
  const matchedShapes = freeformShapes.filter((s) =>
    elementMatches(q, [s.label, ...(ELEMENT_SHAPE_KEYWORDS[s.shape] ?? [])]));
  // Icons: category chip narrows the BROWSE state only; search ignores the chip
  // and matches across label + category.
  const matchedIcons = allIcons.filter((i) =>
    elementMatches(q, [i.label, i.category]));
  const browseIcons = allIcons.filter((i) => activeCat === 'All' || i.category === activeCat);
  const matchedCharts = chartTypes.filter((t) =>
    elementMatches(q, [CHART_TILE_LABEL[t], ...(ELEMENT_CHART_KEYWORDS[t] ?? []), ...ELEMENT_CHART_COMMON]));
  const matchedBlocks = structured.filter((b) => elementMatches(q, [b.label, b.sub]));

  // Family hit-count + total for the search summary.
  const familyHits: { name: string; count: number }[] = [
    { name: 'Frames', count: onInsertFrame ? matchedFrames.length : 0 },
    { name: 'Devices', count: onInsertFrame ? matchedDevices.length : 0 },
    { name: 'Shapes', count: onInsertFreeformShape ? matchedShapes.length : 0 },
    { name: 'Icons', count: onInsertFreeformIcon ? matchedIcons.length : 0 },
    { name: 'Charts', count: onInsertChart ? matchedCharts.length : 0 },
    { name: 'Blocks', count: matchedBlocks.length },
  ].filter((f) => f.count > 0);
  const totalHits = familyHits.reduce((n, f) => n + f.count, 0);

  // ── Reusable renderers (same register in browse + search) ──
  const renderFrameTile = (shape: FrameShape) => (
    <div key={shape} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => onInsertFrame?.(shape)} title={`Add ${FRAME_LABELS[shape]} frame`} aria-label={`Add ${FRAME_LABELS[shape]} frame`} style={tileStyle} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
        <FramePreview shape={shape} />
      </button>
      <span style={{ ...panelChrome.hint, fontSize: 10 }}>{FRAME_LABELS[shape]}</span>
    </div>
  );
  const renderDeviceTile = (g: DeviceGroup) => {
    const sel = deviceColor[g.device] ?? 'black';
    const variant = g.variants.find((v) => v.color === sel) ?? g.variants[0];
    return (
      <div key={g.device} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <button type="button" onClick={() => insertDeviceFrame(variant.id)} title={`Add ${variant.label} frame`} aria-label={`Add ${variant.label} frame`} style={deviceTile} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
          <DeviceFrame deviceId={variant.id} />
        </button>
        <span style={{ ...panelChrome.hint, fontSize: 10, textAlign: 'center' }}>{g.label}</span>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
          {g.variants.map((v) => (
            <button key={v.color} type="button" onClick={() => setDeviceColor((p) => ({ ...p, [g.device]: v.color }))} title={`${g.label} · ${capWord(v.color)}`} aria-label={`${g.label} ${v.color}`} style={swatchDot(v.color, v.color === sel)} />
          ))}
        </div>
      </div>
    );
  };
  const renderShapeTile = (s: typeof freeformShapes[number]) => (
    <button key={s.shape} type="button" title={s.label} aria-label={s.label} onClick={() => onInsertFreeformShape?.(s.shape)} style={tileStyle} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
      {s.preview}
    </button>
  );
  const renderIconTile = (i: typeof allIcons[number]) => (
    <button key={i.id} type="button" title={i.label} aria-label={i.label} onClick={() => insertIcon(i.id)} style={tileStyle} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
      <PictographicIcon name={`figma:${i.id}`} size={24} color="currentColor" />
    </button>
  );
  const renderChartTile = (t: FreeformChartType) => (
    <button key={t} type="button" title={CHART_TILE_LABEL[t]} aria-label={`Add ${CHART_TILE_LABEL[t]} chart`} onClick={() => onInsertChart?.(t)} style={tileStyle} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
      <ChartTilePreview type={t} />
    </button>
  );
  const renderBlockRow = (item: typeof structured[number]) => (
    <button key={item.label} type="button" aria-label={item.label} onClick={() => onInsertBlock(item.build())} style={blockRow} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
      <span style={blockIconBox}>{item.preview}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--theme-chrome-fg)' }}>{item.label}</span>
        <span style={{ ...panelChrome.hint, fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</span>
      </span>
    </button>
  );

  // Browse-state icon preview is capped; "See all 96 ›" toggles the full grid.
  const ICON_PREVIEW_CAP = 14;
  const visibleBrowseIcons = iconsExpanded ? browseIcons : browseIcons.slice(0, ICON_PREVIEW_CAP);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Pinned single search box — filters ALL families (D1 search-first). */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search elements…"
          aria-label="Search elements"
          style={searchInput}
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            title="Clear search"
            style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 999, border: 'none', background: 'var(--theme-chrome-border)', color: 'var(--theme-chrome-fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1, padding: 0 }}
          >×</button>
        )}
      </div>

      {searching ? (
        /* ── SEARCH-ACTIVE: results grouped by family with count headers ── */
        totalHits === 0 ? (
          <div style={{ ...panelChrome.hint, padding: '4px 2px' }}>No elements match “{q}”.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ ...panelChrome.hint, fontSize: 11.5 }}>
              {totalHits} result{totalHits === 1 ? '' : 's'} for “{q}” · across {familyHits.length} {familyHits.length === 1 ? 'family' : 'families'}
            </div>

            {onInsertFrame && matchedDevices.length > 0 && (
              <div>
                <div style={caption}>Devices · {matchedDevices.length}</div>
                <div style={grid(2)}>{matchedDevices.map(renderDeviceTile)}</div>
              </div>
            )}
            {onInsertFrame && matchedFrames.length > 0 && (
              <div>
                <div style={caption}>Frames · {matchedFrames.length}</div>
                <div style={grid(3)}>{matchedFrames.map(renderFrameTile)}</div>
              </div>
            )}
            {onInsertFreeformShape && matchedShapes.length > 0 && (
              <div>
                <div style={caption}>Shapes · {matchedShapes.length}</div>
                <div style={grid(4)}>{matchedShapes.map(renderShapeTile)}</div>
              </div>
            )}
            {onInsertFreeformIcon && matchedIcons.length > 0 && (
              <div>
                <div style={caption}>Icons · {matchedIcons.length}</div>
                <div style={grid(5)}>{matchedIcons.map(renderIconTile)}</div>
              </div>
            )}
            {onInsertChart && matchedCharts.length > 0 && (
              <div>
                <div style={caption}>Charts · {matchedCharts.length}</div>
                <div style={grid(3)}>{matchedCharts.map(renderChartTile)}</div>
              </div>
            )}
            {matchedBlocks.length > 0 && (
              <div>
                <div style={caption}>Blocks · {matchedBlocks.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{matchedBlocks.map(renderBlockRow)}</div>
              </div>
            )}
          </div>
        )
      ) : (
        /* ── DEFAULT / BROWSE: populated gallery, one flat scroll ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Recently used — horizontal mini row, hidden until first insert */}
          {recent.length > 0 && (
            <div>
              <div style={caption}>Recently used</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {recent.map((e) => e.kind === 'icon' ? (
                  <button key={`r-i-${e.id}`} type="button" title={getIcon(e.id)?.label ?? e.id} aria-label={`Insert ${e.id}`} onClick={() => insertIcon(e.id)} style={{ ...tileStyle, flex: '0 0 52px', width: 52, height: 52, aspectRatio: undefined }} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
                    <PictographicIcon name={`figma:${e.id}`} size={22} color="currentColor" />
                  </button>
                ) : (
                  <button key={`r-f-${e.id}`} type="button" title={getDeviceFrame(e.id)?.label ?? e.id} aria-label={`Add ${e.id} frame`} onClick={() => insertDeviceFrame(e.id)} style={{ ...tileStyle, flex: '0 0 52px', width: 52, height: 52, aspectRatio: undefined }} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
                    <DeviceFrame deviceId={e.id} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Frames — geometric, captioned tiles */}
          {onInsertFrame && (
            <div>
              <div style={caption}>Frames</div>
              <div style={grid(3)}>{frameShapes.map(renderFrameTile)}</div>
            </div>
          )}

          {/* Devices — one tile per device + Black/Silver/White swatch */}
          {onInsertFrame && (
            <div>
              <div style={caption}>Devices</div>
              <div style={grid(3)}>{deviceGroups.map(renderDeviceTile)}</div>
              <div style={{ ...panelChrome.hint, padding: '8px 2px 0' }}>Click an empty frame on the slide to fill it with an image.</div>
            </div>
          )}

          {/* Shapes */}
          {onInsertFreeformShape && (
            <div>
              <div style={caption}>Shapes</div>
              <div style={grid(4)}>{freeformShapes.map(renderShapeTile)}</div>
            </div>
          )}

          {/* Icons — label + sub-category chip row + capped grid w/ See all */}
          {onInsertFreeformIcon && (
            <div>
              <div style={secHead}>
                <span style={panelChrome.label as React.CSSProperties}>Icons · {allIcons.length}</span>
                {browseIcons.length > ICON_PREVIEW_CAP && (
                  <button type="button" style={seeAll} onClick={() => setIconsExpanded((v) => !v)}>
                    {iconsExpanded ? 'Show fewer' : `See all ${allIcons.length} ›`}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 4 }}>
                {iconCats.map((c) => (
                  <button key={c} type="button" onClick={() => { setActiveCat(c); setIconsExpanded(false); }} style={chipStyle(c === activeCat)}>{c}</button>
                ))}
              </div>
              {visibleBrowseIcons.length > 0 ? (
                <div style={grid(5)}>{visibleBrowseIcons.map(renderIconTile)}</div>
              ) : (
                <div style={{ ...panelChrome.hint, padding: '4px 2px' }}>No icons in this category.</div>
              )}
            </div>
          )}

          {/* Charts — all 9 types */}
          {onInsertChart && (
            <div>
              <div style={caption}>Charts</div>
              <div style={grid(3)}>{chartTypes.map(renderChartTile)}</div>
            </div>
          )}

          {/* Table */}
          {onInsertTable && (query === '' || elementMatches(query, ['table', 'grid', 'data', 'rows', 'columns'])) && (
            <div>
              <div style={caption}>Table</div>
              <div style={grid(3)}>
                <button type="button" title="Table" aria-label="Add table" onClick={() => onInsertTable()} style={tileStyle} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
                  <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                    <rect x={3} y={4.5} width={18} height={15} rx={1.5} />
                    <line x1={3} y1={9.5} x2={21} y2={9.5} />
                    <line x1={3} y1={14.5} x2={21} y2={14.5} />
                    <line x1={9} y1={4.5} x2={9} y2={19.5} />
                    <line x1={15} y1={4.5} x2={15} y2={19.5} />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* List (bulleted / numbered) */}
          {onInsertList && (query === '' || elementMatches(query, ['list', 'bullet', 'bulleted', 'numbered', 'points', 'items'])) && (
            <div>
              <div style={caption}>List</div>
              <div style={grid(3)}>
                <button type="button" title="Bulleted list" aria-label="Add list" onClick={() => onInsertList()} style={tileStyle} onMouseEnter={onTileEnter} onMouseLeave={onTileLeave}>
                  <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                    <circle cx={5} cy={7} r={1.1} fill="currentColor" stroke="none" />
                    <circle cx={5} cy={12} r={1.1} fill="currentColor" stroke="none" />
                    <circle cx={5} cy={17} r={1.1} fill="currentColor" stroke="none" />
                    <line x1={9} y1={7} x2={20} y2={7} />
                    <line x1={9} y1={12} x2={20} y2={12} />
                    <line x1={9} y1={17} x2={20} y2={17} />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Blocks — label-led list rows (not tiles) */}
          <div>
            <div style={caption}>Blocks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{structured.map(renderBlockRow)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const CHART_TILE_LABEL: Record<FreeformChartType, string> = {
  bar: 'Bar',
  column: 'Column',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
  scatter: 'Scatter',
  funnel: 'Funnel',
  bubble: 'Bubble',
};

/** Inline 28×28 SVG preview of each chart type for the picker tiles. Uses
 *  currentColor so hover-tint flows through naturally. Shapes are stylised
 *  miniatures — readable at a glance, not pixel-accurate to the real chart. */
function ChartTilePreview({ type }: { type: FreeformChartType }) {
  const stroke = 'currentColor';
  switch (type) {
    case 'column':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <rect x="5" y="14" width="3.5" height="9" fill={stroke} opacity="0.85" />
          <rect x="11" y="10" width="3.5" height="13" fill={stroke} />
          <rect x="17" y="6" width="3.5" height="17" fill={stroke} opacity="0.85" />
          <line x1="3" y1="23.5" x2="25" y2="23.5" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
        </svg>
      );
    case 'bar':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <rect x="5" y="6" width="17" height="3.5" fill={stroke} opacity="0.85" />
          <rect x="5" y="12" width="13" height="3.5" fill={stroke} />
          <rect x="5" y="18" width="9" height="3.5" fill={stroke} opacity="0.85" />
          <line x1="5" y1="4" x2="5" y2="25" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
        </svg>
      );
    case 'line':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden fill="none">
          <polyline points="4,20 9,14 14,17 19,9 24,6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="4" cy="20" r="1.3" fill={stroke} />
          <circle cx="9" cy="14" r="1.3" fill={stroke} />
          <circle cx="14" cy="17" r="1.3" fill={stroke} />
          <circle cx="19" cy="9" r="1.3" fill={stroke} />
          <circle cx="24" cy="6" r="1.3" fill={stroke} />
        </svg>
      );
    case 'area':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <polygon points="4,20 9,14 14,17 19,9 24,6 24,24 4,24" fill={stroke} opacity="0.25" />
          <polyline points="4,20 9,14 14,17 19,9 24,6" stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'pie':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <circle cx="14" cy="14" r="9" fill={stroke} opacity="0.3" />
          <path d="M 14 14 L 14 5 A 9 9 0 0 1 22 18 Z" fill={stroke} />
          <path d="M 14 14 L 22 18 A 9 9 0 0 1 14 23 Z" fill={stroke} opacity="0.6" />
        </svg>
      );
    case 'donut':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <circle cx="14" cy="14" r="9" fill={stroke} opacity="0.3" />
          <path d="M 14 14 L 14 5 A 9 9 0 0 1 22 18 Z" fill={stroke} />
          <circle cx="14" cy="14" r="4.5" fill="#ffffff" />
        </svg>
      );
    case 'scatter':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <circle cx="7" cy="20" r="1.5" fill={stroke} />
          <circle cx="11" cy="13" r="1.5" fill={stroke} />
          <circle cx="14" cy="17" r="1.5" fill={stroke} />
          <circle cx="18" cy="9" r="1.5" fill={stroke} />
          <circle cx="22" cy="14" r="1.5" fill={stroke} />
          <circle cx="9" cy="8" r="1.5" fill={stroke} opacity="0.6" />
          <line x1="4" y1="23.5" x2="25" y2="23.5" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
        </svg>
      );
    case 'bubble':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <circle cx="9" cy="18" r="3" fill={stroke} opacity="0.55" />
          <circle cx="17" cy="12" r="4.5" fill={stroke} opacity="0.55" />
          <circle cx="21" cy="20" r="2" fill={stroke} opacity="0.55" />
          <line x1="4" y1="23.5" x2="25" y2="23.5" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
        </svg>
      );
    case 'funnel':
      return (
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <polygon points="4,5 24,5 21,11 7,11" fill={stroke} />
          <polygon points="7,12 21,12 18,18 10,18" fill={stroke} opacity="0.75" />
          <polygon points="10,19 18,19 16,24 12,24" fill={stroke} opacity="0.55" />
        </svg>
      );
  }
}

/** Tiny inline SVG preview of each shape — matches what the user will get
 *  when they click. Uses currentColor so hover-tint flows through naturally. */
/** Tile preview for the Frames gallery in RailElementsContent. Renders a
 *  miniature of each frame shape with a small image-icon centered inside
 *  so the user reads the tile as "frame for an image", not just a shape. */
function FramePreview({ shape }: { shape: FrameShape }) {
  const stroke = 'currentColor';
  // Tiny inline image-icon to sit inside the frame outline.
  const innerImg = (
    <g transform="translate(14 14)" stroke={stroke} fill="none" strokeWidth="1.2" opacity="0.7">
      <rect x="-3.5" y="-2.5" width="7" height="5" rx="0.6" />
      <circle cx="-1.5" cy="-1" r="0.5" />
      <path d="M 3.5 2.5 L 0 -0.5 L -1.5 1 L -3.5 0.5" />
    </g>
  );
  if (shape === 'rectangle') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="4" y="6" width="20" height="16" rx="1.5" stroke={stroke} strokeWidth="1.4" />
        {innerImg}
      </svg>
    );
  }
  if (shape === 'rounded') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="4" y="6" width="20" height="16" rx="4" stroke={stroke} strokeWidth="1.4" />
        {innerImg}
      </svg>
    );
  }
  if (shape === 'circle') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <circle cx="14" cy="14" r="10" stroke={stroke} strokeWidth="1.4" />
        {innerImg}
      </svg>
    );
  }
  if (shape === 'heart') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <path
          d="M 14 23 C 6 17, 3 13, 4 9 C 5 5, 9 4, 14 9 C 19 4, 23 5, 24 9 C 25 13, 22 17, 14 23 Z"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {innerImg}
      </svg>
    );
  }
  if (shape === 'hexagon') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <polygon
          points="14,4 23,9 23,19 14,24 5,19 5,9"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {innerImg}
      </svg>
    );
  }
  if (shape === 'device') {
    // Phone mockup glyph — body + screen + Dynamic Island notch.
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="9" y="3" width="10" height="22" rx="2.4" stroke={stroke} strokeWidth="1.3" />
        <rect x="10.4" y="4.6" width="7.2" height="18.8" rx="1.4" fill="rgba(107,63,160,0.10)" />
        <rect x="12" y="5.4" width="4" height="1.2" rx="0.6" fill={stroke} opacity="0.7" />
      </svg>
    );
  }
  // laptop — miniature of the LaptopFrame chrome
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="5" y="6" width="18" height="11" rx="0.8" stroke={stroke} strokeWidth="1.3" />
      <rect x="6.5" y="7.5" width="15" height="8" fill="rgba(107,63,160,0.10)" />
      <path d="M 3.5 17 L 24.5 17 L 23 21 L 5 21 Z" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="12" y="19" width="4" height="0.8" rx="0.4" fill={stroke} opacity="0.5" />
    </svg>
  );
}

function ShapePreview({ shape }: { shape: 'rectangle' | 'circle' | 'line' | 'arrow' }) {
  const stroke = 'currentColor';
  if (shape === 'rectangle') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="4" y="6" width="20" height="16" rx="1.5" stroke={stroke} strokeWidth="1.6" />
      </svg>
    );
  }
  if (shape === 'circle') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <circle cx="14" cy="14" r="9" stroke={stroke} strokeWidth="1.6" />
      </svg>
    );
  }
  if (shape === 'line') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <line x1="4" y1="14" x2="24" y2="14" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  // arrow
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <line x1="4" y1="14" x2="22" y2="14" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <polyline points="18,9 23,14 18,19" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tiny inline SVG preview of structured elements — communicates the shape
 *  at-a-glance instead of relying on the user reading "Bullet list" etc. */
function StructuredPreview({ kind }: { kind: 'divider' | 'callout' | 'button' | 'bullets' | 'grid' | 'toggle' }) {
  const stroke = 'currentColor';
  if (kind === 'divider') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <line x1="4" y1="14" x2="24" y2="14" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'callout') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="4" y="8" width="20" height="12" rx="2" stroke={stroke} strokeWidth="1.4" />
        <line x1="4" y1="11" x2="4" y2="17" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'button') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="3" y="10" width="22" height="8" rx="4" fill={stroke} fillOpacity="0.9" />
      </svg>
    );
  }
  if (kind === 'bullets') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <circle cx="6" cy="9" r="1.3" fill={stroke} /><line x1="10" y1="9" x2="24" y2="9" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="6" cy="14" r="1.3" fill={stroke} /><line x1="10" y1="14" x2="22" y2="14" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="6" cy="19" r="1.3" fill={stroke} /><line x1="10" y1="19" x2="20" y2="19" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'grid') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
        <rect x="4" y="4" width="9" height="9" rx="1" stroke={stroke} strokeWidth="1.4" />
        <rect x="15" y="4" width="9" height="9" rx="1" stroke={stroke} strokeWidth="1.4" />
        <rect x="4" y="15" width="9" height="9" rx="1" stroke={stroke} strokeWidth="1.4" />
        <rect x="15" y="15" width="9" height="9" rx="1" stroke={stroke} strokeWidth="1.4" />
      </svg>
    );
  }
  // toggle
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <polyline points="8,11 14,17 20,11" stroke={stroke} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Rail panel content: Export ─────────────────────────────────────────────

interface RailExportContentProps {
  template: CardTemplate;
  deckName?: string;
  hasSources: boolean;
  includeSourceAppendix: boolean;
  onToggleSourceAppendix: (value: boolean) => void;
}

function RailExportContent({ template, deckName, hasSources, includeSourceAppendix, onToggleSourceAppendix }: RailExportContentProps) {
  const [pptStatus, setPptStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'working' | 'error'>('idle');

  // Browser print dialog — the fallback when the Foxit Conversion SDK is
  // unavailable. Sets document.title so the saved PDF takes the deck name.
  const printToPdf = () => {
    const name = (deckName || '').trim();
    const prev = document.title;
    document.title = name.length > 0 ? name : 'Presentation';
    window.print();
    window.setTimeout(() => { document.title = prev; }, 1000);
  };

  // Foxit-native PDF: build the editable .pptx (same as the PPT export) and
  // convert it PPTX→PDF server-side via the Foxit Conversion SDK, so the PDF is
  // produced by Foxit's engine AND is pixel-faithful to the deck. Falls back to
  // the browser print dialog if the SDK is unavailable (503 { fallback }).
  const handleExportPdf = async () => {
    if (pdfStatus === 'working') return;
    setPdfStatus('working');
    try {
      const res = await fetch('/api/export/slides-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, fileName: deckName }),
      });
      if (!res.ok) {
        // SDK unavailable (or any failure) → fall back to browser print.
        console.warn('Foxit PDF export unavailable, falling back to print', await res.text());
        setPdfStatus('idle');
        printToPdf();
        return;
      }
      const blob = await res.blob();
      const safe = (deckName || template.name || 'presentation')
        .trim()
        .replace(/[^a-z0-9\-_ ]/gi, '')
        .replace(/\s+/g, '-')
        .toLowerCase() || 'presentation';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfStatus('idle');
    } catch (err) {
      console.error('PDF export failed, falling back to print', err);
      setPdfStatus('idle');
      printToPdf();
    }
  };

  const handleExportPpt = async () => {
    if (pptStatus === 'working') return;
    setPptStatus('working');
    try {
      // Lazy-load the exporter (Compose's in-house PPTX engine) so the editor
      // bundle stays lean and it only loads when a user actually exports.
      const { exportDeckToPptx } = await import('@/lib/pptxExport');
      await exportDeckToPptx(template, deckName);
      setPptStatus('idle');
    } catch (err) {
      console.error('PPTX export failed', err);
      setPptStatus('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        type="button"
        onClick={handleExportPdf}
        disabled={pdfStatus === 'working'}
        style={pdfStatus === 'working' ? { ...exportBtnStyle, opacity: 0.6, cursor: 'wait' } : exportBtnStyle}
      >
        {pdfStatus === 'working' ? 'Building PDF…' : 'Save as PDF'}
      </button>
      <button
        type="button"
        onClick={handleExportPpt}
        disabled={pptStatus === 'working'}
        style={pptStatus === 'working' ? { ...exportBtnStyle, opacity: 0.6, cursor: 'wait' } : exportBtnStyle}
      >
        {pptStatus === 'working'
          ? 'Building PowerPoint…'
          : pptStatus === 'error'
          ? 'Export failed — retry'
          : 'Export as PPT (.pptx)'}
      </button>
      {/* Phase E: source appendix toggle (only shown for source-grounded decks). */}
      {hasSources && (
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: '#fbfcfe',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            marginTop: '8px',
            fontSize: '0.78rem',
            color: '#1e293b',
            lineHeight: 1.45,
          }}
        >
          <input
            type="checkbox"
            checked={includeSourceAppendix}
            onChange={(e) => onToggleSourceAppendix(e.target.checked)}
            style={{ marginTop: '2px', cursor: 'pointer' }}
          />
          <span>
            <span style={{ fontWeight: 600 }}>Include source appendix</span>
            <span style={{ display: 'block', color: '#64748b', marginTop: '2px', fontSize: '0.72rem' }}>
              Adds a final page listing source documents and per-slide citations.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

const exportBtnStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(0,0,0,0.08)',
  background: '#fff',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#1a1f36',
  fontFamily: 'inherit',
};

// ── Layouts panel (rail) ──────────────────────────────────────────────────
//
// 2x5 grid of LAYOUT_PICKS tiles. Picking a tile calls handleTryLayout in the
// parent (via onPick), which routes through /api/ai/regenerate-card to swap
// the active card's blockTemplate. While the swap is in flight the parent
// sets layoutSwapBusyIndex; we surface it as a busy strip below the grid.
//
// Per Lisa 2026-05-23 — replaces the floating popover that shipped 2026-05-22
// (P1 #6). The picker grid is the same; only its host moved from a fixed-
// position dialog to this left-panel tab so the Canva-style pattern is
// consistent across the editor.

function RailLayoutsContent({
  cardIndex,
  busy,
  onPick,
}: {
  cardIndex: number | null;
  busy: boolean;
  onPick: (blockTemplate: string) => void;
}) {
  if (cardIndex === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--theme-chrome-fg)' }}>
          Pick a slide first
        </div>
        <div style={{ fontSize: '12px', color: 'var(--theme-chrome-fg-subtle)', lineHeight: 1.5 }}>
          Click any slide thumbnail to choose which one gets a new layout.
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--theme-chrome-fg)' }}>
          Try a different layout
        </div>
        <div style={{ fontSize: '11px', color: 'var(--theme-chrome-fg-subtle)' }}>
          Slide {cardIndex + 1}
        </div>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--theme-chrome-fg-subtle)', margin: 0, lineHeight: 1.4 }}>
        Pick a new layout — content stays, structure rebuilds.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {LAYOUT_PICKS.map((lp) => (
          <button
            key={lp.id}
            type="button"
            onClick={() => onPick(lp.blockTemplate)}
            disabled={busy}
            aria-label={`Apply ${lp.label} layout`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              border: '1px solid var(--theme-chrome-border)',
              background: 'var(--theme-chrome-bg-elevated)',
              borderRadius: '8px',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              textAlign: 'left',
              transition: 'all 120ms ease',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              if (busy) return;
              e.currentTarget.style.borderColor = '#6B3FA0';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(107,63,160,0.10)';
            }}
            onMouseLeave={(e) => {
              if (busy) return;
              e.currentTarget.style.borderColor = 'var(--theme-chrome-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ width: '100%', aspectRatio: '16/9', background: '#fff', borderRadius: '4px', overflow: 'hidden' }}>
              <LayoutPreview kind={lp.id} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--theme-chrome-fg)' }}>
              {lp.label}
            </div>
          </button>
        ))}
      </div>
      {busy && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#6B3FA0', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Loader2 size={11} className="spin" />
          Regenerating slide…
        </div>
      )}
    </div>
  );
}

// ── Present Mode (scroll-snap fullscreen) ──────────────────────────────────

function PresentMode({ template, onExit }: { template: CardTemplate; onExit: () => void }) {
  const [current, setCurrent] = useState(0);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recompute the scale factor that fits a 960x540 card into the viewport
  // with a small safety margin. Listening to resize keeps the present-mode
  // letterbox correct across window resizes / external displays.
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth - 48;
      const vh = window.innerHeight - 48;
      setScale(Math.min(vw / 960, vh / 540, 1.6));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= template.cards.length) return;
    containerRef.current?.querySelectorAll('.present-slide')[idx]?.scrollIntoView({ behavior: 'smooth' });
    setCurrent(idx);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onExit(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
    };

    let lastWheel = 0;
    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastWheel < 800) return;
      lastWheel = now;
      e.deltaY > 0 ? goTo(current + 1) : goTo(current - 1);
    };

    document.addEventListener('keydown', handleKey);
    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [current]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = Array.from(containerRef.current?.querySelectorAll('.present-slide') || []).indexOf(entry.target as Element);
          setCurrent(idx);
        }
      });
    }, { threshold: 0.5 });
    containerRef.current?.querySelectorAll('.present-slide').forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    // Stage backdrop is a NEUTRAL light frame, deliberately NOT the slide's own
    // page background (Lisa 2026-06-09): when the stage matched --theme-page-bg
    // the slide had zero contrast against the surround and seemed to vanish —
    // especially on dark/muddy themes. A fixed light neutral makes every slide
    // (dark or light) read as a distinct sheet floating on the stage.
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#eceef3' }}>
      {/* Exit button */}
      <button
        type="button"
        onClick={onExit}
        style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 60,
          width: '40px', height: '40px', borderRadius: '8px',
          background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Exit presentation (Esc)"
      >
        <Minimize2 size={16} />
      </button>

      {/* Nav dots */}
      <nav style={{
        position: 'fixed', right: '16px', top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 60,
      }}>
        {template.cards.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: i === current ? '#6B3FA0' : 'rgba(107,63,160,0.2)',
              transform: i === current ? 'scale(1.3)' : 'scale(1)',
              transition: 'all 300ms', border: 'none', cursor: 'pointer', padding: 0,
            }}
          />
        ))}
      </nav>

      {/* Hint */}
      <div style={{
        position: 'fixed', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.75rem', color: '#697386', zIndex: 60, opacity: 0.6,
      }}>
        Arrow keys or scroll · Esc to exit
      </div>

      {/* Slides — render the SAME CardView the canvas uses so freeform
          blocks, theme, hero accents, and dark/chapter styling all match
          editor exactly. Each native 960x540 card scales to fit the
          viewport via the JS-computed `scale` factor (centered, with
          24px breathing room on each side). The previous PresentMode
          read `card.columns[0].blocks` and rendered legacy CardBlockView
          — under the unified format that array is empty, so slides
          showed up blank. Fixed 2026-05-22 (P0 #2.2). */}
      <div ref={containerRef} style={{ height: '100vh', overflowY: 'auto', scrollSnapType: 'y mandatory' }}>
        {template.cards.map((card, i) => (
          <section
            key={card.id}
            className="present-slide"
            style={{
              width: '100vw',
              height: '100vh',
              scrollSnapAlign: 'start',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                // Reset CardView's marginBottom so the visual centerline
                // matches the slide centerline. The 24px margin matters at
                // canvas-stack scroll, not here.
                marginBottom: 0,
              }}
            >
              <CardView
                card={card}
                theme={template.theme}
                themeId={template.themeId}
                index={i}
                isActive={false}
                onClick={() => { /* noop in present mode */ }}
                animate={false}
                /* No-op onFreeformChange is required for CardView to mount
                   the FreeformLayer at all — without it the layer is gated
                   off (line 639). interactive={false} downstream blocks
                   every event handler so the no-op never fires. */
                onFreeformChange={() => { /* noop in present mode */ }}
              />
            </div>
          </section>
        ))}
      </div>

      <style>{`
        /* Suppress CardView's marginBottom inside the present-mode slide so
           the card is exactly centered. CardView itself owns the styling so
           we override at the wrapper level. */
        .present-slide [data-card-id] {
          margin-bottom: 0 !important;
          cursor: default !important;
        }
        /* Hide empty image placeholders in present mode — the dashed frame
           + "Image placeholder" label competes with real content during
           presentation. Edit mode still shows them so authors know they need
           to fill those frames. UAT-found, 2026-05-24. */
        .present-slide [data-image-placeholder] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
