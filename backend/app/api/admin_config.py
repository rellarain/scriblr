from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_app_data_storage_root
from ..storage import admin_config_store as store
from ..storage.schema import AuiConfig

router = APIRouter(prefix="/api/admin-config", tags=["admin-config"])


@router.get("", response_model=AuiConfig)
def get_admin_config(root: Path = Depends(get_app_data_storage_root)) -> AuiConfig:
    return store.load_admin_config(root)


@router.put("", response_model=AuiConfig)
def put_admin_config(body: AuiConfig, root: Path = Depends(get_app_data_storage_root)) -> AuiConfig:
    store.save_admin_config(root, body)
    return store.load_admin_config(root)
