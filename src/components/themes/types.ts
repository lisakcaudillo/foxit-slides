/**
 * Theme — document presentation theme.
 *
 * Each theme defines typography, accents, page background, button pair,
 * and an optional decorative pattern. The shape is derived directly from
 * the twelve definitions in `themes.ts`.
 */
import type { ThemeArchetype } from '@/lib/card-engine/design-types';

export type ThemeCategory = 'legal' | 'creative' | 'business' | 'branded';
export type ThemeTone = 'light' | 'dark';
export type TitleStyle = 'solid' | 'gradient';

export interface Theme {
  id: string;
  name: string;
  category: ThemeCategory;
  tone: ThemeTone;
  /** Design Intelligence Layer (Phase 2) — drives the slide designer's recipe
   *  whitelist + image-role weighting per theme. See
   *  docs/requirements/design-intelligence-layer-spec.md §5. SEPARATE from the
   *  cover-tier dimension in lib/card-engine/cover-tiers.ts. */
  archetype: ThemeArchetype;
  titleFont: string;
  bodyFont: string;
  /** Solid color, gradient, or other CSS background value. */
  pageBg: string;
  /** Dedicated editor WORKSPACE backdrop (area behind the artboard) — theme-related
   *  but contrasting so the deck pops. Drives `--theme-workspace-base`. Falls back
   *  to the neutral grey when unset. */
  workspaceBg?: string;
  /** Optional decorative overlay (gradient, pattern). */
  pagePattern?: string;
  /** Optional background-size for tiled patterns. */
  pagePatternSize?: string;
  /** Solid hex when titleStyle="solid", or a CSS gradient when "gradient". */
  titleColor: string;
  titleStyle: TitleStyle;
  bodyColor: string;
  linkColor: string;
  primaryBg: string;
  primaryFg: string;
  secondaryBg: string;
  secondaryFg: string;
  secondaryBorder: string;
  btnRadius: number;
  /** Discrete categorical palette for charts. 5 distinct hues per theme,
   *  hand-picked to be theme-coherent AND mutually distinguishable when
   *  used as adjacent pie slices / bar series. Light themes get rich
   *  mid-tones; dark themes get brighter colors that read against the
   *  dark page background. Charts cycle through the palette by index. */
  chartPalette: string[];
}
