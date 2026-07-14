'use client';

// ── Shared image-generation engine — ReferenceUpload ───────────────────────
//
// Optional style-ref + composition-ref image attach. Raster only (rejects
// SVG), 4MB cap, returns data URLs to the caller. Progressive: collapsed
// behind a "Add reference image" disclosure by default (advanced control).
//
// Errors surface inline (never alert()). On-palette chrome.

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, X, ChevronDown } from 'lucide-react';

const PURPLE = '#6B3FA0';
const MAX_BYTES = 4 * 1024 * 1024;

export interface ReferenceUploadProps {
  styleRef: string | null;
  compositionRef: string | null;
  onStyleRefChange: (dataUrl: string | null) => void;
  onCompositionRefChange: (dataUrl: string | null) => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function RefSlot({
  label,
  hint,
  value,
  onChange,
  onError,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (v: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      onError(null);
      if (!file) return;
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        onError('SVG references are not supported — use a JPG or PNG.');
        return;
      }
      if (!file.type.startsWith('image/')) {
        onError('That file is not an image.');
        return;
      }
      if (file.size > MAX_BYTES) {
        onError('That image is over 4 MB — pick a smaller one.');
        return;
      }
      try {
        onChange(await readAsDataUrl(file));
      } catch {
        onError('Could not read that file.');
      }
    },
    [onChange, onError],
  );

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
        {label}
      </div>
      {value ? (
        <div
          style={{
            position: 'relative',
            borderRadius: 10,
            overflow: 'hidden',
            border: `1.5px solid ${PURPLE}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={`${label} preview`}
            style={{ display: 'block', width: '100%', height: 88, objectFit: 'cover' }}
          />
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => onChange(null)}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              border: 'none',
              borderRadius: 8,
              background: 'rgba(15,23,42,0.55)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            minHeight: 44,
            padding: '10px 12px',
            border: '1.5px dashed #cbd5e1',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.7)',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            color: '#475569',
            cursor: 'pointer',
          }}
        >
          <ImagePlus size={16} aria-hidden="true" color={PURPLE} />
          {hint}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

export function ReferenceUpload({
  styleRef,
  compositionRef,
  onStyleRefChange,
  onCompositionRefChange,
}: ReferenceUploadProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minHeight: 44,
          padding: '0 4px',
          border: 'none',
          background: 'none',
          font: 'inherit',
          fontSize: 14,
          fontWeight: 600,
          color: '#334155',
          cursor: 'pointer',
        }}
      >
        <ImagePlus size={15} aria-hidden="true" color={PURPLE} />
        Reference image (optional)
        <ChevronDown
          size={16}
          aria-hidden="true"
          color="#94a3b8"
          style={{
            marginLeft: 'auto',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms ease',
          }}
        />
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
          <RefSlot
            label="Style reference"
            hint="Match the look of an image"
            value={styleRef}
            onChange={onStyleRefChange}
            onError={setError}
          />
          <RefSlot
            label="Composition reference"
            hint="Match the layout of an image"
            value={compositionRef}
            onChange={onCompositionRefChange}
            onError={setError}
          />
          {error && (
            <p role="alert" style={{ fontSize: 14, color: '#b91c1c', margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
