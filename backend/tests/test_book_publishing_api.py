from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.storage import reader_store

START = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)
BODY = "First paragraph here.\n\nSecond paragraph, two sentences. Here is the second."


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> dict:
    state = {"now": START}
    monkeypatch.setattr(reader_store, "_now", lambda: state["now"])
    return state


def _project(client: TestClient, *, publish_chapter: bool = True) -> tuple[str, str]:
    project_id = client.post("/api/projects", json={"title": "Mine"}).json()["projectId"]
    nodes = [
        {"id": "b1", "kind": "book", "parentId": None, "order": 0, "title": "My Book", "synopsis": "About a harbor."},
        {"id": "c1", "kind": "chapter", "parentId": "b1", "order": 0, "title": "One"},
        {"id": "c2", "kind": "chapter", "parentId": "b1", "order": 1, "title": "Two"},
        {"id": "m1", "kind": "moment", "parentId": "c1", "order": 0, "title": "m1"},
        {"id": "m2", "kind": "moment", "parentId": "c2", "order": 0, "title": "m2"},
    ]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": BODY})
    client.put(f"/api/projects/{project_id}/draft/chapter/c2/moment/m2", json={"outlineNodeId": "m2", "body": "The second chapter."})
    if publish_chapter:
        client.post(f"/api/projects/{project_id}/publications/c1")
    return project_id, f"local-{project_id}-b1"


def _book(project_id: str, suffix: str = "") -> str:
    return f"/api/projects/{project_id}/books/b1{suffix}"


# ----------------------------------------------------------------------------------------------------------------------- listing and editions


def test_a_new_book_is_not_listed_and_has_default_metadata(client: TestClient, clock: dict) -> None:
    project_id, _ = _project(client)
    listing = client.get(_book(project_id, "/listing")).json()
    assert listing["listed"] is False and listing["editions"] == [] and listing["meta"]["type"] == "novel" and listing["meta"]["buyPriceCents"] == 900
    assert client.get(f"/api/projects/{project_id}/books/nope/listing").status_code == 404


def test_publishing_needs_a_published_chapter_and_makes_numbered_editions(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client, publish_chapter=False)
    assert client.post(_book(project_id, "/publish")).status_code == 422  # nothing published yet

    client.post(f"/api/projects/{project_id}/publications/c1")
    first = client.post(_book(project_id, "/publish")).json()
    assert first["listed"] is True and [e["n"] for e in first["editions"]] == [1]
    assert [(c["n"], c["title"]) for c in first["editions"][0]["chapters"]] == [(1, "One")]

    client.post(f"/api/projects/{project_id}/publications/c2")
    second = client.post(_book(project_id, "/publish")).json()
    assert [e["n"] for e in second["editions"]] == [1, 2]
    assert [c["n"] for c in second["editions"][1]["chapters"]] == [1, 2]
    assert len(second["editions"][0]["chapters"]) == 1  # the first edition is frozen

    book = client.get(f"/api/library/books/{book_id}").json()
    assert book["editions"] == 2 and book["available"] is True and book["wordCount"] == second["editions"][1]["wordCount"]


