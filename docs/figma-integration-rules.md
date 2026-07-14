# Figma MCP Integration Rules — Compose

> **Purpose.** When translating a Figma design into code (via the Figma MCP `get_design_context` / `get_screenshot` / `use_figma` tools), follow these rules so generated code matches Compose's real design system instead of inventing a parallel one. Read this before any design-to-code or code-to-design task.
>
> **Stack at a glance:** Next.js 16 (App Router, RSC) · React 19 · TypeScript strict (no `any`) · **Tailwind CSS v4** (CSS-first config) · shadcn (`base-nova` style) on **Base UI** primitives · `lucide-react` icons · CVA + `clsx` + `tailwind-merge` for variants. Path alias `@/*` → `src/*`.

---

## 0. Design Language — the "feel" (read first)

Compose's surfaces (Home + Studio especially) follow a deliberate **Apple-inspired** aesthetic. Matching the *classes* (§6) is not enough — generated code must also match the *feel*. The intent, in priority order:

1. **Calm, not loud — restraint is the default.** Generous whitespace, one clear focal point per view, muted neutrals as the base. Color is an accent applied sparingly (a single violet gradient line, a soft glow), never a wall of saturated panels. When in doubt, remove an element rather than add one. The home/studio base is a near-white tinted field (`--background #fafbfc`), not pure white and not busy.

2. **Floating chrome over a continuous wash.** The signature spatial composition is: a **fixed full-viewport calm gradient** behind everything, a **floating sidebar rail** (264px, `Sidebar.tsx`) over it, and content that reads as sitting *on* the same calm field. On `/studio/*`, content sits inside a **floating translucent glass panel** (`.studio-content-panel`) that is the scroll owner; on Home, content sits directly on the wash. Surfaces feel layered and weightless, not boxed-in.
   - The wash: **`.bg-compose-wash`** — two soft radial blooms (blue `rgba(71,118,230,0.10)` top-left, violet `rgba(168,85,247,0.10)` bottom-right) over a `165deg` near-white gradient. The saturated variant **`.bg-compose-wash-saturated`** is for hero/feature moments only.
   - The panel: **`.studio-content-panel`** — `rgba(255,255,255,0.78)` + `backdrop-filter: blur(20px) saturate(1.4)`, 16px radius, layered inset hairlines + a soft violet-tinted drop shadow (`0 12px 36px rgba(80,55,195,0.08)`).

3. **Alive but quiet motion.** Things breathe and settle; nothing flashes or bounces hard.
   - **Entrance:** staggered fade-up (`.home-rise-in`, `translateY(20px)→0`, 500ms ease-out).
   - **Ambient life:** the 3px shimmer line at the top (`.home-gradient-line`, 8s loop) and the slow breathing edge glow (`.home-edge-vignette`, 25s ease). Subtle enough to feel ambient, never attention-grabbing.
   - **Hover:** a *gentle* springy lift — `.home-card-hover` uses `cubic-bezier(0.34, 1.56, 0.64, 1)` with a small `-4px` rise and a soft violet shadow bloom. The spring is the signature; keep the displacement small.
   - **Always** provide a `prefers-reduced-motion` fallback (the existing classes already do — match that).

4. **Soft-touch surfaces & geometry.** Rounded rectangles (12–16px radii), hairline borders (`rgba(0,0,0,0.045–0.06)`), diffuse low-opacity shadows tinted toward violet rather than neutral black. Glass tiles (`.glass-tile`) for secondary/interactive cards. **No** hard 1px gray borders, **no** heavy drop shadows, **no** pill buttons.

5. **Typography: quiet hierarchy.** Geist/Inter, neutral slate ink (`--foreground #1a1f36`), real size/weight contrast for hierarchy rather than color. Wordmarks are understated and context-aware (`FOXIT·WORKSPACE` on Home, `STUDIO·WORKSPACE` in Studio).

