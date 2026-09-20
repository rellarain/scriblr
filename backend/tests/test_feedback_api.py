from fastapi.testclient import TestClient

from app.storage import feedback as fb

DANA = {"X-Admin-Id": "adm-dana"}  # processing everywhere but Reader consoles' plan, configures and plans Writer
LEE = {"X-Admin-Id": "adm-lee"}  # configures Reader only, no project plan access
SAM = {"X-Admin-Id": "adm-sam"}  # processes Reader only, plans Reader, configures nothing

SPINES = {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf", "feature": "Book Spines"}
SEARCH = {"page": "Reader", "console": "Library", "component": "Browse", "feature": "Search"}


def inbox(client: TestClient, who=DANA) -> dict:
    resp = client.get("/api/feedback", headers=who)
    assert resp.status_code == 200, resp.text
    return resp.json()


def case_for(bundle: dict, feature: str, verb: str) -> dict:
    return next(c for c in bundle["cases"] if c["channel"]["feature"] == feature and c["verbName"] == verb)


def test_seeded_inbox_has_admins_quorum_and_derived_cases(client: TestClient) -> None:
    b = inbox(client)
    assert [a["id"] for a in b["admins"]] == ["adm-dana", "adm-lee", "adm-sam"]
    assert b["requiredValidations"] == 3  # three admins exist
    assert b["can"] == {"validate": True, "manageVerbs": True}
    # Only messages validated by all three admins form cases.
    assert sorted((c["verbName"], c["channel"]["feature"]) for c in b["cases"]) == [("Fix", "Autosave"), ("Increase", "Book Spines")]
    assert len(case_for(b, "Book Spines", "Increase")["messages"]) == 3
    by_id = {m["message"]["id"]: m for m in b["messages"]}
    assert by_id["fb-3"]["reconciled"]["complete"] == 2 and not by_id["fb-3"]["reconciled"]["atQuorum"]
    assert by_id["fb-5"]["reconciled"]["complete"] == 0


def test_unknown_admin_is_refused(client: TestClient) -> None:
    assert client.get("/api/feedback", headers={"X-Admin-Id": "nobody"}).status_code == 403


def test_tone_bands_and_the_score_over_every_response() -> None:
    assert fb.tone_band(0, 0) == "neutral"
    assert fb.tone_band(3, 3) == "mostlyPleasant"
    assert fb.tone_band(1, 3) == "slightlyPleasant"  # 2 approve and 1 deny is 1/3
    assert fb.tone_band(0, 4) == "neutral"
    assert fb.tone_band(-1, 3) == "slightlyUnpleasant"
    assert fb.tone_band(-2, 4) == "mostlyUnpleasant"
    message = fb.Message(id="m", text="x", author="a", submittedAt="d", senderTone="pleasant")
    vals = [fb.Validation(adminId="a", tone="pleasant"), fb.Validation(adminId="b", tone="unpleasant"), fb.Validation(adminId="c", tone="mixed")]
    # the sender counts too: +1 +1 -1 +0 over 4 responses
    assert fb.tone_summary(message, vals) == {"net": 1, "count": 4, "band": "slightlyPleasant"}


def test_keywords_flag_possible_verbs_from_a_word_start() -> None:
    cats = [fb.VerbCategory(id="v1", name="Fix", keywords=["freezes", "bug"]), fb.VerbCategory(id="v2", name="Increase", keywords=["increase"])]
    flags = fb.flags_for("It freezes and I would increase the size. Bugs everywhere", cats)
    assert [(f["categoryId"], f["keyword"]) for f in flags] == [("v1", "freezes"), ("v2", "increase"), ("v1", "bug")]
    assert flags[2]["end"] - flags[2]["start"] == len("Bugs")  # matched from the word start


def test_a_message_joins_cases_only_at_quorum(client: TestClient) -> None:
    # fb-3 has two complete validations; the third admin completes it.
    assert not any(c["channel"]["feature"] == "Search" for c in inbox(client)["cases"])
    resp = client.put(
        "/api/feedback/messages/fb-3/validation", headers=SAM,
        json={"tone": "unpleasant", "channels": [SEARCH], "statements": [{"channel": SEARCH, "verbId": "verb-improve"}]},
    )
    assert resp.status_code == 200, resp.text
    b = resp.json()
    assert case_for(b, "Search", "Improve")["messages"][0]["messageId"] == "fb-3"
    assert next(m for m in b["messages"] if m["message"]["id"] == "fb-3")["reconciled"]["atQuorum"]


def test_a_channel_is_kept_when_at_least_half_the_validators_chose_it(client: TestClient) -> None:
    other = {"page": "Reader", "console": "Library", "component": "Browse", "feature": "Shelves"}
    client.put("/api/feedback/messages/fb-3/validation", headers=SAM, json={
        "tone": "neutral", "channels": [SEARCH, other],
        "statements": [{"channel": SEARCH, "verbId": "verb-improve"}, {"channel": other, "verbId": "verb-fix"}]})
    rec = next(m for m in inbox(client)["messages"] if m["message"]["id"] == "fb-3")["reconciled"]
    kept = {s["channel"]["feature"] + ":" + s["verbId"] for s in rec["statements"]}
    assert kept == {"Search:verb-improve"}  # the extra one was chosen by 1 of 3 only


def test_validation_input_is_checked(client: TestClient) -> None:
    bad_channel = {"page": "Writer", "console": "Nope", "component": "X", "feature": "Y"}
    assert client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={"channels": [bad_channel]}).status_code == 400
    assert client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={"channels": [{**SEARCH, "feature": ""}]}).status_code == 400
    # a verb needs its channel added first, and must exist
    assert client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={"statements": [{"channel": SEARCH, "verbId": "verb-fix"}]}).status_code == 400
    client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={"channels": [SEARCH]})
    assert client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={"statements": [{"channel": SEARCH, "verbId": "nope"}]}).status_code == 400
    assert client.put("/api/feedback/messages/none/validation", headers=SAM, json={"tone": "neutral"}).status_code == 404


