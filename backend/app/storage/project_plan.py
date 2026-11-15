"""Global (not project-scoped) storage for the app's own Project Plan (Admin > Project Plan), at
%APPDATA%\\Scriblr\\project-plan.json.

How the pieces fit:
  - Every node of the channel list (an interface, console, component or feature, by id) has a plan: its items.
  - An item is a task, a process (a set of tasks, in order or not), a procedure (a set of processes and tasks, in order or
    not; procedures are in order within their node) or a routine (a task that comes back, with the writer's recurrence).
    A task can sit in a process or a procedure, a process in a procedure; procedures and routines are at the top of their
    node's plan. Children are always in the same node as their parent.
  - Items are assigned to a staff member (teams and departments come with the staff roster) and claimed by whoever does
    them; their status runs to do, claimed, in progress, done.
  - Items can carry the feedback statements they answer. What the writers of those statements see follows (`work_of`):
    accepted is planned, a linked item started (or done, while others are not) is in progress, every linked item done
    is done.
  - Who may do what: the Planner of the node's console (feedback roles, `feedback.scope_of`) shapes its plan (adds,
    edits, moves, deletes and assigns items); the item's assignee, its claimer or a Planner move its status; anyone may
    claim an item that is unassigned or assigned to them and not claimed by someone else.
"""

import json
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from . import channels, feedback, project_store
from .schema import Recurrence, utcnow

Kind = Literal["task", "process", "procedure", "routine"]
ItemStatus = Literal["todo", "claimed", "inProgress", "done"]
Priority = Literal["urgent", "high", "normal", "low"]

SCHEMA_VERSION = 1
TITLE_MAX = 200
NOTES_MAX = 4000
ITEMS_MAX = 2000
STATEMENTS_MAX = 20
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# What may hold what (None: the top of the node's plan).
PARENTS: dict[str, tuple[Optional[str], ...]] = {
    "task": (None, "process", "procedure"),
    "process": (None, "procedure"),
    "procedure": (None,),
    "routine": (None,),
}
KIND_WORDS = {"task": "A task", "process": "A process", "procedure": "A procedure", "routine": "A routine"}


class PlanError(Exception):
    status = 400


class NotFound(PlanError):
    status = 404


class Forbidden(PlanError):
    status = 403


def _day(v: Optional[str]) -> Optional[str]:
    if v in (None, ""):
        return None
    if not isinstance(v, str) or not _DAY.match(v):
        raise ValueError("a date is YYYY-MM-DD")
    datetime.strptime(v, "%Y-%m-%d")
    return v


class Assignee(BaseModel):
    kind: Literal["staff"] = "staff"
    id: str = Field(min_length=1, max_length=120)


class PlanItem(BaseModel):
    id: str
    nodeId: str
    kind: Kind
    title: str = Field(max_length=TITLE_MAX)
    notes: str = Field(default="", max_length=NOTES_MAX)
    parentId: Optional[str] = None
    ordered: bool = True
    order: int = 0
    status: ItemStatus = "todo"
    priority: Priority = "normal"
    start: Optional[str] = None
    due: Optional[str] = None
    assignee: Optional[Assignee] = None
    claimedBy: str = ""
    statementIds: list[str] = Field(default_factory=list, max_length=STATEMENTS_MAX)
    recurrence: Optional[Recurrence] = None
    createdAt: datetime = Field(default_factory=utcnow)
    doneAt: Optional[datetime] = None

    @field_validator("start", "due", mode="before")
    @classmethod
    def _days(cls, v: Optional[str]) -> Optional[str]:
        return _day(v)


class PlanFile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    items: list[PlanItem] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------

_lock = threading.RLock()


def _path(root: Path) -> Path:
    return root / "project-plan.json"


def _save(root: Path, file: PlanFile) -> None:
    project_store._atomic_write_json(root, _path(root), file.model_dump(mode="json"))


