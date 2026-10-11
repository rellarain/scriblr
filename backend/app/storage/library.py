"""The library: every book a reader can find. The seeded demo shelf, plus the author's own books that have a published chapter (so
what is published from the Writer appears among the others). Browsing, filtering and the Display Case's recommendations."""

from pathlib import Path
from typing import Optional

from . import project_store as store
from .book_progress import _ancestor_of_kind
from .library_seed import seed_authors, seed_books
from .reader_schema import (
    Author,
    AuthorDetail,
    BookPage,
    CatalogBook,
    ReaderFile,
    Recommendation,
)

LOCAL_AUTHOR_ID = "you"
LOCAL_AUTHOR_NAME = "You"


class BookNotFoundError(Exception):
    def __init__(self, book_id: str) -> None:
        super().__init__(f"book not found: {book_id}")
        self.book_id = book_id


def local_books(root: Path) -> list[CatalogBook]:
    """The author's own books with at least one published chapter."""
    out: list[CatalogBook] = []
    for index in store.list_projects(root):
        try:
            pf, _errors = store._load_project_file(root, index.projectId)
        except (store.ProjectNotFoundError, store.ShardCorruptError):
            continue
        nodes = pf.outline.nodes
        by_id = {n.id: n for n in nodes}
        for book in (n for n in nodes if n.kind == "book"):
            published = []
            for chapter in (n for n in nodes if n.kind == "chapter" and _ancestor_of_kind(by_id, n.id, "book") == book.id):
                copies = pf.publications.get(chapter.id) or []
                if copies:
                    published.append(max(copies, key=lambda p: p.publishedAt))
            if not published:
                continue
            latest = max(p.publishedAt for p in published)
            out.append(
                CatalogBook(
                    id=f"local-{index.projectId}-{book.id}",
                    title=book.title or "Untitled",
                    authorId=LOCAL_AUTHOR_ID,
                    authorName=LOCAL_AUTHOR_NAME,
                    type="novel",
                    wordCount=sum(p.wordCount for p in published),
                    hue=book.themeHue if getattr(book, "themeHue", None) is not None else 28,
                    blurb=book.synopsis,
                    editions=1,
                    publishedAt=latest.date().isoformat(),
                    source="local",
                    projectId=index.projectId,
                    bookId=book.id,
                )
            )
    return out


def all_books(root: Path) -> list[CatalogBook]:
    return seed_books() + local_books(root)


def get_book(root: Path, book_id: str) -> CatalogBook:
    for book in all_books(root):
        if book.id == book_id:
            return book
    raise BookNotFoundError(book_id)


def list_authors(root: Path) -> list[Author]:
    authors = seed_authors()
    mine = [b for b in local_books(root)]
    if mine:
        authors.append(Author(id=LOCAL_AUTHOR_ID, name=LOCAL_AUTHOR_NAME, books=len(mine), readers=0))
    return authors


def author_detail(root: Path, author_id: str) -> Optional[AuthorDetail]:
    author = next((a for a in list_authors(root) if a.id == author_id), None)
    if author is None:
        return None
    books = sorted((b for b in all_books(root) if b.authorId == author_id), key=lambda b: (b.series.id if b.series else "", b.series.order if b.series else 0, b.title))
    return AuthorDetail(author=author, books=books)


_SORTS = {
    "popularity": lambda b: (-b.popularity, b.title),
    "rating": lambda b: (-b.rating, -b.ratings, b.title),
    "words": lambda b: (-b.wordCount, b.title),
    "newest": lambda b: (b.publishedAt or "", b.title),
    "title": lambda b: (b.title.lower(),),
}


