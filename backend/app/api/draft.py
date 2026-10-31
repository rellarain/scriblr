from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..models import UpsertDraftRequest
from ..storage import activity, draft_sessions, facet_activity, project_store as store, revision_flags
from ..storage.schema import DraftChapter, DraftMoment, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/draft/chapter/{chapter_id}", tags=["draft"])


def _word_count(body: str) -> int:
    return len(body.split())


@router.get("", response_model=DraftChapter)
def get_draft_chapter(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> DraftChapter:
    return store.load_draft_chapter(root, project_id, chapter_id)


@router.get("/moment/{moment_id}", response_model=DraftMoment)
def get_draft(
    project_id: str, chapter_id: str, moment_id: str, root: Path = Depends(get_storage_root)
) -> DraftMoment:
    return store.load_draft(root, project_id, chapter_id, moment_id)


@router.put("/moment/{moment_id}", response_model=DraftMoment)
def put_draft(
    project_id: str,
    chapter_id: str,
    moment_id: str,
    body: UpsertDraftRequest,
    root: Path = Depends(get_storage_root),
) -> DraftMoment:
    # One load and one write for the whole save (the draft, the day's activity, the session's revision).
    with store.transaction(root, project_id):
        try:
            previous = store.load_draft(root, project_id, chapter_id, moment_id)
            previous_word_count, previous_body = previous.wordCount, previous.body
        except store.MomentNotFoundError:
            previous_word_count, previous_body = 0, ""
        before = store.load_draft_chapter(root, project_id, chapter_id).model_copy(deep=True)
        draft = DraftMoment(
            momentId=moment_id,
            outlineNodeId=body.outlineNodeId,
            updatedAt=utcnow(),
            wordCount=_word_count(body.body),
            body=body.body,
        )
        store.save_draft(root, project_id, chapter_id, moment_id, draft)
        activity.record_daily_activity(root, project_id, word_count_delta=draft.wordCount - previous_word_count)
        if body.body != previous_body:
            outline_nodes = store.load_project(root, project_id).outline.nodes
            facet_activity.record(
                root, project_id, "draft", "words", node_id=moment_id, kind="moment",
                label=next((n.title for n in outline_nodes if n.id == moment_id), None),
                amount=draft.wordCount - previous_word_count, book_id=facet_activity.book_of(outline_nodes, moment_id),
            )
            if revision_flags.reanchor(store.load_project(root, project_id).revisionFlags, moment_id, previous_body, body.body):
                store.mutate(root, project_id, lambda _pf: None)
        draft_sessions.record_session(root, project_id, chapter_id, before)
        return draft


@router.delete("/moment/{moment_id}", status_code=204)
def delete_draft(
    project_id: str, chapter_id: str, moment_id: str, root: Path = Depends(get_storage_root)
) -> None:
    store.delete_draft(root, project_id, chapter_id, moment_id)
