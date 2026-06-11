"""Owns manual ingestion + retrieval wiring for Atlas development tests."""
from argparse import ArgumentParser
from pathlib import Path
from typing import Iterable, Sequence

from embeddings.embedder import OllamaEmbedder
from ingestion.chunker import PageChunk, chunk_by_page
from ingestion.pdf_loader import PageText, extract_pages
from services.retrieval_service import RetrievalService
from services.termination_risk_service import TerminationRiskService
from storage.index_manager import IndexManager
from storage.metadata_store import MetadataStore
from storage.project_manager import ProjectManager


def ingest_pdf(
    pdf_path: Path,
    project_manager: ProjectManager,
    embedder: OllamaEmbedder,
    index_manager: IndexManager,
    metadata_store: MetadataStore,
) -> None:
    stored_pdf = project_manager.store_document(pdf_path)
    pages: Iterable[PageText] = extract_pages(stored_pdf)
    page_chunks: Sequence[PageChunk] = chunk_by_page(pages)
    if not page_chunks:
        return

    vectors: list[Sequence[float]] = []
    pending_metadata = []
    for chunk in page_chunks:
        chunk_vector = embedder.embed_document(chunk.text)
        vectors.append(chunk_vector)
        pending_metadata.append(
            {
                "document": str(stored_pdf.relative_to(project_manager.project_dir)),
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "text": chunk.text,
                "token_count": chunk.token_count,
            }
        )

    index_manager.add_vectors(vectors)
    for entry in pending_metadata:
        metadata_store.append(entry)


def main() -> None:
    parser = ArgumentParser(description="Atlas manual ingestion + retrieval smoke test")
    parser.add_argument("--project", default="atlas-demo", help="Name for the project folder")
    parser.add_argument(
        "--pdfs",
        nargs=2,
        required=True,
        help="Two PDF file paths to ingest before running retrieval",
    )
    parser.add_argument("--query", required=True, help="Sample query to issue against the newly built index")
    args = parser.parse_args()

    project_manager = ProjectManager(base_dir=Path.cwd() / "projects", project_name=args.project)
    project_manager.create_project()

    index_manager = IndexManager(project_manager.index_path)
    metadata_store = MetadataStore(project_manager.metadata_path)
    embedder = OllamaEmbedder()
    retrieval_service = RetrievalService(index_manager, metadata_store, embedder)

    for pdf_location in args.pdfs:
        ingest_pdf(
            pdf_path=Path(pdf_location),
            project_manager=project_manager,
            embedder=embedder,
            index_manager=index_manager,
            metadata_store=metadata_store,
        )

    index_manager.persist()

    termination_service = TerminationRiskService(retrieval_service)
    termination_hits = termination_service.collect_termination_context(
        "documents/Services-Agreement-Template.1.pdf"
    )
    if termination_hits:
        print("Termination context hits:")
        for hit in termination_hits:
            text_snippet = hit.get("text", "")[:300]
            print(hit.get("document"))
            print(f"Page {hit.get('page_number')} Score {hit.get('score'):.4f}")
            print(text_snippet)
            print("=" * 60)
    else:
        print("No termination context hits for Services-Agreement-Template.1.pdf")

    results = retrieval_service.search(args.query, top_k=5)
    if not results:
        print("No results returned from retrieval")
        return

    for hit in results:
        print(f"{hit['document']} (page {hit['page_number']}) score {hit['score']:.4f}")
        print(hit["text"])
        print("-" * 60)


if __name__ == "__main__":
    main()
