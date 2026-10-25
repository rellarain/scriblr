"""Global (not project-scoped) storage for the plot-preset catalog (see schema.py, "Presets").
Lives at %APPDATA%\\Scriblr\\presets.json, a sibling of the projects/ directory. Reuses project_store's
atomic-write/quarantine-on-corruption helpers -- they operate purely on Path/model arguments, nothing
project-id specific despite their parameter names.

Each preset has a draft (autosaved from the admin page) and, once published, a frozen copy that the
Writer's selector reads. Publishing, unpublishing, discarding and bringing back an earlier version are
whole-preset operations; nothing here ever touches a project.
"""

import json
import re
import shutil
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from . import project_store
from .schema import (
    PRESET_FIELD_MAX,
    PRESET_HISTORY_MAX,
    PRESET_NAME_MAX,
    PRESETS_SCHEMA_VERSION,
    PresetContent,
    PresetDraftList,
    PresetEntry,
    PresetCatalog,
    PublishedPreset,
    PublishedPresetList,
    PublishedPresetOut,
    utcnow,
)

# The ten presets a new install starts with: published as version 1 so the selector is never empty. Ids are fixed (not
# generated at import), so the same preset has the same id in every process.
_BUILT_INS: list[tuple[str, str, list[str]]] = [
    ("characters", "Characters", [
        "Name", "Role", "Physical Description", "Personality", "Backstory", "Motivation", "Internal Conflict", "Relationships", "Arc",
    ]),
    ("settings", "Settings", ["Location", "Time Period", "Atmosphere", "Sensory Details", "Significance to Plot"]),
    ("themes", "Themes", ["Statement", "Symbols and Motifs", "How It Is Explored"]),
    ("conflicts", "Conflicts", ["Type", "Stakes", "Opposing Forces", "Resolution"]),
    ("subplots", "Subplots", ["Summary", "Connection to Main Plot", "Characters Involved", "Arc"]),
    ("world-building", "World-building", [
        "Rules and Systems", "History", "Culture and Customs", "Politics and Power Structures", "Technology or Magic Level",
    ]),
    ("plot-structure", "Plot Structure", ["Inciting Incident", "Rising Action", "Midpoint Turn", "Climax", "Resolution", "Stakes"]),
    ("relationships", "Relationships", ["Between Whom", "Dynamic", "History", "Tension", "Evolution Over the Story"]),
    ("foreshadowing", "Foreshadowing", ["Setup", "Payoff", "Planted In", "Paid Off In", "Significance"]),
    ("objects-and-artifacts", "Objects and Artifacts", ["Description", "Origin", "Significance", "Current Owner", "Current Location"]),
]

_lock = threading.RLock()


class UnknownPresetError(ValueError):
    """No preset has this id."""


class UnknownVersionError(ValueError):
    """The preset has no such published version."""


class NotPublishedError(ValueError):
    """The operation needs a published copy and the preset has none."""


class PublishRefusedError(ValueError):
    """The draft cannot be published as it is; the message says what to fix."""


def _presets_path(root: Path) -> Path:
    return root / "presets.json"


def _published(version: int, content: PresetContent, at: Optional[datetime] = None) -> PublishedPreset:
    return PublishedPreset(version=version, publishedAt=at or utcnow(), content=content.model_copy(deep=True))


def default_catalog() -> PresetCatalog:
    entries = []
    for slug, name, fields in _BUILT_INS:
        content = PresetContent(name=name, fields=fields)
        entries.append(PresetEntry(id=f"preset-{slug}", draft=content))
    return PresetCatalog(presets=entries)


def _unique_name(name: str, taken: set[str]) -> str:
    """`name`, or `name (copy)`, `name (copy 2)`... when it is already taken (compared without case), kept within the name limit."""
    if name.casefold() not in taken:
        return name
    n = 1
    while True:
        suffix = " (copy)" if n == 1 else f" (copy {n})"
        candidate = name[: PRESET_NAME_MAX - len(suffix)].rstrip() + suffix
        if candidate.casefold() not in taken:
            return candidate
        n += 1


def _from_v1(data: dict) -> PresetCatalog:
    """Version 1 held a name and field names per preset, all live. Each becomes a draft that is not published: nothing reaches the Writer's
    selector until it is published from the admin page. A repeated name gets a '(copy)' so the names are unique."""
    entries: list[PresetEntry] = []
    taken: set[str] = set()
    for item in data.get("presets") or []:
        if not isinstance(item, dict):
            continue
        raw_id = str(item.get("id") or "")
        pid = raw_id if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", raw_id) and all(e.id != raw_id for e in entries) else project_store.new_id("preset")
        name = str(item.get("name") or "").strip()[:PRESET_NAME_MAX].strip()
        if name:
            name = _unique_name(name, taken)
            taken.add(name.casefold())
        fields = [str(f).strip()[:PRESET_FIELD_MAX].strip() for f in (item.get("fields") or []) if str(f).strip()]
        content = PresetContent(name=name, fields=fields)
        entries.append(PresetEntry(id=pid, draft=content))
    return PresetCatalog(presets=entries)


