'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, FileDown, Droplets, EyeOff, Lock, PenTool } from 'lucide-react';

interface FoxitToolModalsProps {
  activeModal: 'redact' | 'watermark' | 'protect' | 'export' | 'sign' | null;
  onClose: () => void;
  onSubmit: (tool: string, params: Record<string, unknown>) => void;
  documentTitle?: string;
}

/* ------------------------------------------------------------------ */
/*  Shared primitives                                                  */
/* ------------------------------------------------------------------ */

const labelClass = 'block text-sm font-medium text-slate-700 mb-1';
const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 outline-none transition-colors';
const submitClass =
  'bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors';
const cancelClass =
  'text-slate-500 hover:text-slate-700 rounded-lg px-4 py-2 text-sm font-medium transition-colors';

function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-xs text-red-600 mt-1">{msg}</p>;
}

function ModalShell({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-violet-50 flex items-center justify-center">
              {icon}
            </div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            <X className="size-4 text-slate-500" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export PDF                                                         */
/* ------------------------------------------------------------------ */

function ExportModal({
  onClose,
  onSubmit,
  documentTitle,
}: {
  onClose: () => void;
  onSubmit: FoxitToolModalsProps['onSubmit'];
  documentTitle?: string;
}) {
  const [name, setName] = useState(documentTitle ?? '');
  const [quality, setQuality] = useState<'standard' | 'high' | 'print'>('standard');
  const [flatten, setFlatten] = useState(false);

  const handleSubmit = () => {
    onSubmit('export', { name: name || 'Untitled', quality, flattenAnnotations: flatten });
  };

  return (
    <ModalShell title="Export PDF" icon={<FileDown className="size-4 text-violet-600" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Document Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled" />
        </div>

        <div>
          <label className={labelClass}>Quality</label>
          <select className={inputClass} value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="standard">Standard</option>
            <option value="high">High</option>
            <option value="print">Print</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => setFlatten(e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-400"
          />
          <span className="text-sm text-slate-700">Flatten annotations</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className={cancelClass} onClick={onClose}>Cancel</button>
          <button className={submitClass} onClick={handleSubmit}>Export PDF</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Watermark                                                          */
/* ------------------------------------------------------------------ */

function WatermarkModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: FoxitToolModalsProps['onSubmit'];
}) {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(30);
  const [rotation, setRotation] = useState(-45);
  const [position, setPosition] = useState<string>('center');
  const [color, setColor] = useState('#999999');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!text.trim()) {
      setError('Watermark text is required');
      return;
    }
    setError(null);
    onSubmit('watermark', { text: text.trim(), fontSize, opacity, rotation, position, color });
  };

  return (
    <ModalShell title="Watermark" icon={<Droplets className="size-4 text-violet-600" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Text</label>
          <input
            className={inputClass}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder="CONFIDENTIAL"
          />
          <ErrorMsg msg={error} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Font Size</label>
            <input
              type="number"
              className={inputClass}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              min={8}
              max={200}
            />
          </div>
          <div>
            <label className={labelClass}>Rotation (°)</label>
            <input
              type="number"
              className={inputClass}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              min={-180}
              max={180}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Opacity ({opacity}%)</label>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full accent-violet-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Position</label>
            <select className={inputClass} value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="center">Center</option>
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Color</label>
            <input
              className={inputClass}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#999999"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className={cancelClass} onClick={onClose}>Cancel</button>
          <button className={submitClass} onClick={handleSubmit}>Apply Watermark</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Redact                                                             */
/* ------------------------------------------------------------------ */

function RedactModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: FoxitToolModalsProps['onSubmit'];
}) {
  const [text, setText] = useState('');
  const [fillColor, setFillColor] = useState('#000000');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!text.trim()) {
      setError('Text to redact is required');
      return;
    }
    setError(null);
    onSubmit('redact', { text: text.trim(), fillColor });
  };

  return (
    <ModalShell title="Redact" icon={<EyeOff className="size-4 text-violet-600" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Text to Redact</label>
          <input
            className={inputClass}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder="Enter text to redact…"
          />
          <ErrorMsg msg={error} />
        </div>

        <div>
          <label className={labelClass}>Fill Color</label>
          <input
            className={inputClass}
            value={fillColor}
            onChange={(e) => setFillColor(e.target.value)}
            placeholder="#000000"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className={cancelClass} onClick={onClose}>Cancel</button>
          <button className={submitClass} onClick={handleSubmit}>Redact Text</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Protect                                                            */
/* ------------------------------------------------------------------ */

function ProtectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: FoxitToolModalsProps['onSubmit'];
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [encryption, setEncryption] = useState<'128-bit AES' | '256-bit AES'>('256-bit AES');
  const [permissions, setPermissions] = useState({
    print: true,
    copy: true,
    edit: true,
    annotate: true,
  });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  const togglePerm = (key: keyof typeof permissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = () => {
    const errs: typeof errors = {};
    if (password.length < 4) errs.password = 'Password must be at least 4 characters';
    if (password !== confirm) errs.confirm = 'Passwords do not match';
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    onSubmit('protect', { password, encryption, permissions });
  };

  return (
    <ModalShell title="Protect Document" icon={<Lock className="size-4 text-violet-600" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Password</label>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
            placeholder="Enter password"
          />
          <ErrorMsg msg={errors.password ?? null} />
        </div>

        <div>
          <label className={labelClass}>Confirm Password</label>
          <input
            type="password"
            className={inputClass}
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
            placeholder="Confirm password"
          />
          <ErrorMsg msg={errors.confirm ?? null} />
        </div>

        <div>
          <label className={labelClass}>Encryption</label>
          <select
            className={inputClass}
            value={encryption}
            onChange={(e) => setEncryption(e.target.value as typeof encryption)}
          >
            <option value="128-bit AES">128-bit AES</option>
            <option value="256-bit AES">256-bit AES</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Permissions</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {(Object.keys(permissions) as Array<keyof typeof permissions>).map((key) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permissions[key]}
                  onChange={() => togglePerm(key)}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                />
                <span className="text-sm text-slate-700 capitalize">{key}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className={cancelClass} onClick={onClose}>Cancel</button>
          <button className={submitClass} onClick={handleSubmit}>Protect Document</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Digital Signature                                                  */
/* ------------------------------------------------------------------ */

function SignModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: FoxitToolModalsProps['onSubmit'];
}) {
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(0);

  const handleSubmit = () => {
    onSubmit('sign', { reason, location, page });
  };

  return (
    <ModalShell title="Digital Signature" icon={<PenTool className="size-4 text-violet-600" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Reason</label>
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Document approval"
          />
        </div>

        <div>
          <label className={labelClass}>Location</label>
          <input
            className={inputClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="San Francisco, CA"
          />
        </div>

        <div>
          <label className={labelClass}>Page</label>
          <input
            type="number"
            className={inputClass}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            min={0}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className={cancelClass} onClick={onClose}>Cancel</button>
          <button className={submitClass} onClick={handleSubmit}>Add Signature</button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Root component                                                     */
/* ------------------------------------------------------------------ */

export function FoxitToolModals({ activeModal, onClose, onSubmit, documentTitle }: FoxitToolModalsProps) {
  // Stabilize onClose for Escape listener
  const stableClose = useCallback(() => onClose(), [onClose]);

  if (!activeModal) return null;

  switch (activeModal) {
    case 'export':
      return <ExportModal onClose={stableClose} onSubmit={onSubmit} documentTitle={documentTitle} />;
    case 'watermark':
      return <WatermarkModal onClose={stableClose} onSubmit={onSubmit} />;
    case 'redact':
      return <RedactModal onClose={stableClose} onSubmit={onSubmit} />;
    case 'protect':
      return <ProtectModal onClose={stableClose} onSubmit={onSubmit} />;
    case 'sign':
      return <SignModal onClose={stableClose} onSubmit={onSubmit} />;
    default:
      return null;
  }
}
