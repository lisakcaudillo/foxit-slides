# Template Workflow Manager - AI Agent Instructions

## Project Overview
Next.js 14 (App Router) + TypeScript prototype demonstrating AI-powered document template generation with reusable workflow configurations. Templates are generated in **FXDA format** (Foxit Document Automation) with positioned form fields.

## Architecture & Data Flow

### Core Type System (src/types/)
- **FXDA types** ([src/types/fxda.ts](template-workflow-app/src/types/fxda.ts)): `FXDATemplate`, `FXDAField`, `FXDAPage` - Positioned form fields with x/y coordinates
- **Domain types** ([src/types/index.ts](template-workflow-app/src/types/index.ts)): `Template` (metadata layer), `WorkflowPreset`, `FormField`
- **Key pattern**: Templates are workflow-aware but workflows are stored separately via `workflowPresetId` reference

### Data Layer
- **Mock data source**: [src/data/mockData.ts](template-workflow-app/src/data/mockData.ts) - In-memory store with 4 pre-populated templates and workflow presets
- **No database**: All data resets on restart. New templates created via POST lose persistence.
- **Workflow presets** include signing order (sequential/parallel), party count, approval flags, security levels

### API Routes (REST-style)
- `GET /api/templates` - Returns all mock templates
- `POST /api/templates` - Creates template (non-persistent)
- `GET /api/templates/[id]` - Returns single template
- `POST /api/ai/generate` - **AI simulation** (2s delay, rule-based generation)
- `GET /api/workflows` - Returns workflow presets

### AI Generation Pattern ([route.ts](template-workflow-app/src/app/api/ai/generate/route.ts))
Mock AI uses prompt parsing functions:
- `extractTemplateName()` - Keyword matching (nda → "Non-Disclosure Agreement")
- `extractCategory()` - Maps keywords to Legal/HR/Procurement/General
- `generatePages()` - Creates single FXDA page with text content
- `generateFXDAFields()` - Positioned form fields based on template type
- `suggestWorkflow()` - Recommends workflow preset ID from prompt keywords

**Pattern to follow**: When extending AI, maintain rule-based fallbacks for each extraction function.

## Development Workflows

### Local Development
```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build (validates TypeScript)
npm run lint         # ESLint check
```

### Key Pages & Routes
- `/` - Template library ([page.tsx](template-workflow-app/src/app/page.tsx)) - Browse/search templates
- `/templates/create?method=ai` - AI generation flow ([create/page.tsx](template-workflow-app/src/app/templates/create/page.tsx))
- `/templates/[id]` - Template detail with tabs (Overview/Workflow/Fields) ([templates/[id]/page.tsx](template-workflow-app/src/app/templates/[id]/page.tsx))

### Component Patterns
- **Client components**: All interactive pages use `'use client'` directive
- **State management**: React `useState` hooks (no global state)
- **Navigation**: Next.js `useRouter`, `useSearchParams` for URL state
- **Icons**: Lucide React (`import { IconName } from 'lucide-react'`)

### Styling Conventions
- **Tailwind CSS**: Utility-first, no custom CSS modules
- **Color system**: `primary-` prefix for brand colors (blue shades)
- **Layout**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` container pattern
- **Cards**: `bg-white border rounded-xl shadow-sm hover:shadow-lg transition-all`

## Project-Specific Patterns

### Multi-Step Form Flow (Create Template)
Uses step state machine: `'method' → 'generate' → 'preview' → 'fields-option' → 'workflow' → 'complete'`
- Step changes controlled by `setStep()` calls
- URL params skip method step: `?method=ai` jumps to 'generate'
- AI-generated templates store both with-fields and without-fields versions

### FXDA Field Positioning
Form fields use absolute positioning:
```typescript
FXDAField {
  x: 50, y: 350,        // Position from top-left
  width: 200, height: 30,
  page: 1,               // 1-indexed
  party?: 1              // For multi-party workflows
}
```

### Workflow Badge Display
Template cards show badges extracted from workflow:
- Party count: "2 Parties", "3 Parties"
- Signing order: "Sequential" / "Parallel"
- Approval: "Requires Approval" flag

## Critical Constraints
- **Next.js 15+, React 19**: Use latest APIs (no `getServerSideProps`)
- **TypeScript strict mode**: All types must be explicitly defined
- **No database**: Changes are ephemeral, document this in any persistence features
- **FXDA format only**: All template generation outputs must use FXDATemplate structure

## Demo Script Reference
See [DEMO_GUIDE.md](template-workflow-app/DEMO_GUIDE.md) for complete feature walkthrough - essential for understanding user journey and feature completeness.
