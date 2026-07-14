'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  ExternalLink, Trash2, Copy, Pencil, Unlink, X, ChevronDown, Search,
  Link2, LayoutTemplate, Download, UploadCloud, RefreshCw, ArrowRight,
} from 'lucide-react';
import type { LinkTarget } from '@/types/card-template';

const VIOLET = '#6b3fa0';
const LINK_BLUE = '#2563eb';
/** Uploaded files are embedded as data: URLs in the deck (localStorage), so cap
 *  the size — bigger files should be hosted and linked by URL instead. */
export const MAX_UPLOAD_BYTES = 1_500_000; // ~1.5 MB

export interface DeckSlideRef {
  id: string;
  /** 0-based position in the deck. */
  index: number;
  title: string;
}

/** Parse a (possibly scheme-less) URL into a host + path. Returns null when it
 *  can't be understood yet (mid-typing). */
export function parseLinkPreview(raw: string): { host: string; path: string; kind: 'web' | 'mail' | 'tel' } | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^mailto:/i.test(v)) return { host: v.replace(/^mailto:/i, ''), path: '', kind: 'mail' };
  if (/^tel:/i.test(v)) return { host: v.replace(/^tel:/i, ''), path: '', kind: 'tel' };
  const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(normalized);
    if (!u.hostname.includes('.')) return null;
    const path = (u.pathname + u.search).replace(/\/$/, '');
    return { host: u.hostname.replace(/^www\./, ''), path: path === '' ? '' : path, kind: 'web' };
  } catch {
    return null;
  }
}

/** Normalise a raw URL for storage: prepend https:// when there's no scheme.
 *  data: URLs (uploaded files) pass through untouched. */
export function normalizeLinkUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^(https?:\/\/|mailto:|tel:|data:)/i.test(v)) return v;
  return `https://${v}`;
}

/** File name (last path segment) inferred from a URL, for the download label. */
export function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const tail = u.pathname.split('/').filter(Boolean).pop();
    return tail ? decodeURIComponent(tail) : u.hostname;
  } catch {
    return url.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? url;
  }
}

/** Drop the extension from a file name (`pricing-2026.pdf` → `pricing-2026`). */
export function fileBaseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/** Uppercase extension for the format badge (`pricing-2026.pdf` → `PDF`). */
export function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toUpperCase() : 'FILE';
}

/** Badge colours per common file family (bg, ink). */
function badgeColors(ext: string): { bg: string; ink: string } {
  const e = ext.toLowerCase();
  if (e === 'pdf') return { bg: '#fdecec', ink: '#d64545' };
  if (['doc', 'docx', 'rtf', 'txt', 'md'].includes(e)) return { bg: '#e8f0fe', ink: '#2563eb' };
  if (['xls', 'xlsx', 'csv'].includes(e)) return { bg: '#e7f6ec', ink: '#15803d' };
  if (['ppt', 'pptx', 'key'].includes(e)) return { bg: '#fdeede', ink: '#c2620e' };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return { bg: '#eef1f5', ink: '#475569' };
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(e)) return { bg: '#f5f0fb', ink: VIOLET };
  return { bg: '#eef1f5', ink: '#475569' };
}

/** Short, human display of a URL (drop scheme + www., trim long paths). */
export function displayLinkUrl(href: string): string {
  let s = href.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (/^mailto:/i.test(href)) s = href.replace(/^mailto:/i, '');
  if (s.length > 42) s = `${s.slice(0, 40)}…`;
  return s;
}

/** A little file-format badge used in the editor + the hover bubble. */
function FileBadge({ ext }: { ext: string }) {
  const c = badgeColors(ext);
  return (
    <span style={{
      flex: 'none', height: 16, padding: '0 4px', borderRadius: 3, background: c.bg, color: c.ink,
      fontSize: 9, fontWeight: 800, letterSpacing: '.04em', display: 'inline-flex', alignItems: 'center',
    }}>{ext}</span>
  );
}

type Kind = 'url' | 'slide' | 'download';
const TYPE_OPTIONS: { kind: Kind; label: string; icon: typeof Link2 }[] = [
  { kind: 'url', label: 'URL', icon: Link2 },
  { kind: 'slide', label: 'Slide', icon: LayoutTemplate },
  { kind: 'download', label: 'Download', icon: Download },
];

