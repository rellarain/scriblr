from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..deps import get_app_data_storage_root, get_storage_root
from ..storage import map_biomes_store as store
from ..storage import project_store
from ..storage.schema import MAP_MAX_PROJECT_BIOMES, MapBiome, MapBiomeCatalog, MapBiomeDraft, biome_list

router = APIRouter(prefix="/api/map-biomes", tags=["map-biomes"])
project_router = APIRouter(prefix="/api/projects/{project_id}/map-biomes", tags=["map-biomes"])


class BiomeList(BaseModel):
    biomes: list[MapBiome] = Field(default_factory=list)


class ProjectBiomes(BaseModel):
    biomes: list[MapBiome] = Field(default_factory=list)

    @field_validator("biomes", mode="before")
    @classmethod
    def _biomes(cls, value: object) -> object:
        # Every biome of a project is its own (ids start with "own_"): one that does not is left out rather than taking an admin biome's id.
        items = biome_list(value, MAP_MAX_PROJECT_BIOMES + 1)
        return [b for b in items if b.id.startswith("own_")]


@router.get("", response_model=MapBiomeCatalog)
def get_catalog(root: Path = Depends(get_app_data_storage_root)) -> MapBiomeCatalog:
    """The admin's biome list as Configuration > Maps edits it: the draft, the published list and its earlier versions."""
    return store.load_catalog(root)


@router.put("", response_model=MapBiomeCatalog)
def put_draft(body: MapBiomeDraft, root: Path = Depends(get_app_data_storage_root)) -> MapBiomeCatalog:
    return store.save_draft(root, body.biomes)


@router.get("/published", response_model=BiomeList)
def get_published(root: Path = Depends(get_app_data_storage_root)) -> BiomeList:
    """The biomes every project draws its maps with (retired ones too, so maps that use them keep their colour)."""
    return BiomeList(biomes=store.published_biomes(root))


@router.post("/publish", response_model=MapBiomeCatalog)
def publish(root: Path = Depends(get_app_data_storage_root)) -> MapBiomeCatalog:
    try:
        return store.publish(root)
    except store.PublishRefusedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/discard", response_model=MapBiomeCatalog)
def discard(root: Path = Depends(get_app_data_storage_root)) -> MapBiomeCatalog:
    return store.discard(root)


@router.post("/restore/{version}", response_model=MapBiomeCatalog)
def restore(version: int, root: Path = Depends(get_app_data_storage_root)) -> MapBiomeCatalog:
    try:
        return store.restore_version(root, version)
    except store.UnknownVersionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@project_router.get("", response_model=BiomeList)
def get_project_biomes(project_id: str, root: Path = Depends(get_storage_root)) -> BiomeList:
    """The project's own biomes (besides the admin's list)."""
    return BiomeList(biomes=project_store.list_project_biomes(root, project_id))


@project_router.put("", response_model=BiomeList)
def put_project_biomes(project_id: str, body: ProjectBiomes, root: Path = Depends(get_storage_root)) -> BiomeList:
    """Replace the project's own biomes. One that a map still uses is kept as retired when it is left out."""
    if len(body.biomes) > MAP_MAX_PROJECT_BIOMES:
        raise HTTPException(status_code=422, detail=f"a project has at most {MAP_MAX_PROJECT_BIOMES} biomes of its own")
    return BiomeList(biomes=project_store.save_project_biomes(root, project_id, body.biomes))
