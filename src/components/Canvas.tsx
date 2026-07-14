'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Plus,
  GripVertical,
  Sparkles,
  Command,
  PenTool,
  Calendar,
  Type,
  CheckSquare,
  Hash,
  X,
  Gavel,
  Briefcase,
  FileText,
  Users,
  Upload,
  ClipboardPaste,
  ImagePlus,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { Block, BlockDiff, WorkflowBanner, SignField, SignParty } from '@/types';
import AIActionMenu from '@/components/editor/AIActionMenu';

// --- Types ---

interface DocumentFormat {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
}

interface CanvasProps {
  blocks: Block[];
  onBlockUpdate: (blockId: string, content: string) => void;
  onBlockReorder: (fromIndex: number, toIndex: number) => void;
  onAIRewrite: (blockId: string) => void;
  onDiffAccept: (blockId: string) => void;
  onDiffReject: (blockId: string) => void;
  onUploadPDF: () => void;
  onStartBlank: () => void;
  onPasteText: (text: string) => void;
  onGenerateAI?: (prompt: string) => void;
  isGenerating?: boolean;
  workflow: WorkflowBanner | null;
  onEditingChange?: (isEditing: boolean) => void;
  parties?: SignParty[];
  onRemoveField?: (blockId: string, fieldId: string) => void;
  pendingField?: Omit<SignField, 'id'> | null;
  onPlaceField?: (blockId: string, offsetY: number) => void;
  /** AI action handler for the progressive AI menu */
  onAIAction?: (blockId: string, actionId: string) => void;
  /** Block splitting on Enter key */
  onSplitBlock?: (blockId: string, contentBefore: string, contentAfter: string) => void;
  /** Slash command selection */
  onSlashCommand?: (blockId: string, command: string) => void;
  /** Slash command trigger — fires when user types "/" at start of block or after whitespace */
  onSlashTrigger?: (blockId: string, position: { top: number; left: number }) => void;
  /** Slash command dismiss */
  onSlashDismiss?: () => void;
  /** Slash command filter text update */
  onSlashFilterChange?: (filter: string) => void;
  /** Whether the slash command menu is currently open (for a specific block) */
  slashMenuBlockId?: string | null;
  /** Index of the block currently being revealed during progressive generation. null = all visible. */
  revealIndex?: number | null;
  /** Document format dimensions. Defaults to A4 (794x1123, 80px horizontal / 96px vertical padding). */
  documentFormat?: DocumentFormat;
  /** Called when user wants to generate an image via the block divider. Parent handles API call. */
  onGenerateImage?: (afterIndex: number, prompt: string, type: 'diagram' | 'photo') => void;
  /** Called when user wants to delete a block. */
  onDeleteBlock?: (blockId: string) => void;
  /** Called when user wants to regenerate an image block. */
  onRegenerateImage?: (blockId: string) => void;
}

// --- Utility: cn ---

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

// --- Markdown to HTML conversion ---

function convertMarkdownToHTML(content: string): string {
  // Skip content that is already HTML (contains tags beyond simple inline)
  if (/<(?:h[1-6]|ul|ol|li|table|div|p)\b/i.test(content)) return content;

  let html = content
    // Headings (order matters: ### before ## before #)
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-slate-900">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-semibold text-slate-900">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-semibold text-slate-900">$1</h1>')
    // Bold and italic (bold first to avoid conflict)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Ordered list items: "1. item"
    .replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>')
    // Unordered list items: "• item", "- item", "* item"  (the * case is after bold/italic replacement)
    .replace(/^[•\-]\s+(.+)$/gm, '<uli>$1</uli>')
    .replace(/^\*\s+(.+)$/gm, '<uli>$1</uli>');

  // Pipe-delimited table conversion
  const lines = html.split('\n');
  const tableLines: string[] = [];
  const outputLines: string[] = [];
  const flushTable = () => {
    if (tableLines.length >= 2) {
      // Check if lines have pipe separators (2+ pipes per line)
      const validTable = tableLines.every((l) => (l.match(/\|/g) ?? []).length >= 2);
      if (validTable) {
        const rows = tableLines
          .filter((l) => !/^\s*\|?\s*[-:]+[-|:\s]*$/.test(l)) // skip separator rows
          .map((l) =>
            l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
          );
        if (rows.length >= 1) {
          const header = rows[0];
          const body = rows.slice(1);
          let table = '<table class="w-full border-collapse text-sm"><thead><tr>';
          for (const cell of header) {
            table += `<th class="border border-slate-200 px-3 py-2 bg-slate-50 font-semibold text-left">${cell}</th>`;
          }
          table += '</tr></thead><tbody>';
          for (const row of body) {
            table += '<tr>';
            for (const cell of row) {
              table += `<td class="border border-slate-200 px-3 py-2">${cell}</td>`;
            }
            table += '</tr>';
          }
          table += '</tbody></table>';
          outputLines.push(table);
          tableLines.length = 0;
          return;
        }
      }
    }
    // Not a valid table, push lines back as-is
    outputLines.push(...tableLines);
    tableLines.length = 0;
  };
  for (const line of lines) {
    if ((line.match(/\|/g) ?? []).length >= 2) {
      tableLines.push(line);
    } else {
      if (tableLines.length > 0) flushTable();
      outputLines.push(line);
    }
  }
  if (tableLines.length > 0) flushTable();
  html = outputLines.join('\n');

  // Style template placeholders like $[Amount], [Company Name], [Date], etc.
  html = html.replace(/\$?\[([A-Za-z\s]+)\]/g, (match) =>
    `<span class="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 text-sm font-medium border border-violet-200">${match}</span>`
  );

  // Wrap consecutive <uli> in <ul> and <oli> in <ol>
  html = html.replace(/((?:<uli>.+?<\/uli>\n?)+)/g, (match) => {
    const items = match.replace(/<\/?uli>/g, (tag) =>
      tag === '<uli>' ? '<li class="ml-6 list-disc">' : '</li>'
    );
    return '<ul class="list-disc ml-6 space-y-1">' + items.trim() + '</ul>';
  });

  html = html.replace(/((?:<oli>.+?<\/oli>\n?)+)/g, (match) => {
    const items = match.replace(/<\/?oli>/g, (tag) =>
      tag === '<oli>' ? '<li class="ml-6 list-decimal">' : '</li>'
    );
    return '<ol class="list-decimal ml-6 space-y-1">' + items.trim() + '</ol>';
  });

  return html;
}

