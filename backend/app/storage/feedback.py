"""Global (not project-scoped) storage and rules for the feedback pipeline, at %APPDATA%\\Scriblr\\feedback.json
(seeded with sample data on first use).

How the pieces fit:
  - A user writes a feedback message in a Help tile as a statement: a subject (any node of the channel list, by id:
    an interface, console, component or feature) and an action verb (a managed verb category), with their text and,
    if they like, their tone. Where they were when they wrote it is kept too (`fromChannel`).
  - A helper checks the message in the Inbox (role "checker" on Helper > Inbox): confirms or corrects the subject and
    the verb, sets the tone, may ask the user a question (it appears on the user's dashboard and they answer it) or
    leave a comment (staff only). Once checked it is in voting.
  - Messages with the same subject and verb are one statement, derived on read; only its votes, its decision and its
    history are stored (keyed by the pair). Admins vote on statements (role "voter" on its console; votes are advice)
    and Channel Management corrects messages ("channelManager"): moving one to another subject or verb moves it to
    that statement.
  - The planner of the statement's console ("planner") accepts it (it becomes plan work) or vetoes it, with a note,
    whether or not it has votes. What the user sees follows: received, in voting, planned, in progress, done, or
    declined with the note (in progress and done come from the plan, through `work_of`).
  - Roles are held per scope: the console a subject is in (the first two parts of its id, "writer/draft"), or the
    interface for a subject that is an interface.
  - The staff bundle names no user and no other admin's items: an admin's own votes, questions and comments are marked
    as theirs.

Version 2 (subjects and verbs chosen by several validators, cases with solutions, names instead of ids) is moved to
version 3 once, keeping a copy of the old file as feedback.v2.json.
"""

import hashlib
import json
import re
import shutil
import threading
import uuid
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Callable, Literal, Optional

from pydantic import BaseModel, Field

from . import channels, project_store
from .schema import utcnow

Tone = Literal["pleasant", "unpleasant", "mixed", "neutral"]
ToneCategory = Literal["pleasant", "mixedPleasant", "neutral", "mixed", "mixedUnpleasant", "unpleasant"]
Role = Literal["checker", "voter", "channelManager", "planner"]
Decision = Literal["accepted", "vetoed"]
Status = Literal["received", "voting", "planned", "inProgress", "done", "declined"]
WorkStatus = Optional[Literal["planned", "inProgress", "done"]]

SCHEMA_VERSION = 3
NOTE_MAX = 500
TEXT_MAX = 2000
INBOX = "helper/inbox"
ROLE_ORDER: list[str] = ["checker", "voter", "channelManager", "planner"]
ROLE_WORDS = {"checker": "the Checker role", "voter": "the Voter role", "channelManager": "the Channel manager role", "planner": "the Planner role"}


def scope_of(channel_id: str) -> str:
    """The console a node is in (its id's first two parts), or the interface itself."""
    return "/".join(channel_id.split("/")[:2])


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------


class VerbCategory(BaseModel):
    id: str
    name: str
    keywords: list[str] = Field(default_factory=list)


class Admin(BaseModel):
    """`roles` maps a scope (a console's channel id, or an interface's) to the roles the admin holds there."""

    id: str
    name: str
    roles: dict[str, list[Role]] = Field(default_factory=dict)


class HistoryEvent(BaseModel):
    at: datetime = Field(default_factory=utcnow)
    adminId: str = ""
    kind: str
    detail: str = ""


class Question(BaseModel):
    """Asked by a helper or an admin; shown on the user's dashboard, who answers it."""

    id: str
    askedBy: str
    text: str
    at: datetime = Field(default_factory=utcnow)
    answer: str = ""
    answeredAt: Optional[datetime] = None


class Comment(BaseModel):
    """Between staff only; the user never sees it."""

    id: str
    by: str
    text: str
    at: datetime = Field(default_factory=utcnow)


class Message(BaseModel):
    id: str
    text: str
    author: str = ""
    authorId: str = ""
    submittedAt: str
    senderTone: Optional[Tone] = None
    channelId: str
    verbId: str
    fromChannel: Optional[str] = None
    tone: Optional[Tone] = None
    checkedBy: Optional[str] = None
    checkedAt: Optional[datetime] = None
    questions: list[Question] = Field(default_factory=list)
    comments: list[Comment] = Field(default_factory=list)
    history: list[HistoryEvent] = Field(default_factory=list)

    @property
    def checked(self) -> bool:
        return self.checkedAt is not None


class Vote(BaseModel):
    adminId: str
    approve: bool = False
    deny: bool = False
    passed: bool = False
    approveNote: str = ""
    denyNote: str = ""
    passNote: str = ""
    updatedAt: datetime = Field(default_factory=utcnow)


class StatementState(BaseModel):
    id: str
    key: str  # "channelId::verbId"
    votes: list[Vote] = Field(default_factory=list)
    decision: Optional[Decision] = None
    decidedBy: Optional[str] = None
    decidedAt: Optional[datetime] = None
    decisionNote: str = ""
    history: list[HistoryEvent] = Field(default_factory=list)


