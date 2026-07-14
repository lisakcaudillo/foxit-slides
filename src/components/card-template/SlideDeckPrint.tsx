'use client';

/**
 * Faithful print/export view for a slide deck → clean PDF via the browser's
 * Print / Save-as-PDF.
 *
 * Why this approach: the editor renders slides through `FreeformLayer`. To
 * export faithfully we render the SAME component at full 960×540 — one card per
 * printed page — and use print CSS to hide all editor chrome. The PDF therefore
 * matches what the user sees (a hand-written HTML serializer would risk
 * diverging; SlidePresentation uses a different, non-faithful renderer).
 *
 * On screen this is hidden; it only becomes visible during print. The existing
 * "Print / Save as PDF" button (window.print) triggers it.
 *
 * A fully-programmatic Foxit `htmlToPdf` export (for automated/batch PDFs) is a
 * separate, heavier follow-up; this gives a real, faithful PDF now.
 */

import type { CardTemplate, Card, TemplateTheme } from '@/types/card-template';
import { FreeformLayer } from './FreeformLayer';
import CoverDecoration from './CoverDecoration';
import { COVER_LAYOUT_PIECES } from '@/lib/card-engine/cover-layout-pieces';
import { cardBackground, isHex } from './cardBackground';

const W = 960;
const H = 540;

export default function SlideDeckPrint({ template }: { template: CardTemplate }) {
  const theme = template.theme;
  return (
    <>
      <style>{`
        #slide-print-root { display: none; }
        @media print {
          /* Hide all editor chrome; show only the deck pages. The visibility
             trick works regardless of DOM nesting. */
          body * { visibility: hidden !important; }
          #slide-print-root, #slide-print-root * { visibility: visible !important; }
          #slide-print-root {
            display: block !important;
            position: absolute; left: 0; top: 0;
          }
          .slide-print-page {
            break-after: page; page-break-after: always;
            /* 960×540 CSS px = 10in × 5.625in (16:9) — matches the @page size
               below exactly, so each card fills its own landscape page. */
            width: 10in; height: 5.625in;
            overflow: hidden;
            /* Preserve slide background colors/gradients in the PDF (browsers
               strip them by default). */
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .slide-print-page:last-child { break-after: auto; page-break-after: auto; }
          /* Inches (and the landscape ratio) ARE honored by print engines; px
             was not, which is why it fell back to portrait Letter. */
          @page { size: 10in 5.625in; margin: 0; }
        }
      `}</style>
      <div id="slide-print-root">
        {template.cards.map((card, i) => (
          <div
            key={card.id || i}
            className="slide-print-page"
            style={{
              width: W,
              height: H,
              position: 'relative',
              overflow: 'hidden',
              background: cardBackground(card, theme),
              fontFamily: `${theme.bodyFont}`,
              color: isHex(theme.bodyColor) ? theme.bodyColor : undefined,
            }}
          >
            {card.slideDesign?.source === 'piece' &&
              card.slideDesign?.coverLayoutId &&
              COVER_LAYOUT_PIECES[card.slideDesign.coverLayoutId] && (
                <CoverDecoration layoutId={card.slideDesign.coverLayoutId} width={W} height={H} />
              )}
            <FreeformLayer
              blocks={card.freeform ?? []}
              onChange={() => {}}
              cardWidth={W}
              cardHeight={H}
              interactive={false}
              slideDesign={card.slideDesign}
              regionBgHex={card.style === 'dark' ? '#1a1a3e' : (isHex(theme.cardBg) ? theme.cardBg : '#ffffff')}
              themeBodyHex={isHex(theme.bodyColor) ? theme.bodyColor : undefined}
              themeTitleHex={isHex(theme.headingColor) ? theme.headingColor : undefined}
            />
          </div>
        ))}
      </div>
    </>
  );
}
