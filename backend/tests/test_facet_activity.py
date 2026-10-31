from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.storage import facet_activity as fa_mod
from app.storage import revision_flags
from app.storage.schema import (
    DailyActivityEntry,
    DayTotals,
    FacetActivity,
    OutlineNode,
    ProjectFile,
    RevisionFlag,
)

NOW = datetime(2026, 10, 31, 14, 25, tzinfo=timezone.utc)


def _event(fa: FacetActivity, when: datetime = NOW, facet: str = "outline", action: str = "edit", node: str = "n1", **kw) -> None:
    fa_mod.apply_event(fa, when, facet, action, node_id=node, **kw)


# --- the event log -------------------------------------------------------------------------------------------------------------------------


def test_the_same_node_twice_in_one_slot_is_one_event() -> None:
    fa = FacetActivity()
    _event(fa)
    _event(fa, NOW + timedelta(minutes=3))  # still the 14:20 slot
    assert len(fa.events) == 1
    assert fa.daily["2026-10-31"].outline == 1
    assert fa.slots["2026-10-31"]["outline"][86] == 1
    _event(fa, NOW + timedelta(minutes=10))  # the next slot
    assert len(fa.events) == 2
    assert fa.daily["2026-10-31"].outline == 2
    _event(fa, node="n2")  # another node, same slot
    assert len(fa.events) == 3


def test_draft_words_merge_inside_a_slot_and_count_by_book() -> None:
    fa = FacetActivity()
    _event(fa, facet="draft", action="words", node="m1", amount=12, book_id="b1")
    _event(fa, NOW + timedelta(minutes=4), facet="draft", action="words", node="m1", amount=-5, book_id="b1")
    assert len(fa.events) == 1 and fa.events[0].amount == 7
    day = fa.daily["2026-10-31"]
    assert day.draft == 7 and day.books == {"b1": 7}


def test_creates_flags_and_resolves_are_counted_by_kind() -> None:
    fa = FacetActivity()
    _event(fa, action="create", node="c1", kind="chapter")
    _event(fa, facet="revision", action="flag", node="c1")
    _event(fa, NOW + timedelta(minutes=20), facet="revision", action="resolve", node="c1")
    day = fa.daily["2026-10-31"]
    assert day.kinds == {"chapter": 1}
    assert (day.flagsApplied, day.flagsResolved, day.revision) == (1, 1, 2)


def _node(node_id: str, **kw) -> dict:
    return {"id": node_id, "kind": "chapter", "title": node_id, "order": 0, **kw}


def test_tree_changes_name_creates_edits_deletes_and_flags() -> None:
    old = [_node("a"), _node("b"), _node("c", flag={"type": "edit", "note": ""}), _node("d"), _node("m", kind="plotpoint", sourceFieldId="f")]
    new = [
        _node("a"),  # untouched
        _node("b", title="renamed"),  # edited
        _node("c"),  # flag taken off: resolved
        _node("e"),  # created
        _node("f", flag={"type": "review", "note": ""}),  # created flagged
        _node("m", kind="plotpoint", sourceFieldId="f", title="x"),  # a mirror: not a change
    ]
    got = sorted((f, a, n["id"]) for f, a, n in fa_mod.tree_changes("outline", old, new))
    assert got == [
        ("outline", "create", "e"),
        ("outline", "create", "f"),
        ("outline", "delete", "d"),
        ("outline", "edit", "b"),
        ("revision", "flag", "f"),
        ("revision", "resolve", "c"),
    ]


def test_a_flag_alone_is_a_revision_event_not_an_edit() -> None:
    old = [_node("a")]
    new = [_node("a", flag={"type": "add", "note": "more here"})]
    assert [(f, a) for f, a, _ in fa_mod.tree_changes("plot", old, new)] == [("revision", "flag")]


# --- compaction ----------------------------------------------------------------------------------------------------------------------------


