"""A revision flag stays on its text when the Draft's paragraph tools move that text as a whole: up or down in its moment, to another moment
of the chapter, or to a moment of another chapter (in either order of the two saves)."""

from fastapi.testclient import TestClient

P1 = "She had three coins and a letter."
P2 = "The letter was not hers to open, and she had opened it anyway."
P3 = "Out on the dark water a bell rang twice."


def _project(client: TestClient) -> str:
    """Chapters c1 (moments m1, m2) and c2 (moment m3) of one book; nothing in the outline is needed for drafts and flags to be kept."""
    return client.post("/api/projects", json={"title": "Rescue"}).json()["projectId"]


def _put(client: TestClient, pid: str, chapter: str, moment: str, body: str) -> None:
    resp = client.put(f"/api/projects/{pid}/draft/chapter/{chapter}/moment/{moment}", json={"outlineNodeId": moment, "body": body})
    assert resp.status_code == 200, resp.text


def _flag(client: TestClient, pid: str, chapter: str, moment: str, start: int, end: int, **extra) -> str:
    body = {"scope": "passage", "type": "change", "chapterId": chapter, "momentId": moment, "start": start, "end": end, **extra}
    resp = client.post(f"/api/projects/{pid}/revision-flags", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _get(client: TestClient, pid: str, flag_id: str) -> dict:
    return next(f for f in client.get(f"/api/projects/{pid}/revision-flags").json() if f["id"] == flag_id)


def test_a_flag_follows_its_paragraph_up_its_moment(client: TestClient) -> None:
    pid = _project(client)
    _put(client, pid, "c1", "m1", f"{P1}\n\n{P2}")
    fid = _flag(client, pid, "c1", "m1", len(P1) + 2, len(P1) + 2 + len(P2))
    _put(client, pid, "c1", "m1", f"{P2}\n\n{P1}")  # the second paragraph moved up
    flag = _get(client, pid, fid)
    assert (flag["start"], flag["end"], flag["stale"]) == (0, len(P2), False)


def test_a_flag_follows_its_paragraph_to_another_moment_of_the_chapter_whichever_is_saved_first(client: TestClient) -> None:
    for order in ("from-first", "to-first"):
        pid = _project(client)
        _put(client, pid, "c1", "m1", f"{P1}\n\n{P2}")
        _put(client, pid, "c1", "m2", P3)
        fid = _flag(client, pid, "c1", "m1", len(P1) + 2, len(P1) + 2 + len(P2))
        saves = [("m1", P1), ("m2", f"{P2}\n\n{P3}")]
        for moment, body in saves if order == "from-first" else reversed(saves):
            _put(client, pid, "c1", moment, body)
        flag = _get(client, pid, fid)
        assert (flag["momentId"], flag["start"], flag["end"], flag["stale"]) == ("m2", 0, len(P2), False), order


def test_a_flag_follows_its_paragraph_to_another_chapter(client: TestClient) -> None:
    pid = _project(client)
    _put(client, pid, "c1", "m1", f"{P1}\n\n{P2}")
    _put(client, pid, "c2", "m3", P3)
    fid = _flag(client, pid, "c1", "m1", len(P1) + 2, len(P1) + 2 + len(P2))
    _put(client, pid, "c2", "m3", f"{P3}\n\n{P2}")  # the tools write the other chapter first
    _put(client, pid, "c1", "m1", P1)
    flag = _get(client, pid, fid)
    assert (flag["chapterId"], flag["momentId"], flag["start"], flag["stale"]) == ("c2", "m3", len(P3) + 2, False)


def test_text_that_is_really_gone_marks_the_flag_gone_and_brings_it_back_when_it_returns(client: TestClient) -> None:
    pid = _project(client)
    _put(client, pid, "c1", "m1", f"{P1}\n\n{P2}")
    fid = _flag(client, pid, "c1", "m1", 0, len(P1))
    _put(client, pid, "c1", "m1", P2)
    assert _get(client, pid, fid)["stale"] is True
    _put(client, pid, "c1", "m2", f"Earlier. {P1}")  # pasted back, in another moment
    flag = _get(client, pid, fid)
    assert (flag["momentId"], flag["start"], flag["stale"]) == ("m2", 9, False)


def test_a_short_or_repeated_text_is_not_looked_for_elsewhere(client: TestClient) -> None:
    pid = _project(client)
    _put(client, pid, "c1", "m1", "Yes. No.")
    short = _flag(client, pid, "c1", "m1", 0, 4)
    _put(client, pid, "c1", "m2", "Yes. Maybe.")
    _put(client, pid, "c1", "m1", "No.")
    assert _get(client, pid, short)["stale"] is True  # "Yes." is in m2, but four characters prove nothing
    _put(client, pid, "c1", "m1", f"{P1}\n\n{P3}")
    twice = _flag(client, pid, "c1", "m1", 0, len(P1))
    _put(client, pid, "c2", "m3", f"{P1} {P1}")
    _put(client, pid, "c1", "m1", P3)
    assert _get(client, pid, twice)["stale"] is True  # two copies elsewhere: no way to tell which


def test_a_merge_flags_second_passage_follows_within_its_chapter(client: TestClient) -> None:
    pid = _project(client)
    _put(client, pid, "c1", "m1", P1)
    _put(client, pid, "c1", "m2", f"{P3}\n\n{P2}")
    second = {"momentId": "m2", "start": len(P3) + 2, "end": len(P3) + 2 + len(P2)}
    fid = _flag(client, pid, "c1", "m1", 0, len(P1), type="merge", mergeWith=second)
    _put(client, pid, "c1", "m2", P3)
    _put(client, pid, "c1", "m1", f"{P1}\n\n{P2}")
    merge = _get(client, pid, fid)["mergeWith"]
    assert (merge["momentId"], merge["start"], merge["stale"]) == ("m1", len(P1) + 2, False)
