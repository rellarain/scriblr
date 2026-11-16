import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.storage import feedback as store

DANA = {"X-Admin-Id": "adm-dana"}
LEE = {"X-Admin-Id": "adm-lee"}
SAM = {"X-Admin-Id": "adm-sam"}
SHELF = "writer/dashboard/project"


def bundle(client: TestClient, who=DANA) -> dict:
    resp = client.get("/api/feedback", headers=who)
    assert resp.status_code == 200, resp.text
    return resp.json()


def statement(b: dict, channel: str, verb: str) -> dict:
    return next(s for s in b["statements"] if s["channelId"] == channel and s["verbId"] == verb)


def message(b: dict, mid: str) -> dict:
    return next(m for m in b["messages"] if m["id"] == mid)


def send(client: TestClient, channel="writer/draft/draft", verb="verb-fix", text="It breaks.", author="u-1") -> str:
    resp = client.post("/api/feedback/messages", json={
        "author": "Jordan", "authorId": author, "text": text, "senderTone": "unpleasant",
        "channelId": channel, "verbId": verb, "fromChannel": "writer/draft",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def mine(client: TestClient, author="u-1") -> dict:
    return client.get("/api/feedback/mine", params={"authorId": author}).json()


def check(client: TestClient, mid: str, who=DANA, **body) -> object:
    return client.put(f"/api/feedback/messages/{mid}", headers=who, json=body)


# --- the seed -----------------------------------------------------------------


def test_the_seed_has_admins_with_roles_per_scope_and_statements_from_checked_messages(client: TestClient) -> None:
    b = bundle(client)
    assert b["me"] == "adm-dana"
    dana = next(a for a in b["admins"] if a["id"] == "adm-dana")
    assert dana["roles"]["helper/inbox"] == ["checker", "channelManager"]
    assert "planner" in dana["roles"]["writer/draft"]
    shelf = statement(b, SHELF, "verb-increase")
    assert shelf["messageIds"] == ["fb-2", "fb-6"]  # fb-7 is not checked yet
    assert shelf["tally"] == {"approve": 1, "deny": 1, "pass": 0}
    assert {m["id"] for m in b["messages"] if not m["checked"]} == {"fb-5", "fb-7"}
    assert b["can"] == {"check": True, "manageVerbs": True}


def test_an_unknown_admin_is_refused(client: TestClient) -> None:
    assert client.get("/api/feedback", headers={"X-Admin-Id": "nobody"}).status_code == 403


def test_the_staff_bundle_names_no_user_and_no_other_admin(client: TestClient) -> None:
    b = bundle(client)
    text = json.dumps({"messages": b["messages"], "statements": b["statements"]})
    for name in ("j.rivera", "a.kim", "m.okafor", "adm-lee", "adm-sam"):
        assert name not in text
    fb2 = message(b, "fb-2")
    assert fb2["comments"][0]["mine"] is True
    assert message(bundle(client, LEE), "fb-2")["comments"][0]["mine"] is False


@pytest.mark.parametrize("labels,expected", [
    ([], None), (["neutral"], "neutral"), (["neutral", "pleasant"], "neutral"), (["pleasant"], "pleasant"),
    (["unpleasant"], "unpleasant"), (["mixed"], "mixed"), (["pleasant", "unpleasant"], "mixed"),
    (["pleasant", "pleasant", "pleasant", "unpleasant"], "pleasant"), (["pleasant", "pleasant", "unpleasant"], "mixedPleasant"),
    (["unpleasant", "unpleasant", "pleasant"], "mixedUnpleasant"), (["unpleasant", "unpleasant", "unpleasant", "pleasant"], "unpleasant"),
])
def test_tone_categories(labels: list[str], expected: str) -> None:
    assert store.tone_category(labels) == expected


def test_keywords_flag_possible_verbs_from_a_word_start() -> None:
    cats = [store.VerbCategory(id="v", name="Increase", keywords=["increase"])]
    assert [f["keyword"] for f in store.flags_for("Please increased it, not reincrease", cats)] == ["increase"]


# --- sending and following feedback ---------------------------------------------


def test_a_user_sends_a_statement_and_follows_it_without_an_admin(client: TestClient) -> None:
    mid = send(client)
    view = mine(client)
    assert view["messages"][0]["id"] == mid
    assert view["messages"][0]["status"] == "received"
    assert view["messages"][0]["verbName"] == "Fix"
    assert mine(client, "someone-else")["messages"] == []
    assert mine(client, "")["messages"] == []


def test_sending_checks_the_subject_and_the_verb(client: TestClient) -> None:
    base = {"author": "J", "authorId": "u", "text": "x", "verbId": "verb-fix", "channelId": "writer/draft/draft"}
    assert client.post("/api/feedback/messages", json={**base, "channelId": "nowhere"}).status_code == 400
    assert client.post("/api/feedback/messages", json={**base, "verbId": "verb-nope"}).status_code == 400
    assert client.post("/api/feedback/messages", json={**base, "text": "  "}).status_code == 400
    assert client.get("/api/feedback/verbs").json()[0]["name"] == "Increase"


def test_a_helper_checks_a_message_and_it_joins_the_statement_of_its_subject_and_verb(client: TestClient) -> None:
    assert check(client, "fb-7", checked=True).status_code == 400  # a tone first
    assert check(client, "fb-7", SAM, tone="mixed", checked=True).status_code == 200  # Sam is a checker too
    shelf = statement(bundle(client), SHELF, "verb-increase")
    assert shelf["messageIds"] == ["fb-2", "fb-6", "fb-7"]
    m = message(bundle(client, SAM), "fb-7")
    assert m["checked"] and m["checkedByMe"] and m["statementId"] == shelf["id"]


def test_checking_needs_the_checker_role_on_the_inbox(client: TestClient) -> None:
    client.put("/api/feedback/admins/adm-lee/roles", headers=DANA, json={"scope": "helper/inbox", "roles": []})
    resp = check(client, "fb-5", LEE, tone="neutral")
    assert resp.status_code == 403
    assert "Checker role on Helper > Inbox" in resp.json()["detail"]


def test_the_helper_can_correct_the_subject_and_verb_before_checking(client: TestClient) -> None:
    mid = send(client, channel="writer/draft", verb="verb-improve")
    assert check(client, mid, channelId="writer/draft/draft", verbId="verb-fix", tone="unpleasant", checked=True).status_code == 200
    autosave = statement(bundle(client), "writer/draft/draft", "verb-fix")
    assert autosave["messageIds"] == ["fb-1", mid]  # lumped with the seeded one


def test_channel_management_moves_a_checked_message_to_another_statement(client: TestClient) -> None:
    # Dana manages the Writer consoles: moving fb-6 to Improve leaves the Increase statement and starts another.
    assert check(client, "fb-6", verbId="verb-improve").status_code == 200
    b = bundle(client)
    assert statement(b, SHELF, "verb-increase")["messageIds"] == ["fb-2"]
    assert statement(b, SHELF, "verb-improve")["messageIds"] == ["fb-6"]
    # Lee manages the Reader consoles only.
    resp = check(client, "fb-2", LEE, verbId="verb-fix")
    assert resp.status_code == 403 and "Channel manager role" in resp.json()["detail"]
    # Moving to a console Dana does not manage is refused.
    assert check(client, "fb-6", channelId="reader/nook/stack").status_code == 403
    assert check(client, "fb-6", channelId="writer/draft/nowhere").status_code == 400


def test_questions_reach_the_writer_who_answers_them_and_comments_stay_with_staff(client: TestClient) -> None:
    mid = send(client)
    assert client.post(f"/api/feedback/messages/{mid}/questions", headers=LEE, json={"text": "Which file?"}).status_code == 200
    assert client.post(f"/api/feedback/messages/{mid}/comments", headers=LEE, json={"text": "Seen this before."}).status_code == 200
    view = mine(client)
    assert view["openQuestions"] == 1
    q = view["messages"][0]["questions"][0]
    assert q["text"] == "Which file?" and q["answer"] == ""
    assert "comments" not in view["messages"][0] and "Seen this before" not in json.dumps(view)
    path = f"/api/feedback/messages/{mid}/questions/{q['id']}/answer"
    assert client.put(path, json={"authorId": "intruder", "answer": "x"}).status_code == 403
    answered = client.put(path, json={"authorId": "u-1", "answer": "chapter-3.md"}).json()
    assert answered["openQuestions"] == 0 and answered["messages"][0]["questions"][0]["answer"] == "chapter-3.md"
    staff = message(bundle(client, LEE), mid)
    assert staff["questions"][0]["answer"] == "chapter-3.md" and staff["questions"][0]["mine"] is True
    assert client.post(f"/api/feedback/messages/{mid}/questions", headers=LEE, json={"text": " "}).status_code == 400


# --- voting and deciding ---------------------------------------------------------------


def test_votes_hold_any_combination_with_notes_and_can_be_withdrawn(client: TestClient) -> None:
    sid = statement(bundle(client), SHELF, "verb-increase")["id"]
    resp = client.put(f"/api/feedback/statements/{sid}/vote", headers=SAM, json={"approve": True})
    assert resp.status_code == 403  # Sam votes on Reader consoles only
    b = client.put(f"/api/feedback/statements/{sid}/vote", headers=DANA, json={"approve": True, "passed": True, "passNote": "either way"}).json()
    mine_vote = next(v for v in statement(b, SHELF, "verb-increase")["votes"] if v["mine"])
    assert mine_vote["approve"] and mine_vote["passed"] and mine_vote["passNote"] == "either way" and mine_vote["approveNote"] == ""
    b = client.put(f"/api/feedback/statements/{sid}/vote", headers=DANA, json={}).json()
    assert not any(v["mine"] for v in statement(b, SHELF, "verb-increase")["votes"])
    assert client.put(f"/api/feedback/statements/{sid}/vote", headers=DANA, json={"approve": True, "approveNote": "x" * 501}).status_code == 422


def test_the_planner_accepts_or_vetoes_with_or_without_votes_and_the_writer_sees_it(client: TestClient) -> None:
    mid = send(client)
    check(client, mid, tone="unpleasant", checked=True)
    assert mine(client)["messages"][0]["status"] == "voting"
    sid = statement(bundle(client), "writer/draft/draft", "verb-fix")["id"]
    assert client.post(f"/api/feedback/statements/{sid}/decision", headers=LEE, json={"decision": "accepted"}).status_code == 403
    b = client.post(f"/api/feedback/statements/{sid}/decision", headers=DANA, json={"decision": "accepted", "note": "Next release."}).json()
    st = statement(b, "writer/draft/draft", "verb-fix")
    assert st["decision"] == "accepted" and st["can"]["vote"] is False
    view = mine(client)["messages"][0]
    assert view["status"] == "planned" and [s["step"] for s in view["steps"]] == ["received", "checked", "planned"]
    assert client.put(f"/api/feedback/statements/{sid}/vote", headers=DANA, json={"approve": True}).status_code == 409
    client.post(f"/api/feedback/statements/{sid}/decision", headers=DANA, json={"decision": "vetoed", "note": "Works as designed."})
    view = mine(client)["messages"][0]
    assert view["status"] == "declined" and view["note"] == "Works as designed."
    client.post(f"/api/feedback/statements/{sid}/decision", headers=DANA, json={"decision": None})
    assert mine(client)["messages"][0]["status"] == "voting"


def test_plan_work_moves_the_writers_status_on() -> None:
    file = store._build_seed()
    m = next(x for x in file.messages if x.id == "fb-1")
    sid = store.statement_id(store.statement_key(m.channelId, m.verbId))
    store.decide(file, "adm-dana", sid, "accepted", "")
    assert store.message_status(file, m, lambda s: "inProgress" if s == sid else None)["status"] == "inProgress"
    done = store.message_status(file, m, lambda s: "done")
    assert done["status"] == "done" and [s["step"] for s in done["steps"]][-2:] == ["inProgress", "done"]


# --- verbs and roles ---------------------------------------------------------------------


def test_verbs_are_managed_by_the_inbox_channel_manager_and_a_used_verb_stays(client: TestClient) -> None:
    assert client.post("/api/feedback/verb-categories", headers=LEE, json={"name": "Clarify"}).status_code == 403
    b = client.post("/api/feedback/verb-categories", headers=DANA, json={"name": "Clarify", "keywords": [" Unclear "]}).json()
    clarify = next(v for v in b["verbCategories"] if v["name"] == "Clarify")
    assert clarify["keywords"] == ["unclear"]
    assert client.post("/api/feedback/verb-categories", headers=DANA, json={"name": "clarify"}).status_code == 409
    assert client.delete("/api/feedback/verb-categories/verb-fix", headers=DANA).status_code == 409
    assert client.delete(f"/api/feedback/verb-categories/{clarify['id']}", headers=DANA).status_code == 200


def test_roles_are_assigned_per_scope_and_recorded(client: TestClient) -> None:
    b = client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"scope": "writer/draft", "roles": ["planner", "voter"]}).json()
    sam = next(a for a in b["admins"] if a["id"] == "adm-sam")
    assert sam["roles"]["writer/draft"] == ["voter", "planner"]
    assert "Sam Ortiz: writer/draft set to voter, planner" in b["roleHistory"][-1]["detail"]
    assert client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"scope": "nowhere", "roles": []}).status_code == 400
    assert client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"scope": "writer/draft", "roles": ["boss"]}).status_code == 400
    resp = client.put("/api/feedback/admins/adm-dana/roles", headers=DANA, json={"scope": "helper/inbox", "roles": ["checker"]})
    assert resp.status_code == 403


