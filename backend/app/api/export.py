import io
import json
import re
import unicodedata
import zipfile
from dataclasses import replace
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from ..deps import get_storage_root
from ..storage import epub_export, json_export, pdf_export
from ..storage.export_content import ExportDoc, collect

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])

MEDIA = {"pdf": "application/pdf", "epub": "application/epub+zip", "json": "application/json", "zip": "application/zip"}


def _safe(title: str) -> str:
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", title or "untitled").strip() or "untitled"


def _content_disposition(title: str, ext: str = "pdf") -> str:
    """A header can only carry Latin-1: `filename` is the title folded to ASCII, and `filename*` (RFC 5987) has the real one."""
    safe = _safe(title)
    ascii_name = unicodedata.normalize("NFKD", safe).encode("ascii", "ignore").decode("ascii").strip() or "download"
    return f"attachment; filename=\"{ascii_name}.{ext}\"; filename*=UTF-8''{quote(f'{safe}.{ext}')}"


def _file(content: bytes, title: str, ext: str) -> Response:
    return Response(content=content, media_type=MEDIA[ext], headers={"Content-Disposition": _content_disposition(title, ext)})


@router.get("")
def export(
    project_id: str,
    scope: Literal["project", "book", "chapter"] = "book",
    target: Optional[str] = Query(default=None, alias="id"),
    fmt: Literal["pdf", "epub", "json"] = Query(default="pdf", alias="format"),
    pageSize: Literal["6x9", "a5", "letter", "a4"] = "6x9",
    titlePage: bool = True,
    contents: bool = True,
    footnotes: bool = True,
    cover: bool = True,
    marginFlags: bool = False,
    split: bool = False,
    plot: bool = True,
    flags: bool = True,
    revisions: bool = False,
    root: Path = Depends(get_storage_root),
) -> Response:
    """A project, a book or a chapter (`id`) as a PDF, an EPUB or JSON. For a project in PDF or EPUB, `split` gives a zip with a file per book.
    `marginFlags` puts the open revision flags in a PDF's margin; `cover` gives an EPUB its cover (the book's title and colour)."""
    if scope != "project" and not target:
        raise HTTPException(status_code=422, detail="a book or chapter export needs its id")
    if fmt == "json":
        data = json_export.build_json(root, project_id, scope, target, json_export.JsonOptions(plot=plot, flags=flags, revisions=revisions))
        return _file(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"), data["title"], "json")

    doc = collect(root, project_id, scope, target)

    def render(d: ExportDoc) -> bytes:
        if fmt == "pdf":
            return pdf_export.build_pdf(d, pdf_export.PdfOptions(page_size=pageSize, title_page=titlePage, contents=contents, footnotes=footnotes, flags=marginFlags))
        return epub_export.build_epub(d, epub_export.EpubOptions(contents=contents, footnotes=footnotes, cover=cover))

    if scope == "project" and split and len(doc.books) > 1:
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, book in enumerate(doc.books):
                one = replace(doc, scope="book", title=book.title, books=[book])
                zf.writestr(f"{i + 1} - {_safe(book.title)}.{fmt}", render(one))
        return _file(out.getvalue(), doc.title, "zip")
    return _file(render(doc), doc.title, fmt)


# The first export routes: a book's or a chapter's PDF with the defaults, the short form of `GET ""` (the app itself now asks `GET ""`).
@router.get("/book/{book_id}")
def export_book_pdf(project_id: str, book_id: str, root: Path = Depends(get_storage_root)) -> Response:
    pdf_bytes, title = pdf_export.build_book_pdf(root, project_id, book_id)
    return _file(pdf_bytes, title, "pdf")


@router.get("/chapter/{chapter_id}")
def export_chapter_pdf(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> Response:
    pdf_bytes, title = pdf_export.build_chapter_pdf(root, project_id, chapter_id)
    return _file(pdf_bytes, title, "pdf")
