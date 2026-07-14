'use client';

// ── Shared image-generation engine — ImageCreateWizard ─────────────────────
//
// The full Direction-2 wizard (image-prompt-flow-d2.html, APPROVED). Three
// steps sourced from the shared SECTIONS taxonomy with a clickable step rail:
//   1. Describe — entry row (Start from example / Surprise me / Start blank)
//      then the PromptBuilder.
//   2. Style & color — StyleRow + PaletteGrid + (collapsed) ReferenceUpload.
//      Defaults are pre-chosen so the step is skippable.
//   3. Size — SizeRow.
// Footer Create (btn-cta-bold) → useImageGen.generate({ n: 4 }) → ResultPicker
// takes over. Cmd/Ctrl+Enter advances / creates. Errors → inline retry, never
// alert(). "Surprise me" seeds a random template and STAYS on Describe (locked).
//
// Self-contained + importable; page wiring is Stage 3/4. On-palette only.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Shuffle,
  Plus,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { CARDS, type PromptTemplate } from './promptModel';
import { templateIcon } from './iconMap';
import { SECTIONS } from './sections';
import { PromptBuilder } from './PromptBuilder';
import { StyleRow } from './StyleRow';
import { PaletteGrid } from './PaletteGrid';
import { SizeRow } from './SizeRow';
import { ReferenceUpload } from './ReferenceUpload';
import { ResultPicker } from './ResultPicker';
import { palettePromptFragment } from './palettes';
import { useImageGen } from './useImageGen';
import { probeImageDims } from './imageDims';
import { saveGeneratedVisual } from '@/lib/visualStorage';
import type { AiResult, AspectId, ImageStyle, Quality } from './types';

const PURPLE = '#6B3FA0';
const PURPLE_DEEP = '#401842';

/** Map each template to a sensible default style (purely a starting point). */
const TEMPLATE_DEFAULT_STYLE: Record<string, ImageStyle> = {
  'object-on-bg': 'illustration',
  'person-portrait': 'photographic',
  'nature-macro': 'photographic',
  'tech-abstract': 'abstract',
  'scene-story': 'illustration',
  watercolor: 'watercolor',
};

/** Build the default slot-value map for a template from its slot defaults. */
function defaultSlots(card: PromptTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of card.slots) out[s.id] = s.defaultValue;
  return out;
}

export interface ImageCreateWizardProps {
  /** Confirm a chosen image. naturalDims provided when known (aspect-correct). */
  onUse: (result: AiResult, naturalDims?: { width: number; height: number }) => void;
  /** Optional auto-context for slide-aware generation (slides shell uses it). */
  slideContext?: { slideHeading?: string; deckTitle?: string; themePalette?: string };
  /** Optionally pre-select a template (skips the chooser into Describe). */
  initialTemplateId?: string;
  /** Fires with the final prompt the instant a generation is kicked off.
   *  Parity with ImageGenAccordion — lets a host pin the prompt for a
   *  "More like this" row / library refetch. Optional. */
  onGenerated?: (prompt: string) => void;
}

type StepIndex = 0 | 1 | 2;

