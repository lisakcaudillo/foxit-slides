'use client';

import { useCallback, useRef } from 'react';
import { FileText, Presentation } from 'lucide-react';

export type ViewMode = 'pages' | 'slides';

interface ViewSwitcherProps {
  activeView: ViewMode;
  onChange: (view: ViewMode) => void;
}

const views: { mode: ViewMode; label: string; Icon: typeof FileText }[] = [
  { mode: 'pages', label: 'Pages', Icon: FileText },
  { mode: 'slides', label: 'Slides', Icon: Presentation },
];

export default function ViewSwitcher({ activeView, onChange }: ViewSwitcherProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next = index;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next = (index + 1) % views.length;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        next = (index - 1 + views.length) % views.length;
      } else {
        return;
      }

      const btn = tabsRef.current[next];
      if (btn) {
        btn.focus();
        onChange(views[next].mode);
      }
    },
    [onChange],
  );

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex items-center bg-slate-100 rounded-lg p-0.5"
    >
      {views.map(({ mode, label, Icon }, i) => {
        const isActive = activeView === mode;
        return (
          <button
            key={mode}
            ref={(el) => { tabsRef.current[i] = el; }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(mode)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`
              inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px]
              text-sm font-medium rounded-md transition-all
              focus:outline-none focus:ring-2 focus:ring-violet-400
              ${isActive
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
              }
            `}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
