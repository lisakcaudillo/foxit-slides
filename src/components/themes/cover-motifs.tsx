'use client';

/**
 * Cover motifs — the vetted title-decor pool Lisa approved in
 * app/public/design-table/title-decor/manager.html ("The Curated Title-Decor
 * Pool", 10 motifs). Ported faithfully (not CSS approximations):
 *   ORGANIC (1600×900, tint + tint2): ribbons · contours · aurora · bokeh ·
 *     grain · fluid
 *   EDITORIAL (320×180, ink + accent): halftone · arc · frame · hexagon
 *
 * Each motif re-tints from the theme (tint=accent, tint2=secondary, ink=title
 * ink, accent=link) at 6–18% opacity and sits behind the title. SVG IDs are
 * namespaced per instance (uid) so multiple motifs on one gallery page never
 * collide.
 */

export type MotifName =
  | 'ribbons' | 'contours' | 'aurora' | 'bokeh' | 'grain' | 'fluid'
  | 'halftone' | 'arc' | 'frame' | 'hexagon';

const ORGANIC = new Set<MotifName>(['ribbons', 'contours', 'aurora', 'bokeh', 'grain', 'fluid']);

function motifInner(name: MotifName, uid: string, t: string, t2: string, ink: string, accent: string): string {
  switch (name) {
    case 'ribbons':
      return `<defs><linearGradient id="rib-${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${t}" stop-opacity="0"/>
          <stop offset="55%" stop-color="${t}" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="${t}" stop-opacity="0"/>
        </linearGradient></defs>
        <g opacity="0.5" fill="none" stroke="url(#rib-${uid})">
          ${[0, 1, 2, 3, 4, 5, 6].map((i) => { const y = 120 + i * 120; return `<path d="M -40 ${y} C 400 ${y - 90}, 1100 ${y + 110}, 1640 ${y - 40}" stroke-width="${1.4 - i * 0.08}"/>`; }).join('')}
        </g>
        <g opacity="0.14" fill="${t}">
          <path d="M 900 0 C 1100 200, 1300 260, 1640 180 L 1640 0 Z"/>
          <path d="M 1640 900 C 1300 760, 1100 880, 980 900 Z"/>
        </g>`;
    case 'contours': {
      const rings: string[] = [];
      for (let i = 0; i < 9; i++) { const r = 110 + i * 78; rings.push(`<circle cx="1520" cy="640" r="${r}" fill="none" stroke="${t}" stroke-width="${i % 2 ? 0.7 : 1.1}" stroke-opacity="${0.42 - i * 0.03}"/>`); }
      return `<g>${rings.join('')}<circle cx="1520" cy="640" r="46" fill="${t}" opacity="0.12"/></g>`;
    }
    case 'aurora':
      return `<defs>
          <radialGradient id="au1-${uid}" cx="0.5" cy="0.5" r="0.5"><stop offset="0%" stop-color="${t}" stop-opacity="0.50"/><stop offset="100%" stop-color="${t}" stop-opacity="0"/></radialGradient>
          <radialGradient id="au2-${uid}" cx="0.5" cy="0.5" r="0.5"><stop offset="0%" stop-color="${t2}" stop-opacity="0.42"/><stop offset="100%" stop-color="${t2}" stop-opacity="0"/></radialGradient>
          <filter id="aub-${uid}"><feGaussianBlur stdDeviation="34"/></filter>
        </defs>
        <g filter="url(#aub-${uid})" opacity="0.85">
          <ellipse cx="1280" cy="220" rx="520" ry="300" fill="url(#au1-${uid})"/>
          <ellipse cx="1480" cy="760" rx="420" ry="280" fill="url(#au2-${uid})"/>
          <ellipse cx="320" cy="780" rx="380" ry="240" fill="url(#au1-${uid})" opacity="0.6"/>
        </g>`;
    case 'bokeh': {
      const orbs: Array<[number, number, number, number, string]> = [
        [1300, 180, 90, 0.10, t], [1480, 360, 52, 0.14, t2], [1180, 520, 34, 0.12, t],
        [1540, 640, 120, 0.07, t], [1010, 250, 22, 0.16, t2], [1350, 720, 46, 0.10, t],
        [1230, 90, 28, 0.13, t2], [1560, 200, 40, 0.09, t], [1100, 780, 60, 0.08, t2],
        [880, 640, 24, 0.12, t], [1430, 520, 18, 0.18, t2], [1000, 560, 14, 0.16, t],
      ];
      return `<defs><filter id="bok-${uid}"><feGaussianBlur stdDeviation="3"/></filter></defs>
        <g filter="url(#bok-${uid})">${orbs.map(([x, y, r, o, c], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o}"/>${i % 3 === 0 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-opacity="${o + 0.06}" stroke-width="1"/>` : ''}`).join('')}</g>`;
    }
    case 'grain':
      return `<defs>
          <filter id="grf-${uid}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0"/></filter>
          <radialGradient id="grv-${uid}" cx="0.5" cy="0.42" r="0.75"><stop offset="55%" stop-color="${t}" stop-opacity="0"/><stop offset="100%" stop-color="${t}" stop-opacity="0.14"/></radialGradient>
        </defs>
        <rect x="0" y="0" width="1600" height="900" fill="url(#grv-${uid})"/>
        <rect x="0" y="0" width="1600" height="900" filter="url(#grf-${uid})" opacity="0.10"/>
        <g opacity="0.3" stroke="${t}" stroke-width="1"><line x1="120" y1="120" x2="120" y2="180"/><line x1="120" y1="120" x2="180" y2="120"/><line x1="1480" y1="780" x2="1480" y2="720"/><line x1="1480" y1="780" x2="1420" y2="780"/></g>`;
    case 'fluid':
      return `<defs>
          <linearGradient id="flg-${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${t}" stop-opacity="0.16"/><stop offset="100%" stop-color="${t2}" stop-opacity="0.06"/></linearGradient>
          <filter id="fls-${uid}"><feGaussianBlur stdDeviation="6"/></filter>
        </defs>
        <g filter="url(#fls-${uid})"><path d="M 1180 -60 C 1460 60, 1560 300, 1440 480 C 1340 640, 1520 760, 1660 700 L 1700 -100 Z" fill="url(#flg-${uid})"/></g>
        <path d="M 1180 40 C 1380 140, 1460 340, 1380 500 C 1320 620, 1440 740, 1560 740" fill="none" stroke="${t}" stroke-opacity="0.22" stroke-width="1.2"/>
        <path d="M 1260 0 C 1440 120, 1500 320, 1420 470" fill="none" stroke="${t2}" stroke-opacity="0.18" stroke-width="0.9"/>`;
    case 'halftone': {
      let dots = '';
      const cols = 14, rows = 9, x0 = 150, y0 = 4, gap = 12;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = x0 + c * gap, cy = y0 + r * gap;
        const dx = (cx - 318) / 170, dy = (cy - 4) / 130;
        const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const rad = (1 - dist) * 1.9;
        if (rad < 0.25) continue;
        dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(2)}" fill="${ink}" fill-opacity="${((1 - dist) * 0.4).toFixed(3)}"/>`;
      }
      return `<g>${dots}</g><circle cx="300" cy="20" r="2.4" fill="${accent}" fill-opacity="0.55"/>`;
    }
    case 'arc':
      return `<path d="M -10 26 C 110 6, 230 18, 350 96" fill="none" stroke="${ink}" stroke-opacity="0.30" stroke-width="0.7"/>
        <path d="M -10 38 C 120 22, 240 34, 350 112" fill="none" stroke="${ink}" stroke-opacity="0.12" stroke-width="0.5"/>
        <circle cx="266" cy="48.5" r="2.6" fill="${accent}" fill-opacity="0.85"/>
        <circle cx="266" cy="48.5" r="6" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="0.6"/>`;
    case 'frame':
      return `<rect x="12" y="12" width="296" height="156" fill="none" stroke="${ink}" stroke-opacity="0.22" stroke-width="0.6"/>
        <g stroke="${accent}" stroke-opacity="0.7" stroke-width="1">
          <path d="M 12 24 L 12 12 L 24 12" fill="none"/><path d="M 296 12 L 308 12 L 308 24" fill="none"/>
          <path d="M 308 156 L 308 168 L 296 168" fill="none"/><path d="M 24 168 L 12 168 L 12 156" fill="none"/>
        </g>
        <line x1="28.8" y1="62" x2="74" y2="62" stroke="${accent}" stroke-opacity="0.85" stroke-width="1"/>`;
    case 'hexagon':
    default:
      return `<g transform="translate(262, 90)">
          <polygon points="0,-58 50,-29 50,29 0,58 -50,29 -50,-29" fill="none" stroke="${ink}" stroke-opacity="0.26" stroke-width="0.7"/>
          <polygon points="0,-40 35,-20 35,20 0,40 -35,20 -35,-20" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="0.6"/>
          <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="${accent}" fill-opacity="0.07"/>
          <line x1="0" y1="-58" x2="0" y2="58" stroke="${ink}" stroke-opacity="0.12" stroke-width="0.4"/>
          <line x1="-50" y1="-29" x2="50" y2="29" stroke="${ink}" stroke-opacity="0.12" stroke-width="0.4"/>
        </g>`;
  }
}

/** Renders one vetted motif behind the title, tinted to the theme. */
export function Motif({ name, uid, tint, tint2, ink, accent }: {
  name: MotifName; uid: string; tint: string; tint2: string; ink: string; accent: string;
}) {
  const organic = ORGANIC.has(name);
  return (
    <svg
      viewBox={organic ? '0 0 1600 900' : '0 0 320 180'}
      preserveAspectRatio={organic ? 'xMidYMid slice' : 'none'}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      dangerouslySetInnerHTML={{ __html: motifInner(name, uid, tint, tint2, ink, accent) }}
    />
  );
}
