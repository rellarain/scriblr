import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

DANA = {"X-Admin-Id": "adm-dana"}  # director of Product, manager of Writing tools, Planner on the Writer
SAM = {"X-Admin-Id": "adm-sam"}  # director of Support, manager of the Help desk
ARI = {"X-Admin-Id": "hlp-ari"}  # a helper on the Help desk
DRAFT = "writer/draft/draft"


def staff(client: TestClient) -> dict:
    resp = client.get("/api/staff")
    assert resp.status_code == 200, resp.text
    return resp.json()


def person(view: dict, pid: str) -> dict:
    return next(p for p in view["people"] if p["id"] == pid)


def test_the_sample_staff_come_from_the_feedback_admins_in_one_roster(client: TestClient) -> None:
    v = staff(client)
    assert [d["name"] for d in v["departments"]] == ["Product", "Support"]
    # By department, then tier (none last), active above inactive, then by name.
    assert [(p["name"], p["tier"]) for p in v["people"]] == [
        ("Lee Park", 2), ("Dana Ruiz", None), ("Ari Chen", 1), ("Noor Haddad", 1), ("Sam Ortiz", 3),
    ]
    assert v["sla"] == {"urgent": 4, "high": 24, "normal": 72, "low": 168}
    # The helpers can act in the feedback screens too.
    assert {a["id"] for a in client.get("/api/feedback", headers=DANA).json()["admins"]} >= {"hlp-ari", "hlp-noor"}


def test_hire_and_term_keep_the_person(client: TestClient) -> None:
    v = client.post("/api/staff/people", headers=DANA, json={"name": "Kim Lowe", "kind": "admin", "teamId": "team-writing"}).json()
    kim = next(p for p in v["people"] if p["name"] == "Kim Lowe")
    assert (kim["departmentId"], kim["teamId"], kim["active"]) == ("dep-product", "team-writing", True)
    assert any(a["id"] == kim["id"] for a in client.get("/api/feedback", headers=DANA).json()["admins"])
    # Dana leaves: still listed, below the active ones, and leads nothing.
    v = client.patch("/api/staff/people/adm-dana", headers=SAM, json={"active": False}).json()
    assert person(v, "adm-dana")["active"] is False
    product = [p["name"] for p in v["people"] if p["departmentId"] == "dep-product"]
    assert product[-1] == "Dana Ruiz"
    assert next(d for d in v["departments"] if d["id"] == "dep-product")["directorId"] is None
    assert next(t for t in v["teams"] if t["id"] == "team-writing")["managerId"] is None
    # A team in another department is refused.
    assert client.patch(f"/api/staff/people/{kim['id']}", headers=SAM, json={"departmentId": "dep-support", "teamId": "team-writing"}).status_code == 400


def test_helper_hours_and_console_support(client: TestClient) -> None:
    v = client.patch("/api/staff/people/hlp-noor", headers=SAM, json={"allotment": 30}).json()
    assert person(v, "hlp-noor")["allotment"] == 30
    assert client.patch("/api/staff/people/hlp-noor", headers=SAM, json={"allotment": 12}).status_code == 400
    v = client.patch("/api/staff/people/adm-dana", headers=SAM, json={"supports": ["writer/draft"]}).json()
    assert person(v, "adm-dana")["tier"] == 2
    assert client.patch("/api/staff/people/adm-dana", headers=SAM, json={"supports": ["writer/draft/draft"]}).status_code == 400
    # A console someone supports is not deleted from the channel list.
    resp = client.delete("/api/resources/nodes/writer/draft")
    assert resp.status_code == 409


