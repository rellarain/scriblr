"""What used to grow without end is bounded: a chapter's session revisions, and the saved-settings map."""
from datetime import timedelta
from pathlib import Path

import pytest

from app.storage import project_store as store
from app.storage import user_settings_store as uss
from app.storage.schema import RevisionSnapshot, utcnow


def _rev(chapter: str, i: int, trigger: str) -> RevisionSnapshot:
    when = utcnow() - timedelta(minutes=1000 - i)
    return RevisionSnapshot(
        snapshotId=f"{trigger}_{i}", chapterId=chapter, createdAt=when, updatedAt=when if trigger == "session" else None,
        label=f"{trigger} {i}", trigger=trigger, moments={"m1": "text"}, wordCount=1,
    )


def test_a_chapter_keeps_its_newest_session_revisions_and_every_manual_one(storage_root: Path) -> None:
    pid = store.create_project(storage_root, "Book").projectId
    for i in range(15):
        store.save_revision(storage_root, pid, _rev("ch1", i, "session"))
    for i in range(3):
        store.save_revision(storage_root, pid, _rev("ch1", 100 + i, "manual"))
    store.save_revision(storage_root, pid, _rev("ch2", 0, "session"))

    assert store.cap_session_revisions(storage_root, pid, "ch1", keep=10) == 5
    left = store.list_revisions(storage_root, pid, "ch1")
    sessions = sorted(r.snapshotId for r in left if r.trigger == "session")
    assert sessions == sorted(f"session_{i}" for i in range(5, 15))  # the oldest five went
    assert len([r for r in left if r.trigger == "manual"]) == 3
    assert len(store.list_revisions(storage_root, pid, "ch2")) == 1  # another chapter is untouched
    assert store.cap_session_revisions(storage_root, pid, "ch1", keep=10) == 0  # nothing more to do


def test_the_saved_settings_map_has_a_limit_but_existing_keys_can_change(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(uss, "MAX_KEYS", 3)
    for i in range(3):
        uss.set_kv(tmp_path, f"scriblr.k{i}", i)
    with pytest.raises(uss.InvalidKvError):
        uss.set_kv(tmp_path, "scriblr.k3", 3)
    assert uss.set_kv(tmp_path, "scriblr.k1", "changed").kv["scriblr.k1"] == "changed"
    uss.delete_kv(tmp_path, "scriblr.k0")
    assert uss.set_kv(tmp_path, "scriblr.k3", 3).kv["scriblr.k3"] == 3
