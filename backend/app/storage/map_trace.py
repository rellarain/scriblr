"""Tracing the painted cells of a map from before levels into biome shapes, once (see schema.MapDoc.mapFormat).

A map of format 1 is a grid of cells, each an index into the map's own terrain palette. A map of format 2 is biome shapes (smooth closed outlines,
drawn in order over a base biome). Here every connected area of one terrain becomes a biome shape:

- the base is the terrain with the most cells; an area of the base that touches the edge of the map needs no shape (the base shows there);
- the outer boundary of each area is followed along the cell edges (an area's holes need no outline: what is in them is traced too, and drawn later,
  because the shapes are drawn largest first, and an area inside another's hole is always smaller than that other's outline);
- the outline is grown a little (so the smoothed outlines of neighbours overlap instead of leaving a gap), simplified, and its points made smooth;
  on local and interior maps it keeps its square corners (walls stay square) and is grown only enough to hide seams;
- a terrain of the old palettes becomes its biome; one of the author's own becomes a project biome of the same name and colour.

Everything here is pure and deterministic (the same map gives the same shapes and ids), because a project read twice must read the same.
"""

import hashlib
from typing import Optional

from . import map_markers

from .schema import (
    LEVEL_OF_KIND,
    MAP_LEVEL_DEFAULTS,
    MAP_MAX_BIOME_SHAPES,
    MAP_MAX_PROJECT_BIOMES,
    MAP_MAX_SHAPE_POINTS,
    METRES_PER_FOOT,
    BookEdition,
    MapBase,
    MapBiome,
    MapDoc,
    MapShape,
    MapShapePoint,
    ProjectFile,
    seed_biomes,
)

# The terrains of the old palettes (by kind and terrain id) as biomes, and how much a hill or a mountain lifts the land (a share of the level's height range).
_TERRAIN_BIOMES: dict[str, dict[str, tuple[str, float]]] = {
    "world": {
        "ocean": ("saltwater", 0.0), "plains": ("plain", 0.0), "forest": ("forest", 0.0), "hills": ("plain", 0.06), "mountains": ("rocky", 0.4),
        "desert": ("desert", 0.0), "snow": ("tundra", 0.0), "swamp": ("swamp", 0.0),
    },
    "town": {"ground": ("dirt", 0.0), "road": ("paving", 0.0), "building": ("urban", 0.0), "park": ("plain", 0.0), "water": ("freshwater", 0.0)},
    "interior": {"void": ("outside", 0.0), "floor": ("wood", 0.0), "wall": ("stone", 0.0), "door": ("wood", 0.0), "water": ("freshwater", 0.0)},
}
# How the height of a lifted terrain spreads over its area: hills rise smoothly, mountains to a peak.
_LIFT_PROFILE = {"hills": "hill", "mountains": "peak"}
# The levels whose maps keep square corners (rooms, walls, streets) rather than smooth outlines.
_SQUARE_LEVELS = ("local", "architectural", "interior")
_MAX_POINTS_PER_MAP = 30000

# The free-text units of older maps, read as a unit system (anything else stays custom, as written).
_UNIT_WORDS: dict[str, tuple[str, str]] = {
    "mi": ("imperial", "mi"), "mile": ("imperial", "mi"), "miles": ("imperial", "mi"),
    "ft": ("imperial", "ft"), "foot": ("imperial", "ft"), "feet": ("imperial", "ft"),
    "yd": ("imperial", "yd"), "yard": ("imperial", "yd"), "yards": ("imperial", "yd"),
    "km": ("metric", "km"), "kilometre": ("metric", "km"), "kilometres": ("metric", "km"), "kilometer": ("metric", "km"), "kilometers": ("metric", "km"),
    "m": ("metric", "m"), "metre": ("metric", "m"), "metres": ("metric", "m"), "meter": ("metric", "m"), "meters": ("metric", "m"),
}


def units_of(unit: str) -> tuple[str, str]:
    """The unit system and unit of an older map's unit text ("miles" -> imperial mi; "paces" stays custom)."""
    return _UNIT_WORDS.get(unit.strip().lower(), ("custom", unit))


def decode_runs(runs: list[int], total: int) -> list[int]:
    """The run pairs [terrain index, count, ...] as one terrain index per cell (`total` cells; a shortfall is the first terrain)."""
    cells = [0] * total
    at = 0
    for i in range(0, len(runs) - 1, 2):
        value, count = runs[i], runs[i + 1]
        if count < 1 or value < 0:
            continue
        count = min(count, total - at)
        if count <= 0:
            break
        if value:
            cells[at:at + count] = [value] * count
        at += count
    return cells