def _load(root: Path) -> PlanFile:
    path = _path(root)
    if not path.exists():
        return PlanFile()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        file = PlanFile.model_validate(raw)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
        quarantined = project_store._quarantine(path)
        raise project_store.ShardCorruptError(path, quarantined, str(e)) from e
    # Children whose parent is gone go to the top of their node's plan (a hand-edited file).
    ids = {i.id for i in file.items}
    for item in file.items:
        if item.parentId and item.parentId not in ids:
            item.parentId = None
    return file


def load(root: Path) -> PlanFile:
    with _lock:
        return _load(root)


def mutate(root: Path, fn) -> PlanFile:
    with _lock:
        file = _load(root)
        fn(file)
        _save(root, file)
        return file


def _uses(root: Path, ids: set[str]) -> list[str]:
    n = sum(1 for i in load(root).items if i.nodeId in ids)
    return [f"{n} plan item{'s' if n != 1 else ''}"] if n else []


channels.register_use_check(_uses)


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------


def descendants(file: PlanFile, item_id: str) -> list[PlanItem]:
    out: list[PlanItem] = []
    stack = [item_id]
    while stack:
        pid = stack.pop()
        for i in file.items:
            if i.parentId == pid:
                out.append(i)
                stack.append(i.id)
    return out


def siblings(file: PlanFile, node_id: str, parent_id: Optional[str]) -> list[PlanItem]:
    return sorted((i for i in file.items if i.nodeId == node_id and i.parentId == parent_id), key=lambda i: i.order)


def work_of(file: PlanFile, statement_id: str) -> feedback.WorkStatus:
    """What the plan says of a statement's work: None with no linked item, else done when every linked item (and what
    is under it) is done, in progress when any of them is under way or done, planned otherwise."""
    linked = [i for i in file.items if statement_id in i.statementIds]
    if not linked:
        return None
    work = linked + [d for i in linked for d in descendants(file, i.id)]
    if all(i.status == "done" for i in work):
        return "done"
    if any(i.status in ("inProgress", "done") for i in work):
        return "inProgress"
    return "planned"


def work_for(root: Path) -> feedback.WorkOf:
    file = load(root)
    return lambda sid: work_of(file, sid)


def _can(fb: feedback.FeedbackFile, admin: feedback.Admin, item: PlanItem) -> dict:
    planner = feedback.has_role(admin, "planner", feedback.scope_of(item.nodeId))
    mine = (item.assignee is not None and item.assignee.id == admin.id) or item.claimedBy == admin.id
    claimable = (item.assignee is None or item.assignee.id == admin.id) and item.claimedBy in ("", admin.id) and item.status != "done"
    return {"edit": planner, "status": planner or mine, "claim": claimable and item.claimedBy != admin.id}


def view(file: PlanFile, fb: feedback.FeedbackFile, admin_id: str) -> dict:
    admin = feedback.admin_by_id(fb, admin_id)
    items = []
    for i in sorted(file.items, key=lambda i: (i.nodeId, i.parentId or "", i.order)):
        d = i.model_dump(mode="json")
        d["can"] = _can(fb, admin, i)
        items.append(d)
    return {"me": admin.id, "items": items}


# --------------------------------------------------------------------------
# Changes
# --------------------------------------------------------------------------


def _item(file: PlanFile, item_id: str) -> PlanItem:
    for i in file.items:
        if i.id == item_id:
            return i
    raise NotFound(f"Plan item {item_id} not found")


def _require_planner(fb: feedback.FeedbackFile, admin_id: str, node_id: str, what: str) -> None:
    admin = feedback.admin_by_id(fb, admin_id)
    try:
        feedback.require_role(admin, "planner", feedback.scope_of(node_id), what)
    except feedback.FeedbackError as exc:
        raise Forbidden(str(exc)) from exc


