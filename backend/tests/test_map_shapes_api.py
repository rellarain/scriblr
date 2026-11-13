import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import map_markers
from app.storage.schema import MAP_MAX_MY_SHAPES, MapLibraryShape, MapShape


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Shapes Test"}).json()["projectId"]


def _lib(**over) -> dict:
    return {
        "id": "land:test", "name": "Test hill", "category": "land", "levels": ["regional"], "type": "biome", "w": 6, "h": 4,
        "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 0.5, "y": 1}], "biome": "forest", "heightMode": "raise", "height": 300, "profile": "hill", **over,
    }


# ---- the admin's default shapes ----

def test_a_new_install_publishes_the_starter_shapes_as_version_1(client: TestClient) -> None:
    catalog = client.get("/api/map-shapes").json()
    assert catalog["published"]["version"] == 1 and catalog["nextVersion"] == 2
    ids = {s["id"] for s in catalog["published"]["shapes"]}
    assert {"land:island", "land:mountain-range", "space:star", "building:room", "marker:castle", "marker:place"} <= ids
    published = client.get("/api/map-shapes/published").json()["shapes"]
    castle = next(s for s in published if s["id"] == "marker:castle")
    assert (castle["category"], castle["type"], castle["style"], castle["w"], castle["h"]) == ("marker", "region", "halo", 2.0, 2.0)
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in castle["points"])
    door = next(s for s in published if s["id"] == "marker:door")
    assert len(door["holes"]) == 1 and door["levels"] == ["local", "architectural", "interior"]
    mountains = next(s for s in published if s["id"] == "land:mountain-range")
    assert (mountains["biome"], mountains["heightMode"], mountains["profile"], mountains["rough"]) == ("rocky", "raise", "peak", 25)


def test_the_draft_is_saved_published_restored_and_discarded(client: TestClient) -> None:
    catalog = client.put("/api/map-shapes", json={"shapes": [_lib(), _lib(id="land:two", name="Second"), "not a shape", _lib(id="bad id!")]}).json()
    assert [s["id"] for s in catalog["draft"]] == ["land:test", "land:two"]
    assert catalog["published"]["version"] == 1  # not yet published
    published = client.post("/api/map-shapes/publish").json()
    assert published["published"]["version"] == 2 and [s["id"] for s in published["published"]["shapes"]] == ["land:test", "land:two"]
    assert client.get("/api/map-shapes/published").json()["shapes"][0]["name"] == "Test hill"
    restored = client.post("/api/map-shapes/restore/1").json()
    assert len(restored["draft"]) > 50 and restored["published"]["version"] == 2
    assert [s["id"] for s in client.post("/api/map-shapes/discard").json()["draft"]] == ["land:test", "land:two"]
    assert client.post("/api/map-shapes/restore/99").status_code == 404


def test_two_shapes_of_one_name_in_a_category_cannot_be_published(client: TestClient) -> None:
    client.put("/api/map-shapes", json={"shapes": [_lib(), _lib(id="land:copy")]})
    resp = client.post("/api/map-shapes/publish")
    assert resp.status_code == 422 and "Test hill" in resp.json()["detail"]
    # The same name in another category is fine.
    client.put("/api/map-shapes", json={"shapes": [_lib(), _lib(id="marker:hill", category="marker", type="region")]})
    assert client.post("/api/map-shapes/publish").status_code == 200


def test_a_library_shape_is_repaired_to_its_box_and_its_kind(client: TestClient) -> None:
    shape = MapLibraryShape.model_validate(_lib(
        type="region", points=[{"x": -1, "y": 2}, {"x": 0.5, "y": 0.5}, {"x": 1, "y": 0}], holes=[[{"x": 0.2, "y": 0.2}, {"x": 0.3, "y": 0.2}]],
        levels=["regional", "nowhere", "regional"], category="weird", style="zigzag", rough=500,
    ))
    assert [(p.x, p.y) for p in shape.points] == [(0.0, 1.0), (0.5, 0.5), (1.0, 0.0)]
    assert shape.holes == [] and shape.levels == ["regional"] and shape.category == "land" and shape.style == "solid" and shape.rough == 100
    assert (shape.biome, shape.heightMode, shape.height) == (None, "none", 0.0)  # only a biome shape changes heights


