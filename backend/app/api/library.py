from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import library, reader_store, social_seed
from ..storage.reader_schema import AuthorDetail, Author, BookDetail, BookPage, CatalogBook, ReaderProfile, Recommendation

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("/books", response_model=BookPage)
def list_books(
    q: str = "",
    type: list[str] = Query(default=[]),
    genre: list[str] = Query(default=[]),
    author: list[str] = Query(default=[]),
    trope: list[str] = Query(default=[]),
    tag: list[str] = Query(default=[]),
    hideFlag: list[str] = Query(default=[]),
    minRating: float = 0.0,
    minWords: int = 0,
    maxWords: Optional[int] = None,
    minReaders: int = 0,
    sort: str = "popularity",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    root: Path = Depends(get_storage_root),
) -> BookPage:
    return library.search_books(
        root,
        q=q,
        types=type or None,
        genres=genre or None,
        authors=author or None,
        tropes=trope or None,
        tags=tag or None,
        hide_flags=hideFlag or None,
        min_rating=minRating,
        min_words=minWords,
        max_words=maxWords,
        min_readers=minReaders,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/books/{book_id}", response_model=CatalogBook)
def get_book(book_id: str, root: Path = Depends(get_storage_root)) -> CatalogBook:
    try:
        return library.get_book(root, book_id)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/authors", response_model=list[Author])
def list_authors(root: Path = Depends(get_storage_root)) -> list[Author]:
    return library.list_authors(root)


@router.get("/authors/{author_id}", response_model=AuthorDetail)
def get_author(author_id: str, root: Path = Depends(get_storage_root)) -> AuthorDetail:
    detail = library.author_detail(root, author_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"author not found: {author_id}")
    return detail


# The Display Case: books that fit what this reader has read and kept, each with why.
@router.get("/recommendations", response_model=list[Recommendation])
def recommendations(
    limit: int = Query(default=6, ge=1, le=24),
    root: Path = Depends(get_storage_root),
    app_root: Path = Depends(get_app_data_storage_root),
) -> list[Recommendation]:
    return library.recommend(root, reader_store.load_file(app_root), limit)


@router.get("/books/{book_id}/detail", response_model=BookDetail)
def get_book_detail(book_id: str, root: Path = Depends(get_storage_root)) -> BookDetail:
    try:
        book = library.get_book(root, book_id)
    except library.BookNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    clubs = sum(1 for c in social_seed.clubs(datetime.now(timezone.utc)) if c.bookId == book_id)
    return social_seed.book_detail(book, readers_now=max(1, book.readers // 4), club_count=clubs)


@router.get("/readers", response_model=list[ReaderProfile])
def list_readers() -> list[ReaderProfile]:
    return social_seed.readers()
