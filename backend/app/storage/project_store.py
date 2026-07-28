import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

from .schema import (
    DailyActivityLog,
    DraftMoment,
    OutlineTree,
    PlotTree,
    ProjectIndex,
    RevisionSnapshot,
    ScheduleCompletionLog,
    ScrapRegistry,
    TreeSnapshot,
    TreeType,
    utcnow,
)

M = TypeVar("M", bound=BaseModel)


class ProjectNotFoundError(Exception):
    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        super().__init__(f"project not found: {project_id}")


class MomentNotFoundError(Exception):
    def __init__(self, project_id: str, moment_id: str) -> None:
        self.project_id = project_id
        self.moment_id = moment_id
        super().__init__(f"moment not found: {project_id}/{moment_id}")


class SnapshotNotFoundError(Exception):
    def __init__(self, project_id: str, moment_id: str, snapshot_id: str) -> None:
        self.project_id = project_id
        self.moment_id = moment_id
        self.snapshot_id = snapshot_id
        super().__init__(f"snapshot not found: {project_id}/{moment_id}/{snapshot_id}")


class TreeSnapshotNotFoundError(Exception):
    def __init__(self, project_id: str, tree_type: str, snapshot_id: str) -> None:
        self.project_id = project_id
        self.tree_type = tree_type
        self.snapshot_id = snapshot_id
        super().__init__(f"tree snapshot not found: {project_id}/{tree_type}/{snapshot_id}")


class ScrapEntryNotFoundError(Exception):
    def __init__(self, project_id: str, moment_id: str) -> None:
        self.project_id = project_id
        self.moment_id = moment_id
        super().__init__(f"scrap entry not found: {project_id}/{moment_id}")


class InvalidRestoreParentError(Exception):
    def __init__(self, project_id: str, parent_id: str) -> None:
        self.project_id = project_id
        self.parent_id = parent_id
        super().__init__(f"invalid restore parent: {project_id}/{parent_id}")


class ShardCorruptError(Exception):
    """Raised when a shard fails to parse. The bad file has already been
    quarantined (renamed) by the time this is raised, so callers can surface
    a warning and keep loading the rest of the project."""

    def __init__(self, shard_path: Path, quarantined_path: Path, reason: str) -> None:
        self.shard_path = shard_path
        self.quarantined_path = quarantined_path
        self.reason = reason
        super().__init__(f"shard corrupt: {shard_path} ({reason})")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Low-level atomic read/write
# ---------------------------------------------------------------------------


def _atomic_write_json(project_dir: Path, dest_path: Path, data: dict) -> None:
    tmp_dir = project_dir / ".tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(dir=tmp_dir, suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, dest_path)
    except Exception:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)
        raise


def _quarantine(path: Path) -> Path:
    ts = utcnow().strftime("%Y%m%d%H%M%S%f")
    quarantined = path.with_name(f"{path.stem}.corrupt-{ts}{path.suffix}")
    os.replace(path, quarantined)
    return quarantined


def _read_shard(path: Path, model: Type[M]) -> M:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        return model.model_validate(data)
    except (json.JSONDecodeError, ValidationError, UnicodeDecodeError) as e:
        quarantined = _quarantine(path)
        raise ShardCorruptError(path, quarantined, str(e)) from e


