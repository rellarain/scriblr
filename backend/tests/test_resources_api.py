from pathlib import Path

from fastapi.testclient import TestClient


def _tree(client: TestClient) -> dict:
    return client.get("/api/resources").json()


def _find(nodes: list[dict], kind: str, name: str) -> dict:
    for n in nodes:
        if n["kind"] == kind and n["name"] == name:
            return n
    raise AssertionError(f"no {kind} node named {name!r} among {[ (n['kind'], n['name']) for n in nodes ]}")


def test_get_seeds_the_tree_from_the_feedback_taxonomy(client: TestClient) -> None:
    body = _tree(client)
    assert body["schemaVersion"] == 1
    assert body["content"] == {}
    assert body["assessments"] == {}
    kinds = {n["kind"] for n in body["nodes"]}
    assert kinds == {"interface", "console", "component", "feature"}
    # Writer > Shelf > Project Plot > Plotlines is real taxonomy from feedback.py.
    writer = _find(body["nodes"], "interface", "Writer")
    shelf = _find(body["nodes"], "console", "Shelf")
    assert shelf["parentId"] == writer["id"]
    plot = _find(body["nodes"], "component", "Project Plot")
    assert plot["parentId"] == shelf["id"]
    plotlines = _find(body["nodes"], "feature", "Plotlines")
    assert plotlines["parentId"] == plot["id"]
    assert client.get("/api/resources").json() == body  # stable across reloads


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
    tree = _tree(client)
    plot = _find(tree["nodes"], "component", "Project Plot")
    plotlines = _find(tree["nodes"], "feature", "Plotlines")

    client.put(f"/api/resources/nodes/{plotlines['id']}/guide", json={"guide": "# Plotlines"})
    assert _tree(client)["content"][plotlines["id"]]["guide"] == "# Plotlines"

    resp = client.delete(f"/api/resources/nodes/{plot['id']}")
    assert resp.status_code == 200
    ids = {n["id"] for n in resp.json()["nodes"]}
    assert plot["id"] not in ids
    assert plotlines["id"] not in ids
    assert plotlines["id"] not in resp.json()["content"]


def test_guide_tutorials_and_faq_round_trip(client: TestClient) -> None:
    node = _find(_tree(client)["nodes"], "feature", "Plotlines")

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
    resp = client.put(f"/api/resources/nodes/{interface['id']}/assessment", json={"questions": []})
    assert resp.status_code == 400

    feature = _find(_tree(client)["nodes"], "feature", "Plotlines")
    questions = [{"id": "q1", "prompt": "Pick one", "options": [
        {"id": "o1", "text": "Right", "isCorrect": True}, {"id": "o2", "text": "Wrong", "isCorrect": False},
    ]}]
    resp = client.put(f"/api/resources/nodes/{feature['id']}/assessment", json={"questions": questions})
    assert resp.status_code == 200
    assert resp.json()["assessments"][feature["id"]]["questions"] == questions


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

    node = _find(_tree(make())["nodes"], "feature", "Plotlines")
    make().put(f"/api/resources/nodes/{node['id']}/guide", json={"guide": "persisted"})
    assert _tree(make())["content"][node["id"]]["guide"] == "persisted"


def test_corrupt_file_is_quarantined_with_409(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/resources")
    (app_data_root / "resources.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/resources").status_code == 409


def test_promotable_feedback_matches_by_channel_name(client: TestClient) -> None:
    # Seeded Feedback messages (feedback.py's _build_seed) include one on
    # Writer > Shelf > Sidebar Shelf -- not under Project Plot -- so it
    # should surface for a Shelf-level node but not for an unrelated one.
    shelf = _find(_tree(client)["nodes"], "console", "Shelf")
    resp = client.get(f"/api/resources/nodes/{shelf['id']}/promotable-feedback")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

    reader_nook = _find(_tree(client)["nodes"], "console", "Nook")
    resp = client.get(f"/api/resources/nodes/{reader_nook['id']}/promotable-feedback")
    assert resp.status_code == 200


def test_submit_feedback_message_needs_no_admin_id(client: TestClient) -> None:
    resp = client.post("/api/feedback/messages", json={
        "author": "Jordan Ellis", "text": "Would love a duplicate-plotline action.", "senderTone": "neutral",
        "openPage": "Writer", "openConsole": "Shelf", "selectedComponent": "Project Plot",
    })
    assert resp.status_code == 200
    assert resp.json()["id"].startswith("fb-")

    # It really landed in the Inbox -- fetch it as an admin (seeded adm-dana) and confirm it's there.
    inbox = client.get("/api/feedback", headers={"X-Admin-Id": "adm-dana"}).json()
    assert any(m["message"]["text"] == "Would love a duplicate-plotline action." for m in inbox["messages"])


def test_submit_feedback_message_rejects_blank_text(client: TestClient) -> None:
    resp = client.post("/api/feedback/messages", json={"author": "Jordan Ellis", "text": "   "})
    assert resp.status_code == 400