**Litmus test for a generated Home/Studio surface:** Does it sit on the calm wash (not a white box)? Is there one focal point and lots of breathing room? Do cards lift *gently* on hover? Are accents a whisper of violet, not blocks of color? If yes, it's on-language. If it looks like a dense dashboard with hard borders and saturated fills, it's off-language — revise.

---

## 1. Token Definitions

There are **two parallel token systems**. Pick the right one for the surface you're building.

### A. App chrome tokens — CSS variables in `globals.css` (shadcn/Tailwind v4)

Defined in **`src/app/globals.css`** under `:root` (light) and `.dark` (dark), exposed to Tailwind via the `@theme inline {}` block. This is Tailwind **v4 CSS-first config** — there is no large JS theme object; tokens are CSS custom properties mapped to utility color names.

```css
/* src/app/globals.css */
@theme inline {
  --color-primary: var(--primary);
  --color-muted: var(--muted);
  --color-card: var(--card);
  --radius-md: calc(var(--radius) * 0.8);
  /* ...maps every --foo to a Tailwind color/radius utility... */
}

:root {
  --background: #fafbfc;
  --foreground: #1a1f36;
  --primary: #6B3FA0;          /* brand violet — the app accent */
  --primary-foreground: #ffffff;
  --secondary: #F3EEFA;
  --muted: #f5f7fa;
  --muted-foreground: #697386;
  --accent: #F0EBFA;
  --destructive: #ef4444;
  --border: #e4e7eb;
  --ring: #6B3FA0;
  --radius: 0.75rem;           /* 12px base radius */
  /* sidebar-*, chart-1..5, popover, card also defined */
}
```

**Rule:** Use semantic utilities — `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`, `ring-ring` — **never** hardcode the hex from a Figma fill when a token exists. If a Figma color maps to one of these, use the token. Radii use `rounded-md` / `rounded-lg` (driven by `--radius` = 12px), not arbitrary px.

A second token layer sits **inside** `:root`: the live **document/editor theme vars** (`--theme-title-font`, `--theme-page-bg`, `--theme-chrome-bg`, `--theme-workspace-bg`, etc.), populated at runtime by `ThemeProvider` (`src/lib/theme/ThemeProvider.tsx`). These drive the editor canvas/chrome and follow the active deck theme — don't hardcode over them.

### B. Tailwind v3 JS config — `tailwind.config.js` (legacy/additive)

Still present and read (Tailwind v4 picks up `content` + `theme.extend`). Holds two extras:

```js
// tailwind.config.js
theme: { extend: {
  colors: { primary: { 50:'#f5f3ff', ... 600:'#7c3aed', ... 900:'#4c1d95' } }, // violet scale
  spacing: {
    'block-low':  '2rem',    // 32px
    'block-med':  '1.25rem', // 20px
    'block-high': '0.75rem', // 12px
  },
}}
```

The `block-*` spacing is the **generation pipeline density vocabulary** — use `p-block-low/med/high` for generated document blocks, not arbitrary padding.

### C. Slide/deck design tokens — `src/components/themes/themes.ts`

The presentation themes (49+ themes: `counsel`, `aurora`, `cobalt`, `volt`, `quartz`…) are plain TS objects typed by **`src/components/themes/types.ts`** (`interface Theme`). Shape:

```ts
interface Theme {
  id: string; name: string;
  category: 'legal'|'creative'|'business'|'branded';
  tone: 'light'|'dark';
  archetype: ThemeArchetype;          // editorial|product|warm|cinematic
  titleFont: string; bodyFont: string;
  pageBg: string; pagePattern?: string;
  titleColor: string; titleStyle: 'solid'|'gradient';
  bodyColor: string; linkColor: string;
  primaryBg, primaryFg, secondaryBg, secondaryFg, secondaryBorder: string;
  btnRadius: number;
  chartPalette: string[];             // 5 theme-coherent hues
}
```

**Rule:** If a Figma design is a *slide theme*, add/edit a `Theme` object here — **don't** invent inline styles. Read `themes.ts` first; many designs already exist. ⚠️ **`LEGACY_THEME_ID_MAP` (themes.ts ~line 413)** must get an entry if you rename/drop a theme id, or saved decks fall back to `counsel`.

