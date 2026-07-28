from pathlib import Path

from .storage.paths import get_projects_root


def get_storage_root() -> Path:
    return get_projects_root()
