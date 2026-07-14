'use client';

import {
  Edit3,
  Type,
  Image as ImageIcon,
  Wand2,
  Pencil,
  Layers,
} from 'lucide-react';

// ── Vertical icon rail (52px wide) ────────────────────────────────────────
//
// Sits between the Compose-level NavBar and the left panel inside the image
// editor. Six tabs: Edit / Text / My media / Visuals / Markup / Layers.
// Layers is visually separated by a thin divider.

export type RailTab =
  | 'edit'
  | 'text'
  | 'my-media'
  | 'visuals'
  | 'markup'
  | 'layers';

interface IconRailProps {
  active: RailTab;
  onChange: (tab: RailTab) => void;
}

const TABS: { id: RailTab; label: string; icon: React.ReactNode }[] = [
  { id: 'edit', label: 'Edit', icon: <Edit3 size={18} /> },
  { id: 'text', label: 'Text', icon: <Type size={18} /> },
  { id: 'my-media', label: 'My media', icon: <ImageIcon size={18} /> },
  { id: 'visuals', label: 'Visuals', icon: <Wand2 size={18} /> },
  { id: 'markup', label: 'Markup', icon: <Pencil size={18} /> },
];

export default function IconRail({ active, onChange }: IconRailProps) {
  return (
    <nav
      style={{
        width: '56px',
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        gap: '2px',
      }}
    >
      {TABS.map((tab) => (
        <RailButton
          key={tab.id}
          active={active === tab.id}
          onClick={() => onChange(tab.id)}
          icon={tab.icon}
          label={tab.label}
        />
      ))}

      {/* Separator */}
      <div
        style={{
          width: '32px',
          height: '1px',
          background: 'rgba(0,0,0,0.08)',
          margin: '6px 0',
        }}
      />

      <RailButton
        active={active === 'layers'}
        onClick={() => onChange('layers')}
        icon={<Layers size={18} />}
        label="Layers"
      />
    </nav>
  );
}

function RailButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        width: '46px',
        minHeight: '46px',
        border: 'none',
        borderRadius: '8px',
        background: active ? 'rgba(107,63,160,0.10)' : 'transparent',
        color: active ? '#6B3FA0' : '#475569',
        cursor: 'pointer',
        fontSize: '10px',
        fontWeight: active ? 600 : 500,
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'all 150ms ease',
        padding: '4px 2px',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
