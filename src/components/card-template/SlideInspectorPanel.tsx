'use client';

/**
 * SlideInspectorPanel — right-side inspector for the slide editor.
 *
 * Shows sections conditionally on the selected object type:
 * - Text-bearing blocks (heading, paragraph, callout, button, label-group, bullet-list): TYPOGRAPHY + SIZE + BOX
 * - Image: TYPOGRAPHY (caption) + SIZE + LAYOUT + BOX
 * - Container (smart-layout, grid-layout): SIZE + LAYOUT + BOX
 * - Multi-select: union of sections; non-uniform fields show "Mixed"
 *
 * Visual treatment per spec §5:
 *   - 320px white panel, no glass
 *   - Section headers: text-xs uppercase tracked
 *   - Foxit palette only (orange #FF5F00, purple #6B3FA0, slate, white)
 *
 * State wiring per spec §6:
 *   - `selectedBlocks` is the array of currently selected blocks (>=1)
 *   - Each field change calls `onUpdate(blockKey, partialOverride)` debounced 200ms
 *   - Mixed = sentinel value; editing overwrites all selected
 *   - Padding/Margin/Border collapse state persists in localStorage
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, RotateCcw, AlertTriangle } from 'lucide-react';
import type { CardBlock, CardProvenance, SourceDocument, SourcePassage } from '@/types/card-template';
import {
  ColorControl,
  NumberControl,
  RangeControl,
  SegmentedControl,
  SelectControl,
} from '@/components/ui/controls';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlockStyleOverride {
  // Typography
  fontFamily?: string;
  fontSize?: number; // px
  fontWeight?: number; // 100..900
  color?: string; // hex
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number; // multiplier
  letterSpacing?: number; // px
  // Size
  width?: number; // px
  height?: number; // px
  // Layout (containers only)
  gap?: number; // px
  flexDirection?: 'row' | 'column';
  justifyContent?: 'start' | 'center' | 'end' | 'space-between';
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  // Box
  opacity?: number; // 0..1
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  borderTop?: number;
  borderRight?: number;
  borderBottom?: number;
  borderLeft?: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  borderColor?: string; // hex
  borderRadius?: number; // px
}

export interface SelectedBlockEntry {
  /** Composite key `${cardIdx}:${blockIdx}` */
  key: string;
  block: CardBlock;
  /** Current override state for this block */
  override: BlockStyleOverride;
}

interface SlideInspectorPanelProps {
  selected: SelectedBlockEntry[];
  onUpdate: (key: string, partial: BlockStyleOverride) => void;
  /** Apply same patch to ALL selected blocks (for Mixed-state edits) */
  onUpdateAll: (partial: BlockStyleOverride) => void;
  /**
   * Provenance of the parent card containing the currently selected blocks
   * (Phase E source-grounded decks only). Pass null for prompt-only cards
   * or when the selection spans cards with different provenance.
   */
  cardProvenance?: CardProvenance | null;
  /**
   * The SourceDocument referenced by cardProvenance.sourceDocId. Looked up
   * by the parent from CardTemplate.sources. Pass null when no source is
   * available (e.g., source bytes evicted, or no provenance).
   */
  cardSource?: SourceDocument | null;
  /**
   * Open the source drawer at the given 1-indexed page. Parent owns the
   * drawer state. Optional `highlight` text is the source passage to
   * highlight on the rendered page (Foxit text-search target, E-15).
   */
  onOpenSource?: (initialPage: number, highlight?: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TEXT_BEARING: ReadonlyArray<CardBlock['type']> = [
  'heading',
  'paragraph',
  'callout',
  'button',
  'label-group',
  'bullet-list',
  'toggle',
];

const CONTAINER: ReadonlyArray<CardBlock['type']> = [
  'smart-layout',
  'grid-layout',
  'image',
];

function isTextBearing(b: CardBlock): boolean {
  return TEXT_BEARING.includes(b.type);
}

function isContainer(b: CardBlock): boolean {
  return CONTAINER.includes(b.type);
}

/** Return a uniform value across selected blocks, or 'Mixed' sentinel. */
function uniform<T>(
  entries: SelectedBlockEntry[],
  getter: (e: SelectedBlockEntry) => T | undefined
): T | 'Mixed' | undefined {
  if (entries.length === 0) return undefined;
  const first = getter(entries[0]);
  for (let i = 1; i < entries.length; i++) {
    if (getter(entries[i]) !== first) return 'Mixed';
  }
  return first;
}

/** Read collapse state from localStorage */
function useCollapseState(key: string, defaultCollapsed: boolean): [boolean, (v: boolean) => void] {
  const storageKey = `slideInspector.collapse.${key}`;
  const [collapsed, setCollapsedRaw] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultCollapsed;
    const v = window.localStorage.getItem(storageKey);
    return v === null ? defaultCollapsed : v === '1';
  });
  const setCollapsed = useCallback(
    (v: boolean) => {
      setCollapsedRaw(v);
      try {
        window.localStorage.setItem(storageKey, v ? '1' : '0');
      } catch {
        // ignore storage failure (private mode, etc.)
      }
    },
    [storageKey]
  );
  return [collapsed, setCollapsed];
}

