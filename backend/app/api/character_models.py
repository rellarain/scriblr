from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_app_data_storage_root
from ..storage import character_models_store as store
from ..storage.schema import ModelCatalog, ModelDraftList, PublishedModelList

router = APIRouter(prefix="/api/character-models", tags=["character-models"])


@router.get("", response_model=ModelCatalog)
def get_models(root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    """The whole catalog as the admin page edits it: every model's draft, its published copy and its earlier versions."""
    return store.load_models(root)


@router.put("", response_model=ModelCatalog)
def put_models(body: ModelDraftList, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    """Save the drafts (in order). Published copies and history are kept; a model left out is deleted."""
    return store.save_drafts(root, body)


@router.get("/published", response_model=PublishedModelList)
def get_published_models(root: Path = Depends(get_app_data_storage_root)) -> PublishedModelList:
    """What the Writer's editor offers: the published copies only."""
    return store.published_models(root)


@router.post("/{model_id}/publish", response_model=ModelCatalog)
def publish_model(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    try:
        return store.publish_model(root, model_id)
    except store.UnknownModelError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except store.PublishRefusedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{model_id}/unpublish", response_model=ModelCatalog)
def unpublish_model(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    try:
        return store.unpublish_model(root, model_id)
    except store.UnknownModelError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except store.NotPublishedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{model_id}/discard", response_model=ModelCatalog)
def discard_model_changes(model_id: str, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    try:
        return store.discard_changes(root, model_id)
    except store.UnknownModelError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{model_id}/restore/{version}", response_model=ModelCatalog)
def restore_model_version(model_id: str, version: int, root: Path = Depends(get_app_data_storage_root)) -> ModelCatalog:
    try:
        return store.restore_version(root, model_id, version)
    except (store.UnknownModelError, store.UnknownVersionError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
