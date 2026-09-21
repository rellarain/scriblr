import json

import pytest
from fastapi.testclient import TestClient

from app.storage import feedback as fb

# Sample admins (see feedback._seed_admins):
DANA = {"X-Admin-Id": "adm-dana"}  # processor everywhere but Reader plan; configurer + planner on Writer; configurer on Helper > Inbox
LEE = {"X-Admin-Id": "adm-lee"}  # processor on Writer and Reader; configurer on Reader only
SAM = {"X-Admin-Id": "adm-sam"}  # processor and planner on Reader; processor on Helper > Inbox; no configurer

SPINES = {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf", "feature": "Book Spines"}
SEARCH = {"page": "Reader", "console": "Library", "component": "Browse", "feature": "Search"}
SHELVES = {"page": "Reader", "console": "Library", "component": "Browse", "feature": "Shelves"}
ADMIN_VOTING = {"page": "Admin", "console": "Processor", "component": "Voting", "feature": "Approve"}


def inbox(client: TestClient, who=DANA) -> dict:
    resp = client.get("/api/feedback", headers=who)
    assert resp.status_code == 200, resp.text
    return resp.json()


def case_for(bundle: dict, feature: str, verb: str) -> dict:
    return next(c for c in bundle["cases"] if c["channel"]["feature"] == feature and c["verbName"] == verb)


def message_view(bundle: dict, message_id: str) -> dict:
    return next(m for m in bundle["messages"] if m["message"]["id"] == message_id)


def validate(client: TestClient, who, message_id: str, body: dict):
    return client.put(f"/api/feedback/messages/{message_id}/validation", headers=who, json=body)


# ---- the seed, identity and anonymity ---------------------------------------------------------


def test_seeded_inbox_has_admins_roles_and_a_case_for_every_completed_selection(client: TestClient) -> None:
    b = inbox(client)
    assert [a["id"] for a in b["admins"]] == ["adm-dana", "adm-lee", "adm-sam"]
    assert b["admins"][2]["roles"]["Helper/Inbox"] == ["processor"]
    assert "Helper/Inbox" in b["consoles"] and "Admin/Manager" in b["consoles"]
    assert b["can"] == {"validate": True, "manageVerbs": True, "seeTones": True}
    # No quorum: a message with a single completed validation already has its case.
    assert sorted((c["verbName"], c["channel"]["feature"]) for c in b["cases"]) == [
        ("Fix", "Autosave"), ("Improve", "Search"), ("Increase", "Book Spines"), ("Keep", "Progress Tracker")]
    assert len(case_for(b, "Book Spines", "Increase")["messages"]) == 3
    assert case_for(b, "Progress Tracker", "Keep")["validators"] == 1
    assert case_for(b, "Book Spines", "Increase")["validators"] == 3
    assert message_view(b, "fb-5")["joined"] is False and message_view(b, "fb-4")["joined"] is True


def test_unknown_admin_is_refused(client: TestClient) -> None:
    assert client.get("/api/feedback", headers={"X-Admin-Id": "nobody"}).status_code == 403


def test_the_inbox_names_nobody(client: TestClient) -> None:
    b = inbox(client, SAM)
    body = json.dumps({"messages": b["messages"], "cases": b["cases"]})
    for author in ("j.rivera", "a.kim", "m.okafor"):
        assert author not in body
    assert "author" not in body and "adminId" not in body and "proposedBy" not in body
    for other in ("adm-dana", "adm-lee", "Dana", "Lee"):
        assert other not in body
    # your own things are marked as yours
    v = message_view(b, "fb-4")["validations"][0]
    assert v["mine"] is True
    assert any(vote["mine"] is False for vote in case_for(b, "Book Spines", "Increase")["votes"])


# ---- tone -----------------------------------------------------------------------------------------


@pytest.mark.parametrize("labels,expected", [
    (["pleasant"], "pleasant"),
    (["unpleasant"], "unpleasant"),
    (["mixed"], "mixed"),
    (["neutral"], "neutral"),
    (["pleasant", "pleasant", "pleasant"], "pleasant"),
    (["pleasant", "pleasant", "neutral"], "mixedPleasant"),       # 67% pleasant votes, under 75%
    (["pleasant", "pleasant", "pleasant", "neutral"], "pleasant"),  # 75%
    (["unpleasant", "unpleasant", "neutral"], "mixedUnpleasant"),
    (["unpleasant", "unpleasant", "unpleasant", "neutral"], "unpleasant"),
    (["pleasant", "mixed", "mixed"], "mixed"),                    # pleasant votes 100%, unpleasant votes 67%
    (["pleasant", "unpleasant", "neutral"], "mixed"),             # fits none of the others
    (["pleasant", "neutral"], "neutral"),                         # half neutral wins
    (["mixed", "neutral", "neutral"], "neutral"),
    (["mixed", "mixed", "mixed"], "mixed"),
    (["pleasant", "pleasant", "unpleasant"], "mixedPleasant"),    # 67% pleasant, 33% unpleasant
])
def test_tone_categories(labels: list[str], expected: str) -> None:
    assert fb.tone_category(labels) == expected


def test_tone_summary_counts_a_mixed_label_on_both_sides_and_ignores_no_one() -> None:
    assert fb.tone_category([]) is None
    s = fb.tone_summary(["pleasant", "mixed", "neutral"])
    assert (s["pleasant"], s["unpleasant"], s["neutral"], s["n"], s["category"]) == (2, 1, 1, 3, "mixedPleasant")


def test_the_sender_is_shown_but_not_counted(client: TestClient) -> None:
    b = inbox(client)
    fb2 = message_view(b, "fb-2")
    assert fb2["message"]["senderTone"] == "unpleasant"
    assert fb2["tone"]["n"] == 3  # the three validators only
    assert fb2["tone"]["category"] == "mixed"  # mixed, mixed, unpleasant: pleasant votes 67%, unpleasant votes 100%


def test_keywords_flag_possible_verbs_from_a_word_start() -> None:
    cats = [fb.VerbCategory(id="v1", name="Fix", keywords=["freezes", "bug"]), fb.VerbCategory(id="v2", name="Increase", keywords=["increase"])]
    flags = fb.flags_for("It freezes and I would increase the size. Bugs everywhere", cats)
    assert [(f["categoryId"], f["keyword"]) for f in flags] == [("v1", "freezes"), ("v2", "increase"), ("v1", "bug")]
    assert flags[2]["end"] - flags[2]["start"] == len("Bugs")


# ---- validation: two stages, no quorum, every selection kept -----------------------------------


def test_one_completed_validation_puts_a_message_in_its_case(client: TestClient) -> None:
    assert not any(c["channel"]["feature"] == "Approve" for c in inbox(client)["cases"])
    resp = validate(client, SAM, "fb-5", {"tone": "neutral", "channels": [ADMIN_VOTING],
                                          "statements": [{"channel": ADMIN_VOTING, "verbId": "verb-simplify"}]})
    assert resp.status_code == 200, resp.text
    b = resp.json()
    assert case_for(b, "Approve", "Simplify")["messages"][0]["messageId"] == "fb-5"
    assert message_view(b, "fb-5")["validationCount"] == 1
    assert [e["kind"] for e in message_view(b, "fb-5")["history"]] == ["validated"]


def test_every_selection_of_every_validator_is_kept_most_common_first(client: TestClient) -> None:
    # fb-3: Dana and Lee chose Search/Improve; Sam adds Shelves/Fix, which only he chose.
    validate(client, SAM, "fb-3", {"tone": "unpleasant", "channels": [SEARCH, SHELVES], "statements": [
        {"channel": SEARCH, "verbId": "verb-improve"}, {"channel": SEARCH, "verbId": "verb-fix"}, {"channel": SHELVES, "verbId": "verb-fix"}]})
    b = inbox(client)
    assert {(c["channel"]["feature"], c["verbName"]) for c in b["cases"] if c["channel"]["console"] == "Library"} == {
        ("Search", "Improve"), ("Search", "Fix"), ("Shelves", "Fix")}
    sel = message_view(b, "fb-3")["selections"]
    assert [s["channel"]["feature"] for s in sel] == ["Search", "Shelves"]   # 3 validators chose Search, 1 chose Shelves
    assert sel[0]["chosenBy"] == 3 and [(v["verbId"], v["chosenBy"]) for v in sel[0]["verbs"]] == [("verb-improve", 3), ("verb-fix", 1)]


def test_the_stages_run_in_order(client: TestClient) -> None:
    assert validate(client, SAM, "fb-5", {"channels": [SEARCH]}).status_code == 400          # no tone yet
    assert validate(client, SAM, "fb-5", {"tone": "neutral", "channels": [SEARCH]}).status_code == 200
    # a verb needs its subject first, and must exist; a subject needs all four levels
    assert validate(client, SAM, "fb-5", {"statements": [{"channel": SHELVES, "verbId": "verb-fix"}]}).status_code == 400
    assert validate(client, SAM, "fb-5", {"statements": [{"channel": SEARCH, "verbId": "nope"}]}).status_code == 400
    assert validate(client, SAM, "fb-5", {"channels": [{**SEARCH, "feature": ""}]}).status_code == 400
    assert validate(client, SAM, "fb-5", {"channels": [{"page": "Writer", "console": "Nope", "component": "X", "feature": "Y"}]}).status_code == 400
    assert validate(client, SAM, "nope", {"tone": "neutral"}).status_code == 404


def test_removing_a_subject_drops_its_verbs_and_a_later_tone_change_keeps_the_rest(client: TestClient) -> None:
    validate(client, SAM, "fb-5", {"tone": "neutral", "channels": [SEARCH], "statements": [{"channel": SEARCH, "verbId": "verb-fix"}]})
    b = validate(client, SAM, "fb-5", {"tone": "pleasant"}).json()
    mine = message_view(b, "fb-5")["validations"][0]
    assert mine["tone"] == "pleasant" and len(mine["channels"]) == 1 and mine["complete"] is True
    b = validate(client, SAM, "fb-5", {"channels": []}).json()
    mine = message_view(b, "fb-5")["validations"][0]
    assert mine["channels"] == [] and mine["statements"] == [] and mine["complete"] is False


def test_validating_needs_the_processor_role_on_the_inbox(client: TestClient) -> None:
    client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"console": "Helper/Inbox", "roles": []})
    resp = validate(client, SAM, "fb-5", {"tone": "neutral"})
    assert resp.status_code == 403 and "Processor role on Helper > Inbox" in resp.json()["detail"]


