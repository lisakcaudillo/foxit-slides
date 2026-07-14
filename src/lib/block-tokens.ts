// Generation Pipeline v2 — Block rendering tokens and controlled vocabulary
// Designer Agent owns these definitions. See CLAUDE.md agent roster.

import type { BlueprintBlockType } from '@/types/generation';

// ── Block type visual tokens ───────────────────────────────────────────────
// Used by Canvas renderer to style v2 structured blocks.

export interface BlockToken {
  bg: string;
  border: string;
  text: string;
  padding: string;
  fontWeight: string;
  fontSize: string;
}

export const BLOCK_TOKENS: Record<string, BlockToken> = {
  hero: {
    bg: 'bg-slate-50',
    border: 'border-l-4 border-violet-500',
    text: 'text-slate-900',
    padding: 'p-block-low',
    fontWeight: 'font-semibold',
    fontSize: 'text-2xl',
  },
  heading: {
    bg: 'bg-transparent',
    border: '',
    text: 'text-slate-900',
    padding: 'py-2',
    fontWeight: 'font-semibold',
    fontSize: 'text-lg',
  },
  paragraph: {
    bg: 'bg-transparent',
    border: '',
    text: 'text-slate-700',
    padding: 'py-1',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  bullets: {
    bg: 'bg-transparent',
    border: '',
    text: 'text-slate-700',
    padding: 'py-1 pl-4',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  clause: {
    bg: 'bg-transparent',
    border: '',
    text: 'text-slate-800',
    padding: 'py-1',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  definition: {
    bg: 'bg-slate-50',
    border: 'border-l-2 border-slate-300',
    text: 'text-slate-700',
    padding: 'py-2 pl-4',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  summary: {
    bg: 'bg-violet-50',
    border: 'border-l-4 border-violet-400',
    text: 'text-slate-800',
    padding: 'p-block-med',
    fontWeight: 'font-medium',
    fontSize: 'text-sm',
  },
  cta: {
    bg: 'bg-violet-600',
    border: 'rounded-lg',
    text: 'text-white',
    padding: 'p-block-med',
    fontWeight: 'font-semibold',
    fontSize: 'text-base',
  },
  'signature-block': {
    bg: 'bg-slate-50',
    border: 'border border-dashed border-slate-300 rounded',
    text: 'text-slate-600',
    padding: 'p-block-low',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  list: {
    bg: 'bg-transparent',
    border: '',
    text: 'text-slate-700',
    padding: 'py-1 pl-6',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  table: {
    bg: 'bg-transparent',
    border: 'border border-slate-200 rounded',
    text: 'text-slate-700',
    padding: 'p-0',
    fontWeight: 'font-normal',
    fontSize: 'text-sm',
  },
  divider: {
    bg: 'bg-transparent',
    border: 'border-t border-slate-200',
    text: 'text-slate-400',
    padding: 'py-4',
    fontWeight: 'font-medium',
    fontSize: 'text-xs',
  },
  callout: {
    bg: 'bg-violet-50',
    border: 'border-l-4 border-violet-400 rounded-r-lg',
    text: 'text-slate-800',
    padding: 'p-4',
    fontWeight: 'font-medium',
    fontSize: 'text-sm',
  },
  stats: {
    bg: 'bg-slate-50',
    border: 'rounded-lg',
    text: 'text-slate-900',
    padding: 'p-4',
    fontWeight: 'font-semibold',
    fontSize: 'text-3xl',
  },
  cover: {
    bg: 'bg-slate-50',
    border: 'rounded-xl',
    text: 'text-slate-900',
    padding: 'p-8',
    fontWeight: 'font-bold',
    fontSize: 'text-3xl',
  },
};

// ── Controlled vocabulary for layout hints ──────────────────────────────────
// These are the only valid values for GeneratedBlock.layoutHint.
// The Canvas renderer maps these to CSS classes.

export type LayoutHint =
  | 'full-width'
  | 'two-column'
  | 'indented'
  | 'centered'
  | 'stat-row'
  | 'card-grid';

export const LAYOUT_HINT_STYLES: Record<LayoutHint, string> = {
  'full-width': 'w-full',
  'two-column': 'grid grid-cols-2 gap-4',
  indented: 'ml-8',
  centered: 'mx-auto text-center',
  'stat-row': 'flex justify-between gap-4',
  'card-grid': 'grid grid-cols-3 gap-3',
};

// ── Controlled vocabulary for visual hints ──────────────────────────────────
// These are the only valid values for GeneratedBlock.visualHint.

export type VisualHint =
  | 'accent-border'
  | 'muted-bg'
  | 'highlight'
  | 'none';

export const VISUAL_HINT_STYLES: Record<VisualHint, string> = {
  'accent-border': 'border-l-4 border-violet-500',
  'muted-bg': 'bg-slate-50 rounded',
  highlight: 'bg-violet-50 border border-violet-200 rounded',
  none: '',
};

// ── Block spacing map (template blockSpacing → Tailwind token) ──────────────

export const BLOCK_SPACING_MAP: Record<'compact' | 'balanced' | 'spacious', string> = {
  compact: 'block-high',   // 12px
  balanced: 'block-med',   // 20px
  spacious: 'block-low',   // 32px
};

// ── Helper: get token for block type ────────────────────────────────────────

export function getBlockToken(blockType: BlueprintBlockType | string): BlockToken {
  return BLOCK_TOKENS[blockType] ?? BLOCK_TOKENS.paragraph;
}
