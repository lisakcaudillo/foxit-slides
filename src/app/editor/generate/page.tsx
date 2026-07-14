'use client';

/**
 * /editor/generate — the dedicated new-deck (create) surface,
 * replacing the global new-deck MODAL. Reached only from +New / +Create.
 *
 * Two tabs: GENERATE (the verbatim landing-page prompt card → on Generate it
 * navigates to the editor, which shows the approved DraftingOverlay loader) and
 * OPEN FROM LIBRARY (saved decks → ?deck=<id>). Full page, not a scrim/dialog;
 * "Slides" in the nav now opens the Editor itself (a blank slide).
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import GenerationPrompt from '@/components/home/GenerationPrompt';
import { LibraryTab } from '@/components/NewDeckModal';
import { getAllDecks, type StoredCardDeck } from '@/lib/cardDeckStorage';

type Tab = 'generate' | 'library';

export default function GeneratePage() {
  const [tab, setTab] = useState<Tab>('generate');
  const [decks, setDecks] = useState<StoredCardDeck[]>([]);

  useEffect(() => {
    if (tab === 'library') setDecks(getAllDecks());
  }, [tab]);

  const openDeck = (deckId: string) => {
    window.location.assign(`/editor/slides?deck=${encodeURIComponent(deckId)}`);
  };
  const goHome = () => { window.location.assign('/'); };

  const tabBtn = (id: Tab): CSSProperties => ({
    appearance: 'none', background: 'transparent', border: 'none',
    padding: '0 2px 10px', marginRight: 28, fontSize: 15, fontFamily: 'inherit',
    fontWeight: tab === id ? 700 : 500,
    color: tab === id ? '#0f172a' : '#94a3b8',
    cursor: 'pointer', position: 'relative',
  });

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(120% 90% at 50% 4%, #ffffff 0%, #faf9fe 48%, #f5f3fb 100%)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Brand mark — same Foxit logo + WORKSPACE / SLIDES as the loading screen. */}
      <a
        href="/"
        aria-label="Home"
        style={{ position: 'fixed', top: 26, left: 30, display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', zIndex: 2 }}
      >
        <span style={{ width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#4776E6,#A855F7)', boxShadow: '0 3px 12px rgba(109,40,217,.18)' }}>
          <svg width="16" height="16" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
            <path d="M550.92 757.41C541.61 760.4 532.75 763.28 524.24 766.08C523.99 766.17 523.89 766.47 524.03 766.69L576.88 846.16C576.95 846.27 577.08 846.33 577.21 846.33L810.96 846.34C811.27 846.34 811.46 846 811.3 845.73L708.23 673.58C708.12 673.38 707.86 673.32 707.67 673.45C667.43 700.83 625.34 728.47 553.87 756.35L550.92 757.41Z" fill="white" />
            <path d="M193.26 819.15C193.26 819.15 201.93 654.66 270.55 535.82C339.17 416.98 470.33 323.67 653.06 275.7C653.06 275.7 798.18 240.63 843.13 213.39C843.13 213.39 892.02 180.38 869.94 257.13C869.94 257.13 840.65 331.44 750.35 379.68C729.06 390.83 713.24 393.32 716.58 414.53C722.62 436.09 757.15 419.7 761.89 417.23C770.1 410.15 850.14 387.29 796.81 466.97C743.18 549.5 710.63 624.37 502.42 698.64C363.61 738.25 308.4 760.54 227.96 836.47C187.73 866.24 193.26 819.15 193.26 819.15Z" fill="white" />
            <path d="M322.48 117.38C329.53 236.44 348.73 261.33 462.1 298.36C343.04 305.41 318.16 324.61 281.12 437.98C274.07 318.92 254.88 294.03 141.5 257C260.56 249.95 285.45 230.75 322.48 117.38Z" fill="white" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '0.12em', background: 'linear-gradient(135deg,#4776E6,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>WORKSPACE</span>
          <span aria-hidden="true" style={{ height: 1, width: '100%', background: 'linear-gradient(90deg, rgba(120,90,230,0.5), rgba(120,90,230,0))' }} />
          <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.18em', color: '#475569' }}>SLIDES</span>
        </span>
      </a>

      {/* Back to Home — minimal arrow, bottom-left corner. */}
      <button
        type="button"
        onClick={goHome}
        aria-label="Back to home"
        title="Back to home"
        style={{
          position: 'fixed', bottom: 80, left: 28, zIndex: 2,
          width: 40, height: 40, borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid #e2e8f0', background: '#ffffff', cursor: 'pointer',
          color: '#475569', boxShadow: '0 1px 4px rgba(15,23,42,0.08)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#ffffff'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
      >
        <ArrowLeft size={18} />
      </button>

      <div
        style={{
          // Hug the content width so the (left-aligned, nowrap) intent sentence
          // drives the width — same rule as the retired modal card.
          width: 'max-content',
          maxWidth: 'min(1300px, 96vw)',
          minWidth: 'min(720px, 92vw)',
          display: 'flex', flexDirection: 'column',
          background: '#ffffff', borderRadius: 16,
          boxShadow: '0 24px 70px -20px rgba(15,23,42,0.30), 0 2px 8px rgba(15,23,42,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Tabs + close */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px 24px 0', borderBottom: '1px solid #eef1f5' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            {(['generate', 'library'] as Tab[]).map((id) => (
              <button key={id} type="button" style={tabBtn(id)} onClick={() => setTab(id)}>
                {id === 'generate' ? 'Generate' : 'Open from Library'}
                {tab === id && (
                  <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, borderRadius: 2, background: 'linear-gradient(135deg, #4776E6, #A855F7)' }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: tab === 'generate' ? 'hidden' : 'auto', padding: tab === 'generate' ? '8px 0 4px' : '20px 24px 24px' }}>
          {tab === 'generate' ? (
            // `.home-gen` re-applies the --hg-* token scope the prompt card needs;
            // inline styles strip the home wrapper's full-viewport chrome.
            <div
              className="home-gen hg-in-modal"
              style={{ padding: '24px 28px 28px', minHeight: 0, margin: 0, background: 'transparent', border: 0, borderRadius: 0, boxShadow: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
            >
              <GenerationPrompt />
            </div>
          ) : (
            <LibraryTab decks={decks} onOpen={openDeck} onGenerate={() => setTab('generate')} />
          )}
        </div>
      </div>
    </div>
  );
}
