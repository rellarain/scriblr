from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..models import ScheduleCompletionsRequest
from ..storage import project_store as store

router = APIRouter(prefix="/api/projects/{project_id}/schedule", tags=["schedule"])


@router.get("/{date}", response_model=list[str])
def get_schedule_completions(
    project_id: str, date: str, root: Path = Depends(get_storage_root)
) -> list[str]:
    log = store.load_schedule_completions(root, project_id)
    return log.days.get(date, [])


@router.put("/{date}", response_model=list[str])
def put_schedule_completions(
    project_id: str,
    date: str,
    body: ScheduleCompletionsRequest,
    root: Path = Depends(get_storage_root),
) -> list[str]:
    log = store.load_schedule_completions(root, project_id)
    log.days[date] = body.completedItemIds
    store.save_schedule_completions(root, project_id, log)
    return log.days[date]
