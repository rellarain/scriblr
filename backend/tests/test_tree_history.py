from fastapi.testclient import TestClient


def _make_project(client: TestClient, title: str = "History Test") -> tuple[str, dict]:
    resp = client.post("/api/projects", json={"title": title})
    project_id = resp.json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    return project_id, tree


def test_outline_history_starts_empty_and_dedups_noop_saves(client: TestClient) -> None:
    project_id, tree = _make_project(client)

    # Project creation writes the outline shard directly, bypassing the API
    # route's auto-snapshot hook, so history starts empty.
    resp = client.get(f"/api/projects/{project_id}/outline/history")
    assert resp.status_code == 200
    assert resp.json() == []

    # First PUT (even with unchanged content) creates the first snapshot.
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    resp = client.get(f"/api/projects/{project_id}/outline/history")
    assert len(resp.json()) == 1

    # Re-saving identical content must not create a second snapshot.
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    resp = client.get(f"/api/projects/{project_id}/outline/history")
    assert len(resp.json()) == 1

    # A real change creates a second snapshot.
    tree["nodes"][0]["title"] = "Renamed Book"
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    resp = client.get(f"/api/projects/{project_id}/outline/history")
    history = resp.json()
    assert len(history) == 2
    # Newest first.
    assert history[0]["nodeCount"] == 1
    assert "modified" in history[0]["summary"]


def test_outline_history_diff_reports_title_change(client: TestClient) -> None:
    project_id, tree = _make_project(client)
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    v1_id = client.get(f"/api/projects/{project_id}/outline/history").json()[0]["snapshotId"]

    tree["nodes"][0]["title"] = "New Title"
    client.put(f"/api/projects/{project_id}/outline", json=tree)

    resp = client.get(
        f"/api/projects/{project_id}/outline/history/diff", params={"from": v1_id, "to": "current"}
    )
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["kind"] == "modified"
    assert "title" in entries[0]["changedFields"]


def test_outline_history_revert_restores_nodes_and_creates_safety_snapshot(client: TestClient) -> None:
    project_id, tree = _make_project(client)
    book_id = tree["nodes"][0]["id"]

    tree["nodes"][0]["title"] = "Version One"
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    v1_id = client.get(f"/api/projects/{project_id}/outline/history").json()[0]["snapshotId"]

    tree["nodes"][0]["title"] = "Version Two"
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    v2_id = client.get(f"/api/projects/{project_id}/outline/history").json()[0]["snapshotId"]

    # The live tree right now ("Version Two") is identical to the most
    # recently stored snapshot (v2), so this revert needs no safety snapshot
    # -- the pre-revert state already has provenance via v2 itself.
    resp = client.post(f"/api/projects/{project_id}/outline/history/{v1_id}/revert")
    assert resp.status_code == 200
    body = resp.json()
    assert body["safetySnapshotId"] is None
    assert body["outline"]["nodes"][0]["title"] == "Version One"

    resp = client.get(f"/api/projects/{project_id}/outline")
    assert resp.json()["nodes"][0]["title"] == "Version One"

    resp = client.get(f"/api/projects/{project_id}/outline/history")
    assert len(resp.json()) == 2

    resp = client.get(f"/api/projects/{project_id}/outline/history/{v1_id}")
    assert resp.json()["nodes"][0]["id"] == book_id

    # The live tree is now "Version One", which does NOT match the most
    # recently stored snapshot (still v2, "Version Two") -- so reverting
    # again (this time to v2) must capture "Version One" in a safety
    # snapshot before overwriting it.
    resp = client.post(f"/api/projects/{project_id}/outline/history/{v2_id}/revert")
    assert resp.status_code == 200
    body = resp.json()
    assert body["safetySnapshotId"] is not None
    assert body["outline"]["nodes"][0]["title"] == "Version Two"

    resp = client.get(f"/api/projects/{project_id}/outline/history")
    assert len(resp.json()) == 3


def test_outline_history_snapshot_and_revert_404_for_unknown_id(client: TestClient) -> None:
    project_id, _ = _make_project(client)
    resp = client.get(f"/api/projects/{project_id}/outline/history/nope")
    assert resp.status_code == 404
    resp = client.post(f"/api/projects/{project_id}/outline/history/nope/revert")
    assert resp.status_code == 404


def test_plot_history_dedup_diff_and_revert(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Plot History Test"}).json()["projectId"]
    plot = client.get(f"/api/projects/{project_id}/plot").json()
    plot["nodes"].append(
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Themes"}
    )

    client.put(f"/api/projects/{project_id}/plot", json=plot)
    client.put(f"/api/projects/{project_id}/plot", json=plot)  # no-op, should not add a snapshot
    resp = client.get(f"/api/projects/{project_id}/plot/history")
    assert len(resp.json()) == 1
    v1_id = resp.json()[0]["snapshotId"]

    plot["nodes"][0]["title"] = "Themes Renamed"
    client.put(f"/api/projects/{project_id}/plot", json=plot)
    resp = client.get(f"/api/projects/{project_id}/plot/history")
    assert len(resp.json()) == 2

    resp = client.post(f"/api/projects/{project_id}/plot/history/{v1_id}/revert")
    assert resp.status_code == 200
    assert resp.json()["plot"]["nodes"][0]["title"] == "Themes"
