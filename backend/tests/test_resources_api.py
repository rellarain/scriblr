from pathlib import Path

from fastapi.testclient import TestClient


def _tree(client: TestClient) -> dict:
    return client.get("/api/resources").json()


def _find(nodes: list[dict], kind: str, name: str) -> dict:
    for n in nodes:
        if n["kind"] == kind and n["name"] == name:
            return n
    raise AssertionError(f"no {kind} node named {name!r} among {[ (n['kind'], n['name']) for n in nodes ]}")


def _add(client: TestClient, parent_id: str | None, kind: str, name: str) -> dict:
    resp = client.post("/api/resources/nodes", json={"parentId": parent_id, "kind": kind, "name": name})
    assert resp.status_code == 200, resp.text
    return _find(resp.json()["nodes"], kind, name)


def _plotlines(client: TestClient) -> dict:
    """A feature (admins add the features): Writer > Project > Plot > Plotlines."""
    return _add(client, "writer/project/plot", "feature", "Plotlines")


def test_get_seeds_the_tree_from_the_app_screens(client: TestClient) -> None:
    body = _tree(client)
    assert body["schemaVersion"] == 2
    assert body["content"] == {}
    assert body["assessments"] == {}
    kinds = {n["kind"] for n in body["nodes"]}
    assert kinds == {"interface", "console", "component"}  # features are the admins' own
    by_id = {n["id"]: n for n in body["nodes"]}
    assert by_id["writer"]["name"] == "Writer"
    assert by_id["writer/draft"]["parentId"] == "writer"
    assert by_id["writer/draft/draft"]["kind"] == "component"
    office = sorted((n for n in body["nodes"] if n["parentId"] == "admin/office"), key=lambda n: n["order"])
    assert [n["name"] for n in office] == ["Site", "Department", "Team", "Channel", "Desk", "Admin/Helper", "User"]
    assert by_id["admin/office/admin-helper"]["kind"] == "component"
    interfaces = sorted((n for n in body["nodes"] if n["parentId"] is None), key=lambda n: n["order"])
    assert [n["name"] for n in interfaces] == ["Writer", "Reader", "Training", "User", "Helper", "Admin"]
    assert client.get("/api/resources").json() == body  # stable across reloads


def test_the_channel_route_gives_the_tree_alone(client: TestClient) -> None:
    body = client.get("/api/channels").json()
    assert set(body) == {"nodes"}
    assert {n["id"] for n in body["nodes"]} == {n["id"] for n in _tree(client)["nodes"]}


def test_a_node_goes_only_under_the_kind_one_level_up(client: TestClient) -> None:
    assert client.post("/api/resources/nodes", json={"parentId": None, "kind": "feature", "name": "X"}).status_code == 400
    assert client.post("/api/resources/nodes", json={"parentId": "writer", "kind": "component", "name": "X"}).status_code == 400
    assert client.post("/api/resources/nodes", json={"parentId": "writer/draft/draft", "kind": "console", "name": "X"}).status_code == 400
    assert _add(client, "writer/draft/draft", "feature", "Autosave")["parentId"] == "writer/draft/draft"


def test_screens_of_a_newer_version_are_merged_in_once(client: TestClient, app_data_root: Path) -> None:
    """A tree written before the app's screens were merged keeps its own nodes and names, gains the missing
    screens after its own siblings, and a screen branch whose parent an admin deleted is not brought back."""
    import json

    old = {
        "schemaVersion": 1,
        "nodes": [
            {"id": "writer", "kind": "interface", "parentId": None, "order": 0, "name": "Writing"},
            {"id": "writer/shelf", "kind": "console", "parentId": "writer", "order": 0, "name": "Shelf"},
            {"id": "writer/shelf/plot", "kind": "component", "parentId": "writer/shelf", "order": 0, "name": "Plot"},
        ],
        "content": {"writer/shelf/plot": {"guide": "kept", "tutorials": [], "faq": []}},
        "assessments": {},
    }
    (app_data_root / "resources.json").write_text(json.dumps(old), encoding="utf-8")
    body = _tree(client)
    by_id = {n["id"]: n for n in body["nodes"]}
    assert by_id["writer"]["name"] == "Writing"  # an admin's rename survives
    assert by_id["writer/shelf/plot"]["name"] == "Plot"
    assert body["content"]["writer/shelf/plot"]["guide"] == "kept"
    assert by_id["writer/dashboard"]["order"] > by_id["writer/shelf"]["order"]  # after the siblings already there
    assert "admin/office/desk" in by_id
    assert by_id["helper/outbox"]["parentId"] == "helper"  # added on the next load (version 3)
    assert body["screensVersion"] == 3
    # Deleting a screen branch is not undone by the next load.
    assert client.delete("/api/resources/nodes/training/lesson").status_code == 200
    assert not any(n["id"].startswith("training/lesson") for n in _tree(client)["nodes"])


