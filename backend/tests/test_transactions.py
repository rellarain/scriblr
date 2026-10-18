"""store.transaction: one load and at most one write for everything a request does to a project."""
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage import project_store as store
from app.storage.schema import OutlineNode, OutlineTree


@pytest.fixture
def writes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    seen: list[str] = []
    real = store._write_project_file

    def counting(root: Path, project_id: str, pf) -> None:
        seen.append(project_id)
        real(root, project_id, pf)

    monkeypatch.setattr(store, "_write_project_file", counting)
    return seen


def _chapter(client: TestClient, storage_root: Path) -> tuple[str, str, str]:
    pid = client.post("/api/projects", json={"title": "Book"}).json()["projectId"]
    tree = store.load_outline(storage_root, pid)
    nodes = [n.model_dump() for n in tree.nodes]
    book = nodes[0]["id"]
    nodes += [
        {"id": "ch1", "kind": "chapter", "parentId": book, "order": 0, "title": "One"},
        {"id": "m1", "kind": "moment", "parentId": "ch1", "order": 0, "title": "A moment"},
    ]
    assert client.put(f"/api/projects/{pid}/outline", json={"nodes": nodes}).status_code == 200
    return pid, "ch1", "m1"


def test_a_draft_save_is_one_write(client: TestClient, storage_root: Path, writes: list[str]) -> None:
    pid, ch, m = _chapter(client, storage_root)
    writes.clear()
    resp = client.put(f"/api/projects/{pid}/draft/chapter/{ch}/moment/{m}", json={"outlineNodeId": m, "body": "Words in a row"})
    assert resp.status_code == 200 and resp.json()["wordCount"] == 4
    assert len(writes) == 1  # the draft, the day's activity and the session's revision, written together
    assert store.load_draft(storage_root, pid, ch, m).body == "Words in a row"
    labels = sorted(r.label for r in store.list_revisions(storage_root, pid, ch))
    assert labels == ["Before this session", "Editing session"]  # the session's revisions, as when each step wrote on its own


def test_an_outline_save_is_one_write(client: TestClient, storage_root: Path, writes: list[str]) -> None:
    pid, _ch, _m = _chapter(client, storage_root)
    nodes = [n.model_dump() for n in store.load_outline(storage_root, pid).nodes]
    nodes[1]["title"] = "Renamed"
    writes.clear()
    assert client.put(f"/api/projects/{pid}/outline", json={"nodes": nodes}).status_code == 200
    assert len(writes) == 1
    assert store.load_outline(storage_root, pid).nodes[1].title == "Renamed"


def test_calls_inside_see_each_others_changes_and_nested_blocks_join(storage_root: Path, writes: list[str]) -> None:
    pid = store.create_project(storage_root, "Book").projectId
    writes.clear()
    with store.transaction(storage_root, pid):
        store.save_outline(storage_root, pid, OutlineTree(nodes=[OutlineNode(id="b", kind="book", order=0, title="Inside")]))
        assert store.load_outline(storage_root, pid).nodes[0].title == "Inside"  # not yet on disk, but seen
        with store.transaction(storage_root, pid):
            store.update_project_metadata(storage_root, pid, title="Both")
        assert writes == []  # the inner block did not write
    assert len(writes) == 1
    assert store.load_outline(storage_root, pid).nodes[0].title == "Inside"
    assert store.load_index(storage_root, pid).title == "Both"


def test_a_block_that_raises_writes_nothing(storage_root: Path, writes: list[str]) -> None:
    pid = store.create_project(storage_root, "Book").projectId
    path = storage_root / pid / "project.json"
    before = path.read_text(encoding="utf-8")
    writes.clear()
    with pytest.raises(RuntimeError):
        with store.transaction(storage_root, pid):
            store.update_project_metadata(storage_root, pid, title="Half done")
            raise RuntimeError("stop")
    assert writes == [] and path.read_text(encoding="utf-8") == before
    assert store.load_index(storage_root, pid).title == "Book"  # and the in-memory change is gone too


def test_a_block_that_only_reads_writes_nothing(storage_root: Path, writes: list[str]) -> None:
    pid = store.create_project(storage_root, "Book").projectId
    writes.clear()
    with store.transaction(storage_root, pid):
        store.load_outline(storage_root, pid)
        store.load_index(storage_root, pid)
    assert writes == []


def test_concurrent_transactions_take_turns_and_lose_no_update(storage_root: Path) -> None:
    pid = store.create_project(storage_root, "Book").projectId
    rounds, workers = 15, 4

    def bump() -> None:
        for _ in range(rounds):
            with store.transaction(storage_root, pid):
                store.update_project_metadata(storage_root, pid, title="x")
                index = store.load_index(storage_root, pid)
                index.settings.wordCountTarget = (index.settings.wordCountTarget or 0) + 1
                store.save_index(storage_root, index)

    threads = [threading.Thread(target=bump) for _ in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert store.load_index(storage_root, pid).settings.wordCountTarget == rounds * workers
