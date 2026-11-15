from pathlib import Path

from fastapi.testclient import TestClient

DANA = {"X-Admin-Id": "adm-dana"}  # Planner on the Writer's consoles
LEE = {"X-Admin-Id": "adm-lee"}  # no Planner role on the Writer
SAM = {"X-Admin-Id": "adm-sam"}  # Planner on the Reader's consoles
DRAFT = "writer/draft/draft"
SHELF = "writer/dashboard/project"


def plan(client: TestClient, who=DANA) -> dict:
    resp = client.get("/api/project-plan", headers=who)
    assert resp.status_code == 200, resp.text
    return resp.json()


def add(client: TestClient, who=DANA, **body) -> dict:
    body = {"nodeId": DRAFT, "kind": "task", "title": "Do it", **body}
    resp = client.post("/api/project-plan/items", headers=who, json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def newest(view: dict) -> dict:
    return max(view["items"], key=lambda i: i["createdAt"])


def item(view: dict, iid: str) -> dict:
    return next(i for i in view["items"] if i["id"] == iid)


def patch(client: TestClient, iid: str, who=DANA, **body):
    return client.patch(f"/api/project-plan/items/{iid}", headers=who, json=body)


def statement_id(client: TestClient, channel: str, verb: str) -> str:
    b = client.get("/api/feedback", headers=DANA).json()
    return next(s["id"] for s in b["statements"] if s["channelId"] == channel and s["verbId"] == verb)


def test_an_empty_plan_to_begin_with(client: TestClient) -> None:
    assert plan(client) == {"me": "adm-dana", "items": []}


def test_a_planner_adds_items_and_what_each_kind_may_hold(client: TestClient) -> None:
    proc = newest(add(client, kind="procedure", title="Release", ordered=True))
    assert proc["parentId"] is None and proc["can"] == {"edit": True, "status": True, "claim": True}
    step = newest(add(client, kind="process", title="Build", parentId=proc["id"], ordered=False))
    task = newest(add(client, kind="task", title="Run the tests", parentId=step["id"], priority="high", start="2026-11-16", due="2026-11-20"))
    assert (task["parentId"], task["priority"], task["order"]) == (step["id"], "high", 0)
    # A procedure never goes inside anything; a routine is at the top; a process cannot hold a process.
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "procedure", "title": "x", "parentId": proc["id"]}).status_code == 400
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "process", "title": "x", "parentId": step["id"]}).status_code == 400
    # A child is in its parent's part of the app.
    resp = client.post("/api/project-plan/items", headers=DANA, json={"nodeId": "writer/draft", "kind": "task", "title": "x", "parentId": step["id"]})
    assert resp.status_code == 400 and "same part" in resp.json()["detail"]
    # Dates in order; only a routine repeats.
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "task", "title": "x", "start": "2026-11-20", "due": "2026-11-01"}).status_code == 400
    rec = {"kind": "weekly", "every": 1, "days": [0], "anchor": "2026-11-16"}
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "task", "title": "x", "recurrence": rec}).status_code == 400
    routine = newest(add(client, kind="routine", title="Triage", recurrence=rec))
    assert routine["recurrence"]["days"] == [0]


def test_only_a_planner_of_the_console_shapes_its_plan(client: TestClient) -> None:
    resp = client.post("/api/project-plan/items", headers=LEE, json={"nodeId": DRAFT, "kind": "task", "title": "x"})
    assert resp.status_code == 403 and "Planner" in resp.json()["detail"]
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": "nowhere/at-all", "kind": "task", "title": "x"}).status_code == 400
    task = newest(add(client))
    assert item(plan(client, LEE), task["id"])["can"] == {"edit": False, "status": False, "claim": True}
    assert patch(client, task["id"], LEE, title="Mine now").status_code == 403
    assert client.delete(f"/api/project-plan/items/{task['id']}", headers=LEE).status_code == 403


