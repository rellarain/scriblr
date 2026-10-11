from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import library, reader_social as social, reader_store as store, social_views
from ..storage.reader_schema import BookCard, ClubView, FeedItem, NoteKind, ReaderLevel, ReaderState, ReportKind

router = APIRouter(prefix="/api/reader", tags=["reader-social"])


class LevelBody(BaseModel):
    level: Optional[ReaderLevel] = None


class CriteriaBody(BaseModel):
    names: list[str]


class ReviewBody(BaseModel):
    score: Optional[int] = Field(default=None, ge=1, le=10)
    criteria: dict[str, int] = Field(default_factory=dict)
    comment: str = Field(default="", max_length=5000)
    spoilerEssay: str = Field(default="", max_length=20000)
    noteIds: list[str] = Field(default_factory=list)


class NoteBody(BaseModel):
    bookId: str
    quote: str = Field(default="", max_length=2000)
    note: str = Field(default="", max_length=2000)
    kind: NoteKind = "note"
    chapter: Optional[int] = Field(default=None, ge=1)
    key: Optional[str] = None


class ClubBody(BaseModel):
    name: str = Field(max_length=80)
    description: str = Field(default="", max_length=500)
    bookId: Optional[str] = None
    meets: str = Field(default="", max_length=120)


class PostBody(BaseModel):
    text: str = Field(max_length=2000)
    spoiler: bool = False
    replyTo: Optional[str] = None


class ReportBody(BaseModel):
    kind: ReportKind
    targetId: str
    reason: str = "hide"


def _run(fn, *args) -> ReaderState:
    try:
        return fn(*args)
    except social.NotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"not found: {exc}") from exc
    except store.InvalidReaderOperationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _book(book_id: str, projects: Path):
    try:
        return library.get_book(projects, book_id)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/books/{book_id}/card", response_model=BookCard)
def book_card(book_id: str, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> BookCard:
    book = _book(book_id, projects)
    return social_views.book_card(store.load_file(root), book, store._now())


@router.get("/clubs", response_model=list[ClubView])
def list_clubs(root: Path = Depends(get_app_data_storage_root)) -> list[ClubView]:
    return social_views.clubs_view(store.load_file(root), store._now())


@router.get("/feed", response_model=list[FeedItem])
def get_feed(root: Path = Depends(get_app_data_storage_root)) -> list[FeedItem]:
    return social_views.feed(store.load_file(root), store._now())


@router.put("/levels/{book_id}", response_model=ReaderState)
def put_level(book_id: str, body: LevelBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    _book(book_id, projects)
    return _run(social.set_level, root, book_id, body.level)


@router.put("/criteria", response_model=ReaderState)
def put_criteria(body: CriteriaBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.set_criteria, root, body.names)


@router.put("/reviews/{book_id}", response_model=ReaderState)
def put_review(book_id: str, body: ReviewBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    _book(book_id, projects)
    return _run(social.save_review, root, book_id, body.score, body.criteria, body.comment, body.spoilerEssay, body.noteIds)


@router.post("/reviews/{book_id}/post", response_model=ReaderState)
def post_review(book_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.post_review, root, book_id)


@router.post("/reviews/{book_id}/reread", response_model=ReaderState)
def start_reread(book_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.start_reread, root, book_id)


@router.delete("/reviews/{book_id}/draft", response_model=ReaderState)
def discard_draft(book_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.discard_draft, root, book_id)


@router.post("/notes", response_model=ReaderState)
def add_note(body: NoteBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    _book(body.bookId, projects)
    return _run(social.add_note, root, body.bookId, body.quote, body.note, body.kind, body.chapter, body.key)


@router.delete("/notes/{note_id}", response_model=ReaderState)
def delete_note(note_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.delete_note, root, note_id)


@router.put("/following/{whom}", response_model=ReaderState)
def put_following(whom: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.follow, root, whom)


@router.delete("/following/{whom}", response_model=ReaderState)
def delete_following(whom: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.unfollow, root, whom)


@router.post("/clubs", response_model=ReaderState)
def create_club(body: ClubBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    if body.bookId:
        _book(body.bookId, projects)
    return _run(social.create_club, root, body.name, body.description, body.bookId, body.meets)


@router.delete("/clubs/{club_id}", response_model=ReaderState)
def delete_club(club_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.delete_club, root, club_id)


@router.put("/clubs/{club_id}/membership", response_model=ReaderState)
def join_club(club_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.join_club, root, club_id)


@router.delete("/clubs/{club_id}/membership", response_model=ReaderState)
def leave_club(club_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.leave_club, root, club_id)


@router.post("/clubs/{club_id}/posts", response_model=ReaderState)
def add_post(club_id: str, body: PostBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.add_post, root, club_id, body.text, body.spoiler, body.replyTo)


@router.delete("/posts/{post_id}", response_model=ReaderState)
def delete_post(post_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.delete_post, root, post_id)


@router.post("/reports", response_model=ReaderState)
def add_report(body: ReportBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.report, root, body.kind, body.targetId, body.reason)


@router.delete("/reports/{report_id}", response_model=ReaderState)
def delete_report(report_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.unreport, root, report_id)


@router.put("/blocked/{reader_id}", response_model=ReaderState)
def put_blocked(reader_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.block, root, reader_id)


@router.delete("/blocked/{reader_id}", response_model=ReaderState)
def delete_blocked(reader_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return _run(social.unblock, root, reader_id)
