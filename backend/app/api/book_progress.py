from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_storage_root
from ..storage import book_progress as progress_store
from ..storage.schema import BookProgress

router = APIRouter(prefix="/api/projects/{project_id}/book-progress", tags=["book-progress"])


@router.get("", response_model=dict[str, BookProgress])
def get_book_progress(project_id: str, root: Path = Depends(get_storage_root)) -> dict[str, BookProgress]:
    """Per book id: the progress bars of its spine on the shelf."""
    return progress_store.get_book_progress(root, project_id)
