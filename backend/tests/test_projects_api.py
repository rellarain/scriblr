from pathlib import Path

from fastapi.testclient import TestClient


def test_create_and_list_projects(client: TestClient) -> None:
    resp = client.post("/api/projects", json={"title": "Novel A"})
    assert resp.status_code == 200
    project_id = resp.json()["projectId"]

    resp = client.get("/api/projects")
    assert resp.status_code == 200
    titles = {p["title"] for p in resp.json()}
    assert titles == {"Novel A"}

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["index"]["title"] == "Novel A"
    assert body["outline"]["nodes"][0]["kind"] == "book"
    assert body["warnings"] == []


def test_get_missing_project_returns_404(client: TestClient) -> None:
    resp = client.get("/api/projects/does_not_exist")
    assert resp.status_code == 404


def test_update_project_metadata(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Original"}).json()["projectId"]

    resp = client.patch(f"/api/projects/{project_id}", json={"title": "Renamed", "wordCountTarget": 50000})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Renamed"
    assert body["settings"]["wordCountTarget"] == 50000


def test_delete_project(client: TestClient, storage_root: Path) -> None:
    project_id = client.post("/api/projects", json={"title": "Temp"}).json()["projectId"]

    resp = client.delete(f"/api/projects/{project_id}")
    assert resp.status_code == 204
    assert not (storage_root / project_id).exists()

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 404


def test_corrupt_outline_surfaces_warning_without_failing_project_load(
    client: TestClient, storage_root: Path
) -> None:
    project_id = client.post("/api/projects", json={"title": "Corrupt Outline"}).json()["projectId"]
    outline_path = storage_root / project_id / "outline" / "tree.json"
    outline_path.write_text("{not valid json", encoding="utf-8")

    resp = client.get(f"/api/projects/{project_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["outline"] is None
    assert len(body["warnings"]) == 1
    assert "corrupt" in body["warnings"][0]

    # Plot sibling shard must still be reachable.
    resp = client.get(f"/api/projects/{project_id}/plot")
    assert resp.status_code == 200
