'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  MoreHorizontal,
  Play,
} from 'lucide-react';
import EditorFileMenu from './EditorFileMenu';

interface EditorTopBarProps {
  documentTitle: string;
  onTitleChange?: (title: string) => void;
  onBack?: () => void;
  onPresent?: () => void;
  showPresent?: boolean;
  isSaved?: boolean;
  format?: string;
  children?: React.ReactNode;
  // File menu callbacks
  onExport?: (format: 'pdf' | 'html' | 'json' | 'png') => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onPageSize?: () => void;
  onShare?: () => void;
  showPageSize?: boolean;
}

export default function EditorTopBar({
  documentTitle,
  onTitleChange,
  onBack,
  onPresent,
  showPresent = false,
  isSaved,
  format,
  children,
  onExport,
  onRename,
  onDuplicate,
  onPageSize,
  onShare,
  showPageSize = false,
}: EditorTopBarProps) {
  const router = useRouter();
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);
  const fileMenuButtonRef = useRef<HTMLButtonElement>(null);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      router.push('/');
    }
  }, [onBack, router]);

  const handleTitleClick = useCallback(() => {
    if (!onTitleChange) return;
    setIsEditingTitle(true);
  }, [onTitleChange]);

  const commitTitle = useCallback(() => {
    setIsEditingTitle(false);
    if (titleRef.current && onTitleChange) {
      const newTitle = titleRef.current.textContent?.trim() || 'Untitled';
      onTitleChange(newTitle);
    }
  }, [onTitleChange]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitle();
      titleRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setIsEditingTitle(false);
      if (titleRef.current) {
        titleRef.current.textContent = documentTitle;
      }
      titleRef.current?.blur();
    }
  }, [commitTitle, documentTitle]);

  // Focus the title span when editing starts
  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, [isEditingTitle]);

  // Handle rename from file menu: focus the title
  const handleRename = useCallback(() => {
    if (onRename) {
      onRename();
    } else if (onTitleChange) {
      setIsEditingTitle(true);
    }
  }, [onRename, onTitleChange]);

  const toggleFileMenu = useCallback(() => {
    setIsFileMenuOpen((prev: boolean) => !prev);
  }, []);

  const closeFileMenu = useCallback(() => {
    setIsFileMenuOpen(false);
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 flex-shrink-0"
      style={{
        height: '56px',
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Left section: back + title + format badge */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Back button */}
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0"
          style={{ width: '44px', height: '44px' }}
          title="Back to home"
          aria-label="Go back"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Editable document title */}
        <span
          ref={titleRef}
          role={onTitleChange ? 'textbox' : undefined}
          contentEditable={isEditingTitle}
          suppressContentEditableWarning
          onClick={handleTitleClick}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
          className={`text-base font-medium text-slate-900 outline-none rounded px-2 py-1 truncate transition-colors ${
            isEditingTitle
              ? 'bg-slate-50 ring-1 ring-slate-200'
              : onTitleChange ? 'cursor-pointer hover:bg-slate-50' : ''
          }`}
          style={{ maxWidth: '320px', minWidth: '120px' }}
        >
          {documentTitle}
        </span>

        {/* Format badge */}
        {format && (
          <span className="text-sm text-slate-400 flex-shrink-0 select-none">
            {format}
          </span>
        )}
      </div>

      {/* Right section: save indicator + file menu + present + children */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Save indicator */}
        {isSaved !== undefined && (
          <span className="text-sm text-slate-400 select-none flex-shrink-0">
            {isSaved ? 'Saved' : 'Saving...'}
          </span>
        )}

        {/* Extra actions passed as children */}
        {children}

        {/* File menu trigger */}
        <div className="relative">
          <button
            ref={fileMenuButtonRef}
            type="button"
            onClick={toggleFileMenu}
            className="flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            style={{ width: '44px', height: '44px' }}
            title="File menu"
            aria-label="Open file menu"
            aria-haspopup="true"
            aria-expanded={isFileMenuOpen}
          >
            <MoreHorizontal size={16} />
          </button>

          <EditorFileMenu
            isOpen={isFileMenuOpen}
            onClose={closeFileMenu}
            onExport={onExport}
            onRename={handleRename}
            onDuplicate={onDuplicate}
            onPageSize={onPageSize}
            onShare={onShare}
            showPageSize={showPageSize}
          />
        </div>

        {/* Present button — only for card/slide editors */}
        {showPresent && onPresent && (
          <button
            type="button"
            onClick={onPresent}
            className="flex items-center justify-center gap-2 rounded-lg text-white font-medium text-base transition-all hover:shadow-md"
            style={{
              height: '44px',
              paddingLeft: '16px',
              paddingRight: '20px',
              background: 'linear-gradient(135deg, #6B3FA0, #8B5FC0)',
            }}
            title="Present"
            aria-label="Start presentation"
          >
            <Play size={16} />
            Present
          </button>
        )}
      </div>
    </header>
  );
}