def test_the_office_tiles_arrive_beside_its_old_pages(client: TestClient, app_data_root: Path) -> None:
    """A tree merged at screens version 1 keeps the Office's twelve old pages (what points at them still does) and gains
    its seven tiles after them."""
    import json

    old = {
        "schemaVersion": 2,
        "screensVersion": 1,
        "nodes": [
            {"id": "admin", "kind": "interface", "parentId": None, "order": 0, "name": "Admin"},
            {"id": "admin/office", "kind": "console", "parentId": "admin", "order": 0, "name": "Office"},
            {"id": "admin/office/voting", "kind": "component", "parentId": "admin/office", "order": 0, "name": "Voting"},
        ],
        "content": {},
        "assessments": {},
    }
    (app_data_root / "resources.json").write_text(json.dumps(old), encoding="utf-8")
    body = _tree(client)
    office = sorted((n for n in body["nodes"] if n["parentId"] == "admin/office"), key=lambda n: n["order"])
    assert [n["name"] for n in office] == ["Voting", "Site", "Department", "Team", "Channel", "Desk", "Admin/Helper", "User"]
    assert body["screensVersion"] == 3


def test_a_node_something_points_at_cannot_be_deleted(client: TestClient) -> None:
    from app.storage import channels

    def check(root: Path, ids: set[str]) -> list[str]:
        return ["1 test item"] if "writer/draft/draft" in ids else []

    channels.register_use_check(check)
    try:
        resp = client.delete("/api/resources/nodes/writer/draft")
        assert resp.status_code == 409
        assert "1 test item" in resp.json()["detail"]
        assert client.delete("/api/resources/nodes/training/course").status_code == 200
    finally:
        channels._use_checks.remove(check)


def test_add_rename_reorder_delete_node(client: TestClient) -> None:
    writer = _find(_tree(client)["nodes"], "interface", "Writer")

    resp = client.post("/api/resources/nodes", json={"parentId": writer["id"], "kind": "console", "name": "New Console"})
    assert resp.status_code == 200
    added = _find(resp.json()["nodes"], "console", "New Console")
    assert added["parentId"] == writer["id"]

    resp = client.put(f"/api/resources/nodes/{added['id']}/name", json={"name": "Renamed Console"})
    assert resp.status_code == 200
    assert any(n["name"] == "Renamed Console" for n in resp.json()["nodes"])

    siblings = [n for n in _tree(client)["nodes"] if n["parentId"] == writer["id"]]
    ordered = [n["id"] for n in sorted(siblings, key=lambda n: n["order"])]
    reversed_ids = list(reversed(ordered))
    resp = client.put("/api/resources/nodes/reorder", json={"parentId": writer["id"], "orderedIds": reversed_ids})
    assert resp.status_code == 200
    by_id = {n["id"]: n["order"] for n in resp.json()["nodes"] if n["parentId"] == writer["id"]}
    assert [nid for nid, _ in sorted(by_id.items(), key=lambda kv: kv[1])] == reversed_ids

    resp = client.delete(f"/api/resources/nodes/{added['id']}")
    assert resp.status_code == 200
    assert not any(n["id"] == added["id"] for n in resp.json()["nodes"])


def test_delete_cascades_to_descendants_and_their_content(client: TestClient) -> None:
    plotlines = _plotlines(client)
    plot = {"id": "writer/project/plot"}

    client.put(f"/api/resources/nodes/{plotlines['id']}/guide", json={"guide": "# Plotlines"})
    assert _tree(client)["content"][plotlines["id"]]["guide"] == "# Plotlines"

    resp = client.delete(f"/api/resources/nodes/{plot['id']}")
    assert resp.status_code == 200
    ids = {n["id"] for n in resp.json()["nodes"]}
    assert plot["id"] not in ids
    assert plotlines["id"] not in ids
    assert plotlines["id"] not in resp.json()["content"]


