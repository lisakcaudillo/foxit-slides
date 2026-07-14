// Template Builder Schema — PRD v2 Section 12
// Templates are active orchestration layers, not passive style sheets.
// Designer Agent owns visual tokens; this file defines structural schemas.

import { z } from 'zod';
import type { BlueprintBlockType } from './generation';

// ── Template Section Definition ────────────────────────────────────────────

export const TemplateSectionDefSchema = z.object({
  name: z.string(),
  purpose: z.string(),
  required: z.boolean(),
  density: z.enum(['low', 'medium', 'high']),
  allowedBlockTypes: z.array(z.string()),
  minBlocks: z.number().optional(),
  maxBlocks: z.number().optional(),
  fallbackBlockType: z.string().optional(),
});

export type TemplateSectionDef = z.infer<typeof TemplateSectionDefSchema>;

// ── Template Schema (Section 12.1) ─────────────────────────────────────────

export const TemplateSchemaDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),

  // What artifact types this template supports
  intendedArtifactTypes: z.array(z.string()),

  // Template category for filtering (e.g., 'reports', 'legal', 'business')
  category: z.string().optional(),

  // Section definitions — order matters
  sections: z.array(TemplateSectionDefSchema),

  // Narrative arc guidance
  narrativeArc: z.enum([
    'linear',
    'problem-solution',
    'compare-contrast',
    'executive-summary',
    'procedural',
  ]),

  // Density constraints (Section 12.1)
  densityRules: z.object({
    maxConsecutiveHighDensity: z.number().default(2),
    minLowDensityPerNSections: z.object({
      count: z.number(),
      perSections: z.number(),
    }).default({ count: 1, perSections: 3 }),
    maxBulletsPerBlock: z.number().default(6),
    maxWordsPerBullet: z.number().default(15),
  }),

  // Layout preferences
  layoutPreferences: z.object({
    defaultLayout: z.string().default('full-width'),
    preferredLayouts: z.array(z.string()).default([]),
  }),

  // Visual style rules
  visualStyle: z.object({
    accentColor: z.string().default('violet'),
    blockSpacing: z.enum(['compact', 'balanced', 'spacious']).default('balanced'),
  }),

  // Default Skill applied to the Generate stage when this template seeds
  // a deck. Drives prose voice (legal / executive / persuasive / etc.) via
  // the document-skills.ts voice fragments. User can override via the Voice
  // picker in the Customize popover. null = no voice bias.
  defaultSkillId: z.enum([
    'legal', 'executive', 'technical', 'persuasive', 'simple', 'hr',
    'research', 'government', 'educational', 'financial',
  ]).nullable().optional(),
});

export type TemplateSchemaDef = z.infer<typeof TemplateSchemaDefSchema>;

// ── Template intelligence (Section 12.2) ───────────────────────────────────

export interface TemplateConstraints {
  /** Sections the template requires — generation must include these */
  requiredSections: string[];
  /** Sections the template supports but doesn't require */
  optionalSections: string[];
  /** Block types allowed across the template */
  allowedBlockTypes: BlueprintBlockType[];
  /** Maximum total sections */
  maxSections: number;
  /** Density profile: maps section names to density targets */
  densityProfile: Record<string, 'low' | 'medium' | 'high'>;
}

/** Extract constraints from a template schema for pipeline use */
export function extractConstraints(schema: TemplateSchemaDef): TemplateConstraints {
  const required = schema.sections.filter((s) => s.required).map((s) => s.name);
  const optional = schema.sections.filter((s) => !s.required).map((s) => s.name);
  const blockTypes = new Set<string>();
  for (const section of schema.sections) {
    for (const bt of section.allowedBlockTypes) {
      blockTypes.add(bt);
    }
  }
  const densityProfile: Record<string, 'low' | 'medium' | 'high'> = {};
  for (const section of schema.sections) {
    densityProfile[section.name] = section.density;
  }

  return {
    requiredSections: required,
    optionalSections: optional,
    allowedBlockTypes: Array.from(blockTypes) as BlueprintBlockType[],
    maxSections: schema.sections.length,
    densityProfile,
  };
}
