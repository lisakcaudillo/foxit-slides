'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  Minus,
  Plus,
  Type,
  ChevronDown,
  Palette,
  Shield,
  Stamp,
  PenTool,
  Lock,
  FileDown,
  Wand2,
  Scissors,
  Expand,
  Shrink,
  MessageSquare,
  List,
  ListOrdered,
  Link2,
  Trash2,
  ArrowUpDown,
  Scale,
  FileCheck,
  AlertTriangle,
  BookOpen,
  Gavel,
  FileText,
  Zap,
  Smile,
  Briefcase,
  SlidersHorizontal,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { isFoxitReady, type FoxitCapability } from '@/lib/foxit';
import type { ToolbarContext, FormattingState } from '@/types/toolbar';

// ── Progressive Toolbar ────────────────────────────────────────────────────
// State machine — toolbar adapts based on user context:
// idle → block-hover → text-selected → foxit-context → esign-focus

// Re-export as ToolbarState for backward compatibility with existing consumers
export type ToolbarState = ToolbarContext;

// ── Document Context for AI Suggestions ───────────────────────────────────

export interface DocumentContext {
  documentType?: string;
  sensitivityLevel?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  blockCount?: number;
  activeBlockType?: string;
  activeBlockContent?: string;
  hasFields?: boolean;
}

export interface AISuggestion {
  id: string;
  label: string;
  action: string;
  icon: LucideIcon;
  description: string;
  priority: number;
}

interface ProgressiveToolbarProps {
  /** Current toolbar state — driven by parent based on user interactions */
  state: ToolbarState;
  /** Position for floating mode (text-selected state) */
  floatingPosition?: { top: number; left: number };
  /** Document context for contextual AI suggestions */
  documentContext?: DocumentContext;
  /** Active formatting state for Bold/Italic/Underline buttons */
  formattingState?: FormattingState;

  // ── Formatting callbacks ──
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onFontSize?: (delta: number) => void;
  onColor?: (color: string) => void;

  // ── AI callbacks ──
  onAIRewrite?: () => void;
  onAIAction?: (action: string) => void;

  // ── Foxit callbacks ──
  onRedact?: () => void;
  onWatermark?: () => void;
  onDigitalSign?: () => void;
  onProtect?: () => void;
  onExportPDF?: () => void;

  // ── eSign callbacks ──
  onFieldTypeChange?: (type: string) => void;
  onFieldDelete?: () => void;
  onFieldPartyChange?: (partyIndex: number) => void;

  // ── Block callbacks ──
  onBlockAIRewrite?: () => void;
  onBlockDelete?: () => void;
  onBlockMoveUp?: () => void;
  onBlockMoveDown?: () => void;
  onBlockConvert?: (type: string) => void;
}

// ── Static AI Actions (always available) ──────────────────────────────────

const AI_ACTIONS = [
  { label: 'Summarize', action: 'summarize', icon: Shrink, description: 'Condense to key points' },
  { label: 'Expand', action: 'expand', icon: Expand, description: 'Add more detail' },
  { label: 'Shorten', action: 'shorten', icon: Scissors, description: 'Make more concise' },
  { label: 'Rewrite', action: 'rewrite', icon: Wand2, description: 'Rephrase entirely' },
] as const;

// ── Contextual Suggestion Engine ──────────────────────────────────────────

