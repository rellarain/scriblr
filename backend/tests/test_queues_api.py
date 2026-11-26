from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api import support as support_api

ARI = {"X-Admin-Id": "hlp-ari"}  # helper: tier 1 on Writer > Draft, tier 2 through the Writer interface; Mon-Fri 9-13
NOOR = {"X-Admin-Id": "hlp-noor"}  # helper: tier 1 on Writer > Draft and Reader > Library; Mon-Fri 13-15
SAM = {"X-Admin-Id": "adm-sam"}  # admin with helper hours, promoted on Writer > Draft: tier 4 there; Mon-Fri 10-12
DANA = {"X-Admin-Id": "adm-dana"}  # admin: channel support of Writer > Draft (tier 3), no helper hours
LEE = {"X-Admin-Id": "adm-lee"}  # admin: channel support of Reader > Library and Nook; Mon-Fri 15-17
DRAFT = "writer/draft"


@pytest.fixture()
def wednesday(monkeypatch: pytest.MonkeyPatch) -> datetime:
    """A Wednesday at 10:30, in a week after the one the sample hours were made for (they repeat)."""
    today = datetime.now().astimezone()
    monday = (today - timedelta(days=today.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    when = monday + timedelta(days=9, hours=10, minutes=30)
    monkeypatch.setattr(support_api, "_now", lambda: when)
    return when


def queues(client: TestClient, who=ARI) -> dict:
    client.get("/api/staff")
    resp = client.get("/api/support/queues", headers=who)
    assert resp.status_code == 200, resp.text
    return resp.json()


def row(view: dict, queue: str = DRAFT) -> dict:
    return next(q for q in view["queues"] if q["id"] == queue)


def start(client: TestClient, n: int, focal: str = "writer/draft/draft") -> list[str]:
    ids = []
    for i in range(n):
        resp = client.post("/api/support/chats", json={"userId": f"u-{i}", "userName": f"User {i}", "focal": focal, "text": "Help"})
        assert resp.status_code == 200, resp.text
        ids.append(resp.json()["chats"][0]["id"])
    return ids


def test_helper_time_and_the_switchboard_by_tier(client: TestClient, wednesday: datetime) -> None:
    v = queues(client)
    assert v["me"]["onShift"] is True and v["me"]["thisWeek"]["hours"] == 20
    # Low (nobody waiting): required for tier 1 only; Ari is tier 2 here, so it is optional and off.
    assert (row(v)["myTier"], row(v)["level"], row(v)["myState"]) == (2, "low", "off")
    # A console where Ari has no tier is not on the switchboard.
    assert row(v, "reader/library")["myState"] is None and row(v, "reader/library")["myTier"] is None
    # Noor is tier 1 on Writer > Draft but has no helper time now.
    assert row(queues(client, NOOR))["myState"] == "unavailable"
    # Ari turns the optional queue on and off.
    v = client.put("/api/support/switchboard", headers=ARI, json={"queue": DRAFT, "on": True}).json()
    assert row(v)["myState"] == "on"
    # Three waiting: medium (the default ranges), required for tiers 1-2, so Ari cannot turn it off.
    start(client, 3)
    v = queues(client)
    assert (row(v)["pending"], row(v)["level"], row(v)["myState"]) == (3, "medium", "required")
    assert client.put("/api/support/switchboard", headers=ARI, json={"queue": DRAFT, "on": False}).status_code == 400
    assert client.put("/api/support/switchboard", headers=ARI, json={"queue": "reader/library", "on": True}).status_code == 400
    # Sam (tier 4) only has it required when it is urgent.
    assert row(queues(client, SAM))["myState"] == "off"


def test_levels_and_overrides_are_set_by_the_queues_channel_support(client: TestClient, wednesday: datetime) -> None:
    start(client, 3)
    assert client.put("/api/support/levels", headers=ARI, json={"queue": DRAFT, "ranges": {"medium": 1, "high": 2, "urgent": 3}}).status_code == 400
    assert client.put("/api/support/levels", headers=DANA, json={"queue": DRAFT, "ranges": {"medium": 5, "high": 4, "urgent": 6}}).status_code == 400
    v = client.put("/api/support/levels", headers=DANA, json={"queue": DRAFT, "ranges": {"medium": 1, "high": 2, "urgent": 3}}).json()
    assert (row(v)["level"], row(v)["ownRanges"]) == ("urgent", True)
    v = client.put("/api/support/levels", headers=DANA, json={"queue": DRAFT}).json()
    assert (row(v)["level"], row(v)["ownRanges"]) == ("medium", False)
    # The default ranges: any channel support.
    v = client.put("/api/support/levels", headers=LEE, json={"ranges": {"medium": 2, "high": 3, "urgent": 9}}).json()
    assert v["levels"] == {"medium": 2, "high": 3, "urgent": 9} and row(v)["level"] == "high"
    # A temporary override raises a queue's level; only its own channel support sets it.
    assert client.put("/api/support/overrides", headers=LEE, json={"queue": DRAFT, "level": "urgent", "hours": 2}).status_code == 400
    v = client.put("/api/support/overrides", headers=DANA, json={"queue": DRAFT, "level": "urgent", "hours": 2}).json()
    assert (row(v)["level"], row(v)["autoLevel"]) == ("urgent", "high")
    assert row(v)["override"]["until"]
    v = client.put("/api/support/overrides", headers=DANA, json={"queue": DRAFT, "level": None}).json()
    assert row(v)["level"] == "high" and row(v)["override"] is None


def test_the_next_chat_goes_by_tier_then_level_then_age(client: TestClient, wednesday: datetime) -> None:
    first, second, third = start(client, 3)
    client.get("/api/staff")
    # Ari (tier 2): nobody of tier 1 is covering Writer > Draft (Noor is off shift), so the oldest tier-1 chat is next.
    assert client.get("/api/support", headers=ARI).json()["next"] == first
    # An escalation to tier 2 comes first for a tier-2 helper.
    client.post(f"/api/support/chats/{third}/take", headers=ARI)
    client.post(f"/api/support/chats/{third}/actions", headers=ARI, json={"action": "escalation"})
    assert client.get("/api/support", headers=ARI).json()["next"] == third
    # Sam (tier 4): the queue is optional for him below urgent, so nothing is next until he turns it on; even then a tier-1
    # chat that Ari (tier 2) is covering is not his while the queue is only medium.
    assert client.get("/api/support", headers=SAM).json()["next"] is None
    client.put("/api/support/switchboard", headers=SAM, json={"queue": DRAFT, "on": True})
    assert client.get("/api/support", headers=SAM).json()["next"] is None
    # At high, the lower tiers' chats are his too, oldest first.
    client.put("/api/support/overrides", headers=DANA, json={"queue": DRAFT, "level": "high", "hours": 1})
    assert client.get("/api/support", headers=SAM).json()["next"] == first
    del second


def test_next_weeks_schedule_within_the_allotment(client: TestClient, wednesday: datetime) -> None:
    queues(client)
    too_many = [{"day": 0, "start": 8, "hours": 12}, {"day": 1, "start": 8, "hours": 12}]
    assert client.put("/api/support/schedule", headers=ARI, json={"blocks": too_many}).status_code == 400
    assert client.put("/api/support/schedule", headers=ARI, json={"blocks": [{"day": 2, "start": 9, "hours": 2}, {"day": 2, "start": 14, "hours": 2}]}).status_code == 400
    assert client.put("/api/support/schedule", headers=ARI, json={"blocks": [{"day": 3, "start": 20, "hours": 6}]}).status_code == 400
    assert client.put("/api/support/schedule", headers=ARI, json={"blocks": [{"day": 9, "start": 1, "hours": 1}]}).status_code == 400
    assert client.put("/api/support/schedule", headers=DANA, json={"blocks": []}).status_code == 400  # no helper hours
    v = client.put("/api/support/schedule", headers=ARI, json={"blocks": [{"day": 1, "start": 14, "hours": 6}, {"day": 0, "start": 8, "hours": 8}]}).json()
    nxt = v["me"]["nextWeek"]
    assert (nxt["own"], nxt["hours"], [b["day"] for b in nxt["blocks"]]) == (True, 14, [0, 1])
    # This week is fixed: still the hours it had, and Ari is still on shift.
    assert v["me"]["thisWeek"]["hours"] == 20 and v["me"]["onShift"] is True


def test_admins_see_each_queues_staff_and_chats_but_not_their_messages(client: TestClient, wednesday: datetime) -> None:
    ids = start(client, 3)
    client.get("/api/staff")
    client.post(f"/api/support/chats/{ids[0]}/take", headers=ARI)
    client.post(f"/api/support/chats/{ids[0]}/actions", headers=ARI, json={"action": "stage", "stage": "issue"})
    v = queues(client, DANA)
    draft = row(v)
    assert {s["id"]: s["state"] for s in draft["staff"]} == {"hlp-ari": "active", "hlp-noor": "inactive", "adm-dana": "inactive", "adm-sam": "inactive", "owner": "inactive"}
    chat = draft["chats"][0]
    assert (chat["staffName"], chat["userName"], chat["stage"], chat["actions"]) == ("Ari Chen", "User 0", "issue", ["taken", "stage"])
    assert "events" not in chat
    assert [w["id"] for w in draft["waiting"]] == ids[1:]
    # A helper's view has the switchboard only.
    assert row(queues(client, ARI))["staff"] == [] and row(queues(client, ARI))["chats"] == []


def test_admins_see_everyones_weeks_and_set_their_own(client: TestClient, wednesday: datetime) -> None:
    """The view gives admins every active person with helper hours, this week and next (the Office's Schedule tabs); helpers get
    none. An admin with helper hours (the owner too) sets next week, and it shows in everyone's weeks."""
    assert queues(client, ARI)["weeks"] == []
    weeks = {w["id"]: w for w in queues(client, LEE)["weeks"]}
    assert "adm-dana" not in weeks  # no helper hours
    assert {"hlp-ari", "hlp-noor", "adm-sam", "adm-lee", "owner"} <= set(weeks)
    assert weeks["hlp-ari"]["thisWeek"]["hours"] == 20
    assert weeks["hlp-ari"]["nextWeek"]["own"] is False  # the week before it repeats
    v = client.put("/api/support/schedule", headers={"X-Admin-Id": "owner"}, json={"blocks": [{"day": 4, "start": 9, "hours": 8}]}).json()
    assert v["me"]["nextWeek"]["hours"] == 8
    owner = next(w for w in v["weeks"] if w["id"] == "owner")
    assert (owner["nextWeek"]["own"], owner["nextWeek"]["blocks"]) == (True, [{"day": 4, "start": 9, "hours": 8}])


def test_work_and_breaks_earned_and_used(client: TestClient, wednesday: datetime, monkeypatch: pytest.MonkeyPatch) -> None:
    # Ari works 9-13 today; at 10:30, 90 minutes are done, 150 ahead, and 10 minutes an hour earns 15 of break.
    w = queues(client)["me"]["work"]
    assert w == {"scheduled": 240, "complete": 90, "remaining": 150, "breakEarned": 15, "breakUsed": 0, "breakRate": 10, "onBreak": False}
    assert client.put("/api/support/break", headers=ARI, json={"on": False}).status_code == 400  # not on a break
    v = client.put("/api/support/break", headers=ARI, json={"on": True}).json()
    assert v["me"]["work"]["onBreak"] is True and v["me"]["onShift"] is True
    assert client.put("/api/support/break", headers=ARI, json={"on": True}).status_code == 400  # on one already
    # On a break no queue is on for Ari, so no new chat comes; an admin sees Ari on a break.
    client.put("/api/support/switchboard", headers=ARI, json={"queue": DRAFT, "on": True})
    start(client, 1)
    v = queues(client)
    assert row(v)["myState"] == "unavailable" and v["next"] is None
    assert next(s for s in row(queues(client, SAM))["staff"] if s["id"] == "hlp-ari")["state"] == "break"
    # Fifteen minutes later the break ends: it counts as used, not worked.
    later = wednesday + timedelta(minutes=15)
    monkeypatch.setattr(support_api, "_now", lambda: later)
    w = client.put("/api/support/break", headers=ARI, json={"on": False}).json()["me"]["work"]
    assert (w["complete"], w["remaining"], w["breakUsed"], w["breakEarned"], w["onBreak"]) == (90, 135, 15, 15, False)
    assert queues(client)["next"] is not None
    # Dana has no helper time, so no break.
    assert client.put("/api/support/break", headers=DANA, json={"on": True}).status_code == 400


def test_the_break_allowance_is_set_by_an_admin(client: TestClient, wednesday: datetime) -> None:
    queues(client)
    assert client.put("/api/support/break-rate", headers=ARI, json={"minutes": 20}).status_code == 400
    assert client.put("/api/support/break-rate", headers=SAM, json={"minutes": 31}).status_code == 422
    v = client.put("/api/support/break-rate", headers=SAM, json={"minutes": 20}).json()
    assert v["me"]["work"]["breakRate"] == 20
    assert queues(client)["me"]["work"]["breakEarned"] == 30  # Ari's 90 minutes at 20 an hour
