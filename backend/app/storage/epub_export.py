"""A project, a book or a chapter as an EPUB 3 file, put together by hand (a zip of XHTML, CSS and an SVG cover; no library): a cover in the book's
own colour, a title page, the contents (nav.xhtml, and toc.ncx for older readers), one file per chapter in the book's preview formatting, and the
author's footnotes as EPUB footnotes that a reader shows when the number is tapped. E-readers set the text in their own fonts, so none is bundled."""

from __future__ import annotations

import colorsys
import io
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape

from .export_content import Chapter, ExportDoc
from .schema import SPACE_EM, PreviewFormat

GENERIC = {"serif": "serif", "sans": "sans-serif", "mono": "monospace"}
BASE_PX = 17  # the preview's own size: a book's font size is written relative to it, so a reader's size setting still applies


@dataclass
class EpubOptions:
    contents: bool = True
    footnotes: bool = True
    cover: bool = True


def _x(text: str) -> str:
    return escape(text, quote=True)


def _cover_colour(hue: int | None) -> str:
    """The cover's colour: the book's hue, deep enough for white text (the Writer's level colours are made the same way)."""
    h = ((hue if hue is not None else 28) % 360) / 360
    r, g, b = colorsys.hls_to_rgb(h, 0.28, 0.42)
    return f"#{round(r * 255):02x}{round(g * 255):02x}{round(b * 255):02x}"


def _book_css(index: int, fmt: PreviewFormat) -> str:
    return (
        f".b{index} p {{ font-family: {GENERIC[fmt.fontFamily]}; font-size: {fmt.fontSize / BASE_PX:.3f}em; "
        f"font-style: {fmt.fontStyle}; font-weight: {fmt.fontWeight}; text-align: {fmt.textAlign}; line-height: {fmt.lineSpacing}; "
        f"text-indent: {fmt.paragraphIndentSpaces * SPACE_EM[fmt.fontFamily]:.3f}em; margin: 0 0 {fmt.paragraphSpacing}em; }}\n"
        f".b{index} h1, .b{index} h2, .b{index} .kicker {{ font-family: {GENERIC[fmt.fontFamily]}; }}\n"
    )


BASE_CSS = """body { margin: 0 5%; }
h1 { font-size: 1.6em; margin: 2em 0 1em; line-height: 1.25; }
h2.part { font-size: 1.8em; text-align: center; margin-top: 30%; }
.kicker { display: block; font-size: 0.7em; font-weight: normal; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.4em; }
.title { text-align: center; margin-top: 30%; }
.title h1 { font-size: 2em; margin: 0 0 0.5em; }
.title p { text-indent: 0; text-align: center; }
a.noteref { text-decoration: none; }
aside.notes { margin-top: 2em; border-top: 1px solid currentColor; padding-top: 0.5em; font-size: 0.85em; }
aside.notes p { text-indent: 0; margin: 0 0 0.4em; }
nav ol { list-style: none; padding-left: 1em; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 100vh; height: auto; }
"""


def _page(title: str, body: str, lang: str, body_class: str = "") -> str:
    cls = f' class="{body_class}"' if body_class else ""
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        f'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}" xml:lang="{lang}">\n'
        f'<head><meta charset="utf-8"/><title>{_x(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n'
        f"<body{cls}>\n{body}\n</body>\n</html>\n"
    )


def _wrap(text: str, width: int) -> list[str]:
    """`text` in lines of at most about `width` characters, for the cover."""
    lines: list[str] = []
    for word in text.split():
        if lines and len(lines[-1]) + 1 + len(word) <= width:
            lines[-1] += " " + word
        else:
            lines.append(word)
    return lines[:6] or [""]


