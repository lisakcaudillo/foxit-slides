"""Retrieval service combines embeddings with FAISS search outputs."""
from typing import Any, Dict, List

from embeddings.embedder import OllamaEmbedder
from storage.index_manager import IndexManager
from storage.metadata_store import MetadataStore


class RetrievalService:
    def __init__(
        self,
        index_manager: IndexManager,
        metadata_store: MetadataStore,
        embedder: OllamaEmbedder,
    ) -> None:
        self.index_manager = index_manager
        self.metadata_store = metadata_store
        self.embedder = embedder

    def search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        query_vector = self.embedder.embed_query(query)
        distances, indices = self.index_manager.search(query_vector, top_k)
        metadata = self.metadata_store.load_all()
        results: List[Dict[str, Any]] = []
        for score, pointer in zip(distances, indices):
            if pointer < 0 or pointer >= len(metadata):
                continue
            entry = dict(metadata[pointer])
            entry["score"] = float(score)
            results.append(entry)

        results.sort(key=lambda result: result.get("score", 0.0), reverse=True)

        seen_text = set()
        seen_doc_pages = set()
        deduped: List[Dict[str, Any]] = []
        for entry in results:
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
