from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..models import UpsertDraftRequest
from ..storage import activity, project_store as store
from ..storage.schema import DraftMoment, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/draft", tags=["draft"])


def _word_count(body: str) -> int:
    return len(body.split())


@router.get("/{moment_id}", response_model=DraftMoment)
def get_draft(project_id: str, moment_id: str, root: Path = Depends(get_storage_root)) -> DraftMoment:
    return store.load_draft(root, project_id, moment_id)


@router.put("/{moment_id}", response_model=DraftMoment)
def put_draft(
    project_id: str,
    moment_id: str,
    body: UpsertDraftRequest,
    root: Path = Depends(get_storage_root),
) -> DraftMoment:
    try:
        previous_word_count = store.load_draft(root, project_id, moment_id).wordCount
    except store.MomentNotFoundError:
        previous_word_count = 0
    draft = DraftMoment(
        momentId=moment_id,
        outlineNodeId=body.outlineNodeId,
        updatedAt=utcnow(),
        wordCount=_word_count(body.body),
        body=body.body,
    )
    store.save_draft(root, project_id, moment_id, draft)
    activity.record_daily_activity(root, project_id, word_count_delta=draft.wordCount - previous_word_count)
    return draft


@router.delete("/{moment_id}", status_code=204)
def delete_draft(project_id: str, moment_id: str, root: Path = Depends(get_storage_root)) -> None:
    store.delete_draft(root, project_id, moment_id)
