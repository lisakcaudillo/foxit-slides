'use client';

// ── Graphics editor right inspector (Properties / Arrange) ────────────────────
//
// The dark-glass Properties panel for /editor/asset (design table, 2026-06-23).
// Self-contained dark styling (it must read as frosted glass, not the light
// slides inspector module CSS). Two states:
//   • element selected  → Fill/Color + Position & Size expanded; Arrange,
//     Effects, Canvas, Brand palette collapsed (progressive disclosure).
//   • nothing selected   → Canvas settings + Brand palette (canvas state).
//
// Numeric fields are the locked NumberField: free-text value + − / + steppers +
// a px / % unit toggle (like image resize). Geometry is stored as % of the
// artboard; px display converts via the canvas pixel dims.
//
// Only WIRED controls ship (no dead pixels): X/Y/W/H/rotation/fill/corner edit
// the block via onChangeBlock; align / forward / backward go through onArrange.

import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  BringToFront,
  SendToBack,
} from 'lucide-react';
import type { FreeformBlock } from '@/types/card-template';
import type { AlignEdge } from '@/lib/asset-engine/arrange';

export type ArrangeOp =
  | { kind: 'align'; edge: AlignEdge }
  | { kind: 'forward' }
  | { kind: 'backward' };

interface GraphicsInspectorProps {
  /** The single selected freeform block, or null when nothing is selected. */
  block: FreeformBlock | null;
  /** Artboard pixel dimensions — used for the px ↔ % unit conversion. */
  canvasW: number;
  canvasH: number;
  /** Brand palette swatches (hex). */
  palette: readonly string[];
  /** Replace the selected block with an edited copy. */
  onChangeBlock: (next: FreeformBlock) => void;
  /** Arrange action on the current selection. */
  onArrange: (op: ArrangeOp) => void;
}

// ── tokens (dark glass) ───────────────────────────────────────────────────────
const INK = '#f5f5f7';
const SUB = '#a1a1a6';
const FAINT = '#8e8e93';
const HAIR = 'rgba(255,255,255,0.10)';
const FIELD_BG = 'rgba(255,255,255,0.06)';
// Selected-state accent — the centralized blue↔purple in-between, set on the
// editor root as `--gfx-accent` (falls back to the literal if unset).
const ACCENT = 'var(--gfx-accent, #8B7CF6)';
const ACCENT_SOFT = 'var(--gfx-accent-soft, rgba(139,124,246,0.16))';
const ACCENT_SOFT_2 = 'var(--gfx-accent-soft-2, rgba(139,124,246,0.22))';

// ── fill helpers (per block type) ─────────────────────────────────────────────
function getFill(b: FreeformBlock): string | null {
  if (b.type === 'shape') return b.fill ?? '#2b2b44';
  if (b.type === 'icon') return b.color ?? '#2b2b44';
  if (b.type === 'text') return b.style?.color ?? '#1a1f36';
  return null; // image / chart — no single fill
}
function setFill(b: FreeformBlock, hex: string): FreeformBlock {
  if (b.type === 'shape') return { ...b, fill: hex };
  if (b.type === 'icon') return { ...b, color: hex };
  if (b.type === 'text') return { ...b, style: { ...(b.style ?? {}), color: hex } };
  return b;
}
function blockKindLabel(b: FreeformBlock): string {
  switch (b.type) {
    case 'text': return 'Text';
    case 'image': return 'Image';
    case 'shape': return 'Shape';
    case 'icon': return 'Pictogram';
    case 'chart': return 'Chart';
    default: return 'Element';
  }
}

