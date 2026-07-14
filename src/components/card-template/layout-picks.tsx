/**
 * Layout picks — shared catalogue + SVG previews for the per-template layout
 * picker. Used in two places:
 *   1. /editor/slides generation flow (pencil affordance on template tiles)
 *   2. ThumbnailSidebar right-click → "Try different layout" (P1 #6).
 *
 * Per Lisa 2026-05-21 — labels stay GENERIC SHAPE names (Header, Table,
 * Bullets, Two columns), not role-specific ones (Quote, Agenda, Takeaways).
 * Each entry maps a user-facing label + preview kind to the underlying
 * card-engine blockTemplate id.
 */
'use client';

export const LAYOUT_PICKS: ReadonlyArray<{
  id: string;
  label: string;
  desc: string;
  blockTemplate: string;
}> = [
  { id: 'header',    label: 'Header',         desc: 'Large title, optional subtitle.',                       blockTemplate: 'cover-subtitle' },
  { id: 'text',      label: 'Text',           desc: 'Heading with a paragraph of body text.',                blockTemplate: 'paragraph-content' },
  { id: 'bullets',   label: 'Bullets',        desc: 'Bulleted list of items.',                               blockTemplate: 'bullet-list' },
  { id: 'numbers',   label: 'Numbers',        desc: 'Three big numbers with captions.',                      blockTemplate: 'key-metric-trio' },
  { id: 'twocol',    label: 'Two columns',    desc: 'Two parallel columns side by side.',                    blockTemplate: 'comparison-2col' },
  { id: 'threecol',  label: 'Three columns',  desc: 'Three parallel columns side by side.',                  blockTemplate: 'grid-1x3' },
  { id: 'table',     label: 'Table',          desc: 'Grid of cells with rows and columns.',                  blockTemplate: 'grid-2x2' },
  { id: 'icongrid',  label: 'Icon grid',      desc: 'Icons with headings and short descriptions.',           blockTemplate: 'features-grid' },
  { id: 'timeline',  label: 'Timeline',       desc: 'Sequential steps or phases.',                           blockTemplate: 'timeline' },
  { id: 'imagetext', label: 'Image + text',   desc: 'Image on one side, text on the other.',                 blockTemplate: 'hero-title' },
] as const;

/** Tiny inline SVG preview for each pickable layout. ~16:9. Monochrome
 *  (violet on white) so they age well across themes. */
