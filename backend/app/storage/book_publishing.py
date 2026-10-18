"""Publishing a book to the Reader's library: its metadata (type, blurb, genres, tags, tropes, content flags, buy price), numbered editions (each a
frozen copy of the chapters published when the book was, with their footnotes and flagged passages), unlisting, who the author invites at which
level, and the author's footnotes and flagged passages on a chapter's sentences. Stored in project.json, per book and per chapter."""

import re
from pathlib import Path
from typing import Optional

from . import project_store as store
from .schema import (
    BookEdition,
    BookListing,
    BookMeta,
    ChapterAuthorNotes,
    EditionChapter,
    EditionFlagPassage,
    EditionFootnote,
    OutlineNode,
    ProjectFile,
    Publication,
    ReaderLevelName,
    utcnow,
)


class BookNotFoundError(Exception):
    def __init__(self, book_id: str) -> None:
        super().__init__(f"book not found: {book_id}")


class ChapterNotFoundError(Exception):
    def __init__(self, chapter_id: str) -> None:
        super().__init__(f"chapter not found: {chapter_id}")


class NothingToPublishError(ValueError):
    pass


class InvalidListingError(ValueError):
    pass


_SENTENCE = re.compile(r"[^.!?]+(?:[.!?]+[\"”’')\]]*)?\s*|[.!?]+[\"”’')\]]*\s*")


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def split_sentences(paragraph: str) -> list[str]:
    """The Writer's own split (frontend writer/sentences.ts): on terminal punctuation, keeping closing quotes and the space after."""
    return [p for p in _SENTENCE.findall(paragraph) if p.strip()]


def book_node(pf: ProjectFile, book_id: str) -> OutlineNode:
    for n in pf.outline.nodes:
        if n.id == book_id and n.kind == "book":
            return n
    raise BookNotFoundError(book_id)


def chapters_in_order(nodes: list[OutlineNode], book_id: str) -> list[OutlineNode]:
    """The book's chapters, depth-first in outline order (through arcs)."""
    children: dict[Optional[str], list[OutlineNode]] = {}
    for n in nodes:
        children.setdefault(n.parentId, []).append(n)
    out: list[OutlineNode] = []

    def walk(parent_id: str) -> None:
        for n in sorted(children.get(parent_id, []), key=lambda c: c.order):
            if n.kind == "chapter":
                out.append(n)
            else:
                walk(n.id)

    walk(book_id)
    return out


def latest_publication(pf: ProjectFile, chapter_id: str) -> Optional[Publication]:
    copies = pf.publications.get(chapter_id) or []
    return max(copies, key=lambda p: p.publishedAt) if copies else None


def publication_paragraphs(pub: Publication) -> list[str]:
    out: list[str] = []
    for section in pub.sections:
        out.extend(split_paragraphs(section.body))
    return out


def _sentence_exists(paragraphs: list[str], paragraph: int, sentence: int) -> bool:
    return paragraph < len(paragraphs) and sentence < len(split_sentences(paragraphs[paragraph]))


def _build_edition(pf: ProjectFile, book_id: str, listing: BookListing, n: int) -> BookEdition:
    flag_keys = {f.key for f in listing.meta.flags}
    chapters: list[EditionChapter] = []
    for chapter in chapters_in_order(pf.outline.nodes, book_id):
        pub = latest_publication(pf, chapter.id)
        if pub is None:
            continue
        number = len(chapters) + 1
        paragraphs = publication_paragraphs(pub)
        notes = pf.chapterNotes.get(chapter.id) or ChapterAuthorNotes()
        chapters.append(
            EditionChapter(
                chapterId=chapter.id,
                n=number,
                title=pub.title or chapter.title or f"Chapter {number}",
                words=sum(len(p.split()) for p in paragraphs),
                paragraphs=paragraphs,
                footnotes=[
                    EditionFootnote(id=f.id, key=f"c{number}:p{f.paragraph}:s{f.sentence}", title=f.title, text=f.text)
                    for f in notes.footnotes
                    if f.published and _sentence_exists(paragraphs, f.paragraph, f.sentence)
                ],
                flags=[
                    EditionFlagPassage(key=f"c{number}:p{f.paragraph}:s{f.sentence}", flagKey=f.flagKey)
                    for f in notes.flags
                    if f.flagKey in flag_keys and _sentence_exists(paragraphs, f.paragraph, f.sentence)
                ],
            )
        )
    if not chapters:
        raise NothingToPublishError("publish at least one chapter before publishing the book")
    return BookEdition(n=n, publishedAt=utcnow(), wordCount=sum(c.words for c in chapters), chapters=chapters)