class FeedbackFile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    admins: list[Admin] = Field(default_factory=list)
    verbCategories: list[VerbCategory] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    statements: dict[str, StatementState] = Field(default_factory=dict)  # statement id -> state
    roleHistory: list[HistoryEvent] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Errors (mapped to HTTP statuses in api/feedback.py)
# --------------------------------------------------------------------------


class FeedbackError(Exception):
    status = 400


class NotFound(FeedbackError):
    status = 404


class Forbidden(FeedbackError):
    status = 403


class Conflict(FeedbackError):
    status = 409


# --------------------------------------------------------------------------
# Seed
# --------------------------------------------------------------------------

_SEED_VERBS = [
    ("verb-increase", "Increase", ["increase", "raise", "boost", "brighter", "larger", "contrast", "hard to see"]),
    ("verb-improve", "Improve", ["improve", "better", "useless", "relevant", "slow"]),
    ("verb-fix", "Fix", ["fix", "broken", "bug", "freezes", "crash", "error"]),
    ("verb-add", "Add", ["add", "missing", "wish", "would like", "need"]),
    ("verb-remove", "Remove", ["remove", "delete", "get rid of", "annoying"]),
    ("verb-simplify", "Simplify", ["simplify", "confusing", "complicated", "not sure"]),
    ("verb-keep", "Keep", ["keep", "great", "love", "like"]),
]


def _screen_consoles(interfaces: list[str]) -> list[str]:
    return [sid for sid, kind, parent, _name, _order in channels.APP_SCREENS if kind == "console" and parent in interfaces]


def _grant(*pairs: tuple[list[str], list[Role]]) -> dict[str, list[Role]]:
    out: dict[str, list[Role]] = {}
    for scopes, roles in pairs:
        for scope in scopes:
            have = out.setdefault(scope, [])
            for r in roles:
                if r not in have:
                    have.append(r)
    return out


def _seed_admins() -> list[Admin]:
    return [
        Admin(id="adm-dana", name="Dana Ruiz", roles=_grant(
            ([INBOX], ["checker", "channelManager"]),
            (_screen_consoles(["writer", "reader", "admin"]), ["voter"]),
            (_screen_consoles(["writer"]), ["channelManager", "planner"]),
        )),
        Admin(id="adm-lee", name="Lee Park", roles=_grant(
            ([INBOX], ["checker"]),
            (_screen_consoles(["writer", "reader"]), ["voter"]),
            (_screen_consoles(["reader"]), ["channelManager"]),
        )),
        Admin(id="adm-sam", name="Sam Ortiz", roles=_grant(
            ([INBOX], ["checker"]),
            (_screen_consoles(["reader"]), ["voter", "planner"]),
        )),
    ]


_SHELF = "writer/dashboard/project"


def _seed_message(mid: str, text: str, author: str, day: str, sender: Tone, channel: str, verb: str,
                  tone: Optional[Tone] = None, by: str = "") -> Message:
    m = Message(id=mid, text=text, author=author, authorId=author, submittedAt=day, senderTone=sender,
                channelId=channel, verbId=verb, fromChannel=scope_of(channel))
    if tone:
        m.tone = tone
        m.checkedBy = by
        m.checkedAt = datetime.fromisoformat(f"{day}T12:00:00+00:00")
    return m


def _build_seed() -> FeedbackFile:
    messages = [
        _seed_message("fb-1", "The editor freezes for a second every time I paste a large block of text.", "j.rivera", "2026-08-10",
                      "unpleasant", "writer/draft/draft", "verb-fix", "unpleasant", "adm-dana"),
        _seed_message("fb-2", "I love the new dark mode, but the shelf icons are hard to see in it.", "a.kim", "2026-08-11",
                      "unpleasant", _SHELF, "verb-increase", "mixed", "adm-lee"),
        _seed_message("fb-3", "Search inside the library is basically useless, it never finds anything relevant.", "m.okafor", "2026-08-12",
                      "unpleasant", "reader/library/catalog", "verb-improve", "unpleasant", "adm-dana"),
        _seed_message("fb-4", "Just wanted to say the reading stack is great, keep it up!", "j.rivera", "2026-08-13",
                      "pleasant", "reader/nook/stack", "verb-keep", "pleasant", "adm-sam"),
        _seed_message("fb-5", "Not sure what this button does??", "a.kim", "2026-08-14", "neutral", "admin/office/voting", "verb-simplify"),
        _seed_message("fb-6", "At night I cannot tell the shelf icons apart, they need more contrast.", "j.rivera", "2026-08-15",
                      "unpleasant", _SHELF, "verb-increase", "unpleasant", "adm-dana"),
        _seed_message("fb-7", "Dark mode is lovely but the icons are too dim, please make them brighter.", "m.okafor", "2026-08-16",
                      "mixed", _SHELF, "verb-increase"),
    ]
    messages[2].questions.append(Question(id="q-seed-1", askedBy="adm-lee", text="Which words did you search for?"))
    messages[1].comments.append(Comment(id="c-seed-1", by="adm-dana", text="Three reports of this now."))
    file = FeedbackFile(
        admins=_seed_admins(),
        verbCategories=[VerbCategory(id=i, name=n, keywords=k) for i, n, k in _SEED_VERBS],
        messages=messages,
    )
    key = statement_key(_SHELF, "verb-increase")
    state = StatementState(id=statement_id(key), key=key, votes=[
        Vote(adminId="adm-dana", approve=True, approveNote="Three separate reports, clearly a real problem."),
        Vote(adminId="adm-lee", deny=True, denyNote="Wait for the theme rework first."),
    ], history=[HistoryEvent(adminId="adm-dana", kind="vote", detail="approved"), HistoryEvent(adminId="adm-lee", kind="vote", detail="denied")])
    file.statements[state.id] = state
    return file