def label_areas(cells: list[int], width: int, height: int) -> tuple[list[int], list[list[int]]]:
    """The connected areas (4-neighbours, one terrain): a label per cell, and per area [terrain, cell count, touches the edge (0/1), first cell]."""
    labels = [-1] * len(cells)
    areas: list[list[int]] = []
    for start in range(len(cells)):
        if labels[start] != -1:
            continue
        terrain = cells[start]
        n = len(areas)
        count, edge = 0, 0
        labels[start] = n
        stack = [start]
        while stack:
            i = stack.pop()
            count += 1
            x, y = i % width, i // width
            if x == 0 or y == 0 or x == width - 1 or y == height - 1:
                edge = 1
            if x > 0 and labels[i - 1] == -1 and cells[i - 1] == terrain:
                labels[i - 1] = n
                stack.append(i - 1)
            if x < width - 1 and labels[i + 1] == -1 and cells[i + 1] == terrain:
                labels[i + 1] = n
                stack.append(i + 1)
            if y > 0 and labels[i - width] == -1 and cells[i - width] == terrain:
                labels[i - width] = n
                stack.append(i - width)
            if y < height - 1 and labels[i + width] == -1 and cells[i + width] == terrain:
                labels[i + width] = n
                stack.append(i + width)
        areas.append([terrain, count, edge, start])
    return labels, areas


def merge_small(cells: list[int], width: int, height: int, min_size: int) -> list[int]:
    """The cells with every area smaller than `min_size` given to the terrain it shares the longest border with (smallest areas first)."""
    labels, areas = label_areas(cells, width, height)
    out = list(cells)
    small = sorted((n for n, a in enumerate(areas) if a[1] < min_size), key=lambda n: (areas[n][1], areas[n][3]))
    if not small:
        return out
    members: dict[int, list[int]] = {n: [] for n in small}
    for i, n in enumerate(labels):
        if n in members:
            members[n].append(i)
    for n in small:
        border: dict[int, int] = {}
        mine = members[n]
        own = out[mine[0]]
        for i in mine:
            x, y = i % width, i // width
            for j, ok in ((i - 1, x > 0), (i + 1, x < width - 1), (i - width, y > 0), (i + width, y < height - 1)):
                if ok and out[j] != own:
                    border[out[j]] = border.get(out[j], 0) + 1
        if border:
            best = max(sorted(border), key=lambda t: border[t])
            for i in mine:
                out[i] = best
    return out


def _outer_loop(cells_of_area: set[int], width: int) -> list[tuple[int, int]]:
    """The outer boundary of an area as corner points (cell corners), clockwise on screen (the area on the right of travel), corners only."""
    outgoing: dict[tuple[int, int], list[tuple[int, int]]] = {}

    def add(a: tuple[int, int], b: tuple[int, int]) -> None:
        outgoing.setdefault(a, []).append(b)

    for i in cells_of_area:
        x, y = i % width, i // width
        if y == 0 or (i - width) not in cells_of_area:
            add((x, y), (x + 1, y))
        if (x + 1) % width == 0 or (i + 1) not in cells_of_area:
            add((x + 1, y), (x + 1, y + 1))
        if (i + width) not in cells_of_area:
            add((x + 1, y + 1), (x, y + 1))
        if x == 0 or (i - 1) not in cells_of_area:
            add((x, y + 1), (x, y))

    loops: list[list[tuple[int, int]]] = []
    for start in sorted(outgoing):
        while outgoing.get(start):
            loop = [start]
            prev = start
            cur = outgoing[start].pop(0)
            while cur != start:
                loop.append(cur)
                dx, dy = cur[0] - prev[0], cur[1] - prev[1]
                options = outgoing[cur]
                if len(options) == 1:
                    nxt = options.pop()
                else:
                    # At a corner where the area touches itself diagonally: turn right first (hug this cell), so loops stay simple.
                    order = [(-dy, dx), (dx, dy), (dy, -dx)]
                    nxt = min(options, key=lambda p: order.index((p[0] - cur[0], p[1] - cur[1])) if (p[0] - cur[0], p[1] - cur[1]) in order else 9)
                    options.remove(nxt)
                prev, cur = cur, nxt
            loops.append(loop)
    best = max(loops, key=lambda lp: abs(_area(lp)))
    return _corners(best)


def _area(points: list[tuple[float, float]]) -> float:
    s = 0.0
    for i, (x0, y0) in enumerate(points):
        x1, y1 = points[(i + 1) % len(points)]
        s += x0 * y1 - x1 * y0
    return s / 2


