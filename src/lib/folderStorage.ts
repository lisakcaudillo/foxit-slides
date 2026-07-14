/**
 * Folder storage — localStorage-backed nested folder tree for organising
 * decks, documents, and visuals on /compose.
 *
 * Folders form a tree: each folder has an optional `parentFolderId`. A null
 * parent means the folder lives at the root of /compose. There is no built-in
 * cycle prevention in the data model — the move helper here checks for
 * cycles before reparenting so the UI can stay simple.
 *
 * Items (decks/documents/visuals) carry their own `folderId?: string` field
 * on their respective Stored shapes. This file owns folders only; consumers
 * read the items' folderId directly from cardDeckStorage / documentStorage /
 * visualStorage.
 */

const STORAGE_KEY = 'compose:folders';

export interface StoredFolder {
  /** Unique folder id. */
  folderId: string;
  /** Display name. */
  name: string;
  /** Parent folder id, or null when this folder lives at the root. */
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Get all stored folders, sorted alphabetically by name within their level. */
export function getAllFolders(): StoredFolder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const folders = JSON.parse(raw) as StoredFolder[];
    if (!Array.isArray(folders)) return [];
    return [...folders].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Get a single folder by id. */
export function getFolder(folderId: string): StoredFolder | null {
  return getAllFolders().find((f) => f.folderId === folderId) ?? null;
}

/** Get folders whose parent matches `parentFolderId` (use null for root). */
export function getChildFolders(parentFolderId: string | null): StoredFolder[] {
  return getAllFolders().filter((f) => f.parentFolderId === parentFolderId);
}

/**
 * Build the breadcrumb chain from root → folder. Empty array means the
 * folder is at the root (or the id is unknown). The folder itself is the
 * last element.
 */
export function getFolderPath(folderId: string | null): StoredFolder[] {
  if (!folderId) return [];
  const all = getAllFolders();
  const byId = new Map(all.map((f) => [f.folderId, f]));
  const path: StoredFolder[] = [];
  let cursor = byId.get(folderId);
  // Defend against accidental cycles by capping the walk at folder count.
  let safety = all.length + 1;
  while (cursor && safety-- > 0) {
    path.unshift(cursor);
    cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : undefined;
  }
  return path;
}

/** Create a new folder. */
export function createFolder(
  name: string,
  parentFolderId: string | null = null,
): StoredFolder {
  const now = new Date().toISOString();
  const folder: StoredFolder = {
    folderId: generateFolderId(),
    name: name.trim() || 'Untitled folder',
    parentFolderId,
    createdAt: now,
    updatedAt: now,
  };
  if (typeof window === 'undefined') return folder;
  const folders = getAllFolders();
  folders.push(folder);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  } catch {
    /* quota / private mode — silently ignore */
  }
  return folder;
}

/** Rename a folder. Returns the updated folder, or null if not found. */
export function renameFolder(folderId: string, name: string): StoredFolder | null {
  if (typeof window === 'undefined') return null;
  const folders = getAllFolders();
  const idx = folders.findIndex((f) => f.folderId === folderId);
  if (idx < 0) return null;
  const updated: StoredFolder = {
    ...folders[idx],
    name: name.trim() || folders[idx].name,
    updatedAt: new Date().toISOString(),
  };
  folders[idx] = updated;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  } catch {
    return null;
  }
  return updated;
}

/**
 * Move a folder under a new parent. Returns true on success. Refuses to
 * create a cycle (moving folder under one of its own descendants).
 */
export function moveFolder(folderId: string, newParentId: string | null): boolean {
  if (folderId === newParentId) return false;
  if (typeof window === 'undefined') return false;
  const folders = getAllFolders();
  const idx = folders.findIndex((f) => f.folderId === folderId);
  if (idx < 0) return false;

  // Cycle check — walk up from newParentId and refuse if it evers land on folderId.
  if (newParentId) {
    const byId = new Map(folders.map((f) => [f.folderId, f]));
    let cursor = byId.get(newParentId);
    let safety = folders.length + 1;
    while (cursor && safety-- > 0) {
      if (cursor.folderId === folderId) return false;
      cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : undefined;
    }
  }

  folders[idx] = {
    ...folders[idx],
    parentFolderId: newParentId,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  } catch {
    return false;
  }
  return true;
}

/**
 * Delete a folder. Children (subfolders + items) are reparented to the
 * deleted folder's parent — nothing is destroyed silently. Returns true if
 * the folder existed and was removed.
 *
 * NOTE: this only updates the folder index. Reparenting items requires the
 * caller to walk decks/docs/visuals and clear `folderId` for matches. The
 * /compose page handles that on click.
 */
export function deleteFolder(folderId: string): boolean {
  if (typeof window === 'undefined') return false;
  const folders = getAllFolders();
  const target = folders.find((f) => f.folderId === folderId);
  if (!target) return false;
  const remaining = folders
    .filter((f) => f.folderId !== folderId)
    .map((f) =>
      f.parentFolderId === folderId ? { ...f, parentFolderId: target.parentFolderId } : f,
    );
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  } catch {
    return false;
  }
  return true;
}

/** Generate a folder id. */
export function generateFolderId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `fld_${ts}_${rand}`;
}