def test_starter_shapes_that_a_later_build_adds_join_the_catalog_once(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/map-shapes")
    path = app_data_root / "map-shapes.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["seedVersion"] = 0
    raw["draft"] = [s for s in raw["draft"] if s["id"] != "marker:castle"]
    raw["published"]["shapes"] = [s for s in raw["published"]["shapes"] if s["id"] != "marker:castle"]
    path.write_text(json.dumps(raw), encoding="utf-8")
    catalog = client.get("/api/map-shapes").json()
    assert catalog["seedVersion"] == map_markers.seed_version()
    assert sum(1 for s in catalog["draft"] if s["id"] == "marker:castle") == 1
    assert sum(1 for s in catalog["published"]["shapes"] if s["id"] == "marker:castle") == 1


# ---- My shapes ----

def test_my_shapes_are_kept_with_the_project_they_came_from_renamed_and_deleted(client: TestClient) -> None:
    assert client.get("/api/my-map-shapes").json()["shapes"] == []
    made = client.post("/api/my-map-shapes", json={"shape": _lib(), "projectId": "prj_1", "projectTitle": "  The Long Road  "})
    assert made.status_code == 201
    mine = made.json()
    assert mine["id"].startswith("my_") and (mine["projectId"], mine["projectTitle"], mine["name"]) == ("prj_1", "The Long Road", "Test hill")
    renamed = client.patch(f"/api/my-map-shapes/{mine['id']}", json={"name": "  Round hill "}).json()
    assert renamed["name"] == "Round hill"
    assert [s["name"] for s in client.get("/api/my-map-shapes").json()["shapes"]] == ["Round hill"]
    assert client.delete(f"/api/my-map-shapes/{mine['id']}").status_code == 204
    assert client.get("/api/my-map-shapes").json()["shapes"] == []
    assert client.delete(f"/api/my-map-shapes/{mine['id']}").status_code == 404
    assert client.patch("/api/my-map-shapes/my_nope", json={"name": "x"}).status_code == 404


def test_my_shapes_hold_at_most_so_many(client: TestClient, app_data_root: Path) -> None:
    path = app_data_root / "my-map-shapes.json"
    path.write_text(json.dumps({"schemaVersion": 1, "shapes": [{**_lib(id=f"my_{i:04d}"), "projectId": "p"} for i in range(MAP_MAX_MY_SHAPES)]}), encoding="utf-8")
    assert len(client.get("/api/my-map-shapes").json()["shapes"]) == MAP_MAX_MY_SHAPES
    assert client.post("/api/my-map-shapes", json={"shape": _lib()}).status_code == 422


# ---- shapes on a map: more rings, a rough edge, a kind, the halo ----

def test_holes_a_rough_edge_and_a_kind_round_trip_and_are_repaired(client: TestClient) -> None:
    pid = _project(client)
    doc = client.post(f"/api/projects/{pid}/maps", json={"level": "regional", "width": 10, "height": 8}).json()
    ring = [{"x": 1, "y": 1}, {"x": 2, "y": 1}, {"x": 1.5, "y": 2}]
    doc["shapes"] = [
        {"id": "r1", "layerId": "shapes", "type": "region", "points": [{"x": 0, "y": 0}, {"x": 6, "y": 0}, {"x": 6, "y": 6}], "holes": [ring, [{"x": 1, "y": 1}], ring],
         "rough": 40, "seed": 1234, "kind": "  land:island  ", "style": "halo"},
        {"id": "l1", "layerId": "shapes", "type": "line", "points": [{"x": 0, "y": 0}, {"x": 3, "y": 3}], "holes": [ring], "rough": -5, "seed": "x", "kind": 5},
        {"id": "m1", "layerId": "symbols", "type": "region", "points": ring, "style": "halo", "kind": "marker:castle", "name": "Keep"},
    ]
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    r1, l1, m1 = saved["shapes"]
    assert (len(r1["holes"]), r1["rough"], r1["seed"], r1["kind"], r1["style"]) == (2, 40, 1234, "land:island", "halo")
    assert (l1["holes"], l1["rough"], l1["seed"], l1["kind"]) == ([], 0, 0, None)
    assert (m1["layerId"], m1["kind"]) == ("symbols", "marker:castle")
    rows = client.get(f"/api/projects/{pid}/maps/places/all").json()
    assert [(r["name"], r["kind"]) for r in rows] == [("Keep", "castle")]
    # Holes are held to the map like the outline.
    doc["shapes"] = [{**doc["shapes"][0], "holes": [[{"x": -5, "y": 1}, {"x": 99, "y": 1}, {"x": 2, "y": 99}]]}]
    holes = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"][0]["holes"]
    assert [(p["x"], p["y"]) for p in holes[0]] == [(0.0, 1.0), (10.0, 1.0), (2.0, 8.0)]


def test_markers_have_a_count_of_their_own() -> None:
    from app.storage.schema import MAP_MAX_SHAPES, MapDoc

    tri = [{"x": 1, "y": 1}, {"x": 2, "y": 1}, {"x": 1.5, "y": 2}]
    regions = [{"id": f"r{i}", "layerId": "shapes", "type": "region", "points": tri} for i in range(MAP_MAX_SHAPES)]
    markers = [{"id": f"m{i}", "layerId": "symbols", "type": "region", "style": "halo", "points": tri} for i in range(10)]
    doc = MapDoc.model_validate({"id": "m", "mapFormat": 3, "width": 4, "height": 4, "layers": [
        {"id": "terrain", "name": "Biomes", "kind": "terrain"}, {"id": "shapes", "name": "Regions", "kind": "shapes"}, {"id": "symbols", "name": "Markers", "kind": "symbols"},
    ], "shapes": regions + markers})
    assert len(doc.shapes) == MAP_MAX_SHAPES + 10


def test_the_seed_markers_match_the_symbols_they_replace() -> None:
    shapes = {s.id: s for s in map_markers.seed_shapes()}
    for kind in ("village", "town", "city", "castle", "tree", "door", "harbour", "interest", "mine"):
        marker = shapes[f"marker:{kind}"]
        assert marker.style == "halo" and len(marker.points) >= 3
    # A converted symbol is the marker scaled into its square.
    shape = MapShape(id="x", layerId="symbols", type="region", points=[{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 0, "y": 1}])
    assert shape.rough == 0 and shape.holes == [] and shape.kind is None
