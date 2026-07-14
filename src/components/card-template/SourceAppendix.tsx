'use client';

/**
 * SourceAppendix — print-only slide listing source citations.
 *
 * E-10 of Phase E. Rendered in CardEditor below the deck; hidden by
 * default (`display: none`), shown only via `@media print` and only
 * when the user opts into source-appendix export from the Export rail.
 *
 * No on-screen presence — this is purely a print artifact. The
 * existing on-screen Inspector source section (E-9) is where users
 * read citations during editing.
 */

import type { Card, CardTemplate } from '@/types/card-template';

const CLAIM_LABEL: Record<'verbatim' | 'paraphrase' | 'derived', string> = {
  verbatim: 'Quoted',
  paraphrase: 'Paraphrased',
  derived: 'Derived',
};

interface SourceAppendixProps {
  template: CardTemplate;
  cards: Card[];
  /**
   * When true, the appendix is included in printed output. When false,
   * the appendix DOM is omitted entirely so it doesn't appear in print.
   */
  include: boolean;
}

export default function SourceAppendix({ template, cards, include }: SourceAppendixProps) {
  if (!include) return null;
  const sources = template.sources;
  if (!sources || sources.length === 0) return null;

  const citations = cards
    .map((card, i) => ({ card, slideNumber: i + 1 }))
    .filter((entry) => entry.card.provenance);

  if (citations.length === 0) return null;

  return (
    <div
      className="compose-source-appendix"
      aria-hidden="true"
      style={{
        // Hidden on screen by default; visible only in print.
        display: 'none',
      }}
    >
      <style>{`
        @media print {
          .compose-source-appendix {
            display: block !important;
            page-break-before: always;
            padding: 64px 72px;
            font-family: Inter, system-ui, -apple-system, sans-serif;
            color: #1e293b;
            font-size: 11pt;
            line-height: 1.55;
          }
          .compose-source-appendix h2 {
            font-size: 22pt;
            font-weight: 700;
            margin: 0 0 4pt;
            color: #0f172a;
          }
          .compose-source-appendix .subtitle {
            font-size: 11pt;
            color: #64748b;
            margin: 0 0 32pt;
          }
          .compose-source-appendix .section-title {
            font-size: 9pt;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #64748b;
            margin: 24pt 0 8pt;
          }
          .compose-source-appendix .src-row {
            display: flex;
            gap: 12pt;
            padding: 8pt 0;
            border-top: 0.5pt solid #cbd5e1;
          }
          .compose-source-appendix .src-row .glyph {
            width: 32pt;
            min-width: 32pt;
            height: 40pt;
            border: 0.75pt solid #94a3b8;
            border-radius: 2pt;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 7pt;
            font-weight: 700;
            letter-spacing: 0.05em;
            color: #475569;
          }
          .compose-source-appendix .src-row .meta .filename {
            font-weight: 600;
            font-size: 11pt;
            color: #1e293b;
          }
          .compose-source-appendix .src-row .meta .secondary {
            font-size: 9.5pt;
            color: #64748b;
            margin-top: 2pt;
          }
          .compose-source-appendix .cite-row {
            padding: 6pt 0;
            border-top: 0.5pt solid #e2e8f0;
            display: grid;
            grid-template-columns: 56pt 1fr;
            gap: 12pt;
            align-items: baseline;
          }
          .compose-source-appendix .cite-row .slide-num {
            font-size: 10pt;
            font-weight: 600;
            color: #475569;
          }
          .compose-source-appendix .cite-row .cite {
            font-size: 10pt;
            color: #1e293b;
          }
          .compose-source-appendix .cite-row .cite .claim {
            color: #64748b;
            margin-left: 8pt;
            font-size: 9pt;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .compose-source-appendix .cite-row .cite .section-ref {
            color: #64748b;
            font-style: italic;
            margin-left: 8pt;
          }
        }
      `}</style>
      <h2>Sources</h2>
      <p className="subtitle">
        This deck was generated with source-grounded provenance per slide. The references
        below trace each slide back to its source content.
      </p>

      <div className="section-title">Source documents</div>
      {sources.map((s) => (
        <div key={s.id} className="src-row">
          <div className="glyph">
            {s.fileType === 'docx' ? 'DOC' : s.fileType === 'pptx' ? 'PPT' : s.fileType === 'image' ? 'IMG' : 'PDF'}
          </div>
          <div className="meta">
            <div className="filename">{s.filename}</div>
            <div className="secondary">
              {s.pageCount} page{s.pageCount === 1 ? '' : 's'} · uploaded{' '}
              {new Date(s.uploadedAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      ))}

      <div className="section-title">Per-slide citations</div>
      {citations.map(({ card, slideNumber }) => {
        const prov = card.provenance!;
        const source = sources.find((s) => s.id === prov.sourceDocId);
        const pages = prov.sourcePages.join(', ');
        return (
          <div key={card.id} className="cite-row">
            <div className="slide-num">Slide {slideNumber}</div>
            <div className="cite">
              {source ? source.filename : '(source unavailable)'}
              {' — '}
              page{prov.sourcePages.length === 1 ? '' : 's'} {pages}
              <span className="claim">{CLAIM_LABEL[prov.claimType]}</span>
              {prov.sourceSection && <span className="section-ref">{prov.sourceSection}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