# --------------------------------------------------------------------------
# Persistence (and the one-time moves from versions 1 and 2)
# --------------------------------------------------------------------------

_lock = threading.RLock()


def _path(root: Path) -> Path:
    return root / "feedback.json"


def _save(root: Path, file: FeedbackFile) -> None:
    project_store._atomic_write_json(root, _path(root), file.model_dump(mode="json"))


def _migrate_v1(raw: dict) -> dict:
    """Version 1 kept three access lists per admin ("Page/Console" or "Page/*"); version 2 keeps roles per console.
    The patterns are carried over as keys and resolved by _migrate_v2."""
    mapping = (("processing", "processor"), ("configuration", "configurer"), ("projectPlan", "planner"))
    for admin in raw.get("admins", []):
        if "roles" in admin:
            continue
        roles: dict[str, list[str]] = {}
        for old, role in mapping:
            for pattern in admin.pop(old, None) or []:
                have = roles.setdefault(pattern, [])
                if role not in have:
                    have.append(role)
        admin["roles"] = roles
    raw["schemaVersion"] = 2
    return raw


def _v2_complete(v: dict) -> bool:
    if not v.get("tone") or not v.get("channels"):
        return False
    key = lambda c: "|".join((c.get("page", ""), c.get("console", ""), c.get("component", ""), c.get("feature", "")))  # noqa: E731
    with_verb = {key(s.get("channel", {})) for s in v.get("statements", [])}
    return all(key(c) in with_verb for c in v["channels"])


def _migrate_v2(raw: dict, root: Path) -> dict:
    """Version 3: one subject (a channel id) and one verb per message, checked once; statements instead of cases
    (votes and the close kept, as a decision; proposed solutions are left in feedback.v2.json); roles per scope id."""
    from . import resources

    def place(names: list[str]) -> Optional[str]:
        names = [n for n in names if n]
        if not names:
            return None
        try:
            return resources.ensure_path(root, names)
        except resources.ResourcesError:
            return None

    def tag_names(tag: dict) -> list[str]:
        return [tag.get("page", ""), tag.get("console", ""), tag.get("component", ""), tag.get("feature", "")]

    verbs = [v["id"] for v in raw.get("verbCategories", [])]
    categories = [VerbCategory.model_validate(v) for v in raw.get("verbCategories", [])]
    messages = []
    for m in raw.get("messages", []):
        vals = raw.get("validations", {}).get(m["id"], [])
        complete = [v for v in vals if _v2_complete(v)]
        statement = next((s for v in complete + vals for s in v.get("statements", [])), None)
        subject = statement["channel"] if statement else next((c for v in vals for c in v.get("channels", [])), None)
        open_names = [m.get("openPage") or "", m.get("openConsole") or "", m.get("selectedComponent") or ""]
        channel_id = place(tag_names(subject)) if subject else None
        from_channel = place(open_names)
        channel_id = channel_id or from_channel or place(["Writer"]) or "writer"
        verb_id = statement["verbId"] if statement else None
        if not verb_id:
            flags = flags_for(m.get("text", ""), categories)
            verb_id = flags[0]["categoryId"] if flags else (verbs[0] if verbs else "verb-improve")
        labels = [v["tone"] for v in complete if v.get("tone")]
        checker = complete[0] if complete else None
        history = raw.get("messageHistory", {}).get(m["id"], [])
        messages.append({
            "id": m["id"], "text": m.get("text", ""), "author": m.get("author", ""), "authorId": m.get("author", ""),
            "submittedAt": m.get("submittedAt", ""), "senderTone": m.get("senderTone"),
            "channelId": channel_id, "verbId": verb_id, "fromChannel": from_channel,
            "tone": Counter(labels).most_common(1)[0][0] if labels else None,
            "checkedBy": checker.get("adminId") if checker else None,
            "checkedAt": (checker.get("updatedAt") or utcnow().isoformat()) if checker else None,
            "history": history,
        })

    statements: dict[str, dict] = {}
    for state in raw.get("cases", {}).values():
        names, _, verb_id = state.get("key", "").partition("::")
        channel_id = place(names.split("|"))
        if not channel_id or not verb_id:
            continue
        key = statement_key(channel_id, verb_id)
        sid = statement_id(key)
        if sid in statements:
            continue
        status = state.get("status", "open")
        statements[sid] = {
            "id": sid, "key": key, "votes": state.get("votes", []),
            "decision": {"approved": "accepted", "rejected": "vetoed"}.get(status),
            "decidedBy": state.get("closedBy"), "decidedAt": state.get("closedAt"), "decisionNote": state.get("closeNote", ""),
            "history": [h for h in state.get("history", []) if h.get("kind") in ("vote", "closed", "reopened")],
        }

    def interface_consoles(page: str) -> list[str]:
        interface = place([page])
        if not interface:
            return []
        file = resources.load_resources(root)
        return [n.id for n in file.nodes if n.parentId == interface and n.kind == "console"]

    admins = []
    for a in raw.get("admins", []):
        roles: dict[str, list[str]] = {}
        for key, held in a.get("roles", {}).items():
            page, _, console = key.partition("/")
            scopes = interface_consoles(page) if console == "*" else [place([page, console])]
            inbox = (page, console) == ("Helper", "Inbox")
            new = []
            for r in held:
                role = {"processor": "checker" if inbox else "voter", "configurer": "channelManager", "planner": "planner"}.get(r)
                if role and role not in new:
                    new.append(role)
            for scope in scopes:
                if scope:
                    have = roles.setdefault(scope, [])
                    have.extend(x for x in new if x not in have)
        admins.append({"id": a["id"], "name": a.get("name", a["id"]), "roles": roles})

    return {
        "schemaVersion": SCHEMA_VERSION, "admins": admins, "verbCategories": raw.get("verbCategories", []),
        "messages": messages, "statements": statements, "roleHistory": raw.get("roleHistory", []),
    }


