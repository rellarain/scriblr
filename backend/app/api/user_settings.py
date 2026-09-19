from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_app_data_storage_root
from ..storage import user_settings_store as store
from ..storage.schema import ThemeSettings, UiSettings, UserSettings

router = APIRouter(prefix="/api/user-settings", tags=["user-settings"])


class KvValue(BaseModel):
    value: Any


class KvImport(BaseModel):
    values: dict[str, Any]


def _bad_request(exc: store.InvalidKvError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@router.get("", response_model=UserSettings)
def get_user_settings(root: Path = Depends(get_app_data_storage_root)) -> UserSettings:
    return store.load_user_settings(root)


@router.put("/theme", response_model=UserSettings)
def put_theme(body: ThemeSettings, root: Path = Depends(get_app_data_storage_root)) -> UserSettings:
    return store.save_theme(root, body)


@router.put("/ui", response_model=UserSettings)
def put_ui(body: UiSettings, root: Path = Depends(get_app_data_storage_root)) -> UserSettings:
    return store.save_ui(root, body)


# Registered before the {key:path} routes so "kv-import" is never read as a key.
@router.post("/kv-import", response_model=UserSettings)
def import_kv(body: KvImport, root: Path = Depends(get_app_data_storage_root)) -> UserSettings:
    try:
        return store.import_kv(root, body.values)
    except store.InvalidKvError as exc:
        raise _bad_request(exc) from exc


@router.put("/kv/{key:path}", response_model=UserSettings)
def put_kv(key: str, body: KvValue, root: Path = Depends(get_app_data_storage_root)) -> UserSettings:
    try:
        return store.set_kv(root, key, body.value)
    except store.InvalidKvError as exc:
        raise _bad_request(exc) from exc


@router.delete("/kv/{key:path}", response_model=UserSettings)
def delete_kv(key: str, root: Path = Depends(get_app_data_storage_root)) -> UserSettings:
    return store.delete_kv(root, key)
