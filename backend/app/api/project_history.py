"""The project's history across its chapters (the Project level's History tab): every chapter's revision summaries in one list, newest last.
The outline's and the plot's snapshots and the activity have their own routes."""

from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import ChapterRevisionSummary

router = APIRouter(prefix="/api/projects/{project_id}", tags=["history"])


@router.get("/revision-summaries", response_model=list[ChapterRevisionSummary])
def list_revision_summaries(project_id: str, root: Path = Depends(get_storage_root)) -> list[ChapterRevisionSummary]:
    store.load_index(root, project_id)  # 404 for a project that does not exist
    return [
        ChapterRevisionSummary(chapterId=chapter_id, snapshotId=s.snapshotId, createdAt=s.createdAt, label=s.label, trigger=s.trigger, wordCount=s.wordCount)
        for chapter_id, s in store.list_all_revisions(root, project_id)
    ]
