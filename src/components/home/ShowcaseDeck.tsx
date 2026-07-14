'use client';

/**
 * ShowcaseDeck — the hero title slide + glass back card + hover tilt/sheen
 * and the click-to-expand 8-layout gallery, ported from the approved
 * prototype (`app/public/design-table/home-generation/manager-v5.html`).
 *
 * The deck card is click-to-expand (Enter/Space too); hover keeps the 3D
 * tilt + sheen. The gallery grows downward as its own section so it never
 * collides with the prompt card. Collapse via ✕ / Esc / click-again.
 * Reduced-motion is handled by the `.home-gen` scoped CSS.
 *
 * All mini example slides are pure markup mirroring how the engine composes
 * each layout (see card-engine/compositions.ts) — no placeholder gray boxes.
 */

import { useEffect } from 'react';

export default function ShowcaseDeck({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="hg-deck-stage">
        {/* Glass back card behind the hero slide. */}
        <div className="hg-deck-ghost" aria-hidden="true">
          <div className="hg-ghost-cols">
            <div className="hg-ghost-col">
              <span className="cap" />
              <span className="ln" />
              <span className="ln short" />
            </div>
            <div className="hg-ghost-col">
              <span className="cap" />
              <span className="ln" />
              <span className="ln short" />
            </div>
          </div>
        </div>

        {/* Hero title slide — click expands the layout gallery. */}
        <div
          className="hg-deck-card"
          tabIndex={0}
          role="button"
          aria-expanded={open}
          aria-controls="hg-layout-gallery"
          aria-label="Featured deck: Series A — Northwind. Click to see supported layouts."
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          <span className="hg-sheen" aria-hidden="true" />
          <div className="hg-cover">
            <span className="hg-glow" aria-hidden="true" />
            <span className="hg-accentbar" aria-hidden="true" />
            <div className="hg-c-eyebrow">Confidential · 2026</div>
            <h2 className="hg-c-title">
              Your <span className="em">title</span> here
            </h2>
            <div className="hg-c-rule" />
            <div className="hg-c-metrics">
              <div className="hg-chip">
                <span className="n">+38%</span>
                <span className="l">Net retention</span>
              </div>
              <div className="hg-chip">
                <span className="n">2.4×</span>
                <span className="l">ARR growth</span>
              </div>
              <div className="hg-chip">
                <span className="n">$4.2M</span>
                <span className="l">Pipeline</span>
              </div>
            </div>
            <div className="hg-c-foot">NORTHWIND</div>
          </div>
        </div>

        {/* Quiet click affordance shown on hover/focus. */}
        <button
          className="hg-see-layouts"
          type="button"
          aria-controls="hg-layout-gallery"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="7" height="7" rx="1" />
            <rect x="14" y="4" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="6" rx="1" />
            <rect x="14" y="14" width="7" height="6" rx="1" />
          </svg>
          See layouts
        </button>

        <div className="hg-showcap">
          <b>Northwind — Series A</b> · made with Foxit Slides
        </div>
    </div>
  );
}

