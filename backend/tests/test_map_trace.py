import time

from app.storage.map_trace import (
    decode_runs,
    grow,
    label_areas,
    merge_small,
    own_biome_id,
    simplify_closed,
    units_of,
    upgrade_map,
)
from app.storage.schema import MAP_MAX_SHAPE_POINTS, MapDoc, MapTerrain


def _encode(cells: list[int]) -> list[int]:
    runs: list[int] = []
    for c in cells:
        if runs and runs[-2] == c:
            runs[-1] += 1
        else:
            runs.extend((c, 1))
    return runs


def _grid(rows: list[str]) -> tuple[int, int, list[int]]:
    """A map from rows of digits (one terrain index per cell)."""
    return len(rows[0]), len(rows), [int(ch) for row in rows for ch in row]


def _old_map(rows: list[str], kind: str = "world", terrains: list[MapTerrain] | None = None, unit: str = "miles") -> MapDoc:
    width, height, cells = _grid(rows)
    doc = MapDoc(id="map_old", kind=kind, width=width, height=height, unit=unit, cells=_encode(cells), terrains=terrains or [])
    return doc


def _box(points: list[dict] | list) -> tuple[float, float, float, float]:
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    return min(xs), min(ys), max(xs), max(ys)


# ---- the pieces ----

def test_runs_decode_to_one_terrain_per_cell() -> None:
    assert decode_runs([1, 3, 0, 2, 2, 1], 6) == [1, 1, 1, 0, 0, 2]
    assert decode_runs([1, 2], 4) == [1, 1, 0, 0]


def test_areas_are_four_connected_and_know_whether_they_touch_the_edge() -> None:
    w, h, cells = _grid(["000", "010", "000"])
    labels, areas = label_areas(cells, w, h)
    assert len(areas) == 2
    assert areas[labels[4]][:3] == [1, 1, 0]  # the middle cell: terrain 1, one cell, not on the edge
    w, h, cells = _grid(["10", "01"])
    assert len(label_areas(cells, w, h)[1]) == 4  # diagonal cells are not neighbours


def test_a_speck_goes_to_the_terrain_around_it() -> None:
    w, h, cells = _grid(["2222", "2122", "2222"])
    assert merge_small(cells, w, h, 2) == [2] * 12


def test_growing_a_square_outline_moves_every_corner_out() -> None:
    assert grow([(0, 0), (2, 0), (2, 2), (0, 2)], 0.5) == [(-0.5, -0.5), (2.5, -0.5), (2.5, 2.5), (-0.5, 2.5)]


def test_simplifying_turns_a_staircase_into_a_slope() -> None:
    stairs = [(0.0, 0.0)] + [(float(i), float(i)) for i in range(1, 10)] + [(9.0, 10.0), (0.0, 10.0)]
    stepped = []
    for i in range(10):
        stepped += [(float(i), float(i)), (float(i + 1), float(i))]
    stepped += [(10.0, 10.0), (0.0, 10.0)]
    assert len(simplify_closed(stepped, 0.75)) <= 4
    assert len(simplify_closed(stairs, 0.75)) <= 4


def test_unit_words_become_a_unit_system() -> None:
    assert units_of("miles") == ("imperial", "mi")
    assert units_of("Feet") == ("imperial", "ft")
    assert units_of("km") == ("metric", "km")
    assert units_of("paces") == ("custom", "paces")


# ---- tracing a map ----

def test_a_map_of_one_terrain_is_its_base_and_no_shapes() -> None:
    doc = _old_map(["0000", "0000"])
    assert upgrade_map(doc, {}) is True
    assert (doc.mapFormat, doc.level, doc.units, doc.unit) == (2, "planetary", "imperial", "mi")
    assert doc.base.biome == "saltwater" and doc.base.height < 0  # the planetary sea floor, in feet
    assert doc.shapes == [] and doc.legacyGrid == [4, 2]
    assert upgrade_map(doc, {}) is False  # once only


def test_an_island_becomes_one_smooth_shape_round_its_cells() -> None:
    doc = _old_map(["000000", "011110", "011110", "000000"])
    upgrade_map(doc, {})
    assert len(doc.shapes) == 1
    island = doc.shapes[0]
    assert (island.type, island.biome, island.layerId, island.id) == ("biome", "plain", "terrain", "trc_0001")
    assert all(p.smooth for p in island.points)
    x0, y0, x1, y1 = _box(island.points)
    assert (x0, y0, x1, y1) == (0.7, 0.7, 5.3, 3.3)  # grown by 0.3 cell on every side
    assert next(layer for layer in doc.layers if layer.kind == "terrain").name == "Biomes"