def test_other_validators_tone_labels_are_for_configurers_only(client: TestClient) -> None:
    def labels(who):
        return [(v["mine"], v["tone"]) for v in message_view(inbox(client, who), "fb-1")["validations"]]
    assert labels(SAM) == [(True, "neutral"), (False, None), (False, None)]      # your own only
    assert sorted(labels(DANA), key=str) == sorted([(True, "unpleasant"), (False, "unpleasant"), (False, "neutral")], key=str)
    assert inbox(client, SAM)["can"]["seeTones"] is False
    # everyone still sees who chose which subjects and verbs, and the resulting category
    assert message_view(inbox(client, SAM), "fb-1")["tone"]["category"] == "mixedUnpleasant"


# ---- votes: check, x and pass ----------------------------------------------------------------------


def test_votes_hold_any_combination_with_notes_and_can_be_withdrawn(client: TestClient) -> None:
    cid = case_for(inbox(client), "Autosave", "Fix")["id"]
    body = {"approve": True, "deny": True, "passed": True, "approveNote": "  Real freeze  ", "denyNote": "Only on huge pastes", "passNote": "Unsure"}
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json=body).json()
    vote = case_for(b, "Autosave", "Fix")["votes"][0]
    assert (vote["mine"], vote["approve"], vote["deny"], vote["passed"]) == (True, True, True, True)
    assert (vote["approveNote"], vote["denyNote"], vote["passNote"]) == ("Real freeze", "Only on huge pastes", "Unsure")
    # a note is kept only while its side is on
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={**body, "deny": False, "passed": False}).json()
    vote = case_for(b, "Autosave", "Fix")["votes"][0]
    assert (vote["denyNote"], vote["passNote"], vote["approveNote"]) == ("", "", "Real freeze")
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={}).json()
    case = case_for(b, "Autosave", "Fix")
    assert case["votes"] == []
    assert [h["detail"] for h in case["history"]] == ["approved and denied and passed", "approved", "withdrew"]
    client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True})
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True, "approveNote": "Added later"}).json()
    assert len(case_for(b, "Autosave", "Fix")["history"]) == 4  # a note is not a new vote


