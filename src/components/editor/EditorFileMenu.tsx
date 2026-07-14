'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  PenLine,
  Copy,
  Ruler,
  FileDown,
  Code,
  Braces,
  Image,
  Share2,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

interface EditorFileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onExport?: (format: 'pdf' | 'html' | 'json' | 'png') => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onPageSize?: () => void;
  onShare?: () => void;
  showPageSize?: boolean;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  dividerAfter?: boolean;
}

export default function EditorFileMenu({
  isOpen,
  onClose,
  onExport,
  onRename,
  onDuplicate,
  onPageSize,
  onShare,
  showPageSize = false,
}: EditorFileMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handleShare = useCallback(() => {
    if (onShare) {
      onShare();
    } else {
      showToast('Sharing coming soon', 'info');
    }
    onClose();
  }, [onShare, onClose, showToast]);

  if (!isOpen) return null;

  const items: MenuItem[] = [
    {
      label: 'Rename',
      icon: <PenLine size={16} className="text-slate-500" />,
      action: () => { onRename?.(); onClose(); },
    },
    {
      label: 'Duplicate',
      icon: <Copy size={16} className="text-slate-500" />,
      action: () => { onDuplicate?.(); onClose(); },
    },
    ...(showPageSize ? [{
      label: 'Page Size',
      icon: <Ruler size={16} className="text-slate-500" />,
      action: () => { onPageSize?.(); onClose(); },
      dividerAfter: true,
    }] : [{
      label: '',
      icon: null,
      action: () => {},
      dividerAfter: true,
    }]),
    {
      label: 'Export as PDF',
      icon: <FileDown size={16} className="text-slate-500" />,
      action: () => { onExport?.('pdf'); onClose(); },
    },
    {
      label: 'Export as HTML',
      icon: <Code size={16} className="text-slate-500" />,
      action: () => { onExport?.('html'); onClose(); },
    },
    {
      label: 'Export as JSON',
      icon: <Braces size={16} className="text-slate-500" />,
      action: () => { onExport?.('json'); onClose(); },
    },
    {
      label: 'Download as PNG',
      icon: <Image size={16} className="text-slate-500" />,
      action: () => { onExport?.('png'); onClose(); },
      dividerAfter: true,
    },
    {
      label: 'Share',
      icon: <Share2 size={16} className="text-slate-500" />,
      action: handleShare,
    },
  ];

  // Filter out the empty placeholder item (used when showPageSize is false to still get the divider)
  const visibleItems = items.filter(item => item.label !== '');

  // If showPageSize is false, mark Duplicate with dividerAfter
  if (!showPageSize) {
    const dupItem = visibleItems.find(item => item.label === 'Duplicate');
    if (dupItem) {
      dupItem.dividerAfter = true;
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl bg-white shadow-xl border border-slate-200 py-1 motion-safe:animate-[fadeIn_200ms_ease-out]"
      style={{ minWidth: '220px' }}
    >
      {visibleItems.map((item) => (
        <div key={item.label}>
          <button
            type="button"
            role="menuitem"
            onClick={item.action}
            className="flex w-full items-center gap-3 px-4 text-base text-slate-700 hover:bg-slate-50 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {item.icon}
            {item.label}
          </button>
          {item.dividerAfter && (
            <div className="mx-3 my-1 border-t border-slate-100" />
          )}
        </div>
      ))}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
