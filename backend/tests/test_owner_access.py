"""Universal access (2026-11-16): the owner is always on the staff and in the feedback admins, holds every role and tier, may claim any open plan item and
promote anyone, is who a staff call acts as when it names nobody, and cannot have their roles changed or be termed. Other staff keep their roles."""

from fastapi.testclient import TestClient

DANA = {"X-Admin-Id": "adm-dana"}


def test_the_owner_is_on_the_staff_and_acts_when_no_one_is_named(client: TestClient) -> None:
    b = client.get("/api/feedback").json()
    assert b["me"] == "owner"
    assert b["admins"][0]["id"] == "owner"
    assert b["can"] == {"check": True, "manageVerbs": True}
    people = client.get("/api/staff").json()["people"]
    owner = next(p for p in people if p["id"] == "owner")
    assert (owner["kind"], owner["allotment"], owner["tier"], owner["active"]) == ("admin", 30, 4, True)


def test_the_owner_holds_every_role_on_every_statement(client: TestClient) -> None:
    b = client.get("/api/feedback").json()
    assert b["statements"], "the seed has statements"
    for s in b["statements"]:
        assert s["can"]["correct"] and s["can"]["decide"]


def test_the_owner_s_roles_cannot_be_changed_and_they_cannot_be_termed(client: TestClient) -> None:
    r = client.put("/api/feedback/admins/owner/roles", json={"scope": "writer/draft", "roles": []})
    assert r.status_code == 403
    assert client.patch("/api/staff/people/owner", json={"active": False}).status_code in (400, 409, 422)
    assert client.patch("/api/staff/people/owner", json={"kind": "helper"}).status_code in (400, 409, 422)


def test_the_owner_promotes_anyone(client: TestClient) -> None:
    people = client.get("/api/staff").json()["people"]
    noor = next(p for p in people if p["id"] == "hlp-noor")
    node = next(t["nodeId"] for t in noor["training"] if not t["promotedBy"])
    r = client.put("/api/staff/people/hlp-noor/promotion", json={"nodeId": node, "promoted": True})
    assert r.status_code == 200
    noor = next(p for p in r.json()["people"] if p["id"] == "hlp-noor")
    assert next(t for t in noor["training"] if t["nodeId"] == node)["promotedBy"] == "owner"


def test_another_admin_still_acts_with_their_own_roles(client: TestClient) -> None:
    b = client.get("/api/feedback", headers=DANA).json()
    assert b["me"] == "adm-dana"
    assert not all(s["can"]["decide"] for s in b["statements"])