def test_vote_notes_are_length_limited(client: TestClient) -> None:
    cid = case_for(inbox(client), "Autosave", "Fix")["id"]
    for field in ("approveNote", "denyNote", "passNote"):
        assert client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={field: "x" * 501}).status_code == 422


def test_voting_needs_the_processor_role_on_the_cases_console(client: TestClient) -> None:
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]  # a Writer case
    resp = client.put(f"/api/feedback/cases/{cid}/vote", headers=SAM, json={"approve": True})
    assert resp.status_code == 403 and "Processor role on Writer > Shelf" in resp.json()["detail"]
    assert client.put(f"/api/feedback/cases/{cid}/vote", headers=LEE, json={"passed": True}).status_code == 200
    assert case_for(inbox(client, SAM), "Book Spines", "Increase")["can"]["vote"] is False


def test_solutions_need_the_configurer_role_and_anyone_with_the_processor_role_can_vote(client: TestClient) -> None:
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]
    sol = {"title": "Label the spines", "description": "Show titles.", "target": {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf"}}
    assert client.post(f"/api/feedback/cases/{cid}/solutions", headers=LEE, json=sol).status_code == 403  # Lee configures Reader only
    assert client.post(f"/api/feedback/cases/{cid}/solutions", headers=DANA, json={**sol, "title": "  "}).status_code == 400
    b = client.post(f"/api/feedback/cases/{cid}/solutions", headers=DANA, json=sol).json()
    mine = next(s for s in case_for(b, "Book Spines", "Increase")["solutions"] if s["title"] == "Label the spines")
    assert mine["mine"] is True
    client.put(f"/api/feedback/cases/{cid}/solutions/{mine['id']}/vote", headers=DANA, json={"approve": True})
    b = client.put(f"/api/feedback/cases/{cid}/solutions/{mine['id']}/vote", headers=LEE, json={"deny": True, "denyNote": "Too wide"}).json()
    sol_now = next(s for s in case_for(b, "Book Spines", "Increase")["solutions"] if s["id"] == mine["id"])
    assert sorted((v["mine"], v["approve"], v["deny"]) for v in sol_now["votes"]) == [(False, True, False), (True, False, True)]
    assert client.put(f"/api/feedback/cases/{cid}/solutions/nope/vote", headers=DANA, json={"approve": True}).status_code == 404


# ---- closing and reopening ---------------------------------------------------------------------


def test_only_the_planner_role_closes_and_the_configurer_role_reopens(client: TestClient) -> None:
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]
    assert client.post(f"/api/feedback/cases/{cid}/close", headers=LEE, json={"outcome": "approved"}).status_code == 403
    assert client.post(f"/api/feedback/cases/{cid}/close", headers=SAM, json={"outcome": "approved"}).status_code == 403
    b = client.post(f"/api/feedback/cases/{cid}/close", headers=DANA, json={"outcome": "approved", "note": "  Ship it "}).json()
    case = case_for(b, "Book Spines", "Increase")
    assert (case["status"], case["closeNote"]) == ("approved", "Ship it") and case["closedAt"]
    assert client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True}).status_code == 409
    assert client.post(f"/api/feedback/cases/{cid}/close", headers=DANA, json={"outcome": "rejected"}).status_code == 409
    assert client.post(f"/api/feedback/cases/{cid}/reopen", headers=LEE, json={}).status_code == 403
    b = client.post(f"/api/feedback/cases/{cid}/reopen", headers=DANA).json()
    case = case_for(b, "Book Spines", "Increase")
    assert case["status"] == "open" and [h["kind"] for h in case["history"]][-2:] == ["closed", "reopened"]
    assert client.post(f"/api/feedback/cases/{cid}/reopen", headers=DANA).status_code == 409


