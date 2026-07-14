import type { FXDATemplate } from '@/types/fxda';

const STORAGE_KEY = 'compose:templates';

export interface StoredTemplate {
  template: FXDATemplate;
  createdAt: string;
  updatedAt: string;
}

export function getTemplates(): StoredTemplate[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  return JSON.parse(stored) as StoredTemplate[];
}

export function getTemplate(documentId: string): StoredTemplate | null {
  const templates = getTemplates();
  return templates.find((t) => t.template.documentId === documentId) ?? null;
}

export function saveTemplate(template: FXDATemplate): StoredTemplate {
  const templates = getTemplates();
  const now = new Date().toISOString();

  const existing = templates.findIndex(
    (t) => t.template.documentId === template.documentId,
  );

  const entry: StoredTemplate = {
    template,
    createdAt: existing >= 0 ? templates[existing].createdAt : now,
    updatedAt: now,
  };

  if (existing >= 0) {
    templates[existing] = entry;
  } else {
    templates.unshift(entry);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  return entry;
}

export function deleteTemplate(documentId: string): boolean {
  const templates = getTemplates();
  const filtered = templates.filter(
    (t) => t.template.documentId !== documentId,
  );
  if (filtered.length === templates.length) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}
