from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_app_data_storage_root
from ..storage import presets_store as store
from ..storage.schema import PresetCatalog, PresetDraftList, PublishedPresetList

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("", response_model=PresetCatalog)
def get_presets(root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    """The whole catalog as the admin page edits it: every preset's draft, its published copy and its earlier versions."""
    return store.load_presets(root)


@router.put("", response_model=PresetCatalog)
def put_presets(body: PresetDraftList, root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    """Save the drafts (in order). Published copies and history are kept; a preset left out is deleted."""
    return store.save_drafts(root, body)


@router.get("/published", response_model=PublishedPresetList)
def get_published_presets(root: Path = Depends(get_app_data_storage_root)) -> PublishedPresetList:
    """What the Writer's '+ Preset' selector offers: the published copies only."""
    return store.published_presets(root)


@router.post("/{preset_id}/publish", response_model=PresetCatalog)
def publish_preset(preset_id: str, root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    try:
        return store.publish_preset(root, preset_id)
    except store.UnknownPresetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except store.PublishRefusedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{preset_id}/unpublish", response_model=PresetCatalog)
def unpublish_preset(preset_id: str, root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    try:
        return store.unpublish_preset(root, preset_id)
    except store.UnknownPresetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except store.NotPublishedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{preset_id}/discard", response_model=PresetCatalog)
def discard_preset_changes(preset_id: str, root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    try:
        return store.discard_changes(root, preset_id)
    except store.UnknownPresetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{preset_id}/restore/{version}", response_model=PresetCatalog)
def restore_preset_version(preset_id: str, version: int, root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    try:
        return store.restore_version(root, preset_id, version)
    except (store.UnknownPresetError, store.UnknownVersionError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
