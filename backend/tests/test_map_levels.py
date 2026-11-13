"""Maps by level: an older project's painted maps are traced into biome shapes once when it is read (and written back), editions too; the biome lists
(the admin's, published to every project, and a project's own); named areas are places."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import project_store


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Levels Test"}).json()["projectId"]


def _old_map(map_id: str, kind: str, rows: list[str], **over) -> dict:
    cells: list[int] = []
    for ch in "".join(rows):
        c = int(ch)
        if cells and cells[-2] == c:
            cells[-1] += 1
        else:
            cells.extend((c, 1))
    return {
        "id": map_id, "title": map_id, "kind": kind, "width": len(rows[0]), "height": len(rows), "unit": "miles", "cells": cells, "theme": "parchment",
        "layers": [{"id": "terrain", "name": "Terrain", "kind": "terrain"}, {"id": "symbols", "name": "Symbols", "kind": "symbols"}],
        **over,
    }


def _write_old(storage_root: Path, pid: str, maps: list[dict], editions: list[dict] | None = None) -> Path:
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["schemaVersion"] = 6
    raw["maps"] = {m["id"]: m for m in maps}
    if editions is not None:
        raw["bookListings"] = {"b1": {"listed": True, "editions": editions}}
    path.write_text(json.dumps(raw), encoding="utf-8")
    project_store._cache.clear()
    return path


ISLAND = ["000000", "011110", "011110", "000000"]


def test_an_old_project_is_traced_once_and_written_back(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    terrains = [{"id": "ocean", "name": "Ocean", "color": "#3b6ea5", "builtIn": True}, {"id": "ter_x", "name": "Crystal", "color": "#aa66ff", "builtIn": False}]
    path = _write_old(storage_root, pid, [
        _old_map("map_w", "world", ISLAND, terrains=terrains, symbols=[{"id": "s1", "layerId": "symbols", "kind": "city", "x": 2, "y": 2, "name": "Veyra"}]),
        _old_map("map_t", "town", ["1111", "1001", "1111"], unit="paces"),
    ])
    rows = client.get(f"/api/projects/{pid}/maps").json()
    assert {r["id"]: r["level"] for r in rows} == {"map_w": "planetary", "map_t": "local"}
    raw = json.loads(path.read_text(encoding="utf-8"))
    assert raw["schemaVersion"] == 7 and (storage_root / pid / "project.json.v6.bak").exists()
    world = raw["maps"]["map_w"]
    assert (world["mapFormat"], world["units"], world["unit"], world["legacyGrid"]) == (2, "imperial", "mi", [6, 4])
    assert world["theme"] == "parchment" and world["kind"] == "world" and world["cells"] == _old_map("map_w", "world", ISLAND)["cells"]  # kept as it was
    assert [s["biome"] for s in world["shapes"]] and world["shapes"][0]["biome"].startswith("own_")  # Crystal became a project biome
    assert [b["name"] for b in raw["mapBiomes"]] == ["Crystal"]
    assert raw["maps"]["map_t"]["units"] == "custom" and raw["maps"]["map_t"]["unit"] == "paces"
    before = path.stat().st_mtime_ns
    project_store._cache.clear()
    client.get(f"/api/projects/{pid}/maps")
    assert path.stat().st_mtime_ns == before  # done once: a second read changes nothing


def test_editions_are_traced_and_freeze_their_biomes(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    edition = {"n": 1, "publishedAt": "2026-01-01T00:00:00Z", "maps": [{"mapId": "map_w", "doc": _old_map("map_w", "world", ISLAND)}]}
    path = _write_old(storage_root, pid, [], editions=[edition])
    client.get(f"/api/projects/{pid}/maps")
    raw = json.loads(path.read_text(encoding="utf-8"))
    frozen = raw["bookListings"]["b1"]["editions"][0]
    assert frozen["maps"][0]["doc"]["mapFormat"] == 2
    assert set(frozen["biomes"]) == {"saltwater", "plain"} and frozen["biomes"]["plain"]["color"] == "#a4c34a"


def test_an_old_map_file_put_is_traced(client: TestClient) -> None:
    pid = _project(client)
    made = client.post(f"/api/projects/{pid}/maps", json={"level": "planetary"}).json()
    old = _old_map(made["id"], "world", ISLAND, terrains=[
        {"id": "ocean", "name": "Ocean", "color": "#3b6ea5", "builtIn": True}, {"id": "ter_y", "name": "Glass", "color": "#ddeeff", "builtIn": False},
    ])
    saved = client.put(f"/api/projects/{pid}/maps/{made['id']}", json=old)
    assert saved.status_code == 200, saved.text
    doc = saved.json()
    assert doc["mapFormat"] == 2 and doc["shapes"][0]["type"] == "biome"
    assert [b["name"] for b in client.get(f"/api/projects/{pid}/map-biomes").json()["biomes"]] == ["Glass"]


# ---- the admin's biome list ----

def test_a_new_install_starts_with_the_starter_list_published(client: TestClient) -> None:
    catalog = client.get("/api/map-biomes").json()
    assert catalog["published"]["version"] == 1 and catalog["nextVersion"] == 2
    ids = [b["id"] for b in catalog["draft"]]
    assert ids[:4] == ["saltwater", "freshwater", "desert", "plain"] and "space" in ids and "wood" in ids
    published = {b["id"]: b for b in client.get("/api/map-biomes/published").json()["biomes"]}
    assert published["tundra"]["color"] == "#e9eef0" and published["lava"]["name"] == "Lava fields"


def test_publishing_numbers_versions_and_keeps_a_removed_biome_as_retired(client: TestClient) -> None:
    draft = client.get("/api/map-biomes").json()["draft"]
    forest = next(b for b in draft if b["id"] == "forest")
    forest["color"] = "#225522"
    kept = [b for b in draft if b["id"] != "swamp"]
    assert client.put("/api/map-biomes", json={"biomes": kept}).status_code == 200
    catalog = client.post("/api/map-biomes/publish").json()
    assert catalog["published"]["version"] == 2 and [h["version"] for h in catalog["history"]] == [1]
    published = {b["id"]: b for b in catalog["published"]["biomes"]}
    assert published["forest"]["color"] == "#225522"
    assert published["swamp"]["retired"] is True  # maps that use it keep its colour
    restored = client.post("/api/map-biomes/restore/1").json()
    assert next(b for b in restored["draft"] if b["id"] == "forest")["color"] == "#3f8f3a"
    assert client.post("/api/map-biomes/restore/99").status_code == 404
    assert next(b for b in client.post("/api/map-biomes/discard").json()["draft"] if b["id"] == "forest")["color"] == "#225522"


def test_a_biome_without_a_name_or_twice_the_same_name_is_not_published(client: TestClient) -> None:
    draft = client.get("/api/map-biomes").json()["draft"]
    draft.append({"id": "bio_new", "name": "", "color": "#123456"})
    client.put("/api/map-biomes", json={"biomes": draft})
    assert client.post("/api/map-biomes/publish").status_code == 422
    draft[-1]["name"] = "Forest"
    client.put("/api/map-biomes", json={"biomes": draft})
    resp = client.post("/api/map-biomes/publish")
    assert resp.status_code == 422 and "Forest" in resp.json()["detail"]


# ---- a project's own biomes ----

def test_a_projects_biomes_are_its_own_and_one_in_use_is_kept_as_retired(client: TestClient) -> None:
    pid = _project(client)
    mine = {"id": "own_crystal", "name": "Crystal fields", "color": "#aa66ff", "group": "land"}
    resp = client.put(f"/api/projects/{pid}/map-biomes", json={"biomes": [mine, {"id": "forest", "name": "Not mine"}]})
    assert [b["id"] for b in resp.json()["biomes"]] == ["own_crystal"]  # only ids of its own
    made = client.post(f"/api/projects/{pid}/maps", json={"level": "regional"}).json()
    made["base"] = {"biome": "own_crystal", "height": 0}
    client.put(f"/api/projects/{pid}/maps/{made['id']}", json=made)
    left = client.put(f"/api/projects/{pid}/map-biomes", json={"biomes": []}).json()["biomes"]
    assert [(b["id"], b["retired"]) for b in left] == [("own_crystal", True)]
    too_many = [{"id": f"own_{i}", "name": f"B{i}"} for i in range(65)]
    assert client.put(f"/api/projects/{pid}/map-biomes", json={"biomes": too_many}).status_code == 422


# ---- named areas are places ----

def _area(**over) -> dict:
    return {"id": "a1", "layerId": "terrain", "type": "biome", "biome": "forest", "points": [{"x": 1, "y": 1}, {"x": 5, "y": 1}, {"x": 5, "y": 4}], **over}


def test_a_named_area_is_a_place_that_opens_maps_and_can_be_linked(client: TestClient) -> None:
    pid = _project(client)
    world = client.post(f"/api/projects/{pid}/maps", json={"title": "Continent", "level": "continental", "width": 10, "height": 8}).json()
    nation = client.post(f"/api/projects/{pid}/maps", json={"title": "Aurel", "level": "national", "parentId": world["id"]}).json()
    world["shapes"] = [
        _area(name="Aurel", mapIds=[nation["id"], "map_gone", world["id"]]),
        {"id": "r1", "layerId": "shapes", "type": "region", "points": [{"x": 6, "y": 1}, {"x": 9, "y": 1}, {"x": 9, "y": 4}], "name": "The Marches"},
    ]
    saved = client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world).json()
    assert saved["shapes"][0]["mapIds"] == [nation["id"]]  # only maps that are there, and never itself
    places = client.get(f"/api/projects/{pid}/maps/places/all").json()
    assert [(p["name"], p["kind"], p["path"]) for p in places] == [("Aurel", "area", "Continent > Aurel"), ("The Marches", "area", "Continent > The Marches")]
    ada = client.post(f"/api/projects/{pid}/characters", json={"name": "Ada"}).json()
    linked = client.post(f"/api/projects/{pid}/world-links", json={"a": f"place:{world['id']}/a1", "b": f"char:{ada['id']}"})
    assert linked.status_code == 200 and len(linked.json()) == 1
    assert client.post(f"/api/projects/{pid}/world-links", json={"a": f"place:{world['id']}/nope", "b": f"char:{ada['id']}"}).status_code == 422
    assert client.delete(f"/api/projects/{pid}/maps/{nation['id']}").status_code == 204
    assert client.get(f"/api/projects/{pid}/maps/{world['id']}").json()["shapes"][0]["mapIds"] == []


def test_heights_profiles_political_areas_and_the_height_view_are_kept_and_repaired(client: TestClient) -> None:
    pid = _project(client)
    world = client.post(f"/api/projects/{pid}/maps", json={"title": "Heights", "level": "regional", "width": 10, "height": 8}).json()
    assert (world["heightRange"], world["contours"], world["relief"]) == (None, False, False)
    world["shapes"] = [
        _area(id="hill", heightMode="raise", height=400, profile="hill", slope=3.5),
        _area(id="odd", profile="volcano", slope=-2, political="nation"),
        _area(id="steep", profile="peak", slope=500),
        {"id": "kingdom", "layerId": "shapes", "type": "region", "points": [{"x": 6, "y": 1}, {"x": 9, "y": 1}, {"x": 9, "y": 4}], "political": "nation", "profile": "peak", "slope": 4},
        {"id": "realm", "layerId": "shapes", "type": "region", "points": [{"x": 6, "y": 1}, {"x": 9, "y": 1}, {"x": 9, "y": 4}], "political": "empire"},
    ]
    world.update(heightRange=1500, contours=True, relief=True)
    saved = client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world).json()
    by_id = {s["id"]: s for s in saved["shapes"]}
    assert (by_id["hill"]["profile"], by_id["hill"]["slope"]) == ("hill", 3.5)
    assert (by_id["odd"]["profile"], by_id["odd"]["slope"], by_id["odd"]["political"]) == ("plateau", 0.0, None)  # an area is never political
    assert by_id["steep"]["slope"] == 64.0
    assert (by_id["kingdom"]["political"], by_id["kingdom"]["profile"], by_id["kingdom"]["slope"]) == ("nation", "plateau", 0.0)
    assert by_id["realm"]["political"] is None
    assert (saved["heightRange"], saved["contours"], saved["relief"]) == (1500.0, True, True)
    for bad in (0, -5, "high", True):
        world["heightRange"] = bad
        assert client.put(f"/api/projects/{pid}/maps/{world['id']}", json=world).json()["heightRange"] is None
