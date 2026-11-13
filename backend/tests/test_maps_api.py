import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage.schema import MAP_MAX_SIDE, MapDoc, repair_map_runs


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

def test_a_new_map_has_its_level_its_base_its_layers_and_no_cells(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, title="The Known World", level="continental", units="metric", width=28, height=18, cellSize=25, unit="km")
    assert doc["id"].startswith("map_")
    assert (doc["level"], doc["mapFormat"], doc["units"], doc["kind"]) == ("continental", 3, "metric", "world")
    assert doc["base"] == {"biome": "saltwater", "height": -200.0}
    assert doc["terrains"] == [] and doc["cells"] == [] and doc["shapes"] == []
    assert [(layer["kind"], layer["name"], layer["visible"], layer["locked"]) for layer in doc["layers"]] == [
        ("terrain", "Biomes", True, False), ("shapes", "Regions and lines", True, False), ("symbols", "Markers", True, False), ("labels", "Labels", True, False),
        ("notes", "Notes", True, False),
    ]
    assert (doc["cellSize"], doc["unit"], doc["parentId"], doc["order"]) == (25, "km", None, 0)


def test_each_level_starts_with_its_own_base_and_an_old_kind_still_makes_a_map(client: TestClient) -> None:
    pid = _project(client)
    assert _new(client, pid, level="interior")["base"]["biome"] == "wood"
    assert _new(client, pid, level="galactic")["base"]["biome"] == "space"
    imperial = _new(client, pid, level="planetary", units="imperial")
    assert imperial["base"] == {"biome": "saltwater", "height": round(-3000 / 0.3048)}
    old = _new(client, pid, kind="town", width=4, height=3)  # a client from before levels
    assert (old["level"], old["mapFormat"], old["kind"]) == ("local", 3, "town")
    chosen = _new(client, pid, level="regional", base={"biome": "forest", "height": 120})
    assert chosen["base"] == {"biome": "forest", "height": 120.0}


def test_the_list_has_summaries_without_cells_in_tree_order(client: TestClient) -> None:
    pid = _project(client)
    first = _new(client, pid, title="First")
    second = _new(client, pid, title="Second")
    inner = _new(client, pid, title="Inside", parentId=first["id"])
    rows = client.get(f"/api/projects/{pid}/maps").json()
    assert [r["title"] for r in rows] == ["First", "Inside", "Second"]  # order 0, 0, 1
    assert second["order"] == 1 and inner["order"] == 0
    assert set(rows[0]) == {"id", "title", "kind", "level", "parentId", "order", "width", "height", "updatedAt", "versionOf", "appliesFrom"}


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

def _biome_shape(**over) -> dict:
    return {
        "id": "b1", "layerId": "terrain", "type": "biome", "biome": "forest", "heightMode": "raise", "height": 400,
        "points": [{"x": 1, "y": 1}, {"x": 4, "y": 1}, {"x": 4, "y": 3}], **over,
    }


def test_biome_shapes_a_base_and_a_hidden_layer_round_trip(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, level="regional", width=6, height=4)
    doc["shapes"] = [_biome_shape(), _biome_shape(id="b2", biome=None, heightMode="lower", height=50, name="The Hollow")]
    doc["base"] = {"biome": "plain", "height": 10}
    doc["layers"][2]["visible"] = False
    doc["layers"][0]["locked"] = True
    doc["title"] = "Port Veyra"
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert [(s["id"], s["biome"], s["heightMode"], s["height"], s["name"]) for s in again["shapes"]] == [
        ("b1", "forest", "raise", 400.0, ""), ("b2", None, "lower", 50.0, "The Hollow"),
    ]
    assert again["base"] == {"biome": "plain", "height": 10.0}
    assert [layer["visible"] for layer in again["layers"]] == [True, True, False, True, True]
    assert again["layers"][0]["locked"] is True
    assert again["title"] == "Port Veyra"


def test_odd_values_are_repaired_not_refused(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=3, height=2)
    doc["title"] = "   "
    doc["unit"] = ""
    doc["level"] = "galaxy-brain"
    doc["units"] = "furlongs"
    doc["base"] = {"biome": "not ok!", "height": "high"}
    doc["layers"] = [{"id": "labels", "name": "Names", "kind": "labels"}]
    doc["shapes"] = [_biome_shape(layerId="gone")]  # dropped: on a layer that is not there
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    saved = resp.json()
    assert saved["title"] == "Untitled map" and saved["unit"] == "cells"
    assert saved["level"] == "planetary" and saved["units"] == "custom"  # a level that is not one is the one its kind becomes
    assert saved["base"] == {"biome": "saltwater", "height": 0.0}
    assert [layer["kind"] for layer in saved["layers"]] == ["terrain", "labels"]  # a map always has its biomes layer
    assert saved["layers"][0]["name"] == "Biomes"
    assert saved["shapes"] == [] and saved["cells"] == []


