from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.storage import reader_store

START = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> dict:
    state = {"now": START}
    monkeypatch.setattr(reader_store, "_now", lambda: state["now"])
    return state


def _reader(client: TestClient) -> dict:
    return client.get("/api/reader").json()


def _text(client: TestClient, book_id: str) -> dict:
    resp = client.get(f"/api/reader/books/{book_id}/text")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _mark(client: TestClient, book_id: str, **body):
    return client.put(f"/api/reader/books/{book_id}/marks", json=body)


# ----------------------------------------------------------------------------------------------------------------------- what may be read


def test_a_paid_book_cannot_be_opened_until_it_is_borrowed_or_bought(client: TestClient, clock: dict) -> None:
    assert _text(client, "cold-harbor")["canRead"] is False
    resp = client.get("/api/reader/books/cold-harbor/chapters/1")
    assert resp.status_code == 403 and "Borrow or buy" in resp.json()["detail"]

    client.post("/api/reader/borrow", json={"bookId": "cold-harbor", "credits": 1})
    text = _text(client, "cold-harbor")
    assert text["canRead"] is True and text["level"] == "omega" and len(text["chapters"]) == 11
    assert all(c["available"] for c in text["chapters"])
    chapter = client.get("/api/reader/books/cold-harbor/chapters/3").json()
    assert chapter["n"] == 3 and len(chapter["paragraphs"]) == 9 and chapter["draft"] is False


def test_the_text_is_the_same_every_time(client: TestClient, clock: dict) -> None:
    client.post("/api/reader/buy", json={"bookId": "thaw"})
    a = client.get("/api/reader/books/thaw/chapters/2").json()
    b = client.get("/api/reader/books/thaw/chapters/2").json()
    assert a == b
    assert a["paragraphs"] != client.get("/api/reader/books/thaw/chapters/3").json()["paragraphs"]


def test_the_level_decides_how_much_of_the_book_is_open(client: TestClient, clock: dict) -> None:
    client.post("/api/reader/buy", json={"bookId": "cold-harbor"})
    for level, open_chapters, draft in (("alpha", 11, True), ("delta", 7, True), ("beta", 9, False), ("omega", 11, False)):
        client.put("/api/reader/levels/cold-harbor", json={"level": level})
        text = _text(client, "cold-harbor")
        assert sum(1 for c in text["chapters"] if c["available"]) == open_chapters, level
        first = client.get("/api/reader/books/cold-harbor/chapters/1").json()
        assert first["draft"] is draft and bool(first["draftNote"]) is draft
    client.put("/api/reader/levels/cold-harbor", json={"level": "delta"})
    closed = client.get("/api/reader/books/cold-harbor/chapters/11")
    assert closed.status_code == 403 and "level" in closed.json()["detail"]
    assert client.get("/api/reader/books/cold-harbor/chapters/99").status_code == 404


def test_alpha_and_delta_are_free_but_beta_pays_like_omega(client: TestClient, clock: dict) -> None:
    assert _text(client, "ash")["canRead"] is True  # an alpha invitation: no loan needed
    assert client.get("/api/reader/books/ash/chapters/1").status_code == 200
    assert _text(client, "the-weir")["canRead"] is False  # beta
    client.post("/api/reader/borrow", json={"bookId": "the-weir", "credits": 1})
    assert _text(client, "the-weir")["canRead"] is True


def test_a_book_has_footnotes_and_flagged_passages_on_its_sentences(client: TestClient, clock: dict) -> None:
    client.post("/api/reader/buy", json={"bookId": "cold-harbor"})
    flagged = {}
    notes = 0
    for n in range(1, 12):
        chapter = client.get(f"/api/reader/books/cold-harbor/chapters/{n}").json()
        notes += len(chapter["footnotes"])
        for f in chapter["flags"]:
            flagged.setdefault(f["flagKey"], []).append(f["key"])
            assert f["key"].startswith(f"c{n}:p")
        for fn in chapter["footnotes"]:
            assert fn["key"].startswith(f"c{n}:p") and fn["text"]
    assert notes >= 11
    assert set(flagged) == {"grief", "violence", "ending"}  # every flag the author put on the book is on a passage


# ----------------------------------------------------------------------------------------------------------------------- marks


