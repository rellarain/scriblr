"""Renders a book's or chapter's drafted prose to a PDF with a clickable
table of contents and matching PDF outline/bookmarks, via fpdf2 -- the one
place in this app that isn't dependency-free (see the plan doc's rationale:
no dependency-free option can lay out paginated text with real internal
links)."""

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


def _render_pdf(root: Path, project_id: str, title: str, nodes: list[OutlineNode], root_id: str) -> bytes:
    by_parent = _children_by_parent(nodes)

    pdf = FPDF()
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

    def walk(node_id: str, depth: int) -> None:
        nonlocal first_top_level
        for child in by_parent.get(node_id, []):
            if child.kind == "moment":
                pdf.set_font("helvetica", style="B", size=12)
                pdf.multi_cell(0, text=child.title or "Untitled", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font("helvetica", size=11)
                try:
                    body = store.load_draft(root, project_id, child.id).body
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
            walk(child.id, depth + 1)

    walk(root_id, 0)
    return bytes(pdf.output())


def build_book_pdf(root: Path, project_id: str, book_id: str) -> tuple[bytes, str]:
    outline = store.load_outline(root, project_id)
    book = next((n for n in outline.nodes if n.id == book_id and n.kind == "book"), None)
    if book is None:
        raise OutlineNodeNotFoundError(project_id, book_id)
    return _render_pdf(root, project_id, book.title, outline.nodes, book.id), book.title


def build_chapter_pdf(root: Path, project_id: str, chapter_id: str) -> tuple[bytes, str]:
    outline = store.load_outline(root, project_id)
    chapter = next((n for n in outline.nodes if n.id == chapter_id and n.kind == "chapter"), None)
    if chapter is None:
        raise OutlineNodeNotFoundError(project_id, chapter_id)
    return _render_pdf(root, project_id, chapter.title, outline.nodes, chapter.id), chapter.title
