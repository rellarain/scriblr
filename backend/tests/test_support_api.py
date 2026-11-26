from pathlib import Path

from fastapi.testclient import TestClient

ARI = {"X-Admin-Id": "hlp-ari"}  # a helper
DANA = {"X-Admin-Id": "adm-dana"}  # an admin
USER = "u-1"


def start(client: TestClient, focal: str = "writer/draft/draft", text: str = "My draft will not save.") -> dict:
    resp = client.post("/api/support/chats", json={"userId": USER, "userName": "Jordan", "focal": focal, "text": text})
    assert resp.status_code == 200, resp.text
    return resp.json()["chats"][0]


def staff(client: TestClient, who=ARI) -> dict:
    client.get("/api/staff")  # the helpers join the feedback admins on first use
    resp = client.get("/api/support", headers=who)
    assert resp.status_code == 200, resp.text
    return resp.json()


def act(client: TestClient, chat_id: str, who=ARI, **body):
    return client.post(f"/api/support/chats/{chat_id}/actions", headers=who, json=body)


def test_a_user_starts_a_chat_that_waits_in_its_console_queue(client: TestClient) -> None:
    chat = start(client)
    assert (chat["queue"], chat["focal"], chat["tier"], chat["status"], chat["stage"]) == ("writer/draft", "writer/draft/draft", 1, "pending", "greeting")
    assert [e["kind"] for e in chat["events"]] == ["userMessage"]
    v = staff(client)
    assert [c["id"] for c in v["waiting"]] == [chat["id"]] and v["mine"] == []
    # A chat is by console: an interface on its own is refused, and so is an unknown place.
    assert client.post("/api/support/chats", json={"userId": USER, "focal": "writer", "text": "x"}).status_code == 400
    assert client.post("/api/support/chats", json={"userId": USER, "focal": "nowhere", "text": "x"}).status_code == 400


def test_take_talk_and_move_through_the_stages(client: TestClient) -> None:
    chat = start(client)
    staff(client)
    # Only a staff member who took the chat may write in it.
    assert client.post(f"/api/support/chats/{chat['id']}/messages", headers=ARI, json={"text": "Hi"}).status_code == 403
    client.post(f"/api/support/chats/{chat['id']}/take", headers=ARI)
    assert client.post(f"/api/support/chats/{chat['id']}/take", headers=DANA).status_code == 400
    act(client, chat["id"], action="greeting", text="Hi Jordan, I'm Ari.")
    client.post(f"/api/support/chats/{chat['id']}/messages", headers=ARI, json={"text": "What happens when you save?"})
    client.post(f"/api/support/chats/{chat['id']}/user-messages", json={"userId": USER, "text": "Nothing at all."})
    act(client, chat["id"], action="stage", stage="issue")
    v = act(client, chat["id"], action="resource", nodeId="writer/draft/draft").json()
    mine = v["mine"][0]
    assert mine["stage"] == "solution"
    assert [e["kind"] for e in mine["events"]] == ["userMessage", "taken", "greeting", "helperMessage", "userMessage", "stage", "resource"]
    # Someone else's chat cannot be written in by another user.
    assert client.post(f"/api/support/chats/{chat['id']}/user-messages", json={"userId": "u-2", "text": "x"}).status_code == 403
    # The admin view shows the chat with its stage and actions but not its messages.
    other = staff(client, DANA)["others"][0]
    assert other["id"] == chat["id"] and "events" not in other and "resource" in other["actions"]


def test_transfer_and_escalate_send_it_back_to_waiting(client: TestClient) -> None:
    chat = start(client)
    staff(client)
    client.post(f"/api/support/chats/{chat['id']}/take", headers=ARI)
    v = act(client, chat["id"], action="transfer", toQueue="reader/library").json()
    waiting = v["waiting"][0]
    assert (waiting["queue"], waiting["status"], waiting["staffId"]) == ("reader/library", "pending", "")
    assert act(client, chat["id"], action="transfer", toQueue="reader/library").status_code == 403  # not taken any more
    client.post(f"/api/support/chats/{chat['id']}/take", headers=ARI)
    assert act(client, chat["id"], action="transfer", toQueue="reader/library").status_code == 400  # the same queue
    v = act(client, chat["id"], action="escalation").json()
    assert v["waiting"][0]["tier"] == 2
    for _ in range(2):
        client.post(f"/api/support/chats/{chat['id']}/take", headers=DANA)
        act(client, chat["id"], DANA, action="escalation")
    client.post(f"/api/support/chats/{chat['id']}/take", headers=DANA)
    assert act(client, chat["id"], DANA, action="escalation").status_code == 400  # tier 4 is the top


