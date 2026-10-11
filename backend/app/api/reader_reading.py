from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import library, reader_reading as reading, reader_store as store
from ..storage.reader_schema import BookText, ChapterText, Mark, ReactionTotals, ReaderSettings, ReaderState

router = APIRouter(prefix="/api/reader", tags=["reader-reading"])


class MarkBody(BaseModel):
    key: str
    like: int = Field(default=0, ge=0, le=3)
    dislike: int = Field(default=0, ge=0, le=3)
    flags: list[str] = Field(default_factory=list, max_length=8)


class MyFlagBody(BaseModel):
    name: str = Field(max_length=40)


class ReadingBody(BaseModel):
    chapter: int = Field(ge=1)
    paragraph: int = Field(default=0, ge=0)
    pct: float = Field(ge=0, le=100)
    pages: int = Field(default=0, ge=0)
    minutes: int = Field(default=0, ge=0)
    newSession: bool = False
    device: str = Field(default="This computer", max_length=60)


def _book(book_id: str, projects: Path):
    try:
        return library.get_book(projects, book_id)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _run(fn, *args) -> ReaderState:
    try:
        return fn(*args)
    except store.InvalidReaderOperationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/books/{book_id}/text", response_model=BookText)
def get_book_text(book_id: str, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> BookText:
    return reading.book_text(store.load_file(root), projects, _book(book_id, projects))


@router.get("/books/{book_id}/chapters/{n}", response_model=ChapterText)
def get_chapter(book_id: str, n: int, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ChapterText:
    try:
        return reading.chapter_text(store.load_file(root), projects, _book(book_id, projects), n)
    except reading.ReadingError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.get("/books/{book_id}/marks", response_model=dict[str, Mark])
def get_marks(book_id: str, root: Path = Depends(get_app_data_storage_root)) -> dict[str, Mark]:
    return reading.marks_for(store.load_file(root), book_id)


@router.put("/books/{book_id}/marks", response_model=dict[str, Mark])
def put_mark(book_id: str, body: MarkBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> dict[str, Mark]:
    book = _book(book_id, projects)
    _run(reading.set_mark, root, book_id, body.key, body.like, body.dislike, body.flags, {f.key for f in book.flags})
    return reading.marks_for(store.load_file(root), book_id)


@router.get("/books/{book_id}/reactions/{n}", response_model=ReactionTotals)
def get_reactions(book_id: str, n: int, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReactionTotals:
    return reading.reaction_totals(store.load_file(root), projects, _book(book_id, projects), n)


@router.put("/settings", response_model=ReaderState)
def put_settings(body: ReaderSettings, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(reading.set_settings, root, body)


@router.post("/my-flags", response_model=ReaderState)
def add_my_flag(body: MyFlagBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(reading.add_my_flag, root, body.name)


@router.delete("/my-flags/{key}", response_model=ReaderState)
def delete_my_flag(key: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(reading.delete_my_flag, root, key)


@router.put("/books/{book_id}/reading", response_model=ReaderState)
def put_reading(book_id: str, body: ReadingBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    book = _book(book_id, projects)
    rf = store.load_file(root)
    can, reason = reading.access(rf, book, reading.level_of(rf, book_id))
    if not can:
        raise HTTPException(status_code=403, detail=reason)
    return _run(reading.record_reading, root, book_id, body.chapter, body.paragraph, body.pct, body.pages, body.minutes, body.newSession, body.device)
