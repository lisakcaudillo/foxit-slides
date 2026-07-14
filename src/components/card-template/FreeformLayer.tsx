'use client';

import { useState, useRef, useCallback, useContext, useEffect, useLayoutEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2, Copy, ArrowUp, ArrowDown,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link2 as LinkIcon,
  Superscript as SuperscriptIcon, Subscript as SubscriptIcon, RemoveFormatting, Highlighter,
  MoreHorizontal, StickyNote as FootnoteIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ChevronDown,
  ImageIcon, Shapes,
  TableCellsMerge, TableCellsSplit,
  List, ListOrdered,
  BarChart3,
  Plus, Pipette,
  Crop as CropIcon, Check as CheckIcon,
  AArrowUp, AArrowDown,
} from 'lucide-react';
import type {
  FreeformBlock,
  FreeformChartBlock,
  FreeformChartType,
  FreeformImageBlock,
  FreeformShapeBlock,
  FreeformTextBlock,
  FreeformTextVariant,
  FreeformIconBlock,
  FreeformTableBlock,
  FreeformListBlock,
  TextRun,
  TextRunMarks,
} from '@/types/card-template';
import {
  runsToPlain,
  plainToRuns,
  normalizeRuns,
  applyMarkToRange,
  applyMarkToAll,
  activeMarks,
  isMarkUniformAll,
  sliceRuns,
  clearMarksInRange,
  asLinkTarget,
  linkHref,
  type MarkKey,
  type MarkValue,
  type LinkTarget,
} from '@/lib/card-engine/text-runs';
import {
  runMarkStyle,
  serializeEditable,
  fillEditable,
  getSelectionOffsets,
  setSelectionOffsets,
  rangeRectFor,
  rangeClientRects,
} from '@/lib/card-engine/text-runs-dom';
import { LinkEditor, LinkBubble, fileNameFromUrl, type DeckSlideRef } from './LinkEditor';
import { IcRowAbove, IcRowBelow, IcColLeft, IcColRight, IcRowDelete, IcColDelete } from './tableIcons';
import PictographicIcon from './blocks/PictographicIcon';
import { Typewriter } from './Typewriter';
import { FRAME_CLIP_PATHS, FRAME_LABELS, LaptopFrame, DeviceFrame } from './frames';
import { TemplateThemeContext } from './TemplateThemeProvider';
import type { Card, TemplateTheme } from '@/types/card-template';
import { ThemeContext } from '@/lib/theme/ThemeProvider';
import {
  pickTextColor,
  compositeOverlay,
  LIGHT_TEXT,
  DARK_TEXT,
} from '@/lib/contrast';

// ── Design tokens (per .apm/design-specs/freeform-blocks-phase1.md) ──────────
// Selection chrome uses Designer 2's bold-Canva treatment; snap/alignment guides
// use a bold ORANGE so the snap moment is unambiguous (and distinct from the violet
// selection chrome).
const VIOLET = '#6B3FA0';

/** An open link-editor session — the snapshot of the selection being linked. */
interface LinkDraft {
  blockId: string;
  start: number;
  end: number;
  runs: TextRun[];
  /** The existing link target (edit), or undefined for a new link. */
  initial?: LinkTarget;
  isEdit: boolean;
  anchor: { top: number; bottom: number; left: number; width: number };
}

const SNAP_COLOR = '#FF6A00';
const ROTATION_GRADIENT = 'linear-gradient(135deg, #E267E4 0%, #9FC7FE 50%, #4198FF 100%)';
const SNAP_ENGAGE_PX = 4;
const SNAP_RELEASE_PX = 8;

// Snap targets in % — the card itself defines centers/edges/thirds. Other
// freeform blocks contribute their own edges/centers at runtime (added in
// the drag handler so they reflect the live block list).
const CARD_SNAP_X = [0, 33.33, 50, 66.67, 100];
const CARD_SNAP_Y = [0, 33.33, 50, 66.67, 100];

type SnapGuide =
  | { axis: 'x'; at: number; label: string }
  | { axis: 'y'; at: number; label: string };

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

// ── Text-contrast guarantee ───────────────────────────────
// THREE distinct treatments, so text is never illegible against whatever is
// behind it — keyed off the slide's imageRole:
//
//   1. RICH-PHOTO ROLES (full-bleed / duotone) → ASSERTIVE SCRIM + FORCED
//      LIGHT TEXT. The photo stays at full strength. A strong DARK gradient
//      veil (peak alpha ~0.6–0.68) is painted between the image (z=0) and the
//      text, concentrated in the text-safe zone and fading toward the far
//      edge so the photo still breathes — the editorial "darkened lower-third"
//      look. Text is then FORCED to near-white (always — independent of theme)
//      because the veil is dark and a rich photo is most reliably tamed that
//      way. We can't sample the real photo pixels client-side, so the dark
//      veil converts an unpredictable background into a known dark one and the
//      forced light text clears WCAG AA against it.
//   2. WASH ROLES (texture / background) → NO SCRIM. The auto-placement fades
//      these images to a faint ~0.18 wash (page.tsx imageRoleOpacity), so the
//      card surface dominates and the theme's normal dark-on-light text reads
//      on top unchanged. Adaptive color still runs against the region bg as a
//      backstop.
//   3. NO-PHOTO-BEHIND ROLES (column / band / none) → ADAPTIVE TEXT COLOR.
//      Text is NOT over the image (the overlap fix moved it to the
//      complementary region), so no scrim; the text color is checked against
//      the THEME REGION bg and flipped to light/dark only if the theme color
//      doesn't clear 4.5:1.
//
// `scrimContext` carries the resolved (dark) scrim hex for the rich-photo case
// and the region bg hex for the other cases down to text blocks so each one
// can resolve a guaranteed-legible color.

// Rich-photo roles ONLY. These keep the image at full strength and get an
// assertive scrim + forced LIGHT text (the editorial "darkened photo" look).
//
// texture / background are deliberately NOT in this set: the auto-placement
// fades those images to a ~0.18 wash (see page.tsx imageRoleOpacity), so the
// theme's normal dark-on-light text reads on top with no scrim. Painting a
// scrim there would darken a card that's already legible. (—
// the previous pass scrimmed all four roles AND used a theme-tinted veil,
// which produced a white veil + dark text over a mid-tone duotone photo —
// illegible. This split is the fix.)
type ScrimRole = 'full-bleed' | 'duotone';
const SCRIM_ROLES: ReadonlySet<string> = new Set<ScrimRole>([
  'full-bleed', 'duotone',
]);

type SlideDesign = NonNullable<Card['slideDesign']>;

/** Scrim peak alpha per rich-photo role. Assertive (0.55–0.68): the photo's
 *  lower-third / side is darkened enough that near-white text clears WCAG AA,
 *  while the far edge stays light so the photo still breathes. The veil is
 *  ALWAYS dark (slate-950) and the text ALWAYS light for these roles —
 *  independent of theme — because we can't sample the photo and a rich photo
 *  is most reliably tamed by a dark veil + light type. */
const SCRIM_PRESET: Record<ScrimRole, { alpha: number }> = {
  'full-bleed': { alpha: 0.68 },
  'duotone':    { alpha: 0.60 },
};

/** Map the recipe's text-safe zone to a CSS gradient direction + the band the
 *  veil concentrates in. Returns a `linear-gradient(...)` string for the scrim
 *  layer: opaque-ish toward the safe zone, transparent away from it. */
function scrimGradient(
  zone: SlideDesign['textSafeZone'],
  overlayRgb: string,
  alpha: number,
): string {
  // overlayRgb is e.g. '15,23,42' (dark) or '255,255,255' (light) — composited
  // peak alpha in the safe band, fading to ~12% of peak at the far edge so the
  // image still breathes.
  const peak = `rgba(${overlayRgb},${alpha})`;
  const tail = `rgba(${overlayRgb},${(alpha * 0.12).toFixed(3)})`;
  const mid = `rgba(${overlayRgb},${(alpha * 0.55).toFixed(3)})`;
  switch (zone) {
    case 'lower-third':
      return `linear-gradient(to top, ${peak} 0%, ${mid} 28%, ${tail} 60%, ${tail} 100%)`;
    case 'left':
      return `linear-gradient(to right, ${peak} 0%, ${mid} 42%, ${tail} 70%, ${tail} 100%)`;
    case 'right':
      return `linear-gradient(to left, ${peak} 0%, ${mid} 42%, ${tail} 70%, ${tail} 100%)`;
    case 'corner':
      return `linear-gradient(to top left, ${peak} 0%, ${mid} 35%, ${tail} 65%, ${tail} 100%)`;
    case 'center':
      return `radial-gradient(ellipse at center, ${peak} 0%, ${mid} 45%, ${tail} 80%)`;
    case 'full':
    case 'none':
    default:
      // Even veil across the whole card — full-bleed text that isn't pinned to
      // a corner still needs a guaranteed background.
      return `linear-gradient(to bottom, ${mid} 0%, ${peak} 100%)`;
  }
}

interface ScrimContext {
  /** True when an image sits behind the text and a scrim is painted. */
  scrimActive: boolean;
  /** CSS gradient for the scrim layer (only when scrimActive). */
  scrimGradientCss?: string;
  /** z to paint the scrim at — just above the lowest image, below text. */
  scrimZ?: number;
  /** Solid hex of the scrim's PEAK tone (image + veil composited) — text color
   *  over the scrim is chosen against THIS. */
  scrimSolidHex?: string;
  /** Solid hex approximating the theme region behind beside-image / no-image
   *  text. Used for adaptive color when no scrim is active. */
  regionBgHex: string;
  /** True when the FINAL imageRole is `texture` / `background` — a behind-text
   *  wash where the photo must render FAINT (~0.18) so the theme's normal dark
   *  text reads on top (no scrim). Computed at RENDER time from the resolved
   *  role, so it's correct even when auto-placement used a different provisional
   *  role at streaming time (the persisted block.opacity may be missing). The
   *  image render opacity is derived from this, NOT from block.opacity, for
   * these roles. (— fixes texture slides rendering at full
   *  strength.) */
  behindTextWash: boolean;
  /** Preferred theme colors — kept when they already clear AA. */
  themeBodyHex?: string;
  themeTitleHex?: string;
}

interface FreeformLayerProps {
  blocks: FreeformBlock[];
  onChange: (next: FreeformBlock[]) => void;
  /** Bracket a continuous pointer gesture (move / resize / rotate) so the
   *  parent's undo history coalesces the whole drag into ONE entry instead of
   *  one per frame. onGestureStart fires on pointer-down of a drag/resize/
   *  rotate; onGestureEnd fires on release. Optional — no-ops in static/preview
   *  contexts that don't track history. */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  /** Canva-model font field: the floating toolbar's font button calls this to
   *  open the Text/Font side panel instead of showing an inline dropdown. */
  onOpenFontPanel?: () => void;
  /** True when the Text/Font panel is open — lights the font field active. */
  fontPanelOpen?: boolean;
  /** Pixel size of the card surface. Required for px ↔ % drag math. */
  cardWidth: number;
  cardHeight: number;
  /** Design Intelligence Layer signal for this card (recipe / imageRole /
   *  text-safe zone). When present and the role is a behind-text role, a scrim
   *  is painted and text color is resolved against it. Absent → no scrim,
   *  today's behavior. */
  slideDesign?: Card['slideDesign'];
  /** Solid-hex approximation of the card surface tone behind the text region
   *  (theme cardBg / pageBg). Drives adaptive text color for beside-image and
   *  no-image text. Defaults to white. */
  regionBgHex?: string;
  /** Theme body / title color so adaptive color can KEEP the designed color
   *  when it already clears AA. */
  themeBodyHex?: string;
  themeTitleHex?: string;
  /** Visually disables drag/select while the card is not the active card. */
  interactive: boolean;
  /** Fires when the layer's selection toggles between empty and non-empty.
   *  Parent uses this to hide the card-level toolbar so the user only sees
   *  one set of controls (the inline block toolbar). */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** Fires with the full set of currently-selected block ids whenever the
   *  selection changes, so the parent's side-panel Font dropdown can target the
   *  selected text block(s) instead of rewriting the deck-wide theme. */
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Fires when the user clicks an EMPTY image placeholder block (a
   *  FreeformImageBlock with no `src`). Parent should open the Media side
   *  panel and bind this block as the fill target so Upload / Generate
   *  populate THIS block's src rather than appending a new one. */
  onImagePlaceholderClick?: (blockId: string) => void;
  /** Fires when the user double-clicks a chart block or picks "Edit chart
   *  data" from its right-click menu. Parent opens the ChartDataGrid modal
   *  bound to this block's id so the user can edit categories / series /
   *  chartType / numberFormat. */
  onEditChart?: (blockId: string) => void;
  /** Scrollable container the editor scrolls inside. The inline toolbar is
   *  portaled to <body> to escape the card's `overflow: hidden`, so it needs
   *  a scroll target to reposition itself on scroll. Defaults to window. */
  scrollContainer?: HTMLElement | null;
  /** Static render mode — skips the auto-layout measurement pass (which uses
   *  getBoundingClientRect and would mis-measure under a parent transform:scale)
   *  and never mutates. Used by thumbnails: they render this same component
   *  scaled down so they're pixel-faithful to the canvas. interactive must also
   *  be false. */
  staticRender?: boolean;
  /** Every slide in the deck (id/index/title) — powers the link editor's Slide
   *  picker and the "slide N" hover label. */
  deckSlides?: DeckSlideRef[];
  /** This card's id — excluded from the Slide picker (no self-link). */
  currentSlideId?: string;
  /** Jump the editor to another slide (a slide-link was activated). */
  onNavigateToSlide?: (slideId: string) => void;
}

