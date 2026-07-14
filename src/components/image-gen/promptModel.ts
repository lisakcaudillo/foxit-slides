// ── Shared image-generation engine — structured prompt model ───────────────
//
// MadLibs prompt templates, copied verbatim from
// components/image-editor/MadLibsBuilder.tsx (which is left untouched). Data
// only — icons are referenced by string id (`iconId`) so the visual layer can
// map them to Lucide components without pulling JSX into this module.
//
// (the structured
// MadLibs prompt is the shared "PromptBuilder" data source).

import type {
  PromptTemplate,
  PromptSegment,
  PromptCategoryId,
} from './types';

export type { PromptTemplate, PromptSegment, PromptCategoryId };

export const CARDS: PromptTemplate[] = [
  {
    id: 'object-on-bg',
    category: 'objects',
    title: 'Object on Background',
    description:
      'A single graphic subject on a flat solid color — great for icons & visuals',
    iconId: 'box',
    sentence: [
      'A ',
      { slot: 'style' },
      ' style illustration using ',
      { slot: 'colors' },
      ' colors of ',
      { slot: 'subject' },
      ' in front of ',
      { slot: 'shape' },
      ' shape on an empty, ',
      { slot: 'bg' },
      ' color background.',
    ],
    slots: [
      { id: 'style', placeholder: 'minimal vector', defaultValue: 'minimal vector' },
      { id: 'colors', placeholder: 'blue, white & black', defaultValue: 'blue, white and black' },
      { id: 'subject', placeholder: 'a large camera', defaultValue: 'a large security camera' },
      { id: 'shape', placeholder: 'a hexagonal', defaultValue: 'a hexagonal' },
      { id: 'bg', placeholder: 'yellow', defaultValue: 'yellow' },
    ],
    legend: [
      { label: 'style', hint: 'art direction' },
      { label: 'colors', hint: 'palette' },
      { label: 'subject', hint: 'main object' },
      { label: 'shape', hint: 'framing element' },
      { label: 'bg', hint: 'background color' },
    ],
  },
  {
    id: 'person-portrait',
    category: 'people',
    title: 'Person Portrait',
    description: 'A person with clothing, action, location, colors — and an art style',
    iconId: 'user',
    sentence: [
      'A portrait of ',
      { slot: 'person' },
      ' in ',
      { slot: 'clothing' },
      ', ',
      { slot: 'action' },
      ' on ',
      { slot: 'location' },
      ' in ',
      { slot: 'colors' },
      ' colors in a ',
      { slot: 'style' },
      ' style.',
    ],
    slots: [
      { id: 'person', placeholder: 'a tennis player', defaultValue: 'a tennis player' },
      { id: 'clothing', placeholder: 'tennis shorts and top', defaultValue: 'tennis shorts and top' },
      { id: 'action', placeholder: 'swinging a racket at a ball', defaultValue: 'swinging a tennis racket at a ball' },
      { id: 'location', placeholder: 'a tennis court', defaultValue: 'a tennis court' },
      { id: 'colors', placeholder: 'yellow, pastel, and black', defaultValue: 'yellow, pastel, and black' },
      { id: 'style', placeholder: 'modern color block', defaultValue: 'modern color block' },
    ],
    legend: [
      { label: 'person', hint: 'who they are' },
      { label: 'clothing', hint: 'what they wear' },
      { label: 'action', hint: 'what they do' },
      { label: 'location', hint: 'setting' },
      { label: 'colors', hint: 'palette' },
      { label: 'style', hint: 'art direction' },
    ],
  },
  {
    id: 'nature-macro',
    category: 'nature',
    title: 'Nature & Macro Photo',
    description: 'Photorealistic close-up of a natural subject with environment and light',
    iconId: 'flower',
    sentence: [
      'A macro, photorealistic image of ',
      { slot: 'subject' },
      ' surrounded by ',
      { slot: 'context' },
      ' in ',
      { slot: 'setting' },
      '. The ',
      { slot: 'subjectref' },
      ' is ',
      { slot: 'detail' },
      ' with ',
      { slot: 'light' },
      ' light.',
    ],
    slots: [
      { id: 'subject', placeholder: 'a delicate cosmo', defaultValue: 'a delicate cosmo' },
      { id: 'context', placeholder: 'wildflowers blowing in a breeze', defaultValue: 'wildflowers blowing in a gentle breeze' },
      { id: 'setting', placeholder: 'a sunny, soft-focus meadow', defaultValue: 'a sunny, soft-focus meadow' },
      { id: 'subjectref', placeholder: 'cosmo', defaultValue: 'cosmo' },
      { id: 'detail', placeholder: 'in full bloom', defaultValue: 'in full bloom' },
      { id: 'light', placeholder: 'direct, late summer', defaultValue: 'direct, late summer' },
    ],
    legend: [
      { label: 'subject', hint: 'main plant/creature' },
      { label: 'context', hint: 'surrounding elements' },
      { label: 'setting', hint: 'location/environment' },
      { label: 'detail', hint: 'subject state' },
      { label: 'light', hint: 'lighting quality' },
    ],
  },
  {
    id: 'tech-abstract',
    category: 'tech',
    title: 'Tech & Abstract Pattern',
    description: 'Digital patterns, meshes, data visualizations viewed from a specific angle',
    iconId: 'hexagon',
    sentence: [
      'A ',
      { slot: 'view' },
      ' view of ',
      { slot: 'subject' },
      ' with ',
      { slot: 'detail' },
      ' in ',
      { slot: 'color' },
      ' color over ',
      { slot: 'surface' },
      '. The subject should be ',
      { slot: 'quality' },
      ' with ',
      { slot: 'effect' },
      '.',
    ],
    slots: [
      { id: 'view', placeholder: 'macro', defaultValue: 'macro' },
      { id: 'subject', placeholder: 'a digital cityscape', defaultValue: 'a digital cityscape' },
      { id: 'detail', placeholder: 'minimal transparent lines', defaultValue: 'minimal transparent lines' },
      { id: 'color', placeholder: 'a luminous blue', defaultValue: 'a luminous blue' },
      { id: 'surface', placeholder: 'a glowing tablet screen', defaultValue: 'a glowing tablet screen' },
      { id: 'quality', placeholder: 'out-of-focus', defaultValue: 'out-of-focus' },
      { id: 'effect', placeholder: 'a subtle bokeh effect', defaultValue: 'a subtle bokeh effect' },
    ],
    legend: [
      { label: 'view', hint: 'camera distance' },
      { label: 'subject', hint: 'concept/pattern' },
      { label: 'detail', hint: 'visual texture' },
      { label: 'color', hint: 'dominant hue' },
      { label: 'surface', hint: 'backdrop' },
      { label: 'effect', hint: 'rendering quality' },
    ],
  },
  {
    id: 'scene-story',
    category: 'scene',
    title: 'Scene & Story',
    description: 'Multiple subjects, an environment, and a narrative moment',
    iconId: 'image',
    sentence: [
      '',
      { slot: 'subject' },
      ' in ',
      { slot: 'setting' },
      ' while ',
      { slot: 'secondary' },
      '. Outside, there is ',
      { slot: 'bg' },
      ' in a ',
      { slot: 'style' },
      ' style.',
    ],
    slots: [
      { id: 'subject', placeholder: 'A dad plays guitar', defaultValue: 'A dad plays guitar' },
      { id: 'setting', placeholder: 'a sunlit living room', defaultValue: 'a sunlit living room' },
      { id: 'secondary', placeholder: 'his toddler plays nearby', defaultValue: 'his toddler plays nearby' },
      { id: 'bg', placeholder: 'a magnolia tree blooming', defaultValue: 'a magnolia tree blooming' },
      { id: 'style', placeholder: 'colorful, pixel art', defaultValue: 'colorful, pixel art' },
    ],
    legend: [
      { label: 'subject', hint: 'main character/action' },
      { label: 'setting', hint: 'indoor/outdoor location' },
      { label: 'secondary', hint: 'supporting element' },
      { label: 'bg', hint: 'background story' },
      { label: 'style', hint: 'art direction' },
    ],
  },
  {
    id: 'watercolor',
    category: 'nature',
    title: 'Watercolor Painting',
    description: 'Soft painterly style with a natural subject, technique, and mood reference',
    iconId: 'brush',
    sentence: [
      'A watercolor painting of ',
      { slot: 'subject' },
      ' using ',
      { slot: 'colors' },
      ' colors, with ',
      { slot: 'technique' },
      ' reminiscent of ',
      { slot: 'reference' },
      ', on a full ',
      { slot: 'bg' },
      ' color background.',
    ],
    slots: [
      { id: 'subject', placeholder: 'a minimal pair of clouds', defaultValue: 'a minimal, large pair of clouds' },
      { id: 'colors', placeholder: 'white', defaultValue: 'white' },
      { id: 'technique', placeholder: 'elegant, transparent strokes', defaultValue: 'elegant, transparent strokes' },
      { id: 'reference', placeholder: 'lungs', defaultValue: 'lungs' },
      { id: 'bg', placeholder: 'light blue', defaultValue: 'light blue' },
    ],
    legend: [
      { label: 'subject', hint: "what's painted" },
      { label: 'colors', hint: 'palette' },
      { label: 'technique', hint: 'brush/stroke style' },
      { label: 'reference', hint: 'shape inspiration' },
      { label: 'bg', hint: 'background wash color' },
    ],
  },
];

