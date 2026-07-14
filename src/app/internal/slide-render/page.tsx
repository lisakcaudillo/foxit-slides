'use client';

/**
 * /internal/slide-render — the headless render target for the Design critic's
 * render-to-image step. A server-side Puppeteer page navigates here with a
 * ?token=, fetches the card+theme from /api/internal/slide-render, and draws the
 * REAL SlideStage (the same FreeformLayer the editor renders) so the captured
 * PNG matches exactly what the user sees. Puppeteer screenshots #slide-capture-root.
 *
 * Reads the token from window.location (not useSearchParams) so it needs no
 * Suspense boundary. Internal only — not linked from the product.
 */
import { useEffect, useState } from 'react';
import { SlideStage } from '@/components/card-template/SlideStage';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import type { Card, TemplateTheme } from '@/types/card-template';

const W = 960;
const H = 540;

export default function SlideRenderPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [theme, setTheme] = useState<TemplateTheme | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setMissing(true);
      return;
    }
    fetch(`/api/internal/slide-render?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Deck form (`cards`) or single-card form (`card`) — normalize to an array.
        const list: Card[] | null = d?.cards?.length ? d.cards : d?.card ? [d.card] : null;
        if (list && d.theme) {
          setCards(list);
          setTheme(d.theme);
        } else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, []);

  const ready = !!cards && !!theme;
  // A stable signal Puppeteer can wait on: the root flips data-ready true once
  // ALL slides have data and are mounted. Each slide is captured from its own
  // #slide-capture-<i> element, so one page load renders the whole deck and the
  // headless renderer screenshots each region — no page-load per slide.
  return (
    <div
      id="slide-capture-root"
      data-ready={ready ? 'true' : 'false'}
      data-missing={missing ? 'true' : 'false'}
      data-count={cards?.length ?? 0}
      style={{ width: W, background: '#fff' }}
    >
      {/* Load every skin font so the headless capture renders the real typeface
          (Roboto / Work Sans / Inter / Fraunces) instead of a serif fallback. */}
      <GoogleFonts fonts={['Inter', 'Roboto', 'Work Sans', 'Fraunces']} />
      {ready &&
        cards!.map((card, i) => (
          <div
            key={i}
            id={`slide-capture-${i}`}
            style={{ width: W, height: H, overflow: 'hidden', background: '#fff' }}
          >
            <SlideStage card={card} theme={theme!} width={W} height={H} />
          </div>
        ))}
    </div>
  );
}
