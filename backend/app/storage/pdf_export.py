"""A project, a book or a chapter as a PDF, laid out as the Preview lays it out (the book's preview formatting: font, size, style, alignment, line
spacing, indent and paragraph spacing), with a title page, a contents page that links to each chapter, page numbers and the author's footnotes.

Any script prints: the text is set in fonts that come with the app (`app/fonts`, Noto under the SIL Open Font License; see its README), fpdf2
embeds only the glyphs used, takes what the book's font lacks from the symbol, emoji and script fonts in turn, and shapes Arabic, Hebrew and Indic
text with HarfBuzz (uharfbuzz)."""

from __future__ import annotations

import colorsys
import math
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from .export_content import Chapter, ExportDoc, MarginFlag, OutlineNodeNotFoundError, collect
from .schema import PreviewFormat

if TYPE_CHECKING:  # fpdf2 (with its font and image libraries) takes about 300 ms to import: only an export needs it
    from fpdf import FPDF
    from fpdf.outline import OutlineSection

__all__ = ["PdfOptions", "build_pdf", "build_book_pdf", "build_chapter_pdf", "OutlineNodeNotFoundError", "FONT_DIR"]

# Next to the app's code, or in the packaged app (scriblr.spec bundles them as app/fonts).
FONT_DIR = (Path(sys._MEIPASS) / "app" if hasattr(sys, "_MEIPASS") else Path(__file__).resolve().parent.parent) / "fonts"  # type: ignore[attr-defined]

PageSize = Literal["6x9", "a5", "letter", "a4"]
PAGE_SIZES: dict[str, tuple[float, float]] = {"6x9": (152.4, 228.6), "a5": (148.0, 210.0), "letter": (215.9, 279.4), "a4": (210.0, 297.0)}
MARGINS: dict[str, float] = {"6x9": 16.0, "a5": 16.0, "letter": 25.4, "a4": 25.0}
MM_PER_PT = 25.4 / 72
PT_PER_PX = 0.75  # the preview's sizes are CSS pixels
SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
LRM = "‎"  # LEFT-TO-RIGHT MARK: makes a paragraph run left to right

# The book's three families in their four styles (the mono family has no italics: its upright is used).
FAMILIES: dict[str, dict[str, str]] = {
    "serif": {"": "NotoSerif-Regular.ttf", "B": "NotoSerif-Bold.ttf", "I": "NotoSerif-Italic.ttf", "BI": "NotoSerif-BoldItalic.ttf"},
    "sans": {"": "NotoSans-Regular.ttf", "B": "NotoSans-Bold.ttf", "I": "NotoSans-Italic.ttf", "BI": "NotoSans-BoldItalic.ttf"},
    "mono": {"": "NotoSansMono-Regular.ttf", "B": "NotoSansMono-Bold.ttf", "I": "NotoSansMono-Regular.ttf", "BI": "NotoSansMono-Bold.ttf"},
}
# What the book's font lacks is looked for in these, in this order: the script fonts first (the maths font also has the Arabic letters, for
# Arabic maths, and would take them), then symbols, maths and emoji, then CJK, whose Han characters are drawn from the Simplified Chinese font first.
FALLBACKS: list[tuple[str, dict[str, str]]] = [
    ("arabic", {"": "NotoNaskhArabic-Regular.ttf", "B": "NotoNaskhArabic-Bold.ttf"}),
    ("hebrew", {"": "NotoSerifHebrew-Regular.ttf", "B": "NotoSerifHebrew-Bold.ttf"}),
    ("devanagari", {"": "NotoSerifDevanagari-Regular.ttf", "B": "NotoSerifDevanagari-Bold.ttf"}),
    ("thai", {"": "NotoSerifThai-Regular.ttf", "B": "NotoSerifThai-Bold.ttf"}),
    ("symbols", {"": "NotoSansSymbols2-Regular.ttf"}),
    ("math", {"": "NotoSansMath-Regular.ttf"}),
    ("emoji", {"": "NotoEmoji-Regular.ttf"}),
    ("cjk-sc", {"": "NotoSansSC-Regular.ttf"}),
    ("cjk-jp", {"": "NotoSansJP-Regular.ttf"}),
    ("cjk-kr", {"": "NotoSansKR-Regular.ttf"}),
]


@dataclass
class PdfOptions:
    page_size: PageSize = "6x9"
    title_page: bool = True
    contents: bool = True  # only drawn when there is more than one chapter
    footnotes: bool = True
    flags: bool = False  # the open revision flags in the margin, beside the line each starts on


FLAG_SIZE = 6.5  # pt, a margin flag's text


