"""Global (not project-scoped) storage for the character models, the admin-designed assets of the art mannequin (see schema.py, "Character models").
Lives at %APPDATA%\\Scriblr\\character-models.json, a sibling of presets.json, and reuses the same atomic-write / quarantine-on-corruption helpers
of project_store. The shape of this module is the shape of presets_store: each model has a draft (autosaved from the admin page) and, once
published, a frozen copy; publishing, unpublishing, discarding and bringing back an earlier version are whole-model operations, and nothing here
ever touches a project or a character.
"""

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from . import project_store
from .schema import (
    CHARACTER_MODELS_SCHEMA_VERSION,
    MODEL_CHAIN_MAX,
    MODEL_COPY_MAX_BYTES,
    MODEL_HISTORY_MAX,
    MODEL_LINKS_MAX,
    ModelCatalog,
    ModelContent,
    ModelDraftList,
    ModelEntry,
    ModelShape,
    PublishedModel,
    PublishedModelList,
    PublishedModelOut,
    utcnow,
)

_lock = threading.RLock()


class UnknownModelError(ValueError):
    """No model has this id."""


class UnknownVersionError(ValueError):
    """The model has no such published version."""


class NotPublishedError(ValueError):
    """The operation needs a published copy and the model has none."""


class PublishRefusedError(ValueError):
    """The draft cannot be published as it is; the message says what to fix."""


def _models_path(root: Path) -> Path:
    return root / "character-models.json"


def _published(version: int, content: ModelContent, at: Optional[datetime] = None) -> PublishedModel:
    return PublishedModel(version=version, publishedAt=at or utcnow(), content=content.model_copy(deep=True))


def default_catalog() -> ModelCatalog:
    """A new install starts with no model: the seed model (a basic adult) is a later phase."""
    return ModelCatalog()


def load_models(root: Path) -> ModelCatalog:
    with _lock:
        path = _models_path(root)
        if not path.exists():
            catalog = default_catalog()
            save_models(root, catalog)
            return catalog
        return project_store._read_shard(path, ModelCatalog)


def save_models(root: Path, catalog: ModelCatalog) -> None:
    catalog.schemaVersion = CHARACTER_MODELS_SCHEMA_VERSION
    project_store._write_shard(root, _models_path(root), catalog)


def _mutate(root: Path, change: Callable[[ModelCatalog], None]) -> ModelCatalog:
    with _lock:
        catalog = load_models(root)
        change(catalog)
        save_models(root, catalog)
        return catalog


def _entry(catalog: ModelCatalog, model_id: str) -> ModelEntry:
    for entry in catalog.models:
        if entry.id == model_id:
            return entry
    raise UnknownModelError(f"no model {model_id!r}")


