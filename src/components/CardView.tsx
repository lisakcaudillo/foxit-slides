'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  GripVertical,
  Sparkles,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Upload,
  FileText,
  ClipboardPaste,
  PenTool,
  Calendar,
  Type,
  CheckSquare,
  Hash,
  X,
} from 'lucide-react';
import type { Block, BlockDiff, SignField, SignParty } from '@/types';

// --- Props ---

interface CardViewProps {
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
  onEditingChange?: (isEditing: boolean) => void;
  parties?: SignParty[];
  onRemoveField?: (blockId: string, fieldId: string) => void;
  pendingField?: Omit<SignField, 'id'> | null;
  onPlaceField?: (blockId: string, offsetY: number) => void;
  revealIndex?: number | null;
  onBlockDelete?: (blockId: string) => void;
  onBlockAdd?: (afterId: string) => void;
}

// --- Utility ---

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

// --- Block type detection ---

type BlockType = 'heading' | 'paragraph' | 'clause' | 'list';

function detectBlockType(content: string, index: number): BlockType {
  const plain = content.replace(/<[^>]*>/g, '').trim();
  if (index === 0 && plain.length < 100) return 'heading';
  if (plain.startsWith('# ') || plain.startsWith('## ')) return 'heading';
  if (/^[-*]\s/.test(plain) || /^\d+\.\s/.test(plain)) return 'list';
  if (plain.length > 0 && plain.length < 60 && !plain.includes('.')) return 'heading';
  if (/\bshall\b|\bmust\b|\bhereby\b|\bwhereas\b/i.test(plain)) return 'clause';
  return 'paragraph';
}

const typeBadgeStyles: Record<BlockType, { label: string; classes: string }> = {
  heading: { label: 'Heading', classes: 'bg-slate-100 text-slate-600' },
  paragraph: { label: 'Paragraph', classes: 'bg-slate-50 text-slate-500' },
  clause: { label: 'Clause', classes: 'bg-violet-50 text-violet-600' },
  list: { label: 'List', classes: 'bg-slate-50 text-slate-500' },
};

const typeContentStyles: Record<BlockType, string> = {
  heading: 'text-lg font-semibold text-slate-900',
  paragraph: 'text-sm text-slate-900 leading-relaxed',
  clause: 'text-sm text-slate-900 leading-relaxed',
  list: 'text-sm text-slate-900 leading-relaxed',
};

// --- Party Colors ---

const PARTY_COLORS: Record<number, { bg: string; border: string; dot: string }> = {
  0: { bg: 'bg-violet-100', border: 'border-violet-300', dot: 'bg-violet-500' },
  1: { bg: 'bg-emerald-100', border: 'border-emerald-300', dot: 'bg-emerald-500' },
  2: { bg: 'bg-amber-100', border: 'border-amber-300', dot: 'bg-amber-500' },
  3: { bg: 'bg-rose-100', border: 'border-rose-300', dot: 'bg-rose-500' },
};

function getPartyColor(partyIndex: number) {
  return PARTY_COLORS[partyIndex] ?? PARTY_COLORS[0];
}

// --- Sign Field Dots ---

