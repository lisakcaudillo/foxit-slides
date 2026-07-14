// Audit Trail — Dual trail system for document lifecycle + signing ceremony
// Implements P4 (AI Provenance per block) from CHI '26 research.
// Required for EU AI Act Art. 50 II compliance (August 2026).

import type {
  DocumentAuditTrail,
  LifecycleEvent,
  LifecycleEventType,
  SigningEvent,
  SigningEventType,
  AuditAgent,
  BlockProvenance,
  AgentTrace,
} from '@/types/audit';
import { AuditAgentSchema } from '@/types/audit';

// ── Trail Store ────────────────────────────────────────────────────────────

const TRAIL_STORAGE_PREFIX = 'compose:audit-trail:';

const trails = new Map<string, DocumentAuditTrail>();

/** Persist a trail to localStorage */
function persistTrail(trail: DocumentAuditTrail): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TRAIL_STORAGE_PREFIX + trail.documentId, JSON.stringify(trail));
  } catch { /* storage full or unavailable — best effort */ }
}

/** Load a trail from localStorage */
function loadPersistedTrail(documentId: string): DocumentAuditTrail | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(TRAIL_STORAGE_PREFIX + documentId);
    if (!stored) return null;
    return JSON.parse(stored) as DocumentAuditTrail;
  } catch {
    return null;
  }
}

/** Get or create an audit trail for a document */
export function getTrail(documentId: string, documentName?: string): DocumentAuditTrail {
  const existing = trails.get(documentId);
  if (existing) return existing;

  // Try to restore from localStorage
  const persisted = loadPersistedTrail(documentId);
  if (persisted) {
    trails.set(documentId, persisted);
    return persisted;
  }

  const trail: DocumentAuditTrail = {
    documentId,
    documentName: documentName ?? 'Untitled',
    createdAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    lifecycle: [],
    signing: [],
  };
  trails.set(documentId, trail);
  persistTrail(trail);
  return trail;
}

// ── Trail 1: Lifecycle Event Recording ─────────────────────────────────────

let eventCounter = 0;