def test_reactions_are_kept_per_sentence_and_clear_when_emptied(client: TestClient, clock: dict) -> None:
    assert client.get("/api/reader/books/cold-harbor/marks").json() == {}
    marks = _mark(client, "cold-harbor", key="c3:p1:s2", like=2, dislike=0, flags=[]).json()
    assert marks == {"c3:p1:s2": {"like": 2, "dislike": 0, "flags": []}}
    marks = _mark(client, "cold-harbor", key="c3:p1:s2", like=0, dislike=3, flags=[]).json()
    assert marks["c3:p1:s2"]["dislike"] == 3 and marks["c3:p1:s2"]["like"] == 0
    assert _mark(client, "cold-harbor", key="c3:p1:s2", like=0, dislike=0, flags=[]).json() == {}
    assert _mark(client, "cold-harbor", key="nope", like=1, dislike=0, flags=[]).status_code == 422
    assert _mark(client, "cold-harbor", key="c3:p1:s2", like=4, dislike=0, flags=[]).status_code == 422
    assert _mark(client, "nope", key="c1:p0:s0", like=1, dislike=0, flags=[]).status_code == 404


def test_a_sentence_takes_an_authors_flag_or_one_of_the_readers_own(client: TestClient, clock: dict) -> None:
    assert _mark(client, "cold-harbor", key="c1:p0:s0", like=0, dislike=0, flags=["grief"]).json()["c1:p0:s0"]["flags"] == ["grief"]
    assert _mark(client, "cold-harbor", key="c1:p0:s1", like=0, dislike=0, flags=["zzz"]).status_code == 422

    state = client.post("/api/reader/my-flags", json={"name": "Simplify"}).json()
    assert [f["name"] for f in state["myFlags"]] == ["Simplify"]
    key = state["myFlags"][0]["key"]
    assert _mark(client, "cold-harbor", key="c1:p0:s1", like=0, dislike=0, flags=[key]).status_code == 200
    assert client.post("/api/reader/my-flags", json={"name": "simplify"}).status_code == 422
    assert client.post("/api/reader/my-flags", json={"name": "  "}).status_code == 422

    client.put(f"/api/reader/flag-classes/{key}", json={"flagClass": "hidden"})
    state = client.delete(f"/api/reader/my-flags/{key}").json()
    assert state["myFlags"] == [] and key not in state["flagClasses"]
    marks = client.get("/api/reader/books/cold-harbor/marks").json()
    assert "c1:p0:s1" not in marks and "c1:p0:s0" in marks  # a sentence marked only with the deleted flag is cleared


def test_totals_are_anonymous_and_include_my_reactions_only_when_shared(client: TestClient, clock: dict) -> None:
    before = client.get("/api/reader/books/cold-harbor/reactions/3").json()
    assert before["readers"] > 0 and before["mine"] == 0 and len(before["top"]) <= 5
    _mark(client, "cold-harbor", key="c3:p2:s1", like=3, dislike=0, flags=[])
    _mark(client, "cold-harbor", key="c3:p3:s0", like=0, dislike=2, flags=[])
    _mark(client, "cold-harbor", key="c4:p0:s0", like=1, dislike=0, flags=[])  # another chapter
    shared = client.get("/api/reader/books/cold-harbor/reactions/3").json()
    assert shared["mine"] == 2 and shared["pleasant"] == before["pleasant"] + 1 and shared["unpleasant"] == before["unpleasant"] + 1
    assert shared["readers"] == before["readers"] + 1

    settings = _reader(client)["settings"] | {"shareReactions": False}
    assert client.put("/api/reader/settings", json=settings).status_code == 200
    private = client.get("/api/reader/books/cold-harbor/reactions/3").json()
    assert private["pleasant"] == before["pleasant"] and private["mine"] == 2  # still mine, but not counted for others


# ----------------------------------------------------------------------------------------------------------------------- settings, position and notes


def test_settings_are_kept_with_the_account_and_validated(client: TestClient, clock: dict) -> None:
    defaults = _reader(client)["settings"]
    assert defaults["mode"] == "turn" and defaults["textSize"] == 18 and defaults["shareReactions"] is True
    state = client.put("/api/reader/settings", json=defaults | {"mode": "scroll", "textSize": 22, "font": "easy", "tone": "night", "highContrast": True}).json()
    assert state["settings"]["mode"] == "scroll" and state["settings"]["font"] == "easy" and state["settings"]["highContrast"] is True
    assert _reader(client)["settings"]["textSize"] == 22
    assert client.put("/api/reader/settings", json=defaults | {"textSize": 99}).status_code == 422
    assert client.put("/api/reader/settings", json=defaults | {"font": "comic"}).status_code == 422


