from fastapi.testclient import TestClient


def test_brainstorm_crud(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Brainstorm API Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/brainstorm")
    assert resp.status_code == 200
    assert resp.json()["notes"] == []

    resp = client.post(
        f"/api/projects/{project_id}/brainstorm",
        json={"body": "What if the villain is the narrator's future self?", "tags": ["twist"]},
    )
    assert resp.status_code == 200
    note_id = resp.json()["id"]

    resp = client.patch(
        f"/api/projects/{project_id}/brainstorm/{note_id}",
        json={"body": "Updated idea", "linkedOutlineNodeId": "ch_1"},
    )
    assert resp.status_code == 200
    assert resp.json()["body"] == "Updated idea"
    assert resp.json()["linkedOutlineNodeId"] == "ch_1"

    resp = client.delete(f"/api/projects/{project_id}/brainstorm/{note_id}")
    assert resp.status_code == 204

    resp = client.get(f"/api/projects/{project_id}/brainstorm")
    assert resp.json()["notes"] == []


def test_update_missing_note_404s(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Brainstorm API Test 2"}).json()["projectId"]
    resp = client.patch(f"/api/projects/{project_id}/brainstorm/does_not_exist", json={"body": "x"})
    assert resp.status_code == 404