/** Render the slot-filled prompt for a given card + slot values as an array of
 *  segments. Mirrors MadLibsBuilder.getPromptSegments() exactly. */
export function getPromptSegments(
  cardId: string,
  slotValues: Record<string, string>,
): PromptSegment[] {
  const card = CARDS.find((c) => c.id === cardId);
  if (!card) return [];
  const segments: PromptSegment[] = [];
  for (const part of card.sentence) {
    if (typeof part === 'string') {
      segments.push({ type: 'static', text: part });
    } else {
      const slot = card.slots.find((s) => s.id === part.slot);
      const value = slotValues[part.slot] ?? slot?.placeholder ?? '';
      segments.push({ type: 'slot', text: value });
    }
  }
  return segments;
}

/** Render the filled sentence as a single prompt string. Empty slot values
 *  fall back to the slot placeholder. Whitespace is collapsed and trimmed —
 *  mirrors MadLibsBuilder.renderPrompt(). */
export function buildPrompt(
  cardId: string,
  slotValues: Record<string, string>,
): string {
  const card = CARDS.find((c) => c.id === cardId);
  if (!card) return '';
  const parts = card.sentence.map((part) => {
    if (typeof part === 'string') return part;
    const v = slotValues[part.slot];
    const slot = card.slots.find((s) => s.id === part.slot);
    return v && v.length > 0 ? v : slot?.placeholder ?? '';
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export const MAD_LIBS_CARD_IDS = [
  'object-on-bg',
  'person-portrait',
  'nature-macro',
  'tech-abstract',
  'scene-story',
  'watercolor',
] as const;
export type MadLibsCardId = (typeof MAD_LIBS_CARD_IDS)[number];
