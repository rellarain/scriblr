"""What an export holds, read once from the project: the books in outline order, each book's chapters, each chapter's text as the Preview lays it
out (paragraphs on blank lines, sentences on terminal punctuation: `frontend/.../writer/sentences.ts`, whose rules these copy), and the author's
footnotes on its sentences. The PDF and EPUB exports are built from this; the JSON export reads the project itself."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from . import project_store as store
from .schema import OutlineNode, PreviewFormat, ProjectFile

ExportScope = Literal["project", "book", "chapter"]

_PARAGRAPH_GAP = re.compile(r"\n\s*\n")
_SENTENCE = re.compile(r"""[^.!?]+(?:[.!?]+["”’')\]]*)?\s*|[.!?]+["”’')\]]*\s*""")


class OutlineNodeNotFoundError(Exception):
    def __init__(self, project_id: str, node_id: str) -> None:
        self.project_id = project_id
        self.node_id = node_id
        super().__init__(f"outline node not found: {project_id}/{node_id}")


def split_paragraphs(text: str) -> list[str]:
    """The paragraphs of a moment's text: split on blank lines, trimmed, the empty ones left out (sentences.ts, splitParagraphs)."""
    return [p.strip() for p in _PARAGRAPH_GAP.split(text) if p.strip()]


def split_sentences(paragraph: str) -> list[str]:
    """A paragraph's sentences, each with the closing quotes and the space after it, so they join back into the paragraph (splitSentences)."""
    return [s for s in _SENTENCE.findall(paragraph) if s.strip()]


def sentence_ranges(body: str) -> list[tuple[int, int, int, int]]:
    """Where each sentence of a moment's text is: (paragraph, sentence, start, end) in characters of `body`, the paragraphs counted from 0 in
    the moment as `split_paragraphs` counts them, the end before the sentence's trailing space (sentences.ts, sentenceRanges)."""
    pieces: list[tuple[str, int]] = []
    start = 0
    for gap in _PARAGRAPH_GAP.finditer(body):
        pieces.append((body[start:gap.start()], start))
        start = gap.end()
    pieces.append((body[start:], start))
    out: list[tuple[int, int, int, int]] = []
    paragraph = 0
    for piece, at in pieces:
        text = piece.strip()
        if not text:
            continue
        offset = at + len(piece) - len(piece.lstrip())
        for i, sentence in enumerate(split_sentences(text)):
            out.append((paragraph, i, offset, offset + len(sentence.rstrip())))
            offset += len(sentence)
        paragraph += 1
    return out


@dataclass
class Footnote:
    number: int  # counted from 1 in its chapter
    title: str
    text: str


@dataclass
class MarginFlag:
    """An open revision flag on a sentence, for the PDF's margin."""
    sentence: int  # the sentence it starts in, counted from 0 in its paragraph
    kind: str  # review, add, remove, merge, change, simplify or expand
    note: str


@dataclass
class Paragraph:
    # The paragraph's sentences, each with the numbers of the footnotes that follow it.
    sentences: list[tuple[str, list[int]]]
    flags: list[MarginFlag] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(s for s, _ in self.sentences).strip()


@dataclass
class Chapter:
    id: str
    number: int  # its place among its book's chapters, from 1 (as the Preview numbers it)
    title: str
    paragraphs: list[Paragraph] = field(default_factory=list)
    footnotes: list[Footnote] = field(default_factory=list)


@dataclass
class Book:
    id: str
    title: str
    synopsis: str
    hue: int | None  # the book's own colour (0-360), for an EPUB cover; None: the project's
    format: PreviewFormat
    chapters: list[Chapter] = field(default_factory=list)


@dataclass
class ExportDoc:
    project_id: str
    project_title: str
    scope: ExportScope
    title: str  # what the file is called and its title page says: the project's, the book's or the chapter's title
    books: list[Book]


def _children(nodes: list[OutlineNode]) -> dict[str | None, list[OutlineNode]]:
    by_parent: dict[str | None, list[OutlineNode]] = {}
    for node in nodes:
        by_parent.setdefault(node.parentId, []).append(node)
    for kids in by_parent.values():
        kids.sort(key=lambda n: n.order)
    return by_parent


def _descendants(by_parent: dict[str | None, list[OutlineNode]], node_id: str | None) -> list[OutlineNode]:
    """Every node under `node_id`, in outline order (depth first)."""
    out: list[OutlineNode] = []
    for child in by_parent.get(node_id, []):
        out.append(child)
        out.extend(_descendants(by_parent, child.id))
    return out


def _chapter(pf: ProjectFile, by_parent: dict[str | None, list[OutlineNode]], node: OutlineNode, number: int) -> Chapter:
    moments = [n for n in _descendants(by_parent, node.id) if n.kind == "moment"]
    drafts = pf.drafts.get(node.id)
    bodies = {m.id: drafts.moments[m.id].body if drafts and m.id in drafts.moments else "" for m in moments}
    texts: list[str] = []
    first_paragraph: dict[str, int] = {}  # each moment's first paragraph, counted across the chapter
    for m in moments:
        first_paragraph[m.id] = len(texts)
        texts += split_paragraphs(bodies[m.id])
    # The author's footnotes, by the paragraph and sentence they are on (counted from 0 across the chapter), numbered in the order they appear.
    notes = pf.chapterNotes.get(node.id)
    placed = sorted(
        (f for f in (notes.footnotes if notes else []) if f.published and f.paragraph < len(texts)),
        key=lambda f: (f.paragraph, f.sentence),
    )
    footnotes: list[Footnote] = []
    at: dict[tuple[int, int], list[int]] = {}
    for f in placed:
        sentence_count = len(split_sentences(texts[f.paragraph]))
        if f.sentence >= sentence_count:
            continue
        footnotes.append(Footnote(number=len(footnotes) + 1, title=f.title, text=f.text))
        at.setdefault((f.paragraph, f.sentence), []).append(len(footnotes))
    paragraphs = [Paragraph([(s, at.get((pi, si), [])) for si, s in enumerate(split_sentences(text))]) for pi, text in enumerate(texts)]
    # The open revision flags on its passages, on the sentence each starts in (a flag whose text is gone is left out).
    for flag in sorted(pf.revisionFlags, key=lambda f: f.start):
        if flag.scope != "passage" or flag.chapterId != node.id or flag.resolvedAt is not None or flag.stale or flag.momentId not in bodies:
            continue
        ranges = [r for r in sentence_ranges(bodies[flag.momentId]) if r[2] <= flag.start]
        if ranges:
            pi, si = ranges[-1][0], ranges[-1][1]
            paragraphs[first_paragraph[flag.momentId] + pi].flags.append(MarginFlag(sentence=si, kind=flag.type, note=flag.note))
    return Chapter(id=node.id, number=number, title=node.title, paragraphs=paragraphs, footnotes=footnotes)


def _book(pf: ProjectFile, by_parent: dict[str | None, list[OutlineNode]], node: OutlineNode, only_chapter: str | None = None) -> Book:
    chapters = [n for n in _descendants(by_parent, node.id) if n.kind == "chapter"]
    return Book(
        id=node.id, title=node.title, synopsis=node.synopsis, hue=node.themeHue, format=node.previewFormat or PreviewFormat(),
        chapters=[_chapter(pf, by_parent, c, i + 1) for i, c in enumerate(chapters) if only_chapter is None or c.id == only_chapter],
    )


def collect(root: Path, project_id: str, scope: ExportScope, target_id: str | None = None) -> ExportDoc:
    """The export of a whole project, one book or one chapter (`target_id` names the book or chapter). Unknown targets raise OutlineNodeNotFoundError."""
    pf = store.load_project(root, project_id)
    nodes = pf.outline.nodes
    by_parent = _children(nodes)
    by_id = {n.id: n for n in nodes}
    title = pf.index.title
    if scope == "project":
        books = [_book(pf, by_parent, n) for n in _descendants(by_parent, None) if n.kind == "book"]
        return ExportDoc(project_id, title, scope, title, books)
    target = by_id.get(target_id or "")
    if target is None or target.kind != scope:
        raise OutlineNodeNotFoundError(project_id, target_id or "")
    if scope == "book":
        return ExportDoc(project_id, title, scope, target.title, [_book(pf, by_parent, target)])
    book = by_id.get(target.parentId or "")
    while book is not None and book.kind != "book":
        book = by_id.get(book.parentId or "")
    if book is None:  # a chapter outside any book: it stands alone, in the preview's own look
        alone = Book(id="", title=title, synopsis="", hue=None, format=PreviewFormat(), chapters=[_chapter(pf, by_parent, target, 1)])
        return ExportDoc(project_id, title, scope, target.title, [alone])
    return ExportDoc(project_id, title, scope, target.title, [_book(pf, by_parent, book, only_chapter=target.id)])
