/**
 * Chat history storage — localStorage-backed conversation index.
 *
 * Follows the same pattern as documentStorage.ts:
 * Single localStorage key → array of ChatEntry entries.
 * Each chat identified by unique id.
 */

const STORAGE_KEY = 'compose:chats';

export interface ChatEntry {
  id: string;
  skillName: string;
  taskDescription: string;
  timestamp: string; // ISO date
  documentId: string | null; // link to generated artifact
  status: 'active' | 'completed';
}

/** Get all stored chats, sorted by timestamp descending (most recent first). */
export function getAllChats(): ChatEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const chats = JSON.parse(raw) as ChatEntry[];
    return chats.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch {
    return [];
  }
}

/** Save (upsert) a chat entry. Creates if new, updates if exists. */
export function saveChat(entry: ChatEntry): void {
  const chats = getAllChats();
  const existingIndex = chats.findIndex((c) => c.id === entry.id);

  if (existingIndex >= 0) {
    chats[existingIndex] = entry;
  } else {
    chats.unshift(entry);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

/** Delete a chat entry by ID. */
export function deleteChat(id: string): void {
  const chats = getAllChats();
  const filtered = chats.filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/** Seed with demo entries if storage is empty. Call on first load. */
export function seedChatsIfEmpty(): void {
  if (typeof window === 'undefined') return;
  const existing = getAllChats();
  if (existing.length > 0) return;

  const now = Date.now();
  const seeds: ChatEntry[] = [
    {
      id: 'seed-chat-1',
      skillName: 'Legal Counsel',
      taskDescription: 'Mutual NDA draft for Acme Corp partnership',
      timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      documentId: null,
      status: 'completed',
    },
    {
      id: 'seed-chat-2',
      skillName: 'Executive Writer',
      taskDescription: 'Q1 board memo with revenue highlights',
      timestamp: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      documentId: null,
      status: 'completed',
    },
    {
      id: 'seed-chat-3',
      skillName: 'Technical Author',
      taskDescription: 'REST API documentation for auth service',
      timestamp: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      documentId: null,
      status: 'active',
    },
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
}
