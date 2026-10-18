"""A copy of the whole app-data directory, taken before anything rewrites it in bulk (a storage-format migration, a compaction).

Backups sit beside the data directory, never inside it (`<root>-backups/<timestamp>/`), so a backup never copies itself, and only the
newest few are kept. Run by hand with `python -m app.storage.backup`.
"""
from __future__ import annotations

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


if __name__ == "__main__":
    print(backup_app_data())