def search_books(
    root: Path,
    *,
    q: str = "",
    types: Optional[list[str]] = None,
    genres: Optional[list[str]] = None,
    authors: Optional[list[str]] = None,
    tropes: Optional[list[str]] = None,
    tags: Optional[list[str]] = None,
    hide_flags: Optional[list[str]] = None,
    min_rating: float = 0.0,
    min_words: int = 0,
    max_words: Optional[int] = None,
    min_readers: int = 0,
    sort: str = "popularity",
    limit: int = 50,
    offset: int = 0,
) -> BookPage:
    needle = q.strip().lower()
    result: list[CatalogBook] = []
    for b in all_books(root):
        if needle and needle not in " ".join([b.title, b.authorName, *b.tags, *b.tropes, *b.genres]).lower():
            continue
        if types and b.type not in types:
            continue
        if genres and not set(genres) & set(b.genres):
            continue
        if authors and b.authorId not in authors:
            continue
        if tropes and not set(tropes) & set(b.tropes):
            continue
        if tags and not set(tags) & set(b.tags):
            continue
        if hide_flags and {f.key for f in b.flags} & set(hide_flags):
            continue
        if b.rating < min_rating or b.wordCount < min_words or b.readers < min_readers:
            continue
        if max_words is not None and b.wordCount > max_words:
            continue
        result.append(b)
    result.sort(key=_SORTS.get(sort, _SORTS["popularity"]))
    return BookPage(total=len(result), books=result[offset : offset + limit])


def _finished(reader: ReaderFile, book_id: str) -> bool:
    position = reader.progress.get(book_id)
    return bool(position and (position.finishedAt is not None or position.pct >= 90.0))


def recommend(root: Path, reader: ReaderFile, limit: int = 6) -> list[Recommendation]:
    """The Display Case: books that fit what the reader has read, with why. Signals: shared genres and tropes, the same author, the
    next book of a series being read, books readers rate highly, and the reader's own wishlist. A book carrying a flag the reader hides
    is never recommended; neither is one they already have or have finished."""
    books = all_books(root)
    by_id = {b.id: b for b in books}
    has = {h.bookId for h in reader.holdings if h.status == "active"} | {h.bookId for h in reader.holdings if h.opened}
    read_ids = {bid for bid in reader.progress if _finished(reader, bid)} | {h.bookId for h in reader.holdings if h.opened}
    read = [by_id[i] for i in read_ids if i in by_id]
    read_genres = {g for b in read for g in b.genres}
    read_tropes = {t for b in read for t in b.tropes}
    read_authors = {b.authorId: b.authorName for b in read}
    read_series = {b.series.id: b.series.order for b in read if b.series}
    hidden = {key for key, cls in reader.flagClasses.items() if cls == "hidden"}

    out: list[Recommendation] = []
    for b in books:
        if b.id in has or b.id in read_ids or b.editions < 1:
            continue
        if hidden & {f.key for f in b.flags}:
            continue
        score = 20
        why: list[str] = []
        if b.series and b.series.id in read_series and b.series.order == read_series[b.series.id] + 1:
            score += 25
            why.append(f"The next book of {b.series.title}, which you are reading.")
        if b.authorId in read_authors:
            score += 20
            why.append(f"More by {read_authors[b.authorId]}, whose book you read.")
        shared_genres = sorted(set(b.genres) & read_genres)
        if shared_genres:
            score += min(24, 12 * len(shared_genres))
            why.append("Shares the genre " + ", ".join(shared_genres) + " with what you read.")
        shared_tropes = sorted(set(b.tropes) & read_tropes)
        if shared_tropes:
            score += min(30, 10 * len(shared_tropes))
            why.append("Shares the tropes " + ", ".join(shared_tropes) + ".")
        if b.rating >= 8.5 and b.ratings >= 300:
            score += 8
            why.append(f"Readers rate it {b.rating:.1f} of 10.")
        if b.id in reader.wishlist:
            score += 10
            why.append("It is on your wishlist.")
        if not why:
            why.append("Popular with readers right now.")
        out.append(Recommendation(book=b, match=min(99, score), why=why))
    out.sort(key=lambda r: (-r.match, -r.book.popularity, r.book.title))
    return out[:limit]
