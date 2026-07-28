from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.storage.schema import SCHEMA_VERSION


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def test_activity_aggregates_outline_plot_and_draft_events(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Activity Test"}).json()["projectId"]

    tree = client.get(f"/api/projects/{project_id}/outline").json()
    tree["nodes"][0]["title"] = "Renamed"
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    moment_id = "moment_1"
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Four words here now."},
    )
    client.post(f"/api/projects/{project_id}/revisions/{moment_id}", json={"label": "v1"})

    resp = client.get(f"/api/projects/{project_id}/activity")
    assert resp.status_code == 200
    body = resp.json()

    today_entry = body["daily"]["days"][_today()]
    assert today_entry["outlineSaves"] == 1
    assert today_entry["wordCountDelta"] == 4
    assert today_entry["draftRevisions"] == 1

    types = {entry["type"] for entry in body["log"]}
    assert types == {"outline", "draft"}

    draft_entry = next(e for e in body["log"] if e["type"] == "draft")
    assert draft_entry["momentId"] == moment_id
    assert draft_entry["wordCount"] == 4

    # Reverse-chronological.
    created_ats = [e["createdAt"] for e in body["log"]]
    assert created_ats == sorted(created_ats, reverse=True)


def test_activity_empty_for_untouched_project(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Untouched"}).json()["projectId"]
    resp = client.get(f"/api/projects/{project_id}/activity")
    assert resp.status_code == 200
    assert resp.json() == {"daily": {"schemaVersion": SCHEMA_VERSION, "days": {}}, "log": []}
