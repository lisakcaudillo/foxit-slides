'use client';

// ── Shared image-generation engine — PromptBuilder ─────────────────────────
//
// Renders the selected template's sentence with inline, auto-sizing editable
// slots (violet-tinted) + a live "Final prompt" readout + a pencil toggle to a
// free-text textarea. Escape in free-text returns to slots. Uses the engine's
// getPromptSegments / buildPrompt. Exposes the current prompt string via
// onChange. Pure value+onChange — no internal generation.
//
// Both shells embed this. On-palette only: violet #6B3FA0 for slots/labels,
// blue #60a5fa for the AI "final prompt" accent, slate neutrals.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pencil, Sparkles, Type } from 'lucide-react';
import { CARDS, buildPrompt } from './promptModel';

const PURPLE = '#6B3FA0';

export interface PromptBuilderProps {
  /** Active template id (from promptModel.CARDS). */
  cardId: string;
  /** Current slot values, keyed by slot id. */
  slotValues: Record<string, string>;
  /** Fired whenever a slot changes — caller owns the value map. */
  onSlotsChange: (next: Record<string, string>) => void;
  /** Free-text mode flag (lifted so shells can persist it). */
  freeText: boolean;
  /** The free-text value when in free-text mode. */
  freeTextValue: string;
  /** Toggle into / out of free-text mode. */
  onFreeTextToggle: (on: boolean) => void;
  /** Free-text value changes. */
  onFreeTextChange: (value: string) => void;
  /** The resolved prompt string (slots-built or free-text), pushed up live. */
  onPromptChange: (prompt: string) => void;
}

/** Auto-sizing inline editable slot. Uses an invisible sizer so the input
 *  grows with its content (no fixed width, no manual char math). */
function Slot({
  id,
  value,
  ariaLabel,
  onChange,
}: {
  id: string;
  value: string;
  ariaLabel: string;
  onChange: (v: string) => void;
}) {
  const placeholder = `add ${id}`;
  const text = value.length > 0 ? value : placeholder;
  return (
    <span style={{ position: 'relative', display: 'inline-grid', margin: '0 1px', verticalAlign: 'baseline' }}>
      {/* sizer mirrors the input text to drive intrinsic width */}
      <span
        aria-hidden="true"
        style={{
          gridArea: '1 / 1',
          visibility: 'hidden',
          whiteSpace: 'pre',
          padding: '2px 9px',
          fontWeight: 600,
          fontSize: 16,
        }}
      >
        {text}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        style={{
          gridArea: '1 / 1',
          minWidth: 30,
          width: '100%',
          border: 'none',
          borderBottom: `2px solid ${value.length > 0 ? PURPLE : '#60a5fa'}`,
          borderRadius: '6px 6px 3px 3px',
          background: 'rgba(107,63,160,0.08)',
          padding: '2px 9px',
          font: 'inherit',
          fontSize: 16,
          fontWeight: 600,
          color: PURPLE,
          textAlign: 'center',
          outline: 'none',
        }}
      />
    </span>
  );
}

export function PromptBuilder({
  cardId,
  slotValues,
  onSlotsChange,
  freeText,
  freeTextValue,
  onFreeTextToggle,
  onFreeTextChange,
  onPromptChange,
}: PromptBuilderProps) {
  const card = useMemo(() => CARDS.find((c) => c.id === cardId), [cardId]);
  const freeRef = useRef<HTMLTextAreaElement | null>(null);
  const liveId = useId();

  // The resolved prompt — free-text raw, or built from slots.
  const resolvedPrompt = freeText
    ? freeTextValue.trim()
    : buildPrompt(cardId, slotValues);

  // Push the resolved prompt up whenever it changes.
  useEffect(() => {
    onPromptChange(resolvedPrompt);
  }, [resolvedPrompt, onPromptChange]);

  const enterFreeText = useCallback(() => {
    // Seed the textarea with the current built prompt so nothing is lost.
    onFreeTextChange(buildPrompt(cardId, slotValues));
    onFreeTextToggle(true);
  }, [cardId, slotValues, onFreeTextChange, onFreeTextToggle]);

  const exitFreeText = useCallback(() => {
    onFreeTextToggle(false);
  }, [onFreeTextToggle]);

  // Focus the textarea when entering free-text.
  useEffect(() => {
    if (freeText) freeRef.current?.focus();
  }, [freeText]);

  const setSlot = useCallback(
    (slotId: string, v: string) => {
      onSlotsChange({ ...slotValues, [slotId]: v });
    },
    [slotValues, onSlotsChange],
  );

  if (!card) {
    return (
      <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
        Pick a starting point to describe your image.
      </p>
    );
  }

  return (
    <div>
      {!freeText ? (
        <div
          aria-label="Editable prompt sentence"
          style={{
            fontSize: 16,
            lineHeight: 2.0,
            color: '#0f172a',
            background: 'rgba(107,63,160,0.05)',
            border: '1px solid rgba(107,63,160,0.10)',
            borderRadius: 12,
            padding: '14px',
          }}
        >
          {card.sentence.map((part, i) => {
            if (typeof part === 'string') {
              return <span key={i}>{part}</span>;
            }
            const slot = card.slots.find((s) => s.id === part.slot);
            const legend = card.legend.find((l) => l.label === part.slot);
            const label = legend
              ? `${part.slot}: ${legend.hint}`
              : part.slot;
            return (
              <Slot
                key={i}
                id={part.slot}
                value={slotValues[part.slot] ?? slot?.defaultValue ?? ''}
                ariaLabel={label}
                onChange={(v) => setSlot(part.slot, v)}
              />
            );
          })}
        </div>
      ) : (
        <textarea
          ref={freeRef}
          value={freeTextValue}
          aria-label="Free-text prompt"
          placeholder="Describe your image in your own words…"
          onChange={(e) => onFreeTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              exitFreeText();
            }
          }}
          style={{
            width: '100%',
            minHeight: 110,
            resize: 'vertical',
            font: 'inherit',
            fontSize: 16,
            lineHeight: 1.6,
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            padding: 13,
            color: '#0f172a',
            background: 'rgba(255,255,255,0.9)',
            outline: 'none',
          }}
        />
      )}

      {/* Pencil toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
        <button
          type="button"
          aria-pressed={freeText}
          aria-label={freeText ? 'Back to guided words' : 'Edit as free text'}
          onClick={() => (freeText ? exitFreeText() : enterFreeText())}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            minHeight: 44,
            padding: '0 14px',
            border: `1px solid ${freeText ? PURPLE : '#cbd5e1'}`,
            borderRadius: 10,
            background: freeText ? 'rgba(107,63,160,0.08)' : 'rgba(255,255,255,0.7)',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            color: freeText ? PURPLE : '#334155',
            cursor: 'pointer',
          }}
        >
          {freeText ? <Type size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
          {freeText ? 'Guided words' : 'Free text'}
        </button>
      </div>

      {/* Live final-prompt readout */}
      <div
        aria-live="polite"
        style={{
          background: 'rgba(96,165,250,0.07)',
          border: '1px solid rgba(96,165,250,0.25)',
          borderRadius: 12,
          padding: '11px 13px',
          fontSize: 14,
          lineHeight: 1.55,
          color: '#334155',
        }}
      >
        <span
          id={liveId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#60a5fa',
            marginBottom: 4,
          }}
        >
          <Sparkles size={13} aria-hidden="true" />
          Final prompt
        </span>
        <span aria-describedby={liveId}>
          {resolvedPrompt || 'Fill in the highlighted words to build your prompt.'}
        </span>
      </div>
    </div>
  );
}