def test_departments_teams_and_the_sla(client: TestClient) -> None:
    v = client.post("/api/staff/departments", headers=DANA, json={"name": "Platform"}).json()
    dep = next(d for d in v["departments"] if d["name"] == "Platform")
    v = client.post("/api/staff/teams", headers=DANA, json={"name": "Storage", "departmentId": dep["id"]}).json()
    team = next(t for t in v["teams"] if t["name"] == "Storage")
    v = client.patch(f"/api/staff/teams/{team['id']}", headers=DANA, json={"managerId": "adm-lee"}).json()
    assert next(t for t in v["teams"] if t["id"] == team["id"])["managerId"] == "adm-lee"
    v = client.patch(f"/api/staff/departments/{dep['id']}", headers=DANA, json={"directorId": "adm-sam"}).json()
    assert client.delete(f"/api/staff/departments/{dep['id']}", headers=DANA).status_code == 400  # it still has a team
    client.delete(f"/api/staff/teams/{team['id']}", headers=DANA)
    assert client.delete(f"/api/staff/departments/{dep['id']}", headers=DANA).status_code == 200
    v = client.put("/api/staff/sla", headers=DANA, json={"urgent": 2}).json()
    assert v["sla"]["urgent"] == 2
    assert client.put("/api/staff/sla", headers=DANA, json={"soon": 3}).status_code == 400
    assert client.put("/api/staff/sla", headers=DANA, json={"low": 0}).status_code == 400


def _backdate(app_data_root: Path, hours: int) -> None:
    path = app_data_root / "project-plan.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    then = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    for item in raw["items"]:
        item["assignedAt"] = then
        item["createdAt"] = then
    path.write_text(json.dumps(raw), encoding="utf-8")


def _add(client: TestClient, assignee: dict, title: str, priority: str = "urgent") -> str:
    v = client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "task", "title": title, "priority": priority, "assignee": assignee}).json()
    return next(i["id"] for i in v["items"] if i["title"] == title)


def test_plan_work_past_its_sla_comes_up_the_organisation(client: TestClient, app_data_root: Path) -> None:
    ari = _add(client, {"kind": "staff", "id": "hlp-ari"}, "Ari's")
    team = _add(client, {"kind": "team", "id": "team-help"}, "The desk's")
    dep = _add(client, {"kind": "department", "id": "dep-support"}, "Support's")
    late = _add(client, {"kind": "staff", "id": "adm-sam"}, "Sam's", priority="low")
    plan = client.get("/api/project-plan", headers=ARI).json()
    item = lambda v, iid: next(i for i in v["items"] if i["id"] == iid)  # noqa: E731
    assert item(plan, ari)["sla"]["late"] is False
    # A team member may claim the team's work; a department's work is for its managers.
    assert item(plan, team)["mineToClaim"] is True and item(plan, team)["can"]["claim"] is True
    assert item(plan, dep)["can"]["claim"] is False
    assert item(client.get("/api/project-plan", headers=SAM).json(), dep)["can"]["claim"] is True

    _backdate(app_data_root, 5)  # past the urgent SLA (4 hours), within the low one
    sam = client.get("/api/project-plan", headers=SAM).json()
    assert item(sam, ari)["sla"] == {**item(sam, ari)["sla"], "late": True, "level": "manager", "to": "adm-sam"}
    assert item(sam, ari)["can"]["status"] is True  # it came up to Sam, who must do it
    assert (item(sam, team)["sla"]["level"], item(sam, team)["sla"]["to"]) == ("manager", "adm-sam")
    assert (item(sam, dep)["sla"]["level"], item(sam, dep)["sla"]["to"]) == ("director", "adm-sam")
    assert item(sam, late)["sla"]["late"] is False
    # Sam manages his own team: his late work goes to his director (none above him in the sample: himself), so nobody.
    _backdate(app_data_root, 200)
    assert item(client.get("/api/project-plan", headers=SAM).json(), late)["sla"]["to"] is None
    # Done work has no clock.
    client.patch(f"/api/project-plan/items/{ari}", headers=ARI, json={"status": "done"})
    assert item(client.get("/api/project-plan", headers=SAM).json(), ari)["sla"] is None


def test_assigning_to_someone_who_left_is_refused(client: TestClient) -> None:
    client.patch("/api/staff/people/hlp-noor", headers=SAM, json={"active": False})
    resp = client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "task", "title": "x", "assignee": {"kind": "staff", "id": "hlp-noor"}})
    assert resp.status_code == 400 and "left" in resp.json()["detail"]
    assert client.post("/api/project-plan/items", headers=DANA, json={"nodeId": DRAFT, "kind": "task", "title": "x", "assignee": {"kind": "team", "id": "team-none"}}).status_code == 400


def test_a_corrupt_staff_file_is_quarantined(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "staff.json").write_text("{nope", encoding="utf-8")
    assert client.get("/api/staff").status_code == 409