@lru_cache(maxsize=1)
def _pdf_class() -> type:
    from fpdf import FPDF

    class _BookPdf(FPDF):
        # The family of the book being set (the page numbers and contents use it), and how many pages come before page 1 (the front matter).
        body_family = "serif"
        numbered_from = 0
        numbering = False

        def footer(self) -> None:
            if not self.numbering or self.page_no() <= self.numbered_from:
                return
            self.set_y(-self.b_margin * 0.75)
            self.set_font(self.body_family, size=9)
            self.cell(0, 5, str(self.page_no() - self.numbered_from), align="C")

    return _BookPdf


@lru_cache(maxsize=None)
def _cmap(name: str) -> frozenset[int]:
    """The characters a bundled font has (read once a run)."""
    from fontTools.ttLib import TTFont

    with TTFont(str(FONT_DIR / name), lazy=True) as font:
        return frozenset(font.getBestCmap())


def _text_of(doc: ExportDoc, flags: bool = False) -> str:
    parts = [doc.title, doc.project_title, "Contents 0123456789…"]
    for book in doc.books:
        parts.append(book.title)
        for chapter in book.chapters:
            parts.append(chapter.title)
            parts += [p.text for p in chapter.paragraphs]
            parts += [f"{n.title} {n.text}" for n in chapter.footnotes]
            if flags:
                parts += [f"{f.kind.capitalize()} {f.note}" for p in chapter.paragraphs for f in p.flags]
    return "".join(parts)


def _add_fonts(pdf: FPDF, doc: ExportDoc, flags: bool = False) -> None:
    """The families the books are set in, and of the fallback fonts only those the text needs: fpdf2 embeds every font it is given, and the CJK
    fonts alone take a second to read."""
    families = {b.format.fontFamily for b in doc.books} | {pdf.body_family}
    for family in families:
        for style, name in FAMILIES[family].items():
            pdf.add_font(family, style, str(FONT_DIR / name))
    have = frozenset.intersection(*(_cmap(FAMILIES[f][""]) for f in families))
    missing = {ord(c) for c in _text_of(doc, flags) if not c.isspace()} - have
    chosen: list[str] = []
    for name, files in FALLBACKS:
        found = missing & _cmap(files[""])
        if found:
            for style, file in files.items():
                pdf.add_font(name, style, str(FONT_DIR / file))
            chosen.append(name)
            missing -= found
    if chosen:
        pdf.set_fallback_fonts(chosen, exact_match=False)
    pdf.set_text_shaping(True)


def _fit(pdf: FPDF, text: str, width: float) -> str:
    """`text`, cut short with an ellipsis when it is wider than `width` in the current font."""
    if pdf.get_string_width(text) <= width:
        return text
    while text and pdf.get_string_width(text + "…") > width:
        text = text[:-1]
    return text.rstrip() + "…"


