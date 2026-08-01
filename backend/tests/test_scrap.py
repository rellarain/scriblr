from fastapi.testclient import TestClient


def _build_book_chapter_moment(client: TestClient, project_id: str) -> tuple[str, str, str]:
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    book_id = tree["nodes"][0]["id"]
    tree["nodes"].append(
        {"id": "ch_1", "kind": "chapter", "parentId": book_id, "order": 0, "title": "Chapter One", "synopsis": ""}
    )
    tree["nodes"].append(
        {
            "id": "moment_1",
            "kind": "moment",
            "parentId": "ch_1",
            "order": 0,
            "title": "Opening",
            "synopsis": "",
        }
    )
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    return book_id, "ch_1", "moment_1"


def test_deleting_a_moment_scraps_it_with_correct_ancestry(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Scrap Test"}).json()["projectId"]
    book_id, chapter_id, moment_id = _build_book_chapter_moment(client, project_id)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Four little words here."},
    )

    # No entry until the moment's outline node is actually removed.
    resp = client.get(f"/api/projects/{project_id}/scrap")
    assert resp.json()["entries"] == []

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] != moment_id]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    resp = client.get(f"/api/projects/{project_id}/scrap")
    entries = resp.json()["entries"]
    assert len(entries) == 1
    entry = entries[0]
    assert entry["momentId"] == moment_id
    assert entry["title"] == "Opening"
    assert entry["wordCount"] == 4
    assert entry["lastChapterId"] == chapter_id
    assert entry["lastChapterTitle"] == "Chapter One"
    assert entry["lastBookId"] == book_id


def test_deleting_a_whole_chapter_scraps_its_moment_too(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Cascade Scrap Test"}).json()["projectId"]
    book_id, chapter_id, moment_id = _build_book_chapter_moment(client, project_id)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Some drafted words here."},
    )

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] not in (chapter_id, moment_id)]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    entries = client.get(f"/api/projects/{project_id}/scrap").json()["entries"]
    assert len(entries) == 1
    assert entries[0]["momentId"] == moment_id
    # Ancestry is captured from the OLD tree even though the chapter is also gone now.
    assert entries[0]["lastChapterId"] == chapter_id
    assert entries[0]["lastBookId"] == book_id


def test_moment_never_drafted_is_not_scrapped(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "No Draft Scrap Test"}).json()["projectId"]
    _, _, moment_id = _build_book_chapter_moment(client, project_id)
    # No draft ever written for moment_id.

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] != moment_id]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    assert client.get(f"/api/projects/{project_id}/scrap").json()["entries"] == []


def test_restore_reattaches_draft_and_revision_history(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Restore Test"}).json()["projectId"]
    book_id, chapter_id, moment_id = _build_book_chapter_moment(client, project_id)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Original prose content."},
    )
    client.post(f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "v1"})

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] != moment_id]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    resp = client.post(
        f"/api/projects/{project_id}/scrap/{moment_id}/restore",
        json={"parentId": chapter_id, "title": "Restored Opening"},
    )
    assert resp.status_code == 200
    restored_node = next(n for n in resp.json()["nodes"] if n["id"] == moment_id)
    assert restored_node["kind"] == "moment"
    assert restored_node["parentId"] == chapter_id
    assert restored_node["title"] == "Restored Opening"

    # Draft body and revision history reattach with zero copying.
    draft = client.get(f"/api/projects/{project_id}/draft/{moment_id}").json()
    assert draft["body"] == "Original prose content."
    revisions = client.get(f"/api/projects/{project_id}/revisions/{moment_id}").json()
    assert len(revisions) == 1

    # Scrap entry is gone.
    assert client.get(f"/api/projects/{project_id}/scrap").json()["entries"] == []


def test_restore_rejects_invalid_parent(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Bad Restore Test"}).json()["projectId"]
    book_id, chapter_id, moment_id = _build_book_chapter_moment(client, project_id)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "content"},
    )
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] != moment_id]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    # Missing parent id.
    resp = client.post(
        f"/api/projects/{project_id}/scrap/{moment_id}/restore", json={"parentId": "nope"}
    )
    assert resp.status_code == 400

    # A moment can't be a restore target (must be shallower than "moment").
    resp = client.post(
        f"/api/projects/{project_id}/scrap/{moment_id}/restore", json={"parentId": moment_id}
    )
    assert resp.status_code in (400, 404)


def test_permanent_delete_removes_draft_and_revisions(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Permadelete Test"}).json()["projectId"]
    _, _, moment_id = _build_book_chapter_moment(client, project_id)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "gone soon"},
    )
    client.post(f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "v1"})

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] != moment_id]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    resp = client.delete(f"/api/projects/{project_id}/scrap/{moment_id}")
    assert resp.status_code == 204

    assert client.get(f"/api/projects/{project_id}/scrap").json()["entries"] == []
    assert client.get(f"/api/projects/{project_id}/draft/{moment_id}").status_code == 404
    assert client.get(f"/api/projects/{project_id}/revisions/{moment_id}").json() == []


def test_delete_missing_scrap_entry_404s(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Missing Scrap Test"}).json()["projectId"]
    resp = client.delete(f"/api/projects/{project_id}/scrap/nope")
    assert resp.status_code == 404


def test_analytics_excludes_orphaned_moment_from_total_word_count(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Analytics Scrap Test"}).json()["projectId"]
    _, _, moment_id = _build_book_chapter_moment(client, project_id)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Five little words here indeed."},
    )
    assert client.get(f"/api/projects/{project_id}/analytics").json()["totals"]["totalWordCount"] == 5

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"] = [n for n in tree["nodes"] if n["id"] != moment_id]
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    assert client.get(f"/api/projects/{project_id}/analytics").json()["totals"]["totalWordCount"] == 0


def test_read_levels_round_trip_through_patch(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Read Levels Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.json()["index"]["settings"]["readLevels"] == ["book", "arc", "chapter", "act", "scene", "moment"]

    resp = client.patch(
        f"/api/projects/{project_id}", json={"readLevels": ["book", "arc", "chapter"]}
    )
    assert resp.status_code == 200
    assert resp.json()["settings"]["readLevels"] == ["book", "arc", "chapter"]
