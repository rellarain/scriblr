from fastapi.testclient import TestClient


def test_get_presets_seeds_defaults_on_first_load(client: TestClient) -> None:
    resp = client.get("/api/presets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schemaVersion"] == 1
    names = [p["name"] for p in body["presets"]]
    assert "Characters" in names
    assert len(body["presets"]) == 10
    for preset in body["presets"]:
        assert preset["id"]
        assert isinstance(preset["fields"], list)


def test_get_presets_is_stable_across_calls(client: TestClient) -> None:
    first = client.get("/api/presets").json()
    second = client.get("/api/presets").json()
    assert first == second


def test_put_presets_replaces_the_whole_catalog(client: TestClient) -> None:
    client.get("/api/presets")  # trigger default seeding

    resp = client.put(
        "/api/presets",
        json={
            "schemaVersion": 1,
            "presets": [
                {"id": "preset_custom1", "name": "Factions", "fields": ["Name", "Territory", "Leader"]},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["presets"]) == 1
    assert body["presets"][0]["name"] == "Factions"
    assert body["presets"][0]["fields"] == ["Name", "Territory", "Leader"]

    reloaded = client.get("/api/presets").json()
    assert reloaded == body


def test_put_presets_can_add_and_remove(client: TestClient) -> None:
    client.get("/api/presets")
    client.put("/api/presets", json={"schemaVersion": 1, "presets": []})
    resp = client.get("/api/presets")
    assert resp.json()["presets"] == []
