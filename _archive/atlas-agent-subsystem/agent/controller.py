from __future__ import annotations

from agent.agent_loop import AgentLoop


class AgentController:
    """Thin controller that exposes the agent loop to external callers."""

    def __init__(self) -> None:
        self._loop = AgentLoop()

    def analyze(self, query: str, document: str | None = None) -> dict:
        document = document or "documents/Services-Agreement-Template.1.pdf"
        return self._loop.run(query, document)
