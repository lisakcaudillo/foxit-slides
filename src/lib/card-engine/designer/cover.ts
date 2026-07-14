/**
 * designer/cover.ts — the cover Designer (P2). PURE + PORTABLE.
 *
 * A deterministic decision function: reads the treatment grammar + the design
 * standard + plain signals (colors, archetype, image presence, content) and
 * COMPOSES the cover — choosing the form + anchor, including the optional
 * elements that earn their place, sizing each slot from the standard, and
 * lock-the-box fitting the text. Returns the positioned blocks PLUS a one-line
 * `decision` and a `reasoning` string for the observe-only review log.
 *
 * Not an agent: it never reasons open-endedly. Bounded options + calibrated
 * rules (the grammar) + real signals → a reproducible choice. Where the rules
 * fall short, the Judge catches it and a guideline gets added (it doesn't think
 * harder).
 *
 * PURE: no fs, no React, no SDK, no theme-type dependency — the caller extracts
 * plain inputs from whatever theme it holds and passes them in. That keeps this
 * runnable in any deployment (cloud back-end OR desktop) without change.
 *
 * SCOPE (P2): the TYPE-LED cover (no image). Image-bearing forms (split /
 * fullbleed) ride the existing image-cover flow until the image decision
 * consolidates into the Designer in P3.
 *
 * Geometry is % of the 960×540 card; the slot %s are provisional (calibrated at
 * the render review), the ELEMENT/ORDER/RULES are the spec.
 */
import type { FreeformBlock } from '@/types/card-template';
import type { ThemeArchetype } from '../design-types';
import { textBlock } from '../slide-typography';
import { DESIGN_STANDARD, type CoverAnchor } from '../slide-standard';

const CARD_W = DESIGN_STANDARD.canvas.w;
const CARD_H = DESIGN_STANDARD.canvas.h;
const INSET_X = (DESIGN_STANDARD.padding.insetPx / CARD_W) * 100; // ≈ 6.7%
void CARD_H;

export interface CoverColors {
  accent: string;
  heading: string;
  muted: string;
}

export interface CoverDesignInput {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** author · date — the caller decides whether to pass it (byline trigger). */
  byline?: string;
  /** A short kicker DERIVED from deck metadata (e.g. "GO-TO-MARKET") — used as the
   *  eyebrow when the writer supplied none. A label, not authored prose, so it
   *  stays on the arrange side of the writer/Designer line. */
  kicker?: string;
  /** Is a real, relevant cover image present? (P2: type-led when false.) */
  hasImage: boolean;
  archetype: ThemeArchetype;
  colors: CoverColors;
  /** Deck variety — alternates the anchor so covers don't feel stamped. */
  rotationIndex?: number;
}

export interface CoverDesignResult {
  blocks: FreeformBlock[];
  /** WHAT was chosen — one line, for the review log. */
  decision: string;
  /** WHY — the rules/signals that drove it, for the review log. */
  reasoning: string;
}

/** Anchor varies — never ALWAYS left (Lisa). Cinematic centers; others lean left
 *  with a periodic center for a non-stamped feel. Deterministic per rotationIndex. */
function chooseAnchor(archetype: ThemeArchetype, rotationIndex: number): CoverAnchor {
  if (archetype === 'cinematic') return 'center';
  return rotationIndex % 4 === 3 ? 'center' : 'left';
}

/** Text-zone x/width (%) + alignment for an anchor — derived from the standard padding. */
function zoneFor(anchor: CoverAnchor): { x: number; w: number; align: 'left' | 'center' } {
  if (anchor === 'center') {
    const w = 100 - INSET_X * 2 - 12;
    return { x: (100 - w) / 2, w, align: 'center' };
  }
  return { x: INSET_X, w: 60, align: 'left' };
}

/**
 * Design the type-led cover. Pure + deterministic for a given input.
 */
