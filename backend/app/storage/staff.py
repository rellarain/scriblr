"""Global (not project-scoped) storage for the staff, at %APPDATA%\\Scriblr\\staff.json: the people (helpers and admins),
the organisation (departments, each with a director, and teams, each with a manager and members), the helper hours the
Office allots, the console queues each person supports, and the time allowed for plan work per priority (the SLA).

How the pieces fit:
  - The people are the staff the feedback pipeline acts as (its `admins`, which keep each person's roles per console).
    Hiring adds a person to both; a person who leaves is marked inactive, never deleted, so what they did keeps their name.
    On first use the staff are made from the feedback admins, placed in a small sample organisation.
  - Support tiers are per console and worked out, not set: tier 1 is a helper promoted on that console, tier 2 a helper
    promoted on its interface, tier 3 the console's channel support (the people who support its queue: they manage it),
    tier 4 an admin with helper hours promoted on that console. Someone with no tier on a console does not take its chats.
  - Promotion follows training: a person's finished training on an interface or a console is recorded (by hand until
    Training keeps records per staff member), then a director promotes them on it.
  - The roster is one list: by department, then tier (the highest a person has anywhere), active above inactive, then by
    name.
  - Plan work is due within the SLA of its priority, counted from when it was assigned (project_plan.py works out the
    escalation when the plan is read).
"""

import json
import re
import threading
import uuid
from pathlib import Path
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import channels, feedback, project_store
from .schema import utcnow

PersonKind = Literal["helper", "admin"]
ALLOTMENTS = (5, 10, 20, 30)
SCHEMA_VERSION = 1
NAME_MAX = 80
PRIORITIES = ("urgent", "high", "normal", "low")
DEFAULT_SLA = {"urgent": 4, "high": 24, "normal": 72, "low": 168}
TIER_MAX = 4
TRAINING_MAX = 200


class StaffError(Exception):
    status = 400


class NotFound(StaffError):
    status = 404


class Training(BaseModel):
    """Training a person finished on an interface or a console, and the director's promotion on it."""

    nodeId: str
    finishedAt: datetime = Field(default_factory=utcnow)
    promotedBy: Optional[str] = None
    promotedAt: Optional[datetime] = None


class Person(BaseModel):
    id: str
    name: str = Field(max_length=NAME_MAX)
    kind: PersonKind = "admin"
    active: bool = True
    departmentId: Optional[str] = None
    teamId: Optional[str] = None
    # Helper hours a week the Office allots (5, 10, 20 or 30), or none.
    allotment: Optional[int] = None
    # The console queues (channel ids) this person supports (channel support).
    supports: list[str] = Field(default_factory=list)
    # Training finished on interfaces and consoles, and promotions.
    training: list[Training] = Field(default_factory=list, max_length=TRAINING_MAX)


class Department(BaseModel):
    id: str
    name: str = Field(max_length=NAME_MAX)
    directorId: Optional[str] = None


class Team(BaseModel):
    id: str
    name: str = Field(max_length=NAME_MAX)
    departmentId: str
    managerId: Optional[str] = None


class StaffFile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    people: list[Person] = Field(default_factory=list)
    departments: list[Department] = Field(default_factory=list)
    teams: list[Team] = Field(default_factory=list)
    # Hours allowed per priority before plan work escalates.
    sla: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_SLA))


# --------------------------------------------------------------------------
# The sample organisation (first use)
# --------------------------------------------------------------------------


