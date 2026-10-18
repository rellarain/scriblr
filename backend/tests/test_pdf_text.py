"""PDF export of ordinary prose: curly quotes, dashes, accents, and text the built-in font cannot show."""
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import project_store as store
from app.storage.pdf_export import latin1_text


def test_typographic_punctuation_becomes_plain() -> None:
    assert latin1_text("“It’s fine” — she said…") == "\"It's fine\" - she said..."
    assert latin1_text("naïve café") == "naïve café"  # Latin-1 letters are kept
    assert latin1_text("Žluťoučký") == "Zlutoucký"  # accents outside Latin-1 lose the accent
    assert latin1_text("a b​c") == "a bc"


def test_what_the_font_lacks_becomes_a_question_mark_not_an_error() -> None:
    out = latin1_text("日本語 \U0001f600")
    assert out == "??? ?"
    out.encode("latin-1")


def test_a_book_with_smart_quotes_and_cjk_exports(client: TestClient, storage_root: Path) -> None:
    pid = client.post("/api/projects", json={"title": "“Quoted” — title"}).json()["projectId"]
    nodes = [n.model_dump() for n in store.load_outline(storage_root, pid).nodes]
    book = nodes[0]["id"]
    nodes += [
        {"id": "ch1", "kind": "chapter", "parentId": book, "order": 0, "title": "Chàpter ’one’"},
        {"id": "m1", "kind": "moment", "parentId": "ch1", "order": 0, "title": "A moment …"},
    ]
    assert client.put(f"/api/projects/{pid}/outline", json={"nodes": nodes}).status_code == 200
    body = "She said, “I won’t go” — then left. 日本語 \U0001f600 **bold** ‘x’"
    assert client.put(f"/api/projects/{pid}/draft/chapter/ch1/moment/m1", json={"outlineNodeId": "m1", "body": body}).status_code == 200
    book_resp = client.get(f"/api/projects/{pid}/export/book/{book}")
    assert book_resp.status_code == 200 and book_resp.content[:4] == b"%PDF"
    assert "filename*=UTF-8''" in book_resp.headers["content-disposition"]  # the real title, for a browser that reads it
    chapter_resp = client.get(f"/api/projects/{pid}/export/chapter/ch1")
    assert chapter_resp.status_code == 200 and chapter_resp.content[:4] == b"%PDF"
