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


def _task(**extra) -> dict:
    return {"id": "i1", "label": "Revise", "facet": None, "targetNodeId": None, "targetTree": None, "shiftId": None, "doneOn": None, **extra}


def _planner(items: list[dict]) -> dict:
    return {"goals": [], "shifts": [], "routines": [], "items": items, "templates": [], "restDays": []}


def test_a_task_keeps_its_priority_due_date_notes_subtasks_and_estimate(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Tasks"}).json()["projectId"]
    task = _task(
        priority="high", dueDate="2027-02-01", notes="Check the timeline", estimateMinutes=90, aim=1500, addedOn="2027-01-10", carried=True,
        subtasks=[{"id": "s1", "label": "Chapter 3", "done": True}, {"id": "s2", "label": "Chapter 4"}],
    )
    assert client.put(f"/api/projects/{project_id}/planner", json=_planner([task])).status_code == 200
    got = client.get(f"/api/projects/{project_id}/planner").json()["items"][0]
    assert got["priority"] == "high"
    assert got["dueDate"] == "2027-02-01"
    assert got["estimateMinutes"] == 90
    assert got["aim"] == 1500
    assert got["carried"] is True
    assert got["subtasks"] == [{"id": "s1", "label": "Chapter 3", "done": True}, {"id": "s2", "label": "Chapter 4", "done": False}]


def test_a_task_saved_before_priorities_is_medium_and_a_new_one_is_none_unless_it_says_otherwise(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Legacy"}).json()["projectId"]
    # (the key is missing, as in a file written before priorities)
    assert client.put(f"/api/projects/{project_id}/planner", json=_planner([_task(id="old")])).status_code == 200
    assert client.get(f"/api/projects/{project_id}/planner").json()["items"][0]["priority"] == "medium"
    assert client.put(f"/api/projects/{project_id}/planner", json=_planner([_task(id="new", priority="none")])).status_code == 200
    assert client.get(f"/api/projects/{project_id}/planner").json()["items"][0]["priority"] == "none"


def test_a_task_with_a_bad_priority_date_or_estimate_is_refused(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Bad"}).json()["projectId"]
    for bad in ({"priority": "urgent"}, {"dueDate": "tomorrow"}, {"estimateMinutes": 0}, {"estimateMinutes": 5000}, {"notes": "x" * 2001}):
        assert client.put(f"/api/projects/{project_id}/planner", json=_planner([_task(**bad)])).status_code == 422, bad
