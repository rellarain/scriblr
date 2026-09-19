from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_app_data_storage_root
from ..storage import admin_config_store as store
from ..storage.schema import AuiConfig, AuiConfigDraft

router = APIRouter(prefix="/api/admin-config", tags=["admin-config"])


@router.get("", response_model=AuiConfig)
def get_admin_config(root: Path = Depends(get_app_data_storage_root)) -> AuiConfig:
    return store.load_admin_config(root)


@router.put("", response_model=AuiConfig)
def put_admin_config(body: AuiConfigDraft, root: Path = Depends(get_app_data_storage_root)) -> AuiConfig:
    """Save the draft. Published snapshots are preserved."""
    return store.save_admin_draft(root, body)


@router.post("/publish/{tab}", response_model=AuiConfig)
def publish_admin_tab(tab: str, root: Path = Depends(get_app_data_storage_root)) -> AuiConfig:
    """Publish one tab: snapshot its current draft as the published copy."""
    try:
        return store.publish_tab(root, tab)
    except store.UnknownAdminTabError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
