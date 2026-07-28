import json
from pathlib import Path

import pytest

from app.storage import project_store as store
from app.storage.schema import (
    BrainstormNote,
    DraftScene,
    OutlineNode,
    RevisionSnapshot,
    utcnow,
)


def test_create_project_writes_expected_shards(storage_root: Path) -> None:
    index = store.create_project(storage_root, "My Novel")

    project_dir = storage_root / index.projectId
    assert (project_dir / "index.json").exists()
    assert (project_dir / "outline" / "tree.json").exists()
    assert (project_dir / "brainstorm" / "notes.json").exists()

    loaded = store.load_index(storage_root, index.projectId)
    assert loaded.title == "My Novel"
    assert loaded.manifest.draftScenes == []

    outline = store.load_outline(storage_root, index.projectId)
    assert len(outline.nodes) == 1
    assert outline.nodes[0].kind == "book"
    assert outline.nodes[0].title == "My Novel"


def test_list_projects_returns_all_created(storage_root: Path) -> None:
    a = store.create_project(storage_root, "A")
    b = store.create_project(storage_root, "B")

    ids = {p.projectId for p in store.list_projects(storage_root)}
    assert ids == {a.projectId, b.projectId}


def test_delete_project_removes_directory(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Temp")
    store.delete_project(storage_root, index.projectId)
    assert not (storage_root / index.projectId).exists()
    with pytest.raises(store.ProjectNotFoundError):
        store.load_index(storage_root, index.projectId)


def test_outline_round_trip_and_reorder(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Outline Test")
    outline = store.load_outline(storage_root, index.projectId)
    book_id = outline.nodes[0].id

    outline.nodes.append(
        OutlineNode(id="ch_1", kind="chapter", parentId=book_id, order=0, title="Chapter One")
    )
    outline.nodes.append(
        OutlineNode(
            id="scene_1",
            kind="scene",
            parentId="ch_1",
            order=0,
            title="Opening",
            draftRef="scene_1",
        )
    )
    store.save_outline(storage_root, index.projectId, outline)

    reloaded = store.load_outline(storage_root, index.projectId)
    assert [n.id for n in reloaded.nodes] == [book_id, "ch_1", "scene_1"]
    assert reloaded.nodes[2].draftRef == "scene_1"

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.updatedAt >= index.updatedAt


def test_brainstorm_round_trip(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Brainstorm Test")
    notes = store.load_brainstorm(storage_root, index.projectId)
    assert notes.notes == []

    now = utcnow()
    notes.notes.append(
        BrainstormNote(id="note_1", createdAt=now, updatedAt=now, body="A twist idea", tags=["twist"])
    )
    store.save_brainstorm(storage_root, index.projectId, notes)

    reloaded = store.load_brainstorm(storage_root, index.projectId)
    assert len(reloaded.notes) == 1
    assert reloaded.notes[0].body == "A twist idea"


def test_draft_save_registers_scene_in_manifest(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Draft Test")

    with pytest.raises(store.SceneNotFoundError):
        store.load_draft(storage_root, index.projectId, "scene_1")

    draft = DraftScene(sceneId="scene_1", outlineNodeId="scene_1", updatedAt=utcnow(), body="Hello.")
    store.save_draft(storage_root, index.projectId, "scene_1", draft)

    reloaded = store.load_draft(storage_root, index.projectId, "scene_1")
    assert reloaded.body == "Hello."

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.draftScenes == ["scene_1"]

    # A second save to the same scene must not duplicate the manifest entry.
    draft.body = "Hello, again."
    store.save_draft(storage_root, index.projectId, "scene_1", draft)
    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.draftScenes == ["scene_1"]


def test_delete_draft_removes_shard_and_manifest_entry(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Delete Draft Test")
    draft = DraftScene(sceneId="scene_1", outlineNodeId="scene_1", updatedAt=utcnow(), body="Hello.")
    store.save_draft(storage_root, index.projectId, "scene_1", draft)

    store.delete_draft(storage_root, index.projectId, "scene_1")

    with pytest.raises(store.SceneNotFoundError):
        store.load_draft(storage_root, index.projectId, "scene_1")

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.draftScenes == []


def test_revision_snapshot_round_trip_and_manifest(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Revision Test")
    snapshot = RevisionSnapshot(
        snapshotId="snap_1",
        sceneId="scene_1",
        createdAt=utcnow(),
        label="first pass",
        trigger="manual",
        body="Once upon a time.",
        wordCount=3,
    )
    store.save_revision(storage_root, index.projectId, snapshot)

    reloaded = store.load_revision(storage_root, index.projectId, "scene_1", "snap_1")
    assert reloaded.body == "Once upon a time."

    listed = store.list_revisions(storage_root, index.projectId, "scene_1")
    assert [s.snapshotId for s in listed] == ["snap_1"]

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.revisionScenes == ["scene_1"]

    with pytest.raises(store.SnapshotNotFoundError):
        store.load_revision(storage_root, index.projectId, "scene_1", "does_not_exist")


def test_atomic_write_survives_interrupted_replace(storage_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    index = store.create_project(storage_root, "Crash Test")
    project_dir = storage_root / index.projectId
    outline_path = project_dir / "outline" / "tree.json"
    original_bytes = outline_path.read_bytes()

    def boom(*_args: object, **_kwargs: object) -> None:
        raise OSError("simulated crash during os.replace")

    monkeypatch.setattr(store.os, "replace", boom)

    outline = store.load_outline(storage_root, index.projectId)
    outline.nodes[0].title = "This should never land"
    with pytest.raises(OSError):
        store.save_outline(storage_root, index.projectId, outline)

    monkeypatch.undo()

    assert outline_path.read_bytes() == original_bytes
    # No leftover temp files should survive a failed write.
    tmp_dir = project_dir / ".tmp"
    assert list(tmp_dir.iterdir()) == []


def test_corrupt_shard_is_quarantined_and_siblings_survive(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Corruption Test")
    project_dir = storage_root / index.projectId
    outline_path = project_dir / "outline" / "tree.json"

    outline_path.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(store.ShardCorruptError) as exc_info:
        store.load_outline(storage_root, index.projectId)

    assert not outline_path.exists()
    assert exc_info.value.quarantined_path.exists()
    assert ".corrupt-" in exc_info.value.quarantined_path.name

    # Sibling shards (index, brainstorm) must still load fine.
    reloaded_index = store.load_index(storage_root, index.projectId)
    assert reloaded_index.title == "Corruption Test"
    reloaded_notes = store.load_brainstorm(storage_root, index.projectId)
    assert reloaded_notes.notes == []


def test_list_projects_skips_corrupt_project_without_crashing(storage_root: Path) -> None:
    good = store.create_project(storage_root, "Good Project")
    bad = store.create_project(storage_root, "Bad Project")

    bad_index_path = storage_root / bad.projectId / "index.json"
    bad_index_path.write_text("{ this is not json", encoding="utf-8")

    results = store.list_projects(storage_root)
    ids = {p.projectId for p in results}
    assert ids == {good.projectId}
