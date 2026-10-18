"""Path safety and the guards around project.json: ids that cannot climb out of the data directory, a project's trash, a file from a newer
build, an unreadable section that is kept rather than replaced, quarantine copies, the last-good .bak, and stale temp files."""
import json
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deps import get_app_data_storage_root, get_storage_root
from app.main import create_app
from app.storage import project_store as store
from app.storage.ids import InvalidIdError, check_id
from app.storage.schema import PROJECT_FILE_VERSION, PlotTree


# ---------------------------------------------------------------- ids

@pytest.mark.parametrize("good", ["prj_ab12cd34", "a-b_c", "3f2b8c1e-0000-4000-8000-123456789abc", "book_1", "ch1"])
def test_ordinary_ids_pass(good: str) -> None:
    assert check_id(good) == good


@pytest.mark.parametrize("bad", ["", ".", "..", "../x", "a/b", "a\\b", "C:evil", "..\\..\\x", ".hidden", "a..b", "trailing.", " pad ", "nul\0", "a" * 201, "x*y"])
def test_ids_that_could_leave_the_directory_are_refused(bad: str) -> None:
    with pytest.raises(InvalidIdError):
        check_id(bad)


def test_the_store_refuses_a_project_id_that_climbs_out(storage_root: Path) -> None:
    keep = storage_root / "keep.txt"
    keep.write_text("x", encoding="utf-8")
    for bad in ("..", "../..", "a/../..", "..\\.."):
        with pytest.raises(InvalidIdError):
            store.delete_project(storage_root, bad)
        with pytest.raises(InvalidIdError):
            store.load_index(storage_root, bad)
    assert keep.exists() and storage_root.exists()


