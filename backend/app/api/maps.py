from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_storage_root
from ..storage import project_store as store
from ..storage.schema import (
    MAP_DEFAULT_LAYERS,
    MAP_MAX_PER_PROJECT,
    MAP_MAX_SIDE,
    MAP_MAX_VERSIONS,
    MAP_TERRAIN_SETS,
    MapDoc,
    MapKind,
    MapLayer,
    MapTerrain,
    MapThemeName,
    utcnow,
)

router = APIRouter(prefix="/api/projects/{project_id}/maps", tags=["maps"])


class MapSummary(BaseModel):
    id: str
    title: str
    kind: MapKind
    parentId: Optional[str] = None
    order: int
    width: int
    height: int
    updatedAt: datetime
    versionOf: Optional[str] = None
    appliesFrom: Optional[str] = None


class MapCreate(BaseModel):
    title: str = Field(default="Untitled map", max_length=120)
    kind: MapKind = "world"
    width: int = Field(default=32, ge=1, le=MAP_MAX_SIDE)
    height: int = Field(default=24, ge=1, le=MAP_MAX_SIDE)
    cellSize: float = Field(default=1.0, gt=0, le=1_000_000)
    unit: str = Field(default="cells", max_length=20)
    parentId: Optional[str] = None
    theme: MapThemeName = "modern"


def _is_inside(parents: dict[str, Optional[str]], map_id: str, ancestor: str) -> bool:
    """Whether `map_id` is `ancestor` or somewhere inside it."""
    seen: set[str] = set()
    current: Optional[str] = map_id
    while current is not None and current not in seen:
        if current == ancestor:
            return True
        seen.add(current)
        current = parents.get(current)
    return False


@router.get("", response_model=list[MapSummary])
def list_maps(project_id: str, root: Path = Depends(get_storage_root)) -> list[dict]:
    """The project's maps, without their cells."""
    return store.list_map_summaries(root, project_id)


@router.post("", response_model=MapDoc, status_code=201)
def create_map(project_id: str, body: MapCreate, root: Path = Depends(get_storage_root)) -> MapDoc:
    with store.transaction(root, project_id):
        parents = store.map_parents(root, project_id)
        if len(parents) >= MAP_MAX_PER_PROJECT:
            raise HTTPException(status_code=422, detail=f"a project holds at most {MAP_MAX_PER_PROJECT} maps")
        if body.parentId is not None and (body.parentId not in parents or store.load_map(root, project_id, body.parentId).versionOf):
            raise HTTPException(status_code=422, detail=f"no map '{body.parentId}' to put this one in")
        siblings = [m for m in store.list_map_summaries(root, project_id) if m["parentId"] == body.parentId]
        doc = MapDoc(
            id=store.new_id("map"), title=body.title, kind=body.kind, parentId=body.parentId, order=max((m["order"] for m in siblings), default=-1) + 1,
            width=body.width, height=body.height, cellSize=body.cellSize, unit=body.unit, theme=body.theme,
            terrains=[MapTerrain(id=i, name=n, color=c, builtIn=True) for i, n, c in MAP_TERRAIN_SETS[body.kind]],
            layers=[MapLayer(id=i, name=n, kind=k) for i, n, k in MAP_DEFAULT_LAYERS],
        )
        store.save_map(root, project_id, doc)
    return doc


class Place(BaseModel):
    """A named symbol of a map: where a scene can happen. `key` is what a scene stores (`mapId/symbolId`); `path` is the maps it is inside and its name."""

    key: str
    mapId: str
    placeId: str
    name: str
    path: str
    kind: str
    mapTitle: str
    mapIds: list[str]


def _titles_above(maps: dict[str, MapDoc], map_id: str) -> list[str]:
    """The titles of the maps a map is inside, outermost first, then its own."""
    out: list[str] = []
    seen: set[str] = set()
    current: Optional[str] = map_id
    while current is not None and current in maps and current not in seen:
        seen.add(current)
        out.append(maps[current].title)
        current = maps[current].parentId
    return list(reversed(out))


