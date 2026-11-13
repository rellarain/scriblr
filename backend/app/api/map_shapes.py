from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from ..deps import get_app_data_storage_root
from ..storage import map_shapes_store as store
from ..storage.schema import MAP_MAX_LIBRARY_SHAPES, MapLibraryShape, MapShapeCatalog, MapShapeDraft, MyMapShape, MyMapShapes, library_list

router = APIRouter(prefix="/api/map-shapes", tags=["map-shapes"])
my_router = APIRouter(prefix="/api/my-map-shapes", tags=["map-shapes"])


class ShapeList(BaseModel):
    shapes: list[MapLibraryShape] = Field(default_factory=list)

    @field_validator("shapes", mode="before")
    @classmethod
    def _shapes(cls, value: object) -> object:
        return library_list(value, MAP_MAX_LIBRARY_SHAPES)


class MyShapeIn(BaseModel):
    shape: MapLibraryShape
    projectId: str = Field(default="", max_length=80)
    projectTitle: str = Field(default="", max_length=200)


class MyShapeEdit(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)


@router.get("", response_model=MapShapeCatalog)
def get_catalog(root: Path = Depends(get_app_data_storage_root)) -> MapShapeCatalog:
    """The admin's default shapes as Configuration > Maps edits them: the draft, the published list and its earlier versions."""
    return store.load_catalog(root)


@router.put("", response_model=MapShapeCatalog)
def put_draft(body: MapShapeDraft, root: Path = Depends(get_app_data_storage_root)) -> MapShapeCatalog:
    return store.save_draft(root, body.shapes)


@router.get("/published", response_model=ShapeList)
def get_published(root: Path = Depends(get_app_data_storage_root)) -> ShapeList:
    """The default shapes every project offers (by level)."""
    return ShapeList(shapes=store.published_shapes(root))


@router.post("/publish", response_model=MapShapeCatalog)
def publish(root: Path = Depends(get_app_data_storage_root)) -> MapShapeCatalog:
    try:
        return store.publish(root)
    except store.PublishRefusedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/discard", response_model=MapShapeCatalog)
def discard(root: Path = Depends(get_app_data_storage_root)) -> MapShapeCatalog:
    return store.discard(root)


@router.post("/restore/{version}", response_model=MapShapeCatalog)
def restore(version: int, root: Path = Depends(get_app_data_storage_root)) -> MapShapeCatalog:
    try:
        return store.restore_version(root, version)
    except store.UnknownVersionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@my_router.get("", response_model=MyMapShapes)
def get_my_shapes(root: Path = Depends(get_app_data_storage_root)) -> MyMapShapes:
    """A writer's own shapes, kept in the app for every project, each with the project it came from."""
    return store.load_my_shapes(root)


@my_router.post("", response_model=MyMapShape, status_code=201)
def add_my_shape(body: MyShapeIn, root: Path = Depends(get_app_data_storage_root)) -> MyMapShape:
    try:
        return store.add_my_shape(root, body.shape, body.projectId, body.projectTitle)
    except store.MyShapesFullError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@my_router.patch("/{shape_id}", response_model=MyMapShape)
def edit_my_shape(shape_id: str, body: MyShapeEdit, root: Path = Depends(get_app_data_storage_root)) -> MyMapShape:
    try:
        return store.edit_my_shape(root, shape_id, body.name)
    except store.MyShapeNotFoundError as exc:
        raise HTTPException(status_code=404, detail="no such shape among My shapes") from exc


@my_router.delete("/{shape_id}", status_code=204)
def delete_my_shape(shape_id: str, root: Path = Depends(get_app_data_storage_root)) -> Response:
    try:
        store.delete_my_shape(root, shape_id)
    except store.MyShapeNotFoundError as exc:
        raise HTTPException(status_code=404, detail="no such shape among My shapes") from exc
    return Response(status_code=204)
