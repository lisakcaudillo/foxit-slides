"""Central agent role registry (P1B-3).

Every component that processes, transforms, or generates data has a declared
role.  This registry is the single source of truth for role classification
and enforcement rules.

Roles (per EU AI Act framing and research-informed architecture):
    extraction      — reads and structures data, no judgment
    decision_support — produces recommendations for human review
    action          — performs side-effects (requires human approval gate)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

AgentRole = Literal["decision_support", "extraction", "action"]


@dataclass(frozen=True)
class AgentDeclaration:
    """Immutable declaration of an agent/component's role and approval requirements."""
    name: str
    module: str
    role: AgentRole
    requires_human_approval: bool
    description: str


# ---------------------------------------------------------------------------
# Registry — add new components here
# ---------------------------------------------------------------------------

AGENT_REGISTRY: list[AgentDeclaration] = [
    # Retrieval agents
    AgentDeclaration(
        name="semantic_search",
        module="agent.tools.semantic_search_tool",
        role="extraction",
        requires_human_approval=False,
        description="FAISS vector search — reads index, returns scored hits",
    ),
    AgentDeclaration(
        name="termination_check",
        module="agent.tools.termination_check_tool",
        role="decision_support",
        requires_human_approval=False,
        description="Identifies termination risk clauses and aggregates evidence",
    ),
    AgentDeclaration(
        name="agent_loop",
        module="agent.agent_loop",
        role="decision_support",
        requires_human_approval=False,
        description="Orchestrates intent detection → tool selection → synthesis",
    ),

    # Comparison pipeline
    AgentDeclaration(
        name="ingestor",
        module="comparison.ingestor",
        role="extraction",
        requires_human_approval=False,
        description="PDF text extraction and structural chunking",
    ),
    AgentDeclaration(
        name="clause_classifier",
        module="comparison.clause_classifier",
        role="extraction",
        requires_human_approval=False,
        description="Rule-based 5-class clause type classification (no LLM)",
    ),
    AgentDeclaration(
        name="sanitizer",
        module="comparison.sanitizer",
        role="extraction",
        requires_human_approval=False,
        description="PII/entity replacement via Ollama local inference",
    ),
    AgentDeclaration(
        name="aligner",
        module="comparison.aligner",
        role="decision_support",
        requires_human_approval=False,
        description="Semantic alignment + impact summary generation via Claude",
    ),
    AgentDeclaration(
        name="formatter",
        module="comparison.formatter",
        role="extraction",
        requires_human_approval=False,
        description="Transforms alignment results into HTML/JSON reports",
    ),

    # Review layer
    AgentDeclaration(
        name="review_persistence",
        module="ui.review_db",
        role="extraction",
        requires_human_approval=False,
        description="SQLite persistence for review decisions and audit trail",
    ),
]


def get_agent_declaration(name: str) -> AgentDeclaration | None:
    """Look up an agent declaration by name."""
    for decl in AGENT_REGISTRY:
        if decl.name == name:
            return decl
    return None


def get_agents_by_role(role: AgentRole) -> list[AgentDeclaration]:
    """Return all agents with the given role."""
    return [a for a in AGENT_REGISTRY if a.role == role]


def requires_approval(name: str) -> bool:
    """Check if an agent requires human approval before execution.

    Returns True for action-class agents or if not found in registry
    (fail-safe: unknown agents require approval).
    """
    decl = get_agent_declaration(name)
    if decl is None:
        return True  # fail-safe: unknown agents require approval
    return decl.requires_human_approval
