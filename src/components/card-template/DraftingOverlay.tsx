'use client';

/**
 * DraftingOverlay — the full-screen generating screen for slide creation.
 *
 * React port of the approved design prototype
 * (app/public/design-table/foxit-slides-rebrand/loading-apple-d1-rotating.html):
 * Apple-restraint, calm light field with a faint ambient brand glow, a tiny
 * Foxit Slides mark top-left, a SHIMMERING static "Creating your slides", and
 * a SEPARATE rotating status line on a timer (Understanding your topic →
 * Outlining the flow → Writing each slide → Designing the layout → Almost
 * ready). No orb, no fake deck name, no visible keyboard shortcuts.
 *
 * NOTE: the status line advances on a timer for now. Refinement (queued): drive
 * it from the real generate-cards pipeline events (the stream emits `pipeline`
 * stage events + per-card events) so it stays honest when a step runs long.
 */

import { useEffect, useState } from 'react';
import { LOADING_PHRASES } from './loadingPhrases';

const STAGES = [
  'Understanding your topic',
  'Outlining the flow',
  'Writing each slide',
  'Designing the layout',
  'Almost ready',
];

export function DraftingOverlay() {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      const t = setTimeout(() => {
        setI((prev) => (prev + 1) % STAGES.length);
        setVisible(true);
      }, 420);
      return () => clearTimeout(t);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="drafting-overlay">
      <div className="do-ambient" aria-hidden="true" />

      {/* tiny peripheral brand mark — never a hero */}
      <div className="do-chrome" aria-hidden="true">
        <span className="do-mark">
          <svg width="16" height="16" viewBox="0 0 1024 1024" fill="none">
            <path d="M550.92 757.41C541.61 760.4 532.75 763.28 524.24 766.08C523.99 766.17 523.89 766.47 524.03 766.69L576.88 846.16C576.95 846.27 577.08 846.33 577.21 846.33L810.96 846.34C811.27 846.34 811.46 846 811.3 845.73L708.23 673.58C708.12 673.38 707.86 673.32 707.67 673.45C667.43 700.83 625.34 728.47 553.87 756.35L550.92 757.41Z" fill="white" />
            <path d="M193.26 819.15C193.26 819.15 201.93 654.66 270.55 535.82C339.17 416.98 470.33 323.67 653.06 275.7C653.06 275.7 798.18 240.63 843.13 213.39C843.13 213.39 892.02 180.38 869.94 257.13C869.94 257.13 840.65 331.44 750.35 379.68C729.06 390.83 713.24 393.32 716.58 414.53C722.62 436.09 757.15 419.7 761.89 417.23C770.1 410.15 850.14 387.29 796.81 466.97C743.18 549.5 710.63 624.37 502.42 698.64C363.61 738.25 308.4 760.54 227.96 836.47C187.73 866.24 193.26 819.15 193.26 819.15Z" fill="white" />
            <path d="M322.48 117.38C329.53 236.44 348.73 261.33 462.1 298.36C343.04 305.41 318.16 324.61 281.12 437.98C274.07 318.92 254.88 294.03 141.5 257C260.56 249.95 285.45 230.75 322.48 117.38Z" fill="white" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '0.12em', background: 'linear-gradient(135deg,#4776E6,#A855F7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>WORKSPACE</span>
          <span style={{ height: 1, width: '100%', background: 'linear-gradient(90deg, rgba(120,90,230,0.5), rgba(120,90,230,0))' }} />
          <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.18em', color: '#475569' }}>SLIDES</span>
        </span>
      </div>

      <div className="do-stage" role="status" aria-live="polite">
        {/* 1) shimmering, static */}
        <h1 className="do-headline">Creating your slides</h1>
        {/* 2) rotating status line on a timer */}
        <div className="do-line" style={{ opacity: visible ? 1 : 0 }}>{STAGES[i]}</div>
        <div className="do-pulse" aria-hidden="true"><i /><i /><i /></div>
      </div>

      <style>{`
        .drafting-overlay{
          position:fixed; inset:0; z-index:100; overflow:hidden;
          display:flex; align-items:center; justify-content:center;
          font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          background:radial-gradient(120% 90% at 50% 8%, #ffffff 0%, #faf9fe 46%, #f5f3fb 100%);
        }
        .do-ambient{ position:absolute; inset:0; pointer-events:none; z-index:0; }
        .do-ambient::before,.do-ambient::after{
          content:""; position:absolute; border-radius:50%; filter:blur(90px); opacity:.10;
        }
        .do-ambient::before{ width:46vw; height:46vw; left:-16vw; top:-14vw;
          background:radial-gradient(circle,#4776E6,transparent 68%); animation:do-drift1 22s ease-in-out infinite; }
        .do-ambient::after{ width:50vw; height:50vw; right:-18vw; bottom:-18vw;
          background:radial-gradient(circle,#A855F7,transparent 68%); animation:do-drift2 26s ease-in-out infinite; }
        @keyframes do-drift1{ 0%,100%{transform:translate(0,0) scale(1);opacity:.09} 50%{transform:translate(4vw,3vw) scale(1.08);opacity:.13} }
        @keyframes do-drift2{ 0%,100%{transform:translate(0,0) scale(1);opacity:.08} 50%{transform:translate(-3vw,-3vw) scale(1.1);opacity:.12} }

        .do-chrome{ position:fixed; top:28px; left:30px; display:flex; align-items:center; gap:9px; z-index:2; }
        .do-mark{ width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center;
          background:linear-gradient(135deg,#4776E6,#A855F7); box-shadow:0 3px 12px rgba(109,40,217,.18); }
        .do-word{ font-size:12.5px; font-weight:500; letter-spacing:.04em; color:#6b6780; }

        .do-stage{ position:relative; z-index:1; text-align:center; padding:0 8vw; max-width:900px;
          animation:do-stage-in 1.4s cubic-bezier(.16,1,.3,1) .1s both; }
        @keyframes do-stage-in{ from{opacity:0;transform:translateY(8px);filter:blur(2px)} to{opacity:1;transform:translateY(0);filter:blur(0)} }

        .do-headline{
          margin:0; font-size:clamp(30px,5.4vw,56px); font-weight:600; letter-spacing:-.025em; line-height:1.16;
          display:inline-block;
          /* Bottom breathing room: -webkit-background-clip:text clips to the
             line box, so a tight line-height shaves glyph descenders (g/y/p).
             The padding extends the paint box so descenders render fully. */
          padding-bottom:0.14em;
          background:linear-gradient(100deg,
            rgba(30,27,45,.82) 0%, rgba(30,27,45,.82) 34%,
            #4776E6 44%, #A855F7 50%, #6D28D9 56%,
            rgba(30,27,45,.82) 66%, rgba(30,27,45,.82) 100%);
          background-size:280% 100%;
          -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
          animation:do-sheen 6.5s cubic-bezier(.45,0,.55,1) infinite;
        }
        @keyframes do-sheen{ 0%{background-position:150% 0} 100%{background-position:-150% 0} }

        .do-line{ margin-top:20px; height:22px; font-size:15px; font-weight:400; letter-spacing:.01em;
          color:#6b6780; transition:opacity .42s ease; }

        .do-pulse{ margin:36px auto 0; display:flex; gap:7px; justify-content:center; }
        .do-pulse i{ width:5px; height:5px; border-radius:50%; opacity:.25;
          background:linear-gradient(135deg,#4776E6,#A855F7); animation:do-breathe 2.4s ease-in-out infinite; }
        .do-pulse i:nth-child(2){ animation-delay:.28s; }
        .do-pulse i:nth-child(3){ animation-delay:.56s; }
        @keyframes do-breathe{ 0%,100%{opacity:.18;transform:scale(.85)} 50%{opacity:.7;transform:scale(1.15)} }

        @media (prefers-reduced-motion: reduce){
          .do-ambient::before,.do-ambient::after{ animation:none; opacity:.08; }
          .do-stage{ animation:none; }
          .do-headline{ animation:none;
            background:linear-gradient(100deg,#4776E6,#6D28D9 52%,#A855F7);
            -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
          .do-pulse i{ animation:none; opacity:.4; }
        }
      `}</style>
    </div>
  );
}

// Re-export so callers can grab phrases without a deeper import.
export { LOADING_PHRASES };
