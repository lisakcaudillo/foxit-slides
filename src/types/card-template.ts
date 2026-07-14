// Card-Based Template Types — parallel type system for card renderer
// These types define the card-based editing mode alongside the existing A4 block canvas.
// Do NOT merge with existing Block/TemplateSchemaDef types — separate rendering pipeline.

import type { ThemeArchetype } from '@/lib/card-engine/design-types';

// ── Layout & Style Enums ──────────────────────────────────────────────────────

export type CardLayout = 'single' | 'split-left' | 'split-right' | 'three-col';
export type CardStyle = 'default' | 'dark' | 'chapter' | 'accent';
export type SmartLayoutVariant = 'grid-2x2' | 'grid-1x3' | 'grid-1x4' | 'list' | 'timeline';
export type LabelStyle = 'filled' | 'outline' | 'filled-light' | 'outline-light';
export type ButtonStyle = 'primary' | 'primary-light';

// ── Template Theme ────────────────────────────────────────────────────────────

export interface TemplateTheme {
  pageBg: string;
  /** Dedicated editor WORKSPACE backdrop (the area behind the artboard) — a
   *  theme-related but contrasting tone so the deck pops. Drives
   *  `--theme-workspace-base`. Falls back to the neutral grey when unset. */
  workspaceBg?: string;
  cardBg: string;
  cardBgOpacity: number;
  cardRadius: number;
  cardPadding: number;
  accentColors: string[];
  headingFont: string;
  bodyFont: string;
  headingColor: string;
  bodyColor: string;
  /** Design Intelligence Layer (Phase 2) — the source theme's archetype,
   *  carried onto the runtime theme so the card-engine deck planner can read
   *  the per-theme recipe whitelist + image-role weighting. Optional + additive:
   *  themes without it fall back to DEFAULT_ARCHETYPE in the planner. See
   *  docs/requirements/design-intelligence-layer-spec.md §5. */
  archetype?: ThemeArchetype;
}

// ── Source Document Provenance (Phase E) ──────────────────────────────────────

export type ClaimType = 'verbatim' | 'paraphrase' | 'derived';

export interface SourceDocument {
  id: string;
  filename: string;
  /** SHA-256 of source bytes — cache key for Layer 3+4 outputs */
  contentHash: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'image';
  pageCount: number;
  uploadedAt: string;
}

export interface SourcePassage {
  /** 1-indexed page number this passage came from */
  page: number;
  /** The extracted text content — used for hover-preview and click-to-highlight */
  text: string;
  /** Section/heading the passage falls under, if known (e.g., "§3.2 Termination") */
  section?: string;
  /** Layer-4 semantic role tag (key-claim, statistic, quote, etc.) if available */
  role?: string;
  /** Block type from extraction: 'heading' | 'paragraph' | 'list' | 'table' | 'figure' */
  type?: string;
}

export interface CardProvenance {
  /** References SourceDocument.id at the deck level */
  sourceDocId: string;
  /** 1-indexed page numbers in the source */
  sourcePages: number[];
  /** Optional section / heading reference (e.g., "§3.2 Termination") */
  sourceSection?: string;
  /** verbatim: direct quote. paraphrase: restated from a specific passage. derived: synthesized or framing. */
  claimType: ClaimType;
  /**
   * The actual source passages the AI was given when generating this card.
   * Used by the Inspector to show inline snippets + thumbnails, and by the
   * drawer to highlight the source text on the rendered page.
   */
  passages?: SourcePassage[];
}

// ── Block Types (Discriminated Union) ─────────────────────────────────────────

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  content: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  content: string;
}

export interface SmartLayoutCell {
  icon?: string;
  heading: string;
  body: string;
  accentColor?: string;
}

export interface SmartLayoutBlock {
  type: 'smart-layout';
  variant: SmartLayoutVariant;
  cells: SmartLayoutCell[];
}

export interface GridCell {
  blocks: CardBlock[];
}

export interface GridLayoutBlock {
  type: 'grid-layout';
  gridColumns: number;
  cells: GridCell[];
}

export interface LabelGroupBlock {
  type: 'label-group';
  labels: { text: string; style: LabelStyle }[];
}

export interface ToggleBlock {
  type: 'toggle';
  heading: string;
  content: string;
}