export function FreeformLayer({
  blocks, onChange, onGestureStart, onGestureEnd, onOpenFontPanel, fontPanelOpen, cardWidth, cardHeight, interactive, onSelectionChange, onSelectedIdsChange, onImagePlaceholderClick, onEditChart, scrollContainer,
  slideDesign, regionBgHex, themeBodyHex, themeTitleHex, staticRender = false,
  deckSlides, currentSlideId, onNavigateToSlide,
}: FreeformLayerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);
  // Crop mode (Canva model). `cropId` is the image block being cropped: the
  // block renders object-fit:cover (fills the frame), the 8 handles reshape the
  // frame (cropping), and dragging the image body pans (panX/panY). cropSnapshot
  // holds the block's pre-crop geometry/fit/pan so Esc can revert cleanly.
  const [cropId, setCropId] = useState<string | null>(null);
  const cropSnapshotRef = useRef<Partial<FreeformImageBlock> | null>(null);
  // Live pan gesture inside crop mode (object-position drag).
  const panRef = useRef<{
    id: string;
    pointerStartX: number; pointerStartY: number;
    startPanX: number; startPanY: number;
  } | null>(null);

  /** Commit the crop (the block is already mutated live) and exit crop mode.
   *  Defined early because handleBlockPointerDown (below) references it. */
  const applyCrop = useCallback(() => {
    cropSnapshotRef.current = null;
    setCropId(null);
  }, []);
  // Right-click context menu state. Coordinates are viewport-relative
  // because the menu is rendered in a fixed-position layer. blockId
  // is the block that was right-clicked — actions in the menu operate
  // on this block (NOT necessarily the current selection — right-click
  // a non-selected block and the menu still targets THAT block).
  const [contextMenu, setContextMenu] = useState<{
    // null = right-click on EMPTY card area → a Paste-only menu.
    blockId: string | null;
    x: number;
    y: number;
  } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // Drag state is held in a ref + a small mirror state so the cursor and the
  // block move at the same frame without a stale-closure problem. The ref is
  // the source of truth during pointermove; the state flip drives re-renders
  // for the snap-guide overlay.
  const dragRef = useRef<{
    id: string;
    pointerStartX: number; pointerStartY: number;
    blockStartX: number; blockStartY: number;
    width: number; height: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Resize uses the same drag-pattern: ref for live math, state for re-render.
  // Aspect lock is fixed at start; pressing/releasing shift mid-drag does NOT
  // change the constraint — too jarring. Image blocks lock by default, all
  // others unlocked unless the user grabbed with shift held.
  const resizeRef = useRef<{
    id: string;
    handle: ResizeHandle;
    pointerStartX: number; pointerStartY: number;
    blockStart: { x: number; y: number; w: number; h: number };
    aspectLock: boolean;
  } | null>(null);

  const rotationRef = useRef<{
    id: string;
    blockCenterX: number; blockCenterY: number;
    startPointerAngle: number;
    startBlockRotation: number;
  } | null>(null);

  // Track which block is being edited inline (contentEditable on text blocks).
  // While editing, the block ignores drag gestures so typing/selection works.
  const [editingId, setEditingId] = useState<string | null>(null);

  // The live contentEditable node of the text block currently being edited —
  // registered by TextContent on entry, cleared on exit. Range-format actions
  // (toolbar + Ctrl/Cmd+B/I/U) read the DOM selection off this node.
  const activeEditableRef = useRef<HTMLDivElement | null>(null);
  // Marks uniformly active across the current text selection (null when there's
  // no non-empty selection). Drives the text toolbar's lit state so Bold/Italic/
  // etc. reflect the highlighted range, not the whole box.
  const [editSelMarks, setEditSelMarks] = useState<TextRunMarks | null>(null);

  // The open link-editor session (LinkEditor popover), or null. Holds the
  // snapshot of the selection to link so the editor's input can take focus
  // without losing the target. A ref mirrors it for the apply/cancel callbacks.
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const linkDraftRef = useRef<LinkDraft | null>(null);
  linkDraftRef.current = linkDraft;

  // Hover-over-a-link bubble (Open / Copy / Edit / Remove). Tracks the hovered
  // rendered <a> (by block + run index); a short grace timer lets the pointer
  // travel from the link into the bubble without it closing.
  const [linkHover, setLinkHover] = useState<{ blockId: string; runIndex: number; target: LinkTarget; rect: DOMRect } | null>(null);
  // Resolve a slide-link target's value (a card id) to a "slide N" label.
  const slideLabelFor = useCallback((slideId: string): string => {
    const s = deckSlides?.find((d) => d.id === slideId);
    return s ? `slide ${s.index + 1}` : 'slide';
  }, [deckSlides]);
  const hideBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHideBubble = useCallback(() => {
    if (hideBubbleTimer.current) { clearTimeout(hideBubbleTimer.current); hideBubbleTimer.current = null; }
  }, []);
  const scheduleHideBubble = useCallback(() => {
    cancelHideBubble();
    hideBubbleTimer.current = setTimeout(() => setLinkHover(null), 160);
  }, [cancelHideBubble]);

  // Notify parent whenever the layer's selection transitions between empty
  // and non-empty. CardEditor uses this to suppress the card-level toolbar
  // so the user sees ONE set of controls (the block's inline toolbar).
  const prevHasSelectionRef = useRef(false);
  const prevSelectedKeyRef = useRef('');
  useEffect(() => {
    const has = selectedIds.size > 0;
    if (has !== prevHasSelectionRef.current) {
      prevHasSelectionRef.current = has;
      onSelectionChange?.(has);
    }
    // Only emit when the selected SET actually changes — firing on every render
    // (with a fresh array) loops with the parent's setState (Max update depth).
    const key = Array.from(selectedIds).sort().join(',');
    if (key !== prevSelectedKeyRef.current) {
      prevSelectedKeyRef.current = key;
      onSelectedIdsChange?.(Array.from(selectedIds));
    }
  }, [selectedIds, onSelectionChange, onSelectedIdsChange]);

  // ── Auto-layout pass ──────────────────────────────────────────────────────
  // Runs synchronously after layout commit, before paint, so the user never
  // sees the intermediate "natural height, may overlap" state. For any block
  // marked __autoLayout (set by the structured→freeform converter), measures
  // its actual painted height and adjusts position to clear overlaps with
  // siblings.
  //
  // Belt-and-suspenders against the infinite-loop bug seen 2026-05-21:
  // the original guard relied solely on clearing the __autoLayout flag after
  // processing. But the parent's onCardsChange → setTemplate → stream-sync
  // round-trip occasionally reintroduced blocks that still LOOKED auto (or
  // a new array reference where flag-clearing got blown away). Track
  // processed block IDs in a ref so each block is auto-laid-out at most
  // ONCE per layer-mount, regardless of how the parent ping-pongs state.
  const autoLayoutDoneRef = useRef<Set<string>>(new Set());
  // Gate the measure pass on web-font readiness. The themes load Google Fonts
  // async; if we measure text height before the real font is laid out we read
  // the FALLBACK font's metrics, mark the block done, and then the web font
  // swaps in (usually taller) — leaving the baked box too short forever, which
  // is the overlap + cut-off keeps seeing. Wait for document.fonts.ready
  // (resolves immediately if already loaded or the API is absent), then run.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const ready = (typeof document !== 'undefined' && document.fonts?.ready) || null;
    if (!ready) { setFontsReady(true); return; }
    ready.then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, []);
  useLayoutEffect(() => {
    if (staticRender) return; // thumbnails: blocks are already laid out; measuring under transform:scale would corrupt positions
    if (!fontsReady) return;  // measure only once the real web font is laid out (avoids fallback-font mismeasure → permanent overlap/cut-off)
    const layer = layerRef.current;
    if (!layer) return;
    // Bail BEFORE marking anything done if the layer hasn't sized yet —
    // otherwise we poison the ref with blocks that never actually got
    // measured, and they're permanently skipped on subsequent runs (the
    // bug saw 2026-05-21: text overflowing on hero slides after the
    // streaming→final render swap).
    const layerRect = layer.getBoundingClientRect();
    const cardH = layerRect.height;
    if (cardH < 10) return; // layer not yet sized; wait for next paint

    const autoBlocks = blocks.filter(
      (b) => b.__autoLayout && !autoLayoutDoneRef.current.has(b.id),
    );
    if (autoBlocks.length === 0) return;
    // Mark them done BEFORE processing — even if processing errors out, we
    // never re-attempt the same block (avoids loop on partial failure).
    for (const b of autoBlocks) autoLayoutDoneRef.current.add(b.id);

    // Measure each rendered block's natural height in % of card height.
    const measured = new Map<string, number>();
    const blockEls = layer.querySelectorAll('[data-freeform-block]');
    for (const el of Array.from(blockEls)) {
      const id = (el as HTMLElement).dataset.freeformBlock;
      if (!id) continue;
      const heightPx = (el as HTMLElement).getBoundingClientRect().height;
      measured.set(id, (heightPx / cardH) * 100);
    }

    // Walk blocks in top-down order. For each one with __autoLayout, lock in
    // the measured height + push it down ONLY if a horizontally-overlapping
    // block above it would otherwise overlap. A simple "stack everything
    // top-down" approach broke grids — three cells at the same y but
    // different x got stacked because they shared a cursor. We now track
    // each placed block's x-range so blocks side-by-side don't push each
    // other down.
    const minGap = 2;            // % between vertically-adjacent blocks
    const cardTopMargin = 5;     // % below the top edge for safety
    const cardBottomLimit = 95;  // % — text must not extend past this (5% bottom safe edge)
    const sorted = [...blocks].sort((a, b) => a.y - b.y);
    const adjustments = new Map<string, { y: number; h: number; fontSize?: number }>();
    interface Placed { left: number; right: number; bottom: number }
    const placed: Placed[] = [];
    for (const b of sorted) {
      const naturalH = measured.get(b.id) ?? b.h;
      const left = b.x;
      const right = b.x + b.w;
      // Find the lowest bottom among already-placed blocks that share any
      // horizontal range with this one.
      let obstacleBottom = cardTopMargin;
      for (const p of placed) {
        if (right > p.left && left < p.right) {
          obstacleBottom = Math.max(obstacleBottom, p.bottom + minGap);
        }
      }
      if (b.__autoLayout) {
        const adjustedY = Math.max(b.y, obstacleBottom);
        // +1.5% buffer on the measured height — getBoundingClientRect
        // rounds down sub-pixel values; without the buffer, the wrapper
        // ends up just barely tighter than the rendered text, especially
        // on serif themes where the final line's descenders nudge over.
        let adjustedH = Math.max(b.h, naturalH + 1.5);
        let fontSize: number | undefined;
        // Overflow guard + autofit-down: if the measured text would extend past
        // the card's bottom safe edge, shrink the font so it fits the space left
        // rather than bleeding off the slide (the cut-off flagged). Text
        // height is ~linear in font size at a fixed width, so scale by the
        // height ratio — floored at 60% / 11px so we never shrink into
        // illegibility. Anything that STILL won't fit is one slide's worth too
        // much content (a generation problem, not a layout one); overflow:visible
        // then spills a hair instead of slicing a line. Text blocks only.
        const available = cardBottomLimit - adjustedY;
        if (b.type === 'text' && adjustedH > available && available >= 6) {
          const curFs = (b as FreeformTextBlock).style?.fontSize;
          if (typeof curFs === 'number' && curFs > 0) {
            const scale = Math.max(0.6, available / adjustedH);
            const nextFs = Math.max(11, Math.round(curFs * scale));
            if (nextFs < curFs) { fontSize = nextFs; adjustedH = available; }
          }
        }
        adjustments.set(b.id, { y: adjustedY, h: adjustedH, fontSize });
        placed.push({ left, right, bottom: adjustedY + adjustedH });
      } else {
        // User block — locks position; still becomes an obstacle for any
        // auto block placed afterwards in the same column.
        placed.push({ left, right, bottom: b.y + b.h });
      }
    }

    // Apply only if something changed (avoids re-render loop). Each updated
    // block gets __autoLayout cleared so the effect short-circuits next pass.
    let changed = false;
    const updated = blocks.map((b) => {
      const adj = adjustments.get(b.id);
      if (!adj) return b;
      const dy = Math.abs(adj.y - b.y);
      const dh = Math.abs(adj.h - b.h);
      if (dy < 0.1 && dh < 0.1 && adj.fontSize === undefined && !b.__autoLayout) return b;
      changed = true;
      const { __autoLayout, ...rest } = b;
      void __autoLayout;
      const next = { ...rest, y: adj.y, h: adj.h } as FreeformBlock;
      // Bake the autofit-down font size (overflow guard) into the block style.
      if (adj.fontSize !== undefined && next.type === 'text') {
        const t = next as FreeformTextBlock;
        t.style = { ...t.style, fontSize: adj.fontSize };
      }
      return next;
    });
    if (changed) onChange(updated);
    // Falls through if no changes — the flag will still be cleared on the
    // next pass when blocks reference updates.
  }, [blocks, onChange, fontsReady]);

  // Keyboard: delete + arrow-key nudge + escape + z-order + duplicate.
  //, Cmd/Ctrl + D
  // for duplicate, Shift + arrow nudge bumped from 5% to 10% for big moves.
  useEffect(() => {
    // Attached whenever this layer is active (not gated on a selection) so
    // Cmd/Ctrl+A can select-all from nothing. The selection-requiring shortcuts
    // below early-return when the selection is empty.
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys from text inputs / contentEditable. Also bail when
      // a freeform text block is in inline-edit mode — its own contentEditable
      // owns the keystrokes.
      if (editingId) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;

      // Platform mod key — Cmd on Mac, Ctrl elsewhere.
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+A — select every (unlocked) block on this card. Works from an
      // empty selection; overrides the browser's text select-all on the canvas.
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setSelectedIds(new Set(blocks.filter((b) => !b.locked).map((b) => b.id)));
        return;
      }

      // The remaining shortcuts operate on the current selection.
      if (selectedIds.size === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChange(blocks.filter((b) => !selectedIds.has(b.id)));
        setSelectedIds(new Set());
        return;
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        return;
      }
      // Cmd/Ctrl + C — copy every selected block to sessionStorage. We
      // intentionally don't write to the system clipboard (navigator.clipboard
      // is async + would require a permissions prompt on some setups).
      // sessionStorage scopes the clipboard to the editor tab, which is the
      // 95% case for slide-block copy/paste.
      if (mod && (e.key === 'c' || e.key === 'C')) {
        const selected = blocks.filter((b) => selectedIds.has(b.id));
        if (selected.length === 0) return;
        e.preventDefault();
        try {
          sessionStorage.setItem('compose-freeform-clipboard', JSON.stringify(selected));
        } catch {
          /* sessionStorage can throw in private mode; silently no-op */
        }
        // Copy-image-out: a single selected image also goes to the OS clipboard
        // so it can be pasted into other apps (best-effort).
        if (selected.length === 1 && selected[0].type === 'image' && selected[0].src) {
          void imageSrcToOSClipboard(selected[0].src);
        }
        return;
      }
      // Cmd/Ctrl + X — cut = copy + delete.
      if (mod && (e.key === 'x' || e.key === 'X')) {
        const selected = blocks.filter((b) => selectedIds.has(b.id));
        if (selected.length === 0) return;
        e.preventDefault();
        try {
          sessionStorage.setItem('compose-freeform-clipboard', JSON.stringify(selected));
        } catch {
          /* sessionStorage can throw in private mode; silently no-op */
        }
        if (selected.length === 1 && selected[0].type === 'image' && selected[0].src) {
          void imageSrcToOSClipboard(selected[0].src);
        }
        onChange(blocks.filter((b) => !selectedIds.has(b.id)));
        setSelectedIds(new Set());
        return;
      }
      // Cmd/Ctrl + D — duplicate every selected block. Each duplicate
      // lands on top of the z-order with a 3% cascade so they don't
      // hide behind the original.
      if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const ids = Array.from(selectedIds);
        // Apply duplicates sequentially so each one sees the prior
        // duplicates in blocks state (avoids id collisions).
        let nextBlocks = blocks;
        const newIds: string[] = [];
        for (const id of ids) {
          const src = nextBlocks.find((b) => b.id === id);
          if (!src) continue;
          const maxZ = nextBlocks.reduce((m, b) => Math.max(m, b.z), 0);
          const copy: FreeformBlock = {
            ...src,
            id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            x: clamp(src.x + 3, 0, 100 - src.w),
            y: clamp(src.y + 3, 0, 100 - src.h),
            z: maxZ + 1,
          };
          newIds.push(copy.id);
          nextBlocks = [...nextBlocks, copy];
        }
        onChange(nextBlocks);
        // Select the duplicates so the next keystroke acts on them.
        if (newIds.length > 0) setSelectedIds(new Set(newIds));
        return;
      }
      // Cmd/Ctrl + ] — bring forward; Cmd/Ctrl + [ — send backward.
      // Operates on each selected block independently. Walks selected
      // blocks in z-order so adjacent siblings don't fight each other.
      if (mod && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const dir: 1 | -1 = e.key === ']' ? 1 : -1;
        // Process selected blocks in z-order so each adjustZ sees the
        // accumulated result. For dir=+1 (forward), iterate top-down so
        // the topmost selected moves first; for dir=-1, iterate bottom-up.
        const selectedBlocks = blocks.filter((b) => selectedIds.has(b.id));
        const ordered = [...selectedBlocks].sort(
          (a, b) => (dir === 1 ? b.z - a.z : a.z - b.z),
        );
        // Inline z-swap (mirrors adjustZ but works on a fresh list each
        // iteration so chained shifts are correct).
        let working = blocks;
        for (const target of ordered) {
          const sorted = [...working].sort((a, b) => a.z - b.z);
          const idx = sorted.findIndex((b) => b.id === target.id);
          if (idx === -1) continue;
          const neighborIdx = idx + dir;
          if (neighborIdx < 0 || neighborIdx >= sorted.length) continue;
          const me = sorted[idx];
          const neighbor = sorted[neighborIdx];
          working = working.map((b) => {
            if (b.id === me.id) return { ...b, z: neighbor.z };
            if (b.id === neighbor.id) return { ...b, z: me.z };
            return b;
          });
        }
        onChange(working);
        return;
      }
      // Arrow-key nudge — 1% default, 10% with Shift (bumped from 5%
      //).
      const nudge = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -nudge;
      if (e.key === 'ArrowRight') dx = nudge;
      if (e.key === 'ArrowUp') dy = -nudge;
      if (e.key === 'ArrowDown') dy = nudge;
      if (dx === 0 && dy === 0) return;
      e.preventDefault();
      onChange(blocks.map((b) => {
        if (!selectedIds.has(b.id)) return b;
        return {
          ...b,
          x: clamp(b.x + dx, 0, 100 - b.w),
          y: clamp(b.y + dy, 0, 100 - b.h),
        };
      }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, selectedIds, blocks, onChange, editingId]);

  // Paste (image + blocks) is handled by a `paste` ClipboardEvent listener
  // defined further down (alongside the clipboard callbacks) — a keydown can't
  // reach clipboardData, which is how an OS-clipboard image arrives.

  // Track a potential "click without drag" on an empty image placeholder.
  // Set on pointerdown for empty image blocks, cleared if the pointer moves
  // more than a small threshold (then it's a drag), fired as a callback on
  // pointerup if still set. The parent uses this to open the Media panel
  // bound to fill THIS block.
  const placeholderClickRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const handleBlockPointerDown = useCallback((e: React.PointerEvent, block: FreeformBlock) => {
    if (!interactive) return;
    // Skip drag-start when the block is in inline-edit mode — pointer events
    // belong to contentEditable so the user can place caret / select text.
    if (editingId === block.id) return;
    // Interacting with a DIFFERENT block applies the in-progress crop first.
    if (cropId && cropId !== block.id) applyCrop();
    e.stopPropagation();
    e.preventDefault();
    setSelectedIds((prev) => {
      if (e.shiftKey) {
        const next = new Set(prev);
        if (next.has(block.id)) next.delete(block.id);
        else next.add(block.id);
        return next;
      }
      return new Set([block.id]);
    });
    if (block.locked) return;
    // Crop mode: dragging the image BODY pans it (object-position) inside the
    // frame instead of moving the block. The 8 handles still reshape the frame.
    if (cropId === block.id && block.type === 'image') {
      onGestureStart?.(); // coalesce the pan into one undo entry
      panRef.current = {
        id: block.id,
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
        startPanX: block.panX ?? 50,
        startPanY: block.panY ?? 50,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    // Arm the placeholder-click detector for empty image blocks. Drag still
    // works in parallel — if the user moves more than ~4 px, the click is
    // cancelled and the drag proceeds normally.
    if (block.type === 'image' && !block.src) {
      placeholderClickRef.current = { id: block.id, x: e.clientX, y: e.clientY };
    }
    onGestureStart?.(); // coalesce the move drag (a no-move click commits nothing)
    dragRef.current = {
      id: block.id,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      blockStartX: block.x,
      blockStartY: block.y,
      width: block.w,
      height: block.h,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, [interactive, editingId, onGestureStart, cropId, applyCrop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Rotation takes precedence over resize, which takes precedence over drag,
    // because the user can only be doing one of the three at a time.
    const rot = rotationRef.current;
    if (rot) {
      const a = angleFromCenter(rot.blockCenterX, rot.blockCenterY, e.clientX, e.clientY);
      let next = rot.startBlockRotation + (a - rot.startPointerAngle);
      if (e.shiftKey) next = Math.round(next / 15) * 15;
      // Normalize to [-180, 180].
      next = ((next + 540) % 360) - 180;
      onChange(blocks.map((b) => (b.id === rot.id ? { ...b, rotation: next } : b)));
      return;
    }

    // px→% conversions below must use the card's ON-SCREEN size. The canvas is
    // CSS-zoomed (and in graphics mode freely zoomed/panned), so the rendered
    // card is 960×540 × zoomScale — not the logical 960×540. Dividing pointer
    // deltas by the fixed logical size made resize/drag drift by the zoom factor
    // (very visible once the graphics infinite-canvas allowed large zoom). The
    // layer fills the card (inset:0), so its rendered rect IS the on-screen size.
    const layerRect = layerRef.current?.getBoundingClientRect();
    const cw = layerRect && layerRect.width > 0 ? layerRect.width : cardWidth;
    const ch = layerRect && layerRect.height > 0 ? layerRect.height : cardHeight;

    const resize = resizeRef.current;
    if (resize) {
      const dxPercent = ((e.clientX - resize.pointerStartX) / cw) * 100;
      const dyPercent = ((e.clientY - resize.pointerStartY) / ch) * 100;
      // Shift toggles aspect lock during the gesture for non-image blocks.
      const aspect = resize.aspectLock !== e.shiftKey;
      const next = computeResize(resize.handle, resize.blockStart, dxPercent, dyPercent, aspect);
      onChange(blocks.map((b) => (b.id === resize.id ? { ...b, ...next } : b)));
      return;
    }

    // Crop pan: move the image (object-position) under the fixed frame. Drag
    // right → reveal content to the left (panX decreases) so the image tracks
    // the cursor. The pixel→% map uses the block's screen size; clamp 0–100
    // (cover guarantees the frame stays filled across the whole range).
    const pan = panRef.current;
    if (pan) {
      const blockEl = layerRef.current?.querySelector(`[data-freeform-block="${pan.id}"]`) as HTMLElement | null;
      const bw = blockEl?.getBoundingClientRect().width || cw;
      const bh = blockEl?.getBoundingClientRect().height || ch;
      const dPanX = ((e.clientX - pan.pointerStartX) / bw) * 100;
      const dPanY = ((e.clientY - pan.pointerStartY) / bh) * 100;
      const panX = Math.max(0, Math.min(100, pan.startPanX - dPanX));
      const panY = Math.max(0, Math.min(100, pan.startPanY - dPanY));
      onChange(blocks.map((b) => (b.id === pan.id ? { ...b, panX, panY } : b)));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;

    const dxPx = e.clientX - drag.pointerStartX;
    const dyPx = e.clientY - drag.pointerStartY;
    // Cancel the placeholder-click intent once the pointer moves enough to
    // be a drag rather than a tap. 4 px matches the typical desktop click
    // tolerance so the user can still get a click-to-open from a slightly
    // jittery finger.
    if (
      placeholderClickRef.current
      && (Math.abs(dxPx) > 4 || Math.abs(dyPx) > 4)
    ) {
      placeholderClickRef.current = null;
    }
    const dxPercent = (dxPx / cw) * 100;
    const dyPercent = (dyPx / ch) * 100;

    let newX = clamp(drag.blockStartX + dxPercent, 0, 100 - drag.width);
    let newY = clamp(drag.blockStartY + dyPercent, 0, 100 - drag.height);

    // Snap math — convert engage/release thresholds to %.
    const engageX = (SNAP_ENGAGE_PX / cw) * 100;
    const engageY = (SNAP_ENGAGE_PX / ch) * 100;

    // Build the snap target lists. Card snaps + every OTHER block's edges/center.
    const otherBlocksX: number[] = [];
    const otherBlocksY: number[] = [];
    for (const b of blocks) {
      if (b.id === drag.id) continue;
      otherBlocksX.push(b.x, b.x + b.w / 2, b.x + b.w);
      otherBlocksY.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    const targetsX = [...CARD_SNAP_X, ...otherBlocksX];
    const targetsY = [...CARD_SNAP_Y, ...otherBlocksY];

    const guides: SnapGuide[] = [];
    const blockCenterX = newX + drag.width / 2;
    const blockRight = newX + drag.width;
    const blockCenterY = newY + drag.height / 2;
    const blockBottom = newY + drag.height;

    // X-axis: try each candidate (center, left edge, right edge) against each target.
    for (const t of targetsX) {
      if (Math.abs(blockCenterX - t) < engageX) {
        newX = clamp(t - drag.width / 2, 0, 100 - drag.width);
        guides.push({ axis: 'x', at: t, label: cardLabelX(t) });
        break;
      }
      if (Math.abs(newX - t) < engageX) {
        newX = clamp(t, 0, 100 - drag.width);
        guides.push({ axis: 'x', at: t, label: cardLabelX(t) });
        break;
      }
      if (Math.abs(blockRight - t) < engageX) {
        newX = clamp(t - drag.width, 0, 100 - drag.width);
        guides.push({ axis: 'x', at: t, label: cardLabelX(t) });
        break;
      }
    }
    for (const t of targetsY) {
      if (Math.abs(blockCenterY - t) < engageY) {
        newY = clamp(t - drag.height / 2, 0, 100 - drag.height);
        guides.push({ axis: 'y', at: t, label: cardLabelY(t) });
        break;
      }
      if (Math.abs(newY - t) < engageY) {
        newY = clamp(t, 0, 100 - drag.height);
        guides.push({ axis: 'y', at: t, label: cardLabelY(t) });
        break;
      }
      if (Math.abs(blockBottom - t) < engageY) {
        newY = clamp(t - drag.height, 0, 100 - drag.height);
        guides.push({ axis: 'y', at: t, label: cardLabelY(t) });
        break;
      }
    }

    setActiveGuides(guides);
    onChange(blocks.map((b) => (b.id === drag.id ? { ...b, x: newX, y: newY } : b)));
  }, [blocks, cardWidth, cardHeight, onChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current && !resizeRef.current && !rotationRef.current && !panRef.current) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // Empty-image-placeholder click: if the pointer never moved enough to
    // promote into a drag, fire the parent's open-Media callback so the
    // panel binds to this block as the fill target.
    if (placeholderClickRef.current) {
      const id = placeholderClickRef.current.id;
      placeholderClickRef.current = null;
      onImagePlaceholderClick?.(id);
    }
    dragRef.current = null;
    resizeRef.current = null;
    rotationRef.current = null;
    panRef.current = null;
    setIsDragging(false);
    onGestureEnd?.(); // commit the coalesced drag/resize/rotate/pan as one undo entry
    window.setTimeout(() => setActiveGuides([]), 200);
  }, [onImagePlaceholderClick, onGestureEnd]);

  const handleResizeStart = useCallback((e: React.PointerEvent, block: FreeformBlock, handle: ResizeHandle) => {
    if (!interactive || block.locked) return;
    e.stopPropagation();
    e.preventDefault();
    // Resize default depends on the block:
    //  • STANDALONE (whole-image / contain) images resize ASPECT-LOCKED so the
    // frame always hugs the image — no letterbox/pillarbox (
    //    "display whole image should be default… dynamically adjusted to the box
    //    size"). With the onLoad auto-hug giving the block the image's pixel
    //    aspect, locking w%/h% on every handle keeps that aspect → the whole
    //    image fills the box at all sizes. To reshape into a different box, use
    //    the Crop tool (that's what cover/crop framing is for).
    //  • EVERYTHING ELSE (text, shapes, and COVER/region/full-bleed images whose
    //    box IS a crop frame) resizes FREEFORM — a rectangle can be dragged into
    //    a square; object-fit:cover keeps cover images from distorting.
    // Shift inverts per-gesture (line ~673: aspect = defaultLock !== shiftKey) —
    // so Shift = freeform for standalone images, lock for everything else.
    // (Supersedes the 2026-06-15 fix #9 "all images freeform": that left
    // standalone images letterboxing when the box drifted off the image aspect.)
    const isWholeImage = block.type === 'image' && (block.fit ?? 'cover') !== 'cover';
    const defaultLock = isWholeImage;
    onGestureStart?.(); // coalesce the whole resize drag into one undo entry
    resizeRef.current = {
      id: block.id,
      handle,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      blockStart: { x: block.x, y: block.y, w: block.w, h: block.h },
      aspectLock: defaultLock,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [interactive, onGestureStart]);

  const handleRotationStart = useCallback((e: React.PointerEvent, block: FreeformBlock, blockEl: HTMLElement) => {
    if (!interactive || block.locked) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = blockEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    onGestureStart?.(); // coalesce the whole rotation drag into one undo entry
    rotationRef.current = {
      id: block.id,
      blockCenterX: cx,
      blockCenterY: cy,
      startPointerAngle: angleFromCenter(cx, cy, e.clientX, e.clientY),
      startBlockRotation: block.rotation,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [interactive, onGestureStart]);

  /** The table cell the cursor last entered (row/col) — the table toolbar's row/column
   *  insert/delete act relative to it. */
  const activeTableCellRef = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  /** The current rectangular cell selection (top-left → bottom-right) — drives merge/split. */
  const tableSelRef = useRef<TblRange | null>(null);

  /** Patch the block at `id` with `delta` and emit. Used by the inline toolbar. */
  const updateBlock = useCallback((id: string, delta: Partial<FreeformBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...delta } as FreeformBlock) : b)));
  }, [blocks, onChange]);

  /** Word-style grow/shrink: step every SELECTED text block's font size up/down
   *  the ladder, relative to each block's own current size (so a multi-select
   *  keeps its relative sizes). One undo entry per click. */
  const bumpFontSizeForSelection = useCallback((dir: 1 | -1) => {
    if (selectedIds.size === 0) return;
    let changed = false;
    onGestureStart?.();
    const next = blocks.map((b) => {
      if (!selectedIds.has(b.id) || b.type !== 'text') return b;
      const cur = effectiveTextSize(b);
      const np = bumpSize(cur, dir);
      if (np === cur) return b;
      changed = true;
      return { ...b, style: { ...(b.style ?? {}), fontSize: np } };
    });
    if (changed) onChange(next);
    onGestureEnd?.();
  }, [blocks, selectedIds, onChange, onGestureStart, onGestureEnd]);

  // Whole-box active state for a boolean mark — reads per-run uniformity when
  // the box has runs, else the legacy block.style flags.
  const wholeBoxActive = useCallback((block: FreeformTextBlock, key: MarkKey): boolean => {
    if (block.runs && block.runs.length) return isMarkUniformAll(block.runs, key);
    switch (key) {
      case 'bold': return isTextBold(block);
      case 'italic': return !!block.style?.italic;
      case 'underline': return !!block.style?.underline;
      default: return false;
    }
  }, []);

  /** The single entry point for character formatting on a text block. Chooses
   *  scope automatically:
   *   • a non-empty selection inside the box being edited → the range only;
   *   • otherwise (box object-selected, or editing with a collapsed caret) →
   *     the whole box.
   *  `explicitValue` is passed for colour/size/font (set the value); omit it for
   *  the boolean marks (bold/italic/underline/strike) to toggle. One undo entry
   *  per call. */
  const applyTextFormat = useCallback((block: FreeformTextBlock, key: MarkKey, explicitValue?: MarkValue) => {
    const editingThis = editingId === block.id;
    const root = editingThis ? activeEditableRef.current : null;
    const offs = root ? getSelectionOffsets(root) : null;

    // ── RANGE scope — a non-empty highlighted selection inside the editable ──
    if (root && offs && offs.end > offs.start) {
      const runs = serializeEditable(root);
      const cur = activeMarks(runs, offs.start, offs.end);
      const value: MarkValue = explicitValue !== undefined
        ? explicitValue
        : ((cur[key] as MarkValue) ? false : true);
      let next = applyMarkToRange(runs, offs.start, offs.end, key, value);
      // Superscript and subscript are mutually exclusive — setting one clears
      // the other over the same range.
      if (value && key === 'superscript') next = applyMarkToRange(next, offs.start, offs.end, 'subscript', false);
      if (value && key === 'subscript') next = applyMarkToRange(next, offs.start, offs.end, 'superscript', false);
      updateBlock(block.id, { runs: next, content: runsToPlain(next) } as Partial<FreeformBlock>);
      // The editable is uncontrolled while editing — reflect the change in the
      // DOM imperatively and restore the same selection so the user can keep
      // formatting the same words.
      fillEditable(root, next);
      setSelectionOffsets(root, offs.start, offs.end);
      setEditSelMarks(activeMarks(next, offs.start, offs.end));
      return;
    }

    // ── BOX scope — the whole box's content ─────────────────────────────────
    const style = { ...(block.style ?? {}) };
    const value: MarkValue = explicitValue !== undefined
      ? explicitValue
      : (wholeBoxActive(block, key) ? false : true);
    switch (key) {
      case 'bold': style.fontWeight = value ? 700 : 400; break;
      case 'italic': style.italic = value ? true : undefined; break;
      case 'underline': style.underline = value ? true : undefined; break;
      case 'color': style.color = (value as string) || undefined; break;
      case 'fontSize': style.fontSize = (value as number) || undefined; break;
      case 'fontFamily': style.fontFamily = (value as string) || undefined; break;
      case 'strike': break; // no block.style field — runs carry strikethrough
    }
    const delta: Partial<FreeformTextBlock> = { style };
    // Marks with no block.style equivalent live only on runs; to apply them to a
    // whole box that has no runs yet, synthesise runs from the content.
    const runsOnly = key === 'strike' || key === 'highlight' || key === 'superscript' || key === 'subscript';
    let nextRuns: TextRun[] | undefined;
    if (block.runs && block.runs.length) {
      nextRuns = applyMarkToAll(block.runs, key, value);
    } else if (runsOnly && value) {
      nextRuns = applyMarkToAll(blockRuns(block), key, value);
    }
    if (nextRuns) {
      if (value && key === 'superscript') nextRuns = applyMarkToAll(nextRuns, 'subscript', false);
      if (value && key === 'subscript') nextRuns = applyMarkToAll(nextRuns, 'superscript', false);
      delta.runs = nextRuns;
      delta.content = runsToPlain(nextRuns);
    }
    updateBlock(block.id, delta as Partial<FreeformBlock>);
    // If editing (collapsed caret), keep the live DOM in sync. When runs exist
    // we refill from them; when they don't, the container's cascading style
    // (block.style) already updates the plain text — no DOM surgery needed.
    if (editingThis && root && nextRuns) {
      const at = offs ? offs.start : 0;
      fillEditable(root, nextRuns);
      setSelectionOffsets(root, at, at);
    }
  }, [editingId, updateBlock, wholeBoxActive]);

  /** Clear formatting: strip character marks (keep any link) from the selected
   *  range, or the whole box when nothing is highlighted. Also resets the
   *  box-level style overrides so a runs-less box returns to its variant default. */
  const clearFormat = useCallback((block: FreeformTextBlock) => {
    const editingThis = editingId === block.id;
    const root = editingThis ? activeEditableRef.current : null;
    const offs = root ? getSelectionOffsets(root) : null;
    if (root && offs && offs.end > offs.start) {
      const next = clearMarksInRange(serializeEditable(root), offs.start, offs.end);
      updateBlock(block.id, { runs: next, content: runsToPlain(next) } as Partial<FreeformBlock>);
      fillEditable(root, next);
      setSelectionOffsets(root, offs.start, offs.end);
      setEditSelMarks(activeMarks(next, offs.start, offs.end));
      return;
    }
    // Whole box: drop the styling overrides that don't affect the variant
    // (keep alignment / vertical-align / gradient / shadow) and clear run marks.
    const s = block.style ?? {};
    const keptStyle = {
      textAlign: s.textAlign, verticalAlign: s.verticalAlign,
      gradient: s.gradient, textShadow: s.textShadow, lineHeight: s.lineHeight,
    };
    const delta: Partial<FreeformTextBlock> = { style: keptStyle };
    if (block.runs && block.runs.length) {
      const next = clearMarksInRange(block.runs, 0, runsToPlain(block.runs).length);
      delta.runs = next;
      delta.content = runsToPlain(next);
    }
    updateBlock(block.id, delta as Partial<FreeformBlock>);
    if (editingThis && root) {
      const next = delta.runs ?? blockRuns({ ...block, style: keptStyle } as FreeformTextBlock);
      fillEditable(root, next);
      setSelectionOffsets(root, 0, 0);
    }
  }, [editingId, updateBlock]);

  /** Ctrl/Cmd+K (and the toolbar link button): open the inline link editor over
   *  the selected words. Requires a non-empty selection inside the box being
   *  edited. Snapshots the selection offsets + runs BEFORE the editor's input
   *  can steal focus, then LinkEditor applies against that snapshot. */
  const insertLink = useCallback((block: FreeformTextBlock) => {
    if (editingId !== block.id) return;
    const root = activeEditableRef.current;
    if (!root) return;
    const offs = getSelectionOffsets(root);
    if (!offs || offs.end === offs.start) return; // a selection is required
    const runs = serializeEditable(root);
    const cur = activeMarks(runs, offs.start, offs.end);
    const existing = asLinkTarget(cur.link as string | LinkTarget | undefined);
    const rect = rangeRectFor(root, offs.start, offs.end);
    setLinkDraft({
      blockId: block.id,
      start: offs.start,
      end: offs.end,
      runs,
      initial: existing,
      isEdit: !!existing,
      anchor: rect
        ? { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width }
        : { top: 240, bottom: 264, left: window.innerWidth / 2, width: 0 },
    });
  }, [editingId]);

  /** Commit the link editor: apply the `link` mark to the snapshot range, then
   *  close and restore the selection in the still-editing box. `target`
   *  undefined removes the link. The selected characters ARE the link's words —
   *  the editor has no separate text field. */
  const saveLinkDraft = useCallback((target: LinkTarget | undefined) => {
    const d = linkDraftRef.current;
    if (!d) return;
    const next = applyMarkToRange(d.runs, d.start, d.end, 'link', target);
    updateBlock(d.blockId, { runs: next, content: runsToPlain(next) } as Partial<FreeformBlock>);
    setLinkDraft(null);
    const root = activeEditableRef.current;
    if (root) {
      fillEditable(root, next);
      root.focus();
      setSelectionOffsets(root, d.start, d.end);
      setEditSelMarks(activeMarks(next, d.start, d.end));
    }
  }, [updateBlock]);

  const cancelLinkDraft = useCallback(() => {
    const d = linkDraftRef.current;
    setLinkDraft(null);
    const root = activeEditableRef.current;
    if (d && root) { root.focus(); setSelectionOffsets(root, d.start, d.end); }
  }, []);

  // Delegated hover detection over rendered link runs (<a data-run-index>). The
  // layer has pointer-events:none but child events still bubble to this handler.
  const handleLayerMouseOver = useCallback((e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a[data-run-index]') as HTMLAnchorElement | null;
    if (!a) return;
    const blockId = a.closest('[data-freeform-block]')?.getAttribute('data-freeform-block');
    const ri = a.getAttribute('data-run-index');
    // The link destination lives in the run's marks (data-m) — resolve there so
    // slide-jumps (which have no href) still get a bubble.
    let target: LinkTarget | undefined;
    try { target = asLinkTarget((JSON.parse(a.dataset.m ?? '{}') as TextRunMarks).link); } catch { target = undefined; }
    if (!target) { const h = a.getAttribute('href'); if (h) target = { kind: 'url', value: h }; }
    if (!blockId || ri == null || !target) return;
    cancelHideBubble();
    setLinkHover({ blockId, runIndex: parseInt(ri, 10), target, rect: a.getBoundingClientRect() });
  }, [cancelHideBubble]);

  const handleLayerMouseOut = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest?.('a[data-run-index]')) return;
    const to = e.relatedTarget as HTMLElement | null;
    if (to && (to.closest?.('a[data-run-index]') || to.closest?.('[data-link-bubble]'))) return;
    scheduleHideBubble();
  }, [scheduleHideBubble]);

  /** Char range [start,end) of a hovered link run within its block. */
  const bubbleTarget = useCallback((blockId: string, runIndex: number) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block || block.type !== 'text') return null;
    const runs = blockRuns(block);
    let start = 0;
    for (let i = 0; i < runIndex; i++) start += runs[i]?.text.length ?? 0;
    const end = start + (runs[runIndex]?.text.length ?? 0);
    return { block, runs, start, end };
  }, [blocks]);

  const removeLinkFromBubble = useCallback(() => {
    const h = linkHover; if (!h) return;
    const t = bubbleTarget(h.blockId, h.runIndex); if (!t) return;
    const next = applyMarkToRange(t.runs, t.start, t.end, 'link', undefined);
    updateBlock(t.block.id, { runs: next, content: runsToPlain(next) } as Partial<FreeformBlock>);
    setLinkHover(null);
  }, [linkHover, bubbleTarget, updateBlock]);

  const editLinkFromBubble = useCallback(() => {
    const h = linkHover; if (!h) return;
    const t = bubbleTarget(h.blockId, h.runIndex); if (!t) return;
    const run = t.runs[h.runIndex];
    setLinkHover(null);
    setEditingId(h.blockId); // enter edit mode so the editor applies in place
    setLinkDraft({
      blockId: h.blockId, start: t.start, end: t.end, runs: t.runs,
      initial: asLinkTarget(run?.marks?.link), isEdit: true,
      anchor: { top: h.rect.top, bottom: h.rect.bottom, left: h.rect.left, width: h.rect.width },
    });
  }, [linkHover, bubbleTarget]);

  /** Activate a link from the hover bubble's primary action: open a URL, trigger
   *  a download, or jump to a slide within the deck. */
  const openLinkTarget = useCallback((target: LinkTarget) => {
    if (typeof window === 'undefined') return;
    if (target.kind === 'slide') { onNavigateToSlide?.(target.value); return; }
    if (target.kind === 'download') {
      const a = document.createElement('a');
      a.href = target.value;
      a.download = target.fileName || fileNameFromUrl(target.value);
      a.rel = 'noopener noreferrer';
      if (!target.value.startsWith('data:')) a.target = '_blank';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    window.open(target.value, '_blank', 'noopener,noreferrer');
  }, [onNavigateToSlide]);

  // Track the marks active over the current text selection so the toolbar can
  // light Bold/Italic/etc. for the HIGHLIGHTED range (not the whole box). Only
  // live while a text block is being edited.
  useEffect(() => {
    if (!editingId) { setEditSelMarks(null); return; }
    const block = blocks.find((b) => b.id === editingId);
    if (!block || block.type !== 'text') { setEditSelMarks(null); return; }
    const handler = () => {
      const root = activeEditableRef.current;
      if (!root) { setEditSelMarks(null); return; }
      const off = getSelectionOffsets(root);
      if (!off || off.end === off.start) { setEditSelMarks(null); return; }
      setEditSelMarks(activeMarks(serializeEditable(root), off.start, off.end));
    };
    document.addEventListener('selectionchange', handler);
    handler();
    return () => document.removeEventListener('selectionchange', handler);
  }, [editingId, blocks]);

  // ── Crop mode (Canva model) ────────────────────────────────────────────────
  const enterCrop = useCallback((id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || b.type !== 'image' || !b.src) return;
    // Snapshot pre-crop state so Esc can revert exactly.
    cropSnapshotRef.current = { fit: b.fit, panX: b.panX, panY: b.panY, x: b.x, y: b.y, w: b.w, h: b.h };
    // In crop the frame is a window the image fills — switch to cover so the
    // 8 handles crop (reshape) instead of letterboxing.
    if ((b.fit ?? 'cover') !== 'cover') updateBlock(id, { fit: 'cover' } as Partial<FreeformBlock>);
    setCropId(id);
  }, [blocks, updateBlock]);

  /** Revert to the pre-crop snapshot and exit (Esc). */
  const cancelCrop = useCallback(() => {
    const snap = cropSnapshotRef.current;
    if (snap && cropId) updateBlock(cropId, snap as Partial<FreeformBlock>);
    cropSnapshotRef.current = null;
    setCropId(null);
  }, [cropId, updateBlock]);

  // Crop keyboard: Enter applies, Esc cancels (reverts). Scoped to crop mode.
  useEffect(() => {
    if (!cropId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelCrop(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropId, applyCrop, cancelCrop]);

  /** Bring forward / send backward by swapping z with the adjacent block in
   *  z-order. Naive `z + 1` was buggy: if the next-higher block was at z=10
   *  and this block was at z=5, increment made z=6 which still rendered
   *  underneath. Swap semantics guarantee a single click moves this block
   *  past exactly one neighbor. */
  const adjustZ = useCallback((id: string, dir: 1 | -1) => {
    const sorted = [...blocks].sort((a, b) => a.z - b.z);
    const idx = sorted.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const neighborIdx = idx + dir;
    if (neighborIdx < 0 || neighborIdx >= sorted.length) return; // already at end of stack
    const me = sorted[idx];
    const neighbor = sorted[neighborIdx];
    onChange(blocks.map((b) => {
      if (b.id === me.id) return { ...b, z: neighbor.z };
      if (b.id === neighbor.id) return { ...b, z: me.z };
      return b;
    }));
  }, [blocks, onChange]);

  const deleteBlock = useCallback((id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [blocks, onChange]);

  const duplicateBlock = useCallback((id: string) => {
    const src = blocks.find((b) => b.id === id);
    if (!src) return;
    // New block always lands on top of every existing block so duplicating
    // produces a clear visual successor instead of colliding with an
    // existing z value.
    const maxZ = blocks.reduce((m, b) => Math.max(m, b.z), 0);
    const copy: FreeformBlock = {
      ...src,
      id: `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: clamp(src.x + 3, 0, 100 - src.w),
      y: clamp(src.y + 3, 0, 100 - src.h),
      z: maxZ + 1,
    };
    onChange([...blocks, copy]);
    setSelectedIds(new Set([copy.id]));
  }, [blocks, onChange]);

  // ── Clipboard: OS-image paste, image copy-out, right-click paste ──────────
  // Block copy/cut live in the keyboard effect above
  // (sessionStorage); these add OS-clipboard image support + menu affordances.

  // Insert an image (data URL) as a freeform block CENTERED on the card, sized
  // to its real aspect ratio. Selects it so the next action targets it.
  const insertImageDataUrl = useCallback(
    (src: string, dims?: { width: number; height: number }, alt?: string) => {
      const { w, h } = aspectCenteredImageSize(dims);
      const maxZ = blocks.reduce((m, b) => Math.max(m, b.z), 0);
      const id = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const block: FreeformBlock = {
        id, type: 'image', src, alt, fit: 'contain',
        x: clamp((100 - w) / 2, 0, 100 - w),
        y: clamp((100 - h) / 2, 0, 100 - h),
        w, h, rotation: 0, z: maxZ + 1,
      };
      onChange([...blocks, block]);
      setSelectedIds(new Set([id]));
    },
    [blocks, onChange],
  );

  // Validate + read an image Blob/File, then insert it. Mirrors the upload
  // path's image-type + 4 MB guards. Resolves true when it inserted.
  const insertImageBlob = useCallback(
    async (blob: Blob): Promise<boolean> => {
      if (!blob.type.startsWith('image/')) return false;
      if (blob.size > 4 * 1024 * 1024) return false; // 4 MB cap (matches upload)
      try {
        const dataUrl = await blobToDataUrl(blob);
        const dims = await probeImageNaturalDims(dataUrl);
        insertImageDataUrl(dataUrl, dims);
        return true;
      } catch {
        return false;
      }
    },
    [insertImageDataUrl],
  );

  // Re-id + cascade-offset internally-copied blocks, append, select them.
  const pasteBlocksFromData = useCallback(
    (parsed: FreeformBlock[]) => {
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const maxZ = blocks.reduce((m, b) => Math.max(m, b.z), 0);
      const newIds: string[] = [];
      const pasted: FreeformBlock[] = parsed.map((b, i) => {
        const id = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`;
        newIds.push(id);
        return {
          ...b, id,
          x: clamp(b.x + 3, 0, 100 - b.w),
          y: clamp(b.y + 3, 0, 100 - b.h),
          z: maxZ + i + 1,
        };
      });
      onChange([...blocks, ...pasted]);
      setSelectedIds(new Set(newIds));
    },
    [blocks, onChange],
  );

  // Read internally-copied blocks from sessionStorage (null if none / invalid).
  const readBlockClipboard = useCallback((): FreeformBlock[] | null => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem('compose-freeform-clipboard');
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as FreeformBlock[]) : null;
    } catch {
      return null;
    }
  }, []);

  // Copy a block to the internal clipboard; an image ALSO goes to the OS
  // clipboard so it can be pasted into other apps (best-effort).
  const copyBlock = useCallback(
    (id: string) => {
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      try {
        sessionStorage.setItem('compose-freeform-clipboard', JSON.stringify([block]));
      } catch {
        /* private mode — no-op */
      }
      if (block.type === 'image' && block.src) void imageSrcToOSClipboard(block.src);
    },
    [blocks],
  );

  // Right-click "Paste": prefer an OS-clipboard image (async Clipboard API —
  // best-effort, may prompt in Chrome), else fall back to copied blocks.
  const pasteFromContextMenu = useCallback(async () => {
    const blob = await readImageFromOSClipboard();
    if (blob && (await insertImageBlob(blob))) return;
    const clip = readBlockClipboard();
    if (clip) pasteBlocksFromData(clip);
  }, [insertImageBlob, readBlockClipboard, pasteBlocksFromData]);

  // Paste — image-first (OS clipboard), else internally-copied blocks. A
  // `paste` ClipboardEvent (not keydown) is required to reach clipboardData,
  // which is how a screenshot / copied image arrives. Gated on `interactive`
  // so only the ACTIVE card's layer responds.
  useEffect(() => {
    if (!interactive) return;
    const onPaste = (e: ClipboardEvent) => {
      if (editingId) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const dt = e.clipboardData;
      if (!dt) return;
      const imageItem = Array.from(dt.items).find(
        (it) => it.kind === 'file' && it.type.startsWith('image/'),
      );
      if (imageItem) {
        const blob = imageItem.getAsFile();
        if (blob) {
          e.preventDefault();
          void insertImageBlob(blob);
          return;
        }
      }
      const clip = readBlockClipboard();
      if (clip) {
        e.preventDefault();
        pasteBlocksFromData(clip);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [interactive, editingId, insertImageBlob, readBlockClipboard, pasteBlocksFromData]);

  // Right-click on EMPTY card area → a Paste-only menu. The layer is
  // pointer-events:none (clicks fall through to structured content), so we
  // listen on the parent card element. Right-clicks landing on a freeform
  // block are owned by that block's own onContextMenu (the native listener
  // fires first on bubble, to bail when the target is inside a block).
  useEffect(() => {
    if (!interactive) return;
    const card = layerRef.current?.parentElement;
    if (!card) return;
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-freeform-block]')) return;
      if (t?.closest('[data-freeform-context-menu]')) return;
      e.preventDefault();
      setContextMenu({ blockId: null, x: e.clientX, y: e.clientY });
    };
    card.addEventListener('contextmenu', onCtx);
    return () => card.removeEventListener('contextmenu', onCtx);
  }, [interactive]);

  // Deselect on any pointerdown that's outside every freeform block.
  // Window-level so the structured content underneath can still receive
  // its own clicks (the layer itself is pointer-events: none below).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onDocDown = (e: PointerEvent) => {
      const layer = layerRef.current;
      if (!layer) return;
      const target = e.target as Node | null;
      if (!target) return;
      // Keep the block selection alive while the user interacts with editor
      // chrome — side panels (the Text/Font panel applies fonts to the
      // selection), the floating toolbar, menus, top bar. Mirrors the same
      // exemption CardEditor's card-level deselect already uses. Without this,
      // clicking a font in the Text panel deselected the block on pointerdown,
      // so the font apply (which reads the selection) silently no-opped.
      const el = target as HTMLElement;
      if (el?.closest?.('[role="complementary"], [role="toolbar"], [role="menu"], [data-slide-toolbar], [data-speaker-notes], nav, aside, header')) {
        return;
      }
      const blockEls = layer.querySelectorAll('[data-freeform-block]');
      for (const block of Array.from(blockEls)) {
        if (block.contains(target)) return;
      }
      // Click-away while cropping = apply the crop (Canva model), then deselect.
      if (cropId) applyCrop();
      setSelectedIds(new Set());
    };
    document.addEventListener('pointerdown', onDocDown);
    return () => document.removeEventListener('pointerdown', onDocDown);
  }, [selectedIds, cropId, applyCrop]);

  // Context menu close on Esc and outside-click. Outside-click handled
  // via capture-phase pointerdown so the menu's own buttons (which stop
  // propagation) still fire. Esc closes without selecting anything.
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-freeform-context-menu]')) setContextMenu(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [contextMenu]);

  // ── Resolve the text-contrast context for this card ───────────────────────
  // Pure derivation from props + the current block list. Recomputed per render
  // (cheap) so a role / image change reflects immediately.
  const scrimCtx = resolveScrimContext(blocks, slideDesign, regionBgHex, themeBodyHex, themeTitleHex);

  return (
    <div
      ref={layerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseOver={handleLayerMouseOver}
      onMouseOut={handleLayerMouseOut}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        // Layer itself never blocks pointer events — only the per-block
        // wrappers below have pointer-events: auto. This preserves click-
        // to-edit on the structured content layered underneath.
        // onPointerMove / onPointerUp still fire here via React event
        // delegation: pointer capture lives on the dragged block, events
        // bubble up through the DOM, and React dispatches up the tree.
        pointerEvents: 'none',
      }}
    >
      {/* Scrim layer — painted between the behind-text image (z=0) and the
          text so text-over-image always has a known background. Soft gradient
          (strongest under the text-safe zone, fading out) so it reads as a
          designed wash, not a flat caption bar. Never intercepts pointers. */}
      {scrimCtx.scrimActive && scrimCtx.scrimGradientCss && (
        <div
          aria-hidden
          data-freeform-scrim
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: scrimCtx.scrimZ,
            backgroundImage: scrimCtx.scrimGradientCss,
            pointerEvents: 'none',
            borderRadius: 'inherit',
          }}
        />
      )}

      {blocks.map((block) => (
        <FreeformBlockView
          key={block.id}
          scrimCtx={scrimCtx}
          block={block}
          selected={selectedIds.has(block.id)}
          // Single selection: toolbar on that block. Multi-selection: ONE bulk
          // toolbar, anchored to the first selected block (in z/array order), so
          // the user gets grow/shrink + bulk font for the whole selection
          // instead of N floating toolbars.
          showToolbar={
            selectedIds.size === 1
              ? selectedIds.has(block.id)
              : selectedIds.size > 1 && block.id === blocks.find((b) => selectedIds.has(b.id))?.id
          }
          selectionCount={selectedIds.size}
          onBumpFontSize={bumpFontSizeForSelection}
          cropActive={cropId === block.id}
          isDragging={isDragging && dragRef.current?.id === block.id}
          interactive={interactive}
          editing={editingId === block.id}
          scrollContainer={scrollContainer ?? null}
          onPointerDown={(e) => handleBlockPointerDown(e, block)}
          onContextMenu={(e) => {
            if (!interactive) return;
            e.preventDefault();
            // Select THIS block so the menu visually matches what it
            // operates on. Doesn't disturb existing multi-select if the
            // user right-clicks one of the selected blocks.
            setSelectedIds((prev) => (prev.has(block.id) ? prev : new Set([block.id])));
            setContextMenu({ blockId: block.id, x: e.clientX, y: e.clientY });
          }}
          onResizeStart={(e, handle) => handleResizeStart(e, block, handle)}
          onRotationStart={(e, blockEl) => handleRotationStart(e, block, blockEl)}
          onDoubleClick={() => {
            if (!interactive || block.locked) return;
            // Text blocks enter contentEditable. Closed shape blocks
            // (rectangle / circle) also support inline text via the
            // text-in-shape feature (P1 #4) — line/arrow stay text-free.
            if (block.type === 'text') {
              setEditingId(block.id);
            } else if (block.type === 'shape' && (block.shape === 'rectangle' || block.shape === 'circle')) {
              setEditingId(block.id);
            } else if (block.type === 'table') {
              // Tables enter cell-edit mode (cells become contentEditable).
              setEditingId(block.id);
            } else if (block.type === 'list') {
              // Lists enter item-edit mode (each item becomes contentEditable).
              setEditingId(block.id);
            } else if (block.type === 'chart') {
              // Charts have no inline contentEditable surface — double-click
              // opens the Chart Data-Table editor instead.
              onEditChart?.(block.id);
            }
          }}
          onEndEditing={() => setEditingId(null)}
          onTextContentChange={(content) => {
            if (block.type === 'text') {
              updateBlock(block.id, { content } as Partial<FreeformBlock>);
            } else if (block.type === 'shape') {
              // Text-in-shape: persists on the shape block via the
              // optional `content` field added per P1 #4.
              updateBlock(block.id, { content } as Partial<FreeformBlock>);
            }
          }}
          onTableRowsChange={(rows) => updateBlock(block.id, { rows } as Partial<FreeformBlock>)}
          onTableSelect={(range) => {
            tableSelRef.current = range;
            if (range) activeTableCellRef.current = { row: range.r0, col: range.c0 };
          }}
          onListItemsChange={(listItems) => updateBlock(block.id, { items: listItems } as Partial<FreeformBlock>)}
          onToolbarAction={(action) => {
            // Open the Chart Data-Table editor from the chart toolbar.
            if (action === 'edit-chart') {
              if (block.type === 'chart') onEditChart?.(block.id);
              return;
            }
            // List marker toggle.
            if (action === 'list-bullet' || action === 'list-number') {
              if (block.type !== 'list') return;
              updateBlock(block.id, { marker: action === 'list-number' ? 'number' : 'bullet' } as Partial<FreeformBlock>);
              return;
            }
            // Table row/column ops act relative to the cell the cursor last entered;
            // merge/split act on the current rectangular selection.
            if (action.startsWith('tbl-')) {
              if (block.type !== 'table') return;
              const cur = block.rows ?? [];
              if (action === 'tbl-merge') {
                const sel = tableSelRef.current;
                if (!sel) return;
                const { rows: nr, merges: nm } = tblMerge(cur, block.merges, sel);
                updateBlock(block.id, { rows: nr, merges: nm } as Partial<FreeformBlock>);
                tableSelRef.current = { r0: sel.r0, c0: sel.c0, r1: sel.r0, c1: sel.c0 };
                return;
              }
              if (action === 'tbl-split') {
                // Split every merge intersecting the selection; fall back to the
                // active cell (a 1×1 range) when nothing is range-selected.
                const { row, col } = activeTableCellRef.current;
                const range = tableSelRef.current ?? { r0: row, c0: col, r1: row, c1: col };
                const nm = tblSplit(block.merges, range);
                updateBlock(block.id, { merges: nm } as Partial<FreeformBlock>);
                return;
              }
              const { row, col } = activeTableCellRef.current;
              const r = Math.min(row, cur.length - 1), c = Math.min(col, tblCols(cur) - 1);
              const next =
                action === 'tbl-row-above' ? tblInsertRow(cur, r) :
                action === 'tbl-row-below' ? tblInsertRow(cur, r + 1) :
                action === 'tbl-col-left' ? tblInsertCol(cur, c) :
                action === 'tbl-col-right' ? tblInsertCol(cur, c + 1) :
                action === 'tbl-row-del' ? tblDeleteRow(cur, r) :
                action === 'tbl-col-del' ? tblDeleteCol(cur, c) : cur;
              if (next !== cur) updateBlock(block.id, { rows: next } as Partial<FreeformBlock>);
              return;
            }
            switch (action) {
              case 'delete': deleteBlock(block.id); break;
              case 'duplicate': duplicateBlock(block.id); break;
              case 'forward': adjustZ(block.id, 1); break;
              case 'backward': adjustZ(block.id, -1); break;
              case 'crop':
                if (cropId === block.id) applyCrop(); else enterCrop(block.id);
                break;
              // Character marks — range-scoped when text is selected in the box,
              // whole-box otherwise. applyTextFormat picks the scope + toggles.
              case 'bold':
              case 'italic':
              case 'underline':
              case 'strike': {
                if (block.type !== 'text') return;
                applyTextFormat(block, action);
                break;
              }
              case 'link': {
                if (block.type !== 'text') return;
                insertLink(block);
                break;
              }
              case 'superscript':
              case 'subscript': {
                if (block.type !== 'text') return;
                applyTextFormat(block, action);
                break;
              }
              case 'clear-format': {
                if (block.type !== 'text') return;
                clearFormat(block);
                break;
              }
              case 'footnote': {
                // Linked footnote (Tier 1): make the selected marker superscript,
                // then open the link editor to point it at its source.
                if (block.type !== 'text') return;
                applyTextFormat(block, 'superscript');
                insertLink(block);
                break;
              }
              case 'align-left':
              case 'align-center':
              case 'align-right':
              case 'align-justify': {
                if (block.type !== 'text') return;
                const cur = block.style ?? {};
                const next = action === 'align-left' ? 'left'
                  : action === 'align-center' ? 'center'
                  : action === 'align-right' ? 'right' : 'justify';
                updateBlock(block.id, {
                  style: { ...cur, textAlign: next },
                } as Partial<FreeformBlock>);
                break;
              }
            }
          }}
          onColorChange={(color) => {
            if (block.type === 'icon') {
              updateBlock(block.id, { color } as Partial<FreeformBlock>);
            } else if (block.type === 'shape') {
              updateBlock(block.id, { fill: color } as Partial<FreeformBlock>);
            } else if (block.type === 'text') {
              // Range-scoped when a selection is active, whole-box otherwise.
              applyTextFormat(block, 'color', color);
            }
          }}
          onHighlightChange={(color) => {
            if (block.type !== 'text') return;
            applyTextFormat(block, 'highlight', color);
          }}
          onFontFamilyChange={(family) => {
            if (block.type !== 'text') return;
            applyTextFormat(block, 'fontFamily', family || undefined);
          }}
          onFontSizeChange={(size) => {
            if (block.type !== 'text') return;
            applyTextFormat(block, 'fontSize', size || undefined);
          }}
          selMarks={editingId === block.id ? editSelMarks : null}
          onEditableRef={(el) => { activeEditableRef.current = el; }}
          onCommitRuns={(runs) => {
            if (block.type !== 'text') return;
            const text = runsToPlain(runs);
            const hasMarks = runs.some((r) => r.marks);
            if (hasMarks) {
              // Skip when the serialised runs match what's already stored — a
              // format action already committed them, so a no-op commit here
              // would push a redundant (and undo-eating) history entry.
              const unchanged = block.content === text
                && JSON.stringify(block.runs ?? null) === JSON.stringify(runs);
              if (!unchanged) updateBlock(block.id, { runs, content: text } as Partial<FreeformBlock>);
            } else {
              // All-plain — store as content and drop any runs so legacy blocks
              // stay runs-free (and export/FR11 see plain text).
              const delta: Partial<FreeformTextBlock> = { content: text };
              if (block.runs) delta.runs = undefined;
              if (text !== block.content || block.runs) updateBlock(block.id, delta as Partial<FreeformBlock>);
            }
          }}
          onInlineFormat={(key) => {
            if (block.type !== 'text') return;
            applyTextFormat(block, key);
          }}
          onLinkShortcut={() => {
            if (block.type !== 'text') return;
            insertLink(block);
          }}
          onNormalizeImageAspect={(naturalW, naturalH) => {
            // Standalone-image self-correction: once the image's true pixel
            // dimensions are known (onLoad), reshape the block so its RENDERED
            // pixel box matches the image aspect. With the box hugging the
            // image, `object-fit: contain` leaves no letterbox/pillarbox and
            // the selection frame + handles wrap the image exactly. Only fires
            // for standalone images (fit !== 'cover' — region/fill images are
            // meant to cover their box and already hug). Skipped if the block
            // is already correct (within a small tolerance) to avoid an update
            // loop. The card-axis ratio (cardWidth/cardHeight) converts pixel
            // aspect into the percent-of-different-axes the block stores.
            if (block.type !== 'image') return;
            if ((block.fit ?? 'cover') === 'cover') return;
            if (naturalW <= 0 || naturalH <= 0 || cardHeight <= 0) return;
            const imageAspect = naturalW / naturalH;
            const cardAxisRatio = cardWidth / cardHeight; // 960/540 ≈ 1.7778
            // Current rendered pixel aspect of the block.
            const renderedAspect =
              block.h > 0 ? (block.w * cardWidth) / (block.h * cardHeight) : imageAspect;
            // Within 1% — already hugging. Don't churn state.
            if (Math.abs(renderedAspect - imageAspect) / imageAspect < 0.01) return;
            // Keep width fixed; recompute height so the pixel box matches.
            // h% = w% * (cardW/cardH) / imageAspect.
            let newH = (block.w * cardAxisRatio) / imageAspect;
            let newW = block.w;
            // If the recomputed height would push the block off the bottom of
            // the card, clamp height and reflow width instead (preserves
            // aspect, keeps the block on-card).
            if (block.y + newH > 100) {
              newH = Math.max(0, 100 - block.y);
              newW = (newH * imageAspect) / cardAxisRatio;
            }
            updateBlock(block.id, { w: newW, h: newH } as Partial<FreeformBlock>);
          }}
          onOpenFontPanel={onOpenFontPanel}
          fontPanelOpen={fontPanelOpen}
        />
      ))}

      {activeGuides.map((g, i) => (
        <SnapGuideOverlay key={`${g.axis}-${g.at}-${i}`} guide={g} />
      ))}

      {contextMenu && typeof document !== 'undefined' && createPortal(
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          blockId={contextMenu.blockId}
          isChart={!!contextMenu.blockId && blocks.find((b) => b.id === contextMenu.blockId)?.type === 'chart'}
          onAction={(action) => {
            const id = contextMenu.blockId;
            setContextMenu(null);
            switch (action) {
              case 'edit-chart': if (id) onEditChart?.(id); break;
              case 'copy': if (id) copyBlock(id); break;
              case 'cut': if (id) { copyBlock(id); deleteBlock(id); } break;
              case 'paste': void pasteFromContextMenu(); break;
              case 'forward': if (id) adjustZ(id, 1); break;
              case 'backward': if (id) adjustZ(id, -1); break;
              case 'duplicate': if (id) duplicateBlock(id); break;
              case 'delete': if (id) deleteBlock(id); break;
            }
          }}
          onClose={() => setContextMenu(null)}
        />,
        document.body,
      )}

      {/* Link editor (Ctrl+K / Link button) + a synthetic highlight over the
          words being linked (the native selection collapses once the editor's
          input takes focus, to paint it back). */}
      {linkDraft && (
        <>
          <LinkSelectionOverlay
            editable={activeEditableRef.current}
            start={linkDraft.start}
            end={linkDraft.end}
          />
          <LinkEditor
            anchorRect={linkDraft.anchor}
            scrollContainer={scrollContainer ?? null}
            initial={linkDraft.initial}
            isEdit={linkDraft.isEdit}
            deckSlides={deckSlides ?? []}
            currentSlideId={currentSlideId}
            onSave={saveLinkDraft}
            onRemove={() => saveLinkDraft(undefined)}
            onCancel={cancelLinkDraft}
          />
        </>
      )}

      {/* Hover-a-link bubble — names the destination + Open/Go-to-slide / Copy /
          Edit / Remove. Hidden while the link editor is open. */}
      {linkHover && !linkDraft && (
        <LinkBubble
          rect={linkHover.rect}
          target={linkHover.target}
          slideLabel={linkHover.target.kind === 'slide' ? slideLabelFor(linkHover.target.value) : undefined}
          onMouseEnter={cancelHideBubble}
          onMouseLeave={scheduleHideBubble}
          onOpen={() => openLinkTarget(linkHover.target)}
          onGoToSlide={() => openLinkTarget(linkHover.target)}
          onCopy={() => { void navigator.clipboard?.writeText(linkHover.target.value); }}
          onEdit={editLinkFromBubble}
          onRemove={removeLinkFromBubble}
        />
      )}
    </div>
  );
}

