from fastapi.testclient import TestClient


def _books(client: TestClient, **params) -> dict:
    resp = client.get("/api/library/books", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_the_seeded_shelf_is_browsable_and_most_popular_first(client: TestClient) -> None:
    page = _books(client, limit=200)
    assert page["total"] == 24
    popularity = [b["popularity"] for b in page["books"]]
    assert popularity == sorted(popularity, reverse=True)
    assert {b["source"] for b in page["books"]} == {"seed"}


def test_filters_narrow_the_catalog(client: TestClient) -> None:
    essays = _books(client, type="essays", limit=200)["books"]
    assert essays and {b["type"] for b in essays} == {"essays"}

    fantasy = _books(client, genre="Fantasy", limit=200)["books"]
    assert fantasy and all("Fantasy" in b["genres"] for b in fantasy)

    slow = _books(client, trope="Slow burn", genre="Literary", limit=200)["books"]
    assert slow and all("Slow burn" in b["tropes"] for b in slow)

    short = _books(client, minWords=1, maxWords=10000, limit=200)["books"]
    assert short and all(0 < b["wordCount"] <= 10000 for b in short)

    rated = _books(client, minRating=9, limit=200)["books"]
    assert rated and all(b["rating"] >= 9 for b in rated)

    by_author = _books(client, author="mara-quill", limit=200)["books"]
    assert {b["authorId"] for b in by_author} == {"mara-quill"}


def test_a_hidden_flag_removes_the_books_that_carry_it(client: TestClient) -> None:
    everything = _books(client, limit=200)["books"]
    carrying = {b["id"] for b in everything if any(f["key"] == "grief" for f in b["flags"])}
    assert carrying
    kept = {b["id"] for b in _books(client, hideFlag="grief", limit=200)["books"]}
    assert not carrying & kept
    assert len(kept) == len(everything) - len(carrying)


def test_search_and_sorting(client: TestClient) -> None:
    hits = _books(client, q="rope", limit=200)["books"]
    assert hits and all("rope" in (b["title"] + " ".join(b["tags"])).lower() for b in hits)

    ratings = [b["rating"] for b in _books(client, sort="rating", limit=200)["books"]]
    assert ratings == sorted(ratings, reverse=True)
    words = [b["wordCount"] for b in _books(client, sort="words", limit=200)["books"]]
    assert words == sorted(words, reverse=True)


def test_paging(client: TestClient) -> None:
    first = _books(client, limit=5, offset=0)
    second = _books(client, limit=5, offset=5)
    assert first["total"] == second["total"] == 24
    assert not {b["id"] for b in first["books"]} & {b["id"] for b in second["books"]}


def test_a_book_and_an_author(client: TestClient) -> None:
    book = client.get("/api/library/books/cold-harbor").json()
    assert book["title"] == "Cold Harbor"
    assert [f["key"] for f in book["flags"]] == ["grief", "violence", "ending"]
    assert [f["defaultClass"] for f in book["flags"]] == ["marked", "highlight", "spoiler"]

    author = client.get("/api/library/authors/mara-quill").json()
    assert author["author"]["name"] == "Mara Quill"
    ember = [b for b in author["books"] if b["series"] and b["series"]["id"] == "ember-cycle"]
    assert [b["series"]["order"] for b in ember] == [1, 2, 3]

    assert client.get("/api/library/books/nope").status_code == 404
    assert client.get("/api/library/authors/nope").status_code == 404
    assert len(client.get("/api/library/authors").json()) == 8


def test_a_book_with_no_words_yet_has_no_edition(client: TestClient) -> None:
    ash = client.get("/api/library/books/ash").json()
    assert ash["editions"] == 0 and ash["publishedAt"] is None


def test_the_authors_own_published_book_joins_the_catalog(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Mine"}).json()["projectId"]
    nodes = [
        {"id": "b1", "kind": "book", "parentId": None, "order": 0, "title": "My Book", "synopsis": "About a harbor."},
        {"id": "c1", "kind": "chapter", "parentId": "b1", "order": 0, "title": "One"},
        {"id": "c2", "kind": "chapter", "parentId": "b1", "order": 1, "title": "Two"},
        {"id": "m1", "kind": "moment", "parentId": "c1", "order": 0, "title": "m1"},
    ]
    assert client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes}).status_code == 200
    # Nothing is published yet: it is not in the library.
    assert not [b for b in _books(client, limit=200)["books"] if b["source"] == "local"]

    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "One two three four"})
    assert client.post(f"/api/projects/{project_id}/publications/c1").status_code == 200

    local = [b for b in _books(client, limit=200)["books"] if b["source"] == "local"]
    assert len(local) == 1
    assert local[0]["id"] == f"local-{project_id}-b1"
    assert local[0]["title"] == "My Book" and local[0]["wordCount"] == 4 and local[0]["authorName"] == "You"
    assert local[0]["projectId"] == project_id and local[0]["bookId"] == "b1"
    assert client.get(f"/api/library/books/{local[0]['id']}").status_code == 200
    assert "you" in {a["id"] for a in client.get("/api/library/authors").json()}