def test_a_planner_alone_can_close_on_a_console_where_they_hold_no_other_role(client: TestClient) -> None:
    cid = case_for(inbox(client), "Search", "Improve")["id"]  # Reader case: Sam is planner and processor there, not configurer
    assert case_for(inbox(client, SAM), "Search", "Improve")["can"] == {"vote": True, "propose": False, "close": True, "reopen": False}
    assert client.post(f"/api/feedback/cases/{cid}/close", headers=SAM, json={"outcome": "rejected"}).status_code == 200


def test_the_can_flags_follow_the_roles_of_the_signed_in_admin(client: TestClient) -> None:
    assert case_for(inbox(client, DANA), "Book Spines", "Increase")["can"] == {"vote": True, "propose": True, "close": True, "reopen": True}
    assert case_for(inbox(client, LEE), "Book Spines", "Increase")["can"] == {"vote": True, "propose": False, "close": False, "reopen": False}
    assert case_for(inbox(client, SAM), "Book Spines", "Increase")["can"] == {"vote": False, "propose": False, "close": False, "reopen": False}


# ---- verb categories -------------------------------------------------------------------------------


def test_verb_categories_are_managed_with_the_configurer_role_on_the_inbox(client: TestClient) -> None:
    assert client.post("/api/feedback/verb-categories", headers=LEE, json={"name": "Rename"}).status_code == 403
    b = client.post("/api/feedback/verb-categories", headers=DANA, json={"name": " Rename  it ", "keywords": ["Rename", " rename ", "", "call it"]}).json()
    verb = next(v for v in b["verbCategories"] if v["name"] == "Rename it")
    assert verb["keywords"] == ["rename", "call it"]
    assert client.post("/api/feedback/verb-categories", headers=DANA, json={"name": "rename IT"}).status_code == 409
    b = client.patch(f"/api/feedback/verb-categories/{verb['id']}", headers=DANA, json={"keywords": ["retitle", "retitle"]}).json()
    assert next(v for v in b["verbCategories"] if v["id"] == verb["id"])["keywords"] == ["retitle"]
    assert client.patch(f"/api/feedback/verb-categories/{verb['id']}", headers=DANA, json={"name": "Fix"}).status_code == 409
    assert client.delete(f"/api/feedback/verb-categories/{verb['id']}", headers=DANA).status_code == 200