function getContextualSuggestions(ctx: DocumentContext | undefined): AISuggestion[] {
  if (!ctx) return [];

  const suggestions: AISuggestion[] = [];
  const docType = (ctx.documentType ?? '').toLowerCase();
  const tags = (ctx.tags ?? []).map(t => t.toLowerCase());
  const blockType = (ctx.activeBlockType ?? '').toLowerCase();
  const content = (ctx.activeBlockContent ?? '').toLowerCase();
  const sensitivity = ctx.sensitivityLevel ?? 'low';

  // ── Document-type-based suggestions ──

  // Legal documents: contracts, NDAs, agreements
  if (docType.includes('contract') || docType.includes('nda') || docType.includes('agreement') || tags.includes('legal')) {
    suggestions.push(
      { id: 'legal-review', label: 'Review Clauses', action: 'legal-review', icon: Gavel, description: 'Check for missing standard clauses', priority: 10 },
      { id: 'plain-language', label: 'Simplify', action: 'plain-language', icon: BookOpen, description: 'Simplify legal jargon', priority: 8 },
    );
    if (blockType === 'clause' || blockType === 'definition') {
      suggestions.push(
        { id: 'strengthen-clause', label: 'Strengthen', action: 'strengthen-clause', icon: Scale, description: 'Make this clause more protective', priority: 12 },
      );
    }
  }

  // Proposals, briefs, reports
  if (docType.includes('proposal') || docType.includes('brief') || docType.includes('report')) {
    suggestions.push(
      { id: 'add-executive-summary', label: 'Add Summary', action: 'add-executive-summary', icon: FileText, description: 'Generate an executive summary', priority: 9 },
      { id: 'improve-structure', label: 'Restructure', action: 'improve-structure', icon: FileCheck, description: 'Suggest better section organization', priority: 7 },
    );
  }

  // Financial documents
  if (tags.includes('financial') || tags.includes('finance') || docType.includes('invoice') || docType.includes('statement')) {
    suggestions.push(
      { id: 'verify-calculations', label: 'Check Numbers', action: 'verify-calculations', icon: FileCheck, description: 'Flag potentially inconsistent figures', priority: 10 },
    );
  }

  // ── Sensitivity-based suggestions ──

  if (sensitivity === 'high' || sensitivity === 'critical') {
    suggestions.push(
      { id: 'redact-pii', label: 'Check for Sensitive Info', action: 'compliance-check', icon: Shield, description: 'Scan for personal information to redact', priority: 15 },
    );
  }

  if (sensitivity === 'critical') {
    suggestions.push(
      { id: 'add-confidential', label: 'Add Confidential Mark', action: 'add-confidential-watermark', icon: Stamp, description: 'Add confidentiality watermark', priority: 14 },
    );
  }

  // ── Content-based suggestions (active block analysis) ──

  if (content.length > 500) {
    suggestions.push(
      { id: 'ctx-summarize', label: 'Summarize Block', action: 'summarize', icon: Shrink, description: 'This block is long — condense it', priority: 6 },
    );
  }

  if (content.length > 0 && content.length < 50 && blockType === 'paragraph') {
    suggestions.push(
      { id: 'ctx-expand', label: 'Expand Block', action: 'expand', icon: Expand, description: 'This block seems brief — add detail', priority: 5 },
    );
  }

  // Detect vague language patterns
  if (/\b(various|several|some|certain|appropriate|reasonable|etc\.?|and so on)\b/.test(content)) {
    suggestions.push(
      { id: 'make-specific', label: 'Be Specific', action: 'make-specific', icon: Zap, description: 'Replace vague terms with specifics', priority: 8 },
    );
  }

  // Detect passive voice patterns
  if (/\b(was|were|been|being|is|are)\s+(being\s+)?\w+ed\b/.test(content)) {
    suggestions.push(
      { id: 'active-voice', label: 'Use Active Voice', action: 'active-voice', icon: Zap, description: 'Convert passive constructions to active', priority: 7 },
    );
  }

  // Signature blocks
  if (blockType === 'signature-block' && !ctx.hasFields) {
    suggestions.push(
      { id: 'infer-fields', label: 'Add Sign Fields', action: 'extract-fields', icon: PenTool, description: 'Auto-detect and place signature fields', priority: 11 },
    );
  }

  // ── Structure-based suggestions ──

  if ((ctx.blockCount ?? 0) > 20) {
    suggestions.push(
      { id: 'add-toc', label: 'Add Contents', action: 'add-toc', icon: ListOrdered, description: 'Generate a table of contents from headings', priority: 4 },
    );
  }

  // Sort by priority descending, cap at 3 suggestions
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}

// ── Text Colors (approved palette: slate + violet) ─────────────────────────

const TEXT_COLORS = [
  { label: 'Default', value: '#0f172a' },     // slate-900
  { label: 'Muted', value: '#64748b' },       // slate-500
  { label: 'Accent', value: '#7c3aed' },      // violet-600
  { label: 'Subtle', value: '#94a3b8' },       // slate-400
];

// ── Foxit Tools ────────────────────────────────────────────────────────────

const FOXIT_TOOLS: Array<{
  label: string;
  capability: FoxitCapability;
  icon: typeof Shield;
  description: string;
  callbackKey: keyof Pick<ProgressiveToolbarProps, 'onRedact' | 'onWatermark' | 'onDigitalSign' | 'onProtect' | 'onExportPDF'>;
}> = [
  { label: 'Remove Sensitive Content', capability: 'redact', icon: Shield, description: 'Permanently remove sensitive content', callbackKey: 'onRedact' },
  { label: 'Add Watermark', capability: 'watermark', icon: Stamp, description: 'Add text or image watermark', callbackKey: 'onWatermark' },
  { label: 'Sign', capability: 'digital-signature', icon: PenTool, description: 'Apply digital signature', callbackKey: 'onDigitalSign' },
  { label: 'Lock', capability: 'protect', icon: Lock, description: 'Password-protect and encrypt', callbackKey: 'onProtect' },
  { label: 'Export', capability: 'export-pdf', icon: FileDown, description: 'Export as PDF document', callbackKey: 'onExportPDF' },
];

