'use client';

/**
 * /internal/structure-preview — fidelity harness for the manifest-driven
 * structure templates. Builds a layout+skin deck via buildStructureTemplate and
 * draws card[0] through the REAL SlideStage (same FreeformLayer the editor uses)
 * at a fixed 960×540 — no editor chrome, no scaling — so a captured render can be
 * measured slot-by-slot against the Figma frame geometry.
 *
 * Internal only — structure templates are backend; this is NOT linked from the
 * product and surfaces nothing in any gallery. Query: ?layout=05-content&skin=mono-light
 *
 * ?metrics=N (02-stat only): synthesize a representative N-metric fill so the
 * count-adaptive stat geometry (Option A) can be eyeballed for N = 1..4. Absent →
 * the no-fill placeholder render (original behaviour).
 */

import { useEffect, useState } from 'react';
import { SlideStage } from '@/components/card-template/SlideStage';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import { buildStructureTemplate, type StructureFill } from '@/data/structureTemplates';
import type { Card, TemplateTheme } from '@/types/card-template';

const W = 960;
const H = 540;

// Representative stat metrics for the ?metrics=N harness (02-stat).
const STAT_DEMO = [
  { v: '3.4×', l: 'Faster onboarding', d: '↑ 1.2×' },
  { v: '256', l: 'Active integrations', d: '↑ 18' },
  { v: '94%', l: 'Customer retention', d: '↑ 4 pts' },
  { v: '2.3×', l: 'Pipeline velocity', d: '↑ 0.6×' },
];

function statDemoFill(n: number): StructureFill {
  const picked = STAT_DEMO.slice(0, Math.max(1, Math.min(4, n)));
  const [hero, ...subs] = picked;
  return {
    'eyebrow-label:': 'BY THE NUMBERS',
    'metric-value:hero': hero.v,
    'metric-label:hero': hero.l,
    'delta:hero': hero.d,
    'metric-value:sub': subs.map((m) => m.v),
    'metric-label:sub': subs.map((m) => m.l),
    'delta:sub': subs.map((m) => m.d),
  };
}

export default function StructurePreviewPage() {
  const [data, setData] = useState<{ card: Card; theme: TemplateTheme } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const layout = q.get('layout') ?? '05-content';
    const skin = q.get('skin') ?? 'mono-light';
    const metricsParam = q.get('metrics');
    // Optional cover content override (?t=&st=&au=&dt=) so a real-content cover can
    // be previewed alongside the placeholder template, both via the real engine.
    const t = q.get('t'), st = q.get('st'), au = q.get('au'), dt = q.get('dt');
    let coverFill: StructureFill | undefined;
    if (t || st || au || dt) {
      coverFill = {};
      if (t) coverFill['title:cover-title'] = t;
      if (st) coverFill['title:cover-subtitle'] = st;
      if (au) coverFill['author:'] = au;
      if (dt) coverFill['date:'] = dt;
    }
    const fill = metricsParam && layout === '02-stat'
      ? statDemoFill(parseInt(metricsParam, 10) || 1)
      : coverFill;
    try {
      const tpl = buildStructureTemplate(layout, skin, fill);
      setData({ card: tpl.cards[0], theme: tpl.theme });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <>
      {/* Load the skin's display + body fonts so the preview render (and any
          headless screenshot of it) uses the real theme typography, not a
          serif fallback. */}
      <GoogleFonts fonts={data ? [data.theme.headingFont, data.theme.bodyFont].filter((f): f is string => !!f) : []} />
      <div
        id="slide-capture-root"
        data-ready={data ? 'true' : 'false'}
        data-error={error ?? ''}
        style={{ width: W, height: H, overflow: 'hidden', background: '#fff' }}
      >
        {data && <SlideStage card={data.card} theme={data.theme} width={W} height={H} />}
      </div>
    </>
  );
}
