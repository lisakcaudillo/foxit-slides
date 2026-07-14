// Generation Pipeline Types — PRD v2 Phase 1
// These types define the multi-stage generation contract.
// for full spec.

import { z } from 'zod';

// ── Stage 1: Input Classification ──────────────────────────────────────────

export const InputTypeSchema = z.enum([
  'topic',           // bare topic prompt ("NDA for two companies")
  'notes',           // rough unstructured notes
  'outline',         // structured outline with sections
  'paste',           // pasted prose from another source
  'import',          // imported source document (PDF/Word)
  'template-first',  // user selected a template before providing content
]);

export type InputType = z.infer<typeof InputTypeSchema>;

export const InputClassificationSchema = z.object({
  inputType: InputTypeSchema,
  confidence: z.number().min(0).max(100),
  hasStructure: z.boolean(),
  estimatedDepth: z.enum(['shallow', 'medium', 'deep']),
  containsSourceMaterial: z.boolean(),
});

export type InputClassification = z.infer<typeof InputClassificationSchema>;

// ── Stage 3: Intent Normalization ──────────────────────────────────────────

export const ArtifactTypeSchema = z.enum([
  'agreement',       // contracts, NDAs, legal docs
  'proposal',        // business proposals
  'brief',           // executive briefs, one-pagers
  'report',          // reports, summaries
  'presentation',    // slide-style output
  'letter',          // formal letters
  'policy',          // internal policies, handbooks
  'form',            // fillable forms, applications
]);

export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const NormalizedIntentSchema = z.object({
  artifactType: ArtifactTypeSchema,
  audience: z.string(),
  communicationGoal: z.string(),
  tone: z.enum(['formal', 'professional', 'conversational', 'technical', 'persuasive']),
  desiredDepth: z.enum(['concise', 'standard', 'detailed', 'comprehensive']),
  sourceConfidence: z.enum(['high', 'medium', 'low', 'none']),
  needsVisuals: z.boolean(),
  narrativePattern: z.enum([
    'linear',          // sequential flow
    'problem-solution', // problem → analysis → solution
    'compare-contrast', // side-by-side evaluation
    'executive-summary', // conclusion-first then detail
    'procedural',       // step-by-step process
  ]),
});

export type NormalizedIntent = z.infer<typeof NormalizedIntentSchema>;

// ── Stage 4: Content Blueprint ─────────────────────────────────────────────

export const BlueprintBlockTypeSchema = z.enum([
  'hero',
  'heading',
  'paragraph',
  'bullets',
  'clause',
  'definition',
  'summary',
  'cta',
  'signature-block',
  'list',
  'table',
  'data',
  // Phase 2 block types (defined now, generated later)
  'process',
  'timeline',
  'comparison',
  'stats',
  'quote',
  'callout',
  'evidence-cluster',
]);

export type BlueprintBlockType = z.infer<typeof BlueprintBlockTypeSchema>;

export const BlueprintSectionSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  density: z.enum(['low', 'medium', 'high']),
  preferredBlockTypes: z.array(BlueprintBlockTypeSchema),
  estimatedWordCount: z.number().optional(),
});

export type BlueprintSection = z.infer<typeof BlueprintSectionSchema>;

export const ContentBlueprintSchema = z.object({
  titleDirection: z.string(),
  sections: z.array(BlueprintSectionSchema),
  estimatedTotalLength: z.enum(['short', 'medium', 'long']),
  suggestedPageCount: z.number(),
});

export type ContentBlueprint = z.infer<typeof ContentBlueprintSchema>;

// ── GenerationSpec (v1) — the pipeline contract ────────────────────────────

export const GenerationSpecSchema = z.object({
  // Raw inputs
  rawPrompt: z.string(),
  clarifiedPrompt: z.string().optional(),

  // Pipeline outputs
  inputClassification: InputClassificationSchema,
  intent: NormalizedIntentSchema,
  blueprint: ContentBlueprintSchema,

  // User overrides (optional — from UI controls)
  templateId: z.string().optional(),
  templateMode: z.enum(['auto', 'template-first', 'none']).default('auto'),
  visualPolicy: z.enum(['minimal', 'balanced', 'rich']).default('balanced'),
  factualGroundingPolicy: z.enum(['source-only', 'infer-safe', 'creative']).default('source-only'),
});

export type GenerationSpec = z.infer<typeof GenerationSpecSchema>;

// ── Structured Generation Output (FR7) ─────────────────────────────────────

export const GeneratedBlockSchema = z.object({
  blockType: BlueprintBlockTypeSchema,
  content: z.union([z.string(), z.array(z.string())]),
  layoutHint: z.string().optional(),
  visualHint: z.string().optional(),
});

export type GeneratedBlock = z.infer<typeof GeneratedBlockSchema>;

export const GeneratedSectionSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  blocks: z.array(GeneratedBlockSchema),
});

export type GeneratedSection = z.infer<typeof GeneratedSectionSchema>;

export const StructuredGenerationOutputSchema = z.object({
  documentTitle: z.string(),
  artifactMetadata: z.object({
    artifactType: ArtifactTypeSchema,
    audience: z.string(),
    tone: z.string(),
  }),
  sections: z.array(GeneratedSectionSchema),
});

export type StructuredGenerationOutput = z.infer<typeof StructuredGenerationOutputSchema>;

// ── Source-Grounded Blueprint (Phase E) ────────────────────────────────────

export const ClaimTypeSchema = z.enum(['verbatim', 'paraphrase', 'derived']);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const SourceGroundedSlideSchema = z.object({
  title: z.string(),
  /** One-sentence description of what this slide should cover. */
  contentBrief: z.string(),
  /** 1-indexed page numbers in the source this slide draws from. */
  sourcePages: z.array(z.number().int().positive()),
  /** Optional section/heading reference (e.g., "§3.2 Termination"). */
  sourceSection: z.string().optional(),
  claimType: ClaimTypeSchema,
  /** Optional block-type hints for the card engine (heading, paragraph, bullet-list, callout, smart-layout, image). */
  suggestedBlocks: z.array(z.string()).optional(),
});

export type SourceGroundedSlide = z.infer<typeof SourceGroundedSlideSchema>;

export const SourceGroundedBlueprintSchema = z.object({
  /** References the SourceDocument.id in the deck-level sources registry. */
  sourceDocId: z.string(),
  deckTitle: z.string(),
  slides: z.array(SourceGroundedSlideSchema),
});

export type SourceGroundedBlueprint = z.infer<typeof SourceGroundedBlueprintSchema>;

// ── Pipeline Stage Logging ─────────────────────────────────────────────────

export interface PipelineLog {
  timestamp: string;
  rawPrompt: string;
  inputClassification: InputClassification | null;
  clarifiedPrompt: string | null;
  intent: NormalizedIntent | null;
  blueprint: ContentBlueprint | null;
  templateSelection: string | null;
  structuredOutput: StructuredGenerationOutput | null;
  durationMs: number;
  error: string | null;
}