def test_reading_records_the_position_and_feeds_the_activity_calendar(client: TestClient, clock: dict) -> None:
    client.post("/api/reader/borrow", json={"bookId": "cold-harbor", "credits": 1})
    body = {"chapter": 4, "paragraph": 2, "pct": 31.5, "pages": 6, "minutes": 9, "newSession": True, "device": "Phone"}
    state = client.put("/api/reader/books/cold-harbor/reading", json=body).json()
    assert state["positions"]["cold-harbor"]["chapter"] == 4 and state["positions"]["cold-harbor"]["device"] == "Phone"
    assert state["progress"]["cold-harbor"]["pct"] == 31.5
    day = state["activity"]["2026-10-11"]
    assert (day["pages"], day["minutes"], day["sessions"]) == (6, 9, 1)
    assert next(h for h in state["holdings"] if h["bookId"] == "cold-harbor")["opened"] is True

    state = client.put("/api/reader/books/cold-harbor/reading", json=body | {"chapter": 5, "pct": 95, "newSession": False}).json()
    assert state["positions"]["cold-harbor"]["chapter"] == 5 and state["progress"]["cold-harbor"]["finishedAt"] is not None
    assert state["activity"]["2026-10-11"]["pages"] == 12 and state["activity"]["2026-10-11"]["sessions"] == 1

    assert client.put("/api/reader/books/thaw/reading", json=body).status_code == 403  # not held
    assert client.put("/api/reader/books/cold-harbor/reading", json=body | {"pct": 120}).status_code == 422


def test_a_note_made_in_the_reader_names_its_sentence_and_a_bookmark_needs_no_text(client: TestClient, clock: dict) -> None:
    state = client.post("/api/reader/notes", json={"bookId": "cold-harbor", "quote": "The early tide.", "note": "Why?", "kind": "highlight", "chapter": 3, "key": "c3:p1:s0"}).json()
    note = state["notes"][0]
    assert (note["kind"], note["chapter"], note["key"]) == ("highlight", 3, "c3:p1:s0")
    state = client.post("/api/reader/notes", json={"bookId": "cold-harbor", "kind": "bookmark", "chapter": 3, "key": "c3:p4:s0"}).json()
    assert state["notes"][1]["kind"] == "bookmark"
    assert client.post("/api/reader/notes", json={"bookId": "cold-harbor", "kind": "note"}).status_code == 422
    assert client.post("/api/reader/notes", json={"bookId": "cold-harbor", "quote": "x", "key": "bad"}).status_code == 422


# ----------------------------------------------------------------------------------------------------------------------- the author's own book


def _own_book(client: TestClient) -> tuple[str, str]:
    project_id = client.post("/api/projects", json={"title": "Mine"}).json()["projectId"]
    nodes = [
        {"id": "b1", "kind": "book", "parentId": None, "order": 0, "title": "My Book", "synopsis": "About a harbor."},
        {"id": "c1", "kind": "chapter", "parentId": "b1", "order": 0, "title": "One"},
        {"id": "c2", "kind": "chapter", "parentId": "b1", "order": 1, "title": "Two"},
        {"id": "m1", "kind": "moment", "parentId": "c1", "order": 0, "title": "m1"},
    ]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "First paragraph here.\n\nSecond paragraph, two sentences. Here is the second."})
    client.post(f"/api/projects/{project_id}/publications/c1")
    return project_id, f"local-{project_id}-b1"


def test_an_authors_own_book_reads_from_the_chapters_they_published(client: TestClient, clock: dict) -> None:
    _project_id, book_id = _own_book(client)
    text = _text(client, book_id)
    assert text["canRead"] is True  # an author needs no loan to read their own book
    assert [(c["n"], c["title"], c["available"]) for c in text["chapters"]] == [(1, "One", True), (2, "Two", False)]
    chapter = client.get(f"/api/reader/books/{book_id}/chapters/1").json()
    assert chapter["paragraphs"] == ["First paragraph here.", "Second paragraph, two sentences. Here is the second."]
    unpublished = client.get(f"/api/reader/books/{book_id}/chapters/2")
    assert unpublished.status_code == 403 and "not published" in unpublished.json()["detail"]
    totals = client.get(f"/api/reader/books/{book_id}/reactions/1").json()
    assert totals["readers"] == 0
    _mark(client, book_id, key="c1:p1:s0", like=2, dislike=0, flags=[])
    assert client.get(f"/api/reader/books/{book_id}/reactions/1").json()["pleasant"] == 1
