'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Heading1,
  Heading2,
  Type,
  List,
  ListOrdered,
  Table2,
  ImagePlus,
  Minus,
  Quote,
  type LucideIcon,
} from 'lucide-react';

interface SlashCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'heading1', label: 'Heading 1', icon: Heading1, description: 'Large section heading' },
  { id: 'heading2', label: 'Heading 2', icon: Heading2, description: 'Medium section heading' },
  { id: 'paragraph', label: 'Paragraph', icon: Type, description: 'Plain text block' },
  { id: 'bullets', label: 'Bullet List', icon: List, description: 'Unordered list' },
  { id: 'numbered', label: 'Numbered List', icon: ListOrdered, description: 'Ordered list' },
  { id: 'table', label: 'Table', icon: Table2, description: 'Insert a table' },
  { id: 'image', label: 'Image', icon: ImagePlus, description: 'Add an image' },
  { id: 'divider', label: 'Divider', icon: Minus, description: 'Horizontal separator' },
  { id: 'quote', label: 'Quote', icon: Quote, description: 'Block quote' },
];

interface SlashCommandMenuProps {
  position: { top: number; left: number };
  filter: string;
  onSelect: (commandId: string) => void;
  onClose: () => void;
}

export default function SlashCommandMenu({ position, filter, onSelect, onClose }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useRef(false);

  // Check prefers-reduced-motion once on mount
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const filtered = SLASH_COMMANDS.filter((cmd) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    );
  });

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Keyboard navigation — uses capture phase to intercept before contentEditable
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const selected = filtered[selectedIndex];
        if (selected) {
          onSelect(selected.id);
        }
        return;
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    // Use capture phase to intercept before the contentEditable handler
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current) {
      const items = menuRef.current.querySelectorAll('[data-slash-item]');
      const item = items[selectedIndex];
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-3"
        style={{ top: position.top, left: position.left }}
      >
        <p className="text-sm text-slate-500 text-center">No matching commands</p>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden ${
        prefersReducedMotion.current ? '' : 'animate-in fade-in slide-in-from-top-1 duration-200'
      }`}
      style={{ top: position.top, left: position.left }}
    >
      <div className="max-h-80 overflow-y-auto p-1.5">
        {filtered.map((cmd, idx) => {
          const Icon = cmd.icon;
          const isSelected = idx === selectedIndex;

          return (
            <button
              key={cmd.id}
              data-slash-item
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => onSelect(cmd.id)}
              className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-lg transition-all ${
                isSelected
                  ? 'bg-violet-50 text-violet-700 border border-violet-200'
                  : 'text-slate-700 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <div className="flex-1 text-left">
                <span className="text-sm font-medium block">{cmd.label}</span>
                <span className={`text-xs block ${isSelected ? 'text-violet-500' : 'text-slate-400'}`}>
                  {cmd.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 flex items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">&uarr;</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">&darr;</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">&crarr;</kbd>
          select
        </span>
      </div>
    </div>
  );
}