def test_compaction_keeps_14_days_of_events_28_of_slots_and_folds_whole_old_months() -> None:
    today = date(2026, 10, 31)
    fa = FacetActivity()
    for back in (0, 13, 14, 20, 30, 400, 420):
        day = today - timedelta(days=back)
        at = datetime(day.year, day.month, day.day, 9, 0, tzinfo=timezone.utc)
        _event(fa, at, node=f"n{back}")
        _event(fa, at, facet="draft", action="words", node=f"m{back}", amount=100, book_id="b1")
    assert fa_mod.compact(fa, today) is True
    assert sorted({e.date for e in fa.events}) == ["2026-10-18", "2026-10-31"]  # 0 and 13 days back; 14 and older are gone
    assert sorted(fa.slots) == ["2026-10-11", "2026-10-17", "2026-10-18", "2026-10-31"]  # 28 days: 30 back is out
    # Daily totals stay back to the first of the month 372 days ago (2025-10-01); whole months before that fold.
    assert sorted(fa.daily) == ["2026-10-01", "2026-10-11", "2026-10-17", "2026-10-18", "2026-10-31"]
    assert set(fa.monthly) == {"2025-09"}  # 400 and 420 days back
    september = fa.monthly["2025-09"]
    assert (september.activeDays, september.draft, september.outline, september.books) == (2, 200, 2, {"b1": 200})
    assert fa_mod.compact(fa, today) is False  # nothing more to do


def test_slot_profile_is_today_against_the_average_of_the_28_days_before() -> None:
    today = date(2026, 10, 31)
    fa = FacetActivity()
    for back in range(1, 29):  # one event in slot 54 (09:00) every day, two on every 4th
        at = datetime.combine(today - timedelta(days=back), datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=9)
        _event(fa, at, node="a")
        if back % 4 == 0:
            _event(fa, at, node="b")
    _event(fa, datetime(2026, 10, 31, 9, 5, tzinfo=timezone.utc), node="a")
    now_counts, average = fa_mod.slot_profile(fa, today)
    assert now_counts["outline"][54] == 1
    assert average["outline"][54] == round((28 + 7) / 28, 4)
    assert average["draft"][54] == 0.0


def test_the_older_daily_saves_are_folded_in_once() -> None:
    from app.storage.schema import ProjectIndex

    pf = ProjectFile(index=ProjectIndex(projectId="p", title="t", createdAt=NOW, updatedAt=NOW))
    pf.activity.days["2026-10-01"] = DailyActivityEntry(date="2026-10-01", wordCountDelta=40, outlineSaves=2, plotSaves=1, draftRevisions=3)
    pf.activity.days["2026-10-02"] = DailyActivityEntry(date="2026-10-02", outlineSaves=5)  # the new log has this day already
    pf.activity.days["2026-10-31"] = DailyActivityEntry(date="2026-10-31", outlineSaves=9)  # today
    pf.facets.daily["2026-10-02"] = DayTotals(outline=1)
    assert fa_mod.fold_legacy(pf, date(2026, 10, 31)) is True
    assert pf.facets.daily["2026-10-01"] == DayTotals(outline=2, plot=1, draft=40, revision=3)
    assert pf.facets.daily["2026-10-02"].outline == 1 and "2026-10-31" not in pf.facets.daily
    assert fa_mod.fold_legacy(pf, date(2026, 10, 31)) is False
    assert pf.facets.daily["2026-10-01"].outline == 2


def test_book_of_walks_up_to_the_book() -> None:
    nodes = [
        OutlineNode(id="b", kind="book", order=0, title="B"),
        OutlineNode(id="c", kind="chapter", parentId="b", order=0, title="C"),
        OutlineNode(id="m", kind="moment", parentId="c", order=0, title="M"),
        OutlineNode(id="x", kind="series", order=1, title="S"),
    ]
    assert fa_mod.book_of(nodes, "m") == "b" and fa_mod.book_of(nodes, "b") == "b"
    assert fa_mod.book_of(nodes, "x") is None and fa_mod.book_of(nodes, "missing") is None and fa_mod.book_of(nodes, None) is None


# --- flags follow their text ---------------------------------------------------------------------------------------------------------------


