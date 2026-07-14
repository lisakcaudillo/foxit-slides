'use client';

// ── Shared image-generation engine — ImageGenAccordion ─────────────────────
//
// The SAME three SECTIONS as the wizard, rendered as stacked, one-open-at-a-
// time collapsibles, built to fit a 272px-wide slides Media panel (content
// ~248px). Same engine, same primitives, same labels — narrow stacked layout.
//
// Describe section leads with a horizontally-scrollable seed strip (template
// chooser) + Surprise me, then PromptBuilder. ResultPicker renders inline.
// Same props as the wizard. On-palette only. Create CTA = btn-cta-bold.

import { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  FileText,
  Palette,
  Square,
  Shuffle,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { CARDS, type PromptTemplate } from './promptModel';
import { templateIcon } from './iconMap';
import { SECTIONS, type SectionId } from './sections';
import { PromptBuilder } from './PromptBuilder';
import { StyleRow } from './StyleRow';
import { PaletteGrid } from './PaletteGrid';
import { SizeRow } from './SizeRow';
import { ReferenceUpload } from './ReferenceUpload';
import { ResultPicker } from './ResultPicker';
import { palettePromptFragment, PALETTES } from './palettes';
import { STYLES } from './styles';
import { SIZES } from './sizes';
import { useImageGen } from './useImageGen';
import { probeImageDims } from './imageDims';
import { saveGeneratedVisual } from '@/lib/visualStorage';
import type { AiResult, AspectId, ImageStyle, Quality } from './types';

const PURPLE = '#6B3FA0';

const TEMPLATE_DEFAULT_STYLE: Record<string, ImageStyle> = {
  'object-on-bg': 'illustration',
  'person-portrait': 'photographic',
  'nature-macro': 'photographic',
  'tech-abstract': 'abstract',
  'scene-story': 'illustration',
  watercolor: 'watercolor',
};

function defaultSlots(card: PromptTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of card.slots) out[s.id] = s.defaultValue;
  return out;
}

const SECTION_ICON: Record<SectionId, typeof FileText> = {
  describe: FileText,
  style: Palette,
  size: Square,
};

export interface ImageGenAccordionProps {
  onUse: (result: AiResult, naturalDims?: { width: number; height: number }) => void;
  slideContext?: { slideHeading?: string; deckTitle?: string; themePalette?: string };
  initialTemplateId?: string;
  /** Fires with the final prompt the instant a generation is kicked off.
   *  Lets a host (e.g. the slides Media panel) pin the prompt for its
   *  "More like this" library row and refetch the library. Optional. */
  onGenerated?: (prompt: string) => void;
}

