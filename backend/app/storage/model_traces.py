"""Pictures to trace (WUI slice 9b): a reference picture under a model's canvas, faded and locked, to draw over. Kept beside the draft, never in the model: a published
copy never carries it and writers never see it. Each model's picture is two files in its library's folder, named for a hash of the model's id (so an id is never a path):
the picture itself (a data URL, written when it is chosen or replaced) and its settings (written as it is faded, moved, locked or hidden), so a change of settings never
rewrites the picture."""

import hashlib
import json
import threading
from pathlib import Path
from typing import Optional

from . import project_store
from .character_models_store import ADMIN_LIBRARY
from .schema import ModelTrace, ModelTraceSettings

_lock = threading.RLock()


class NoTraceError(KeyError):
    pass


def _dir(root: Path, library: str) -> Path:
    return root / ("character-model-traces" if library == ADMIN_LIBRARY else "my-model-traces")


def _paths(root: Path, library: str, model_id: str) -> tuple[Path, Path]:
    key = hashlib.sha256(model_id.encode("utf-8")).hexdigest()[:32]
    folder = _dir(root, library)
    return folder / f"{key}.image.json", folder / f"{key}.json"


def get_trace(root: Path, library: str, model_id: str) -> Optional[ModelTrace]:
    """The model's picture to trace with its settings, or None (none chosen, or a file that cannot be read)."""
    image_path, settings_path = _paths(root, library, model_id)
    with _lock:
        try:
            image = json.loads(image_path.read_text(encoding="utf-8")).get("image")
            settings = json.loads(settings_path.read_text(encoding="utf-8")) if settings_path.exists() else {}
            return ModelTrace.model_validate({**(settings if isinstance(settings, dict) else {}), "image": image})
        except (OSError, ValueError, AttributeError):
            return None


def put_trace(root: Path, library: str, model_id: str, trace: ModelTrace) -> ModelTrace:
    """Choose or replace the model's picture, with its settings."""
    image_path, settings_path = _paths(root, library, model_id)
    folder = _dir(root, library)
    with _lock:
        project_store._atomic_write_json(folder, image_path, {"image": trace.image})
        project_store._atomic_write_json(folder, settings_path, ModelTraceSettings.model_validate(trace.model_dump(exclude={"image"})).model_dump(mode="json"))
    return trace


def set_trace_settings(root: Path, library: str, model_id: str, settings: ModelTraceSettings) -> ModelTrace:
    """Change how the picture is shown (faded, moved, locked, hidden). Raises NoTraceError when the model has no picture."""
    with _lock:
        if get_trace(root, library, model_id) is None:
            raise NoTraceError(model_id)
        _, settings_path = _paths(root, library, model_id)
        project_store._atomic_write_json(_dir(root, library), settings_path, settings.model_dump(mode="json"))
        trace = get_trace(root, library, model_id)
        assert trace is not None
        return trace


def delete_trace(root: Path, library: str, model_id: str) -> None:
    """Take the picture away (nothing happens when there is none)."""
    with _lock:
        for path in _paths(root, library, model_id):
            try:
                path.unlink()
            except FileNotFoundError:
                pass
