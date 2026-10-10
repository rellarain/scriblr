"""Today's activity log for Undo: settings changes (the user's and the project's) and one entry per draft editing session."""

from datetime import timedelta

from fastapi.testclient import TestClient

from app.storage import draft_sessions, project_store, settings_log
from app.storage.schema import SETTINGS_LOG_MAX, utcnow


def _theme(client: TestClient) -> dict:
    return client.get("/api/user-settings").json()["theme"]


def test_theme_and_ui_changes_are_logged_with_the_value_they_replaced(client: TestClient) -> None:
    assert client.get("/api/user-settings/activity").json() == []
    theme = _theme(client)
    changed = {**theme, "timeBasedEnabled": not theme["timeBasedEnabled"]}
    assert client.put("/api/user-settings/theme", json=changed).status_code == 200
    # The same value again is not a change.
    assert client.put("/api/user-settings/theme", json=changed).status_code == 200
    log = client.get("/api/user-settings/activity").json()
    assert len(log) == 1
    assert log[0]["kind"] == "theme" and log[0]["before"]["theme"] == theme

    assert client.put("/api/user-settings/ui", json={"handedness": "left"}).status_code == 200
    log = client.get("/api/user-settings/activity").json()
    assert [e["kind"] for e in log] == ["ui", "theme"]  # newest first
    assert log[0]["before"]["ui"]["handedness"] == "right"


def test_the_autosave_choice_is_not_logged(client: TestClient) -> None:
    client.put("/api/user-settings/ui", json={"autosaveEnabled": True, "autosaveSeconds": 300})
    assert client.get("/api/user-settings/activity").json() == []


def test_the_log_keeps_a_short_history() -> None:
    old = settings_log.new_entry("ui", "old", {})
    old.createdAt = utcnow() - timedelta(days=8)
    log = settings_log.append_pruned([old], settings_log.new_entry("ui", "new", {}))
    assert [e.label for e in log] == ["new"]  # older than the kept days: dropped
    many = []
    for i in range(SETTINGS_LOG_MAX + 5):
        many = settings_log.append_pruned(many, settings_log.new_entry("ui", str(i), {}))
    assert len(many) == SETTINGS_LOG_MAX
    assert many[-1].label == str(SETTINGS_LOG_MAX + 4)


def test_project_settings_changes_are_logged_and_listed_in_the_activity(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Log"}).json()["projectId"]
    assert client.get(f"/api/projects/{project_id}/settings-log").json() == []
    before_hue = client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["themeHue"]
    assert client.patch(f"/api/projects/{project_id}", json={"themeHue": 200}).status_code == 200
    assert client.patch(f"/api/projects/{project_id}", json={"themeHue": 200}).status_code == 200  # unchanged
    log = client.get(f"/api/projects/{project_id}/settings-log").json()
    assert len(log) == 1
    assert log[0]["kind"] == "project" and log[0]["before"]["themeHue"] == before_hue
    activity = client.get(f"/api/projects/{project_id}/activity").json()["log"]
    assert [e["type"] for e in activity if e["type"] == "settings"] == ["settings"]


def _put(client: TestClient, project_id: str, moment_id: str, body: str) -> None:
    client.put(
        f"/api/projects/{project_id}/draft/chapter/chapter_1/moment/{moment_id}",
        json={"outlineNodeId": moment_id, "body": body},
    )


def _sessions(client: TestClient, project_id: str) -> list[dict]:
    return [r for r in client.get(f"/api/projects/{project_id}/revisions/chapter_1").json() if r["trigger"] == "session"]


def test_draft_saves_in_one_session_share_one_entry_with_the_text_before_it(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Sessions"}).json()["projectId"]
    _put(client, project_id, "moment_1", "One.")
    _put(client, project_id, "moment_1", "One two.")
    _put(client, project_id, "moment_2", "Another moment.")
    sessions = _sessions(client, project_id)
    # The text before the first edit, and the session holding the latest text.
    assert len(sessions) == 2
    ordered = sorted(sessions, key=lambda s: s["createdAt"])
    before = client.get(f"/api/projects/{project_id}/revisions/chapter_1/{ordered[0]['snapshotId']}").json()
    latest = client.get(f"/api/projects/{project_id}/revisions/chapter_1/{ordered[1]['snapshotId']}").json()
    assert before["moments"] == {}
    assert latest["moments"] == {"moment_1": "One two.", "moment_2": "Another moment."}
    entries = [e for e in client.get(f"/api/projects/{project_id}/activity").json()["log"] if e["type"] == "draft"]
    assert len(entries) == 2


def test_a_pause_longer_than_the_gap_starts_a_new_session(client: TestClient, storage_root) -> None:
    project_id = client.post("/api/projects", json={"title": "Sessions"}).json()["projectId"]
    _put(client, project_id, "moment_1", "First session.")
    first = sorted(_sessions(client, project_id), key=lambda s: s["createdAt"])[-1]
    # Pretend the last save was long ago.
    snapshot = project_store.list_revisions(storage_root, project_id, "chapter_1")
    for r in snapshot:
        if r.snapshotId == first["snapshotId"]:
            r.updatedAt = utcnow() - timedelta(minutes=draft_sessions.SESSION_GAP_MINUTES + 5)
            project_store.save_revision(storage_root, project_id, r)
    _put(client, project_id, "moment_1", "Second session.")
    sessions = _sessions(client, project_id)
    assert len(sessions) == 3  # the text before, the first session, the second
