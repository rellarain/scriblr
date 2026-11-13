"""The space levels (maps slice M4): orbits and the bodies on them, the glow pattern, the kinds of star and planet in the biome list, and starter shapes a
later build changes."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import map_markers
from app.storage.schema import BIOME_GROUP_LEVELS, MAP_BIOME_SEED, MapDoc, MapShape


def _system(client: TestClient) -> tuple[str, dict]:
    pid = client.post("/api/projects", json={"title": "Space"}).json()["projectId"]
    doc = client.post(f"/api/projects/{pid}/maps", json={"title": "Aster", "level": "galactic", "width": 30, "height": 20}).json()
    return pid, doc


def _orbit(**over) -> dict:
    return {"id": "orb_a", "layerId": "shapes", "type": "orbit", "ellipse": {"cx": 15, "cy": 10, "rx": 5, "ry": 4, "turn": 10}, "style": "dashed", **over}


def _planet(**over) -> dict:
    pts = [{"x": 19.5, "y": 10}, {"x": 20.5, "y": 10}, {"x": 20.5, "y": 11}, {"x": 19.5, "y": 11}]
    return {"id": "bio_p", "layerId": "terrain", "type": "biome", "points": pts, "biome": "planet_gas_giant", "orbit": {"id": "orb_a", "angle": 30}, **over}


def test_a_star_system_has_space_for_its_base(client: TestClient) -> None:
    _, doc = _system(client)
    assert doc["level"] == "galactic" and doc["base"]["biome"] == "space" and doc["base"]["height"] == 0


def test_an_orbit_is_kept_with_its_path_and_a_planet_with_its_place_on_it(client: TestClient) -> None:
    pid, doc = _system(client)
    doc["shapes"] = [_orbit(points=[{"x": 1, "y": 1}], name="Not a place", fill="#ffffff"), _planet()]
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    orbit, planet = saved["shapes"]
    assert orbit["type"] == "orbit" and orbit["points"] == [] and orbit["name"] == "" and orbit["fill"] is None
    assert orbit["ellipse"] == {"cx": 15.0, "cy": 10.0, "rx": 5.0, "ry": 4.0, "turn": 10.0}
    assert orbit["orbit"] is None
    assert planet["orbit"] == {"id": "orb_a", "angle": 30.0} and planet["ellipse"] is None
    again = client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()
    assert again["shapes"] == saved["shapes"]


def test_an_orbit_is_held_to_the_map_and_one_with_no_path_is_dropped(client: TestClient) -> None:
    pid, doc = _system(client)
    doc["shapes"] = [
        _orbit(ellipse={"cx": 99, "cy": -5, "rx": 999, "ry": "wide", "turn": 900}),
        _orbit(id="orb_none", ellipse=None),
        _orbit(id="orb_bad", ellipse="round"),
    ]
    shapes = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"]
    assert [s["id"] for s in shapes] == ["orb_a"]
    assert shapes[0]["ellipse"] == {"cx": 30.0, "cy": 0.0, "rx": 30.0, "ry": 4.0, "turn": 180.0}


def test_a_body_lets_go_of_an_orbit_that_is_gone_and_a_line_never_has_one(client: TestClient) -> None:
    pid, doc = _system(client)
    line = {"id": "shp_l", "layerId": "shapes", "type": "line", "points": [{"x": 1, "y": 1}, {"x": 5, "y": 5}], "orbit": {"id": "orb_a", "angle": 5}}
    doc["shapes"] = [_planet(orbit={"id": "orb_gone", "angle": 400}), _orbit(), line]
    shapes = {s["id"]: s for s in client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"]}
    assert shapes["bio_p"]["orbit"] is None
    assert shapes["shp_l"]["orbit"] is None
    assert MapShape.model_validate({**_planet(), "orbit": {"id": "orb_a", "angle": 400}}).orbit.angle == 40.0


def test_a_region_can_glow(client: TestClient) -> None:
    pid, doc = _system(client)
    nebula = {"id": "shp_n", "layerId": "shapes", "type": "region", "points": [{"x": 1, "y": 1}, {"x": 6, "y": 1}, {"x": 4, "y": 5}], "pattern": "glow", "fill": "#9a5fd0"}
    doc["shapes"] = [nebula, {**nebula, "id": "shp_m", "pattern": "sparkles"}]
    shapes = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()["shapes"]
    assert [s["pattern"] for s in shapes] == ["glow", "solid"]


def test_orbits_count_with_the_lines_and_regions() -> None:
    doc = MapDoc.model_validate({
        "id": "map_1", "title": "x", "width": 10, "height": 10, "level": "galactic", "mapFormat": 3,
        "layers": [{"id": "terrain", "name": "Biomes", "kind": "terrain"}, {"id": "shapes", "name": "Regions and lines", "kind": "shapes"}],
        "shapes": [_orbit(id=f"orb_{i}") for i in range(5)],
    })
    assert len(doc.shapes) == 5 and all(s.type == "orbit" for s in doc.shapes)


# ---- the kinds of star and planet ----

def test_the_biome_list_has_kinds_of_star_and_planet_offered_on_the_space_levels(client: TestClient) -> None:
    published = {b["id"]: b for b in client.get("/api/map-biomes/published").json()["biomes"]}
    assert published["star_black_hole"]["group"] == "star" and published["planet_garden"]["group"] == "planet"
    assert BIOME_GROUP_LEVELS["planet"] == ("galactic",) and BIOME_GROUP_LEVELS["star"] == ("intergalactic", "galactic")
    assert len(published) == len(MAP_BIOME_SEED)


def test_a_biome_list_from_before_the_space_levels_gets_the_new_kinds_once_and_keeps_its_own(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/map-biomes")
    path = app_data_root / "map-biomes.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    old = [b for b in raw["draft"] if not b["id"].startswith(("star_", "planet_"))]
    old[0]["name"] = "Open sea"
    old.append({"id": "glass", "name": "Glass", "color": "#aaccee", "group": "land", "levels": [], "retired": False})
    raw.update(seedVersion=1, draft=old)
    raw["published"]["biomes"] = [b for b in raw["published"]["biomes"] if not b["id"].startswith(("star_", "planet_"))]
    path.write_text(json.dumps(raw), encoding="utf-8")
    catalog = client.get("/api/map-biomes").json()
    ids = [b["id"] for b in catalog["draft"]]
    assert catalog["seedVersion"] == 2
    assert ids[:len(old)] == [b["id"] for b in old] and ids.count("star_yellow") == 1 and "planet_ice" in ids
    assert catalog["draft"][0]["name"] == "Open sea"
    assert "star_yellow" in {b["id"] for b in catalog["published"]["biomes"]}
    # Only once.
    assert [b["id"] for b in client.get("/api/map-biomes").json()["draft"]] == ids


# ---- starter shapes a later build changes ----

def test_a_starter_shape_left_as_an_earlier_build_gave_it_is_brought_up_to_date_and_a_changed_one_is_not(client: TestClient, app_data_root: Path) -> None:
    earlier = map_markers.replaced_shapes()
    assert {"space:star", "space:planet", "space:nebula"} <= set(earlier)
    client.get("/api/map-shapes")
    path = app_data_root / "map-shapes.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    old_star, old_planet = (earlier[i][0].model_dump(mode="json") for i in ("space:star", "space:planet"))
    renamed = {**old_planet, "name": "My planet"}
    swap = {"space:star": old_star, "space:planet": renamed}
    raw["seedVersion"] = 1
    raw["draft"] = [swap.get(s["id"], s) for s in raw["draft"] if s["id"] != "space:moon"]
    raw["published"]["shapes"] = [swap.get(s["id"], s) for s in raw["published"]["shapes"] if s["id"] != "space:moon"]
    path.write_text(json.dumps(raw), encoding="utf-8")
    catalog = client.get("/api/map-shapes").json()
    draft = {s["id"]: s for s in catalog["draft"]}
    assert (draft["space:star"]["type"], draft["space:star"]["biome"]) == ("biome", "star_yellow")
    assert draft["space:planet"]["name"] == "My planet" and draft["space:planet"]["type"] == "region"
    assert "space:moon" in draft
    published = {s["id"]: s for s in catalog["published"]["shapes"]}
    assert published["space:star"]["type"] == "biome" and published["space:planet"]["name"] == "My planet"
