"""The progress bars of a book's spine on the shelf."""

from fastapi.testclient import TestClient


def _node(id, kind, parent, order=0, **extra):
    base = {"id": id, "kind": kind, "parentId": parent, "order": order, "title": id, "synopsis": "", "draftRef": None,
            "flag": None, "color": None, "chapterCountTarget": None, "plotlineIds": [], "wordCountGoal": None}
    base.update(extra)
    return base


def _plot(id, kind, parent, order=0, **extra):
    base = {"id": id, "kind": kind, "parentId": parent, "order": order, "title": id}
    base.update(extra)
    return base


def _project(client: TestClient) -> str:
    project_id = client.post("/api/projects", json={"title": "Progress"}).json()["projectId"]
    outline = {"schemaVersion": 2, "nodes": [
        _node("b1", "book", None, synopsis="A book.", wordCountGoal=1000, plotlineIds=["pl1", "pl2"]),
        _node("c1", "chapter", "b1", 0),
        _node("c2", "chapter", "b1", 1),
        _node("s1", "scene", "c1", 0),
        _node("m1", "moment", "s1", 0),
        _node("m2", "moment", "c2", 0, freeDraft=True),
    ]}
    assert client.put(f"/api/projects/{project_id}/outline", json=outline).status_code == 200
    plot = {"schemaVersion": 1, "nodes": [
        _plot("cat", "category", None),
        _plot("pl1", "plotline", "cat"),
        _plot("pl2", "plotline", "cat", 1),
        _plot("pp1", "plotpoint", "pl1", assignedMomentId="m1"),
        _plot("pp2", "plotpoint", "pl1", 1),
    ]}
    assert client.put(f"/api/projects/{project_id}/plot", json=plot).status_code == 200
    return project_id


def test_each_book_reports_its_bars(client: TestClient) -> None:
    project_id = _project(client)
    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "one two three four five"})
    client.post(f"/api/projects/{project_id}/revisions/c1")
    progress = client.get(f"/api/projects/{project_id}/book-progress").json()
    assert list(progress) == ["b1"]
    book = progress["b1"]
    assert book["plotting"] == {"done": 1, "total": 2}  # pl1 has plotpoints, pl2 none
    assert book["outlining"] == {"done": 1, "total": 2}  # c1 has a scene; c2 only a free-drafting moment
    assert book["planning"] == {"done": 2, "total": 4}  # synopsis and word-count goal set (a goal exists, so planning is measured)
    assert book["assignment"] == {"done": 1, "total": 2}
    assert book["revision"] == {"done": 1, "total": 2}
    assert book["published"] == {"done": 0, "total": 2}
    assert book["words"] == {"done": 5, "total": 1000}


def test_a_session_entry_is_not_a_revision_and_a_publication_counts(client: TestClient) -> None:
    project_id = _project(client)
    # A draft save keeps an editing-session entry; that is not a revision.
    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "Text."})
    book = client.get(f"/api/projects/{project_id}/book-progress").json()["b1"]
    assert book["revision"]["done"] == 0
    assert client.post(f"/api/projects/{project_id}/publications/c1").status_code in (200, 201)
    book = client.get(f"/api/projects/{project_id}/book-progress").json()["b1"]
    assert book["published"]["done"] == 1


def test_a_book_with_no_goal_has_no_word_total(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Empty"}).json()["projectId"]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [_node("b1", "book", None)]})
    book = client.get(f"/api/projects/{project_id}/book-progress").json()["b1"]
    assert book["words"] == {"done": 0, "total": 0}
    assert book["outlining"] == {"done": 0, "total": 0}
    assert book["planning"] == {"done": 0, "total": 0}  # no goal: nothing to plan toward yet