export interface CalloutBlock {
  type: 'callout';
  icon?: string;
  content: string;
}

export interface ButtonBlock {
  type: 'button';
  text: string;
  url?: string;
  style: ButtonStyle;
}

export interface DividerBlock {
  type: 'divider';
}

export interface BulletListBlock {
  type: 'bullet-list';
  items: string[];
}

export interface ImageBlock {
  type: 'image';
  src: string;
  alt?: string;
  fit?: 'cover' | 'contain';
}

export type CardBlock =
  | HeadingBlock
  | ParagraphBlock
  | SmartLayoutBlock
  | GridLayoutBlock
  | LabelGroupBlock
  | ToggleBlock
  | CalloutBlock
  | ButtonBlock
  | DividerBlock
  | BulletListBlock
  | ImageBlock;

// ── Freeform Blocks ───────────────────────────────────────────────────────────
// User-added blocks layered above the structured `columns` content via absolute
// positioning. Coordinates are percentages of the card surface (referenced
// against 960×540) so a block stays in the same visual spot regardless of how
// the card is exported (PPT 1920×1080, PDF, thumbnail, etc.) or whether the
// card size ever changes.

export type FreeformShapeKind = 'rectangle' | 'circle' | 'line' | 'arrow';
export type FreeformTextVariant = 'heading' | 'subheading' | 'paragraph' | 'metric';

interface FreeformPositioned {
  id: string;
  /** x as % of card width, 0–100, left edge of the block. */
  x: number;
  /** y as % of card height, 0–100, top edge of the block. */
  y: number;
  /** width as % of card width, 0–100. */
  w: number;
  /** height as % of card height, 0–100. */
  h: number;
  /** Clockwise rotation in degrees, 0 = upright. */
  rotation: number;
  /** Z-order within the freeform layer. Higher = on top of lower. */
  z: number;
  /** Locked blocks remain selectable but ignore drag/resize gestures. */
  locked?: boolean;
  /** Set by the structured→freeform converter on auto-positioned blocks. The
   *  FreeformLayer measures the actual rendered size of these blocks after
   *  first paint, adjusts position/height to clear any overlap with siblings,
   *  then unsets this flag. Once cleared, the block fully respects user
   *  position/size — drags and resizes don't trigger re-layout. */
  __autoLayout?: boolean;
  /**
   * Set by the streaming handler when a card arrives mid-generation. Tells
   * the renderer to play a typewriter reveal on first mount. Cleared at
   * persist time so reloading a saved deck doesn't re-animate.
   * 2026-05-25: typewriter reveal was lost after the unified-format
   * rewrite — this flag rewires it.
   */
  __animateOnMount?: boolean;
  /**
   * Milliseconds to wait before this block's typewriter starts. Session-only,
   * stripped at persist time (alongside __animateOnMount). Used to chain cards
   * so the deck reveals one card at a time — card 1's text types out, then
   * card 2's, then card 3's — instead of every tagged block animating at once.
   * sequential reveal buys visual time and reads better.
   */
  __animateDelay?: number;
}

/** Inline character-level marks for a rich-text run. Each mark OVERRIDES the
 *  block-level `style`/variant default for the characters it covers. Booleans
 *  omitted (or false) mean "inherit the box default"; a value present means
 *  "this run overrides." Keep this in sync with the mark handling in
 *  lib/card-engine/text-runs.ts and FreeformLayer's editable bridge. */
/** A hyperlink destination. `url` opens an external page; `slide` jumps to
 *  another slide in THIS deck (value = the target card's id, so it survives
 *  reordering); `download` points at a file — either an already-hosted URL or a
 *  small file embedded as a `data:` URL — carrying its original `fileName` for
 *  the format icon + label. A bare string on a run's `link` mark is treated as
 *  a legacy `{ kind:'url' }` (back-compat with pre-target decks). */
export interface LinkTarget {
  kind: 'url' | 'slide' | 'download';
  /** url: the URL · slide: the target card id · download: a file URL or data: URL. */
  value: string;
  /** download only — the file's display name (e.g. `pricing-2026.pdf`). */
  fileName?: string;
}

