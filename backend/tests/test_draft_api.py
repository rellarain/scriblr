from fastapi.testclient import TestClient


def test_draft_missing_scene_returns_404(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Draft API Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/draft/scene_1")
    assert resp.status_code == 404


def test_draft_upsert_computes_word_count_and_registers_in_manifest(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Draft API Test 2"}).json()["projectId"]

    resp = client.put(
        f"/api/projects/{project_id}/draft/scene_1",
        json={"outlineNodeId": "scene_1", "body": "The rain started before the funeral did."},
    )
    assert resp.status_code == 200
    assert resp.json()["wordCount"] == 7

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.json()["index"]["manifest"]["draftScenes"] == ["scene_1"]

    resp = client.get(f"/api/projects/{project_id}/draft/scene_1")
    assert resp.json()["body"] == "The rain started before the funeral did."


def test_delete_draft(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Draft API Test 3"}).json()["projectId"]
    client.put(
        f"/api/projects/{project_id}/draft/scene_1",
        json={"outlineNodeId": "scene_1", "body": "Hello."},
    )

    resp = client.delete(f"/api/projects/{project_id}/draft/scene_1")
    assert resp.status_code == 204

    resp = client.get(f"/api/projects/{project_id}/draft/scene_1")
    assert resp.status_code == 404
