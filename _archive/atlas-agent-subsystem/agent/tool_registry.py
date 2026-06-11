from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from embeddings.embedder import OllamaEmbedder
from services.retrieval_service import RetrievalService
from services.termination_risk_service import TerminationRiskService
from storage.index_manager import IndexManager
from storage.metadata_store import MetadataStore
from storage.project_manager import ProjectManager

from agent.tools.semantic_search_tool import SemanticSearchTool
from agent.tools.termination_check_tool import TerminationCheckTool
from agent.tools.base_tool import Tool


PROJECT_NAME = "atlas-demo"
PROJECT_ROOT = Path.cwd() / "projects"


def _build_services() -> tuple[RetrievalService, TerminationRiskService]:
    project_manager = ProjectManager(base_dir=PROJECT_ROOT, project_name=PROJECT_NAME)
    project_manager.create_project()
    index_manager = IndexManager(project_manager.index_path)
    metadata_store = MetadataStore(project_manager.metadata_path)
    embedder = OllamaEmbedder()
    retrieval_service = RetrievalService(index_manager, metadata_store, embedder)
    termination_service = TerminationRiskService(retrieval_service)
    return retrieval_service, termination_service


_RETRIEVAL_SERVICE, _TERMINATION_SERVICE = _build_services()

_tools: Dict[str, Tool] = {
    "semantic_search": SemanticSearchTool(_RETRIEVAL_SERVICE),
    "termination_check": TerminationCheckTool(_TERMINATION_SERVICE),
}


def get_tool(name: str) -> Optional[Tool]:
    """Return a named tool from the registry."""
    return _tools.get(name)


def available_tools() -> list[str]:
    return list(_tools.keys())
