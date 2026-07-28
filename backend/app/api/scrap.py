from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..models import RestoreScrapRequest
from ..storage import project_store as store, scrap
from ..storage.schema import OutlineTree, ScrapRegistry

router = APIRouter(prefix="/api/projects/{project_id}/scrap", tags=["scrap"])


@router.get("", response_model=ScrapRegistry)
def list_scrap(project_id: str, root: Path = Depends(get_storage_root)) -> ScrapRegistry:
    return store.load_scrap_registry(root, project_id)


@router.post("/{moment_id}/restore", response_model=OutlineTree)
def restore_scrap(
    project_id: str,
    moment_id: str,
    body: RestoreScrapRequest,
    root: Path = Depends(get_storage_root),
) -> OutlineTree:
    return scrap.restore_entry(root, project_id, moment_id, body.parentId, body.title)


@router.delete("/{moment_id}", status_code=204)
def delete_scrap(project_id: str, moment_id: str, root: Path = Depends(get_storage_root)) -> None:
    scrap.delete_entry_permanently(root, project_id, moment_id)
