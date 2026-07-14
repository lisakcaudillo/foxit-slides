'use client';

import { useRef } from 'react';
import type { FrameShape } from '@/types/card-template';
import { getDeviceFrame } from '@/data/figmaAssets';

// ── Frame definitions ─────────────────────────────────────────────────────
// Frames. A frame has a SHAPE outline that
// the user's image clips to. Geometric shapes use CSS clip-path; device
// shapes (laptop, ...) render decorative SVG chrome with the image clipped
// to a content area inside.

// ── Geometric shapes ──────────────────────────────────────────────────────
// CSS clip-path strings. Applied to both the rendered <img> AND the empty-
// state placeholder background so the outline mirrors the shape exactly.
//
// Rectangle is null (no clip — original behavior). Rounded uses inset() with
// a round radius so it scales with the block's actual pixel size. Circle is
// `ellipse(50%)` which fits the block's box (so non-square blocks become
// ovals). Heart and hexagon use polygon paths derived to
// fit inside a 0-100% box (so the block can be any aspect and the shape
// stretches accordingly).
export const FRAME_CLIP_PATHS: Record<FrameShape, string | null> = {
  rectangle: null,
  rounded: 'inset(0 round 6%)',
  circle: 'ellipse(50% 50% at 50% 50%)',
  // Heart path — Bezier-derived polygon approximation, 30-point sampling
  // so the curve reads smoothly at typical block sizes.
  heart:
    'polygon(50% 12%, 61% 6%, 73% 3%, 85% 6%, 94% 14%, 99% 25%, 100% 36%, 96% 49%, 87% 63%, 75% 76%, 60% 89%, 50% 100%, 40% 89%, 25% 76%, 13% 63%, 4% 49%, 0% 36%, 1% 25%, 6% 14%, 15% 6%, 27% 3%, 39% 6%)',
  // Regular hexagon — pointy-top, fitting a 100×100 box.
  hexagon: 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)',
  // Laptop has its own render path — clip-path null because the chrome
  // SVG handles masking via <clipPath>.
  laptop: null,
  // Device mockups render their own chrome SVG (DeviceFrame) and mask the
  // image via <clipPath> to the screen rect — no CSS clip-path.
  device: null,
  // Cover composition diagonals — a full-card image clipped to a slash; the
  // title sits in the open triangle. Left = image fills the left triangle.
  'diagonal-left': 'polygon(0 0, 62% 0, 38% 100%, 0 100%)',
  'diagonal-right': 'polygon(100% 0, 100% 100%, 38% 100%, 62% 0)',
};

// Human-readable labels used in the Elements panel + tooltips.
export const FRAME_LABELS: Record<FrameShape, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded',
  circle: 'Circle',
  heart: 'Heart',
  hexagon: 'Hexagon',
  laptop: 'Laptop',
  device: 'Device',
  'diagonal-left': 'Diagonal (image left)',
  'diagonal-right': 'Diagonal (image right)',
};

// Default aspect for each frame when inserted from the Elements panel. The
// user can resize after — these are just sensible starting dimensions
// (in % of the card's width × height).
export const FRAME_DEFAULT_SIZE: Record<FrameShape, { w: number; h: number }> = {
  rectangle: { w: 36, h: 24 },
  rounded: { w: 36, h: 24 },
  circle: { w: 28, h: 28 },        // square so it's a true circle
  heart: { w: 26, h: 26 },         // square for a balanced heart
  hexagon: { w: 28, h: 28 },
  laptop: { w: 42, h: 26 },        // 16:9-ish, screen shows the image
  // Device fallback (portrait phone). The insert handler normally computes the
  // size from the chosen device's aspect via the manifest — this is the floor
  // when no deviceId is supplied.
  device: { w: 19, h: 70 },
  'diagonal-left': { w: 100, h: 100 },  // full-card; clip makes the slash
  'diagonal-right': { w: 100, h: 100 },
};