@router.get("/places/all", response_model=list[Place])
def list_places(project_id: str, root: Path = Depends(get_storage_root)) -> list[Place]:
    """Every place (named symbol) of every map, with the path of maps it is inside: the choices for a scene's location."""
    maps = {m.id: m for m in store.list_maps(root, project_id)}
    out: list[Place] = []
    for m in maps.values():
        if m.versionOf:
            continue  # a version's symbols are the first map's places again
        above = _titles_above(maps, m.id)
        for s in m.symbols:
            if s.name:
                out.append(Place(
                    key=f"{m.id}/{s.id}", mapId=m.id, placeId=s.id, name=s.name, path=" > ".join([*above, s.name]), kind=s.kind, mapTitle=m.title, mapIds=list(s.mapIds),
                ))
    return sorted(out, key=lambda p: (p.path.lower(), p.key))


@router.get("/{map_id}", response_model=MapDoc)
def get_map(project_id: str, map_id: str, root: Path = Depends(get_storage_root)) -> MapDoc:
    return store.load_map(root, project_id, map_id)


@router.put("/{map_id}", response_model=MapDoc)
def put_map(project_id: str, map_id: str, body: MapDoc, root: Path = Depends(get_storage_root)) -> MapDoc:
    """Replace a map (its cells, palette, layers, place in the tree). The id in the body must be the one in the path."""
    if body.id != map_id:
        raise HTTPException(status_code=422, detail="the map's id does not match the address")
    with store.transaction(root, project_id):
        parents = store.map_parents(root, project_id)
        if map_id not in parents:
            raise store.MapNotFoundError(project_id, map_id)
        before = store.load_map(root, project_id, map_id)
        # Whether a map is a version, and of which, is not for a save to change; a version is not in the tree.
        body.versionOf = before.versionOf
        if body.versionOf:
            body.parentId = None
        if body.parentId is not None and (body.parentId not in parents or _is_inside(parents, body.parentId, map_id) or store.load_map(root, project_id, body.parentId).versionOf):
            raise HTTPException(status_code=422, detail="a map cannot be put inside itself or inside a map it holds")
        # A place opens maps that are there, and not this one.
        for symbol in body.symbols:
            symbol.mapIds = [m for m in symbol.mapIds if m in parents and m != map_id]
        body.updatedAt = utcnow()
        store.save_map(root, project_id, body)
    return body


@router.delete("/{map_id}", status_code=204)
def delete_map(project_id: str, map_id: str, root: Path = Depends(get_storage_root)) -> None:
    """Delete a map; the maps inside it move up to its parent."""
    store.delete_map(root, project_id, map_id)


class VersionCreate(BaseModel):
    title: str = Field(default="", max_length=120)
    # The outline chapter or scene from which the new version is the one that is true.
    appliesFrom: Optional[str] = Field(default=None, max_length=80)


@router.post("/{map_id}/versions", response_model=MapDoc, status_code=201)
def create_version(project_id: str, map_id: str, body: VersionCreate, root: Path = Depends(get_storage_root)) -> MapDoc:
    """Make a version of a map as it is now (a copy: cells, symbols, lines, journeys), to change for a later point of the story. A version of a version is a version of the first map."""
    with store.transaction(root, project_id):
        source = store.load_map(root, project_id, map_id)
        base_id = source.versionOf or source.id
        siblings = [m for m in store.list_maps(root, project_id) if m.versionOf == base_id]
        if len(siblings) >= MAP_MAX_VERSIONS:
            raise HTTPException(status_code=422, detail=f"a map has at most {MAP_MAX_VERSIONS} versions")
        if len(store.map_parents(root, project_id)) >= MAP_MAX_PER_PROJECT:
            raise HTTPException(status_code=422, detail=f"a project holds at most {MAP_MAX_PER_PROJECT} maps")
        base = source if source.id == base_id else store.load_map(root, project_id, base_id)
        doc = source.model_copy(deep=True)
        doc.id = store.new_id("map")
        doc.title = (body.title.strip() or f"{base.title}, later")[:120]
        doc.versionOf = base_id
        doc.appliesFrom = body.appliesFrom.strip() if body.appliesFrom and body.appliesFrom.strip() else None
        doc.parentId = None
        doc.order = max((m.order for m in siblings), default=-1) + 1
        doc.reader = doc.reader.model_copy(update={"published": False})
        doc.updatedAt = utcnow()
        store.save_map(root, project_id, doc)
    return doc
