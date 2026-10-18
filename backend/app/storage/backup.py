"""A copy of the whole app-data directory, taken before anything rewrites it in bulk (a storage-format migration, a compaction).

Backups sit beside the data directory, never inside it (`<root>-backups/<timestamp>/`), so a backup never copies itself, and only the
newest few are kept. Run by hand with `python -m app.storage.backup`.
"""
from __future__ import annotations

import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .paths import get_app_data_root

KEEP_BACKUPS = 5
_IGNORED = shutil.ignore_patterns("*.tmp")


def backups_root(root: Path | None = None) -> Path:
    root = root or get_app_data_root()
    return root.parent / f"{root.name}-backups"


def backup_app_data(root: Path | None = None, keep: int = KEEP_BACKUPS) -> Path:
    """Copy `root` (default: the app-data directory) to a new timestamped folder and prune the oldest beyond `keep`. Returns the folder."""
    root = root or get_app_data_root()
    dest_parent = backups_root(root)
    dest_parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = dest_parent / stamp
    shutil.copytree(root, dest, ignore=_IGNORED)
    prune_backups(dest_parent, keep)
    return dest


def prune_backups(dest_parent: Path, keep: int = KEEP_BACKUPS) -> list[Path]:
    """Delete all but the newest `keep` backups (their names sort by time). Returns what was removed."""
    folders = sorted(p for p in dest_parent.iterdir() if p.is_dir())
    doomed = folders[: max(0, len(folders) - max(1, keep))]
    for folder in doomed:
        shutil.rmtree(folder, ignore_errors=True)
    return doomed


_VERSION_RE = re.compile(rb'"schemaVersion"\s*:\s*(\d+)')


def project_file_versions(projects_root: Path) -> list[int]:
    """The format version each project.json declares (it is the first key of the file, so only its start is read)."""
    versions: list[int] = []
    for path in projects_root.glob("*/project.json"):
        try:
            with path.open("rb") as f:
                m = _VERSION_RE.search(f.read(512))
        except OSError:
            continue
        if m:
            versions.append(int(m.group(1)))
    return versions


def ensure_pre_migration_backup(root: Path, current_version: int) -> Path | None:
    """Once for each format version: if any project is still in an older format, copy the whole data directory before the first write converts
    it. A marker file (`.backed-up-for-v<N>`) keeps this from repeating on every launch."""
    marker = root / f".backed-up-for-v{current_version}"
    if marker.exists():
        return None
    versions = project_file_versions(root / "projects")
    if not versions or min(versions) >= current_version:
        marker.write_text("", encoding="utf-8")
        return None
    dest = backup_app_data(root)
    marker.write_text(dest.name, encoding="utf-8")
    return dest


if __name__ == "__main__":
    print(backup_app_data())
