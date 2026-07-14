/**
 * brandKitStorage — localStorage CRUD for the user's brand kit.
 *
 * Phase 5 of the Compose workspace restructure introduces brand kits.
 * This module is the single source of truth for kit metadata (colors,
 * fonts, voice settings) and references to uploaded assets (logos,
 * icons, kit-specific templates).
 *
 * Single-kit MVP. Multi-kit / kit-switcher is deferred.
 *
 * IMPORTANT: actual logo and icon FILES are stubbed for MVP. Per the
 * project memory rule "DMS for AI uploads — never design uploads to
 * localStorage", real file storage routes through DMS once it's wired.
 * Today this module records logo / icon entries with display name +
 * placeholder URL only; the upload UX surfaces a "coming soon" hint.
 */

const STORAGE_KEY = 'compose:brand-kit';

export interface BrandColor {
  hex: string;
  name: string;
  /** Optional role label, e.g. "Primary", "Accent", "Surface". */
  role?: string;
}

export interface BrandFont {
  /** Family name as registered with Google Fonts (or system family). */
  family: string;
  /** Friendly label, e.g. "Headings". */
  label?: string;
  /** Numeric weights bundled with this family (e.g. [400, 600, 700]). */
  weights?: number[];
}

export interface BrandLogo {
  id: string;
  /** Display name (e.g. "Primary Logo"). */
  name: string;
  /** Stub URL — DMS-backed in production. */
  url?: string;
  uploadedAt: string;
}

export interface BrandIcon {
  id: string;
  name: string;
  /** Stub URL — DMS-backed in production. */
  url?: string;
  uploadedAt: string;
}

export interface BrandVoiceTrait {
  id: string;
  /** e.g. "Direct & honest". */
  label: string;
  /** Whether this trait is currently active. */
  active: boolean;
}

export interface BrandGuideline {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface BrandKit {
  kitId: string;
  kitName: string;
  colors: BrandColor[];
  fonts: BrandFont[];
  logos: BrandLogo[];
  icons: BrandIcon[];
  voice: BrandVoiceTrait[];
  guidelines: BrandGuideline[];
  /** ISO timestamp of last modification. */
  updatedAt: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
// Seed values that match the brand-kit-compose.html prototype palette so a
// fresh user starts with a kit matching the design Lisa approved. Each
// item is editable.

function defaultKit(): BrandKit {
  const now = new Date().toISOString();
  return {
    kitId: 'default',
    kitName: 'Branding',
    colors: [
      { hex: '#FF5F00', name: 'Foxit Orange', role: 'Brand' },
      { hex: '#6B3FA0', name: 'Foxit Purple', role: 'Brand' },
      { hex: '#401842', name: 'Foxit Purple Deep', role: 'Brand' },
      { hex: '#E267E4', name: 'Kit Magenta', role: 'Bold gradient' },
      { hex: '#9FC7FE', name: 'Kit Light Blue', role: 'Bold gradient' },
      { hex: '#4198FF', name: 'Kit Mid Blue', role: 'Bold gradient' },
      { hex: '#0f172a', name: 'Slate 900', role: 'Body text' },
      { hex: '#ffffff', name: 'White', role: 'Surface' },
    ],
    fonts: [
      { family: 'Inter', label: 'Body & headings', weights: [300, 400, 500, 600, 700] },
    ],
    logos: [],
    icons: [],
    voice: [
      { id: 'direct', label: 'Direct & honest', active: true },
      { id: 'warm', label: 'Warm & approachable', active: false },
      { id: 'calm', label: 'Calm & confident', active: false },
    ],
    guidelines: [],
    updatedAt: now,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getBrandKit(): BrandKit {
  if (typeof window === 'undefined') return defaultKit();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaultKit();
  try {
    return JSON.parse(stored) as BrandKit;
  } catch {
    return defaultKit();
  }
}

export function saveBrandKit(kit: BrandKit): BrandKit {
  if (typeof window === 'undefined') return kit;
  const next: BrandKit = { ...kit, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetBrandKit(): BrandKit {
  if (typeof window === 'undefined') return defaultKit();
  const next = defaultKit();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

// ─── Convenience updaters ─────────────────────────────────────────────────────

export function updateColors(colors: BrandColor[]): BrandKit {
  return saveBrandKit({ ...getBrandKit(), colors });
}

export function updateFonts(fonts: BrandFont[]): BrandKit {
  return saveBrandKit({ ...getBrandKit(), fonts });
}

export function updateVoice(voice: BrandVoiceTrait[]): BrandKit {
  return saveBrandKit({ ...getBrandKit(), voice });
}

export function renameKit(name: string): BrandKit {
  return saveBrandKit({ ...getBrandKit(), kitName: name });
}