// ── Context menu ─────────────────────────────────────────────────────────
// Floating right-click menu for the freeform block under the pointer.
// Portaled to <body> so it escapes the card's overflow:hidden + the slide
// editor's z-stacking. Operates on the right-clicked block (NOT necessarily
// the multi-selection) — single-block actions only for v1.
type ContextMenuAction = 'edit-chart' | 'copy' | 'cut' | 'paste' | 'forward' | 'backward' | 'duplicate' | 'delete';

function ContextMenu({
  x, y, blockId, isChart, onAction, onClose: _onClose,
}: {
  x: number;
  y: number;
  /** null = the menu was opened on EMPTY card area → a Paste-only menu. */
  blockId: string | null;
  /** When true, the right-clicked block is a chart — adds an "Edit chart
   *  data" item at the top that opens the Chart Data-Table editor. */
  isChart?: boolean;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
}) {
  void _onClose;
  const isCanvas = blockId === null;

  const items: { label: string; action: ContextMenuAction; shortcut?: string; danger?: boolean }[] = isCanvas
    ? [{ label: 'Paste', action: 'paste', shortcut: '⌘ V' }]
    : [
        ...(isChart ? [{ label: 'Edit chart data', action: 'edit-chart' as ContextMenuAction }] : []),
        { label: 'Copy', action: 'copy', shortcut: '⌘ C' },
        { label: 'Cut', action: 'cut', shortcut: '⌘ X' },
        { label: 'Paste', action: 'paste', shortcut: '⌘ V' },
        { label: 'Duplicate', action: 'duplicate', shortcut: '⌘ D' },
        { label: 'Bring forward', action: 'forward', shortcut: '⌘ ]' },
        { label: 'Send backward', action: 'backward', shortcut: '⌘ [' },
        { label: 'Delete', action: 'delete', shortcut: '⌫', danger: true },
      ];

  // Clamp the menu inside the viewport so it doesn't get cut off near a screen
  // edge. Height scales with the item count (~38px each + 12px padding).
  const ESTIMATED_W = 200;
  const ESTIMATED_H = items.length * 38 + 12;
  const left = Math.min(x, window.innerWidth - ESTIMATED_W - 8);
  const top = Math.min(y, window.innerHeight - ESTIMATED_H - 8);

  return (
    <div
      data-freeform-context-menu
      role="menu"
      style={{
        position: 'fixed',
        top,
        left,
        zIndex: 9999,
        minWidth: ESTIMATED_W,
        background: '#ffffff',
        border: '1px solid rgba(15, 23, 42, 0.10)',
        borderRadius: '10px',
        boxShadow: '0 12px 28px -8px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06)',
        padding: '6px',
        fontFamily: 'Inter, system-ui, sans-serif',
        userSelect: 'none',
      }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          onClick={() => onAction(item.action)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 10px',
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
            color: item.danger ? '#dc2626' : '#0f172a',
            textAlign: 'left',
            gap: '12px',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = item.danger
              ? 'rgba(220, 38, 38, 0.06)'
              : 'rgba(107, 63, 160, 0.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && (
            <span style={{
              fontSize: '11px',
              color: 'rgba(15, 23, 42, 0.45)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              {item.shortcut}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Card aspect (960×540). Mirrors CardEditor's CARD_AXIS_RATIO so a pasted image
// sizes identically to an uploaded one.
const FF_CARD_AXIS = 960 / 540;

// Aspect-aware footprint (% of card) for an inserted image — same recipe as
// CardEditor.aspectAwareImageSize: ~40% wide, clamped so portraits don't blow
// past the card height and landscapes don't exceed the side cap.
function aspectCenteredImageSize(dims?: { width: number; height: number }): { w: number; h: number } {
  if (!dims || dims.width <= 0 || dims.height <= 0) return { w: 40, h: 40 };
  const aspect = dims.width / dims.height;
  let w = 40;
  let h = (w * FF_CARD_AXIS) / aspect;
  if (h > 60) { h = 60; w = (h * aspect) / FF_CARD_AXIS; }
  if (w > 50) { w = 50; h = (w * FF_CARD_AXIS) / aspect; }
  return { w, h };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

function probeImageNaturalDims(src: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

// Convert any image blob to PNG (the format browsers reliably accept for
// clipboard writes) by drawing it to a canvas. Returns null on failure.
async function toPngBlob(blob: Blob): Promise<Blob | null> {
  if (blob.type === 'image/png') return blob;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode failed'));
      i.src = url as string;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

// Write an image (data URL or any URL) to the OS clipboard as PNG. Best-effort:
// needs a secure context + Clipboard API; silently no-ops otherwise.
async function imageSrcToOSClipboard(src: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof window.ClipboardItem === 'undefined') return;
    const blob = await (await fetch(src)).blob();
    const png = await toPngBlob(blob);
    if (!png) return;
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': png })]);
  } catch {
    /* best-effort — clipboard write can be blocked by permission/focus */
  }
}

// Read an image from the OS clipboard (for right-click Paste). Best-effort:
// navigator.clipboard.read may prompt or be unsupported. Returns null if none.
async function readImageFromOSClipboard(): Promise<Blob | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return await item.getType(type);
    }
  } catch {
    /* read blocked / unsupported / no permission */
  }
  return null;
}

// ── Text-contrast context resolution ────────────────────────────────────────
// Pure derivation. Decides whether to paint a scrim (behind-text image roles)
// and computes the solid background tone(s) text color will be measured
// against. Safe by construction: when slideDesign is absent OR the role is not
// behind-text, scrimActive is false and the regionBgHex falls back to the card
// surface (defaulting to white), so plain slides behave exactly as before.
function resolveScrimContext(
  blocks: FreeformBlock[],
  slideDesign: Card['slideDesign'] | undefined,
  regionBgHex: string | undefined,
  themeBodyHex: string | undefined,
  themeTitleHex: string | undefined,
): ScrimContext {
  const region = regionBgHex ?? '#ffffff';
  const role = slideDesign?.imageRole;
  // texture / background = behind-text WASH roles: the photo renders faint so
  // the theme's normal text reads on top. Excluded from SCRIM_ROLES (no veil),
  // so they always fall through the early return below; the wash opacity is
  // applied at image render time off this flag.
  const behindTextWash = role === 'texture' || role === 'background';
  const base: ScrimContext = {
    scrimActive: false,
    regionBgHex: region,
    themeBodyHex,
    themeTitleHex,
    behindTextWash,
  };

  // Structural fallback: a full-card, full-strength image
  // behind the text must get the scrim + forced-light treatment EVEN when
  // slideDesign.imageRole isn't 'full-bleed' (content slides whose role wasn't
  // stamped, or is stale). Without this the text color is measured against the
  // light region bg instead of the dark image → dark-on-dark, invisible. Only
  // matches a near-full-card image at full strength (NOT column/band images,
  // which sit beside the text, and NOT faded texture/background washes).
  // Detection broadened 2026-06-06 (text invisible over full-bleed images
  // in the editor). The old thresholds (opacity===undefined, w/h≥90, x/y≤5)
  // missed real full-bleed slides — e.g. an image with ANY opacity set, or one
  // a few % off the origin — so no scrim fired and text was measured against the
  // light region bg → dark-on-dark, invisible. Now: any near-full-card image
  // that is NOT a faint wash (opacity ≥ 0.5 or unset) counts as behind-text.
  const fullBleedImg = !behindTextWash
    ? blocks.find(
        (b) =>
          b.type === 'image' && !!b.src &&
          (b.opacity === undefined || b.opacity >= 0.5) &&
          b.w >= 82 && b.h >= 82 && b.x <= 12 && b.y <= 12,
      )
    : undefined;

  const effectiveRole: ScrimRole | undefined =
    role && SCRIM_ROLES.has(role) ? (role as ScrimRole)
      : fullBleedImg ? 'full-bleed'
        : undefined;

  if (!effectiveRole) {
    // Not a rich-photo role and no full-bleed image behind the text.
    // texture/background are faded washes; column/band/none keep text out of
    // the image region — no scrim. Adaptive color still runs against region bg.
    return base;
  }

  // Find the lowest-z image block — the scrim sits just above it, below text.
  const imageBlocks = blocks.filter((b) => b.type === 'image' && !!b.src);
  if (imageBlocks.length === 0) {
    // Role says behind-text but no image is actually placed yet (e.g. auto-gen
    // pending / failed). No image to obscure text → no scrim; region color
    // governs. Prevents a mystery veil over a plain slide.
    return base;
  }
  // The scrim must sit ABOVE every behind-text image but BELOW the text.
  // Behind-text images are placed at the bottom of the stack (converter z=1+,
  // auto-images at z=0), and text is converted at z≥1. Painting the scrim at
  // (highest image z + 1) puts it above the image; when that ties a text
  // block's z, DOM order breaks the tie — the scrim div is rendered BEFORE
  // the block list, so equal-z text still paints on top of the scrim.
  const highestImageZ = imageBlocks.reduce((m, b) => Math.max(m, b.z), 0);
  const scrimZValue = highestImageZ + 1;

  const preset = SCRIM_PRESET[effectiveRole];
  // Rich-photo roles ALWAYS use a DARK veil (slate-950) + forced LIGHT text,
  // regardless of theme. This is the fix for the failing case: the previous
  // pass tinted the veil by theme tone, so a LIGHT theme produced a WHITE veil
  // at 0.5 over a mid-tone photo — and pickTextColor then chose DARK text,
  // which was unreadable. A dark veil + light type is the reliable editorial
  // treatment when we can't sample the actual photo pixels.
  const overlayRgb = '2,6,23'; // slate-950
  const gradientCss = scrimGradient(slideDesign?.textSafeZone ?? 'full', overlayRgb, preset.alpha);

  // Effective peak tone the text sits on = the dark veil composited over a
  // MID-TONE photo stand-in (not the light card surface — the photo is at full
  // strength here, so its perceived tone is roughly mid-grey, never the card
  // bg). At the assertive peak alpha the dark veil dominates, yielding a dark
  // tone → pickTextColor returns near-white, which clears WCAG AA. Using the
  // light region bg here was a second source of the dark-text bug.
  const PHOTO_MIDTONE = '#808080';
  const [pr, pg, pb] = compositeOverlay(PHOTO_MIDTONE, 0, preset.alpha);
  const scrimSolidHex = `#${[pr, pg, pb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  return {
    scrimActive: true,
    scrimGradientCss: gradientCss,
    scrimZ: scrimZValue,
    scrimSolidHex,
    regionBgHex: region,
    themeBodyHex,
    themeTitleHex,
    behindTextWash,
  };
}

/**
 * Resolve the guaranteed-legible color for ONE text block, or `undefined` to
 * leave the theme default in place.
 *
 *  - User explicitly set a color (block.style.color) → respect it, never
 *    override a deliberate choice.
 *  - Over a scrim → measure against the scrim's solid tone.
 *  - Beside / no image → measure against the region bg, preferring the theme's
 *    own body/title color when it already clears AA.
 *
 * Returns the color only when a flip is actually needed (or when over a scrim,
 * where we always pin a known-legible color) so theme gradients on headings
 * are preserved on plain slides.
 */
function resolveTextColor(
  block: FreeformTextBlock,
  ctx: ScrimContext,
): string | undefined {
  // Respect an explicit user color.
  if (block.style?.color) return undefined;
  // Preserve a deliberate gradient-FILL heading (e.g. Volt titles) — a solid
  // contrast color would clobber the gradient-clip technique.
  if (block.style?.gradient) return undefined;

  const preferred = (block.variant === 'heading' || block.variant === 'metric')
    ? ctx.themeTitleHex : ctx.themeBodyHex;

  if (ctx.scrimActive && ctx.scrimSolidHex) {
    // Over the scrim → always resolve against the known scrim tone. Headings
    // use a gradient by default which can wash out over a photo, to pin a
    // solid legible color here too.
    return pickTextColor(ctx.scrimSolidHex, preferred) ?? undefined;
  }

  // Beside / no image — keep the theme color when legible, else flip.
  const resolved = pickTextColor(ctx.regionBgHex, preferred);
  // Only emit when the resolved color actually differs from the theme default
  // (avoid stomping heading gradients that are already fine). When preferred
  // is undefined we can't compare, so emit the safe endpoint only if it's the
  // dark/light flip (never on a normal light region where theme defaults work).
  if (!resolved) return undefined;
  if (preferred && resolved === preferred) return undefined; // theme color kept
  // resolved is a forced flip (LIGHT_TEXT / DARK_TEXT) or a kept-preferred.
  // If it's an endpoint, apply it; if preferred was kept it returned above.
  if (resolved === LIGHT_TEXT || resolved === DARK_TEXT) return resolved;
  return undefined;
}

/** Minimum block size in % — keeps a block grabbable after resize. */
const MIN_BLOCK_PERCENT = 2;

/**
 * Compute the new bounds of a block after a resize gesture.
 * `start` is the block's bounds at the moment the user grabbed the handle.
 * `dxPercent` / `dyPercent` are the pointer delta in %-of-card units.
 * `aspectLock` constrains the aspect ratio to the starting ratio. Corner handles
 * drive from the larger-magnitude axis; side handles drive their one axis and
 * re-center the perpendicular one (so a whole-image block stays hugging its image
 * — no letterbox — when an edge handle is dragged, not just a corner).
 */
function computeResize(
  handle: ResizeHandle,
  start: { x: number; y: number; w: number; h: number },
  dxPercent: number,
  dyPercent: number,
  aspectLock: boolean,
): { x: number; y: number; w: number; h: number } {
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;

  // Move the appropriate edges based on the handle direction.
  const hasN = handle === 'n' || handle === 'nw' || handle === 'ne';
  const hasS = handle === 's' || handle === 'sw' || handle === 'se';
  const hasW = handle === 'w' || handle === 'nw' || handle === 'sw';
  const hasE = handle === 'e' || handle === 'ne' || handle === 'se';

  if (hasN) { y = start.y + dyPercent; h = start.h - dyPercent; }
  if (hasS) { h = start.h + dyPercent; }
  if (hasW) { x = start.x + dxPercent; w = start.w - dxPercent; }
  if (hasE) { w = start.w + dxPercent; }

  // Aspect lock. Ratio is in PERCENT-of-card units; the card axes are fixed, so
  // holding w%/h% constant holds the rendered PIXEL aspect constant too.
  const isCorner = handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw';
  if (aspectLock && start.h > 0) {
    const ratio = start.w / start.h;
    if (isCorner) {
      // Corner: take the larger-magnitude delta as the driver, derive the other.
      if (Math.abs(dxPercent) >= Math.abs(dyPercent)) {
        const newH = w / ratio;
        if (hasN) y = start.y + (start.h - newH);
        h = newH;
      } else {
        const newW = h * ratio;
        if (hasW) x = start.x + (start.w - newW);
        w = newW;
      }
    } else if (hasE || hasW) {
      // Horizontal edge: width is driven, derive height and re-center vertically.
      const newH = w / ratio;
      y = start.y + (start.h - newH) / 2;
      h = newH;
    } else {
      // Vertical edge (hasN/hasS): height is driven, derive width, re-center.
      const newW = h * ratio;
      x = start.x + (start.w - newW) / 2;
      w = newW;
    }
  }

  // Clamp to minimum size. If a dimension would have gone negative or below
  // the minimum, snap back to the min and pin the opposite edge so the block
  // doesn't jump.
  if (w < MIN_BLOCK_PERCENT) {
    if (hasW) x = start.x + start.w - MIN_BLOCK_PERCENT;
    w = MIN_BLOCK_PERCENT;
  }
  if (h < MIN_BLOCK_PERCENT) {
    if (hasN) y = start.y + start.h - MIN_BLOCK_PERCENT;
    h = MIN_BLOCK_PERCENT;
  }

  // Clamp to card bounds.
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > 100) w = 100 - x;
  if (y + h > 100) h = 100 - y;
  // Re-floor in case clamps cut below minimum.
  w = Math.max(MIN_BLOCK_PERCENT, w);
  h = Math.max(MIN_BLOCK_PERCENT, h);

  return { x, y, w, h };
}

/** Angle in degrees from `center` to `point`, with 0° = right, 90° = down. */
function angleFromCenter(centerX: number, centerY: number, pointX: number, pointY: number): number {
  return (Math.atan2(pointY - centerY, pointX - centerX) * 180) / Math.PI;
}

function cardLabelX(at: number): string {
  if (at === 50) return 'Center';
  if (at === 0) return 'Left';
  if (at === 100) return 'Right';
  if (Math.abs(at - 33.33) < 0.5) return 'Third';
  if (Math.abs(at - 66.67) < 0.5) return 'Two-thirds';
  return '';
}

function cardLabelY(at: number): string {
  if (at === 50) return 'Middle';
  if (at === 0) return 'Top';
  if (at === 100) return 'Bottom';
  if (Math.abs(at - 33.33) < 0.5) return 'Third';
  if (Math.abs(at - 66.67) < 0.5) return 'Two-thirds';
  return '';
}

// ── Snap guide ───────────────────────────────────────────────────────────────

function SnapGuideOverlay({ guide }: { guide: SnapGuide }) {
  const lineStyle: CSSProperties = guide.axis === 'x'
    ? {
        position: 'absolute',
        left: `${guide.at}%`,
        top: 0, bottom: 0,
        width: '2px',
        marginLeft: '-1px',
        background: SNAP_COLOR,
        boxShadow: '0 0 4px rgba(255, 106, 0, 0.55)',
        pointerEvents: 'none',
        animation: 'snapPulse 1.4s ease-in-out infinite',
      }
    : {
        position: 'absolute',
        top: `${guide.at}%`,
        left: 0, right: 0,
        height: '2px',
        marginTop: '-1px',
        background: SNAP_COLOR,
        boxShadow: '0 0 4px rgba(255, 106, 0, 0.55)',
        pointerEvents: 'none',
        animation: 'snapPulse 1.4s ease-in-out infinite',
      };

  const badgeStyle: CSSProperties = guide.axis === 'x'
    ? {
        position: 'absolute',
        left: `${guide.at}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        background: SNAP_COLOR,
        color: '#fff',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 600,
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: '0.02em',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.18)',
      }
    : {
        position: 'absolute',
        top: `${guide.at}%`,
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: SNAP_COLOR,
        color: '#fff',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 600,
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: '0.02em',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.18)',
      };

  return (
    <>
      <div style={lineStyle} aria-hidden />
      {guide.label && <div style={badgeStyle} aria-hidden>{guide.label}</div>}
    </>
  );
}

// ── Block renderer ───────────────────────────────────────────────────────────

type ToolbarAction =
  | 'delete' | 'duplicate' | 'forward' | 'backward'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'link' | 'footnote'
  | 'superscript' | 'subscript' | 'clear-format'
  | 'align-left' | 'align-center' | 'align-right' | 'align-justify'
  | 'crop'
  | 'tbl-row-above' | 'tbl-row-below' | 'tbl-col-left' | 'tbl-col-right' | 'tbl-row-del' | 'tbl-col-del'
  | 'tbl-merge' | 'tbl-split'
  | 'list-bullet' | 'list-number'
  | 'edit-chart';

const RESIZE_POSITIONS: Record<ResizeHandle, { top: string; left: string }> = {
  nw: { top: '0%',   left: '0%' },
  n:  { top: '0%',   left: '50%' },
  ne: { top: '0%',   left: '100%' },
  e:  { top: '50%',  left: '100%' },
  se: { top: '100%', left: '100%' },
  s:  { top: '100%', left: '50%' },
  sw: { top: '100%', left: '0%' },
  w:  { top: '50%',  left: '0%' },
};

function FreeformBlockView({
  block, scrimCtx, selected, showToolbar, cropActive, isDragging, interactive, editing, scrollContainer,
  onPointerDown, onContextMenu, onResizeStart, onRotationStart,
  onDoubleClick, onEndEditing, onTextContentChange, onToolbarAction, onColorChange,
  onFontFamilyChange, onFontSizeChange, onNormalizeImageAspect, onOpenFontPanel, fontPanelOpen,
  selectionCount, onBumpFontSize, onTableRowsChange, onTableSelect, onListItemsChange,
  selMarks, onEditableRef, onCommitRuns, onInlineFormat, onLinkShortcut, onHighlightChange,
}: {
  block: FreeformBlock;
  scrimCtx: ScrimContext;
  selected: boolean;
  showToolbar: boolean;
  /** True when this block is the active crop target. */
  cropActive: boolean;
  /** Total blocks selected — the toolbar renders a bulk variant when >1. */
  selectionCount: number;
  /** Word-style grow/shrink applied to the whole selection. */
  onBumpFontSize: (dir: 1 | -1) => void;
  isDragging: boolean;
  interactive: boolean;
  editing: boolean;
  scrollContainer: HTMLElement | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.PointerEvent, handle: ResizeHandle) => void;
  onRotationStart: (e: React.PointerEvent, blockEl: HTMLElement) => void;
  onDoubleClick: () => void;
  onEndEditing: () => void;
  onTextContentChange: (content: string) => void;
  onTableRowsChange: (rows: string[][]) => void;
  onTableSelect: (range: TblRange | null) => void;
  onListItemsChange: (items: FreeformListBlock['items']) => void;
  onToolbarAction: (action: ToolbarAction) => void;
  onColorChange: (color: string) => void;
  onFontFamilyChange: (family: string) => void;
  onFontSizeChange: (size: number) => void;
  /** Standalone image only — fires once on load with the image's natural
   *  pixel dimensions so the parent can reshape the block to hug the image. */
  onNormalizeImageAspect: (naturalWidth: number, naturalHeight: number) => void;
  /** Opens the Text/Font side panel (Canva-model font field). */
  onOpenFontPanel?: () => void;
  /** True when that panel is open — lights the toolbar font field active. */
  fontPanelOpen?: boolean;
  /** Marks active over the current text selection (null when none) — lights the
   *  text toolbar for the highlighted range. */
  selMarks?: TextRunMarks | null;
  /** Registers this block's contentEditable node while it's the active edit
   *  target so range-format reads the live DOM selection. */
  onEditableRef?: (el: HTMLDivElement | null) => void;
  /** Commit serialised rich-text runs on blur. */
  onCommitRuns?: (runs: TextRun[]) => void;
  /** Ctrl/Cmd+B/I/U while editing. */
  onInlineFormat?: (key: 'bold' | 'italic' | 'underline' | 'strike') => void;
  /** Ctrl/Cmd+K while editing — insert/edit a link. */
  onLinkShortcut?: () => void;
  /** Highlight (background) colour for the selection / whole box. */
  onHighlightChange?: (color: string) => void;
}) {
  const blockRef = useRef<HTMLDivElement>(null);

  // Auto-layout blocks render with `height: auto` so the FreeformLayer's
  // measure-and-adjust effect can read each block's natural rendered size
  // and commit a correct height back to state. After that effect runs,
  // __autoLayout is cleared and the wrapper uses the fixed block.h%.
  const isAutoLayout = !!block.__autoLayout;
  // Text blocks must NEVER hard-clip their content ("text
  // still gets cut off in half"). The auto-layout pass bakes a measured height
  // into each block, but if the measurement ran before the web font loaded —
  // or the block was never auto-laid-out (user text, certain converter blocks)
  // — the baked box can end up shorter than the painted glyphs, and the inner
  // overflow:hidden then slices a line in half. We let text overflow visibly
  // (it spills down at most a line, almost always nothing because auto-layout
  // already sized neighbours) instead of clipping. Frames (image/shape/icon)
  // still clip — that's intentional cropping.
  const isText = block.type === 'text';
  const baseStyle: CSSProperties = {
    position: 'absolute',
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.w}%`,
    height: isAutoLayout ? 'auto' : `${block.h}%`,
    minHeight: isAutoLayout ? `${block.h}%` : undefined,
    transform: `rotate(${block.rotation}deg)`,
    transformOrigin: 'center center',
    zIndex: block.z,
    cursor: !interactive ? 'default' : (block.locked ? 'default' : editing ? 'text' : cropActive ? 'grab' : (isDragging ? 'grabbing' : 'move')),
    // In crop mode the frame reads as a white crop window (the bright kept
    // region); otherwise the normal violet selection outline.
    outline: cropActive ? '1.5px solid #fff' : selected ? `1.5px solid ${VIOLET}` : 'none',
    boxShadow: cropActive ? '0 0 0 1px rgba(15,23,42,0.35), 0 0 0 9999px rgba(15,23,42,0.45)' : undefined,
    boxSizing: 'border-box',
    userSelect: editing ? 'text' : 'none',
    touchAction: 'none',
    pointerEvents: interactive ? 'auto' : 'none',
  };

  return (
    <>
      <div
        ref={blockRef}
        data-freeform-block={block.id}
        style={baseStyle}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        {/* Inner clip wrapper — text/image content gets clipped to the
            block's declared h so it can never visually spill past the
            block boundary (and hence past the card). Resize handles +
            rotation knob live OUTSIDE this wrapper so they're not
            clipped by overflow:hidden. While the block is being edited
            inline (contentEditable text), overflow stays visible so the
            user can see what they're typing past the current h — the
            block's h gets recomputed when editing ends. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: editing || isText ? 'visible' : 'hidden',
            // Match the wrapper's transform / rotation so child clipping
            // happens in the block's own coordinate space.
            pointerEvents: editing ? 'auto' : undefined,
          }}
        >
          {renderBlockContent(block, scrimCtx, editing, onTextContentChange, onEndEditing, onNormalizeImageAspect, onTableRowsChange, onTableSelect, onListItemsChange, onEditableRef ?? (() => {}), onCommitRuns ?? (() => {}), onInlineFormat ?? (() => {}), onLinkShortcut ?? (() => {}))}
        </div>

        {/* Crop mode — rule-of-thirds guide over the kept (bright) region. */}
        {cropActive && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
            {[33.333, 66.666].map((p) => (
              <div key={`v${p}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1, background: 'rgba(255,255,255,0.5)' }} />
            ))}
            {[33.333, 66.666].map((p) => (
              <div key={`h${p}`} style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, height: 1, background: 'rgba(255,255,255,0.5)' }} />
            ))}
          </div>
        )}

        {/* Resize handles + rotation knob — only visible when selected and
            not editing. Rotation knob lives inside the block so it tracks
            rotation; the inline toolbar (below) lives at layer-level so it
            stays horizontal regardless of block rotation. */}
        {selected && !editing && !block.locked && (
          <>
            {(Object.keys(RESIZE_POSITIONS) as ResizeHandle[]).map((h) => {
              const p = RESIZE_POSITIONS[h];
              return (
                <div
                  key={h}
                  aria-label={`Resize from ${h}`}
                  onPointerDown={(e) => onResizeStart(e, h)}
                  style={{
                    position: 'absolute',
                    top: p.top,
                    left: p.left,
                    width: '12px',
                    height: '12px',
                    marginTop: '-6px',
                    marginLeft: '-6px',
                    background: '#ffffff',
                    border: `2px solid ${VIOLET}`,
                    borderRadius: '2px',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.18)',
                    cursor: RESIZE_CURSORS[h],
                    pointerEvents: 'auto',
                    touchAction: 'none',
                    zIndex: 10,
                  }}
                />
              );
            })}

            {/* Rotation knob: 26px stem + 20px gradient circle, centered above
                the top edge. The pointerdown handler captures the block
                element via `blockRef` so the rotation math has a stable
                pivot reference. */}
            <div
              aria-label="Rotate"
              onPointerDown={(e) => {
                if (!blockRef.current) return;
                onRotationStart(e, blockRef.current);
              }}
              style={{
                position: 'absolute',
                left: '50%',
                top: '0%',
                transform: 'translate(-50%, -46px)',
                width: '20px',
                height: '20px',
                background: ROTATION_GRADIENT,
                border: '2px solid #ffffff',
                borderRadius: '50%',
                cursor: 'grab',
                boxShadow: '0 1px 4px rgba(15, 23, 42, 0.22)',
                pointerEvents: 'auto',
                touchAction: 'none',
                zIndex: 10,
              }}
            />
            {/* Rotation knob stem — connects knob to top edge of block. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: '50%',
                top: '0%',
                transform: 'translate(-50%, -26px)',
                width: '1.5px',
                height: '26px',
                background: VIOLET,
                pointerEvents: 'none',
                zIndex: 9,
              }}
            />
          </>
        )}
      </div>

      {/* Inline toolbar — portaled to <body> so it isn't clipped by the
          card's `overflow: hidden`. Mode is contextual: when the block is
          selected (not editing) the toolbar shows structural ops; once the
          user double-clicks a text block to edit, the toolbar morphs to
          show text-formatting ops. One menu, two views. Suppressed during
          multi-select via the `showToolbar` gate. */}
      {showToolbar && (
        <InlineToolbar
          block={block}
          mode={editing ? 'text' : 'box'}
          blockEl={blockRef.current}
          scrollContainer={scrollContainer}
          cropActive={cropActive}
          selectionCount={selectionCount}
          fontPanelOpen={fontPanelOpen}
          selMarks={selMarks}
          onAction={onToolbarAction}
          onColorChange={onColorChange}
          onHighlightChange={onHighlightChange}
          onFontFamilyChange={onFontFamilyChange}
          onFontSizeChange={onFontSizeChange}
          onOpenFontPanel={onOpenFontPanel}
          onBumpFontSize={onBumpFontSize}
        />
      )}
    </>
  );
}