def _check_parent(file: PlanFile, kind: str, node_id: str, parent_id: Optional[str], moving: Optional[str] = None) -> None:
    if parent_id is None:
        if None not in PARENTS[kind]:
            raise PlanError(f"{KIND_WORDS[kind]} goes in a process or a procedure.")
        return
    parent = _item(file, parent_id)
    if parent.kind not in PARENTS[kind]:
        allowed = [k for k in PARENTS[kind] if k]
        where = " or a ".join(allowed) if allowed else "nothing"
        raise PlanError(f"{KIND_WORDS[kind]} goes at the top of the plan{' or in a ' + where if allowed else ''}, not in a {parent.kind}.")
    if parent.nodeId != node_id:
        raise PlanError("An item and what holds it belong to the same part of the app.")
    if moving and (parent_id == moving or any(d.id == parent_id for d in descendants(file, moving))):
        raise PlanError("An item cannot go inside itself.")


def _check_assignee(fb: feedback.FeedbackFile, assignee_id: Optional[str]) -> Optional[Assignee]:
    if not assignee_id:
        return None
    if not any(a.id == assignee_id for a in fb.admins):
        raise PlanError(f"No staff member {assignee_id}.")
    return Assignee(id=assignee_id)


def _check_dates(start: Optional[str], due: Optional[str]) -> None:
    if start and due and due < start:
        raise PlanError("The due date is before the start.")


def _check_statements(fb: feedback.FeedbackFile, ids: list[str]) -> list[str]:
    known = {s["state"].id for s in feedback.derive_statements(fb)}
    out: list[str] = []
    for sid in ids:
        if sid not in known:
            raise PlanError(f"Statement {sid} not found.")
        if sid not in out:
            out.append(sid)
    return out


def _clean_title(title: str) -> str:
    t = " ".join(title.split())
    if not t:
        raise PlanError("An item needs a title.")
    return t[:TITLE_MAX]


def _set_status(item: PlanItem, status: str, admin_id: str) -> None:
    if status == item.status:
        return
    item.status = status  # type: ignore[assignment]
    if status in ("claimed", "inProgress") and not item.claimedBy:
        item.claimedBy = admin_id
    if status == "todo":
        item.claimedBy = ""
    item.doneAt = utcnow() if status == "done" else None


def add_item(
    file: PlanFile, fb: feedback.FeedbackFile, admin_id: str, known: set[str], *, node_id: str, kind: str, title: str,
    parent_id: Optional[str] = None, ordered: bool = True, notes: str = "", priority: str = "normal",
    start: Optional[str] = None, due: Optional[str] = None, assignee_id: Optional[str] = None,
    statement_ids: Optional[list[str]] = None, recurrence: Optional[Recurrence] = None,
) -> PlanItem:
    if node_id not in known:
        raise PlanError(f"No part of the app {node_id}.")
    _require_planner(fb, admin_id, node_id, "Planning")
    if len(file.items) >= ITEMS_MAX:
        raise PlanError(f"The plan holds at most {ITEMS_MAX} items.")
    _check_parent(file, kind, node_id, parent_id)
    _check_dates(start, due)
    if kind != "routine" and recurrence is not None:
        raise PlanError("Only a routine repeats.")
    item = PlanItem(
        id=f"pi-{uuid.uuid4().hex[:10]}", nodeId=node_id, kind=kind, title=_clean_title(title), notes=notes[:NOTES_MAX],  # type: ignore[arg-type]
        parentId=parent_id, ordered=ordered, order=len(siblings(file, node_id, parent_id)), priority=priority,  # type: ignore[arg-type]
        start=start, due=due, assignee=_check_assignee(fb, assignee_id),
        statementIds=_check_statements(fb, statement_ids or []), recurrence=recurrence,
    )
    file.items.append(item)
    return item


_UNSET = object()


