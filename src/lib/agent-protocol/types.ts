// Agent Protocol — In-house agent-to-agent communication types.
// Agents advertise capabilities, discover each other, and communicate
// through typed interfaces. Based on A2A pattern, no Azure dependency.

export interface AgentCard {
  id: string;
  name: string;
  description: string;
  capabilities: string[];   // what this agent can do
  skills: string[];          // skill presets it uses
  tools: string[];           // MCP tools / APIs it can call
  canApprove: string[];      // what it's authorized to approve
  cannotApprove: string[];   // boundaries
  status: 'available' | 'busy' | 'offline';
}

export interface AgentMessage {
  from: string;          // agent ID
  to: string;            // agent ID
  type: 'request' | 'response' | 'clarification' | 'approval' | 'rejection';
  action: string;        // what to do
  payload: Record<string, unknown>;
  timestamp: string;
  traceId: string;       // links to audit trail
}

export interface AgentResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  confidence?: number;
  reasoning?: string;    // P1: explain, don't just show
}