def _load(root: Path) -> FeedbackFile:
    path = _path(root)
    if not path.exists():
        file = _build_seed()
        _save(root, file)
        return file
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        version = raw.get("schemaVersion", 1)
        if version < SCHEMA_VERSION:
            shutil.copyfile(path, path.with_name(f"feedback.v{min(version, 2)}.json"))
            if version < 2:
                raw = _migrate_v1(raw)
            raw = _migrate_v2(raw, root)
        file = FeedbackFile.model_validate(raw)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
        quarantined = project_store._quarantine(path)
        raise project_store.ShardCorruptError(path, quarantined, str(e)) from e
    if version < SCHEMA_VERSION:
        _save(root, file)
    return file


def load(root: Path) -> FeedbackFile:
    with _lock:
        return _load(root)


def mutate(root: Path, fn) -> FeedbackFile:
    with _lock:
        file = _load(root)
        fn(file)
        _save(root, file)
        return file


def _uses(root: Path, ids: set[str]) -> list[str]:
    """What in feedback points at any of these channel ids (so the node is not deleted). Reading writes the seed when
    there is no file yet, so the seed never points at a node deleted before it was written."""
    n = sum(1 for m in load(root).messages if m.channelId in ids or m.fromChannel in ids)
    return [f"{n} feedback message{'s' if n != 1 else ''}"] if n else []


channels.register_use_check(_uses)


# --------------------------------------------------------------------------
# Roles
# --------------------------------------------------------------------------


def admin_by_id(file: FeedbackFile, admin_id: str) -> Admin:
    for a in file.admins:
        if a.id == admin_id:
            return a
    raise Forbidden(f"Unknown admin {admin_id!r}")


def has_role(admin: Admin, role: str, scope: str) -> bool:
    return role in admin.roles.get(scope, [])


def require_role(admin: Admin, role: str, scope: str, what: str, label: str = "") -> None:
    if not has_role(admin, role, scope):
        raise Forbidden(f"{what} needs {ROLE_WORDS[role]} on {label or scope}.")


# --------------------------------------------------------------------------
# Tone and keyword flags
# --------------------------------------------------------------------------


def tone_category(labels: list[str]) -> Optional[ToneCategory]:
    """One category from tone labels. A mixed label is one pleasant vote and one unpleasant vote; neutral is no
    vote. With n labels: neutral when half or more are neutral; else mixed when pleasant and unpleasant each reach
    half; else pleasant / unpleasant at 75%; else mixed-leaning pleasant / unpleasant at 50%; else mixed. None with
    no labels."""
    n = len(labels)
    if n == 0:
        return None
    pleasant = sum(1 for t in labels if t in ("pleasant", "mixed"))
    unpleasant = sum(1 for t in labels if t in ("unpleasant", "mixed"))
    neutral = sum(1 for t in labels if t == "neutral")
    p, u, z = pleasant / n, unpleasant / n, neutral / n
    if z >= 0.5:
        return "neutral"
    if p >= 0.5 and u >= 0.5:
        return "mixed"
    if p >= 0.75:
        return "pleasant"
    if u >= 0.75:
        return "unpleasant"
    if p >= 0.5:
        return "mixedPleasant"
    if u >= 0.5:
        return "mixedUnpleasant"
    return "mixed"


