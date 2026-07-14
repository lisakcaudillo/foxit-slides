'use client';

import { useState } from 'react';
import {
  RotateCcw,
  RotateCw,
  ChevronDown,
  Download,
  Copy,
  Image as ImageIcon,
} from 'lucide-react';

// ── Top status chrome (40px) ──────────────────────────────────────────────
//
// Compose-equivalent of the Microsoft Designer top bar. Sits above Toolbar 3
// inside /editor/graphics. Save status, undo/redo, zoom dropdown, copy as
// image, download, avatar. Undo/Redo and Copy/Download are placeholders for
// step 6 wiring.

const ZOOM_OPTIONS = ['25%', '50%', '75%', '100%', 'Fit'];

interface TopChromeProps {
  saveStatus?: string;
  zoom?: string;
  onZoomChange?: (zoom: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
}

export default function TopChrome({
  saveStatus = 'No changes to save',
  zoom = '100%',
  onZoomChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onCopy,
  onDownload,
}: TopChromeProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <header
      style={{
        height: '44px',
        background: '#fff',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: '10px',
        flexShrink: 0,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Brand mark + project label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 600,
          fontSize: '14px',
          color: '#1a1f36',
        }}
      >
        <span
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #6B3FA0, #8B5CF6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          <ImageIcon size={14} />
        </span>
        Image
      </div>

      <span
        style={{
          fontSize: '12px',
          color: '#697386',
          marginLeft: '4px',
        }}
      >
        {saveStatus}
      </span>

      <div style={{ width: '1px', height: '20px', background: 'rgba(0,0,0,0.08)', margin: '0 4px' }} />

      {/* Undo / Redo */}
      <IconBtn
        title="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        icon={<RotateCcw size={14} />}
      />
      <IconBtn
        title="Redo"
        onClick={onRedo}
        disabled={!canRedo}
        icon={<RotateCw size={14} />}
      />

      <div style={{ flex: 1 }} />

      {/* Zoom dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setZoomOpen((v) => !v)}
          style={{
            background: 'none',
            border: '1px solid rgba(0,0,0,0.10)',
            borderRadius: '6px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#1a1f36',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'inherit',
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = 'none')
          }
        >
          {zoom}
          <ChevronDown size={12} />
        </button>
        {zoomOpen && (
          <>
            <div
              onClick={() => setZoomOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            />
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '8px',
                boxShadow: '0 8px 20px rgba(0,0,0,0.10)',
                minWidth: '120px',
                zIndex: 41,
                overflow: 'hidden',
              }}
            >
              {ZOOM_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onZoomChange?.(opt);
                    setZoomOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 14px',
                    background: opt === zoom ? 'rgba(107,63,160,0.08)' : 'none',
                    color: opt === zoom ? '#6B3FA0' : '#1a1f36',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontWeight: opt === zoom ? 600 : 500,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    if (opt !== zoom)
                      e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (opt !== zoom)
                      e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Copy / Download */}
      <IconBtn
        title="Copy as image"
        onClick={onCopy}
        icon={<Copy size={14} />}
      />
      <button
        type="button"
        onClick={onDownload}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: '1px solid rgba(0,0,0,0.10)',
          borderRadius: '8px',
          padding: '5px 12px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          color: '#1a1f36',
          fontFamily: 'inherit',
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = 'none')
        }
      >
        <Download size={14} />
        Download
      </button>

      {/* Avatar (initials) */}
      <button
        type="button"
        title="Account"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #6B3FA0, #8B5CF6)',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.5px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        LC
      </button>
    </header>
  );
}

function IconBtn({
  title,
  onClick,
  icon,
  disabled,
}: {
  title: string;
  onClick?: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: '5px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: disabled ? 'rgba(71,85,105,0.35)' : '#475569',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      {icon}
    </button>
  );
}
