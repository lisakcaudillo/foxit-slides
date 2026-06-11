"""Interfaces with Ollama embeddings to provide vector representations."""
from typing import List

import requests


class OllamaEmbedder:
    def __init__(
        self,
        port: int = 11434,
        model: str = "nomic-embed-text-v2-moe",
    ) -> None:
        self.url = f"http://localhost:11434/api/embeddings"
        self.model = model

    def _embed(self, prompt: str) -> List[float]:
        response = requests.post(
            self.url,
            json={"model": self.model, "prompt": prompt},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        embedding = payload.get("embedding")
        if embedding is None:
            raise ValueError("Missing embedding vector in Ollama response")
        return embedding

    def embed_document(self, chunk_text: str) -> List[float]:
        prefixed = f"search_document: {chunk_text.strip()}"
        return self._embed(prefixed)

    def embed_query(self, query_text: str) -> List[float]:
        prefixed = f"search_query: {query_text.strip()}"
        return self._embed(prefixed)
