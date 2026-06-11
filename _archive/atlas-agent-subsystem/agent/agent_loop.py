from __future__ import annotations

from typing import Dict, List

from agent.llm_client import LlamaClient
from agent.tool_registry import get_tool

DEFAULT_DOCUMENT = "documents/Services-Agreement-Template.1.pdf"
INTENT_TOOL_MAP = {
    "risk_review": ["termination_check", "semantic_search"],
    "semantic_search": ["semantic_search"],
}


class AgentLoop:
    """Minimal agent loop wiring tools, intent detection, and response synthesis."""

    def __init__(self, llm_client: LlamaClient | None = None) -> None:
        self.llm = llm_client or LlamaClient()

    def run(self, query: str, document: str = DEFAULT_DOCUMENT) -> Dict[str, object]:
        intent = self.llm.classify_intent(query)
        tool_names = INTENT_TOOL_MAP.get(intent, INTENT_TOOL_MAP["risk_review"])
        tool_outputs: List[Dict[str, object]] = []
        findings: List[Dict[str, object]] = []
        for tool_name in tool_names:
            tool = get_tool(tool_name)
            if tool is None:
                continue
            payload = {"query": query, "top_k": 5, "document": document}
            result = tool.run(payload, {"document": document})
            tool_outputs.append(result)
            findings.extend(self._build_findings(result, tool_name))
        summary = self.llm.summarize(query, intent, tool_outputs)
        return {
            "intent": intent,
            "summary": summary,
            "findings": findings,
            "tool_outputs": tool_outputs,
        }

    def _build_findings(self, tool_output: Dict[str, object], tool_name: str) -> List[Dict[str, object]]:
        results = tool_output.get("results") or []
        findings: List[Dict[str, object]] = []
        for hit in results:
            findings.append(
                {
                    "tool": tool_name,
                    "document": hit.get("document"),
                    "page": hit.get("page"),
                    "text": hit.get("text"),
                    "score": hit.get("score"),
                    "clause_type": "Termination" if tool_name == "termination_check" else "Clause",
                    "risk": "Termination risk identified" if tool_name == "termination_check" else "Related clause",
                    "reason": "Matches curated termination evidence" if tool_name == "termination_check" else "Semantic proximity to your request",
                }
            )
        return findings
