'use client';

import {
  Eraser,
  Aperture,
  Palette,
  Move,
  Scissors,
  Crop,
  Smile,
  Maximize2,
  Focus,
  Sparkles,
  CircleDashed,
  Frame,
  Circle as CircleIcon,
} from 'lucide-react';

// ── Edit panel content (left side, when "Edit" rail tab is active) ────────
//
// Five sections of thumb grids: Background, Object transform, Enhancements,
// Filters, Effects. Each thumb has a small visual preview + label. The
// previews use Lucide icons inside a tinted square; filter previews use
// gradient swatches because the visual IS the filter (akin to color-palette
// swatches — content, not chrome). Buttons are wired with onClick handlers
// that call a parent callback so the editor can apply the operation later.

interface EditPanelProps {
  // Apply an effect / operation. Wiring to actual image edits lands when the
  // image generation backend is hooked up; for now this just records the
  // intent so reviewers can verify the click path.
  onApply?: (operation: string) => void;
}

export default function EditPanel({ onApply }: EditPanelProps) {
  const apply = (op: string) => onApply?.(op);

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '14px 14px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#1a1f36',
          marginBottom: '14px',
        }}
      >
        Image editing
      </div>

      <Section title="Background">
        <ThumbGrid cols={3}>
          <Thumb
            label="Remove"
            preview={<CheckerboardPreview />}
            onClick={() => apply('background.remove')}
          />
          <Thumb
            label="Blur"
            preview={<TintPreview tint="rgba(107,63,160,0.18)" icon={<Aperture size={18} />} />}
            onClick={() => apply('background.blur')}
          />
          <Thumb
            label="Color"
            preview={<TintPreview tint="rgba(129,140,248,0.30)" icon={<Palette size={18} />} />}
            onClick={() => apply('background.color')}
          />
        </ThumbGrid>
      </Section>

      <Section title="Object transform">
        <ThumbGrid cols={3}>
          <Thumb
            label="Erase"
            preview={<TintPreview tint="rgba(107,63,160,0.10)" icon={<Eraser size={18} />} />}
            onClick={() => apply('object.erase')}
          />
          <Thumb
            label="Move"
            preview={<TintPreview tint="rgba(107,63,160,0.10)" icon={<Move size={18} />} />}
            onClick={() => apply('object.move')}
          />
          <Thumb
            label="Cutout"
            preview={<CheckerboardPreview />}
            onClick={() => apply('object.cutout')}
          />
          <Thumb
            label="Crop to object"
            preview={<TintPreview tint="rgba(107,63,160,0.10)" icon={<Crop size={18} />} />}
            onClick={() => apply('object.crop')}
          />
          <Thumb
            label="Sticker"
            preview={<TintPreview tint="rgba(107,63,160,0.10)" icon={<Smile size={18} />} />}
            onClick={() => apply('object.sticker')}
          />
        </ThumbGrid>
      </Section>

      <Section title="Enhancements">
        <ThumbGrid cols={3}>
          <Thumb
            label="Upscale"
            preview={<TintPreview tint="rgba(129,140,248,0.20)" icon={<Maximize2 size={18} />} />}
            onClick={() => apply('enhance.upscale')}
          />
          <Thumb
            label="Focus"
            preview={<TintPreview tint="rgba(129,140,248,0.20)" icon={<Focus size={18} />} />}
            onClick={() => apply('enhance.focus')}
          />
          <Thumb
            label="Color pop"
            preview={<TintPreview tint="rgba(129,140,248,0.20)" icon={<Sparkles size={18} />} />}
            onClick={() => apply('enhance.color-pop')}
          />
        </ThumbGrid>
      </Section>

      <Section title="Filters" trailing="Show all">
        <ThumbGrid cols={3}>
          <Thumb
            label="Punch"
            preview={
              <GradientPreview gradient="radial-gradient(circle at 60% 40%, #ff6090, #301040)" />
            }
            onClick={() => apply('filter.punch')}
          />
          <Thumb
            label="Golden"
            preview={
              <GradientPreview gradient="radial-gradient(circle at 40% 60%, #ffb84d, #c2410c)" />
            }
            onClick={() => apply('filter.golden')}
          />
          <Thumb
            label="Radiate"
            preview={
              <GradientPreview gradient="radial-gradient(circle at 50% 50%, #8b5cf6, #1e1b4b)" />
            }
            onClick={() => apply('filter.radiate')}
          />
        </ThumbGrid>
      </Section>

      <Section title="Effects">
        <ThumbGrid cols={3}>
          <Thumb
            label="Glass"
            preview={<TintPreview tint="rgba(129,140,248,0.18)" icon={<CircleDashed size={18} />} />}
            onClick={() => apply('effect.glass')}
          />
          <Thumb
            label="Border"
            preview={<TintPreview tint="rgba(107,63,160,0.10)" icon={<Frame size={18} />} />}
            onClick={() => apply('effect.border')}
          />
          <Thumb
            label="Sphere"
            preview={<TintPreview tint="rgba(107,63,160,0.10)" icon={<CircleIcon size={18} />} />}
            onClick={() => apply('effect.sphere')}
          />
        </ThumbGrid>
      </Section>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {title}
        </span>
        {trailing && (
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: '#6B3FA0',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            {trailing}
          </button>
        )}
      </div>
      {children}
      <div
        style={{
          height: '1px',
          background: 'rgba(0,0,0,0.06)',
          marginTop: '14px',
        }}
      />
    </div>
  );
}

function ThumbGrid({
  cols,
  children,
}: {
  cols: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '6px',
      }}
    >
      {children}
    </div>
  );
}

function Thumb({
  label,
  preview,
  onClick,
}: {
  label: string;
  preview: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
        background: 'none',
        border: '2px solid transparent',
        borderRadius: '8px',
        padding: '4px',
        fontFamily: 'inherit',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = 'rgba(248,250,252,1)')
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {preview}
      <span
        style={{
          fontSize: '0.65rem',
          color: '#475569',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function TintPreview({
  tint,
  icon,
}: {
  tint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: '8px',
        background: tint,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6B3FA0',
      }}
    >
      {icon}
    </div>
  );
}

function CheckerboardPreview() {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: '8px',
        background:
          'repeating-conic-gradient(rgba(0,0,0,0.10) 0% 25%, rgba(0,0,0,0.04) 0% 50%) 0 0/8px 8px',
        border: '1px solid rgba(0,0,0,0.04)',
      }}
    />
  );
}

function GradientPreview({ gradient }: { gradient: string }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: '8px',
        background: gradient,
        border: '1px solid rgba(0,0,0,0.04)',
      }}
    />
  );
}
