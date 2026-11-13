"""Global (not project-scoped) storage for the admin's biome list (see schema.py, "biomes"): %APPDATA%\\Scriblr\\map-biomes.json, beside presets.json.

The list is one draft (edited on Configuration > Maps) published as a whole: every project draws its maps with the published list. A new install starts
with the starter list published as version 1. A biome that was published and is then taken out of the draft stays in the published list as retired,
so the maps that use it keep its colour; it is simply no longer offered.
"""

import threading
from pathlib import Path
from typing import Callable

from . import project_store
from .schema import (
    MAP_BIOME_HISTORY_MAX,
    MapBiome,
    MapBiomeCatalog,
    PublishedBiomes,
    seed_biomes,
    utcnow,
)

# How much of the starter list a catalog has seen (raise it when starter biomes are added: they join the draft and the published list once).
SEED_VERSION = 1

_lock = threading.RLock()


class UnknownVersionError(ValueError):
    """The list has no such published version."""


class PublishRefusedError(ValueError):
    """The draft cannot be published as it is; the message says what to fix."""


def _path(root: Path) -> Path:
    return root / "map-biomes.json"


def default_catalog() -> MapBiomeCatalog:
    biomes = seed_biomes()
    return MapBiomeCatalog(
        seedVersion=SEED_VERSION, draft=biomes, published=PublishedBiomes(version=1, publishedAt=utcnow(), biomes=[b.model_copy() for b in biomes]), nextVersion=2,
    )


def load_catalog(root: Path) -> MapBiomeCatalog:
    with _lock:
        path = _path(root)
        if not path.exists():
            catalog = default_catalog()
            save_catalog(root, catalog)
            return catalog
        return project_store._read_shard(path, MapBiomeCatalog)


def save_catalog(root: Path, catalog: MapBiomeCatalog) -> None:
    project_store._write_shard(root, _path(root), catalog)


def _mutate(root: Path, change: Callable[[MapBiomeCatalog], None]) -> MapBiomeCatalog:
    with _lock:
        catalog = load_catalog(root)
        change(catalog)
        save_catalog(root, catalog)
        return catalog


def save_draft(root: Path, biomes: list[MapBiome]) -> MapBiomeCatalog:
    def change(catalog: MapBiomeCatalog) -> None:
        catalog.draft = [b.model_copy(deep=True) for b in biomes]

    return _mutate(root, change)


def publish_faults(biomes: list[MapBiome]) -> list[str]:
    faults: list[str] = []
    names: dict[str, str] = {}
    for i, b in enumerate(biomes, start=1):
        if not b.name:
            faults.append(f"Biome {i} needs a name.")
            continue
        key = b.name.casefold()
        if key in names and not b.retired:
            faults.append(f"Two biomes are called {b.name}.")
        names[key] = b.id
    return faults


def publish(root: Path) -> MapBiomeCatalog:
    """Publish the draft as the next version. A biome published before and missing from the draft stays in the published list as retired."""

    def change(catalog: MapBiomeCatalog) -> None:
        faults = publish_faults([b for b in catalog.draft if not b.retired])
        if faults:
            raise PublishRefusedError(" ".join(faults))
        biomes = [b.model_copy(deep=True) for b in catalog.draft]
        ids = {b.id for b in biomes}
        if catalog.published:
            for old in catalog.published.biomes:
                if old.id not in ids:
                    biomes.append(old.model_copy(update={"retired": True}))
            catalog.history = [catalog.published, *catalog.history][:MAP_BIOME_HISTORY_MAX]
        catalog.published = PublishedBiomes(version=catalog.nextVersion, publishedAt=utcnow(), biomes=biomes)
        catalog.nextVersion += 1

    return _mutate(root, change)


def discard(root: Path) -> MapBiomeCatalog:
    """Put the draft back to the published list (without its retired biomes)."""

    def change(catalog: MapBiomeCatalog) -> None:
        source = catalog.published.biomes if catalog.published else seed_biomes()
        catalog.draft = [b.model_copy(deep=True) for b in source if not b.retired]

    return _mutate(root, change)


def restore_version(root: Path, version: int) -> MapBiomeCatalog:
    """Bring an earlier published version into the draft (it is published again only with Publish)."""

    def change(catalog: MapBiomeCatalog) -> None:
        found = [v for v in ([catalog.published] if catalog.published else []) + catalog.history if v.version == version]
        if not found:
            raise UnknownVersionError(f"the biome list has no version {version}")
        catalog.draft = [b.model_copy(deep=True) for b in found[0].biomes if not b.retired]

    return _mutate(root, change)


def published_biomes(root: Path) -> list[MapBiome]:
    """The biomes projects draw with: the published list (retired ones included, so maps that use them keep their colour)."""
    catalog = load_catalog(root)
    return list(catalog.published.biomes) if catalog.published else seed_biomes()