def test_a_verb_category_with_open_cases_cannot_be_deleted_until_they_close(client: TestClient) -> None:
    resp = client.delete("/api/feedback/verb-categories/verb-increase", headers=DANA)
    assert resp.status_code == 409 and "open cases" in resp.json()["detail"]
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]
    client.post(f"/api/feedback/cases/{cid}/close", headers=DANA, json={"outcome": "rejected"})
    b = client.delete("/api/feedback/verb-categories/verb-increase", headers=DANA).json()
    assert all(v["id"] != "verb-increase" for v in b["verbCategories"])
    assert not any(c["verbName"] == "Increase" for c in b["cases"])


# ---- roles (Admin > Manager > Assignment) ----------------------------------------------------------


def test_roles_are_assigned_per_console_and_the_change_is_recorded(client: TestClient) -> None:
    assert not inbox(client, SAM)["can"]["manageVerbs"]
    b = client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"console": "Helper/Inbox", "roles": ["configurer", "processor"]}).json()
    assert next(a for a in b["admins"] if a["id"] == "adm-sam")["roles"]["Helper/Inbox"] == ["processor", "configurer"]
    assert inbox(client, SAM)["can"] == {"validate": True, "manageVerbs": True, "seeTones": True}
    assert b["roleHistory"][-1]["detail"] == "Sam Ortiz: Helper > Inbox set to processor, configurer"
    assert b["roleHistory"][-1]["mine"] is True
    # no change, no history line
    n = len(b["roleHistory"])
    b = client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"console": "Helper/Inbox", "roles": ["processor", "configurer"]}).json()
    assert len(b["roleHistory"]) == n
    # removing every role removes the console entry
    b = client.put("/api/feedback/admins/adm-sam/roles", headers=DANA, json={"console": "Reader/Nook", "roles": []}).json()
    assert "Reader/Nook" not in next(a for a in b["admins"] if a["id"] == "adm-sam")["roles"]


