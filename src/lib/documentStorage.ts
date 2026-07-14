/**
 * Multi-document storage — localStorage-backed document index.
 *
 * Follows the same pattern as templateStorage.ts:
 * Single localStorage key → array of StoredDocument entries.
 * Each document identified by unique documentId.
 */

import type { FXDAField, FXDATemplate } from '@/types/fxda';
import type { Block } from '@/types';

const STORAGE_KEY = 'compose:documents';

export interface StoredDocument {
  documentId: string;
  documentName: string;
  blocks: Block[];
  workflowPresetId: string | null;
  fields: FXDAField[];
  fxda: FXDATemplate;
  /** Optional folder this document lives in. null/undefined = root of /compose. */
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Get all stored documents, sorted by updatedAt descending (most recent first). */
export function getAllDocuments(): StoredDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const docs = JSON.parse(raw) as StoredDocument[];
    return docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

/** Get a single document by its ID. */
export function getDocument(documentId: string): StoredDocument | null {
  const docs = getAllDocuments();
  return docs.find((d) => d.documentId === documentId) ?? null;
}

/** Save (upsert) a document. Creates if new, updates if exists. */
export function saveDocument(doc: StoredDocument): void {
  const docs = getAllDocuments();
  const existingIndex = docs.findIndex((d) => d.documentId === doc.documentId);

  if (existingIndex >= 0) {
    docs[existingIndex] = { ...doc, updatedAt: new Date().toISOString() };
  } else {
    docs.unshift({ ...doc, createdAt: doc.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

/** Delete a document by ID. */
export function deleteDocument(documentId: string): void {
  const docs = getAllDocuments();
  const filtered = docs.filter((d) => d.documentId !== documentId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/** Get the count of stored documents. */
export function getDocumentCount(): number {
  return getAllDocuments().length;
}

/** Move a document into a folder (or to root with null). Returns true if
 *  the document existed. Updates `updatedAt`. */
export function setDocumentFolder(documentId: string, folderId: string | null): boolean {
  if (typeof window === 'undefined') return false;
  const docs = getAllDocuments();
  const idx = docs.findIndex((d) => d.documentId === documentId);
  if (idx < 0) return false;
  docs[idx] = {
    ...docs[idx],
    folderId: folderId ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  return true;
}

// ── Migration: import from legacy single-document key ──

const LEGACY_KEY = 'compose:current-document';

/**
 * Migrate the legacy single-document storage to the multi-document index.
 * Call once at app startup. Safe to call multiple times — skips if already migrated.
 */
export function migrateLegacyDocument(): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;

    const legacy = JSON.parse(raw) as {
      documentName: string;
      blocks: Block[];
      workflowPresetId: string | null;
      fields: FXDAField[];
      fxda: FXDATemplate;
      savedAt: string;
    };

    // Only migrate if not already in the new store
    const existing = getDocument(legacy.fxda.documentId);
    if (existing) return;

    saveDocument({
      documentId: legacy.fxda.documentId,
      documentName: legacy.documentName,
      blocks: legacy.blocks,
      workflowPresetId: legacy.workflowPresetId,
      fields: legacy.fields,
      fxda: legacy.fxda,
      createdAt: legacy.savedAt,
      updatedAt: legacy.savedAt,
    });

    // Keep legacy key for backward compat but mark as migrated
    // (don't delete — in case user downgrades)
  } catch {
    // Migration failure is non-fatal
  }
}