export interface TextRunMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  /** Background highlight colour behind the glyphs (like a marker). */
  highlight?: string;
  /** px — overrides the box font size for this run only. */
  fontSize?: number;
  fontFamily?: string;
  /** Raised (superscript) or lowered (subscript) — mutually exclusive; the run
   *  renders smaller and vertically shifted. */
  superscript?: boolean;
  subscript?: boolean;
  /** Hyperlink target — the run renders as an <a> (underlined, link colour). A
   *  structured {@link LinkTarget}; a bare string is legacy shorthand for a URL
   *  link. Empty/absent = not a link. */
  link?: string | LinkTarget;
}

/** A contiguous span of text sharing one set of inline marks. A
 *  FreeformTextBlock's `runs` (when present) are the source of truth for
 *  per-word formatting; `content` stays in sync as the flat plain text so
 *  export, char-budgets, and FR11 grounding keep working unchanged. */
export interface TextRun {
  text: string;
  marks?: TextRunMarks;
}

export interface FreeformTextBlock extends FreeformPositioned {
  type: 'text';
  variant: FreeformTextVariant;
  /** Plain text. Variant supplies the default type style; overrides go in `style`. */
  content: string;
  /** Rich-text runs for per-range (word-level) formatting. OPTIONAL and
   *  additive — when absent, the block renders from `content` + `style` exactly
   *  as before (all legacy/generated decks). Populated lazily the first time a
   *  user applies a range-scoped format inside the box. `content` is kept equal
   *  to the concatenated run text so downstream consumers never need to know
   *  about runs. */
  runs?: TextRun[];
  /** VERBATIM content (a quote) — must be reproduced exactly. The character
   *  budget and the fit's last-resort trim do NOT apply: text-fit shrinks the
   *  font (further, if needed) but never shortens the words. */
  verbatim?: boolean;
  /** Generation-time diagnostic: the fit ladder could NOT fit this slot even
   *  after the grounded rewrite-to-fit passes, so its text is still trimmed at
   *  the box floor. A hard, machine-readable defect (the eval harness counts it;
   *  the quality gate enforces it) so truncation is never silent. Set/cleared at
   *  fill time; not user-authored. */
  truncated?: boolean;
  style?: {
    fontFamily?: string;
    /** px */
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    /** CSS gradient for gradient-FILL text (clipped to the glyphs via
     *  background-clip:text). A solid `color` wins over this. Used by skins
     *  whose titles are a gradient (e.g. Volt). */
    gradient?: string;
    /** CSS text-shadow — e.g. a soft glow behind a heading. */
    textShadow?: string;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    /** Vertical alignment of the text WITHIN the block's box. Default 'top'
     *  (normal block flow). 'center' centers the line — used by hugged pill
     *  labels (eyebrow / VS / RECOMMENDED / delta) so the label sits on the
     *  pill's vertical midline instead of riding its bottom edge. 'bottom'
     *  anchors content to the box bottom — used by the section-divider title so
     *  it sits just above the divider accent bar regardless of line count. */
    verticalAlign?: 'top' | 'center' | 'bottom';
    lineHeight?: number;
    letterSpacing?: number;
    italic?: boolean;
    underline?: boolean;
  };
}

/** Frame shapes for FreeformImageBlock (Canva-style frames). Geometric
 *  shapes clip the image with CSS clip-path; device shapes (laptop, ...)
 *  render a decorative SVG and clip the image to the content area inside
 *  the chrome. Default is 'rectangle' (unframed image — matches the
 *  original behavior). */
export type FrameShape =
  | 'rectangle'
  | 'rounded'
  | 'circle'
  | 'heart'
  | 'hexagon'
  | 'laptop'
  // Device mockup (phone / tablet / laptop) sourced from the Figma "Device
  // Mockups" section. A dropped image SNAPS into the device's inner screen
  // rect (not the whole box). WHICH device is named by `deviceId` on the block,
  // resolved against the figma-assets manifest — so the union stays small as
  // the device library grows.
  | 'device'
  // Cover composition diagonals — a full-card image clipped to a slash so the
  // title sits in the open triangle. Used by the cover composition engine
  // (lib/card-engine/composition.ts), not the Elements frame picker.
  | 'diagonal-left'
  | 'diagonal-right';