export function LayoutPreview({ kind }: { kind: string }) {
  const a = '#6B3FA0';
  const m = 'rgba(15, 23, 42, 0.20)';
  switch (kind) {
    case 'header':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="30" y="34" width="100" height="9" rx="2" fill={a} />
          <rect x="42" y="50" width="76" height="4" rx="1" fill={m} />
        </svg>
      );
    case 'text':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="11" width="60" height="6" rx="1.5" fill={a} />
          {[0,1,2,3,4].map(i => <rect key={i} x="14" y={28 + i*9} width={[140,128,134,118,90][i]} height="3" rx="1" fill={m} />)}
        </svg>
      );
    case 'bullets':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="11" width="58" height="6" rx="1.5" fill={a} />
          {[0,1,2,3].map(i => (
            <g key={i}>
              <circle cx="18" cy={32 + i*12} r="1.8" fill={a} />
              <rect x="24" y={30 + i*12} width={[120, 108, 116, 96][i]} height="3" rx="1" fill={m} />
            </g>
          ))}
        </svg>
      );
    case 'numbers':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="9" width="58" height="6" rx="1.5" fill={a} />
          {[0,1,2].map(i => {
            const x = 14 + i * 46;
            return (
              <g key={i}>
                <text x={x + 16} y="50" fontSize="16" fontWeight="700" fill={a} textAnchor="middle">42%</text>
                <rect x={x + 4} y="60" width="28" height="2.5" rx="0.5" fill={m} />
                <rect x={x + 4} y="66" width="22" height="2.5" rx="0.5" fill={m} />
              </g>
            );
          })}
        </svg>
      );
    case 'twocol':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="9" width="58" height="6" rx="1.5" fill={a} />
          {[0, 1].map(i => {
            const x = 14 + i * 70;
            return (
              <g key={i}>
                <rect x={x} y="24" width="62" height="54" rx="3" fill={a} fillOpacity="0.08" stroke={a} strokeOpacity="0.30" strokeWidth="0.5" />
                <rect x={x + 6} y="30" width="40" height="4" rx="1" fill={a} />
                <rect x={x + 6} y="42" width="50" height="2.5" rx="0.5" fill={m} />
                <rect x={x + 6} y="48" width="44" height="2.5" rx="0.5" fill={m} />
                <rect x={x + 6} y="54" width="48" height="2.5" rx="0.5" fill={m} />
                <rect x={x + 6} y="60" width="38" height="2.5" rx="0.5" fill={m} />
              </g>
            );
          })}
        </svg>
      );
    case 'threecol':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="9" width="58" height="6" rx="1.5" fill={a} />
          {[0, 1, 2].map(i => {
            const x = 14 + i * 46;
            return (
              <g key={i}>
                <rect x={x} y="24" width="40" height="54" rx="3" fill={a} fillOpacity="0.08" stroke={a} strokeOpacity="0.30" strokeWidth="0.5" />
                <rect x={x + 4} y="30" width="28" height="4" rx="1" fill={a} />
                <rect x={x + 4} y="42" width="32" height="2.5" rx="0.5" fill={m} />
                <rect x={x + 4} y="48" width="28" height="2.5" rx="0.5" fill={m} />
                <rect x={x + 4} y="54" width="30" height="2.5" rx="0.5" fill={m} />
              </g>
            );
          })}
        </svg>
      );
    case 'table':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="9" width="58" height="6" rx="1.5" fill={a} />
          {[0,1,2,3].map(r => (
            [0,1,2].map(c => (
              <rect key={`${r}-${c}`}
                x={16 + c * 44}
                y={26 + r * 12}
                width="42" height="10"
                fill={r === 0 ? a : 'transparent'} fillOpacity={r === 0 ? 0.18 : 1}
                stroke={a} strokeOpacity="0.30" strokeWidth="0.6" />
            ))
          ))}
        </svg>
      );
    case 'icongrid':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="9" width="58" height="6" rx="1.5" fill={a} />
          {[[14, 24], [86, 24], [14, 54], [86, 54]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x + 8} cy={(y as number) + 7} r="4" fill={a} fillOpacity="0.30" />
              <rect x={x + 18} y={(y as number) + 4} width="40" height="3" rx="1" fill={a} />
              <rect x={x + 18} y={(y as number) + 10} width="46" height="2" rx="0.5" fill={m} />
              <rect x={x + 18} y={(y as number) + 15} width="36" height="2" rx="0.5" fill={m} />
            </g>
          ))}
        </svg>
      );
    case 'timeline':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="9" width="58" height="6" rx="1.5" fill={a} />
          {[0,1,2,3].map(i => (
            <g key={i}>
              <circle cx="20" cy={28 + i*13} r="3.5" fill={a} />
              {i < 3 && <line x1="20" y1={32 + i*13} x2="20" y2={37 + i*13} stroke={a} strokeOpacity="0.4" strokeWidth="1.5" />}
              <rect x="32" y={26 + i*13} width="46" height="3" rx="1" fill={a} fillOpacity="0.6" />
              <rect x="32" y={31 + i*13} width="80" height="2" rx="0.5" fill={m} />
            </g>
          ))}
        </svg>
      );
    case 'imagetext':
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="6" y="6" width="62" height="78" rx="3" fill={a} fillOpacity="0.10" stroke={a} strokeOpacity="0.30" strokeWidth="0.5" strokeDasharray="2 2" />
          <circle cx="22" cy="34" r="4" fill={a} fillOpacity="0.40" />
          <polyline points="14,50 26,38 36,46 46,38 54,46 54,58 14,58" fill={a} fillOpacity="0.20" />
          <rect x="78" y="14" width="64" height="6" rx="1.5" fill={a} />
          <rect x="78" y="28" width="72" height="3" rx="1" fill={m} />
          <rect x="78" y="35" width="64" height="3" rx="1" fill={m} />
          <rect x="78" y="42" width="68" height="3" rx="1" fill={m} />
          <rect x="78" y="49" width="58" height="3" rx="1" fill={m} />
        </svg>
      );
    default:
      return (
        <svg width="100%" height="100%" viewBox="0 0 160 90" aria-hidden>
          <rect x="14" y="11" width="58" height="6" rx="1.5" fill={a} />
          {[0,1,2,3].map(i => <rect key={i} x="14" y={28 + i*8} width={[140,128,134,108][i]} height="3" rx="1" fill={m} />)}
        </svg>
      );
  }
}
