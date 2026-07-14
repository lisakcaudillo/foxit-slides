'use client';

/**
 * StudioBreadcrumb — the "Studio › Section › Page" quick-nav used on the deck
 * detail page, shared across the smaller Studio surfaces for consistent
 * orientation. Always roots at Studio; intermediate crumbs link, the last is
 * the current page (non-link, emphasized). Apple semantic greys.
 */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Link target. Omit (or set on the last crumb) to render as plain text. */
  href?: string;
}

export function StudioBreadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <div className="flex items-center gap-1.5 mb-6" style={{ fontSize: 13, color: '#6e6e73' }}>
      <Link href="/studio" className="hover:opacity-80" style={{ color: '#6e6e73' }}>
        Studio
      </Link>
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="size-3.5 flex-shrink-0" style={{ color: '#b0b0b6' }} />
            {c.href && !isLast ? (
              <Link href={c.href} className="hover:opacity-80" style={{ color: '#6e6e73' }}>
                {c.label}
              </Link>
            ) : (
              <span className="truncate" style={{ color: '#1d1d1f', fontWeight: 530, maxWidth: 360 }}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