// The contentEditable ↔ runs bridge (serialise / fill / selection offsets) lives
// in lib/card-engine/text-runs-dom.ts — imported at the top of this file — so it
// can be exercised against a real DOM in tests.

/** The block's runs, or a single run synthesised from its plain content — the
 *  starting point when a legacy (runs-less) box is first range-formatted. */
function blockRuns(block: FreeformTextBlock): TextRun[] {
  if (block.runs && block.runs.length) return block.runs;
  return plainToRuns(block.content);
}

/** Paints the link editor's target range as a translucent highlight while the
 *  editor holds focus (the native selection has collapsed). Portaled + fixed. */
function LinkSelectionOverlay({ editable, start, end }: { editable: HTMLElement | null; start: number; end: number }) {
  const [rects, setRects] = useState<DOMRect[]>([]);
  useLayoutEffect(() => {
    if (!editable) { setRects([]); return; }
    const update = () => setRects(rangeClientRects(editable, start, end));
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editable, start, end]);
  if (typeof document === 'undefined' || rects.length === 0) return null;
  return createPortal(
    <>
      {rects.map((r, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: 'fixed', top: r.top, left: r.left, width: r.width, height: r.height,
            background: 'rgba(107,63,160,0.22)', borderRadius: 2, pointerEvents: 'none', zIndex: 2147483000,
          }}
        />
      ))}
    </>,
    document.body,
  );
}

