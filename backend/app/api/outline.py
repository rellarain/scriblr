from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import OutlineTree

router = APIRouter(prefix="/api/projects/{project_id}/outline", tags=["outline"])


@router.get("", response_model=OutlineTree)
def get_outline(project_id: str, root: Path = Depends(get_storage_root)) -> OutlineTree:
    return store.load_outline(root, project_id)


@router.put("", response_model=OutlineTree)
def put_outline(
    project_id: str, body: OutlineTree, root: Path = Depends(get_storage_root)
) -> OutlineTree:
    store.save_outline(root, project_id, body)
    return store.load_outline(root, project_id)
