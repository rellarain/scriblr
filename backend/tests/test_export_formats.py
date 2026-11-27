"""The export of a project, a book or a chapter as PDF, EPUB and JSON: what each holds, the options, and the zip of a file per book."""
import io
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.storage import project_store as store
from app.storage.export_content import Book, Chapter, ExportDoc, MarginFlag, Paragraph, collect, sentence_ranges, split_paragraphs, split_sentences
from app.storage.pdf_export import PdfOptions, _line_of, _place, build_pdf
from app.storage.schema import PreviewFormat

OPF = "{http://www.idpf.org/2007/opf}"
XHTML = "{http://www.w3.org/1999/xhtml}"


def _node(node_id: str, kind: str, parent: str | None, order: int = 0, title: str = "", **kw) -> dict:
    return {"id": node_id, "kind": kind, "parentId": parent, "order": order, "title": title or node_id, **kw}


def _seed(client: TestClient, storage_root: Path) -> dict[str, str]:
    """A project of two books: the first with two chapters (one with a footnote) and its own preview formatting, the second with one chapter."""
    pid = client.post("/api/projects", json={"title": "Harbour Lights"}).json()["projectId"]
    first = store.load_outline(storage_root, pid).nodes[0].model_dump()
    first.update(title="The Lantern Road", themeHue=210, previewFormat={"fontFamily": "sans", "textAlign": "left", "paragraphIndentSpaces": 4})
    nodes = [
        first,
        _node("c1", "chapter", first["id"], 0, "The Ferry at Dusk"), _node("m1", "moment", "c1", 0), _node("m2", "moment", "c1", 1),
        _node("c2", "chapter", first["id"], 1, "The Far Bank"), _node("m3", "moment", "c2", 0),
        _node("b2", "book", None, 1, "Salt & Ledger"), _node("c3", "chapter", "b2", 0, "Tide"), _node("m4", "moment", "c3", 0),
    ]
    assert client.put(f"/api/projects/{pid}/outline", json={"nodes": nodes}).status_code == 200
    drafts = {
        ("c1", "m1"): "She had three coins and a letter. The coins were for the crossing.\n\nShe did not look back.",
        ("c1", "m2"): "The ferryman did not look at the coins.",
        ("c2", "m3"): "The far bank was a long way off.",
        ("c3", "m4"): "Salt <and> “ledger” & more.",
    }
    for (c, m), body in drafts.items():
        assert client.put(f"/api/projects/{pid}/draft/chapter/{c}/moment/{m}", json={"outlineNodeId": m, "body": body}).status_code == 200
    notes = {"footnotes": [{"id": "n1", "paragraph": 0, "sentence": 1, "title": "The crossing", "text": "A toll paid in coin."}], "flags": []}
    assert client.put(f"/api/projects/{pid}/chapters/c1/author-notes", json=notes).status_code == 200
    client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "project", "type": "review", "note": "names"})
    return {"pid": pid, "book": first["id"]}


def _get(client: TestClient, pid: str, **params):
    return client.get(f"/api/projects/{pid}/export", params=params)


# --- the text, as the Preview splits it ----------------------------------------------------------------------------------------------------


def test_paragraphs_and_sentences_split_as_the_preview_does() -> None:
    assert split_paragraphs("One.\n\n  Two.  \n \nThree.\n") == ["One.", "Two.", "Three."]
    assert split_sentences("“Go,” she said. Then? Yes!” Done") == ["“Go,” she said. ", "Then? ", "Yes!” ", "Done"]
    assert "".join(split_sentences("A b. C d? E")) == "A b. C d? E"


