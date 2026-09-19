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


def _tab_nodes(body: dict, tab: str) -> list[dict]:
    return [n for n in body["nodes"] if n["tab"] == tab]


def test_config_starts_unpublished(client: TestClient) -> None:
    assert client.get("/api/admin-config").json()["published"] == {}


def test_publish_snapshots_only_the_requested_tab(client: TestClient) -> None:
    before = client.get("/api/admin-config").json()
    resp = client.post("/api/admin-config/publish/writerPageConfig")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["published"]) == {"writerPageConfig"}
    published = body["published"]["writerPageConfig"]
    assert published["version"] == 1
    assert published["publishedAt"]
    assert published["nodes"] == _tab_nodes(before, "writerPageConfig")
    # The draft is unchanged.
    assert body["nodes"] == before["nodes"]


def test_publish_bumps_the_version_and_captures_later_edits(client: TestClient) -> None:
    draft = client.get("/api/admin-config").json()
    client.post("/api/admin-config/publish/projectPlan")

    nodes = draft["nodes"]
    edited = [{**n, "name": "Renamed"} if n["tab"] == "projectPlan" and n["kind"] == "console" else n for n in nodes]
    client.put("/api/admin-config", json={"schemaVersion": 1, "nodes": edited})

    # Saving the draft does not touch what was published.
    state = client.get("/api/admin-config").json()
    assert state["published"]["projectPlan"]["version"] == 1
    assert all(n["name"] != "Renamed" for n in state["published"]["projectPlan"]["nodes"])

    republished = client.post("/api/admin-config/publish/projectPlan").json()
    assert republished["published"]["projectPlan"]["version"] == 2
    assert any(n["name"] == "Renamed" for n in republished["published"]["projectPlan"]["nodes"])


def test_saving_the_draft_never_wipes_published(client: TestClient) -> None:
    client.get("/api/admin-config")
    client.post("/api/admin-config/publish/visitorConfig")
    # An old client that only knows about `nodes` saves an empty draft.
    resp = client.put("/api/admin-config", json={"schemaVersion": 1, "nodes": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["nodes"] == []
    assert "visitorConfig" in body["published"]


def test_publish_rejects_unknown_tabs(client: TestClient) -> None:
    assert client.post("/api/admin-config/publish/nope").status_code == 404


def test_a_config_file_from_before_publishing_still_loads(client: TestClient, app_data_root) -> None:
    import json

    (app_data_root / "admin-config.json").write_text(
        json.dumps({"schemaVersion": 1, "nodes": [
            {"id": "n1", "tab": "projectPlan", "kind": "console", "parentId": None, "order": 0, "name": "Old", "idea": ""},
        ]}),
        encoding="utf-8",
    )
    body = client.get("/api/admin-config").json()
    assert body["published"] == {}
    assert body["nodes"][0]["name"] == "Old"
