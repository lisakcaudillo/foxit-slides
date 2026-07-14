import { NextResponse } from 'next/server';
import { buildStructureTemplate, describeLayoutSlots, registerRuntimeLayout, imageSlotsFor } from '@/data/structureTemplates';
import { fitCardText } from '@/lib/card-engine/text-fit';
import { buildCombo } from '@/lib/card-engine/combo-baseline';

// TEMP verify route (delete after — gotcha #34). Renders a combo either from the
// SAVED manifest key (?key=combo-cards-3 → the persisted combo-layouts.json geometry)
// or live from a spec (?content=cards&count=N) via the shared buildCombo module.

const FRAC = { concise: 0.45, detailed: 0.72, extensive: 0.88 };
const LOREM =
  'A retrospective turns a finished sprint into concrete improvements the team can act on next week, naming what worked, what stalled, and the one change worth trying, in plain language everyone shares and owns together going forward from here.';
const fillTo = (n: number) => {
  let s = '';
  while (s.length < n) s += (s ? ' ' : '') + LOREM;
  return s.slice(0, Math.max(4, n)).replace(/\s+\S*$/, '') + '.';
};

export async function GET(req: Request) {
  const u = new URL(req.url);
  const density = (u.searchParams.get('density') || 'detailed') as 'concise' | 'detailed' | 'extensive';
  const skin = u.searchParams.get('skin') || 'mono-light';
  const byDensity = density === 'concise' ? 2 : density === 'extensive' ? 4 : 3;

  const variant = u.searchParams.get('variant') || '';
  const STATEMENT = 'A retrospective turns a finished sprint into concrete, shared improvements the team owns.';

  let key = u.searchParams.get('key') || '';
  if (variant === 'statement') {
    // Single-key-point layout WITHOUT a card box: a large ink statement (Fraunces,
    // via title:quote) on the left, genuinely-subordinate muted supporting copy on
    // the right. Fixes combo-cards-1's inverted hierarchy + faux-card.
    key = '__statement';
    const shared = [
      { role: 'eyebrow-label', x: 48, y: 52, w: 200, h: 16, size: 13 },
      { role: 'title', x: 48, y: 88, w: 864, h: 44, size: 36 },
      { role: 'title', group: 'quote', x: 48, y: 188, w: 422, h: 190, size: 25, budget: { concise: 70, detailed: 118, extensive: 150 } },
      { role: 'body', group: 'subhead', x: 490, y: 194, w: 422, h: 190, size: 16, budget: { concise: 150, detailed: 240, extensive: 300 } },
    ];
    const decorations = [
      { role: 'accent-bar', shape: 'rectangle' as const, x: 48, y: 168, w: 40, h: 3, fillToken: 'ink' as const, fillOpacity: 1 },
    ];
    registerRuntimeLayout(key, { shared }, decorations);
  } else if (variant === 'stat') {
    // Single-METRIC layout — the one case a card box is justified: it frames a real
    // number. Big metric value + caption inside the card; muted support on the right.
    key = '__stat';
    const shared = [
      { role: 'eyebrow-label', x: 48, y: 52, w: 200, h: 16, size: 13 },
      { role: 'title', x: 48, y: 88, w: 864, h: 44, size: 36 },
      { role: 'metric-value', group: 'hero', x: 64, y: 214, w: 390, h: 84, size: 66 },
      { role: 'metric-label', group: 'hero', x: 64, y: 312, w: 390, h: 44, size: 16, budget: { concise: 40, detailed: 40, extensive: 40 } },
      { role: 'body', group: 'subhead', x: 490, y: 200, w: 422, h: 180, size: 16, budget: { concise: 150, detailed: 240, extensive: 300 } },
    ];
    const decorations = [
      { role: 'card', shape: 'rectangle' as const, x: 48, y: 188, w: 422, h: 190, radius: 2, fillToken: 'surface' as const, fillOpacity: 1, strokeToken: 'ink' as const, strokeOpacity: 0.14, strokeWeight: 1 },
      { role: 'accent-bar', shape: 'rectangle' as const, x: 64, y: 204, w: 30, h: 3, fillToken: 'ink' as const, fillOpacity: 1 },
    ];
    registerRuntimeLayout(key, { shared }, decorations);
  } else if (variant === 'stathug') {
    // Stat fix A — HUG: card sized to the number (not the 2-card grid), content
    // centered, support column widened to absorb the freed space.
    key = '__stathug';
    const shared = [
      { role: 'eyebrow-label', x: 48, y: 52, w: 200, h: 16, size: 13 },
      { role: 'title', x: 48, y: 88, w: 864, h: 44, size: 36 },
      { role: 'metric-value', group: 'hero', x: 48, y: 236, w: 300, h: 84, size: 84, align: 'center' },
      { role: 'metric-label', group: 'hero', x: 48, y: 328, w: 300, h: 24, size: 15, align: 'center', budget: { concise: 34, detailed: 34, extensive: 34 } },
      { role: 'body', group: 'subhead', x: 384, y: 200, w: 528, h: 180, size: 16, budget: { concise: 180, detailed: 300, extensive: 380 } },
    ];
    const decorations = [
      { role: 'card', shape: 'rectangle' as const, x: 48, y: 194, w: 300, h: 176, radius: 2, fillToken: 'surface' as const, fillOpacity: 1, strokeToken: 'ink' as const, strokeOpacity: 0.14, strokeWeight: 1 },
      { role: 'accent-bar', shape: 'rectangle' as const, x: 183, y: 214, w: 30, h: 3, fillToken: 'ink' as const, fillOpacity: 1 },
    ];
    registerRuntimeLayout(key, { shared }, decorations);
  } else if (variant === 'statfill') {
    // Stat fix B — FILL: keep the 2-card width, but center a hero-scale number so
    // it commands the box instead of hugging the left edge.
    key = '__statfill';
    const shared = [
      { role: 'eyebrow-label', x: 48, y: 52, w: 200, h: 16, size: 13 },
      { role: 'title', x: 48, y: 88, w: 864, h: 44, size: 36 },
      { role: 'metric-value', group: 'hero', x: 48, y: 222, w: 422, h: 104, size: 104, align: 'center' },
      { role: 'metric-label', group: 'hero', x: 48, y: 336, w: 422, h: 24, size: 15, align: 'center', budget: { concise: 34, detailed: 34, extensive: 34 } },
      { role: 'body', group: 'subhead', x: 490, y: 200, w: 422, h: 180, size: 16, budget: { concise: 150, detailed: 240, extensive: 300 } },
    ];
    const decorations = [
      { role: 'card', shape: 'rectangle' as const, x: 48, y: 188, w: 422, h: 190, radius: 2, fillToken: 'surface' as const, fillOpacity: 1, strokeToken: 'ink' as const, strokeOpacity: 0.14, strokeWeight: 1 },
      { role: 'accent-bar', shape: 'rectangle' as const, x: 244, y: 206, w: 30, h: 3, fillToken: 'ink' as const, fillOpacity: 1 },
    ];
    registerRuntimeLayout(key, { shared }, decorations);
  } else if (variant === 'bodysec') {
    // Sectioned body — density adds STRUCTURE (subheaders), not just chars:
    //   concise   → one paragraph, no subheader
    //   detailed  → subheader + paragraph            (concise + a header)
    //   extensive → two subheadered sections          (detailed + another section)
    key = '__bodysec';
    const eyebrow = { role: 'eyebrow-label', x: 48, y: 52, w: 200, h: 16, size: 13 };
    const title = { role: 'title', x: 48, y: 88, w: 864, h: 50, size: 36 };
    const sub = (y: number, g: string) => ({ role: 'subheader', group: g, x: 48, y, w: 864, h: 24, size: 18 });
    const para = (y: number, h: number, chars: number, g: string) => ({ role: 'body', group: g, x: 48, y, w: 864, h, size: 16, budget: { concise: chars, detailed: chars, extensive: chars } });
    let shared: Array<Record<string, unknown>>;
    if (density === 'concise') {
      shared = [eyebrow, title, para(170, 230, 430, 'p1')];
    } else if (density === 'detailed') {
      shared = [eyebrow, title, sub(170, 's1'), para(206, 210, 470, 'p1')];
    } else {
      shared = [eyebrow, title, sub(166, 's1'), para(200, 120, 300, 'p1'), sub(348, 's2'), para(382, 110, 280, 'p2')];
    }
    registerRuntimeLayout(key, { shared } as never, []);
  } else if (!key) {
    // Live spec path — build + register a throwaway layout.
    const count = u.searchParams.get('count') ? Number(u.searchParams.get('count')) : byDensity;
    const spec = { lead: u.searchParams.get('lead') !== 'false', content: { type: 'cards' as const, count } };
    key = '__combo';
    const { shared, decorations } = buildCombo(spec);
    registerRuntimeLayout(key, { shared }, decorations);
  }
  // else: render straight from the SAVED/merged manifest key (no build).

  // ?frac=locked recomputes text targets at the LOCKED density tiers (33/66/94)
  // from each slot's geometric charCap — for comparing against the saved budgets.
  const lockedFrac = u.searchParams.get('frac') === 'locked' ? { concise: 0.33, detailed: 0.66, extensive: 0.94 } : null;

  const SUBHEADS = ['What changed', 'Why it matters', 'What comes next'];
  let subIdx = 0;
  // Table demo data (prototype).
  const T_HEAD = ['Metric', '2022', '2023', '2024', '2025'];
  const T_ROWS = ['Revenue', 'Gross margin', 'Operating costs', 'Headcount', 'NPS', 'Churn', 'ARR'];
  const T_COLS = [
    ['$3.6M', '58%', '$1.5M', '118', '44', '5.8%', '$7.9M'],
    ['$4.2M', '61%', '$1.8M', '142', '48', '5.1%', '$9.3M'],
    ['$5.1M', '64%', '$2.0M', '168', '53', '4.4%', '$11.6M'],
    ['$6.4M', '66%', '$2.3M', '201', '57', '3.9%', '$14.2M'],
  ];
  const pick = (arr: string[], n: number) => Array.from({ length: n }, (_, i) => arr[i % arr.length]);

  const specs = describeLayoutSlots(key, skin);
  const fill: Record<string, string | string[]> = {};
  for (const s of specs) {
    if (s.group === 'table-head') { fill[s.key] = 'Year-over-year performance'; continue; }
    if (s.role === 'subheader') { fill[s.key] = SUBHEADS[subIdx++ % SUBHEADS.length]; continue; }
    if (s.group === 'column-header' || s.group === 'thead') { fill[s.key] = pick(T_HEAD, s.count); continue; }
    if (s.group === 'row-label') { fill[s.key] = pick(T_ROWS, s.count); continue; }
    if (s.group?.startsWith('cell-')) { const ci = (parseInt(s.group.slice(5), 10) - 1) % T_COLS.length; fill[s.key] = pick(T_COLS[ci], s.count); continue; }
    // Metrics row — distinct value + label per column.
    if (s.role === 'metric-value' && s.group === 'hero' && s.count > 1) { fill[s.key] = pick(['94%', '2.3×', '−18%', '+40%'], s.count); continue; }
    if (s.role === 'metric-label' && s.group === 'hero' && s.count > 1) { fill[s.key] = pick(['Adoption', 'Faster onboarding', 'Support cost', 'Net revenue'], s.count); continue; }
    // Agenda.
    if (s.group === 'item-number') { fill[s.key] = Array.from({ length: s.count }, (_, i) => String(i + 1).padStart(2, '0')); continue; }
    if (s.group === 'agenda-title') { fill[s.key] = pick(['Where we are', 'What changed', 'The approach', 'Early results', 'What comes next', 'How to get involved'], s.count); continue; }
    if (s.group === 'agenda-desc') { fill[s.key] = pick(['A quick read on today’s baseline.', 'The shift that prompted this work.', 'How we tackled it, in brief.', 'Signals from the first rollout.', 'The plan for the next quarter.', 'Where your input matters most.'], s.count); continue; }
    // Chrome layouts (cover / divider / closing / quote).
    if (s.role === 'author') { fill[s.key] = 'Jordan Ellis'; continue; }
    if (s.role === 'date') { fill[s.key] = 'March 2025'; continue; }
    if (s.group === 'section-number') { fill[s.key] = '03'; continue; }
    if (s.group === 'section-title' || s.group === 'divider-title') { fill[s.key] = 'What We Learned'; continue; }
    if (s.group === 'closing-title') { fill[s.key] = 'Let’s put it into practice'; continue; }
    if (s.group === 'quote') { fill[s.key] = 'The best retrospectives turn a finished sprint into one concrete change the whole team owns.'; continue; }
    if (s.group === 'cta-label') { fill[s.key] = 'Run your next retro this week'; continue; }
    if (s.group === 'footer') { fill[s.key] = 'Confidential · Compose 2025'; continue; }
    if (s.group === 'attribution') { fill[s.key] = 'Alex Rivera'; continue; }
    if (s.group === 'attribution-role') { fill[s.key] = 'VP Product, Contoso'; continue; }
    if (s.group === 'milestone-date') { fill[s.key] = pick(['Discovery', 'Design', 'Build', 'Launch', 'Scale'], s.count); continue; }
    if (s.group === 'milestone-desc') { fill[s.key] = pick(['Scope the problem and align on goals.', 'Prototype and validate the approach.', 'Ship the core build in stages.', 'Roll out to the first cohort.', 'Expand across every team.'], s.count); continue; }
    const budget = (s as { budget?: Record<string, number> }).budget;
    const target = lockedFrac
      ? Math.round(s.charCap * lockedFrac[density])
      : budget ? budget[density] : Math.round(s.charCap * FRAC[density]);
    const one =
      s.role === 'statement' || (s.role === 'title' && s.group === 'quote')
        ? STATEMENT
        : s.role === 'title'
          ? 'Running Effective Retrospectives'
          : s.role === 'eyebrow-label'
            ? 'PROCESS'
            : s.role === 'metric-value'
              ? '94%'
              : s.role === 'metric-label' && s.group === 'hero'
                ? 'Adoption rate after rollout'
                : s.role === 'metric-label'
                  ? 'Adoption rate'
                  : fillTo(target);
    fill[s.key] =
      s.count > 1
        ? Array.from({ length: s.count }, () => (s.role === 'metric-label' ? 'Adoption rate' : fillTo(target)))
        : one;
  }
  const built = buildStructureTemplate(key, skin, fill);
  const c2 = { ...built.cards[0], id: 'c-combo' };
  fitCardText(c2);
  // The builder skips image slots (filled at generation). For the prototype, draw a
  // neutral placeholder so the image region is visible in the composition.
  const imgSlots = imageSlotsFor(key, skin);
  if (imgSlots.length) {
    c2.freeform = [
      ...imgSlots.map((im, i) => ({
        id: `ph-img-${i}`, type: 'shape' as const, shape: 'rectangle' as const,
        x: (im.x / 960) * 100, y: (im.y / 540) * 100, w: (im.w / 960) * 100, h: (im.h / 540) * 100,
        fill: 'rgba(0,0,0,0.10)', rotation: 0, z: 1,
        content: 'Image', textStyle: { fontSize: 13, color: '#8a857c', textAlign: 'center' as const },
      })),
      ...(c2.freeform ?? []),
    ] as typeof c2.freeform;
  }
  return NextResponse.json({ theme: built.theme, card: c2 });
}