export function designCover(input: CoverDesignInput): CoverDesignResult {
  const { title, subtitle, eyebrow, byline, hasImage, archetype, colors } = input;
  const rot = input.rotationIndex ?? 0;

  // FORM (P2): type-led when no image (rule: no relevant image → type-led, never
  // an empty image box). Image forms are deferred to P3.
  const form = 'type-led' as const;
  const anchor = chooseAnchor(archetype, rot);
  const zone = zoneFor(anchor);

  // Optional elements the Designer includes when content earns them. The eyebrow
  // uses writer content if present, else the derived kicker (a cover is not
  // approved as a bare title — it carries the editorial treatment).
  const eyebrowText = (eyebrow?.trim() || input.kicker?.trim() || '');
  const eyebrowFromKicker = !eyebrow?.trim() && !!input.kicker?.trim();
  const hasEyebrow = eyebrowText.length > 0;
  const hasSubtitle = !!subtitle?.trim();
  const hasRule = hasSubtitle; // the divider only earns its place between title + subtitle
  const hasByline = !!byline?.trim();

  const pick = (c: 'accent' | 'heading' | 'muted') =>
    c === 'accent' ? colors.accent : c === 'muted' ? colors.muted : colors.heading;

  // Stack the present elements top→bottom in recommendedOrder; each slot sized
  // from the standard, lock-the-box fits the text. Generous whitespace (the
  // stack sits in the card's vertical middle).
  const blocks: FreeformBlock[] = [];
  const gap = 2;
  let y = 32;

  if (hasEyebrow) {
    blocks.push(textBlock({ id: 'cv-eyebrow', role: 'eyebrow', content: eyebrowText.toUpperCase(), x: zone.x, y, w: zone.w, h: 5, color: pick('accent'), align: zone.align, lock: true }));
    y += 5 + gap;
  }
  blocks.push(textBlock({ id: 'cv-title', role: 'title', content: title, x: zone.x, y, w: zone.w, h: 24, color: pick('heading'), align: zone.align, lock: true }));
  y += 24 + gap;
  if (hasRule) {
    const ruleW = Math.min(zone.w, 22);
    const ruleX = zone.align === 'center' ? (100 - ruleW) / 2 : zone.x;
    blocks.push({ id: 'cv-rule', type: 'shape', shape: 'rectangle', x: ruleX, y, w: ruleW, h: 0.6, rotation: 0, z: 2, fill: pick('accent') } as FreeformBlock);
    y += 0.6 + gap + 1;
  }
  if (hasSubtitle) {
    blocks.push(textBlock({ id: 'cv-sub', role: 'subtitle', content: subtitle!.trim(), x: zone.x, y, w: zone.w, h: 10, color: pick('muted'), align: zone.align, lock: true }));
  }
  if (hasByline) {
    blocks.push(textBlock({ id: 'cv-byline', role: 'eyebrow', content: byline!.trim(), x: zone.x, y: 88, w: zone.w, h: 5, color: pick('muted'), align: zone.align, lock: true }));
  }

  const els = ['title', hasEyebrow && 'eyebrow', hasRule && 'rule', hasSubtitle && 'subtitle', hasByline && 'byline']
    .filter(Boolean).join('+');
  const decision = `${form} · anchor:${anchor} · ${els} · image:${hasImage ? 'yes' : 'no'}`;
  const reasoning = [
    'No cover image → type-led (rule: no relevant image → type-led, never an empty image box).',
    `Anchor ${anchor} — ${archetype === 'cinematic' ? 'cinematic centers' : 'editorial/product/warm lean left, rotate to center for variety'}.`,
    hasEyebrow ? (eyebrowFromKicker ? 'eyebrow derived from deck metadata (kicker).' : 'eyebrow included (writer content).') : 'no eyebrow.',
    hasSubtitle ? 'subtitle + hairline rule under the title.' : 'no subtitle → no rule (rule only earns its place between title + subtitle).',
    hasByline ? 'byline included (trigger fired).' : 'byline off (default — no author/date / not a formal doc).',
    'accent word deferred (P2 renders the title in heading color).',
  ].join(' ');

  return { blocks, decision, reasoning };
}
