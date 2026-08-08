from pathlib import Path

from .storage.paths import get_app_data_root, get_projects_root


def get_storage_root() -> Path:
    return get_projects_root()


def get_app_data_storage_root() -> Path:
    return get_app_data_root()