def test_the_book_in_the_library_carries_its_metadata(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    meta = {
        "type": "novella", "blurb": "A short one.", "genres": ["Literary"], "tags": ["harbor"], "tropes": ["Slow burn"],
        "flags": [{"key": "grief", "name": "Grief", "detail": "A death is remembered.", "defaultClass": "highlight"}], "buyPriceCents": 700, "coverHue": 200,
    }
    assert client.put(_book(project_id, "/listing/meta"), json=meta).status_code == 200
    client.post(_book(project_id, "/publish"))
    book = client.get(f"/api/library/books/{book_id}").json()
    assert (book["type"], book["blurb"], book["genres"], book["buyPriceCents"], book["hue"]) == ("novella", "A short one.", ["Literary"], 700, 200)
    assert book["flags"] == [{"key": "grief", "name": "Grief", "detail": "A death is remembered.", "defaultClass": "highlight"}]
    assert client.put(_book(project_id, "/listing/meta"), json=meta | {"buyPriceCents": 5}).status_code == 422
    assert client.put(_book(project_id, "/listing/meta"), json=meta | {"flags": meta["flags"] * 2}).status_code == 422  # duplicate flag keys


def test_unlisting_keeps_the_copies_and_loans_readers_already_have(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    client.post(_book(project_id, "/publish"))
    assert client.post("/api/reader/buy", json={"bookId": book_id}).status_code == 200

    unlisted = client.post(_book(project_id, "/unpublish")).json()
    assert unlisted["listed"] is False and len(unlisted["editions"]) == 1
    assert book_id not in {b["id"] for b in client.get("/api/library/books?limit=200").json()["books"]}
    book = client.get(f"/api/library/books/{book_id}").json()
    assert book["available"] is False
    assert client.post("/api/reader/borrow", json={"bookId": book_id, "credits": 1}).status_code == 422
    assert client.get(f"/api/reader/books/{book_id}/chapters/1").status_code == 200  # the owned copy still reads

    again = client.post(_book(project_id, "/publish")).json()
    assert again["listed"] is True and [e["n"] for e in again["editions"]] == [1, 2]


def test_readers_read_the_edition_not_the_latest_unpublished_changes(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    client.post(_book(project_id, "/publish"))
    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "Changed after the edition."})
    client.post(f"/api/projects/{project_id}/publications/c1")  # a chapter published again, but not in an edition yet
    chapter = client.get(f"/api/reader/books/{book_id}/chapters/1").json()
    assert chapter["paragraphs"][0] == "First paragraph here."
    client.post(_book(project_id, "/publish"))
    assert client.get(f"/api/reader/books/{book_id}/chapters/1").json()["paragraphs"] == ["Changed after the edition."]


# ----------------------------------------------------------------------------------------------------------------------- footnotes and flagged passages


def test_author_footnotes_go_into_the_next_edition_on_their_sentences(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    assert client.get(f"/api/projects/{project_id}/chapters/c1/author-notes").json() == {"footnotes": [], "flags": []}
    client.put(_book(project_id, "/listing/meta"), json={"flags": [{"key": "grief", "name": "Grief", "detail": "d", "defaultClass": "spoiler"}]})
    notes = {
        "footnotes": [
            {"id": "f1", "paragraph": 1, "sentence": 1, "title": "Second sentence", "text": "A note.", "published": True},
            {"id": "f2", "paragraph": 0, "sentence": 0, "title": "Draft note", "text": "Not yet.", "published": False},
            {"id": "f3", "paragraph": 9, "sentence": 0, "title": "Gone", "text": "No such paragraph.", "published": True},
        ],
        "flags": [{"id": "g1", "paragraph": 0, "sentence": 0, "flagKey": "grief"}, {"id": "g2", "paragraph": 0, "sentence": 0, "flagKey": "nope"}],
    }
    assert client.put(f"/api/projects/{project_id}/chapters/c1/author-notes", json=notes).status_code == 200
    client.post(_book(project_id, "/publish"))

    chapter = client.get(f"/api/reader/books/{book_id}/chapters/1").json()
    assert [(f["key"], f["title"]) for f in chapter["footnotes"]] == [("c1:p1:s1", "Second sentence")]  # published, and on a real sentence
    assert [(f["key"], f["flagKey"], f["defaultClass"]) for f in chapter["flags"]] == [("c1:p0:s0", "grief", "spoiler")]
    assert client.put(f"/api/projects/{project_id}/chapters/c1/author-notes", json={"footnotes": notes["footnotes"] * 2, "flags": []}).status_code == 422
    assert client.put(f"/api/projects/{project_id}/chapters/nope/author-notes", json={"footnotes": [], "flags": []}).status_code == 404


# ----------------------------------------------------------------------------------------------------------------------- inviting readers


def test_inviting_this_reader_sets_their_level_on_the_book(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    client.post(_book(project_id, "/publish"))
    assert book_id not in client.get("/api/reader").json()["levels"]
    listing = client.put(_book(project_id, "/invites"), json={"invites": {"me": "delta", "r-sol": "alpha"}}).json()
    assert listing["invites"] == {"me": "delta", "r-sol": "alpha"}
    assert client.get("/api/reader").json()["levels"][book_id] == {"level": "delta", "invitedBy": "You", "override": False}
    client.put(_book(project_id, "/invites"), json={"invites": {"r-sol": "alpha"}})
    assert book_id not in client.get("/api/reader").json()["levels"]
    assert client.put(_book(project_id, "/invites"), json={"invites": {"me": "gamma"}}).status_code == 422


# ----------------------------------------------------------------------------------------------------------------------- what the author sees


def test_the_author_sees_loans_sales_earnings_reviews_and_reactions(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    client.post(_book(project_id, "/publish"))
    empty = client.get(_book(project_id, "/feedback")).json()
    assert (empty["loans"], empty["sales"], empty["readers"], empty["ratings"]) == (0, 0, 0, 0) and empty["listed"] is True

    client.put("/api/reader/plan", json={"extraCredits": 3})
    clock["now"] = datetime(2026, 11, 20, tzinfo=timezone.utc)
    client.post("/api/reader/borrow", json={"bookId": book_id, "credits": 3})
    client.put(f"/api/reader/books/{book_id}/marks", json={"key": "c1:p1:s0", "like": 2, "dislike": 0, "flags": []})
    client.put(f"/api/reader/books/{book_id}/marks", json={"key": "c1:p0:s0", "like": 0, "dislike": 1, "flags": []})
    client.put(f"/api/reader/reviews/{book_id}", json={"score": 9, "criteria": {}, "comment": "Lovely.", "spoilerEssay": "", "noteIds": []})
    client.post(f"/api/reader/reviews/{book_id}/post")

    fb = client.get(_book(project_id, "/feedback")).json()
    assert fb["loans"] == 1 and fb["activeLoans"] == 1 and fb["readers"] == 1
    assert fb["loanShareCents"] == 300 + 100 * 2  # $3.00 for the first credit, $1.00 for each more
    assert (fb["rating"], fb["ratings"]) == (9.0, 1) and fb["reviews"][0]["comment"] == "Lovely."
    chapter = fb["chapters"][0]
    assert (chapter["n"], chapter["readers"], chapter["pleasant"], chapter["unpleasant"]) == (1, 1, 1, 1)

    settings = client.get("/api/reader").json()["settings"] | {"shareReactions": False}
    client.put("/api/reader/settings", json=settings)
    hidden = client.get(_book(project_id, "/feedback")).json()["chapters"][0]
    assert (hidden["readers"], hidden["pleasant"]) == (0, 0)  # unshared reactions are not counted


def test_a_cancelled_loan_earns_nothing_and_a_sale_earns_seventy_percent(client: TestClient, clock: dict) -> None:
    project_id, book_id = _project(client)
    client.post(_book(project_id, "/publish"))
    client.post("/api/reader/borrow", json={"bookId": book_id, "credits": 1})
    holding = client.get("/api/reader").json()["holdings"][0]
    client.post(f"/api/reader/holdings/{holding['id']}/return")  # unopened: the credit comes back
    assert client.get(_book(project_id, "/feedback")).json()["loanShareCents"] == 0
    client.post("/api/reader/buy", json={"bookId": book_id})
    fb = client.get(_book(project_id, "/feedback")).json()
    assert fb["sales"] == 1 and fb["saleShareCents"] == 630  # 70% of $9.00


def test_the_dash_lists_every_published_book(client: TestClient, clock: dict) -> None:
    assert client.get("/api/author/books").json() == []
    project_id, book_id = _project(client)
    client.post(_book(project_id, "/publish"))
    client.post("/api/reader/buy", json={"bookId": book_id})
    rows = client.get("/api/author/books").json()
    assert [(r["title"], r["listed"], r["editions"], r["sales"], r["earningsCents"]) for r in rows] == [("My Book", True, 1, 1, 630)]
