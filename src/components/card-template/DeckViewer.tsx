'use client';

/**
 * DeckViewer — read-only presentation of a generated deck.
 *
 * This is the "one interactive element" surface for Foxit Slides: it shows the
 * finished deck exactly as generated (using the SAME SlideStage renderer the
 * PPTX/PDF export uses, so what you see is what you export) and lets the user
 * export to PowerPoint (.pptx) or PDF. There is no editing — slide navigation
 * and export are the only interactions.
 *
 * The generation, loading overlay, and deck-persistence rules all live in the
 * page that mounts this component; DeckViewer only renders the template it is
 * handed and owns the export controls.
 */

import { useEffect, useRef, useState } from 'react';
import type { CardTemplate } from '@/types/card-template';
import { SlideStage } from './SlideStage';
import SlideDeckPrint from './SlideDeckPrint';

const W = 960;
const H = 540;

interface DeckViewerProps {
  template: CardTemplate;
  /** True while a generation is still streaming cards in. */
  streaming?: boolean;
  /** Fade slides in on first mount (a freshly revealed deck). */
  revealOnMount?: boolean;
  /** Deep-link: open on this slide index. */
  initialCard?: number;
  /** Present for parity with the page's persistence identity (unused here). */
  deckId?: string;
  /** In-deck slide links jump here. */
  onNavigateToSlide?: (index: number) => void;
}

