# Tech Stack — `foxit-slides`

An AI-assisted slide/deck generation app. This document is the at-a-glance
reference for whoever maintains the project.

> **Note:** This project was extracted from a larger codebase, so the dependency
> list has been trimmed to what `foxit-slides` actually uses.

---

## Language & Runtime

| Tool | Version | Role |
|---|---|---|
| **TypeScript** | 5.x | Language (typed JavaScript) |
| **Node.js** | **20.x** | Runtime — pinned in `package.json` `engines`. Use Node 20; newer versions emit `EBADENGINE` warnings (Foxit SDKs want ≤22). |

## Framework

| Package | Version | Role |
|---|---|---|
| **next** | 16.2.1 | Full-stack React framework — pages, routing, API routes, dev server. **Dev server runs on port `3002`** (`next dev -p 3002`). |
| **react** / **react-dom** | 19.2.4 | UI component library + browser renderer |

## Styling & UI

| Package | Role |
|---|---|
| **tailwindcss** (v4) | Utility-class styling |
| **@tailwindcss/postcss** | Tailwind's PostCSS build (dev) |
| **tw-animate-css** | Ready-made animation utilities for Tailwind |
| **shadcn** | UI component patterns (see `src/components/ui/*`); also imported in CSS via `@import "shadcn/tailwind.css"` |
| **@base-ui/react** | Accessible, unstyled UI primitives (tooltip, dialog, tabs, select) |
| **lucide-react** | Icon set (used across ~64 files) |
| **clsx** + **tailwind-merge** | Conditional / conflict-free class-name helpers (`src/lib/utils.ts`) |
| **class-variance-authority** | Typed component style variants |

## AI / Model Providers

| Package / Var | Role |
|---|---|
| **@anthropic-ai/sdk** | Claude — primary text/generation provider (`ANTHROPIC_API_KEY`) |
| **openai** | OpenAI — image gen (DALL·E 3), vision/VLM judging (`OPENAI_API_KEY`) |
| *(Gemini via REST)* | Google Gemini — vision/design "judge" (`GEMINI_API_KEY`) |
| **zod** | Runtime validation of AI responses & API inputs (used in ~37 files) |

Provider/model selection is configurable via env (`AI_PROVIDER`, `AI_MODEL`,
and per-task model overrides — see `.env.example`).

## Document & Media Engine

| Package | License | Role |
|---|---|---|
| **@foxitsoftware/foxit-pdf-sdk-node** | Commercial | PDF operations (redact, watermark, sign). Needs `FOXIT_SDK_SN` + `FOXIT_SDK_KEY`. |
| **@foxitsoftware/foxit-pdf-conversion-sdk-node** | Commercial | Office ↔ PDF conversion. Needs `FOXIT_CONVERSION_SDK_SN` + `FOXIT_CONVERSION_SDK_KEY`. |
| **puppeteer** | Apache-2.0 | Headless browser — renders cards/slides to images |
| **html-to-image** | MIT | DOM → PNG (slide capture / thumbnails) |
| **opentype.js** | MIT | Font parsing / text-fitting |
| **fast-xml-parser** | MIT | Parse XML (`.pptx`/Office internals) |
| **jszip** | MIT (or GPL-3.0 — elect MIT) | Read zipped Office files |

## Tooling (dev only)

| Package | Role |
|---|---|
| **eslint** + **eslint-config-next** | Linting (`npm run lint`) |
| **@types/node**, **@types/react**, **@types/react-dom** | TypeScript type definitions |

---

## Licensing summary

- **Commercial:** the two Foxit SDKs (require paid license keys).
- **Everything else:** permissive open source (MIT / Apache-2.0 / ISC) — free
  for commercial use. `jszip` is dual MIT/GPL — elect MIT (no copyleft).
- No AGPL/GPL copyleft obligations in the direct dependency list.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server on **http://localhost:3002** |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |

## Environment

All required keys/secrets are documented in [`.env.example`](./.env.example).
Copy it to `.env.local` and fill in values. See the README for setup steps.