def _cover_svg(title: str, subtitle: str, hue: int | None) -> str:
    lines = _wrap(title or "Untitled", 18)
    y0 = 560 - (len(lines) - 1) * 40
    title_svg = "".join(f'<text x="400" y="{y0 + i * 80}" font-size="64" font-weight="bold">{_x(line)}</text>' for i, line in enumerate(lines))
    sub = f'<text x="400" y="{y0 + len(lines) * 80 + 30}" font-size="32">{_x(subtitle)}</text>' if subtitle else ""
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200">'
        f'<rect width="800" height="1200" fill="{_cover_colour(hue)}"/>'
        '<rect x="40" y="40" width="720" height="1120" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>'
        f'<g fill="#ffffff" font-family="serif" text-anchor="middle">{title_svg}{sub}</g></svg>\n'
    )


def _chapter_body(chapter: Chapter, footnotes: bool) -> str:
    heading = f"Chapter {chapter.number}"
    out = [f'<section epub:type="chapter" aria-label="{_x(heading)}">', f'<h1><span class="kicker">{_x(heading)}</span>{_x(chapter.title)}</h1>']
    for paragraph in chapter.paragraphs:
        parts: list[str] = []
        for sentence, notes in paragraph.sentences:
            words = sentence.rstrip()
            parts.append(_x(words))
            if footnotes:
                parts += [f'<a class="noteref" epub:type="noteref" href="#note-{n}" id="ref-{n}"><sup>{n}</sup></a>' for n in notes]
            parts.append(_x(sentence[len(words):]))
        out.append(f"<p>{''.join(parts).strip()}</p>")
    out.append("</section>")
    if footnotes and chapter.footnotes:
        out.append('<aside class="notes" epub:type="footnotes">')
        for note in chapter.footnotes:
            text = f": {_x(note.text)}" if note.text else ""
            out.append(
                f'<aside epub:type="footnote" id="note-{note.number}"><p><a href="#ref-{note.number}">{note.number}.</a> <b>{_x(note.title)}</b>{text}</p></aside>'
            )
        out.append("</aside>")
    return "\n".join(out)


