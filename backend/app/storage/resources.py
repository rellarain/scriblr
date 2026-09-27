"""Global (not project-scoped) storage for the app's own help content: the
Interface > Console > Component > Feature structural tree, and, per node, a
Guide/Tutorials/FAQ article plus (for console/component/feature nodes) an
Exam/Test/Quiz question bank. Lives at %APPDATA%\\Scriblr\\resources.json, a
sibling of user-settings.json, and reuses project_store's atomic-write
helpers (quarantine on corruption, like every other global store here).

The tree is seeded once, on first load, from feedback.py's own
Page/Console/Component/Feature TAXONOMY (renamed "page" -> "interface" here)
-- that constant's own comment says "a fixed list for now; editing it comes
later," and this is that. Seeding seams from feedback.py: past that first
load the two are independent copies (this one gets stable ids and becomes
freely editable; feedback.py's stays name-keyed and untouched), so nothing
here can corrupt Feedback's own data.
"""

import re
import threading
import uuid
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import project_store
from .feedback import TAXONOMY as FEEDBACK_TAXONOMY

SCHEMA_VERSION = 1
NodeKind = Literal["interface", "console", "component", "feature"]

_lock = threading.RLock()


class ResourcesError(Exception):
    status = 400


class NotFound(ResourcesError):
    status = 404


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


# ---------------------------------------------------------------------------
# Seeding, from feedback.py's TAXONOMY
# ---------------------------------------------------------------------------


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "node"


def _seed_nodes() -> list[ResourceNode]:
    nodes: list[ResourceNode] = []

    def add(name: str, kind: NodeKind, parent_id: Optional[str], order: int) -> str:
        node_id = f"{parent_id}/{_slug(name)}" if parent_id else _slug(name)
        nodes.append(ResourceNode(id=node_id, kind=kind, parentId=parent_id, order=order, name=name))
        return node_id

    for pi, page in enumerate(FEEDBACK_TAXONOMY):
        page_id = add(page["name"], "interface", None, pi)
        for ci, console in enumerate(page["consoles"]):
            console_id = add(console["name"], "console", page_id, ci)
            for coi, component in enumerate(console["components"]):
                component_id = add(component["name"], "component", console_id, coi)
                for fi, feature in enumerate(component["features"]):
                    add(feature, "feature", component_id, fi)
    return nodes


def _default_file() -> ResourcesFile:
    return ResourcesFile(nodes=_seed_nodes())


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
    return project_store._read_shard(path, ResourcesFile)


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


# ---------------------------------------------------------------------------
# Node mutations
# ---------------------------------------------------------------------------


def add_node(root: Path, parent_id: Optional[str], kind: NodeKind, name: str = "") -> ResourcesFile:
    with _lock:
        file = _load(root)
        if parent_id is not None:
            _find(file, parent_id)  # raises NotFound if bogus
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
# Promote-from-feedback: real Feedback messages whose channel matches a
# node's own ancestor names, offered as FAQ candidates. Matching stops at
# component granularity -- Message (feedback.py) only ever records
# openPage/openConsole/selectedComponent, never a feature.
# ---------------------------------------------------------------------------


def _ancestor_names(file: ResourcesFile, node_id: str) -> dict[NodeKind, str]:
    names: dict[NodeKind, str] = {}
    cur: Optional[ResourceNode] = _find(file, node_id)
    while cur is not None:
        names[cur.kind] = cur.name
        cur = _find(file, cur.parentId) if cur.parentId else None
    return names


def promotable_messages(file: ResourcesFile, node_id: str, messages: list) -> list:
    """`messages` is feedback.py's FeedbackFile.messages. Returns the ones
    whose recorded page/console (and component, if the node has one) match
    this node's own ancestors by name."""
    names = _ancestor_names(file, node_id)
    page, console, component = names.get("interface"), names.get("console"), names.get("component")
    out = []
    for m in messages:
        if page and m.openPage != page:
            continue
        if console and m.openConsole != console:
            continue
        if component and m.selectedComponent and m.selectedComponent != component:
            continue
        out.append(m)
    return out