function renderBlockContent(
  block: FreeformBlock,
  scrimCtx: ScrimContext,
  editing: boolean,
  onTextContentChange: (content: string) => void,
  onEndEditing: () => void,
  onNormalizeImageAspect: (naturalWidth: number, naturalHeight: number) => void,
  onTableRowsChange: (rows: string[][]) => void,
  onTableSelect: (range: TblRange | null) => void,
  onListItemsChange: (items: FreeformListBlock['items']) => void,
  onEditableRef: (el: HTMLDivElement | null) => void,
  onCommitRuns: (runs: TextRun[]) => void,
  onInlineFormat: (key: 'bold' | 'italic' | 'underline' | 'strike') => void,
  onLinkShortcut: () => void,
): ReactNode {
  switch (block.type) {
    case 'text':
      return (
        <TextContent
          block={block}
          contrastColor={resolveTextColor(block, scrimCtx)}
          editing={editing}
          onContentChange={onTextContentChange}
          onEndEditing={onEndEditing}
          onEditableRef={onEditableRef}
          onCommitRuns={onCommitRuns}
          onInlineFormat={onInlineFormat}
          onLinkShortcut={onLinkShortcut}
        />
      );
    case 'image':
      return (
        <ImageContent
          block={block}
          behindTextWash={scrimCtx.behindTextWash}
          onNormalizeAspect={onNormalizeImageAspect}
        />
      );
    case 'shape':
      return (
        <ShapeContent
          block={block}
          editing={editing}
          onContentChange={onTextContentChange}
          onEndEditing={onEndEditing}
        />
      );
    case 'icon':
      return <IconContent block={block} />;
    case 'chart':
      return <ChartContent block={block} />;
    case 'table':
      return <TableContent block={block} editing={editing} onRowsChange={onTableRowsChange} onEndEditing={onEndEditing} onSelect={onTableSelect} />;
    case 'list':
      return <ListContent block={block} editing={editing} onItemsChange={onListItemsChange} onEndEditing={onEndEditing} />;
  }
}

function TextContent({
  block, contrastColor, editing, onContentChange, onEndEditing,
  onEditableRef, onCommitRuns, onInlineFormat, onLinkShortcut,
}: {
  block: FreeformTextBlock;
  /** Guaranteed-legible color resolved against this block's effective
   *  background (scrim tone or theme region). Undefined → keep the theme
   *  default (theme color is already legible, or the user set an explicit
   *  color). Applied AFTER the variant default but BEFORE user overrides. */
  contrastColor?: string;
  editing: boolean;
  onContentChange: (content: string) => void;
  onEndEditing: () => void;
  /** Registers this block's contentEditable node with the parent while it's the
   *  active edit target (null on exit) so range-format actions from the toolbar
   *  / shortcuts can read the live DOM selection. */
  onEditableRef?: (el: HTMLDivElement | null) => void;
  /** Commit the serialised rich-text runs on blur (captures typing + marks). */
  onCommitRuns?: (runs: TextRun[]) => void;
  /** Ctrl/Cmd+B/I/U while editing — routed to the same range-format path as the
   *  toolbar buttons. */
  onInlineFormat?: (key: 'bold' | 'italic' | 'underline' | 'strike') => void;
  /** Ctrl/Cmd+K while editing — insert/edit a link on the selection. */
  onLinkShortcut?: () => void;
}) {
  // Variant-driven defaults pull from the active theme via CSS variables that
  // ThemeProvider sets on :root. Heading uses the title gradient (which can
  // be a `linear-gradient(...)` value — clipped to text via the standard
  // background-clip technique). Subheading + paragraph use solid colors.
  // User overrides on block.style.color always win — passed via `overrides`
  // and rendered AFTER variant defaults below.
  const isHeading = block.variant === 'heading';
  const isSubheading = block.variant === 'subheading';
  const isMetric = block.variant === 'metric';
  // Metric (the big "hero number" in a stat cell) borrows the heading's theme
  // title color so the figure reads as the primary mark in its cell.
  const themeColorStyle: CSSProperties = (isHeading || isMetric)
    ? {
        backgroundImage: 'var(--theme-title-color)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
      }
    : isSubheading
      ? { color: 'var(--theme-link-color)' }
      : { color: 'var(--theme-body-color)' };
  const themeFontStyle: CSSProperties = (isHeading || isSubheading || isMetric)
    ? { fontFamily: 'var(--theme-title-font)' }
    : { fontFamily: 'var(--theme-body-font)' };
  const variantStyle: CSSProperties =
    block.variant === 'heading'
      ? { fontSize: '2.4rem', fontWeight: 900, lineHeight: 1.15, ...themeColorStyle, ...themeFontStyle }
      : block.variant === 'subheading'
      ? { fontSize: '1.4rem', fontWeight: 600, lineHeight: 1.3, ...themeColorStyle, ...themeFontStyle }
      : block.variant === 'metric'
      // The big hero number. Centered, heavy (800), tight leading. The exact
      // px size is set per-block by the data-driven engine (adaptive fit), so
      // the rem here is only a fallback when no override is present.
      ? { fontSize: '3rem', fontWeight: 800, lineHeight: 1.05, textAlign: 'center', ...themeColorStyle, ...themeFontStyle }
      : { fontSize: '1rem', fontWeight: 400, lineHeight: 1.6, ...themeColorStyle, ...themeFontStyle };
  // User overrides — applied AFTER variant defaults so an explicit color
  // wins over the theme gradient. If the user sets a solid color on a
  // heading, we also reset the gradient-text properties so the new color
  // actually shows.
  const overrides: CSSProperties = block.style
    ? {
        fontFamily: block.style.fontFamily,
        fontSize: block.style.fontSize ? `${block.style.fontSize}px` : undefined,
        fontWeight: block.style.fontWeight,
        ...(block.style.color
          ? {
              color: block.style.color,
              // Reset the gradient-clip technique so the solid color renders.
              backgroundImage: 'none',
              WebkitTextFillColor: 'initial',
            }
          : block.style.gradient
          ? {
              // Gradient-FILL text: paint the gradient and clip it to the glyphs.
              backgroundImage: block.style.gradient,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }
          : {}),
        ...(block.style.textShadow ? { textShadow: block.style.textShadow } : {}),
        textAlign: block.style.textAlign,
        lineHeight: block.style.lineHeight,
        letterSpacing: block.style.letterSpacing ? `${block.style.letterSpacing}px` : undefined,
        fontStyle: block.style.italic ? 'italic' : undefined,
        textDecoration: block.style.underline ? 'underline' : undefined,
      }
    : {};

  // Contrast guarantee — when the renderer resolved a legible color against
  // the effective background (scrim tone or theme region), apply it as a solid
  // color. For headings this also resets the gradient-clip technique so the
  // solid color actually paints (same reset the user-color override uses).
  const contrastStyle: CSSProperties = contrastColor
    ? {
        color: contrastColor,
        backgroundImage: 'none',
        WebkitTextFillColor: 'initial',
      }
    : {};

  // Vertical centering for single-line labels (hugged pill labels). Flex-center
  // the line within the block's box so it sits on the pill's vertical midline
  // instead of riding the bottom edge. Only when explicitly requested — normal
  // text keeps top-anchored block flow (multi-line top alignment depends on it).
  const vAlignStyle: CSSProperties = block.style?.verticalAlign === 'center'
    ? { display: 'flex', flexDirection: 'column', justifyContent: 'center' }
    : block.style?.verticalAlign === 'bottom'
    ? { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }
    : {};

  const editableRef = useRef<HTMLDivElement>(null);

  // When entering edit mode: fill the editable with the block's runs as a flat
  // span tree (so per-word formatting shows while editing), register the node
  // with the parent, focus, and select all so the first keypress replaces the
  // placeholder. On exit, unregister. The DOM is UNCONTROLLED while editing —
  // React renders no children (see below); the browser + imperative helpers own
  // it, and blur serialises it back to runs. This avoids React reconciling a
  // contentEditable subtree the browser has mutated.
  useEffect(() => {
    if (!editing) return;
    const el = editableRef.current;
    if (!el) return;
    fillEditable(el, blockRuns(block));
    onEditableRef?.(el);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return () => onEditableRef?.(null);
    // Intentionally only on the editing transition — block identity is stable
    // for the life of an edit; runs changes during editing are applied to the
    // DOM imperatively by the format path, not re-run here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  return (
    <div
      // Remount on the edit↔view transition. While editing, the entry effect
      // fills this node imperatively (nodes React doesn't track); without a key
      // change React would keep the element and, on exit, mount its own run
      // spans ALONGSIDE the leftover imperative ones — the text renders twice.
      // A changing key forces a clean unmount (dropping the imperative DOM) then
      // a fresh mount that renders exactly the React children for the new mode.
      key={editing ? 'ce-edit' : 'ce-view'}
      ref={editableRef}
      contentEditable={editing}
      suppressContentEditableWarning
      onPointerDown={(e) => {
        // While editing, pointer events stay with contentEditable so the user
        // can place caret / select text. Stop propagation so the parent
        // block's pointer-down (drag start) doesn't fire on re-clicks.
        if (editing) e.stopPropagation();
      }}
      onBlur={(e) => {
        if (!editing) return;
        // Focus moving INTO the link editor must not end editing — the box stays
        // live so the link applies in place and the selection can be restored.
        const rt = e.relatedTarget as HTMLElement | null;
        if (rt && rt.closest?.('[data-link-editor]')) return;
        // Serialise the edited DOM back to runs (captures typing + inline
        // marks). Keep `content` in sync as the flat plain text.
        const el = e.target as HTMLDivElement;
        const runs = serializeEditable(el);
        const text = runsToPlain(runs);
        if (onCommitRuns) onCommitRuns(runs);
        else if (text !== block.content) onContentChange(text);
        onEndEditing();
      }}
      onPaste={(e) => {
        if (!editing) return;
        // Paste as PLAIN text so the flat run tree (and FR11 grounding) stays
        // clean — matches the prior innerText behaviour.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (text) document.execCommand('insertText', false, text);
      }}
      onKeyDown={(e) => {
        if (!editing) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
          return;
        }
        // Enter inserts a literal newline so the tree stays FLAT (no <div>/<br>
        // wrappers that would desync character offsets). Shift+Enter behaves the
        // same. execCommand('insertText', '\n') keeps the caret correct.
        if (e.key === 'Enter') {
          e.preventDefault();
          document.execCommand('insertText', false, '\n');
          return;
        }
        // Ctrl/Cmd + B / I / U → range-scoped bold / italic / underline.
        // Ctrl/Cmd + K → turn the selection into a link.
        const mod = e.metaKey || e.ctrlKey;
        if (mod && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'b' || k === 'i' || k === 'u') {
            e.preventDefault();
            onInlineFormat?.(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
          } else if (k === 'k') {
            e.preventDefault();
            onLinkShortcut?.();
          }
        }
      }}
      style={{
        width: '100%',
        // Auto-grow vertically when content exceeds the declared height —
        // generated text often runs longer than the converter's heuristic
        // box. `min-height: 100%` keeps the selection-hit area at the user-
        // declared size; overflow: visible lets long text spill rather than
        // get clipped. The user can still resize down to crop deliberately.
        minHeight: '100%',
        height: 'auto',
        padding: '4px',
        overflow: 'visible',
        whiteSpace: 'pre-wrap',
        // Wrap whole words; break a word mid-character ONLY as a last resort
        // (when a single word is wider than the box). The legacy
        // `word-break: break-word` split words too eagerly ("Microso/ft" on
        // titles). The card-engine fit also shrinks so the longest word fits.
        overflowWrap: 'break-word',
        wordBreak: 'normal',
        boxSizing: 'border-box',
        outline: editing ? `1px dashed ${VIOLET}` : 'none',
        cursor: editing ? 'text' : 'inherit',
        // Variant supplies theme-aware color + font + size defaults; the
        // contrast guarantee flips color when the theme default would be
        // illegible against the effective background; user overrides come
        // last so explicit choices always win.
        ...variantStyle,
        ...contrastStyle,
        ...vAlignStyle,
        ...overrides,
      }}
    >
      {/* While EDITING the DOM is uncontrolled — the entry effect fills it and
          the browser owns it, so React renders no children (rendering children
          here would fight the imperative edits + caret). When NOT editing:
          render rich runs as a flat span tree when present (per-word
          formatting), otherwise fall back to the plain content / typewriter
          reveal exactly as before. Different `key` per state forces a clean
          remount instead of partial-text leaks between modes. */}
      {editing
        ? null
        : (block.runs && block.runs.length
          ? block.runs.map((r, i) => (
              r.marks?.link
                ? <a key={i} data-run-index={i} data-m={JSON.stringify(r.marks)} href={linkHref(asLinkTarget(r.marks.link)) || undefined} target="_blank" rel="noopener noreferrer" style={runMarkStyle(r.marks) as CSSProperties}>{r.text}</a>
                : r.marks
                ? <span key={i} data-m={JSON.stringify(r.marks)} style={runMarkStyle(r.marks) as CSSProperties}>{r.text}</span>
                : <span key={i}>{r.text}</span>
            ))
          : block.__animateOnMount
          ? <Typewriter key="ty" text={block.content} speed={55} delay={block.__animateDelay ?? 0} />
          : block.content)}
    </div>
  );
}

// ── Inline toolbar ───────────────────────────────────────────────────────────

// Six-swatch starter palette. Includes the Foxit Slides violet + theme-friendly
// neutrals + a soft accent. Phase B will swap this for the active theme's
// palette so per-deck colors propagate automatically.
const COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: 'Violet', value: '#6B3FA0' },
  { label: 'Magenta', value: '#E267E4' },
  { label: 'Blue', value: '#4198FF' },
  { label: 'Slate dark', value: '#1a1f36' },
  { label: 'Slate mid', value: '#64748b' },
  { label: 'White', value: '#ffffff' },
];

/** Display name for a stored fontFamily value. Handles both the bare-name form
 *  the unified FontBrowser writes ("Inter") and any legacy CSS-stack form
 *  ("Inter, system-ui, sans-serif"). Empty/undefined → the theme default. */
function fontLabel(value?: string): string {
  if (!value) return 'Theme font';
  return value.split(',')[0].replace(/['"]/g, '').trim() || 'Theme font';
}
/** CSS font-family that renders a label IN its own face (so the toolbar field
 *  previews the font like Canva). Empty → inherit the surrounding UI font. */
function fontCss(value?: string): string {
  if (!value) return 'inherit';
  return `'${fontLabel(value)}', system-ui, sans-serif`;
}

/** Font-size steps offered in the text-mode picker. Spans body→display so
 *  the user can resize anything from a caption to a hero title without
 *  cycling 1-by-1. */
const FONT_SIZE_PICKS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72];

// ── Word-style grow / shrink font size ───────────────────────────────────────
// Increase/decrease steps along a ladder so each block moves to the next size
// up/down (16→18, 10→12). RELATIVE per block: bumping a multi-selection keeps a
// 16px header bigger than 10px body — both step up together.
const SIZE_LADDER = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 128];
// Nominal px for a text block with no explicit fontSize, by variant — snapped
// to the ladder so the first bump lands on a clean step. (Mirrors the rem
// variant defaults: heading 2.4rem, subheading 1.4rem, metric 3rem, body 1rem.)
const VARIANT_NOMINAL_PX: Record<string, number> = { heading: 40, subheading: 24, metric: 48, paragraph: 16 };
function effectiveTextSize(block: FreeformTextBlock): number {
  return block.style?.fontSize ?? VARIANT_NOMINAL_PX[block.variant] ?? 16;
}
function bumpSize(current: number, dir: 1 | -1): number {
  if (dir > 0) return SIZE_LADDER.find((s) => s > current) ?? current;
  const below = SIZE_LADDER.filter((s) => s < current);
  return below.length ? below[below.length - 1] : current;
}