export interface LinkEditorProps {
  /** Viewport rect of the selected words — the panel anchors just below it. */
  anchorRect: { top: number; bottom: number; left: number; width: number };
  scrollContainer: HTMLElement | null;
  /** The existing link (when editing), or undefined for a new link. */
  initial?: LinkTarget;
  isEdit: boolean;
  /** Every slide in the deck, for the Slide picker + labels. */
  deckSlides: DeckSlideRef[];
  /** The slide being edited — excluded from the picker (no self-link). */
  currentSlideId?: string;
  onSave: (target: LinkTarget) => void;
  onRemove: () => void;
  onCancel: () => void;
}

/**
 * Link editor with a compact type prefix (URL · Slide · Download). The link
 * applies to the already-selected characters — there's no separate "text"
 * field. Slide picks come from a searchable list; Download uploads a small file
 * (embedded as a data: URL) or takes a hosted link. Portaled + anchored under
 * the selection, which the caller snapshots before this panel takes focus.
 */
export function LinkEditor({
  anchorRect, scrollContainer, initial, isEdit, deckSlides, currentSlideId, onSave, onRemove, onCancel,
}: LinkEditorProps) {
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'url');
  const [urlValue, setUrlValue] = useState(initial?.kind === 'url' ? initial.value : '');
  const [slideId, setSlideId] = useState(initial?.kind === 'slide' ? initial.value : '');
  const [fileValue, setFileValue] = useState(initial?.kind === 'download' ? initial.value : '');
  const [fileName, setFileName] = useState(initial?.kind === 'download' ? (initial.fileName ?? fileNameFromUrl(initial.value)) : '');
  const [downloadUrlMode, setDownloadUrlMode] = useState(false); // "paste a link" instead of upload
  const [touched, setTouched] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [typeMenu, setTypeMenu] = useState(false);
  const [slideMenu, setSlideMenu] = useState(false);
  const [slideFilter, setSlideFilter] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const slideFilterRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const WIDTH = 272;
  // Rough panel heights per state, so the anchor flips above correctly.
  const estHeight = kind === 'slide'
    ? 300
    : kind === 'download'
      ? (fileValue ? 132 : (downloadUrlMode ? 120 : 156))
      : 96;

  const slides = useMemo(
    () => deckSlides.filter((s) => s.id !== currentSlideId),
    [deckSlides, currentSlideId],
  );
  const filteredSlides = useMemo(() => {
    const q = slideFilter.trim().toLowerCase();
    if (!q) return slides;
    return slides.filter((s) => String(s.index + 1).startsWith(q) || s.title.toLowerCase().includes(q));
  }, [slides, slideFilter]);
  const selectedSlide = slides.find((s) => s.id === slideId);

  // Anchor below the selection, flipping above when there's no room.
  useLayoutEffect(() => {
    const place = () => {
      const gap = 8;
      const belowTop = anchorRect.bottom + gap;
      const flip = belowTop + estHeight > window.innerHeight - 8;
      const top = flip ? anchorRect.top - estHeight - gap : belowTop;
      let left = anchorRect.left + anchorRect.width / 2 - WIDTH / 2;
      left = Math.max(10, Math.min(left, window.innerWidth - WIDTH - 10));
      setPos({ top: Math.max(8, top), left });
    };
    place();
    const target: EventTarget = scrollContainer ?? window;
    target.addEventListener('scroll', place, { passive: true });
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      target.removeEventListener('scroll', place);
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [anchorRect, scrollContainer, estHeight]);

  // Focus the active kind's primary input once placed.
  const focusedRef = useRef(false);
  useLayoutEffect(() => {
    if (pos && !focusedRef.current) {
      focusedRef.current = true;
      if (kind === 'url' || (kind === 'download' && downloadUrlMode)) {
        urlRef.current?.focus();
        urlRef.current?.select();
      }
    }
  }, [pos, kind, downloadUrlMode]);

  // Outside pointer-down cancels (menus render inside root, so they don't trip it).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onCancel]);

  const urlPreview = parseLinkPreview(kind === 'download' ? fileValue : urlValue);
  const urlInvalid = touched && kind === 'url' && !!urlValue.trim() && !urlPreview;

  const canSave = kind === 'url'
    ? !!parseLinkPreview(urlValue)
    : kind === 'slide'
      ? !!slideId
      : !!fileValue; // download: an uploaded data: URL or a hosted link

  const buildTarget = (): LinkTarget | null => {
    if (kind === 'url') {
      if (!urlValue.trim()) return null;
      return { kind: 'url', value: normalizeLinkUrl(urlValue) };
    }
    if (kind === 'slide') {
      if (!slideId) return null;
      return { kind: 'slide', value: slideId };
    }
    if (!fileValue) return null;
    const value = fileValue.startsWith('data:') ? fileValue : normalizeLinkUrl(fileValue);
    const name = fileName || fileNameFromUrl(value);
    return { kind: 'download', value, ...(name ? { fileName: name } : {}) };
  };

  const save = () => {
    const t = buildTarget();
    if (t) onSave(t);
  };

  const pickFile = (file: File) => {
    setUploadError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`That file is ${(file.size / 1e6).toFixed(1)} MB — max ${(MAX_UPLOAD_BYTES / 1e6).toFixed(1)} MB. Host it and paste a link instead.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileValue(typeof reader.result === 'string' ? reader.result : '');
      setFileName(file.name);
      setDownloadUrlMode(false);
    };
    reader.readAsDataURL(file);
  };

  if (!pos || typeof document === 'undefined') return null;

  const panel: CSSProperties = {
    position: 'fixed', top: pos.top, left: pos.left, width: WIDTH, zIndex: 2147483001,
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    boxShadow: '0 8px 24px rgba(15,23,42,0.14)', padding: '8px 10px 10px',
    display: 'flex', flexDirection: 'column', gap: 8,
    fontFamily: 'Inter, system-ui, sans-serif', color: '#1a1f36',
  };
  const groupStyle: CSSProperties = {
    height: 32, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
    display: 'flex', alignItems: 'center',
  };
  const prefixBtn: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 9px',
    fontSize: 12.5, fontWeight: 600, color: '#1a1f36', cursor: 'pointer', whiteSpace: 'nowrap',
    background: 'transparent', border: 'none', borderRadius: 7,
  };
  const menuStyle: CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 156, zIndex: 5,
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
    boxShadow: '0 4px 12px rgba(15,23,42,0.10)', padding: 4,
  };
  const ActiveIcon = TYPE_OPTIONS.find((t) => t.kind === kind)!.icon;

  return createPortal(
    <div
      ref={rootRef}
      data-link-editor
      style={panel}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (typeMenu) { setTypeMenu(false); return; }
          if (slideMenu) { setSlideMenu(false); return; }
          onCancel();
        }
      }}
    >
      {/* Dismiss — top-right corner */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', height: 16, margin: '-2px -3px -4px 0' }}>
        <button type="button" title="Dismiss" aria-label="Dismiss" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}
          style={{ width: 20, height: 20, borderRadius: 6, border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} />
        </button>
      </div>

      {/* Type prefix + value */}
      <div style={groupStyle}>
        <div style={{ position: 'relative' }}>
          <button type="button" style={prefixBtn} onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setTypeMenu((v) => !v); setSlideMenu(false); }}
            aria-haspopup="listbox" aria-expanded={typeMenu}>
            <ActiveIcon size={13} style={{ color: VIOLET }} />
            {TYPE_OPTIONS.find((t) => t.kind === kind)!.label}
            <ChevronDown size={11} style={{ color: '#94a3b8' }} />
          </button>
          {typeMenu && (
            <div style={menuStyle} role="listbox">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const on = opt.kind === kind;
                return (
                  <button key={opt.kind} type="button" role="option" aria-selected={on}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setKind(opt.kind);
                      setTypeMenu(false);
                      setUploadError('');
                      focusedRef.current = false; // re-focus the new kind's input
                      if (opt.kind === 'slide') setSlideMenu(true);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px',
                      borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
                      background: on ? '#f5f0fb' : 'transparent', color: on ? VIOLET : '#334155',
                    }}>
                    <Icon size={14} style={{ color: on ? VIOLET : '#64748b' }} />
                    {opt.label === 'URL' ? 'Web URL' : opt.label === 'Slide' ? 'Slide in this deck' : 'Download file'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span aria-hidden style={{ width: 1, height: 18, background: '#e2e8f0', flex: 'none' }} />

        {/* Value area — per kind */}
        {kind === 'url' && (
          <input
            ref={urlRef}
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Paste or type a link"
            aria-label="Link URL"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, color: '#334155', background: 'transparent', padding: '0 10px' }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          />
        )}

        {kind === 'slide' && (
          <button type="button" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setSlideMenu((v) => !v); setTypeMenu(false); }}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '0 10px', fontSize: 13,
              color: selectedSlide ? '#334155' : '#94a3b8' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedSlide ? `${selectedSlide.index + 1} · ${selectedSlide.title || 'Untitled slide'}` : 'Choose a slide'}
            </span>
            <ChevronDown size={12} style={{ color: '#94a3b8', flex: 'none' }} />
          </button>
        )}

        {kind === 'download' && (
          <div style={{ flex: 1, minWidth: 0, padding: '0 10px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            {fileValue
              ? <span style={{ fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || fileNameFromUrl(fileValue)}</span>
              : downloadUrlMode
                ? <input
                    ref={urlRef}
                    value={fileValue}
                    onChange={(e) => { setFileValue(e.target.value); setFileName(fileNameFromUrl(e.target.value)); }}
                    placeholder="https://…/file.pdf"
                    aria-label="File URL"
                    style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 13, color: '#334155', background: 'transparent' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                  />
                : <span style={{ fontSize: 12.5, color: '#94a3b8' }}>No file yet</span>}
          </div>
        )}
      </div>

      {/* Slide picker menu — searchable list */}
      {kind === 'slide' && slideMenu && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 12px rgba(15,23,42,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', height: 32, borderBottom: '1px solid #eef1f5' }}>
            <Search size={13} style={{ color: '#94a3b8', flex: 'none' }} />
            <input
              ref={slideFilterRef}
              autoFocus
              value={slideFilter}
              onChange={(e) => setSlideFilter(e.target.value)}
              placeholder="Jump to slide…"
              aria-label="Filter slides"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, color: '#334155', background: 'transparent', minWidth: 0 }}
            />
          </div>
          <div style={{ maxHeight: 176, overflowY: 'auto' }}>
            {filteredSlides.length === 0 && (
              <div style={{ padding: '10px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>No matching slides</div>
            )}
            {filteredSlides.map((s) => {
              const on = s.id === slideId;
              return (
                <button key={s.id} type="button" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSlideId(s.id); setSlideMenu(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 32, padding: '0 10px',
                    border: 'none', cursor: 'pointer', fontSize: 12.5, textAlign: 'left',
                    background: on ? '#f5f0fb' : 'transparent', color: on ? VIOLET : '#64748b' }}>
                  <span style={{ fontWeight: 700, width: 14, textAlign: 'right', color: on ? VIOLET : '#334155' }}>{s.index + 1}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Untitled slide'}</span>
                  {on && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: VIOLET, flex: 'none' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Download — upload zone (empty) or the format badge + name (attached) */}
      {kind === 'download' && !fileValue && !downloadUrlMode && (
        <>
          <button type="button" onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
            style={{ border: '1px dashed #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '14px 10px' }}>
            <UploadCloud size={18} style={{ color: VIOLET }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1f36' }}>Upload a file</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Drag &amp; drop, or <b style={{ color: VIOLET }}>browse</b>
            </span>
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDownloadUrlMode(true); focusedRef.current = false; }}
            style={{ alignSelf: 'center', border: 'none', background: 'transparent', color: '#64748b', fontSize: 11.5, cursor: 'pointer' }}>
            or paste a link to a hosted file
          </button>
        </>
      )}
      {kind === 'download' && fileValue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '1px 3px', fontSize: 12, color: '#64748b' }}>
          <FileBadge ext={fileExt(fileName || fileNameFromUrl(fileValue))} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileBaseName(fileName || fileNameFromUrl(fileValue))}</span>
          <button type="button" title="Replace file" aria-label="Replace file" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setFileValue(''); setFileName(''); setDownloadUrlMode(false); setUploadError(''); }}
            style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={13} />
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }} />

      {/* Problems */}
      {urlInvalid && <div style={{ fontSize: 11.5, color: '#b45309' }}>That doesn&rsquo;t look like a valid link.</div>}
      {uploadError && <div style={{ fontSize: 11.5, color: '#b45309' }}>{uploadError}</div>}

      {/* Actions — trash (remove) grouped with Save, right-aligned */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
        {isEdit && (
          <button type="button" title="Remove link" aria-label="Remove link" onMouseDown={(e) => e.preventDefault()} onClick={onRemove}
            style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={15} />
          </button>
        )}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={!canSave}
          style={{ height: 28, padding: '0 14px', borderRadius: 8, border: 'none', cursor: canSave ? 'pointer' : 'default',
            fontSize: 12.5, fontWeight: 600, background: VIOLET, color: '#fff', opacity: canSave ? 1 : 0.45 }}>
          Save
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Hover bubble over a rendered link. Names the destination by kind —
 * "Link to <url>", "Link to slide 3", or "Download <file>" — with icon-only
 * actions (Open / Go to slide / Copy / Edit / Remove). Portaled + fixed.
 */
export function LinkBubble({
  rect, target, slideLabel, onOpen, onGoToSlide, onCopy, onEdit, onRemove, onMouseEnter, onMouseLeave,
}: {
  rect: { top: number; bottom: number; left: number; width: number };
  target: LinkTarget;
  /** For a slide link: e.g. "slide 3" (resolved by the caller from the deck). */
  slideLabel?: string;
  onOpen: () => void;
  onGoToSlide: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    const w = rootRef.current?.offsetWidth ?? 240;
    const h = rootRef.current?.offsetHeight ?? 34;
    const gap = 8;
    const wantTop = rect.top - h - gap;
    const top = wantTop < 8 ? rect.bottom + gap : wantTop;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
    setPos({ top, left });
  }, [rect]);

  if (typeof document === 'undefined') return null;

  const iconBtn: CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
    color: '#64748b', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const fname = target.kind === 'download' ? (target.fileName || fileNameFromUrl(target.value)) : '';

  return createPortal(
    <div
      ref={rootRef}
      data-link-bubble
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999,
        display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px 5px 11px',
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(15,23,42,0.14)', zIndex: 2147483001,
        fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 380,
      }}
    >
      {/* Destination label */}
      <span style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {target.kind === 'url' && (
          <>
            <span style={{ color: '#94a3b8' }}>Link to</span>
            <a href={target.value} target="_blank" rel="noopener noreferrer" title={target.value}
              style={{ color: LINK_BLUE, textDecoration: 'none', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayLinkUrl(target.value)}
            </a>
          </>
        )}
        {target.kind === 'slide' && (
          <><span style={{ color: '#94a3b8' }}>Link to</span><span style={{ color: VIOLET, fontWeight: 500 }}>{slideLabel ?? 'slide'}</span></>
        )}
        {target.kind === 'download' && (
          <>
            <span style={{ color: '#94a3b8' }}>Download</span>
            <FileBadge ext={fileExt(fname)} />
            <span style={{ color: '#334155', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileBaseName(fname)}</span>
          </>
        )}
      </span>

      <span aria-hidden style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 3px' }} />

      {target.kind === 'slide' ? (
        <button type="button" title="Go to slide" aria-label="Go to slide" style={iconBtn}
          onMouseDown={(e) => e.preventDefault()} onClick={onGoToSlide}><ArrowRight size={14} /></button>
      ) : (
        <button type="button" title={target.kind === 'download' ? 'Download' : 'Open link'} aria-label={target.kind === 'download' ? 'Download' : 'Open link'} style={iconBtn}
          onMouseDown={(e) => e.preventDefault()} onClick={onOpen}>
          {target.kind === 'download' ? <Download size={14} /> : <ExternalLink size={14} />}
        </button>
      )}
      {target.kind !== 'slide' && (
        <button type="button" title={copied ? 'Copied' : 'Copy link'} aria-label="Copy link" style={{ ...iconBtn, color: copied ? '#16a34a' : '#64748b' }}
          onMouseDown={(e) => e.preventDefault()} onClick={() => { onCopy(); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}><Copy size={14} /></button>
      )}
      <button type="button" title="Edit link" aria-label="Edit link" style={iconBtn}
        onMouseDown={(e) => e.preventDefault()} onClick={onEdit}><Pencil size={14} /></button>
      <button type="button" title="Remove link" aria-label="Remove link" style={{ ...iconBtn, color: '#dc2626' }}
        onMouseDown={(e) => e.preventDefault()} onClick={onRemove}><Unlink size={14} /></button>
    </div>,
    document.body,
  );
}