interface RecordLifecycleParams {
  documentId: string;
  type: LifecycleEventType;
  agent: AuditAgent;
  userId?: string;
  userEmail?: string;
  blockId?: string;
  blockType?: string;
  fieldId?: string;
  sectionName?: string;
  confidence?: number;
  source?: string;
  modelId?: string;
  before?: string;
  after?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export function recordLifecycleEvent(params: RecordLifecycleParams): LifecycleEvent {
  const trail = getTrail(params.documentId);
  const event: LifecycleEvent = {
    id: `le-${++eventCounter}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: params.type,
    agent: params.agent,
    userId: params.userId,
    userEmail: params.userEmail,
    blockId: params.blockId,
    blockType: params.blockType,
    fieldId: params.fieldId,
    sectionName: params.sectionName,
    confidence: params.confidence,
    source: params.source,
    modelId: params.modelId,
    before: params.before,
    after: params.after,
    reason: params.reason,
    metadata: params.metadata,
  };

  trail.lifecycle.push(event);
  trail.lastModifiedAt = event.timestamp;
  persistTrail(trail);
  return event;
}

// ── Trail 2: Signing Ceremony Recording ────────────────────────────────────

interface RecordSigningParams {
  documentId: string;
  type: SigningEventType;
  envelopeId: string;
  partyName?: string;
  partyEmail?: string;
  partyRole?: string;
  sequence?: number;
  ipAddress?: string;
  certificateHash?: string;
  signatureMethod?: string;
  documentHash?: string;
  metadata?: Record<string, unknown>;
}

export function recordSigningEvent(params: RecordSigningParams): SigningEvent {
  const trail = getTrail(params.documentId);
  const event: SigningEvent = {
    id: `se-${++eventCounter}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: params.type,
    envelopeId: params.envelopeId,
    partyName: params.partyName,
    partyEmail: params.partyEmail,
    partyRole: params.partyRole,
    sequence: params.sequence,
    ipAddress: params.ipAddress,
    certificateHash: params.certificateHash,
    signatureMethod: params.signatureMethod,
    documentHash: params.documentHash,
    metadata: params.metadata,
  };

  trail.signing.push(event);
  trail.lastModifiedAt = event.timestamp;
  persistTrail(trail);
  return event;
}

// ── Per-Block Provenance (P4) ──────────────────────────────────────────────

/** Extract provenance for a specific block from the audit trail */
export function getBlockProvenance(
  documentId: string,
  blockId: string,
): BlockProvenance | null {
  const trail = trails.get(documentId);
  if (!trail) return null;

  const blockEvents = trail.lifecycle.filter((e) => e.blockId === blockId);
  if (blockEvents.length === 0) return null;

  const creation = blockEvents[0];
  return {
    blockId,
    createdBy: creation.agent,
    createdAt: creation.timestamp,
    confidence: creation.confidence ?? 0,
    source: creation.source ?? 'unknown',
    modelId: creation.modelId,
    editHistory: blockEvents,
  };
}

// ── Unified Trail Export ───────────────────────────────────────────────────

/** Export the full audit trail as a formatted text report for PDF attachment */
export function exportTrailAsText(documentId: string): string {
  const trail = trails.get(documentId);
  if (!trail) return 'No audit trail found.';

  const lines: string[] = [];
  lines.push(`DOCUMENT AUDIT TRAIL — ${trail.documentName}`);
  lines.push('═'.repeat(50));
  lines.push('');

  // Trail 1: Lifecycle
  if (trail.lifecycle.length > 0) {
    lines.push('CREATION & EDITING');
    lines.push('─'.repeat(30));
    for (const event of trail.lifecycle) {
      const time = new Date(event.timestamp).toLocaleString();
      const agentLabel = event.agent === 'user'
        ? (event.userEmail ?? 'User')
        : event.agent;
      const confidence = event.confidence != null ? ` (confidence: ${event.confidence}%)` : '';
      const detail = event.reason ?? event.after ?? '';
      lines.push(`${time}  ${event.type} — ${agentLabel}${confidence}${detail ? ': ' + truncate(detail, 80) : ''}`);
    }
    lines.push('');
  }

  // Trail 2: Signing
  if (trail.signing.length > 0) {
    lines.push('SIGNING CEREMONY');
    lines.push('─'.repeat(30));
    for (const event of trail.signing) {
      const time = new Date(event.timestamp).toLocaleString();
      const party = event.partyName
        ? `${event.partyName} (${event.partyEmail})`
        : event.envelopeId;
      const cert = event.certificateHash ? ` [cert: ${event.certificateHash.slice(0, 12)}...]` : '';
      lines.push(`${time}  ${event.type} — ${party}${cert}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(50));
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total lifecycle events: ${trail.lifecycle.length}`);
  lines.push(`Total signing events: ${trail.signing.length}`);

  return lines.join('\n');
}

/** Export the full audit trail as structured JSON (machine-readable per P4) */
export function exportTrailAsJSON(documentId: string): DocumentAuditTrail | null {
  return trails.get(documentId) ?? null;
}

// ── Agent Trace System (OpenTelemetry-style, in-house) ────────────────────

const TRACE_STORAGE_PREFIX = 'compose:traces:';

const traceStore = new Map<string, AgentTrace[]>();

let traceCounter = 0;

/** Safely resolve an agentId string to an AuditAgent enum value */
function resolveAuditAgent(agentId: string): AuditAgent {
  const parsed = AuditAgentSchema.safeParse(agentId);
  return parsed.success ? parsed.data : 'user';
}

/** Persist traces for a document to localStorage */
function persistTraces(documentId: string, traces: AgentTrace[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TRACE_STORAGE_PREFIX + documentId, JSON.stringify(traces));
  } catch { /* storage full or unavailable — best effort */ }
}

/** Load traces from localStorage */
function loadPersistedTraces(documentId: string): AgentTrace[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(TRACE_STORAGE_PREFIX + documentId);
    if (!stored) return null;
    return JSON.parse(stored) as AgentTrace[];
  } catch {
    return null;
  }
}

/** Get or initialize trace list for a document */
function getOrInitTraces(documentId: string): AgentTrace[] {
  const existing = traceStore.get(documentId);
  if (existing) return existing;

  const persisted = loadPersistedTraces(documentId);
  if (persisted) {
    traceStore.set(documentId, persisted);
    return persisted;
  }

  const traces: AgentTrace[] = [];
  traceStore.set(documentId, traces);
  return traces;
}

/** Start a trace — returns traceId */
export function startTrace(params: {
  documentId: string;
  agentId: string;
  agentName: string;
  operation: string;
  input?: string;
  parentTraceId?: string;
}): string {
  const traceId = `tr-${++traceCounter}-${Date.now()}`;
  const traces = getOrInitTraces(params.documentId);

  const trace: AgentTrace = {
    traceId,
    parentTraceId: params.parentTraceId,
    agentId: params.agentId,
    agentName: params.agentName,
    operation: params.operation,
    input: params.input,
    durationMs: 0,
    status: 'started',
    timestamp: new Date().toISOString(),
  };

  traces.push(trace);
  persistTraces(params.documentId, traces);

  // Also record as a lifecycle event for unified trail
  recordLifecycleEvent({
    documentId: params.documentId,
    type: 'agent-task-started',
    agent: resolveAuditAgent(params.agentId),
    reason: `${params.agentName}: ${params.operation}`,
    metadata: { traceId, parentTraceId: params.parentTraceId },
  });

  return traceId;
}

/** Complete a trace */
export function completeTrace(
  traceId: string,
  params: { output?: string; durationMs: number; confidence?: number },
): void {
  for (const [documentId, traces] of traceStore.entries()) {
    const trace = traces.find((t) => t.traceId === traceId);
    if (trace) {
      trace.status = 'completed';
      trace.output = params.output;
      trace.durationMs = params.durationMs;
      trace.confidence = params.confidence;
      persistTraces(documentId, traces);

      recordLifecycleEvent({
        documentId,
        type: 'agent-task-completed',
        agent: resolveAuditAgent(trace.agentId),
        confidence: params.confidence,
        reason: `${trace.agentName}: ${trace.operation} (${params.durationMs}ms)`,
        metadata: { traceId, output: params.output },
      });
      return;
    }
  }
}

/** Fail a trace */
export function failTrace(
  traceId: string,
  params: { error: string; durationMs: number },
): void {
  for (const [documentId, traces] of traceStore.entries()) {
    const trace = traces.find((t) => t.traceId === traceId);
    if (trace) {
      trace.status = 'failed';
      trace.output = params.error;
      trace.durationMs = params.durationMs;
      persistTraces(documentId, traces);

      recordLifecycleEvent({
        documentId,
        type: 'agent-task-failed',
        agent: resolveAuditAgent(trace.agentId),
        reason: `${trace.agentName}: ${trace.operation} FAILED — ${params.error} (${params.durationMs}ms)`,
        metadata: { traceId, error: params.error },
      });
      return;
    }
  }
}

/** Get all traces for a document (flat list) */
export function getTraces(documentId: string): AgentTrace[] {
  return getOrInitTraces(documentId);
}

/** Get trace tree (nested) for a document — assembles parent/child relationships */
export function getTraceTree(documentId: string): AgentTrace[] {
  const flat = getOrInitTraces(documentId);
  const byId = new Map<string, AgentTrace>();
  const roots: AgentTrace[] = [];

  // Index all traces and create copies with empty children arrays
  for (const trace of flat) {
    byId.set(trace.traceId, { ...trace, children: [] });
  }

  // Build tree
  for (const trace of byId.values()) {
    if (trace.parentTraceId) {
      const parent = byId.get(trace.parentTraceId);
      if (parent) {
        parent.children!.push(trace);
      } else {
        // Parent not found (maybe in a different document) — treat as root
        roots.push(trace);
      }
    } else {
      roots.push(trace);
    }
  }

  return roots;
}

/** Export traces as formatted text (for the AI activity panel) */
export function exportTracesAsText(documentId: string): string {
  const tree = getTraceTree(documentId);
  if (tree.length === 0) return 'No agent traces found.';

  const lines: string[] = [];
  lines.push('AGENT OPERATION TRACES');
  lines.push('═'.repeat(50));
  lines.push('');

  function renderTrace(trace: AgentTrace, depth: number): void {
    const indent = '  '.repeat(depth);
    const time = new Date(trace.timestamp).toLocaleString();
    const statusIcon = trace.status === 'completed' ? '[OK]'
      : trace.status === 'failed' ? '[FAIL]'
      : '[...]';
    const confidence = trace.confidence != null ? ` (confidence: ${trace.confidence}%)` : '';
    const duration = trace.durationMs > 0 ? ` ${trace.durationMs}ms` : '';

    lines.push(`${indent}${statusIcon} ${time}  ${trace.agentName} > ${trace.operation}${duration}${confidence}`);

    if (trace.input) {
      lines.push(`${indent}  input: ${truncate(trace.input, 70)}`);
    }
    if (trace.output) {
      lines.push(`${indent}  output: ${truncate(trace.output, 70)}`);
    }

    if (trace.children) {
      for (const child of trace.children) {
        renderTrace(child, depth + 1);
      }
    }
  }

  for (const trace of tree) {
    renderTrace(trace, 0);
    lines.push('');
  }

  lines.push('═'.repeat(50));
  const flat = getOrInitTraces(documentId);
  const completed = flat.filter((t) => t.status === 'completed').length;
  const failed = flat.filter((t) => t.status === 'failed').length;
  const started = flat.filter((t) => t.status === 'started').length;
  lines.push(`Total traces: ${flat.length} (completed: ${completed}, failed: ${failed}, in-progress: ${started})`);
  lines.push(`Generated: ${new Date().toISOString()}`);

  return lines.join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

/** Clear trail for a document (use with caution — audit data is valuable) */
export function clearTrail(documentId: string): void {
  trails.delete(documentId);
}
