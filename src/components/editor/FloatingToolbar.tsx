'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  Plus,
} from 'lucide-react';

interface FloatingToolbarProps {
  smartMode?: boolean;
}

/**
 * Toggle an inline wrapper element around the current selection.
 * If the selection's immediate parent is already the given tag, unwrap it.
 * Otherwise wrap the selection in a new element of that tag.
 */
function toggleWrap(tagName: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return;

  const parent = range.commonAncestorContainer.parentElement;
  if (parent && parent.tagName.toLowerCase() === tagName.toLowerCase()) {
    // Unwrap: replace the wrapper with its text content
    const text = document.createTextNode(parent.textContent || '');
    parent.parentNode?.replaceChild(text, parent);
    // Restore selection on the text node
    const newRange = document.createRange();
    newRange.selectNodeContents(text);
    selection.removeAllRanges();
    selection.addRange(newRange);
  } else {
    // Wrap the selection in the tag
    const wrapper = document.createElement(tagName);
    try {
      range.surroundContents(wrapper);
    } catch {
      // surroundContents can throw if selection spans partial nodes;
      // fall back to extracting + appending
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    }
    // Select the newly wrapped content
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }
}

/**
 * Set text alignment on the block-level parent of the current selection.
 */
function setAlignment(align: 'left' | 'center' | 'right') {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  let node: Node | null = range.commonAncestorContainer;
  // Walk up to find a block element
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      const display = window.getComputedStyle(node).display;
      if (display === 'block' || display === 'flex' || display === 'list-item' || node.tagName === 'DIV' || node.tagName === 'P') {
        node.style.textAlign = align;
        return;
      }
    }
    node = node.parentNode;
  }
}

/**
 * Legacy execCommand wrapper — used only for font-size and color operations
 * where DOM range manipulation is impractical.
 */
function execFormat(command: string, value?: string) {
  document.execCommand(command, false, value);
}

interface ToolbarPosition {
  top: number;
  left: number;
  visible: boolean;
}

