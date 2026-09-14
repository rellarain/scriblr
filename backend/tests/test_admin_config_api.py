from fastapi.testclient import TestClient


def test_get_admin_config_seeds_defaults_on_first_load(client: TestClient) -> None:
    resp = client.get("/api/admin-config")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schemaVersion"] == 1
    assert len(body["nodes"]) > 0
    tabs = {n["tab"] for n in body["nodes"]}
    assert tabs == {
        "projectPlan", "visitorConfig", "userPageConfig", "readerPageConfig",
        "translatorPageConfig", "writerPageConfig", "helperPageConfig", "adminPageConfig",
    }
    kinds = {n["kind"] for n in body["nodes"]}
    assert kinds == {"console", "component", "feature"}
    for node in body["nodes"]:
        assert node["id"]
        assert isinstance(node["order"], int)


def test_get_admin_config_is_stable_across_calls(client: TestClient) -> None:
    first = client.get("/api/admin-config").json()
    second = client.get("/api/admin-config").json()
    assert first == second


def test_put_admin_config_replaces_the_whole_tree(client: TestClient) -> None:
    client.get("/api/admin-config")  # trigger default seeding

    resp = client.put(
        "/api/admin-config",
        json={
            "schemaVersion": 1,
            "nodes": [
                {"id": "auiNode_custom1", "tab": "projectPlan", "kind": "console", "parentId": None, "order": 0, "name": "Custom Console", "idea": ""},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["nodes"]) == 1
    assert body["nodes"][0]["name"] == "Custom Console"

    reloaded = client.get("/api/admin-config").json()
    assert reloaded == body


def test_put_admin_config_can_add_and_remove(client: TestClient) -> None:
    client.get("/api/admin-config")
    client.put("/api/admin-config", json={"schemaVersion": 1, "nodes": []})
    resp = client.get("/api/admin-config")
    assert resp.json()["nodes"] == []