def test_assign_claim_and_move_an_item_along(client: TestClient) -> None:
    task = newest(add(client, assigneeId="adm-lee"))
    assert task["assignee"] == {"kind": "staff", "id": "adm-lee"}
    # Someone else cannot claim an item assigned to Lee; Lee can, and moves it along.
    assert client.post(f"/api/project-plan/items/{task['id']}/claim", headers=SAM, json={}).status_code == 403
    v = client.post(f"/api/project-plan/items/{task['id']}/claim", headers=LEE, json={}).json()
    assert (item(v, task["id"])["status"], item(v, task["id"])["claimedBy"]) == ("claimed", "adm-lee")
    assert item(v, task["id"])["can"]["status"] is True
    assert patch(client, task["id"], LEE, status="inProgress").status_code == 200
    v = patch(client, task["id"], LEE, status="done").json()
    assert item(v, task["id"])["doneAt"] is not None
    # An unassigned item is anyone's to claim, and let go again.
    free = newest(add(client))
    client.post(f"/api/project-plan/items/{free['id']}/claim", headers=SAM, json={})
    v = client.post(f"/api/project-plan/items/{free['id']}/claim", headers=SAM, json={"release": True}).json()
    assert (item(v, free["id"])["status"], item(v, free["id"])["claimedBy"]) == ("todo", "")
    # Assigning to someone unknown is refused.
    assert patch(client, free["id"], assigneeId="adm-nobody").status_code == 400


def test_reorder_move_and_delete_with_everything_under_it(client: TestClient) -> None:
    a = newest(add(client, title="A"))
    b = newest(add(client, title="B"))
    c = newest(add(client, title="C"))
    v = client.put("/api/project-plan/items/reorder", headers=DANA, json={"nodeId": DRAFT, "parentId": None, "orderedIds": [c["id"], a["id"], b["id"]]}).json()
    assert [i["title"] for i in sorted(v["items"], key=lambda i: i["order"])] == ["C", "A", "B"]
    assert client.put("/api/project-plan/items/reorder", headers=DANA, json={"nodeId": DRAFT, "parentId": None, "orderedIds": [a["id"]]}).status_code == 400
    proc = newest(add(client, kind="process", title="P"))
    v = patch(client, a["id"], parentId=proc["id"]).json()
    assert item(v, a["id"])["parentId"] == proc["id"]
    # A process cannot go inside itself or what it holds.
    assert patch(client, proc["id"], parentId=a["id"]).status_code == 400
    v = client.delete(f"/api/project-plan/items/{proc['id']}", headers=DANA).json()
    assert {i["title"] for i in v["items"]} == {"B", "C"}


def test_statuses_flow_back_to_the_writers_of_a_statement(client: TestClient) -> None:
    sid = statement_id(client, SHELF, "verb-increase")
    client.post(f"/api/feedback/statements/{sid}/decision", headers=DANA, json={"decision": "accepted", "note": "Yes."})
    status = lambda: next(m for m in client.get("/api/feedback", headers=DANA).json()["messages"] if m["id"] == "fb-2")["status"]  # noqa: E731
    assert status() == "planned"
    one = newest(add(client, nodeId=SHELF, title="Brighter icons", statementIds=[sid]))
    two = newest(add(client, nodeId=SHELF, title="Contrast check", statementIds=[sid]))
    assert status() == "planned"
    patch(client, one["id"], status="inProgress")
    assert status() == "inProgress"
    patch(client, one["id"], status="done")
    assert status() == "inProgress"
    patch(client, two["id"], status="done")
    assert status() == "done"
    mine = client.get("/api/feedback/mine", params={"authorId": "a.kim"}).json()
    assert [s["step"] for s in next(m for m in mine["messages"] if m["id"] == "fb-2")["steps"]] == ["received", "checked", "planned", "inProgress", "done"]
    # A statement that does not exist cannot be linked.
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": SHELF, "kind": "task", "title": "x", "statementIds": ["st-nothing"]}).status_code == 400


def test_a_node_with_plan_items_is_not_deleted(client: TestClient) -> None:
    node = client.post("/api/resources/nodes", json={"parentId": "writer/draft/draft", "kind": "feature", "name": "Autosave"}).json()
    fid = next(n["id"] for n in node["nodes"] if n["name"] == "Autosave")
    add(client, nodeId=fid, title="Faster saves")
    resp = client.delete(f"/api/resources/nodes/{fid}")
    assert resp.status_code == 409 and "plan item" in resp.json()["detail"]


def test_a_corrupt_plan_is_quarantined(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "project-plan.json").write_text("{nope", encoding="utf-8")
    assert client.get("/api/project-plan", headers=DANA).status_code == 409
    assert list(app_data_root.glob("project-plan.json.corrupt*")) or list(app_data_root.glob("*corrupt*"))
