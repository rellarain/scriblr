import json
import os
import shutil
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Callable, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

from .schema import (
    SCHEMA_VERSION,
    DailyActivityLog,
    DraftChapter,
    DraftChapterMoment,
    DraftMoment,
    OutlineTree,
    PlotTree,
    ProjectFile,
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
    def __init__(self, project_id: str, chapter_id: str, snapshot_id: str) -> None:
        self.project_id = project_id
        self.chapter_id = chapter_id
        self.snapshot_id = snapshot_id
        super().__init__(f"snapshot not found: {project_id}/{chapter_id}/{snapshot_id}")


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
    """Raised when a shard (or, since consolidation, a section within
    project.json) fails to parse. The bad value has already been quarantined
    (renamed/copied aside) by the time this is raised, so callers can surface
    a warning and keep loading the rest of the project."""

    def __init__(self, shard_path: Path, quarantined_path: Path, reason: str) -> None:
        self.shard_path = shard_path
        self.quarantined_path = quarantined_path
        self.reason = reason
        super().__init__(f"shard corrupt: {shard_path} ({reason})")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Low-level atomic read/write. Also used directly by presets_store.py (for
# the separate, non-project-scoped global presets.json) -- keep these three
# signatures stable.
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
    """Whole-file quarantine: renames the bad file in place. Still used for
    project.json itself (unparseable JSON) and for legacy shard files during
    migration."""
    ts = utcnow().strftime("%Y%m%d%H%M%S%f")
    quarantined = path.with_name(f"{path.stem}.corrupt-{ts}{path.suffix}")
    os.replace(path, quarantined)
    return quarantined


def _quarantine_value(project_dir: Path, label: str, raw_value: object) -> Path:
    """Section-level quarantine: preserves one corrupt section/entry's raw
    JSON value for forensic recovery, without touching project.json itself
    (unlike _quarantine, which renames the whole file)."""
    ts = utcnow().strftime("%Y%m%d%H%M%S%f")
    quarantine_dir = project_dir / "quarantine"
    quarantine_dir.mkdir(parents=True, exist_ok=True)
    dest = quarantine_dir / f"{label}.corrupt-{ts}.json"
    _atomic_write_json(project_dir, dest, raw_value)  # type: ignore[arg-type]
    return dest


def _read_shard(path: Path, model: Type[M]) -> M:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        return model.model_validate(data)
    except (json.JSONDecodeError, ValidationError, UnicodeDecodeError) as e:
        quarantined = _quarantine(path)
        raise ShardCorruptError(path, quarantined, str(e)) from e


def _try_parse(path: Path, model: Type[M]) -> Optional[M]:
    """Like _read_shard, but returns None instead of quarantining/raising on
    failure. Used only during bulk legacy-layout migration, where a file
    that doesn't match the expected model might simply be an even-older
    shape (e.g. a per-moment draft/revision file sitting in the same
    directory as per-chapter ones) rather than genuine corruption -- treating
    a shape mismatch as corruption there would incorrectly quarantine a file
    the existing lazy per-moment/per-chapter migrations still expect to find."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return model.model_validate(raw)
    except (json.JSONDecodeError, ValidationError, UnicodeDecodeError):
        return None


def _write_shard(project_dir: Path, path: Path, model: BaseModel) -> None:
    _atomic_write_json(project_dir, path, model.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Per-project directory + legacy shard paths. Since consolidation, these are
# used only by the one-time migration and by the two pre-existing
# lazier-than-that legacy fallbacks (load_draft's per-moment fallback,
# migrate_legacy_revisions) -- never for a project's live/current data,
# which now lives entirely in project.json.
# ---------------------------------------------------------------------------


def project_dir_of(root: Path, project_id: str) -> Path:
    return root / project_id


def _project_file_path(project_dir: Path) -> Path:
    return project_dir / "project.json"


def _index_path(project_dir: Path) -> Path:
    return project_dir / "index.json"


def _outline_path(project_dir: Path) -> Path:
    return project_dir / "outline" / "tree.json"


def _plot_path(project_dir: Path) -> Path:
    return project_dir / "brainstorm" / "plot.json"


def _legacy_draft_path(project_dir: Path, moment_id: str) -> Path:
    """Old, pre-hierarchy-overhaul shape: one file per moment. No longer
    written, but still read as a one-time migration source (see
    load_draft) -- never deleted automatically, kept as a safety net."""
    return project_dir / "draft" / f"{moment_id}.json"


def _tree_history_dir(project_dir: Path, tree_type: TreeType) -> Path:
    return project_dir / f"{tree_type}-history"


def _daily_activity_path(project_dir: Path) -> Path:
    return project_dir / "activity" / "daily.json"


def _schedule_completions_path(project_dir: Path) -> Path:
    return project_dir / "schedule" / "completions.json"


def _scrap_registry_path(project_dir: Path) -> Path:
    return project_dir / "scrap" / "registry.json"


# ---------------------------------------------------------------------------
# Concurrency: consolidating every section into one file means concurrent
# mutations to *any* section of a project now contend on the same file
# (previously, different shards never raced each other). An in-process,
# per-project-id RLock (reentrant -- _load_project_file's migration check
# nests inside _mutate's own lock) fully solves this for a single-process,
# single-user local desktop app; a cross-process lock would be unnecessary
# complexity (this app is never run multi-process against the same data dir).
# ---------------------------------------------------------------------------

_project_locks: dict[str, threading.RLock] = {}
_project_locks_guard = threading.Lock()


def _lock_for(project_id: str) -> threading.RLock:
    with _project_locks_guard:
        lock = _project_locks.get(project_id)
        if lock is None:
            lock = threading.RLock()
            _project_locks[project_id] = lock
        return lock


# ---------------------------------------------------------------------------
# Section-level parsing -- a bad section/entry is isolated (quarantined +
# defaulted/dropped) rather than taking down the whole file, reproducing
# every shard's existing corruption policy exactly (see module docstring in
# the design notes): index and whole-file-unparseable are fatal; outline/plot
# raise per-section (surfaced by callers as a soft warning); drafts raise
# per-chapter; revisions/tree-history drop bad entries silently; activity/
# schedule/scrap default silently.
# ---------------------------------------------------------------------------


def _parse_section_default(raw, key, model, project_dir, file_path, errors, default):
    value = raw.get(key)
    if value is None:
        return default
    try:
        return model.model_validate(value)
    except ValidationError as e:
        quarantined = _quarantine_value(project_dir, key, value)
        errors[key] = ShardCorruptError(file_path, quarantined, f"{key}: {e}")
        return default


def _parse_dict_section(raw, key, model, project_dir, file_path, errors):
    """drafts: dict[chapterId, DraftChapter]. A bad chapter is dropped (not
    invented as empty) and recorded under errors[f"{key}.{chapterId}"] so
    load_draft_chapter/load_draft can still raise for THAT chapter only."""
    result = {}
    for sub_key, sub_value in (raw.get(key) or {}).items():
        try:
            result[sub_key] = model.model_validate(sub_value)
        except ValidationError as e:
            quarantined = _quarantine_value(project_dir, f"{key}.{sub_key}", sub_value)
            errors[f"{key}.{sub_key}"] = ShardCorruptError(file_path, quarantined, f"{key}.{sub_key}: {e}")
    return result


def _parse_dict_of_list_section(raw, key, model, project_dir, file_path, errors):
    """revisions: dict[chapterId, list[RevisionSnapshot]]. Bad snapshots are
    dropped silently (errors recorded but never raised) -- matches today's
    silent per-file skip in list_revisions."""
    result = {}
    for chapter_id, raw_list in (raw.get(key) or {}).items():
        good = []
        for i, raw_snap in enumerate(raw_list if isinstance(raw_list, list) else []):
            try:
                good.append(model.model_validate(raw_snap))
            except ValidationError as e:
                snap_id = raw_snap.get("snapshotId", i) if isinstance(raw_snap, dict) else i
                quarantined = _quarantine_value(project_dir, f"{key}.{chapter_id}.{snap_id}", raw_snap)
                errors[f"{key}.{chapter_id}.{snap_id}"] = ShardCorruptError(
                    file_path, quarantined, f"{key}.{chapter_id}.{snap_id}: {e}"
                )
        result[chapter_id] = good
    return result


def _parse_list_section(raw, key, model, project_dir, file_path, errors):
    """outlineHistory/plotHistory: bad entries dropped silently, matching
    today's per-file skip in list_tree_snapshots."""
    good = []
    for i, raw_snap in enumerate(raw.get(key) or []):
        try:
            good.append(model.model_validate(raw_snap))
        except ValidationError as e:
            snap_id = raw_snap.get("snapshotId", i) if isinstance(raw_snap, dict) else i
            quarantined = _quarantine_value(project_dir, f"{key}.{snap_id}", raw_snap)
            errors[f"{key}.{snap_id}"] = ShardCorruptError(file_path, quarantined, f"{key}.{snap_id}: {e}")
    return good


def _write_project_file(root: Path, project_id: str, pf: ProjectFile) -> None:
    project_dir = project_dir_of(root, project_id)
    _atomic_write_json(project_dir, _project_file_path(project_dir), pf.model_dump(mode="json"))


def _load_project_file(root: Path, project_id: str) -> tuple[ProjectFile, dict[str, ShardCorruptError]]:
    _ensure_migrated(root, project_id)
    project_dir = project_dir_of(root, project_id)
    path = _project_file_path(project_dir)
    if not path.exists():
        raise ProjectNotFoundError(project_id)

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("project.json root is not an object")
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
        quarantined = _quarantine(path)
        raise ShardCorruptError(path, quarantined, f"project.json: {e}") from e

    errors: dict[str, ShardCorruptError] = {}

    try:
        index = ProjectIndex.model_validate(raw.get("index"))
    except ValidationError as e:
        quarantined = _quarantine_value(project_dir, "index", raw.get("index"))
        raise ShardCorruptError(path, quarantined, f"index: {e}") from e

    pf = ProjectFile(
        schemaVersion=raw.get("schemaVersion", SCHEMA_VERSION),
        index=index,
        outline=_parse_section_default(raw, "outline", OutlineTree, project_dir, path, errors, OutlineTree()),
        plot=_parse_section_default(raw, "plot", PlotTree, project_dir, path, errors, PlotTree()),
        drafts=_parse_dict_section(raw, "drafts", DraftChapter, project_dir, path, errors),
        revisions=_parse_dict_of_list_section(raw, "revisions", RevisionSnapshot, project_dir, path, errors),
        outlineHistory=_parse_list_section(raw, "outlineHistory", TreeSnapshot, project_dir, path, errors),
        plotHistory=_parse_list_section(raw, "plotHistory", TreeSnapshot, project_dir, path, errors),
        activity=_parse_section_default(
            raw, "activity", DailyActivityLog, project_dir, path, errors, DailyActivityLog()
        ),
        schedule=_parse_section_default(
            raw, "schedule", ScheduleCompletionLog, project_dir, path, errors, ScheduleCompletionLog()
        ),
        scrap=_parse_section_default(raw, "scrap", ScrapRegistry, project_dir, path, errors, ScrapRegistry()),
    )
    return pf, errors


def _mutate(root: Path, project_id: str, fn: Callable[[ProjectFile], None]) -> ProjectFile:
    """Acquire this project's lock, load the whole project.json, let `fn`
    mutate the in-memory ProjectFile, then atomically write the whole file
    back -- all as one critical section. If `fn` raises, nothing is written."""
    with _lock_for(project_id):
        pf, _errors = _load_project_file(root, project_id)
        fn(pf)
        _write_project_file(root, project_id, pf)
        return pf


# ---------------------------------------------------------------------------
# One-time migration from the old multi-file-per-project layout.
# ---------------------------------------------------------------------------


def _needs_legacy_migration(project_dir: Path) -> bool:
    return not _project_file_path(project_dir).exists() and _index_path(project_dir).exists()


def _ensure_migrated(root: Path, project_id: str) -> None:
    project_dir = project_dir_of(root, project_id)
    if not _needs_legacy_migration(project_dir):
        return
    with _lock_for(project_id):
        if not _needs_legacy_migration(project_dir):  # double-checked locking
            return
        _migrate_legacy_layout(root, project_id)


def _read_or_default(path: Path, model: Type[M], default: M) -> M:
    if not path.exists():
        return default
    try:
        return _read_shard(path, model)
    except ShardCorruptError:
        return default


def _migrate_legacy_layout(root: Path, project_id: str) -> None:
    project_dir = project_dir_of(root, project_id)
    # Let a corrupt legacy index propagate (fatal) -- an already-corrupt
    # legacy index can't be migrated, matching today's fatal behavior.
    index = _read_shard(_index_path(project_dir), ProjectIndex)
    outline = _read_or_default(_outline_path(project_dir), OutlineTree, OutlineTree())
    plot = _read_or_default(_plot_path(project_dir), PlotTree, PlotTree())

    drafts: dict[str, DraftChapter] = {}
    draft_dir = project_dir / "draft"
    if draft_dir.exists():
        for entry in sorted(draft_dir.glob("*.json")):
            # The draft/ dir can contain BOTH new-shape per-chapter files and
            # even-older per-moment files (DraftMoment shape) side by side,
            # indistinguishable by filename alone. Only fold in files that
            # actually parse as DraftChapter; anything else is left in place
            # untouched for load_draft's existing lazy per-moment fallback to
            # keep handling -- NOT quarantined, since a shape mismatch here
            # isn't corruption.
            chapter = _try_parse(entry, DraftChapter)
            if chapter is not None:
                drafts[chapter.chapterId] = chapter

    revisions: dict[str, list[RevisionSnapshot]] = {}
    rev_root = project_dir / "revisions"
    if rev_root.exists():
        for chapter_dir in sorted(p for p in rev_root.iterdir() if p.is_dir()):
            snaps: list[RevisionSnapshot] = []
            for entry in sorted(chapter_dir.glob("*.json")):
                # Same ambiguity as drafts above: this directory can also
                # hold OLD per-moment revision subdirs (single-body shape),
                # left untouched for migrate_legacy_revisions to handle.
                snap = _try_parse(entry, RevisionSnapshot)
                if snap is not None:
                    snaps.append(snap)
            if snaps:
                revisions[chapter_dir.name] = snaps

    def _read_history_dir(tree_type: TreeType) -> list[TreeSnapshot]:
        hist_dir = _tree_history_dir(project_dir, tree_type)
        if not hist_dir.exists():
            return []
        out: list[TreeSnapshot] = []
        for entry in sorted(hist_dir.glob("*.json")):
            try:
                out.append(_read_shard(entry, TreeSnapshot))
            except ShardCorruptError:
                continue
        return out

    outline_history = _read_history_dir("outline")
    plot_history = _read_history_dir("plot")
    activity = _read_or_default(_daily_activity_path(project_dir), DailyActivityLog, DailyActivityLog())
    schedule = _read_or_default(
        _schedule_completions_path(project_dir), ScheduleCompletionLog, ScheduleCompletionLog()
    )
    scrap = _read_or_default(_scrap_registry_path(project_dir), ScrapRegistry, ScrapRegistry())

    pf = ProjectFile(
        index=index,
        outline=outline,
        plot=plot,
        drafts=drafts,
        revisions=revisions,
        outlineHistory=outline_history,
        plotHistory=plot_history,
        activity=activity,
        schedule=schedule,
        scrap=scrap,
    )
    _write_project_file(root, project_id, pf)
    # Old files/dirs are deliberately left on disk, untouched, forever --
    # matching this codebase's existing "safety net" convention (see
    # _legacy_draft_path, migrate_legacy_revisions).


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


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
    plot = PlotTree()
    index = ProjectIndex(projectId=project_id, title=title, createdAt=now, updatedAt=now)
    pf = ProjectFile(index=index, outline=outline, plot=plot)
    _write_project_file(root, project_id, pf)  # ONE atomic write, was 3 before
    return index


def load_index(root: Path, project_id: str) -> ProjectIndex:
    pf, _errors = _load_project_file(root, project_id)
    return pf.index


def save_index(root: Path, index: ProjectIndex) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.index = index

    _mutate(root, index.projectId, _do)


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
    with _project_locks_guard:
        _project_locks.pop(project_id, None)


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
    pf, errors = _load_project_file(root, project_id)
    if "outline" in errors:
        raise errors["outline"]
    return pf.outline


def save_outline(root: Path, project_id: str, outline: OutlineTree) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.outline = outline
        # Was a SEPARATE, non-transactional reload+resave of index.json
        # before -- now one atomic write covers both, a genuine correctness
        # fix (a crash between the two old writes could leave updatedAt stale).
        pf.index.updatedAt = utcnow()

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Plot (categories -> plotlines -> plotpoints)
# ---------------------------------------------------------------------------


def load_plot(root: Path, project_id: str) -> PlotTree:
    pf, errors = _load_project_file(root, project_id)
    if "plot" in errors:
        raise errors["plot"]
    return pf.plot


def save_plot(root: Path, project_id: str, plot: PlotTree) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.plot = plot

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Draft moments -- stored in project.json's "drafts" section, one entry per
# CHAPTER (DraftChapter, keyed by moment id), but load_draft/save_draft/
# delete_draft keep the per-moment API shape (DraftMoment).
# ---------------------------------------------------------------------------


def load_draft_chapter(root: Path, project_id: str, chapter_id: str) -> DraftChapter:
    pf, errors = _load_project_file(root, project_id)
    key = f"drafts.{chapter_id}"
    if key in errors:
        raise errors[key]
    return pf.drafts.get(chapter_id) or DraftChapter(chapterId=chapter_id, updatedAt=utcnow())


def load_draft(root: Path, project_id: str, chapter_id: str, moment_id: str) -> DraftMoment:
    pf, errors = _load_project_file(root, project_id)
    key = f"drafts.{chapter_id}"
    if key in errors:
        raise errors[key]
    chapter = pf.drafts.get(chapter_id)
    entry = chapter.moments.get(moment_id) if chapter else None
    if entry is None:
        # One-time migration: fold in an old-shape per-moment file if one
        # exists, then persist it into project.json's drafts section so this
        # only happens once. The legacy file itself is left on disk untouched.
        project_dir = project_dir_of(root, project_id)
        legacy_path = _legacy_draft_path(project_dir, moment_id)
        if not legacy_path.exists():
            raise MomentNotFoundError(project_id, moment_id)
        legacy = _read_shard(legacy_path, DraftMoment)
        new_entry = DraftChapterMoment(body=legacy.body, wordCount=legacy.wordCount, updatedAt=legacy.updatedAt)

        def _do(pf2: ProjectFile) -> None:
            ch = pf2.drafts.setdefault(chapter_id, DraftChapter(chapterId=chapter_id, updatedAt=utcnow()))
            ch.moments[moment_id] = new_entry
            ch.updatedAt = utcnow()

        _mutate(root, project_id, _do)
        entry = new_entry
    return DraftMoment(
        momentId=moment_id,
        outlineNodeId=moment_id,
        updatedAt=entry.updatedAt,
        wordCount=entry.wordCount,
        body=entry.body,
    )


def save_draft(root: Path, project_id: str, chapter_id: str, moment_id: str, draft: DraftMoment) -> None:
    def _do(pf: ProjectFile) -> None:
        chapter = pf.drafts.setdefault(chapter_id, DraftChapter(chapterId=chapter_id, updatedAt=utcnow()))
        is_new = moment_id not in chapter.moments
        chapter.moments[moment_id] = DraftChapterMoment(
            body=draft.body, wordCount=draft.wordCount, updatedAt=draft.updatedAt
        )
        chapter.updatedAt = utcnow()
        if is_new and moment_id not in pf.index.manifest.draftMoments:
            pf.index.manifest.draftMoments.append(moment_id)
            pf.index.updatedAt = utcnow()

    _mutate(root, project_id, _do)


def delete_draft(root: Path, project_id: str, chapter_id: str, moment_id: str) -> None:
    project_dir = project_dir_of(root, project_id)
    legacy_path = _legacy_draft_path(project_dir, moment_id)

    def _do(pf: ProjectFile) -> None:
        chapter = pf.drafts.get(chapter_id)
        removed = False
        if chapter and moment_id in chapter.moments:
            del chapter.moments[moment_id]
            chapter.updatedAt = utcnow()
            removed = True
        if legacy_path.exists():
            legacy_path.unlink()
            removed = True
        if not removed:
            raise MomentNotFoundError(project_id, moment_id)
        if moment_id in pf.index.manifest.draftMoments:
            pf.index.manifest.draftMoments.remove(moment_id)
        pf.index.updatedAt = utcnow()

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Revisions -- per-CHAPTER (RevisionSnapshot captures a chapter's whole
# moments-map at once), stored in project.json's "revisions" section keyed
# by chapter id. "auto"-trigger snapshots always use the fixed snapshotId
# "auto" (a single rolling slot, overwritten in place); "manual" snapshots
# get a fresh id each time and accumulate.
# ---------------------------------------------------------------------------


def list_revisions(root: Path, project_id: str, chapter_id: str) -> list[RevisionSnapshot]:
    pf, _errors = _load_project_file(root, project_id)
    return sorted(pf.revisions.get(chapter_id, []), key=lambda s: s.createdAt)


def load_revision(root: Path, project_id: str, chapter_id: str, snapshot_id: str) -> RevisionSnapshot:
    pf, _errors = _load_project_file(root, project_id)
    for s in pf.revisions.get(chapter_id, []):
        if s.snapshotId == snapshot_id:
            return s
    raise SnapshotNotFoundError(project_id, chapter_id, snapshot_id)


def migrate_legacy_revisions(root: Path, project_id: str, chapter_id: str, moment_ids: list[str]) -> None:
    """One-time migration: old-shape per-moment revision directories
    (revisions/<moment_id>/<snapshot_id>.json, a single body: str) get
    folded into the new per-chapter shape -- one new snapshot per old
    snapshot, each containing just that one moment's body (never merged
    across moments, since old snapshots for different moments were never
    taken together). Old files are left on disk untouched. No-op if a
    moment has no legacy directory, or if a given snapshot id was already
    migrated."""
    project_dir = project_dir_of(root, project_id)
    to_add: dict[str, RevisionSnapshot] = {}
    for moment_id in moment_ids:
        legacy_dir = project_dir / "revisions" / moment_id
        if not legacy_dir.exists():
            continue
        for entry in sorted(legacy_dir.glob("*.json")):
            try:
                data = json.loads(entry.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            snapshot = RevisionSnapshot(
                snapshotId=data["snapshotId"],
                chapterId=chapter_id,
                createdAt=data["createdAt"],
                label=data.get("label", ""),
                trigger=data.get("trigger", "manual"),
                moments={moment_id: data.get("body", "")},
                wordCount=data.get("wordCount", 0),
                notes=[
                    {**note, "anchor": {**note["anchor"], "momentId": moment_id}}
                    for note in data.get("notes", [])
                ],
            )
            to_add[snapshot.snapshotId] = snapshot
    if not to_add:
        return

    def _do(pf: ProjectFile) -> None:
        existing = pf.revisions.setdefault(chapter_id, [])
        existing_ids = {s.snapshotId for s in existing}
        for snap_id, snap in to_add.items():
            if snap_id not in existing_ids:
                existing.append(snap)
        if chapter_id not in pf.index.manifest.revisionChapters:
            pf.index.manifest.revisionChapters.append(chapter_id)
            pf.index.updatedAt = utcnow()

    _mutate(root, project_id, _do)


def save_revision(root: Path, project_id: str, snapshot: RevisionSnapshot) -> None:
    def _do(pf: ProjectFile) -> None:
        chapter_list = pf.revisions.setdefault(snapshot.chapterId, [])
        for i, existing in enumerate(chapter_list):
            if existing.snapshotId == snapshot.snapshotId:
                chapter_list[i] = snapshot
                break
        else:
            chapter_list.append(snapshot)
        if snapshot.chapterId not in pf.index.manifest.revisionChapters:
            pf.index.manifest.revisionChapters.append(snapshot.chapterId)
            pf.index.updatedAt = utcnow()

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Outline/Plot tree history
# ---------------------------------------------------------------------------


def list_tree_snapshots(root: Path, project_id: str, tree_type: TreeType) -> list[TreeSnapshot]:
    pf, _errors = _load_project_file(root, project_id)
    hist = pf.outlineHistory if tree_type == "outline" else pf.plotHistory
    return sorted(hist, key=lambda s: s.createdAt)


def load_tree_snapshot(root: Path, project_id: str, tree_type: TreeType, snapshot_id: str) -> TreeSnapshot:
    pf, _errors = _load_project_file(root, project_id)
    hist = pf.outlineHistory if tree_type == "outline" else pf.plotHistory
    for s in hist:
        if s.snapshotId == snapshot_id:
            return s
    raise TreeSnapshotNotFoundError(project_id, tree_type, snapshot_id)


def save_tree_snapshot(root: Path, project_id: str, snapshot: TreeSnapshot) -> None:
    def _do(pf: ProjectFile) -> None:
        target = pf.outlineHistory if snapshot.treeType == "outline" else pf.plotHistory
        target.append(snapshot)

    _mutate(root, project_id, _do)


# Auto-compaction: keeps outline/plot tree history from growing forever now
# that it lives inside the one file that gets rewritten on every save.
# Checked on project open (GET /api/projects/{id}) -- the only sane trigger
# available in this codebase (no background-job scheduler, no
# BackgroundTasks, no timers anywhere). Manual revisions are never pruned.
TREE_HISTORY_KEEP = 50
TREE_HISTORY_COMPACT_THRESHOLD = 75


def consolidate_project_history(root: Path, project_id: str) -> list[str]:
    """Prunes outlineHistory/plotHistory independently once either exceeds
    TREE_HISTORY_COMPACT_THRESHOLD entries, keeping the TREE_HISTORY_KEEP
    most recent by createdAt. Never touches `revisions` (manual chapter
    save-points, explicitly permanent). Cheap no-op when under threshold.
    Returns human-readable messages for the caller to surface as warnings."""
    pf, _errors = _load_project_file(root, project_id)
    if not any(
        len(getattr(pf, attr)) > TREE_HISTORY_COMPACT_THRESHOLD for attr in ("outlineHistory", "plotHistory")
    ):
        return []

    messages: list[str] = []

    def _do(pf2: ProjectFile) -> None:
        for attr, label in (("outlineHistory", "outline"), ("plotHistory", "plot")):
            items = getattr(pf2, attr)
            if len(items) > TREE_HISTORY_COMPACT_THRESHOLD:
                items = sorted(items, key=lambda s: s.createdAt)
                pruned = len(items) - TREE_HISTORY_KEEP
                setattr(pf2, attr, items[-TREE_HISTORY_KEEP:])
                messages.append(
                    f"Consolidated {pruned} old {label} history snapshots "
                    f"(kept the {TREE_HISTORY_KEEP} most recent)."
                )

    _mutate(root, project_id, _do)  # re-checks the threshold inside the lock; safe if the outer check raced
    return messages


# ---------------------------------------------------------------------------
# Daily activity aggregate (feeds the calendar heatmap)
# ---------------------------------------------------------------------------


def load_daily_activity(root: Path, project_id: str) -> DailyActivityLog:
    pf, _errors = _load_project_file(root, project_id)
    return pf.activity


def save_daily_activity(root: Path, project_id: str, log: DailyActivityLog) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.activity = log

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Schedule completion state
# ---------------------------------------------------------------------------


def load_schedule_completions(root: Path, project_id: str) -> ScheduleCompletionLog:
    pf, _errors = _load_project_file(root, project_id)
    return pf.schedule


def save_schedule_completions(root: Path, project_id: str, log: ScheduleCompletionLog) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.schedule = log

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Scrap registry (orphaned draft content)
# ---------------------------------------------------------------------------


def load_scrap_registry(root: Path, project_id: str) -> ScrapRegistry:
    pf, _errors = _load_project_file(root, project_id)
    return pf.scrap


def save_scrap_registry(root: Path, project_id: str, registry: ScrapRegistry) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.scrap = registry

    _mutate(root, project_id, _do)
