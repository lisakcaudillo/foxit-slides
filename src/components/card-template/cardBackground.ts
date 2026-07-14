import type { Card, TemplateTheme } from '@/types/card-template';

/** True for a `#rgb`/`#rrggbb` hex color string. */
export const isHex = (s?: string): boolean =>
  !!s && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());

/**
 * Resolve a card's on-canvas background — the single source of truth used by
 * the live editor (`SlideStage`), the print/PDF deck (`SlideDeckPrint`), AND
 * the slide-rail thumbnails (`CardEditor`). Keeping all three on this one
 * function is what guarantees the preview can't drift from the canvas (e.g.
 * Volt's dark `cardBg` vs. its lighter editor page bg — the thumbnail used to
 * read `--theme-page-bg` and render white while the slide was navy).
 *
 * Precedence: explicit per-card background (image → gradient → color) wins,
 * then per-card dark/chapter styles, else the theme's slide background
 * (`theme.cardBg`). NOT `--theme-page-bg`, which is the editor workspace bg.
 */
export function cardBackground(card: Card, theme: TemplateTheme): string {
  if (card.background?.image) {
    const base = card.background?.color ?? '#131D2E';
    return `${base} url('${card.background.image}') center / cover no-repeat`;
  }
  if (card.background?.gradient) return card.background.gradient;
  if (card.background?.color) return card.background.color;
  if (card.style === 'dark') return 'linear-gradient(135deg, #1a1a3e, #2d1b4e)';
  if (card.style === 'chapter') return 'linear-gradient(135deg, #e8eaf6, #d6daf0, #cfd6fc)';
  return isHex(theme.cardBg) ? theme.cardBg : (theme.cardBg || '#ffffff');
}