def build_epub(doc: ExportDoc, options: EpubOptions | None = None, lang: str = "en", now: datetime | None = None) -> bytes:
    opts = options or EpubOptions()
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    target = doc.books[0].id if doc.scope != "project" and doc.books else ""
    book_id = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, f'scriblr:{doc.project_id}:{doc.scope}:{target}:{doc.title}')}"
    files: list[tuple[str, str, str, str]] = []  # (manifest id, href, media type, content); spine order follows
    spine: list[str] = []
    toc: list[tuple[int, str, str]] = []  # (level, label, href)

    css = BASE_CSS + "".join(_book_css(i, b.format) for i, b in enumerate(doc.books))
    hue = doc.books[0].hue if doc.books else None
    subtitle = doc.project_title if doc.scope == "book" and doc.project_title != doc.title else ""
    if opts.cover:
        files.append(("cover-image", "cover.svg", "image/svg+xml", _cover_svg(doc.title, subtitle, hue)))
        cover_body = '<div class="cover"><img src="cover.svg" alt="Cover"/></div>'
        files.append(("cover", "cover.xhtml", "application/xhtml+xml", _page("Cover", cover_body, lang, "cover")))
        spine.append("cover")
    title_body = f'<div class="title"><h1>{_x(doc.title or "Untitled")}</h1>' + (f"<p>{_x(subtitle)}</p>" if subtitle else "") + "</div>"
    files.append(("titlepage", "title.xhtml", "application/xhtml+xml", _page(doc.title or "Untitled", title_body, lang)))
    spine.append("titlepage")

    for bi, book in enumerate(doc.books):
        level = 0
        if doc.scope == "project":
            href = f"book-{bi + 1}.xhtml"
            part = f'<section epub:type="part"><h2 class="part">{_x(book.title or "Untitled")}</h2></section>'
            files.append((f"book{bi + 1}", href, "application/xhtml+xml", _page(book.title or "Untitled", part, lang, f"b{bi}")))
            spine.append(f"book{bi + 1}")
            toc.append((0, book.title or "Untitled", href))
            level = 1
        for chapter in book.chapters:
            href = f"book-{bi + 1}-chapter-{chapter.number}.xhtml"
            label = f"Chapter {chapter.number}" + (f": {chapter.title}" if chapter.title else "")
            files.append((f"b{bi + 1}c{chapter.number}", href, "application/xhtml+xml", _page(label, _chapter_body(chapter, opts.footnotes), lang, f"b{bi}")))
            spine.append(f"b{bi + 1}c{chapter.number}")
            toc.append((level, label, href))

    nav_items = _nav_list(toc)
    landmarks = (
        '<nav epub:type="landmarks" hidden="hidden"><ol>'
        + ('<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>' if opts.cover else "")
        + '<li><a epub:type="titlepage" href="title.xhtml">Title page</a></li>'
        + (f'<li><a epub:type="bodymatter" href="{toc[0][2]}">Start</a></li>' if toc else "")
        + "</ol></nav>"
    )
    nav_body = f'<nav epub:type="toc" id="toc"><h1>Contents</h1>{nav_items}</nav>\n{landmarks}'
    files.append(("nav", "nav.xhtml", "application/xhtml+xml", _page("Contents", nav_body, lang)))
    if opts.contents and len(toc) > 1:
        spine.insert(spine.index("titlepage") + 1, "nav")
    files.append(("ncx", "toc.ncx", "application/x-dtbncx+xml", _ncx(book_id, doc.title, toc)))
    files.append(("css", "style.css", "text/css", css))

    manifest = "\n".join(
        f'    <item id="{fid}" href="{href}" media-type="{mt}"'
        + (' properties="nav"' if fid == "nav" else "")
        + (' properties="cover-image"' if fid == "cover-image" else "")
        + "/>"
        for fid, href, mt, _ in files
    )
    spine_xml = "\n".join(f'    <itemref idref="{fid}"/>' for fid in spine)
    opf = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="' + lang + '">\n'
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        f'    <dc:identifier id="book-id">{book_id}</dc:identifier>\n'
        f"    <dc:title>{_x(doc.title or 'Untitled')}</dc:title>\n"
        f"    <dc:language>{lang}</dc:language>\n"
        f'    <meta property="dcterms:modified">{stamp}</meta>\n'
        + ('    <meta name="cover" content="cover-image"/>\n' if opts.cover else "")
        + "  </metadata>\n"
        f"  <manifest>\n{manifest}\n  </manifest>\n"
        f'  <spine toc="ncx">\n{spine_xml}\n  </spine>\n'
        "</package>\n"
    )
    container = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
        '  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n'
        "</container>\n"
    )

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)  # first and uncompressed
        zf.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        for _, href, _, content in files:
            zf.writestr(f"OEBPS/{href}", content, compress_type=zipfile.ZIP_DEFLATED)
    return out.getvalue()


def _nav_list(toc: list[tuple[int, str, str]]) -> str:
    """The contents as nested ordered lists: books, then their chapters under them."""
    if not toc:
        return "<ol><li><a href=\"title.xhtml\">Title page</a></li></ol>"
    out = ["<ol>"]
    open_child = False
    for i, (level, label, href) in enumerate(toc):
        if level == 0 and open_child:
            out.append("</ol></li>")
            open_child = False
        item = f'<a href="{href}">{_x(label)}</a>'
        nxt = toc[i + 1][0] if i + 1 < len(toc) else 0
        if level == 0 and nxt == 1:
            out.append(f"<li>{item}<ol>")
            open_child = True
        else:
            out.append(f"<li>{item}</li>")
    if open_child:
        out.append("</ol></li>")
    out.append("</ol>")
    return "".join(out)


def _ncx(book_id: str, title: str, toc: list[tuple[int, str, str]]) -> str:
    points = "".join(
        f'<navPoint id="p{i + 1}" playOrder="{i + 1}"><navLabel><text>{_x(label)}</text></navLabel><content src="{href}"/></navPoint>'
        for i, (_, label, href) in enumerate(toc)
    ) or '<navPoint id="p1" playOrder="1"><navLabel><text>Title page</text></navLabel><content src="title.xhtml"/></navPoint>'
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
        f'<head><meta name="dtb:uid" content="{book_id}"/></head>'
        f"<docTitle><text>{_x(title or 'Untitled')}</text></docTitle><navMap>{points}</navMap></ncx>\n"
    )
