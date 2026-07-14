'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Box,
  User,
  Flower2,
  Hexagon,
  Image as ImageIcon,
  Brush,
} from 'lucide-react';

// ── Mad-Libs image-prompt builder ──────────────────────────────────────────
//
// Reusable component dropped inside the Imagery modal of the image editor (and
// any other surface that needs to scaffold an image-generation prompt). The
// user picks a template card, edits the inline slots, and clicks Use prompt to
// commit. Foxit palette throughout — no MS-brand indigo or category-coded
// accents (per CLAUDE.md, only purple/blue tints are allowed for ad-hoc
// styling, with red reserved for Foxit brand only and orange for top-nav).

type CategoryId =
  | 'all'
  | 'objects'
  | 'people'
  | 'nature'
  | 'tech'
  | 'scene';

interface Slot {
  id: string;
  placeholder: string;
  defaultValue: string;
}

interface MadLibsCard {
  id: string;
  category: Exclude<CategoryId, 'all'>;
  title: string;
  description: string;
  icon: React.ReactNode;
  // Sentence is an array of static strings interleaved with slot ids — even
  // indices are static text, odd indices are slot ids. e.g.
  // ['A ', 'style', ' style of ', 'subject', '.']
  sentence: (string | { slot: string })[];
  slots: Slot[];
  legend: { label: string; hint: string }[];
}

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'objects', label: 'Objects & Icons' },
  { id: 'people', label: 'People & Portraits' },
  { id: 'nature', label: 'Nature & Macro' },
  { id: 'tech', label: 'Tech & Abstract' },
  { id: 'scene', label: 'Scenes & Stories' },
];

