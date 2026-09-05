import json
from pathlib import Path

import pytest

from app.storage import project_store as store
from app.storage.schema import (
    DraftMoment,
    OutlineNode,
    PlotNode,
    RevisionSnapshot,
    utcnow,
)


def test_create_project_writes_single_project_file(storage_root: Path) -> None:
    index = store.create_project(storage_root, "My Novel")

    project_dir = storage_root / index.projectId
    assert (project_dir / "project.json").exists()
    # No more separate per-shard files/dirs for a freshly-created project.
    assert not (project_dir / "index.json").exists()
    assert not (project_dir / "outline").exists()
    assert not (project_dir / "brainstorm").exists()

    loaded = store.load_index(storage_root, index.projectId)
    assert loaded.title == "My Novel"
    assert loaded.manifest.draftMoments == []

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


def test_outline_round_trip_with_flexible_nesting(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Outline Test")
    outline = store.load_outline(storage_root, index.projectId)
    book_id = outline.nodes[0].id

    outline.nodes.append(
        OutlineNode(id="arc_1", kind="arc", parentId=book_id, order=0, title="Arc One")
    )
    outline.nodes.append(
        OutlineNode(id="ch_1", kind="chapter", parentId="arc_1", order=0, title="Chapter One")
    )
    # Flexible nesting: a scene straight under the book, skipping arc/chapter.
    outline.nodes.append(
        OutlineNode(id="scene_1", kind="scene", parentId=book_id, order=1, title="Cold Open")
    )
    outline.nodes.append(
        OutlineNode(
            id="moment_1",
            kind="moment",
            parentId="scene_1",
            order=0,
            title="Opening beat",
            draftRef="moment_1",
        )
    )
    store.save_outline(storage_root, index.projectId, outline)

    reloaded = store.load_outline(storage_root, index.projectId)
    assert [n.id for n in reloaded.nodes] == [book_id, "arc_1", "ch_1", "scene_1", "moment_1"]
    assert reloaded.nodes[3].parentId == book_id  # scene nested directly under book
    assert reloaded.nodes[4].draftRef == "moment_1"

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.updatedAt >= index.updatedAt


def test_plot_round_trip(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Plot Test")
    plot = store.load_plot(storage_root, index.projectId)
    assert plot.nodes == []

    plot.nodes.append(PlotNode(id="cat_1", kind="category", parentId=None, order=0, title="Betrayal"))
    plot.nodes.append(
        PlotNode(id="pl_1", kind="plotline", parentId="cat_1", order=0, title="The mole")
    )
    plot.nodes.append(
        PlotNode(
            id="pp_1",
            kind="plotpoint",
            parentId="pl_1",
            order=0,
            title="Reveal",
            body="The mole is the narrator's future self.",
            assignedMomentId="moment_1",
        )
    )
    store.save_plot(storage_root, index.projectId, plot)

    reloaded = store.load_plot(storage_root, index.projectId)
    assert [n.id for n in reloaded.nodes] == ["cat_1", "pl_1", "pp_1"]
    assert reloaded.nodes[2].assignedMomentId == "moment_1"


def test_draft_save_registers_moment_in_manifest(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Draft Test")

    with pytest.raises(store.MomentNotFoundError):
        store.load_draft(storage_root, index.projectId, "chapter_1", "moment_1")

    draft = DraftMoment(momentId="moment_1", outlineNodeId="moment_1", updatedAt=utcnow(), body="Hello.")
    store.save_draft(storage_root, index.projectId, "chapter_1", "moment_1", draft)

    reloaded = store.load_draft(storage_root, index.projectId, "chapter_1", "moment_1")
    assert reloaded.body == "Hello."

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.draftMoments == ["moment_1"]

    # A second save to the same moment must not duplicate the manifest entry.
    draft.body = "Hello, again."
    store.save_draft(storage_root, index.projectId, "chapter_1", "moment_1", draft)
    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.draftMoments == ["moment_1"]


def test_delete_draft_removes_shard_and_manifest_entry(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Delete Draft Test")
    draft = DraftMoment(momentId="moment_1", outlineNodeId="moment_1", updatedAt=utcnow(), body="Hello.")
    store.save_draft(storage_root, index.projectId, "chapter_1", "moment_1", draft)

    store.delete_draft(storage_root, index.projectId, "chapter_1", "moment_1")

    with pytest.raises(store.MomentNotFoundError):
        store.load_draft(storage_root, index.projectId, "chapter_1", "moment_1")

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.draftMoments == []


def test_revision_snapshot_round_trip_and_manifest(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Revision Test")
    snapshot = RevisionSnapshot(
        snapshotId="snap_1",
        chapterId="chapter_1",
        createdAt=utcnow(),
        label="first pass",
        trigger="manual",
        moments={"moment_1": "Once upon a time."},
        wordCount=3,
    )
    store.save_revision(storage_root, index.projectId, snapshot)

    reloaded = store.load_revision(storage_root, index.projectId, "chapter_1", "snap_1")
    assert reloaded.moments["moment_1"] == "Once upon a time."

    listed = store.list_revisions(storage_root, index.projectId, "chapter_1")
    assert [s.snapshotId for s in listed] == ["snap_1"]

    updated_index = store.load_index(storage_root, index.projectId)
    assert updated_index.manifest.revisionChapters == ["chapter_1"]

    with pytest.raises(store.SnapshotNotFoundError):
        store.load_revision(storage_root, index.projectId, "moment_1", "does_not_exist")


def test_atomic_write_survives_interrupted_replace(storage_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    index = store.create_project(storage_root, "Crash Test")
    project_dir = storage_root / index.projectId
    project_file = project_dir / "project.json"
    original_bytes = project_file.read_bytes()

    def boom(*_args: object, **_kwargs: object) -> None:
        raise OSError("simulated crash during os.replace")

    monkeypatch.setattr(store.os, "replace", boom)

    outline = store.load_outline(storage_root, index.projectId)
    outline.nodes[0].title = "This should never land"
    with pytest.raises(OSError):
        store.save_outline(storage_root, index.projectId, outline)

    monkeypatch.undo()

    assert project_file.read_bytes() == original_bytes
    # No leftover temp files should survive a failed write.
    tmp_dir = project_dir / ".tmp"
    assert list(tmp_dir.iterdir()) == []


def test_corrupt_section_is_quarantined_and_siblings_survive(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Corruption Test")
    project_dir = storage_root / index.projectId
    project_file = project_dir / "project.json"

    data = json.loads(project_file.read_text(encoding="utf-8"))
    data["outline"] = {"nodes": "not-a-list-should-fail-validation"}
    project_file.write_text(json.dumps(data), encoding="utf-8")

    with pytest.raises(store.ShardCorruptError) as exc_info:
        store.load_outline(storage_root, index.projectId)

    # Section-level quarantine copies the bad value aside without touching
    # project.json itself (unlike whole-file corruption, which renames it).
    assert project_file.exists()
    assert exc_info.value.quarantined_path.exists()
    assert "outline.corrupt-" in exc_info.value.quarantined_path.name

    # Sibling sections (index, plot) must still load fine from the same file.
    reloaded_index = store.load_index(storage_root, index.projectId)
    assert reloaded_index.title == "Corruption Test"
    reloaded_plot = store.load_plot(storage_root, index.projectId)
    assert reloaded_plot.nodes == []


def test_corrupt_whole_file_is_quarantined(storage_root: Path) -> None:
    index = store.create_project(storage_root, "Whole File Corruption Test")
    project_dir = storage_root / index.projectId
    project_file = project_dir / "project.json"

    project_file.write_text("{not valid json", encoding="utf-8")

    with pytest.raises(store.ShardCorruptError) as exc_info:
        store.load_index(storage_root, index.projectId)

    assert not project_file.exists()
    assert exc_info.value.quarantined_path.exists()
    assert ".corrupt-" in exc_info.value.quarantined_path.name


def test_consolidate_project_history_prunes_old_tree_snapshots_only(storage_root: Path) -> None:
    index = store.create_project(storage_root, "History Growth Test")

    # A manual revision snapshot -- must never be pruned by compaction.
    snapshot = RevisionSnapshot(
        snapshotId="snap_manual",
        chapterId="chapter_1",
        createdAt=utcnow(),
        label="keep me forever",
        trigger="manual",
        moments={"moment_1": "Some prose."},
        wordCount=2,
    )
    store.save_revision(storage_root, index.projectId, snapshot)

    # Under threshold: no-op.
    assert store.consolidate_project_history(storage_root, index.projectId) == []

    project_file = storage_root / index.projectId / "project.json"
    data = json.loads(project_file.read_text(encoding="utf-8"))
    data["outlineHistory"] = [
        {
            "schemaVersion": 2,
            "snapshotId": f"tsnap_{i}",
            "treeType": "outline",
            "createdAt": f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}+00:00",
            "trigger": "auto",
            "nodes": [],
        }
        for i in range(100)
    ]
    project_file.write_text(json.dumps(data), encoding="utf-8")

    messages = store.consolidate_project_history(storage_root, index.projectId)
    assert len(messages) == 1
    assert "50" in messages[0] and "outline" in messages[0]

    history = store.list_tree_snapshots(storage_root, index.projectId, "outline")
    assert len(history) == store.TREE_HISTORY_KEEP
    # Kept the most recent ones (highest-numbered snapshot ids, since they
    # were assigned in createdAt order above).
    assert {s.snapshotId for s in history} == {f"tsnap_{i}" for i in range(50, 100)}

    # Manual revisions are completely untouched by compaction.
    revisions = store.list_revisions(storage_root, index.projectId, "chapter_1")
    assert [s.snapshotId for s in revisions] == ["snap_manual"]

    # Idempotent / cheap no-op once back under threshold.
    assert store.consolidate_project_history(storage_root, index.projectId) == []


def test_list_projects_skips_corrupt_project_without_crashing(storage_root: Path) -> None:
    good = store.create_project(storage_root, "Good Project")
    bad = store.create_project(storage_root, "Bad Project")

    bad_project_file = storage_root / bad.projectId / "project.json"
    bad_project_file.write_text("{ this is not json", encoding="utf-8")

    results = store.list_projects(storage_root)
    ids = {p.projectId for p in results}
    assert ids == {good.projectId}