**No token transformation system** (no Style Dictionary / Tokens Studio). Tokens are hand-authored CSS vars + TS objects. Don't add a transformer; follow the existing format.

---

## 2. Component Library

### Architecture
- **React 19 function components**, TypeScript, hooks. Server Components by default (App Router, `rsc: true`); add `'use client'` only when interactivity/state is needed.
- **Primitives:** shadcn components in **`src/components/ui/`** (`button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx`, `input.tsx`, `badge.tsx`, `tooltip.tsx`, `separator.tsx`, `controls/`). These wrap **Base UI** (`@base-ui/react`), **not** Radix. Style = `base-nova` (`components.json`).
- **Variants:** `class-variance-authority` (CVA) + the `cn()` helper (`src/lib/utils.ts` = `twMerge(clsx(...))`). This is the canonical pattern:

```tsx
// src/components/ui/button.tsx
const buttonVariants = cva("inline-flex shrink-0 items-center justify-center rounded-lg ...", {
  variants: {
    variant: { default:"bg-primary text-primary-foreground", outline:"...", ghost:"...", secondary:"...", destructive:"...", link:"..." },
    size:    { default:"h-8 px-2.5", xs:"h-6", sm:"h-7", lg:"h-9", icon:"size-8", "icon-sm":"size-7" },
  },
  defaultVariants: { variant:"default", size:"default" },
})
function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
```

**Rule:** For a button/dialog/input/select etc. from Figma, **reuse the `ui/` component and its variants** — do not author a new styled element. Pass overrides through `className` (merged safely by `cn`). New primitives are added via `shadcn` CLI into `ui/`.

### Feature components — `src/components/<feature>/`
Organized by feature/surface, not by type:
`atlas/`, `card-template/` (slide editor: `CardEditor.tsx`, blocks), `compose/`, `editor/`, `framework/`, `home/`, `image-editor/`, `image-gen/`, `studio/`, `themes/`, `workflow/`, `icons/`. Top-level shells live directly in `src/components/` (`Canvas.tsx`, `NavBar.tsx`, `Sidebar.tsx`, `Providers.tsx`).

**Shared chrome classes** (not components) for glass surfaces — `.glass-card`, `.glass-tile`, `.glass-panel` in `globals.css`. Use these for floating-rail / panel surfaces rather than re-deriving the blur+border+shadow recipe.

### Documentation
**No Storybook**, no `.stories` files. Source of truth = the `ui/` components themselves + `docs/` (design-table prototypes, `docs/uiux/`). Don't reference a storybook.

---

## 3. Frameworks & Libraries

