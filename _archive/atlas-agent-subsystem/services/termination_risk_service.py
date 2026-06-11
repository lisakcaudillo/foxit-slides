"""Collects termination-related contexts via retrieval calls."""
from pathlib import Path
from typing import Any, Dict, List

from services.retrieval_service import RetrievalService


class TerminationRiskService:
    def __init__(self, retrieval_service: RetrievalService) -> None:
        self.retrieval_service = retrieval_service

    def collect_termination_context(
        self, document_name: str, top_k: int = 5
    ) -> List[Dict[str, Any]]:
        queries = [
            "termination",
            "terminate",
            "cure period",
            "breach",
            "force majeure",
        ]
        combined: List[Dict[str, Any]] = []
        target_filename = Path(document_name).name
        for query in queries:
            results = self.retrieval_service.search(query, top_k)
            for entry in results:
                entry_filename = Path(entry.get("document", "")).name
                if entry_filename == target_filename:
                    combined.append(entry)

        combined.sort(key=lambda entry: entry.get("score", 0.0), reverse=True)

        seen_text = set()
        seen_doc_pages = set()
        deduped: List[Dict[str, Any]] = []
        for entry in combined:
            text = entry.get("text")
            doc = entry.get("document")
            page = entry.get("page_number")
            doc_page = (doc, page)
            if text and text in seen_text:
                continue
            if doc_page in seen_doc_pages:
                continue

            seen_text.add(text)
            seen_doc_pages.add(doc_page)
            deduped.append(entry)

        return deduped