/** Debounce a function by N ms using a ref-stable handle. */
function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  return useCallback(
    (...args: TArgs) => {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay]
  );
}

// ── Field adapters ─────────────────────────────────────────────────────────
// Thin wrappers around the shared controls that handle the inspector's
// "Mixed" multi-select sentinel. Pure presentational concerns live in the
// underlying controls; these adapters only translate Mixed ↔ control props.

interface NumericFieldProps {
  label: string;
  value: number | 'Mixed' | undefined;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}

function NumericField({ label, value, unit, step = 1, min, max, onChange }: NumericFieldProps) {
  const isMixed = value === 'Mixed';
  const numeric = typeof value === 'number' ? value : 0;
  return (
    <NumberControl
      label={label}
      value={numeric}
      min={min}
      max={max}
      step={step}
      unit={unit}
      placeholder={isMixed ? 'Mixed' : undefined}
      onChange={onChange}
    />
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T | 'Mixed' | undefined;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}

function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const isMixed = value === 'Mixed';
  return (
    <SelectControl<T>
      label={label}
      value={isMixed ? '' : (value ?? options[0]?.value ?? '')}
      options={options}
      onChange={onChange}
      mixed={isMixed}
    />
  );
}

interface SegmentedFieldProps<T extends string> {
  label: string;
  value: T | 'Mixed' | undefined;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}

function SegmentedField<T extends string>({ label, value, options, onChange }: SegmentedFieldProps<T>) {
  // When Mixed, no segment is highlighted (findIndex returns -1, clamped to 0
  // visually but no aria-checked match). Editing applies to all selected.
  const fallback = options[0]?.value as T;
  const resolved = value === 'Mixed' || value === undefined ? fallback : value;
  return (
    <SegmentedControl<T>
      label={label}
      value={resolved}
      options={options}
      onChange={onChange}
    />
  );
}

interface ColorFieldProps {
  label: string;
  value: string | 'Mixed' | undefined;
  onChange: (v: string) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  const isMixed = value === 'Mixed';
  const hex = isMixed || value === undefined ? '#000000' : value;
  return <ColorControl label={isMixed ? `${label} (Mixed)` : label} value={hex} onChange={onChange} />;
}

interface RangeFieldProps {
  label: string;
  value: number | 'Mixed' | undefined;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function RangeField({ label, value, min = 0, max = 100, step = 1, unit, onChange }: RangeFieldProps) {
  const numeric = typeof value === 'number' ? value : 0;
  return (
    <RangeControl
      label={value === 'Mixed' ? `${label} (Mixed)` : label}
      value={numeric}
      min={min}
      max={max}
      step={step}
      unit={unit}
      onChange={onChange}
    />
  );
}

// ── Section atoms ──────────────────────────────────────────────────────────

interface SectionShellProps {
  title: string;
  children: React.ReactNode;
}

function SectionShell({ title, children }: SectionShellProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <h3
        style={{
          fontSize: '0.75rem', // text-xs (metadata)
          fontWeight: 600,
          letterSpacing: '0.05em',
          color: '#64748b', // slate-500
          textTransform: 'uppercase',
          margin: 0,
          marginBottom: '4px',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {children}
      </div>
    </section>
  );
}

// ── TYPOGRAPHY section ─────────────────────────────────────────────────────

const FONT_OPTIONS = [
  'DM Mono',
  'Inter',
  'Plus Jakarta Sans',
  'Space Grotesk',
  'DM Sans',
  'Sora',
  'Playfair Display',
  'Roboto',
  'Helvetica',
  'Georgia',
].map((f) => ({ value: f, label: f }));

const WEIGHT_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
  value: String(w),
  label: String(w),
}));

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'justify', label: 'Justify' },
] as const;