def _stored_version(path: Path) -> Optional[int]:
    """The schemaVersion in the file, or None when it is not readable JSON (the real read then quarantines it)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    version = data.get("schemaVersion", 1)
    return version if isinstance(version, int) else None


def load_presets(root: Path) -> PresetCatalog:
    with _lock:
        path = _presets_path(root)
        if not path.exists():
            catalog = default_catalog()
            save_presets(root, catalog)
            return catalog
        if _stored_version(path) == 1:
            # The first load after the upgrade. The old file is kept beside the new one, as the legacy project layout is.
            data = json.loads(path.read_text(encoding="utf-8"))
            backup = root / "presets.v1.json"
            if not backup.exists():
                shutil.copy2(path, backup)
            catalog = _from_v1(data)
            save_presets(root, catalog)
            return catalog
        return project_store._read_shard(path, PresetCatalog)


def save_presets(root: Path, catalog: PresetCatalog) -> None:
    catalog.schemaVersion = PRESETS_SCHEMA_VERSION
    project_store._write_shard(root, _presets_path(root), catalog)


def _mutate(root: Path, change: Callable[[PresetCatalog], None]) -> PresetCatalog:
    with _lock:
        catalog = load_presets(root)
        change(catalog)
        save_presets(root, catalog)
        return catalog


def _entry(catalog: PresetCatalog, preset_id: str) -> PresetEntry:
    for entry in catalog.presets:
        if entry.id == preset_id:
            return entry
    raise UnknownPresetError(f"no preset {preset_id!r}")


def save_drafts(root: Path, body: PresetDraftList) -> PresetCatalog:
    """Replace the drafts, in the order given. A preset already in the catalog keeps its published copy and history; one left out is deleted
    (with its published copy); a new id starts as an unpublished draft."""

    def change(catalog: PresetCatalog) -> None:
        existing = {e.id: e for e in catalog.presets}
        entries: list[PresetEntry] = []
        for item in body.presets:
            entry = existing.get(item.id)
            if entry is None:
                entry = PresetEntry(id=item.id, draft=item.draft)
            else:
                entry.draft = item.draft
            entries.append(entry)
        catalog.presets = entries

    return _mutate(root, change)


def publish_faults(content: PresetContent) -> list[str]:
    """What stops this draft from being published (a name is required on every card), in plain words."""
    faults: list[str] = []
    if not content.name:
        faults.append("The preset needs a name.")
    for i, sub in enumerate(content.subcategories, start=1):
        label = f"subcategory {sub.name}" if sub.name else f"subcategory {i}"
        if not sub.name:
            faults.append(f"Subcategory {i} needs a name.")
        for j, cluster in enumerate(sub.clusters, start=1):
            if not cluster.name:
                faults.append(f"Cluster {j} in {label} needs a name.")
    return faults


def publish_preset(root: Path, preset_id: str) -> PresetCatalog:
    """Freeze the draft as the next published version. The one published until now moves to the history."""

    def change(catalog: PresetCatalog) -> None:
        entry = _entry(catalog, preset_id)
        faults = publish_faults(entry.draft)
        if faults:
            raise PublishRefusedError(" ".join(faults))
        for other in catalog.presets:
            if other.id != preset_id and other.published and other.published.content.name.casefold() == entry.draft.name.casefold():
                raise PublishRefusedError(f"Another preset is already published as {other.published.content.name!r}. Rename this one first.")
        if entry.published:
            entry.history = [entry.published, *entry.history][:PRESET_HISTORY_MAX]
        entry.published = _published(entry.nextVersion, entry.draft)
        entry.nextVersion += 1

    return _mutate(root, change)


def unpublish_preset(root: Path, preset_id: str) -> PresetCatalog:
    """Take the preset out of the Writer's selector. Its versions are kept, and numbering carries on from them."""

    def change(catalog: PresetCatalog) -> None:
        entry = _entry(catalog, preset_id)
        if not entry.published:
            raise NotPublishedError("The preset is not published.")
        entry.history = [entry.published, *entry.history][:PRESET_HISTORY_MAX]
        entry.published = None

    return _mutate(root, change)


def discard_changes(root: Path, preset_id: str) -> PresetCatalog:
    """Put the draft back to the published copy. A preset with no published copy has nothing to go back to, so it is cleared to a blank
    preset that keeps its name."""

    def change(catalog: PresetCatalog) -> None:
        entry = _entry(catalog, preset_id)
        if entry.published:
            entry.draft = entry.published.content.model_copy(deep=True)
        else:
            entry.draft = PresetContent(name=entry.draft.name)

    return _mutate(root, change)


def restore_version(root: Path, preset_id: str, version: int) -> PresetCatalog:
    """Bring an earlier published version into the draft (it is not published again until Publish)."""

    def change(catalog: PresetCatalog) -> None:
        entry = _entry(catalog, preset_id)
        versions = [v for v in ([entry.published] if entry.published else []) + entry.history if v.version == version]
        if not versions:
            raise UnknownVersionError(f"the preset has no version {version}")
        entry.draft = versions[0].content.model_copy(deep=True)

    return _mutate(root, change)


def published_presets(root: Path) -> PublishedPresetList:
    """The presets the Writer can offer: those with a published copy, in the catalog's order."""
    catalog = load_presets(root)
    return PublishedPresetList(presets=[
        PublishedPresetOut(id=e.id, version=e.published.version, publishedAt=e.published.publishedAt, content=e.published.content)
        for e in catalog.presets if e.published
    ])