def tone_summary(labels: list[str]) -> dict:
    return {
        "category": tone_category(labels),
        "pleasant": sum(1 for t in labels if t in ("pleasant", "mixed")),
        "unpleasant": sum(1 for t in labels if t in ("unpleasant", "mixed")),
        "neutral": sum(1 for t in labels if t == "neutral"),
        "n": len(labels),
    }


def flags_for(text: str, categories: list[VerbCategory]) -> list[dict]:
    """Words in the message that could indicate an intention verb: each keyword (matched from a word start, so
    "increase" also flags "increased")."""
    found: list[dict] = []
    for cat in categories:
        for kw in cat.keywords:
            for m in re.finditer(r"(?<!\w)" + re.escape(kw) + r"\w*", text, flags=re.IGNORECASE):
                found.append({"categoryId": cat.id, "keyword": kw, "start": m.start(), "end": m.end()})
    found.sort(key=lambda f: (f["start"], -f["end"]))
    return found


# --------------------------------------------------------------------------
# Statements and statuses
# --------------------------------------------------------------------------


def statement_key(channel_id: str, verb_id: str) -> str:
    return f"{channel_id}::{verb_id}"


def statement_id(key: str) -> str:
    return "st-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]


def state_of(file: FeedbackFile, key: str) -> StatementState:
    sid = statement_id(key)
    return file.statements.get(sid) or StatementState(id=sid, key=key)


def derive_statements(file: FeedbackFile) -> list[dict]:
    """Every statement the checked messages make: messages with one subject and one verb are one statement."""
    groups: dict[str, list[Message]] = {}
    for m in file.messages:
        if m.checked:
            groups.setdefault(statement_key(m.channelId, m.verbId), []).append(m)
    verbs = {v.id: v.name for v in file.verbCategories}
    out = []
    for key, members in groups.items():
        channel_id, _, verb_id = key.partition("::")
        out.append({"state": state_of(file, key), "channelId": channel_id, "verbId": verb_id,
                    "verbName": verbs.get(verb_id, verb_id), "messages": members})
    out.sort(key=lambda s: min(m.submittedAt for m in s["messages"]))
    return out


def find_statement(file: FeedbackFile, sid: str) -> dict:
    for s in derive_statements(file):
        if s["state"].id == sid:
            return s
    raise NotFound(f"Statement {sid} not found")


# What the plan says of a statement's work (Project Plan): planned, in progress or done, or None with no plan work.
WorkOf = Callable[[str], WorkStatus]


def message_status(file: FeedbackFile, m: Message, work_of: Optional[WorkOf] = None) -> dict:
    """Where a message stands for its writer, with the steps it has passed."""
    steps: list[dict] = [{"step": "received", "at": m.submittedAt}]
    if not m.checked:
        return {"status": "received", "steps": steps, "note": ""}
    assert m.checkedAt is not None
    steps.append({"step": "checked", "at": m.checkedAt.isoformat()})
    state = state_of(file, statement_key(m.channelId, m.verbId))
    at = state.decidedAt.isoformat() if state.decidedAt else None
    if state.decision == "vetoed":
        steps.append({"step": "declined", "at": at})
        return {"status": "declined", "steps": steps, "note": state.decisionNote}
    if state.decision != "accepted":
        steps.append({"step": "voting", "at": m.checkedAt.isoformat()})
        return {"status": "voting", "steps": steps, "note": ""}
    steps.append({"step": "planned", "at": at})
    work = work_of(state.id) if work_of else None
    status: Status = "planned"
    if work in ("inProgress", "done"):
        steps.append({"step": "inProgress", "at": None})
        status = "inProgress"
    if work == "done":
        steps.append({"step": "done", "at": None})
        status = "done"
    return {"status": status, "steps": steps, "note": state.decisionNote}


# --------------------------------------------------------------------------
# Views
# --------------------------------------------------------------------------


def _vote_view(v: Vote, me: str) -> dict:
    return {
        "mine": v.adminId == me, "approve": v.approve, "deny": v.deny, "passed": v.passed,
        "approveNote": v.approveNote, "denyNote": v.denyNote, "passNote": v.passNote, "updatedAt": v.updatedAt.isoformat(),
    }


def _history_view(events: list[HistoryEvent], me: str) -> list[dict]:
    return [{"at": e.at.isoformat(), "kind": e.kind, "detail": e.detail, "mine": e.adminId == me} for e in events]


def _question_view(q: Question, me: Optional[str]) -> dict:
    view = {"id": q.id, "text": q.text, "at": q.at.isoformat(), "answer": q.answer,
            "answeredAt": q.answeredAt.isoformat() if q.answeredAt else None}
    if me is not None:
        view["mine"] = q.askedBy == me
    return view


