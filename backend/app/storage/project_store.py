import json
import os
import shutil
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

from . import settings_log, tree_pack
from .ids import InvalidIdError, check_id
from .schema import (
    HUE_SCHEME,
    PROJECT_FILE_VERSION,
    SCHEMA_VERSION,
    BookListing,
    ChapterAuthorNotes,
    DailyActivityLog,
    DraftChapter,
    DraftChapterMoment,
    DraftMoment,
    OutlineTree,
    PlotTree,
    ProjectFile,
    ProjectIndex,
    Publication,
    RevisionSnapshot,
    SettingsLogEntry,
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


class NewerSchemaError(Exception):
    """project.json was written by a newer build than this one: it can be read, but not written over (that would drop what this build
    does not know)."""

    def __init__(self, project_id: str, found: int, supported: int) -> None:
        self.project_id = project_id
        self.found = found
        self.supported = supported
        super().__init__(f"project {project_id} was saved by a newer version of Scriblr (format {found}, this one writes {supported})")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Low-level atomic read/write. Also used directly by presets_store.py (for
# the separate, non-project-scoped global presets.json) -- keep these three
# signatures stable.
# ---------------------------------------------------------------------------


# On Windows a file cannot be replaced while anything else has it open, and a virus scanner or the
# search indexer can briefly hold a freshly written file: os.replace then fails with PermissionError
# (WinError 5 or 32). That is momentary, so try again for a moment before giving up.
_REPLACE_ATTEMPTS = 10
_REPLACE_PAUSE = 0.03


def _replace_with_retry(src: str, dest: Path) -> None:
    for attempt in range(_REPLACE_ATTEMPTS):
        try:
            os.replace(src, dest)
            return
        except PermissionError:
            if attempt == _REPLACE_ATTEMPTS - 1:
                raise
            time.sleep(_REPLACE_PAUSE * (attempt + 1))


def _atomic_write_json(project_dir: Path, dest_path: Path, data: dict) -> None:
    tmp_dir = project_dir / ".tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(dir=tmp_dir, suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            # json.dumps (not dump) takes the C encoder; compact separators and real UTF-8 make the file about 40% smaller.
            # Reading is indifferent to either layout, so files written before this one still load.
            f.write(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
            f.flush()
            os.fsync(f.fileno())
        _replace_with_retry(tmp_name, dest_path)
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


# A corrupt section is found again on every read, so a copy of the same value is made once, and only the newest few copies are kept.
_QUARANTINE_KEEP = 20


def _quarantine_value(project_dir: Path, label: str, raw_value: object) -> Path:
    """Section-level quarantine: preserves one corrupt section/entry's raw
    JSON value for forensic recovery, without touching project.json itself
    (unlike _quarantine, which renames the whole file)."""
    quarantine_dir = project_dir / "quarantine"
    quarantine_dir.mkdir(parents=True, exist_ok=True)
    for earlier in sorted(quarantine_dir.glob(f"{label}.corrupt-*.json"), reverse=True)[:3]:
        try:
            if json.loads(earlier.read_text(encoding="utf-8")) == raw_value:
                return earlier
        except (OSError, ValueError):
            continue
    ts = utcnow().strftime("%Y%m%d%H%M%S%f")
    dest = quarantine_dir / f"{label}.corrupt-{ts}.json"
    _atomic_write_json(project_dir, dest, raw_value)  # type: ignore[arg-type]
    for old in sorted(quarantine_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)[:-_QUARANTINE_KEEP]:
        old.unlink(missing_ok=True)
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
    return root / check_id(project_id, "project id")


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
    return project_dir / "draft" / f"{check_id(moment_id, 'moment id')}.json"


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
    path = _project_file_path(project_dir)
    if pf.schemaVersion > PROJECT_FILE_VERSION:
        raise NewerSchemaError(project_id, pf.schemaVersion, PROJECT_FILE_VERSION)
    if pf.schemaVersion < 4 and path.exists():
        # The first write of a file from before the compact history: keep the file as it was, once, and convert the history.
        once = path.with_name(f"project.json.v{pf.schemaVersion}.bak")
        if not once.exists():
            shutil.copyfile(path, once)
        pf.outlineHistory = tree_pack.repack("outline", pf.outlineHistory)
        pf.plotHistory = tree_pack.repack("plot", pf.plotHistory)
    pf.schemaVersion = PROJECT_FILE_VERSION
    data = pf.model_dump(mode="json")
    # A section that could not be read stays as it was stored, unless something has replaced it since it was loaded.
    for key, (raw, placeholder) in pf._unreadable.items():
        if getattr(pf, key, None) is placeholder:
            data[key] = raw
    # The file being replaced was read successfully a moment ago: keep it as the last good copy.
    if path.exists():
        shutil.copyfile(path, path.with_name(path.name + ".bak"))
    _atomic_write_json(project_dir, path, data)


# ---------------------------------------------------------------------------
# Transactions. A request that does several things to one project (save a moment's draft, count it in the day's activity, note it in
# the session's revision) used to load and rewrite the whole file once for each. `transaction` holds the project's lock, loads it once, lets
# every store call made inside it (on this thread) work on that one in-memory ProjectFile -- later calls see the earlier calls' changes --
# and writes it once at the end, only if something changed. If the block raises, nothing is written.
# ---------------------------------------------------------------------------

_txn_local = threading.local()


class _Txn:
    __slots__ = ("pf", "errors", "dirty")

    def __init__(self, pf: ProjectFile, errors: dict[str, ShardCorruptError]) -> None:
        self.pf = pf
        self.errors = errors
        self.dirty = False


def _active_txn(root: Path, project_id: str) -> Optional[_Txn]:
    active = getattr(_txn_local, "active", None)
    return active.get((str(root), project_id)) if active else None


@contextmanager
def transaction(root: Path, project_id: str):
    """One load and at most one write for everything the block does to this project. Nested use joins the outer one."""
    key = (str(root), project_id)
    active = getattr(_txn_local, "active", None)
    if active is None:
        active = _txn_local.active = {}
    if key in active:
        yield active[key].pf
        return
    with _lock_for(project_id):
        pf, errors = _load_project_file_locked(root, project_id)
        txn = _Txn(pf, errors)
        active[key] = txn
        try:
            yield pf
            if txn.dirty:
                _write_project_file(root, project_id, pf)
        finally:
            del active[key]


def _load_project_file(root: Path, project_id: str) -> tuple[ProjectFile, dict[str, ShardCorruptError]]:
    txn = _active_txn(root, project_id)
    if txn is not None:
        return txn.pf, txn.errors
    # Under the project's lock, like every write: on Windows a save cannot replace project.json while
    # a reader has it open (PermissionError), so reads and saves take turns. (An RLock: _mutate
    # holds it already when it loads.)
    with _lock_for(project_id):
        return _load_project_file_locked(root, project_id)


def _load_project_file_locked(root: Path, project_id: str) -> tuple[ProjectFile, dict[str, ShardCorruptError]]:
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

    # Old colour codes are converted before anything is validated: the current bounds would refuse them.
    _upgrade_raw_hues(raw)

    try:
        index = ProjectIndex.model_validate(raw.get("index"))
    except ValidationError as e:
        quarantined = _quarantine_value(project_dir, "index", raw.get("index"))
        raise ShardCorruptError(path, quarantined, f"index: {e}") from e

    outline_default, plot_default = OutlineTree(), PlotTree()
    activity_default, schedule_default, scrap_default = DailyActivityLog(), ScheduleCompletionLog(), ScrapRegistry()
    pf = ProjectFile(
        schemaVersion=raw.get("schemaVersion", SCHEMA_VERSION),
        hueScheme=raw.get("hueScheme", HUE_SCHEME),
        index=index,
        outline=_parse_section_default(raw, "outline", OutlineTree, project_dir, path, errors, outline_default),
        plot=_parse_section_default(raw, "plot", PlotTree, project_dir, path, errors, plot_default),
        drafts=_parse_dict_section(raw, "drafts", DraftChapter, project_dir, path, errors),
        revisions=_parse_dict_of_list_section(raw, "revisions", RevisionSnapshot, project_dir, path, errors),
        publications=_parse_dict_of_list_section(raw, "publications", Publication, project_dir, path, errors),
        bookListings=_parse_dict_section(raw, "bookListings", BookListing, project_dir, path, errors),
        chapterNotes=_parse_dict_section(raw, "chapterNotes", ChapterAuthorNotes, project_dir, path, errors),
        outlineHistory=_parse_list_section(raw, "outlineHistory", TreeSnapshot, project_dir, path, errors),
        plotHistory=_parse_list_section(raw, "plotHistory", TreeSnapshot, project_dir, path, errors),
        activity=_parse_section_default(raw, "activity", DailyActivityLog, project_dir, path, errors, activity_default),
        schedule=_parse_section_default(raw, "schedule", ScheduleCompletionLog, project_dir, path, errors, schedule_default),
        scrap=_parse_section_default(raw, "scrap", ScrapRegistry, project_dir, path, errors, scrap_default),
        settingsLog=_parse_list_section(raw, "settingsLog", SettingsLogEntry, project_dir, path, errors),
    )
    for key, placeholder in (
        ("outline", outline_default), ("plot", plot_default), ("activity", activity_default), ("schedule", schedule_default), ("scrap", scrap_default),
    ):
        if key in errors:
            pf._unreadable[key] = (raw.get(key), placeholder)
    return pf, errors


# ---------------------------------------------------------------------------
# One-time migration of the level colours (hueScheme 1 -> 2 -> 3).
# ---------------------------------------------------------------------------

# Scheme 1 stored a plain hue 0-360 and four neutral swatches. Scheme 2 packed a tone into the number,
# so 0 (a red) became 360, and the swatches moved: brown -> a dark orange, black -> dark gray, gray -> a
# desaturated hue, white -> white.
_LEGACY_SWATCHES = {361: -388, 362: -721, 363: 0, 364: 721}
# Scheme 3 had brightness only (darker, base, lighter, all at the zone's one saturation). The neutral
# stops (dark gray, white, and the three "of the parent" stops) have no hue, so they go back to "no
# colour of its own" (the parent's, or the default); a desaturated hue becomes the same hue at base.
# Scheme 4 has no brightness: a plain hue 0-360, so a lighter (361..720) or darker (-720..-361) colour
# becomes its hue.
_NEUTRALS = {-721, 721, -722, 722, 723}


def _upgrade_hue(value, scheme: int):
    if not isinstance(value, int) or isinstance(value, bool):
        return value
    if scheme < 2:
        if value in _LEGACY_SWATCHES:
            value = _LEGACY_SWATCHES[value]
        elif value == 0:
            value = 360
    if scheme < 3:
        if value in _NEUTRALS or value == 0:  # 0 is the old gray swatch (or a desaturated red at the very start)
            return None
        if -360 <= value < 0:  # desaturated: the same hue at base
            return (-value) % 360 or 360
    if scheme < 4:
        if value > 360:  # lighter
            return value - 360
        if value < 0:  # darker
            return -value - 360
    return value


def _upgrade_nodes(nodes, key: str, scheme: int) -> None:
    if not isinstance(nodes, list):
        return
    for node in nodes:
        if isinstance(node, dict) and node.get(key) is not None:
            node[key] = _upgrade_hue(node[key], scheme)


def _upgrade_raw_hues(raw: dict) -> None:
    """Convert every stored level colour in a just-read project.json to the current scheme, in place (the
    next write keeps it). Idempotent through `hueScheme`: a file already at the current scheme is left
    alone. It works on the raw JSON, ahead of validation, because the current bounds refuse old codes."""
    scheme = raw.get("hueScheme", 1)
    if not isinstance(scheme, int) or scheme >= HUE_SCHEME:
        return
    index = raw.get("index")
    settings = index.get("settings") if isinstance(index, dict) else None
    if isinstance(settings, dict) and settings.get("themeHue") is not None:
        settings["themeHue"] = _upgrade_hue(settings["themeHue"], scheme)
    for section, key in (("outline", "themeHue"), ("plot", "hue")):
        tree = raw.get(section)
        if isinstance(tree, dict):
            _upgrade_nodes(tree.get("nodes"), key, scheme)
    # Kept snapshots hold raw nodes: restoring one must not bring old colours back.
    for history, key in (("outlineHistory", "themeHue"), ("plotHistory", "hue")):
        snapshots = raw.get(history)
        if isinstance(snapshots, list):
            for snapshot in snapshots:
                if isinstance(snapshot, dict):
                    _upgrade_nodes(snapshot.get("nodes"), key, scheme)
    raw["hueScheme"] = HUE_SCHEME


def _mutate(root: Path, project_id: str, fn: Callable[[ProjectFile], None]) -> ProjectFile:
    """Acquire this project's lock, load the whole project.json, let `fn`
    mutate the in-memory ProjectFile, then atomically write the whole file
    back -- all as one critical section. If `fn` raises, nothing is written."""
    txn = _active_txn(root, project_id)
    if txn is not None:  # inside a transaction: change the one in-memory file; the transaction writes it
        fn(txn.pf)
        txn.dirty = True
        return txn.pf
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


def iter_project_files(root: Path):
    """Every readable project, parsed once (one that is missing, corrupt or has an unusable id is skipped)."""
    if not root.exists():
        return
    for entry in sorted(root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        try:
            pf, _errors = _load_project_file(root, entry.name)
        except (ProjectNotFoundError, ShardCorruptError, InvalidIdError):
            continue
        yield pf


def list_projects(root: Path) -> list[ProjectIndex]:
    return [pf.index for pf in iter_project_files(root)]


# A deleted project is moved to <projects>/.trash/<id>-<time>/ and only removed for good after this many days.
TRASH_DAYS = 30


def trash_dir_of(root: Path) -> Path:
    return root / ".trash"


def delete_project(root: Path, project_id: str) -> None:
    project_dir = project_dir_of(root, project_id)
    if not project_dir.exists():
        raise ProjectNotFoundError(project_id)
    with _lock_for(project_id):
        trash = trash_dir_of(root)
        trash.mkdir(parents=True, exist_ok=True)
        stamp = utcnow().strftime("%Y%m%d%H%M%S%f")
        _replace_dir_with_retry(project_dir, trash / f"{project_id}-{stamp}")
    with _project_locks_guard:
        _project_locks.pop(project_id, None)
    purge_trash(root)


def _replace_dir_with_retry(src: Path, dest: Path) -> None:
    for attempt in range(_REPLACE_ATTEMPTS):
        try:
            os.replace(src, dest)
            return
        except PermissionError:
            if attempt == _REPLACE_ATTEMPTS - 1:
                raise
            time.sleep(_REPLACE_PAUSE * (attempt + 1))


def purge_trash(root: Path, days: int = TRASH_DAYS) -> None:
    """Remove trashed projects older than `days`."""
    trash = trash_dir_of(root)
    if not trash.exists():
        return
    cutoff = time.time() - days * 86400
    for entry in trash.iterdir():
        try:
            if entry.stat().st_mtime < cutoff:
                shutil.rmtree(entry, ignore_errors=True)
        except OSError:
            continue


def sweep_temp_files(root: Path, older_than_seconds: float = 3600) -> int:
    """Remove half-written temp files a crash or a killed process left behind (<project>/.tmp). Returns how many were removed."""
    if not root.exists():
        return 0
    removed = 0
    cutoff = time.time() - older_than_seconds
    for tmp in root.glob("*/.tmp/*"):
        try:
            if tmp.is_file() and tmp.stat().st_mtime < cutoff:
                tmp.unlink()
                removed += 1
        except OSError:
            continue
    return removed


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
        legacy_dir = project_dir / "revisions" / check_id(moment_id, "moment id")
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


def cap_session_revisions(root: Path, project_id: str, chapter_id: str, keep: int) -> int:
    """Delete the oldest session revisions of a chapter beyond `keep` (manual and automatic ones are never touched). Returns how many went."""
    removed: list[int] = []

    def _do(pf: ProjectFile) -> None:
        items = pf.revisions.get(chapter_id, [])
        sessions = sorted((r for r in items if r.trigger == "session"), key=lambda r: r.createdAt)
        doomed = {r.snapshotId for r in sessions[: max(0, len(sessions) - keep)]}
        if doomed:
            pf.revisions[chapter_id] = [r for r in items if r.snapshotId not in doomed]
        removed.append(len(doomed))

    pf, _errors = _load_project_file(root, project_id)
    if sum(1 for r in pf.revisions.get(chapter_id, []) if r.trigger == "session") <= keep:
        return 0
    _mutate(root, project_id, _do)
    return removed[0]


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
# Publications -- per chapter, newest kept (MAX_PUBLICATIONS), stored in
# project.json's "publications" section keyed by chapter id.
# ---------------------------------------------------------------------------

MAX_PUBLICATIONS = 3


def list_publications(root: Path, project_id: str, chapter_id: str) -> list[Publication]:
    """Newest first."""
    pf, _errors = _load_project_file(root, project_id)
    return sorted(pf.publications.get(chapter_id, []), key=lambda p: p.publishedAt, reverse=True)


def save_publication(root: Path, project_id: str, publication: Publication) -> None:
    def _do(pf: ProjectFile) -> None:
        kept = pf.publications.setdefault(publication.chapterId, [])
        kept.append(publication)
        kept.sort(key=lambda p: p.publishedAt, reverse=True)
        del kept[MAX_PUBLICATIONS:]

    _mutate(root, project_id, _do)


# ---------------------------------------------------------------------------
# Outline/Plot tree history
# ---------------------------------------------------------------------------


def _history_of(pf: ProjectFile, tree_type: TreeType) -> list[TreeSnapshot]:
    return pf.outlineHistory if tree_type == "outline" else pf.plotHistory


def list_tree_snapshots(root: Path, project_id: str, tree_type: TreeType) -> list[TreeSnapshot]:
    """Every snapshot with its complete `nodes` (the store keeps them as sparse keyframes and deltas), oldest first."""
    pf, _errors = _load_project_file(root, project_id)
    hist = _history_of(pf, tree_type)
    dense = tree_pack.dense_all(tree_type, hist)
    whole = [tree_pack.unpack(s, nodes) for s, nodes in zip(hist, dense) if nodes is not None]
    return sorted(whole, key=lambda s: s.createdAt)


def last_tree_snapshot(root: Path, project_id: str, tree_type: TreeType) -> Optional[TreeSnapshot]:
    """The newest snapshot, complete, without unpacking the others."""
    pf, _errors = _load_project_file(root, project_id)
    hist = _history_of(pf, tree_type)
    if not hist:
        return None
    index = max(range(len(hist)), key=lambda i: (hist[i].createdAt, i))
    nodes = tree_pack.dense_at(tree_type, hist, index)
    return tree_pack.unpack(hist[index], nodes) if nodes is not None else None


def load_tree_snapshot(root: Path, project_id: str, tree_type: TreeType, snapshot_id: str) -> TreeSnapshot:
    pf, _errors = _load_project_file(root, project_id)
    hist = _history_of(pf, tree_type)
    for i, s in enumerate(hist):
        if s.snapshotId == snapshot_id:
            nodes = tree_pack.dense_at(tree_type, hist, i)
            if nodes is None:
                break  # its base is gone: it cannot be read
            return tree_pack.unpack(s, nodes)
    raise TreeSnapshotNotFoundError(project_id, tree_type, snapshot_id)


def save_tree_snapshot(root: Path, project_id: str, snapshot: TreeSnapshot) -> None:
    def _do(pf: ProjectFile) -> None:
        target = _history_of(pf, snapshot.treeType)
        previous = tree_pack.dense_at(snapshot.treeType, target, len(target) - 1) if target else None
        base_id = target[-1].snapshotId if target else None
        depth = tree_pack.depth_at(target, len(target) - 1) if target else 0
        target.append(tree_pack.pack(snapshot.treeType, snapshot, previous, base_id, depth))

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
                tree_type: TreeType = "outline" if attr == "outlineHistory" else "plot"
                items = sorted(items, key=lambda s: s.createdAt)
                pruned = len(items) - TREE_HISTORY_KEEP
                kept = items[-TREE_HISTORY_KEEP:]
                # The oldest one kept loses the snapshots it was a delta against, so it becomes a keyframe.
                if not tree_pack.is_keyframe(kept[0]):
                    first = tree_pack.dense_at(tree_type, items, pruned)
                    kept = ([kept[0].model_copy(update={"nodes": tree_pack.sparse_nodes(tree_type, first), "base": None, "ids": None, "changed": []})] if first is not None else []) + kept[1:]
                setattr(pf2, attr, kept)
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


def list_settings_log(root: Path, project_id: str) -> list[SettingsLogEntry]:
    """The project's settings changes still kept, newest first."""
    pf, _ = _load_project_file(root, project_id)
    return sorted(pf.settingsLog, key=lambda e: e.createdAt, reverse=True)


def append_settings_log(root: Path, project_id: str, entry: SettingsLogEntry) -> None:
    def _do(pf: ProjectFile) -> None:
        pf.settingsLog = settings_log.append_pruned(pf.settingsLog, entry)

    _mutate(root, project_id, _do)


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
