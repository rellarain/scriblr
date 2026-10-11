"""The text a reader reads in PAGES: for a seeded book, lorem-ipsum chapters generated from its contents (the same every time); for the
author's own book, the chapters they published. What a reader may read depends on the level they were invited to: omega the whole final
edition, beta the final-draft chapters published so far, delta the draft chapters in progress, alpha the author's current draft.

A sentence is addressed by a key, `c<chapter>:p<paragraph>:s<sentence>` (all counted from 0 except the chapter): the reader's reactions,
flags and notes, the author's footnotes and flagged passages all use it. Sentences are split the way the Writer splits them
(on terminal punctuation), so the generated text is built from whole sentences that split back the same way."""

import math
import re
import zlib
from pathlib import Path
from typing import Optional

from . import social_seed
from .reader_schema import (
    ChapterFootnote,
    ChapterRef,
    ChapterText,
    CatalogBook,
    FlaggedPassage,
    ReaderLevel,
    SentenceTotal,
)

KEY_PATTERN = re.compile(r"^c\d{1,3}:p\d{1,4}:s\d{1,3}$")
PARAGRAPHS_PER_CHAPTER = 9

# The share of a book's chapters a reader can read at each level (omega is the final edition, so all of them).
LEVEL_SHARE: dict[str, float] = {"alpha": 1.0, "delta": 0.6, "beta": 0.8, "omega": 1.0}

_SENTENCES = [
    "The harbor woke before the town did, and the tide arrived early again.",
    "Rue counted the boats twice, because the ledger would count them only once.",
    "Nobody in the quay office asked why the second set of books was kept in a drawer of salt.",
    "A gull stood on the weir as if it were waiting to be paid.",
    "She wrote the date at the top of the page and then crossed it out.",
    "The master's hand was neat, and neatness was the first thing she distrusted.",
    "Fog came in low, took the far wall, and gave it back an hour later.",
    "There was a name painted over on the sea wall, and the paint was newer than the wall.",
    "He said the numbers were fine, which is what people say when they have checked them twice.",
    "By noon the water had the whole quay, and the lamps were lit against nothing.",
    "She read both books that night, one aloud and one in her head.",
    "The difference between them was small enough to hide and large enough to matter.",
    "Somewhere a rope creaked, patient as a clock.",
    "Nothing in the town was missing, only moved.",
    "The tide table said low water at four, and the tide table was wrong again.",
    "In the morning the lamps were still burning, and no one remembered lighting them.",
]
_FOOTNOTES = [
    ("The early tide", "In autumn the river weir makes the tide arrive early. See the glossary: weir."),
    ("The painted name", "The painted-over name returns in a later chapter."),
    ("The second set of books", "Harbor offices kept a working copy and a fair copy; the two are rarely the same."),
    ("Low water", "The tables in the appendix are for the old quay, not the new one."),
]
_DRAFT_NOTE = "Work in progress: this chapter is a draft and may change before the first edition."


def _h(*parts: object) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode("utf-8"))


def chapter_count(book: CatalogBook) -> int:
    return len(social_seed.chapters(book))


def _paragraph(book_id: str, chapter: int, index: int) -> str:
    count = 3 + _h(book_id, chapter, index, "n") % 3
    return " ".join(_SENTENCES[_h(book_id, chapter, index, i) % len(_SENTENCES)] for i in range(count))


def seeded_paragraphs(book_id: str, chapter: int) -> list[str]:
    return [_paragraph(book_id, chapter, i) for i in range(PARAGRAPHS_PER_CHAPTER)]


def readable_chapters(total: int, level: ReaderLevel) -> int:
    """How many chapters (from the first) a reader at this level can open."""
    return min(total, max(1, math.ceil(total * LEVEL_SHARE[level])))


