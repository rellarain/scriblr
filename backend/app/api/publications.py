from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import OutlineNode, Publication, PublicationSection, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/publications/{chapter_id}", tags=["publications"])


def _moments_in_order(nodes: list[OutlineNode], chapter_id: str) -> list[OutlineNode]:
    """Every moment under the chapter, depth-first in outline order."""
    children: dict[str | None, list[OutlineNode]] = {}
    for n in nodes:
        children.setdefault(n.parentId, []).append(n)
    out: list[OutlineNode] = []

    def walk(parent_id: str) -> None:
        for n in sorted(children.get(parent_id, []), key=lambda c: c.order):
            if n.kind == "moment":
                out.append(n)
            walk(n.id)

    walk(chapter_id)
    return out


@router.get("", response_model=list[Publication])
def list_publications(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> list[Publication]:
    """The chapter's kept publications, newest first."""
    return store.list_publications(root, project_id, chapter_id)


@router.post("", response_model=Publication)
def publish_chapter(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> Publication:
    """Publish the chapter: freeze its current draft, in outline order. Only the
    newest few publications are kept."""
    outline = store.load_outline(root, project_id)
    chapter = next((n for n in outline.nodes if n.id == chapter_id and n.kind == "chapter"), None)
    if chapter is None:
        raise HTTPException(status_code=404, detail=f"Chapter {chapter_id} not found")
    draft = store.load_draft_chapter(root, project_id, chapter_id)
    sections = [
        PublicationSection(momentId=m.id, body=draft.moments[m.id].body)
        for m in _moments_in_order(outline.nodes, chapter_id)
        if m.id in draft.moments and draft.moments[m.id].body.strip()
    ]
    publication = Publication(
        id=store.new_id("pub"),
        chapterId=chapter_id,
        publishedAt=utcnow(),
        wordCount=sum(len(s.body.split()) for s in sections),
        title=chapter.title,
        sections=sections,
    )
    store.save_publication(root, project_id, publication)
    return publication