def _render_toc(pdf: FPDF, outline: list[OutlineSection]) -> None:
    pdf.set_x(pdf.l_margin)  # the placeholder can leave the cursor at the right
    pdf.set_font(pdf.body_family, "B", 16)
    pdf.cell(0, 10, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    parts = any(s.level > 0 for s in outline)  # a project: books with their chapters under them
    for section in outline:
        pdf.set_font(pdf.body_family, "B" if parts and section.level == 0 else "", 11)
        link = pdf.add_link(page=section.page_number)
        indent = 6.0 * section.level
        number = str(section.page_number - pdf.numbered_from)
        pdf.set_x(pdf.l_margin + indent)
        pdf.cell(pdf.epw - indent - 12, 7, _fit(pdf, section.name, pdf.epw - indent - 14), link=link)
        pdf.cell(12, 7, number, align="R", link=link, new_x="LMARGIN", new_y="NEXT")


def _flag_colour(hue: int | None) -> tuple[int, int, int]:
    """A margin flag's colour: the book's hue, deep enough to read on white (28, the app's own hue, when the book has none)."""
    r, g, b = colorsys.hls_to_rgb(((28 if hue is None else hue) % 360) / 360, 0.32, 0.55)
    return round(r * 255), round(g * 255), round(b * 255)


def _line_of(lines: list[str], text: str, offset: int) -> int:
    """Which of a paragraph's laid-out lines the character at `offset` of its text is on."""
    index, at = 0, 0
    for i, line in enumerate(lines):
        bare = line.replace(LRM, "").strip()
        if not bare:
            continue
        found = text.find(bare, at)
        if found < 0:  # the layout changed the text: estimate from where the character sits in it
            return min(len(lines) - 1, len(lines) * offset // max(1, len(text)))
        if found > offset:
            break
        index, at = i, found + len(bare)
    return index


def _place(pdf: FPDF, page: int, y: float, line: float, index: int) -> tuple[int, float]:
    """The page and height of a paragraph's line `index`, the paragraph starting at `y` on `page`: multi_cell turns the page before any line
    that would cross the bottom margin."""
    for i in range(index + 1):
        if y + line > pdf.page_break_trigger:
            page, y = page + 1, pdf.t_margin
        if i < index:
            y += line
    return page, y


def _draw_flags(pdf: FPDF, marks: list[tuple[int, float, MarginFlag]], line: float, colour: tuple[int, int, int]) -> None:
    """Each flag in the right margin: a rule beside its line, its kind and the start of its note. Drawn after the paragraph, going back to the
    page it started on; flags on nearby lines stack downwards."""
    here, y_here, bottom_margin = pdf.page, pdf.y, pdf.b_margin
    pdf.set_auto_page_break(False)
    x = pdf.w - pdf.r_margin + 2.5
    width = pdf.r_margin - 4.5
    label = FLAG_SIZE * 1.25 * MM_PER_PT
    below: dict[int, float] = {}
    pdf.set_draw_color(*colour)
    pdf.set_text_color(*colour)
    pdf.set_line_width(0.5)
    for page, y, flag in marks:
        pdf.page = page
        pdf.line(x - 1.2, y + 0.4, x - 1.2, y + line - 0.4)
        top = min(max(y, below.get(page, 0.0)), pdf.h - 2 * label - 2)
        pdf.set_font(pdf.body_family, "B", FLAG_SIZE)
        pdf.set_xy(x, top)
        pdf.cell(width, label, _fit(pdf, flag.kind.capitalize(), width))
        rows = 1
        if flag.note.strip():
            pdf.set_font(pdf.body_family, "", FLAG_SIZE)
            pdf.set_xy(x, top + label)
            pdf.cell(width, label, _fit(pdf, LRM + " ".join(flag.note.split()), width))
            rows = 2
        below[page] = top + rows * label + 0.8
    pdf.page = here
    pdf.set_xy(pdf.l_margin, y_here)
    pdf.set_draw_color(0)
    pdf.set_text_color(0)
    pdf.set_line_width(0.2)
    pdf.set_auto_page_break(True, bottom_margin)


def _style(fmt: PreviewFormat) -> str:
    return ("B" if fmt.fontWeight == "bold" else "") + ("I" if fmt.fontStyle == "italic" else "")


def _chapter(pdf: FPDF, chapter: Chapter, fmt: PreviewFormat, level: int, footnotes: bool, flags: bool = False, hue: int | None = None) -> None:
    family = fmt.fontFamily
    size = fmt.fontSize * PT_PER_PX
    heading = f"Chapter {chapter.number}"
    pdf.start_section(f"{heading}: {chapter.title}" if chapter.title else heading, level=level)
    pdf.ln(14)
    pdf.set_font(family, "", size * 0.75)
    pdf.set_char_spacing(1)
    pdf.cell(0, 6, heading.upper(), new_x="LMARGIN", new_y="NEXT")
    pdf.set_char_spacing(0)
    if chapter.title:
        pdf.set_font(family, "B", 30 * PT_PER_PX)
        pdf.multi_cell(0, 30 * PT_PER_PX * MM_PER_PT * 1.25, LRM + chapter.title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    if not chapter.paragraphs:
        return
    # Each paragraph is one multi_cell: fpdf2 orders right-to-left runs correctly there (its text_columns turns a mixed paragraph backwards). So
    # the indent is the preview's own measure, that many spaces of the font (no-break, so they are kept), and a footnote's number is written
    # in superscript digits after its sentence. A paragraph runs left to right, as the Preview's page does, whatever script it opens with: the
    # left-to-right mark it starts with says so (the Arabic or Hebrew in it still reads right to left).
    pdf.set_font(family, _style(fmt), size)
    line = size * fmt.lineSpacing * MM_PER_PT
    gap = fmt.paragraphSpacing * size * MM_PER_PT
    indent = LRM + " " * fmt.paragraphIndentSpaces
    align = "J" if fmt.textAlign == "justify" else "L"
    colour = _flag_colour(hue)
    for paragraph in chapter.paragraphs:
        parts: list[str] = []
        starts: list[int] = []  # where each sentence starts in the paragraph's text
        for sentence, notes in paragraph.sentences:
            starts.append(len(indent) + sum(len(part) for part in parts))
            words = sentence.rstrip()
            parts.append(words)
            if footnotes and notes:
                parts.append(",".join(str(n) for n in notes).translate(SUPERSCRIPT))
            parts.append(sentence[len(words):])
        text = indent + "".join(parts).strip()
        marks: list[tuple[int, float, MarginFlag]] = []
        if flags and paragraph.flags:
            from fpdf.enums import MethodReturnValue

            lines = pdf.multi_cell(0, line, text, align=align, dry_run=True, output=MethodReturnValue.LINES)
            for flag in paragraph.flags:
                offset = starts[flag.sentence] if flag.sentence < len(starts) else 0
                marks.append((*_place(pdf, pdf.page, pdf.y, line, _line_of(lines, text, offset)), flag))
        pdf.multi_cell(0, line, text, align=align, new_x="LMARGIN", new_y="NEXT")
        if marks:
            _draw_flags(pdf, marks, line, colour)
            pdf.set_font(family, _style(fmt), size)
        if gap:
            pdf.ln(gap)
    if footnotes and chapter.footnotes:
        pdf.ln(6)
        pdf.set_draw_color(150)
        pdf.line(pdf.l_margin, pdf.y, pdf.l_margin + pdf.epw / 3, pdf.y)
        pdf.ln(3)
        note_size = size * 0.8
        note_line = note_size * 1.4 * MM_PER_PT
        for note in chapter.footnotes:
            pdf.set_font(family, "B", note_size)
            pdf.multi_cell(0, note_line, f"{LRM}{note.number}. {note.title}", new_x="LMARGIN", new_y="NEXT")
            if note.text:
                pdf.set_font(family, "", note_size)
                pdf.set_x(pdf.l_margin + 5)
                pdf.multi_cell(pdf.epw - 5, note_line, LRM + note.text, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1.5)


def build_pdf(doc: ExportDoc, options: PdfOptions | None = None) -> bytes:
    opts = options or PdfOptions()
    pdf = _pdf_class()(unit="mm", format=PAGE_SIZES[opts.page_size])
    margin = MARGINS[opts.page_size]
    pdf.set_margins(margin, margin, margin)
    pdf.set_auto_page_break(True, margin)
    first = doc.books[0].format if doc.books else PreviewFormat()
    pdf.body_family = first.fontFamily
    _add_fonts(pdf, doc, opts.flags)
    pdf.set_title(doc.title or "Untitled")
    pdf.set_creator("Scriblr")
    pdf.set_lang("en")

    if opts.title_page:
        pdf.add_page()
        pdf.set_y(pdf.h * 0.32)
        pdf.set_font(pdf.body_family, "B", 26)
        pdf.multi_cell(0, 12, doc.title or "Untitled", align="C", new_x="LMARGIN", new_y="NEXT")
        subtitle = doc.project_title if doc.scope == "book" else (doc.books[0].title if doc.scope == "chapter" and doc.books else "")
        if subtitle and subtitle != doc.title:
            pdf.ln(6)
            pdf.set_font(pdf.body_family, "", 14)
            pdf.multi_cell(0, 8, subtitle, align="C", new_x="LMARGIN", new_y="NEXT")

    chapters = sum(len(b.chapters) for b in doc.books)
    fresh = False  # whether the cursor is on an empty page already (the contents placeholder leaves it so)
    if opts.contents and chapters > 1:
        entries = chapters + (len(doc.books) if doc.scope == "project" else 0)
        per_page = max(10, int((pdf.h - 2 * margin - 20) / 7))
        pdf.add_page()
        pdf.insert_toc_placeholder(_render_toc, pages=max(1, math.ceil(entries / per_page)), allow_extra_pages=True)
        fresh = True
    pdf.numbered_from = pdf.page - (1 if fresh else 0)
    pdf.numbering = True

    for book in doc.books:
        level = 0
        if doc.scope == "project":
            if not fresh:
                pdf.add_page()
            fresh = False
            pdf.body_family = book.format.fontFamily
            pdf.start_section(book.title or "Untitled", level=0)
            pdf.set_y(pdf.h * 0.32)
            pdf.set_font(book.format.fontFamily, "B", 22)
            pdf.multi_cell(0, 10, book.title or "Untitled", align="C", new_x="LMARGIN", new_y="NEXT")
            level = 1
        for chapter in book.chapters:
            if not fresh:
                pdf.add_page()
            fresh = False
            pdf.body_family = book.format.fontFamily
            _chapter(pdf, chapter, book.format, level, opts.footnotes, opts.flags, book.hue)
    if pdf.page == 0:
        pdf.add_page()
    return bytes(pdf.output())


def build_book_pdf(root: Path, project_id: str, book_id: str) -> tuple[bytes, str]:
    doc = collect(root, project_id, "book", book_id)
    return build_pdf(doc), doc.title


def build_chapter_pdf(root: Path, project_id: str, chapter_id: str) -> tuple[bytes, str]:
    doc = collect(root, project_id, "chapter", chapter_id)
    return build_pdf(doc), doc.title