def _seed(root: Path) -> StaffFile:
    fb = feedback.load(root)
    file = StaffFile(
        departments=[Department(id="dep-product", name="Product", directorId="adm-dana"), Department(id="dep-support", name="Support", directorId="adm-sam")],
        teams=[
            Team(id="team-writing", name="Writing tools", departmentId="dep-product", managerId="adm-dana"),
            Team(id="team-reading", name="Reading", departmentId="dep-product", managerId="adm-lee"),
            Team(id="team-help", name="Help desk", departmentId="dep-support", managerId="adm-sam"),
        ],
    )
    place = {"adm-dana": ("dep-product", "team-writing"), "adm-lee": ("dep-product", "team-reading"), "adm-sam": ("dep-support", "team-help")}
    for a in fb.admins:
        if a.id == feedback.OWNER_ID:
            continue  # the owner is added by _ensure_owner, with their hours
        dep, team = place.get(a.id, (None, None))
        file.people.append(Person(id=a.id, name=a.name, departmentId=dep, teamId=team))
    lee = next((p for p in file.people if p.id == "adm-lee"), None)
    if lee:
        lee.supports = ["reader/library", "reader/nook"]
        lee.allotment = 10
    dana = next((p for p in file.people if p.id == "adm-dana"), None)
    if dana:
        dana.supports = ["writer/draft"]
    sam = next((p for p in file.people if p.id == "adm-sam"), None)
    if sam:
        sam.allotment = 10
        sam.training = [Training(nodeId="writer/draft", promotedBy="adm-sam", promotedAt=utcnow())]
    for pid, name in (("hlp-ari", "Ari Chen"), ("hlp-noor", "Noor Haddad")):
        file.people.append(Person(id=pid, name=name, kind="helper", departmentId="dep-support", teamId="team-help", allotment=20 if pid == "hlp-ari" else 10))
        feedback_admin(root, pid, name)
    ari = next(p for p in file.people if p.id == "hlp-ari")
    ari.training = [Training(nodeId="writer/draft", promotedBy="adm-sam", promotedAt=utcnow()), Training(nodeId="writer", promotedBy="adm-sam", promotedAt=utcnow())]
    noor = next(p for p in file.people if p.id == "hlp-noor")
    noor.training = [Training(nodeId="reader/library", promotedBy="adm-sam", promotedAt=utcnow()), Training(nodeId="writer/draft", promotedBy="adm-sam", promotedAt=utcnow()), Training(nodeId="reader")]
    return file


def feedback_admin(root: Path, pid: str, name: str) -> None:
    """The person as the feedback pipeline knows them (its admins hold the roles), added or renamed."""
    def go(f: feedback.FeedbackFile) -> None:
        for a in f.admins:
            if a.id == pid:
                a.name = name
                return
        f.admins.append(feedback.Admin(id=pid, name=name))
    feedback.mutate(root, go)


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------

_lock = threading.RLock()


def _path(root: Path) -> Path:
    return root / "staff.json"


def _save(root: Path, file: StaffFile) -> None:
    project_store._atomic_write_json(root, _path(root), file.model_dump(mode="json"))


def _ensure_owner(file: StaffFile) -> None:
    """The owner (universal access) is always on the roster, first: an admin with 30 helper hours, never termed. Kept in the file the next time it is
    written."""
    if not any(p.id == feedback.OWNER_ID for p in file.people):
        file.people.insert(0, Person(id=feedback.OWNER_ID, name=feedback.OWNER_NAME, kind="admin", allotment=30))


def _load(root: Path) -> StaffFile:
    path = _path(root)
    if not path.exists():
        file = _seed(root)
        _ensure_owner(file)
        _save(root, file)
        return file
    try:
        file = StaffFile.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
        quarantined = project_store._quarantine(path)
        raise project_store.ShardCorruptError(path, quarantined, str(e)) from e
    for p in PRIORITIES:
        file.sla.setdefault(p, DEFAULT_SLA[p])
    _ensure_owner(file)
    return file


def load(root: Path) -> StaffFile:
    with _lock:
        return _load(root)


def mutate(root: Path, fn) -> StaffFile:
    with _lock:
        file = _load(root)
        fn(file)
        _save(root, file)
        return file


def _uses(root: Path, ids: set[str]) -> list[str]:
    people = load(root).people
    n = sum(1 for p in people if any(s in ids for s in p.supports))
    t = sum(1 for p in people if any(r.nodeId in ids for r in p.training))
    out = [f"{n} staff member{'s' if n != 1 else ''} supporting its queue"] if n else []
    return out + ([f"training of {t} staff member{'s' if t != 1 else ''}"] if t else [])


channels.register_use_check(_uses)


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------


def interface_of(console_id: str) -> str:
    return console_id.split("/")[0]


def promoted(p: Person, node_id: str) -> bool:
    return any(r.nodeId == node_id and r.promotedBy for r in p.training)


def tier_for(p: Person, console_id: str) -> Optional[int]:
    """The person's support tier on a console (the highest that applies), or None: they do not take its chats. Someone
    who left has none."""
    if not p.active:
        return None
    if p.id == feedback.OWNER_ID:
        return 4
    if p.kind == "admin" and p.allotment and promoted(p, console_id):
        return 4
    if console_id in p.supports:
        return 3
    if p.kind == "helper" and promoted(p, interface_of(console_id)):
        return 2
    if p.kind == "helper" and promoted(p, console_id):
        return 1
    return None


