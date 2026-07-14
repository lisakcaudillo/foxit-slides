// Agent Router — Routes messages between agents.
// Handles: find capable agent → check availability → check authorization → log → respond.

import type { AgentCard, AgentMessage, AgentResponse } from './types';
import { getAgent, findAgentsByCapability, updateAgentStatus } from './registry';

// ── Message log (audit trail integration point) ───────────────────────────

interface MessageLogEntry {
  message: AgentMessage;
  response: AgentResponse;
  resolvedAgentId: string;
  durationMs: number;
}

const messageLog: MessageLogEntry[] = [];

/** Get the full message log for audit/debugging. */
export function getMessageLog(): readonly MessageLogEntry[] {
  return messageLog;
}

// ── Agent action handlers ─────────────────────────────────────────────────
// Extensible registry of handlers keyed by action name.

type ActionHandler = (
  agent: AgentCard,
  message: AgentMessage,
) => Promise<AgentResponse> | AgentResponse;

const handlers = new Map<string, ActionHandler>();

/** Register a handler for a specific action. */
export function registerHandler(action: string, handler: ActionHandler): void {
  handlers.set(action, handler);
}

// ── Core routing ──────────────────────────────────────────────────────────

/**
 * Route a message to the target agent (or discover one by capability).
 * Steps:
 *  1. Resolve target agent (by ID or by capability lookup)
 *  2. Check agent is available
 *  3. Check agent is authorized for the requested action
 *  4. Execute the handler (if registered) or return a default ack
 *  5. Log the interaction
 */
export async function routeMessage(message: AgentMessage): Promise<AgentResponse> {
  const start = Date.now();

  // 1. Resolve target agent
  let target: AgentCard | undefined | null;
  if (message.to) {
    target = getAgent(message.to);
  }
  if (!target) {
    target = findBestAgent(message.action);
  }

  if (!target) {
    const response: AgentResponse = {
      success: false,
      error: `No agent found capable of action: ${message.action}`,
    };
    logEntry(message, response, 'none', start);
    return response;
  }

  // 2. Check availability
  if (target.status !== 'available') {
    const response: AgentResponse = {
      success: false,
      error: `Agent ${target.name} is currently ${target.status}`,
    };
    logEntry(message, response, target.id, start);
    return response;
  }

  // 3. Check authorization — the action must be in the agent's capabilities
  //    or canApprove list (for approval-type messages)
  if (message.type === 'approval') {
    const canApprove = target.canApprove.some(
      (a) => a.toLowerCase() === message.action.toLowerCase(),
    );
    if (!canApprove) {
      const response: AgentResponse = {
        success: false,
        error: `Agent ${target.name} is not authorized to approve: ${message.action}`,
        reasoning: `Authorized approvals: ${target.canApprove.join(', ')}. Boundary: ${target.cannotApprove.join(', ')}.`,
      };
      logEntry(message, response, target.id, start);
      return response;
    }
  }

  // 4. Execute
  updateAgentStatus(target.id, 'busy');
  let response: AgentResponse;
  try {
    const handler = handlers.get(message.action);
    if (handler) {
      response = await handler(target, message);
    } else {
      // Default acknowledgment when no specific handler is registered
      response = {
        success: true,
        data: { agentId: target.id, action: message.action, status: 'acknowledged' },
        confidence: 1,
        reasoning: `Agent ${target.name} accepted action "${message.action}" — no dedicated handler registered.`,
      };
    }
  } catch (err) {
    response = {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown handler error',
    };
  } finally {
    updateAgentStatus(target.id, 'available');
  }

  // 5. Log
  logEntry(message, response, target.id, start);
  return response;
}

/**
 * Find the single best agent for a capability / action.
 * Prefers agents that are available. Returns null if none found.
 */
export function findBestAgent(
  capability: string,
  context?: Record<string, unknown>,
): AgentCard | null {
  const candidates = findAgentsByCapability(capability);
  if (candidates.length === 0) return null;

  // Prefer available agents
  const available = candidates.filter((a) => a.status === 'available');
  const pool = available.length > 0 ? available : candidates;

  // If context includes a preferred skill, match it
  if (context?.preferredSkill && typeof context.preferredSkill === 'string') {
    const skillMatch = pool.find((a) =>
      a.skills.includes(context.preferredSkill as string),
    );
    if (skillMatch) return skillMatch;
  }

  // Return first available (deterministic ordering from registry)
  return pool[0] ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function logEntry(
  message: AgentMessage,
  response: AgentResponse,
  resolvedAgentId: string,
  startTime: number,
): void {
  messageLog.push({
    message,
    response,
    resolvedAgentId,
    durationMs: Date.now() - startTime,
  });
}

/** Create a well-formed AgentMessage. Generates timestamp and traceId. */
export function createMessage(
  params: Omit<AgentMessage, 'timestamp' | 'traceId'> & { traceId?: string },
): AgentMessage {
  return {
    ...params,
    timestamp: new Date().toISOString(),
    traceId: params.traceId ?? `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