export function LayoutGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Esc closes the gallery when open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <section
      id="hg-layout-gallery"
      className={`hg-layout-gallery${open ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      <div className="hg-lg-inner">
        <div className="hg-lg-head">
          <div className="hg-lg-titlewrap">
            <h3>Layouts Foxit Slides supports</h3>
            <span className="sub">
              Every page is auto-composed from your content — here&apos;s the range.
            </span>
          </div>
          <button
            className="hg-lg-close"
            type="button"
            aria-label="Close layouts"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="hg-lg-grid">
          {/* 1 — Cover / Title */}
          <GalleryItem caption="Cover / Title">
            <div className="hg-mini m-cover">
              <div className="m-eyebrow">Confidential · 2026</div>
              <div className="m-title">
                Series A,
                <br />
                <span className="em">reimagined.</span>
              </div>
              <div className="m-rule" />
              <div className="m-sub">Northwind — investor briefing</div>
            </div>
          </GalleryItem>

          {/* 2 — Big Stat */}
          <GalleryItem caption="Big Stat">
            <div className="hg-mini m-stat">
              <div className="m-eyebrow">Net revenue retention</div>
              <div className="big">+38%</div>
              <div className="lbl">Year over year</div>
              <div className="supp">
                Driven by expansion in enterprise accounts and lower churn.
              </div>
            </div>
          </GalleryItem>

          {/* 3 — Comparison (2-col) */}
          <GalleryItem caption="Comparison (2-col)">
            <div className="hg-mini m-cmp">
              <div className="col a">
                <div className="hd">
                  <span>Starter</span>
                </div>
                <div className="rows">
                  <div className="rw">
                    <span className="tk" />
                    <span className="ln" />
                  </div>
                  <div className="rw">
                    <span className="tk" />
                    <span className="ln s" />
                  </div>
                  <div className="rw">
                    <span className="tk" />
                    <span className="ln" />
                  </div>
                </div>
              </div>
              <div className="vs">VS</div>
              <div className="col b">
                <div className="hd">
                  <span>Pro</span>
                </div>
                <div className="rows">
                  <div className="rw">
                    <span className="tk" />
                    <span className="ln" />
                  </div>
                  <div className="rw">
                    <span className="tk" />
                    <span className="ln s" />
                  </div>
                  <div className="rw">
                    <span className="tk" />
                    <span className="ln" />
                  </div>
                </div>
              </div>
            </div>
          </GalleryItem>

          {/* 4 — Process (steps) */}
          <GalleryItem caption="Process (steps)">
            <div className="hg-mini m-proc">
              <div className="m-eyebrow">How it works</div>
              <div className="row">
                <div className="stp">
                  <span className="dot">1</span>
                  <span className="lb">Discover</span>
                  <span className="cap">Map the landscape</span>
                </div>
                <div className="stp">
                  <span className="dot">2</span>
                  <span className="lb">Design</span>
                  <span className="cap">Shape the plan</span>
                </div>
                <div className="stp">
                  <span className="dot">3</span>
                  <span className="lb">Build</span>
                  <span className="cap">Ship the work</span>
                </div>
                <div className="stp">
                  <span className="dot">4</span>
                  <span className="lb">Launch</span>
                  <span className="cap">Go to market</span>
                </div>
              </div>
            </div>
          </GalleryItem>

          {/* 5 — Columns / Icon-grid */}
          <GalleryItem caption="Columns / Icon-grid">
            <div className="hg-mini m-grid">
              <div className="m-eyebrow">What you get</div>
              <div className="gg">
                <div className="cell">
                  <span className="ic" />
                  <span className="hl" />
                  <span className="gl" />
                </div>
                <div className="cell">
                  <span className="ic" />
                  <span className="hl" />
                  <span className="gl s" />
                </div>
                <div className="cell">
                  <span className="ic" />
                  <span className="hl" />
                  <span className="gl" />
                </div>
              </div>
            </div>
          </GalleryItem>

          {/* 6 — Diagram */}
          <GalleryItem caption="Diagram">
            <div className="hg-mini m-diag">
              <div className="m-eyebrow">How it flows</div>
              <div className="canvas">
                <span className="edge e1" />
                <span className="edge e2" />
                <span className="edge e3" />
                <div className="hub">
                  <span>Core</span>
                </div>
                <div className="node n1">
                  <span>Inputs</span>
                </div>
                <div className="node n2">
                  <span>Outputs</span>
                </div>
                <div className="node n3">
                  <span>Data</span>
                </div>
              </div>
            </div>
          </GalleryItem>

          {/* 7 — Pull-quote */}
          <GalleryItem caption="Pull-quote">
            <div className="hg-mini m-quote">
              <span className="tick" />
              <span className="mark">&ldquo;</span>
              <div className="q">The deck wrote itself — we just told it the story.</div>
              <div className="by">— Maya Chen, Northwind</div>
            </div>
          </GalleryItem>

          {/* 8 — Image-split */}
          <GalleryItem caption="Image-split">
            <div className="hg-mini m-split">
              <div className="lp">
                <div className="m-eyebrow">In context</div>
                <span className="st">Built for the way you present</span>
                <div className="pt">
                  <span className="tk" />
                  <span className="ln" />
                </div>
                <div className="pt">
                  <span className="tk" />
                  <span className="ln s" />
                </div>
              </div>
              <div className="rp" />
            </div>
          </GalleryItem>
        </div>
      </div>
    </section>
  );
}

function GalleryItem({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hg-lg-item">
      <div className="hg-lg-frame">{children}</div>
      <div className="hg-lg-cap">{caption}</div>
    </div>
  );
}
