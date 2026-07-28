from fastapi.testclient import TestClient


def _make_project_with_draft(client: TestClient, body: str) -> tuple[str, str]:
    project_id = client.post("/api/projects", json={"title": "Revisions API Test"}).json()["projectId"]
    moment_id = "moment_1"
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": body},
    )
    return project_id, moment_id


def test_create_and_list_snapshots(client: TestClient) -> None:
    project_id, moment_id = _make_project_with_draft(client, "Once upon a time.")

    resp = client.post(
        f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "first pass"}
    )
    assert resp.status_code == 200
    snapshot_id = resp.json()["snapshotId"]
    assert resp.json()["body"] == "Once upon a time."

    resp = client.get(f"/api/projects/{project_id}/revisions/{moment_id}")
    assert resp.status_code == 200
    summaries = resp.json()
    assert [s["snapshotId"] for s in summaries] == [snapshot_id]
    # Summaries are lightweight and should not include the full body.
    assert "body" not in summaries[0]

    resp = client.get(f"/api/projects/{project_id}/revisions/{moment_id}/{snapshot_id}")
    assert resp.status_code == 200
    assert resp.json()["body"] == "Once upon a time."


def test_diff_snapshot_against_current_draft(client: TestClient) -> None:
    project_id, moment_id = _make_project_with_draft(client, "The cat sat on the mat.")
    snapshot_id = client.post(
        f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "v1"}
    ).json()["snapshotId"]

    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "The cat sat on the rug."},
    )

    resp = client.get(
        f"/api/projects/{project_id}/revisions/{moment_id}/diff",
        params={"from": snapshot_id, "to": "current"},
    )
    assert resp.status_code == 200
    ops = resp.json()["ops"]
    assert any(op["op"] == "delete" and "mat" in op["text"] for op in ops)
    assert any(op["op"] == "insert" and "rug" in op["text"] for op in ops)


def test_revert_creates_safety_snapshot_and_restores_body(client: TestClient) -> None:
    project_id, moment_id = _make_project_with_draft(client, "Version one.")
    v1_id = client.post(
        f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "v1"}
    ).json()["snapshotId"]

    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Version two, much changed."},
    )

    resp = client.post(f"/api/projects/{project_id}/revisions/{moment_id}/{v1_id}/revert")
    assert resp.status_code == 200
    safety_snapshot_id = resp.json()["snapshotId"]
    assert safety_snapshot_id != v1_id
    assert resp.json()["body"] == "Version two, much changed."

    resp = client.get(f"/api/projects/{project_id}/draft/{moment_id}")
    assert resp.json()["body"] == "Version one."

    resp = client.get(f"/api/projects/{project_id}/revisions/{moment_id}")
    ids = {s["snapshotId"] for s in resp.json()}
    assert ids == {v1_id, safety_snapshot_id}


def test_comment_crud_on_snapshot(client: TestClient) -> None:
    project_id, moment_id = _make_project_with_draft(client, "A sentence to annotate.")
    snapshot_id = client.post(
        f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "v1"}
    ).json()["snapshotId"]

    resp = client.post(
        f"/api/projects/{project_id}/revisions/{moment_id}/{snapshot_id}/notes",
        json={"body": "too on-the-nose?", "anchorStart": 0, "anchorEnd": 9, "flag": "primary"},
    )
    assert resp.status_code == 200
    note_id = resp.json()["id"]

    resp = client.patch(
        f"/api/projects/{project_id}/revisions/{moment_id}/{snapshot_id}/notes/{note_id}",
        json={"body": "updated comment"},
    )
    assert resp.status_code == 200
    assert resp.json()["body"] == "updated comment"

    resp = client.get(f"/api/projects/{project_id}/revisions/{moment_id}/{snapshot_id}")
    assert len(resp.json()["notes"]) == 1

    resp = client.delete(
        f"/api/projects/{project_id}/revisions/{moment_id}/{snapshot_id}/notes/{note_id}"
    )
    assert resp.status_code == 204

    resp = client.get(f"/api/projects/{project_id}/revisions/{moment_id}/{snapshot_id}")
    assert resp.json()["notes"] == []


def test_snapshot_requires_existing_draft(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "No Draft Yet"}).json()["projectId"]
    resp = client.post(f"/api/projects/{project_id}/revisions/moment_1", json={"label": "x"})
    assert resp.status_code == 404
