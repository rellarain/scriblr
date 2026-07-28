from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..storage import analytics as analytics_store
from ..storage.schema import ProjectAnalytics

router = APIRouter(prefix="/api/projects/{project_id}/analytics", tags=["analytics"])


@router.get("", response_model=ProjectAnalytics)
def get_analytics(project_id: str, root: Path = Depends(get_storage_root)) -> ProjectAnalytics:
    return analytics_store.get_analytics(root, project_id)