# --- the file -------------------------------------------------------------------------------


def test_feedback_is_one_app_level_file_and_a_corrupt_one_is_quarantined(client: TestClient, app_data_root: Path) -> None:
    send(client)
    assert (app_data_root / "feedback.json").exists()
    (app_data_root / "feedback.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/feedback", headers=DANA).status_code == 409
    assert list(app_data_root.glob("feedback.corrupt-*.json"))


def test_a_node_feedback_points_at_cannot_be_deleted(client: TestClient) -> None:
    resp = client.delete("/api/resources/nodes/reader/library")
    assert resp.status_code == 409 and "feedback message" in resp.json()["detail"]
    assert client.delete("/api/resources/nodes/training/lesson").status_code == 200


def _v2_file() -> dict:
    spines = {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf", "feature": "Book Spines"}
    return {
        "schemaVersion": 2,
        "admins": [{"id": "adm-old", "name": "Old Admin", "roles": {
            "Helper/Inbox": ["processor", "configurer"], "Writer/Shelf": ["processor", "planner"], "Reader/*": ["configurer"]}}],
        "verbCategories": [{"id": "verb-fix", "name": "Fix", "keywords": ["broken"]}, {"id": "verb-add", "name": "Add", "keywords": []}],
        "messages": [
            {"id": "m1", "text": "The spines are broken", "author": "someone", "submittedAt": "2026-08-01", "senderTone": "unpleasant",
             "openPage": "Writer", "openConsole": "Shelf", "selectedComponent": "Sidebar Shelf"},
            {"id": "m2", "text": "It is broken somewhere", "author": "other", "submittedAt": "2026-08-02", "senderTone": None},
        ],
        "validations": {"m1": [{"adminId": "adm-old", "tone": "unpleasant", "channels": [spines], "statements": [{"channel": spines, "verbId": "verb-fix"}]}]},
        "messageHistory": {},
        "cases": {"case-x": {"id": "case-x", "key": "Writer|Shelf|Sidebar Shelf|Book Spines::verb-fix", "status": "approved",
                             "votes": [{"adminId": "adm-old", "approve": True}], "solutions": [{"id": "s", "title": "t", "target": spines, "proposedBy": "adm-old"}],
                             "closedBy": "adm-old", "closeNote": "Do it.", "history": [{"adminId": "adm-old", "kind": "vote", "detail": "approved"}]}},
        "roleHistory": [],
    }


def test_a_version_2_file_moves_to_channel_ids_once_keeping_a_copy(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "feedback.json").write_text(json.dumps(_v2_file()), encoding="utf-8")
    b = bundle(client, {"X-Admin-Id": "adm-old"})
    roles = next(a for a in b["admins"] if a["id"] != "owner")["roles"]
    assert roles["helper/inbox"] == ["checker", "channelManager"]
    assert roles["writer/shelf"] == ["voter", "planner"]
    assert all(roles[c] == ["channelManager"] for c in ("reader/nook", "reader/library", "reader/book", "reader/pages"))
    m1 = message(b, "m1")
    assert m1["channelId"] == "writer/shelf/sidebar-shelf/book-spines" and m1["checked"] and m1["tone"] == "unpleasant"
    assert m1["fromChannel"] == "writer/shelf/sidebar-shelf"
    m2 = message(b, "m2")
    assert m2["checked"] is False and m2["verbId"] == "verb-fix" and m2["channelId"] == "writer"  # guessed from its words
    st = statement(b, m1["channelId"], "verb-fix")
    assert st["decision"] == "accepted" and st["decisionNote"] == "Do it." and st["tally"]["approve"] == 1
    tree = {n["id"]: n for n in client.get("/api/channels").json()["nodes"]}
    assert tree["writer/shelf/sidebar-shelf/book-spines"]["kind"] == "feature"
    assert (app_data_root / "feedback.v2.json").exists()
    assert json.loads((app_data_root / "feedback.json").read_text(encoding="utf-8"))["schemaVersion"] == 3
    assert bundle(client, {"X-Admin-Id": "adm-old"})["messages"] == b["messages"]  # not moved twice


def test_a_version_1_file_moves_its_access_patterns_to_scopes(client: TestClient, app_data_root: Path) -> None:
    v1 = {**_v2_file(), "schemaVersion": 1, "admins": [{"id": "adm-old", "name": "Old", "processing": ["Helper/Inbox", "Writer/*"], "projectPlan": ["Writer/Draft"]}]}
    (app_data_root / "feedback.json").write_text(json.dumps(v1), encoding="utf-8")
    roles = next(a for a in bundle(client, {"X-Admin-Id": "adm-old"})["admins"] if a["id"] == "adm-old")["roles"]
    assert roles["helper/inbox"] == ["checker"]
    assert roles["writer/draft"] == ["voter", "planner"] and roles["writer/dashboard"] == ["voter"]
    assert (app_data_root / "feedback.v1.json").exists()
