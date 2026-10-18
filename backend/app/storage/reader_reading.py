"""Reading in PAGES: what a reader may open (by level, and by borrowing or owning), the chapter text with its footnotes and flagged passages,
the reader's own marks (reactions and flags on sentences), their settings and flags, and where they stopped. Reads are pure; writes go
through reader_store's lock like the rest of the account. Nothing leaves the machine: the totals other readers appear in are a fixed
demonstration, and the reader's own marks join them only if they choose to share."""

from datetime import datetime
from pathlib import Path

from . import library, project_store, reading_text
from .reader_schema import (
    ActivityDay,
    BookText,
    CatalogBook,
    ChapterFootnote,
    ChapterRef,
    ChapterText,
    FlaggedPassage,
    Mark,
    MyFlag,
    Position,
    ReactionTotals,
    ReaderFile,
    ReaderLevel,
    ReaderSettings,
    ReaderState,
    ReadingPosition,
    SentenceTotal,
)
from .reader_store import InvalidReaderOperationError, _mutate
from .social_views import effective_levels

MAX_MY_FLAGS = 20
LEVEL_FREE = ("alpha", "delta")


class ReadingError(Exception):
    """A page that cannot be opened; `status` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 403) -> None:
        super().__init__(message)
        self.status = status


def level_of(rf: ReaderFile, book_id: str) -> ReaderLevel:
    info = effective_levels(rf).get(book_id)
    return info.level if info else "omega"


def access(rf: ReaderFile, book: CatalogBook, level: ReaderLevel) -> tuple[bool, str]:
    """May this reader open the book at this level? Alpha and delta are free; beta and omega need a loan or a purchase. An author reads their own books."""
    if book.source == "local" or level in LEVEL_FREE:
        return True, ""
    if any(h.bookId == book.id and h.status == "active" for h in rf.holdings):
        return True, ""
    return False, "Borrow or buy this book to read it."


def _local_edition(root: Path, book: CatalogBook):
    """The newest edition of one of the author's books (what readers read), or None."""
    if not book.projectId or not book.bookId:
        return None
    try:
        pf, _errors = project_store._load_project_file(root, book.projectId)
    except (project_store.ProjectNotFoundError, project_store.ShardCorruptError):
        return None
    listing = pf.bookListings.get(book.bookId)
    return listing.editions[-1] if listing and listing.editions else None


def book_text(rf: ReaderFile, root: Path, book: CatalogBook) -> BookText:
    level = level_of(rf, book.id)
    can, reason = access(rf, book, level)
    if book.source == "local":
        edition = _local_edition(root, book)
        chapters = [ChapterRef(n=c.n, title=c.title, words=c.words, available=True) for c in edition.chapters] if edition else []
    else:
        chapters = reading_text.seeded_refs(book, level)
    if book.editions < 1 and level not in LEVEL_FREE and book.source != "local":
        can, reason = False, "This book has no edition yet."
    return BookText(bookId=book.id, level=level, canRead=can, reason=reason, chapters=chapters)


def chapter_text(rf: ReaderFile, root: Path, book: CatalogBook, n: int) -> ChapterText:
    text = book_text(rf, root, book)
    if not text.canRead:
        raise ReadingError(text.reason, 403)
    ref = next((c for c in text.chapters if c.n == n), None)
    if ref is None:
        raise ReadingError(f"chapter {n} not found", 404)
    if not ref.available:
        raise ReadingError(ref.reason or "This chapter is not available at your level.", 403)
    if book.source == "local":
        edition = _local_edition(root, book)
        chapter = next(c for c in (edition.chapters if edition else []) if c.n == n)
        flags = {f.key: f for f in book.flags}
        return ChapterText(
            bookId=book.id,
            n=n,
            title=chapter.title,
            words=chapter.words,
            paragraphs=chapter.paragraphs,
            footnotes=[ChapterFootnote(id=f.id, key=f.key, title=f.title, text=f.text) for f in chapter.footnotes],
            flags=[
                FlaggedPassage(key=f.key, flagKey=f.flagKey, name=flags[f.flagKey].name, detail=flags[f.flagKey].detail, defaultClass=flags[f.flagKey].defaultClass)
                for f in chapter.flags
                if f.flagKey in flags
            ],
            level=text.level,
        )
    chapter = reading_text.seeded_chapter(book, n, text.level)
    return chapter


