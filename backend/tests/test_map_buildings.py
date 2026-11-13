"""Buildings (maps slice M5): the floors of a building, and doors, windows and arches in walls."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import map_markers
from app.storage.schema import MapShape


def _building(client: TestClient) -> tuple[str, dict]:
    pid = client.post("/api/projects", json={"title": "Inn"}).json()["projectId"]
    doc = client.post(f"/api/projects/{pid}/maps", json={"title": "The Lantern Inn", "level": "architectural", "width": 16, "height": 12}).json()
    return pid, doc


def _wall(**over) -> dict:
    pts = [{"x": 2, "y": 2}, {"x": 14, "y": 2}, {"x": 14, "y": 10}]
    return {"id": "shp_w", "layerId": "shapes", "type": "line", "style": "wall", "points": pts, **over}


def test_a_floor_is_a_map_inside_its_building_with_its_place_and_name(client: TestClient) -> None:
    pid, building = _building(client)
    assert building["floor"] is None and building["base"]["biome"] == "outside"
    body = {"title": "Ground floor", "level": "architectural", "width": 16, "height": 12, "parentId": building["id"], "floor": {"order": 0, "name": ""}}
    ground = client.post(f"/api/projects/{pid}/maps", json=body).json()
    assert ground["floor"] == {"order": 0, "name": ""} and ground["parentId"] == building["id"]
    up = client.post(f"/api/projects/{pid}/maps", json={**body, "title": "Top", "floor": {"order": 99, "name": "  The attic, under the eaves of the old inn's roof  "}}).json()
    assert up["floor"]["order"] == 20 and up["floor"]["name"] == "The attic, under the eaves of the old inn's roof"[:40]
    rows = {r["title"]: r for r in client.get(f"/api/projects/{pid}/maps").json()}
    assert rows["Ground floor"]["floor"] == {"order": 0, "name": ""}
    assert rows["The Lantern Inn"]["floor"] is None


def test_a_floor_is_repaired_and_saved(client: TestClient) -> None:
    pid, building = _building(client)
    floor = client.post(f"/api/projects/{pid}/maps", json={"title": "B", "level": "architectural", "parentId": building["id"], "floor": {"order": 1}}).json()
    floor["floor"] = {"order": -9, "name": 42}
    saved = client.put(f"/api/projects/{pid}/maps/{floor['id']}", json=floor).json()
    assert saved["floor"] == {"order": -3, "name": ""}
    floor["floor"] = "upstairs"
    assert client.put(f"/api/projects/{pid}/maps/{floor['id']}", json=floor).json()["floor"] is None


def test_a_wall_keeps_its_doors_windows_and_arches_each_on_a_piece_it_has(client: TestClient) -> None:
    pid, doc = _building(client)
    openings = [
        {"id": "opn_a", "seg": 0, "t": 0.25, "width": 1.2, "kind": "door", "flip": True},
        {"id": "opn_b", "seg": 1, "t": 2, "width": 99, "kind": "porthole"},
        {"id": "opn_c", "seg": 2, "t": 0.5, "width": 1},  # no third piece: dropped
        {"id": "opn_a", "seg": 1, "t": 0.5, "width": 1},  # the same id again: dropped
        "a door",
    ]
    doc["shapes"] = [_wall(openings=openings), {**_wall(id="shp_r", type="region"), "openings": openings}]
    shapes = {s["id"]: s for s in client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"]}
    assert shapes["shp_w"]["openings"] == [
        {"id": "opn_a", "seg": 0, "t": 0.25, "width": 1.2, "kind": "door", "flip": True},
        {"id": "opn_b", "seg": 1, "t": 1.0, "width": 8.0, "kind": "door", "flip": False},
    ]
    assert shapes["shp_r"]["openings"] == []


def test_openings_are_kept_to_a_limit() -> None:
    shape = MapShape.model_validate(_wall(openings=[{"id": f"opn_{i}", "seg": 0} for i in range(200)]))
    assert len(shape.openings) == 64


def test_the_starter_shapes_have_more_building_parts_and_an_older_catalog_gets_them_once(client: TestClient, app_data_root: Path) -> None:
    assert map_markers.seed_version() >= 3
    published = {s["id"] for s in client.get("/api/map-shapes/published").json()["shapes"]}
    assert {"building:sofa", "building:desk", "building:wardrobe", "building:counter", "building:bath", "building:rug"} <= published
    path = app_data_root / "map-shapes.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["seedVersion"] = 2
    raw["draft"] = [s for s in raw["draft"] if s["id"] != "building:sofa"]
    raw["published"]["shapes"] = [s for s in raw["published"]["shapes"] if s["id"] != "building:sofa"]
    path.write_text(json.dumps(raw), encoding="utf-8")
    catalog = client.get("/api/map-shapes").json()
    assert sum(1 for s in catalog["draft"] if s["id"] == "building:sofa") == 1
    assert sum(1 for s in client.get("/api/map-shapes").json()["draft"] if s["id"] == "building:sofa") == 1
