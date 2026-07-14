// ── DataAvailabilityNotice — in-editor data-availability ask (DORMANT) ────────
//
// SCAFFOLD — NOT an active feature, NOT mounted anywhere yet.
// Created 2026-06-10 ("move it to the editor, but not as an active
// feature"). This is the relocation target for Clarify's one durable job: when
// a slide's plan wants real figures the prompt didn't supply, ask — in context,
// on the slide — instead of blocking generation with an upfront modal (now off,
// see editor/slides/page.tsx CLARIFY_GATE_ENABLED).
//
// Why this shape (research-validated 2026-06-10): no mainstream deck tool asks
// "do you HAVE the data?" — they fabricate (Gamma inflates, Copilot ~41%
// fabricated, Beautiful.ai doubled a market size). The only honest precedent
// (old Tome's visible placeholders) shut down. So the open lane is: ask about
// AVAILABILITY and route the user, never interrogate for a raw number. The
// three routes below compose three confirmed UX principles — defer non-
// essential input, offer 2–4 scoped options (not a demand), progressive
// disclosure. See docs/requirements/clarify-orchestrator-refactor-spec.md.
//
// VISUAL DESIGN IS PENDING A DESIGN-TABLE before this is activated. The markup
// here is a structural placeholder (neutral, minimal) — it encodes the model,
// not the final look. Activating means: (1) design-table the surface, (2) mount
// it in the per-slide inspector / SlideToolPanel for slides whose plan carries
// unmet figure needs, (3) wire the routes into the two-phase generate flow
// (paste → grounded data; later → honest labeled placeholder; illustrative →
// clearly-marked sample). The needs come from deriveDataNeeds(deckPlan, ...).

'use client';

import { useState } from 'react';
import type { DataNeed } from '@/lib/card-engine/data-needs';

/** How the user chose to resolve a slide's figure needs. */
export type DataAvailabilityChoice = 'paste' | 'later' | 'illustrative';

export interface DataAvailabilityNoticeProps {
  /** The figures this slide wants, from deriveDataNeeds(). */
  needs: DataNeed[];
  /** User pasted/typed real values, keyed by DataNeed.id. Route: grounded data. */
  onPaste?: (values: Record<string, string>) => void;
  /** User defers — render honest, clearly-labeled fill-in placeholders. */
  onDefer?: () => void;
  /** User opts into clearly-marked illustrative/sample numbers. */
  onIllustrative?: () => void;
}

/**
 * DORMANT scaffold. Renders the availability ask for a single slide's figure
 * needs with the three validated routes. Not mounted; visual design pending.
 */
export function DataAvailabilityNotice({
  needs,
  onPaste,
  onDefer,
  onIllustrative,
}: DataAvailabilityNoticeProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);

  if (needs.length === 0) return null;

  const slideTitle = needs[0]?.slideTitle ?? 'this slide';

  return (
    <section
      aria-label="Data availability"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        fontSize: 14,
        color: '#0f172a',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        “{slideTitle}” works best with real numbers. Do you have them?
      </p>

      {/* Progressive disclosure — the paste fields appear only on request. */}
      {expanded ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {needs.map((need) => (
            <label key={need.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: '#475569' }}>{need.label}</span>
              <input
                type="text"
                placeholder={need.placeholder}
                value={values[need.id] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [need.id]: e.target.value }))
                }
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 14,
                }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={() => onPaste?.(values)}>
              Use these numbers
            </button>
            <button type="button" onClick={() => setExpanded(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setExpanded(true)}>
            I&apos;ll paste them
          </button>
          <button type="button" onClick={() => onDefer?.()}>
            Leave fillable spots
          </button>
          <button type="button" onClick={() => onIllustrative?.()}>
            Use illustrative numbers
          </button>
        </div>
      )}
    </section>
  );
}

export default DataAvailabilityNotice;
