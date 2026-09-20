from fastapi.testclient import TestClient


def _node(node_id: str, kind: str, parent: str | None, order: int, **extra) -> dict:
    return {"id": node_id, "kind": kind, "parentId": parent, "order": order, "title": node_id, **extra}


def _project(client: TestClient) -> str:
    project_id = client.post("/api/projects", json={"title": "Publications"}).json()["projectId"]
    nodes = [
        _node("b1", "book", None, 0),
        _node("c1", "chapter", "b1", 0, title="First"),
        _node("free", "moment", "c1", 0, freeDraft=True),
        _node("a1", "act", "c1", 1),
        _node("s1", "scene", "a1", 0),
        _node("m2", "moment", "s1", 1),
        _node("m1", "moment", "s1", 0),
    ]
    resp = client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    assert resp.status_code == 200, resp.text
    return project_id


def _write(client: TestClient, project_id: str, moment_id: str, body: str) -> None:
    client.put(
        f"/api/projects/{project_id}/draft/chapter/c1/moment/{moment_id}",
        json={"outlineNodeId": moment_id, "body": body},
    )


def test_publish_freezes_the_draft_in_outline_order(client: TestClient) -> None:
    project_id = _project(client)
    _write(client, project_id, "m2", "Second moment here.")
    _write(client, project_id, "m1", "First moment.")
    _write(client, project_id, "free", "Free words")

    resp = client.post(f"/api/projects/{project_id}/publications/c1")
    assert resp.status_code == 200
    pub = resp.json()
    assert [s["momentId"] for s in pub["sections"]] == ["free", "m1", "m2"]
    assert pub["wordCount"] == 2 + 2 + 3
    assert pub["title"] == "First"

    # Later edits do not touch the published copy.
    _write(client, project_id, "m1", "Rewritten.")
    listed = client.get(f"/api/projects/{project_id}/publications/c1").json()
    assert listed[0]["sections"][1]["body"] == "First moment."


def test_only_the_newest_three_publications_are_kept(client: TestClient) -> None:
    project_id = _project(client)
    ids = []
    for i in range(5):
        _write(client, project_id, "m1", f"Version {i}")
        ids.append(client.post(f"/api/projects/{project_id}/publications/c1").json()["id"])

    listed = client.get(f"/api/projects/{project_id}/publications/c1").json()
    assert [p["id"] for p in listed] == ids[:1:-1]  # newest first, oldest two dropped
    assert listed[0]["sections"][0]["body"] == "Version 4"


def test_publishing_an_unknown_chapter_is_a_404(client: TestClient) -> None:
    project_id = _project(client)
    assert client.post(f"/api/projects/{project_id}/publications/nope").status_code == 404
    assert client.get(f"/api/projects/{project_id}/publications/c1").json() == []


def test_outline_nodes_round_trip_created_at_and_free_draft(client: TestClient) -> None:
    project_id = _project(client)
    nodes = client.get(f"/api/projects/{project_id}/outline").json()["nodes"]
    free = next(n for n in nodes if n["id"] == "free")
    assert free["freeDraft"] is True
    assert next(n for n in nodes if n["id"] == "m1")["freeDraft"] is False
    assert free["createdAt"] is None

    nodes = [{**n, "createdAt": "2026-09-19T10:00:00Z"} if n["id"] == "c1" else n for n in nodes]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    again = client.get(f"/api/projects/{project_id}/outline").json()["nodes"]
    assert next(n for n in again if n["id"] == "c1")["createdAt"].startswith("2026-09-19T10:00:00")
