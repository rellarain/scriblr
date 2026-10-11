from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import library, reader_store as store
from ..storage.reader_schema import MAX_BORROW_CREDITS, MAX_EXTRA_CREDITS, FlagClass, ReaderState

router = APIRouter(prefix="/api/reader", tags=["reader"])


class PlanBody(BaseModel):
    extraCredits: int = Field(ge=0, le=MAX_EXTRA_CREDITS)


class BorrowBody(BaseModel):
    bookId: str
    credits: int = Field(default=1, ge=1, le=MAX_BORROW_CREDITS)


class BuyBody(BaseModel):
    bookId: str


class LendBody(BaseModel):
    to: str
    months: int = Field(default=1, ge=1, le=3)


class ProgressBody(BaseModel):
    bookId: str
    pct: float = Field(ge=0, le=100)
    pages: int = Field(default=0, ge=0)
    minutes: int = Field(default=0, ge=0)
    newSession: bool = False


class FlagClassBody(BaseModel):
    flagClass: FlagClass


def _get_book(book_id: str, projects_root: Path):
    try:
        return library.get_book(projects_root, book_id)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _check_book(book_id: str, projects_root: Path) -> None:
    _get_book(book_id, projects_root)


def _translate(exc: Exception) -> HTTPException:
    if isinstance(exc, store.InsufficientCreditsError):
        return HTTPException(status_code=402, detail=str(exc))
    if isinstance(exc, store.AlreadyHeldError):
        return HTTPException(status_code=409, detail=f"already held: {exc}")
    if isinstance(exc, store.HoldingNotFoundError):
        return HTTPException(status_code=404, detail=f"not held: {exc}")
    return HTTPException(status_code=422, detail=str(exc))


_ERRORS = (store.InsufficientCreditsError, store.AlreadyHeldError, store.HoldingNotFoundError, store.InvalidReaderOperationError)


@router.get("", response_model=ReaderState)
def get_reader(root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return store.get_state(root)


@router.put("/plan", response_model=ReaderState)
def put_plan(body: PlanBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.set_plan(root, body.extraCredits)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/borrow", response_model=ReaderState)
def borrow(body: BorrowBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    book = _get_book(body.bookId, projects)
    if book.editions < 1:
        raise HTTPException(status_code=422, detail="this book has no edition to borrow yet")
    if not book.available:
        raise HTTPException(status_code=422, detail="this book is no longer available to borrow or buy")
    try:
        return store.borrow(root, body.bookId, body.credits)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/buy", response_model=ReaderState)
def buy(body: BuyBody, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    book = _get_book(body.bookId, projects)
    if book.editions < 1:
        raise HTTPException(status_code=422, detail="this book has no edition to buy yet")
    if not book.available:
        raise HTTPException(status_code=422, detail="this book is no longer available to borrow or buy")
    try:
        return store.buy(root, body.bookId)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/holdings/{holding_id}/open", response_model=ReaderState)
def open_holding(holding_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.mark_opened(root, holding_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/holdings/{holding_id}/return", response_model=ReaderState)
def return_holding(holding_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.return_holding(root, holding_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/holdings/{holding_id}/extend", response_model=ReaderState)
def extend_holding(holding_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.extend(root, holding_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/holdings/{holding_id}/lend", response_model=ReaderState)
def lend_holding(holding_id: str, body: LendBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.lend(root, holding_id, body.to, body.months)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/holdings/{holding_id}/recall", response_model=ReaderState)
def recall_holding(holding_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.recall(root, holding_id)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.post("/progress", response_model=ReaderState)
def post_progress(body: ProgressBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    try:
        return store.record_progress(root, body.bookId, body.pct, body.pages, body.minutes, body.newSession)
    except _ERRORS as exc:
        raise _translate(exc) from exc


@router.put("/wishlist/{book_id}", response_model=ReaderState)
def add_wishlist(book_id: str, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    _check_book(book_id, projects)
    return store.add_to_list(root, "wishlist", book_id)


@router.delete("/wishlist/{book_id}", response_model=ReaderState)
def remove_wishlist(book_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return store.remove_from_list(root, "wishlist", book_id)


@router.put("/to-read/{book_id}", response_model=ReaderState)
def add_to_read(book_id: str, root: Path = Depends(get_app_data_storage_root), projects: Path = Depends(get_storage_root)) -> ReaderState:
    _check_book(book_id, projects)
    return store.add_to_list(root, "toRead", book_id)


@router.delete("/to-read/{book_id}", response_model=ReaderState)
def remove_to_read(book_id: str, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return store.remove_from_list(root, "toRead", book_id)


@router.put("/flag-classes/{key}", response_model=ReaderState)
def put_flag_class(key: str, body: FlagClassBody, root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return store.set_flag_class(root, key, body.flagClass)


@router.post("/notifications/read", response_model=ReaderState)
def read_notifications(root: Path = Depends(get_app_data_storage_root)) -> ReaderState:
    return store.mark_notifications_read(root)
