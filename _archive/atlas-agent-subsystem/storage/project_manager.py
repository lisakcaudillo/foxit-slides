"""Coordinates project folders, document staging, and storage paths."""
import shutil
from pathlib import Path


class ProjectManager:
    def __init__(self, base_dir: Path, project_name: str) -> None:
        self.base_dir = Path(base_dir)
        self.project_name = project_name.strip()
        if not self.project_name:
            raise ValueError("Project name cannot be empty")
        self.project_dir = self.base_dir / self.project_name

    def create_project(self) -> None:
        self.project_dir.mkdir(parents=True, exist_ok=True)
        self.documents_dir.mkdir(parents=True, exist_ok=True)

    @property
    def documents_dir(self) -> Path:
        return self.project_dir / "documents"

    @property
    def index_path(self) -> Path:
        return self.project_dir / "index.faiss"

    @property
    def metadata_path(self) -> Path:
        return self.project_dir / "metadata.jsonl"

    def store_document(self, source: Path) -> Path:
        source = Path(source)
        if not source.exists():
            raise FileNotFoundError(f"Source document missing: {source}")
        destination = self.documents_dir / source.name
        shutil.copy2(source, destination)
        return destination