def test_a_biome_shape_with_odd_values_is_repaired_and_a_line_has_no_biome_or_name(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=6, height=4)
    doc["shapes"] = [
        _biome_shape(biome="bad id!", heightMode="sideways", height="tall"),
        _biome_shape(id="b2", layerId="shapes"),  # a biome shape off the biomes layer is dropped
        {"id": "l1", "layerId": "shapes", "type": "line", "points": [{"x": 0, "y": 0}, {"x": 2, "y": 2}], "biome": "forest", "name": "Road", "mapIds": ["x"]},
    ]
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    assert [(s["id"], s["biome"], s["heightMode"], s["height"]) for s in saved["shapes"]] == [("b1", None, "none", 0.0), ("l1", None, "none", 0.0)]
    assert (saved["shapes"][1]["name"], saved["shapes"][1]["mapIds"]) == ("", [])


def test_a_shape_with_the_id_of_a_symbol_is_given_another(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=10, height=8)
    doc["symbols"] = [_item(id="s1")]
    doc["shapes"] = [_biome_shape(id="s1")]
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    # The symbol keeps its id as a marker; the shape that had it is given another.
    assert saved["symbols"] == [] and [s["id"] for s in saved["shapes"]] == ["s1_1", "s1"]


def test_the_kept_cells_and_palette_of_a_traced_map_are_not_for_a_save_to_change(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=4, height=2)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["maps"][doc["id"]].update(cells=[0, 8], terrains=[{"id": "ocean", "name": "Ocean", "color": "#3b6ea5", "builtIn": True}], legacyGrid=[4, 2])
    path.write_text(json.dumps(raw), encoding="utf-8")
    from app.storage import project_store

    project_store._cache.clear()
    sent = {**doc, "cells": [9, 9], "terrains": [], "width": 8}
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=sent).json()
    assert saved["cells"] == [0, 8] and [t["id"] for t in saved["terrains"]] == ["ocean"] and saved["legacyGrid"] == [4, 2] and saved["width"] == 8


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
    assert MapDoc(id="map_x", width=2, height=2).cells == [0, 4]  # a document of format 1 (from before levels) still repairs its cells
    assert MapDoc(id="map_x", width=2, height=2, mapFormat=2).cells == []


def test_maps_are_stored_in_project_json_and_survive_a_cold_read(client: TestClient, storage_root: Path) -> None:
    from app.storage import project_store

    pid = _project(client)
    doc = _new(client, pid, title="Kept", width=5, height=5)
    doc["shapes"] = [_biome_shape()]
    client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    project_store._cache.clear()
    raw = json.loads((storage_root / pid / "project.json").read_text(encoding="utf-8"))
    assert [s["id"] for s in raw["maps"][doc["id"]]["shapes"]] == ["b1"]
    assert client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()["shapes"][0]["biome"] == "forest"


# ---- symbols, labels, the look and what is drawn over the map ----

def _item(**over) -> dict:
    return {"id": "s1", "layerId": "symbols", "kind": "castle", "x": 3.5, "y": 2.5, "size": 2.0, "color": None, **over}


def test_a_new_map_has_the_scale_and_compass_on(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid)
    assert (doc["scaleBar"], doc["compass"], doc["legend"], doc["symbols"], doc["labels"]) == (True, True, False, [], [])