def test_collect_gathers_books_chapters_paragraphs_and_footnotes(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    doc = collect(storage_root, ids["pid"], "project")
    assert [b.title for b in doc.books] == ["The Lantern Road", "Salt & Ledger"]
    first = doc.books[0]
    assert [(c.number, c.title) for c in first.chapters] == [(1, "The Ferry at Dusk"), (2, "The Far Bank")]
    ferry = first.chapters[0]
    assert [p.text for p in ferry.paragraphs] == [
        "She had three coins and a letter. The coins were for the crossing.", "She did not look back.", "The ferryman did not look at the coins.",
    ]
    assert ferry.paragraphs[0].sentences[1] == ("The coins were for the crossing.", [1])  # the footnote follows its sentence
    assert [(f.number, f.title) for f in ferry.footnotes] == [(1, "The crossing")]
    chapter = collect(storage_root, ids["pid"], "chapter", "c2")
    assert chapter.title == "The Far Bank" and [c.number for c in chapter.books[0].chapters] == [2]  # numbered within its book


# --- PDF -------------------------------------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("scope,target", [("project", None), ("book", "BOOK"), ("chapter", "c1")])
def test_a_pdf_of_each_scope(client: TestClient, storage_root: Path, scope: str, target: str | None) -> None:
    ids = _seed(client, storage_root)
    params = {"scope": scope, "format": "pdf"} | ({"id": ids["book"] if target == "BOOK" else target} if target else {})
    resp = _get(client, ids["pid"], **params)
    assert resp.status_code == 200 and resp.headers["content-type"] == "application/pdf" and resp.content[:4] == b"%PDF"
    assert ".pdf" in resp.headers["content-disposition"]


def test_pdf_options_change_the_page(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    small = _get(client, ids["pid"], scope="book", id=ids["book"], pageSize="6x9").content
    large = _get(client, ids["pid"], scope="book", id=ids["book"], pageSize="a4").content
    assert b"/MediaBox [0 0 432.00 648.00]" in small and b"/MediaBox [0 0 595.28 841.89]" in large
    bare = _get(client, ids["pid"], scope="book", id=ids["book"], titlePage=False, contents=False).content
    pages = lambda pdf: len(re.findall(rb"/Type /Page\b", pdf))  # noqa: E731
    assert pages(bare) < pages(small)  # no title page and no contents


# --- revision flags in a PDF's margin --------------------------------------------------------------------------------------------------------


def test_sentence_ranges_are_where_the_preview_puts_them() -> None:
    assert sentence_ranges("  One. Two!\n\nThree.") == [(0, 0, 2, 6), (0, 1, 7, 11), (1, 0, 13, 19)]
    assert sentence_ranges("\n\n") == []


def test_collect_puts_each_open_passage_flag_on_its_sentence(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    pid = ids["pid"]

    def flag(moment: str, start: int, end: int, kind: str, note: str = "") -> str:
        body = {"scope": "passage", "type": kind, "note": note, "chapterId": "c1", "momentId": moment, "start": start, "end": end}
        resp = client.post(f"/api/projects/{pid}/revision-flags", json=body)
        assert resp.status_code == 200, resp.text
        return resp.json()["id"]

    flag("m1", 34, 66, "change", "Too neat")  # "The coins were for the crossing.", the second sentence of the first paragraph
    flag("m2", 0, 11, "expand")  # the second moment: the chapter's third paragraph
    done = flag("m1", 0, 10, "review")
    assert client.post(f"/api/projects/{pid}/revision-flags/{done}/resolve", json={"outcome": "kept"}).status_code == 200
    ferry = collect(storage_root, pid, "book", ids["book"]).books[0].chapters[0]
    assert [p.flags for p in ferry.paragraphs] == [[MarginFlag(1, "change", "Too neat")], [], [MarginFlag(0, "expand", "")]]


def test_a_flag_is_put_beside_the_line_its_sentence_starts_on() -> None:
    text = "\u200e  First line of it, and then the second line with the flagged sentence. Third."
    lines = ["\u200e  First line of it, and then", "the second line with the", "flagged sentence. Third."]
    assert _line_of(lines, text, 0) == 0
    assert _line_of(lines, text, text.index("the second")) == 1
    assert _line_of(lines, text, text.index("Third")) == 2
    assert _line_of(["something else", "entirely"], text, len(text) - 1) == 1  # a layout that changed the text: estimated
    page = SimpleNamespace(page_break_trigger=100.0, t_margin=10.0)
    assert _place(page, 3, 50.0, 10.0, 2) == (3, 70.0)
    assert _place(page, 3, 85.0, 10.0, 1) == (4, 10.0)  # the second line would cross the bottom margin: it starts the next page
    assert _place(page, 3, 95.0, 10.0, 0) == (4, 10.0)


def _flagged_doc(paragraphs: int) -> ExportDoc:
    text = "The ferry landing was a plank tongue stuck out into the river. Mara walked it to the end before she looked back at the town."
    paras = [Paragraph([(s, []) for s in split_sentences(text)], [MarginFlag(1, "simplify", "A note that is far too long for the margin")])
             for _ in range(paragraphs)]
    return ExportDoc("p", "Harbour Lights", "book", "The Lantern Road", [Book("b", "The Lantern Road", "", 210, PreviewFormat(), [
        Chapter("c1", 1, "The Ferry at Dusk", paras)])])


def test_margin_flags_are_drawn_only_when_asked_and_add_no_pages() -> None:
    doc = _flagged_doc(60)  # several pages, so some flags fall at the foot of a page
    pages = lambda pdf: len(re.findall(rb"/Type /Page\b", pdf))  # noqa: E731
    plain, flagged = build_pdf(doc, PdfOptions()), build_pdf(doc, PdfOptions(flags=True))
    assert pages(plain) == pages(flagged) > 4 and len(flagged) > len(plain)


def test_the_export_route_takes_the_margin_flags_and_cover_options(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    body = {"scope": "passage", "type": "change", "note": "x", "chapterId": "c1", "momentId": "m1", "start": 0, "end": 10}
    assert client.post(f"/api/projects/{ids['pid']}/revision-flags", json=body).status_code == 200
    plain = _get(client, ids["pid"], scope="book", id=ids["book"]).content
    flagged = _get(client, ids["pid"], scope="book", id=ids["book"], marginFlags=True).content
    assert flagged[:4] == b"%PDF" and len(flagged) > len(plain)
    zf = _epub(_get(client, ids["pid"], scope="book", id=ids["book"], format="epub", cover=False))
    opf = ET.fromstring(zf.read("OEBPS/content.opf"))
    assert "cover" not in [i.get("idref") for i in opf.iter(f"{OPF}itemref")] and "OEBPS/cover.svg" not in zf.namelist()


# --- EPUB ------------------------------------------------------------------------------------------------------------------------------------


def _epub(resp) -> zipfile.ZipFile:
    assert resp.status_code == 200 and resp.headers["content-type"] == "application/epub+zip"
    return zipfile.ZipFile(io.BytesIO(resp.content))


def test_an_epub_is_put_together_as_the_format_asks(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    zf = _epub(_get(client, ids["pid"], scope="book", id=ids["book"], format="epub"))
    first = zf.infolist()[0]
    assert first.filename == "mimetype" and first.compress_type == zipfile.ZIP_STORED and zf.read("mimetype") == b"application/epub+zip"
    container = ET.fromstring(zf.read("META-INF/container.xml"))
    assert container.find(".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile").get("full-path") == "OEBPS/content.opf"
    opf = ET.fromstring(zf.read("OEBPS/content.opf"))
    manifest = {i.get("id"): i for i in opf.iter(f"{OPF}item")}
    assert manifest["nav"].get("properties") == "nav" and manifest["cover-image"].get("properties") == "cover-image"
    spine = [i.get("idref") for i in opf.iter(f"{OPF}itemref")]
    assert spine == ["cover", "titlepage", "nav", "b1c1", "b1c2"]
    for item in manifest.values():  # every file is there, and every XHTML file is well formed
        data = zf.read(f"OEBPS/{item.get('href')}")
        if item.get("media-type") == "application/xhtml+xml":
            ET.fromstring(data)
    assert opf.find(".//{http://purl.org/dc/elements/1.1/}title").text == "The Lantern Road"


def test_an_epub_chapter_has_the_text_the_footnote_and_the_book_formatting(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    zf = _epub(_get(client, ids["pid"], scope="book", id=ids["book"], format="epub"))
    chapter = zf.read("OEBPS/book-1-chapter-1.xhtml").decode()
    assert "<h1><span class=\"kicker\">Chapter 1</span>The Ferry at Dusk</h1>" in chapter
    assert "The coins were for the crossing.<a class=\"noteref\" epub:type=\"noteref\" href=\"#note-1\"" in chapter
    assert 'epub:type="footnote" id="note-1"' in chapter and "A toll paid in coin." in chapter
    css = zf.read("OEBPS/style.css").decode()
    assert ".b0 p { font-family: sans-serif;" in css and "text-align: left" in css and "text-indent: 1.120em" in css
    assert "#" in zf.read("OEBPS/cover.svg").decode()  # the cover is drawn in the book's colour


def test_an_epub_escapes_the_text_and_leaves_footnotes_out_when_asked(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    zf = _epub(_get(client, ids["pid"], scope="chapter", id="c3", format="epub"))
    tide = zf.read("OEBPS/book-1-chapter-1.xhtml").decode()
    assert "Salt &lt;and&gt; “ledger” &amp; more." in tide
    without = _epub(_get(client, ids["pid"], scope="chapter", id="c1", format="epub", footnotes=False))
    assert "noteref" not in without.read("OEBPS/book-1-chapter-1.xhtml").decode()


def test_a_project_epub_has_its_books_as_parts(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    zf = _epub(_get(client, ids["pid"], scope="project", format="epub"))
    nav = ET.fromstring(zf.read("OEBPS/nav.xhtml"))
    top = nav.find(f".//{XHTML}nav/{XHTML}ol")
    assert [li.find(f"{XHTML}a").text for li in top.findall(f"{XHTML}li")] == ["The Lantern Road", "Salt & Ledger"]
    assert [a.text for a in top.find(f"{XHTML}li/{XHTML}ol").iter(f"{XHTML}a")] == ["Chapter 1: The Ferry at Dusk", "Chapter 2: The Far Bank"]


# --- a file per book -------------------------------------------------------------------------------------------------------------------------


def test_a_project_split_into_a_file_per_book_is_a_zip(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    resp = _get(client, ids["pid"], scope="project", format="pdf", split=True)
    assert resp.headers["content-type"] == "application/zip" and ".zip" in resp.headers["content-disposition"]
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert zf.namelist() == ["1 - The Lantern Road.pdf", "2 - Salt & Ledger.pdf"]
    assert all(zf.read(n)[:4] == b"%PDF" for n in zf.namelist())


# --- JSON ------------------------------------------------------------------------------------------------------------------------------------


def test_json_of_a_book_holds_its_outline_drafts_and_chosen_extras(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    resp = _get(client, ids["pid"], scope="book", id=ids["book"], format="json")
    assert resp.status_code == 200 and resp.headers["content-type"] == "application/json"
    data = json.loads(resp.content)
    assert (data["format"], data["version"], data["scope"], data["title"]) == ("scriblr-export", 1, "book", "The Lantern Road")
    assert {n["id"] for n in data["outline"]} == {ids["book"], "c1", "m1", "m2", "c2", "m3"}
    assert set(data["drafts"]) == {"c1", "c2"} and data["drafts"]["c2"]["m3"] == "The far bank was a long way off."
    assert [f["note"] for f in data["revisionFlags"]] == ["names"] and "plot" in data and "revisions" not in data
    lean = json.loads(_get(client, ids["pid"], scope="book", id=ids["book"], format="json", plot=False, flags=False).content)
    assert "plot" not in lean and "revisionFlags" not in lean


# --- refusals --------------------------------------------------------------------------------------------------------------------------------


def test_unknown_targets_and_missing_ids_are_refused(client: TestClient, storage_root: Path) -> None:
    ids = _seed(client, storage_root)
    assert _get(client, ids["pid"], scope="book", id="nope").status_code == 404
    assert _get(client, ids["pid"], scope="chapter", id=ids["book"]).status_code == 404  # a book is not a chapter
    assert _get(client, ids["pid"], scope="book", id="nope", format="json").status_code == 404
    assert _get(client, ids["pid"], scope="chapter").status_code == 422
    assert _get(client, ids["pid"], scope="book", id=ids["book"], format="doc").status_code == 422
