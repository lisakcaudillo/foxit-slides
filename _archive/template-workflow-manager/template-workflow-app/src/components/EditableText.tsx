'use client';

import { useState, useRef } from 'react';
import { useEditable } from '@/contexts/EditableContext';
import { Edit2, Check, X } from 'lucide-react';

interface EditableTextProps {
  contentKey: string;
  defaultValue: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  className?: string;
}

export default function EditableText({ contentKey, defaultValue, as = 'span', className = '' }: EditableTextProps) {
  const { isEditMode, getContent, updateContent, setHoveredElement } = useEditable();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const elementRef = useRef<HTMLElement>(null);
  
  const content = getContent(contentKey, defaultValue);
  const Component = as;

  const handleMouseEnter = () => {
    if (!isEditMode || isEditing) return;
    // Check if this element or any parent has data-dev-tool-ignore
    if (elementRef.current) {
      let el: HTMLElement | null = elementRef.current;
      while (el) {
        if (el.getAttribute('data-dev-tool-ignore') === 'true') return;
        el = el.parentElement;
      }
      const rect = elementRef.current.getBoundingClientRect();
      setHoveredElement({ key: contentKey, value: content, rect });
    }
  };

  const handleMouseLeave = () => {
    if (!isEditMode || isEditing) return;
    setHoveredElement(null);
  };

  const handleStartEdit = () => {
    if (!isEditMode) return;
    // Check if this element or any parent has data-dev-tool-ignore
    if (elementRef.current) {
      let el: HTMLElement | null = elementRef.current;
      while (el) {
        if (el.getAttribute('data-dev-tool-ignore') === 'true') return;
        el = el.parentElement;
      }
    }
    setEditValue(content);
    setIsEditing(true);
    setHoveredElement(null);
  };

  const handleSave = async () => {
    updateContent(contentKey, editValue);
    
    // Save to backend
    try {
      await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [contentKey]: editValue }),
      });
    } catch (error) {
      console.error('Failed to save content:', error);
    }
    
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-2 bg-blue-50 border-2 border-blue-400 rounded px-2 py-1">
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-700">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={handleCancel} className="text-red-600 hover:text-red-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <Component
      ref={elementRef as any}
      data-editable-key={contentKey}
      data-editable-value={content}
      className={`${className} ${isEditMode ? 'cursor-pointer hover:bg-blue-50 hover:outline hover:outline-2 hover:outline-blue-400 rounded transition-all' : ''}`}
      onClick={handleStartEdit}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={isEditMode ? `Click to edit (key: ${contentKey})` : undefined}
    >
      {content}
      {isEditMode && <Edit2 className="inline-block ml-2 h-4 w-4 text-blue-500" />}
    </Component>
  );
}
