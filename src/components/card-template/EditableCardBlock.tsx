'use client';

import React, { useState, useRef, useCallback } from 'react';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import type { CardBlock } from '@/types/card-template';

// Block types that support inline text editing via contentEditable
const TEXT_EDITABLE_TYPES = new Set<CardBlock['type']>([
  'heading',
  'paragraph',
  'bullet-list',
  'callout',
  'toggle',
]);

interface EditableCardBlockProps {
  block: CardBlock;
  cardIndex: number;
  blockIndex: number;
  isEditing: boolean;
  isFocused: boolean;
  isDarkCard: boolean;
  onBlockFocus: (blockIndex: number) => void;
  onBlockUpdate: (blockIndex: number, updatedBlock: CardBlock) => void;
  onBlockDelete: (blockIndex: number) => void;
  onBlockMoveUp: (blockIndex: number) => void;
  onBlockMoveDown: (blockIndex: number) => void;
  children: React.ReactNode;
}

function getBorderStyle(
  state: 'default' | 'hover' | 'focus' | 'editing',
  isDark: boolean
): React.CSSProperties {
  if (state === 'default') {
    return {
      border: '1.5px dashed transparent',
      background: 'transparent',
    };
  }
  if (isDark) {
    switch (state) {
      case 'hover':
        return {
          border: '1.5px dashed rgba(255,255,255,0.2)',
          background: 'transparent',
        };
      case 'focus':
        return {
          border: '2px solid rgba(255,255,255,0.4)',
          background: 'rgba(255,255,255,0.04)',
        };
      case 'editing':
        return {
          border: '2px solid rgba(255,255,255,0.6)',
          background: 'rgba(255,255,255,0.06)',
        };
    }
  }
  switch (state) {
    case 'hover':
      return {
        border: '1.5px dashed rgba(107,63,160,0.25)',
        background: 'transparent',
      };
    case 'focus':
      return {
        border: '2px solid rgba(107,63,160,0.5)',
        background: 'rgba(107,63,160,0.03)',
      };
    case 'editing':
      return {
        border: '2px solid #6B3FA0',
        background: 'rgba(107,63,160,0.05)',
      };
  }
}

export default function EditableCardBlock({
  block,
  cardIndex,
  blockIndex,
  isEditing,
  isFocused,
  isDarkCard,
  onBlockFocus,
  onBlockUpdate,
  onBlockDelete,
  onBlockMoveUp,
  onBlockMoveDown,
  children,
}: EditableCardBlockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const visualState: 'default' | 'hover' | 'focus' | 'editing' = isEditing
    ? 'editing'
    : isFocused
      ? 'focus'
      : isHovered
        ? 'hover'
        : 'default';

  const borderStyles = getBorderStyle(visualState, isDarkCard);
  const showActions = isHovered || isFocused || isEditing;
  const isTextEditable = TEXT_EDITABLE_TYPES.has(block.type);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBlockFocus(blockIndex);
    },
    [blockIndex, onBlockFocus]
  );

  const handleBlur = useCallback(() => {
    if (!contentRef.current || !isTextEditable) return;
    const text = contentRef.current.textContent || '';

    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'callout') {
      if ('content' in block && text !== block.content) {
        onBlockUpdate(blockIndex, { ...block, content: text });
      }
    } else if (block.type === 'toggle') {
      if (text !== block.heading) {
        onBlockUpdate(blockIndex, { ...block, heading: text });
      }
    } else if (block.type === 'bullet-list') {
      // For bullet-list, split by newlines to reconstruct items
      const items = text.split('\n').filter((s) => s.trim().length > 0);
      if (JSON.stringify(items) !== JSON.stringify(block.items)) {
        onBlockUpdate(blockIndex, { ...block, items });
      }
    }
  }, [block, blockIndex, isTextEditable, onBlockUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' && e.shiftKey) {
        e.preventDefault();
        onBlockDelete(blockIndex);
      }
    },
    [blockIndex, onBlockDelete]
  );

  const actionIconColor = isDarkCard ? 'rgba(255,255,255,0.5)' : 'rgba(100,116,139,0.7)';
  const actionHoverBg = isDarkCard ? 'rgba(255,255,255,0.1)' : 'rgba(107,63,160,0.08)';

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: 6,
    cursor: isTextEditable ? 'text' : 'default',
    transition: 'border-color 200ms ease, background 200ms ease',
    ...borderStyles,
  };

  return (
    <div
      style={wrapperStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="textbox"
      aria-label={`${block.type} block ${blockIndex + 1} on card ${cardIndex + 1}`}
      tabIndex={0}
    >
      {/* Quick action buttons — top-right corner */}
      <div
        style={{
          position: 'absolute',
          top: -4,
          right: -4,
          display: 'flex',
          gap: 2,
          opacity: showActions ? 1 : 0,
          pointerEvents: showActions ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          zIndex: 10,
        }}
      >
        <button
          type="button"
          aria-label="Drag to reorder block"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            minHeight: 44,
            width: 44,
            height: 44,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'grab',
            boxSizing: 'border-box',
            color: actionIconColor,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = actionHoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          aria-label="Block options"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            minHeight: 44,
            width: 44,
            height: 44,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'pointer',
            boxSizing: 'border-box',
            color: actionIconColor,
          }}
          onClick={(e) => {
            e.stopPropagation();
            // Menu will be wired in a future task
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = actionHoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Content region */}
      {isEditing && isTextEditable ? (
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          style={{
            outline: 'none',
            minHeight: 24,
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
