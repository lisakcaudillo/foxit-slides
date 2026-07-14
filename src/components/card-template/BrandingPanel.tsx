'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown, Upload, Check, ExternalLink, Palette, Trash2 } from 'lucide-react';
import type { TemplateTheme } from '@/types/card-template';
import { getBrandKit, saveBrandKit, type BrandKit, type BrandLogo } from '@/lib/brandKitStorage';
import { PanelSection } from './panelChrome';

// ── Props ────────────────────────────────────────────────────────────────────

interface BrandingPanelProps {
  currentTheme: TemplateTheme;
  onThemeChange: (theme: TemplateTheme) => void;
}

// ── Data ─────────────────────────────────────────────────────────────────────

const BASE = { cardBgOpacity: 0.75, cardRadius: 16, cardPadding: 48 } as const;

const THEME_PRESETS: { id: string; label: string; theme: TemplateTheme }[] = [
  { id: 'clean', label: 'Clean', theme: { ...BASE, pageBg: '#F0F0F8', cardBg: '#ffffff', accentColors: ['#2D4DF2', '#018CE1'], headingFont: 'Plus Jakarta Sans', bodyFont: 'Inter', headingColor: '#00002E', bodyColor: '#4D4D51' } },
  { id: 'midnight', label: 'Midnight', theme: { ...BASE, pageBg: '#0f0f23', cardBg: '#1a1a3e', accentColors: ['#818cf8', '#6366f1'], headingFont: 'Space Grotesk', bodyFont: 'Inter', headingColor: '#ffffff', bodyColor: '#a0a0c0' } },
  { id: 'warm', label: 'Warm', theme: { ...BASE, pageBg: '#FFF8F0', cardBg: '#ffffff', accentColors: ['#d97706', '#ea580c'], headingFont: 'Playfair Display', bodyFont: 'DM Sans', headingColor: '#3d2007', bodyColor: '#7a5a3a' } },
  { id: 'brand', label: 'Brand', theme: { ...BASE, pageBg: '#f3eef8', cardBg: '#ffffff', accentColors: ['#6B3FA0', '#FF5F00'], headingFont: 'Sora', bodyFont: 'Inter', headingColor: '#401842', bodyColor: '#5a3d5c' } },
  { id: 'minimal', label: 'Minimal', theme: { ...BASE, pageBg: '#ffffff', cardBg: '#ffffff', accentColors: ['#111111', '#444444'], headingFont: 'DM Sans', bodyFont: 'DM Sans', headingColor: '#111111', bodyColor: '#666666' } },
];

const COLOR_PRESETS = ['#0f172a','#475569','#ffffff','#6B3FA0','#401842','#6366f1','#3b82f6','#14b8a6','#16a34a','#f59e0b','#FF5F00','#f43f5e'];
const FONT_OPTIONS = ['Inter','Plus Jakarta Sans','Space Grotesk','Fraunces','Playfair Display','Sora','DM Sans'];
const TONE_OPTIONS = ['Professional','Casual','Formal','Friendly','Technical'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isLight(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return true;
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 186;
}

function themesMatch(a: TemplateTheme, b: TemplateTheme): boolean {
  return a.pageBg === b.pageBg && a.cardBg === b.cardBg && a.headingFont === b.headingFont && a.headingColor === b.headingColor;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) handler(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, handler]);
}

// ── Color Picker Popover ─────────────────────────────────────────────────────