// ── Suggestion Chips ──────────────────────────────────────────────────────

function SuggestionChips({
  suggestions,
  onAction,
  isFloating,
}: {
  suggestions: AISuggestion[];
  onAction: (action: string) => void;
  isFloating: boolean;
}) {
  if (suggestions.length === 0) return null;

  return (
    <>
      <div className={isFloating ? 'w-px h-5 bg-slate-200/60 mx-0.5' : 'w-px h-5 bg-slate-200 mx-1'} />
      {suggestions.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            onClick={() => onAction(s.action)}
            className={`h-7 px-2 rounded-md flex items-center gap-1 text-xs font-medium transition-colors ${
              isFloating
                ? 'bg-violet-900/40 text-violet-300 hover:bg-violet-800/50 border border-violet-700/50'
                : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
            }`}
            title={s.description}
          >
            <Icon className="size-3" />
            <span>{s.label}</span>
          </button>
        );
      })}
    </>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ProgressiveToolbar(props: ProgressiveToolbarProps) {
  const { state, floatingPosition, documentContext } = props;
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFoxitMenu, setShowFoxitMenu] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [customRewriteText, setCustomRewriteText] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const foxitReady = isFoxitReady();

  const suggestions = getContextualSuggestions(documentContext);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowAIMenu(false);
        setShowColorPicker(false);
        setShowFoxitMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close menus on state change
  useEffect(() => {
    setShowAIMenu(false);
    setShowColorPicker(false);
    setShowFoxitMenu(false);
    setShowLinkInput(false);
    setLinkUrl('');
  }, [state]);

  if (state === 'idle') return null;

  // Floating position for text-selected state
  const isFloating = state === 'text-selected' && !!floatingPosition;
  const containerClass = isFloating
    ? 'fixed z-50 rounded-xl px-1.5 py-1'
    : 'bg-white border-b border-slate-200 px-4 py-1.5';

  const containerStyle = isFloating
    ? {
        top: floatingPosition!.top,
        left: floatingPosition!.left,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(228, 231, 235, 0.6)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
      }
    : undefined;

  const buttonBase = isFloating
    ? 'size-8 min-h-[44px] min-w-[44px] rounded-md hover:bg-purple-600/10 flex items-center justify-center text-slate-600 hover:text-purple-600 transition-colors'
    : 'size-8 min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors';

  const dividerClass = isFloating
    ? 'w-px h-5 bg-slate-200/60 mx-0.5'
    : 'w-px h-5 bg-slate-200 mx-1';

  const handleSuggestionAction = (action: string) => {
    props.onAIAction?.(action);
  };

  return (
    <div
      ref={toolbarRef}
      className={`flex items-center gap-0.5 flex-wrap ${containerClass}`}
      style={containerStyle}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* ── Text Selected: Formatting + AI + Suggestions ── */}
      {(state === 'text-selected') && (
        <>
          {/* Formatting — active state uses violet accent for clear visibility */}
          <button onClick={props.onBold} className={props.formattingState?.bold ? buttonBase + ' !bg-violet-100 !text-violet-700' : buttonBase} title="Bold (Ctrl+B)" aria-pressed={props.formattingState?.bold}>
            <Bold className="size-4" />
          </button>
          <button onClick={props.onItalic} className={props.formattingState?.italic ? buttonBase + ' !bg-violet-100 !text-violet-700' : buttonBase} title="Italic (Ctrl+I)" aria-pressed={props.formattingState?.italic}>
            <Italic className="size-4" />
          </button>
          <button onClick={props.onUnderline} className={props.formattingState?.underline ? buttonBase + ' !bg-violet-100 !text-violet-700' : buttonBase} title="Underline (Ctrl+U)" aria-pressed={props.formattingState?.underline}>
            <Underline className="size-4" />
          </button>

          <div className={dividerClass} />

          {/* Font size */}
          <button onClick={() => props.onFontSize?.(-1)} className={buttonBase} title="Decrease font">
            <Minus className="size-3.5" />
          </button>
          <span className={`text-xs min-w-[1.5rem] text-center ${isFloating ? 'text-slate-300' : 'text-slate-500'}`}>
            <Type className="size-3.5 inline" />
          </span>
          <button onClick={() => props.onFontSize?.(1)} className={buttonBase} title="Increase font">
            <Plus className="size-3.5" />
          </button>

          <div className={dividerClass} />

          {/* Color picker */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className={buttonBase}
              title="Text color"
            >
              <Palette className="size-4" />
            </button>
            {showColorPicker && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-slate-200 p-2 flex gap-1 z-50">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => { props.onColor?.(c.value); setShowColorPicker(false); }}
                    className="size-6 rounded-full border-2 border-white hover:border-violet-300 transition-colors"
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={dividerClass} />

          {/* Alignment */}
          <button onClick={() => props.onAlign?.('left')} className={buttonBase} title="Align left">
            <AlignLeft className="size-4" />
          </button>
          <button onClick={() => props.onAlign?.('center')} className={buttonBase} title="Center">
            <AlignCenter className="size-4" />
          </button>
          <button onClick={() => props.onAlign?.('right')} className={buttonBase} title="Align right">
            <AlignRight className="size-4" />
          </button>

          <div className={dividerClass} />

          {/* Lists + Link */}
          <button onClick={() => document.execCommand('insertUnorderedList')} className={buttonBase} title="Bullet list">
            <List className="size-4" />
          </button>
          <button onClick={() => document.execCommand('insertOrderedList')} className={buttonBase} title="Numbered list">
            <ListOrdered className="size-4" />
          </button>
          <div className="relative">
            <button onClick={() => setShowLinkInput(!showLinkInput)} className={buttonBase} title="Insert link">
              <Link2 className="size-4" />
            </button>
            {showLinkInput && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-slate-200 p-2 flex gap-1 z-50">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && linkUrl) {
                      document.execCommand('createLink', false, linkUrl);
                      setShowLinkInput(false);
                      setLinkUrl('');
                    } else if (e.key === 'Escape') {
                      setShowLinkInput(false);
                      setLinkUrl('');
                    }
                  }}
                  placeholder="https://..."
                  className="text-sm text-slate-900 border border-slate-200 rounded px-2 py-1 w-48 outline-none focus:border-violet-400"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (linkUrl) {
                      document.execCommand('createLink', false, linkUrl);
                      setShowLinkInput(false);
                      setLinkUrl('');
                    }
                  }}
                  className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          <div className={dividerClass} />

          {/* AI Actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAIMenu(!showAIMenu)}
              className={`${buttonBase} ${isFloating ? 'text-violet-300 hover:bg-violet-900/40' : 'text-purple-600 hover:bg-violet-50'}`}
              title="AI Actions"
            >
              <Sparkles className="size-4" />
              <ChevronDown className="size-3 ml-0.5" />
            </button>
            {showAIMenu && (
              <div className="absolute top-full mt-1 right-0 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[260px] z-50">
                {/* Describe your change input */}
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-h-[44px]">
                    <Sparkles className="size-3.5 text-violet-400 shrink-0" />
                    <input
                      type="text"
                      value={customRewriteText}
                      onChange={(e) => setCustomRewriteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customRewriteText.trim()) {
                          props.onAIAction?.(`custom-rewrite::${customRewriteText.trim()}`);
                          setCustomRewriteText('');
                          setShowAIMenu(false);
                        }
                      }}
                      placeholder="Describe your change..."
                      className="w-full text-sm border-none outline-none placeholder:text-slate-400 bg-transparent"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Tone pills */}
                <div className="px-3 py-2 flex gap-1.5 border-b border-slate-100">
                  <button
                    onClick={() => { props.onAIAction?.('tone-friendly'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <Smile className="size-3.5" />
                    Friendly
                  </button>
                  <button
                    onClick={() => { props.onAIAction?.('tone-professional'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <Briefcase className="size-3.5" />
                    Professional
                  </button>
                  <button
                    onClick={() => { props.onAIAction?.('tone-concise'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Concise
                  </button>
                </div>

                {/* Transform pills */}
                <div className="px-3 py-2 flex gap-1.5 border-b border-slate-100">
                  <button
                    onClick={() => { props.onAIAction?.('transform-summary'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <Shrink className="size-3.5" />
                    Summary
                  </button>
                  <button
                    onClick={() => { props.onAIAction?.('transform-key-points'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <List className="size-3.5" />
                    Key Points
                  </button>
                  <button
                    onClick={() => { props.onAIAction?.('transform-list'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <ListOrdered className="size-3.5" />
                    List
                  </button>
                  <button
                    onClick={() => { props.onAIAction?.('transform-table'); setShowAIMenu(false); }}
                    className="h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <Table2 className="size-3.5" />
                    Table
                  </button>
                </div>

                {/* Contextual suggestions */}
                {suggestions.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-violet-500 uppercase tracking-wide">
                      Suggested for this document
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { handleSuggestionAction(s.action); setShowAIMenu(false); }}
                        className="w-full px-3 py-2 text-left hover:bg-violet-50 flex items-center gap-2 transition-colors"
                      >
                        <s.icon className="size-4 text-purple-600" />
                        <div>
                          <div className="text-sm font-medium text-violet-700">{s.label}</div>
                          <div className="text-xs text-violet-400">{s.description}</div>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-slate-100 my-1" />
                  </>
                )}
                {AI_ACTIONS.map((action) => (
                  <button
                    key={action.action}
                    onClick={() => { props.onAIAction?.(action.action); setShowAIMenu(false); }}
                    className="w-full px-3 py-2 text-left hover:bg-violet-50 flex items-center gap-2 transition-colors"
                  >
                    <action.icon className="size-4 text-violet-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-700">{action.label}</div>
                      <div className="text-xs text-slate-400">{action.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contextual suggestion chips (inline, after AI dropdown) */}
          <SuggestionChips suggestions={suggestions} onAction={handleSuggestionAction} isFloating={isFloating} />
        </>
      )}

      {/* ── Block Hover: Block actions + AI + Suggestions ── */}
      {state === 'block-hover' && (
        <>
          <button onClick={props.onBlockAIRewrite} className={`${buttonBase} text-purple-600 hover:bg-violet-50`} title="AI Rewrite">
            <Sparkles className="size-4" />
          </button>
          <button onClick={props.onBlockMoveUp} className={buttonBase} title="Move up">
            <ArrowUpDown className="size-4" />
          </button>
          <button onClick={props.onBlockDelete} className={buttonBase} title="Delete block">
            <Trash2 className="size-4" />
          </button>

          <div className={dividerClass} />

          {/* Block type conversion */}
          <div className="relative">
            <button className={buttonBase} title="Convert block type" onClick={() => {
              const menu = document.getElementById('block-convert-menu');
              if (menu) menu.classList.toggle('hidden');
            }}>
              <Type className="size-4" />
              <ChevronDown className="size-3 ml-0.5" />
            </button>
          </div>

          {/* Contextual suggestion chips */}
          <SuggestionChips suggestions={suggestions} onAction={handleSuggestionAction} isFloating={false} />

          <div className={dividerClass} />

          {/* Foxit tools (hidden when SDK unavailable) */}
          {foxitReady && (
            <div className="relative">
              <button
                onClick={() => setShowFoxitMenu(!showFoxitMenu)}
                className={`${buttonBase} text-slate-500`}
                title="Document Tools"
              >
                <Shield className="size-4" />
                <ChevronDown className="size-3 ml-0.5" />
              </button>
              {showFoxitMenu && (
                <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[220px] z-50">
                  {FOXIT_TOOLS.map((tool) => (
                    <button
                      key={tool.capability}
                      onClick={() => {
                        const cb = props[tool.callbackKey];
                        if (cb) cb();
                        setShowFoxitMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 transition-colors hover:bg-slate-50 text-slate-700"
                    >
                      <tool.icon className="size-4 text-slate-500" />
                      <div>
                        <div className="text-sm font-medium">{tool.label}</div>
                        <div className="text-xs text-slate-400">{tool.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Foxit Context: Full Foxit tools (hidden when SDK unavailable) ── */}
      {state === 'foxit-context' && foxitReady && (
        <>
          {FOXIT_TOOLS.map((tool) => (
            <button
              key={tool.capability}
              onClick={() => {
                const cb = props[tool.callbackKey];
                if (cb) cb();
              }}
              className="h-8 px-2 rounded-md flex items-center gap-1.5 text-sm transition-colors hover:bg-slate-100 text-slate-700"
              title={tool.description}
            >
              <tool.icon className="size-4" />
              <span className="hidden sm:inline">{tool.label}</span>
            </button>
          ))}
        </>
      )}

      {/* ── eSign Focus: Field tools ── */}
      {state === 'esign-focus' && (
        <>
          <span className="text-xs text-slate-400 px-2">Signature Field</span>
          <div className={dividerClass} />
          {['signature', 'initial', 'date', 'text', 'textbox', 'checkbox', 'radiobutton', 'dropdown', 'attachment', 'image', 'secure', 'accept', 'decline'].map((type) => (
            <button
              key={type}
              onClick={() => props.onFieldTypeChange?.(type)}
              className={`h-8 px-2 rounded-md hover:bg-slate-100 text-xs text-slate-600 capitalize transition-colors`}
            >
              {type}
            </button>
          ))}
          <div className={dividerClass} />
          <button
            onClick={props.onFieldDelete}
            className="h-8 px-2 rounded-md hover:bg-slate-100 text-xs text-slate-500 hover:text-slate-900 transition-colors"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
