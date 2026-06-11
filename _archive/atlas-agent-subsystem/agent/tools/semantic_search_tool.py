from __future__ import annotations

from typing import Any, Dict, List

from services.retrieval_service import RetrievalService

from agent.tools.base_tool import Tool


class SemanticSearchTool(Tool):
    name = "semantic_search"
    description = "Runs a semantic search against the FAISS index."
    role = "extraction"

    def __init__(self, retrieval_service: RetrievalService) -> None:
        self._retrieval_service = retrieval_service

    def run(self, input: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        query = input.get("query", "")
        top_k = int(input.get("top_k", 5))
        results: List[Dict[str, Any]] = []
        if not query:
            return {"tool": self.name, "results": [], "explanation": "No query provided."}

        search_hits = self._retrieval_service.search(query, top_k)
        for hit in search_hits:
            results.append(
                {
                    "document": hit.get("document"),
                    "page": hit.get("page_number"),
                    "text": hit.get("text"),
                    "score": hit.get("score"),
                }
            )
        return {"tool": self.name, "results": results}