def test_removing_a_channel_drops_its_verbs(client: TestClient) -> None:
    client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={
        "tone": "neutral", "channels": [SEARCH], "statements": [{"channel": SEARCH, "verbId": "verb-fix"}]})
    b = client.put("/api/feedback/messages/fb-5/validation", headers=SAM, json={"channels": []}).json()
    mine = next(v for v in next(m for m in b["messages"] if m["message"]["id"] == "fb-5")["validations"] if v["adminId"] == "adm-sam")
    assert mine["channels"] == [] and mine["statements"] == [] and mine["complete"] is False


def test_votes_hold_both_sides_with_notes_and_can_be_withdrawn(client: TestClient) -> None:
    cid = case_for(inbox(client), "Autosave", "Fix")["id"]
    body = {"approve": True, "deny": True, "approveNote": "  Real freeze  ", "denyNote": "Only on huge pastes"}
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json=body).json()
    vote = case_for(b, "Autosave", "Fix")["votes"][0]
    assert (vote["adminId"], vote["approve"], vote["deny"], vote["approveNote"], vote["denyNote"]) == ("adm-dana", True, True, "Real freeze", "Only on huge pastes")
    # a note is kept only while its side is on
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={**body, "deny": False}).json()
    vote = case_for(b, "Autosave", "Fix")["votes"][0]
    assert vote["denyNote"] == "" and vote["approveNote"] == "Real freeze"
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={}).json()
    case = case_for(b, "Autosave", "Fix")
    assert case["votes"] == []
    # editing a note is not a new vote, so it is not in the history
    assert [h["detail"] for h in case["history"]] == ["approved and denied", "approved", "withdrew"]
    client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True})
    b = client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True, "approveNote": "Added later"}).json()
    assert case_for(b, "Autosave", "Fix")["history"][-1]["detail"] == "approved"
    assert len(case_for(b, "Autosave", "Fix")["history"]) == 4


def test_vote_notes_are_length_limited(client: TestClient) -> None:
    cid = case_for(inbox(client), "Autosave", "Fix")["id"]
    assert client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True, "approveNote": "x" * 501}).status_code == 422


def test_voting_needs_processing_access_to_the_cases_console(client: TestClient) -> None:
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]  # a Writer case
    resp = client.put(f"/api/feedback/cases/{cid}/vote", headers=SAM, json={"approve": True})
    assert resp.status_code == 403 and "Writer > Shelf" in resp.json()["detail"]
    assert client.put(f"/api/feedback/cases/{cid}/vote", headers=LEE, json={"deny": True}).status_code == 200
    assert case_for(inbox(client, SAM), "Book Spines", "Increase")["can"]["vote"] is False