// --- Block type detection ---

type BlockType = 'h1' | 'h2' | 'p' | 'li';

function detectBlockType(content: string, _index: number): BlockType {
  const plain = content.replace(/<[^>]*>/g, '').trim();
  // HTML headings
  if (/^<h1/i.test(content.trim())) return 'h1';
  if (/^<h[23]/i.test(content.trim())) return 'h2';
  // Markdown headings
  if (plain.startsWith('# ')) return 'h1';
  if (plain.startsWith('## ') || plain.startsWith('### ')) return 'h2';
  // Lists
  if (/^[-*]\s/.test(plain)) return 'li';
  // ALL CAPS short text (section headers like "DEFINITIONS", "TERM AND TERMINATION")
  if (plain.length > 3 && plain.length < 50 && plain === plain.toUpperCase() && /[A-Z]/.test(plain)) return 'h2';
  // Everything else is a paragraph — no more guessing
  return 'p';
}

// --- Block type styles ---

const typeClasses: Record<BlockType, string> = {
  h1: 'text-2xl font-semibold text-slate-900',
  h2: 'text-xl font-semibold text-slate-900',
  p: 'text-base text-slate-700 leading-relaxed',
  li: 'text-base text-slate-700 leading-relaxed ml-6 list-disc',
};

// --- Block Divider (Notion-style "+" between blocks) ---

