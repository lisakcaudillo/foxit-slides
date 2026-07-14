/**
 * captured-registry.ts — the ONLY id-shaped export the rest of the engine
 * consumes. Split from native-template.ts to break the circular import between
 * structure-fill.ts (needs the id list at init time to widen SKIN_ENUM) and
 * native-template.ts (imports fillStructureSlots at runtime).
 *
 * Editing rule: this file must NEVER import from structure-fill.ts. Keep it
 * dependency-light so it's safe to import from anywhere.
 */

// Registered captured-template ids. Keep in sync with native-template.ts
// REGISTRY. A one-line list is intentional: the actual template data + loader
// live in native-template.ts, this file only carries the id set.
export const CAPTURED_TEMPLATE_IDS = ['compass'] as const;

export type CapturedTemplateId = (typeof CAPTURED_TEMPLATE_IDS)[number];

export function isCapturedTemplateId(id: string): id is CapturedTemplateId {
  return (CAPTURED_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function capturedTemplateIds(): string[] {
  return [...CAPTURED_TEMPLATE_IDS];
}