def _write_shard(project_dir: Path, path: Path, model: BaseModel) -> None:
    _atomic_write_json(project_dir, path, model.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


def project_dir_of(root: Path, project_id: str) -> Path:
    return root / project_id


def _index_path(project_dir: Path) -> Path:
    return project_dir / "index.json"


def _outline_path(project_dir: Path) -> Path:
    return project_dir / "outline" / "tree.json"


def _plot_path(project_dir: Path) -> Path:
    return project_dir / "brainstorm" / "plot.json"


def _draft_path(project_dir: Path, moment_id: str) -> Path:
    return project_dir / "draft" / f"{moment_id}.json"


def _revision_dir(project_dir: Path, moment_id: str) -> Path:
    return project_dir / "revisions" / moment_id


def _revision_path(project_dir: Path, moment_id: str, snapshot_id: str) -> Path:
    return _revision_dir(project_dir, moment_id) / f"{snapshot_id}.json"


def _tree_history_dir(project_dir: Path, tree_type: TreeType) -> Path:
    return project_dir / f"{tree_type}-history"


def _tree_history_path(project_dir: Path, tree_type: TreeType, snapshot_id: str) -> Path:
    return _tree_history_dir(project_dir, tree_type) / f"{snapshot_id}.json"


def _daily_activity_path(project_dir: Path) -> Path:
    return project_dir / "activity" / "daily.json"


def _schedule_completions_path(project_dir: Path) -> Path:
    return project_dir / "schedule" / "completions.json"


def _scrap_registry_path(project_dir: Path) -> Path:
    return project_dir / "scrap" / "registry.json"


def create_project(root: Path, title: str) -> ProjectIndex:
    project_id = new_id("prj")
    project_dir = project_dir_of(root, project_id)
    project_dir.mkdir(parents=True, exist_ok=False)

    now = utcnow()
    book_node_id = new_id("book")
    outline = OutlineTree(
        nodes=[
            {
                "id": book_node_id,
                "kind": "book",
                "parentId": None,
                "order": 0,
                "title": title,
                "synopsis": "",
            }
        ]
    )
    _write_shard(project_dir, _outline_path(project_dir), outline)

    plot = PlotTree()
    _write_shard(project_dir, _plot_path(project_dir), plot)

    index = ProjectIndex(projectId=project_id, title=title, createdAt=now, updatedAt=now)
    _write_shard(project_dir, _index_path(project_dir), index)
    return index


def load_index(root: Path, project_id: str) -> ProjectIndex:
    project_dir = project_dir_of(root, project_id)
    path = _index_path(project_dir)
    if not path.exists():
        raise ProjectNotFoundError(project_id)
    return _read_shard(path, ProjectIndex)


def save_index(root: Path, index: ProjectIndex) -> None:
    project_dir = project_dir_of(root, index.projectId)
    _write_shard(project_dir, _index_path(project_dir), index)


def list_projects(root: Path) -> list[ProjectIndex]:
    if not root.exists():
        return []
    summaries: list[ProjectIndex] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        try:
            summaries.append(load_index(root, entry.name))
        except (ProjectNotFoundError, ShardCorruptError):
            continue
    return summaries


def delete_project(root: Path, project_id: str) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    shutil.rmtree(project_dir)


def update_project_metadata(root: Path, project_id: str, *, title: str | None = None) -> ProjectIndex:
    index = load_index(root, project_id)
    if title is not None:
        index.title = title
    index.updatedAt = utcnow()
    save_index(root, index)
    return index


# ---------------------------------------------------------------------------
# Outline
# ---------------------------------------------------------------------------


def load_outline(root: Path, project_id: str) -> OutlineTree:
    project_dir = project_dir_of(root, project_id)
    path = _outline_path(project_dir)
    if not path.exists():
        raise ProjectNotFoundError(project_id)
    return _read_shard(path, OutlineTree)


def save_outline(root: Path, project_id: str, outline: OutlineTree) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    _write_shard(project_dir, _outline_path(project_dir), outline)
    index = load_index(root, project_id)
    index.updatedAt = utcnow()
    save_index(root, index)


# ---------------------------------------------------------------------------
# Plot (categories -> plotlines -> plotpoints)
# ---------------------------------------------------------------------------


def load_plot(root: Path, project_id: str) -> PlotTree:
    project_dir = project_dir_of(root, project_id)
    path = _plot_path(project_dir)
    if not path.exists():
        raise ProjectNotFoundError(project_id)
    return _read_shard(path, PlotTree)


def save_plot(root: Path, project_id: str, plot: PlotTree) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    _write_shard(project_dir, _plot_path(project_dir), plot)


# ---------------------------------------------------------------------------
# Draft moments
# ---------------------------------------------------------------------------


def load_draft(root: Path, project_id: str, moment_id: str) -> DraftMoment:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _draft_path(project_dir, moment_id)
    if not path.exists():
        raise MomentNotFoundError(project_id, moment_id)
    return _read_shard(path, DraftMoment)


def save_draft(root: Path, project_id: str, moment_id: str, draft: DraftMoment) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _draft_path(project_dir, moment_id)
    is_new = not path.exists()
    _write_shard(project_dir, path, draft)
    if is_new:
        index = load_index(root, project_id)
        if moment_id not in index.manifest.draftMoments:
            index.manifest.draftMoments.append(moment_id)
        index.updatedAt = utcnow()
        save_index(root, index)


def delete_draft(root: Path, project_id: str, moment_id: str) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _draft_path(project_dir, moment_id)
    if not path.exists():
        raise MomentNotFoundError(project_id, moment_id)
    path.unlink()
    index = load_index(root, project_id)
    if moment_id in index.manifest.draftMoments:
        index.manifest.draftMoments.remove(moment_id)
    index.updatedAt = utcnow()
    save_index(root, index)


# ---------------------------------------------------------------------------
# Revisions
# ---------------------------------------------------------------------------


def list_revisions(root: Path, project_id: str, moment_id: str) -> list[RevisionSnapshot]:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    rev_dir = _revision_dir(project_dir, moment_id)
    if not rev_dir.exists():
        return []
    snapshots: list[RevisionSnapshot] = []
    for entry in sorted(rev_dir.glob("*.json")):
        try:
            snapshots.append(_read_shard(entry, RevisionSnapshot))
        except ShardCorruptError:
            continue
    snapshots.sort(key=lambda s: s.createdAt)
    return snapshots


def load_revision(root: Path, project_id: str, moment_id: str, snapshot_id: str) -> RevisionSnapshot:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _revision_path(project_dir, moment_id, snapshot_id)
    if not path.exists():
        raise SnapshotNotFoundError(project_id, moment_id, snapshot_id)
    return _read_shard(path, RevisionSnapshot)


def save_revision(root: Path, project_id: str, snapshot: RevisionSnapshot) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _revision_path(project_dir, snapshot.momentId, snapshot.snapshotId)
    _write_shard(project_dir, path, snapshot)
    index = load_index(root, project_id)
    if snapshot.momentId not in index.manifest.revisionMoments:
        index.manifest.revisionMoments.append(snapshot.momentId)
        index.updatedAt = utcnow()
        save_index(root, index)


# ---------------------------------------------------------------------------
# Outline/Plot tree history
# ---------------------------------------------------------------------------


def list_tree_snapshots(root: Path, project_id: str, tree_type: TreeType) -> list[TreeSnapshot]:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    hist_dir = _tree_history_dir(project_dir, tree_type)
    if not hist_dir.exists():
        return []
    snapshots: list[TreeSnapshot] = []
    for entry in sorted(hist_dir.glob("*.json")):
        try:
            snapshots.append(_read_shard(entry, TreeSnapshot))
        except ShardCorruptError:
            continue
    snapshots.sort(key=lambda s: s.createdAt)
    return snapshots


def load_tree_snapshot(root: Path, project_id: str, tree_type: TreeType, snapshot_id: str) -> TreeSnapshot:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _tree_history_path(project_dir, tree_type, snapshot_id)
    if not path.exists():
        raise TreeSnapshotNotFoundError(project_id, tree_type, snapshot_id)
    return _read_shard(path, TreeSnapshot)


def save_tree_snapshot(root: Path, project_id: str, snapshot: TreeSnapshot) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _tree_history_path(project_dir, snapshot.treeType, snapshot.snapshotId)
    _write_shard(project_dir, path, snapshot)


# ---------------------------------------------------------------------------
# Daily activity aggregate (feeds the calendar heatmap)
# ---------------------------------------------------------------------------


def load_daily_activity(root: Path, project_id: str) -> DailyActivityLog:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _daily_activity_path(project_dir)
    if not path.exists():
        return DailyActivityLog()
    try:
        return _read_shard(path, DailyActivityLog)
    except ShardCorruptError:
        return DailyActivityLog()


def save_daily_activity(root: Path, project_id: str, log: DailyActivityLog) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    _write_shard(project_dir, _daily_activity_path(project_dir), log)


# ---------------------------------------------------------------------------
# Schedule completion state
# ---------------------------------------------------------------------------


def load_schedule_completions(root: Path, project_id: str) -> ScheduleCompletionLog:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _schedule_completions_path(project_dir)
    if not path.exists():
        return ScheduleCompletionLog()
    try:
        return _read_shard(path, ScheduleCompletionLog)
    except ShardCorruptError:
        return ScheduleCompletionLog()


def save_schedule_completions(root: Path, project_id: str, log: ScheduleCompletionLog) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    _write_shard(project_dir, _schedule_completions_path(project_dir), log)


# ---------------------------------------------------------------------------
# Scrap registry (orphaned draft content)
# ---------------------------------------------------------------------------


def load_scrap_registry(root: Path, project_id: str) -> ScrapRegistry:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    path = _scrap_registry_path(project_dir)
    if not path.exists():
        return ScrapRegistry()
    try:
        return _read_shard(path, ScrapRegistry)
    except ShardCorruptError:
        return ScrapRegistry()


def save_scrap_registry(root: Path, project_id: str, registry: ScrapRegistry) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    _write_shard(project_dir, _scrap_registry_path(project_dir), registry)


def delete_revision_history(root: Path, project_id: str, moment_id: str) -> None:
    """Permanently removes a moment's revision history directory, tolerant
    of it not existing (e.g. the moment was never manually snapshotted)."""
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    rev_dir = _revision_dir(project_dir, moment_id)
    if rev_dir.exists():
        shutil.rmtree(rev_dir)
    index = load_index(root, project_id)
    if moment_id in index.manifest.revisionMoments:
        index.manifest.revisionMoments.remove(moment_id)
        index.updatedAt = utcnow()
        save_index(root, index)