| Concern | Choice |
|---|---|
| Framework | **Next.js 16.2** App Router, RSC, Node ≥20 |
| UI lib | **React 19.2** |
| Language | TypeScript 5 strict, **no `any`**, Zod on API boundaries |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`), CSS-first via `@theme` |
| Components | shadcn (`base-nova`) over **Base UI** (`@base-ui/react`) |
| Variants | `class-variance-authority`, `clsx`, `tailwind-merge` (`cn`) |
| Animation | `framer-motion` v12 (+ `tw-animate-css`) |
| Icons | `lucide-react` |
| Build/bundler | Next's **Turbopack** on main (`npm run dev` → `next dev -p 3002`); webpack fallback only in worktrees |
| AI | `@anthropic-ai/sdk`, `openai` (via `src/lib/ai-provider/` abstraction — never call SDKs from components) |
| PDF/export | Foxit Node SDK (server-only), `pptxgenjs`, `html-to-image` |

**Constraints:** No third-party rich-text editors (TipTap/Slate/Quill) — the editor is in-house `contentEditable`. No open-source PDF libs — Foxit only.

---

## 4. Asset Management

- **Static assets live in `app/public/`** and are referenced by **root-absolute path** (`/library/images/img_xxx.jpg`, `/file.svg`). Subfolders: `library/images/` (visual library), `glass-centerpieces/`, `design-table/`, `library-staging/` (gitignored PNGs).
- **`next/image` is NOT used anywhere** (0 usages). Components use plain `<img>` tags. **Match this** — when bringing a Figma image into a component, use `<img src="/..." />`, not `next/image`, unless you deliberately introduce it project-wide.
- **Library image metadata** lives in **`app/public/library/metadata.json`** (NOT in `images/`): array of `{ id, filename, prompt, type, quality, width, height, createdAt }`. The **`[category]` prefix inside `prompt`** (e.g. `[glass-centerpiece]`, `[architecture]`) is the load-bearing way to filter by family — preserve it.
- **Downloaded Figma assets:** save into `app/public/` under a sensible subfolder and reference by `/path`. Add a metadata.json entry only if it enters the visual library.
- **No CDN** for app assets (Foxit SDK binary fetches from `cdn-sdk.foxitsoftware.com` at install, unrelated to UI assets).

---

## 5. Icon System

- **Library: `lucide-react`** (set in `components.json` → `"iconLibrary": "lucide"`). Import named icons directly:

```tsx
import { Sparkles, Check, Pencil, X, RefreshCw, ChevronDown, Upload } from 'lucide-react';
// usage: <Sparkles className="size-4" /> (Tailwind sizing; button auto-sizes svg to size-4)
```

- **Custom icons** (when Lucide lacks one) go in **`src/components/icons/`** as inline SVG components that **mirror Lucide's prop surface** — `size` (default 24), `color` (default `currentColor`), `strokeWidth` (default 2), `viewBox="0 0 24 24"`, `stroke="currentColor"`, `forwardRef`. See `src/components/icons/CompareIcon.tsx` as the template. Naming: `PascalCaseIcon`.

**Rule:** Prefer a Lucide icon that matches the Figma glyph. Only create an `icons/` component when none fits, and follow the Lucide-compatible shape so it drops into call sites. Color icons via `currentColor` / Tailwind `text-*`, not hardcoded fills.

---

## 6. Styling Approach

- **Tailwind utility classes are the primary methodology** — applied inline via `className`. **No CSS Modules, no styled-components, no CSS-in-JS.**
- **Global CSS:** `src/app/globals.css` (~1000 lines). Contains: `@import "tailwindcss"`, the `@theme inline` token map, `:root`/`.dark` variables, `@layer base` resets (`* { @apply border-border }`, `body { @apply bg-background text-foreground }`), and **named utility classes** for things hard to express inline:
  - Buttons: `.btn-create` (pink→violet→blue gradient CTA), `.btn-cta-bold`, `.btn-chip`.
  - Surfaces: `.glass-card`, `.glass-tile`, `.glass-panel`.
  - Home motion: `.home-gradient-line`, `.home-edge-vignette`, `.home-rise-in`, `.home-card-hover`, `@keyframes` for each.
  - `.scrollbar-hide`, responsive home grids (`.home-grid-*`).

  **Rule:** Reuse these classes when the Figma element matches (a gradient CTA → `.btn-create`/`.btn-cta-bold`; a glass panel → `.glass-*`). Add a new global class only for genuinely reusable patterns inline utilities can't express; otherwise inline Tailwind.

- **Responsive:** Tailwind responsive prefixes (`sm: md: lg:`, breakpoints 640/768/1024). A few inline-grid home layouts use **media queries in `globals.css`** (`.home-grid-*`) because inline `style={{display:'grid'}}` can't carry breakpoints — follow that pattern only when forced to use inline grid.
- **Dark mode:** class-based (`.dark` variant via `@custom-variant dark`). Tokens auto-swap; use semantic tokens so dark mode is free.
- **Motion:** respects `prefers-reduced-motion` (global reset zeroes durations). Keep that — any new animation should degrade under reduced-motion.

### Brand color rules (from CLAUDE.md — enforce these)
- **AI/action accent = violet** (`--primary` `#6B3FA0`; generated-block accent `violet-600`).
- **Foxit brand red/orange `#FF5F00`** — top nav only, sparingly.
- Blue (`#818cf8`/`#60a5fa`) only for AI gradient surfaces.
- **Buttons are rounded rectangles (10–12px radius), NOT pills.**
- No other accent colors without approval.