def test_the_symbols_of_an_old_map_file_become_markers_and_labels_round_trip(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=10, height=8)
    doc["mapFormat"] = 2  # a map file from before shape libraries
    doc["symbols"] = [_item(), _item(id="s2", kind="tree", color="#336699", x=1, y=1), _item(id="s3", kind="gone")]
    doc["labels"] = [{"id": "l1", "layerId": "labels", "text": "Port Veyra", "x": 4, "y": 3, "size": 1.5}]
    doc.update(scaleBar=False, compass=False, legend=True)
    assert client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).status_code == 200
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert again["symbols"] == [] and again["mapFormat"] == 3
    assert [(s["id"], s["layerId"], s["type"], s["kind"], s["style"], s["fill"]) for s in again["shapes"]] == [
        ("s1", "symbols", "region", "marker:castle", "halo", None), ("s2", "symbols", "region", "marker:tree", "halo", "#336699"),
        ("s3", "symbols", "region", "marker:place", "halo", None),
    ]
    # A marker fills the square the symbol was drawn in (2 cells wide, centred on it).
    xs = [p["x"] for p in again["shapes"][0]["points"]]
    ys = [p["y"] for p in again["shapes"][0]["points"]]
    assert 2.5 <= min(xs) < 3 and 4 < max(xs) <= 4.5 and 1.5 <= min(ys) and max(ys) <= 3.5
    assert [s["id"] for s in again["legacySymbols"]] == ["s1", "s2", "s3"]
    assert again["labels"] == [{"id": "l1", "layerId": "labels", "text": "Port Veyra", "x": 4.0, "y": 3.0, "size": 1.5}]
    assert (again["scaleBar"], again["compass"], again["legend"]) == (False, False, True)
    # A later save keeps the old symbols as they were.
    again["legacySymbols"] = []
    assert client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=again).json()["legacySymbols"][0]["id"] == "s1"


def test_odd_items_are_repaired_or_dropped_not_refused(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=10, height=8)
    doc["symbols"] = [
        _item(id="ok", x=99, y=-5, size=99, color="red"),   # held to the map and the sizes, a bad colour is none
        _item(id="ok"),                                      # a repeat id
        _item(id="lost", layerId="labels"),                  # on a layer of another kind
        _item(id="ghost", layerId="nope"),                   # on a layer that is not there
        "not an item", {"id": "x"}, {"id": "y", "layerId": "symbols"},  # unreadable or missing its kind
        _item(id="nan", x="far", size="big"),
    ]
    doc["labels"] = [{"id": "l", "layerId": "labels", "text": "  " + "x" * 300, "x": 1, "y": 1, "size": 0}, 5]
    doc.update(theme="neon", scaleBar="yes", legend=None, contours="yes please", relief=3)
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    saved = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    by_id = {s["id"]: s for s in saved["shapes"]}
    assert set(by_id) == {"ok", "nan"}
    assert by_id["ok"]["fill"] is None and all(0 <= p["x"] <= 10 and 0 <= p["y"] <= 8 for p in by_id["ok"]["points"])
    assert len(saved["labels"]) == 1 and len(saved["labels"][0]["text"]) == 120 and saved["labels"][0]["size"] == 0.25
    assert (saved["theme"], saved["scaleBar"], saved["legend"], saved["contours"], saved["relief"]) == ("modern", True, False, False, False)


def test_items_on_a_layer_that_is_gone_go_with_it_and_the_map_holds_at_most_so_many(client: TestClient) -> None:
    from app.storage.schema import MAP_MAX_LABELS, MAP_MAX_MARKERS

    pid = _project(client)
    doc = _new(client, pid, width=4, height=4)
    doc["symbols"] = [_item(id=f"s{i}", kind="fort") for i in range(MAP_MAX_MARKERS + 5)]
    doc["labels"] = [{"id": f"l{i}", "layerId": "labels", "text": "x", "x": 1, "y": 1, "size": 1} for i in range(MAP_MAX_LABELS + 5)]
    client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    saved = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert (len(saved["shapes"]), len(saved["labels"])) == (MAP_MAX_MARKERS, MAP_MAX_LABELS)
    doc["layers"] = [layer for layer in doc["layers"] if layer["id"] != "symbols"]
    assert client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"] == []