def _flag(start: int, end: int, snippet: str) -> RevisionFlag:
    return RevisionFlag(id="f1", scope="passage", type="edit", momentId="m1", chapterId="c1", start=start, end=end, snippet=snippet)


def test_a_flag_follows_its_text_when_words_are_added_before_it() -> None:
    old = "The rain fell on the old road."
    flag = _flag(old.index("old road"), len(old) - 1, "old road")
    new = "Overnight the rain fell on the old road."
    assert revision_flags.reanchor([flag], "m1", old, new) is True
    assert new[flag.start : flag.end] == "old road" and flag.snippet == "old road" and flag.stale is False


def test_a_flag_follows_an_edit_inside_it_and_goes_stale_when_its_text_is_cut() -> None:
    old = "One two three four five."
    flag = _flag(4, 18, "two three four")
    revision_flags.reanchor([flag], "m1", old, "One two THREE four five.")
    assert flag.snippet == "two THREE four" and not flag.stale
    revision_flags.reanchor([flag], "m1", "One two THREE four five.", "One five.")
    assert flag.stale is True and flag.start == flag.end


def test_resolved_flags_and_other_moments_stay_put() -> None:
    other = RevisionFlag(id="f2", scope="passage", type="edit", momentId="m2", start=0, end=3, snippet="One")
    done = _flag(0, 3, "One")
    done.id = "f3"
    done.resolvedAt = NOW
    assert revision_flags.reanchor([other, done], "m1", "One two", "Zero One two") is False
    assert (done.start, other.start) == (0, 0)


# --- over the API --------------------------------------------------------------------------------------------------------------------------


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Facets"}).json()["projectId"]


def _facets(client: TestClient, project_id: str) -> dict:
    return client.get(f"/api/projects/{project_id}/activity/facets").json()


def _tree(*nodes: dict) -> dict:
    return {"nodes": list(nodes)}


def _onode(node_id: str, kind: str, parent: str | None, order: int = 0, **kw) -> dict:
    return {"id": node_id, "kind": kind, "parentId": parent, "order": order, "title": node_id, **kw}


def _book_and_tree(client: TestClient, pid: str) -> tuple[str, dict]:
    tree = client.get(f"/api/projects/{pid}/outline").json()
    return tree["nodes"][0]["id"], tree  # a new project starts with one book


def test_saving_the_outline_and_the_draft_records_events_by_facet_and_book(client: TestClient) -> None:
    pid = _project(client)
    book, tree = _book_and_tree(client, pid)
    tree["nodes"] += [_onode("c1", "chapter", book), _onode("m1", "moment", "c1")]
    client.put(f"/api/projects/{pid}/outline", json=tree)
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "five words are in here"})
    out = _facets(client, pid)
    today = out["today"]
    day = out["daily"][today]
    assert day["outline"] == 2 and day["draft"] == 5 and day["books"] == {book: 5}
    assert day["kinds"] == {"chapter": 1, "moment": 1}
    assert {e["action"] for e in out["events"]} == {"create", "words"}
    # Saving the same text again changes nothing.
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "five words are in here"})
    assert _facets(client, pid)["daily"][today]["draft"] == 5


def test_flags_on_outline_nodes_count_as_revision(client: TestClient) -> None:
    pid = _project(client)
    _, tree = _book_and_tree(client, pid)
    tree["nodes"][0]["flag"] = {"type": "review", "note": "x"}
    client.put(f"/api/projects/{pid}/outline", json=tree)
    tree["nodes"][0]["flag"] = None
    client.put(f"/api/projects/{pid}/outline", json=tree)
    day = next(iter(_facets(client, pid)["daily"].values()))
    assert (day["flagsApplied"], day["flagsResolved"], day["outline"]) == (1, 1, 0)


