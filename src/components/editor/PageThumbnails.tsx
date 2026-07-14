'use client';

import { useCallback } from 'react';
import type { Block } from '@/types';

interface PageThumbnailsProps {
  blocks: Block[];
  activeBlockId: string | null;
  onBlockClick: (blockId: string) => void;
}

/**
 * Strips HTML tags to get plain text for thumbnail preview.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function PageThumbnails({
  blocks,
  activeBlockId,
  onBlockClick,
}: PageThumbnailsProps) {
  const handleClick = useCallback(
    (blockId: string) => {
      onBlockClick(blockId);
      // Scroll the main canvas to the block
      const el = document.getElementById(`block-${blockId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [onBlockClick],
  );

  if (blocks.length === 0) return null;

  return (
    <aside
      className="w-[120px] flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/50 p-2 space-y-2"
      aria-label="Page thumbnails"
    >
      {blocks.map((block, index) => {
        const isActive = block.id === activeBlockId;
        const plainText = stripHtml(block.content);

        return (
          <div key={block.id}>
            <button
              type="button"
              onClick={() => handleClick(block.id)}
              className={`w-full aspect-[3/4] bg-white rounded-lg p-2 cursor-pointer transition-colors overflow-hidden text-left ${
                isActive
                  ? 'border-2 border-violet-500 shadow-sm'
                  : 'border border-slate-200 hover:border-violet-300'
              }`}
              title={`Block ${index + 1}${block.bookmark ? `: ${block.bookmark}` : ''}`}
              aria-label={`Go to block ${index + 1}${block.bookmark ? `, ${block.bookmark}` : ''}`}
            >
              {/* Miniature text preview */}
              <div className="text-[6px] text-slate-400 leading-tight line-clamp-[12] select-none pointer-events-none">
                {block.bookmark && (
                  <div className="text-[7px] font-semibold text-slate-500 mb-0.5 truncate">
                    {block.bookmark}
                  </div>
                )}
                {plainText || (
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="h-[3px] bg-slate-200 rounded-full w-full" />
                    <div className="h-[3px] bg-slate-200 rounded-full w-3/4" />
                    <div className="h-[3px] bg-slate-200 rounded-full w-5/6" />
                    <div className="h-[3px] bg-slate-200 rounded-full w-2/3" />
                  </div>
                )}
              </div>
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-1 select-none">
              {index + 1}
            </p>
          </div>
        );
      })}
    </aside>
  );
}