function safeName(template: CardTemplate): string {
  return (
    (template.name || 'presentation')
      .trim()
      .replace(/[^a-z0-9\-_ ]/gi, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || 'presentation'
  );
}

export default function DeckViewer({
  template,
  streaming = false,
  revealOnMount = false,
  initialCard,
  onNavigateToSlide,
}: DeckViewerProps) {
  const cards = template.cards ?? [];
  const theme = template.theme;
  const [active, setActive] = useState(
    Math.max(0, Math.min(initialCard ?? 0, Math.max(0, cards.length - 1))),
  );
  const [pptStatus, setPptStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'working'>('idle');
  const [revealed, setRevealed] = useState(!revealOnMount);

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);

  // Keep the active slide in range as cards stream in.
  useEffect(() => {
    if (active > cards.length - 1) setActive(Math.max(0, cards.length - 1));
  }, [cards.length, active]);

  // One-shot fade-in for a freshly revealed deck.
  useEffect(() => {
    if (!revealOnMount) return;
    const t = setTimeout(() => setRevealed(true), 40);
    return () => clearTimeout(t);
  }, [revealOnMount]);

  // Fit the 960×540 stage to the available width.
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth;
      if (avail > 0) setScale(Math.min(1, avail / W));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const jump = (i: number) => {
    setActive(i);
    onNavigateToSlide?.(i);
  };

  const handleExportPpt = async () => {
    if (pptStatus === 'working') return;
    setPptStatus('working');
    try {
      const { exportDeckToPptx } = await import('@/lib/pptxExport');
      await exportDeckToPptx(template, template.name || 'presentation');
      setPptStatus('idle');
    } catch (err) {
      console.error('PPTX export failed', err);
      setPptStatus('error');
    }
  };

  const handleExportPdf = async () => {
    if (pdfStatus === 'working') return;
    setPdfStatus('working');
    try {
      const res = await fetch('/api/export/slides-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, fileName: template.name || 'presentation' }),
      });
      if (!res.ok) {
        console.warn('Foxit PDF export unavailable, falling back to print', await res.text());
        setPdfStatus('idle');
        window.print();
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName(template)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfStatus('idle');
    } catch (err) {
      console.error('PDF export failed, falling back to print', err);
      setPdfStatus('idle');
      window.print();
    }
  };

  const activeCard = cards[active];
  const thumbScale = 128 / W;

  return (
    <div className="deck-viewer">
      <style>{`
        .deck-viewer {
          display: flex; flex-direction: column; height: 100%;
          background: var(--theme-workspace-bg, #f4f5f8);
          color: var(--theme-ink, #1a1a2e);
        }
        .dv-topbar {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          background: #ffffff;
        }
        .dv-title { font-weight: 650; font-size: 15px; letter-spacing: -0.01em; }
        .dv-count { font-size: 12px; opacity: 0.55; }
        .dv-spacer { flex: 1; }
        .dv-btn {
          font-size: 13px; font-weight: 600;
          padding: 9px 16px; border-radius: 10px;
          border: 1px solid transparent; cursor: pointer;
          transition: opacity 0.15s, background 0.15s;
        }
        .dv-btn:disabled { opacity: 0.55; cursor: wait; }
        .dv-btn-ppt { background: #ff5f00; color: #fff; }
        .dv-btn-ppt:hover:not(:disabled) { background: #e85600; }
        .dv-btn-pdf { background: #ffffff; color: #1a1a2e; border-color: rgba(0,0,0,0.14); }
        .dv-btn-pdf:hover:not(:disabled) { background: #f4f5f8; }
        .dv-body { flex: 1; display: flex; min-height: 0; }
        .dv-rail {
          width: 168px; flex-shrink: 0; overflow-y: auto;
          padding: 14px 10px; display: flex; flex-direction: column; gap: 10px;
          border-right: 1px solid rgba(0,0,0,0.08); background: #fbfbfd;
        }
        .dv-thumb {
          position: relative; border-radius: 6px; overflow: hidden;
          border: 2px solid transparent; cursor: pointer; background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .dv-thumb.is-active { border-color: #ff5f00; }
        .dv-thumb-n {
          position: absolute; left: 4px; top: 4px; z-index: 2;
          font-size: 10px; font-weight: 600; color: #64748b;
          background: rgba(255,255,255,0.85); border-radius: 4px; padding: 0 5px;
        }
        .dv-stagewrap {
          flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center;
          padding: 28px; overflow: auto;
        }
        .dv-stage-outer { transition: opacity 0.4s ease; }
      `}</style>

      <div className="dv-topbar">
        <span className="dv-title">{template.name || 'Untitled deck'}</span>
        <span className="dv-count">
          {cards.length} slide{cards.length === 1 ? '' : 's'}
          {streaming ? ' · generating…' : ''}
        </span>
        <span className="dv-spacer" />
        <button
          type="button"
          className="dv-btn dv-btn-pdf"
          onClick={handleExportPdf}
          disabled={pdfStatus === 'working' || cards.length === 0}
        >
          {pdfStatus === 'working' ? 'Building PDF…' : 'Save as PDF'}
        </button>
        <button
          type="button"
          className="dv-btn dv-btn-ppt"
          onClick={handleExportPpt}
          disabled={pptStatus === 'working' || cards.length === 0}
        >
          {pptStatus === 'working'
            ? 'Building PowerPoint…'
            : pptStatus === 'error'
            ? 'Export failed — retry'
            : 'Export as PPT (.pptx)'}
        </button>
      </div>

      <div className="dv-body">
        <div className="dv-rail" aria-label="Slides">
          {cards.map((card, i) => (
            <div
              key={card.id || i}
              className={`dv-thumb${i === active ? ' is-active' : ''}`}
              style={{ width: W * thumbScale, height: H * thumbScale }}
              onClick={() => jump(i)}
              role="button"
              aria-label={`Go to slide ${i + 1}`}
            >
              <span className="dv-thumb-n">{i + 1}</span>
              <div style={{ width: W, height: H, transform: `scale(${thumbScale})`, transformOrigin: 'top left' }}>
                <SlideStage card={card} theme={theme} width={W} height={H} />
              </div>
            </div>
          ))}
        </div>

        <div className="dv-stagewrap" ref={stageWrapRef}>
          {activeCard && (
            <div
              className="dv-stage-outer"
              style={{
                width: W * scale,
                height: H * scale,
                opacity: revealed ? 1 : 0,
                boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <SlideStage card={activeCard} theme={theme} width={W} height={H} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden print surface — powers the browser Save-as-PDF fallback. */}
      <SlideDeckPrint template={template} />
    </div>
  );
}