export interface FreeformImageBlock extends FreeformPositioned {
  type: 'image';
  /**
   * URL or data URL of the image bytes. When absent (or empty), the block
   * renders as a placeholder (frame-shaped dashed outline + image icon +
   * "Image placeholder" label) and clicking it opens the Media side panel
   * bound to fill THIS block — see CardEditor's mediaTargetBlockId + the
   * onImagePlaceholderClick wire on FreeformLayer. Once filled, normal
   * drag/resize behavior applies; the image is clipped to the frame shape.
   */
  src?: string;
  alt?: string;
  fit?: 'cover' | 'contain';
  /**
   * Crop/pan of the image CONTENT within its frame — CSS object-position, 0–100%
   * per axis. 50/50 (default when undefined) = centered; 0 = left/top edge, 100 =
   * right/bottom. Only visible when the rendered object-fit is `cover`. Absent →
   * centered (back-compat).
   */
  panX?: number;
  panY?: number;
  /** Frame shape — controls how the placeholder is outlined and how the
   *  filled image is clipped. Default 'rectangle' (no clip). */
  frameShape?: FrameShape;
  /** Semantic kind of image slot. `'icon'` marks a small pictogram/icon slot
   *  (filled from the icon library, not a photo) so its EMPTY placeholder renders
   *  as a distinct icon glyph instead of the generic "Image placeholder" box. */
  slotKind?: 'icon';
  /** When `frameShape === 'device'`, the figma-assets manifest id of the device
   *  mockup (e.g. 'iphone-black'). Resolves the outer chrome geometry + inner
   *  screen rect the image snaps into. Ignored for non-device frames. */
  deviceId?: string;
  /**
   * Render opacity 0–1. Default (undefined) = fully opaque. Set LOW (~0.15–0.20)
   * by the auto-image placement for `texture`/`background` image roles so the
   * photo reads as a faint wash and the theme's normal text stays legible on
   * top with no scrim. Honored by ImageContent in FreeformLayer. Rich-photo
   * roles (`duotone`/`full-bleed`) leave this undefined (full strength) and rely
   * on the scrim + forced light text instead.
   */
  opacity?: number;
  /**
   * Set on images auto-placed by the auto-image-at-creation flow (the AI
   * designer recommended an image for this slide and the opt-in toggle was on).
   * Carries the generation params so clicking the image can fire an n=4
   * follow-up for the swap picker, plus library ids of variants already
   * generated for this slot (1 at creation time, +4 on first swap). Absent on
   * user-inserted images. Ephemeral hint only — safe to persist.
   */
  autoGen?: {
    subject: string;
    style?: string;
    slideHeading?: string;
    deckTitle?: string;
    themePalette?: string;
    /** libraryIds of variants generated for this slot. */
    variantIds?: string[];
  };
}

export interface FreeformShapeBlock extends FreeformPositioned {
  type: 'shape';
  shape: FreeformShapeKind;
  fill?: string;
  stroke?: string;
  /** px */
  strokeWidth?: number;
  /** Rectangle only — corner radius in px. */
  borderRadius?: number;
  /** Optional CSS box-shadow string (e.g. '0 3px 10px rgba(11,31,58,0.07)').
   *  Used by structured-template cards to match the Figma soft drop shadow. */
  boxShadow?: string;
  /**
   * Optional text wrapped inside the shape. Double-click a shape block to
   * enter edit mode; once content is set, the shape renders as a colored
   * container with the text centered (vertically + horizontally) inside.
   * Only applies to rectangle and circle — line and arrow stay text-free.
   * Style controls live in the FreeformLayer inline toolbar; the text
   * variant defaults to 'paragraph' and color contrasts the shape fill. */
  content?: string;
  /** Per-text styling overrides for the wrapped text. Mirror of
   *  FreeformTextBlock.style — same keys recognised. */
  textStyle?: {
    fontFamily?: string;
    /** px */
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
    italic?: boolean;
    underline?: boolean;
  };
}

export interface FreeformIconBlock extends FreeformPositioned {
  type: 'icon';
  /** PictographicIcon name (Google Material Symbols via Iconify). */
  name: string;
  color?: string;
}

