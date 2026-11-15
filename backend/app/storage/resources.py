"""Global (not project-scoped) storage for the app's own help content: the
Interface > Console > Component > Feature structural tree, and, per node, a
Guide/Tutorials/FAQ article plus (for console/component/feature nodes) an
Exam/Test/Quiz question bank. Lives at %APPDATA%\\Scriblr\\resources.json, a
sibling of user-settings.json, and reuses project_store's atomic-write
helpers (quarantine on corruption, like every other global store here).

The tree is the app's channel list (see channels.py): seeded from the app's
own screens, with the screens a newer version adds merged in once, and edited
by admins in Configuration > Channels. A node that feedback, a plan or a chat
still points at cannot be deleted.
"""

import threading
import uuid
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import project_store
from . import channels

SCHEMA_VERSION = 1
NodeKind = channels.NodeKind

_lock = threading.RLock()


class ResourcesError(Exception):
    status = 400


class NotFound(ResourcesError):
    status = 404


class InUse(ResourcesError):
    status = 409


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ResourceNode(BaseModel):
    id: str
    kind: NodeKind
    parentId: Optional[str] = None
    order: int = 0
    name: str = ""


class Tutorial(BaseModel):
    id: str
    title: str = ""
    body: str = ""


class FaqEntry(BaseModel):
    id: str
    question: str = ""
    answer: str = ""
    source: Literal["authored", "feedback"] = "authored"
    sourceMessageId: Optional[str] = None


class ResourceContent(BaseModel):
    guide: str = ""
    tutorials: list[Tutorial] = Field(default_factory=list)
    faq: list[FaqEntry] = Field(default_factory=list)


class QuestionOption(BaseModel):
    id: str
    text: str = ""
    isCorrect: bool = False


class Question(BaseModel):
    id: str
    prompt: str = ""
    options: list[QuestionOption] = Field(default_factory=list)


class Assessment(BaseModel):
    questions: list[Question] = Field(default_factory=list)


class ResourcesFile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    nodes: list[ResourceNode] = Field(default_factory=list)
    content: dict[str, ResourceContent] = Field(default_factory=dict)
    assessments: dict[str, Assessment] = Field(default_factory=dict)
    # The channels.SCREENS_VERSION whose screens are merged into `nodes`.
    screensVersion: int = 0


# ---------------------------------------------------------------------------
# Seeding, from the app's own screens (channels.APP_SCREENS)
# ---------------------------------------------------------------------------


def _make_node(node_id: str, kind: str, parent_id: Optional[str], name: str, order: int) -> ResourceNode:
    return ResourceNode(id=node_id, kind=kind, parentId=parent_id, order=order, name=name)


def _seed_nodes() -> list[ResourceNode]:
    nodes: list[ResourceNode] = []
    channels.merge_screens(nodes, _make_node)
    return nodes


def _default_file() -> ResourcesFile:
    return ResourcesFile(nodes=_seed_nodes(), screensVersion=channels.SCREENS_VERSION)


# ---------------------------------------------------------------------------
# Load / save
# ---------------------------------------------------------------------------


def _path(root: Path) -> Path:
    return root / "resources.json"


def _load(root: Path) -> ResourcesFile:
    path = _path(root)
    if not path.exists():
        file = _default_file()
        _save(root, file)
        return file
    file = project_store._read_shard(path, ResourcesFile)
    if file.screensVersion < channels.SCREENS_VERSION:
        channels.merge_screens(file.nodes, _make_node)
        file.screensVersion = channels.SCREENS_VERSION
        _save(root, file)
    return file


def _save(root: Path, file: ResourcesFile) -> None:
    project_store._write_shard(root, _path(root), file)


def load_resources(root: Path) -> ResourcesFile:
    with _lock:
        return _load(root)


def _find(file: ResourcesFile, node_id: str) -> ResourceNode:
    for n in file.nodes:
        if n.id == node_id:
            return n
    raise NotFound(f"no such node: {node_id}")


def _descendant_ids(file: ResourcesFile, node_id: str) -> list[str]:
    """node_id itself, plus every node under it (any depth)."""
    ids = [node_id]
    changed = True
    while changed:
        changed = False
        for n in file.nodes:
            if n.parentId in ids and n.id not in ids:
                ids.append(n.id)
                changed = True
    return ids


def ensure_path(root: Path, names: list[str]) -> str:
    """The id of the node reached by following `names` from the top (an interface's name, then a console's, a
    component's and a feature's; blanks end the path early), adding any node that is missing under the id its name
    gives (channels.child_id). Used by one-time migrations of data that named places by their words."""
    kinds = ["interface", "console", "component", "feature"]
    names = [n.strip() for n in names[:4]]
    if "" in names:
        names = names[: names.index("")]
    if not names:
        raise ResourcesError("a place needs at least an interface")
    with _lock:
        file = _load(root)
        parent: Optional[str] = None
        changed = False
        for depth, name in enumerate(names):
            match = next((n for n in file.nodes if n.parentId == parent and n.name.strip().lower() == name.lower()), None)
            if match is None:
                taken = {n.id for n in file.nodes}
                node_id = base = channels.child_id(parent, name)
                k = 2
                while node_id in taken:
                    node_id, k = f"{base}-{k}", k + 1
                order = max((n.order for n in file.nodes if n.parentId == parent), default=-1) + 1
                match = ResourceNode(id=node_id, kind=kinds[depth], parentId=parent, order=order, name=name)
                file.nodes.append(match)
                changed = True
            parent = match.id
        if changed:
            _save(root, file)
        assert parent is not None
        return parent