def test_feedback_drafted_in_a_chat_waits_in_the_drafters_outbox_once_confirmed(client: TestClient) -> None:
    chat = start(client)
    staff(client)
    client.post(f"/api/support/chats/{chat['id']}/take", headers=ARI)
    assert act(client, chat["id"], action="feedbackInitiated", draft={"channelId": "writer/draft/draft", "verbId": "verb-nope", "text": "x"}).status_code == 400
    v = act(client, chat["id"], action="feedbackInitiated", draft={"channelId": "writer/draft/draft", "verbId": "verb-fix", "text": "Saving does nothing.", "tone": "unpleasant"}).json()
    ev = v["mine"][0]["events"][-1]
    assert ev["kind"] == "feedbackInitiated" and ev["draft"]["confirmed"] is False
    mine = client.post(f"/api/support/chats/{chat['id']}/drafts/{ev['id']}/confirm", json={"userId": USER, "userName": "Jordan"}).json()
    confirmed = mine["chats"][0]["events"]
    assert confirmed[-1]["kind"] == "feedbackConfirmed"
    assert next(e for e in confirmed if e["id"] == ev["id"])["draft"]["confirmed"] is True
    sent = client.get("/api/feedback/mine", params={"authorId": USER}).json()["messages"][0]
    assert (sent["text"], sent["status"]) == ("Saving does nothing.", "received")  # the user has it; nobody has checked it
    held = client.get("/api/feedback", headers=ARI).json()["outbox"]
    assert [(m["id"], m["author"], m["chatId"], m["tone"], m["checked"]) for m in held] == [(sent["id"], "Jordan", chat["id"], "unpleasant", False)]
    dana = client.get("/api/feedback", headers=DANA).json()
    assert dana["outbox"] == [] and all(m["id"] != sent["id"] for m in dana["messages"])  # in nobody's Inbox yet
    assert client.post(f"/api/support/chats/{chat['id']}/drafts/{ev['id']}/confirm", json={"userId": USER}).status_code == 400


def test_the_outbox_completes_feedback_and_sends_it_to_the_inbox(client: TestClient) -> None:
    chat = start(client)
    staff(client)
    client.post(f"/api/support/chats/{chat['id']}/take", headers=ARI)
    v = act(client, chat["id"], action="feedbackInitiated", draft={"channelId": "writer/draft/draft", "verbId": "verb-fix", "text": "Saving does nothing."}).json()
    ev = v["mine"][0]["events"][-1]
    client.post(f"/api/support/chats/{chat['id']}/drafts/{ev['id']}/confirm", json={"userId": USER, "userName": "Jordan"})
    mid = client.get("/api/feedback", headers=ARI).json()["outbox"][0]["id"]

    # Only its drafter completes it, with a subject, a verb and a tone the store knows; nobody checks it meanwhile.
    assert client.put(f"/api/feedback/outbox/{mid}", headers=DANA, json={"tone": "mixed"}).status_code == 403
    assert client.put(f"/api/feedback/outbox/{mid}", headers=ARI, json={"verbId": "verb-nope"}).status_code == 400
    assert client.put(f"/api/feedback/messages/{mid}", headers=DANA, json={"checked": True}).status_code == 409
    assert client.post(f"/api/feedback/outbox/{mid}/send", headers=ARI, json={}).status_code == 400  # no tone yet
    done = client.put(f"/api/feedback/outbox/{mid}", headers=ARI, json={"tone": "mixed", "channelId": "writer/draft"}).json()
    assert (done["outbox"][0]["tone"], done["outbox"][0]["channelId"]) == ("mixed", "writer/draft")

    out = client.post(f"/api/feedback/outbox/{mid}/send", headers=ARI, json={"comment": "Asked about it twice."}).json()
    assert out["outbox"] == []
    inbox = next(m for m in client.get("/api/feedback", headers=DANA).json()["messages"] if m["id"] == mid)
    assert (inbox["checked"], inbox["tone"], inbox["channelId"]) == (False, "mixed", "writer/draft")  # to check, as the helper set it
    assert [c["text"] for c in inbox["comments"]] == ["Asked about it twice."]
    assert client.post(f"/api/feedback/outbox/{mid}/send", headers=ARI, json={}).status_code == 403  # sent already
    checked = client.put(f"/api/feedback/messages/{mid}", headers=DANA, json={"checked": True}).json()
    assert next(m for m in checked["messages"] if m["id"] == mid)["checked"] is True


def test_closing_and_the_users_list(client: TestClient) -> None:
    one = start(client, text="First")
    two = start(client, text="Second")
    client.post(f"/api/support/chats/{one['id']}/user-close", json={"userId": USER})
    mine = client.get("/api/support/mine", params={"userId": USER}).json()["chats"]
    assert [c["id"] for c in mine] == [two["id"], one["id"]]  # open first
    assert client.post(f"/api/support/chats/{one['id']}/user-messages", json={"userId": USER, "text": "x"}).status_code == 400
    staff(client)
    client.post(f"/api/support/chats/{two['id']}/take", headers=ARI)
    v = act(client, two["id"], action="closed").json()
    assert v["mine"] == [] and v["closed"][0]["id"] == two["id"]


def test_a_console_with_an_open_chat_is_not_deleted(client: TestClient) -> None:
    start(client, focal="training/desk/courses")
    resp = client.delete("/api/resources/nodes/training/desk/courses")
    assert resp.status_code == 409 and "support chat" in resp.json()["detail"]


def test_a_corrupt_support_file_is_quarantined(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "support.json").write_text("{nope", encoding="utf-8")
    assert client.get("/api/support/mine", params={"userId": USER}).status_code == 409
