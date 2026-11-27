"""Revision passes in the project's planner (their days, kinds and goals checked) and the chapter reads that count for a pass's reading goal."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import project_store as store


def _project(client: TestClient, storage_root: Path) -> str:
    pid = client.post("/api/projects", json={"title": "Passes"}).json()["projectId"]
    nodes = [n.model_dump() for n in store.load_outline(storage_root, pid).nodes]
    nodes.append({"id": "c1", "kind": "chapter", "parentId": nodes[0]["id"], "order": 0, "title": "The Ferry"})
    assert client.put(f"/api/projects/{pid}/outline", json={"nodes": nodes}).status_code == 200
    return pid


def _pass(**over) -> dict:
    return {"id": "p1", "name": "Tighten", "start": "2026-11-14", "end": "2026-12-20", "kinds": ["remove", "merge"],
            "goals": [{"id": "g1", "kind": "flags"}, {"id": "g2", "kind": "words", "words": -8000}, {"id": "g3", "kind": "read"}], **over}


def _put(client: TestClient, pid: str, passes: list[dict]):
    planner = client.get(f"/api/projects/{pid}/planner").json()
    return client.put(f"/api/projects/{pid}/planner", json={**planner, "passes": passes})


def test_a_pass_is_kept_in_the_planner(client: TestClient, storage_root: Path) -> None:
    pid = _project(client, storage_root)
    assert client.get(f"/api/projects/{pid}/planner").json()["passes"] == []  # a planner saved before passes has none
    assert _put(client, pid, [_pass(), _pass(id="p2", name="Polish", start="2027-01-05", end=None, kinds=[], goals=[])]).status_code == 200
    passes = client.get(f"/api/projects/{pid}/planner").json()["passes"]
    assert [(p["name"], p["end"], p["kinds"]) for p in passes] == [("Tighten", "2026-12-20", ["remove", "merge"]), ("Polish", None, [])]
    assert [(g["kind"], g["words"]) for g in passes[0]["goals"]] == [("flags", None), ("words", -8000), ("read", None)]


def test_a_pass_that_does_not_make_sense_is_refused(client: TestClient, storage_root: Path) -> None:
    pid = _project(client, storage_root)
    assert _put(client, pid, [_pass(end="2026-11-01")]).status_code == 422  # ends before it starts
    assert _put(client, pid, [_pass(start="14 Nov")]).status_code == 422  # not a date
    assert _put(client, pid, [_pass(kinds=["remove", "remove"])]).status_code == 422
    assert _put(client, pid, [_pass(kinds=["sparkle"])]).status_code == 422
    assert _put(client, pid, [_pass(goals=[{"id": "g", "kind": "words"}])]).status_code == 422  # a word goal needs its words
    assert _put(client, pid, [_pass(goals=[{"id": "g", "kind": "flags"}, {"id": "g", "kind": "read"}])]).status_code == 422
    assert _put(client, pid, [_pass(), _pass()]).status_code == 422  # two passes, one id
    assert _put(client, pid, [_pass(kinds=["edit"])]).json()["passes"][0]["kinds"] == ["change"]  # an old kind's name reads as the new


def test_a_chapter_read_is_an_event_and_counts_as_no_revision_work(client: TestClient, storage_root: Path) -> None:
    pid = _project(client, storage_root)
    assert client.post(f"/api/projects/{pid}/activity/read", json={"chapterId": "c1"}).status_code == 204
    assert client.post(f"/api/projects/{pid}/activity/read", json={"chapterId": "nope"}).status_code == 404
    activity = client.get(f"/api/projects/{pid}/activity/facets").json()
    reads = [e for e in activity["events"] if e["action"] == "read"]
    assert [(e["facet"], e["nodeId"], e["kind"], e["label"]) for e in reads] == [("revision", "c1", "chapter", "The Ferry")]
    assert all(day["revision"] == 0 for day in activity["daily"].values())