// ── collapsible section ───────────────────────────────────────────────────────
function Section({
  label, summary, defaultOpen = false, children,
}: { label: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${HAIR}` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '11px 14px', background: 'transparent', border: 0, cursor: 'pointer',
          color: SUB, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{label}</span>
        {!open && summary && (
          <span style={{ marginLeft: 'auto', color: FAINT, fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: 11 }}>{summary}</span>
        )}
      </button>
      {open && <div style={{ padding: '2px 14px 14px' }}>{children}</div>}
    </div>
  );
}

// ── numeric field: free text + − / + steppers + px/% unit toggle ──────────────
function NumField({
  label, value, unit, step = 1, onChange, onToggleUnit,
}: {
  label: string; value: number; unit?: 'px' | '%' | 'deg'; step?: number;
  onChange: (v: number) => void; onToggleUnit?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value));
  const commit = (s: string) => {
    const n = Number(s);
    if (Number.isFinite(n)) onChange(n);
    setDraft(null);
  };
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 16, color: FAINT, fontSize: 11, fontWeight: 600 }}>{label}</span>
      <span style={{
        flex: 1, display: 'flex', alignItems: 'center', height: 28,
        background: FIELD_BG, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: 'hidden',
      }}>
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(value - step)}
          style={stepBtn}>−</button>
        <input
          value={shown}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{
            flex: 1, minWidth: 0, width: '100%', textAlign: 'center', background: 'transparent',
            border: 0, outline: 'none', color: INK, fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + step)}
          style={stepBtn}>+</button>
      </span>
      {unit && (
        <button
          type="button"
          onClick={onToggleUnit}
          disabled={!onToggleUnit || unit === 'deg'}
          aria-label={onToggleUnit ? 'Toggle unit' : undefined}
          style={{
            minWidth: 30, height: 28, padding: '0 6px', flexShrink: 0,
            background: FIELD_BG, border: `1px solid ${HAIR}`, borderRadius: 7,
            color: SUB, fontSize: 11, fontWeight: 600,
            cursor: onToggleUnit ? 'pointer' : 'default',
          }}
        >{unit}</button>
      )}
    </label>
  );
}
const stepBtn: React.CSSProperties = {
  width: 24, height: '100%', flexShrink: 0, background: 'transparent', border: 0,
  color: SUB, fontSize: 15, lineHeight: 1, cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};

// ── align button cluster ──────────────────────────────────────────────────────
function AlignGrid({ onArrange }: { onArrange: (op: ArrangeOp) => void }) {
  const items: Array<[AlignEdge, React.ComponentType<{ size?: number }>, string]> = [
    ['left', AlignStartVertical, 'Align left'],
    ['center', AlignCenterVertical, 'Align center'],
    ['right', AlignEndVertical, 'Align right'],
    ['top', AlignStartHorizontal, 'Align top'],
    ['middle', AlignCenterHorizontal, 'Align middle'],
    ['bottom', AlignEndHorizontal, 'Align bottom'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
      {items.map(([edge, Icon, title]) => (
        <button key={edge} type="button" title={title} aria-label={title}
          onClick={() => onArrange({ kind: 'align', edge })} style={iconBtn}>
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}
const iconBtn: React.CSSProperties = {
  height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: FIELD_BG, border: `1px solid ${HAIR}`, borderRadius: 7, color: SUB, cursor: 'pointer',
};
const wideBtn: React.CSSProperties = {
  flex: 1, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  background: FIELD_BG, border: `1px solid ${HAIR}`, borderRadius: 8, color: INK, cursor: 'pointer',
  fontSize: 12, fontWeight: 500,
};

export default function GraphicsInspector({
  block, canvasW, canvasH, palette, onChangeBlock, onArrange,
}: GraphicsInspectorProps) {
  const [tab, setTab] = useState<'properties' | 'arrange'>('properties');
  // Single shared unit for the Position & Size group (px ↔ %), like image resize.
  const [unit, setUnit] = useState<'px' | '%'>('px');

  const toPx = (pct: number, dim: number) => (pct / 100) * dim;
  const fromPx = (px: number, dim: number) => (px / dim) * 100;
  const disp = (pct: number, dim: number) => (unit === 'px' ? toPx(pct, dim) : pct);
  const store = (v: number, dim: number) => (unit === 'px' ? fromPx(v, dim) : v);

  const fill = block ? getFill(block) : null;

  return (
    <aside
      aria-label="Graphics properties"
      style={{
        // Floating glass island (Lisa 2026-06-25): inset from the right/top/bottom
        // edges, rounded, soft shadow — over the full-bleed canvas. (Graphics-only
        // component, so no mode guard needed.)
        position: 'absolute', right: 18, top: 86, bottom: 18, zIndex: 30,
        width: 268, overflowY: 'auto',
        background: 'var(--theme-chrome-bg)',
        backdropFilter: 'var(--chrome-blur, none)', WebkitBackdropFilter: 'var(--chrome-blur, none)',
        border: `1px solid ${HAIR}`, borderRadius: 16,
        boxShadow: '0 1px 2px rgba(0,0,0,.5), 0 26px 64px -14px rgba(0,0,0,.66)',
        color: INK,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", Inter, sans-serif',
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 10, borderBottom: `1px solid ${HAIR}` }}>
        {(['properties', 'arrange'] as const).map((t) => {
          const on = tab === t;
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{
                flex: 1, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                textTransform: 'capitalize',
                color: on ? '#ffffff' : SUB,
                background: on ? ACCENT_SOFT : 'transparent',
                border: on ? `1px solid ${ACCENT}` : '1px solid transparent',
              }}>{t}</button>
          );
        })}
      </div>

      {block === null ? (
        // ── Canvas state (nothing selected) ──
        <>
          <div style={{ padding: '14px 14px 4px', color: FAINT, fontSize: 11 }}>No selection — canvas settings</div>
          <Section label="Canvas" summary={`${canvasW}×${canvasH}`} defaultOpen>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <NumField label="W" value={canvasW} unit="px" onChange={() => { /* size is creation-time; resize is a later brick */ }} />
              <NumField label="H" value={canvasH} unit="px" onChange={() => { /* size is creation-time */ }} />
            </div>
          </Section>
          <Section label="Brand palette" defaultOpen>
            <Swatches palette={palette} onPick={() => { /* select an element to apply */ }} />
            <div style={{ color: FAINT, fontSize: 11, marginTop: 8 }}>Select an element to apply a color.</div>
          </Section>
        </>
      ) : (
        <>
          {/* element header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: ACCENT_SOFT, border: `1px solid ${ACCENT}`,
            }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: fill ?? ACCENT }} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{blockKindLabel(block)}</div>
              <div style={{ fontSize: 10.5, color: FAINT }}>Selected element</div>
            </div>
          </div>

          {tab === 'properties' ? (
            <>
              {fill !== null && (
                <Section label="Fill / Color" defaultOpen>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{
                      width: 32, height: 28, borderRadius: 7, border: `1px solid ${HAIR}`, overflow: 'hidden',
                      background: fill, cursor: 'pointer', flexShrink: 0, position: 'relative',
                    }}>
                      <input type="color" value={normalizeHex(fill)} onChange={(e) => onChangeBlock(setFill(block, e.target.value))}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </label>
                    <input
                      value={fill}
                      onChange={(e) => onChangeBlock(setFill(block, e.target.value))}
                      style={{
                        flex: 1, height: 28, background: FIELD_BG, border: `1px solid ${HAIR}`, borderRadius: 7,
                        color: INK, fontSize: 12, padding: '0 8px', outline: 'none', fontVariantNumeric: 'tabular-nums',
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Swatches palette={palette} onPick={(hex) => onChangeBlock(setFill(block, hex))} />
                  </div>
                </Section>
              )}

              <Section label="Position & size" defaultOpen>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <UnitToggle unit={unit} onChange={setUnit} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <NumField label="X" value={disp(block.x, canvasW)} unit={unit} onToggleUnit={() => setUnit((u) => u === 'px' ? '%' : 'px')}
                    onChange={(v) => onChangeBlock({ ...block, x: store(v, canvasW) })} />
                  <NumField label="Y" value={disp(block.y, canvasH)} unit={unit} onToggleUnit={() => setUnit((u) => u === 'px' ? '%' : 'px')}
                    onChange={(v) => onChangeBlock({ ...block, y: store(v, canvasH) })} />
                  <NumField label="W" value={disp(block.w, canvasW)} unit={unit} onToggleUnit={() => setUnit((u) => u === 'px' ? '%' : 'px')}
                    onChange={(v) => onChangeBlock({ ...block, w: store(v, canvasW) })} />
                  <NumField label="H" value={disp(block.h, canvasH)} unit={unit} onToggleUnit={() => setUnit((u) => u === 'px' ? '%' : 'px')}
                    onChange={(v) => onChangeBlock({ ...block, h: store(v, canvasH) })} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <NumField label="∠" value={block.rotation} unit="deg" step={1}
                    onChange={(v) => onChangeBlock({ ...block, rotation: v })} />
                </div>
              </Section>

              {block.type === 'shape' && (
                <Section label="Effects" summary={`Corner ${block.borderRadius ?? 0}`}>
                  <NumField label="◷" value={block.borderRadius ?? 0} unit="px" step={1}
                    onChange={(v) => onChangeBlock({ ...block, borderRadius: Math.max(0, v) })} />
                </Section>
              )}

              <Section label="Arrange">
                <ArrangeBody onArrange={onArrange} />
              </Section>
            </>
          ) : (
            <div style={{ padding: 14 }}>
              <ArrangeBody onArrange={onArrange} />
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function ArrangeBody({ onArrange }: { onArrange: (op: ArrangeOp) => void }) {
  return (
    <>
      <AlignGrid onArrange={onArrange} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" style={wideBtn} onClick={() => onArrange({ kind: 'forward' })}>
          <BringToFront size={14} /> Forward
        </button>
        <button type="button" style={wideBtn} onClick={() => onArrange({ kind: 'backward' })}>
          <SendToBack size={14} /> Backward
        </button>
      </div>
    </>
  );
}

function Swatches({ palette, onPick }: { palette: readonly string[]; onPick: (hex: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {palette.map((hex) => (
        <button key={hex} type="button" title={hex} onClick={() => onPick(hex)}
          style={{ width: 22, height: 22, borderRadius: 6, background: hex, border: `1px solid ${HAIR}`, cursor: 'pointer' }} />
      ))}
    </div>
  );
}

function UnitToggle({ unit, onChange }: { unit: 'px' | '%'; onChange: (u: 'px' | '%') => void }) {
  return (
    <span style={{ display: 'inline-flex', background: FIELD_BG, border: `1px solid ${HAIR}`, borderRadius: 7, overflow: 'hidden' }}>
      {(['px', '%'] as const).map((u) => (
        <button key={u} type="button" onClick={() => onChange(u)}
          style={{
            width: 30, height: 24, border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: unit === u ? ACCENT_SOFT_2 : 'transparent',
            color: unit === u ? '#ffffff' : SUB,
          }}>{u}</button>
      ))}
    </span>
  );
}

function normalizeHex(c: string): string {
  // <input type=color> needs #rrggbb. Pass through valid hex; fall back to a neutral.
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#888888';
}
