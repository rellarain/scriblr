from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..storage import activity as activity_store
from ..storage.schema import ActivityResponse

router = APIRouter(prefix="/api/projects/{project_id}/activity", tags=["activity"])


@router.get("", response_model=ActivityResponse)
def get_activity(project_id: str, root: Path = Depends(get_storage_root)) -> ActivityResponse:
    return activity_store.get_activity(root, project_id)