def tier_of(p: Person) -> Optional[int]:
    """The highest tier a person has on any console (the roster's); none for someone who left."""
    if not p.active:
        return None
    if p.id == feedback.OWNER_ID:
        return 4
    tiers = [3 for _ in p.supports]
    for r in p.training:
        if not r.promotedBy:
            continue
        console = "/" in r.nodeId
        if p.kind == "admin" and console and p.allotment:
            tiers.append(4)
        elif p.kind == "helper":
            tiers.append(1 if console else 2)
    return max(tiers) if tiers else None


def roster(file: StaffFile) -> list[Person]:
    """One list: by department (in their order, no department last), then tier (none last), active above inactive, then
    by name."""
    dep_at = {d.id: n for n, d in enumerate(file.departments)}
    return sorted(file.people, key=lambda p: (
        dep_at.get(p.departmentId or "", len(dep_at)), tier_of(p) or 9, not p.active, p.name.lower(),
    ))


def person(file: StaffFile, pid: str) -> Person:
    for p in file.people:
        if p.id == pid:
            return p
    raise NotFound(f"No staff member {pid}")


def team(file: StaffFile, tid: str) -> Team:
    for t in file.teams:
        if t.id == tid:
            return t
    raise NotFound(f"No team {tid}")


def department(file: StaffFile, did: str) -> Department:
    for d in file.departments:
        if d.id == did:
            return d
    raise NotFound(f"No department {did}")


def view(file: StaffFile) -> dict:
    return {
        "people": [{**p.model_dump(mode="json"), "tier": tier_of(p)} for p in roster(file)],
        "departments": [d.model_dump(mode="json") for d in file.departments],
        "teams": [t.model_dump(mode="json") for t in file.teams],
        "sla": file.sla,
        "allotments": list(ALLOTMENTS),
    }


# --------------------------------------------------------------------------
# Changes
# --------------------------------------------------------------------------


def _name(name: str, what: str) -> str:
    n = " ".join(name.split())
    if not n:
        raise StaffError(f"{what} needs a name.")
    return n[:NAME_MAX]


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:24] or "x"


def _check_place(file: StaffFile, department_id: Optional[str], team_id: Optional[str]) -> None:
    if department_id:
        department(file, department_id)
    if team_id:
        t = team(file, team_id)
        if department_id and t.departmentId != department_id:
            raise StaffError("That team is in another department.")


def hire(file: StaffFile, root: Path, name: str, kind: str, department_id: Optional[str], team_id: Optional[str]) -> Person:
    clean = _name(name, "A staff member")
    _check_place(file, department_id, team_id)
    if team_id and not department_id:
        department_id = team(file, team_id).departmentId
    prefix = "hlp" if kind == "helper" else "adm"
    pid = f"{prefix}-{_slug(clean)}"
    if any(p.id == pid for p in file.people):
        pid = f"{pid}-{uuid.uuid4().hex[:4]}"
    p = Person(id=pid, name=clean, kind=kind, departmentId=department_id, teamId=team_id)  # type: ignore[arg-type]
    file.people.append(p)
    feedback_admin(root, p.id, p.name)
    return p


def _leads_nothing(file: StaffFile, pid: str) -> None:
    for d in file.departments:
        if d.directorId == pid:
            d.directorId = None
    for t in file.teams:
        if t.managerId == pid:
            t.managerId = None


def edit_person(file: StaffFile, root: Path, pid: str, changes: dict) -> None:
    p = person(file, pid)
    if p.id == feedback.OWNER_ID and changes.get("active") is False:
        raise StaffError("The owner cannot be termed.")
    if p.id == feedback.OWNER_ID and changes.get("kind", "admin") != "admin":
        raise StaffError("The owner stays an admin.")
    if "name" in changes:
        p.name = _name(changes["name"], "A staff member")
        feedback_admin(root, p.id, p.name)
    if "kind" in changes:
        p.kind = changes["kind"]
        if p.kind == "helper":
            # Someone made a helper leads nothing, as someone who left does.
            _leads_nothing(file, p.id)
    dep = changes.get("departmentId", p.departmentId)
    tid = changes.get("teamId", p.teamId)
    if "departmentId" in changes and "teamId" not in changes and tid and team(file, tid).departmentId != dep:
        tid = None
    _check_place(file, dep, tid)
    p.departmentId, p.teamId = dep, tid
    if "active" in changes:
        p.active = bool(changes["active"])
        if not p.active:
            # Someone who left leads nothing.
            _leads_nothing(file, p.id)
    if "allotment" in changes:
        a = changes["allotment"]
        if a is not None and a not in ALLOTMENTS:
            raise StaffError("Helper hours are 5, 10, 20 or 30 a week.")
        p.allotment = a
    if "supports" in changes:
        from . import resources  # (resources reads feedback, which this module also uses)
        known = {n.id for n in resources.load_resources(root).nodes if n.kind == "console"}
        bad = [s for s in changes["supports"] if s not in known]
        if bad:
            raise StaffError(f"No console {bad[0]}.")
        p.supports = list(dict.fromkeys(changes["supports"]))


