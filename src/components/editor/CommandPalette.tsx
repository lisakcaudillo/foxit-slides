'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  FileText,
  Share2,
  Download,
  Settings,
  Users,
  Sparkles,
  Command,
  List,
  Database,
  BookmarkPlus,
  FileSignature,
  Workflow,
  ImagePlus,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

interface CommandPaletteProps {
  onClose: () => void;
  onAction?: (action: string, payload?: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  category: string;
  action?: 'navigate' | 'coming-soon' | 'editor-action';
  href?: string;
  editorAction?: string;
  /** Specific reason shown when the command is not yet available */
  comingSoonReason?: string;
}

const commands: CommandItem[] = [
  // Document Actions
  { id: 'new-doc', label: 'Create a Document', icon: FileText, shortcut: '\u2318N', category: 'Document', action: 'navigate', href: '/editor/documents' },
  { id: 'share', label: 'Share Document', icon: Share2, shortcut: '\u2318S', category: 'Document', action: 'coming-soon', comingSoonReason: 'This action requires collaborative sharing — coming in a future update' },
  { id: 'export', label: 'Export', icon: Download, shortcut: '\u2318E', category: 'Document', action: 'editor-action', editorAction: 'foxit-export-pdf' },

  // Writing Tools
  { id: 'rewrite-selection', label: 'Rewrite', icon: Sparkles, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'rewrite' },
  { id: 'summarize', label: 'Summarize', icon: Sparkles, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'summarize' },
  { id: 'expand', label: 'Expand', icon: Sparkles, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'expand' },
  { id: 'shorten', label: 'Shorten', icon: Sparkles, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'shorten' },
  { id: 'change-tone', label: 'Change Tone', icon: Sparkles, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'change-tone' },
  { id: 'insert-clause', label: 'Insert Clause', icon: Sparkles, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'insert-clause' },
  { id: 'insert-field', label: 'Insert Field', icon: FileSignature, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'insert-field' },
  { id: 'generate-image', label: 'Generate Image', icon: ImagePlus, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'generate-image' },
  { id: 'generate-toc', label: 'Add Contents', icon: List, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'generate-toc' },
  { id: 'extract-data', label: 'Extract Key Data', icon: Database, shortcut: '', category: 'Writing Tools', action: 'editor-action', editorAction: 'extract-data' },

  // Document Structuring
  { id: 'add-bookmarks', label: 'Add Section Bookmarks', icon: BookmarkPlus, shortcut: '', category: 'Structure', action: 'editor-action', editorAction: 'add-bookmarks' },
  { id: 'structure-doc', label: 'Structure Document', icon: FileText, shortcut: '', category: 'Structure', action: 'editor-action', editorAction: 'structure-doc' },

  // Contract Actions
  { id: 'detect-signers', label: 'Detect Signers', icon: Users, shortcut: '', category: 'Contracts', action: 'editor-action', editorAction: 'detect-signers' },
  { id: 'prepare-signing', label: 'Prepare for Signing', icon: FileSignature, shortcut: '', category: 'Contracts', action: 'editor-action', editorAction: 'prepare-signing' },

  // Automation
  { id: 'save-workflow', label: 'Set Up a Workflow', icon: Workflow, shortcut: '', category: 'Automation', action: 'navigate', href: '/workflows/new' },

  // Navigation
  // "See What Changed" hidden 2026-05-21 — Compare nav is paused. Keep
  // the entry so it's a one-line uncomment to restore.
  // { id: 'compare-versions', label: 'See What Changed', icon: FileText, shortcut: '', category: 'Navigation', action: 'navigate', href: '/compare' },
  { id: 'workflows', label: 'Set Up a Workflow', icon: Workflow, shortcut: '', category: 'Navigation', action: 'navigate', href: '/workflows' },

  // Settings
  { id: 'collaborators', label: 'Manage Collaborators', icon: Users, shortcut: '', category: 'Settings', action: 'coming-soon', comingSoonReason: 'This action requires authentication — coming in a future update' },
  { id: 'settings', label: 'Document Settings', icon: Settings, shortcut: '\u2318,', category: 'Settings', action: 'coming-soon', comingSoonReason: 'This action requires document settings panel — coming in a future update' },
];

export default function CommandPalette({ onClose, onAction }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { showToast } = useToast();

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(search.toLowerCase()) ||
      cmd.category.toLowerCase().includes(search.toLowerCase()),
  );

  // Group commands by category
  const groupedCommands = filteredCommands.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      if (cmd.action === 'navigate' && cmd.href) {
        router.push(cmd.href);
      } else if (cmd.action === 'editor-action' && cmd.editorAction && onAction) {
        onAction(cmd.editorAction);
      } else if (cmd.action === 'editor-action' && cmd.editorAction && !onAction) {
        showToast(`${cmd.label}: open this from the editor`);
      } else {
        showToast(cmd.comingSoonReason ?? `${cmd.label} is not yet available`);
      }
      onClose();
    },
    [router, showToast, onClose, onAction],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          executeCommand(selected);
        }
      }
    },
    [filteredCommands, selectedIndex, onClose, executeCommand],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center pt-32"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="size-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search..."
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400"
          />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <kbd className="px-2 py-1 rounded bg-slate-100 border border-slate-200">ESC</kbd>
            <span>to close</span>
          </div>
        </div>

        {/* Commands List */}
        <div className="max-h-96 overflow-y-auto">
          {Object.keys(groupedCommands).length > 0 ? (
            <div className="p-2 space-y-4">
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {category}
                  </div>
                  <div className="space-y-0.5">
                    {cmds.map((cmd) => {
                      const Icon = cmd.icon;
                      const globalIndex = filteredCommands.indexOf(cmd);
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <button
                          key={cmd.id}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          onClick={() => executeCommand(cmd)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                            isSelected
                              ? 'bg-violet-50 text-violet-700 border border-violet-200'
                              : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <Icon className="size-4" />
                          <span className="flex-1 text-left text-sm font-medium">{cmd.label}</span>
                          {cmd.shortcut && (
                            <kbd className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-xs text-slate-500">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">No commands found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">&uarr;</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">&darr;</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">&crarr;</kbd>
              to select
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="size-3" />
            <span>Command Palette</span>
          </div>
        </div>
      </div>
    </div>
  );
}
