import os
import platform
from pathlib import Path


def get_app_data_root() -> Path:
    """Resolve the app's top-level data directory (%APPDATA%\\Scriblr on
    Windows), the parent of `projects/`. Honors SCRIBLR_DATA_DIR like
    `get_projects_root`. Used for data that isn't scoped to one project,
    e.g. the global preset catalog.
    """
    override = os.environ.get("SCRIBLR_DATA_DIR")
    if override:
        root = Path(override)
    else:
        root = _default_app_data_dir() / "Scriblr"
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_projects_root() -> Path:
    """Resolve the directory that holds all project folders.

    Honors SCRIBLR_DATA_DIR so tests and dev tooling can redirect storage
    without touching the real user app-data directory.
    """
    projects_root = get_app_data_root() / "projects"
    projects_root.mkdir(parents=True, exist_ok=True)
    return projects_root


def _default_app_data_dir() -> Path:
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("APPDATA")
        return Path(base) if base else Path.home() / "AppData" / "Roaming"
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support"
    xdg = os.environ.get("XDG_DATA_HOME")
    return Path(xdg) if xdg else Path.home() / ".local" / "share"


def get_project_dir(project_id: str) -> Path:
    return get_projects_root() / project_id