function InlineToolbar({
  block, mode, blockEl, scrollContainer, cropActive = false, selectionCount = 1, fontPanelOpen = false, selMarks = null, onAction, onColorChange, onHighlightChange, onFontFamilyChange, onFontSizeChange, onOpenFontPanel, onBumpFontSize,
}: {
  block: FreeformBlock;
  mode: 'box' | 'text';
  blockEl: HTMLElement | null;
  scrollContainer: HTMLElement | null;
  /** Number of blocks currently selected. >1 renders the bulk toolbar. */
  selectionCount?: number;
  /** Word-style grow/shrink, applied to the whole selection. */
  onBumpFontSize?: (dir: 1 | -1) => void;
  /** True when THIS block is the active crop target — flips the Crop button to
   *  its lit "Done cropping" state. */
  cropActive?: boolean;
  /** Marks active over the current text selection (null when none). When set,
   *  the text toolbar reflects the HIGHLIGHTED range instead of the whole box. */
  selMarks?: TextRunMarks | null;
  onAction: (a: ToolbarAction) => void;
  onColorChange: (color: string) => void;
  onHighlightChange?: (color: string) => void;
  onFontFamilyChange: (family: string) => void;
  onFontSizeChange: (size: number) => void;
  /** Canva model: the font field opens the Text/Font side panel (the single
   *  visual font browser) instead of an inline dropdown. */
  onOpenFontPanel?: () => void;
  /** True when that Text/Font panel is open — lights the font field active. */
  fontPanelOpen?: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);

  // Track block's screen position via getBoundingClientRect. Updates on
  // scroll + resize so the toolbar stays anchored as the user scrolls.
  // Mirrors the existing CardToolbar pattern.
  useLayoutEffect(() => {
    if (!blockEl) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = blockEl.getBoundingClientRect();
      const toolbarGap = 12;
      const approxToolbarHeight = 44;
      // Anchor above the block by default; flip below if the block is too
      // close to the top of the viewport for the toolbar to fit.
      const wantedTop = rect.top - approxToolbarHeight - toolbarGap;
      const top = wantedTop < 8 ? rect.bottom + toolbarGap : wantedTop;
      const left = rect.left + rect.width / 2;
      setPos({ top, left });
    };
    update();
    const scrollTarget: EventTarget = scrollContainer ?? window;
    scrollTarget.addEventListener('scroll', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scrollTarget.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [blockEl, scrollContainer, block.x, block.y, block.w, block.h, block.rotation]);

  if (!pos) return null;
  if (typeof document === 'undefined') return null;

  const isText = block.type === 'text';
  const isIcon = block.type === 'icon';
  const isShape = block.type === 'shape';
  // Current color for the picker preview swatch.
  const currentColor = isIcon
    ? (block.color ?? VIOLET)
    : isShape
      ? (block.fill ?? VIOLET)
      : isText
        ? (block.style?.color ?? '#1a1f36')
        : VIOLET;
  const showColorBtn = isIcon || isShape || (mode === 'text' && isText);

  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      // Critical: preventDefault on mousedown stops the browser from moving
      // focus to the toolbar. Without this, clicking any toolbar button while
      // editing a text block blurs the contentEditable → onBlur fires →
      // editing mode ends → toolbar morphs from text-mode to box-mode mid-
      // click, and the formatting button you clicked is no longer the
      // button under the cursor when mouseup fires. The actual formatting
      // does apply on the first click, but the morph makes it look like
      // "nothing happened" because the next click lands on a different
      // button. preventDefault here keeps the contentEditable focused.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '4px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.10)',
        animation: 'toolbarFadeIn 180ms ease-out',
        pointerEvents: 'auto',
        zIndex: 2147483000,
        whiteSpace: 'nowrap',
      }}
    >
      {block.type === 'chart' ? (
        // ── Chart toolbar — a labeled button opens the Chart Data-Table editor ──
        <>
          <button
            type="button" title="Edit chart data" aria-label="Edit chart data"
            onClick={() => onAction('edit-chart')}
            style={{ height: '28px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', border: 'none', borderRadius: '6px', background: 'transparent', color: '#0f172a', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <BarChart3 size={15} /> Edit chart
          </button>
          <Divider />
          <ToolbarBtn title="Duplicate" onClick={() => onAction('duplicate')}><Copy size={14} /></ToolbarBtn>
          <ToolbarBtn title="Delete chart" onClick={() => onAction('delete')}><Trash2 size={14} /></ToolbarBtn>
        </>
      ) : block.type === 'list' ? (
        // ── List toolbar — marker toggle + duplicate/delete ──
        <>
          <ToolbarBtn title="Bulleted" onClick={() => onAction('list-bullet')}><List size={16} color={block.marker !== 'number' && block.marker !== 'none' ? '#2B5FE3' : undefined} /></ToolbarBtn>
          <ToolbarBtn title="Numbered" onClick={() => onAction('list-number')}><ListOrdered size={16} color={block.marker === 'number' ? '#2B5FE3' : undefined} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn title="Duplicate" onClick={() => onAction('duplicate')}><Copy size={14} /></ToolbarBtn>
          <ToolbarBtn title="Delete list" onClick={() => onAction('delete')}><Trash2 size={14} /></ToolbarBtn>
        </>
      ) : block.type === 'table' ? (
        // ── Table toolbar (Confluence-style icons) — shown selected OR editing ──
        <>
          <ToolbarBtn title="Insert row above" onClick={() => onAction('tbl-row-above')}><IcRowAbove size={16} /></ToolbarBtn>
          <ToolbarBtn title="Insert row below" onClick={() => onAction('tbl-row-below')}><IcRowBelow size={16} /></ToolbarBtn>
          <ToolbarBtn title="Insert column left" onClick={() => onAction('tbl-col-left')}><IcColLeft size={16} /></ToolbarBtn>
          <ToolbarBtn title="Insert column right" onClick={() => onAction('tbl-col-right')}><IcColRight size={16} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn title="Merge selected cells" onClick={() => onAction('tbl-merge')}><TableCellsMerge size={16} /></ToolbarBtn>
          <ToolbarBtn title="Split merged cell" onClick={() => onAction('tbl-split')}><TableCellsSplit size={16} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn title="Delete row" onClick={() => onAction('tbl-row-del')}><IcRowDelete size={17} /></ToolbarBtn>
          <ToolbarBtn title="Delete column" onClick={() => onAction('tbl-col-del')}><IcColDelete size={17} /></ToolbarBtn>
          <Divider />
          <ToolbarBtn title="Duplicate" onClick={() => onAction('duplicate')}><Copy size={14} /></ToolbarBtn>
          <ToolbarBtn title="Delete table" onClick={() => onAction('delete')}><Trash2 size={14} /></ToolbarBtn>
        </>
      ) : mode === 'box' ? (
        selectionCount > 1 ? (
          // ── Bulk toolbar for a multi-selection ──────────────────────────
          // Font (opens the panel → applies to all) + Word-style grow/shrink
          // (steps every selected text block's size relative to its own).
          <>
            <FontFieldButton
              current={block.type === 'text' ? block.style?.fontFamily : undefined}
              active={fontPanelOpen}
              onOpen={onOpenFontPanel}
            />
            <Divider />
            <ToolbarBtn title="Decrease font size" onClick={() => onBumpFontSize?.(-1)}><AArrowDown size={16} /></ToolbarBtn>
            <ToolbarBtn title="Increase font size" onClick={() => onBumpFontSize?.(1)}><AArrowUp size={16} /></ToolbarBtn>
          </>
        ) : (
        <>
          {/* Crop leads the image toolbar (Canva model) — the one mode-changing
              action, isolated by a divider. Lit violet while cropping. */}
          {block.type === 'image' && !!block.src && (
            <>
              <ToolbarBtn
                title={cropActive ? 'Done cropping' : 'Crop image'}
                active={cropActive}
                onClick={() => onAction('crop')}
              >
                {cropActive ? <CheckIcon size={15} /> : <CropIcon size={15} />}
              </ToolbarBtn>
              <Divider />
            </>
          )}
          {/* Type-specific controls first when relevant — icon/shape get a
              color picker. Text blocks defer color to text mode. */}
          {showColorBtn && (
            <>
              <ColorPickerButton
                currentColor={currentColor}
                open={colorOpen}
                onToggle={() => setColorOpen((v) => !v)}
                onSelect={(c) => { onColorChange(c); setColorOpen(false); }}
                onApply={(c) => onColorChange(c)}
              />
              <Divider />
            </>
          )}
          <ToolbarBtn title="Delete" onClick={() => onAction('delete')}><Trash2 size={14} /></ToolbarBtn>
          <ToolbarBtn title="Duplicate" onClick={() => onAction('duplicate')}><Copy size={14} /></ToolbarBtn>
          <ToolbarBtn title="Bring forward" onClick={() => onAction('forward')}><ArrowUp size={14} /></ToolbarBtn>
          <ToolbarBtn title="Send backward" onClick={() => onAction('backward')}><ArrowDown size={14} /></ToolbarBtn>
          {/* Whole-box text formatting for an OBJECT-selected text box: with no
              in-box text selection, these apply to the ENTIRE box content
              (applyTextFormat routes to box scope). Grow/shrink steps the size. */}
          {isText && (
            <>
              <Divider />
              <ToolbarBtn title="Bold" active={textMarkActive(block, 'bold', null)} onClick={() => onAction('bold')}><Bold size={14} /></ToolbarBtn>
              <ToolbarBtn title="Italic" active={textMarkActive(block, 'italic', null)} onClick={() => onAction('italic')}><Italic size={14} /></ToolbarBtn>
              <ToolbarBtn title="Underline" active={textMarkActive(block, 'underline', null)} onClick={() => onAction('underline')}><UnderlineIcon size={14} /></ToolbarBtn>
              <ToolbarBtn title="Strikethrough" active={textMarkActive(block, 'strike', null)} onClick={() => onAction('strike')}><Strikethrough size={14} /></ToolbarBtn>
              <ColorPickerButton
                currentColor={currentColor}
                open={colorOpen}
                onToggle={() => setColorOpen((v) => !v)}
                onSelect={(c) => { onColorChange(c); setColorOpen(false); }}
                onApply={(c) => onColorChange(c)}
              />
              <Divider />
              <ToolbarBtn title="Decrease font size" onClick={() => onBumpFontSize?.(-1)}><AArrowDown size={16} /></ToolbarBtn>
              <ToolbarBtn title="Increase font size" onClick={() => onBumpFontSize?.(1)}><AArrowUp size={16} /></ToolbarBtn>
            </>
          )}
        </>
        )
      ) : (
        // mode === 'text' — only relevant for text blocks (other types can't
        // enter edit mode), but guard anyway.
        isText && (
          <>
            <FontFieldButton
              current={block.style?.fontFamily}
              active={fontPanelOpen}
              onOpen={onOpenFontPanel}
            />
            <FontSizePicker
              current={block.style?.fontSize}
              variant={block.variant}
              open={sizeOpen}
              onToggle={() => setSizeOpen((v) => !v)}
              onSelect={(size) => { onFontSizeChange(size); setSizeOpen(false); }}
            />
            <Divider />
            <ToolbarBtn title="Bold" active={textMarkActive(block, 'bold', selMarks)} onClick={() => onAction('bold')}><Bold size={14} /></ToolbarBtn>
            <ToolbarBtn title="Italic" active={textMarkActive(block, 'italic', selMarks)} onClick={() => onAction('italic')}><Italic size={14} /></ToolbarBtn>
            <ToolbarBtn title="Underline" active={textMarkActive(block, 'underline', selMarks)} onClick={() => onAction('underline')}><UnderlineIcon size={14} /></ToolbarBtn>
            <ToolbarBtn title="Strikethrough" active={textMarkActive(block, 'strike', selMarks)} onClick={() => onAction('strike')}><Strikethrough size={14} /></ToolbarBtn>
            <ToolbarBtn title="Link (⌘K)" active={!!selMarks?.link} onClick={() => onAction('link')}><LinkIcon size={14} style={{ transform: 'rotate(-45deg)' }} /></ToolbarBtn>
            <Divider />
            <AlignPicker
              current={block.style?.textAlign ?? 'left'}
              open={alignOpen}
              onToggle={() => setAlignOpen((v) => !v)}
              onSelect={(a) => { onAction(a); setAlignOpen(false); }}
            />
            <Divider />
            <ColorPickerButton
              currentColor={currentColor}
              open={colorOpen}
              onToggle={() => setColorOpen((v) => !v)}
              onSelect={(c) => { onColorChange(c); setColorOpen(false); }}
              onApply={(c) => onColorChange(c)}
            />
            <ToolbarBtn title="Highlight" active={!!selMarks?.highlight} onClick={() => onHighlightChange?.(selMarks?.highlight ? '' : '#FDE047')}><Highlighter size={14} /></ToolbarBtn>
            <Divider />
            {/* Overflow (Option B): the rare + new controls live in ⋯ so the
                inline row stays fixed-width and Phase 4 has a home. */}
            <MoreMenu
              open={moreOpen}
              onToggle={() => setMoreOpen((v) => !v)}
              items={[
                { icon: <SuperscriptIcon size={14} />, label: 'Superscript', active: !!selMarks?.superscript, onClick: () => onAction('superscript') },
                { icon: <SubscriptIcon size={14} />, label: 'Subscript', active: !!selMarks?.subscript, onClick: () => onAction('subscript') },
                { icon: <FootnoteIcon size={14} />, label: 'Footnote (link)', onClick: () => onAction('footnote') },
                { divider: true },
                { icon: <RemoveFormatting size={14} />, label: 'Clear formatting', onClick: () => onAction('clear-format') },
              ]}
            />
          </>
        )
      )}
    </div>,
    document.body,
  );
}

/** Canva-model font field: shows the current font in its own face and OPENS
 *  the Text/Font side panel (the single visual font browser) on click —
 *  no inline dropdown list. */