// ── Device frame: Laptop ──────────────────────────────────────────────────
// Authored SVG. Renders the laptop chrome (bezel, base, trackpad notch)
// plus the screen area as a clipped slot for the image. Use the same
// component for both the empty placeholder state and the filled state —
// pass `src` (or undefined) and `imageFit` to switch.
//
// Screen content rectangle (in viewBox units): x=10 y=4 w=80 h=48.
// Anything else is decorative chrome.
export function LaptopFrame({
  src,
  alt,
  fit = 'cover',
  // Empty-state placeholder slot — caller supplies the icon + label so
  // it can size to the actual rendered screen area via CSS.
  emptyContent,
}: {
  src?: string;
  alt?: string;
  fit?: 'cover' | 'contain';
  emptyContent?: React.ReactNode;
}) {
  // Unique clip-path ID per mount so multiple laptop frames on the same
  // card don't collide on the same DOM id.
  const idRef = useUniqueId('laptop-screen');
  return (
    <svg
      viewBox="0 0 100 70"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', userSelect: 'none' }}
      aria-label={src ? alt ?? 'Laptop frame' : 'Empty laptop frame'}
    >
      <defs>
        <clipPath id={idRef}>
          <rect x="10" y="4" width="80" height="48" rx="1" />
        </clipPath>
        <linearGradient id={`${idRef}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Screen bezel — slate-900 frame around the screen */}
      <rect x="8" y="2" width="84" height="52" rx="2" fill="#0f172a" />

      {/* Screen content area — either image or empty placeholder */}
      <g clipPath={`url(#${idRef})`}>
        {src ? (
          <image
            href={src}
            x="10"
            y="4"
            width="80"
            height="48"
            preserveAspectRatio={fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
          />
        ) : (
          <>
            <rect x="10" y="4" width="80" height="48" fill="rgba(107,63,160,0.04)" />
            <rect
              x="10"
              y="4"
              width="80"
              height="48"
              fill="none"
              stroke="rgba(107,63,160,0.30)"
              strokeWidth="0.5"
              strokeDasharray="2 1.5"
            />
            {/* Centered icon — small inline lucide-style image glyph */}
            <g transform="translate(50 28)" stroke="rgba(107,63,160,0.55)" fill="none" strokeWidth="0.7">
              <rect x="-6" y="-4.5" width="12" height="9" rx="0.8" />
              <circle cx="-2.5" cy="-1.5" r="1" />
              <path d="M 6 4.5 L 0.5 -1 L -3 2 L -6 0.5" />
            </g>
          </>
        )}
      </g>

      {/* Hinge line under bezel — subtle highlight */}
      <line x1="8" y1="54" x2="92" y2="54" stroke="#1e293b" strokeWidth="0.4" />

      {/* Keyboard base — trapezoid */}
      <path
        d="M 3 54 L 97 54 L 92 66 L 8 66 Z"
        fill={`url(#${idRef}-base)`}
        stroke="#64748b"
        strokeWidth="0.3"
      />

      {/* Trackpad indent */}
      <rect x="44" y="60" width="12" height="2" rx="1" fill="#94a3b8" opacity="0.7" />

      {/* `emptyContent` slot — not used by SVG (we draw the placeholder
          icon natively above) but kept for API symmetry with the
          GeometricFrame helper. */}
      {void emptyContent}
    </svg>
  );
}

// ── Device mockup frame (manifest-driven) ─────────────────────────────────
// Generalizes LaptopFrame to any device in the figma-assets manifest. Renders
// the body chrome (rounded rect) + notch from the manifest geometry, and clips
// the dropped image to the inner SCREEN rect so it SNAPS into the screen — not
// the whole frame box. Used for both empty (placeholder inside the screen) and
// filled states. The chosen device is named by `deviceId` (e.g. iphone-black).
export function DeviceFrame({
  deviceId,
  src,
  alt,
  fit = 'cover',
}: {
  deviceId?: string;
  src?: string;
  alt?: string;
  fit?: 'cover' | 'contain';
}) {
  const clipId = useUniqueId('device-screen');
  const frame = getDeviceFrame(deviceId);
  if (!frame) {
    // Unknown / missing device — fail soft with an empty box rather than crash.
    return (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(107,63,160,0.04)',
          border: '1.5px dashed rgba(107,63,160,0.30)',
          color: 'rgba(107,63,160,0.65)', fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12, borderRadius: 8, userSelect: 'none',
        }}
      >
        Unknown device
      </div>
    );
  }

  const { outer, body, bodyStroke, bodyRect, screenRect, notch, extras } = frame;
  const pctX = (p: number) => (p / 100) * outer.w;
  const pctY = (p: number) => (p / 100) * outer.h;
  // Screen rect: % of outer box → viewBox (px) units.
  const sx = pctX(screenRect.x);
  const sy = pctY(screenRect.y);
  const sw = pctX(screenRect.w);
  const sh = pctY(screenRect.h);
  // Body box — the full outer box unless a sub-rect (laptop lid) is given.
  const bx = bodyRect ? pctX(bodyRect.x) : 0;
  const by = bodyRect ? pctY(bodyRect.y) : 0;
  const bw = bodyRect ? pctX(bodyRect.w) : outer.w;
  const bh = bodyRect ? pctY(bodyRect.h) : outer.h;
  const br = bodyRect ? bodyRect.radius : outer.radius;
  // Placeholder glyph scale, relative to the screen.
  const glyph = Math.min(sw, sh) * 0.18;

  return (
    <svg
      viewBox={`0 0 ${outer.w} ${outer.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', userSelect: 'none' }}
      aria-label={src ? alt ?? `${frame.label} frame` : `Empty ${frame.label} frame`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={sx} y={sy} width={sw} height={sh} rx={screenRect.radius} />
        </clipPath>
      </defs>

      {/* Decorative extras behind the body (e.g. laptop base bars) */}
      {extras?.map((ex, i) => (
        <rect
          key={i}
          x={pctX(ex.x)}
          y={pctY(ex.y)}
          width={pctX(ex.w)}
          height={pctY(ex.h)}
          rx={ex.radius ?? 0}
          fill={ex.fill}
        />
      ))}

      {/* Body chrome (lid for laptops) */}
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        rx={br}
        fill={body}
        stroke={bodyStroke}
        strokeWidth={bodyStroke ? 1 : undefined}
      />

      {/* Screen content — image clipped to the screen rect, or placeholder */}
      <g clipPath={`url(#${clipId})`}>
        {src ? (
          <image
            href={src}
            x={sx}
            y={sy}
            width={sw}
            height={sh}
            preserveAspectRatio={fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}
          />
        ) : (
          <>
            <rect x={sx} y={sy} width={sw} height={sh} fill="#e9eaee" />
            {/* Centered image-placeholder glyph */}
            <g
              transform={`translate(${sx + sw / 2} ${sy + sh / 2}) scale(${glyph / 12})`}
              stroke="rgba(107,63,160,0.55)"
              fill="none"
              strokeWidth={0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x={-6} y={-4.5} width={12} height={9} rx={0.8} />
              <circle cx={-2.5} cy={-1.5} r={1} />
              <path d="M 6 4.5 L 0.5 -1 L -3 2 L -6 0.5" />
            </g>
          </>
        )}
      </g>

      {/* Notch / camera cutout, painted on top of the screen */}
      {notch && (
        notch.kind === 'circle' ? (
          <circle
            cx={(notch.x / 100) * outer.w + ((notch.w / 100) * outer.w) / 2}
            cy={(notch.y / 100) * outer.h + ((notch.h / 100) * outer.h) / 2}
            r={Math.min((notch.w / 100) * outer.w, (notch.h / 100) * outer.h) / 2}
            fill={notch.fill}
          />
        ) : (
          <rect
            x={(notch.x / 100) * outer.w}
            y={(notch.y / 100) * outer.h}
            width={(notch.w / 100) * outer.w}
            height={(notch.h / 100) * outer.h}
            rx={((notch.h / 100) * outer.h) / 2}
            fill={notch.fill}
          />
        )
      )}
    </svg>
  );
}

// ── Helper: stable unique id for SVG defs ────────────────────────────────
// Multiple laptop frames on the same card need distinct <clipPath> ids so
// they don't accidentally share one. Module-scoped counter + per-instance
// useRef keeps each mounted frame stable across re-renders but unique
// across instances.
let idCounter = 0;

function useUniqueId(prefix: string): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    idCounter += 1;
    ref.current = `${prefix}-${idCounter}`;
  }
  return ref.current;
}
