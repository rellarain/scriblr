import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage.schema import MAP_MAX_SIDE, MAP_TERRAIN_SETS, MapDoc, repair_map_runs


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Maps Test"}).json()["projectId"]


def _new(client: TestClient, pid: str, **body) -> dict:
    resp = client.post(f"/api/projects/{pid}/maps", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _total(cells: list[int]) -> int:
    return sum(cells[1::2])


# ---- the pure repair of painted cells ----

def test_runs_that_cover_exactly_the_grid_are_kept_and_neighbours_are_joined() -> None:
    assert repair_map_runs([1, 4, 1, 2, 0, 6], 12, 3) == [1, 6, 0, 6]


def test_a_shortfall_is_filled_with_the_first_terrain_and_a_surplus_is_cut() -> None:
    assert repair_map_runs([2, 3], 10, 3) == [2, 3, 0, 7]
    assert repair_map_runs([1, 50], 10, 3) == [1, 10]
    assert repair_map_runs([], 6, 3) == [0, 6]
    assert repair_map_runs("not a list", 4, 3) == [0, 4]


def test_a_bad_pair_is_dropped_and_an_index_past_the_palette_becomes_the_first_terrain() -> None:
    assert repair_map_runs([1, 2, "x", 3, 1, 0, 1, -4, 9, 2, 2, 2], 6, 3) == [1, 2, 0, 2, 2, 2]
    assert repair_map_runs([True, 3, 1, 3], 6, 3) == [1, 3, 0, 3]  # the pair with a boolean is dropped
    assert repair_map_runs([-1, 2, 1, 3], 6, 3) == [1, 3, 0, 3]  # so is one with a negative index


# ---- creating and reading ----

def test_a_new_map_has_its_terrain_set_its_layers_and_is_filled_with_the_first_terrain(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, title="The Known World", kind="world", width=28, height=18, cellSize=10, unit="miles")
    assert doc["id"].startswith("map_")
    assert [t["id"] for t in doc["terrains"]] == [t[0] for t in MAP_TERRAIN_SETS["world"]]
    assert all(t["builtIn"] for t in doc["terrains"])
    assert [(layer["kind"], layer["visible"], layer["locked"]) for layer in doc["layers"]] == [
        ("terrain", True, False), ("shapes", True, False), ("symbols", True, False), ("labels", True, False), ("notes", True, False),
    ]
    assert doc["cells"] == [0, 28 * 18]
    assert (doc["cellSize"], doc["unit"], doc["parentId"], doc["order"]) == (10, "miles", None, 0)


def test_each_kind_starts_with_its_own_terrains(client: TestClient) -> None:
    pid = _project(client)
    for kind in ("world", "town", "interior"):
        doc = _new(client, pid, kind=kind, width=4, height=3)
        assert [t["id"] for t in doc["terrains"]] == [t[0] for t in MAP_TERRAIN_SETS[kind]]


def test_the_list_has_summaries_without_cells_in_tree_order(client: TestClient) -> None:
    pid = _project(client)
    first = _new(client, pid, title="First")
    second = _new(client, pid, title="Second")
    inner = _new(client, pid, title="Inside", parentId=first["id"])
    rows = client.get(f"/api/projects/{pid}/maps").json()
    assert [r["title"] for r in rows] == ["First", "Inside", "Second"]  # order 0, 0, 1
    assert second["order"] == 1 and inner["order"] == 0
    assert set(rows[0]) == {"id", "title", "kind", "parentId", "order", "width", "height", "updatedAt"}


def test_a_map_can_be_made_only_inside_a_map_that_exists_and_a_project_for_one_that_exists(client: TestClient) -> None:
    pid = _project(client)
    assert client.post(f"/api/projects/{pid}/maps", json={"parentId": "map_nope"}).status_code == 422
    assert client.post("/api/projects/prj_nope/maps", json={}).status_code == 404
    assert client.get(f"/api/projects/{pid}/maps/map_nope").status_code == 404


def test_a_side_past_the_largest_is_refused(client: TestClient) -> None:
    pid = _project(client)
    assert client.post(f"/api/projects/{pid}/maps", json={"width": MAP_MAX_SIDE + 1}).status_code == 422
    assert client.post(f"/api/projects/{pid}/maps", json={"width": MAP_MAX_SIDE, "height": MAP_MAX_SIDE}).status_code == 201


# ---- saving ----

def test_painted_cells_a_new_terrain_and_a_hidden_layer_round_trip(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, kind="town", width=4, height=2)
    doc["terrains"].append({"id": "ter_salt", "name": "Salt flats", "color": "#efe6d2", "builtIn": False})
    doc["cells"] = [0, 3, 5, 2, 1, 3]
    doc["layers"][2]["visible"] = False
    doc["layers"][0]["locked"] = True
    doc["title"] = "Port Veyra"
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert again["cells"] == [0, 3, 5, 2, 1, 3]
    assert again["terrains"][-1] == {"id": "ter_salt", "name": "Salt flats", "color": "#efe6d2", "builtIn": False}
    assert [layer["visible"] for layer in again["layers"]] == [True, True, False, True, True]
    assert again["layers"][0]["locked"] is True
    assert again["title"] == "Port Veyra"


def test_odd_values_are_repaired_not_refused(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=3, height=2)
    doc["title"] = "   "
    doc["unit"] = ""
    doc["terrains"] = [{"id": "a", "name": "x" * 90, "color": "not a colour"}, {"id": "a", "name": "again", "color": "#112233"}]
    doc["layers"] = [{"id": "labels", "name": "Names", "kind": "labels"}]
    doc["cells"] = [0, 2, 5, 9, "x", 1]
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    saved = resp.json()
    assert saved["title"] == "Untitled map" and saved["unit"] == "cells"
    assert [t["id"] for t in saved["terrains"]] == ["a"]  # the repeat is dropped
    assert len(saved["terrains"][0]["name"]) == 40 and saved["terrains"][0]["color"] == "#888888"
    assert [layer["kind"] for layer in saved["layers"]] == ["terrain", "labels"]  # a map always has its terrain layer
    assert saved["cells"] == [0, 6] and _total(saved["cells"]) == 6


def test_a_map_with_no_palette_gets_its_kinds_set(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, kind="interior", width=2, height=2)
    doc["terrains"] = []
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    assert [t["id"] for t in saved["terrains"]] == [t[0] for t in MAP_TERRAIN_SETS["interior"]]


def test_the_id_must_match_the_address_and_the_map_must_exist(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid)
    assert client.put(f"/api/projects/{pid}/maps/map_other", json=doc).status_code == 422
    ghost = {**doc, "id": "map_ghost"}
    assert client.put(f"/api/projects/{pid}/maps/map_ghost", json=ghost).status_code == 404


def test_a_map_cannot_be_put_inside_itself_or_a_map_it_holds(client: TestClient) -> None:
    pid = _project(client)
    world = _new(client, pid, title="World")
    town = _new(client, pid, title="Town", parentId=world["id"])
    room = _new(client, pid, title="Room", parentId=town["id"])
    for target, parent in ((world, world["id"]), (world, room["id"]), (town, room["id"]), (world, "map_nope")):
        resp = client.put(f"/api/projects/{pid}/maps/{target['id']}", json={**target, "parentId": parent})
        assert resp.status_code == 422, (target["title"], parent)
    moved = client.put(f"/api/projects/{pid}/maps/{room['id']}", json={**room, "parentId": world["id"]})
    assert moved.status_code == 200 and moved.json()["parentId"] == world["id"]


def test_deleting_a_map_moves_the_maps_inside_it_up(client: TestClient) -> None:
    pid = _project(client)
    world = _new(client, pid, title="World")
    town = _new(client, pid, title="Town", parentId=world["id"])
    room = _new(client, pid, title="Room", parentId=town["id"])
    assert client.delete(f"/api/projects/{pid}/maps/{town['id']}").status_code == 204
    rows = {r["title"]: r for r in client.get(f"/api/projects/{pid}/maps").json()}
    assert set(rows) == {"World", "Room"} and rows["Room"]["parentId"] == world["id"]
    assert client.delete(f"/api/projects/{pid}/maps/{town['id']}").status_code == 404
    assert client.get(f"/api/projects/{pid}/maps/{room['id']}").status_code == 200


# ---- the file ----

def test_a_map_that_cannot_be_read_is_set_aside_and_the_others_still_load(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    good = _new(client, pid, title="Good", width=2, height=2)
    bad = _new(client, pid, title="Bad", width=2, height=2)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["maps"][bad["id"]]["width"] = "wide"
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert [r["title"] for r in client.get(f"/api/projects/{pid}/maps").json()] == ["Good"]
    assert client.get(f"/api/projects/{pid}/maps/{good['id']}").status_code == 200
    resp = client.get(f"/api/projects/{pid}/maps/{bad['id']}")
    assert resp.status_code == 409 and "quarantined" in resp.json()["detail"]
    assert list((storage_root / pid / "quarantine").glob(f"maps.{bad['id']}.corrupt-*.json"))


def test_a_project_saved_before_maps_loads_with_none(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("maps", None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert client.get(f"/api/projects/{pid}/maps").json() == []
    assert MapDoc(id="map_x", width=2, height=2).cells == [0, 4]


def test_maps_are_stored_in_project_json_and_survive_a_cold_read(client: TestClient, storage_root: Path) -> None:
    from app.storage import project_store

    pid = _project(client)
    doc = _new(client, pid, title="Kept", width=5, height=5)
    doc["cells"] = [1, 10, 2, 15]
    client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    project_store._cache.clear()
    raw = json.loads((storage_root / pid / "project.json").read_text(encoding="utf-8"))
    assert raw["maps"][doc["id"]]["cells"] == [1, 10, 2, 15]
    assert client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()["cells"] == [1, 10, 2, 15]
