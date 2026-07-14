'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Trash2,
  Plus,
  Upload,
  FileText,
  ClipboardPaste,
  PenTool,
} from 'lucide-react';
import type { Block, BlockDiff, SignField, SignParty } from '@/types';

// --- Types ---

interface SlideViewProps {
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

// --- Markdown to HTML conversion ---

function convertMarkdownToHTML(content: string): string {
  // Skip content that is already HTML (contains tags beyond simple inline)
  if (/<(?:h[1-6]|ul|ol|li|table|div|p)\b/i.test(content)) return content;

  let html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-slate-900">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-semibold text-slate-900">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-semibold text-slate-900">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>')
    .replace(/^[•\-]\s+(.+)$/gm, '<uli>$1</uli>')
    .replace(/^\*\s+(.+)$/gm, '<uli>$1</uli>');

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

const slideContentStyles: Record<BlockType, string> = {
  heading: 'text-4xl font-semibold text-slate-900',
  paragraph: 'text-xl text-slate-700 leading-relaxed',
  clause: 'text-xl text-slate-700 leading-relaxed',
  list: 'text-xl text-slate-700 leading-relaxed',
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

// --- Sign Field Overlays ---

function SignFieldOverlays({
  fields,
  parties,
}: {
  fields: SignField[];
  parties: SignParty[];
}) {
  if (fields.length === 0) return null;
  return (
    <div className="absolute bottom-4 right-4 flex flex-wrap gap-2">
      {fields.map((field) => {
        const colors = getPartyColor(field.partyIndex);
        const partyName = parties[field.partyIndex]?.name ?? `Party ${field.partyIndex + 1}`;
        return (
          <div
            key={field.id}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
              colors.bg,
              colors.border,
            )}
            title={`${field.label} - ${partyName}`}
          >
            <span className={cn('size-2 rounded-full flex-shrink-0', colors.dot)} />
            <span className="truncate max-w-[80px]">{field.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Diff View ---

function SlideDiffView({
  diff,
  onAccept,
  onReject,
}: {
  diff: BlockDiff;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
      <div className="grid grid-cols-2 gap-6 w-full">
        <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Before</div>
          <div className="text-lg text-slate-400 line-through leading-relaxed">
            {diff.deleted || '(empty)'}
          </div>
        </div>
        <div className="p-6 rounded-xl bg-violet-50 border border-violet-200">
          <div className="text-xs font-medium text-violet-500 uppercase tracking-wide mb-3">After</div>
          <div className="text-lg text-violet-700 leading-relaxed">
            {diff.inserted || '(empty)'}
          </div>
        </div>
      </div>
      <div className="flex gap-4">
        <button
          onClick={onAccept}
          className="rounded-md bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 min-h-[44px]"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="rounded-md bg-white px-6 py-2.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 min-h-[44px]"
        >
          Reject
        </button>
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

// --- Skeleton Slide (for unrevealed blocks) ---

function SkeletonSlide() {
  return (
    <div className="w-full aspect-[16/9] bg-white rounded-2xl shadow-xl border border-slate-200 flex items-center justify-center p-12">
      <div className="w-full max-w-lg space-y-4 animate-pulse">
        <div className="h-8 bg-slate-100 rounded-lg w-3/4 mx-auto" />
        <div className="h-4 bg-slate-100 rounded w-full" />
        <div className="h-4 bg-slate-100 rounded w-5/6" />
        <div className="h-4 bg-slate-100 rounded w-4/6" />
      </div>
    </div>
  );
}

// --- Empty State ---

function SlideEmptyState({
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
      <div className="flex items-center justify-center flex-1 p-8">
        <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="text-sm font-medium text-slate-700 mb-3">Describe the document you want to create</div>
          <textarea
            autoFocus
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            placeholder="e.g. A mutual NDA between two companies with standard confidentiality terms..."
            className="min-h-[150px] w-full resize-none rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400"
          />
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => {
                if (generatePrompt.trim()) onGenerateAI(generatePrompt.trim());
              }}
              disabled={!generatePrompt.trim() || isGenerating}
              className="flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 min-h-[44px]"
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
              className="text-sm font-medium text-slate-500 hover:text-slate-600 min-h-[44px]"
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
      <div className="flex items-center justify-center flex-1 p-8">
        <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <textarea
            autoFocus
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="Paste your document text here..."
            className="min-h-[200px] w-full resize-none rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400"
          />
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => {
                if (pasteValue.trim()) onPasteText(pasteValue);
              }}
              disabled={!pasteValue.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 min-h-[44px]"
            >
              Create Document
            </button>
            <button
              onClick={() => { setShowPaste(false); setPasteValue(''); }}
              className="text-sm font-medium text-slate-500 hover:text-slate-600 min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center flex-1 p-8">
      <div className="max-w-4xl mx-auto w-full aspect-[16/9] bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col items-center justify-center p-12">
        <FileText className="size-12 text-slate-300 mb-4" />
        <p className="text-lg text-slate-400 mb-8">
          Add your first slide
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-center">
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

// --- Thumbnail ---

function SlideThumbnail({
  block,
  index,
  isActive,
  onClick,
}: {
  block: Block;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const plain = block.content.replace(/<[^>]*>/g, '').trim();
  const truncated = plain.length > 40 ? plain.slice(0, 40) + '...' : plain;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-shrink-0 h-16 w-28 rounded-lg border-2 bg-white flex items-center justify-center p-2 transition-all duration-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400',
        isActive
          ? 'border-violet-500 shadow-sm'
          : 'border-slate-200 hover:border-slate-300',
      )}
      title={`Slide ${index + 1}`}
      aria-label={`Go to slide ${index + 1}`}
    >
      <span className={cn(
        'text-[8px] leading-tight text-center line-clamp-3',
        isActive ? 'text-slate-700' : 'text-slate-400',
      )}>
        {truncated || `Slide ${index + 1}`}
      </span>
    </button>
  );
}

// --- Main SlideView ---

export default function SlideView({
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
}: SlideViewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const isEditingRef = useRef(false);

  // Clamp current slide when blocks change
  useEffect(() => {
    if (blocks.length > 0 && currentSlide >= blocks.length) {
      setCurrentSlide(blocks.length - 1);
    }
  }, [blocks.length, currentSlide]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't navigate when editing content
      if (isEditingRef.current) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentSlide((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentSlide((prev) => Math.min(blocks.length - 1, prev + 1));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blocks.length]);

  // Sync editor content (apply markdown conversion before rendering)
  useEffect(() => {
    if (editorRef.current && !isEditingRef.current && blocks[currentSlide]) {
      const rendered = convertMarkdownToHTML(blocks[currentSlide].content);
      if (editorRef.current.innerHTML !== rendered) {
        editorRef.current.innerHTML = rendered;
      }
    }
  }, [blocks, currentSlide]);

  const handleInput = useCallback(() => {
    if (editorRef.current && blocks[currentSlide]) {
      onBlockUpdate(blocks[currentSlide].id, editorRef.current.innerHTML);
    }
  }, [blocks, currentSlide, onBlockUpdate]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
    onEditingChange?.(true);
  }, [onEditingChange]);

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    onEditingChange?.(false);
  }, [onEditingChange]);

  const goToPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(blocks.length - 1, prev + 1));
  }, [blocks.length]);

  // Empty state
  if (blocks.length === 0) {
    return (
      <div className="flex-1 overflow-auto bg-slate-50/50 flex flex-col">
        <SlideEmptyState
          onUploadPDF={onUploadPDF}
          onStartBlank={onStartBlank}
          onPasteText={onPasteText}
          onGenerateAI={onGenerateAI}
          isGenerating={isGenerating}
        />
      </div>
    );
  }

  const activeBlock = blocks[currentSlide];
  const isSlideRevealed = revealIndex === null || revealIndex === undefined || currentSlide <= revealIndex;
  const blockType = activeBlock ? detectBlockType(activeBlock.content, currentSlide) : 'paragraph';
  const signFields = activeBlock?.signFields ?? [];

  return (
    <div className="flex-1 overflow-hidden bg-slate-50/50 flex flex-col">
      {/* Slide reveal animation */}
      <style>{`
        @keyframes slide-fade-in {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-slide-reveal {
          animation: slide-fade-in 300ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-slide-reveal {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      {/* Main slide area */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsFocusedWithin(true)}
        onBlur={(e) => {
          // Only hide if focus moves outside the slide card
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsFocusedWithin(false);
          }
        }}
      >
        <div className="max-w-4xl mx-auto w-full relative">
          {/* Slide */}
          {!isSlideRevealed ? (
            <SkeletonSlide />
          ) : activeBlock ? (
            <div
              key={activeBlock.id}
              className="w-full aspect-[16/9] bg-white rounded-2xl shadow-xl border border-slate-200 relative animate-slide-reveal"
            >
              {/* Slide content */}
              <div className="absolute inset-0 flex items-center justify-center p-12">
                {activeBlock.diff ? (
                  <SlideDiffView
                    diff={activeBlock.diff}
                    onAccept={() => onDiffAccept(activeBlock.id)}
                    onReject={() => onDiffReject(activeBlock.id)}
                  />
                ) : (
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={handleInput}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    className={cn(
                      'w-full max-w-2xl text-center bg-transparent border-none outline-none resize-none',
                      'focus:ring-2 focus:ring-violet-400 focus:ring-offset-4 rounded-lg p-4 transition-shadow',
                      slideContentStyles[blockType],
                    )}
                    data-placeholder="Click to edit slide..."
                  />
                )}
              </div>

              {/* Sign field overlays */}
              {signFields.length > 0 && (
                <SignFieldOverlays fields={signFields} parties={parties} />
              )}

              {/* Click-to-place overlay for pending field */}
              {pendingField && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relativeY = e.clientY - rect.top;
                    const percentage = Math.max(0, Math.min(100, Math.round((relativeY / rect.height) * 100)));
                    onPlaceField?.(activeBlock.id, percentage);
                  }}
                  className="absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-violet-400 bg-violet-50/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-crosshair"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPlaceField?.(activeBlock.id, 50);
                    }
                  }}
                >
                  <span className="text-sm font-medium text-violet-600 bg-white/80 rounded-lg px-4 py-2 pointer-events-none shadow-sm">
                    Click to place field here
                  </span>
                </div>
              )}

              {/* Action bar overlay — appears on hover */}
              <div className={cn(
                'absolute top-4 right-4 flex items-center gap-1 transition-opacity duration-200',
                (isHovering || isFocusedWithin) ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}>
                {!activeBlock.diff && activeBlock.content.trim() && (
                  <button
                    onClick={() => onAIRewrite(activeBlock.id)}
                    className="size-10 rounded-lg bg-white/90 shadow-sm border border-slate-200 flex items-center justify-center text-violet-500 hover:text-violet-600 hover:bg-white transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400"
                    title="Rewrite with AI"
                    aria-label="Rewrite with AI"
                  >
                    <Sparkles className="size-4" />
                  </button>
                )}
                {/* Slide reorder: move up/down */}
                {currentSlide > 0 && (
                  <button
                    onClick={() => {
                      onBlockReorder(currentSlide, currentSlide - 1);
                      setCurrentSlide(currentSlide - 1);
                    }}
                    className="size-10 rounded-lg bg-white/90 shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-white transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400"
                    title="Move slide earlier"
                    aria-label="Move slide earlier"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                )}
                {currentSlide < blocks.length - 1 && (
                  <button
                    onClick={() => {
                      onBlockReorder(currentSlide, currentSlide + 1);
                      setCurrentSlide(currentSlide + 1);
                    }}
                    className="size-10 rounded-lg bg-white/90 shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-white transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400"
                    title="Move slide later"
                    aria-label="Move slide later"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                )}
                {onBlockAdd && (
                  <button
                    onClick={() => onBlockAdd(activeBlock.id)}
                    className="size-10 rounded-lg bg-white/90 shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-white transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400"
                    title="Add slide after"
                    aria-label="Add slide after"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
                {onBlockDelete && (
                  <button
                    onClick={() => onBlockDelete(activeBlock.id)}
                    className="size-10 rounded-lg bg-white/90 shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-white transition-colors min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400"
                    title="Delete slide"
                    aria-label="Delete slide"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>

              {/* Bookmark indicator */}
              {activeBlock.bookmark && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-400 bg-white/80 rounded px-2 py-0.5">
                    {activeBlock.bookmark}
                  </span>
                </div>
              )}

              {/* Sign field indicators */}
              {activeBlock.signFields && activeBlock.signFields.length > 0 && parties && (
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-1.5">
                  {activeBlock.signFields.map((field) => {
                    const colors = getPartyColor(field.partyIndex);
                    const partyName = parties[field.partyIndex]?.name ?? `Party ${field.partyIndex + 1}`;
                    return (
                      <div
                        key={field.id}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
                          colors.bg, colors.border,
                        )}
                        title={`${field.label} — ${partyName}`}
                      >
                        <PenTool className="size-3" />
                        <span className="truncate max-w-[80px]">{field.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* Left/Right navigation arrows */}
          <button
            onClick={goToPrev}
            disabled={currentSlide === 0}
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 size-12 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center transition-all duration-200 min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400',
              currentSlide === 0
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-slate-50 hover:shadow-lg text-slate-600',
            )}
            aria-label="Previous slide"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={goToNext}
            disabled={currentSlide === blocks.length - 1}
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 size-12 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center transition-all duration-200 min-h-[44px] min-w-[44px] focus:outline-none focus:ring-2 focus:ring-violet-400',
              currentSlide === blocks.length - 1
                ? 'opacity-30 cursor-not-allowed'
                : 'hover:bg-slate-50 hover:shadow-lg text-slate-600',
            )}
            aria-label="Next slide"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {/* Bottom bar: counter + thumbnail strip */}
      <div className="border-t border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          {/* Slide counter */}
          <div className="text-sm font-medium text-slate-500 tabular-nums flex-shrink-0 min-w-[60px]">
            {currentSlide + 1} / {blocks.length}
          </div>

          {/* Thumbnail strip */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex items-center gap-2 py-1">
              {blocks.map((block, index) => {
                const isThumbnailRevealed = revealIndex === null || revealIndex === undefined || index <= revealIndex;
                if (!isThumbnailRevealed) {
                  return (
                    <div
                      key={block.id}
                      className="flex-shrink-0 h-16 w-28 rounded-lg border-2 border-slate-100 bg-slate-50 animate-pulse"
                    />
                  );
                }
                return (
                  <SlideThumbnail
                    key={block.id}
                    block={block}
                    index={index}
                    isActive={index === currentSlide}
                    onClick={() => setCurrentSlide(index)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
