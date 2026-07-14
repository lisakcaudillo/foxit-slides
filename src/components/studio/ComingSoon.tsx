'use client';

/**
 * ComingSoon — shared placeholder for studio sections that are scaffolded
 * but not yet built out. Used by /studio/templates (themes listing removed),
 * /studio/themes, and /studio/my-decks so the three read as one intentional,
 * consistent state rather than three different empty pages.
 *
 * Matches the studio page idiom: breadcrumb (Library / <title>) + h1, then a
 * centered "Coming soon" block mirroring the empty-state vocabulary used on
 * /studio/my-projects (rounded violet chip + heading + supporting line).
 *
 * View-only: this renders no real section content by design.
 */

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div>{/* MainContent owns the offset, wash, floating panel + scroll */}
      <div className="max-w-[1200px] mx-auto px-8 py-10 space-y-6">

        {/* Header */}
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] text-gray-400 uppercase mb-1">
            <Link href="/studio" className="hover:text-violet-700 transition-colors">
              Library
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-violet-700">{title}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        </div>

        {/* Coming soon state */}
        <div className="flex flex-col items-center justify-center py-28 text-center">
          <div className="size-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-5">
            <Sparkles className="size-8 text-violet-400" strokeWidth={1.5} />
          </div>
          <p className="text-lg font-semibold text-gray-800 mb-1.5">Coming soon</p>
          <p className="text-sm text-gray-500 max-w-sm">
            We&rsquo;re putting this together. Check back shortly.
          </p>
        </div>

      </div>
    </div>
  );
}