interface SectionProps {
  selected: SelectedBlockEntry[];
  patch: (partial: BlockStyleOverride) => void;
}

function SectionTypography({ selected, patch }: SectionProps) {
  const font = uniform(selected, (e) => e.override.fontFamily ?? 'DM Mono');
  const size = uniform(selected, (e) => e.override.fontSize ?? 16);
  const weight = uniform(selected, (e) => e.override.fontWeight ?? 400);
  const color = uniform(selected, (e) => e.override.color ?? '#22201c');
  const align = uniform(selected, (e) => e.override.textAlign ?? 'left');
  const line = uniform(selected, (e) => e.override.lineHeight ?? 1.4);
  const tracking = uniform(selected, (e) => e.override.letterSpacing ?? 0);

  return (
    <SectionShell title="Typography">
      <SelectField label="Font" value={font} options={FONT_OPTIONS} onChange={(v) => patch({ fontFamily: v })} />
      <NumericField label="Size" value={size} unit="px" min={4} max={400} onChange={(v) => patch({ fontSize: v })} />
      <SelectField
        label="Weight"
        value={weight === 'Mixed' ? 'Mixed' : (weight !== undefined ? String(weight) : undefined)}
        options={WEIGHT_OPTIONS}
        onChange={(v) => patch({ fontWeight: parseInt(v, 10) })}
      />
      <ColorField label="Color" value={color} onChange={(v) => patch({ color: v })} />
      <SelectField label="Align" value={align} options={[...ALIGN_OPTIONS]} onChange={(v) => patch({ textAlign: v })} />
      <NumericField label="Line" value={line} step={0.05} min={0.5} max={3} onChange={(v) => patch({ lineHeight: v })} />
      <NumericField label="Tracking" value={tracking} unit="px" step={0.1} min={-10} max={20} onChange={(v) => patch({ letterSpacing: v })} />
    </SectionShell>
  );
}

// ── SIZE section ──────────────────────────────────────────────────────────

function SectionSize({ selected, patch }: SectionProps) {
  const w = uniform(selected, (e) => e.override.width);
  const h = uniform(selected, (e) => e.override.height);
  return (
    <SectionShell title="Size">
      <NumericField label="Width" value={w} unit="px" step={1} min={0} onChange={(v) => patch({ width: v })} />
      <NumericField label="Height" value={h} unit="px" step={1} min={0} onChange={(v) => patch({ height: v })} />
    </SectionShell>
  );
}

// ── LAYOUT section (containers only) ───────────────────────────────────────

