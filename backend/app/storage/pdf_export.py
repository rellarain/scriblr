"""Renders a book's or chapter's drafted prose to a PDF with a clickable
table of contents and matching PDF outline/bookmarks, via fpdf2 -- the one
place in this app that isn't dependency-free (see the plan doc's rationale:
no dependency-free option can lay out paginated text with real internal
links)."""

import unicodedata
from pathlib import Path

from fpdf import FPDF
from fpdf.outline import OutlineSection

from . import project_store as store
from .project_store import MomentNotFoundError
from .schema import OutlineNode

# TOC/PDF-outline entries stop at "scene" -- a manuscript can have hundreds
# of moments, and a TOC entry per moment would make the TOC useless as
# navigation. Moment content still renders as prose, with its title as a
# small bolded lead-in (mirroring ChapterReadView.tsx), just not as its own
# section/bookmark.
HEADING_FONT_SIZES = {0: 20, 1: 17, 2: 15, 3: 13, 4: 12}


class OutlineNodeNotFoundError(Exception):
    def __init__(self, project_id: str, node_id: str) -> None:
        self.project_id = project_id
        self.node_id = node_id
        super().__init__(f"outline node not found: {project_id}/{node_id}")


# The PDF is set in a built-in font, which has only the Latin-1 characters; fpdf2 refuses any other (a curly quote or an em dash in ordinary prose
# raised an error and the export failed). Typographic punctuation is turned into its plain form, accented letters outside Latin-1 into their base
# letter, and anything else (CJK, emoji, ...) into "?" until a Unicode font is bundled.
_PLAIN = {
    "\u2018": "'", "\u2019": "'", "\u201a": ",", "\u201b": "'", "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2212": "-",
    "\u2026": "...", "\u2022": "*", "\u2023": "*", "\u25cf": "*", "\u2122": "(TM)", "\u20ac": "EUR",
    "\u00a0": " ", "\u2002": " ", "\u2003": " ", "\u2009": " ", "\u200a": " ", "\u202f": " ", "\u200b": "", "\ufeff": "", "\u2028": "\n", "\u2029": "\n",
}


def latin1_text(text: str) -> str:
    """`text` with every character the built-in PDF fonts lack replaced by a plain stand-in."""
    out: list[str] = []
    for ch in text:
        if ch in _PLAIN:
            out.append(_PLAIN[ch])
            continue
        try:
            ch.encode("latin-1")
            out.append(ch)
            continue
        except UnicodeEncodeError:
            pass
        base = "".join(c for c in unicodedata.normalize("NFKD", ch) if not unicodedata.combining(c))
        try:
            base.encode("latin-1")
            out.append(base if base else "?")
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out)


class _ProsePdf(FPDF):
    def normalize_text(self, text: str) -> str:
        return super().normalize_text(latin1_text(text))


def _children_by_parent(nodes: list[OutlineNode]) -> dict[str | None, list[OutlineNode]]:
    by_parent: dict[str | None, list[OutlineNode]] = {}
    for node in nodes:
        by_parent.setdefault(node.parentId, []).append(node)
    for children in by_parent.values():
        children.sort(key=lambda n: n.order)
    return by_parent


def _render_toc(pdf: FPDF, outline: list[OutlineSection]) -> None:
    pdf.set_font("helvetica", style="B", size=18)
    pdf.cell(0, text="Table of Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    for section in outline:
        link = pdf.add_link(page=section.page_number)
        size = HEADING_FONT_SIZES.get(section.level, 11)
        pdf.set_font("helvetica", size=max(size - 6, 10))
        indent = "    " * section.level
        pdf.cell(
            0,
            text=f"{indent}{section.name}",
            new_x="LMARGIN",
            new_y="NEXT",
            link=link,
        )


def _render_pdf(
    root: Path,
    project_id: str,
    title: str,
    nodes: list[OutlineNode],
    root_id: str,
    initial_chapter_id: str | None = None,
) -> bytes:
    by_parent = _children_by_parent(nodes)

    pdf = _ProsePdf()
    pdf.set_title(title)

    pdf.add_page()
    pdf.set_font("helvetica", style="B", size=26)
    pdf.ln(80)
    pdf.multi_cell(0, text=title or "Untitled", align="C")

    pdf.add_page()
    pdf.insert_toc_placeholder(_render_toc, pages=1)

    # insert_toc_placeholder already leaves the cursor on a fresh page, so
    # the very first top-level heading must not call add_page() again (that
    # would leave one blank page between the TOC and the content) -- every
    # top-level heading after the first still gets its own fresh page.
    first_top_level = True

    def walk(node_id: str, depth: int, chapter_id: str | None) -> None:
        nonlocal first_top_level
        for child in by_parent.get(node_id, []):
            child_chapter_id = child.id if child.kind == "chapter" else chapter_id
            if child.kind == "moment":
                pdf.set_font("helvetica", style="B", size=12)
                pdf.multi_cell(0, text=child.title or "Untitled", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font("helvetica", size=11)
                try:
                    body = store.load_draft(root, project_id, chapter_id, child.id).body if chapter_id else ""
                except MomentNotFoundError:
                    body = ""
                if body.strip():
                    pdf.multi_cell(0, text=body, markdown=True)
                else:
                    pdf.set_font("helvetica", style="I", size=11)
                    pdf.multi_cell(0, text="(empty)")
                pdf.ln(4)
            else:
                if depth == 0:
                    if first_top_level:
                        first_top_level = False
                    else:
                        pdf.add_page()
                pdf.start_section(child.title or "Untitled", level=depth)
                pdf.set_font("helvetica", style="B", size=HEADING_FONT_SIZES.get(depth, 11))
                pdf.multi_cell(0, text=child.title or "Untitled", new_x="LMARGIN", new_y="NEXT")
                pdf.ln(2)
            walk(child.id, depth + 1, child_chapter_id)

    walk(root_id, 0, initial_chapter_id)
    return bytes(pdf.output())


def build_book_pdf(root: Path, project_id: str, book_id: str) -> tuple[bytes, str]:
    with store.transaction(root, project_id):
        outline = store.load_outline(root, project_id)
        book = next((n for n in outline.nodes if n.id == book_id and n.kind == "book"), None)
        if book is None:
            raise OutlineNodeNotFoundError(project_id, book_id)
        return _render_pdf(root, project_id, book.title, outline.nodes, book.id), book.title


def build_chapter_pdf(root: Path, project_id: str, chapter_id: str) -> tuple[bytes, str]:
    with store.transaction(root, project_id):
        outline = store.load_outline(root, project_id)
        chapter = next((n for n in outline.nodes if n.id == chapter_id and n.kind == "chapter"), None)
        if chapter is None:
            raise OutlineNodeNotFoundError(project_id, chapter_id)
        return (
            _render_pdf(root, project_id, chapter.title, outline.nodes, chapter.id, initial_chapter_id=chapter.id),
            chapter.title,
        )
