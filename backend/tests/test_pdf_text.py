"""PDF export of any script: the bundled fonts print curly quotes, accents, Greek, Cyrillic, CJK, Arabic, Hebrew, Indic scripts and emoji."""
import re
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import project_store as store
from app.storage.pdf_export import FALLBACKS, FAMILIES, FONT_DIR


def _fonts_in(pdf: bytes) -> set[str]:
    """The fonts a PDF embeds, by name (fpdf2 names a subset "MPDFAA+<name>")."""
    return {m.decode().split("+", 1)[-1] for m in re.findall(rb"/BaseFont /([A-Za-z0-9+_-]+)", pdf)}


def _project(client: TestClient, storage_root: Path, body: str, title: str = "Scripts") -> tuple[str, str]:
    pid = client.post("/api/projects", json={"title": title}).json()["projectId"]
    nodes = [n.model_dump() for n in store.load_outline(storage_root, pid).nodes]
    book = nodes[0]["id"]
    nodes += [
        {"id": "ch1", "kind": "chapter", "parentId": book, "order": 0, "title": "Chàpter ’one’"},
        {"id": "m1", "kind": "moment", "parentId": "ch1", "order": 0, "title": "A moment …"},
    ]
    assert client.put(f"/api/projects/{pid}/outline", json={"nodes": nodes}).status_code == 200
    assert client.put(f"/api/projects/{pid}/draft/chapter/ch1/moment/m1", json={"outlineNodeId": "m1", "body": body}).status_code == 200
    return pid, book


def test_every_bundled_font_is_there() -> None:
    for _, files in [*FAMILIES.items(), *FALLBACKS]:
        for name in files.values():
            assert (FONT_DIR / name).is_file(), name
    assert (FONT_DIR / "OFL-Noto.txt").is_file() and (FONT_DIR / "LICENSE-NotoCJK.txt").is_file()


def test_a_book_with_smart_quotes_and_cjk_exports(client: TestClient, storage_root: Path) -> None:
    pid, book = _project(client, storage_root, "She said, “I won’t go” — then left. 日本語 \U0001f600 ‘x’", title="“Quoted” — title")
    book_resp = client.get(f"/api/projects/{pid}/export/book/{book}")
    assert book_resp.status_code == 200 and book_resp.content[:4] == b"%PDF"
    assert "filename*=UTF-8''" in book_resp.headers["content-disposition"]  # the real title, for a browser that reads it
    chapter_resp = client.get(f"/api/projects/{pid}/export/chapter/ch1")
    assert chapter_resp.status_code == 200 and chapter_resp.content[:4] == b"%PDF"


def test_each_script_is_set_in_a_font_that_has_it(client: TestClient, storage_root: Path) -> None:
    body = "Ωμέγα and Жизнь. 中文。 かな。 한국어. مرحبا بالعالم. שלום עולם. नमस्ते दुनिया। สวัสดี. ∑∫ ♞ \U0001f600"
    pid, book = _project(client, storage_root, body)
    pdf = client.get(f"/api/projects/{pid}/export", params={"scope": "book", "id": book, "format": "pdf"}).content
    fonts = _fonts_in(pdf)
    for name in ("NotoSerif", "NotoSansSC", "NotoSansKR", "NotoNaskhArabic", "NotoSerifHebrew", "NotoSerifDevanagari", "NotoSerifThai", "NotoSansMath", "NotoEmoji"):
        assert any(f.startswith(name) for f in fonts), (name, fonts)


def test_plain_latin_text_embeds_only_the_book_font(client: TestClient, storage_root: Path) -> None:
    pid, book = _project(client, storage_root, "Plain words, nothing more.")
    pdf = client.get(f"/api/projects/{pid}/export", params={"scope": "book", "id": book}).content
    assert _fonts_in(pdf) <= {"NotoSerif", "NotoSerifBold", "NotoSerifItalic", "NotoSerifBoldItalic"}