def seeded_footnotes(book_id: str, chapter: int) -> list[ChapterFootnote]:
    """One or two author footnotes in a chapter, each on a sentence of the text."""
    out: list[ChapterFootnote] = []
    for i in range(1 + _h(book_id, chapter, "fn") % 2):
        title, text = _FOOTNOTES[_h(book_id, chapter, "fnt", i) % len(_FOOTNOTES)]
        paragraph = 1 + (i * 3 + _h(book_id, chapter, "fnp", i) % 3) % (PARAGRAPHS_PER_CHAPTER - 1)
        out.append(ChapterFootnote(id=f"fn-{book_id}-{chapter}-{i}", key=f"c{chapter}:p{paragraph}:s1", title=title, text=text))
    return out


def seeded_flag_passages(book: CatalogBook, chapter: int, total: int) -> list[FlaggedPassage]:
    """Each author flag sits on one passage: flag i is in chapter (i + 1) and, in a longer book, again two chapters on."""
    out: list[FlaggedPassage] = []
    for i, flag in enumerate(book.flags):
        spots = [(i % total) + 1] + ([((i + 2) % total) + 1] if total > 4 else [])
        if chapter in spots:
            out.append(FlaggedPassage(key=f"c{chapter}:p{2 + i % 4}:s0", flagKey=flag.key, name=flag.name, detail=flag.detail, defaultClass=flag.defaultClass))
    return out


def seeded_totals(book: CatalogBook, chapter: int, paragraphs: list[str]) -> tuple[int, int, int, list[SentenceTotal]]:
    """What other readers marked in a chapter, anonymously: (readers, pleasant, unpleasant, the most-marked sentences)."""
    readers = max(1, book.readers // 8)
    sentences: list[SentenceTotal] = []
    for p, text in enumerate(paragraphs):
        for s in range(len(re.findall(r"[.!?]", text))):
            seed = _h(book.id, chapter, p, s, "react")
            if seed % 4 == 0:
                sentences.append(SentenceTotal(key=f"c{chapter}:p{p}:s{s}", pleasant=(seed >> 3) % max(2, readers // 3), unpleasant=(seed >> 9) % max(2, readers // 8)))
    pleasant = sum(t.pleasant for t in sentences)
    unpleasant = sum(t.unpleasant for t in sentences)
    top = sorted(sentences, key=lambda t: -(t.pleasant + t.unpleasant))[:5]
    return readers, pleasant, unpleasant, top


def seeded_chapter(book: CatalogBook, n: int, level: ReaderLevel) -> ChapterText:
    paragraphs = seeded_paragraphs(book.id, n)
    total = chapter_count(book)
    ref = next((r for r in seeded_refs(book, level) if r.n == n), None)
    return ChapterText(
        bookId=book.id,
        n=n,
        title=ref.title if ref else f"Chapter {n}",
        # The chapter's length as the book's contents give it (the generated text is only a sample of it).
        words=ref.words if ref else sum(len(p.split()) for p in paragraphs),
        paragraphs=paragraphs,
        footnotes=seeded_footnotes(book.id, n),
        flags=seeded_flag_passages(book, n, total),
        level=level,
        draft=level in ("alpha", "delta"),
        draftNote=_DRAFT_NOTE if level in ("alpha", "delta") else "",
    )


def seeded_refs(book: CatalogBook, level: ReaderLevel) -> list[ChapterRef]:
    chapters = social_seed.chapters(book)
    open_to = readable_chapters(len(chapters), level)
    return [
        ChapterRef(n=c.n, title=c.title, words=c.words, available=c.n <= open_to, reason="" if c.n <= open_to else "Not published yet at your level.")
        for c in chapters
    ]


def clean_key(key: str) -> Optional[str]:
    return key if KEY_PATTERN.match(key) else None


def chapter_of_key(key: str) -> int:
    return int(key.split(":", 1)[0][1:])


def local_paragraphs(root: Path, project_id: str, chapter_id: str) -> Optional[tuple[str, list[str]]]:
    """The newest published copy of one of the author's chapters: its title and paragraphs (blank-line separated, as the Writer splits them)."""
    from . import project_store as store

    copies = store.list_publications(root, project_id, chapter_id)
    if not copies:
        return None
    latest = copies[0]
    paragraphs: list[str] = []
    for section in latest.sections:
        paragraphs.extend(p.strip() for p in re.split(r"\n\s*\n", section.body) if p.strip())
    return latest.title, paragraphs