def set_training(file: StaffFile, root: Path, pid: str, node_id: str, finished: bool) -> None:
    """Record (or take back) a person's finished training on an interface or a console. Taking it back takes back the
    promotion too."""
    from . import resources
    p = person(file, pid)
    kinds = {n.id: n.kind for n in resources.load_resources(root).nodes}
    if kinds.get(node_id) not in ("interface", "console"):
        raise StaffError("Training is on an interface or a console.")
    has = next((r for r in p.training if r.nodeId == node_id), None)
    if finished and has is None:
        if len(p.training) >= TRAINING_MAX:
            raise StaffError("Too many training records.")
        p.training.append(Training(nodeId=node_id))
    elif not finished and has is not None:
        p.training.remove(has)


def promote(file: StaffFile, me: str, pid: str, node_id: str, on: bool) -> None:
    """A director promotes a person on an interface or a console they finished training on (or takes it back): the
    director of the person's department, or any director when they have none."""
    p = person(file, pid)
    directors = {d.directorId for d in file.departments if d.directorId}
    own = next((d.directorId for d in file.departments if d.id == p.departmentId), None) if p.departmentId else None
    if me != feedback.OWNER_ID and ((own and me != own) or (not own and me not in directors)):
        raise StaffError("Only a director promotes" + (" (the director of their department)." if own else "."))
    r = next((x for x in p.training if x.nodeId == node_id), None)
    if r is None:
        raise StaffError("Their training there is not finished yet.")
    r.promotedBy, r.promotedAt = (me, utcnow()) if on else (None, None)


def add_department(file: StaffFile, name: str) -> Department:
    d = Department(id=f"dep-{_slug(name)}-{uuid.uuid4().hex[:4]}", name=_name(name, "A department"))
    file.departments.append(d)
    return d


def edit_department(file: StaffFile, did: str, changes: dict) -> None:
    d = department(file, did)
    if "name" in changes:
        d.name = _name(changes["name"], "A department")
    if "directorId" in changes:
        if changes["directorId"]:
            p = person(file, changes["directorId"])
            if not p.active:
                raise StaffError(f"{p.name} has left.")
        d.directorId = changes["directorId"] or None


def delete_department(file: StaffFile, did: str) -> None:
    department(file, did)
    if any(t.departmentId == did for t in file.teams) or any(p.departmentId == did for p in file.people):
        raise StaffError("Move its teams and people out first.")
    file.departments = [d for d in file.departments if d.id != did]


def add_team(file: StaffFile, name: str, department_id: str) -> Team:
    department(file, department_id)
    t = Team(id=f"team-{_slug(name)}-{uuid.uuid4().hex[:4]}", name=_name(name, "A team"), departmentId=department_id)
    file.teams.append(t)
    return t


def edit_team(file: StaffFile, tid: str, changes: dict) -> None:
    t = team(file, tid)
    if "name" in changes:
        t.name = _name(changes["name"], "A team")
    if "departmentId" in changes:
        department(file, changes["departmentId"])
        t.departmentId = changes["departmentId"]
        for p in file.people:
            if p.teamId == t.id:
                p.departmentId = t.departmentId
    if "managerId" in changes:
        if changes["managerId"]:
            p = person(file, changes["managerId"])
            if not p.active:
                raise StaffError(f"{p.name} has left.")
        t.managerId = changes["managerId"] or None


def delete_team(file: StaffFile, tid: str) -> None:
    team(file, tid)
    if any(p.teamId == tid for p in file.people):
        raise StaffError("Move its people out first.")
    file.teams = [t for t in file.teams if t.id != tid]


def set_sla(file: StaffFile, sla: dict[str, int]) -> None:
    for k, v in sla.items():
        if k not in PRIORITIES:
            raise StaffError(f"No priority {k}.")
        if not isinstance(v, int) or v < 1 or v > 24 * 90:
            raise StaffError("An SLA is 1 hour to 90 days.")
        file.sla[k] = v
