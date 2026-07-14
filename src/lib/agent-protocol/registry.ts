// Agent Registry — agents register capabilities, others discover them.
// Based on A2A pattern but in-house, no Azure dependency.

import type { AgentCard } from './types';

// ── In-memory registry ────────────────────────────────────────────────────

const agents = new Map<string, AgentCard>();

// ── Registry API ──────────────────────────────────────────────────────────

/** Register an agent card. Overwrites if ID already exists. */
export function registerAgent(card: AgentCard): void {
  agents.set(card.id, { ...card });
}

/** Get an agent by ID. */
export function getAgent(id: string): AgentCard | undefined {
  const card = agents.get(id);
  return card ? { ...card } : undefined;
}

/** Find all agents that advertise a given capability. */
export function findAgentsByCapability(capability: string): AgentCard[] {
  const lower = capability.toLowerCase();
  const results: AgentCard[] = [];
  for (const card of agents.values()) {
    if (card.capabilities.some((c) => c.toLowerCase().includes(lower))) {
      results.push({ ...card });
    }
  }
  return results;
}

/** Return all registered agents. */
export function getAllAgents(): AgentCard[] {
  return Array.from(agents.values()).map((card) => ({ ...card }));
}

/** Update an agent's status (available → busy → offline). */
export function updateAgentStatus(id: string, status: AgentCard['status']): void {
  const card = agents.get(id);
  if (card) {
    card.status = status;
  }
}

// ── Built-in Agent Cards ──────────────────────────────────────────────────
// One agent per document skill defined in document-skills.ts.

const BUILT_IN_AGENTS: AgentCard[] = [
  {
    id: 'agent-legal',
    name: 'Legal Agent',
    description: 'Handles legal documents — formal tone, detailed clauses, source-only grounding.',
    capabilities: [
      'draft-legal-document',
      'review-contract-clauses',
      'compliance-check',
      'clause-extraction',
      'legal-terminology',
    ],
    skills: ['legal'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish', 'ai/metadata'],
    canApprove: ['legal-language', 'clause-structure', 'compliance-flags'],
    cannotApprove: ['visual-design', 'technical-architecture', 'user-flow'],
    status: 'available',
  },
  {
    id: 'agent-executive',
    name: 'Executive Agent',
    description: 'Produces executive communications — professional tone, concise, conclusion-first.',
    capabilities: [
      'draft-executive-brief',
      'summarize-for-leadership',
      'create-board-materials',
      'executive-summary',
    ],
    skills: ['executive'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish', 'ai/metadata'],
    canApprove: ['executive-tone', 'summary-quality', 'audience-alignment'],
    cannotApprove: ['legal-compliance', 'technical-accuracy', 'visual-design'],
    status: 'available',
  },
  {
    id: 'agent-technical',
    name: 'Technical Agent',
    description: 'Creates technical documentation — comprehensive detail, step-by-step procedures.',
    capabilities: [
      'draft-technical-doc',
      'write-procedures',
      'create-api-reference',
      'technical-review',
      'architecture-documentation',
    ],
    skills: ['technical'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish', 'ai/metadata'],
    canApprove: ['technical-accuracy', 'procedural-completeness', 'code-examples'],
    cannotApprove: ['legal-compliance', 'executive-tone', 'visual-design'],
    status: 'available',
  },
  {
    id: 'agent-persuasive',
    name: 'Marketing Agent',
    description: 'Crafts persuasive content — problem-solution structure for stakeholders.',
    capabilities: [
      'draft-proposal',
      'create-pitch-deck',
      'write-case-study',
      'persuasive-copy',
      'stakeholder-communication',
    ],
    skills: ['persuasive'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish', 'ai/metadata'],
    canApprove: ['persuasive-tone', 'call-to-action', 'audience-targeting'],
    cannotApprove: ['legal-compliance', 'technical-accuracy', 'visual-design'],
    status: 'available',
  },
  {
    id: 'agent-simple',
    name: 'Simple Agent',
    description: 'Produces plain-language content — conversational, concise, accessible.',
    capabilities: [
      'simplify-document',
      'plain-language-rewrite',
      'draft-informal-communication',
      'readability-improvement',
    ],
    skills: ['simple'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish'],
    canApprove: ['readability', 'plain-language', 'tone-simplification'],
    cannotApprove: ['legal-compliance', 'technical-accuracy', 'visual-design'],
    status: 'available',
  },
  {
    id: 'agent-hr',
    name: 'HR Agent',
    description: 'Creates HR documents — professional, employee-friendly, policy-aware.',
    capabilities: [
      'draft-hr-policy',
      'create-offer-letter',
      'write-job-description',
      'employee-communication',
      'onboarding-materials',
    ],
    skills: ['hr'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish', 'ai/metadata'],
    canApprove: ['hr-tone', 'policy-language', 'employee-communication'],
    cannotApprove: ['legal-compliance', 'technical-accuracy', 'visual-design'],
    status: 'available',
  },
  {
    id: 'agent-research',
    name: 'Research Agent',
    description: 'Produces academic and research content — formal, comprehensive, source-only grounding.',
    capabilities: [
      'draft-research-paper',
      'literature-review',
      'create-methodology-section',
      'academic-writing',
      'citation-management',
    ],
    skills: ['research'],
    tools: ['ai/generate', 'ai/blueprint', 'ai/polish', 'ai/metadata'],
    canApprove: ['academic-rigor', 'citation-quality', 'methodology-soundness'],
    cannotApprove: ['legal-compliance', 'executive-tone', 'visual-design'],
    status: 'available',
  },
];

// Auto-register built-in agents on module load
for (const agent of BUILT_IN_AGENTS) {
  registerAgent(agent);
}
