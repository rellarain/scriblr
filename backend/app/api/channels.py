from pathlib import Path

from fastapi import APIRouter, Depends

from ..deps import get_app_data_storage_root
from ..storage import resources as store

router = APIRouter(prefix="/api/channels", tags=["channels"])


@router.get("")
def get_channels(root: Path = Depends(get_app_data_storage_root)) -> dict:
    """The channel list alone (interface > console > component > feature), without the Resources content.
    It is edited through the /api/resources/nodes routes."""
    file = store.load_resources(root)
    return {"nodes": [n.model_dump() for n in file.nodes]}
