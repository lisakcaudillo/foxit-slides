'use client';

import { redirect } from 'next/navigation';
import { use } from 'react';

/**
 * Dynamic editor route — redirects to /editor/documents for now.
 * Once persistent document storage is implemented, this will
 * load the document by ID.
 *
 * NOTE (prototype): Document IDs are not yet persisted. All IDs
 * redirect to /editor/documents which restores the last auto-saved
 * document from localStorage. This is expected prototype behavior
 * and will be replaced with real document lookup when a backend
 * document store is available.
 */
export default function EditorById({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Consume params to satisfy Next.js 15 dynamic route contract
  use(params);
  redirect('/editor/documents');
}