function SignFieldDots({
  fields,
  parties,
}: {
  fields: SignField[];
  parties: SignParty[];
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {fields.map((field) => {
        const colors = getPartyColor(field.partyIndex);
        const partyName = parties[field.partyIndex]?.name ?? `Party ${field.partyIndex + 1}`;
        return (
          <span
            key={field.id}
            className={cn('size-2.5 rounded-full', colors.dot)}
            title={`${field.label} - ${partyName}`}
          />
        );
      })}
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
    <div className="px-4 py-3">
      <div className="space-y-1 text-sm leading-relaxed">
        {diff.deleted && (
          <span className="text-red-400 line-through">{diff.deleted}</span>
        )}
        {diff.deleted && diff.inserted && ' '}
        {diff.inserted && (
          <span className="text-emerald-600">{diff.inserted}</span>
        )}
      </div>
      <div className="mt-3 flex gap-3">
        <button
          onClick={onAccept}
          className="text-xs font-medium text-violet-600 hover:text-violet-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="text-xs font-medium text-slate-400 hover:text-slate-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// --- Card Block ---

function CardBlock({
  block,
  index,
  totalBlocks,
  onUpdate,
  onAIRewrite,
  onDiffAccept,
  onDiffReject,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEditingChange,
  parties,
  onRemoveField,
  hasPendingField,
  onPlaceField,
  isRevealed,
  onDelete,
  onAdd,
  onMoveUp,
  onMoveDown,
}: {
  block: Block;
  index: number;
  totalBlocks: number;
  onUpdate: (content: string) => void;
  onAIRewrite: () => void;
  onDiffAccept: () => void;
  onDiffReject: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  onEditingChange?: (isEditing: boolean) => void;
  parties: SignParty[];
  onRemoveField?: (fieldId: string) => void;
  hasPendingField: boolean;
  onPlaceField?: (offsetY: number) => void;
  isRevealed: boolean;
  onDelete?: () => void;
  onAdd?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);
  const blockType = detectBlockType(block.content, index);
  const badge = typeBadgeStyles[blockType];

  useEffect(() => {
    if (editorRef.current && !isEditingRef.current) {
      if (editorRef.current.innerHTML !== block.content) {
        editorRef.current.innerHTML = block.content;
      }
    }
  }, [block.content]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onUpdate(editorRef.current.innerHTML);
    }
  }, [onUpdate]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
    onEditingChange?.(true);
  }, [onEditingChange]);

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    onEditingChange?.(false);
  }, [onEditingChange]);

  return (
    <div
      className={cn(
        'group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200',
        !isRevealed && 'opacity-0 translate-y-4',
        isRevealed && 'animate-card-reveal',
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(e, index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
    >
      {/* Card Header: drag handle + type badge */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <button
            className="size-7 rounded flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-100 cursor-grab transition-colors"
            aria-label="Drag to reorder"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </button>
          {block.bookmark && (
            <span className="text-[11px] font-medium text-slate-400 truncate max-w-[120px]">
              {block.bookmark}
            </span>
          )}
        </div>
        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', badge.classes)}>
          {badge.label}
        </span>
      </div>

      {/* Content area */}
      {block.diff ? (
        <DiffView
          diff={block.diff}
          onAccept={onDiffAccept}
          onReject={onDiffReject}
        />
      ) : (
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(
              'w-full min-h-[80px] px-4 py-3 bg-transparent border-none outline-none resize-none',
              'focus:ring-2 focus:ring-violet-400 focus:ring-inset rounded-b-xl',
              typeContentStyles[blockType],
            )}
            data-placeholder="Start typing..."
          />
          {/* Click-to-place field overlay */}
          {hasPendingField && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                const percentage = Math.max(0, Math.min(100, Math.round((relativeY / rect.height) * 100)));
                onPlaceField?.(percentage);
              }}
              className="absolute inset-0 z-10 rounded-b-xl border-2 border-dashed border-violet-400 bg-violet-50/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
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
        </div>
      )}

      {/* Footer: sign fields + action bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {block.signFields && block.signFields.length > 0 && (
            <SignFieldDots fields={block.signFields} parties={parties} />
          )}
          {onRemoveField && block.signFields && block.signFields.length > 0 && (
            <button
              onClick={() => {
                const lastField = block.signFields?.[block.signFields.length - 1];
                if (lastField) onRemoveField(lastField.id);
              }}
              className="text-[10px] text-slate-400 hover:text-slate-600 min-h-[44px] flex items-center"
              title="Remove last field"
            >
              Remove field
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!block.diff && block.content.trim() && (
            <button
              onClick={onAIRewrite}
              className="size-10 min-h-[44px] min-w-[44px] rounded-md hover:bg-violet-50 flex items-center justify-center text-violet-400 hover:text-violet-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
              title="Rewrite with AI"
              aria-label="Rewrite with AI"
            >
              <Sparkles className="size-4" />
            </button>
          )}
          {index > 0 && (
            <button
              onClick={onMoveUp}
              className="size-10 min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
              title="Move up"
              aria-label="Move up"
            >
              <ChevronUp className="size-4" />
            </button>
          )}
          {index < totalBlocks - 1 && (
            <button
              onClick={onMoveDown}
              className="size-10 min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
              title="Move down"
              aria-label="Move down"
            >
              <ChevronDown className="size-4" />
            </button>
          )}
          {onAdd && (
            <button
              onClick={onAdd}
              className="size-10 min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
              title="Add block after"
              aria-label="Add block after"
            >
              <Plus className="size-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="size-10 min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
              title="Delete block"
              aria-label="Delete block"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
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

// --- Empty State ---

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
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');

  if (showGenerate && onGenerateAI) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-sm font-medium text-slate-700 mb-3">Describe the document you want to create</div>
          <textarea
            autoFocus
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            placeholder="e.g. A mutual NDA between two companies with standard confidentiality terms..."
            className="min-h-[150px] w-full resize-none rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
          />
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => {
                if (generatePrompt.trim()) onGenerateAI(generatePrompt.trim());
              }}
              disabled={!generatePrompt.trim() || isGenerating}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
            <button
              onClick={() => { setShowGenerate(false); setGeneratePrompt(''); }}
              className="text-sm font-medium text-slate-500 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showPaste) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <textarea
            autoFocus
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="Paste your document text here..."
            className="min-h-[300px] w-full resize-none rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-900 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
          />
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => {
                if (pasteValue.trim()) onPasteText(pasteValue);
              }}
              disabled={!pasteValue.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Create Document
            </button>
            <button
              onClick={() => { setShowPaste(false); setPasteValue(''); }}
              className="text-sm font-medium text-slate-500 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center max-w-md">
        <div className="rounded-lg border-2 border-dashed border-slate-200 px-12 py-10 mb-6">
          <FileText className="size-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            Import a document or start from scratch
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onUploadPDF}
            className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 min-h-[44px]"
          >
            <Upload className="size-4" />
            Upload PDF
          </button>
          <button
            onClick={() => setShowPaste(true)}
            className="flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 min-h-[44px]"
          >
            <ClipboardPaste className="size-4" />
            Paste Text
          </button>
          <button
            onClick={onStartBlank}
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-600 min-h-[44px] px-3"
          >
            Start blank
          </button>
          {onGenerateAI && (
            <button
              onClick={() => setShowGenerate(true)}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 min-h-[44px]"
            >
              <Sparkles className="size-4" />
              Create with AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main CardView ---

export default function CardView({
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
  onEditingChange,
  parties = [],
  onRemoveField,
  pendingField,
  onPlaceField,
  revealIndex,
  onBlockDelete,
  onBlockAdd,
}: CardViewProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, index: number) => {
    setDropTargetIndex(index);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        onBlockReorder(dragIndex, toIndex);
      }
      setDragIndex(null);
      setDropTargetIndex(null);
    },
    [dragIndex, onBlockReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTargetIndex(null);
  }, []);

  // Empty state
  if (blocks.length === 0) {
    return (
      <EmptyState
        onUploadPDF={onUploadPDF}
        onStartBlank={onStartBlank}
        onPasteText={onPasteText}
        onGenerateAI={onGenerateAI}
        isGenerating={isGenerating}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Card reveal animation style */}
      <style>{`
        @keyframes card-reveal {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-card-reveal {
          animation: card-reveal 300ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-card-reveal {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {blocks.map((block, index) => {
          const isRevealed = revealIndex === null || revealIndex === undefined || index <= revealIndex;

          return (
            <CardBlock
              key={block.id}
              block={block}
              index={index}
              totalBlocks={blocks.length}
              onUpdate={(content) => onBlockUpdate(block.id, content)}
              onAIRewrite={() => onAIRewrite(block.id)}
              onDiffAccept={() => onDiffAccept(block.id)}
              onDiffReject={() => onDiffReject(block.id)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onEditingChange={onEditingChange}
              parties={parties}
              onRemoveField={onRemoveField ? (fieldId) => onRemoveField(block.id, fieldId) : undefined}
              hasPendingField={!!pendingField}
              onPlaceField={onPlaceField ? (offsetY) => onPlaceField(block.id, offsetY) : undefined}
              isRevealed={isRevealed}
              onDelete={onBlockDelete ? () => onBlockDelete(block.id) : undefined}
              onAdd={onBlockAdd ? () => onBlockAdd(block.id) : undefined}
              onMoveUp={() => {
                if (index > 0) onBlockReorder(index, index - 1);
              }}
              onMoveDown={() => {
                if (index < blocks.length - 1) onBlockReorder(index, index + 1);
              }}
            />
          );
        })}
      </div>

      {/* Drop target indicator */}
      {dragIndex !== null && dropTargetIndex !== null && dragIndex !== dropTargetIndex && (
        <div
          className="fixed pointer-events-none z-50 h-1 bg-violet-500 rounded-full"
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
