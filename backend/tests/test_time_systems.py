from fastapi.testclient import TestClient


def _create_project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Timeline"}).json()["projectId"]


def _node(id: str, kind: str, parent: str | None, order: int, **extra) -> dict:
    base = {
        "id": id, "kind": kind, "parentId": parent, "order": order, "title": "", "synopsis": "",
        "draftRef": None, "flag": None, "color": None, "chapterCountTarget": None,
        "plotlineIds": [], "wordCountGoal": None,
    }
    base.update(extra)
    return base


def test_new_projects_get_the_standard_time_system(client: TestClient) -> None:
    project_id = _create_project(client)
    systems = client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["timeSystems"]
    assert len(systems) == 1
    standard = systems[0]
    assert standard["id"] == "standard"
    assert [u["id"] for u in standard["units"]] == ["year", "month", "day", "time"]
    assert [u["kind"] for u in standard["units"]] == ["number", "named", "number", "clock"]
    assert standard["units"][1]["names"][0] == "January"
    assert len(standard["units"][1]["names"]) == 12


def test_time_systems_can_be_replaced_through_the_project(client: TestClient) -> None:
    project_id = _create_project(client)
    custom = [
        {"id": "standard", "name": "Standard date & time", "units": [{"id": "day", "label": "Day", "kind": "number", "names": []}]},
        {
            "id": "seasons", "name": "Seasons",
            "units": [
                {"id": "year", "label": "Year", "kind": "number", "names": []},
                {"id": "season", "label": "Season", "kind": "named", "names": ["Spring", "Summer", "Autumn", "Winter"]},
            ],
        },
    ]
    resp = client.patch(f"/api/projects/{project_id}", json={"timeSystems": custom})
    assert resp.status_code == 200
    assert [s["id"] for s in resp.json()["settings"]["timeSystems"]] == ["standard", "seasons"]
    reloaded = client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["timeSystems"]
    assert reloaded[1]["units"][1]["names"] == ["Spring", "Summer", "Autumn", "Winter"]


def test_patching_other_settings_keeps_the_time_systems(client: TestClient) -> None:
    project_id = _create_project(client)
    client.patch(f"/api/projects/{project_id}", json={"wordCountTarget": 50000})
    systems = client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["timeSystems"]
    assert systems[0]["id"] == "standard"


def test_book_time_system_and_scene_time_value_round_trip(client: TestClient) -> None:
    project_id = _create_project(client)
    nodes = [
        _node("b1", "book", None, 0, timeSystemId="standard"),
        _node("c1", "chapter", "b1", 0),
        _node("s1", "scene", "c1", 0, timeValue={"year": 1024, "month": 2, "day": 9, "time": 570}, location="Harbor"),
        _node("s2", "scene", "c1", 1),
    ]
    assert client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes}).status_code == 200
    saved = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/outline").json()["nodes"]}
    assert saved["b1"]["timeSystemId"] == "standard"
    assert saved["s1"]["timeValue"] == {"year": 1024, "month": 2, "day": 9, "time": 570}
    assert saved["s2"]["timeValue"] == {}


def test_old_free_text_time_is_dropped(client: TestClient) -> None:
    project_id = _create_project(client)
    nodes = [
        _node("b1", "book", None, 0),
        _node("c1", "chapter", "b1", 0),
        _node("s1", "scene", "c1", 0, time="Dusk", location="Harbor"),
    ]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    scene = next(n for n in client.get(f"/api/projects/{project_id}/outline").json()["nodes"] if n["id"] == "s1")
    assert "time" not in scene
    assert scene["timeValue"] == {}
    assert scene["location"] == "Harbor"