def test_a_map_saved_before_these_fields_loads_with_the_defaults(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    doc = _new(client, pid)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    for key in ("symbols", "labels", "theme", "scaleBar", "compass", "legend"):
        raw["maps"][doc["id"]].pop(key, None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    from app.storage import project_store

    project_store._cache.clear()
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert (again["theme"], again["scaleBar"], again["compass"], again["legend"], again["symbols"], again["labels"]) == ("modern", True, True, False, [], [])


# ---- lines and regions ----

def _shape(**over) -> dict:
    return {
        "id": "sh1", "layerId": "shapes", "type": "line", "points": [{"x": 1, "y": 1}, {"x": 4, "y": 2, "smooth": True, "hx": 1, "hy": 0.5}, {"x": 7, "y": 5}],
        "style": "road", "color": "#664422", "width": 0.5, "fill": None, "opacity": 0.35, "pattern": "solid", **over,
    }


def test_a_new_map_has_no_shapes(client: TestClient) -> None:
    pid = _project(client)
    assert _new(client, pid)["shapes"] == []


def test_lines_and_regions_round_trip_with_their_styles_and_handles(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=10, height=8)
    doc["shapes"] = [
        _shape(),
        _shape(id="sh2", type="region", points=[{"x": 1, "y": 1}, {"x": 5, "y": 1}, {"x": 3, "y": 4}], fill="#88aa44", opacity=0.6, pattern="hatch", style="dashed", color=None),
    ]
    assert client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).status_code == 200
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    first, second = again["shapes"]
    assert (first["type"], first["style"], first["color"], first["width"]) == ("line", "road", "#664422", 0.5)
    assert first["points"][1] == {"x": 4.0, "y": 2.0, "smooth": True, "hx": 1.0, "hy": 0.5}
    assert first["points"][0] == {"x": 1.0, "y": 1.0, "smooth": False, "hx": None, "hy": None}
    assert (second["type"], second["fill"], second["opacity"], second["pattern"], second["style"], second["color"]) == ("region", "#88aa44", 0.6, "hatch", "dashed", None)


def test_odd_shapes_are_repaired_or_dropped_not_refused(client: TestClient) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=10, height=8)
    doc["shapes"] = [
        _shape(id="ok", style="zigzag", pattern="plaid", color="red", fill="nope", width=99, opacity=7),   # bad words and numbers are put right
        _shape(id="ok"),                                                                                   # a repeat id
        _shape(id="few", points=[{"x": 1, "y": 1}]),                                                       # a line needs two points
        _shape(id="tri", type="region", points=[{"x": 1, "y": 1}, {"x": 2, "y": 2}]),                      # a region needs three
        _shape(id="gone", layerId="nope"),                                                                 # a layer that is not there
        _shape(id="wrong", layerId="labels"),                                                              # a layer of another kind
        _shape(id="kindless", type=None), _shape(id="weird", type="blob"), "not a shape",
        _shape(id="far", points=[{"x": -9, "y": 99}, {"x": "x", "y": 2, "smooth": "yes", "hx": 3}]),
    ]
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    by_id = {s["id"]: s for s in resp.json()["shapes"]}
    assert set(by_id) == {"ok", "far"}
    ok = by_id["ok"]
    assert (ok["style"], ok["pattern"], ok["color"], ok["fill"], ok["width"], ok["opacity"]) == ("solid", "solid", None, None, 4.0, 1.0)
    far = by_id["far"]["points"]
    assert [(p["x"], p["y"]) for p in far] == [(0.0, 8.0), (0.0, 2.0)]   # held to the map; a point that is not a number is the corner
    assert far[1]["smooth"] is False and far[1]["hx"] is None            # a handle needs both of its numbers