function FontFieldButton({ current, active = false, onOpen }: { current?: string; active?: boolean; onOpen?: () => void }) {
  // No chevron — this is a button that opens the Text/Font panel, not a
  // dropdown. It lights violet while that panel is open (active).
  return (
    <button
      type="button"
      title="Font — opens the Text panel"
      aria-label={`Font: ${fontLabel(current)}. Opens the font panel.`}
      aria-pressed={active}
      onClick={() => onOpen?.()}
      style={{
        height: '28px',
        display: 'inline-flex', alignItems: 'center',
        padding: '0 10px',
        background: active ? 'var(--theme-chrome-active, rgba(107,63,160,0.10))' : '#fff',
        border: `1px solid ${active ? VIOLET : '#e2e8f0'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        color: active ? VIOLET : '#334155',
        minWidth: '92px', maxWidth: '150px',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = '#a78bfa'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = '#e2e8f0'; }}
    >
      <span style={{
        flex: 1, textAlign: 'left',
        fontFamily: fontCss(current),
        fontSize: '13px', fontWeight: 500,
        color: active ? VIOLET : undefined,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {fontLabel(current)}
      </span>
    </button>
  );
}

function FontSizePicker({
  current, variant, open, onToggle, onSelect,
}: {
  current: number | undefined;
  variant: FreeformTextVariant;
  open: boolean;
  onToggle: () => void;
  onSelect: (size: number) => void;
}) {
  // Variant default — shown when no explicit override. Matches the variant
  // styles in TextContent (heading = 2.4rem ≈ 38, subheading = 1.4rem ≈ 22,
  // paragraph = 1rem = 16).
  const variantDefault = variant === 'heading' ? 38 : variant === 'metric' ? 48 : variant === 'subheading' ? 22 : 16;
  const display = current ?? variantDefault;
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        title="Font size"
        aria-label="Font size"
        onClick={onToggle}
        style={{
          height: '28px',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '0 8px',
          background: 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          color: '#334155',
          fontSize: '0.78rem', fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontVariantNumeric: 'tabular-nums',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span>{display}</span>
        <ChevronDown size={10} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '70px',
            maxHeight: '240px',
            overflowY: 'auto',
            padding: '4px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.10)',
            zIndex: 2147483001,
          }}
        >
          {FONT_SIZE_PICKS.map((s) => {
            const active = current === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onSelect(s)}
                style={{
                  display: 'block', width: '100%',
                  padding: '6px 10px',
                  textAlign: 'left',
                  background: active ? 'rgba(107, 63, 160, 0.10)' : 'transparent',
                  color: active ? '#6B3FA0' : '#1a1f36',
                  border: 'none', borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: active ? 600 : 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Color math (HSV ⇄ hex) for the inline color wheel ────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [107, 63, 160];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

/** Inline HSV color wheel — hue around the circle, saturation from center to
 *  edge, with a brightness slider beneath. Click/drag to pick; emits hex.
 *, not the OS dialog). */
function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const SIZE = 140;
  const wheelRef = useRef<HTMLDivElement>(null);
  const valRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(value));
  const lastEmit = useRef<string>(value);
  // Re-sync from external changes (a swatch / eyedropper pick) without
  // clobbering the user's in-progress drag.
  useEffect(() => {
    if (value !== lastEmit.current) { setHsv(hexToHsv(value)); lastEmit.current = value; }
  }, [value]);
  const [h, s, v] = hsv;
  const emit = (nh: number, ns: number, nv: number) => {
    const hex = hsvToHex(nh, ns, nv);
    lastEmit.current = hex;
    setHsv([nh, ns, nv]);
    onChange(hex);
  };
  const pickFromPoint = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = clientX - cx, dy = clientY - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ns = Math.max(0, Math.min(1, r / (rect.width / 2)));
    const nh = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    emit(nh, ns, v);
  };
  const pickValue = (clientX: number) => {
    const el = valRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    emit(h, s, Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };
  const maxR = SIZE / 2;
  const ang = ((h - 90) * Math.PI) / 180;
  const mx = SIZE / 2 + s * maxR * Math.cos(ang);
  const my = SIZE / 2 + s * maxR * Math.sin(ang);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        ref={wheelRef}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickFromPoint(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons) pickFromPoint(e.clientX, e.clientY); }}
        style={{
          position: 'relative', width: SIZE, height: SIZE, borderRadius: '50%', cursor: 'crosshair',
          background: 'radial-gradient(circle closest-side, #fff, rgba(255,255,255,0) 100%), conic-gradient(from 0deg, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))',
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.12)',
          touchAction: 'none',
        }}
      >
        {/* Wheel stays full-brightness (no value veil) — hue/saturation here,
            brightness on the slider below.. The marker
            shows the final color (incl. brightness) so darkness still reads. */}
        <div aria-hidden style={{ position: 'absolute', left: mx, top: my, width: 12, height: 12, transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.45)', background: value, pointerEvents: 'none' }} />
      </div>
      <div
        ref={valRef}
        role="slider"
        aria-label="Brightness"
        aria-valuenow={Math.round(v * 100)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickValue(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) pickValue(e.clientX); }}
        style={{
          position: 'relative', width: SIZE, height: 14, borderRadius: 7, cursor: 'pointer', touchAction: 'none',
          background: `linear-gradient(to right, #000, ${hsvToHex(h, s, 1)})`,
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.12)',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', left: `${v * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.45)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

// Eyedropper API typing (not in the default TS DOM lib). Accessed via an
// unknown-cast to stay off `any` (Hard Constraint) and degrade gracefully
// where unsupported (Firefox/Safari).
type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };

const CUSTOM_COLORS_KEY = 'foxitSlides.customColors';

function ColorPickerButton({
  currentColor, open, onToggle, onSelect, onApply,
}: {
  currentColor: string;
  open: boolean;
  onToggle: () => void;
  /** Apply + close the popover (swatch clicks). */
  onSelect: (color: string) => void;
  /** Apply WITHOUT closing — used by the wheel/slider/eyedropper so the user
   * can keep dragging/adjusting.
   *  dismissing the popover). */
  onApply: (color: string) => void;
}) {
  // Persisted quick-select palette of colors the user has added (via the
  // wheel or eyedropper)..
  const [customColors, setCustomColors] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_COLORS_KEY);
      if (raw) setCustomColors(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
  }, []);
  const addCustom = useCallback((hex: string) => {
    const norm = hex.toLowerCase();
    setCustomColors((prev) => {
      if (prev.includes(norm)) return prev;
      const next = [norm, ...prev].slice(0, 18);
      try { window.localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const eyeDropper = typeof window !== 'undefined'
    ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
    : undefined;
  const pickWithEyedropper = useCallback(async () => {
    if (!eyeDropper) return;
    try {
      const { sRGBHex } = await new eyeDropper().open();
      onApply(sRGBHex);
      addCustom(sRGBHex);
    } catch { /* user cancelled */ }
  }, [eyeDropper, onApply, addCustom]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        title="Color"
        aria-label="Color"
        onClick={onToggle}
        style={{
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Preview swatch — shows the current color so the user knows what
            they're changing from. White ring around it for visibility on
            light fills. */}
        <span style={{
          display: 'inline-block',
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          background: currentColor,
          boxShadow: 'inset 0 0 0 1px rgba(15, 23, 42, 0.15)',
        }} />
      </button>
      {open && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          // Same focus-preservation pattern as the parent toolbar — clicking
          // a swatch must not blur the contentEditable behind it. (The wheel
          // <input> and eyedropper open separate OS/async UIs, so they're
          // unaffected by mousedown-prevent.)
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '10px',
            width: '160px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            zIndex: 2147483001,
          }}
        >
          {/* Visual HSV wheel + brightness slider — applies without closing so
              the user can drag freely. */}
          <ColorWheel value={currentColor} onChange={onApply} />

          {/* Swatch grid — starter palette + the user's saved custom colors,
              plus a "+" that saves the current wheel color to the palette. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '5px' }}>
            {[...COLOR_SWATCHES.map((s) => s.value), ...customColors].map((value, i) => (
              <button
                key={`${value}-${i}`}
                type="button"
                title={value}
                aria-label={value}
                onClick={() => onSelect(value)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  background: value,
                  border: value.toLowerCase() === currentColor.toLowerCase()
                    ? '2px solid #6B3FA0'
                    : '1px solid rgba(15, 23, 42, 0.18)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
            <button
              type="button"
              title="Save current color to palette"
              aria-label="Save current color to palette"
              onClick={() => addCustom(currentColor)}
              style={{
                width: '20px', height: '20px', borderRadius: '4px', cursor: 'pointer',
                border: '1px dashed rgba(15, 23, 42, 0.30)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#64748b', background: 'transparent', padding: 0,
              }}
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Eyedropper (clone any on-screen color) + live hex code. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {eyeDropper && (
              <button
                type="button"
                title="Eyedropper — sample a color from the screen"
                aria-label="Eyedropper"
                onClick={pickWithEyedropper}
                style={{
                  width: '28px', height: '28px', flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0',
                  borderRadius: '6px', background: '#ffffff', color: '#334155', cursor: 'pointer',
                }}
              >
                <Pipette size={14} />
              </button>
            )}
            <span style={{
              flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '12px', color: '#475569', textTransform: 'uppercase',
              padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px',
              background: '#f8fafc', textAlign: 'center', letterSpacing: '0.02em',
            }}>{currentColor}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  title, active, onClick, children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(107, 63, 160, 0.10)' : 'transparent',
        color: active ? VIOLET : '#334155',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div aria-hidden style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />;
}

type AlignValue = 'left' | 'center' | 'right' | 'justify';
const ALIGN_ICON: Record<AlignValue, ReactNode> = {
  left: <AlignLeft size={15} />,
  center: <AlignCenter size={15} />,
  right: <AlignRight size={15} />,
  justify: <AlignJustify size={15} />,
};
const ALIGN_ACTION: Record<AlignValue, ToolbarAction> = {
  left: 'align-left', center: 'align-center', right: 'align-right', justify: 'align-justify',
};

/** Collapsed alignment control (design-table pick): a trigger showing the
 *  CURRENT alignment + a chevron, opening a compact horizontal row of the four
 *  align glyphs. Reuses the picker popover mechanics (stopPropagation +
 *  preventDefault keep the editable focused). */
function AlignPicker({ current, open, onToggle, onSelect }: {
  current: AlignValue;
  open: boolean;
  onToggle: () => void;
  onSelect: (a: ToolbarAction) => void;
}) {
  const order: AlignValue[] = ['left', 'center', 'right', 'justify'];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        title={`Align: ${current}`}
        aria-label={`Text alignment: ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          padding: '0 5px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: open ? 'rgba(107,63,160,0.10)' : 'transparent',
          color: open ? VIOLET : '#334155', transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'rgba(15,23,42,0.05)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        {ALIGN_ICON[current]}
        <ChevronDown size={10} style={{ opacity: 0.55 }} />
      </button>
      {open && (
        <div
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, display: 'flex', gap: 2,
            padding: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(15,23,42,0.14)', zIndex: 2147483001,
          }}
        >
          {order.map((a) => (
            <button
              key={a}
              type="button"
              role="menuitemradio"
              aria-checked={current === a}
              title={`Align ${a}`}
              aria-label={`Align ${a}`}
              onClick={() => onSelect(ALIGN_ACTION[a])}
              style={{
                width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: current === a ? 'rgba(107,63,160,0.10)' : 'transparent',
                color: current === a ? VIOLET : '#334155',
              }}
              onMouseEnter={(e) => { if (current !== a) e.currentTarget.style.background = 'rgba(15,23,42,0.05)'; }}
              onMouseLeave={(e) => { if (current !== a) e.currentTarget.style.background = 'transparent'; }}
            >
              {ALIGN_ICON[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type MoreItem = { divider: true } | { icon: ReactNode; label: string; active?: boolean; danger?: boolean; onClick: () => void };

/** Overflow "⋯ More" menu — the Option-B home for rare + future text controls.
 *  A ⋯ trigger that drops a labelled list, mirroring the color/size picker
 *  popover mechanics (stopPropagation + preventDefault keep the editable
 *  focused). Labelled rows, not icon-only, since these are the least-used
 *  controls and labels are the discoverability payment for hiding them. */
function MoreMenu({ open, onToggle, items }: { open: boolean; onToggle: () => void; items: MoreItem[] }) {
  return (
    <div style={{ position: 'relative' }}>
      <ToolbarBtn title="More" active={open} onClick={onToggle}><MoreHorizontal size={14} /></ToolbarBtn>
      {open && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 210,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(15,23,42,0.14)', padding: '6px', zIndex: 2147483001,
          }}
        >
          {items.map((it, i) => (
            'divider' in it ? (
              <div key={i} aria-hidden style={{ height: 1, background: '#eef1f6', margin: '6px 0' }} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => { it.onClick(); onToggle(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 32,
                  padding: '0 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: it.active ? 'rgba(107,63,160,0.10)' : 'transparent',
                  color: it.danger ? '#dc2626' : it.active ? VIOLET : '#334155',
                  fontSize: '13px', fontWeight: 500, textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (!it.active) e.currentTarget.style.background = 'rgba(15,23,42,0.05)'; }}
                onMouseLeave={(e) => { if (!it.active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flex: 'none' }}>{it.icon}</span>
                {it.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

/** True when the text block's effective font weight is bold (≥ 700). */
function isTextBold(block: FreeformTextBlock): boolean {
  const variantDefault = block.variant === 'heading' ? 900 : block.variant === 'metric' ? 800 : block.variant === 'subheading' ? 600 : 400;
  const effective = block.style?.fontWeight ?? variantDefault;
  return effective >= 700;
}

/** Toolbar lit-state for a boolean text mark. Reflects the highlighted SELECTION
 *  when one exists (selMarks), otherwise the whole-box state (per-run uniformity
 *  when the box has runs, else the legacy block.style flags). */
function textMarkActive(
  block: FreeformBlock,
  key: 'bold' | 'italic' | 'underline' | 'strike',
  selMarks: TextRunMarks | null,
): boolean {
  if (block.type !== 'text') return false;
  if (selMarks) return !!selMarks[key];
  if (block.runs && block.runs.length) return isMarkUniformAll(block.runs, key);
  switch (key) {
    case 'bold': return isTextBold(block);
    case 'italic': return !!block.style?.italic;
    case 'underline': return !!block.style?.underline;
    default: return false;
  }
}

function ImageContent({
  block,
  behindTextWash = false,
  onNormalizeAspect,
}: {
  block: FreeformImageBlock;
  /** True when this slide's FINAL imageRole is texture/background — the photo
   *  must render as a faint wash regardless of what block.opacity got set to at
   *  placement time (provisional role may have differed). Render-time wins for
   *  these roles; otherwise block.opacity (column/band/manual) is honored. */
  behindTextWash?: boolean;
  /** Fires once the image loads, with its natural pixel dimensions, so a
   *  standalone (contain) block can reshape itself to hug the image. */
  onNormalizeAspect?: (naturalWidth: number, naturalHeight: number) => void;
}) {
  const shape = block.frameShape ?? 'rectangle';

  // Wash roles always render at 0.18 (computed from the resolved role at render
  // time, immune to the streaming/final role mismatch); everything else falls
  // back to block.opacity (undefined = fully opaque).
  const effectiveOpacity = behindTextWash ? 0.18 : block.opacity;

  // Device-frame branch — laptop renders authored chrome SVG with the
  // image clipped to the screen content area. The component handles BOTH
  // empty (placeholder icon inside the screen) and filled states.
  if (shape === 'laptop') {
    return (
      <LaptopFrame
        src={block.src || undefined}
        alt={block.alt}
        fit={block.fit ?? 'cover'}
      />
    );
  }

  // Device mockup — manifest-driven chrome (phone / tablet / laptop). The
  // dropped image snaps into the device's inner screen rect. Empty state shows
  // the placeholder glyph inside the screen.
  if (shape === 'device') {
    return (
      <DeviceFrame
        deviceId={block.deviceId}
        src={block.src || undefined}
        alt={block.alt}
        fit={block.fit ?? 'cover'}
      />
    );
  }

  // Geometric branch — image (or placeholder) clipped via CSS clip-path.
  const clipPath = FRAME_CLIP_PATHS[shape] ?? undefined;

  // Empty ICON slot — a small pictogram placeholder. Renders a rounded dashed
  // tile with a "shapes" glyph and NO label (too small for text), so it clearly
  // reads as an icon slot rather than the generic photo "Image placeholder".
  if (!block.src && block.slotKind === 'icon') {
    return (
      <div
        aria-label="Icon placeholder — click to choose a pictogram"
        data-image-placeholder
        data-icon-placeholder
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(107, 63, 160, 0.06)',
          border: '1.5px dashed rgba(107, 63, 160, 0.45)',
          borderRadius: '24%',
          color: 'rgba(107, 63, 160, 0.75)',
          pointerEvents: 'none',
          userSelect: 'none',
          containerType: 'inline-size',
        }}
      >
        <Shapes size="58%" strokeWidth={1.6} style={{ maxWidth: 40, maxHeight: 40 }} />
      </div>
    );
  }

  // Empty placeholder — shape-aware. The dashed outline mirrors the frame
  // shape because clip-path is applied to the wrapper. For rectangle (no
  // clip), the dashed border renders normally; for circle/heart/etc., the
  // clip-path masks the wrapper into the shape.
  if (!block.src) {
    return (
      <div
        aria-label={`${FRAME_LABELS[shape]} frame — click to choose an image`}
        data-image-placeholder
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6%',
          padding: '6%',
          // Rectangle uses a CSS border for the dashed outline. Other
          // shapes get an inline SVG outline overlay so the dashed
          // border follows the shape (border-style doesn't follow
          // clip-path); the wrapper here just hosts the fill bg.
          background: 'rgba(107, 63, 160, 0.04)',
          border: shape === 'rectangle' ? '1.5px dashed rgba(107, 63, 160, 0.30)' : 'none',
          borderRadius: shape === 'rounded' ? '6%' : undefined,
          color: 'rgba(107, 63, 160, 0.65)',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 'clamp(10px, 2.5cqw, 13px)',
          fontWeight: 500,
          pointerEvents: 'none',
          userSelect: 'none',
          textAlign: 'center',
          // container-type lets the inline font-size scale with the block.
          containerType: 'inline-size',
          // Geometric clip-path (circle / heart / hexagon) applied to the
          // wrapper. Rectangle + rounded use border/border-radius above so
          // the border stays a solid dashed line; clip-path on those would
          // erase the dashed edge.
          clipPath: shape === 'rectangle' || shape === 'rounded' ? undefined : clipPath,
        }}
      >
        <ImageIcon size="32%" strokeWidth={1.4} style={{ maxWidth: 56, maxHeight: 56 }} />
        <span>Image placeholder</span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={block.src}
      alt={block.alt ?? ''}
      onLoad={(e) => {
        // Standalone (contain) images reshape the block to their true aspect
        // so the frame hugs — region (cover) images fill their box and don't
        // need it. The parent gates on fit === 'cover' too; this is the
        // earliest point the natural dims are reliably available.
        if ((block.fit ?? 'cover') === 'cover') return;
        const t = e.currentTarget;
        if (t.naturalWidth > 0 && t.naturalHeight > 0) {
          onNormalizeAspect?.(t.naturalWidth, t.naturalHeight);
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit: block.fit ?? 'cover',
        objectPosition: `${block.panX ?? 50}% ${block.panY ?? 50}%`,
        display: 'block',
        pointerEvents: 'none',
        userSelect: 'none',
        clipPath,
        // Rounded uses border-radius (snappier than clip-path on resize).
        borderRadius: shape === 'rounded' ? '6%' : undefined,
        // Image opacity. For texture/background roles this is forced to 0.18 at
        // RENDER time (behindTextWash) so the photo reads as a faint wash under
        // the theme's normal text — correct even when the placement-time role
        // was provisional and block.opacity is missing. Other cases fall back
        // to block.opacity (column/band/manual; undefined = fully opaque, the
        // duotone/full-bleed rich-photo default)..
        opacity: effectiveOpacity,
      }}
      draggable={false}
    />
  );
}

/** True when the hex color is bright enough that white text wouldn't read.
 *  Used to pick the default text color for text-inside-shape. */
function isLightFill(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // YIQ-style luminance, >186 = "light"
  return (r * 299 + g * 587 + b * 114) / 1000 > 186;
}

function ShapeContent({
  block, editing, onContentChange, onEndEditing,
}: {
  block: FreeformShapeBlock;
  editing: boolean;
  onContentChange: (content: string) => void;
  onEndEditing: () => void;
}) {
  const fill = block.fill ?? VIOLET;
  const stroke = block.stroke ?? 'transparent';
  const strokeWidth = block.strokeWidth ?? 0;

  // Inline text overlay for rectangle/circle.
  // a shape to wrap text inside; the text centers vertically + horizontally
  // and contrasts the fill by default. Only applies to closed shapes
  // (rectangle, circle); line + arrow stay text-free.
  const canHoldText = block.shape === 'rectangle' || block.shape === 'circle';
  const hasText = canHoldText && (editing || (block.content && block.content.length > 0));

  if (block.shape === 'line') {
    return <div style={{ width: '100%', height: '100%', background: fill }} />;
  }
  if (block.shape === 'arrow') {
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
        <line x1="0" y1="10" x2="92" y2="10" stroke={fill} strokeWidth="3" />
        <polygon points="92,4 100,10 92,16" fill={fill} />
      </svg>
    );
  }

  // Rectangle or circle — render shape surface + optional text overlay.
  const shapeStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: fill,
    border: strokeWidth > 0 ? `${strokeWidth}px solid ${stroke}` : 'none',
    borderRadius: block.shape === 'circle'
      ? '50%'
      : block.borderRadius
        ? `${block.borderRadius}px`
        : 0,
    ...(block.boxShadow ? { boxShadow: block.boxShadow } : {}),
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (!hasText) {
    return <div style={shapeStyle} />;
  }

  // Default text color contrasts the fill: white on dark fills, slate-900
  // on light fills. User can override via textStyle.color.
  const defaultColor = isLightFill(fill) ? '#0f172a' : '#ffffff';
  const ts = block.textStyle ?? {};
  const textStyle: React.CSSProperties = {
    color: ts.color ?? defaultColor,
    fontFamily: ts.fontFamily ?? 'Inter, system-ui, sans-serif',
    fontSize: ts.fontSize ? `${ts.fontSize}px` : '1rem',
    fontWeight: ts.fontWeight ?? 500,
    textAlign: ts.textAlign ?? 'center',
    fontStyle: ts.italic ? 'italic' : undefined,
    textDecoration: ts.underline ? 'underline' : undefined,
    lineHeight: 1.3,
    padding: '6%',
    width: '100%',
    boxSizing: 'border-box',
    overflowWrap: 'break-word',
    wordBreak: 'normal',
    outline: 'none',
  };

  return (
    <div style={shapeStyle}>
      <ShapeTextEditable
        editing={editing}
        content={block.content ?? ''}
        style={textStyle}
        onContentChange={onContentChange}
        onEndEditing={onEndEditing}
        placeholder={editing ? '' : ''}
      />
    </div>
  );
}

/** ContentEditable text overlay for text-inside-shape. Mirrors the
 *  TextContent component's edit lifecycle (focus + select-all on enter,
 *  commit on blur, Esc to bail). */
function ShapeTextEditable({
  editing, content, style, onContentChange, onEndEditing,
}: {
  editing: boolean;
  content: string;
  style: React.CSSProperties;
  onContentChange: (content: string) => void;
  onEndEditing: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [editing]);

  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      onPointerDown={(e) => {
        // While editing, keep pointer events with contentEditable so the
        // user can place caret / select text inside the shape.
        if (editing) e.stopPropagation();
      }}
      onBlur={(e) => {
        if (!editing) return;
        const text = (e.target as HTMLElement).innerText;
        if (text !== content) onContentChange(text);
        onEndEditing();
      }}
      onKeyDown={(e) => {
        if (!editing) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      style={style}
    >
      {content}
    </div>
  );
}

function IconContent({ block }: { block: FreeformIconBlock }) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: block.color ?? VIOLET,
    }}>
      <PictographicIcon name={block.name} size={32} color={block.color ?? VIOLET} />
    </div>
  );
}

// ── Table row/column ops (pure) — used by the toolbar action handler ─────────
const tblCols = (rows: string[][]) => Math.max(1, ...rows.map((r) => r.length));
const tblNorm = (r: string[], n: number) => { const c = [...r]; while (c.length < n) c.push(''); return c; };
function tblInsertRow(rows: string[][], at: number): string[][] {
  const n = tblCols(rows); const next = rows.map((r) => [...r]);
  next.splice(Math.max(0, Math.min(at, rows.length)), 0, Array.from({ length: n }, () => '')); return next;
}
function tblDeleteRow(rows: string[][], at: number): string[][] { return rows.length > 1 ? rows.filter((_, i) => i !== at) : rows; }
function tblInsertCol(rows: string[][], at: number): string[][] {
  const n = tblCols(rows);
  return rows.map((r) => { const c = tblNorm(r, n); c.splice(Math.max(0, Math.min(at, n)), 0, ''); return c; });
}
function tblDeleteCol(rows: string[][], at: number): string[][] {
  const n = tblCols(rows);
  return n > 1 ? rows.map((r) => { const c = tblNorm(r, n); c.splice(at, 1); return c; }) : rows;
}
type TblMerge = { r: number; c: number; rs: number; cs: number };
type TblRange = { r0: number; c0: number; r1: number; c1: number };
/** Cells hidden because a merge spans over them (the anchor cell stays). */
function tblCoveredSet(merges?: TblMerge[]): Set<string> {
  const cov = new Set<string>();
  for (const m of merges ?? []) for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (!(r === m.r && c === m.c)) cov.add(`${r}-${c}`);
  return cov;
}
/** Merge the cells in `range` into one. The top-left anchor KEEPS ITS OWN value;
 *  the absorbed cells (to the right / below) are discarded — values are not combined. */
function tblMerge(rows: string[][], merges: TblMerge[] | undefined, range: TblRange): { rows: string[][]; merges: TblMerge[] } {
  const r0 = Math.min(range.r0, range.r1), r1 = Math.max(range.r0, range.r1);
  const c0 = Math.min(range.c0, range.c1), c1 = Math.max(range.c0, range.c1);
  if (r0 === r1 && c0 === c1) return { rows, merges: merges ?? [] };
  // drop any existing merge that overlaps the new region
  const kept = (merges ?? []).filter((m) => !(m.r <= r1 && m.r + m.rs - 1 >= r0 && m.c <= c1 && m.c + m.cs - 1 >= c0));
  const next = rows.map((r) => [...r]);
  // Keep only the anchor's value; clear every other cell in the range.
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (next[r] && !(r === r0 && c === c0)) next[r][c] = '';
  }
  return { rows: next, merges: [...kept, { r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1 }] };
}
/** Split every merge that intersects `range` back into individual cells. A single
 *  clicked cell is a 1×1 range, so this also splits the one merge under the cursor. */
function tblSplit(merges: TblMerge[] | undefined, range: TblRange): TblMerge[] {
  const r0 = Math.min(range.r0, range.r1), r1 = Math.max(range.r0, range.r1);
  const c0 = Math.min(range.c0, range.c1), c1 = Math.max(range.c0, range.c1);
  return (merges ?? []).filter((m) => !(m.r <= r1 && m.r + m.rs - 1 >= r0 && m.c <= c1 && m.c + m.cs - 1 >= c0));
}

// Row/column insert icons now live in ./tableIcons (shared with the chart grid).

// ── TableContent — native data table. Double-click a cell to edit; the row/column
//    insert/delete actions live in the block toolbar (Confluence-style). ─────────
function TableContent({ block, editing, onRowsChange, onEndEditing, onSelect }: {
  block: FreeformTableBlock;
  editing?: boolean;
  onRowsChange?: (rows: string[][]) => void;
  onEndEditing?: () => void;
  onSelect?: (range: TblRange | null) => void;
}) {
  const docTheme = useContext(ThemeContext);
  const accent = useChartPalette()?.[0] || '#2B5FE3';
  const bodyColor = block.style?.color || docTheme?.theme?.bodyColor || '#3A4256';
  const rows = block.rows ?? [];
  const nCols = Math.max(1, ...rows.map((r) => r.length));
  const header = block.headerRow !== false;
  const colW = block.colWidths && block.colWidths.length === nCols ? block.colWidths : null;
  const totalW = colW ? (colW.reduce((a, b) => a + b, 0) || nCols) : nCols;
  const fontSize = block.style?.fontSize ?? 11;
  const alignOf = (ci: number): 'left' | 'center' | 'right' => block.align?.[ci] ?? (ci === 0 ? 'left' : 'right');
  const tableRef = useRef<HTMLTableElement>(null);

  // Merge model: covered cells are hidden under an anchor's span; the anchor carries
  // row/colSpan. Selection is a rectangular range driven by click + Shift-click.
  const covered = tblCoveredSet(block.merges);
  const anchorAt = (r: number, c: number) => (block.merges ?? []).find((m) => m.r === r && m.c === c);
  const [sel, setSel] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const norm = sel
    ? { r0: Math.min(sel.a[0], sel.b[0]), c0: Math.min(sel.a[1], sel.b[1]), r1: Math.max(sel.a[0], sel.b[0]), c1: Math.max(sel.a[1], sel.b[1]) }
    : null;
  const multiSel = !!norm && (norm.r0 !== norm.r1 || norm.c0 !== norm.c1);
  const inSel = (r: number, c: number) => !!norm && r >= norm.r0 && r <= norm.r1 && c >= norm.c0 && c <= norm.c1;
  const setSelection = (a: [number, number], b: [number, number]) => {
    setSel({ a, b });
    onSelect?.({ r0: a[0], c0: a[1], r1: b[0], c1: b[1] });
  };

  const commit = (ri: number, ci: number, text: string) => {
    if (!onRowsChange) return;
    const next = rows.map((r) => [...r]);
    while (next.length <= ri) next.push([]);
    while (next[ri].length < nCols) next[ri].push('');
    if (next[ri][ci] === text) return;
    next[ri][ci] = text;
    onRowsChange(next);
  };
  const focusCell = (ri: number, ci: number) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${ri}-${ci}"]`);
    if (!el) return;
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
  };
  const onKey = (e: React.KeyboardEvent<HTMLTableCellElement>, ri: number, ci: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      commit(ri, ci, e.currentTarget.textContent ?? '');
      let nr = ri, nc = ci + (e.shiftKey ? -1 : 1);
      if (nc >= nCols) { nc = 0; nr++; } else if (nc < 0) { nc = nCols - 1; nr--; }
      if (nr >= 0 && nr < rows.length) focusCell(nr, nc); else onEndEditing?.();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit(ri, ci, e.currentTarget.textContent ?? '');
      if (ri + 1 < rows.length) focusCell(ri + 1, ci); else e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.currentTarget.blur(); onEndEditing?.();
    }
  };

  return (
    <table ref={tableRef} style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: block.style?.fontFamily || 'Inter, system-ui, sans-serif' }}>
      <colgroup>
        {Array.from({ length: nCols }).map((_, ci) => (
          <col key={ci} style={{ width: `${((colW ? colW[ci] : 1) / totalW) * 100}%` }} />
        ))}
      </colgroup>
      <tbody>
        {rows.map((row, ri) => {
          const isHead = header && ri === 0;
          return (
            <tr key={ri} style={{ borderBottom: isHead ? `2px solid ${accent}` : '1px solid rgba(11,31,58,0.10)' }}>
              {Array.from({ length: nCols }).map((_, ci) => {
                if (covered.has(`${ri}-${ci}`)) return null; // hidden beneath a merge anchor
                const span = anchorAt(ri, ci);
                const selBg = multiSel && inSel(ri, ci);
                return (
                <td key={ci} data-cell={`${ri}-${ci}`}
                  rowSpan={span && span.rs > 1 ? span.rs : undefined}
                  colSpan={span && span.cs > 1 ? span.cs : undefined}
                  contentEditable={!!editing} suppressContentEditableWarning
                  onMouseDown={editing ? (e) => {
                    if (e.shiftKey) { e.preventDefault(); setSelection(sel?.a ?? [ri, ci], [ri, ci]); }
                    else setSelection([ri, ci], [ri, ci]);
                  } : undefined}
                  onBlur={editing ? (e) => commit(ri, ci, e.currentTarget.textContent ?? '') : undefined}
                  onKeyDown={editing ? (e) => onKey(e, ri, ci) : undefined}
                  style={{ padding: '0.3em 0.6em', textAlign: alignOf(ci), verticalAlign: 'middle', fontSize, lineHeight: 1.2, fontWeight: isHead ? 700 : 400, color: isHead ? accent : bodyColor, overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word', outline: 'none', cursor: editing ? 'text' : 'default', background: selBg ? 'rgba(43,95,227,0.16)' : editing ? 'rgba(43,95,227,0.04)' : undefined }}>
                  {row[ci] ?? ''}
                </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── ListContent — native bulleted / numbered list. One block holds every item;
//    each item is an optional BOLD label + body text (the bold-label inline mix the
//    block-level FreeformTextBlock can't do). Double-click to edit; Enter adds an
//    item, Backspace on an empty item removes it. ───────────────────────────────
function ListContent({ block, editing, onItemsChange, onEndEditing }: {
  block: FreeformListBlock;
  editing?: boolean;
  onItemsChange?: (items: FreeformListBlock['items']) => void;
  onEndEditing?: () => void;
}) {
  const docTheme = useContext(ThemeContext);
  const accent = useChartPalette()?.[0] || '#2B5FE3';
  const items = block.items ?? [];
  const marker = block.marker ?? 'bullet';
  const stacked = block.labelLayout === 'stacked';
  const fontSize = block.style?.fontSize ?? 14;
  const lineHeight = block.style?.lineHeight ?? 1.3;
  const color = block.style?.color || docTheme?.theme?.bodyColor || '#3A4256';
  const gapPx = block.gap ?? Math.round(fontSize * 0.7);
  const rootRef = useRef<HTMLDivElement>(null);

  const commit = (next: FreeformListBlock['items']) => onItemsChange?.(next);
  const focusField = (i: number, field: 'label' | 'text', toEnd = true) => {
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-li="${i}"][data-fld="${field}"]`);
      if (!el) return;
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(!toEnd);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    });
  };
  const setField = (i: number, field: 'label' | 'text', value: string) => {
    if (!onItemsChange || (items[i]?.[field] ?? '') === value) return;
    const next = items.map((it) => ({ ...it }));
    while (next.length <= i) next.push({ text: '' });
    next[i] = { ...next[i], [field]: value };
    commit(next);
  };
  const onTextKey = (e: React.KeyboardEvent<HTMLElement>, i: number) => {
    const cur = e.currentTarget.textContent ?? '';
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const next = items.map((it) => ({ ...it }));
      next[i] = { ...next[i], text: cur };
      next.splice(i + 1, 0, { text: '' });
      commit(next);
      focusField(i + 1, 'text', false);
    } else if (e.key === 'Backspace' && cur === '' && !(items[i]?.label ?? '') && items.length > 1) {
      e.preventDefault();
      commit(items.filter((_, k) => k !== i));
      if (i > 0) focusField(i - 1, 'text', true);
    } else if (e.key === 'Escape') {
      e.currentTarget.blur(); onEndEditing?.();
    }
  };
  const markerFor = (i: number) => (marker === 'number' ? `${i + 1}.` : marker === 'bullet' ? '•' : '');

  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: `${gapPx}px`, fontFamily: block.style?.fontFamily || 'Inter, system-ui, sans-serif', fontSize, lineHeight, color, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5em', alignItems: 'baseline' }}>
          {marker !== 'none' && (
            <span style={{ flex: '0 0 auto', minWidth: marker === 'number' ? '1.4em' : '0.8em', color: accent, fontWeight: 600 }}>{markerFor(i)}</span>
          )}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            {it.label != null && (it.label !== '' || editing) && (
              <span
                data-li={i} data-fld="label"
                contentEditable={!!editing} suppressContentEditableWarning
                onBlur={editing ? (e) => setField(i, 'label', e.currentTarget.textContent ?? '') : undefined}
                onKeyDown={editing ? (e) => { if (e.key === 'Enter') { e.preventDefault(); setField(i, 'label', e.currentTarget.textContent ?? ''); focusField(i, 'text', false); } } : undefined}
                style={{ fontWeight: 700, outline: 'none', ...(stacked ? { display: 'block' } : { marginRight: '0.4em' }) }}
              >{it.label}</span>
            )}
            <span
              data-li={i} data-fld="text"
              contentEditable={!!editing} suppressContentEditableWarning
              onBlur={editing ? (e) => setField(i, 'text', e.currentTarget.textContent ?? '') : undefined}
              onKeyDown={editing ? (e) => onTextKey(e, i) : undefined}
              style={{ outline: 'none' }}
            >{it.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ChartContent — native SVG renderer for all 9 MVP chart types ─────────────
// Renders inside a fixed 1000×600 viewBox; preserveAspectRatio="xMidYMid meet"
// makes the SVG scale with the block's pixel dimensions. Theme colors come from
// useTemplateTheme().accentColors and assign series[i] → accentColors[i % len].
// D1 polish: linearGradient fills, value labels above bars, low-opacity gridlines.
// a11y: role="img" + <title> + <desc>, tabIndex={0}, prefers-reduced-motion is
// honored by emitting no transitions at all (data is the source of truth, type
// swaps re-render statically — no morph animation in MVP).

const CHART_VB_W = 1000;
const CHART_VB_H = 600;
// Margins reserve room for the chart chrome the wrapper draws around the plot:
// left = y-axis tick values + rotated y-axis title; top = title treatment +
// legend; bottom = category labels + x-axis title. Every plot helper derives
// its geometry from these, so widening them reflows all 9 chart types at once.
const CHART_PAD_L = 118; // wide enough for larger y-axis tick labels
const CHART_PAD_R = 36;
const CHART_PAD_T = 92;
const CHART_PAD_B = 104; // room for the larger x-axis category labels
const CHART_PLOT_W = CHART_VB_W - CHART_PAD_L - CHART_PAD_R;
const CHART_PLOT_H = CHART_VB_H - CHART_PAD_T - CHART_PAD_B;
const CHART_FALLBACK_COLORS = ['#6B3FA0', '#E267E4', '#4198FF', '#9FC7FE', '#F0A8F2', '#C8B6F4'];

/** Resolve the chart palette by reading the active document Theme first
 *  (ThemeProvider — the source of truth for /editor surfaces), falling
 *  back to TemplateThemeProvider's accentColors (legacy card-template
 *  consumers), then to the kit palette. CardEditor renders FreeformLayer
 *  outside TemplateThemeProvider so the document theme is the load-bearing
 *  path; the others are belt-and-braces. */
function useChartPalette(): string[] {
  const docTheme = useContext(ThemeContext);
  const tmplTheme = useContext(TemplateThemeContext) as TemplateTheme | null;
  if (docTheme?.theme?.chartPalette?.length) return docTheme.theme.chartPalette;
  if (tmplTheme?.accentColors?.length) return tmplTheme.accentColors;
  return CHART_FALLBACK_COLORS;
}

/** Pick a color from a palette by index, with override (e.g., per-series
 *  user color) winning. Cycles through the palette via modulo. */
function chartColorAt(palette: string[], idx: number, override?: string): string {
  if (override) return override;
  const pool = palette.length ? palette : CHART_FALLBACK_COLORS;
  return pool[idx % pool.length];
}

function formatChartValue(v: number, format?: FreeformChartBlock['numberFormat']): string {
  if (!Number.isFinite(v)) return '';
  switch (format) {
    case 'currency':
      return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    case 'percent':
      return `${(v * 100).toFixed(v < 1 ? 1 : 0)}%`;
    case 'compact':
      return v.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    case 'number':
    default:
      return v.toLocaleString();
  }
}

/** Round a max value up to a "nice" axis ceiling so gridlines hit clean numbers.
 *  e.g., 87 → 100, 230 → 250, 4_300 → 5_000. */
function niceCeil(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const ratio = raw / base;
  const niced = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10;
  return niced * base;
}

function generateAriaDesc(block: FreeformChartBlock): string {
  if (block.ariaDescription) return block.ariaDescription;
  const seriesNames = block.series.map((s) => s.name).filter(Boolean).join(', ');
  const range = (() => {
    const flat = block.series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
    if (!flat.length) return '';
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    return `Values range from ${formatChartValue(min, block.numberFormat)} to ${formatChartValue(max, block.numberFormat)}.`;
  })();
  const types: Record<FreeformChartType, string> = {
    bar: 'Horizontal bar chart',
    column: 'Vertical column chart',
    line: 'Line chart',
    area: 'Area chart',
    pie: 'Pie chart',
    donut: 'Donut chart',
    scatter: 'Scatter plot',
    funnel: 'Funnel chart',
    bubble: 'Bubble chart',
  };
  return [
    `${types[block.chartType]} with ${block.categories.length} categories.`,
    seriesNames ? `Series: ${seriesNames}.` : '',
    range,
  ].filter(Boolean).join(' ');
}

/** Drop empty rows and columns from a chart's data before rendering. A blank
 *  cell is stored as 0 (the data grid shows 0 as empty), so the untouched 7×7
 *  seed default is an all-zero table. Rendering that verbatim produces a wall
 *  of zero-height bars and 14 axis labels — the chart "shows all 7×7 even when
 *  empty" bug. This keeps only categories/series that carry a finite non-zero
 *  value, so the chart reflects what the user actually filled in.
 *
 *  Render-only: the editable block keeps its full table so the data grid still
 *  round-trips the user's whole 7×7 grid. Returns the input unchanged when
 *  there is nothing to prune (cheap identity path, stable reference). */
function pruneEmptyChartData(block: FreeformChartBlock): FreeformChartBlock {
  const isVal = (v: number) => Number.isFinite(v) && v !== 0;
  const keptCols: number[] = [];
  block.series.forEach((s, c) => {
    if (s.values.some(isVal)) keptCols.push(c);
  });
  const keptRows: number[] = [];
  block.categories.forEach((_, r) => {
    if (keptCols.some((c) => isVal(block.series[c]?.values[r] ?? 0))) keptRows.push(r);
  });
  if (keptCols.length === block.series.length && keptRows.length === block.categories.length) {
    return block;
  }
  return {
    ...block,
    categories: keptRows.map((r) => block.categories[r]),
    series: keptCols.map((c) => ({
      ...block.series[c],
      values: keptRows.map((r) => block.series[c].values[r]),
    })),
  };
}

export function ChartContent({ block: rawBlock }: { block: FreeformChartBlock }) {
  const docTheme = useContext(ThemeContext);
  const themePalette = useChartPalette();
  // Prune the untouched/empty rows + columns for display (see helper). A
  // block-level palette override (set in the data grid) wins over the theme.
  const block = useMemo(() => pruneEmptyChartData(rawBlock), [rawBlock]);
  const palette = rawBlock.palette && rawBlock.palette.length ? rawBlock.palette : themePalette;
  // Title and body text colors follow the document theme via the same CSS
  // vars text blocks use, with a sane light-theme fallback when no theme
  // is active. Body color also influences axis labels and gridlines so
  // chart annotation stays in the theme's tonal range.
  const titleColor = docTheme?.theme?.bodyColor
    || (typeof docTheme?.theme?.titleColor === 'string' && !docTheme.theme.titleColor.includes('gradient')
      ? docTheme.theme.titleColor
      : '#1a1f36');
  const bodyColor = docTheme?.theme?.bodyColor || '#475569';
  // Tone-aware grid + axis — dark themes need brighter lines to register
  // against a dark workspace.
  const isDark = docTheme?.theme?.tone === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(100,116,139,0.18)';
  const axisColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(71,85,105,0.55)';
  const titleText = block.title || '';
  const descText = generateAriaDesc(block);

  // Nothing filled in yet (or all-zero) — show a quiet hint instead of an
  // empty axis frame. Guards the pie/donut/funnel plots too, which read
  // series[0] and would otherwise throw on an empty series array.
  if (block.series.length === 0 || block.categories.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'var(--theme-body-font, inherit)', fontSize: 14, fontWeight: 500, color: bodyColor, opacity: 0.55, textAlign: 'center' }}>
          Double-click to add chart data
        </span>
      </div>
    );
  }

  // Stable id suffix for <linearGradient> ids — avoids collisions when two
  // chart blocks render on the same page.
  const gradPrefix = `chart-${block.id}`;

  // For multi-series charts (bar/column/line/area/scatter/bubble) each
  // series gets the i-th palette color. Per-series override on the block
  // wins. For single-series-with-many-categories charts (pie/donut/funnel)
  // the per-category coloring is computed inside the plot helper, drawing
  // straight from the palette by category index.
  const seriesColors = block.series.map((s, i) => chartColorAt(palette, i, s.color));

  // Per-chartType render — each helper returns the chart's plot-area SVG
  // group (drawn inside the standard padding). Title + ARIA wrapper shared.
  // Multi-series charts get seriesColors (length = series.length); per-
  // category charts (pie/donut/funnel) get the raw palette so each slice
  // or stage cycles to a distinct hue, not a single series color.
  let plot: ReactNode = null;
  switch (block.chartType) {
    case 'column':
      plot = <ColumnChartPlot block={block} colors={seriesColors} bodyColor={bodyColor} gridColor={gridColor} axisColor={axisColor} gradPrefix={gradPrefix} />;
      break;
    case 'bar':
      plot = <BarChartPlot block={block} colors={seriesColors} bodyColor={bodyColor} gridColor={gridColor} axisColor={axisColor} gradPrefix={gradPrefix} />;
      break;
    case 'line':
      plot = <LineChartPlot block={block} colors={seriesColors} bodyColor={bodyColor} gridColor={gridColor} axisColor={axisColor} mode="line" />;
      break;
    case 'area':
      plot = <LineChartPlot block={block} colors={seriesColors} bodyColor={bodyColor} gridColor={gridColor} axisColor={axisColor} mode="area" gradPrefix={gradPrefix} />;
      break;
    case 'pie':
      plot = <PieChartPlot block={block} palette={palette} bodyColor={bodyColor} hole={0} />;
      break;
    case 'donut':
      plot = <PieChartPlot block={block} palette={palette} bodyColor={bodyColor} hole={0.55} />;
      break;
    case 'scatter':
      plot = <ScatterChartPlot block={block} colors={seriesColors} bodyColor={bodyColor} gridColor={gridColor} axisColor={axisColor} variant="scatter" />;
      break;
    case 'bubble':
      plot = <ScatterChartPlot block={block} colors={seriesColors} bodyColor={bodyColor} gridColor={gridColor} axisColor={axisColor} variant="bubble" />;
      break;
    case 'funnel':
      plot = <FunnelChartPlot block={block} palette={palette} bodyColor={bodyColor} gradPrefix={gradPrefix} />;
      break;
  }

  // ── Chart chrome (title treatment + legend + axis titles) ──────────────────
  // Drawn in the wrapper around whichever plot the switch picked so every chart
  // type shares one presentation. Cartesian charts get a series legend here;
  // pie/donut/funnel draw their own per-category legend inside the plot.
  const accent = seriesColors[0] || palette[0] || '#6B3FA0';
  const isCartesian = block.chartType === 'column' || block.chartType === 'bar'
    || block.chartType === 'line' || block.chartType === 'area'
    || block.chartType === 'scatter' || block.chartType === 'bubble';
  const legendItems = isCartesian
    ? block.series.map((s, i) => ({ name: s.name || `Series ${i + 1}`, color: seriesColors[i] }))
    : [];
  const showLegend = legendItems.length > 0;
  const plotCY = CHART_PAD_T + CHART_PLOT_H / 2;
  const xAxisCX = CHART_PAD_L + CHART_PLOT_W / 2;
  const LG_FONT = 30, LG_SW = 22, LG_SW_GAP = 10, LG_ITEM_GAP = 36, LG_Y = 70;
  const legendWidths = legendItems.map((it) => LG_SW + LG_SW_GAP + it.name.length * LG_FONT * 0.56);
  const legendTotal = legendWidths.reduce((a, b) => a + b, 0) + LG_ITEM_GAP * Math.max(0, legendItems.length - 1);
  // Center the legend over the PLOT (not the whole viewBox, which is offset by the
  // left axis padding) so it sits above the bars, not shifted left.
  const legendStart = xAxisCX - legendTotal / 2;
  const legendX: number[] = [];
  { let lx = legendStart; legendItems.forEach((_, i) => { legendX.push(lx); lx += legendWidths[i] + LG_ITEM_GAP; }); }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <svg
        viewBox={`0 0 ${CHART_VB_W} ${CHART_VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        tabIndex={0}
        aria-label={titleText || `${block.chartType} chart`}
        style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
      >
        <title>{titleText || `${block.chartType} chart`}</title>
        <desc>{descText}</desc>
        {/* Title treatment — heading + short accent rule in the lead color */}
        {titleText && (
          <>
            <text
              x={CHART_VB_W / 2}
              y={36}
              textAnchor="middle"
              style={{
                fontFamily: 'var(--theme-title-font, inherit)',
                fontSize: 27,
                fontWeight: 700,
                fill: titleColor,
                letterSpacing: '-0.01em',
              }}
            >
              {titleText}
            </text>
            <rect x={CHART_VB_W / 2 - 28} y={48} width={56} height={3} rx={1.5} fill={accent} />
          </>
        )}
        {/* Series legend (cartesian charts; pie/donut/funnel label their own slices) */}
        {showLegend && legendItems.map((it, i) => (
          <g key={`lg-${i}`}>
            <rect x={legendX[i]} y={LG_Y - LG_SW / 2} width={LG_SW} height={LG_SW} rx={3} fill={it.color} />
            <text x={legendX[i] + LG_SW + LG_SW_GAP} y={LG_Y} dominantBaseline="central" style={{ fontSize: LG_FONT, fontWeight: 500, fill: bodyColor }}>
              {it.name}
            </text>
          </g>
        ))}
        {/* Y-axis title (rotated up the left margin) */}
        {block.yAxisLabel && (
          <text x={26} y={plotCY} textAnchor="middle" transform={`rotate(-90 26 ${plotCY})`} style={{ fontSize: 30, fontWeight: 500, fill: bodyColor }}>
            {block.yAxisLabel}
          </text>
        )}
        {/* X-axis title (centered under the category labels) */}
        {block.xAxisLabel && (
          <text x={xAxisCX} y={CHART_VB_H - 16} textAnchor="middle" style={{ fontSize: 30, fontWeight: 500, fill: bodyColor }}>
            {block.xAxisLabel}
          </text>
        )}
        {plot}
      </svg>
    </div>
  );
}

// ── Chart sub-renderer: Column (vertical bars) ───────────────────────────────
function ColumnChartPlot({
  block, colors, bodyColor, gridColor, axisColor, gradPrefix,
}: {
  block: FreeformChartBlock;
  colors: string[];
  bodyColor: string;
  gridColor: string;
  axisColor: string;
  gradPrefix: string;
}) {
  const cats = block.categories;
  const flat = block.series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = niceCeil(Math.max(0, ...flat));
  const groupW = CHART_PLOT_W / Math.max(1, cats.length);
  const seriesCount = block.series.length;
  const barW = (groupW * 0.7) / Math.max(1, seriesCount);
  const groupPad = (groupW - barW * seriesCount) / 2;

  const yToPx = (v: number) => CHART_PAD_T + (1 - v / max) * CHART_PLOT_H;

  // Gridlines at 4 intermediate ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ frac: t, value: max * t }));

  return (
    <g>
      <defs>
        {colors.map((c, i) => (
          <linearGradient key={i} id={`${gradPrefix}-col-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity={1} />
            <stop offset="100%" stopColor={c} stopOpacity={0.7} />
          </linearGradient>
        ))}
      </defs>
      {/* Gridlines + Y tick labels */}
      {ticks.map((t, i) => {
        const y = yToPx(t.value);
        return (
          <g key={i}>
            <line x1={CHART_PAD_L} y1={y} x2={CHART_PAD_L + CHART_PLOT_W} y2={y} stroke={gridColor} strokeWidth={1} />
            <text x={CHART_PAD_L - 10} y={y + 4} textAnchor="end" style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}>
              {formatChartValue(t.value, block.numberFormat)}
            </text>
          </g>
        );
      })}
      {/* Axis baseline */}
      <line x1={CHART_PAD_L} y1={yToPx(0)} x2={CHART_PAD_L + CHART_PLOT_W} y2={yToPx(0)} stroke={axisColor} strokeWidth={1.5} />
      {/* Bars + value labels + category labels */}
      {cats.map((cat, ci) => {
        const groupX = CHART_PAD_L + ci * groupW + groupPad;
        return (
          <g key={ci}>
            {block.series.map((s, si) => {
              const v = s.values[ci] ?? 0;
              const h = (Math.max(0, v) / max) * CHART_PLOT_H;
              const x = groupX + si * barW;
              const y = yToPx(v);
              return (
                <g key={si}>
                  <rect
                    x={x}
                    y={y}
                    width={barW * 0.85}
                    height={h}
                    rx={3}
                    fill={`url(#${gradPrefix}-col-${si})`}
                  />
                  <text
                    x={x + (barW * 0.85) / 2}
                    y={y - 7}
                    textAnchor="middle"
                    style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}
                  >
                    {formatChartValue(v, block.numberFormat)}
                  </text>
                </g>
              );
            })}
            <text
              x={groupX + (groupW - groupPad * 2) / 2}
              y={CHART_PAD_T + CHART_PLOT_H + 48}
              textAnchor="middle"
              style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}
            >
              {cat}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Chart sub-renderer: Bar (horizontal bars) ────────────────────────────────
function BarChartPlot({
  block, colors, bodyColor, gridColor, axisColor, gradPrefix,
}: {
  block: FreeformChartBlock;
  colors: string[];
  bodyColor: string;
  gridColor: string;
  axisColor: string;
  gradPrefix: string;
}) {
  const cats = block.categories;
  const flat = block.series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = niceCeil(Math.max(0, ...flat));
  const groupH = CHART_PLOT_H / Math.max(1, cats.length);
  const seriesCount = block.series.length;
  const barH = (groupH * 0.7) / Math.max(1, seriesCount);
  const groupPad = (groupH - barH * seriesCount) / 2;

  const xToPx = (v: number) => CHART_PAD_L + (v / max) * CHART_PLOT_W;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ frac: t, value: max * t }));

  return (
    <g>
      <defs>
        {colors.map((c, i) => (
          <linearGradient key={i} id={`${gradPrefix}-bar-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity={0.7} />
            <stop offset="100%" stopColor={c} stopOpacity={1} />
          </linearGradient>
        ))}
      </defs>
      {/* Vertical gridlines */}
      {ticks.map((t, i) => {
        const x = xToPx(t.value);
        return (
          <g key={i}>
            <line x1={x} y1={CHART_PAD_T} x2={x} y2={CHART_PAD_T + CHART_PLOT_H} stroke={gridColor} strokeWidth={1} />
            <text x={x} y={CHART_PAD_T + CHART_PLOT_H + 48} textAnchor="middle" style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}>
              {formatChartValue(t.value, block.numberFormat)}
            </text>
          </g>
        );
      })}
      <line x1={xToPx(0)} y1={CHART_PAD_T} x2={xToPx(0)} y2={CHART_PAD_T + CHART_PLOT_H} stroke={axisColor} strokeWidth={1.5} />
      {/* Bars + labels */}
      {cats.map((cat, ci) => {
        const groupY = CHART_PAD_T + ci * groupH + groupPad;
        return (
          <g key={ci}>
            {block.series.map((s, si) => {
              const v = s.values[ci] ?? 0;
              const w = (Math.max(0, v) / max) * CHART_PLOT_W;
              const y = groupY + si * barH;
              return (
                <g key={si}>
                  <rect
                    x={xToPx(0)}
                    y={y}
                    width={w}
                    height={barH * 0.85}
                    rx={3}
                    fill={`url(#${gradPrefix}-bar-${si})`}
                  />
                  {w > 50 ? (
                    <text
                      x={xToPx(0) + w - 8}
                      y={y + (barH * 0.85) / 2 + 4}
                      textAnchor="end"
                      style={{ fontSize: 32, fontWeight: 500, fill: '#ffffff' }}
                    >
                      {formatChartValue(v, block.numberFormat)}
                    </text>
                  ) : (
                    <text
                      x={xToPx(0) + w + 8}
                      y={y + (barH * 0.85) / 2 + 4}
                      textAnchor="start"
                      style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}
                    >
                      {formatChartValue(v, block.numberFormat)}
                    </text>
                  )}
                </g>
              );
            })}
            <text
              x={CHART_PAD_L - 10}
              y={groupY + (groupH - groupPad * 2) / 2 + 4}
              textAnchor="end"
              style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}
            >
              {cat}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Chart sub-renderer: Line / Area (shared math, different fill) ────────────
function LineChartPlot({
  block, colors, bodyColor, gridColor, axisColor, mode, gradPrefix,
}: {
  block: FreeformChartBlock;
  colors: string[];
  bodyColor: string;
  gridColor: string;
  axisColor: string;
  mode: 'line' | 'area';
  gradPrefix?: string;
}) {
  const cats = block.categories;
  const flat = block.series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = niceCeil(Math.max(0, ...flat));
  const xStep = CHART_PLOT_W / Math.max(1, cats.length - 1);
  const yToPx = (v: number) => CHART_PAD_T + (1 - v / max) * CHART_PLOT_H;
  const xToPx = (i: number) => CHART_PAD_L + i * (cats.length === 1 ? CHART_PLOT_W / 2 : xStep);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ frac: t, value: max * t }));

  return (
    <g>
      {mode === 'area' && gradPrefix && (
        <defs>
          {colors.map((c, i) => (
            <linearGradient key={i} id={`${gradPrefix}-area-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.55} />
              <stop offset="100%" stopColor={c} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
      )}
      {ticks.map((t, i) => {
        const y = yToPx(t.value);
        return (
          <g key={i}>
            <line x1={CHART_PAD_L} y1={y} x2={CHART_PAD_L + CHART_PLOT_W} y2={y} stroke={gridColor} strokeWidth={1} />
            <text x={CHART_PAD_L - 10} y={y + 4} textAnchor="end" style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}>
              {formatChartValue(t.value, block.numberFormat)}
            </text>
          </g>
        );
      })}
      <line x1={CHART_PAD_L} y1={yToPx(0)} x2={CHART_PAD_L + CHART_PLOT_W} y2={yToPx(0)} stroke={axisColor} strokeWidth={1.5} />
      {/* Series: area fill + line + dots */}
      {block.series.map((s, si) => {
        const points = cats.map((_, ci) => ({ x: xToPx(ci), y: yToPx(s.values[ci] ?? 0) }));
        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? CHART_PAD_L} ${yToPx(0)} L ${points[0]?.x ?? CHART_PAD_L} ${yToPx(0)} Z`;
        return (
          <g key={si}>
            {mode === 'area' && gradPrefix && (
              <path d={areaPath} fill={`url(#${gradPrefix}-area-${si})`} />
            )}
            <path d={linePath} fill="none" stroke={colors[si]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={5} fill="#ffffff" stroke={colors[si]} strokeWidth={2.5} />
                <text x={p.x} y={p.y - 13} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: bodyColor }}>
                  {formatChartValue(s.values[i] ?? 0, block.numberFormat)}
                </text>
              </g>
            ))}
          </g>
        );
      })}
      {/* Category labels */}
      {cats.map((cat, ci) => (
        <text
          key={ci}
          x={xToPx(ci)}
          y={CHART_PAD_T + CHART_PLOT_H + 24}
          textAnchor="middle"
          style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}
        >
          {cat}
        </text>
      ))}
    </g>
  );
}

// ── Chart sub-renderer: Pie / Donut (single series; hole = donut ratio) ──────
function PieChartPlot({
  block, palette, bodyColor, hole,
}: {
  block: FreeformChartBlock;
  /** Full theme palette — each slice picks a DISTINCT color by category
   *  index. Passed as the palette (not series-derived colors) so a 4-slice
   *  pie gets 4 different hues, not 4 shades of the single series color. */
  palette: string[];
  bodyColor: string;
  hole: number; // 0 = pie, 0.55 = donut
}) {
  const series = block.series[0];
  if (!series) return null;
  const values = block.categories.map((_, i) => Math.max(0, series.values[i] ?? 0));
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return (
      <text x={CHART_VB_W / 2} y={CHART_VB_H / 2} textAnchor="middle" style={{ fontSize: 16, fill: bodyColor }}>
        No data
      </text>
    );
  }
  const cy = CHART_PAD_T + CHART_PLOT_H / 2;
  // Donut/pie hugs the LEFT so the legend has room on the right for larger,
  // readable category labels (a11y — the old centered layout left ~6px text).
  const r = Math.min(CHART_PLOT_W * 0.42, CHART_PLOT_H / 2) - 16;
  const cx = CHART_PAD_L + r + 8;
  const innerR = r * hole;
  // Legend layout (right of the chart), sized for legibility.
  const LEG_FS = 36, LEG_SW = 24, LEG_GAP = 50;
  const legX = cx + r + 44;
  const legStartY = cy - ((block.categories.length - 1) * LEG_GAP) / 2;

  const sliceColors = block.categories.map((_, i) => chartColorAt(palette, i));

  let acc = 0;
  const slices = values.map((v, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const aMid = (a0 + a1) / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    if (hole > 0) {
      const ix0 = cx + innerR * Math.cos(a0);
      const iy0 = cy + innerR * Math.sin(a0);
      const ix1 = cx + innerR * Math.cos(a1);
      const iy1 = cy + innerR * Math.sin(a1);
      const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix0} ${iy0} Z`;
      return { d, color: sliceColors[i], cat: block.categories[i], v, aMid, pct: v / total };
    }
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    return { d, color: sliceColors[i], cat: block.categories[i], v, aMid, pct: v / total };
  });

  return (
    <g>
      {slices.map((s, i) => (
        <g key={i}>
          <path d={s.d} fill={s.color} stroke="#ffffff" strokeWidth={2} />
          {s.pct >= 0.05 && (
            <text
              x={cx + (r * 0.7) * Math.cos(s.aMid)}
              y={cy + (r * 0.7) * Math.sin(s.aMid) + 5}
              textAnchor="middle"
              style={{ fontSize: 26, fontWeight: 700, fill: '#ffffff' }}
            >
              {`${Math.round(s.pct * 100)}%`}
            </text>
          )}
        </g>
      ))}
      {/* Legend on the right — larger text for readability (a11y) */}
      {block.categories.map((cat, i) => {
        const y = legStartY + i * LEG_GAP;
        return (
          <g key={i}>
            <rect x={legX} y={y - LEG_SW / 2} width={LEG_SW} height={LEG_SW} rx={3} fill={sliceColors[i]} />
            <text x={legX + LEG_SW + 12} y={y + LEG_FS * 0.36} style={{ fontSize: LEG_FS, fill: bodyColor }}>
              {cat}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Chart sub-renderer: Scatter / Bubble (categorical x-axis) ────────────────
function ScatterChartPlot({
  block, colors, bodyColor, gridColor, axisColor, variant,
}: {
  block: FreeformChartBlock;
  colors: string[];
  bodyColor: string;
  gridColor: string;
  axisColor: string;
  variant: 'scatter' | 'bubble';
}) {
  const cats = block.categories;
  const flat = block.series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = niceCeil(Math.max(0, ...flat));
  const xStep = CHART_PLOT_W / Math.max(1, cats.length - 1);
  const yToPx = (v: number) => CHART_PAD_T + (1 - v / max) * CHART_PLOT_H;
  const xToPx = (i: number) => CHART_PAD_L + i * (cats.length === 1 ? CHART_PLOT_W / 2 : xStep);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ frac: t, value: max * t }));

  // Bubble radius: scale by value across plot; min 6, max ~36
  const sumPerCat = cats.map((_, ci) => block.series.reduce((sum, s) => sum + Math.max(0, s.values[ci] ?? 0), 0));
  const bubbleMaxSum = Math.max(1, ...sumPerCat);
  const radiusForValue = (v: number) => {
    if (variant === 'scatter') return 7;
    const t = bubbleMaxSum > 0 ? Math.max(0, v) / bubbleMaxSum : 0;
    return 8 + Math.sqrt(t) * 28;
  };

  return (
    <g>
      {ticks.map((t, i) => {
        const y = yToPx(t.value);
        return (
          <g key={i}>
            <line x1={CHART_PAD_L} y1={y} x2={CHART_PAD_L + CHART_PLOT_W} y2={y} stroke={gridColor} strokeWidth={1} />
            <text x={CHART_PAD_L - 10} y={y + 4} textAnchor="end" style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}>
              {formatChartValue(t.value, block.numberFormat)}
            </text>
          </g>
        );
      })}
      <line x1={CHART_PAD_L} y1={yToPx(0)} x2={CHART_PAD_L + CHART_PLOT_W} y2={yToPx(0)} stroke={axisColor} strokeWidth={1.5} />
      {block.series.map((s, si) => (
        <g key={si}>
          {cats.map((_, ci) => {
            const v = s.values[ci] ?? 0;
            return (
              <circle
                key={ci}
                cx={xToPx(ci)}
                cy={yToPx(v)}
                r={radiusForValue(v)}
                fill={colors[si]}
                fillOpacity={variant === 'bubble' ? 0.55 : 0.85}
                stroke={colors[si]}
                strokeWidth={variant === 'bubble' ? 1.5 : 1}
              />
            );
          })}
        </g>
      ))}
      {cats.map((cat, ci) => (
        <text
          key={ci}
          x={xToPx(ci)}
          y={CHART_PAD_T + CHART_PLOT_H + 24}
          textAnchor="middle"
          style={{ fontSize: 32, fontWeight: 500, fill: bodyColor }}
        >
          {cat}
        </text>
      ))}
    </g>
  );
}

// ── Chart sub-renderer: Funnel (vertical trapezoids, single series) ──────────
function FunnelChartPlot({
  block, palette, bodyColor, gradPrefix,
}: {
  block: FreeformChartBlock;
  /** Full theme palette — each stage picks a distinct color by category
   *  index so the funnel reads as N categorical bands, not one color
   *  fading through opacity. */
  palette: string[];
  bodyColor: string;
  gradPrefix: string;
}) {
  const series = block.series[0];
  if (!series) return null;
  const values = block.categories.map((_, i) => Math.max(0, series.values[i] ?? 0));
  const max = Math.max(1, ...values);
  const rowH = CHART_PLOT_H / Math.max(1, values.length);
  const cx = CHART_VB_W / 2;

  const stageColors = block.categories.map((_, i) => chartColorAt(palette, i));

  return (
    <g>
      <defs>
        {stageColors.map((c, i) => (
          <linearGradient key={i} id={`${gradPrefix}-fnl-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity={0.85} />
            <stop offset="50%" stopColor={c} stopOpacity={1} />
            <stop offset="100%" stopColor={c} stopOpacity={0.85} />
          </linearGradient>
        ))}
      </defs>
      {values.map((v, i) => {
        const wTop = (Math.max(0, values[i]) / max) * (CHART_PLOT_W * 0.85);
        const wBot = (Math.max(0, values[i + 1] ?? values[i]) / max) * (CHART_PLOT_W * 0.85);
        const y0 = CHART_PAD_T + i * rowH;
        const y1 = y0 + rowH - 4;
        const path = `M ${cx - wTop / 2} ${y0} L ${cx + wTop / 2} ${y0} L ${cx + wBot / 2} ${y1} L ${cx - wBot / 2} ${y1} Z`;
        return (
          <g key={i}>
            <path d={path} fill={`url(#${gradPrefix}-fnl-${i})`} />
            <text
              x={cx}
              y={y0 + rowH / 2}
              textAnchor="middle"
              style={{ fontSize: 14, fontWeight: 700, fill: '#ffffff' }}
            >
              {`${block.categories[i]} · ${formatChartValue(v, block.numberFormat)}`}
            </text>
          </g>
        );
      })}
    </g>
  );
}