def test_a_lake_inside_an_island_is_drawn_after_it_and_an_inland_sea_is_traced() -> None:
    doc = _old_map(["00000000", "01111110", "01222210", "01200210", "01222210", "01111110", "00000000"])
    upgrade_map(doc, {})
    assert [s.biome for s in doc.shapes] == ["plain", "forest", "saltwater"]  # largest outline first, so what is inside lands on top


def test_a_speck_on_a_world_map_is_merged_into_its_surroundings() -> None:
    doc = _old_map(["00000", "01110", "01210", "01110", "00000"])
    upgrade_map(doc, {})
    assert [s.biome for s in doc.shapes] == ["plain"]


def test_hills_and_mountains_lift_the_land() -> None:
    doc = _old_map(["000000", "033440", "033440", "000000"], unit="km")
    upgrade_map(doc, {})
    by_biome = {s.biome: s for s in doc.shapes}
    assert (by_biome["plain"].heightMode, by_biome["plain"].height) == ("raise", 480.0)   # 6% of the 8,000 m range
    assert (by_biome["rocky"].heightMode, by_biome["rocky"].height) == ("raise", 3200.0)  # 40%
    # Hills rise smoothly, mountains to a peak.
    assert (by_biome["plain"].profile, by_biome["rocky"].profile) == ("hill", "peak")


def test_the_authors_own_terrain_becomes_a_project_biome_and_a_recoloured_one_too() -> None:
    terrains = [
        MapTerrain(id="ocean", name="Ocean", color="#3b6ea5", builtIn=True),
        MapTerrain(id="ter_salt", name="Salt flats", color="#efe6d2", builtIn=False),
    ]
    own: dict = {}
    doc = _old_map(["0000", "0110", "0110", "0000"], terrains=terrains)
    upgrade_map(doc, own)
    bid = own_biome_id("Salt flats", "#efe6d2")
    assert list(own) == [bid] and own[bid].name == "Salt flats" and own[bid].color == "#efe6d2"
    assert doc.shapes[0].biome == bid
    again: dict = {}
    other = _old_map(["0000", "0110", "0110", "0000"], terrains=terrains)
    upgrade_map(other, again)
    assert list(again) == [bid]  # the same name and colour give the same id


def test_rooms_keep_square_corners_and_single_cells() -> None:
    doc = _old_map(["0000", "0130", "0110", "0000"], kind="interior", unit="feet")  # floor (1) and a one-cell door (3)
    upgrade_map(doc, {})
    assert doc.level == "interior" and doc.base.biome == "outside"
    assert len(doc.shapes) == 2  # the floor and the one-cell door, kept
    assert not any(p.smooth for s in doc.shapes for p in s.points)
    floor, door = doc.shapes
    assert len(floor.points) == 6  # an L, square corners
    assert len(door.points) == 4 and round(_box(door.points)[2] - _box(door.points)[0], 2) == 1.08


def test_town_terrains_become_their_materials_and_the_base_is_the_most_common() -> None:
    doc = _old_map(["11111", "10001", "11111"], kind="town", unit="paces")
    upgrade_map(doc, {})
    assert (doc.level, doc.units, doc.unit) == ("local", "custom", "paces")
    assert doc.base.biome == "paving"  # road is the most common terrain
    assert [s.biome for s in doc.shapes] == ["dirt"]


def test_tracing_is_deterministic() -> None:
    rows = ["0011100", "0122210", "1123211", "0122210", "0011100"]
    a, b = _old_map(rows), _old_map(rows)
    upgrade_map(a, {})
    upgrade_map(b, {})
    assert a.model_dump(exclude={"updatedAt"}) == b.model_dump(exclude={"updatedAt"})


def test_a_large_noisy_map_stays_within_the_limits_and_traces_quickly() -> None:
    import random

    rnd = random.Random(7)
    width = height = 256
    cells = [rnd.choice((0, 0, 0, 1, 2, 5)) for _ in range(width * height)]
    doc = MapDoc(id="map_big", kind="world", width=width, height=height, cells=_encode(cells))
    start = time.perf_counter()
    upgrade_map(doc, {})
    took = time.perf_counter() - start
    assert len(doc.shapes) <= 2000
    assert all(len(s.points) <= MAP_MAX_SHAPE_POINTS for s in doc.shapes)
    assert sum(len(s.points) for s in doc.shapes) <= 30000
    assert took < 60