function ColorPicker({ color, onChange, onClose }: { color: string; onChange: (c: string) => void; onClose: () => void }) {
  const [hex, setHex] = useState(color);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  const apply = useCallback(() => { if (/^#[0-9A-Fa-f]{6}$/.test(hex)) onChange(hex); }, [hex, onChange]);

  return (
    <div ref={ref} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px', padding: '12px', borderRadius: '12px', background: 'white', border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '224px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '10px' }}>
        {COLOR_PRESETS.map((c) => (
          <button key={c} type="button" onClick={() => { onChange(c); onClose(); }} aria-label={`Select ${c}`}
            style={{ width: '28px', height: '28px', borderRadius: '50%', border: color === c ? '2px solid #6B3FA0' : `1px solid ${isLight(c) ? 'rgba(15,23,42,0.15)' : 'transparent'}`, background: c, cursor: 'pointer', padding: 0, minWidth: '44px', minHeight: '44px', boxSizing: 'content-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {color === c && <Check size={12} style={{ color: isLight(c) ? '#0f172a' : '#fff' }} />}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="text" value={hex} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHex(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { apply(); onClose(); } }}
          placeholder="#000000" style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(15,23,42,0.1)', fontSize: '14px', fontFamily: 'monospace', outline: 'none', minHeight: '44px' }} />
        <button type="button" onClick={() => { apply(); onClose(); }} aria-label="Apply color"
          style={{ width: '44px', height: '44px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={16} style={{ color: isLight(hex) ? '#0f172a' : '#fff' }} />
        </button>
      </div>
    </div>
  );
}

// ── Color Row ────────────────────────────────────────────────────────────────

function ColorRow({ label, color, onChange }: { label: string; color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Themes can ship the background as a CSS gradient (radial-/linear-gradient(...)).
  // When the value isn't a flat hex, dumping the whole CSS string as the row
  // text is illegible — show "Gradient" instead, and bump the swatch so the
  // visual carries the information. The swatch already renders the gradient
  // because `background: color` accepts any CSS background value.
  const isFlatHex = /^#[0-9a-f]{6,8}$/i.test(color);
  const swatchSize = isFlatHex ? '24px' : '32px';
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-label={`Change ${label} color`}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(15,23,42,0.06)', background: 'rgba(255,255,255,0.7)', cursor: 'pointer', minHeight: '44px' }}>
        <div style={{ width: swatchSize, height: swatchSize, borderRadius: '6px', background: color, border: isFlatHex && isLight(color) ? '1px solid rgba(15,23,42,0.15)' : 'none', flexShrink: 0 }} />
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#334155', flex: 1, textAlign: 'left' }}>{label}</span>
        {isFlatHex ? (
          <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{color}</span>
        ) : (
          <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Gradient</span>
        )}
      </button>
      {open && <ColorPicker color={isFlatHex ? color : '#6B3FA0'} onChange={onChange} onClose={close} />}
    </div>
  );
}

// ── Dropdown (shared for Font + Tone) ────────────────────────────────────────

function Dropdown({ label, value, options, onChange, fontPreview }: { label: string; value: string; options: string[]; onChange: (v: string) => void; fontPreview?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <div style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>{label}</div>}
      <button type="button" onClick={() => setOpen(!open)} aria-label={`Select ${label}`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(15,23,42,0.08)', background: 'rgba(255,255,255,0.7)', cursor: 'pointer', minHeight: '44px', fontSize: '14px', fontFamily: fontPreview ? `${value}, system-ui, sans-serif` : undefined, fontWeight: 500, color: '#0f172a' }}>
        {value}
        <ChevronDown size={14} style={{ color: '#94a3b8' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px', borderRadius: '10px', background: 'white', border: '1px solid rgba(15,23,42,0.08)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          {options.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              style={{ width: '100%', padding: '10px 12px', border: 'none', background: o === value ? 'rgba(107,63,160,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left', minHeight: '44px', fontFamily: fontPreview ? `${o}, system-ui, sans-serif` : undefined, fontSize: '14px', fontWeight: o === value ? 600 : 400, color: o === value ? '#6B3FA0' : '#0f172a', transition: 'background 100ms ease' }}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Accent Circle ────────────────────────────────────────────────────────────

function AccentCircle({ color, index, onChangeAccent }: { color: string; index: number; onChangeAccent: (i: number, c: string) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(!open)} aria-label={`Edit accent color ${index + 1}`}
        style={{ width: '32px', height: '32px', borderRadius: '50%', background: color, border: 'none', cursor: 'pointer', padding: 0, minWidth: '44px', minHeight: '44px', boxSizing: 'content-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
      {open && <ColorPicker color={color} onChange={(c) => onChangeAccent(index, c)} onClose={close} />}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function BrandingPanel({ currentTheme, onThemeChange }: BrandingPanelProps) {
  const [tone, setTone] = useState('Professional');
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load the user's global brand kit so we can show the compact mirror
  // at the top of the panel. The mirror is read-only here — full
  // editing lives at /compose/brand-kit.
  useEffect(() => {
    setBrandKit(getBrandKit());
  }, []);

  const updateTheme = useCallback((partial: Partial<TemplateTheme>) => {
    onThemeChange({ ...currentTheme, ...partial });
  }, [currentTheme, onThemeChange]);

  // Read a File as a data URL. Used by the Logo upload below — stays in
  // localStorage via brandKitStorage until a real DMS upload route lands.
  // The brandKitStorage header comment notes this is the stub path for MVP
  // ("DMS-backed in production"); data URLs keep the visual preview working
  // without the editor reaching outside the browser.
  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });

  const handleLogoFile = useCallback(async (file: File) => {
    setLogoError(null);
    if (!file.type.startsWith('image/')) {
      setLogoError('That file is not an image. Pick a PNG, JPG, or SVG.');
      return;
    }
    // localStorage is roughly 5 MB total. A 2 MB cap on the logo data URL
    // leaves room for the rest of the kit + decks. Larger files mean the
    // user really needs the future DMS path.
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Logo is over 2 MB. Compress it or use a smaller file for now.');
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      const next: BrandLogo = {
        id: `logo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[a-z0-9]+$/i, '') || 'Logo',
        url: dataUrl,
        uploadedAt: new Date().toISOString(),
      };
      const current = brandKit ?? getBrandKit();
      // Single-logo MVP — replace the existing logo rather than appending,
      // matches the "Upload your logo" affordance (singular). Multi-logo
      // management lives on the dedicated /compose/brand-kit page.
      const saved = saveBrandKit({ ...current, logos: [next] });
      setBrandKit(saved);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not read the file.');
    }
  }, [brandKit]);

  const handleLogoRemove = useCallback(() => {
    const current = brandKit ?? getBrandKit();
    const saved = saveBrandKit({ ...current, logos: [] });
    setBrandKit(saved);
    setLogoError(null);
  }, [brandKit]);

  const activeLogo = brandKit?.logos?.[0];


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 0. Brand Kit (compact mirror) — Phase 6 of the Compose workspace
          restructure. Surfaces the active global brand kit at a glance and
          links out to /compose/brand-kit for full editing. Stays read-only
          inside the editor; per-deck theme controls (below) are unchanged. */}
      {brandKit && (
        <PanelSection title="Brand Kit">
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(15,23,42,0.06)',
              background:
                'linear-gradient(135deg, rgba(240,168,242,0.08) 0%, rgba(200,182,244,0.10) 50%, rgba(156,196,254,0.10) 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Kit name + manage link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background:
                    'linear-gradient(135deg, #F0A8F2 0%, #C8B6F4 50%, #9CC4FE 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Palette size={14} style={{ color: '#3B2856' }} strokeWidth={2.2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0f172a',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {brandKit.kitName}
                </div>
              </div>
              <Link
                href="/studio/brand-kit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#6B3FA0',
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
                aria-label="Manage Brand Kit"
              >
                Manage
                <ExternalLink size={11} />
              </Link>
            </div>

            {/* Compact swatch row — first 6 colors */}
            {brandKit.colors.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {brandKit.colors.slice(0, 6).map((c, i) => (
                  <div
                    key={i}
                    title={`${c.name} ${c.hex}`}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: c.hex,
                      border:
                        c.hex === '#ffffff'
                          ? '1px solid rgba(15,23,42,0.10)'
                          : 'none',
                      flexShrink: 0,
                    }}
                  />
                ))}
                {brandKit.colors.length > 6 && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      alignSelf: 'center',
                      marginLeft: '4px',
                    }}
                  >
                    +{brandKit.colors.length - 6}
                  </span>
                )}
              </div>
            )}

            {/* Active font sample */}
            {brandKit.fonts.length > 0 && (
              <div
                style={{
                  fontFamily: `${brandKit.fonts[0].family}, system-ui, sans-serif`,
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '6px',
                }}
              >
                <span>Aa</span>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>
                  {brandKit.fonts[0].family}
                </span>
              </div>
            )}

            {/* Active voice trait, if any */}
            {brandKit.voice.find((v) => v.active) && (
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Voice: {brandKit.voice.find((v) => v.active)?.label}
              </div>
            )}
          </div>
        </PanelSection>
      )}

      {/* 1. Theme Presets */}
      <PanelSection title="Theme" defaultOpen>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {THEME_PRESETS.map((p) => {
            const active = themesMatch(currentTheme, p.theme);
            return (
              <button key={p.id} type="button" onClick={() => onThemeChange(p.theme)} aria-label={`Apply ${p.label} theme`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                <div style={{ width: '80px', height: '60px', borderRadius: '10px', border: active ? '2px solid #6B3FA0' : '1px solid rgba(15,23,42,0.08)', background: p.theme.pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'border 150ms ease' }}>
                  <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: p.theme.headingColor }} />
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {p.theme.accentColors.map((ac, i) => <div key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', background: ac }} />)}
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: active ? 600 : 500, color: active ? '#6B3FA0' : '#64748b' }}>{p.label}</span>
              </button>
            );
          })}
        </div>
      </PanelSection>

      {/* 2. Colors */}
      <PanelSection title="Colors">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <ColorRow label="Background" color={currentTheme.pageBg} onChange={(c) => updateTheme({ pageBg: c })} />
          <ColorRow label="Card" color={currentTheme.cardBg} onChange={(c) => updateTheme({ cardBg: c })} />
          <ColorRow label="Text" color={currentTheme.headingColor} onChange={(c) => updateTheme({ headingColor: c })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(15,23,42,0.06)', background: 'rgba(255,255,255,0.7)', minHeight: '44px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#334155', flex: 1 }}>Accent</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {currentTheme.accentColors.map((ac, i) => (
                <AccentCircle key={i} color={ac} index={i} onChangeAccent={(idx, c) => {
                  const next = [...currentTheme.accentColors]; next[idx] = c; updateTheme({ accentColors: next });
                }} />
              ))}
            </div>
          </div>
        </div>
      </PanelSection>

      {/* 3. Fonts */}
      <PanelSection title="Fonts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Dropdown label="Heading font" value={currentTheme.headingFont} options={FONT_OPTIONS} onChange={(f) => updateTheme({ headingFont: f })} fontPreview />
          <Dropdown label="Body font" value={currentTheme.bodyFont} options={FONT_OPTIONS} onChange={(f) => updateTheme({ bodyFont: f })} fontPreview />
        </div>
      </PanelSection>

      {/* 4. Logo — wired 2026-05-22 (was a "Coming soon" placeholder).
          Saves to brandKitStorage as a data URL. The kit already had a
          BrandLogo type; we just hadn't surfaced the upload UX. Multi-logo
          management is deferred to /compose/brand-kit. */}
      <PanelSection title="Logo">
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleLogoFile(f);
            // Reset so picking the same file twice still fires onChange.
            if (logoInputRef.current) logoInputRef.current.value = '';
          }}
        />
        {activeLogo?.url ? (
          // Uploaded state — preview tile + remove button.
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            borderRadius: '12px',
            border: '1px solid rgba(15,23,42,0.08)',
            background: 'rgba(255,255,255,0.7)',
          }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '8px',
                background: `#fff center / contain no-repeat url("${activeLogo.url}")`,
                border: '1px solid rgba(15,23,42,0.08)',
                flexShrink: 0,
              }}
              aria-label={`Logo preview: ${activeLogo.name}`}
              role="img"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#0f172a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {activeLogo.name}
              </div>
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                style={{
                  marginTop: '4px',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6B3FA0',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dotted',
                  textUnderlineOffset: '3px',
                }}
              >
                Replace
              </button>
            </div>
            <button
              type="button"
              onClick={handleLogoRemove}
              aria-label="Remove logo"
              title="Remove logo"
              style={{
                width: '32px',
                height: '32px',
                minWidth: '44px',
                minHeight: '44px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'content-box',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          // Empty state — click-to-upload zone.
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            aria-label="Upload logo"
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '20px',
              borderRadius: '12px',
              border: '2px dashed rgba(107,63,160,0.25)',
              background: 'rgba(107,63,160,0.03)',
              minHeight: '80px',
              cursor: 'pointer',
              transition: 'all 160ms ease',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(107,63,160,0.5)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(107,63,160,0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(107,63,160,0.25)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(107,63,160,0.03)';
            }}
          >
            <Upload size={20} style={{ color: '#6B3FA0' }} />
            <span style={{ fontSize: '14px', color: '#6B3FA0', fontWeight: 500 }}>Upload your logo</span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>PNG · JPG · SVG · WebP · up to 2 MB</span>
          </button>
        )}
        {logoError && (
          <div style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#dc2626',
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.15)',
            padding: '6px 10px',
            borderRadius: '6px',
            lineHeight: 1.4,
          }} role="alert">
            {logoError}
          </div>
        )}
      </PanelSection>

      {/* 5. AI Tone (placeholder) */}
      <PanelSection title="AI Tone">
        <Dropdown label="" value={tone} options={TONE_OPTIONS} onChange={setTone} />
        <span style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px', display: 'block' }}>AI will match this tone when generating content</span>
      </PanelSection>

      <style>{`@media (prefers-reduced-motion: reduce) { * { transition-duration: 0ms !important; } }`}</style>
    </div>
  );
}