/** Chart types shipped in the MVP picker. Native SVG primitives render each
 *  one — no chart library dependency. Type swap preserves `categories` +
 *  `series`, so the user can flip Column → Pie without losing data.
 *
 *  Reserved for future: 'diagram' (flowchart / mindmap / org chart) will use
 *  `renderHint: 'claude-svg'` and a separate render path. Deliberately not in
 *  MVP — see ROADMAP.md P13.6 and docs/uiux/prototypes/chart-block-MANAGER.md. */
export type FreeformChartType =
  | 'bar'
  | 'column'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'funnel'
  | 'bubble';

export interface ChartSeries {
  name: string;
  values: number[];
  /** Optional per-series color override. Default: theme.accentColors[i]. */
  color?: string;
}

export interface FreeformChartBlock extends FreeformPositioned {
  type: 'chart';
  chartType: FreeformChartType;
  /** X-axis labels (or pie/donut slice labels). Length defines the data
   *  shape — `series[i].values.length` must match. */
  categories: string[];
  series: ChartSeries[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** Display format for value labels and axis ticks. Defaults to plain
   *  number with locale grouping (e.g., "1,234"). */
  numberFormat?: 'number' | 'currency' | 'percent' | 'compact';
  /** Override for the SVG `<desc>` element. When absent, the renderer
   *  generates one from chartType + categories + series names. */
  ariaDescription?: string;
  /** Render path. MVP always 'native' (in-house SVG primitives). Reserved
   *  for the future diagram type which will route to 'claude-svg'. */
  renderHint?: 'native' | 'claude-svg';
  /** Per-chart color palette override. When set, series/slices cycle through
   *  these colors instead of the document theme's chartPalette. Chosen in the
   *  Chart Data-Table editor. A per-series `color` still wins over this. */
  palette?: string[];
}

/** A native data table. Cells hold plain text; the renderer draws a real <table>
 *  with an optional styled header row, per-column alignment, and column widths.
 *  Double-click a cell to edit; Tab/Enter move between cells. */
export interface FreeformTableBlock extends FreeformPositioned {
  type: 'table';
  /** Cell text as rows × columns (`rows[r][c]`). Ragged rows are padded at render. */
  rows: string[][];
  /** First row renders as a header (accent text, bold, rule under it). Default true. */
  headerRow?: boolean;
  /** Relative column widths (positive numbers, normalized to the block width).
   *  Omit → equal columns. Length should match the column count. */
  colWidths?: number[];
  /** Per-column text alignment. Omit → first column left, the rest right. */
  align?: ('left' | 'center' | 'right')[];
  /** Table-wide text style (font/size/color of the body cells). */
  style?: { fontFamily?: string; fontSize?: number; color?: string };
  /** Merged cell regions. Each is an anchor at `rows[r][c]` (its text shows) spanning
   *  `rs` rows × `cs` columns; the other cells in that rectangle are "covered" and not
   *  rendered. Omitted/empty → no merges. */
  merges?: { r: number; c: number; rs: number; cs: number }[];
}

/** A native bulleted or numbered list. Each item is an optional BOLD lead-in label
 *  plus body text; the renderer draws the marker (bullet / number), indent, and the
 *  inter-item spacing — so a list is ONE block instead of a stack of text blocks.
 *  Double-click to edit an item; Enter adds an item, Backspace on an empty item
 *  removes it. The bold label is what the block-level FreeformTextBlock can't do. */
export interface FreeformListBlock extends FreeformPositioned {
  type: 'list';
  /** Items, top to bottom. `label` (optional) renders BOLD before `text`. */
  items: { text: string; label?: string }[];
  /** Marker style. 'bullet' = disc, 'number' = 1. 2. 3., 'none' = no marker. Default 'bullet'. */
  marker?: 'bullet' | 'number' | 'none';
  /** Whether the label sits inline before the text ('inline', default) or on its
   *  own line above it ('stacked' — the comparison-card look). */
  labelLayout?: 'inline' | 'stacked';
  /** Vertical gap between items, in px on the 960×540 canvas. Omit → derived from size. */
  gap?: number;
  /** Text style for item bodies (labels render at the same size, bold). */
  style?: { fontFamily?: string; fontSize?: number; color?: string; lineHeight?: number };
}

export type FreeformBlock =
  | FreeformTextBlock
  | FreeformImageBlock
  | FreeformShapeBlock
  | FreeformIconBlock
  | FreeformChartBlock
  | FreeformTableBlock
  | FreeformListBlock;

// ── Card & Column ─────────────────────────────────────────────────────────────

export interface Column {
  blocks: CardBlock[];
}

/**
 * AI-emitted, per-card recommendation for whether this slide earns a generated
 * image, what to depict, and where it belongs. Produced by the card generator
 * acting as a presentation designer — it weighs content, audience, and goal
 * rather than just available space. Consumed by the auto-image-at-creation
 * client flow; ephemeral, stripped before persist once an image is placed.
 */
export interface CardImageIntent {
  /** Whether a generated image strengthens this slide. False = text stands alone. */
  wanted: boolean;
  /** What the image should depict — a concrete visual concept, NEVER slide text. */
  subject: string;
  /** Suggested visual style. Mirrors the /api/ai/generate-image style enum. */
  style?: 'photographic' | 'illustration' | '3d-render' | 'watercolor' | 'sketch' | 'minimal' | 'cinematic' | 'abstract';
  /** Where the image sits on the slide. */
  placement?: 'hero' | 'background' | 'right' | 'left' | 'top';
}

/**
 * Backend metadata stamped on every generated slide. Not rendered — used for
 * cross-deck search + silent agent memory. All fields optional so decks
 * built before the metadata layer stay valid.
 */
export interface SlideMetadata {
  /** Extracted from title + body — lowercased, deduped, punctuation stripped.
   *  Powers keyword search across decks. */
  keywords?: string[];
  /** Named entities on the slide (proper nouns, numbers-with-units, dates).
   *  Higher signal than raw keywords for "find the slide about X". */
  entities?: string[];
  /** Slide's job in the deck arc (from Phase D holistic view). */
  narrativeRole?: 'hook' | 'setup' | 'evidence' | 'cause' | 'consequence' | 'response' | 'close';
  /** Voice / framing angle (from Phase B editorial brief). */
  angle?: 'win' | 'warning' | 'comparison' | 'decision' | 'neutral';
  /** Layout id used — for shape-similarity matching (native captured index
   *  like `native-slide-14`, or Figma layout key like `05-content`). */
  layoutId?: string;
  /** Deck-level attributes inherited from the plan agent — same on every
   *  slide of a deck. Persisted per-slide so search results carry them. */
  audience?: string;
  tone?: string;
  /** The deck-level goal (Phase D). Same on every slide of a deck. */
  deckGoal?: string;
  /** ISO timestamp of generation — supports recency scoring in memory. */
  createdAt?: string;
}

export interface Card {
  id: string;
  layout: CardLayout;
  style: CardStyle;
  /**
   * A user-created EMPTY slide (the "+ New slide" / blank-deck path), as opposed
   * to a generation skeleton that happens to share the empty heading+paragraph
   * shape. When true the renderer must NOT paint the loading shimmer and NOT
   * render the cover motif (CoverArt) — a blank slide is genuinely empty so the
   * user can type/place content. No AI runs.
   */
  blank?: boolean;
  /**
   * Set on slide-0 of a STRUCTURED-engine deck. The structured 01-cover IS the
   * theme's real, Figma-faithful cover, so the editor must honor it as-is: do
   * NOT overlay the legacy per-theme CoverArt motif (counsel's seal, ledger's
   * ledger-lines, etc.) — that art is not in the Figma cover. Persisted so a
   * reopened structured deck stays faithful.
   */
  structuredCover?: boolean;
  background?: {
    color?: string;
    gradient?: string;
    image?: string;
    opacity?: number;
  };
  accent?: {
    type: 'image' | 'color' | 'gradient';
    value: string;
    position?: 'left' | 'right';
  };
  columns: Column[];
  /**
   * User-added freeform blocks layered above `columns`. Absent on freshly
   * generated cards; populated as the user adds text / image / shape / icon
   * blocks or detaches a structured block into the freeform layer.
   */
  freeform?: FreeformBlock[];
  /**
   * Backend metadata for cross-deck search + silent agent memory. Stamped at
   * generation time. NOT rendered on the slide — never surfaced to the user.
   * Absent on old decks (backfilled lazily on first open).
   *
   * Enables (a) cross-deck slide search ("find the slide about Zenithly") and
   * (b) the plan agent's prior-decks context ("this user made similar decks
   * before — reuse the shape").
   *
   * Rule: metadata carries SHAPE + IDENTITY signals (keywords, entities,
   * role, angle, layout), never CONTENT to be reused. New decks always fill
   * their facts from the new source.
   */
  metadata?: SlideMetadata;
  /**
   * AI designer recommendation for an auto-generated image on this slide.
   * Generation signal — consumed by the auto-image-at-creation flow (when the
   * opt-in toggle is on) as the card streams in. Harmless to persist; once an
   * image is placed the recommendation is inert (the placed block's `autoGen`
   * carries everything the swap flow needs).
   */
  imageIntent?: CardImageIntent;
  /**
   * Design Intelligence Layer — the image role + layout intent the deck planner
   * chose for this slide. OPTIONAL: absent on decks generated before the layer
   * existed, and absent if the planner pass failed (the engine falls back to
   * today's path). When present, it carries the imageRole / blockTemplate /
   * text-safe-zone / budget that governed this slide's generation + placement,
   * plus override provenance (`source`). Shape mirrors `SlideDesign` in
   * `lib/card-engine/design-types.ts` — kept as a structural field here to avoid
   * a cross-module import in the type layer (no fork). Recipe-retirement (a),
   * S3b: the `recipe` field is removed (recipe no longer drives anything).
   */
  slideDesign?: {
    slideId: string;
    role: 'cover' | 'point' | 'evidence' | 'stats' | 'context' | 'close';
    /** The blueprint's blockTemplate intent, carried onto the design so the
     *  layout stage decides composition from realized content + intent. Populated
     *  by applyDesign; B2b: the converter's pickTemplate keys on THIS (recipe no
     *  longer drives layout). Optional for legacy decks. */
    blockTemplate?: string;
    /** Stamped by the converter (from the blockTemplate-driven composition, B2b)
     *  while columns are intact, so the client auto-image gate reads it instead of
     *  re-deriving — a full-canvas composition gets NO auto-image (P3a). */
    isFullCanvasComposition?: boolean;
    imageRole: 'none' | 'full-bleed' | 'column' | 'band' | 'texture' | 'duotone' | 'background';
    contentBudget: {
      headingMaxWords: number;
      bodyMaxWords: number;
      bullets?: number;
      stats?: number;
    };
    textSafeZone: 'full' | 'left' | 'right' | 'lower-third' | 'corner' | 'none' | 'center';
    themeArchetype: 'editorial' | 'cinematic' | 'warm' | 'product';
    /** 'designer' = composed by the server-side cover Designer (positioned freeform
     *  already on the card; the editor renders it as-is and skips re-composing).
     *  'piece' = composed by replaying an approved cover LayoutPiece's saved
     *  geometry (WI-1 layout-as-data); like 'designer' it is idempotent + frozen
     *  on reload, but the distinct value makes "designCover did not run" provable
     *  straight from the data. */
    source: 'auto' | 'user' | 'designer' | 'piece';
    /**
     * WI-1 (layout-as-data) — the approved cover LayoutPiece this slide replays
     * (`cover-warm-waves` / `cover-glass-ribbon` / `cover-diagonal-split`). When
     * set to a KNOWN id, composeGeneratedCover short-circuits BEFORE designCover
     * and renders the piece's saved {x,y,w,h} geometry verbatim (never recomputed)
     * plus its named decorative treatment. Absent → legacy designCover path.
     */
    coverLayoutId?: string;
    /**
     * Cover-tier (slide 0 only) — the title/cover treatment this slide uses.
     * 'photo' = full-bleed image + scrim, 'split' = image panel + type panel,
     * 'type' = typographic stage (no imagery, corner motif). Auto-picked from
     * the theme's identity and overridable via the per-slide "Try different
     * cover" swap. Absent on non-cover slides. Mirrors `CoverTier` in
     * lib/card-engine/cover-tiers.ts (structural field — no cross-module import
     * in the type layer).
     */
    coverTier?: 'photo' | 'split' | 'type';
    /**
     * Title treatment (slide 0 only) — the type-only cover grammar, the third
     * cover axis (independent of theme + coverTier). Auto-picked via
     * titleTreatmentForTheme() and overridable via the per-slide "Try a
     * different title" swap. Absent on non-cover slides + on decks generated
     * before this axis. Mirrors `TitleTreatment` in
     * lib/card-engine/title-treatments.ts (structural string-union here — no
     * cross-module import in the type layer).
     */
    titleTreatment?:
      | 'anchor'
      | 'drop-cap'
      | 'chapter-divider'
      | 'numbered-index'
      | 'ledger-folio'
      | 'all-caps-masthead'
      | 'centered-colophon'
      | 'statement'
      | 'stacked-baseline'
      | 'sunrise-wash'
      | 'stacked-poster';
    /**
     * Composition form (slide 0 only) — the dynamic image+title structure when
     * a cover image exists. Picked by selectComposition() from image + theme +
     * headline signals (or constrained to a user-chosen allowed set) and
     * overridable per slide. Absent when no cover image (cover falls back to
     * coverTier/titleTreatment). Mirrors `CompositionForm` in
     * lib/card-engine/composition.ts (structural string-union — no cross-module
     * import in the type layer).
     */
    compositionForm?:
      | 'vertical-half'
      | 'diagonal-split'
      | 'band-image-top'
      | 'band-image-bottom'
      | 'full-bleed-overlay'
      | 'type-only';
    /** Title block position, paired with compositionForm (computed opposite
     *  the image region). Absent when compositionForm is. */
    titlePosition?:
      | 'left-column'
      | 'right-column'
      | 'top-band'
      | 'bottom-band'
      | 'bottom-overlay'
      | 'centered-overlay';
    /**
     * Deck-level — the user's allowed set of composition forms (multi-select
     * "Title layout" picker). When present + non-empty, the engine only rotates
     * among these; empty/absent = engine free to use any. Persisted on the
     * cover slide so reopening a deck keeps the constraint.
     */
    allowedCompositionForms?: Array<
      | 'vertical-half'
      | 'diagonal-split'
      | 'band-image-top'
      | 'band-image-bottom'
      | 'full-bleed-overlay'
      | 'type-only'
    >;
  };
  /**
   * Design Intelligence Layer (Phase 3) — the critique-loop report for this
   * slide. OPTIONAL: absent on decks generated before the loop existed, and
   * absent when the critique pass failed or had nothing to flag (a clean slide
   * carries no report). The loop runs a deterministic Tier-A pass after
   * assembly: it silently auto-fixes what it can and records every issue here.
   * Unresolved issues (`issues[].resolved === false`) drive a subtle,
   * non-blocking review dot on the thumbnail/card — no summary modal. Shape
   * mirrors `CritiqueReport` in `lib/card-engine/critique.ts` (structural field
   * here to avoid a cross-module import in the type layer — no fork).
   */
  critique?: {
    slideId: string;
    issues: {
      check:
        | 'overflow'
        | 'widow'
        | 'collision'
        | 'placeholder'
        | 'density'
        | 'contrast'
        | 'hierarchy'
        | 'rhythm'
        | 'empty'
        | 'visual';
      severity: 'low' | 'med' | 'high';
      resolved: boolean;
      /** Human-readable note (what was fixed, or what to look at). */
      detail?: string;
      fixApplied?: string;
    }[];
    /** Which tier last touched this slide: 'A' deterministic, 'B' VLM. */
    passedAt: 'A' | 'B';
  };
  /**
   * Set when this card was generated from a source document via Phase E.
   * Absent on prompt-only or hand-edited cards.
   */
  provenance?: CardProvenance;
}

// ── Template ──────────────────────────────────────────────────────────────────

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  theme: TemplateTheme;
  cards: Card[];
  /**
   * The active document theme id (one of the 12 themes from
   * `components/themes/themes.ts` — counsel, volt, obsidian, etc.).
   * Distinct from `theme` above (the legacy in-template TemplateTheme).
   *
   * When set, the editor seeds ThemeProvider with this id on load so
   * reopening a saved deck restores the visual theme it was saved with.
   * Optional for backward compat with decks created before this field
   * existed — those load with the default theme.
   */
  themeId?: string;
  /**
   * Registry of source documents this deck was grounded in (Phase E).
   * Cards reference these by id via `Card.provenance.sourceDocId`.
   * Absent on prompt-only or hand-edited decks.
   */
  sources?: SourceDocument[];
}
