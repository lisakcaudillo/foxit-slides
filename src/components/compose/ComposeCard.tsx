'use client';

/**
 * Compose card components — extracted from /compose/page.tsx in Phase 3
 * so single-type pages (Documents/Graphics/Slides) and the Library
 * destinations can render the same tile shapes.
 *
 *   <ComposeCard />     — file tile (slide deck / doc / visual)
 *   <FolderTile />      — folder tile, links into /compose/my-projects
 *   <MoveToPopover />   — flat-list folder picker with depth indent
 *
 * Thumbnails are exported individually too so /compose/library and
 * placeholder library tiles can share the same visual tokens.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Folder as FolderIcon,
  Image as ImageIcon,
  MoveRight,
  Trash2,
} from 'lucide-react';
import type { StoredFolder } from '@/lib/folderStorage';
import {
  ComposeRow,
  FORMAT_ACCENT,
  FORMAT_ICON,
  FORMAT_LABEL,
  formatRelative,
} from './composeRow';

// ─── Thumbnails ───────────────────────────────────────────────────────────────

export function SlideThumbnail({ accentColor }: { accentColor: string }) {
  const lighter = accentColor + '22';
  const mid = accentColor + '33';
  return (
    <div
      className="w-full aspect-video rounded-lg overflow-hidden flex flex-col items-start justify-end p-3 relative"
      style={{
        background: `linear-gradient(135deg, ${lighter} 0%, ${mid} 100%)`,
        border: `1.5px solid ${mid}`,
      }}
    >
      <div className="absolute top-3 left-3 right-3 space-y-1.5 opacity-40">
        <div className="h-2 rounded-full w-3/4" style={{ background: accentColor }} />
        <div className="h-1.5 rounded-full w-1/2" style={{ background: accentColor }} />
        <div className="h-1.5 rounded-full w-2/3" style={{ background: accentColor }} />
      </div>
      <div
        className="w-full h-1 rounded-full absolute bottom-0 left-0"
        style={{ background: accentColor }}
      />
    </div>
  );
}

export function DocumentThumbnail() {
  return (
    <div
      className="w-full rounded-lg overflow-hidden bg-white border border-gray-200 flex flex-col p-3 gap-1.5"
      style={{ aspectRatio: '3/4' }}
    >
      <div className="h-2 bg-gray-800 rounded-full w-2/3 opacity-70" />
      <div className="h-1.5 bg-gray-300 rounded-full w-full" />
      <div className="h-1.5 bg-gray-300 rounded-full w-5/6" />
      <div className="h-1.5 bg-gray-300 rounded-full w-full" />
      <div className="h-1.5 bg-gray-200 rounded-full w-3/4 mt-1" />
      <div className="h-1.5 bg-gray-200 rounded-full w-full" />
      <div className="h-1.5 bg-gray-200 rounded-full w-2/3" />
    </div>
  );
}

export function VisualThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  if (imageUrl) {
    return (
      <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className="w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center"
      style={{
        background:
          'linear-gradient(135deg, rgba(255,95,0,0.10) 0%, rgba(255,95,0,0.20) 100%)',
        border: '1.5px solid rgba(255,95,0,0.20)',
      }}
    >
      <ImageIcon className="size-8 text-orange-500/60" />
    </div>
  );
}

// ─── Move-to popover ──────────────────────────────────────────────────────────

export function MoveToPopover({
  folders,
  currentFolderId,
  onMove,
  onClose,
}: {
  folders: StoredFolder[];
  currentFolderId: string | null;
  onMove: (target: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const byParent = new Map<string | null, StoredFolder[]>();
  for (const f of folders) {
    const key = f.parentFolderId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  const flat: { folder: StoredFolder; depth: number }[] = [];
  function walk(parent: string | null, depth: number) {
    const children = (byParent.get(parent) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const c of children) {
      flat.push({ folder: c, depth });
      walk(c.folderId, depth + 1);
    }
  }
  walk(null, 0);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-9 z-30 w-56 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
        Move to
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMove(null);
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
          currentFolderId === null ? 'text-violet-700 font-semibold' : 'text-gray-700'
        }`}
      >
        Compose root
      </button>
      {flat.length === 0 ? (
        <div className="px-3 py-3 text-xs text-gray-400 italic">
          No folders yet — create one first.
        </div>
      ) : (
        flat.map(({ folder, depth }) => (
          <button
            key={folder.folderId}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMove(folder.folderId);
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
              currentFolderId === folder.folderId
                ? 'text-violet-700 font-semibold'
                : 'text-gray-700'
            }`}
            style={{ paddingLeft: 12 + depth * 14 }}
          >
            <FolderIcon className="size-3.5 text-gray-400" />
            <span className="truncate">{folder.name}</span>
          </button>
        ))
      )}
    </div>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

export function ComposeCard({
  row,
  folders,
  onDelete,
  onMove,
}: {
  row: ComposeRow;
  folders: StoredFolder[];
  onDelete: () => void;
  onMove: (target: string | null) => void;
}) {
  const Icon = FORMAT_ICON[row.format];
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-violet-200 transition-all overflow-hidden">
      <Link href={row.href} className="block">
        <div className="px-2.5 pt-2.5 pb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold ${FORMAT_ACCENT[row.format]}`}
            >
              <Icon className="size-2.5" />
              {FORMAT_LABEL[row.format]}
            </span>
          </div>
          <div className="font-semibold text-gray-900 line-clamp-2 leading-snug text-xs">
            {row.name}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="size-2.5 text-gray-400 flex-shrink-0" />
            <span className="text-[10px] text-gray-400">{formatRelative(row.updatedAt)}</span>
          </div>
        </div>

        <div className="w-full p-2.5 pt-0 bg-gray-50/40">
          {row.format === 'slides' ? (
            <SlideThumbnail accentColor={row.accentColor || '#7C3AED'} />
          ) : row.format === 'visual' ? (
            <VisualThumbnail imageUrl={row.imageUrl} name={row.name} />
          ) : (
            <DocumentThumbnail />
          )}
        </div>
      </Link>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMoveOpen((v) => !v);
          }}
          title="Move to folder"
          aria-label="Move to folder"
          className="size-6 rounded flex items-center justify-center text-gray-500 hover:text-violet-700 hover:bg-violet-50 bg-white/80 backdrop-blur-sm"
        >
          <MoveRight className="size-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
          aria-label="Delete"
          className="size-6 rounded flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 bg-white/80 backdrop-blur-sm"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {moveOpen && (
        <MoveToPopover
          folders={folders}
          currentFolderId={row.folderId}
          onMove={(target) => {
            onMove(target);
            setMoveOpen(false);
          }}
          onClose={() => setMoveOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Folder tile ──────────────────────────────────────────────────────────────

export function FolderTile({
  folder,
  childCount,
  onDelete,
  onRename,
}: {
  folder: StoredFolder;
  childCount: number;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const router = useRouter();
  const open = () =>
    router.push(`/studio/my-projects?folder=${encodeURIComponent(folder.folderId)}`);
  // Wrapping element is a <div role="button"> (not <Link> / <button>)
  // because the hover-reveal Rename / Delete actions inside are
  // themselves <button>s, and HTML forbids interactive elements nested
  // inside <a> or <button> (causes a hydration error). role + tabIndex
  // + Enter/Space handler keep keyboard activation working.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className="group relative rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-violet-200 transition-all overflow-hidden text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500/40"
    >
      <div className="w-full p-2.5 bg-gray-50">
        <div
          className="w-full aspect-square rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0.16) 100%)',
            border: '1.5px solid rgba(124,58,237,0.18)',
          }}
        >
          <FolderIcon className="size-10 text-violet-500/70" strokeWidth={1.5} />
        </div>
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700">
            <FolderIcon className="size-2.5" />
            Folder
          </span>
        </div>
        <div className="font-semibold text-gray-900 line-clamp-2 leading-snug text-xs">
          {folder.name}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {childCount === 0 ? 'Empty' : `${childCount} item${childCount !== 1 ? 's' : ''}`}
        </div>
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = window.prompt('Rename folder', folder.name);
            if (next && next.trim()) onRename(next.trim());
          }}
          title="Rename"
          aria-label="Rename"
          className="size-6 rounded flex items-center justify-center text-gray-500 hover:text-violet-700 hover:bg-violet-50 bg-white/80 backdrop-blur-sm text-[10px] font-bold"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          title="Delete folder"
          aria-label="Delete folder"
          className="size-6 rounded flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 bg-white/80 backdrop-blur-sm"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
