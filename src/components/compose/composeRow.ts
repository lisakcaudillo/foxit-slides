/**
 * Shared types, presentation tokens, and conversion helpers for Compose
 * file rows. Used by /compose, /compose/documents, /compose/graphics,
 * /compose/slides, and /compose/library.
 *
 * Extracted from the original /compose/page.tsx during Phase 3 of the
 * Compose workspace restructure so the single-type pages can reuse the
 * exact same row shape, conversion logic, and visual tokens.
 */

import {
  FileText,
  LayoutTemplate,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react';
import type { StoredCardDeck } from '@/lib/cardDeckStorage';
import type { StoredDocument } from '@/lib/documentStorage';
import type { StoredVisual } from '@/lib/visualStorage';
import type { CardBlock } from '@/types/card-template';
import type { Block } from '@/types';

export type Format = 'slides' | 'document' | 'visual';

export interface ComposeRow {
  id: string;
  format: Format;
  name: string;
  updatedAt: string;
  href: string;
  folderId: string | null;
  /** First card / first block heading text — feeds the stylized thumbnail. */
  previewTitle?: string;
  /** Slide-only: accent color used to tint the 16:9 preview. */
  accentColor?: string;
  /** Visual-only: rendered image URL for the thumbnail. */
  imageUrl?: string;
}

export const FORMAT_LABEL: Record<Format, string> = {
  slides: 'Slides',
  document: 'Document',
  visual: 'Visual',
};

export const FORMAT_ICON: Record<Format, LucideIcon> = {
  slides: LayoutTemplate,
  document: FileText,
  visual: ImageIcon,
};

export const FORMAT_ACCENT: Record<Format, string> = {
  slides: 'bg-violet-50 text-violet-700',
  document: 'bg-blue-50 text-blue-700',
  visual: 'bg-orange-50 text-orange-700',
};

// Fallback palette for slides whose theme didn't carry an accent color.
const SLIDE_PALETTE = [
  '#7C3AED', '#2563EB', '#059669', '#D97706',
  '#DC2626', '#0891B2', '#9333EA', '#4F46E5',
];

export function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return SLIDE_PALETTE[Math.abs(hash) % SLIDE_PALETTE.length];
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function firstCardText(blocks: CardBlock[] | undefined): string | undefined {
  if (!blocks) return undefined;
  for (const b of blocks) {
    if (b.type === 'heading' && b.content) return b.content;
  }
  for (const b of blocks) {
    if (b.type === 'paragraph' && b.content) return b.content;
  }
  return undefined;
}

export function deckToRow(d: StoredCardDeck): ComposeRow {
  const firstCard = d.template?.cards?.[0];
  const firstColumnBlocks = firstCard?.columns?.[0]?.blocks;
  const previewTitle =
    firstCardText(firstColumnBlocks) ?? d.template?.name ?? 'Untitled';
  const accentColor =
    d.template?.theme?.accentColors?.[0] || hashColor(d.deckId);
  return {
    id: d.deckId,
    format: 'slides',
    name: d.template?.name?.trim() || 'Untitled deck',
    updatedAt: d.updatedAt,
    href: `/studio/slides/${encodeURIComponent(d.deckId)}`,
    folderId: d.folderId ?? null,
    accentColor,
    previewTitle,
  };
}

export function docToRow(d: StoredDocument): ComposeRow {
  const firstHeading = d.blocks?.find((b: Block) => b.blockType === 'heading');
  const firstAnyText = d.blocks?.find((b: Block) => Boolean(b.content));
  const previewTitle = firstHeading?.content || firstAnyText?.content || '';
  return {
    id: d.documentId,
    format: 'document',
    name: d.documentName?.trim() || 'Untitled document',
    updatedAt: d.updatedAt,
    href: `/editor/documents?doc=${encodeURIComponent(d.documentId)}`,
    folderId: d.folderId ?? null,
    previewTitle,
  };
}

export function visualToRow(v: StoredVisual): ComposeRow {
  return {
    id: v.visualId,
    format: 'visual',
    name: v.name?.trim() || 'Untitled visual',
    updatedAt: v.updatedAt,
    href: `/editor/graphics?visual=${encodeURIComponent(v.visualId)}`,
    folderId: v.folderId ?? null,
    imageUrl: v.imageUrl,
    previewTitle: v.prompt,
  };
}
