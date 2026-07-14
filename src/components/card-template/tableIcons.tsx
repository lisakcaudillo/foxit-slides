// Shared row/column insert icons — a "+" on the edge where the new row/column
// lands (above / below / left / right), over a small table glyph. Used by the
// freeform table toolbar AND the chart data-grid so the two read identically.
import type { ReactElement } from 'react';

export function TblIcon({ size = 15, plus, body, divider }: {
  size?: number;
  plus: [number, number];
  body: [number, number, number, number];
  divider: [number, number, number, number];
}): ReactElement {
  const [px, py] = plus; const [bx, by, bw, bh] = body; const [d1, d2, d3, d4] = divider;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x={bx} y={by} width={bw} height={bh} rx={1.5} />
      <line x1={d1} y1={d2} x2={d3} y2={d4} />
      <line x1={px - 2.5} y1={py} x2={px + 2.5} y2={py} />
      <line x1={px} y1={py - 2.5} x2={px} y2={py + 2.5} />
    </svg>
  );
}

export const IcRowAbove = (p: { size?: number }) => <TblIcon {...p} plus={[12, 4]} body={[4, 9.5, 16, 10.5]} divider={[4, 14.5, 20, 14.5]} />;
export const IcRowBelow = (p: { size?: number }) => <TblIcon {...p} plus={[12, 20]} body={[4, 4, 16, 10.5]} divider={[4, 9, 20, 9]} />;
export const IcColLeft = (p: { size?: number }) => <TblIcon {...p} plus={[4, 12]} body={[9.5, 4, 10.5, 16]} divider={[15, 4, 15, 20]} />;
export const IcColRight = (p: { size?: number }) => <TblIcon {...p} plus={[20, 12]} body={[4, 4, 10.5, 16]} divider={[9, 4, 9, 20]} />;

// Delete icons — a neutral table glyph with ONE target row/column tinted red and a
// red "−" on it, so it reads as "remove THIS one" (not all rows/columns). Mirrors
// the insert glyphs (which put a "+" on an edge).
const SLATE = '#64748B', RED = '#C0392B';
export function IcRowDelete({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <rect x={4} y={5} width={16} height={14} rx={1.5} stroke={SLATE} strokeWidth={1.6} />
      <line x1={4} y1={9.5} x2={20} y2={9.5} stroke={SLATE} strokeWidth={1.3} />
      <line x1={4} y1={14.5} x2={20} y2={14.5} stroke={SLATE} strokeWidth={1.3} />
      <rect x={4.8} y={9.9} width={14.4} height={4.2} fill={RED} opacity={0.16} />
      <line x1={9.6} y1={12} x2={14.4} y2={12} stroke={RED} strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}
export function IcColDelete({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <rect x={5} y={4} width={14} height={16} rx={1.5} stroke={SLATE} strokeWidth={1.6} />
      <line x1={9.5} y1={4} x2={9.5} y2={20} stroke={SLATE} strokeWidth={1.3} />
      <line x1={14.5} y1={4} x2={14.5} y2={20} stroke={SLATE} strokeWidth={1.3} />
      <rect x={9.9} y={4.8} width={4.2} height={14.4} fill={RED} opacity={0.16} />
      <line x1={9.9} y1={12} x2={14.1} y2={12} stroke={RED} strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}
