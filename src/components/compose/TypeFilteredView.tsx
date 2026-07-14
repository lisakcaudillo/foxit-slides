'use client';

/**
 * TypeFilteredView — full-page grid filtered to a single Compose file
 * type. Used by /compose/documents, /compose/graphics, /compose/slides.
 *
 * Mirrors the visual idioms of /compose's overview cards but renders
 * EVERY row of the chosen type (not the top-N preview shown on /compose).
 * Includes a search field for filtering within the type.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, FileText, Plus } from 'lucide-react';
import { ComposeCard } from './ComposeCard';
import { useComposeData } from './useComposeData';
import { type Format, formatRelative } from './composeRow';
import { StudioBreadcrumb } from '@/components/studio/StudioBreadcrumb';

interface TypeFilteredViewProps {
  /** Internal compose row format. */
  type: Format;
  /** Pluralized title shown at the top of the page (e.g., "Documents"). */
  title: string;
  /** Singular form for empty / count copy (e.g., "document"). */
  singular: string;
  /** Where the page's "Create" CTA points. */
  createHref: string;
  /** Friendly create-button label (e.g., "New document"). */
  createLabel: string;
  /** Optional label shown above the grid (e.g., "My Generated Images").
   *  Rendered only when there are items to group. */
  gridLabel?: string;
}

export default function TypeFilteredView({
  type,
  title,
  singular,
  createHref,
  createLabel,
  gridLabel,
}: TypeFilteredViewProps) {
  const { rows, folders, handleDelete, handleMove } = useComposeData();
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows
        .filter((r) => r.format === type)
        .filter((r) => !q || r.name.toLowerCase().includes(q)),
    [rows, type, q],
  );

  const lastUpdated = filtered[0]?.updatedAt;
  const isSearching = q.length > 0;

  return (
    <div>{/* MainContent owns the offset, wash, floating panel + scroll */}
      <div className="max-w-[1200px] mx-auto px-8 py-10 space-y-6">

        <StudioBreadcrumb trail={[{ label: title }]} />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} {singular}
              {filtered.length !== 1 ? 's' : ''}
              {lastUpdated ? ` · last edited ${formatRelative(lastUpdated)}` : ''}
            </p>
          </div>
          <Link
            href={createHref}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors flex-shrink-0"
          >
            <Plus className="size-4" />
            {createLabel}
          </Link>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${title.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        {/* Grid or empty state */}
        {filtered.length > 0 ? (
          <div className="space-y-3">
          {gridLabel && (
            <div className="text-[11px] font-bold tracking-[0.08em] text-gray-400 uppercase">
              {gridLabel}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map((row) => (
              <ComposeCard
                key={`${row.format}:${row.id}`}
                row={row}
                folders={folders}
                onDelete={() => handleDelete(row)}
                onMove={(target) => handleMove(row, target)}
              />
            ))}
          </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="size-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
              <FileText className="size-8 text-violet-400" />
            </div>
            <p className="text-base font-semibold text-gray-800 mb-1">
              {isSearching ? `No ${singular}s match your search.` : `No ${singular}s yet`}
            </p>
            {!isSearching && (
              <>
                <p className="text-sm text-gray-500 mb-6">
                  Create your first {singular} to get started.
                </p>
                <Link
                  href={createHref}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
                >
                  <Plus className="size-4" />
                  {createLabel}
                </Link>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
