// Audit Trail Types — Dual Trail System
// Trail 1: Document Lifecycle (creation → editing → export)
// Trail 2: Signing Ceremony (sent → viewed → signed → complete)
// Both merge into one unified trail for export.

import { z } from 'zod';

// ── Trail 1: Document Lifecycle Events ─────────────────────────────────────

export const AuditAgentSchema = z.enum([
  'user',                // Human action
  'atlas-extraction',    // Atlas document extraction
  'atlas-comparison',    // Atlas semantic diff
  'atlas-compliance',    // Atlas PII/compliance scan
  'pipeline-classify',   // v2 pipeline: input classification
  'pipeline-normalize',  // v2 pipeline: intent normalization
  'pipeline-blueprint',  // v2 pipeline: content blueprint
  'pipeline-generate',   // v2 pipeline: structured generation
  'pipeline-polish',     // v2 pipeline: polish pass
  'claude-rewrite',      // Claude block rewrite
  'claude-infer-fields', // Claude field inference
  'claude-metadata',     // Claude metadata generation
  'foxit-sdk',           // Foxit SDK operation (redact, watermark, etc.)
]);

export type AuditAgent = z.infer<typeof AuditAgentSchema>;

export const LifecycleEventTypeSchema = z.enum([
  // Creation
  'document-created',
  'block-generated',
  'template-applied',

  // AI Actions
  'block-classified',
  'block-rewritten',
  'field-inferred',
  'metadata-generated',
  'compliance-scanned',
  'factual-safety-checked',

  // User Edits
  'block-edited',
  'block-added',
  'block-deleted',
  'block-reordered',
  'field-added',
  'field-removed',
  'field-modified',
  'party-added',
  'party-removed',

  // Foxit SDK Actions
  'content-redacted',
  'watermark-applied',
  'digital-signature-applied',
  'document-protected',

  // Export
  'exported-pdf',

  // Pipeline
  'pipeline-started',
  'pipeline-completed',
  'pipeline-fallback',

  // Agent Operations
  'agent-task-started',
  'agent-task-completed',
  'agent-task-failed',
  'agent-message-sent',
  'agent-message-received',
  'agent-clarification-requested',
  'agent-approval-granted',
  'agent-approval-denied',

  // Pipeline Stage Tracing
  'pipeline-stage-started',
  'pipeline-stage-completed',

  // Evaluation
  'evaluation-run',
  'evaluation-passed',
  'evaluation-failed',
]);

export type LifecycleEventType = z.infer<typeof LifecycleEventTypeSchema>;

export const LifecycleEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: LifecycleEventTypeSchema,
  agent: AuditAgentSchema,
  userId: z.string().optional(),
  userEmail: z.string().optional(),

  // What was affected
  blockId: z.string().optional(),
  blockType: z.string().optional(),
  fieldId: z.string().optional(),
  sectionName: z.string().optional(),

  // AI provenance (P4 — required per EU AI Act Art. 50 II)
  confidence: z.number().min(0).max(100).optional(),
  source: z.string().optional(),
  modelId: z.string().optional(),

  // Change details
  before: z.string().optional(),
  after: z.string().optional(),
  reason: z.string().optional(),

  // Metadata
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;

// ── Trail 2: Signing Ceremony Events ───────────────────────────────────────

export const SigningEventTypeSchema = z.enum([
  'envelope-created',
  'envelope-sent',
  'party-viewed',
  'party-signed',
  'party-declined',
  'party-reassigned',
  'envelope-voided',
  'envelope-completed',
  'document-downloaded',
]);

export type SigningEventType = z.infer<typeof SigningEventTypeSchema>;

export const SigningEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  type: SigningEventTypeSchema,
  envelopeId: z.string(),

  // Party info
  partyName: z.string().optional(),
  partyEmail: z.string().optional(),
  partyRole: z.string().optional(),
  sequence: z.number().optional(),

  // Signing details
  ipAddress: z.string().optional(),
  certificateHash: z.string().optional(),
  signatureMethod: z.string().optional(),

  // Document integrity
  documentHash: z.string().optional(),

  // Metadata
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SigningEvent = z.infer<typeof SigningEventSchema>;

// ── Unified Audit Trail ────────────────────────────────────────────────────

export interface DocumentAuditTrail {
  documentId: string;
  documentName: string;
  createdAt: string;
  lastModifiedAt: string;

  /** Trail 1: Document lifecycle events (creation → editing → export) */
  lifecycle: LifecycleEvent[];

  /** Trail 2: Signing ceremony events (sent → signed → complete) */
  signing: SigningEvent[];
}

// ── Per-Block Provenance (P4 — EU AI Act Art. 50 II) ───────────────────────

// ── Agent Trace (OpenTelemetry-style operation tracing) ───────────────────

export interface AgentTrace {
  traceId: string;           // unique trace ID for this operation chain
  parentTraceId?: string;    // if this was triggered by another trace
  agentId: string;
  agentName: string;
  operation: string;         // what was requested
  input?: string;            // summarized input (not full content — privacy)
  output?: string;           // summarized output
  durationMs: number;
  confidence?: number;
  status: 'started' | 'completed' | 'failed';
  timestamp: string;
  children?: AgentTrace[];   // nested sub-operations
}

export interface BlockProvenance {
  blockId: string;
  createdBy: AuditAgent;
  createdAt: string;
  confidence: number;
  source: string;
  modelId?: string;
  editHistory: LifecycleEvent[];
}
