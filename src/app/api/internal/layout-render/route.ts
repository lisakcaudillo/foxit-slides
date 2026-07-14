import { NextResponse } from 'next/server';
import { buildStructureTemplate, describeLayoutSlots } from '@/data/structureTemplates';
import { fitCardText } from '@/lib/card-engine/text-fit';

// TEMP (delete after — gotcha #34). Renders one layout WITH text-fit (so it reads
// as real generation would), for the padding-normalization checkpoints.
const SAMPLE: Record<string, string> = {
  title: 'Running Effective Retrospectives',
  'eyebrow-label': 'PROCESS',
  body: 'A retrospective turns a finished sprint into concrete improvements — a short, safe, structured look back that the whole team shares.',
  'metric-value': '87%',
  'metric-label': 'Adoption rate',
  author: 'Alex Rivera',
  date: 'July 2026',
  delta: '+12',
};
const LOREM = 'A retrospective turns a finished sprint into concrete improvements the team can act on next week, naming what worked, what stalled, and the one change worth trying, in plain language everyone shares and owns together going forward.';
const fillTo = (chars: number) => {
  let s = '';
  while (s.length < chars) s += (s ? ' ' : '') + LOREM;
  return s.slice(0, Math.max(4, chars)).replace(/\s+\S*$/, '') + '.';
};
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '05-content';
  const skin = url.searchParams.get('skin') || 'mono-light';
  const density = url.searchParams.get('density') || 'detailed';
  const frac = density === 'concise' ? 0.45 : density === 'extensive' ? 0.88 : 0.72;
  const specs = describeLayoutSlots(key, skin);
  const fill: Record<string, string | string[]> = {};
  for (const s of specs) {
    // Body slots scale with density (fraction of the box char cap); fixed roles don't.
    const one = s.role === 'body' ? fillTo(Math.round(s.charCap * frac))
      : SAMPLE[s.role] ?? (s.role === 'title' ? 'Section Title' : 'A concise line of content.');
    fill[s.key] = s.count > 1
      ? Array.from({ length: s.count }, (_, i) => (s.role === 'metric-value' ? `${80 + i}%` : s.role === 'body' ? fillTo(Math.round(s.charCap * frac)) : `${one}${s.role === 'metric-label' || s.role === 'title' ? ' ' + (i + 1) : ''}`))
      : one;
  }
  const built = buildStructureTemplate(key, skin, fill);
  const card = { ...built.cards[0], id: `c-${key}` };
  fitCardText(card);
  return NextResponse.json({ theme: built.theme, card });
}
