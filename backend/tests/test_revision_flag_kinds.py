"""The seven kinds of flag (WUI v1), the old names read as the new ones, and a merge flag's second passage."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage import revision_flags
from app.storage.schema import FlagPassage, NodeFlag, RevisionFlag

KINDS = ["review", "add", "remove", "merge", "change", "simplify", "expand"]


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Kinds"}).json()["projectId"]


def _draft(client: TestClient, pid: str, moment: str, body: str) -> None:
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/{moment}", json={"outlineNodeId": moment, "body": body})


def _flags(client: TestClient, pid: str) -> list[dict]:
    return client.get(f"/api/projects/{pid}/revision-flags").json()


# --- the kinds -----------------------------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_can_be_made_on_the_project(client: TestClient, kind: str) -> None:
    pid = _project(client)
    made = client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "project", "type": kind})
    assert made.status_code == 200 and made.json()["type"] == kind


def test_the_old_names_are_read_as_the_new_ones() -> None:
    assert RevisionFlag(id="f", scope="project", type="edit").type == "change"
    assert RevisionFlag(id="f", scope="project", type="delete").type == "remove"
    assert NodeFlag(type="edit").type == "change" and NodeFlag(type="delete").type == "remove"
    with pytest.raises(ValueError):
        NodeFlag(type="nope")


def test_a_request_in_the_old_names_is_kept_in_the_new(client: TestClient) -> None:
    pid = _project(client)
    made = client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "project", "type": "edit"}).json()
    assert made["type"] == "change"
    changed = client.patch(f"/api/projects/{pid}/revision-flags/{made['id']}", json={"type": "delete"}).json()
    assert changed["type"] == "remove"


def test_a_project_file_in_the_old_names_loads_and_is_written_back_in_the_new(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "project", "type": "review"})
    tree = client.get(f"/api/projects/{pid}/outline").json()
    tree["nodes"][0]["flag"] = {"type": "review", "note": "a"}
    client.put(f"/api/projects/{pid}/outline", json=tree)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["revisionFlags"][0]["type"] = "edit"
    raw["outline"]["nodes"][0]["flag"]["type"] = "delete"
    path.write_text(json.dumps(raw), encoding="utf-8")

    assert [f["type"] for f in _flags(client, pid)] == ["change"]
    assert client.get(f"/api/projects/{pid}/outline").json()["nodes"][0]["flag"]["type"] == "remove"
    # The next write of the file uses the new names.
    client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "project", "type": "expand"})
    text = path.read_text(encoding="utf-8")
    assert '"edit"' not in text and '"change"' in text


# --- a merge flag's second passage ---------------------------------------------------------------------------------------------------------


def _merge(client: TestClient, pid: str, **over) -> object:
    body = {
        "scope": "passage", "type": "merge", "note": "one sentence?", "chapterId": "c1", "momentId": "m1", "start": 0, "end": 13,
        "mergeWith": {"momentId": "m2", "start": 0, "end": 16},
    }
    body.update(over)
    return client.post(f"/api/projects/{pid}/revision-flags", json=body)


def test_a_merge_flag_keeps_the_passage_to_merge_with_and_follows_it(client: TestClient) -> None:
    pid = _project(client)
    _draft(client, pid, "m1", "She had coins. And a letter.")
    _draft(client, pid, "m2", "They were enough. Almost.")
    made = _merge(client, pid)
    assert made.status_code == 200
    flag = made.json()
    assert flag["snippet"] == "She had coins" and flag["mergeWith"]["snippet"] == "They were enough"
    # Editing the second moment moves the second passage with its text.
    _draft(client, pid, "m2", "Then: They were enough. Almost.")
    moved = _flags(client, pid)[0]["mergeWith"]
    assert (moved["start"], moved["end"], moved["snippet"], moved["stale"]) == (6, 22, "They were enough", False)
    # Making it another kind drops the second passage.
    changed = client.patch(f"/api/projects/{pid}/revision-flags/{flag['id']}", json={"type": "simplify"}).json()
    assert changed["type"] == "simplify" and changed["mergeWith"] is None


def test_a_merge_flag_without_a_second_passage_is_allowed(client: TestClient) -> None:
    pid = _project(client)
    _draft(client, pid, "m1", "She had coins. And a letter.")
    made = _merge(client, pid, mergeWith=None)
    assert made.status_code == 200 and made.json()["mergeWith"] is None


def test_the_passage_to_merge_with_is_checked(client: TestClient) -> None:
    pid = _project(client)
    _draft(client, pid, "m1", "She had coins. And a letter.")
    _draft(client, pid, "m2", "They were enough.")
    assert _merge(client, pid, type="change").status_code == 422  # only a merge flag has one
    assert _merge(client, pid, mergeWith={"momentId": "m2", "start": 3, "end": 3}).status_code == 422  # an empty range
    assert _merge(client, pid, mergeWith={"momentId": "m2", "start": 0, "end": 99}).status_code == 422  # past the end
    assert _merge(client, pid, mergeWith={"momentId": "m1", "start": 5, "end": 20}).status_code == 422  # overlaps the first
    assert _merge(client, pid, mergeWith={"momentId": "m1", "start": 15, "end": 27}).status_code == 200  # the same moment, apart
    project = {"scope": "project", "type": "merge", "mergeWith": {"momentId": "m2", "start": 0, "end": 4}}
    assert client.post(f"/api/projects/{pid}/revision-flags", json=project).status_code == 422


def test_reanchor_moves_a_second_passage_in_its_own_moment_and_marks_it_stale_when_cut() -> None:
    flag = RevisionFlag(
        id="f", scope="passage", type="merge", chapterId="c1", momentId="m1", start=0, end=3, snippet="One",
        mergeWith=FlagPassage(momentId="m2", start=4, end=9, snippet="there"),
    )
    assert revision_flags.reanchor([flag], "m2", "Out there.", "Way out there.") is True
    assert flag.mergeWith is not None and (flag.mergeWith.start, flag.mergeWith.snippet) == (8, "there")
    assert (flag.start, flag.end) == (0, 3)  # the first passage is in another moment
    revision_flags.reanchor([flag], "m2", "Way out there.", "Way out.")
    assert flag.mergeWith.stale is True
