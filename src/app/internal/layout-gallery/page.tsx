'use client';

/**
 * /internal/layout-gallery — a labeled gallery of EVERY slide layout category
 * (cover / content / data / quote / divider / closing + the content variants),
 * each rendered through the REAL engine (buildStructureTemplate → SlideStage) so
 * it can decide the background treatment per category.
 *
 * Query: ?skin=mono-light (default). Internal only — not linked from the product.
 */

import { useEffect, useMemo, useState } from 'react';
import { SlideStage } from '@/components/card-template/SlideStage';
import GoogleFonts from '@/components/card-template/GoogleFonts';
import { buildStructureTemplate, imageSlotsFor, type StructureFill } from '@/data/structureTemplates';
import type { Card, TemplateTheme } from '@/types/card-template';

const W = 960;
const H = 540;
const SCALE = 0.5;
const IMG = '/theme-examples/winter-lake.webp';

type Entry = { category: string; layout: string; fill: StructureFill };

const ENTRIES: Entry[] = [
  { category: 'COVER', layout: 'combo-cover', fill: {
    'title:': 'Your title goes here', 'body:lead': 'A short supporting line for the cover.',
    'author:': 'Presenter name', 'date:': 'Month 2026' } },

  { category: 'CONTENT · prose', layout: 'combo-body-1', fill: {
    'eyebrow-label:': 'SECTION', 'title:': 'Your title goes here',
    'body:lead': 'A short lead line that frames the idea.',
    'subheader:s1': 'A subheading', 'body:p1': 'A short paragraph of supporting body text explaining the idea in a little more detail.' } },

  { category: 'CONTENT · cards', layout: 'combo-cards-3', fill: {
    'eyebrow-label:': 'SECTION', 'title:': 'Your title goes here',
    'body:lead': 'A short line that frames the points below.',
    'metric-label:item-title': ['Point one', 'Point two', 'Point three'],
    'body:item-body': ['Supporting detail for the first point.', 'Supporting detail for the second point.', 'Supporting detail for the third point.'] } },

  { category: 'CONTENT · icons', layout: '11-infographic', fill: {
    'eyebrow-label:': 'HOW IT WORKS', 'title:': 'Your title goes here',
    'metric-label:card-title': ['Discover', 'Design', 'Deliver'],
    'body:card-body': ['A short line about this step.', 'A short line about this step.', 'A short line about this step.'] } },

  { category: 'CONTENT · image', layout: 'combo-body-image-2', fill: {
    'eyebrow-label:': 'OVERVIEW', 'title:': 'Your title goes here',
    'subheader:s1': 'First point', 'body:p1': 'A short supporting line explaining the first point beside the image.',
    'subheader:s2': 'Second point', 'body:p2': 'A short supporting line explaining the second point.' } },

  { category: 'CONTENT · agenda', layout: 'combo-agenda-4', fill: {
    'eyebrow-label:': 'AGENDA', 'title:': 'Your title goes here',
    'metric-value:item-number': ['01', '02', '03', '04'],
    'metric-label:agenda-title': ['First topic', 'Second topic', 'Third topic', 'Fourth topic'],
    'body:agenda-desc': ['A short line.', 'A short line.', 'A short line.', 'A short line.'] } },

  { category: 'CONTENT · statement', layout: 'combo-statement', fill: {
    'eyebrow-label:': 'STATEMENT', 'title:': 'A bold statement that lands the single most important idea.',
    'statement:': 'A bold statement that lands the single most important idea.',
    'body:subhead': 'A short supporting line beneath the statement.' } },

  { category: 'DATA · metrics', layout: 'combo-metrics-3', fill: {
    'eyebrow-label:': 'KEY METRICS', 'title:': 'Your title goes here',
    'body:lead': 'A short line for the numbers below.',
    'metric-value:hero': ['3.4×', '256', '94%'],
    'metric-label:hero': ['Primary metric', 'Active integrations', 'Retention'] } },

  { category: 'DATA · table', layout: 'combo-table-rows-5', fill: {
    'eyebrow-label:': 'RESULTS', 'title:': 'Your title goes here',
    'subheader:table-head': 'A short table caption',
    'metric-label:thead': ['Metric', 'Before', 'After'],
    'metric-label:row-label': ['Revenue', 'Users', 'Retention', 'NPS', 'Churn'],
    'body:cell-1': ['$2.1M', '1,240', '88%', '42', '6.1%'],
    'body:cell-2': ['$4.2M', '3,180', '94%', '58', '3.4%'] } },

  { category: 'DATA · timeline', layout: 'combo-timeline-4', fill: {
    'eyebrow-label:': 'ROADMAP', 'title:': 'Your title goes here',
    'metric-value:milestone-date': ['Q1', 'Q2', 'Q3', 'Q4'],
    'body:milestone-desc': ['Discovery and scoping.', 'Build the core.', 'Beta and iterate.', 'Launch and scale.'] } },

  { category: 'QUOTE', layout: 'combo-quote', fill: {
    'title:quote': 'A short, memorable pull-quote that carries the moment.',
    'metric-label:attribution': 'Jane Doe', 'body:attribution-role': 'Title, Company' } },

  { category: 'DIVIDER', layout: 'combo-divider', fill: {
    'metric-value:section-number': '02', 'title:divider-title': 'Section title goes here' } },

  { category: 'CLOSING', layout: 'combo-closing', fill: {
    'title:closing-title': 'Thank you', 'body:lead': 'A short closing line.',
    'body:cta-label': 'Get in touch', 'body:footer': 'hello@company.com' } },
];

