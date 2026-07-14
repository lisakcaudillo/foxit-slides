'use client';

export default function DividerBlock({ invertColors }: { invertColors?: boolean }) {
  return (
    <hr
      style={{
        border: 'none',
        height: '1px',
        background: invertColors ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
        margin: '0.75rem 0',
      }}
    />
  );
}