function SectionLayout({ selected, patch }: SectionProps) {
  const gap = uniform(selected, (e) => e.override.gap ?? 0);
  const dir = uniform(selected, (e) => e.override.flexDirection ?? 'row');
  const justify = uniform(selected, (e) => e.override.justifyContent ?? 'start');
  const align = uniform(selected, (e) => e.override.alignItems ?? 'start');
  return (
    <SectionShell title="Layout">
      <NumericField label="Gap" value={gap} unit="px" min={0} onChange={(v) => patch({ gap: v })} />
      <SegmentedField
        label="Direction"
        value={dir}
        options={[
          { value: 'row', label: 'Row' },
          { value: 'column', label: 'Column' },
        ]}
        onChange={(v) => patch({ flexDirection: v })}
      />
      <SelectField
        label="Justify"
        value={justify}
        options={[
          { value: 'start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'end', label: 'End' },
          { value: 'space-between', label: 'Space Between' },
        ]}
        onChange={(v) => patch({ justifyContent: v })}
      />
      <SelectField
        label="Align"
        value={align}
        options={[
          { value: 'start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'end', label: 'End' },
          { value: 'stretch', label: 'Stretch' },
        ]}
        onChange={(v) => patch({ alignItems: v })}
      />
    </SectionShell>
  );
}

// ── BOX section ────────────────────────────────────────────────────────────

interface CollapsibleSpacingProps {
  collapseKey: string;
  label: string;
  values: {
    top: number | 'Mixed' | undefined;
    right: number | 'Mixed' | undefined;
    bottom: number | 'Mixed' | undefined;
    left: number | 'Mixed' | undefined;
  };
  onChange: (side: 'top' | 'right' | 'bottom' | 'left', v: number) => void;
  /** When collapsed, edits update all 4 sides at once */
  onChangeAll: (v: number) => void;
}

function CollapsibleSpacing({ collapseKey, label, values, onChange, onChangeAll }: CollapsibleSpacingProps) {
  const [collapsed, setCollapsed] = useCollapseState(collapseKey, true);
  const allUniform =
    values.top === values.right &&
    values.top === values.bottom &&
    values.top === values.left;
  const single: number | 'Mixed' | undefined = allUniform ? values.top : 'Mixed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        aria-expanded={!collapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'rgba(41, 38, 27, 0.72)',
          fontSize: '11.5px',
          fontWeight: 500,
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        {label}
      </button>
      {collapsed ? (
        <NumericField label={label} value={single} unit="px" min={0} onChange={onChangeAll} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          <NumericField label="Top" value={values.top} unit="px" min={0} onChange={(v) => onChange('top', v)} />
          <NumericField label="Right" value={values.right} unit="px" min={0} onChange={(v) => onChange('right', v)} />
          <NumericField label="Bottom" value={values.bottom} unit="px" min={0} onChange={(v) => onChange('bottom', v)} />
          <NumericField label="Left" value={values.left} unit="px" min={0} onChange={(v) => onChange('left', v)} />
        </div>
      )}
    </div>
  );
}

function SectionBox({ selected, patch }: SectionProps) {
  const opacity = uniform(selected, (e) => e.override.opacity ?? 1);
  const radius = uniform(selected, (e) => e.override.borderRadius ?? 0);

  const padTop = uniform(selected, (e) => e.override.paddingTop ?? 0);
  const padRight = uniform(selected, (e) => e.override.paddingRight ?? 0);
  const padBottom = uniform(selected, (e) => e.override.paddingBottom ?? 0);
  const padLeft = uniform(selected, (e) => e.override.paddingLeft ?? 0);

  const marTop = uniform(selected, (e) => e.override.marginTop ?? 0);
  const marRight = uniform(selected, (e) => e.override.marginRight ?? 0);
  const marBottom = uniform(selected, (e) => e.override.marginBottom ?? 0);
  const marLeft = uniform(selected, (e) => e.override.marginLeft ?? 0);

  const borTop = uniform(selected, (e) => e.override.borderTop ?? 0);
  const borRight = uniform(selected, (e) => e.override.borderRight ?? 0);
  const borBottom = uniform(selected, (e) => e.override.borderBottom ?? 0);
  const borLeft = uniform(selected, (e) => e.override.borderLeft ?? 0);
  const borStyle = uniform(selected, (e) => e.override.borderStyle ?? 'none');
  const borColor = uniform(selected, (e) => e.override.borderColor ?? '#e2e8f0');

  const [borderCollapsed, setBorderCollapsed] = useCollapseState('border', true);
  const borderUniform = borTop === borRight && borTop === borBottom && borTop === borLeft;
  const borderSingle: number | 'Mixed' | undefined = borderUniform ? borTop : 'Mixed';

  return (
    <SectionShell title="Box">
      <RangeField
        label="Opacity"
        value={opacity}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => patch({ opacity: v })}
      />

      <CollapsibleSpacing
        collapseKey="padding"
        label="Padding"
        values={{ top: padTop, right: padRight, bottom: padBottom, left: padLeft }}
        onChange={(side, v) =>
          patch({
            paddingTop: side === 'top' ? v : undefined,
            paddingRight: side === 'right' ? v : undefined,
            paddingBottom: side === 'bottom' ? v : undefined,
            paddingLeft: side === 'left' ? v : undefined,
          } as BlockStyleOverride)
        }
        onChangeAll={(v) => patch({ paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v })}
      />

      <CollapsibleSpacing
        collapseKey="margin"
        label="Margin"
        values={{ top: marTop, right: marRight, bottom: marBottom, left: marLeft }}
        onChange={(side, v) =>
          patch({
            marginTop: side === 'top' ? v : undefined,
            marginRight: side === 'right' ? v : undefined,
            marginBottom: side === 'bottom' ? v : undefined,
            marginLeft: side === 'left' ? v : undefined,
          } as BlockStyleOverride)
        }
        onChangeAll={(v) => patch({ marginTop: v, marginRight: v, marginBottom: v, marginLeft: v })}
      />

      {/* Border collapsible — special: includes T/R/B/L numeric + Style + Color */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button
          type="button"
          onClick={() => setBorderCollapsed(!borderCollapsed)}
          aria-label={borderCollapsed ? 'Expand Border' : 'Collapse Border'}
          aria-expanded={!borderCollapsed}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'rgba(41, 38, 27, 0.72)',
            fontSize: '11.5px',
            fontWeight: 500,
          }}
        >
          {borderCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          Border
        </button>
        {borderCollapsed ? (
          <NumericField
            label="Border"
            value={borderSingle}
            unit="px"
            min={0}
            onChange={(v) => patch({ borderTop: v, borderRight: v, borderBottom: v, borderLeft: v })}
          />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              <NumericField label="Top" value={borTop} unit="px" min={0} onChange={(v) => patch({ borderTop: v })} />
              <NumericField label="Right" value={borRight} unit="px" min={0} onChange={(v) => patch({ borderRight: v })} />
              <NumericField label="Bottom" value={borBottom} unit="px" min={0} onChange={(v) => patch({ borderBottom: v })} />
              <NumericField label="Left" value={borLeft} unit="px" min={0} onChange={(v) => patch({ borderLeft: v })} />
            </div>
            <SelectField
              label="Style"
              value={borStyle}
              options={[
                { value: 'none', label: 'None' },
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
              onChange={(v) => patch({ borderStyle: v })}
            />
            <ColorField label="Border color" value={borColor} onChange={(v) => patch({ borderColor: v })} />
          </>
        )}
      </div>

      <NumericField label="Radius" value={radius} unit="px" min={0} onChange={(v) => patch({ borderRadius: v })} />
    </SectionShell>
  );
}

// ── SOURCE section (Phase E, D2 design) ─────────────────────────────────────

const CLAIM_LABEL: Record<CardProvenance['claimType'], string> = {
  verbatim: 'Quoted from',
  paraphrase: 'Paraphrased from',
  derived: 'Derived from',
};

function formatClaimText(claimType: CardProvenance['claimType'], pageCount: number): string {
  const label = CLAIM_LABEL[claimType];
  if (pageCount === 1) return `${label} 1 page`;
  return `${label} ${pageCount} pages`;
}

function fileGlyph(fileType: SourceDocument['fileType']): string {
  if (fileType === 'docx') return 'DOC';
  if (fileType === 'pptx') return 'PPT';
  if (fileType === 'image') return 'IMG';
  return 'PDF';
}

interface PassageRowProps {
  passage: SourcePassage;
  source: SourceDocument | null;
  onOpenSource: (page: number, text: string) => void;
}

function truncatePassage(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;
  return collapsed.slice(0, maxChars).trim() + '…';
}

function PassageRow({ passage, source, onOpenSource }: PassageRowProps) {
  const [hover, setHover] = useState(false);
  const thumbUrl = source
    ? `/api/source-grounded/render-page?hash=${encodeURIComponent(source.contentHash)}&page=${passage.page}&maxDim=180`
    : '';

  const handleClick = useCallback(() => {
    if (!source) return;
    onOpenSource(passage.page, passage.text);
  }, [source, onOpenSource, passage.page, passage.text]);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative' }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={!source}
        style={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr auto',
          gap: '10px',
          alignItems: 'flex-start',
          width: '100%',
          textAlign: 'left',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '8px',
          cursor: source ? 'pointer' : 'not-allowed',
          opacity: source ? 1 : 0.65,
          transition: 'border-color 120ms ease, transform 120ms ease',
        }}
        onMouseDown={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0.5px)';
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            width: '52px',
            height: '66px',
            borderRadius: '3px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          {source ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl}
              alt={`Page ${passage.page} thumbnail`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top',
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>p. {passage.page}</span>
          )}
        </div>

        {/* Snippet + section ref */}
        <div style={{ minWidth: 0 }}>
          {passage.section && (
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#7c3aed',
                marginBottom: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {passage.section}
            </div>
          )}
          <div
            style={{
              fontSize: '11.5px',
              color: '#334155',
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {truncatePassage(passage.text, 220)}
          </div>
        </div>

        {/* Page number */}
        <div
          style={{
            fontSize: '10.5px',
            fontWeight: 600,
            color: '#64748b',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            padding: '2px 6px',
            flexShrink: 0,
            alignSelf: 'flex-start',
          }}
        >
          p. {passage.page}
        </div>
      </button>

      {/* Hover popover — anchored to the LEFT of the inspector (right edge of canvas) */}
      {hover && source && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 0,
            right: 'calc(100% + 8px)',
            width: '320px',
            maxWidth: 'calc(100vw - 360px)',
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            boxShadow: '0 12px 28px -16px rgba(15, 23, 42, 0.35)',
            padding: '12px',
            zIndex: 50,
            pointerEvents: 'none',
            fontSize: '12.5px',
            color: '#1e293b',
            lineHeight: 1.5,
          }}
        >
          {passage.section && (
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#7c3aed',
                marginBottom: '6px',
              }}
            >
              {passage.section}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap' }}>{passage.text}</div>
          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid #e2e8f0',
              fontSize: '11px',
              color: '#7c3aed',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ExternalLink size={11} strokeWidth={2.25} />
            Click to open page {passage.page}
          </div>
        </div>
      )}
    </div>
  );
}

