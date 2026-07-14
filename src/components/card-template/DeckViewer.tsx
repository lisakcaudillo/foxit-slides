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
  /** Rename the deck — the name is editable in the top bar. */
  onNameChange?: (name: string) => void;
}

/** Cover heading (first text block of the first card) — the deck's real title,
 *  used as the auto-name when a deck has none saved yet. */
function coverHeadingOf(template: CardTemplate): string {
  for (const c of template.cards ?? []) {
    for (const b of c.freeform ?? []) {
      if (b.type === 'text' && typeof b.content === 'string' && b.content.trim()) {
        return b.content.trim().slice(0, 80);
      }
    }
  }
  return '';
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
  onNameChange,
}: DeckViewerProps) {
  const cards = template.cards ?? [];
  const theme = template.theme;
  const [name, setName] = useState(template.name || coverHeadingOf(template));
  useEffect(() => { setName(template.name || coverHeadingOf(template)); }, [template.name, template.cards]);
  // Deck saved with no name yet (older decks) → auto-name it from the cover heading and persist.
  useEffect(() => {
    if (!template.name) { const h = coverHeadingOf(template); if (h) onNameChange?.(h); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  // Keyboard nav: ↑/↓ (also ←/→, PageUp/Down) move between slides — unless a
  // text field (the deck-name input) is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        setActive((a) => Math.min(cards.length - 1, a + 1));
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cards.length]);

  // Wheel / trackpad swipe over the stage moves between slides (the scaled deck
  // doesn't scroll, so the gesture drives navigation). Throttled so one swipe
  // advances one slide.
  useEffect(() => {
    const node = stageWrapRef.current;
    if (!node) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 12) return;
      e.preventDefault();
      if (lock) return;
      lock = true;
      const dir = e.deltaY > 0 ? 1 : -1;
      setActive((a) => Math.max(0, Math.min(cards.length - 1, a + dir)));
      window.setTimeout(() => { lock = false; }, 380);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [cards.length]);

  // Keep the active thumbnail visible in the rail as navigation moves.
  useEffect(() => {
    const thumb = document.querySelectorAll('.dv-rail .dv-thumb')[active] as HTMLElement | undefined;
    thumb?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

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
          /* Themed ambient backdrop (palette-derived) behind the deck; falls back
             to the workspace base color, then a neutral grey. */
          background: var(--theme-workspace-ambient, var(--theme-workspace-base, #f4f5f8));
          color: var(--theme-ink, #1a1a2e);
        }
        .dv-topbar {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          background: #ffffff;
        }
        .dv-logo { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; flex-shrink: 0; }
        .dv-logo-mark { width: 26px; height: 26px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg,#4776E6,#A855F7); box-shadow: 0 2px 8px rgba(103,76,245,0.30); }
        .dv-logo-text { font-size: 14px; font-weight: 700; letter-spacing: 0.12em; background: linear-gradient(135deg,#4776E6,#A855F7); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .dv-logo-div { width: 1px; height: 22px; background: rgba(0,0,0,0.10); margin: 0 2px; flex-shrink: 0; }
        .dv-title {
          font-weight: 650; font-size: 15px; letter-spacing: -0.01em; color: inherit;
          font-family: inherit; background: transparent;
          border: 1px solid transparent; border-radius: 7px;
          padding: 4px 8px; margin: -4px -8px; max-width: 46ch;
        }
        .dv-title:hover { background: rgba(0,0,0,0.045); }
        .dv-title:focus { outline: none; background: #ffffff; border-color: rgba(0,0,0,0.16); box-shadow: 0 1px 5px rgba(0,0,0,0.08); }
        .dv-title::placeholder { color: #9aa0ad; font-weight: 500; }
        .dv-count { font-size: 12px; opacity: 0.55; }
        .dv-spacer { flex: 1; }
        .dv-btn {
          font-size: 13px; font-weight: 600;
          padding: 9px 16px; border-radius: 10px;
          border: 1px solid transparent; cursor: pointer;
          transition: opacity 0.15s, background 0.15s;
        }
        .dv-btn:disabled { opacity: 0.55; cursor: wait; }
        .dv-btn-ppt {
          background: linear-gradient(135deg, #4776E6, #A855F7);
          color: #fff; border-color: rgba(255,255,255,0.28);
          box-shadow: 0 6px 16px rgba(80,55,195,0.30), 0 1px 2px rgba(20,9,50,0.10);
        }
        .dv-btn-ppt:hover:not(:disabled) { filter: brightness(1.06); }
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
        .dv-thumb.is-active {
          border-color: transparent;
          background-image: linear-gradient(#fff, #fff), linear-gradient(135deg, #C79BE8 0%, #8A56B8 100%);
          background-origin: border-box;
          background-clip: padding-box, border-box;
          box-shadow: 0 2px 12px rgba(122,77,160,0.30);
        }
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
        <a className="dv-logo" href="/" aria-label="Studio — Home">
          <span className="dv-logo-mark">
            <svg width="15" height="15" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
              <path d="M550.92 757.41C541.61 760.4 532.75 763.28 524.24 766.08C523.99 766.17 523.89 766.47 524.03 766.69L576.88 846.16C576.95 846.27 577.08 846.33 577.21 846.33L810.96 846.34C811.27 846.34 811.46 846 811.3 845.73L708.23 673.58C708.12 673.38 707.86 673.32 707.67 673.45C667.43 700.83 625.34 728.47 553.87 756.35L550.92 757.41Z" fill="white"/>
              <path d="M193.26 819.15C193.26 819.15 201.93 654.66 270.55 535.82C339.17 416.98 470.33 323.67 653.06 275.7C653.06 275.7 798.18 240.63 843.13 213.39C843.13 213.39 892.02 180.38 869.94 257.13C869.94 257.13 840.65 331.44 750.35 379.68C729.06 390.83 713.24 393.32 716.58 414.53C722.62 436.09 757.15 419.7 761.89 417.23C770.1 410.15 850.14 387.29 796.81 466.97C743.18 549.5 710.63 624.37 502.42 698.64C363.61 738.25 308.4 760.54 227.96 836.47C187.73 866.24 193.26 819.15 193.26 819.15Z" fill="white"/>
              <path d="M322.48 117.38C329.53 236.44 348.73 261.33 462.1 298.36C343.04 305.41 318.16 324.61 281.12 437.98C274.07 318.92 254.88 294.03 141.5 257C260.56 249.95 285.45 230.75 322.48 117.38Z" fill="white"/>
            </svg>
          </span>
          <span className="dv-logo-text">STUDIO</span>
        </a>
        <span className="dv-logo-div" />
        <input
          className="dv-title"
          value={name}
          placeholder="Untitled deck"
          aria-label="Deck name"
          spellCheck={false}
          size={Math.max((name || 'Untitled deck').length, 8)}
          onChange={(e) => { setName(e.target.value); onNameChange?.(e.target.value); }}
        />
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
            ? 'Exporting…'
            : pptStatus === 'error'
            ? 'Export failed — retry'
            : 'Export'}
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
                boxShadow: '0 4px 18px rgba(0,0,0,0.10)',
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
