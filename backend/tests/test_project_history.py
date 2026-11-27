"""The project's history across its chapters: every chapter's revision summaries in one list."""

from fastapi.testclient import TestClient


def _project(client: TestClient) -> str:
    project_id = client.post("/api/projects", json={"title": "History"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    book = tree["nodes"][0]["id"]
    tree["nodes"] += [
        {"id": "c1", "kind": "chapter", "parentId": book, "order": 0, "title": "One"},
        {"id": "m1", "kind": "moment", "parentId": "c1", "order": 0, "title": ""},
        {"id": "c2", "kind": "chapter", "parentId": book, "order": 1, "title": "Two"},
        {"id": "m2", "kind": "moment", "parentId": "c2", "order": 0, "title": ""},
    ]
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    return project_id


def test_every_chapters_revisions_in_one_list(client: TestClient) -> None:
    project_id = _project(client)
    client.put(f"/api/projects/{project_id}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "One two three."})
    client.post(f"/api/projects/{project_id}/revisions/c1")
    client.put(f"/api/projects/{project_id}/draft/chapter/c2/moment/m2", json={"outlineNodeId": "m2", "body": "Four five."})
    client.post(f"/api/projects/{project_id}/revisions/c2")

    resp = client.get(f"/api/projects/{project_id}/revision-summaries")
    assert resp.status_code == 200
    rows = resp.json()
    # The saves make the editing sessions' revisions too; the manual ones are each chapter's own.
    assert {r["trigger"] for r in rows} <= {"manual", "session", "auto"}
    manual = [(r["chapterId"], r["wordCount"]) for r in rows if r["trigger"] == "manual"]
    assert manual == [("c1", 3), ("c2", 2)]
    assert [r["createdAt"] for r in rows] == sorted(r["createdAt"] for r in rows)


def test_no_revisions_is_an_empty_list_and_a_missing_project_is_404(client: TestClient) -> None:
    project_id = _project(client)
    assert client.get(f"/api/projects/{project_id}/revision-summaries").json() == []
    assert client.get("/api/projects/prj_missing/revision-summaries").status_code == 404