function BlockDivider({
  onAddBlock,
  onAddImage,
}: {
  onAddBlock: () => void;
  onAddImage?: (prompt: string, type: 'diagram' | 'photo') => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showImageForm, setShowImageForm] = useState(false);

  return (
    <div
      className="relative h-4 flex items-center group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        if (!showMenu && !showImageForm) setHovered(false);
      }}
      onClick={() => {
        if (!showMenu && !showImageForm) onAddBlock();
      }}
    >
      {/* Thin line */}
      <div
        className={cn(
          'absolute inset-x-0 h-px transition-colors',
          hovered ? 'bg-violet-300' : 'bg-transparent',
        )}
      />
      {/* Plus button on hover */}
      {(hovered || showMenu || showImageForm) && (
        <div className="absolute left-1/2 -translate-x-1/2 z-10">
          {showImageForm ? (
            <ImageInsertForm
              onSubmit={(prompt, type) => {
                onAddImage?.(prompt, type);
                setShowImageForm(false);
                setShowMenu(false);
                setHovered(false);
              }}
              onCancel={() => {
                setShowImageForm(false);
                setShowMenu(false);
                setHovered(false);
              }}
            />
          ) : showMenu ? (
            <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-1 flex gap-1">
              <button
                className="min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-50 flex items-center justify-center gap-1.5 px-3 text-sm text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  setHovered(false);
                  onAddBlock();
                }}
                title="Add text block"
              >
                <Type className="size-4 text-slate-500" />
                <span>Text</span>
              </button>
              <button
                className="min-h-[44px] min-w-[44px] rounded-md hover:bg-violet-50 flex items-center justify-center gap-1.5 px-3 text-sm text-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowImageForm(true);
                }}
                title="Add image"
              >
                <ImagePlus className="size-4" />
                <span>Image</span>
              </button>
            </div>
          ) : (
            <button
              className="size-6 rounded-full bg-violet-500 text-white flex items-center justify-center shadow-sm hover:bg-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1"
              onClick={(e) => {
                e.stopPropagation();
                if (onAddImage) {
                  setShowMenu(true);
                } else {
                  onAddBlock();
                }
              }}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Party Colors ---

const PARTY_COLORS: Record<number, { bg: string; border: string; text: string; dot: string }> = {
  0: { bg: 'bg-violet-100', border: 'border-violet-300', text: 'text-violet-700', dot: 'bg-violet-500' },
  1: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  2: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-700', dot: 'bg-amber-500' },
  3: { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-700', dot: 'bg-rose-500' },
};

function getPartyColorClasses(partyIndex: number) {
  return PARTY_COLORS[partyIndex] ?? PARTY_COLORS[0];
}

const FIELD_TYPE_ICONS: Record<SignField['type'], typeof PenTool> = {
  signature: PenTool,
  initial: Hash,
  text: Type,
  textbox: Type,
  date: Calendar,
  checkbox: CheckSquare,
  radiobutton: CheckSquare,
  dropdown: Type,
  attachment: Plus,
  image: Plus,
  secure: Type,
  accept: CheckSquare,
  decline: X,
};

// --- Sign Field Badge Overlay ---

function SignFieldBadges({
  fields,
  parties,
  onRemove,
}: {
  fields: SignField[];
  parties: SignParty[];
  onRemove?: (fieldId: string) => void;
}) {
  if (fields.length === 0) return null;

  // Check if any field has a custom offsetY — if so, use absolute positioning per badge
  const hasPositioning = fields.some((f) => f.offsetY !== undefined);

  if (hasPositioning) {
    return (
      <>
        {fields.map((field) => {
          const colors = getPartyColorClasses(field.partyIndex);
          const Icon = FIELD_TYPE_ICONS[field.type];
          const partyName = parties[field.partyIndex]?.name ?? `Party ${field.partyIndex + 1}`;
          const topPercent = field.offsetY ?? 0;
          return (
            <div
              key={field.id}
              className="absolute right-0 translate-x-[calc(100%+8px)]"
              style={{ top: `${topPercent}%` }}
            >
              <div
                className={cn(
                  'group/badge flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap',
                  colors.bg,
                  colors.border,
                  colors.text,
                )}
                title={`${field.label} - ${partyName}`}
              >
                <Icon className="size-3 flex-shrink-0" />
                <span className="max-w-[80px] truncate">{field.label}</span>
                {onRemove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(field.id);
                    }}
                    className="opacity-0 group-hover/badge:opacity-100 ml-0.5 rounded hover:bg-black/10 transition-opacity"
                    aria-label={`Remove ${field.label}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="absolute right-0 top-0 flex flex-col gap-1 translate-x-[calc(100%+8px)]">
      {fields.map((field) => {
        const colors = getPartyColorClasses(field.partyIndex);
        const Icon = FIELD_TYPE_ICONS[field.type];
        const partyName = parties[field.partyIndex]?.name ?? `Party ${field.partyIndex + 1}`;
        return (
          <div
            key={field.id}
            className={cn(
              'group/badge flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium whitespace-nowrap',
              colors.bg,
              colors.border,
              colors.text,
            )}
            title={`${field.label} - ${partyName}`}
          >
            <Icon className="size-3 flex-shrink-0" />
            <span className="max-w-[80px] truncate">{field.label}</span>
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(field.id);
                }}
                className="opacity-0 group-hover/badge:opacity-100 ml-0.5 rounded hover:bg-black/10 transition-opacity"
                aria-label={`Remove ${field.label}`}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Block Editor ---

function BlockEditor({
  block,
  index,
  isActive,
  onFocus,
  onUpdate,
  onAIRewrite,
  onDiffAccept,
  onDiffReject,
  onDragStart,
  onDragOver,
  onDrop,
  onEditingChange,
  parties,
  onRemoveField,
  hasPendingField,
  onPlaceField,
  onToggleAIMenu,
  onAIAction,
  aiMenuOpen,
  onSplitBlock,
  onSlashCommand,
  onSlashTrigger,
  onSlashDismiss,
  onSlashFilterChange,
  slashMenuOpen,
}: {
  block: Block;
  index: number;
  isActive: boolean;
  onFocus: () => void;
  onUpdate: (content: string) => void;
  onAIRewrite: () => void;
  onDiffAccept: () => void;
  onDiffReject: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onEditingChange?: (isEditing: boolean) => void;
  parties: SignParty[];
  onRemoveField?: (fieldId: string) => void;
  hasPendingField: boolean;
  onPlaceField?: (offsetY: number) => void;
  onToggleAIMenu?: () => void;
  onAIAction?: (actionId: string) => void;
  aiMenuOpen?: boolean;
  onSplitBlock?: (blockId: string, contentBefore: string, contentAfter: string) => void;
  onSlashCommand?: (blockId: string, command: string) => void;
  onSlashTrigger?: (blockId: string, position: { top: number; left: number }) => void;
  onSlashDismiss?: () => void;
  onSlashFilterChange?: (filter: string) => void;
  slashMenuOpen?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const sparkleRef = useRef<HTMLButtonElement>(null);
  const isEditingRef = useRef(false);
  const slashActiveRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragHandleHovered, setDragHandleHovered] = useState(false);
  const blockType = detectBlockType(block.content, index);

  useEffect(() => {
    if (editorRef.current && !isEditingRef.current) {
      const rendered = convertMarkdownToHTML(block.content);
      if (editorRef.current.innerHTML !== rendered) {
        editorRef.current.innerHTML = rendered;
      }
    }
  }, [block.content]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onUpdate(editorRef.current.innerHTML);

      // If slash menu is active, extract filter text after the "/"
      if (slashActiveRef.current) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const textNode = range.startContainer;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const text = textNode.textContent || '';
            const offset = range.startOffset;
            const textUpToCursor = text.slice(0, offset);
            const slashIdx = textUpToCursor.lastIndexOf('/');
            if (slashIdx >= 0) {
              const filterText = textUpToCursor.slice(slashIdx + 1);
              onSlashFilterChange?.(filterText);
            } else {
              // Slash was deleted — dismiss
              slashActiveRef.current = false;
              onSlashDismiss?.();
            }
          } else {
            // Not in a text node — check if block is now empty
            const text = editorRef.current.textContent || '';
            if (!text.includes('/')) {
              slashActiveRef.current = false;
              onSlashDismiss?.();
            }
          }
        }
      }
    }
  }, [onUpdate, onSlashFilterChange, onSlashDismiss]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
    onFocus();
    onEditingChange?.(true);
  }, [onFocus, onEditingChange]);

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    onEditingChange?.(false);
    // Dismiss slash menu when block loses focus — delay to allow menu clicks to register
    if (slashActiveRef.current) {
      setTimeout(() => {
        if (slashActiveRef.current) {
          slashActiveRef.current = false;
          onSlashDismiss?.();
        }
      }, 150);
    }
  }, [onEditingChange, onSlashDismiss]);

  // Sync slash active state with parent's menu open state
  useEffect(() => {
    if (slashMenuOpen !== undefined) {
      slashActiveRef.current = slashMenuOpen;
    }
  }, [slashMenuOpen]);

  // Helper: check if "/" should trigger slash menu (at start of block or after whitespace)
  const shouldTriggerSlash = useCallback((): boolean => {
    if (!editorRef.current) return false;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) {
      // Cursor is at element boundary — check if we're at position 0 (empty block)
      const text = editorRef.current.textContent || '';
      return text.trim().length === 0;
    }
    const textBefore = (textNode.textContent || '').slice(0, range.startOffset);
    // "/" will be the next character typed, so check if position is at start or after whitespace
    if (textBefore.length === 0) return true;
    const lastChar = textBefore[textBefore.length - 1];
    return lastChar === ' ' || lastChar === '\n' || lastChar === '\t';
  }, []);

  // Enter key block splitting + slash trigger detection
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // If slash menu is active, let the menu's capture-phase handler deal with arrow/enter/escape
    if (slashActiveRef.current) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Escape') {
        return; // handled by SlashCommandMenu
      }
      if (e.key === 'Backspace') {
        // Check if deleting "/" — if so, dismiss slash menu
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const textNode = range.startContainer;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const text = textNode.textContent || '';
            const offset = range.startOffset;
            // Find slash position by looking backwards
            const textUpToCursor = text.slice(0, offset);
            const slashIdx = textUpToCursor.lastIndexOf('/');
            if (slashIdx >= 0 && offset - slashIdx <= 1) {
              // Cursor is right after "/", backspace will remove it
              slashActiveRef.current = false;
              onSlashDismiss?.();
            }
          }
        }
      }
      return;
    }

    // Detect "/" key at valid position
    if (e.key === '/' && onSlashTrigger && shouldTriggerSlash()) {
      // Defer trigger to after the character is inserted so we can get cursor position
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          slashActiveRef.current = true;
          onSlashTrigger(block.id, {
            top: rect.bottom + 4,
            left: rect.left,
          });
        }
      }, 0);
      return;
    }

    // Enter key block splitting
    if (e.key === 'Enter' && !e.shiftKey && onSplitBlock) {
      e.preventDefault();
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const container = e.currentTarget;
      // Content before cursor
      const beforeRange = document.createRange();
      beforeRange.setStart(container, 0);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const beforeFrag = beforeRange.cloneContents();
      const beforeDiv = document.createElement('div');
      beforeDiv.appendChild(beforeFrag);
      // Content after cursor
      const afterRange = document.createRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEnd(container, container.childNodes.length);
      const afterFrag = afterRange.cloneContents();
      const afterDiv = document.createElement('div');
      afterDiv.appendChild(afterFrag);
      onSplitBlock(block.id, beforeDiv.innerHTML, afterDiv.innerHTML);
    }
  }, [block.id, onSplitBlock, onSlashTrigger, onSlashDismiss, shouldTriggerSlash]);

  return (
    <div
      className="group relative"
      style={{ marginLeft: '-48px', paddingLeft: '48px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setDragHandleHovered(false);
      }}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
    >
      {/* Drag handle — only visible when hovering near left edge */}
      <div
        className={cn(
          'absolute left-0 top-1 flex items-center transition-opacity duration-150',
          isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onMouseEnter={() => setDragHandleHovered(true)}
        onMouseLeave={() => setDragHandleHovered(false)}
      >
        <button
          className={cn(
            'min-h-[44px] min-w-[44px] rounded flex items-center justify-center transition-colors cursor-grab',
            dragHandleHovered
              ? 'bg-slate-100 text-slate-600'
              : 'text-slate-300 hover:text-slate-500',
          )}
          draggable
          onDragStart={() => onDragStart(index)}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
      </div>

      {/* AI Action sparkle on hover — opens progressive AI menu */}
      {isHovered && !block.diff && block.content.trim() && (
        <div className="absolute right-2 top-2 transition-opacity duration-150">
          <button
            ref={sparkleRef}
            onClick={() => {
              if (onToggleAIMenu) onToggleAIMenu();
              else onAIRewrite();
            }}
            className="min-h-[44px] min-w-[44px] rounded-md hover:bg-violet-50 flex items-center justify-center text-violet-400 hover:text-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
            title="AI Actions"
            aria-haspopup="menu"
            aria-expanded={aiMenuOpen}
          >
            <Sparkles className="size-4" />
          </button>
          {aiMenuOpen && onAIAction && sparkleRef.current && (
            <AIActionMenu
              blockContent={block.content}
              anchorRect={sparkleRef.current.getBoundingClientRect()}
              onAction={(actionId) => onAIAction(actionId)}
              onClose={() => onToggleAIMenu?.()}
            />
          )}
        </div>
      )}

      {/* Bookmark indicator — only show short labels, not full clause text */}
      {block.bookmark && block.bookmark.length < 60 && (
        <div className="flex items-center gap-1.5 pb-1">
          <BookmarkIcon />
          <span className="text-[11px] font-medium text-slate-400">
            {block.bookmark}
          </span>
        </div>
      )}

      {/* Block content */}
      {block.diff ? (
        <DiffView
          diff={block.diff}
          onAccept={onDiffAccept}
          onReject={onDiffReject}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full bg-transparent border-none outline-none resize-none rounded-sm transition-colors duration-100',
            typeClasses[blockType],
            isActive && 'bg-violet-50/30',
          )}
          style={{ minHeight: blockType === 'p' ? '1.5em' : 'auto' }}
          data-placeholder="Start typing..."
        />
      )}

      {/* Sign Field Badges */}
      {block.signFields && block.signFields.length > 0 && (
        <SignFieldBadges
          fields={block.signFields}
          parties={parties}
          onRemove={onRemoveField}
        />
      )}

      {/* Click-to-place overlay */}
      {hasPendingField && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const percentage = Math.max(0, Math.min(100, Math.round((relativeY / rect.height) * 100)));
            onPlaceField?.(percentage);
          }}
          className="absolute inset-0 z-10 rounded border-2 border-dashed border-violet-400 bg-violet-50/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPlaceField?.(50);
            }
          }}
        >
          <span className="text-xs font-medium text-violet-600 bg-white/80 rounded px-2 py-1 pointer-events-none">
            Click to place field here
          </span>
        </div>
      )}

      {/* Slash Command Hint */}
      {isActive && !block.content.trim() && (
        <div className="absolute left-0 top-full mt-1 text-xs text-slate-400 flex items-center gap-1">
          <Command className="size-3" />
          Type / for commands
        </div>
      )}
    </div>
  );
}

// --- Diff View ---

function DiffView({
  diff,
  onAccept,
  onReject,
}: {
  diff: BlockDiff;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="py-2">
      <div className="space-y-1 text-sm leading-relaxed">
        {diff.deleted && (
          <span className="text-slate-300 line-through">{diff.deleted}</span>
        )}
        {diff.deleted && diff.inserted && ' '}
        {diff.inserted && (
          <span className="text-violet-600">{diff.inserted}</span>
        )}
      </div>
      <div className="mt-3 flex gap-3">
        <button
          onClick={onAccept}
          className="text-xs font-medium text-violet-600 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="text-xs font-medium text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// --- Icons ---

function BookmarkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-400"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DetachIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// --- Spinner ---

function SpinnerSmall() {
  return (
    <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );
}

// --- Image Block ---

function ImageBlock({
  content,
  onRegenerate,
  onDelete,
}: {
  content: string;
  onRegenerate?: () => void;
  onDelete?: () => void;
}) {
  const isSvg = content.trimStart().startsWith('<svg');

  return (
    <div className="group/image relative rounded-lg overflow-hidden border border-slate-200" style={{ maxHeight: 400 }}>
      {isSvg ? (
        <div
          className="w-full flex items-center justify-center bg-slate-50"
          style={{ maxHeight: 400 }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : (
        <img
          src={content}
          alt="Generated image"
          className="w-full object-cover"
          style={{ maxHeight: 400 }}
          loading="lazy"
        />
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
        {onRegenerate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate();
            }}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center gap-2 px-3 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
            title="Regenerate image"
          >
            <RefreshCw className="size-4" />
            <span className="text-sm font-medium">Regenerate</span>
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center gap-2 px-3 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
            title="Delete image"
          >
            <Trash2 className="size-4" />
            <span className="text-sm font-medium">Delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Image Loading Skeleton ---

/** Data block renderer — stat-row or card-grid layout */
function DataBlock({ items, layout }: { items: Array<{ label: string; value: string | number; unit?: string }>; layout: 'stat-row' | 'card-grid' }) {
  if (layout === 'stat-row') {
    return (
      <div className="flex items-stretch gap-4 py-3">
        {items.map((item, i) => (
          <div key={i} className="flex-1 text-center px-3 py-4 rounded-lg bg-slate-50 border border-slate-100">
            <div className="text-2xl font-bold text-slate-900">
              {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              {item.unit && <span className="text-base font-normal text-slate-500 ml-1">{item.unit}</span>}
            </div>
            <div className="text-sm text-slate-500 mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    );
  }

  // card-grid
  const cols = items.length <= 2 ? 2 : items.length <= 4 ? 2 : 3;
  return (
    <div className={`grid gap-3 py-3`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">{item.label}</div>
          <div className="text-xl font-semibold text-slate-900">
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
            {item.unit && <span className="text-sm font-normal text-slate-400 ml-1">{item.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageSkeleton() {
  return (
    <div className="h-48 bg-slate-100 animate-pulse rounded-lg" />
  );
}

// --- Image Insertion Popover ---

function ImageInsertForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (prompt: string, type: 'diagram' | 'photo') => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState('');

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-3 w-80">
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe what you want to see..."
        autoFocus
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 placeholder:text-slate-400"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => prompt.trim() && onSubmit(prompt.trim(), 'diagram')}
          disabled={!prompt.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 min-h-[44px]"
        >
          <Sparkles className="size-3.5" />
          Diagram
        </button>
        <button
          onClick={() => prompt.trim() && onSubmit(prompt.trim(), 'photo')}
          disabled={!prompt.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1 min-h-[44px]"
        >
          <ImageIcon className="size-3.5" />
          Photo
        </button>
      </div>
      <button
        onClick={onCancel}
        className="mt-1 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
      >
        Cancel
      </button>
    </div>
  );
}

// --- Empty State ---

const EXAMPLE_PROMPTS = [
  { label: 'Mutual NDA between two companies', icon: Gavel, prompt: 'Mutual NDA between two companies with standard confidentiality terms' },
  { label: 'Executive summary of quarterly results', icon: Briefcase, prompt: 'Executive summary of quarterly results with key metrics and recommendations' },
  { label: 'Vendor services agreement', icon: FileText, prompt: 'Vendor services agreement with scope of work, payment terms, and liability provisions' },
  { label: 'Employee offer letter', icon: Users, prompt: 'Employee offer letter with position details, compensation, benefits, and acceptance terms' },
];

function EmptyState({
  onUploadPDF,
  onStartBlank,
  onPasteText,
  onGenerateAI,
  isGenerating,
}: {
  onUploadPDF: () => void;
  onStartBlank: () => void;
  onPasteText: (text: string) => void;
  onGenerateAI?: (prompt: string) => void;
  isGenerating?: boolean;
}) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [generatePrompt, setGeneratePrompt] = useState('');

  if (showPaste) {
    return (
      <div className="flex flex-col gap-4">
        <textarea
          autoFocus
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          placeholder="Paste your document text here..."
          className="min-h-[300px] w-full resize-none rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (pasteValue.trim()) onPasteText(pasteValue);
            }}
            disabled={!pasteValue.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Create Document
          </button>
          <button
            onClick={() => { setShowPaste(false); setPasteValue(''); }}
            className="text-sm font-medium text-slate-500 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center" style={{ minHeight: '700px' }}>
      <div className="w-full max-w-xl mx-auto text-center">
        {/* Heading */}
        <h2 className="text-xl font-semibold text-slate-900">What would you like to create?</h2>
        <p className="text-sm text-slate-500 mt-1">Start with AI, upload a document, or begin from scratch</p>

        {/* AI generation textarea — hero element */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute left-3 top-3 pointer-events-none">
              <Sparkles className="size-4 text-violet-400" />
            </div>
            <textarea
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="Describe the document you want to create..."
              className="w-full min-h-[120px] resize-none rounded-lg border border-slate-200 pl-9 pr-4 pt-3 pb-3 text-sm leading-relaxed text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30 transition-shadow"
            />
          </div>
          {onGenerateAI && (
            <button
              onClick={() => {
                if (generatePrompt.trim()) onGenerateAI(generatePrompt.trim());
              }}
              disabled={!generatePrompt.trim() || isGenerating}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {isGenerating ? (
                <>
                  <SpinnerSmall />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate
                </>
              )}
            </button>
          )}
        </div>

        {/* Example prompt cards — 2x2 grid */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example.label}
              onClick={() => setGeneratePrompt(example.prompt)}
              className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors text-left focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <example.icon className="size-3.5 flex-shrink-0 text-slate-400" />
              <span>{example.label}</span>
            </button>
          ))}
        </div>

        {/* Secondary actions row */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <button
            onClick={onUploadPDF}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
          >
            <Upload className="size-3.5" />
            Upload a document
          </button>
          <button
            onClick={() => setShowPaste(true)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
          >
            <ClipboardPaste className="size-3.5" />
            Paste text
          </button>
          <button
            onClick={onStartBlank}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400 rounded"
          >
            <FileText className="size-3.5" />
            Start blank
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Workflow Banner ---

function WorkflowBannerBar({ workflow }: { workflow: WorkflowBanner }) {
  return (
    <div className="flex items-center justify-between rounded-t-lg bg-slate-900 px-4 py-2">
      <span className="text-sm font-medium text-white">{workflow.name}</span>
      <button
        onClick={workflow.onDetach}
        className="text-slate-400 transition-colors hover:text-white"
        aria-label="Detach workflow"
      >
        <DetachIcon />
      </button>
    </div>
  );
}

// --- Main Canvas ---

export default function Canvas({
  blocks,
  onBlockUpdate,
  onBlockReorder,
  onAIRewrite,
  onDiffAccept,
  onDiffReject,
  onUploadPDF,
  onStartBlank,
  onPasteText,
  onGenerateAI,
  isGenerating,
  workflow,
  onEditingChange,
  parties = [],
  onRemoveField,
  pendingField,
  onPlaceField,
  onAIAction,
  onSplitBlock,
  onSlashCommand,
  onSlashTrigger,
  onSlashDismiss,
  onSlashFilterChange,
  slashMenuBlockId,
  revealIndex = null,
  documentFormat,
  onGenerateImage,
  onDeleteBlock,
  onRegenerateImage,
}: CanvasProps) {
  const format = documentFormat ?? { width: 794, height: 1123, paddingX: 80, paddingY: 96 };
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [aiMenuBlockId, setAiMenuBlockId] = useState<string | null>(null);
  const dragIndexRef = useRef(-1);

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (toIndex: number) => {
    const fromIndex = dragIndexRef.current;
    if (fromIndex >= 0 && fromIndex !== toIndex) {
      onBlockReorder(fromIndex, toIndex);
    }
    dragIndexRef.current = -1;
  };

  const handleAddBlock = useCallback((afterIndex: number) => {
    // Insert new empty block after the given index
    const newBlock: Block = {
      id: crypto.randomUUID(),
      content: '',
      diff: null,
    };
    // We need to use the onBlockUpdate pattern — but blocks are managed by parent.
    // For now, trigger through the existing update mechanism
    // The parent page handles block state, so we signal via a custom approach
    onBlockUpdate(`__insert_after_${afterIndex}`, newBlock.id);
  }, [onBlockUpdate]);

  // Keyboard shortcuts for formatting (Ctrl/Cmd+B, I, U, Z, Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Only intercept when focus is inside the canvas
      const target = e.target as HTMLElement;
      if (!target.isContentEditable && !target.closest('[contenteditable="true"]')) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold');
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic');
          break;
        case 'u':
          e.preventDefault();
          document.execCommand('underline');
          break;
        case 'z':
          e.preventDefault();
          if (e.shiftKey) {
            document.execCommand('redo');
          } else {
            document.execCommand('undo');
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isEmpty = blocks.length === 0;

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="w-full mx-auto py-4 px-8" style={{ maxWidth: format.width }}>
        {/* Workflow banner slot */}
        {workflow && <WorkflowBannerBar workflow={workflow} />}

        {/* Document Pages — A4 containers */}
        {isEmpty ? (
          <div
            className={cn(
              'bg-white rounded-xl shadow-sm border border-slate-200 min-h-[1056px]',
              workflow && 'rounded-t-none',
            )}
          >
            <div style={{ paddingLeft: format.paddingX, paddingRight: format.paddingX, paddingTop: format.paddingY, paddingBottom: format.paddingY }}>
              <EmptyState
                onUploadPDF={onUploadPDF}
                onStartBlank={onStartBlank}
                onPasteText={onPasteText}
                onGenerateAI={onGenerateAI}
                isGenerating={isGenerating}
              />
            </div>
          </div>
        ) : (() => {
          // Smart pagination — split blocks into pages using semantic analysis
          const isHeading = (block: Block): boolean => {
            // Use structural metadata if available (from Atlas extraction)
            if (block.blockType === 'heading') return true;
            if (block.headingLevel) return true;
            // Fallback: content-based detection
            const trimmed = (block.content ?? '').trim();
            if (/^<h[1-3]/i.test(trimmed)) return true;
            if (/^#{1,3}\s/.test(trimmed)) return true;
            if (/^\d+\.\s+[A-Z]/.test(trimmed) && trimmed.length < 100) return true;
            if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed)) return true;
            if (/^<strong>/.test(trimmed) && trimmed.length < 120) return true;
            return false;
          };

          // Estimate block height: headings ~60px, short paragraphs ~40px, long paragraphs ~80-120px
          const estimateBlockHeight = (b: Block): number => {
            const len = (b.content ?? '').replace(/<[^>]+>/g, '').length;
            if (isHeading(b)) return 60;
            if (len < 100) return 40;
            if (len < 300) return 80;
            if (len < 600) return 120;
            return 160;
          };

          const PAGE_CONTENT_HEIGHT = format.height - (format.paddingY * 2); // ~931px for A4

          // First: honor explicit page breaks
          const explicitPages: Block[][] = [[]];
          for (const block of blocks) {
            if (block.content === '__page_break__') {
              explicitPages.push([]);
            } else {
              explicitPages[explicitPages.length - 1].push(block);
            }
          }

          // Then: smart-split any page that's too tall
          const finalPages: Block[][] = [];
          for (const page of explicitPages) {
            let currentPage: Block[] = [];
            let currentHeight = 0;

            for (let i = 0; i < page.length; i++) {
              const block = page[i];
              const blockHeight = estimateBlockHeight(block);
              const wouldOverflow = currentHeight + blockHeight > PAGE_CONTENT_HEIGHT;

              if (wouldOverflow && currentPage.length > 0) {
                // Page is full — find best break point
                // Prefer breaking BEFORE a heading (keep heading with its content)
                if (isHeading(block)) {
                  // Perfect — break right here, heading starts new page
                  finalPages.push(currentPage);
                  currentPage = [block];
                  currentHeight = blockHeight;
                } else {
                  // Not a heading — look back for a nearby heading to break before
                  let breakIdx = -1;
                  for (let j = currentPage.length - 1; j >= Math.max(0, currentPage.length - 3); j--) {
                    if (isHeading(currentPage[j])) {
                      breakIdx = j;
                      break;
                    }
                  }
                  if (breakIdx >= 0 && breakIdx > 0) {
                    // Move heading + subsequent blocks to new page
                    const keepOnThisPage = currentPage.slice(0, breakIdx);
                    const moveToNextPage = currentPage.slice(breakIdx);
                    finalPages.push(keepOnThisPage);
                    currentPage = [...moveToNextPage, block];
                    currentHeight = currentPage.reduce((h, b) => h + estimateBlockHeight(b), 0);
                  } else {
                    // No good break point — just break here
                    finalPages.push(currentPage);
                    currentPage = [block];
                    currentHeight = blockHeight;
                  }
                }
              } else {
                currentPage.push(block);
                currentHeight += blockHeight;
              }
            }
            if (currentPage.length > 0) {
              finalPages.push(currentPage);
            }
          }

          return (
            <div className="space-y-0">
              {finalPages.map((pageBlocks, pageIdx) => (
                <div key={pageIdx}>
                  {/* A4 Page */}
                  <div
                    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
                    style={{ height: format.height }}
                  >
                    {/* Page content with proper A4 padding */}
                    <div className="space-y-0" style={{ paddingLeft: format.paddingX, paddingRight: format.paddingX, paddingTop: format.paddingY, paddingBottom: format.paddingY }}>
                      <div>
                {pageBlocks.map((block, index) => {
                  const globalIndex = blocks.indexOf(block);
                  const isRevealing = revealIndex !== null;
                  const isHidden = isRevealing && globalIndex > revealIndex;
                  const isTyping = isRevealing && globalIndex === revealIndex;
                  const isRevealed = !isRevealing || index < revealIndex;

                  if (isHidden) return null;

                  return (
                    <div
                      key={block.id}
                      data-block-id={block.id}
                      className={isRevealed ? 'animate-in fade-in duration-300' : ''}
                      style={isRevealed ? { animationDelay: `${index * 50}ms` } : undefined}
                    >
                      {isTyping ? (
                        <div className="py-2 animate-in fade-in duration-200">
                          <div className="text-slate-700 leading-relaxed opacity-70">
                            <span dangerouslySetInnerHTML={{ __html: convertMarkdownToHTML(block.content) }} />
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="inline-block size-1.5 rounded-full bg-violet-500 animate-pulse" />
                            <span className="inline-block size-1.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                            <span className="inline-block size-1.5 rounded-full bg-violet-300 animate-pulse" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      ) : block.blockType === 'data' && block.dataItems && block.dataItems.length > 0 ? (
                          <DataBlock items={block.dataItems} layout={block.dataLayout ?? 'stat-row'} />
                      ) : block.content === '__image_loading__' ? (
                          <ImageSkeleton />
                      ) : (block.content.trimStart().startsWith('<svg') || block.content.startsWith('https://')) && !block.diff ? (
                          <ImageBlock
                            content={block.content}
                            onRegenerate={onRegenerateImage ? () => onRegenerateImage(block.id) : undefined}
                            onDelete={onDeleteBlock ? () => onDeleteBlock(block.id) : undefined}
                          />
                      ) : (
                        <>
                          <BlockEditor
                            block={block}
                            index={index}
                            isActive={activeBlockId === block.id}
                            onFocus={() => setActiveBlockId(block.id)}
                            onUpdate={(content) => onBlockUpdate(block.id, content)}
                            onAIRewrite={() => onAIRewrite(block.id)}
                            onDiffAccept={() => onDiffAccept(block.id)}
                            onDiffReject={() => onDiffReject(block.id)}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onEditingChange={onEditingChange}
                            parties={parties}
                            onRemoveField={onRemoveField ? (fieldId) => onRemoveField(block.id, fieldId) : undefined}
                            hasPendingField={!!pendingField}
                            onPlaceField={onPlaceField ? (offsetY: number) => onPlaceField(block.id, offsetY) : undefined}
                            onToggleAIMenu={() => setAiMenuBlockId(aiMenuBlockId === block.id ? null : block.id)}
                            onAIAction={onAIAction ? (actionId) => onAIAction(block.id, actionId) : undefined}
                            aiMenuOpen={aiMenuBlockId === block.id}
                            onSplitBlock={onSplitBlock}
                            onSlashCommand={onSlashCommand}
                            onSlashTrigger={onSlashTrigger}
                            onSlashDismiss={onSlashDismiss}
                            onSlashFilterChange={onSlashFilterChange}
                            slashMenuOpen={slashMenuBlockId === block.id}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
                    </div>
                  </div>

                  {/* "+" button between pages */}
                  {pageIdx < finalPages.length - 1 && (
                    <div className="flex items-center justify-center py-4">
                      <div className="flex-1 border-t border-slate-200" />
                      <span className="text-xs text-slate-300 px-3">Page {pageIdx + 1} / {finalPages.length}</span>
                      <div className="flex-1 border-t border-slate-200" />
                    </div>
                  )}
                </div>
              ))}

              {/* Add new page button at the end */}
              <div className="flex items-center justify-center py-6">
                <button
                  onClick={() => {
                    // Insert a page break marker + empty block
                    const breakBlock: Block = { id: crypto.randomUUID(), content: '__page_break__', diff: null };
                    const emptyBlock: Block = { id: crypto.randomUUID(), content: '', diff: null };
                    onBlockUpdate(`__insert_page_break_${blocks.length - 1}`, `${breakBlock.id}|${emptyBlock.id}`);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
                  style={{ color: '#6B3FA0', background: 'rgba(107, 63, 160, 0.06)', border: '1px solid rgba(107, 63, 160, 0.15)' }}
                >
                  <Plus className="size-4" />
                  Add Page
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export type { CanvasProps };