def _corners(loop: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """The loop without the points in the middle of a straight run."""
    out = []
    n = len(loop)
    for i in range(n):
        a, b, c = loop[i - 1], loop[i], loop[(i + 1) % n]
        if (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) != 0:
            out.append(b)
    return out or loop


def grow(corners: list[tuple[int, int]], delta: float) -> list[tuple[float, float]]:
    """A square-cornered outline (clockwise on screen) moved outward by `delta`: each corner moves along both of its edges' outward sides."""
    n = len(corners)
    out = []
    for i in range(n):
        a, b, c = corners[i - 1], corners[i], corners[(i + 1) % n]
        din = (_sign(b[0] - a[0]), _sign(b[1] - a[1]))
        dout = (_sign(c[0] - b[0]), _sign(c[1] - b[1]))
        # Outward is the left of travel (the area is on the right).
        nx = din[1] + dout[1]
        ny = -din[0] - dout[0]
        out.append((b[0] + delta * nx, b[1] + delta * ny))
    return out


def _sign(v: float) -> int:
    return (v > 0) - (v < 0)


def simplify_closed(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    """Douglas-Peucker on a closed outline, from its two points farthest apart."""
    n = len(points)
    if n <= 4 or epsilon <= 0:
        return list(points)
    first = 0
    far = max(range(n), key=lambda i: (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2)
    a = _douglas(points[first:far + 1], epsilon)
    b = _douglas(points[far:] + points[:1], epsilon)
    out = a[:-1] + b[:-1]
    return out if len(out) >= 3 else list(points)


def _douglas(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        if e <= s + 1:
            continue
        (x0, y0), (x1, y1) = points[s], points[e]
        dx, dy = x1 - x0, y1 - y0
        length = (dx * dx + dy * dy) ** 0.5
        best, at = -1.0, -1
        for i in range(s + 1, e):
            px, py = points[i]
            d = abs(dy * (px - x0) - dx * (py - y0)) / length if length else ((px - x0) ** 2 + (py - y0) ** 2) ** 0.5
            if d > best:
                best, at = d, i
        if best > epsilon:
            keep[at] = True
            stack.append((s, at))
            stack.append((at, e))
    return [p for p, k in zip(points, keep) if k]


def own_biome_id(name: str, color: str) -> str:
    return "own_" + hashlib.sha1(f"{name.strip().lower()}|{color.lower()}".encode("utf-8")).hexdigest()[:8]


def _height_unit_factor(units: str) -> float:
    """How many of the map's height units make a metre (feet for imperial maps, metres otherwise)."""
    return 1 / METRES_PER_FOOT if units == "imperial" else 1.0


# The format a map has once its painted cells are biome shapes (its symbols are turned into marker shapes after: map_markers).
TRACED_FORMAT = 2


def upgrade_map(doc: MapDoc, own: dict[str, MapBiome]) -> bool:
    """Make a map of format 1 one of format 2, in place: its level from its kind, its unit system from its unit, and its painted cells traced into biome
    shapes over a base. The author's own terrains become project biomes, added to `own` (id -> biome). Returns whether it changed anything."""
    if doc.mapFormat >= TRACED_FORMAT:
        return False
    level = doc.level if doc.level else LEVEL_OF_KIND.get(doc.kind, "planetary")
    doc.level = level
    units, unit = units_of(doc.unit)
    doc.units = units  # type: ignore[assignment]
    doc.unit = unit
    defaults = MAP_LEVEL_DEFAULTS[level]
    factor = _height_unit_factor(units)
    height_range = defaults.heightRange * factor

    # Each terrain of the palette as a biome and a lift.
    table = _TERRAIN_BIOMES.get(doc.kind, {})
    as_biome: list[tuple[str, float]] = []
    profiles: list[str] = []
    for t in doc.terrains:
        known = table.get(t.id) if t.builtIn else None
        if known is not None:
            biome, lift = known
            as_biome.append((biome, round(lift * height_range)))
            profiles.append(_LIFT_PROFILE.get(t.id, "plateau"))
        else:
            bid = own_biome_id(t.name or t.id, t.color)
            if bid not in own:
                own[bid] = MapBiome(id=bid, name=(t.name or t.id)[:40], color=t.color, group="land")
            as_biome.append((bid, 0.0))
            profiles.append("plateau")
    if not as_biome:
        as_biome = [(defaults.base, 0.0)]
        profiles = ["plateau"]

    width, height = doc.width, doc.height
    total = width * height
    cells = decode_runs(doc.cells, total) if doc.cells else [0] * total
    cells = [c if 0 <= c < len(as_biome) else 0 for c in cells]

    square = level in _SQUARE_LEVELS
    counts = [0] * len(as_biome)
    for c in cells:
        counts[c] += 1
    base_terrain = max(range(len(as_biome)), key=lambda t: (counts[t], -t))
    base_biome, base_lift = as_biome[base_terrain]
    base_height = defaults.baseHeight * factor if base_biome == "saltwater" else base_lift
    doc.base = MapBase(biome=base_biome, height=round(base_height))

    # Merge specks (not on local and interior maps, where one cell can be a door) and keep within the shape limit.
    min_size = 1 if square else 2
    while True:
        if min_size > 1:
            cells = merge_small(cells, width, height, min_size)
        labels, areas = label_areas(cells, width, height)
        wanted = [n for n, a in enumerate(areas) if not (a[0] == base_terrain and a[2])]
        if len(wanted) <= MAP_MAX_BIOME_SHAPES:
            break
        min_size = max(2, min_size * 2)

    members: dict[int, set[int]] = {n: set() for n in wanted}
    for i, n in enumerate(labels):
        if n in members:
            members[n].add(i)
    outlines = []
    for n in wanted:
        corners = _outer_loop(members[n], width)
        outlines.append((n, corners, abs(_area(corners))))
    outlines.sort(key=lambda o: (-o[2], areas[o[0]][0], areas[o[0]][3]))

    # 0.75 lets a one-cell staircase become a slope (its corners are 0.71 off the diagonal).
    delta = 0.04 if square else 0.3
    epsilon = 0.0 if square else 0.75
    grown = [(n, grow(corners, delta)) for n, corners, _ in outlines]

    def simplified(eps: float) -> list[list[tuple[float, float]]]:
        out = []
        for _, pts in grown:
            e = eps
            s = simplify_closed(pts, e) if e > 0 else pts
            while len(s) > MAP_MAX_SHAPE_POINTS:
                e = max(e * 1.5, 0.5)
                s = simplify_closed(pts, e)
            out.append(s)
        return out

    shapes_points = simplified(epsilon)
    while sum(len(s) for s in shapes_points) > _MAX_POINTS_PER_MAP:
        epsilon = max(epsilon * 1.5, 0.6)
        shapes_points = simplified(epsilon)

    layer = next((layer for layer in doc.layers if layer.kind == "terrain"), None)
    if layer is not None and layer.name in ("", "Terrain"):
        layer.name = "Biomes"
    layer_id = layer.id if layer is not None else "terrain"
    taken = {s.id for s in doc.symbols} | {s.id for s in doc.shapes}
    traced: list[MapShape] = []
    number = 0
    for (n, _), pts in zip(grown, shapes_points):
        number += 1
        sid = f"trc_{number:04d}"
        while sid in taken:
            number += 1
            sid = f"trc_{number:04d}"
        taken.add(sid)
        biome, lift = as_biome[areas[n][0]]
        points = [MapShapePoint(x=round(min(width, max(0.0, x)), 2), y=round(min(height, max(0.0, y)), 2), smooth=not square) for x, y in pts]
        traced.append(MapShape(
            id=sid, layerId=layer_id, type="biome", points=points, biome=biome,
            heightMode="raise" if lift > 0 else "none", height=float(lift), profile=profiles[areas[n][0]] if lift > 0 else "plateau",
        ))
    doc.shapes = traced + list(doc.shapes)
    doc.mapFormat = TRACED_FORMAT
    doc.legacyGrid = [width, height]
    return True


def _used_biomes(doc: MapDoc) -> set[str]:
    used = {doc.base.biome}
    used.update(s.biome for s in doc.shapes if s.type == "biome" and s.biome)
    return used


def upgrade_project(pf: ProjectFile) -> bool:
    """Trace every map of format 1 of the project (and of its editions) into biome shapes. New project biomes join the project's list (an edition keeps
    the biomes its maps use in its own frozen list instead). Returns whether anything changed."""
    changed = False
    own: dict[str, MapBiome] = {b.id: b for b in pf.mapBiomes}
    for doc in pf.maps.values():
        changed = upgrade_map(doc, own) or changed
        changed = map_markers.upgrade_map(doc) or changed
    if changed:
        known = {b.id for b in pf.mapBiomes}
        for bid in sorted(own):
            if bid not in known and len(pf.mapBiomes) < MAP_MAX_PROJECT_BIOMES:
                pf.mapBiomes.append(own[bid])
    seed = {b.id: b for b in seed_biomes()}
    for listing in pf.bookListings.values():
        for edition in listing.editions:
            changed = _upgrade_edition(edition, own, seed) or changed
    if changed:
        pf._maps_upgraded = True
    return changed


def _upgrade_edition(edition: BookEdition, own: dict[str, MapBiome], seed: dict[str, MapBiome]) -> bool:
    mine: dict[str, MapBiome] = dict(own)
    changed = False
    traced = False
    for frozen in edition.maps:
        traced = upgrade_map(frozen.doc, mine) or traced
        changed = map_markers.upgrade_map(frozen.doc) or changed
    changed = changed or traced
    if not traced:
        return changed
    for frozen in edition.maps:
        for bid in sorted(_used_biomes(frozen.doc)):
            if bid in edition.biomes:
                continue
            found: Optional[MapBiome] = seed.get(bid) or mine.get(bid)
            if found is not None:
                edition.biomes[bid] = found.model_copy(deep=True)
    return True
