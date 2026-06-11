from __future__ import annotations

from typing import Any, Dict, List

from services.termination_risk_service import TerminationRiskService

from agent.tools.base_tool import Tool


class TerminationCheckTool(Tool):
    name = "termination_check"
    description = "Collects termination contexts for a target document."
    role = "decision_support"

    def __init__(self, termination_service: TerminationRiskService) -> None:
        self._termination_service = termination_service

    def run(self, input: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        document = input.get("document")
        top_k = int(input.get("top_k", 5))
        if not document:
            return {"tool": self.name, "results": [], "explanation": "Missing document."}

        hits = self._termination_service.collect_termination_context(document, top_k)
        results: List[Dict[str, Any]] = []
        for hit in hits:
            results.append(
                {
                    "document": hit.get("document"),
                    "page": hit.get("page_number"),
                    "text": hit.get("text"),
                    "score": hit.get("score"),
                }
            )
        return {"tool": self.name, "results": results}
