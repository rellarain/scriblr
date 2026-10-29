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
        _plot("pp1", "plotpoint", "pl1", placements=[{"id": "a", "targetId": "m1"}, {"id": "b", "targetId": "c1"}]),
        _plot("pp2", "plotpoint", "pl1", 1),
        _plot("pp3", "plotpoint", "pl1", 2, assignedMomentId="m1"),  # saved before values could be placed many times
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
    assert book["assignment"] == {"done": 2, "total": 3}  # pp1 (two placements) and pp3 (an old single place) are placed; pp2 is not
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


def test_overview_gives_every_project_with_its_outline_and_progress(client: TestClient) -> None:
    first = _project(client)
    second = client.post("/api/projects", json={"title": "Second"}).json()["projectId"]

    overview = client.get("/api/projects/overview")
    assert overview.status_code == 200
    by_id = {entry["index"]["projectId"]: entry for entry in overview.json()}
    assert set(by_id) == {first, second}

    # The same answers the three separate requests gave.
    for project_id, entry in by_id.items():
        assert entry["outline"] == client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"]
        assert entry["progress"] == client.get(f"/api/projects/{project_id}/book-progress").json()
    assert by_id[first]["progress"]["b1"]["plotting"] == {"done": 1, "total": 2}


def test_overview_of_no_projects_is_empty(client: TestClient) -> None:
    assert client.get("/api/projects/overview").json() == []


def test_answers_to_choice_fields_are_not_counted_in_plotting_or_placing(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Answers"}).json()["projectId"]
    outline = {"schemaVersion": 2, "nodes": [
        _node("b1", "book", None, plotlineIds=["pl1", "pl2"]), _node("c1", "chapter", "b1", 0),
    ]}
    assert client.put(f"/api/projects/{project_id}/outline", json=outline).status_code == 200
    defs = [{"id": "f-genre", "name": "Genre", "kind": "multi", "options": [{"id": "o1", "label": "Fantasy"}]}, {"id": "f-motto", "name": "Motto", "kind": "text"}]
    plot = {"schemaVersion": 1, "nodes": [
        _plot("cat", "category", None, customFieldDefs=defs + [{"id": "f-beats", "name": "Beats"}]),
        _plot("pl1", "plotline", "cat"),
        _plot("pl2", "plotline", "cat", 1),
        # pl1 has a beat (placed) and answers; pl2 has only answers, so it is not plotted
        _plot("pp1", "plotpoint", "pl1", fieldId="f-beats", placements=[{"id": "a", "targetId": "c1"}]),
        _plot("an1", "plotpoint", "pl1", 1, fieldId="f-genre", optionId="o1", title="Fantasy"),
        _plot("an2", "plotpoint", "pl1", 2, fieldId="f-motto", title="Never again"),
        _plot("an3", "plotpoint", "pl2", fieldId="f-genre", optionId="o1", title="Fantasy", placements=[{"id": "b", "targetId": "c1"}]),
    ]}
    assert client.put(f"/api/projects/{project_id}/plot", json=plot).status_code == 200
    book = client.get(f"/api/projects/{project_id}/book-progress").json()["b1"]
    assert book["plotting"] == {"done": 1, "total": 2}
    assert book["assignment"] == {"done": 1, "total": 1}
