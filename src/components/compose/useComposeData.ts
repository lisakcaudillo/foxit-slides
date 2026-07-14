'use client';

/**
 * useComposeData — shared state + handlers for any /compose/* page that
 * needs to render rows of files plus folder operations.
 *
 * Loads decks, documents, visuals, and folders from their localStorage
 * stores on mount, time-sorts the rows, and exposes the standard
 * delete / move / rename handlers used by ComposeCard + FolderTile.
 *
 * Used by /compose, /compose/documents, /compose/graphics,
 * /compose/slides, /compose/my-projects, and /compose/library.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getAllDecks,
  deleteDeck,
  setDeckFolder,
} from '@/lib/cardDeckStorage';
import {
  getAllDocuments,
  deleteDocument,
  setDocumentFolder,
} from '@/lib/documentStorage';
import {
  getAllVisuals,
  deleteVisual,
  setVisualFolder,
} from '@/lib/visualStorage';
import {
  getAllFolders,
  deleteFolder,
  renameFolder,
  type StoredFolder,
} from '@/lib/folderStorage';
import {
  type ComposeRow,
  deckToRow,
  docToRow,
  visualToRow,
} from './composeRow';

export function useComposeData() {
  const [rows, setRows] = useState<ComposeRow[]>([]);
  const [folders, setFolders] = useState<StoredFolder[]>([]);

  useEffect(() => {
    const decks = getAllDecks().map(deckToRow);
    const docs = getAllDocuments().map(docToRow);
    const visuals = getAllVisuals().map(visualToRow);
    const all = [...decks, ...docs, ...visuals].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    setRows(all);
    setFolders(getAllFolders());
  }, []);

  const handleDelete = (row: ComposeRow) => {
    const ok = window.confirm(`Delete "${row.name}"? This cannot be undone.`);
    if (!ok) return;
    if (row.format === 'slides') deleteDeck(row.id);
    else if (row.format === 'visual') deleteVisual(row.id);
    else deleteDocument(row.id);
    setRows((prev) => prev.filter((r) => !(r.id === row.id && r.format === row.format)));
  };

  const handleMove = (row: ComposeRow, target: string | null) => {
    if (row.format === 'slides') setDeckFolder(row.id, target);
    else if (row.format === 'visual') setVisualFolder(row.id, target);
    else setDocumentFolder(row.id, target);
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id && r.format === row.format ? { ...r, folderId: target } : r,
      ),
    );
  };

  const handleDeleteFolder = (folder: StoredFolder) => {
    const ok = window.confirm(
      `Delete "${folder.name}"? Items inside will move up one level.`,
    );
    if (!ok) return;
    const newParent = folder.parentFolderId ?? null;
    rows
      .filter((r) => r.folderId === folder.folderId)
      .forEach((r) => {
        if (r.format === 'slides') setDeckFolder(r.id, newParent);
        else if (r.format === 'visual') setVisualFolder(r.id, newParent);
        else setDocumentFolder(r.id, newParent);
      });
    deleteFolder(folder.folderId);
    setFolders(getAllFolders());
    setRows((prev) =>
      prev.map((r) => (r.folderId === folder.folderId ? { ...r, folderId: newParent } : r)),
    );
  };

  const handleRenameFolder = (folder: StoredFolder, name: string) => {
    renameFolder(folder.folderId, name);
    setFolders(getAllFolders());
  };

  // Recursive item count per folder (descendants included).
  const folderCounts = useMemo(() => {
    const out = new Map<string, number>();
    const childFolderMap = new Map<string | null, StoredFolder[]>();
    for (const f of folders) {
      const k = f.parentFolderId ?? null;
      const list = childFolderMap.get(k) ?? [];
      list.push(f);
      childFolderMap.set(k, list);
    }
    const itemFolderMap = new Map<string, ComposeRow[]>();
    for (const r of rows) {
      if (!r.folderId) continue;
      const list = itemFolderMap.get(r.folderId) ?? [];
      list.push(r);
      itemFolderMap.set(r.folderId, list);
    }
    function countDescendants(folderId: string): number {
      const items = itemFolderMap.get(folderId)?.length ?? 0;
      const children = childFolderMap.get(folderId) ?? [];
      let total = items;
      for (const c of children) total += 1 + countDescendants(c.folderId);
      return total;
    }
    for (const f of folders) out.set(f.folderId, countDescendants(f.folderId));
    return out;
  }, [folders, rows]);

  return {
    rows,
    folders,
    folderCounts,
    handleDelete,
    handleMove,
    handleDeleteFolder,
    handleRenameFolder,
  };
}