def test_a_shape_goes_with_its_layer_and_the_map_holds_at_most_so_many(client: TestClient) -> None:
    from app.storage.schema import MAP_MAX_SHAPE_POINTS, MAP_MAX_SHAPES

    pid = _project(client)
    doc = _new(client, pid, width=4, height=4)
    doc["shapes"] = [_shape(id=f"s{i}", points=[{"x": 1, "y": 1}, {"x": 2, "y": 2}]) for i in range(MAP_MAX_SHAPES + 5)]
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    assert len(saved["shapes"]) == MAP_MAX_SHAPES
    doc["shapes"] = [_shape(points=[{"x": 1, "y": 1}] * (MAP_MAX_SHAPE_POINTS + 50))]
    assert len(client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"][0]["points"]) == MAP_MAX_SHAPE_POINTS
    doc["layers"] = [layer for layer in doc["layers"] if layer["id"] != "shapes"]
    assert client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"] == []


def test_a_map_saved_before_shapes_loads_without_them(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    doc = _new(client, pid)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["maps"][doc["id"]].pop("shapes", None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    from app.storage import project_store

    project_store._cache.clear()
    assert client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()["shapes"] == []


# ---- places (named symbols, now markers), nesting and the pace ----

def _place(i: str, name: str, **over) -> dict:
    return {"id": i, "layerId": "symbols", "kind": "town", "x": 2.5, "y": 2.5, "size": 2.0, "color": None, "name": name, "mapIds": [], **over}


def test_a_symbol_with_a_name_is_a_place_and_the_names_and_links_round_trip(client: TestClient) -> None:
    pid = _project(client)
    world = _new(client, pid, title="World", width=10, height=8)
    town = _new(client, pid, title="Port Veyra", parentId=world["id"])
    world["symbols"] = [_place("s1", "  Port Veyra  ", mapIds=[town["id"]]), _item(id="s2")]
    world["pace"] = 24
    saved = client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world).json()
    assert [(s["id"], s["name"], s["mapIds"]) for s in saved["shapes"]] == [("s1", "Port Veyra", [town["id"]]), ("s2", "", [])]
    assert saved["pace"] == 24.0


def test_odd_names_links_and_paces_are_repaired(client: TestClient) -> None:
    pid = _project(client)
    world = _new(client, pid, width=10, height=8)
    other = _new(client, pid, title="Other")
    world["symbols"] = [_place("s1", "x" * 200, mapIds=[other["id"], other["id"], "map_nope", world["id"], 5, ""] + [other["id"]] * 3), _place("s2", 7, mapIds="x")]
    world["pace"] = -3
    saved = client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world).json()
    first, second = saved["shapes"]
    assert len(first["name"]) == 80
    assert first["mapIds"] == [other["id"]]          # a map that is not there, this map itself and repeats are dropped
    assert (second["name"], second["mapIds"]) == ("", [])
    assert saved["pace"] is None
    saved["pace"] = "fast"
    assert client.put(f"/api/projects/{pid}/maps/{world['id']}", json=saved).json()["pace"] is None


def test_deleting_a_map_takes_it_off_the_places_that_opened_it(client: TestClient) -> None:
    pid = _project(client)
    world = _new(client, pid, title="World", width=10, height=8)
    town = _new(client, pid, title="Port Veyra", parentId=world["id"])
    floor = _new(client, pid, title="Cellar", parentId=world["id"])
    world["symbols"] = [_place("s1", "Port Veyra", mapIds=[town["id"], floor["id"]])]
    client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world)
    assert client.delete(f"/api/projects/{pid}/maps/{town['id']}").status_code == 204
    again = client.get(f"/api/projects/{pid}/maps/{world['id']}").json()
    assert again["shapes"][0]["mapIds"] == [floor["id"]]


def test_the_places_of_every_map_are_listed_with_the_maps_they_are_inside(client: TestClient) -> None:
    pid = _project(client)
    world = _new(client, pid, title="The Known World", width=10, height=8)
    town = _new(client, pid, title="Port Veyra", parentId=world["id"])
    world["symbols"] = [_place("w1", "Port Veyra", mapIds=[town["id"]]), _item(id="plain")]
    town["symbols"] = [_place("t1", "The Harbour Inn", kind="door"), _place("t2", "Ale House")]
    client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world)
    client.put(f"/api/projects/{pid}/maps/{town['id']}", json=town)
    rows = client.get(f"/api/projects/{pid}/maps/places/all").json()
    assert [r["path"] for r in rows] == ["The Known World > Port Veyra", "The Known World > Port Veyra > Ale House", "The Known World > Port Veyra > The Harbour Inn"]
    inn = next(r for r in rows if r["name"] == "The Harbour Inn")
    assert inn == {
        "key": f"{town['id']}/t1", "mapId": town["id"], "placeId": "t1", "name": "The Harbour Inn", "path": "The Known World > Port Veyra > The Harbour Inn",
        "kind": "door", "mapTitle": "Port Veyra", "mapIds": [],
    }
    assert next(r for r in rows if r["placeId"] == "w1")["mapIds"] == [town["id"]]


def test_there_are_no_places_without_names_or_maps(client: TestClient) -> None:
    pid = _project(client)
    assert client.get(f"/api/projects/{pid}/maps/places/all").json() == []
    doc = _new(client, pid)
    doc["symbols"] = [_item()]
    client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert client.get(f"/api/projects/{pid}/maps/places/all").json() == []
    assert client.get("/api/projects/prj_nope/maps/places/all").status_code == 404


def test_a_map_saved_before_places_loads_with_none(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    doc = _new(client, pid, width=4, height=4)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    stored = raw["maps"][doc["id"]]
    # A map as an older build left it: its symbols not yet markers, without names, maps or a pace.
    stored["mapFormat"] = 2
    stored["symbols"] = [{k: v for k, v in _item().items() if k not in ("name", "mapIds")}]
    stored.pop("pace", None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    from app.storage import project_store

    project_store._cache.clear()
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert (again["shapes"][0]["id"], again["shapes"][0]["name"], again["shapes"][0]["mapIds"], again["pace"]) == ("s1", "", [], None)
