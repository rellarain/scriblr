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


def test_project_wide_chapter_count_target_no_longer_accepted(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "No Project Chapter Goal"}).json()["projectId"]
    resp = client.patch(f"/api/projects/{project_id}", json={"chapterCountTarget": 30})
    assert resp.status_code == 200
    assert "chapterCountTarget" not in resp.json()["settings"]


def test_project_defaults_to_all_levels_and_can_be_customized(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Levels Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}")
    settings = resp.json()["index"]["settings"]
    assert settings["outlineLevels"] == ["book", "arc", "chapter", "act", "scene", "moment"]
    assert settings["plotLevels"] == ["category", "plotline", "plotpoint"]

    resp = client.patch(
        f"/api/projects/{project_id}",
        json={"outlineLevels": ["book", "chapter", "scene"], "plotLevels": ["category", "plotpoint"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["settings"]["outlineLevels"] == ["book", "chapter", "scene"]
    assert body["settings"]["plotLevels"] == ["category", "plotpoint"]


def test_update_project_goals_priorities_and_routines(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Goals Test"}).json()["projectId"]

    resp = client.patch(
        f"/api/projects/{project_id}",
        json={
            "bookCountTarget": 3,
            "bookWordCountTarget": 80000,
            "chapterWordCountTarget": 2500,
            "priorities": [{"id": "p1", "label": "Finish Act 2", "order": 0}],
            "routines": [
                {"id": "r1", "label": "Morning pages", "daysOfWeek": [0, 1, 2, 3, 4], "targetWordCount": 500}
            ],
        },
    )
    assert resp.status_code == 200
    settings = resp.json()["settings"]
    assert settings["bookCountTarget"] == 3
    assert settings["bookWordCountTarget"] == 80000
    assert settings["chapterWordCountTarget"] == 2500
    assert settings["priorities"] == [{"id": "p1", "label": "Finish Act 2", "order": 0}]
    assert settings["routines"] == [
        {"id": "r1", "label": "Morning pages", "daysOfWeek": [0, 1, 2, 3, 4], "targetWordCount": 500}
    ]

    # Old projects with no priorities/routines default cleanly.
    resp = client.get(f"/api/projects/{project_id}")
    assert resp.json()["index"]["settings"]["priorities"][0]["label"] == "Finish Act 2"


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
