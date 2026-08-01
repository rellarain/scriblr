import re
from pathlib import Path

from fastapi import APIRouter, Depends, Response

from ..deps import get_storage_root
from ..storage import pdf_export

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])


def _content_disposition(title: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|]', "_", title or "untitled").strip() or "untitled"
    return f'attachment; filename="{safe}.pdf"'


@router.get("/book/{book_id}")
def export_book_pdf(project_id: str, book_id: str, root: Path = Depends(get_storage_root)) -> Response:
    pdf_bytes, title = pdf_export.build_book_pdf(root, project_id, book_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(title)},
    )


@router.get("/chapter/{chapter_id}")
def export_chapter_pdf(
    project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)
) -> Response:
    pdf_bytes, title = pdf_export.build_chapter_pdf(root, project_id, chapter_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(title)},
    )
