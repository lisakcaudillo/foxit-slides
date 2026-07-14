'use client';

/**
 * SourceDrawer — Phase E E-9, trimmed in E-14.
 *
 * Single-page viewer overlay. Rendered when the user clicks a passage row
 * (or "Open source" button) in the Inspector source section. Shows the
 * cited PDF page rendered as a PNG via /api/source-grounded/render-page.
 *
 * E-14 changes from the original D2 drawer:
 *   - Dropped the cited-pages rail (navigation-from-inspector pattern;
 *     user goes back to inspector to switch passages)
 *   - Narrower (440px) since no rail
 *   - Compact header
 *   - Prev/next chevrons to step between cited pages
 *   - Accepts `highlight` prop (forwarded to render-page; E-15 uses it
 *     for Foxit text-search overlay)
 */

import { useEffect, useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SourceDocument } from '@/types/card-template';

interface SourceDrawerProps {
  source: SourceDocument;
  citedPages: number[];
  /** 1-indexed page to start on. */
  initialPage: number;
  /** Optional source text to highlight on the rendered page (E-15). */
  highlight?: string;
  onClose: () => void;
}

export default function SourceDrawer({ source, citedPages, initialPage, highlight, onClose }: SourceDrawerProps) {
  const [activePage, setActivePage] = useState(initialPage);

  // Esc closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // When parent updates initialPage (e.g., user clicked a different chip),
  // mirror it in our state.
  useEffect(() => {
    setActivePage(initialPage);
  }, [initialPage]);

  // Step between cited pages.
  const { prevPage, nextPage, positionLabel } = useMemo(() => {
    const idx = citedPages.indexOf(activePage);
    if (idx === -1) {
      return {
        prevPage: null as number | null,
        nextPage: null as number | null,
        positionLabel: `Page ${activePage}`,
      };
    }
    return {
      prevPage: idx > 0 ? citedPages[idx - 1] : null,
      nextPage: idx < citedPages.length - 1 ? citedPages[idx + 1] : null,
      positionLabel: `Citation ${idx + 1} of ${citedPages.length}`,
    };
  }, [citedPages, activePage]);

  const renderUrl = useMemo(() => {
    const params = new URLSearchParams({
      hash: source.contentHash,
      page: String(activePage),
      maxDim: '2048',
    });
    return `/api/source-grounded/render-page?${params.toString()}`;
  }, [source.contentHash, activePage]);

  // Fetch highlight bounding boxes via Foxit text-search (E-15) whenever
  // the passage text or page changes. Rects come back normalized to 0..1
  // so they scale with any display size of the rendered image.
  const [highlightRects, setHighlightRects] = useState<Array<{ x: number; y: number; w: number; h: number }>>([]);
  const [highlightFailed, setHighlightFailed] = useState(false);

  useEffect(() => {
    if (!highlight || highlight.trim().length === 0) {
      setHighlightRects([]);
      setHighlightFailed(false);
      return;
    }
    let abort = false;
    setHighlightFailed(false);
    fetch('/api/source-grounded/find-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: source.contentHash, page: activePage, text: highlight }),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (!abort) setHighlightFailed(true);
          return;
        }
        const data = (await res.json()) as { rects: Array<{ x: number; y: number; w: number; h: number }> };
        if (!abort) {
          setHighlightRects(data.rects || []);
          if ((data.rects || []).length === 0) setHighlightFailed(true);
        }
      })
      .catch(() => {
        if (!abort) setHighlightFailed(true);
      });
    return () => {
      abort = true;
    };
  }, [source.contentHash, activePage, highlight]);

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          backdropFilter: 'blur(2px)',
          zIndex: 200,
          animation: 'compose-source-fade-in 180ms ease-out',
        }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Source document viewer"
        style={{
          position: 'fixed',
          top: 0,
          right: 320, // pin to inspector edge (inspector is 320px wide)
          height: '100vh',
          width: '440px',
          background: 'white',
          borderLeft: '1px solid #e2e8f0',
          boxShadow: '-12px 0 28px -16px rgba(15, 23, 42, 0.25)',
          zIndex: 210,
          display: 'flex',
          flexDirection: 'column',
          animation: 'compose-source-slide-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '26px',
              height: '32px',
              borderRadius: '3px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              display: 'grid',
              placeItems: 'center',
              fontSize: '8px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: '#475569',
              flexShrink: 0,
            }}
          >
            {source.fileType === 'docx' ? 'DOC' : source.fileType === 'pptx' ? 'PPT' : source.fileType === 'image' ? 'IMG' : 'PDF'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#1e293b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {source.filename}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '1px' }}>
              {positionLabel} · page {activePage} of {source.pageCount}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source drawer"
            title="Close (Esc)"
            style={{
              width: '26px',
              height: '26px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '6px',
              background: 'transparent',
              border: '1px solid transparent',
              color: '#475569',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <X size={13} strokeWidth={2.25} />
          </button>
        </header>

        {/* Prev/next nav between cited pages */}
        {citedPages.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              borderBottom: '1px solid #e2e8f0',
              background: '#fbfcfe',
            }}
          >
            <button
              type="button"
              onClick={() => prevPage !== null && setActivePage(prevPage)}
              disabled={prevPage === null}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '5px',
                background: 'transparent',
                border: '1px solid transparent',
                color: prevPage !== null ? '#7c3aed' : '#cbd5e1',
                cursor: prevPage !== null ? 'pointer' : 'not-allowed',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              <ChevronLeft size={12} strokeWidth={2.5} />
              {prevPage !== null ? `Page ${prevPage}` : 'Start'}
            </button>
            <button
              type="button"
              onClick={() => nextPage !== null && setActivePage(nextPage)}
              disabled={nextPage === null}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '5px',
                background: 'transparent',
                border: '1px solid transparent',
                color: nextPage !== null ? '#7c3aed' : '#cbd5e1',
                cursor: nextPage !== null ? 'pointer' : 'not-allowed',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              {nextPage !== null ? `Page ${nextPage}` : 'End'}
              <ChevronRight size={12} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* Main viewer */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: '#eef1f5',
          }}
        >
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              padding: '20px',
            }}
          >
            <div style={{ position: 'relative', maxWidth: '100%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${source.contentHash}-${activePage}`}
                src={renderUrl}
                alt={`${source.filename} — page ${activePage}`}
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 4px 12px -6px rgba(15, 23, 42, 0.18)',
                  background: 'white',
                }}
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.compose-source-err')) {
                    const msg = document.createElement('div');
                    msg.className = 'compose-source-err';
                    msg.style.cssText = 'color:#64748b;font-size:13px;padding:24px;text-align:center;';
                    msg.textContent = `Page ${activePage} could not be rendered. The source PDF may need to be re-uploaded.`;
                    parent.appendChild(msg);
                  }
                }}
              />
              {/* E-15 highlight overlays — positioned by normalized PDF coords */}
              {highlightRects.map((r, i) => (
                <div
                  key={`hl-${i}`}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: 'rgba(255, 95, 0, 0.28)',
                    boxShadow: '0 0 0 1px rgba(255, 95, 0, 0.55)',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                    animation: 'compose-source-highlight-in 220ms ease-out',
                  }}
                />
              ))}
              {highlight && highlightFailed && (
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    right: '8px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    color: '#64748b',
                    pointerEvents: 'none',
                  }}
                >
                  Couldn&apos;t locate the exact passage on this page (text may differ slightly from source).
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              padding: '6px 14px',
              borderTop: '1px solid #e2e8f0',
              fontSize: '10.5px',
              color: '#94a3b8',
              background: 'white',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <span>Esc to close</span>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes compose-source-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes compose-source-slide-in {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes compose-source-highlight-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
