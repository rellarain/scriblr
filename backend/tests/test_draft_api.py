from fastapi.testclient import TestClient


def test_draft_missing_moment_returns_404(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Draft API Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_1")
    assert resp.status_code == 404


def test_draft_upsert_computes_word_count_and_registers_in_manifest(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Draft API Test 2"}).json()["projectId"]

    resp = client.put(
        f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_1",
        json={"outlineNodeId": "moment_1", "body": "The rain started before the funeral did."},
    )
    assert resp.status_code == 200
    assert resp.json()["wordCount"] == 7

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.json()["index"]["manifest"]["draftMoments"] == ["moment_1"]

    resp = client.get(f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_1")
    assert resp.json()["body"] == "The rain started before the funeral did."

    # A second moment saved into the same chapter is independently addressable.
    resp = client.put(
        f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_2",
        json={"outlineNodeId": "moment_2", "body": "Two words."},
    )
    assert resp.status_code == 200
    chapter_draft = client.get(f"/api/projects/{project_id}/draft/chapter/chapter_1").json()
    assert set(chapter_draft["moments"].keys()) == {"moment_1", "moment_2"}
    assert chapter_draft["moments"]["moment_2"]["body"] == "Two words."


def test_delete_draft(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Draft API Test 3"}).json()["projectId"]
    client.put(
        f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_1",
        json={"outlineNodeId": "moment_1", "body": "Hello."},
    )

    resp = client.delete(f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_1")
    assert resp.status_code == 204

    resp = client.get(f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/moment_1")
    assert resp.status_code == 404