export function ImageCreateWizard({
  onUse,
  slideContext,
  initialTemplateId,
  onGenerated,
}: ImageCreateWizardProps) {
  const [step, setStep] = useState<StepIndex>(0);
  const [cardId, setCardId] = useState<string | null>(initialTemplateId ?? null);
  const [chosen, setChosen] = useState<boolean>(!!initialTemplateId);
  const [slotValues, setSlotValues] = useState<Record<string, string>>(() => {
    if (initialTemplateId) {
      const c = CARDS.find((x) => x.id === initialTemplateId);
      return c ? defaultSlots(c) : {};
    }
    return {};
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

  const card = useMemo(() => CARDS.find((c) => c.id === cardId) ?? null, [cardId]);

  // ── template selection ──
  const selectTemplate = useCallback((id: string, advance: boolean) => {
    const c = CARDS.find((x) => x.id === id);
    if (!c) return;
    setCardId(id);
    setSlotValues(defaultSlots(c));
    setStyle(TEMPLATE_DEFAULT_STYLE[id] ?? 'photographic');
    setFreeText(false);
    setFreeTextValue('');
    setChosen(true);
    if (advance) setStep(0); // stay on Describe; the chooser collapses
  }, []);

  const surprise = useCallback(() => {
    const random = CARDS[Math.floor(Math.random() * CARDS.length)];
    selectTemplate(random.id, true); // stays on Describe (locked decision)
  }, [selectTemplate]);

  const startBlank = useCallback(() => {
    // Use the simplest template (object-on-bg) cleared to empty as a blank base.
    const base = CARDS[0];
    const empty: Record<string, string> = {};
    for (const s of base.slots) empty[s.id] = '';
    setCardId(base.id);
    setSlotValues(empty);
    setStyle('photographic');
    setFreeText(true);
    setFreeTextValue('');
    setChosen(true);
  }, []);

  // ── final prompt assembly (slots/free + palette fragment) ──
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

  // ── step nav ──
  const goNext = useCallback(() => {
    if (step < 2) setStep((s) => (s + 1) as StepIndex);
    else runGenerate();
  }, [step, runGenerate]);

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => (s - 1) as StepIndex);
  }, [step]);

  // Cmd/Ctrl+Enter advances / creates.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!results) goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, results]);

  // ── render: results take over ──
  if (results) {
    return (
      <section className="glass-card" aria-label="Image results" style={{ padding: 18 }}>
        <ResultPicker
          results={results}
          onUse={(r) => void handleUse(r)}
          onMore={runGenerate}
          onDismiss={reset}
          generating={generating}
        />
      </section>
    );
  }

  const stepNote =
    step === 0
      ? 'Start from an example, then swap the words you care about.'
      : step === 1
        ? 'Optional — sensible defaults are already chosen.'
        : 'Choose the shape of your image.';

  return (
    <section className="glass-card" aria-label="Create an image" style={{ padding: 18 }}>
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: 'linear-gradient(135deg, #818cf8, #60a5fa)',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
          }}
        >
          <Sparkles size={16} />
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Create an image</div>
          <div style={{ fontSize: 14, color: '#64748b' }}>{stepNote}</div>
        </div>
      </header>

      {/* step rail */}
      <nav aria-label="Steps" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        {SECTIONS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          const reachable = i <= step;
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : '0 0 auto' }}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${s.label}`}
                disabled={!reachable}
                onClick={() => reachable && setStep(i as StepIndex)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  padding: '4px 6px',
                  border: 'none',
                  background: 'none',
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: active ? PURPLE_DEEP : done ? PURPLE : '#94a3b8',
                  cursor: reachable ? 'pointer' : 'default',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    background: done ? PURPLE : '#fff',
                    color: done ? '#fff' : active ? PURPLE : '#94a3b8',
                    border: `1.5px solid ${done || active ? PURPLE : '#cbd5e1'}`,
                  }}
                >
                  {i + 1}
                </span>
                {s.label}
              </button>
              {i < 2 && (
                <span
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: 2,
                    minWidth: 8,
                    borderRadius: 2,
                    background: done ? PURPLE : '#e2e8f0',
                  }}
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* ── STEP 1: DESCRIBE ── */}
      {step === 0 && (
        <div>
          {!chosen ? (
            <>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px', lineHeight: 1.45 }}>
                Tap an example and we&apos;ll write a great prompt for you — then just swap the
                words you care about. No blank box.
              </p>
              <div
                role="list"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {CARDS.map((c) => {
                  const Icon = templateIcon(c.iconId);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="listitem"
                      aria-label={`Start from ${c.title}`}
                      onClick={() => selectTemplate(c.id, true)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 7,
                        minHeight: 44,
                        padding: '14px 8px',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: 12,
                        background: '#fff',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          display: 'grid',
                          placeItems: 'center',
                          background: 'linear-gradient(135deg, rgba(107,63,160,0.12), rgba(96,165,250,0.14))',
                          color: PURPLE,
                        }}
                      >
                        <Icon size={20} />
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                        {c.title}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button type="button" onClick={surprise} style={ghostBtnStyle}>
                  <Shuffle size={16} aria-hidden="true" />
                  Surprise me
                </button>
                <button type="button" onClick={startBlank} style={ghostBtnStyle}>
                  <Plus size={16} aria-hidden="true" />
                  Start blank
                </button>
              </div>
            </>
          ) : (
            <>
              {card && (
                <button
                  type="button"
                  onClick={() => setChosen(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 44,
                    padding: '0 4px',
                    border: 'none',
                    background: 'none',
                    font: 'inherit',
                    fontSize: 14,
                    fontWeight: 600,
                    color: PURPLE,
                    cursor: 'pointer',
                    marginBottom: 8,
                  }}
                >
                  ← Change starting point
                </button>
              )}
              {cardId && (
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
              )}
            </>
          )}
        </div>
      )}

      {/* ── STEP 2: STYLE & COLOR ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={sectionLabelStyle}>Visual style</p>
            <StyleRow value={style} onChange={setStyle} columns={4} />
          </div>
          <div>
            <p style={sectionLabelStyle}>
              Color palette <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#94a3b8' }}>(optional)</span>
            </p>
            <PaletteGrid value={palette} onChange={setPalette} columns={4} />
          </div>
          <ReferenceUpload
            styleRef={styleRef}
            compositionRef={compositionRef}
            onStyleRefChange={setStyleRef}
            onCompositionRefChange={setCompositionRef}
          />
        </div>
      )}

      {/* ── STEP 3: SIZE ── */}
      {step === 2 && (
        <div>
          <p style={sectionLabelStyle}>Size</p>
          <SizeRow value={aspect} onChange={setAspect} />
        </div>
      )}

      {/* error */}
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginTop: 14,
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

      {/* footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          style={{
            minHeight: 44,
            padding: '0 16px',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.7)',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            color: '#334155',
            cursor: step === 0 ? 'not-allowed' : 'pointer',
            opacity: step === 0 ? 0.4 : 1,
          }}
        >
          Back
        </button>
        <button
          type="button"
          className="btn-cta-bold"
          onClick={goNext}
          disabled={step === 2 && !canCreate}
          style={{ flex: 1, justifyContent: 'center', minHeight: 46, fontSize: 15, fontWeight: 700 }}
        >
          {step === 2 ? (generating ? 'Creating…' : 'Create') : 'Continue'}
          {step === 2 ? null : <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  minHeight: 44,
  padding: '11px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.7)',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  color: '#334155',
  cursor: 'pointer',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  margin: '0 0 8px',
};
