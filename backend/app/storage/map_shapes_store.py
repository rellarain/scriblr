"""Global (not project-scoped) storage for map shape libraries (see schema.py, "Map shape libraries").

The admin's default shapes: %APPDATA%\\Scriblr\\map-shapes.json, one draft (edited on Configuration > Maps, Shapes) published as a whole; every project
offers the published list. A new install starts with the starter list (app/seed/map_shapes.json) published as version 1. A shape taken out of the draft
is simply no longer offered: maps hold copies, so nothing on a map changes.

A writer's own shapes ("My shapes"): %APPDATA%\\Scriblr\\my-map-shapes.json, offered in every project and grouped by the project each was saved from.
"""

import secrets
import threading
from pathlib import Path
from typing import Callable

from . import map_markers, project_store
from .schema import (
    MAP_MAX_MY_SHAPES,
    MAP_SHAPE_HISTORY_MAX,
    MapLibraryShape,
    MapShapeCatalog,
    MyMapShape,
    MyMapShapes,
    PublishedMapShapes,
    utcnow,
)

_lock = threading.RLock()


class UnknownVersionError(ValueError):
    """The list has no such published version."""


class PublishRefusedError(ValueError):
    """The draft cannot be published as it is; the message says what to fix."""


class MyShapeNotFoundError(ValueError):
    """There is no such shape among My shapes."""


class MyShapesFullError(ValueError):
    """My shapes holds as many as it can."""


# ---------------------------------------------------------------------------------------------------------------- the admin's default shapes

def _path(root: Path) -> Path:
    return root / "map-shapes.json"


def load_catalog(root: Path) -> MapShapeCatalog:
    with _lock:
        path = _path(root)
        if not path.exists():
            catalog = map_markers.default_shape_catalog()
            save_catalog(root, catalog)
            return catalog
        catalog = project_store._read_shard(path, MapShapeCatalog)
        # Starter shapes added by a later build join the draft and the published list once.
        if catalog.seedVersion < map_markers.seed_version():
            ids = {s.id for s in catalog.draft} | ({s.id for s in catalog.published.shapes} if catalog.published else set())
            fresh = [s for s in map_markers.seed_shapes() if s.id not in ids]
            catalog.draft.extend(s.model_copy(deep=True) for s in fresh)
            if catalog.published:
                catalog.published.shapes.extend(s.model_copy(deep=True) for s in fresh)
            catalog.seedVersion = map_markers.seed_version()
            save_catalog(root, catalog)
        return catalog


def save_catalog(root: Path, catalog: MapShapeCatalog) -> None:
    project_store._write_shard(root, _path(root), catalog)


def _mutate(root: Path, change: Callable[[MapShapeCatalog], None]) -> MapShapeCatalog:
    with _lock:
        catalog = load_catalog(root)
        change(catalog)
        save_catalog(root, catalog)
        return catalog


def save_draft(root: Path, shapes: list[MapLibraryShape]) -> MapShapeCatalog:
    def change(catalog: MapShapeCatalog) -> None:
        catalog.draft = [s.model_copy(deep=True) for s in shapes]

    return _mutate(root, change)


def publish_faults(shapes: list[MapLibraryShape]) -> list[str]:
    faults: list[str] = []
    names: set[tuple[str, str]] = set()
    for s in shapes:
        key = (s.category, s.name.casefold())
        if key in names:
            faults.append(f"Two shapes of one category are called {s.name}.")
        names.add(key)
    return faults


def publish(root: Path) -> MapShapeCatalog:
    """Publish the draft as the next version."""

    def change(catalog: MapShapeCatalog) -> None:
        faults = publish_faults(catalog.draft)
        if faults:
            raise PublishRefusedError(" ".join(faults))
        if catalog.published:
            catalog.history = [catalog.published, *catalog.history][:MAP_SHAPE_HISTORY_MAX]
        catalog.published = PublishedMapShapes(version=catalog.nextVersion, publishedAt=utcnow(), shapes=[s.model_copy(deep=True) for s in catalog.draft])
        catalog.nextVersion += 1

    return _mutate(root, change)


def discard(root: Path) -> MapShapeCatalog:
    """Put the draft back to the published list."""

    def change(catalog: MapShapeCatalog) -> None:
        source = catalog.published.shapes if catalog.published else map_markers.seed_shapes()
        catalog.draft = [s.model_copy(deep=True) for s in source]

    return _mutate(root, change)


def restore_version(root: Path, version: int) -> MapShapeCatalog:
    """Bring an earlier published version into the draft (it is published again only with Publish)."""

    def change(catalog: MapShapeCatalog) -> None:
        found = [v for v in ([catalog.published] if catalog.published else []) + catalog.history if v.version == version]
        if not found:
            raise UnknownVersionError(f"the shape library has no version {version}")
        catalog.draft = [s.model_copy(deep=True) for s in found[0].shapes]

    return _mutate(root, change)


def published_shapes(root: Path) -> list[MapLibraryShape]:
    catalog = load_catalog(root)
    return list(catalog.published.shapes) if catalog.published else map_markers.seed_shapes()


# ---------------------------------------------------------------------------------------------------------------- My shapes

def _my_path(root: Path) -> Path:
    return root / "my-map-shapes.json"


def load_my_shapes(root: Path) -> MyMapShapes:
    with _lock:
        path = _my_path(root)
        if not path.exists():
            return MyMapShapes()
        return project_store._read_shard(path, MyMapShapes)


def _my_mutate(root: Path, change: Callable[[MyMapShapes], None]) -> MyMapShapes:
    with _lock:
        mine = load_my_shapes(root)
        change(mine)
        project_store._write_shard(root, _my_path(root), mine)
        return mine


def add_my_shape(root: Path, shape: MapLibraryShape, project_id: str, project_title: str) -> MyMapShape:
    """Keep a shape among My shapes (a new id of its own), with the project it came from."""
    made: list[MyMapShape] = []

    def change(mine: MyMapShapes) -> None:
        if len(mine.shapes) >= MAP_MAX_MY_SHAPES:
            raise MyShapesFullError(f"My shapes holds at most {MAP_MAX_MY_SHAPES} shapes")
        taken = {s.id for s in mine.shapes}
        sid = f"my_{secrets.token_hex(4)}"
        while sid in taken:
            sid = f"my_{secrets.token_hex(4)}"
        entry = MyMapShape(**{**shape.model_dump(), "id": sid, "projectId": project_id, "projectTitle": project_title, "savedAt": utcnow()})
        mine.shapes.append(entry)
        made.append(entry)

    _my_mutate(root, change)
    return made[0]


def edit_my_shape(root: Path, shape_id: str, name: str | None) -> MyMapShape:
    found: list[MyMapShape] = []

    def change(mine: MyMapShapes) -> None:
        for s in mine.shapes:
            if s.id == shape_id:
                if name is not None:
                    s.name = name.strip()[:60] or s.name
                found.append(s)
                return
        raise MyShapeNotFoundError(shape_id)

    _my_mutate(root, change)
    return found[0]


def delete_my_shape(root: Path, shape_id: str) -> None:
    def change(mine: MyMapShapes) -> None:
        if not any(s.id == shape_id for s in mine.shapes):
            raise MyShapeNotFoundError(shape_id)
        mine.shapes = [s for s in mine.shapes if s.id != shape_id]

    _my_mutate(root, change)
