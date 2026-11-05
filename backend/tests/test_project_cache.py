"""The in-memory copy of the parsed project (project_store.py, 'The parsed project, kept in memory'): when it is used, and when it must not be."""
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.storage import project_store as store
from app.storage.schema import DraftMoment, OutlineNode, OutlineTree


@pytest.fixture
def reads(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Every time project.json is really read and validated (the suite-wide check of the kept copy reads it too, so it is off here)."""
    monkeypatch.setattr(store, "_VERIFY_CACHE", False)
    seen: list[str] = []
    real = store._load_project_file_locked

    def counting(root: Path, project_id: str):
        seen.append(project_id)
        return real(root, project_id)

    monkeypatch.setattr(store, "_load_project_file_locked", counting)
    return seen


def _moment(body: str = "Hello") -> DraftMoment:
    return DraftMoment(momentId="m1", outlineNodeId="m1", updatedAt=datetime.now(timezone.utc), wordCount=1, body=body)


def _project(storage_root: Path, title: str = "Book") -> str:
    index = store.create_project(storage_root, title)
    tree = store.load_outline(storage_root, index.projectId)
    nodes = list(tree.nodes) + [
        OutlineNode(id="ch1", kind="chapter", parentId=tree.nodes[0].id, order=0, title="One"),
        OutlineNode(id="m1", kind="moment", parentId="ch1", order=0, title="A moment"),
    ]
    store.save_outline(storage_root, index.projectId, OutlineTree(nodes=nodes))
    return index.projectId


def test_reads_and_saves_after_the_first_do_not_read_the_file_again(storage_root: Path, reads: list[str]) -> None:
    pid = _project(storage_root)
    reads.clear()
    store.load_outline(storage_root, pid)  # kept by the save above
    store.save_draft(storage_root, pid, "ch1", "m1", _moment("One"))
    store.save_draft(storage_root, pid, "ch1", "m1", _moment("Two"))
    assert store.load_draft(storage_root, pid, "ch1", "m1").body == "Two"
    assert store.load_index(storage_root, pid).title == "Book"
    assert reads == []


def test_what_a_save_wrote_is_what_the_file_says(storage_root: Path) -> None:
    pid = _project(storage_root)
    store.save_draft(storage_root, pid, "ch1", "m1", _moment("Kept"))
    on_disk = json.loads((storage_root / pid / "project.json").read_text(encoding="utf-8"))
    assert on_disk["drafts"]["ch1"]["moments"]["m1"]["body"] == "Kept"
    store._cache.clear()
    assert store.load_draft(storage_root, pid, "ch1", "m1").body == "Kept"  # a cold read agrees


def test_changing_a_result_does_not_change_the_kept_project(storage_root: Path) -> None:
    pid = _project(storage_root)
    tree = store.load_outline(storage_root, pid)
    tree.nodes[0].title = "Scribbled"
    tree.nodes.pop()
    index = store.load_index(storage_root, pid)
    index.title = "Scribbled"
    index.manifest.draftMoments.append("ghost")
    assert [n.title for n in store.load_outline(storage_root, pid).nodes][0] == "Book"
    assert len(store.load_outline(storage_root, pid).nodes) == 3
    assert store.load_index(storage_root, pid).title == "Book"
    assert store.load_index(storage_root, pid).manifest.draftMoments == []


def test_a_file_changed_behind_its_back_is_read_again(storage_root: Path, reads: list[str]) -> None:
    pid = _project(storage_root)
    assert store.load_index(storage_root, pid).title == "Book"
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["index"]["title"] = "Edited by hand"
    path.write_text(json.dumps(raw), encoding="utf-8")
    reads.clear()
    assert store.load_index(storage_root, pid).title == "Edited by hand"
    assert len(reads) == 1


def test_a_change_that_fails_leaves_nothing_behind_and_the_next_read_is_from_the_file(storage_root: Path, reads: list[str]) -> None:
    pid = _project(storage_root)

    def half(pf) -> None:
        pf.index.title = "Half done"
        raise RuntimeError("went wrong in the middle")

    with pytest.raises(RuntimeError):
        store.mutate(storage_root, pid, half)
    reads.clear()
    assert store.load_index(storage_root, pid).title == "Book"
    assert len(reads) == 1  # the kept copy was dropped, since it was part-changed


def test_a_transaction_that_raises_drops_its_changes_from_the_kept_copy(storage_root: Path) -> None:
    pid = _project(storage_root)
    with pytest.raises(RuntimeError):
        with store.transaction(storage_root, pid):
            store.mutate(storage_root, pid, lambda pf: setattr(pf.index, "title", "Never saved"))
            raise RuntimeError("the request failed")
    assert store.load_index(storage_root, pid).title == "Book"
    assert json.loads((storage_root / pid / "project.json").read_text(encoding="utf-8"))["index"]["title"] == "Book"


def test_a_failed_change_inside_a_transaction_that_writes_nothing_is_not_kept(storage_root: Path) -> None:
    pid = _project(storage_root)

    def half(pf) -> None:
        pf.index.title = "Half done"
        raise RuntimeError("went wrong in the middle")

    with store.transaction(storage_root, pid):
        with pytest.raises(RuntimeError):
            store.mutate(storage_root, pid, half)  # caught inside, so the block ends well with nothing marked to write
    assert store.load_index(storage_root, pid).title == "Book"


def test_a_failed_write_drops_the_kept_copy(storage_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pid = _project(storage_root)

    def broken(*_args, **_kwargs) -> None:
        raise OSError("disk full")

    real = store._atomic_write_json
    monkeypatch.setattr(store, "_atomic_write_json", broken)
    with pytest.raises(OSError):
        store.save_draft(storage_root, pid, "ch1", "m1", _moment("Lost"))
    monkeypatch.setattr(store, "_atomic_write_json", real)
    with pytest.raises(store.MomentNotFoundError):
        store.load_draft(storage_root, pid, "ch1", "m1")  # what the failed save changed in memory is gone


def test_a_project_with_an_unreadable_section_is_not_kept(storage_root: Path, reads: list[str]) -> None:
    pid = _project(storage_root)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["plot"] = "this is not a plot"
    path.write_text(json.dumps(raw), encoding="utf-8")
    reads.clear()
    for _ in range(2):
        with pytest.raises(store.ShardCorruptError):
            store.load_plot(storage_root, pid)
    assert len(reads) == 2  # read again each time, as before


def test_a_deleted_project_leaves_the_cache(storage_root: Path) -> None:
    pid = _project(storage_root)
    store.load_index(storage_root, pid)
    store.delete_project(storage_root, pid)
    with pytest.raises(store.ProjectNotFoundError):
        store.load_index(storage_root, pid)


def test_only_the_last_few_projects_are_kept(storage_root: Path, reads: list[str]) -> None:
    ids = [_project(storage_root, f"Book {i}") for i in range(store._CACHE_PROJECTS + 2)]
    assert len(store._cache) == store._CACHE_PROJECTS
    reads.clear()
    store.load_index(storage_root, ids[-1])
    assert reads == []
    store.load_index(storage_root, ids[0])  # long ago pushed out
    assert reads == [ids[0]]


def test_saves_and_reads_from_many_threads_never_see_a_half_changed_project(storage_root: Path) -> None:
    pid = _project(storage_root)
    errors: list[BaseException] = []

    def write(n: int) -> None:
        try:
            for i in range(15):
                store.save_draft(storage_root, pid, "ch1", f"m{n}", _moment(f"{n}-{i}").model_copy(update={"momentId": f"m{n}"}))
        except BaseException as e:  # noqa: BLE001
            errors.append(e)

    def read() -> None:
        try:
            for _ in range(40):
                chapter = store.load_draft_chapter(storage_root, pid, "ch1")
                for body in (m.body for m in chapter.moments.values()):  # iterating a copy while others save
                    assert "-" in body
                store.load_outline(storage_root, pid)
        except BaseException as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=write, args=(n,)) for n in range(4)] + [threading.Thread(target=read) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    store._cache.clear()
    assert len(store.load_draft_chapter(storage_root, pid, "ch1").moments) == 4


def test_a_whole_request_is_one_read_at_most_and_one_write(storage_root: Path, reads: list[str], monkeypatch: pytest.MonkeyPatch) -> None:
    pid = _project(storage_root)
    store._cache.clear()
    writes: list[str] = []
    real = store._write_project_file
    monkeypatch.setattr(store, "_write_project_file", lambda root, p, pf: (writes.append(p), real(root, p, pf))[1])
    reads.clear()
    with store.transaction(storage_root, pid):
        store.save_draft(storage_root, pid, "ch1", "m1", _moment("A"))
        store.load_index(storage_root, pid)
    assert len(reads) == 1 and len(writes) == 1
    reads.clear()
    with store.transaction(storage_root, pid):
        store.save_draft(storage_root, pid, "ch1", "m1", _moment("B"))
    assert reads == [] and len(writes) == 2  # the second request starts from the kept copy