def reaction_totals(rf: ReaderFile, root: Path, book: CatalogBook, n: int) -> ReactionTotals:
    marks = {k: m for k, m in rf.marks.get(book.id, {}).items() if reading_text.chapter_of_key(k) == n}
    mine = sum(1 for m in marks.values() if m.like or m.dislike)
    if book.source == "local":
        readers, pleasant, unpleasant, top = 0, 0, 0, []
    else:
        chapter = reading_text.seeded_paragraphs(book.id, n)
        readers, pleasant, unpleasant, top = reading_text.seeded_totals(book, n, chapter)
    if rf.settings.shareReactions and mine:
        readers += 1
        pleasant += sum(1 for m in marks.values() if m.like)
        unpleasant += sum(1 for m in marks.values() if m.dislike)
        merged = {t.key: t for t in top}
        for k, m in marks.items():
            if m.like or m.dislike:
                t = merged.get(k) or SentenceTotal(key=k)
                merged[k] = SentenceTotal(key=k, pleasant=t.pleasant + (1 if m.like else 0), unpleasant=t.unpleasant + (1 if m.dislike else 0))
        top = sorted(merged.values(), key=lambda t: -(t.pleasant + t.unpleasant))[:5]
    return ReactionTotals(chapter=n, readers=readers, pleasant=pleasant, unpleasant=unpleasant, top=top, mine=mine)


# ---------------------------------------------------------------------------------------------------------------------- writes


def set_settings(root: Path, settings: ReaderSettings) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.settings = settings

    return _mutate(root, apply)


def set_mark(root: Path, book_id: str, key: str, like: int, dislike: int, flags: list[str], valid_flags: set[str]) -> ReaderState:
    if reading_text.clean_key(key) is None:
        raise InvalidReaderOperationError("not a sentence key")
    if not (0 <= like <= 3 and 0 <= dislike <= 3):
        raise InvalidReaderOperationError("a reaction is 0 to 3")

    def apply(rf: ReaderFile, now: datetime) -> None:
        known = valid_flags | {f.key for f in rf.myFlags}
        unknown = [f for f in flags if f not in known]
        if unknown:
            raise InvalidReaderOperationError(f"unknown flag: {unknown[0]}")
        book_marks = rf.marks.setdefault(book_id, {})
        mark = Mark(like=like, dislike=dislike, flags=list(dict.fromkeys(flags)))
        if mark.like == 0 and mark.dislike == 0 and not mark.flags:
            book_marks.pop(key, None)
        else:
            book_marks[key] = mark
        if not book_marks:
            rf.marks.pop(book_id, None)

    return _mutate(root, apply)


def marks_for(rf: ReaderFile, book_id: str) -> dict[str, Mark]:
    return rf.marks.get(book_id, {})


def add_my_flag(root: Path, name: str) -> ReaderState:
    name = name.strip()
    if not name:
        raise InvalidReaderOperationError("name the flag")

    def apply(rf: ReaderFile, now: datetime) -> None:
        if len(rf.myFlags) >= MAX_MY_FLAGS:
            raise InvalidReaderOperationError(f"keep at most {MAX_MY_FLAGS} flags of your own")
        if any(f.name.lower() == name.lower() for f in rf.myFlags):
            raise InvalidReaderOperationError("you already have a flag with that name")
        rf.myFlags.append(MyFlag(key=project_store.new_id("flag"), name=name))

    return _mutate(root, apply)


def delete_my_flag(root: Path, key: str) -> ReaderState:
    def apply(rf: ReaderFile, now: datetime) -> None:
        rf.myFlags = [f for f in rf.myFlags if f.key != key]
        rf.flagClasses.pop(key, None)
        for book_marks in rf.marks.values():
            for k, m in list(book_marks.items()):
                m.flags = [f for f in m.flags if f != key]
                if m.like == 0 and m.dislike == 0 and not m.flags:
                    del book_marks[k]

    return _mutate(root, apply)


def record_reading(root: Path, book_id: str, chapter: int, paragraph: int, pct: float, pages: int, minutes: int, new_session: bool, device: str) -> ReaderState:
    """Where the reader is, and what they read in this stretch (pages and minutes feed the activity calendar). Free-level reading needs no loan."""

    def apply(rf: ReaderFile, now: datetime) -> None:
        for h in rf.holdings:
            if h.bookId == book_id and h.status == "active" and not h.opened:
                h.opened, h.openedAt = True, now
        rf.positions[book_id] = Position(chapter=chapter, paragraph=paragraph, device=device.strip() or "This computer", at=now)
        position = rf.progress.get(book_id) or ReadingPosition()
        position.pct = max(0.0, min(100.0, pct))
        position.pages += max(0, pages)
        position.updatedAt = now
        if position.pct >= 90.0 and position.finishedAt is None:
            position.finishedAt = now
        rf.progress[book_id] = position
        day = rf.activity.setdefault(now.date().isoformat(), ActivityDay())
        day.pages += max(0, pages)
        day.minutes += max(0, minutes)
        if new_session:
            day.sessions += 1

    return _mutate(root, apply)


def get_book(projects_root: Path, book_id: str) -> CatalogBook:
    return library.get_book(projects_root, book_id)
