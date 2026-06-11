"""Appends chunk metadata without rewriting stored history."""
import json
from pathlib import Path
from typing import Any, Dict, List


class MetadataStore:
    def __init__(self, metadata_path: Path) -> None:
        self.metadata_path = Path(metadata_path)
        self.metadata_path.parent.mkdir(parents=True, exist_ok=True)
        self._count: int | None = None

    def _load_count(self) -> int:
        if not self.metadata_path.exists():
            return 0
        with self.metadata_path.open("r", encoding="utf-8") as file_handle:
            return sum(1 for _ in file_handle)

    def count(self) -> int:
        if self._count is None:
            self._count = self._load_count()
        return self._count

    def append(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        entry = dict(metadata)
        entry["chunk_id"] = self.count()
        with self.metadata_path.open("a", encoding="utf-8") as file_handle:
            file_handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self._count = entry["chunk_id"] + 1
        return entry

    def load_all(self) -> List[Dict[str, Any]]:
        if not self.metadata_path.exists():
            return []
        entries: List[Dict[str, Any]] = []
        with self.metadata_path.open("r", encoding="utf-8") as file_handle:
            for line in file_handle:
                line = line.strip()
                if not line:
                    continue
                entries.append(json.loads(line))
        return entries
