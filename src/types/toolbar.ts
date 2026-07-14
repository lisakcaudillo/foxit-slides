// ── Unified Toolbar State Machine ──────────────────────────────────────────
// Shared across A4 Canvas editor (ProgressiveToolbar) and Card editor
// (CardEditToolbar) so both surfaces use the same state vocabulary.

/** Toolbar context — determines which tool group is visible */
export type ToolbarContext =
  | 'idle'           // Nothing active — no toolbar
  | 'block-hover'    // Hovering a block — show block actions (move, delete, convert)
  | 'card-selected'  // Card-level actions — reorder, duplicate, delete, regenerate, layout
  | 'text-selected'  // Text is selected — formatting + AI
  | 'foxit-context'  // PDF tools active — redact, watermark, protect
  | 'esign-focus'    // eSign field selected — field tools
  | 'hidden';        // Explicitly hidden

/** Active formatting state for Bold/Italic/Underline toggle buttons */
export interface FormattingState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** Absolute position for floating toolbar placement */
export interface ToolbarPosition {
  top: number;
  left: number;
}

/** Actions available per toolbar context */
export interface ToolbarActions {
  // Text formatting
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onFontSize?: (delta: number) => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onColor?: (color: string) => void;

  // Block/card actions
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onConvert?: (type: string) => void;

  // AI actions
  onAIAction?: (action: string) => void;
  onRegenerate?: () => void;

  // Card-specific
  onLayoutSwap?: () => void;

  // Foxit-specific
  onRedact?: () => void;
  onWatermark?: () => void;
  onProtect?: () => void;
  onExport?: () => void;

  // eSign-specific
  onFieldTypeChange?: (type: string) => void;
  onFieldDelete?: () => void;
  onFieldPartyChange?: (partyIndex: number) => void;
}
