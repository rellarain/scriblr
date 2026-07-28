from fastapi.testclient import TestClient


def test_get_and_replace_outline(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Outline API Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/outline")
    assert resp.status_code == 200
    tree = resp.json()
    book_id = tree["nodes"][0]["id"]

    tree["nodes"].append(
        {
            "id": "ch_1",
            "kind": "chapter",
            "parentId": book_id,
            "order": 0,
            "title": "Chapter One",
            "synopsis": "",
            "draftRef": None,
        }
    )
    resp = client.put(f"/api/projects/{project_id}/outline", json=tree)
    assert resp.status_code == 200
    assert len(resp.json()["nodes"]) == 2

    resp = client.get(f"/api/projects/{project_id}/outline")
    assert [n["id"] for n in resp.json()["nodes"]] == [book_id, "ch_1"]


def test_outline_for_missing_project_404s(client: TestClient) -> None:
    resp = client.get("/api/projects/nope/outline")
    assert resp.status_code == 404