# ---------------------------------------------------------------------------
# Node mutations
# ---------------------------------------------------------------------------


def add_node(root: Path, parent_id: Optional[str], kind: NodeKind, name: str = "") -> ResourcesFile:
    with _lock:
        file = _load(root)
        parent_kind = _find(file, parent_id).kind if parent_id is not None else None  # raises NotFound if bogus
        if not channels.kind_fits(parent_kind, kind):
            where = f"under a {parent_kind}" if parent_kind else "at the top"
            raise ResourcesError(f"a {kind} cannot go {where}")
        siblings = [n for n in file.nodes if n.parentId == parent_id]
        order = max((n.order for n in siblings), default=-1) + 1
        node_id = f"{parent_id}/{uuid.uuid4().hex[:8]}" if parent_id else uuid.uuid4().hex[:8]
        file.nodes.append(ResourceNode(id=node_id, kind=kind, parentId=parent_id, order=order, name=name))
        _save(root, file)
        return file


def rename_node(root: Path, node_id: str, name: str) -> ResourcesFile:
    with _lock:
        file = _load(root)
        _find(file, node_id).name = name
        _save(root, file)
        return file


def reorder_nodes(root: Path, parent_id: Optional[str], ordered_ids: list[str]) -> ResourcesFile:
    with _lock:
        file = _load(root)
        by_id = {n.id: n for n in file.nodes if n.parentId == parent_id}
        for order, node_id in enumerate(ordered_ids):
            if node_id in by_id:
                by_id[node_id].order = order
        _save(root, file)
        return file


def delete_node(root: Path, node_id: str) -> ResourcesFile:
    with _lock:
        file = _load(root)
        _find(file, node_id)
        doomed = set(_descendant_ids(file, node_id))
        in_use = channels.uses(root, doomed)
        if in_use:
            raise InUse("still used by " + ", ".join(in_use))
        file.nodes = [n for n in file.nodes if n.id not in doomed]
        for doomed_id in doomed:
            file.content.pop(doomed_id, None)
            file.assessments.pop(doomed_id, None)
        _save(root, file)
        return file


# ---------------------------------------------------------------------------
# Content / assessment mutations
# ---------------------------------------------------------------------------


def get_content(file: ResourcesFile, node_id: str) -> ResourceContent:
    return file.content.get(node_id, ResourceContent())


def set_guide(root: Path, node_id: str, guide: str) -> ResourcesFile:
    with _lock:
        file = _load(root)
        _find(file, node_id)
        current = get_content(file, node_id)
        file.content[node_id] = current.model_copy(update={"guide": guide})
        _save(root, file)
        return file


def set_tutorials(root: Path, node_id: str, tutorials: list[Tutorial]) -> ResourcesFile:
    with _lock:
        file = _load(root)
        _find(file, node_id)
        current = get_content(file, node_id)
        file.content[node_id] = current.model_copy(update={"tutorials": tutorials})
        _save(root, file)
        return file


def set_faq(root: Path, node_id: str, faq: list[FaqEntry]) -> ResourcesFile:
    with _lock:
        file = _load(root)
        _find(file, node_id)
        current = get_content(file, node_id)
        file.content[node_id] = current.model_copy(update={"faq": faq})
        _save(root, file)
        return file


def get_assessment(file: ResourcesFile, node_id: str) -> Assessment:
    return file.assessments.get(node_id, Assessment())


def set_assessment(root: Path, node_id: str, questions: list[Question]) -> ResourcesFile:
    with _lock:
        file = _load(root)
        node = _find(file, node_id)
        if node.kind not in ("console", "component", "feature"):
            raise ResourcesError("only a console, component or feature can hold an Exam/Test/Quiz")
        file.assessments[node_id] = Assessment(questions=questions)
        _save(root, file)
        return file


# ---------------------------------------------------------------------------
# Promote-from-feedback: real Feedback messages about this node or anything
# under it (their subject's channel id), offered as FAQ candidates.
# ---------------------------------------------------------------------------


def promotable_messages(file: ResourcesFile, node_id: str, messages: list) -> list:
    """`messages` is feedback.py's FeedbackFile.messages. Returns the ones whose subject is this node or a node
    under it."""
    _find(file, node_id)
    under = set(_descendant_ids(file, node_id))
    return [m for m in messages if getattr(m, "channelId", None) in under]