---

## 7. Project Structure

```
app/
├─ src/
│  ├─ app/                    # Next.js App Router (routes + API)
│  │  ├─ layout.tsx           # root: Geist font (--font-sans), NavBar, MainContent, Providers
│  │  ├─ globals.css          # tokens + global classes (see §6)
│  │  ├─ editor/              # /editor/documents (A4), /editor/slides (cards), /editor/graphics
│  │  ├─ studio/              # /studio/* product shell
│  │  ├─ create/ templates/ compare/ workflows/ apps/ team/ settings/ internal/
│  │  └─ api/                 # /api/atlas/*, /api/foxit/*, /api/ai/*, /api/esign/*, /api/export/*
│  ├─ components/
│  │  ├─ ui/                  # shadcn primitives (Base UI) — reuse these
│  │  ├─ icons/               # custom Lucide-compatible SVGs
│  │  ├─ themes/              # themes.ts (Theme objects) + types.ts
│  │  └─ <feature>/           # atlas, card-template, home, studio, editor, image-gen, workflow…
│  ├─ lib/
│  │  ├─ utils.ts             # cn()
│  │  ├─ block-tokens.ts      # generation block visual tokens
│  │  ├─ theme/               # ThemeProvider, useTheme, ambient bg, gradientText
│  │  ├─ ai-provider/         # provider abstraction (never call SDKs from components)
│  │  ├─ card-engine/         # slide generation/design/judge pipeline
│  │  └─ atlas-engine/        # document understanding (5-layer)
│  ├─ types/                  # Block, Card/CardTemplate, generation, fxda — DON'T fork these
│  ├─ hooks/  data/
├─ public/                    # static assets, /library/metadata.json
├─ tailwind.config.js  postcss.config.mjs  components.json  next.config.ts
```

**Patterns:**
- **Feature-folder organization** under `components/<feature>/`; shared primitives in `ui/`.
- **Path alias `@/`** → `src/` (`import { cn } from '@/lib/utils'`). Use it, not relative `../../`.
- **Type ownership is split and must not be duplicated** (CLAUDE.md Hard Constraint): `types/index.ts` (`Block`, A4 canvas), `types/card-template.ts` (`Card`/`CardTemplate`, slides), `types/generation.ts` (pipeline v2), `types/template-schema.ts`, `types/fxda.ts` (eSign). When a Figma design needs data, reuse the owning contract.
- **AI/Atlas access only via `lib/` abstractions** — never call `anthropic`/`openai`/Atlas directly from a component.

---

## Quick checklist before writing code from a Figma node

1. **Color** → map to a `globals.css` semantic token (`bg-primary`, `text-muted-foreground`, `border-border`) before using any hex. Slide design? → `themes.ts`.
2. **Component** → reuse `src/components/ui/*` + its CVA variants; override via `className` + `cn()`. Don't hand-roll a button/dialog/select.
3. **Icon** → `lucide-react` named import; custom → `components/icons/` Lucide-shaped SVG.
4. **Spacing/radius** → Tailwind scale + `--radius` (rounded-md/lg, 12px); generated blocks → `p-block-*`. Buttons = rounded rects, not pills.
5. **Image** → plain `<img src="/...">` from `public/`; **no `next/image`**.
6. **Styling** → inline Tailwind utilities; reuse `.glass-*` / `.btn-create` / `.btn-cta-bold` when matching; new global class only if truly reusable.
7. **Client vs server** → add `'use client'` only when stateful/interactive.
8. **Respect CLAUDE.md governance** — UI changes go through the design-review gates; accent = violet, Foxit orange is top-nav-only.