def _message_view(file: FeedbackFile, m: Message, me: str, work_of: Optional[WorkOf]) -> dict:
    return {
        "id": m.id, "text": m.text, "submittedAt": m.submittedAt, "senderTone": m.senderTone,
        "channelId": m.channelId, "verbId": m.verbId, "fromChannel": m.fromChannel, "tone": m.tone,
        "checked": m.checked, "checkedAt": m.checkedAt.isoformat() if m.checkedAt else None, "checkedByMe": m.checkedBy == me,
        "statementId": statement_id(statement_key(m.channelId, m.verbId)) if m.checked else None,
        "questions": [_question_view(q, me) for q in m.questions],
        "comments": [{"id": c.id, "text": c.text, "at": c.at.isoformat(), "mine": c.by == me} for c in m.comments],
        "flags": flags_for(m.text, file.verbCategories),
        "status": message_status(file, m, work_of)["status"],
        "history": _history_view(m.history, me),
    }


def bundle(file: FeedbackFile, admin_id: str, work_of: Optional[WorkOf] = None) -> dict:
    """Everything the Inbox, Office > Voting, Channel Management and the Project Plan show, for one admin."""
    me = admin_by_id(file, admin_id)
    statements = []
    for s in derive_statements(file):
        st: StatementState = s["state"]
        scope = scope_of(s["channelId"])
        votes = [v for v in st.votes if v.approve or v.deny or v.passed]
        work = work_of(st.id) if work_of else None
        statements.append({
            "id": st.id, "key": st.key, "channelId": s["channelId"], "verbId": s["verbId"], "verbName": s["verbName"],
            "messageIds": [m.id for m in s["messages"]],
            "tone": tone_summary([m.tone for m in s["messages"] if m.tone]),
            "votes": [_vote_view(v, admin_id) for v in votes],
            "tally": {"approve": sum(v.approve for v in votes), "deny": sum(v.deny for v in votes), "pass": sum(v.passed for v in votes)},
            "decision": st.decision, "decisionNote": st.decisionNote, "decidedAt": st.decidedAt.isoformat() if st.decidedAt else None,
            "work": work,
            "history": _history_view(st.history, admin_id),
            "can": {
                "vote": has_role(me, "voter", scope) and st.decision is None,
                "correct": has_role(me, "channelManager", scope),
                "decide": has_role(me, "planner", scope),
            },
        })
    return {
        "me": me.id,
        "admins": [{"id": a.id, "name": a.name, "roles": a.roles} for a in file.admins],
        "verbCategories": [v.model_dump(mode="json") for v in file.verbCategories],
        "messages": [_message_view(file, m, admin_id, work_of) for m in file.messages],
        "statements": statements,
        "roleHistory": _history_view(file.roleHistory, admin_id),
        "can": {"check": has_role(me, "checker", INBOX), "manageVerbs": has_role(me, "channelManager", INBOX)},
    }


def mine(file: FeedbackFile, author_id: str, work_of: Optional[WorkOf] = None) -> dict:
    """What one user sent, newest first, with where each stands and the questions asked of them (no comments, no
    names)."""
    verbs = {v.id: v.name for v in file.verbCategories}
    out = []
    for m in sorted((m for m in file.messages if author_id and m.authorId == author_id), key=lambda m: m.submittedAt, reverse=True):
        status = message_status(file, m, work_of)
        out.append({
            "id": m.id, "text": m.text, "submittedAt": m.submittedAt, "senderTone": m.senderTone,
            "channelId": m.channelId, "verbId": m.verbId, "verbName": verbs.get(m.verbId, m.verbId),
            "status": status["status"], "steps": status["steps"], "note": status["note"],
            "questions": [_question_view(q, None) for q in m.questions],
        })
    return {"messages": out, "openQuestions": sum(1 for m in out for q in m["questions"] if not q["answer"])}


# --------------------------------------------------------------------------
# Operations (each takes the loaded file and mutates it; the caller saves)
# --------------------------------------------------------------------------


def _message(file: FeedbackFile, message_id: str) -> Message:
    for m in file.messages:
        if m.id == message_id:
            return m
    raise NotFound(f"Message {message_id} not found")


def _check_place(channel_id: Optional[str], known: set[str], what: str = "subject") -> None:
    if not channel_id or channel_id not in known:
        raise FeedbackError(f"Unknown {what} {channel_id!r}")


def _check_verb(file: FeedbackFile, verb_id: str) -> None:
    if not any(v.id == verb_id for v in file.verbCategories):
        raise FeedbackError(f"Unknown verb category {verb_id!r}")


def _clean(text: str, limit: int, what: str) -> str:
    text = text.strip()
    if not text:
        raise FeedbackError(f"{what} needs some text.")
    return text[:limit]


def create_message(
    file: FeedbackFile, author: str, author_id: str, text: str, sender_tone: Optional[Tone],
    channel_id: str, verb_id: str, from_channel: Optional[str], known: set[str],
) -> Message:
    """A user's feedback, written as a statement (a subject and a verb) in a Help tile. Needs no admin."""
    text = _clean(text, TEXT_MAX, "Feedback")
    _check_place(channel_id, known)
    _check_verb(file, verb_id)
    if from_channel is not None and from_channel not in known:
        from_channel = None
    message = Message(
        id=f"fb-{uuid.uuid4().hex[:10]}", text=text, author=author.strip()[:120], authorId=author_id.strip()[:120],
        submittedAt=utcnow().isoformat(), senderTone=sender_tone, channelId=channel_id, verbId=verb_id, fromChannel=from_channel,
    )
    file.messages.append(message)
    return message


