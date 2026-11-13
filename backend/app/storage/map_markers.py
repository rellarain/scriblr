"""Turning the symbols of a map into marker shapes, once (MapDoc.mapFormat 2 -> 3).

Before shape libraries a map was stamped with symbols (a castle, a tree, a door ...: a kind of the front end's library, a centre, a width in cells and an
optional colour). They are now shapes: each symbol becomes a copy of its kind's marker from the starter library (app/seed/map_shapes.json, written by the
front end's `npm run map-shapes` from the same silhouettes the symbols were drawn with), placed in the same square, with the same id, colour, name and maps,
so a place, a scene's location, a link and a reveal that named the symbol name the marker. A symbols layer stays, as a markers layer ("Markers"). The
symbols are kept in the file as they were (`legacySymbols`, unused).
"""

import json
import sys
from functools import lru_cache
from pathlib import Path

from .schema import MapDoc, MapLibraryShape, MapShape, MapShapePoint, MapShapeCatalog, PublishedMapShapes, library_list, MAP_MAX_LIBRARY_SHAPES, utcnow

# The format a map has once its symbols are marker shapes.
MARKER_FORMAT = 3


def _seed_path() -> Path:
    # The packaged app keeps the data files of app/seed beside its code (see scriblr.spec).
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "app" / "seed" / "map_shapes.json"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent / "seed" / "map_shapes.json"


@lru_cache(maxsize=1)
def _seed_file() -> tuple[int, tuple[MapLibraryShape, ...]]:
    raw = json.loads(_seed_path().read_text(encoding="utf-8"))
    shapes = library_list(raw.get("shapes"), MAP_MAX_LIBRARY_SHAPES)
    return int(raw.get("seedVersion", 1)), tuple(shapes)


def seed_version() -> int:
    return _seed_file()[0]


def seed_shapes() -> list[MapLibraryShape]:
    """The default shapes that come with the app (a new install publishes them as version 1)."""
    return [s.model_copy(deep=True) for s in _seed_file()[1]]


def default_shape_catalog() -> MapShapeCatalog:
    shapes = seed_shapes()
    return MapShapeCatalog(
        seedVersion=seed_version(), draft=shapes, published=PublishedMapShapes(version=1, publishedAt=utcnow(), shapes=[s.model_copy(deep=True) for s in shapes]),
        nextVersion=2,
    )


def _markers() -> dict[str, MapLibraryShape]:
    return {s.id: s for s in _seed_file()[1] if s.category == "marker"}


def _placed(points: list[MapShapePoint], x0: float, y0: float, size: float) -> list[MapShapePoint]:
    return [
        MapShapePoint(
            x=round(x0 + p.x * size, 3), y=round(y0 + p.y * size, 3), smooth=p.smooth,
            hx=None if p.hx is None else round(p.hx * size, 3), hy=None if p.hy is None else round(p.hy * size, 3),
        )
        for p in points
    ]


def upgrade_map(doc: MapDoc) -> bool:
    """Turn a map's symbols into marker shapes, in place (a map of format 2; one of format 1 is traced first). Returns whether it changed anything."""
    if doc.mapFormat >= MARKER_FORMAT or doc.mapFormat < 2:
        return False
    markers = _markers()
    fallback = markers.get("marker:place")
    # A symbols layer is a markers layer now (it holds the marker shapes, above the regions); one with the old default name takes the new one.
    for layer in doc.layers:
        if layer.kind == "symbols" and layer.name in ("", "Symbols"):
            layer.name = "Markers"
    made: list[MapShape] = []
    for sym in doc.symbols:
        lib = markers.get(f"marker:{sym.kind}") or fallback
        if lib is None:
            continue
        x0, y0 = sym.x - sym.size / 2, sym.y - sym.size / 2
        made.append(MapShape(
            id=sym.id, layerId=sym.layerId, type="region", points=_placed(lib.points, x0, y0, sym.size),
            holes=[_placed(ring, x0, y0, sym.size) for ring in lib.holes], style="halo", color=None, width=lib.width, fill=sym.color, opacity=1.0,
            pattern="solid", name=sym.name, mapIds=list(sym.mapIds), kind=lib.id,
        ))
    doc.legacySymbols = [s.model_copy(deep=True) for s in doc.symbols]
    doc.symbols = []
    doc.shapes = [*doc.shapes, *made]
    doc.mapFormat = MARKER_FORMAT
    return True
