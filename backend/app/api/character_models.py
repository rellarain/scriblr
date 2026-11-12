from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_app_data_storage_root
from ..storage import character_models_store as store
from ..storage.schema import ModelCatalog, ModelDraftList, PublishedModelList


def _library_router(prefix: str, tag: str, library: str, who: str) -> APIRouter:
    """The routes of one library of models: the admin's catalog (/api/character-models) or the writer's own models (/api/my-models). They do the same things; only the file
    and who the page belongs to differ."""
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.get("", response_model=ModelCatalog, description=f"The whole catalog as {who} page edits it: every model's draft, its published copy and its earlier versions.")
    def get_models(root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        return store.load_models(root, library)

    @router.put("", response_model=ModelCatalog, description="Save the drafts (in order). Published copies and history are kept; a model left out is deleted.")
    def put_models(body: ModelDraftList, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.save_drafts(root, body, library)
        except store.InvalidModelIdError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.get("/published", response_model=PublishedModelList, description="What the Writer's editor offers: the published copies only.")
    def get_published_models(root: Path = Depends(get_app_data_storage_root)) -> PublishedModelList:
        return store.published_models(root, library)

    @router.post("/{model_id}/publish", response_model=ModelCatalog)
    def publish_model(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.publish_model(root, model_id, library)
        except store.UnknownModelError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except store.PublishRefusedError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.post("/{model_id}/unpublish", response_model=ModelCatalog)
    def unpublish_model(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.unpublish_model(root, model_id, library)
        except store.UnknownModelError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except store.NotPublishedError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/{model_id}/discard", response_model=ModelCatalog)
    def discard_model_changes(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.discard_changes(root, model_id, library)
        except store.UnknownModelError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/{model_id}/restore/{version}", response_model=ModelCatalog)
    def restore_model_version(model_id: str, version: int, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
        try:
            return store.restore_version(root, model_id, version, library)
        except (store.UnknownModelError, store.UnknownVersionError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return router


router = _library_router("/api/character-models", "character-models", store.ADMIN_LIBRARY, "the admin's")


@router.post("/basic", response_model=ModelCatalog)
def add_basic_model(root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    """Add the basic adult that comes with the app (published when its name is free). 409 when it is already in the catalog."""
    try:
        return store.add_basic_model(root)
    except store.BasicModelPresentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# The models a writer designs for themselves (the Characters console's Models section): a second catalog in my-models.json, with ids that start with "my-".
my_router = _library_router("/api/my-models", "my-models", store.MY_LIBRARY, "the writer's")