const CARDS: MadLibsCard[] = [
  {
    id: 'object-on-bg',
    category: 'objects',
    title: 'Object on Background',
    description:
      'A single graphic subject on a flat solid color — great for icons & visuals',
    icon: <Box size={18} style={{ color: '#6B3FA0' }} />,
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
    icon: <User size={18} style={{ color: '#6B3FA0' }} />,
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
    icon: <Flower2 size={18} style={{ color: '#6B3FA0' }} />,
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
    icon: <Hexagon size={18} style={{ color: '#6B3FA0' }} />,
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
    icon: <ImageIcon size={18} style={{ color: '#6B3FA0' }} />,
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
    icon: <Brush size={18} style={{ color: '#6B3FA0' }} />,
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

// Render the slot-filled prompt for a given card + slot values. Returns an
// array of segments — `static` for grammar words, `slot` for swappable
// values — so callers can style brackets, hover preview cards, etc. without
// re-implementing the sentence shapes.
export interface PromptSegment {
  type: 'static' | 'slot';
  text: string;
}

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

// Re-exported so consumers can hand the builder a typed initialCardId.
export const MAD_LIBS_CARD_IDS = [
  'object-on-bg',
  'person-portrait',
  'nature-macro',
  'tech-abstract',
  'scene-story',
  'watercolor',
] as const;
export type MadLibsCardId = (typeof MAD_LIBS_CARD_IDS)[number];

interface MadLibsBuilderProps {
  // Called when the user clicks "Use prompt" on a card. Receives the rendered
  // prompt string. Optional — when omitted, the component is browse-only with
  // copy-to-clipboard.
  onSelect?: (prompt: string) => void;
  // When set, pre-select this category filter on mount.
  initialCategory?: CategoryId;
  // When set, scroll to / highlight this card on mount.
  initialCardId?: string;
  // When set, override that card's default slot values with these. Useful for
  // "click an example image to see the prompt that made it" flows.
  initialValues?: Record<string, string>;
}

export default function MadLibsBuilder({
  onSelect,
  initialCategory,
  initialCardId,
  initialValues,
}: MadLibsBuilderProps) {
  // If an initialCardId arrived, default the category filter to that card's
  // bucket so the user lands looking at it. Falls back to 'all' otherwise.
  const seededCategory: CategoryId =
    initialCategory ??
    (initialCardId
      ? CARDS.find((c) => c.id === initialCardId)?.category ?? 'all'
      : 'all');

  const [category, setCategory] = useState<CategoryId>(seededCategory);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () => {
      // Seed each card's slot values from defaults so the example prompts are
      // populated on first render. If initialValues + initialCardId are
      // provided, the targeted card uses those values instead.
      const seed: Record<string, Record<string, string>> = {};
      for (const card of CARDS) {
        seed[card.id] = {};
        for (const slot of card.slots) {
          if (
            initialCardId === card.id &&
            initialValues &&
            slot.id in initialValues
          ) {
            seed[card.id][slot.id] = initialValues[slot.id];
          } else {
            seed[card.id][slot.id] = slot.defaultValue;
          }
        }
      }
      return seed;
    }
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scroll to the highlighted card on mount.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!initialCardId) return;
    const el = cardRefs.current[initialCardId];
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [initialCardId]);

  const visibleCards = useMemo(
    () =>
      category === 'all'
        ? CARDS
        : CARDS.filter((c) => c.category === category),
    [category]
  );

  const renderPrompt = (card: MadLibsCard): string => {
    const slotValues = values[card.id] || {};
    const parts = card.sentence.map((part) => {
      if (typeof part === 'string') return part;
      const v = slotValues[part.slot];
      const slot = card.slots.find((s) => s.id === part.slot);
      return v && v.length > 0 ? v : slot?.placeholder ?? '';
    });
    return parts.join('').replace(/\s+/g, ' ').trim();
  };

  const updateSlot = (cardId: string, slotId: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] || {}), [slotId]: value },
    }));
  };

  const handleCopy = async (card: MadLibsCard) => {
    const prompt = renderPrompt(card);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard API unavailable — fall through silently. The user still
      // sees the rendered prompt in the output box.
    }
    setCopiedId(card.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  const handleUse = (card: MadLibsCard) => {
    const prompt = renderPrompt(card);
    onSelect?.(prompt);
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Intro */}
      <p
        style={{
          fontSize: '0.875rem',
          color: '#697386',
          marginBottom: '16px',
          lineHeight: 1.5,
        }}
      >
        Pick a template and edit the highlighted fields. The prompt updates
        live below each card.
      </p>

      {/* Category filter tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        {CATEGORIES.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: active
                  ? '1px solid #6B3FA0'
                  : '1px solid rgba(0,0,0,0.08)',
                background: active ? '#6B3FA0' : '#fff',
                color: active ? '#fff' : '#475569',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 150ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '16px',
        }}
      >
        {visibleCards.map((card) => {
          const slotValues = values[card.id] || {};
          const generated = renderPrompt(card);
          const copied = copiedId === card.id;

          const isInitial = initialCardId === card.id;
          return (
            <div
              key={card.id}
              ref={(el) => {
                cardRefs.current[card.id] = el;
              }}
              style={{
                background: '#fff',
                border: isInitial
                  ? '2px solid #6B3FA0'
                  : '1px solid rgba(0,0,0,0.06)',
                borderRadius: '16px',
                padding: '18px',
                boxShadow: isInitial
                  ? '0 4px 16px rgba(107,63,160,0.18)'
                  : '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              {/* Card header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'rgba(107,63,160,0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      color: '#1a1f36',
                    }}
                  >
                    {card.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#697386',
                      marginTop: '2px',
                      lineHeight: 1.4,
                    }}
                  >
                    {card.description}
                  </div>
                </div>
              </div>

              {/* Editable sentence */}
              <div
                style={{
                  fontSize: '0.875rem',
                  lineHeight: 2.1,
                  color: '#1a1f36',
                  marginBottom: '14px',
                  padding: '14px',
                  background: 'rgba(248,250,252,1)',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                {card.sentence.map((part, idx) => {
                  if (typeof part === 'string') {
                    return (
                      <span key={idx} style={{ color: '#475569' }}>
                        {part}
                      </span>
                    );
                  }
                  const slot = card.slots.find((s) => s.id === part.slot);
                  if (!slot) return null;
                  return (
                    <input
                      key={idx}
                      type="text"
                      value={slotValues[slot.id] ?? ''}
                      placeholder={slot.placeholder}
                      onChange={(e) =>
                        updateSlot(card.id, slot.id, e.target.value)
                      }
                      style={{
                        display: 'inline-block',
                        minWidth: '90px',
                        border: 'none',
                        borderBottom: '2px solid #6B3FA0',
                        background: 'rgba(107,63,160,0.10)',
                        color: '#6B3FA0',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        outline: 'none',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}
                    />
                  );
                })}
              </div>

              {/* Generated prompt output */}
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#697386',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '6px',
                }}
              >
                Generated prompt
              </div>
              <div
                style={{
                  background: 'rgba(107,63,160,0.05)',
                  border: '1px solid rgba(107,63,160,0.18)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '0.8125rem',
                  color: '#1a1f36',
                  lineHeight: 1.55,
                  minHeight: '48px',
                  wordBreak: 'break-word',
                }}
              >
                {generated}
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleCopy(card)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(107,63,160,0.2)',
                    background: copied
                      ? 'rgba(34,197,94,0.10)'
                      : 'rgba(107,63,160,0.06)',
                    color: copied ? '#15803d' : '#6B3FA0',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={14} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy
                    </>
                  )}
                </button>

                {onSelect && (
                  <button
                    type="button"
                    onClick={() => handleUse(card)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '12px',
                      border: 'none',
                      background:
                        'linear-gradient(135deg, #6B3FA0, #8B5CF6)',
                      color: '#fff',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(107,63,160,0.20)',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <Sparkles size={14} /> Use prompt
                  </button>
                )}
              </div>

              {/* Legend chips */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  marginTop: '12px',
                }}
              >
                {card.legend.map((item) => (
                  <span
                    key={item.label}
                    style={{
                      background: 'rgba(248,250,252,1)',
                      border: '1px solid rgba(0,0,0,0.06)',
                      borderRadius: '6px',
                      padding: '3px 9px',
                      fontSize: '0.7rem',
                      color: '#697386',
                    }}
                  >
                    <strong style={{ color: '#6B3FA0' }}>{item.label}</strong>{' '}
                    {item.hint}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
