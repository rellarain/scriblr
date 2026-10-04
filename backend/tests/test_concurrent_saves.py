import os
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage import project_store


def _node(i: int, kind: str, parent: str | None) -> dict:
    return {
        "id": f"n{i}", "kind": kind, "parentId": parent, "order": i, "title": f"Node {i}", "synopsis": "x" * 80,
        "draftRef": None, "flag": None, "color": None, "chapterCountTarget": None, "plotlineIds": [], "wordCountGoal": None,
    }


def test_reads_and_saves_of_one_project_take_turns(client: TestClient) -> None:
    """On Windows a save cannot replace project.json while a read has it open (PermissionError, shown to the
    writer as "Save failed"), so reads and saves of a project run one at a time."""
    project_id = client.post("/api/projects", json={"title": "Busy"}).json()["projectId"]
    nodes = [_node(0, "book", None)] + [_node(i, "chapter", "n0") for i in range(1, 400)]
    body = {"schemaVersion": 2, "nodes": nodes}
    assert client.put(f"/api/projects/{project_id}/outline", json=body).status_code == 200

    failures: list[str] = []

    def save() -> None:
        for _ in range(25):
            try:
                status = client.put(f"/api/projects/{project_id}/outline", json=body).status_code
                if status != 200:
                    failures.append(f"save {status}")
            except Exception as exc:  # noqa: BLE001 - any failure is the point of the test
                failures.append(f"save {exc!r}")

    def read() -> None:
        for _ in range(60):
            try:
                status = client.get(f"/api/projects/{project_id}").status_code
                if status != 200:
                    failures.append(f"read {status}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"read {exc!r}")

    threads = [threading.Thread(target=save), threading.Thread(target=read), threading.Thread(target=read)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert failures == []


def test_a_momentarily_locked_file_is_retried(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A virus scanner or indexer can hold a freshly written file for a moment: the replace is tried again."""
    real_replace = os.replace
    calls = {"n": 0}

    def flaky(src, dest):  # noqa: ANN001
        calls["n"] += 1
        if calls["n"] < 3:
            raise PermissionError(5, "Access is denied")
        return real_replace(src, dest)

    monkeypatch.setattr(project_store.os, "replace", flaky)
    monkeypatch.setattr(project_store, "_REPLACE_PAUSE", 0)
    dest = tmp_path / "project.json"
    project_store._atomic_write_json(tmp_path, dest, {"ok": True})
    assert dest.read_text(encoding="utf-8").strip().startswith("{")
    assert calls["n"] == 3

    # A file that stays locked still fails (and leaves no temp file behind).
    monkeypatch.setattr(project_store.os, "replace", lambda src, dest: (_ for _ in ()).throw(PermissionError(5, "Access is denied")))
    with pytest.raises(PermissionError):
        project_store._atomic_write_json(tmp_path, dest, {"ok": False})
    assert list((tmp_path / ".tmp").iterdir()) == []