export function ImageGenAccordion({
  onUse,
  slideContext,
  initialTemplateId,
  onGenerated,
}: ImageGenAccordionProps) {
  const [open, setOpen] = useState<SectionId>('describe');
  const [cardId, setCardId] = useState<string>(initialTemplateId ?? CARDS[0].id);
  const [slotValues, setSlotValues] = useState<Record<string, string>>(() => {
    const c = CARDS.find((x) => x.id === (initialTemplateId ?? CARDS[0].id));
    return c ? defaultSlots(c) : {};
  });
  const [freeText, setFreeText] = useState(false);
  const [freeTextValue, setFreeTextValue] = useState('');
  const [prompt, setPrompt] = useState('');

  const [style, setStyle] = useState<ImageStyle>('photographic');
  const [palette, setPalette] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectId>('16:9');
  const [styleRef, setStyleRef] = useState<string | null>(null);
  const [compositionRef, setCompositionRef] = useState<string | null>(null);
  const quality: Quality = 'standard';

  const { results, generating, error, generate, reset } = useImageGen();

  const selectTemplate = useCallback((id: string) => {
    const c = CARDS.find((x) => x.id === id);
    if (!c) return;
    setCardId(id);
    setSlotValues(defaultSlots(c));
    setStyle(TEMPLATE_DEFAULT_STYLE[id] ?? 'photographic');
    setFreeText(false);
    setFreeTextValue('');
  }, []);

  const surprise = useCallback(() => {
    const random = CARDS[Math.floor(Math.random() * CARDS.length)];
    selectTemplate(random.id);
  }, [selectTemplate]);

  const finalPrompt = useMemo(() => {
    const frag = palette ? palettePromptFragment(palette) : '';
    return [prompt.trim(), frag].filter(Boolean).join('. ');
  }, [prompt, palette]);

  const canCreate = finalPrompt.trim().length > 0 && !generating;

  const runGenerate = useCallback(() => {
    if (!canCreate) return;
    onGenerated?.(finalPrompt);
    void generate({
      prompt: finalPrompt,
      style,
      aspect,
      quality,
      n: 4,
      ...(styleRef ? { styleRef } : {}),
      ...(compositionRef ? { compositionRef } : {}),
      ...(slideContext?.slideHeading ? { slideHeading: slideContext.slideHeading } : {}),
      ...(slideContext?.deckTitle ? { deckTitle: slideContext.deckTitle } : {}),
      ...(slideContext?.themePalette ? { themePalette: slideContext.themePalette } : {}),
    });
  }, [canCreate, onGenerated, generate, finalPrompt, style, aspect, quality, styleRef, compositionRef, slideContext]);

  const handleUse = useCallback(
    async (result: AiResult) => {
      let dims: { width: number; height: number } | undefined;
      if (result.width > 0 && result.height > 0) {
        dims = { width: result.width, height: result.height };
      } else {
        try {
          dims = await probeImageDims(result.src);
        } catch {
          dims = undefined;
        }
      }
      // Persist the kept image so it appears under Studio → Graphics.
      saveGeneratedVisual({ src: result.src, libraryId: result.libraryId, prompt: finalPrompt, style });
      onUse(result, dims);
    },
    [onUse, finalPrompt, style],
  );

  // ── summaries for collapsed section heads ──
  const styleLabel = STYLES.find((s) => s.id === style)?.label ?? 'Photographic';
  const paletteLabel = palette ? PALETTES.find((p) => p.id === palette)?.label ?? '' : 'no palette';
  const sizeMeta = SIZES.find((s) => s.id === aspect);

  const summaries: Record<SectionId, string> = {
    describe: 'Edit the words to fit your idea',
    style: `${styleLabel} · ${paletteLabel}`,
    size: sizeMeta ? `${sizeMeta.label} · ${sizeMeta.dims}` : 'Landscape',
  };

  if (results) {
    return (
      <div className="glass-panel" style={{ width: '100%', padding: 12 }}>
        <ResultPicker
          results={results}
          onUse={(r) => void handleUse(r)}
          onMore={runGenerate}
          onDismiss={reset}
          generating={generating}
        />
      </div>
    );
  }

  const toggle = (id: SectionId) => setOpen((cur) => (cur === id ? cur : id));

  return (
    <div style={{ width: '100%' }}>
      {SECTIONS.map((s) => {
        const Icon = SECTION_ICON[s.id];
        const isOpen = open === s.id;
        return (
          <div
            key={s.id}
            style={{
              borderRadius: 12,
              margin: '6px 0',
              overflow: 'hidden',
              background: isOpen ? 'rgba(129,140,248,0.07)' : 'transparent',
            }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                minHeight: 48,
                padding: '11px 10px',
                border: 'none',
                background: 'none',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  flex: 'none',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: isOpen ? 'rgba(107,63,160,0.16)' : 'rgba(107,63,160,0.10)',
                  color: PURPLE,
                }}
              >
                <Icon size={16} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 700,
                    color: isOpen ? PURPLE : '#0f172a',
                  }}
                >
                  {s.label}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    color: '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {summaries[s.id]}
                </span>
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                color="#94a3b8"
                style={{ flex: 'none', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}
              />
            </button>

            {isOpen && (
              <div style={{ padding: '2px 10px 14px' }}>
                {s.id === 'describe' && (
                  <>
                    {/* scrollable seed strip */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={seedLabelStyle}>Start from</span>
                        <button
                          type="button"
                          onClick={surprise}
                          aria-label="Surprise me with a random template"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            minHeight: 44,
                            padding: '0 8px',
                            border: 'none',
                            background: 'none',
                            font: 'inherit',
                            fontSize: 13,
                            fontWeight: 600,
                            color: PURPLE,
                            cursor: 'pointer',
                          }}
                        >
                          <Shuffle size={14} aria-hidden="true" />
                          Surprise
                        </button>
                      </div>
                      <div
                        role="list"
                        style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}
                      >
                        {CARDS.map((c) => {
                          const TIcon = templateIcon(c.iconId);
                          const sel = c.id === cardId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              role="listitem"
                              aria-label={`Start from ${c.title}`}
                              onClick={() => selectTemplate(c.id)}
                              style={{
                                flex: '0 0 auto',
                                width: 66,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 5,
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 66,
                                  height: 50,
                                  borderRadius: 11,
                                  display: 'grid',
                                  placeItems: 'center',
                                  background: 'linear-gradient(135deg, rgba(107,63,160,0.14), rgba(96,165,250,0.16))',
                                  color: PURPLE,
                                  border: `2px solid ${sel ? PURPLE : 'transparent'}`,
                                  boxShadow: sel ? '0 4px 14px rgba(107,63,160,0.28)' : 'none',
                                }}
                              >
                                <TIcon size={20} />
                              </span>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  lineHeight: 1.2,
                                  textAlign: 'center',
                                  color: sel ? PURPLE : '#475569',
                                }}
                              >
                                {c.title.split(' ')[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <PromptBuilder
                      cardId={cardId}
                      slotValues={slotValues}
                      onSlotsChange={setSlotValues}
                      freeText={freeText}
                      freeTextValue={freeTextValue}
                      onFreeTextToggle={setFreeText}
                      onFreeTextChange={setFreeTextValue}
                      onPromptChange={setPrompt}
                    />
                  </>
                )}

                {s.id === 'style' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <p style={seedLabelStyle}>Visual style</p>
                      <StyleRow value={style} onChange={setStyle} columns={4} />
                    </div>
                    <div>
                      <p style={seedLabelStyle}>
                        Color palette{' '}
                        <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(optional)</span>
                      </p>
                      <PaletteGrid value={palette} onChange={setPalette} columns={3} />
                    </div>
                    <ReferenceUpload
                      styleRef={styleRef}
                      compositionRef={compositionRef}
                      onStyleRefChange={setStyleRef}
                      onCompositionRefChange={setCompositionRef}
                    />
                  </div>
                )}

                {s.id === 'size' && <SizeRow value={aspect} onChange={setAspect} />}
              </div>
            )}
          </div>
        );
      })}

      {/* error */}
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            margin: '6px 0 10px',
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(185,28,28,0.06)',
            border: '1px solid rgba(185,28,28,0.2)',
            fontSize: 14,
            color: '#b91c1c',
            lineHeight: 1.45,
          }}
        >
          <AlertCircle size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>
            {error}{' '}
            <button
              type="button"
              onClick={runGenerate}
              style={{
                border: 'none',
                background: 'none',
                font: 'inherit',
                fontWeight: 700,
                color: '#b91c1c',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Retry
            </button>
          </span>
        </div>
      )}

      {/* Create CTA */}
      <div style={{ paddingTop: 8 }}>
        <button
          type="button"
          className="btn-cta-bold"
          onClick={runGenerate}
          disabled={!canCreate}
          style={{ width: '100%', justifyContent: 'center', minHeight: 46, fontSize: 15, fontWeight: 700 }}
        >
          {generating ? 'Creating…' : 'Create'}
          {generating ? null : <ArrowRight size={16} aria-hidden="true" />}
        </button>
        <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', margin: '9px 0 0' }}>
          Generates 4 variations · ~5–10s
        </p>
      </div>
    </div>
  );
}

const seedLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  margin: '0 0 8px',
};
