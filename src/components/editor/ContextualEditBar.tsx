'use client';

import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link2,
  MessageSquare,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';

function execFormat(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export default function ContextualEditBar() {
  return (
    <div className="h-12 bg-white border-b border-gray-200 px-4 flex items-center gap-1 flex-shrink-0">
      {/* Text Style */}
      <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('formatBlock', 'p')}
          className="h-8 px-3 rounded-md hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-1 transition-colors"
        >
          Normal
          <ChevronDown className="size-3 text-gray-500" />
        </button>
      </div>

      {/* Font Family */}
      <div className="flex items-center gap-1 px-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('fontName', 'Inter')}
          className="h-8 px-3 rounded-md hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-1 transition-colors"
        >
          Inter
          <ChevronDown className="size-3 text-gray-500" />
        </button>
      </div>

      {/* Font Size */}
      <div className="flex items-center gap-1 px-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('fontSize', '4')}
          className="h-8 px-3 rounded-md hover:bg-gray-100 text-sm text-gray-700 flex items-center gap-1 transition-colors"
        >
          14
          <ChevronDown className="size-3 text-gray-500" />
        </button>
      </div>

      {/* Text Formatting */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('bold')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Bold"
        >
          <Bold className="size-4" />
        </button>
        <button
          onClick={() => execFormat('italic')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Italic"
        >
          <Italic className="size-4" />
        </button>
        <button
          onClick={() => execFormat('underline')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Underline"
        >
          <Underline className="size-4" />
        </button>
      </div>

      {/* Text Color */}
      <div className="flex items-center gap-1 px-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('foreColor', '#111827')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors"
        >
          <div className="size-4 rounded border border-gray-300 bg-gray-900" title="Text color" />
        </button>
      </div>

      {/* Alignment */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('justifyLeft')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Align left"
        >
          <AlignLeft className="size-4" />
        </button>
        <button
          onClick={() => execFormat('justifyCenter')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Align center"
        >
          <AlignCenter className="size-4" />
        </button>
        <button
          onClick={() => execFormat('justifyRight')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Align right"
        >
          <AlignRight className="size-4" />
        </button>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <button
          onClick={() => execFormat('insertUnorderedList')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Bullet list"
        >
          <List className="size-4" />
        </button>
        <button
          onClick={() => execFormat('insertOrderedList')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Numbered list"
        >
          <ListOrdered className="size-4" />
        </button>
      </div>

      {/* Link & Comment */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <button
          onClick={() => {
            const url = prompt('Enter URL:');
            if (url) execFormat('createLink', url);
          }}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Insert link"
        >
          <Link2 className="size-4" />
        </button>
        <button
          onClick={() => console.log('Add comment')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="Add comment"
        >
          <MessageSquare className="size-4" />
        </button>
      </div>

      {/* More */}
      <div className="flex items-center gap-1 px-2">
        <button
          onClick={() => console.log('More options')}
          className="size-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
          title="More options"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}
