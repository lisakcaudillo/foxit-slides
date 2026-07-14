/**
 * Twelve document themes — extracted byte-for-byte from
 * ui_kits/_shared/ThemesModal.jsx. Each definition matches the original.
 *
 * Ordering and field values are not changed; only typing is added.
 */
import type { Theme } from './types';

export const THEMES: ReadonlyArray<Theme> = [
  {
    id: 'counsel', name: 'Counsel', category: 'legal', tone: 'light', archetype: 'editorial',
    titleFont: "'Inter', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#FAFAF7',
    pagePattern: 'repeating-linear-gradient(0deg, rgba(20,34,60,0.025) 0 1px, transparent 1px 28px)',
    titleColor: '#14223C',
    bodyColor: '#5C6770',
    linkColor: '#B85C2E',
    primaryBg: '#14223C', primaryFg: '#fff',
    secondaryBg: 'transparent', secondaryFg: '#14223C', secondaryBorder: '#14223C',
    btnRadius: 4,
    titleStyle: 'solid',
    chartPalette: ['#14223C', '#B85C2E', '#7A5C3A', '#8A3030', '#456D5A'],
  },
  {
    id: 'glacier', name: 'Glacier', category: 'creative', tone: 'light', archetype: 'product',
    titleFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    // Figma "Sky": the real glass-glow artwork lives in the per-category
    // background source (skin-backgrounds). pageBg is the near-white fallback.
    pageBg: '#EEF3F7',
    workspaceBg: '#D3E0EA',
    titleColor: '#1B4A86',
    bodyColor: '#35485C',
    linkColor: '#2C5FA8',
    primaryBg: '#2C5FA8', primaryFg: '#fff',
    secondaryBg: 'transparent', secondaryFg: '#1E2A38', secondaryBorder: '#2C5FA8',
    btnRadius: 12,
    titleStyle: 'solid',
    chartPalette: ['#2C5FA8', '#3C7E6B', '#1E2A38', '#758799', '#45576B'],
  },
  {
    id: 'cerulean', name: 'Cerulean', category: 'creative', tone: 'light', archetype: 'product',
    titleFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    // Figma "Blue": the glass-wave artwork lives in the per-category background
    // source (skin-backgrounds) — cover/quote/closing only. pageBg is the
    // near-white content/fallback ground (kept close to white).
    pageBg: '#F5FAFE',
    workspaceBg: '#CBDFF2',
    titleColor: '#0B2A54',
    bodyColor: '#33475F',
    linkColor: '#256BA6',
    primaryBg: '#256BA6', primaryFg: '#fff',
    secondaryBg: 'transparent', secondaryFg: '#0B1F3A', secondaryBorder: '#256BA6',
    btnRadius: 12,
    titleStyle: 'solid',
    chartPalette: ['#256BA6', '#0B1F3A', '#5B6B80', '#7FB3E6', '#A9C2DA'],
  },
  {
    id: 'nocturne', name: 'Nocturne', category: 'creative', tone: 'dark', archetype: 'product',
    titleFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#2C2C50',
    workspaceBg: '#2C2C50',
    titleColor: '#EAD9FF',
    bodyColor: '#C4B6DB',
    linkColor: '#C18BF0',
    primaryBg: '#C18BF0', primaryFg: '#0B0B0F',
    secondaryBg: 'transparent', secondaryFg: '#EAD9FF', secondaryBorder: '#C18BF0',
    btnRadius: 12,
    titleStyle: 'solid',
    chartPalette: ['#C18BF0', '#EAD9FF', '#C4B6DB', '#D7B4F5', '#F1E6FF'],
  },
  {
    id: 'nebulae', name: 'Nebulae', category: 'creative', tone: 'dark', archetype: 'product',
    titleFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#2B2C54',
    workspaceBg: '#2B2C54',
    titleColor: '#6FB0F2',
    bodyColor: '#A8A0C8',
    linkColor: '#8B7FE8',
    primaryBg: '#8B7FE8', primaryFg: '#0B0B0F',
    secondaryBg: 'transparent', secondaryFg: '#6FB0F2', secondaryBorder: '#8B7FE8',
    btnRadius: 12,
    titleStyle: 'solid',
    chartPalette: ['#8B7FE8', '#6FB0F2', '#A8A0C8', '#B4ACF0', '#A1CCF7'],
  },
  {
    id: 'northern-lights', name: 'Northern Lights', category: 'creative', tone: 'dark', archetype: 'product',
    titleFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#232B48',
    workspaceBg: '#232B48',
    titleColor: '#9CF2D0',
    bodyColor: '#BCC6DC',
    linkColor: '#57D6B2',
    primaryBg: '#57D6B2', primaryFg: '#0B0B0F',
    secondaryBg: 'transparent', secondaryFg: '#9CF2D0', secondaryBorder: '#57D6B2',
    btnRadius: 12,
    titleStyle: 'solid',
    chartPalette: ['#57D6B2', '#9CF2D0', '#BCC6DC', '#92E4CD', '#BFF7E0'],
  },
  {
    id: 'glasshouse', name: 'Glasshouse', category: 'creative', tone: 'light', archetype: 'product',
    titleFont: "'Fraunces', Georgia, serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#C5C7CA',
    workspaceBg: '#C5C7CA',
    titleColor: '#16191E',
    bodyColor: '#41464D',
    linkColor: '#3D6488',
    primaryBg: '#3D6488', primaryFg: '#fff',
    secondaryBg: 'transparent', secondaryFg: '#16191E', secondaryBorder: '#3D6488',
    btnRadius: 12,
    titleStyle: 'solid',
    chartPalette: ['#3D6488', '#16191E', '#41464D', '#819AB2', '#686A6D'],
  },
  {
    id: 'aurora', name: 'Aurora', category: 'creative', tone: 'light', archetype: 'product',
    titleFont: "'Poppins', -apple-system, system-ui, sans-serif",
    bodyFont: "'Open Sans', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #FFE5ED 0%, #FFE0D0 30%, #F0E0FF 65%, #DCE8FF 100%)',
    workspaceBg: '#2E2852',
    pagePattern: 'radial-gradient(circle at 18% 22%, rgba(255,255,255,0.45) 0%, transparent 24%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.35) 0%, transparent 28%)',
    titleColor: 'linear-gradient(135deg, #6B2C8E 0%, #B33C7A 50%, #E8602C 100%)',
    titleStyle: 'gradient',
    bodyColor: '#5A4A6E',
    linkColor: '#8B3A8C',
    primaryBg: '#6B2C8E', primaryFg: '#fff',
    secondaryBg: 'rgba(255,255,255,0.5)', secondaryFg: '#6B2C8E', secondaryBorder: '#6B2C8E',
    btnRadius: 6,
    chartPalette: ['#6B2C8E', '#B33C7A', '#E8602C', '#2A8B8B', '#5A4A9E'],
  },
  {
    id: 'cobalt', name: 'Cobalt', category: 'business', tone: 'light', archetype: 'product',
    titleFont: "'Montserrat', -apple-system, system-ui, sans-serif",
    bodyFont: "'Open Sans', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #E8F0FF 0%, #D4E0FF 50%, #BCD0FF 100%)',
    workspaceBg: '#C3CAD6',
    titleColor: 'linear-gradient(135deg, #0F2654 0%, #2A4F9E 100%)',
    titleStyle: 'gradient',
    bodyColor: '#3B4A6B',
    linkColor: '#1F3D8A',
    primaryBg: '#1F3D8A', primaryFg: '#fff',
    secondaryBg: 'rgba(255,255,255,0.6)', secondaryFg: '#1F3D8A', secondaryBorder: '#1F3D8A',
    btnRadius: 6,
    chartPalette: ['#1F3D8A', '#2A8BCB', '#0FAAA2', '#E8A82E', '#D4583A'],
  },
  {
    id: 'foxit-glow', name: 'Foxit Glow', category: 'branded', tone: 'light', archetype: 'warm',
    titleFont: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #FFEFD5 0%, #FFD4B0 35%, #FFB382 75%, #FF955C 100%)',
    pagePattern: 'radial-gradient(ellipse at 80% -10%, rgba(255,255,255,0.5) 0%, transparent 45%), radial-gradient(ellipse at 10% 110%, rgba(179,60,15,0.18) 0%, transparent 50%)',
    titleColor: 'linear-gradient(135deg, #8B2A0A 0%, #B33C0F 50%, #E8602C 100%)',
    titleStyle: 'gradient',
    bodyColor: '#5C2E12',
    linkColor: '#B33C0F',
    primaryBg: '#B33C0F', primaryFg: '#fff',
    secondaryBg: 'rgba(255,255,255,0.6)', secondaryFg: '#B33C0F', secondaryBorder: '#B33C0F',
    btnRadius: 6,
    chartPalette: ['#B33C0F', '#E8602C', '#D4A53A', '#6B2D5A', '#2A6B7C'],
  },
  {
    id: 'volt', name: 'Volt', category: 'creative', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Work Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    // Editor WORKSPACE background — complementary, not competing. LIGHTER than
    // the slide ground (#232E44 > the slide's #131D2E) so the darker, glow-lit
    // slides POP against it (a too-dark workspace swallows them). Very faint
    // ON-PALETTE (purple+pink, matching the Volt accent) corner glows. Subtle by
    // design — the deck gets the spotlight.
    pageBg: 'radial-gradient(ellipse 60% 50% at 18% 22%, rgba(200, 168, 255, 0.08) 0%, transparent 60%), radial-gradient(ellipse 55% 45% at 84% 80%, rgba(255, 180, 212, 0.06) 0%, transparent 60%), #232E44',
    titleColor: 'linear-gradient(135deg, #E8C8FF 0%, #C8A8FF 50%, #FFB4D4 100%)',
    titleStyle: 'gradient',
    bodyColor: '#C8B8D8',
    linkColor: '#FFB4D4',
    primaryBg: 'linear-gradient(135deg, #C8A8FF 0%, #FFB4D4 100%)', primaryFg: '#131D2E',
    secondaryBg: 'transparent', secondaryFg: '#C8A8FF', secondaryBorder: '#C8A8FF',
    btnRadius: 6,
    chartPalette: ['#C8A8FF', '#FFB4D4', '#7DD3FC', '#FFD68A', '#A3E635'],
  },
  {
    id: 'quartz', name: 'Quartz', category: 'business', tone: 'light', archetype: 'editorial',
    titleFont: "'DM Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'DM Sans', -apple-system, system-ui, sans-serif",
    pageBg: '#FFFFFF',
    titleColor: '#0B1F3A',
    bodyColor: '#475569',
    linkColor: '#1F4FAA',
    primaryBg: '#0B1F3A', primaryFg: '#fff',
    secondaryBg: '#F1F5F9', secondaryFg: '#0B1F3A', secondaryBorder: '#E2E8F0',
    btnRadius: 6,
    titleStyle: 'solid',
    chartPalette: ['#0B1F3A', '#1F4FAA', '#0EA5A0', '#E8A82E', '#D45757'],
  },
  {
    id: 'solstice', name: 'Solstice', category: 'creative', tone: 'light', archetype: 'warm',
    titleFont: "'Lato', -apple-system, system-ui, sans-serif",
    bodyFont: "'Lato', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #FFE0CC 0%, #FFB8A8 30%, #FF8A8E 60%, #E85A8C 100%)',
    workspaceBg: '#D6BCAB',
    pagePattern: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 14px, rgba(255,255,255,0.0) 14px 32px)',
    titleColor: 'linear-gradient(135deg, #8E1F4A 0%, #C72E5C 35%, #E8602C 100%)',
    titleStyle: 'gradient',
    bodyColor: '#6B2A3D',
    linkColor: '#C72E5C',
    primaryBg: '#C72E5C', primaryFg: '#fff',
    secondaryBg: 'rgba(255,255,255,0.55)', secondaryFg: '#C72E5C', secondaryBorder: '#C72E5C',
    btnRadius: 6,
    chartPalette: ['#C72E5C', '#E8602C', '#8E1F4A', '#D4A53A', '#3B6B9E'],
  },
  {
    id: 'verdant', name: 'Verdant', category: 'business', tone: 'light', archetype: 'warm',
    titleFont: "'Source Sans 3', -apple-system, system-ui, sans-serif",
    bodyFont: "'Source Sans 3', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #EDF2E4 0%, #D5E4C0 45%, #B5CC95 100%)',
    workspaceBg: '#C7CBC0',
    titleColor: 'linear-gradient(135deg, #1F3A1F 0%, #3B6D2E 100%)',
    titleStyle: 'gradient',
    bodyColor: '#3D5230',
    linkColor: '#3B6D2E',
    primaryBg: '#3B6D2E', primaryFg: '#fff',
    secondaryBg: 'rgba(255,255,255,0.55)', secondaryFg: '#3B6D2E', secondaryBorder: '#3B6D2E',
    btnRadius: 6,
    chartPalette: ['#3B6D2E', '#1F3A1F', '#8AA858', '#C9883A', '#5A8FA8'],
  },
  {
    id: 'obsidian', name: 'Obsidian', category: 'branded', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #1A1612 0%, #2D2620 50%, #1F1A17 100%)',
    workspaceBg: '#2A2C39',
    titleColor: 'linear-gradient(135deg, #F5E6C8 0%, #E8D49E 50%, #D4B878 100%)',
    titleStyle: 'gradient',
    bodyColor: '#B8A88C',
    linkColor: '#E8D49E',
    primaryBg: 'linear-gradient(135deg, #F5E6C8 0%, #D4B878 100%)', primaryFg: '#1A1612',
    secondaryBg: 'transparent', secondaryFg: '#D4B878', secondaryBorder: '#D4B878',
    btnRadius: 6,
    chartPalette: ['#D4B878', '#F5E6C8', '#C9883A', '#8AA8C8', '#A87878'],
  },
  {
    id: 'mist', name: 'Mist', category: 'business', tone: 'light', archetype: 'product',
    titleFont: "'Manrope', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #E8E5F5 0%, #D5D5E8 35%, #C8CFE5 70%, #B8C8DE 100%)',
    workspaceBg: '#C3C0CE',
    pagePattern: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.55) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(74,79,138,0.10) 0%, transparent 55%)',
    titleColor: 'linear-gradient(135deg, #1F2A4E 0%, #4A4F8A 50%, #7B5FA8 100%)',
    titleStyle: 'gradient',
    bodyColor: '#4A4F6E',
    linkColor: '#4A4F8A',
    primaryBg: '#4A4F8A', primaryFg: '#fff',
    secondaryBg: 'rgba(255,255,255,0.6)', secondaryFg: '#4A4F8A', secondaryBorder: '#4A4F8A',
    btnRadius: 6,
    chartPalette: ['#4A4F8A', '#7B5FA8', '#A8C8E8', '#D49EA8', '#6B8A6E'],
  },
  {
    id: 'velvet', name: 'Velvet', category: 'branded', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Inter', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'radial-gradient(ellipse at 25% 35%, rgba(255, 200, 220, 0.15) 0%, transparent 55%), radial-gradient(ellipse at 78% 70%, rgba(180, 220, 255, 0.08) 0%, transparent 55%), linear-gradient(135deg, #2D1B3D 0%, #4A2851 45%, #6B2E4D 100%)',
    workspaceBg: '#342F4F',
    titleColor: 'linear-gradient(135deg, #FFE0C8 0%, #F5C0B0 55%, #E8A8B8 100%)',
    titleStyle: 'gradient',
    bodyColor: '#D8B8C8',
    linkColor: '#F5C0B0',
    primaryBg: 'linear-gradient(135deg, #F5C0B0 0%, #E8A8B8 100%)', primaryFg: '#2D1B3D',
    secondaryBg: 'transparent', secondaryFg: '#F5C0B0', secondaryBorder: '#F5C0B0',
    btnRadius: 6,
    chartPalette: ['#F5C0B0', '#E8A8B8', '#B4DCFF', '#FFE0C8', '#C8A8E8'],
  },
  {
    id: 'ledger', name: 'Ledger', category: 'business', tone: 'light', archetype: 'editorial',
    titleFont: "'Poppins', -apple-system, system-ui, sans-serif",
    bodyFont: "'Open Sans', -apple-system, system-ui, sans-serif",
    pageBg: '#F8F7F2',
    titleColor: '#1A2B4A',
    bodyColor: '#4A5568',
    linkColor: '#A8852E',
    primaryBg: '#1A2B4A', primaryFg: '#fff',
    secondaryBg: 'transparent', secondaryFg: '#1A2B4A', secondaryBorder: '#1A2B4A',
    btnRadius: 3,
    titleStyle: 'solid',
    chartPalette: ['#1A2B4A', '#A8852E', '#7A3030', '#3D6B4A', '#5E5E78'],
  },
  {
    // Cobalt — re-skinned from the former "Ledgerline". Keeps
    // the clean-financial structure; new bold high-contrast blue palette so it is
    // visually distinct from Ledger (navy+gold). id stays 'ledgerline' so saved
    // decks resolve unchanged; only the name + colors changed.
    id: 'ledgerline', name: 'Cobalt', category: 'business', tone: 'light', archetype: 'editorial',
    titleFont: "'Work Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Work Sans', -apple-system, system-ui, sans-serif",
    pageBg: '#FFFFFF',
    titleColor: '#1A1F2E',
    bodyColor: '#475569',
    linkColor: '#2B5FE3',
    primaryBg: '#2B5FE3', primaryFg: '#fff',
    secondaryBg: 'transparent', secondaryFg: '#1A1F2E', secondaryBorder: '#2B5FE3',
    btnRadius: 6,
    titleStyle: 'solid',
    chartPalette: ['#2B5FE3', '#1A1F2E', '#5B8DEF', '#8AB0F5', '#94A3B8'],
  },
  // ── Round 1 — D1 Editorial ────────────────────────────────────────────────
  // 5 themes.
  {
    id: 'vellum', name: 'Vellum', category: 'creative', tone: 'light', archetype: 'editorial',
    titleFont: "'Montserrat', -apple-system, system-ui, sans-serif",
    bodyFont: "'Open Sans', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(155deg, #EFEAE0 0%, #E7E1D2 45%, #D8D2C0 100%)',
    pagePattern: "radial-gradient(60% 90% at 18% 12%, rgba(255,255,255,0.55) 0%, transparent 55%), radial-gradient(45% 70% at 90% 90%, rgba(120,80,60,0.10) 0%, transparent 55%), url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/></svg>\")",
    titleColor: '#2A2520',
    titleStyle: 'solid',
    bodyColor: '#4A4338',
    linkColor: '#8A4A2A',
    primaryBg: 'rgba(42,37,32,0.92)', primaryFg: '#F4F0E7',
    secondaryBg: 'rgba(255,255,255,0.55)', secondaryFg: '#2A2520', secondaryBorder: 'rgba(42,37,32,0.4)',
    btnRadius: 14,
    chartPalette: ['#2A2520', '#8A4A2A', '#B8A275', '#5A7062', '#6A5078'],
  },
  {
    id: 'schoolbook', name: 'Schoolbook', category: 'business', tone: 'light', archetype: 'editorial',
    titleFont: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#FBF3E2',
    pagePattern: 'radial-gradient(circle at 8% 0%, rgba(190,130,60,0.12) 0%, transparent 40%), radial-gradient(circle at 100% 100%, rgba(110,80,180,0.08) 0%, transparent 45%)',
    titleColor: '#3B2818',
    titleStyle: 'solid',
    bodyColor: '#50412E',
    linkColor: '#B8581E',
    primaryBg: '#3B2818', primaryFg: '#FBF3E2',
    secondaryBg: 'rgba(255,255,255,0.55)', secondaryFg: '#3B2818', secondaryBorder: '#3B2818',
    btnRadius: 10,
    chartPalette: ['#3B2818', '#B8581E', '#D4A83E', '#5A8A6E', '#5A6EA8'],
  },
  {
    id: 'quill', name: 'Quill', category: 'branded', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Work Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'radial-gradient(80% 60% at 100% 0%, rgba(220,180,120,0.22) 0%, transparent 55%), radial-gradient(70% 60% at 0% 100%, rgba(180,130,170,0.18) 0%, transparent 55%), linear-gradient(150deg, #1B1D2A 0%, #20223A 60%, #232238 100%)',
    pagePattern: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='280' height='280'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/></svg>\")",
    titleColor: '#F4E8C8',
    titleStyle: 'solid',
    bodyColor: '#D4CAB2',
    linkColor: '#E8B878',
    primaryBg: '#F4E8C8', primaryFg: '#1B1D2A',
    secondaryBg: 'transparent', secondaryFg: '#F4E8C8', secondaryBorder: '#F4E8C8',
    btnRadius: 2,
    chartPalette: ['#E8B878', '#C89AA8', '#8AB4D4', '#B8C878', '#D8A8C8'],
  },

  // ── Round 1 — D2 Product / SaaS ───────────────────────────────────────────
  // 7 themes.
  {
    id: 'strata', name: 'Strata', category: 'business', tone: 'light', archetype: 'editorial',
    titleFont: "'DM Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'DM Sans', -apple-system, system-ui, sans-serif",
    pageBg: '#F6F5F1',
    workspaceBg: '#CFCECA',
    pagePattern: 'linear-gradient(90deg, rgba(11,31,58,0.045) 0 1px, transparent 1px 80px), linear-gradient(0deg, rgba(11,31,58,0.018) 0 1px, transparent 1px 28px)',
    titleColor: '#0B1F3A',
    titleStyle: 'solid',
    bodyColor: '#3F4856',
    linkColor: '#9A6B1F',
    primaryBg: '#0B1F3A', primaryFg: '#FFFFFF',
    secondaryBg: 'transparent', secondaryFg: '#0B1F3A', secondaryBorder: '#0B1F3A',
    btnRadius: 4,
    chartPalette: ['#0B1F3A', '#9A6B1F', '#3F6B5C', '#7E2E2E', '#5A6478'],
  },
  {
    id: 'prism', name: 'Prism', category: 'creative', tone: 'dark', archetype: 'product',
    titleFont: "'Lato', -apple-system, system-ui, sans-serif",
    bodyFont: "'Lato', -apple-system, system-ui, sans-serif",
    pageBg: '#0E1219',
    workspaceBg: '#242A3D',
    pagePattern: 'radial-gradient(900px 540px at 78% 18%, rgba(120,168,255,0.16), transparent 60%), radial-gradient(720px 540px at 14% 88%, rgba(196,138,255,0.10), transparent 60%), conic-gradient(from 220deg at 50% 50%, rgba(255,255,255,0.018), rgba(255,255,255,0) 30%)',
    titleColor: 'linear-gradient(180deg, #FFFFFF 0%, #B9C2D5 100%)',
    titleStyle: 'gradient',
    bodyColor: '#A6AEC2',
    linkColor: '#9FB8FF',
    primaryBg: 'rgba(255,255,255,0.10)', primaryFg: '#F4F6FA',
    secondaryBg: 'transparent', secondaryFg: '#E2E6F0', secondaryBorder: 'rgba(255,255,255,0.18)',
    btnRadius: 10,
    chartPalette: ['#7C9BFF', '#C48AFF', '#5EE6D6', '#FFB37C', '#FF7CB0'],
  },
  {
    id: 'tide', name: 'Tide', category: 'business', tone: 'light', archetype: 'warm',
    titleFont: "'Source Sans 3', -apple-system, system-ui, sans-serif",
    bodyFont: "'Source Sans 3', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(180deg, #F0F5F1 0%, #E5EFE9 100%)',
    workspaceBg: '#CACECA',
    pagePattern: 'radial-gradient(circle at 12% 18%, rgba(14,78,68,0.07), transparent 28%), radial-gradient(circle at 88% 82%, rgba(232,164,92,0.10), transparent 32%)',
    titleColor: 'linear-gradient(180deg, #0E4E44 0%, #1F6E5E 100%)',
    titleStyle: 'gradient',
    bodyColor: '#37524A',
    linkColor: '#C36C2A',
    primaryBg: '#0E4E44', primaryFg: '#FFFFFF',
    secondaryBg: 'rgba(255,255,255,0.6)', secondaryFg: '#0E4E44', secondaryBorder: '#0E4E44',
    btnRadius: 8,
    chartPalette: ['#0E4E44', '#C36C2A', '#5A8FB5', '#A3823A', '#7A4F8E'],
  },
  {
    id: 'voltage', name: 'Voltage', category: 'branded', tone: 'dark', archetype: 'product',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#0A0A0C',
    pagePattern: 'radial-gradient(900px 540px at 22% 12%, rgba(199,247,42,0.10), transparent 55%), radial-gradient(720px 540px at 88% 92%, rgba(255,86,86,0.08), transparent 55%)',
    titleColor: '#F4F4F0',
    titleStyle: 'solid',
    bodyColor: '#A8ADB8',
    linkColor: '#C7F72A',
    primaryBg: '#C7F72A', primaryFg: '#0A0A0C',
    secondaryBg: 'transparent', secondaryFg: '#F4F4F0', secondaryBorder: 'rgba(255,255,255,0.22)',
    btnRadius: 6,
    chartPalette: ['#C7F72A', '#FF5680', '#5EE6D6', '#FFB37C', '#7C9BFF'],
  },
  {
    id: 'riot', name: 'Riot', category: 'creative', tone: 'light', archetype: 'product',
    titleFont: "'Manrope', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #FFE9D6 0%, #FFD0E0 45%, #DCE2FF 100%)',
    workspaceBg: '#D6C4B4',
    pagePattern: 'radial-gradient(600px 380px at 78% 22%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(540px 380px at 14% 78%, rgba(124,92,255,0.10), transparent 60%)',
    titleColor: 'linear-gradient(135deg, #2E1A4E 0%, #6B3FA0 55%, #E85285 100%)',
    titleStyle: 'gradient',
    bodyColor: '#4A3A5E',
    linkColor: '#6B3FA0',
    primaryBg: '#2E1A4E', primaryFg: '#FFFFFF',
    secondaryBg: 'rgba(255,255,255,0.55)', secondaryFg: '#2E1A4E', secondaryBorder: '#2E1A4E',
    btnRadius: 12,
    chartPalette: ['#6B3FA0', '#E85285', '#FFB37C', '#5EBFB0', '#3F6BD6'],
  },

  // ── Round 1 — D3 Brand Studio ─────────────────────────────────────────────
  // 2 themes.
  {
    id: 'midnight-index', name: 'Midnight Index', category: 'branded', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Inter', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'radial-gradient(120% 80% at 90% 10%, rgba(110,184,255,0.18) 0%, transparent 55%), radial-gradient(80% 60% at 10% 90%, rgba(255,95,150,0.10) 0%, transparent 60%), linear-gradient(160deg, #0a0e1f 0%, #131a35 55%, #181f44 100%)',
    workspaceBg: '#222840',
    titleColor: 'linear-gradient(120deg, #ffffff 0%, #b6c8ff 50%, #6eb8ff 100%)',
    titleStyle: 'gradient',
    bodyColor: 'rgba(244,241,255,0.78)',
    linkColor: '#6eb8ff',
    primaryBg: 'linear-gradient(135deg, #6eb8ff 0%, #b6c8ff 100%)', primaryFg: '#0a0e1f',
    secondaryBg: 'transparent', secondaryFg: '#b6c8ff', secondaryBorder: '#b6c8ff',
    btnRadius: 8,
    chartPalette: ['#6eb8ff', '#b6c8ff', '#ff5f96', '#ffd68a', '#a3e635'],
  },
  {
    id: 'aperture', name: 'Aperture', category: 'business', tone: 'light', archetype: 'editorial',
    titleFont: "'Poppins', -apple-system, system-ui, sans-serif",
    bodyFont: "'Open Sans', -apple-system, system-ui, sans-serif",
    pageBg: 'radial-gradient(60% 80% at 100% 0%, rgba(255,90,140,0.10) 0%, transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(56,180,140,0.10) 0%, transparent 60%), linear-gradient(180deg, #fbf6ef 0%, #f6efe2 100%)',
    titleColor: '#1a1a1a',
    titleStyle: 'solid',
    bodyColor: '#404040',
    linkColor: '#ff3a78',
    primaryBg: '#1a1a1a', primaryFg: '#fbf6ef',
    secondaryBg: 'transparent', secondaryFg: '#1a1a1a', secondaryBorder: '#1a1a1a',
    btnRadius: 10,
    chartPalette: ['#1a1a1a', '#ff3a78', '#38b48c', '#ff9947', '#5b8def'],
  },

  // ── Round 1 — Manager picks ───────────────────────────────────────────────
  // 5 themes.
  {
    id: 'slate-plane', name: 'Slate Plane', category: 'business', tone: 'light', archetype: 'product',
    titleFont: "'Montserrat', -apple-system, system-ui, sans-serif",
    bodyFont: "'Open Sans', -apple-system, system-ui, sans-serif",
    pageBg: 'radial-gradient(70% 60% at 80% 0%, rgba(99,102,241,0.10) 0%, transparent 60%), radial-gradient(60% 60% at 0% 100%, rgba(14,165,233,0.08) 0%, transparent 60%), linear-gradient(180deg, #FBFCFE 0%, #F1F5F9 100%)',
    titleColor: 'linear-gradient(135deg, #1E293B 0%, #6366F1 100%)',
    titleStyle: 'gradient',
    bodyColor: '#475569',
    linkColor: '#6366F1',
    primaryBg: 'linear-gradient(135deg, #6366F1 0%, #0EA5E9 100%)', primaryFg: '#FFFFFF',
    secondaryBg: 'rgba(255,255,255,0.7)', secondaryFg: '#1E293B', secondaryBorder: '#CBD5E1',
    btnRadius: 8,
    chartPalette: ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899'],
  },
  {
    id: 'signal-punch', name: 'Signal Punch', category: 'branded', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Plus Jakarta Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'radial-gradient(40% 60% at 80% 18%, rgba(255,99,72,0.25) 0%, transparent 60%), radial-gradient(40% 60% at 5% 95%, rgba(124,58,237,0.30) 0%, transparent 60%), linear-gradient(135deg, #0F0B1F 0%, #1A0F33 60%, #2A1056 100%)',
    titleColor: 'linear-gradient(135deg, #FF6348 0%, #FBBF24 60%, #A78BFA 100%)',
    titleStyle: 'gradient',
    bodyColor: 'rgba(255,255,255,0.82)',
    linkColor: '#FBBF24',
    primaryBg: 'linear-gradient(135deg, #FF6348 0%, #FBBF24 100%)', primaryFg: '#0F0B1F',
    secondaryBg: 'rgba(255,255,255,0.10)', secondaryFg: '#FFFFFF', secondaryBorder: 'rgba(255,255,255,0.3)',
    btnRadius: 4,
    chartPalette: ['#FF6348', '#FBBF24', '#A78BFA', '#06B6D4', '#EC4899'],
  },

  // ── Round 2 — D1 Geometric ────────────────────────────────────────────────
  // 1 theme.
  {
    id: 'chroma-fold', name: 'Chroma Fold', category: 'creative', tone: 'light', archetype: 'warm',
    titleFont: "'Work Sans', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(135deg, #ffcfb2 0%, #ffcfb2 50%, transparent 50%), linear-gradient(45deg, #c8b8ff 0%, #c8b8ff 42%, transparent 42%), linear-gradient(225deg, #b0e3c4 0%, #b0e3c4 38%, transparent 38%), linear-gradient(315deg, #ffe88a 0%, #ffe88a 46%, transparent 46%), #fffaf2',
    titleColor: '#1f1428',
    titleStyle: 'solid',
    bodyColor: '#2a2438',
    linkColor: '#7a4ab8',
    primaryBg: '#1f1428', primaryFg: '#fffaf2',
    secondaryBg: 'rgba(255,255,255,0.65)', secondaryFg: '#1f1428', secondaryBorder: '#1f1428',
    btnRadius: 6,
    chartPalette: ['#ffcfb2', '#c8b8ff', '#b0e3c4', '#ffe88a', '#1f1428'],
  },

  // ── Quartz import (2026-06-14) — PPT-safe themes from the Figma Quartz set.
  // pageBg is a SOLID hex so PowerPoint export renders the slide background
  // natively (rgba/gradient pageBg exports white — see pptxExport.ts). In-app
  // richness lives in pagePattern, which the PPTX exporter ignores.
  {
    id: 'blush', name: 'Blush', category: 'creative', tone: 'light', archetype: 'warm',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#F6E8EB',
    pagePattern: 'radial-gradient(ellipse at 78% 8%, rgba(178,74,102,0.10) 0%, transparent 46%), radial-gradient(ellipse at 12% 96%, rgba(255,255,255,0.5) 0%, transparent 40%)',
    titleColor: '#341F27',
    titleStyle: 'solid',
    bodyColor: '#8C7078',
    linkColor: '#B24A66',
    primaryBg: '#B24A66', primaryFg: '#fff',
    secondaryBg: '#FBF1F4', secondaryFg: '#341F27', secondaryBorder: '#E7CDD5',
    btnRadius: 10,
    chartPalette: ['#B24A66', '#D98FA5', '#7A3B52', '#E2B6C4', '#5C2E40'],
  },
  {
    id: 'mono-dark', name: 'Mono Dark', category: 'creative', tone: 'dark', archetype: 'editorial',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#0E0E0E',
    titleColor: '#F7F7F7',
    titleStyle: 'solid',
    bodyColor: '#A8A8A8',
    linkColor: '#F7F7F7',
    primaryBg: '#F7F7F7', primaryFg: '#0E0E0E',
    secondaryBg: '#1C1C1C', secondaryFg: '#F7F7F7', secondaryBorder: '#333333',
    btnRadius: 8,
    chartPalette: ['#F7F7F7', '#A8A8A8', '#6E6E6E', '#CFCFCF', '#4A4A4A'],
  },
  {
    // Light counterpart of Mono Dark — the editor-theme twin of the validated
    // `mono-light` structure skin (manifest figma-template-structures.json:
    // ground #FFFFFF, ink #0F0F0F, Fraunces display / Inter body). One of the
    // three mapped/selectable themes (see SELECTABLE_THEME_IDS).
    id: 'mono-light', name: 'Mono Light', category: 'creative', tone: 'light', archetype: 'editorial',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#FFFFFF',
    titleColor: '#0F0F0F',
    titleStyle: 'solid',
    bodyColor: '#4A4A4A',
    linkColor: '#0F0F0F',
    primaryBg: '#0F0F0F', primaryFg: '#FFFFFF',
    secondaryBg: '#F4F4F4', secondaryFg: '#0F0F0F', secondaryBorder: '#E0E0E0',
    btnRadius: 8,
    chartPalette: ['#0F0F0F', '#4A4A4A', '#7A7A7A', '#A8A8A8', '#CFCFCF'],
  },
  {
    id: 'mubi', name: 'MUBI', category: 'creative', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#0B0A0E',
    pagePattern: 'radial-gradient(ellipse at 85% 12%, rgba(232,90,160,0.20) 0%, transparent 50%), radial-gradient(ellipse at 8% 92%, rgba(178,58,120,0.16) 0%, transparent 52%)',
    titleColor: '#FFFFFF',
    titleStyle: 'solid',
    bodyColor: '#A8A2B0',
    linkColor: '#E85AA0',
    primaryBg: '#E85AA0', primaryFg: '#1A0E16',
    secondaryBg: '#1A141C', secondaryFg: '#F4EAF0', secondaryBorder: '#3A2E3A',
    btnRadius: 12,
    chartPalette: ['#E85AA0', '#F291C2', '#B23A78', '#FF8AC0', '#7A2A52'],
  },

  // ── Round 2 — D2 Editorial + Punch ────────────────────────────────────────
  // 3 themes.

  // ── Round 2 — D3 Cinematic ────────────────────────────────────────────────
  // 5 themes.

  // ── Round 2 — Manager picks ───────────────────────────────────────────────
  // 2 themes.

  // ── Round 4 — Cinematic (v4) ──────────────────────────────────────────────
  // 6 themes.

  // ── Round 5 — Cinematic (v5) ──────────────────────────────────────────────
  // 3 themes.

  // ── Round 6 — Glow (v6) ───────────────────────────────────────────────────
  // 3 themes.
  // NOTE: phosphor's linkColor was "#80ff a0" in source (stray space inside hex);
  // normalized to "#80ffa0" to match chartPalette[4].

  // ── Compass — first editor-authored template (PPTX-import path) ───────────
  // Not from Figma. Slots + geometry live in app/src/data/templates/
  // template-structure.json (20 slides), served via lib/card-engine/
  // native-template.ts. This Theme record supplies the visual palette the
  // native builder resolves tokens against.
  {
    id: 'compass', name: 'Compass', category: 'business', tone: 'dark', archetype: 'product',
    titleFont: "'Inter', -apple-system, system-ui, sans-serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#131D2E',
    titleColor: '#F4E8C8',
    titleStyle: 'solid',
    bodyColor: '#B8BCC6',
    linkColor: '#FF9A5A',
    primaryBg: '#FF9A5A', primaryFg: '#131D2E',
    secondaryBg: 'transparent', secondaryFg: '#F4E8C8', secondaryBorder: '#F4E8C8',
    btnRadius: 6,
    chartPalette: ['#FF9A5A', '#F4E8C8', '#8AB7D0', '#6B7A94', '#B8BCC6'],
  },
  // ── Quartz imports (2026-07-13) — Aperture / MUBI / Cosmos ─────────────────
  {
    id: 'aperture', name: 'Aperture', category: 'branded', tone: 'dark', archetype: 'editorial',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: 'linear-gradient(90deg, #21242C 0%, #101218 100%)',
    workspaceBg: '#2A2E38',
    titleColor: '#F5F5F7',
    titleStyle: 'solid',
    bodyColor: '#9AA0AB',
    linkColor: '#6FA8DC',
    primaryBg: '#6FA8DC', primaryFg: '#101218',
    secondaryBg: 'transparent', secondaryFg: '#6FA8DC', secondaryBorder: '#6FA8DC',
    btnRadius: 8,
    chartPalette: ['#6FA8DC', '#80B2E5', '#5B8DEF', '#B8B8C2', '#9AA0AB'],
  },
  {
    id: 'mubi', name: 'MUBI', category: 'branded', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#09060A',
    workspaceBg: '#241A22',
    titleColor: '#FFFFFF',
    titleStyle: 'solid',
    bodyColor: '#A8A2B0',
    linkColor: '#E85AA0',
    primaryBg: '#E85AA0', primaryFg: '#09060A',
    secondaryBg: 'transparent', secondaryFg: '#E85AA0', secondaryBorder: '#E85AA0',
    btnRadius: 8,
    chartPalette: ['#E85AA0', '#F59EC2', '#F7CC9E', '#3C7E6B', '#A8A2B0'],
  },
  {
    id: 'cosmos', name: 'Cosmos', category: 'creative', tone: 'dark', archetype: 'cinematic',
    titleFont: "'Fraunces', Georgia, 'Times New Roman', serif",
    bodyFont: "'Inter', -apple-system, system-ui, sans-serif",
    pageBg: '#0A0814',
    workspaceBg: '#171528',
    titleColor: '#FFFFFF',
    titleStyle: 'solid',
    bodyColor: '#B8B8C2',
    linkColor: '#7ADBF5',
    primaryBg: '#7ADBF5', primaryFg: '#0A0814',
    secondaryBg: 'transparent', secondaryFg: '#7ADBF5', secondaryBorder: '#7ADBF5',
    btnRadius: 8,
    chartPalette: ['#7ADBF5', '#A8C8F0', '#C89EF0', '#B8B8C2', '#8890A8'],
  },
];

/** Migration map for the 8 matte-gradient theme IDs shipped in efd3997 and
 *  removed in this commit. Existing decks saved with these IDs in
 *  cardDeckStorage will fall through to getThemeById's migration path and
 *  render in the closest mood/tone match from the new keeper set. */
export const LEGACY_THEME_ID_MAP: Readonly<Record<string, string>> = {
  'dawn-prism': 'obsidian',
  'berry-bloom': 'obsidian',
  'lavender-wash': 'page-white',
  'twilight-drift': 'obsidian',
  'cotton-candy': 'aurora',
  'aurora-mint': 'cobalt',
  'sunset-bay': 'foxit-glow',
  'periwinkle-field': 'cobalt',
  // Cull pass 2026-05-26 — 12 redundant white-ish themes dropped
  // (4 pure-white + 5 cream + 3 white-with-accent that duplicated keepers).
  'cipher': 'quartz',
  'typeset': 'quartz',
  'page-white': 'quartz',
  'ruled': 'counsel',
  'atelier': 'strata',
  'halo': 'strata',
  'lectern': 'schoolbook',
  'letterbox': 'strata',
  'strobe': 'schoolbook',
  'granite-hall': 'slate-plane',
  'broadsheet': 'schoolbook',
  'prism-pane': 'slate-plane',
  // Culled 2026-06-10 (8 themes removed) -> nearest keepers.
  'mubi': 'obsidian',
  'souvenir': 'aurora',
  'fieldwork': 'obsidian',
  'chiaroscuro': 'obsidian',
  'polaris': 'cobalt',
  'halation': 'obsidian',
  'tarkovsky': 'obsidian',
  'apartamento': 'foxit-glow',
  // Culled 2026-06-10 (9 more themes removed) -> nearest keepers.
  'mezzotint': 'obsidian',
  'stagehand': 'obsidian',
  'vitrine': 'obsidian',
  'opdoc': 'obsidian',
  'a24': 'chroma-fold',
  'twilight': 'obsidian',
  'lumen': 'obsidian',
  'vapor': 'obsidian',
  'phosphor': 'obsidian',
};

export const CATEGORIES = ['All', 'Legal', 'Business', 'Branded', 'Creative'] as const;
export type CategoryLabel = (typeof CATEGORIES)[number];

/** Look up a theme by id; returns the default if not found. */
export function getThemeById(id: string): Theme {
  const direct = THEMES.find((t) => t.id === id);
  if (direct) return direct;
  // Legacy ID migration — silent fallback for decks saved with the old
  // matte-gradient theme IDs (dropped 2026-05-26).
  const mapped = LEGACY_THEME_ID_MAP[id];
  if (mapped) {
    const migrated = THEMES.find((t) => t.id === mapped);
    if (migrated) return migrated;
  }
  return THEMES[0];
}

/**
 * The ONLY themes offered in the pickers. The full THEMES array stays intact
 * for getThemeById / LEGACY_THEME_ID_MAP / saved-deck back-compat — these are
 * simply the curated *selectable* set: the editor-theme twins of the structure
 * skins whose covers are FAITHFUL to Figma (figma-template-structures.json
 * cover.fidelity === 'faithful'), in manifest order.
 *
 * HIDDEN-until-faithful gate: Chroma-fold + Quill were
 * RE-GATED out — their glass/photo covers currently fall back to flat, so they
 * are not faithful yet. They return here the moment their real cover assets
 * land. The themes still exist in THEMES, so saved decks using them render fine
 * (gating only removes them from NEW generation + the picker — no data
 * migration). Keep this list in sync with STRUCTURE_SKIN_IDS (structureTemplates.ts).
 */
export const SELECTABLE_THEME_IDS = ['mono-light', 'volt', 'mono-dark', 'obsidian', 'aperture', 'mubi', 'cosmos', 'cobalt', 'prism', 'velvet', 'solstice', 'nocturne', 'tide', 'mist', 'strata', 'riot', 'verdant', 'midnight-index', 'aurora', 'nebulae', 'northern-lights', 'glasshouse'] as const;

/** The selectable themes, in SELECTABLE_THEME_IDS order. Pickers map over THIS,
 *  never the full THEMES array. */
export const SELECTABLE_THEMES: ReadonlyArray<Theme> = SELECTABLE_THEME_IDS
  .map((id) => THEMES.find((t) => t.id === id))
  .filter((t): t is Theme => !!t);

/** Default theme id used when no preference has been persisted, and the theme a
 * deck is generated with when the user hasn't picked one (
 *  Mono Light is the default). Must be a selectable theme. */
export const DEFAULT_THEME_ID = 'mono-light';

// ── Designer-driven theme selection ─────────────────────────────────────────
// When the user does NOT pick a theme, the deck's theme is *chosen by the
// design layer from the content* — NOT rolled at random (the
// old `THEMES[random]` roll kept landing on the library's many dark/warm
// "cinematic" themes, so every deck came out brown/muddy).
//
// The rule mirrors how the planner already reasons about decks: derive an
// ARCHETYPE from the content intent, then choose a clean, on-brief theme of
// that archetype. The candidate pools below are curated to be brown-free — the
// muddy tan/peach warm themes (a24, apartamento, souvenir) and the warm dark
// cinematic ones (opdoc, tarkovsky, halation, chiaroscuro, mezzotint, quill,
// fieldwork) are deliberately excluded. Selection is DETERMINISTIC on the
// content (same brief → same theme, reproducible; different brief → variety),
// so it reads as a decision, not a dice roll.

type Archetype = 'editorial' | 'product' | 'warm' | 'cinematic';

/** Curated, brown-free theme ids per archetype, in designer-preference order. */
const ARCHETYPE_THEME_POOLS: Record<Archetype, ReadonlyArray<string>> = {
  // Crisp, authoritative, document-grade — legal, reports, research, exec briefs.
  editorial: ['quartz', 'counsel', 'polaris', 'ledger', 'strata', 'mono-dark'],
  // Modern, confident, cool — pitches, product launches, SaaS, roadmaps.
  product: ['cobalt', 'slate-plane', 'mist', 'aurora', 'riot'],
  // Approachable, human — community, education, brand story, wellness.
  // Clean warms only (the tan/peach themes are excluded on purpose).
  warm: ['tide', 'solstice', 'verdant', 'foxit-glow', 'chroma-fold', 'blush'],
  // Dramatic / premium — ONLY when the brief explicitly asks for it. Cool darks
  // only; the warm/brown cinematic themes are excluded.
  cinematic: ['midnight-index', 'lumen', 'twilight', 'vapor', 'phosphor', 'mubi'],
};

/** Map free-text content signals to a design archetype. */
function archetypeForContent(signals: ThemeContentSignals): Archetype {
  const hay = [signals.prompt, signals.audience, signals.tone, signals.framework]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const has = (...kw: string[]) => kw.some((k) => hay.includes(k));

  // Cinematic is opt-in only — the brief has to actually ask for drama.
  if (has('cinematic', 'dramatic', 'premium', 'luxury', 'keynote', 'bold dark',
          'moody', 'editorial film', 'high contrast dark', 'dark theme')) {
    return 'cinematic';
  }
  // Warm/human briefs.
  if (has('story', 'personal', 'community', 'nonprofit', 'wellness', 'lifestyle',
          'brand story', 'friendly', 'warm', 'approachable', 'education', 'classroom',
          'workshop', 'culture', 'team offsite', 'celebrat')) {
    return 'warm';
  }
  // Pitch / product / sales / startup → product.
  if (has('pitch', 'product', 'launch', 'startup', 'saas', 'demo', 'sales',
          'go-to-market', 'gtm', 'roadmap', 'investor', 'fundrais', 'marketing',
          'campaign', 'growth')) {
    return 'product';
  }
  // Formal / document-grade → editorial.
  if (has('legal', 'report', 'whitepaper', 'white paper', 'research', 'academic',
          'policy', 'compliance', 'executive', 'board', 'annual', 'financial',
          'quarterly', 'analysis', 'brief')) {
    return 'editorial';
  }
  // Default: clean editorial — safe, professional, never brown.
  return 'editorial';
}

/** Stable string hash → non-negative int (for reproducible per-brief picks). */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ThemeContentSignals {
  prompt?: string;
  audience?: string;
  tone?: string;
  /** Framework id or name, if a framework was chosen. */
  framework?: string;
}

/**
 * The design layer's theme decision for a deck when the user hasn't picked one.
 * Derives an archetype from the content, then deterministically selects a
 * clean, on-brief, brown-free theme from that archetype's curated pool.
 */
export function chooseThemeForContent(signals: ThemeContentSignals): Theme {
  const archetype = archetypeForContent(signals);
  const pool = ARCHETYPE_THEME_POOLS[archetype]
    .map((id) => THEMES.find((t) => t.id === id))
    .filter((t): t is Theme => !!t);
  if (pool.length === 0) return getThemeById(DEFAULT_THEME_ID);
  const key = `${signals.prompt ?? ''}|${signals.audience ?? ''}|${signals.tone ?? ''}|${signals.framework ?? ''}`;
  return pool[hashString(key) % pool.length];
}