def test_plot_edits_project_settings_and_ticks_are_counted(client: TestClient) -> None:
    pid = _project(client)
    plot = client.get(f"/api/projects/{pid}/plot").json()
    plot["nodes"].append({"id": "cat1", "kind": "category", "parentId": None, "order": 0, "title": "Romance"})
    client.put(f"/api/projects/{pid}/plot", json=plot)
    client.patch(f"/api/projects/{pid}", json={"wordCountTarget": 90000})
    client.put(f"/api/projects/{pid}/schedule/2026-10-31", json={"completedItemIds": ["i1", "i2"]})
    client.put(f"/api/projects/{pid}/schedule/2026-10-31", json={"completedItemIds": ["i1", "i2"]})  # no new ticks
    day = next(iter(_facets(client, pid)["daily"].values()))
    assert day["plot"] == 1 and day["project"] == 3  # one settings change, two ticks


def test_revision_flags_on_the_project_and_on_a_passage(client: TestClient) -> None:
    pid = _project(client)
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "The rain fell on the old road."})
    made = client.post(
        f"/api/projects/{pid}/revision-flags",
        json={"scope": "passage", "type": "edit", "note": "tighten", "chapterId": "c1", "momentId": "m1", "start": 21, "end": 29},
    )
    assert made.status_code == 200 and made.json()["snippet"] == "old road"
    flag_id = made.json()["id"]
    project_flag = client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "project", "type": "review", "note": "rework the ending"})
    assert project_flag.status_code == 200
    # Editing the text moves the flag with it.
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "Overnight the rain fell on the old road."})
    listed = client.get(f"/api/projects/{pid}/revision-flags").json()
    moved = next(f for f in listed if f["id"] == flag_id)
    assert (moved["start"], moved["end"], moved["stale"]) == (31, 39, False)
    # Resolve one: it leaves the open list, and counts.
    done = client.post(f"/api/projects/{pid}/revision-flags/{flag_id}/resolve", json={"outcome": "cut two words"})
    assert done.json()["resolvedAt"] and done.json()["outcome"] == "cut two words"
    assert [f["id"] for f in client.get(f"/api/projects/{pid}/revision-flags").json()] == [project_flag.json()["id"]]
    assert len(client.get(f"/api/projects/{pid}/revision-flags", params={"includeResolved": True}).json()) == 2
    day = next(iter(_facets(client, pid)["daily"].values()))
    assert (day["flagsApplied"], day["flagsResolved"]) == (2, 1)
    # Resolving again does not count twice.
    client.post(f"/api/projects/{pid}/revision-flags/{flag_id}/resolve", json={})
    assert next(iter(_facets(client, pid)["daily"].values()))["flagsResolved"] == 1


def test_revision_flag_requests_are_checked(client: TestClient) -> None:
    pid = _project(client)
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "Short."})
    bad = {"scope": "passage", "type": "edit", "chapterId": "c1", "momentId": "m1"}
    assert client.post(f"/api/projects/{pid}/revision-flags", json={**bad, "start": 2, "end": 2}).status_code == 422
    assert client.post(f"/api/projects/{pid}/revision-flags", json={**bad, "start": 0, "end": 99}).status_code == 422
    assert client.post(f"/api/projects/{pid}/revision-flags", json={"scope": "passage", "type": "nope"}).status_code == 422
    assert client.patch(f"/api/projects/{pid}/revision-flags/flag_missing", json={"note": "x"}).status_code == 404
    assert client.delete(f"/api/projects/{pid}/revision-flags/flag_missing").status_code == 404


def test_the_ribbon_adds_every_project_together(client: TestClient) -> None:
    first, second = _project(client), _project(client)
    for pid in (first, second):
        client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "some words"})
    ribbon = client.get("/api/activity/ribbon").json()
    assert sum(ribbon["today"]["draft"]) == 2 and len(ribbon["today"]["draft"]) == 144
    assert set(ribbon["average"]) == {"outline", "plot", "draft", "revision", "project"}
    assert sum(ribbon["average"]["draft"]) == 0