def edit_item(file: PlanFile, fb: feedback.FeedbackFile, admin_id: str, item_id: str, changes: dict) -> None:
    """Changes to an item. A status change alone needs the assignee, the claimer or a Planner; anything else needs a
    Planner of its node."""
    item = _item(file, item_id)
    admin = feedback.admin_by_id(fb, admin_id)
    shaping = {k for k in changes if k != "status"}
    if shaping:
        _require_planner(fb, admin_id, item.nodeId, "Changing the plan")
    if "status" in changes:
        if not _can(fb, admin, item)["status"] and not _can(fb, admin, item)["claim"]:
            raise Forbidden("Only who it is assigned to, who claimed it, or a Planner moves an item along.")
    if "title" in changes:
        item.title = _clean_title(changes["title"])
    if "notes" in changes:
        item.notes = str(changes["notes"])[:NOTES_MAX]
    if "ordered" in changes:
        item.ordered = bool(changes["ordered"])
    if "priority" in changes:
        item.priority = changes["priority"]
    start = changes.get("start", item.start)
    due = changes.get("due", item.due)
    _check_dates(start, due)
    item.start, item.due = start, due
    if "assigneeId" in changes:
        item.assignee = _check_assignee(fb, changes["assigneeId"])
        if item.assignee and item.claimedBy and item.claimedBy != item.assignee.id:
            item.claimedBy = ""
            if item.status == "claimed":
                item.status = "todo"
    if "statementIds" in changes:
        item.statementIds = _check_statements(fb, list(changes["statementIds"]))
    if "recurrence" in changes:
        if item.kind != "routine" and changes["recurrence"] is not None:
            raise PlanError("Only a routine repeats.")
        item.recurrence = changes["recurrence"]
    if "parentId" in changes and changes["parentId"] != item.parentId:
        parent_id = changes["parentId"]
        _check_parent(file, item.kind, item.nodeId, parent_id, moving=item.id)
        _close_gap(file, item)
        item.parentId = parent_id
        item.order = max((s.order for s in siblings(file, item.nodeId, parent_id) if s.id != item.id), default=-1) + 1
    if "status" in changes:
        _set_status(item, changes["status"], admin_id)


def _close_gap(file: PlanFile, item: PlanItem) -> None:
    for n, s in enumerate(x for x in siblings(file, item.nodeId, item.parentId) if x.id != item.id):
        s.order = n


def delete_item(file: PlanFile, fb: feedback.FeedbackFile, admin_id: str, item_id: str) -> None:
    item = _item(file, item_id)
    _require_planner(fb, admin_id, item.nodeId, "Changing the plan")
    gone = {item.id} | {d.id for d in descendants(file, item.id)}
    file.items = [i for i in file.items if i.id not in gone]
    for n, s in enumerate(siblings(file, item.nodeId, item.parentId)):
        s.order = n


def reorder(file: PlanFile, fb: feedback.FeedbackFile, admin_id: str, node_id: str, parent_id: Optional[str], ordered_ids: list[str]) -> None:
    _require_planner(fb, admin_id, node_id, "Changing the plan")
    group = siblings(file, node_id, parent_id)
    if sorted(i.id for i in group) != sorted(ordered_ids):
        raise PlanError("The new order must list every item there exactly once.")
    at = {iid: n for n, iid in enumerate(ordered_ids)}
    for i in group:
        i.order = at[i.id]


def claim(file: PlanFile, fb: feedback.FeedbackFile, admin_id: str, item_id: str, release: bool = False) -> None:
    item = _item(file, item_id)
    admin = feedback.admin_by_id(fb, admin_id)
    if release:
        if item.claimedBy != admin.id:
            raise Forbidden("Only who claimed an item lets it go.")
        item.claimedBy = ""
        if item.status == "claimed":
            item.status = "todo"
        return
    if not _can(fb, admin, item)["claim"]:
        raise Forbidden("This item is assigned to or claimed by someone else.")
    item.claimedBy = admin.id
    if item.status == "todo":
        item.status = "claimed"