def edit_message(
    file: FeedbackFile, admin_id: str, message_id: str, known: set[str],
    channel_id: Optional[str] = None, verb_id: Optional[str] = None, tone: Optional[Tone] = None, checked: Optional[bool] = None,
) -> None:
    """The helper's check (an unchecked message: Checker on Helper > Inbox) or Channel Management's correction (a
    checked one: Channel manager on its console, and on the console it moves to). Fields left out stay as they are;
    `checked` only ever checks."""
    admin = admin_by_id(file, admin_id)
    m = _message(file, message_id)
    if m.checked:
        require_role(admin, "channelManager", scope_of(m.channelId), "Correcting a statement")
    else:
        require_role(admin, "checker", INBOX, "Checking feedback", "Helper > Inbox")
    changes: list[str] = []
    if channel_id is not None and channel_id != m.channelId:
        _check_place(channel_id, known)
        if m.checked:
            require_role(admin, "channelManager", scope_of(channel_id), "Moving a statement there")
        m.channelId = channel_id
        changes.append("moved the subject")
    if verb_id is not None and verb_id != m.verbId:
        _check_verb(file, verb_id)
        m.verbId = verb_id
        changes.append("changed the verb")
    if tone is not None and tone != m.tone:
        m.tone = tone
        changes.append("set the tone")
    if checked and not m.checked:
        if m.tone is None:
            raise FeedbackError("Set the tone before checking.")
        m.checkedBy = admin_id
        m.checkedAt = utcnow()
        changes.append("checked it")
    if changes:
        m.history.append(HistoryEvent(adminId=admin_id, kind="check" if not m.checked or checked else "correct", detail=", ".join(changes)))


def ask_question(file: FeedbackFile, admin_id: str, message_id: str, text: str) -> Question:
    admin_by_id(file, admin_id)
    m = _message(file, message_id)
    q = Question(id=project_store.new_id("q"), askedBy=admin_id, text=_clean(text, NOTE_MAX, "A question"))
    m.questions.append(q)
    m.history.append(HistoryEvent(adminId=admin_id, kind="question", detail="asked the writer a question"))
    return q


def add_comment(file: FeedbackFile, admin_id: str, message_id: str, text: str) -> Comment:
    admin_by_id(file, admin_id)
    m = _message(file, message_id)
    c = Comment(id=project_store.new_id("c"), by=admin_id, text=_clean(text, NOTE_MAX, "A comment"))
    m.comments.append(c)
    return c


def answer_question(file: FeedbackFile, author_id: str, message_id: str, question_id: str, answer: str) -> None:
    """The writer answers a question asked of them (only the writer of the message can)."""
    m = _message(file, message_id)
    if not author_id or m.authorId != author_id:
        raise Forbidden("Only the writer of this feedback can answer it.")
    q = next((x for x in m.questions if x.id == question_id), None)
    if q is None:
        raise NotFound(f"Question {question_id} not found")
    q.answer = _clean(answer, NOTE_MAX, "An answer")
    q.answeredAt = utcnow()


def _clean_note(note: str, on: bool) -> str:
    return note.strip()[:NOTE_MAX] if on else ""


def apply_vote(
    votes: list[Vote], admin_id: str, approve: bool, deny: bool, passed: bool,
    approve_note: str, deny_note: str, pass_note: str,
) -> Optional[str]:
    """Set (or clear) one admin's vote in a list. Returns what changed for the history, or None when only a note
    changed (typing a note is not a new vote)."""
    before = next((v for v in votes if v.adminId == admin_id), None)
    was = (before.approve, before.deny, before.passed) if before else (False, False, False)
    votes[:] = [v for v in votes if v.adminId != admin_id]
    now = (approve, deny, passed)
    if now == (False, False, False):
        return "withdrew" if was != now else None
    votes.append(Vote(
        adminId=admin_id, approve=approve, deny=deny, passed=passed,
        approveNote=_clean_note(approve_note, approve), denyNote=_clean_note(deny_note, deny), passNote=_clean_note(pass_note, passed),
    ))
    if was == now:
        return None
    words = [w for w, on in (("approved", approve), ("denied", deny), ("passed", passed)) if on]
    return " and ".join(words)


def _stored(file: FeedbackFile, sid: str) -> tuple[dict, StatementState]:
    derived = find_statement(file, sid)
    state: StatementState = derived["state"]
    file.statements[state.id] = state  # stored now that it has activity
    return derived, state


def vote(
    file: FeedbackFile, admin_id: str, sid: str, approve: bool, deny: bool, passed: bool,
    approve_note: str, deny_note: str, pass_note: str,
) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _stored(file, sid)
    require_role(admin, "voter", scope_of(derived["channelId"]), "Voting")
    if state.decision is not None:
        raise Conflict("This statement is decided. Its planner can undo the decision.")
    what = apply_vote(state.votes, admin_id, approve, deny, passed, approve_note, deny_note, pass_note)
    if what:
        state.history.append(HistoryEvent(adminId=admin_id, kind="vote", detail=what))