def test_opening_a_project_compacts_old_detail(client: TestClient, storage_root) -> None:
    from app.storage import project_store as store

    pid = _project(client)
    old = datetime.now(timezone.utc) - timedelta(days=40)
    fa_mod.record(storage_root, pid, "outline", "edit", node_id="n", when=old)
    assert len(store.load_facets(storage_root, pid).events) == 1
    client.get(f"/api/projects/{pid}")
    fa = store.load_facets(storage_root, pid)
    assert fa.events == [] and old.date().isoformat() in fa.daily


# --- the planner ---------------------------------------------------------------------------------------------------------------------------


def _planner() -> dict:
    return {
        "timelineStart": "2026-01-12",
        "timelineEnd": "2027-03-01",
        "goals": [{"id": "g1", "facet": "draft", "scope": "project", "daily": 500, "weekly": 3000, "total": 90000, "deadline": "2027-03-01"}],
        "shifts": [
            {
                "id": "s1", "title": "Morning draft", "facet": "draft", "date": "2026-10-26", "startSlot": 48, "endSlot": 60, "target": 800,
                "targetNodeId": "c1", "targetTree": "outline",
                "recurrence": {"kind": "weekly", "every": 1, "days": [0, 1, 2, 3, 4], "anchor": "2026-10-26"},
                "pauses": [{"start": "2026-12-20", "end": "2027-01-03"}], "skipped": ["2026-10-28"],
                "overrides": {"2026-10-29": {"startSlot": 54, "endSlot": 66}},
            }
        ],
        "routines": [{"id": "r1", "label": "Export a backup", "recurrence": {"kind": "interval", "every": 7, "rangeMax": 10, "unit": "day", "anchor": "2026-10-01"}, "lastDone": "2026-10-24"}],
        "items": [{"id": "i1", "label": "Reread Ch. 8", "facet": "draft", "shiftId": "s1"}],
        "templates": [{"id": "t1", "name": "Morning draft", "facet": "draft", "startSlot": 48, "endSlot": 60, "days": [0, 1, 2, 3, 4]}],
        "restDays": [{"id": "x1", "start": "2026-12-24", "end": "2026-12-26", "label": "Holiday"}],
        "reminderLeadMinutes": 10,
    }


def test_the_planner_round_trips(client: TestClient) -> None:
    pid = _project(client)
    assert client.get(f"/api/projects/{pid}/planner").json()["shifts"] == []
    put = client.put(f"/api/projects/{pid}/planner", json=_planner())
    assert put.status_code == 200
    got = client.get(f"/api/projects/{pid}/planner").json()
    assert got["shifts"][0]["overrides"]["2026-10-29"]["startSlot"] == 54
    assert got["routines"][0]["recurrence"]["rangeMax"] == 10 and got["goals"][0]["deadline"] == "2027-03-01"


def test_a_planner_with_a_bad_date_or_shape_is_refused(client: TestClient) -> None:
    pid = _project(client)
    bad_date = _planner()
    bad_date["goals"][0]["deadline"] = "next friday"
    assert client.put(f"/api/projects/{pid}/planner", json=bad_date).status_code == 422
    backwards = _planner()
    backwards["shifts"][0]["endSlot"] = 40
    assert client.put(f"/api/projects/{pid}/planner", json=backwards).status_code == 422
    inverted = _planner()
    inverted["routines"][0]["recurrence"]["rangeMax"] = 3
    assert client.put(f"/api/projects/{pid}/planner", json=inverted).status_code == 422
    weekday = _planner()
    weekday["shifts"][0]["recurrence"]["days"] = [7]
    assert client.put(f"/api/projects/{pid}/planner", json=weekday).status_code == 422
    assert client.get(f"/api/projects/{pid}/planner").json()["goals"] == []  # nothing was kept


def test_a_project_is_written_in_format_six(client: TestClient, storage_root) -> None:
    import json

    from app.storage.schema import PROJECT_FILE_VERSION

    pid = _project(client)
    client.put(f"/api/projects/{pid}/planner", json=_planner())
    raw = json.loads((storage_root / pid / "project.json").read_text(encoding="utf-8"))
    assert PROJECT_FILE_VERSION == 6 and raw["schemaVersion"] == 6
    assert {"facets", "revisionFlags", "planner"} <= set(raw)