export default function LayoutGalleryPage() {
  const [skin, setSkin] = useState('mono-light');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSkin(q.get('skin') ?? 'mono-light');
  }, []);

  const built = useMemo(() => {
    return ENTRIES.map((e) => {
      try {
        const tpl = buildStructureTemplate(e.layout, skin, e.fill);
        const card = tpl.cards[0];
        if (!card) return null;
        const imgSlots = imageSlotsFor(e.layout, skin);
        if (imgSlots.length) {
          card.freeform = [
            ...(card.freeform ?? []),
            ...imgSlots.map((s, si) => ({
              id: `gal-img-${si}`, type: 'image' as const,
              x: (s.x / W) * 100, y: (s.y / H) * 100, w: (s.w / W) * 100, h: (s.h / H) * 100,
              rotation: 0, z: 5, src: IMG, fit: 'cover' as const,
            })),
          ];
        }
        return { e, card, theme: tpl.theme };
      } catch (err) {
        return { e, error: err instanceof Error ? err.message : String(err) } as { e: Entry; error: string };
      }
    });
  }, [skin]);

  const fonts = useMemo(() => {
    const set = new Set<string>();
    for (const b of built) {
      if (b && 'theme' in b && b.theme) {
        const t = b.theme as TemplateTheme;
        if (t.headingFont) set.add(t.headingFont);
        if (t.bodyFont) set.add(t.bodyFont);
      }
    }
    return [...set];
  }, [built]);

  return (
    <div style={{ padding: 28, background: '#f6f7f9', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <GoogleFonts fonts={fonts} />
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Layout categories — <span style={{ color: '#6b3fa0' }}>{skin}</span></h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          Every layout type through the real engine. Switch skins with <code>?skin=obsidian</code> etc. Decide a background per category.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${W * SCALE}px, 1fr))`, gap: 24 }}>
        {built.map((b, i) => (
          <div key={i}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#0f172a', marginBottom: 6 }}>
              {b?.e.category} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {b?.e.layout}</span>
            </div>
            {b && 'card' in b ? (
              <div style={{ width: W * SCALE, height: H * SCALE, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ width: W, height: H, transformOrigin: 'top left', transform: `scale(${SCALE})` }}>
                  <SlideStage card={(b as { card: Card }).card} theme={(b as { theme: TemplateTheme }).theme} width={W} height={H} />
                </div>
              </div>
            ) : (
              <div style={{ width: W * SCALE, height: H * SCALE, borderRadius: 8, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, padding: 12, textAlign: 'center' }}>
                {(b as { error?: string })?.error ?? 'no build'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