def decide(file: FeedbackFile, admin_id: str, sid: str, decision: Optional[Decision], note: str) -> None:
    """The planner accepts a statement (it becomes plan work) or vetoes it, with or without votes; None undoes it."""
    admin = admin_by_id(file, admin_id)
    derived, state = _stored(file, sid)
    require_role(admin, "planner", scope_of(derived["channelId"]), "Deciding a statement")
    if decision is None:
        if state.decision is None:
            return
        state.decision = state.decidedBy = state.decidedAt = None
        state.decisionNote = ""
        state.history.append(HistoryEvent(adminId=admin_id, kind="undecided", detail="undid the decision"))
        return
    state.decision = decision
    state.decidedBy = admin_id
    state.decidedAt = utcnow()
    state.decisionNote = note.strip()[:NOTE_MAX]
    state.history.append(HistoryEvent(adminId=admin_id, kind="decided", detail=decision))


# --- roles ------------------------------------------------------------------


def set_roles(file: FeedbackFile, actor_id: str, admin_id: str, scope: str, roles: list[str], scopes: set[str]) -> None:
    """Set the roles an admin holds on one scope (Admin > Office > Assignment). Anyone may assign for now (no login
    yet), but nobody can remove their own Channel manager role on Helper > Inbox, so someone always manages the verbs."""
    actor = admin_by_id(file, actor_id)
    target = admin_by_id(file, admin_id)
    if scope not in scopes:
        raise FeedbackError(f"Unknown console {scope!r}")
    unknown = [r for r in roles if r not in ROLE_ORDER]
    if unknown:
        raise FeedbackError(f"Unknown role {unknown[0]!r}")
    clean = [r for r in ROLE_ORDER if r in roles]
    if actor.id == target.id and scope == INBOX and "channelManager" in target.roles.get(scope, []) and "channelManager" not in clean:
        raise Forbidden("You cannot remove your own Channel manager role on Helper > Inbox.")
    before = list(target.roles.get(scope, []))
    if before == clean:
        return
    if clean:
        target.roles[scope] = clean  # type: ignore[assignment]
    else:
        target.roles.pop(scope, None)
    words = ", ".join(clean) if clean else "no roles"
    file.roleHistory.append(HistoryEvent(adminId=actor_id, kind="roles", detail=f"{target.name}: {scope} set to {words}"))


# --- verb categories -------------------------------------------------------


def _clean_keywords(keywords: list[str]) -> list[str]:
    out: list[str] = []
    for kw in keywords:
        kw = " ".join(kw.lower().split())
        if kw and kw not in out:
            out.append(kw)
    return out


def _require_manage_verbs(file: FeedbackFile, admin_id: str) -> None:
    require_role(admin_by_id(file, admin_id), "channelManager", INBOX, "Managing verb categories", "Helper > Inbox")


def _name_taken(file: FeedbackFile, name: str, except_id: str = "") -> bool:
    return any(v.name.lower() == name.lower() and v.id != except_id for v in file.verbCategories)


def add_verb(file: FeedbackFile, admin_id: str, name: str, keywords: list[str]) -> VerbCategory:
    _require_manage_verbs(file, admin_id)
    name = " ".join(name.split())
    if not name:
        raise FeedbackError("A verb category needs a name.")
    if _name_taken(file, name):
        raise Conflict(f"There is already a verb category named {name}.")
    verb = VerbCategory(id=project_store.new_id("verb"), name=name, keywords=_clean_keywords(keywords))
    file.verbCategories.append(verb)
    return verb


def update_verb(file: FeedbackFile, admin_id: str, verb_id: str, name: Optional[str], keywords: Optional[list[str]]) -> None:
    _require_manage_verbs(file, admin_id)
    verb = next((v for v in file.verbCategories if v.id == verb_id), None)
    if verb is None:
        raise NotFound(f"Verb category {verb_id} not found")
    if name is not None:
        name = " ".join(name.split())
        if not name:
            raise FeedbackError("A verb category needs a name.")
        if _name_taken(file, name, verb_id):
            raise Conflict(f"There is already a verb category named {name}.")
        verb.name = name
    if keywords is not None:
        verb.keywords = _clean_keywords(keywords)


def delete_verb(file: FeedbackFile, admin_id: str, verb_id: str) -> None:
    """Refused while any feedback message uses the verb."""
    _require_manage_verbs(file, admin_id)
    if not any(v.id == verb_id for v in file.verbCategories):
        raise NotFound(f"Verb category {verb_id} not found")
    used = sum(1 for m in file.messages if m.verbId == verb_id)
    if used:
        raise Conflict(f"{used} feedback message{'s use' if used != 1 else ' uses'} this verb. Move them to another verb first.")
    file.verbCategories = [v for v in file.verbCategories if v.id != verb_id]