def get_listing(root: Path, project_id: str, book_id: str) -> BookListing:
    pf, _errors = store._load_project_file(root, project_id)
    book_node(pf, book_id)
    return pf.bookListings.get(book_id) or BookListing()


def _edit(root: Path, project_id: str, book_id: str, fn) -> BookListing:
    result: list[BookListing] = []

    def apply(pf: ProjectFile) -> None:
        book_node(pf, book_id)
        listing = pf.bookListings.get(book_id) or BookListing()
        fn(pf, listing)
        pf.bookListings[book_id] = listing
        result.append(listing)

    store._mutate(root, project_id, apply)
    return result[0]


def update_meta(root: Path, project_id: str, book_id: str, meta: BookMeta) -> BookListing:
    keys = [f.key for f in meta.flags]
    if len(set(keys)) != len(keys):
        raise InvalidListingError("each flag needs its own key")

    def apply(pf: ProjectFile, listing: BookListing) -> None:
        listing.meta = meta

    return _edit(root, project_id, book_id, apply)


def publish_book(root: Path, project_id: str, book_id: str) -> BookListing:
    """Make a new edition from the chapters published so far, and list the book."""

    def apply(pf: ProjectFile, listing: BookListing) -> None:
        listing.editions.append(_build_edition(pf, book_id, listing, len(listing.editions) + 1))
        listing.listed = True

    return _edit(root, project_id, book_id, apply)


def unpublish_book(root: Path, project_id: str, book_id: str) -> BookListing:
    def apply(pf: ProjectFile, listing: BookListing) -> None:
        listing.listed = False

    return _edit(root, project_id, book_id, apply)


def set_invites(root: Path, project_id: str, book_id: str, invites: dict[str, ReaderLevelName]) -> BookListing:
    def apply(pf: ProjectFile, listing: BookListing) -> None:
        listing.invites = dict(invites)

    return _edit(root, project_id, book_id, apply)


def _chapter_node(pf: ProjectFile, chapter_id: str) -> OutlineNode:
    for n in pf.outline.nodes:
        if n.id == chapter_id and n.kind == "chapter":
            return n
    raise ChapterNotFoundError(chapter_id)


def get_chapter_notes(root: Path, project_id: str, chapter_id: str) -> ChapterAuthorNotes:
    pf, _errors = store._load_project_file(root, project_id)
    _chapter_node(pf, chapter_id)
    return pf.chapterNotes.get(chapter_id) or ChapterAuthorNotes()


def put_chapter_notes(root: Path, project_id: str, chapter_id: str, notes: ChapterAuthorNotes) -> ChapterAuthorNotes:
    ids = [f.id for f in notes.footnotes] + [f.id for f in notes.flags]
    if len(set(ids)) != len(ids):
        raise InvalidListingError("each footnote and flag needs its own id")

    def apply(pf: ProjectFile) -> None:
        _chapter_node(pf, chapter_id)
        if notes.footnotes or notes.flags:
            pf.chapterNotes[chapter_id] = notes
        else:
            pf.chapterNotes.pop(chapter_id, None)

    store._mutate(root, project_id, apply)
    return notes


def latest_edition(listing: BookListing) -> Optional[BookEdition]:
    return listing.editions[-1] if listing.editions else None