interface SectionSourceProps {
  provenance: CardProvenance;
  source: SourceDocument | null;
  onOpenSource: (page: number, highlight?: string) => void;
}

function SectionSource({ provenance, source, onOpenSource }: SectionSourceProps) {
  const pages = provenance.sourcePages;
  const passages = provenance.passages ?? [];
  const claimText = formatClaimText(provenance.claimType, pages.length);

  return (
    <SectionShell title="Source">
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          background: '#fbfcfe',
        }}
      >
        {/* File row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '36px',
              borderRadius: '4px',
              background: 'white',
              border: '1px solid #cbd5e1',
              display: 'grid',
              placeItems: 'center',
              fontSize: '8.5px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: '#475569',
              flexShrink: 0,
            }}
          >
            {fileGlyph(source?.fileType ?? 'pdf')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#1e293b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {source?.filename ?? 'Source unavailable'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              {source ? `${source.pageCount} pages` : 'bytes not persisted'}
            </div>
          </div>
        </div>

        {/* Claim pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            alignSelf: 'flex-start',
            padding: '4px 8px',
            borderRadius: '999px',
            fontSize: '10.5px',
            fontWeight: 600,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            background: provenance.claimType === 'verbatim' ? '#ede9fe' : provenance.claimType === 'paraphrase' ? '#f5f3ff' : '#f1f5f9',
            color: provenance.claimType === 'verbatim' ? '#6d28d9' : provenance.claimType === 'paraphrase' ? '#7c3aed' : '#475569',
          }}
        >
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: provenance.claimType === 'verbatim' ? '#7c3aed' : provenance.claimType === 'paraphrase' ? '#a78bfa' : '#94a3b8',
            }}
          />
          {claimText}
        </div>

        {/* Passages — ChatGPT-style thumbnails + snippets. Falls back to page
            chips for legacy decks generated before E-12. */}
        {passages.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {passages.map((p, i) => (
              <PassageRow
                key={`${p.page}-${i}`}
                passage={p}
                source={source}
                onOpenSource={onOpenSource}
              />
            ))}
          </div>
        ) : pages.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Pages
            </span>
            {pages.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => source && onOpenSource(p)}
                disabled={!source}
                style={{
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: source ? 'pointer' : 'not-allowed',
                  opacity: source ? 1 : 0.5,
                }}
                title={source ? `Open page ${p} in source viewer` : 'Source bytes not persisted'}
              >
                {p}
              </button>
            ))}
          </div>
        ) : null}

        {/* Section reference (legacy fallback when no passages carry section refs) */}
        {passages.length === 0 && provenance.sourceSection && (
          <div
            style={{
              fontSize: '11.5px',
              color: '#64748b',
              fontStyle: 'italic',
              lineHeight: 1.45,
            }}
          >
            {provenance.sourceSection}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '6px', paddingTop: '4px', borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => source && onOpenSource(pages[0] ?? 1)}
            disabled={!source}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '6px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: source ? 'white' : '#94a3b8',
              background: source ? '#7c3aed' : '#e2e8f0',
              border: 'none',
              cursor: source ? 'pointer' : 'not-allowed',
            }}
          >
            <ExternalLink size={11} strokeWidth={2.25} />
            Open source
          </button>
          <button
            type="button"
            disabled
            title="Regenerate from cited pages — coming soon"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '6px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              background: 'white',
              border: '1px solid #e2e8f0',
              cursor: 'not-allowed',
            }}
          >
            <RotateCcw size={11} strokeWidth={2.25} />
            Regenerate
          </button>
          <button
            type="button"
            disabled
            title="Flag mismatch — coming soon"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 8px',
              borderRadius: '6px',
              color: '#94a3b8',
              background: 'white',
              border: '1px solid #e2e8f0',
              cursor: 'not-allowed',
            }}
          >
            <AlertTriangle size={11} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </SectionShell>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function SlideInspectorPanel({
  selected,
  onUpdate,
  onUpdateAll,
  cardProvenance,
  cardSource,
  onOpenSource,
}: SlideInspectorPanelProps) {
  // Debounced patch — single block (when only one selected) vs many
  const debouncedSingle = useDebouncedCallback((key: string, p: BlockStyleOverride) => onUpdate(key, p), 200);
  const debouncedAll = useDebouncedCallback((p: BlockStyleOverride) => onUpdateAll(p), 200);

  // patch(...) handler used by every section; merges with previous override and broadcasts to all selected
  const patch = useCallback(
    (partial: BlockStyleOverride) => {
      // Strip undefined keys from the partial — they represent "no change"
      const cleaned: BlockStyleOverride = {};
      for (const [k, v] of Object.entries(partial)) {
        if (v !== undefined) (cleaned as Record<string, unknown>)[k] = v;
      }
      if (Object.keys(cleaned).length === 0) return;
      if (selected.length === 1) {
        debouncedSingle(selected[0].key, cleaned);
      } else {
        debouncedAll(cleaned);
      }
    },
    [selected, debouncedSingle, debouncedAll]
  );

  // Determine which sections to show based on selection
  const sections = useMemo(() => {
    const blocks = selected.map((e) => e.block);
    const hasText = blocks.some(isTextBearing);
    const hasContainer = blocks.some(isContainer);
    return {
      typography: hasText,
      size: true,
      layout: hasContainer,
      box: true,
    };
  }, [selected]);

  if (selected.length === 0) return null;

  // Header label: object type or count
  let headerLabel = 'Object';
  if (selected.length === 1) {
    headerLabel = labelForType(selected[0].block.type);
  } else {
    headerLabel = `${selected.length} objects selected`;
  }

  return (
    <aside
      role="complementary"
      aria-label="Object inspector"
      style={{
        width: '320px',
        flexShrink: 0,
        height: '100%',
        background: 'var(--theme-chrome-bg)',
        color: 'var(--theme-chrome-fg)',
        borderLeft: '1px solid var(--theme-chrome-border)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--theme-chrome-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--theme-chrome-fg)',
          }}
        >
          {headerLabel}
        </div>
      </header>
      <div
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px', // space-y-6 between sections
        }}
      >
        {cardProvenance && onOpenSource && (
          <SectionSource
            provenance={cardProvenance}
            source={cardSource ?? null}
            onOpenSource={onOpenSource}
          />
        )}
        {sections.typography && <SectionTypography selected={selected} patch={patch} />}
        {sections.size && <SectionSize selected={selected} patch={patch} />}
        {sections.layout && <SectionLayout selected={selected} patch={patch} />}
        {sections.box && <SectionBox selected={selected} patch={patch} />}
      </div>
    </aside>
  );
}

function labelForType(type: CardBlock['type']): string {
  switch (type) {
    case 'heading': return 'Heading';
    case 'paragraph': return 'Paragraph';
    case 'smart-layout': return 'Smart Layout';
    case 'grid-layout': return 'Grid';
    case 'label-group': return 'Labels';
    case 'toggle': return 'Toggle';
    case 'callout': return 'Callout';
    case 'button': return 'Button';
    case 'divider': return 'Divider';
    case 'bullet-list': return 'Bullet List';
    case 'image': return 'Image';
    default: return 'Object';
  }
}
