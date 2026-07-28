from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..models import UpsertDraftRequest
from ..storage import project_store as store
from ..storage.schema import DraftScene, utcnow

router = APIRouter(prefix="/api/projects/{project_id}/draft", tags=["draft"])


def _word_count(body: str) -> int:
    return len(body.split())


@router.get("/{scene_id}", response_model=DraftScene)
def get_draft(project_id: str, scene_id: str, root: Path = Depends(get_storage_root)) -> DraftScene:
    return store.load_draft(root, project_id, scene_id)


@router.put("/{scene_id}", response_model=DraftScene)
def put_draft(
    project_id: str,
    scene_id: str,
    body: UpsertDraftRequest,
    root: Path = Depends(get_storage_root),
) -> DraftScene:
    draft = DraftScene(
        sceneId=scene_id,
        outlineNodeId=body.outlineNodeId,
        updatedAt=utcnow(),
        wordCount=_word_count(body.body),
        body=body.body,
    )
    store.save_draft(root, project_id, scene_id, draft)
    return draft


@router.delete("/{scene_id}", status_code=204)
def delete_draft(project_id: str, scene_id: str, root: Path = Depends(get_storage_root)) -> None:
    store.delete_draft(root, project_id, scene_id)