def test_a_moment_id_cannot_name_another_file(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Book")
    with pytest.raises(InvalidIdError):
        store.migrate_legacy_revisions(storage_root, index.projectId, "ch1", ["..\\..\\project"])


def test_the_api_answers_400_for_a_bad_id(client: TestClient, storage_root: Path) -> None:
    resp = client.get("/api/projects/%2e%2e")
    assert resp.status_code == 400
    assert client.delete("/api/projects/%2e%2e").status_code == 400
    assert storage_root.exists()


def test_the_static_fallback_never_serves_a_file_outside_the_frontend(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (dist / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("secret", encoding="utf-8")
    c = TestClient(create_app(static_dir=dist))
    assert c.get("/app.js").text == "console.log(1)"
    for path in ("/..%2fsecret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt"):
        body = c.get(path).text
        assert "secret" not in body
        assert "app" in body  # the index, as for any unknown page


# ---------------------------------------------------------------- trash

def test_deleting_a_project_moves_it_to_the_trash(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Doomed")
    store.delete_project(storage_root, index.projectId)
    assert not (storage_root / index.projectId).exists()
    trashed = list((storage_root / ".trash").iterdir())
    assert len(trashed) == 1 and trashed[0].name.startswith(index.projectId)
    assert (trashed[0] / "project.json").exists()
    assert store.list_projects(storage_root) == []  # the trash is not a project


def test_the_trash_is_emptied_of_old_projects_only(storage_root: Path) -> None:
    old, new = store.create_project(storage_root, "Old"), store.create_project(storage_root, "New")
    store.delete_project(storage_root, old.projectId)
    store.delete_project(storage_root, new.projectId)
    trash = storage_root / ".trash"
    old_dir = next(p for p in trash.iterdir() if p.name.startswith(old.projectId))
    long_ago = time.time() - 40 * 86400
    os.utime(old_dir, (long_ago, long_ago))
    store.purge_trash(storage_root)
    assert [p.name.split("-")[0] for p in trash.iterdir()] == [new.projectId]


# ---------------------------------------------------------------- the file's version

def _raw(storage_root: Path, project_id: str) -> dict:
    return json.loads((storage_root / project_id / "project.json").read_text(encoding="utf-8"))


def _put(storage_root: Path, project_id: str, raw: dict) -> None:
    (storage_root / project_id / "project.json").write_text(json.dumps(raw), encoding="utf-8")


def test_a_file_from_a_newer_build_is_read_but_never_written_over(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Future")
    raw = _raw(storage_root, index.projectId)
    raw["schemaVersion"] = PROJECT_FILE_VERSION + 1
    raw["somethingNew"] = {"keep": "me"}
    _put(storage_root, index.projectId, raw)
    before = (storage_root / index.projectId / "project.json").read_text(encoding="utf-8")
    assert store.load_index(storage_root, index.projectId).title == "Future"  # readable
    with pytest.raises(store.NewerSchemaError):
        store.update_project_metadata(storage_root, index.projectId, title="Changed")
    assert (storage_root / index.projectId / "project.json").read_text(encoding="utf-8") == before


def test_the_api_says_409_for_a_newer_file(client: TestClient, storage_root: Path) -> None:
    index = store.create_project(storage_root, "Future")
    raw = _raw(storage_root, index.projectId)
    raw["schemaVersion"] = PROJECT_FILE_VERSION + 1
    _put(storage_root, index.projectId, raw)
    resp = client.patch(f"/api/projects/{index.projectId}", json={"title": "Changed"})
    assert resp.status_code == 409
    assert "newer version" in resp.json()["detail"]


def test_a_write_brings_an_older_file_up_to_the_current_version(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Old")
    raw = _raw(storage_root, index.projectId)
    raw["schemaVersion"] = 2
    _put(storage_root, index.projectId, raw)
    store.update_project_metadata(storage_root, index.projectId, title="Renamed")
    assert _raw(storage_root, index.projectId)["schemaVersion"] == PROJECT_FILE_VERSION


# ---------------------------------------------------------------- unreadable sections

def _break_plot(storage_root: Path, project_id: str) -> dict:
    raw = _raw(storage_root, project_id)
    bad = {"schemaVersion": 1, "nodes": [{"id": "x", "kind": "from-the-future", "parentId": None, "order": 0, "title": "Kept"}]}
    raw["plot"] = bad
    _put(storage_root, project_id, raw)
    return bad


def test_an_unreadable_plot_stays_in_the_file_through_other_saves(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Book")
    bad = _break_plot(storage_root, index.projectId)
    with pytest.raises(store.ShardCorruptError):
        store.load_plot(storage_root, index.projectId)
    store.update_project_metadata(storage_root, index.projectId, title="Renamed")  # an unrelated save
    raw = _raw(storage_root, index.projectId)
    assert raw["plot"] == bad  # not replaced by an empty plot
    assert raw["index"]["title"] == "Renamed"


def test_saving_a_plot_replaces_an_unreadable_one(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Book")
    _break_plot(storage_root, index.projectId)
    store.save_plot(storage_root, index.projectId, PlotTree())
    assert _raw(storage_root, index.projectId)["plot"]["nodes"] == []
    assert store.load_plot(storage_root, index.projectId).nodes == []


def test_an_unreadable_section_is_quarantined_once_not_on_every_read(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Book")
    _break_plot(storage_root, index.projectId)
    for _ in range(4):
        with pytest.raises(store.ShardCorruptError):
            store.load_plot(storage_root, index.projectId)
    assert len(list((storage_root / index.projectId / "quarantine").glob("plot.corrupt-*.json"))) == 1


# ---------------------------------------------------------------- the last good copy, temp files

def test_each_write_keeps_the_previous_file_as_project_json_bak(storage_root: Path) -> None:
    index = store.create_project(storage_root, "First")
    path = storage_root / index.projectId / "project.json"
    first = path.read_text(encoding="utf-8")
    store.update_project_metadata(storage_root, index.projectId, title="Second")
    bak = path.with_name("project.json.bak")
    assert bak.read_text(encoding="utf-8") == first
    assert json.loads(path.read_text(encoding="utf-8"))["index"]["title"] == "Second"


def test_sweeping_removes_only_old_temp_files(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Book")
    tmp = storage_root / index.projectId / ".tmp"
    tmp.mkdir(exist_ok=True)
    stale, fresh = tmp / "old.json", tmp / "new.json"
    stale.write_text("{", encoding="utf-8")
    fresh.write_text("{", encoding="utf-8")
    two_hours_ago = time.time() - 7200
    os.utime(stale, (two_hours_ago, two_hours_ago))
    assert store.sweep_temp_files(storage_root) == 1
    assert not stale.exists() and fresh.exists()


def test_the_app_starts_with_a_sweep(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCRIBLR_DATA_DIR", str(tmp_path / "data"))
    projects = tmp_path / "data" / "projects"
    (projects / "prj_1" / ".tmp").mkdir(parents=True)
    stale = projects / "prj_1" / ".tmp" / "x.json"
    stale.write_text("{", encoding="utf-8")
    old = time.time() - 7200
    os.utime(stale, (old, old))
    app = create_app()
    app.dependency_overrides[get_storage_root] = lambda: projects
    app.dependency_overrides[get_app_data_storage_root] = lambda: tmp_path / "data"
    with TestClient(app):
        pass
    assert not stale.exists()