const TEXT_COLORS = [
  { label: 'Black', value: '#111827' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Purple', value: '#6B3FA0' },
];

export default function FloatingToolbar({ smartMode }: FloatingToolbarProps) {
  const [position, setPosition] = useState<ToolbarPosition>({ top: 0, left: 0, visible: false });
  const [fontSize, setFontSize] = useState(14);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeColor, setActiveColor] = useState('#111827');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const showDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());

  const updatePosition = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setPosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setPosition((prev) => ({ ...prev, visible: false }));
      return;
    }

    const toolbarWidth = 320;
    const toolbarHeight = 40;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    let top = rect.top - toolbarHeight - 8;

    // Keep toolbar within viewport
    if (left < 8) left = 8;
    if (left + toolbarWidth > window.innerWidth - 8) {
      left = window.innerWidth - toolbarWidth - 8;
    }
    if (top < 8) {
      top = rect.bottom + 8;
    }

    setPosition({ top, left, visible: true });
  }, []);

  const updateFormattingState = useCallback(() => {
    try {
      setIsBold(document.queryCommandState('bold'));
      setIsItalic(document.queryCommandState('italic'));
      setIsUnderline(document.queryCommandState('underline'));
    } catch {
      // queryCommandState can throw in some edge cases
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      // Small delay to allow selection to settle
      requestAnimationFrame(() => {
        updatePosition();
        updateFormattingState();
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updatePosition, updateFormattingState]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        // Let the selection change handler deal with hiding
      }
      if (
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (showDelayRef.current) clearTimeout(showDelayRef.current);
      if (hideDelayRef.current) clearTimeout(hideDelayRef.current);
    };
  }, []);

  const handleFontSizeChange = useCallback((delta: number) => {
    lastInteractionRef.current = Date.now();
    setFontSize((prev) => {
      const next = Math.max(8, Math.min(72, prev + delta));
      execFormat('fontSize', '7');
      // After execCommand fontSize, override the font-size inline
      const selection = window.getSelection();
      if (selection && selection.rangeCount) {
        const container = selection.getRangeAt(0).commonAncestorContainer;
        const el = container.nodeType === 3 ? container.parentElement : (container as HTMLElement);
        if (el) {
          const fontElements = el.querySelectorAll('font[size="7"]');
          fontElements.forEach((fe) => {
            (fe as HTMLElement).removeAttribute('size');
            (fe as HTMLElement).style.fontSize = `${next}px`;
          });
          // Also check if the element itself is the font tag
          if (el.tagName === 'FONT' && el.getAttribute('size') === '7') {
            el.removeAttribute('size');
            el.style.fontSize = `${next}px`;
          }
        }
      }
      return next;
    });
  }, []);

  const handleColorChange = useCallback((color: string) => {
    lastInteractionRef.current = Date.now();
    setActiveColor(color);
    execFormat('foreColor', color);
    setShowColorPicker(false);
  }, []);

  if (!position.visible) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1"
      style={{
        top: position.top,
        left: position.left,
        height: 40,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        borderRadius: '0.75rem',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Bold */}
      <button
        onClick={() => { toggleWrap('strong'); updateFormattingState(); lastInteractionRef.current = Date.now(); }}
        className={`min-h-[44px] min-w-[44px] rounded-md flex items-center justify-center transition-colors ${isBold ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      >
        <Bold className="size-4" />
      </button>

      {/* Italic */}
      <button
        onClick={() => { toggleWrap('em'); updateFormattingState(); lastInteractionRef.current = Date.now(); }}
        className={`min-h-[44px] min-w-[44px] rounded-md flex items-center justify-center transition-colors ${isItalic ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      >
        <Italic className="size-4" />
      </button>

      {/* Underline */}
      <button
        onClick={() => { toggleWrap('u'); updateFormattingState(); lastInteractionRef.current = Date.now(); }}
        className={`min-h-[44px] min-w-[44px] rounded-md flex items-center justify-center transition-colors ${isUnderline ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
        title="Underline (Ctrl+U)"
        aria-label="Underline"
      >
        <Underline className="size-4" />
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-200/60 mx-0.5" />

      {/* Alignment */}
      <button
        onClick={() => { setAlignment('left'); lastInteractionRef.current = Date.now(); }}
        className="min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-slate-600 transition-colors"
        title="Align left"
        aria-label="Align left"
      >
        <AlignLeft className="size-4" />
      </button>
      <button
        onClick={() => { setAlignment('center'); lastInteractionRef.current = Date.now(); }}
        className="min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-slate-600 transition-colors"
        title="Align center"
        aria-label="Align center"
      >
        <AlignCenter className="size-4" />
      </button>
      <button
        onClick={() => { setAlignment('right'); lastInteractionRef.current = Date.now(); }}
        className="min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-slate-600 transition-colors"
        title="Align right"
        aria-label="Align right"
      >
        <AlignRight className="size-4" />
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-200/60 mx-0.5" />

      {/* Font Size */}
      <button
        onClick={() => handleFontSizeChange(-2)}
        className="min-h-[44px] min-w-[36px] rounded hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-slate-600 transition-colors"
        title="Decrease font size"
        aria-label="Decrease font size"
      >
        <Minus className="size-3" />
      </button>
      <span className="text-xs text-slate-700 w-6 text-center tabular-nums">{fontSize}</span>
      <button
        onClick={() => handleFontSizeChange(2)}
        className="min-h-[44px] min-w-[36px] rounded hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-slate-600 transition-colors"
        title="Increase font size"
        aria-label="Increase font size"
      >
        <Plus className="size-3" />
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-slate-200/60 mx-0.5" />

      {/* Color */}
      <div className="relative">
        <button
          onClick={() => { setShowColorPicker(!showColorPicker); lastInteractionRef.current = Date.now(); }}
          className="min-h-[44px] min-w-[44px] rounded-md hover:bg-slate-100 flex items-center justify-center transition-colors"
          title="Text color"
          aria-label="Text color"
        >
          <div
            className="size-4 rounded-sm border border-slate-300"
            style={{ backgroundColor: activeColor }}
          />
        </button>
        {showColorPicker && (
          <div
            ref={colorPickerRef}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 bg-white rounded-lg shadow-xl border border-gray-200 flex gap-1.5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {TEXT_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => handleColorChange(c.value)}
                className="size-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c.value,
                  borderColor: activeColor === c.value ? '#6B3FA0' : 'transparent',
                }}
                title={c.label}
                aria-label={c.label}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