def test_guide_tutorials_and_faq_round_trip(client: TestClient) -> None:
    node = _plotlines(client)

    resp = client.put(f"/api/resources/nodes/{node['id']}/guide", json={"guide": "# Plotlines\n\nGroups plot points."})
    assert resp.status_code == 200
    assert resp.json()["content"][node["id"]]["guide"] == "# Plotlines\n\nGroups plot points."

    tutorials = [{"id": "t1", "title": "Create one", "body": "1. Open Plot\n2. Click + Plotline"}]
    resp = client.put(f"/api/resources/nodes/{node['id']}/tutorials", json={"tutorials": tutorials})
    assert resp.status_code == 200
    assert resp.json()["content"][node["id"]]["tutorials"] == tutorials

    faq = [{"id": "f1", "question": "Can a point be in two plotlines?", "answer": "No.", "source": "authored", "sourceMessageId": None}]
    resp = client.put(f"/api/resources/nodes/{node['id']}/faq", json={"faq": faq})
    assert resp.status_code == 200
    assert resp.json()["content"][node["id"]]["faq"] == faq


def test_assessment_only_allowed_on_console_component_or_feature(client: TestClient) -> None:
    interface = _find(_tree(client)["nodes"], "interface", "Writer")
    resp = client.put(f"/api/resources/nodes/{interface['id']}/assessment", json={"text": ""})
    assert resp.status_code == 400

    feature = _plotlines(client)
    text = "????#q1 Pick one\n?! Right\n?? Wrong"
    resp = client.put(f"/api/resources/nodes/{feature['id']}/assessment", json={"text": text})
    assert resp.status_code == 200
    assert resp.json()["assessments"][feature["id"]] == {"text": text}
    assert client.put(f"/api/resources/nodes/{feature['id']}/assessment", json={"text": "x" * 100_001}).status_code == 422


def test_unknown_node_id_is_404(client: TestClient) -> None:
    assert client.put("/api/resources/nodes/nope/guide", json={"guide": "x"}).status_code == 404
    assert client.delete("/api/resources/nodes/nope").status_code == 404


def test_persists_across_app_instances(storage_root: Path, app_data_root: Path) -> None:
    from app.deps import get_app_data_storage_root, get_storage_root
    from app.main import create_app

    def make() -> TestClient:
        app = create_app()
        app.dependency_overrides[get_storage_root] = lambda: storage_root
        app.dependency_overrides[get_app_data_storage_root] = lambda: app_data_root
        return TestClient(app)

    node = _plotlines(make())
    make().put(f"/api/resources/nodes/{node['id']}/guide", json={"guide": "persisted"})
    assert _tree(make())["content"][node["id"]]["guide"] == "persisted"


def test_corrupt_file_is_quarantined_with_409(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/resources")
    (app_data_root / "resources.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/resources").status_code == 409


def test_promotable_feedback_matches_by_channel_id(client: TestClient) -> None:
    # The seeded feedback (feedback.py's _build_seed) has one message on Reader > Library > Catalog and none on
    # Writer > Book: the Library console offers it, the Book console offers nothing.
    resp = client.get("/api/resources/nodes/reader/library/promotable-feedback")
    assert resp.status_code == 200
    assert [m["id"] for m in resp.json()] == ["fb-3"]
    assert client.get("/api/resources/nodes/writer/book/promotable-feedback").json() == []


def test_submit_feedback_message_needs_no_admin_id(client: TestClient) -> None:
    resp = client.post("/api/feedback/messages", json={
        "author": "Jordan Ellis", "authorId": "u-1", "text": "Would love a duplicate-plotline action.", "senderTone": "neutral",
        "channelId": "writer/project/plot", "verbId": "verb-add", "fromChannel": "writer/project",
    })
    assert resp.status_code == 200
    assert resp.json()["id"].startswith("fb-")

    # It really landed in the Inbox -- fetch it as an admin (seeded adm-dana) and confirm it's there.
    inbox = client.get("/api/feedback", headers={"X-Admin-Id": "adm-dana"}).json()
    assert any(m["text"] == "Would love a duplicate-plotline action." for m in inbox["messages"])


def test_submit_feedback_message_rejects_blank_text(client: TestClient) -> None:
    resp = client.post("/api/feedback/messages", json={"author": "Jordan Ellis", "text": "   ", "channelId": "writer", "verbId": "verb-add"})
    assert resp.status_code == 400
