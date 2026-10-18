from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import author_feedback, book_publishing as publishing, reader_social, reader_store
from ..storage.reader_schema import BookFeedback, BookSummary
from ..storage.schema import BookListing, BookMeta, ChapterAuthorNotes, ReaderLevelName

router = APIRouter(tags=["book-publishing"])


class InvitesBody(BaseModel):
    invites: dict[str, ReaderLevelName]


def _translate(exc: Exception) -> HTTPException:
    if isinstance(exc, (publishing.BookNotFoundError, publishing.ChapterNotFoundError)):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


_ERRORS = (publishing.BookNotFoundError, publishing.ChapterNotFoundError, publishing.NothingToPublishError, publishing.InvalidListingError)
_BOOK = "/api/projects/{project_id}/books/{book_id}"


@router.get(f"{_BOOK}/listing", response_model=BookListing)
def get_listing(project_id: str, book_id: str, root: Path = Depends(get_storage_root)) -> BookListing:
    try:
        return publishing.get_listing(root, project_id, book_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.put(f"{_BOOK}/listing/meta", response_model=BookListing)
def put_meta(project_id: str, book_id: str, body: BookMeta, root: Path = Depends(get_storage_root)) -> BookListing:
    try:
        return publishing.update_meta(root, project_id, book_id, body)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post(f"{_BOOK}/publish", response_model=BookListing)
def publish(project_id: str, book_id: str, root: Path = Depends(get_storage_root)) -> BookListing:
    """Publish the book: a new numbered edition from the chapters published so far, and the book is listed for sale and loan."""
    try:
        return publishing.publish_book(root, project_id, book_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post(f"{_BOOK}/unpublish", response_model=BookListing)
def unpublish(project_id: str, book_id: str, root: Path = Depends(get_storage_root)) -> BookListing:
    """Take the book off sale and loan. Copies readers own and loans already made keep working."""
    try:
        return publishing.unpublish_book(root, project_id, book_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.put(f"{_BOOK}/invites", response_model=BookListing)
def put_invites(
    project_id: str,
    book_id: str,
    body: InvitesBody,
    root: Path = Depends(get_storage_root),
    app_root: Path = Depends(get_app_data_storage_root),
) -> BookListing:
    """Invite readers to the book at alpha, delta or beta. The one for "me" is this reader account, whose level in the Reader follows."""
    try:
        listing = publishing.set_invites(root, project_id, book_id, body.invites)
    except _ERRORS as exc:
        raise _translate(exc) from exc
    reader_social.set_local_invite(app_root, author_feedback.local_id(project_id, book_id), body.invites.get("me"))
    return listing


@router.get(f"{_BOOK}/feedback", response_model=BookFeedback)
def get_feedback(
    project_id: str,
    book_id: str,
    root: Path = Depends(get_storage_root),
    app_root: Path = Depends(get_app_data_storage_root),
) -> BookFeedback:
    try:
        return author_feedback.book_feedback(reader_store.load_file(app_root), root, project_id, book_id, reader_store._now())
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.get("/api/author/books", response_model=list[BookSummary])
def list_published_books(root: Path = Depends(get_storage_root), app_root: Path = Depends(get_app_data_storage_root)) -> list[BookSummary]:
    """Every book the author has published, with its loans, sales, earnings and rating (for the Dash)."""
    return author_feedback.all_summaries(reader_store.load_file(app_root), root, reader_store._now())


@router.get("/api/projects/{project_id}/chapters/{chapter_id}/author-notes", response_model=ChapterAuthorNotes)
def get_author_notes(project_id: str, chapter_id: str, root: Path = Depends(get_storage_root)) -> ChapterAuthorNotes:
    try:
        return publishing.get_chapter_notes(root, project_id, chapter_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.put("/api/projects/{project_id}/chapters/{chapter_id}/author-notes", response_model=ChapterAuthorNotes)
def put_author_notes(project_id: str, chapter_id: str, body: ChapterAuthorNotes, root: Path = Depends(get_storage_root)) -> ChapterAuthorNotes:
    """The author's footnotes and flagged passages on a chapter's sentences. Published ones go into the next edition."""
    try:
        return publishing.put_chapter_notes(root, project_id, chapter_id, body)
    except _ERRORS as exc:
        raise _translate(exc) from exc