def test_solutions_need_configuration_access_and_anyone_with_access_can_vote(client: TestClient) -> None:
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]
    sol = {"title": "Label the spines", "description": "Show titles.", "target": {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf"}}
    assert client.post(f"/api/feedback/cases/{cid}/solutions", headers=LEE, json=sol).status_code == 403  # Lee configures Reader only
    assert client.post(f"/api/feedback/cases/{cid}/solutions", headers={**DANA}, json={**sol, "title": "  "}).status_code == 400
    b = client.post(f"/api/feedback/cases/{cid}/solutions", headers=DANA, json=sol).json()
    mine = next(s for s in case_for(b, "Book Spines", "Increase")["solutions"] if s["title"] == "Label the spines")
    # Dana votes on her own solution; Lee (processing on Writer) votes against it
    client.put(f"/api/feedback/cases/{cid}/solutions/{mine['id']}/vote", headers=DANA, json={"approve": True})
    b = client.put(f"/api/feedback/cases/{cid}/solutions/{mine['id']}/vote", headers=LEE, json={"deny": True, "denyNote": "Too wide"}).json()
    sol_now = next(s for s in case_for(b, "Book Spines", "Increase")["solutions"] if s["id"] == mine["id"])
    assert sorted((v["adminId"], v["approve"], v["deny"]) for v in sol_now["votes"]) == [("adm-dana", True, False), ("adm-lee", False, True)]
    assert client.put(f"/api/feedback/cases/{cid}/solutions/nope/vote", headers=DANA, json={"approve": True}).status_code == 404


def test_closing_needs_configuration_and_project_plan_access_and_makes_the_case_read_only(client: TestClient) -> None:
    cid = case_for(inbox(client), "Book Spines", "Increase")["id"]
    assert client.post(f"/api/feedback/cases/{cid}/close", headers=LEE, json={"outcome": "approved"}).status_code == 403
    b = client.post(f"/api/feedback/cases/{cid}/close", headers=DANA, json={"outcome": "approved", "note": "  Ship it "}).json()
    case = case_for(b, "Book Spines", "Increase")
    assert (case["status"], case["closedBy"], case["closeNote"]) == ("approved", "adm-dana", "Ship it") and case["closedAt"]
    assert client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True}).status_code == 409
    assert client.post(f"/api/feedback/cases/{cid}/solutions", headers=DANA,
                       json={"title": "x", "target": {"page": "Writer", "console": "Shelf", "component": "Sidebar Shelf"}}).status_code == 409
    assert client.post(f"/api/feedback/cases/{cid}/close", headers=DANA, json={"outcome": "rejected"}).status_code == 409
    # reopening needs configuration access to the console
    assert client.post(f"/api/feedback/cases/{cid}/reopen", headers=LEE).status_code == 403
    b = client.post(f"/api/feedback/cases/{cid}/reopen", headers=DANA).json()
    case = case_for(b, "Book Spines", "Increase")
    assert case["status"] == "open" and case["closedBy"] is None
    assert [h["kind"] for h in case["history"]][-2:] == ["closed", "reopened"]
    assert client.post(f"/api/feedback/cases/{cid}/reopen", headers=DANA).status_code == 409


def test_the_can_flags_follow_the_signed_in_admin(client: TestClient) -> None:
    assert case_for(inbox(client, DANA), "Book Spines", "Increase")["can"] == {"vote": True, "propose": True, "close": True, "reopen": True}
    assert case_for(inbox(client, LEE), "Book Spines", "Increase")["can"] == {"vote": True, "propose": False, "close": False, "reopen": False}
    assert case_for(inbox(client, SAM), "Book Spines", "Increase")["can"] == {"vote": False, "propose": False, "close": False, "reopen": False}


def test_verb_categories_are_managed_with_configuration_access_to_the_inbox(client: TestClient) -> None:
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
    # its statements are gone from the validations too
    assert not any(c["verbName"] == "Increase" for c in b["cases"])


def test_feedback_is_stored_in_one_app_level_file(client: TestClient, app_data_root) -> None:
    inbox(client)
    assert (app_data_root / "feedback.json").exists()
    cid = case_for(inbox(client), "Autosave", "Fix")["id"]
    client.put(f"/api/feedback/cases/{cid}/vote", headers=DANA, json={"approve": True})
    # a fresh read (a restart) still has the vote
    assert case_for(inbox(client), "Autosave", "Fix")["votes"][0]["adminId"] == "adm-dana"
