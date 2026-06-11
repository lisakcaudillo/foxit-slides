"""Handles FAISS indexes so storage remains responsible only for vector persistence."""
from pathlib import Path
from typing import Iterable, List, Sequence

import faiss
import numpy as np


class IndexManager:
    def __init__(self, index_path: Path) -> None:
        self.index_path = Path(index_path)
        self.index: faiss.Index | None = None
        self.dimension: int | None = None
        if self.index_path.exists():
            self.load()

    def load(self) -> None:
        self.index = faiss.read_index(str(self.index_path))
        self.dimension = self.index.d

    def _init_index(self, vector_dim: int) -> None:
        self.index = faiss.IndexFlatL2(vector_dim)
        self.dimension = vector_dim

    def _ensure_index(self, vector_dim: int) -> None:
        if self.index is None:
            if self.index_path.exists():
                self.load()
                if self.dimension != vector_dim:
                    raise ValueError("Existing index dimension conflicts with requested vectors")
            else:
                self._init_index(vector_dim)
        elif self.dimension != vector_dim:
            raise ValueError("Cannot add vectors with mismatched dimension")

    def add_vectors(self, vectors: Sequence[Sequence[float]]) -> None:
        if not vectors:
            return
        array = np.asarray(vectors, dtype=np.float32)
        if array.ndim != 2:
            raise ValueError("Vectors must be a 2D array")
        self._ensure_index(array.shape[1])
        if self.index is None:
            raise RuntimeError("Index was not initialized")
        self.index.add(array)

    def persist(self) -> None:
        if self.index is None:
            return
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(self.index_path))

    def search(self, query_vector: Sequence[float], top_k: int) -> tuple[List[float], List[int]]:
        if self.index is None or self.index.ntotal == 0:
            raise ValueError("Index is empty; add vectors before searching")
        query_array = np.asarray([query_vector], dtype=np.float32)
        if self.dimension is None:
            raise RuntimeError("Index dimension is unknown")
        if query_array.shape[1] != self.dimension:
            raise ValueError("Query dimension does not match index")
        distances, indices = self.index.search(query_array, top_k)
        return distances[0].tolist(), indices[0].tolist()

    def total_vectors(self) -> int:
        return 0 if self.index is None else int(self.index.ntotal)
