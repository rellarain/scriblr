import json
from pathlib import Path

from app.storage import project_store as store
from app.storage.schema import DraftMoment, OutlineTree, PlotTree, ProjectIndex, utcnow


def test_full_project_migrates_from_old_multi_file_layout_idempotently(storage_root: Path) -> None:
    project_id = "legacy_full_proj"
    project_dir = storage_root / project_id
    project_dir.mkdir()
    now = utcnow()

    index = ProjectIndex(projectId=project_id, title="Old Layout Book", createdAt=now, updatedAt=now)
    (project_dir / "index.json").write_text(index.model_dump_json(indent=2), encoding="utf-8")

    (project_dir / "outline").mkdir()
    outline = OutlineTree(
        nodes=[{"id": "book_1", "kind": "book", "parentId": None, "order": 0, "title": "Old Layout Book"}]
    )
    (project_dir / "outline" / "tree.json").write_text(outline.model_dump_json(indent=2), encoding="utf-8")

    (project_dir / "brainstorm").mkdir()
    (project_dir / "brainstorm" / "plot.json").write_text(PlotTree().model_dump_json(indent=2), encoding="utf-8")

    assert not (project_dir / "project.json").exists()

    loaded = store.load_index(storage_root, project_id)
    assert loaded.title == "Old Layout Book"
    assert (project_dir / "project.json").exists()
    # Old files are left in place, untouched, forever.
    assert (project_dir / "index.json").exists()
    assert (project_dir / "outline" / "tree.json").exists()

    loaded_outline = store.load_outline(storage_root, project_id)
    assert [n.title for n in loaded_outline.nodes] == ["Old Layout Book"]

    # Idempotent: re-touching the project doesn't re-migrate or error.
    loaded_again = store.load_index(storage_root, project_id)
    assert loaded_again.title == "Old Layout Book"


def test_load_draft_folds_in_legacy_per_moment_file(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Legacy Draft Test")
    project_dir = storage_root / index.projectId

    legacy_path = project_dir / "draft" / "moment_1.json"
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    legacy = DraftMoment(momentId="moment_1", outlineNodeId="moment_1", updatedAt=utcnow(), wordCount=2, body="Old prose.")
    legacy_path.write_text(json.dumps(legacy.model_dump(mode="json")), encoding="utf-8")

    # Not present in project.json's drafts section yet.
    assert "moment_1" not in store.load_draft_chapter(storage_root, index.projectId, "chapter_1").moments

    draft = store.load_draft(storage_root, index.projectId, "chapter_1", "moment_1")
    assert draft.body == "Old prose."
    assert draft.wordCount == 2

    # Folded into project.json's drafts section...
    chapter = store.load_draft_chapter(storage_root, index.projectId, "chapter_1")
    assert chapter.moments["moment_1"].body == "Old prose."

    # ...and the legacy file is left on disk untouched, not deleted.
    assert legacy_path.exists()

    # A second load no longer needs the legacy file -- reads straight from
    # the chapter file (confirmed by deleting the legacy file and reloading).
    legacy_path.unlink()
    draft_again = store.load_draft(storage_root, index.projectId, "chapter_1", "moment_1")
    assert draft_again.body == "Old prose."


def test_migrate_legacy_revisions_converts_one_snapshot_per_moment(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Legacy Revision Test")
    project_dir = storage_root / index.projectId

    legacy_dir = project_dir / "revisions" / "moment_1"
    legacy_dir.mkdir(parents=True, exist_ok=True)
    legacy_snapshot = {
        "schemaVersion": 2,
        "snapshotId": "snap_old",
        "momentId": "moment_1",
        "createdAt": utcnow().isoformat(),
        "label": "v1",
        "trigger": "manual",
        "body": "Legacy body text.",
        "wordCount": 3,
        "notes": [
            {
                "id": "cmt_1",
                "anchor": {"type": "text-offset", "start": 0, "end": 6},
                "body": "note",
                "flag": None,
                "createdAt": utcnow().isoformat(),
            }
        ],
    }
    (legacy_dir / "snap_old.json").write_text(json.dumps(legacy_snapshot), encoding="utf-8")

    store.migrate_legacy_revisions(storage_root, index.projectId, "chapter_1", ["moment_1"])

    snapshots = store.list_revisions(storage_root, index.projectId, "chapter_1")
    assert [s.snapshotId for s in snapshots] == ["snap_old"]
    migrated = store.load_revision(storage_root, index.projectId, "chapter_1", "snap_old")
    assert migrated.chapterId == "chapter_1"
    assert migrated.moments == {"moment_1": "Legacy body text."}
    assert migrated.notes[0].anchor.momentId == "moment_1"

    updated_index = store.load_index(storage_root, index.projectId)
    assert "chapter_1" in updated_index.manifest.revisionChapters

    # Old file untouched.
    assert (legacy_dir / "snap_old.json").exists()

    # Re-running is a no-op (doesn't duplicate or error).
    store.migrate_legacy_revisions(storage_root, index.projectId, "chapter_1", ["moment_1"])
    assert len(store.list_revisions(storage_root, index.projectId, "chapter_1")) == 1


def test_revisions_api_triggers_legacy_migration_for_live_moments(client) -> None:
    project_id = client.post("/api/projects", json={"title": "API Migration Test"}).json()["projectId"]
    outline = client.get(f"/api/projects/{project_id}/outline").json()
    book_id = outline["nodes"][0]["id"]
    outline["nodes"].append(
        {"id": "ch_1", "kind": "chapter", "parentId": book_id, "order": 0, "title": "Ch1", "synopsis": ""}
    )
    outline["nodes"].append(
        {"id": "moment_1", "kind": "moment", "parentId": "ch_1", "order": 0, "title": "M1", "synopsis": ""}
    )
    client.put(f"/api/projects/{project_id}/outline", json=outline)

    # Simulate a pre-upgrade project by writing a legacy revision file directly.
    from app.deps import get_storage_root as _get_root  # local import to avoid polluting module scope

    root = client.app.dependency_overrides[_get_root]()
    legacy_dir = root / project_id / "revisions" / "moment_1"
    legacy_dir.mkdir(parents=True, exist_ok=True)
    legacy_snapshot = {
        "schemaVersion": 2,
        "snapshotId": "snap_old",
        "momentId": "moment_1",
        "createdAt": "2026-01-01T00:00:00+00:00",
        "label": "v1",
        "trigger": "manual",
        "body": "Pre-upgrade prose.",
        "wordCount": 2,
        "notes": [],
    }
    (legacy_dir / "snap_old.json").write_text(json.dumps(legacy_snapshot), encoding="utf-8")

    resp = client.get(f"/api/projects/{project_id}/revisions/ch_1")
    assert resp.status_code == 200
    assert [s["snapshotId"] for s in resp.json()] == ["snap_old"]
