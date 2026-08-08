from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_app_data_storage_root
from ..storage import presets_store as store
from ..storage.schema import PresetCatalog

router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("", response_model=PresetCatalog)
def get_presets(root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    return store.load_presets(root)


@router.put("", response_model=PresetCatalog)
def put_presets(body: PresetCatalog, root: Path = Depends(get_app_data_storage_root)) -> PresetCatalog:
    store.save_presets(root, body)
    return store.load_presets(root)