def test_role_input_is_checked_and_nobody_removes_their_own_inbox_configurer_role(client: TestClient) -> None:
    put = lambda who, target, body: client.put(f"/api/feedback/admins/{target}/roles", headers=who, json=body)  # noqa: E731
    assert put(DANA, "adm-sam", {"console": "Nope/Nope", "roles": ["processor"]}).status_code == 400
    assert put(DANA, "adm-sam", {"console": "Helper/Inbox", "roles": ["boss"]}).status_code == 400
    assert put(DANA, "nobody", {"console": "Helper/Inbox", "roles": []}).status_code == 403
    resp = put(DANA, "adm-dana", {"console": "Helper/Inbox", "roles": ["processor"]})
    assert resp.status_code == 403 and "own Configurer role" in resp.json()["detail"]
    assert put(DANA, "adm-dana", {"console": "Helper/Inbox", "roles": ["processor", "configurer", "planner"]}).status_code == 200
    assert put(DANA, "adm-dana", {"console": "Writer/Shelf", "roles": []}).status_code == 200  # other consoles are free


# ---- storage and migration ----------------------------------------------------------------------------


def test_feedback_is_stored_in_one_app_level_file(client: TestClient, app_data_root) -> None:
    inbox(client)
    assert (app_data_root / "feedback.json").exists()
    cid = case_for(inbox(client), "Autosave", "Fix")["id"]
    client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True})
    assert case_for(inbox(client), "Autosave", "Fix")["votes"][0]["mine"] is True  # a fresh read still has the vote


def test_a_version_1_file_is_migrated_to_roles_and_keeps_its_votes(client: TestClient, app_data_root) -> None:
    space = {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf", "feature": "Book Spines"}
    v1 = {
        "schemaVersion": 1,
        "admins": [{"id": "adm-old", "name": "Old Admin", "processing": ["Helper/Inbox", "Writer/*"], "configuration": ["Reader/Library"], "projectPlan": ["Writer/Shelf"]}],
        "verbCategories": [{"id": "verb-fix", "name": "Fix", "keywords": []}],
        "messages": [{"id": "m1", "text": "It is broken", "author": "someone", "submittedAt": "2026-08-01", "senderTone": "unpleasant"}],
        "validations": {"m1": [{"adminId": "adm-old", "tone": "unpleasant", "channels": [space], "statements": [{"channel": space, "verbId": "verb-fix"}]}]},
        "cases": {},
    }
    (app_data_root / "feedback.json").write_text(json.dumps(v1), encoding="utf-8")
    b = inbox(client, {"X-Admin-Id": "adm-old"})
    roles = b["admins"][0]["roles"]
    assert roles["Helper/Inbox"] == ["processor"]
    assert roles["Writer/Shelf"] == ["processor", "planner"] and roles["Writer/Page"] == ["processor"]   # Writer/* expanded
    assert roles["Reader/Library"] == ["configurer"]
    assert len(b["cases"]) == 1 and b["cases"][0]["messages"][0]["messageId"] == "m1"  # no quorum: one validator is enough
    stored = json.loads((app_data_root / "feedback.json").read_text(encoding="utf-8"))
    assert stored["schemaVersion"] == 2 and "processing" not in stored["admins"][0]