def copy_bytes(content: ModelContent) -> int:
    """The size of a character's copy of this model: its serialized content (compact JSON), in bytes."""
    return len(json.dumps(content.model_dump(mode="json"), separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def save_drafts(root: Path, body: ModelDraftList) -> ModelCatalog:
    """Replace the drafts, in the order given. A model already in the catalog keeps its published copy and history; one left out is deleted
    (with its published copy); a new id starts as an unpublished draft."""

    def change(catalog: ModelCatalog) -> None:
        existing = {e.id: e for e in catalog.models}
        entries: list[ModelEntry] = []
        for item in body.models:
            entry = existing.get(item.id)
            if entry is None:
                entry = ModelEntry(id=item.id, draft=item.draft)
            else:
                entry.draft = item.draft
            entries.append(entry)
        catalog.models = entries

    return _mutate(root, change)


def _label(name: str, ident: str) -> str:
    return name or ident


def _has_cycle(parents: dict[str, Optional[str]]) -> Optional[str]:
    """The id of a group on a cycle of parents, or None."""
    for start in parents:
        seen = {start}
        cur = parents.get(start)
        while cur is not None and cur in parents:
            if cur in seen:
                return cur
            seen.add(cur)
            cur = parents.get(cur)
    return None


def _ancestors(parents: dict[str, Optional[str]], group_id: str) -> list[str]:
    """The groups above this one, nearest first (a cycle is cut short)."""
    chain: list[str] = []
    cur = parents.get(group_id)
    while cur is not None and cur in parents and cur not in chain and cur != group_id:
        chain.append(cur)
        cur = parents.get(cur)
    return chain


def _outline_size(shapes: dict[str, ModelShape], shape: ModelShape) -> int:
    """How many points a shape's outline has: a twin has as many as the shape it mirrors."""
    src = shapes.get(shape.mirrorOf) if shape.mirrorOf else None
    return len(src.pts) if src is not None and src.mirrorOf is None else len(shape.pts)


def _rig_faults(content: ModelContent, parents: dict[str, Optional[str]], circular: bool, owner: dict[str, str], holder: dict[str, str]) -> list[str]:
    """What the rig (phase 2) must not have when published: a pivot chain over the limit, an anchor or a slider that points at something that is
    not there. The front end makes the same checks (modelContent.publishFaults) in the same words."""
    faults: list[str] = []
    shapes = {s.id: s for s in content.shapes}
    group_ids = {g.id for g in content.groups}
    range_ids = {r.id for r in content.ranges}
    twin_groups = {g.id: g.mirrorOf for g in content.groups if g.mirrorOf}
    if not circular:
        for g in content.groups:
            depth = len(_ancestors(parents, g.id)) + 1
            if depth > MODEL_CHAIN_MAX:
                faults.append(f"Group {_label(g.name, g.id)} is {depth} levels deep; a pivot chain may have at most {MODEL_CHAIN_MAX}.")
    for g in content.groups:
        a = g.attach
        if a is None:
            continue
        name = _label(g.name, g.id)
        target = shapes.get(a.shape)
        if g.parent is None:
            faults.append(f"Group {name} is attached to a shape but has no parent group.")
        elif target is None:
            faults.append(f"Group {name} is attached to a shape that does not exist.")
        else:
            home = holder.get(owner.get(a.shape, ""), "")
            if home not in _ancestors(parents, g.id):
                faults.append(f"Group {name} is attached to a shape that is not in its parent group or one above it.")
            if a.kind == "point" and a.i >= _outline_size(shapes, target):
                faults.append(f"Group {name} is attached to a point that does not exist.")
            if a.kind in ("edge", "range") and a.i >= _outline_size(shapes, target):
                faults.append(f"Group {name} is attached to an edge that does not exist.")
        if a.kind == "range" and (a.slider is None or a.slider not in range_ids):
            faults.append(f"Group {name} is attached along a slider that does not exist.")
    for r in content.ranges:
        name = _label(r.name, r.id)
        for d in r.drives:
            if d.kind == "turn" and d.group not in group_ids:
                faults.append(f"Slider {name} turns a group that does not exist.")
            elif d.kind == "turn" and twin_groups.get(d.group or ""):
                faults.append(f"Slider {name} turns a group that is a twin; turn the original instead.")
            elif d.kind == "scale" and d.target != "model" and not ((d.target == "group" and d.id in group_ids) or (d.target == "shape" and d.id in shapes)):
                faults.append(f"Slider {name} scales something that does not exist.")
            elif d.kind == "scale" and ((d.target == "group" and twin_groups.get(d.id or "")) or (d.target == "shape" and shapes[d.id or ""].mirrorOf)):
                faults.append(f"Slider {name} scales a twin; scale the original instead.")
            elif d.kind in ("points", "bend") and d.shape not in shapes:
                faults.append(f"Slider {name} moves a shape that does not exist.")
            elif d.kind in ("points", "bend") and shapes[d.shape or ""].mirrorOf:
                faults.append(f"Slider {name} moves a shape that is a twin; move the original instead.")
            elif d.kind == "points" and any(m.i >= len(shapes[d.shape or ""].pts) for m in d.moves):
                faults.append(f"Slider {name} moves a point of {_label(shapes[d.shape or ''].name, d.shape or '')} that is no longer there. Record it again.")
    return faults


def _pair_faults(content: ModelContent) -> list[str]:
    """Twins (shapes, objects and groups that mirror another): the original must be there and must not be a twin itself."""
    faults: list[str] = []
    for kind, items in (("Shape", content.shapes), ("Object", content.objects), ("Group", content.groups)):
        by_id = {i.id: i for i in items}
        article = "an" if kind == "Object" else "a"
        for i in items:
            src = i.mirrorOf
            if not src:
                continue
            name = _label(i.name, i.id)
            if src == i.id:
                faults.append(f"{kind} {name} is a twin of itself.")
            elif src not in by_id:
                faults.append(f"{kind} {name} is a twin of {article} {kind.lower()} that does not exist.")
            elif by_id[src].mirrorOf:
                faults.append(f"{kind} {name} is a twin of a twin.")
    return faults


def _link_faults(content: ModelContent) -> list[str]:
    """Point links, looseness and back outlines: what they point at must be there, links must not go round in a circle, and there are at most
    MODEL_LINKS_MAX of them."""
    faults: list[str] = []
    shapes = {s.id: s for s in content.shapes}
    range_ids = {r.id for r in content.ranges}
    depends: dict[str, set[str]] = {}
    links = 0
    for s in content.shapes:
        name = _label(s.name, s.id)
        for p in s.pts:
            b = p.bind
            if b is None:
                continue
            links += 1
            target = shapes.get(b.s)
            if b.s == s.id:
                faults.append(f"Shape {name} has a point linked to its own shape.")
            elif target is None:
                faults.append(f"Shape {name} has a point linked to a shape that does not exist.")
            else:
                depends.setdefault(s.id, set()).add(b.s)
                size = _outline_size(shapes, target)
                if b.kind == "point" and b.i >= size:
                    faults.append(f"Shape {name} has a point linked to a point that does not exist.")
                elif b.kind == "edge" and b.e >= size:
                    faults.append(f"Shape {name} has a point linked to an edge that does not exist.")
        if s.loose is not None and s.loose not in range_ids:
            faults.append(f"Shape {name} takes its looseness from a slider that does not exist.")
        if s.back is not None and len(s.back) < 3:
            faults.append(f"Shape {name} has a back outline of fewer than 3 points.")
    for s in content.shapes:
        seen: set[str] = set()
        stack = list(depends.get(s.id, ()))
        while stack:
            cur = stack.pop()
            if cur == s.id:
                faults.append(f"The point links of shape {_label(s.name, s.id)} go round in a circle.")
                break
            if cur in seen:
                continue
            seen.add(cur)
            stack.extend(depends.get(cur, ()))
    if links > MODEL_LINKS_MAX:
        faults.append(f"A model may have at most {MODEL_LINKS_MAX} point links.")
    return faults


def _form_faults(content: ModelContent) -> list[str]:
    """Forms (phase 3): a form may only change shapes of its own object, never a twin's, and an outline is empty (the shape is hidden in that form) or has at
    least three points. The front end makes the same checks in the same words (modelContent.formFaults)."""
    faults: list[str] = []
    shapes = {s.id: s for s in content.shapes}
    for o in content.objects:
        obj = _label(o.name, o.id)
        own = set(o.shapes)
        for axis in o.axes:
            if axis.initial not in {f.id for f in axis.options}:
                faults.append(f"Axis {_label(axis.name, axis.id)} of object {obj} has a default form that does not exist.")
            for form in axis.options:
                name = _label(form.name, form.id)
                for ov in form.ovr:
                    shape = shapes.get(ov.shape)
                    if ov.shape not in own or shape is None:
                        faults.append(f"Form {name} of {obj} changes a shape that is not in the object.")
                    elif shape.mirrorOf:
                        faults.append(f"Form {name} of {obj} changes a twin; change the original instead.")
                    elif 0 < len(ov.pts) < 3:
                        faults.append(f"Form {name} of {obj} has an outline of fewer than 3 points for shape {_label(shape.name, shape.id)}.")
    return faults


def _preset_faults(content: ModelContent) -> list[str]:
    """Presets: the sliders they set and the objects and groups they hide must be there."""
    faults: list[str] = []
    range_ids = {r.id for r in content.ranges}
    thing_ids = {o.id for o in content.objects} | {g.id for g in content.groups}
    for p in content.presets:
        name = _label(p.name, p.id)
        if any(k not in range_ids for k in p.values):
            faults.append(f"Preset {name} sets a slider that does not exist.")
        if any(h not in thing_ids for h in p.hidden):
            faults.append(f"Preset {name} hides something that does not exist.")
    return faults


def publish_faults(content: ModelContent) -> list[str]:
    """What stops this draft from being published, in plain words."""
    faults: list[str] = []
    if not content.name:
        faults.append("The model needs a name.")
    shape_ids = {s.id for s in content.shapes}
    object_ids = {o.id for o in content.objects}
    group_ids = {g.id for g in content.groups}
    for s in content.shapes:
        if len(s.pts) < 3 and not s.mirrorOf:
            faults.append(f"Shape {_label(s.name, s.id)} needs at least 3 points.")
    owner: dict[str, str] = {}
    for o in content.objects:
        for sid in o.shapes:
            if sid not in shape_ids:
                faults.append(f"Object {_label(o.name, o.id)} lists a shape that does not exist.")
            elif sid in owner and owner[sid] != o.id:
                faults.append(f"A shape is in more than one object ({_label(o.name, o.id)}).")
            else:
                owner[sid] = o.id
    holder: dict[str, str] = {}
    for g in content.groups:
        for oid in g.objects:
            if oid not in object_ids:
                faults.append(f"Group {_label(g.name, g.id)} lists an object that does not exist.")
            elif oid in holder and holder[oid] != g.id:
                faults.append(f"An object is in more than one group ({_label(g.name, g.id)}).")
            else:
                holder[oid] = g.id
        if g.parent is not None and g.parent not in group_ids:
            faults.append(f"Group {_label(g.name, g.id)} has a parent that does not exist.")
    parents = {g.id: g.parent for g in content.groups}
    loop = _has_cycle(parents)
    if loop is not None:
        faults.append("The groups are linked in a circle.")
    faults.extend(_rig_faults(content, parents, loop is not None, owner, holder))
    faults.extend(_pair_faults(content))
    faults.extend(_link_faults(content))
    faults.extend(_form_faults(content))
    faults.extend(_preset_faults(content))
    size = copy_bytes(content)
    if size > MODEL_COPY_MAX_BYTES:
        faults.append(f"A character's copy of this model would be {size // 1024} KB; the limit is {MODEL_COPY_MAX_BYTES // 1024} KB.")
    return faults


def publish_model(root: Path, model_id: str) -> ModelCatalog:
    """Freeze the draft as the next published version. The one published until now moves to the history."""

    def change(catalog: ModelCatalog) -> None:
        entry = _entry(catalog, model_id)
        faults = publish_faults(entry.draft)
        if faults:
            raise PublishRefusedError(" ".join(faults))
        for other in catalog.models:
            if other.id != model_id and other.published and other.published.content.name.casefold() == entry.draft.name.casefold():
                raise PublishRefusedError(f"Another model is already published as {other.published.content.name!r}. Rename this one first.")
        if entry.published:
            entry.history = [entry.published, *entry.history][:MODEL_HISTORY_MAX]
        entry.published = _published(entry.nextVersion, entry.draft)
        entry.nextVersion += 1

    return _mutate(root, change)


def unpublish_model(root: Path, model_id: str) -> ModelCatalog:
    """Take the model out of the Writer's editor. Its versions are kept, and numbering carries on from them."""

    def change(catalog: ModelCatalog) -> None:
        entry = _entry(catalog, model_id)
        if not entry.published:
            raise NotPublishedError("The model is not published.")
        entry.history = [entry.published, *entry.history][:MODEL_HISTORY_MAX]
        entry.published = None

    return _mutate(root, change)


def discard_changes(root: Path, model_id: str) -> ModelCatalog:
    """Put the draft back to the published copy. A model with no published copy has nothing to go back to, so it is cleared to a blank
    model that keeps its name."""

    def change(catalog: ModelCatalog) -> None:
        entry = _entry(catalog, model_id)
        if entry.published:
            entry.draft = entry.published.content.model_copy(deep=True)
        else:
            entry.draft = ModelContent(name=entry.draft.name)

    return _mutate(root, change)


def restore_version(root: Path, model_id: str, version: int) -> ModelCatalog:
    """Bring an earlier published version into the draft (it is not published again until Publish)."""

    def change(catalog: ModelCatalog) -> None:
        entry = _entry(catalog, model_id)
        versions = [v for v in ([entry.published] if entry.published else []) + entry.history if v.version == version]
        if not versions:
            raise UnknownVersionError(f"the model has no version {version}")
        entry.draft = versions[0].content.model_copy(deep=True)

    return _mutate(root, change)


def published_models(root: Path) -> PublishedModelList:
    """The models the Writer's editor can offer: those with a published copy, in the catalog's order."""
    catalog = load_models(root)
    return PublishedModelList(models=[
        PublishedModelOut(id=e.id, version=e.published.version, publishedAt=e.published.publishedAt, content=e.published.content)
        for e in catalog.models if e.published
    ])
