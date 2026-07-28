from fastapi.testclient import TestClient


def test_schedule_completions_persist_per_date(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Schedule Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/schedule/2026-07-28")
    assert resp.status_code == 200
    assert resp.json() == []

    resp = client.put(
        f"/api/projects/{project_id}/schedule/2026-07-28",
        json={"completedItemIds": ["routine:r1", "priority:p1"]},
    )
    assert resp.status_code == 200
    assert resp.json() == ["routine:r1", "priority:p1"]

    resp = client.get(f"/api/projects/{project_id}/schedule/2026-07-28")
    assert resp.json() == ["routine:r1", "priority:p1"]

    # A different date is unaffected.
    resp = client.get(f"/api/projects/{project_id}/schedule/2026-07-29")
    assert resp.json() == []

    # Overwriting replaces the whole set for that date.
    resp = client.put(
        f"/api/projects/{project_id}/schedule/2026-07-28", json={"completedItemIds": ["routine:r1"]}
    )
    assert resp.json() == ["routine:r1"]
