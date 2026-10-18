import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response

from ..deps import get_storage_root
from ..storage import pdf_export

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])


def _content_disposition(title: str) -> str:
    """A header can only carry Latin-1: `filename` is the title folded to ASCII, and `filename*` (RFC 5987) has the real one."""
    safe = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", title or "untitled").strip() or "untitled"
    ascii_name = unicodedata.normalize("NFKD", safe).encode("ascii", "ignore").decode("ascii").strip() or "download"
    return f"attachment; filename=\"{ascii_name}.pdf\"; filename*=UTF-8''{quote(safe + '.pdf')}"


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
