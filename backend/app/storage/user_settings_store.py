"""Global (not project-scoped) storage for user settings: the time-of-day
theme, UI preferences, and the Writer's saved UI state (key/value). Lives at
%APPDATA%\\Scriblr\\user-settings.json, a sibling of presets.json, and reuses
project_store's atomic-write/quarantine-on-corruption helpers.

Every mutation is a read-modify-write, and FastAPI runs sync endpoints on a
threadpool, so a module lock serializes them.
"""

import json
import threading
from pathlib import Path
from typing import Any

from . import project_store
from .schema import ThemeHS, ThemeSettings, ThemeZones, UiSettings, UserSettings, ZoneConfig, ZonePalette

KV_PREFIX = "scriblr."
MAX_KEY_LENGTH = 200
MAX_VALUE_BYTES = 1_000_000

_lock = threading.RLock()


class InvalidKvError(ValueError):
    """A kv key or value the store refuses (bad prefix, too long/large)."""


def _default_palette() -> ZonePalette:
    # The colors the app has always shipped with: the Day palette every
    # install starts from.
    return ZonePalette(
        brightness=35,
        theme=ThemeHS(h=330, s=30),
        accent=ThemeHS(h=32, s=95),
        alert=ThemeHS(h=200, s=100),
        accent2=ThemeHS(h=260, s=60),
    )


def default_theme() -> ThemeSettings:
    def zone(configured: bool, start: int) -> ZoneConfig:
        return ZoneConfig(configured=configured, startMinute=start, palette=_default_palette())

    return ThemeSettings(
        timeBasedEnabled=False,
        override=None,
        zones=ThemeZones(dawn=zone(False, 330), day=zone(True, 420), dusk=zone(False, 1080), night=zone(False, 1260)),
    )


def default_user_settings() -> UserSettings:
    return UserSettings(theme=default_theme(), ui=UiSettings())


def _path(root: Path) -> Path:
    return root / "user-settings.json"


def _load(root: Path) -> UserSettings:
    path = _path(root)
    if not path.exists():
        settings = default_user_settings()
        _save(root, settings)
        return settings
    return project_store._read_shard(path, UserSettings)


def _save(root: Path, settings: UserSettings) -> None:
    project_store._write_shard(root, _path(root), settings)


def _check_key(key: str) -> None:
    if not key.startswith(KV_PREFIX) or len(key) > MAX_KEY_LENGTH:
        raise InvalidKvError(f"key must start with '{KV_PREFIX}' and be at most {MAX_KEY_LENGTH} characters")


def _check_value(value: Any) -> None:
    if len(json.dumps(value)) > MAX_VALUE_BYTES:
        raise InvalidKvError(f"value is larger than {MAX_VALUE_BYTES} bytes")


def load_user_settings(root: Path) -> UserSettings:
    with _lock:
        return _load(root)


def save_theme(root: Path, theme: ThemeSettings) -> UserSettings:
    with _lock:
        settings = _load(root)
        settings.theme = theme
        _save(root, settings)
        return settings


def save_ui(root: Path, ui: UiSettings) -> UserSettings:
    with _lock:
        settings = _load(root)
        settings.ui = ui
        _save(root, settings)
        return settings


def set_kv(root: Path, key: str, value: Any) -> UserSettings:
    _check_key(key)
    _check_value(value)
    with _lock:
        settings = _load(root)
        settings.kv[key] = value
        _save(root, settings)
        return settings


def delete_kv(root: Path, key: str) -> UserSettings:
    with _lock:
        settings = _load(root)
        settings.kv.pop(key, None)
        _save(root, settings)
        return settings


def import_kv(root: Path, values: dict[str, Any]) -> UserSettings:
    """One-time migration of localStorage values: sets only keys that are
    absent (never overwrites), then marks the migration done."""
    for key, value in values.items():
        _check_key(key)
        _check_value(value)
    with _lock:
        settings = _load(root)
        for key, value in values.items():
            settings.kv.setdefault(key, value)
        settings.migratedFromLocal = True
        _save(root, settings)
        return settings
