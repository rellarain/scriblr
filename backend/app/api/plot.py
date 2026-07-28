from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import PlotTree

router = APIRouter(prefix="/api/projects/{project_id}/plot", tags=["plot"])


@router.get("", response_model=PlotTree)
def get_plot(project_id: str, root: Path = Depends(get_storage_root)) -> PlotTree:
    return store.load_plot(root, project_id)


@router.put("", response_model=PlotTree)
def put_plot(project_id: str, body: PlotTree, root: Path = Depends(get_storage_root)) -> PlotTree:
    store.save_plot(root, project_id, body)
    return store.load_plot(root, project_id)
