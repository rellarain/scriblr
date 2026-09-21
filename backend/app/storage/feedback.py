"""Global (not project-scoped) storage and rules for the Helper Inbox: feedback
messages, their per-admin validations (tone, then subjects with verbs), the
feedback statement cases derived from them, and the votes, solutions and history
that hang off each case. Lives at %APPDATA%\\Scriblr\\feedback.json, a sibling of
admin-config.json, seeded with sample data on first use. Reuses project_store's
atomic-write helper.

How the pieces fit:
  - Validation has two stages, in order: Tone, then Explicate (the subjects a
    message is about, page > console > component > feature, and one or more
    intention verbs for each: a managed verb category). Every admin validates
    independently.
  - There is no quorum. A message joins statement cases as soon as one validator
    has completed it, and it joins EVERY (subject, verb) statement any completed
    validator chose. A case is derived on read; only its votes, solutions, status
    and history are stored (keyed by the pair).
  - Tone: each validator gives pleasant, unpleasant, mixed (one pleasant vote and
    one unpleasant vote) or neutral; the mix of labels gives one of six categories.
    The sender's own tone is shown but never counted.
  - What an admin may do depends on roles per console: processor (validate, vote),
    configurer (propose solutions, reopen, manage verb categories, see the other
    validators' tone labels) and planner (close a case).
  - The Inbox is anonymous: the bundle carries no author names and no other admin's
    id; the admin's own items are marked as theirs.
"""

import hashlib
import json
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import project_store
from .schema import utcnow

Tone = Literal["pleasant", "unpleasant", "mixed", "neutral"]
ToneCategory = Literal["pleasant", "mixedPleasant", "neutral", "mixed", "mixedUnpleasant", "unpleasant"]
Role = Literal["processor", "configurer", "planner"]
CaseStatus = Literal["open", "approved", "rejected"]

SCHEMA_VERSION = 2
NOTE_MAX = 500
SOLUTION_MAX = 2000
TITLE_MAX = 120
INBOX_CONSOLE = ("Helper", "Inbox")
ROLE_ORDER: list[str] = ["processor", "configurer", "planner"]
# The fixed order tone categories are listed and sorted in (most pleasant first).
TONE_ORDER: list[str] = ["pleasant", "mixedPleasant", "neutral", "mixed", "mixedUnpleasant", "unpleasant"]

# --------------------------------------------------------------------------
# The channel tree: page > console > component > feature, from the app's own
# structure (scrilbrPlan.md). A fixed list for now; editing it comes later.
# --------------------------------------------------------------------------

TAXONOMY: list[dict] = [
    {"name": "Reader", "consoles": [
        {"name": "Nook", "components": [{"name": "Reading Nook", "features": ["Recent Books", "Progress Tracker"]}]},
        {"name": "Library", "components": [
            {"name": "Browse", "features": ["Search", "Shelves"]},
            {"name": "Journal", "features": ["Entries"]},
        ]},
        {"name": "Book", "components": [{"name": "Reader", "features": ["Pagination", "Bookmarks"]}]},
        {"name": "Pages", "components": [{"name": "Reaction", "features": ["Hearts"]}, {"name": "Flag", "features": ["Flags"]}]},
    ]},
    {"name": "Writer", "consoles": [
        {"name": "Shelves", "components": [
            {"name": "Dashboard", "features": ["Tasks", "Routines"]},
            {"name": "Scratchpad", "features": ["Notes"]},
        ]},
        {"name": "Shelf", "components": [
            {"name": "Project Outline", "features": ["Series", "Books"]},
            {"name": "Project Plot", "features": ["Categories", "Plotlines", "Plotpoints"]},
            {"name": "Sidebar Shelf", "features": ["Book Spines", "Series Sections"]},
        ]},
        {"name": "Book", "components": [
            {"name": "Book Editor", "features": ["Cover", "Colours"]},
            {"name": "Arc Outline", "features": ["Arcs", "Chapters"]},
        ]},
        {"name": "Page", "components": [
            {"name": "Chapter", "features": ["Outline", "Draft", "Autosave"]},
        ]},
        {"name": "Pages", "components": [{"name": "Reaction", "features": ["Hearts"]}, {"name": "Export", "features": ["PDF", "JSON"]}]},
    ]},
    {"name": "Helper", "consoles": [
        {"name": "Chat", "components": [{"name": "Conversation", "features": ["Composer", "Page Link"]}]},
        {"name": "Inbox", "components": [{"name": "Validation", "features": ["Tone", "Explicate"]}, {"name": "Processing", "features": ["Voting", "Solutions"]}]},
        {"name": "Queue", "components": [{"name": "Queue Meter", "features": ["Segments"]}]},
    ]},
    {"name": "Admin", "consoles": [
        {"name": "Processor", "components": [{"name": "Voting", "features": ["Approve", "Deny"]}]},
        {"name": "Organizer", "components": [{"name": "Channel Management", "features": ["Review"]}]},
        {"name": "Manager", "components": [{"name": "Assignment", "features": ["Roles"]}]},
    ]},
    {"name": "User", "consoles": [
        {"name": "Dashboard", "components": [{"name": "Notifications", "features": ["Activity Log"]}]},
        {"name": "Account", "components": [{"name": "Settings", "features": ["Autosave", "Theme"]}]},
    ]},
]


def taxonomy_has(page: str, console: str, component: str = "", feature: str = "") -> bool:
    for p in TAXONOMY:
        if p["name"] != page:
            continue
        for c in p["consoles"]:
            if c["name"] != console:
                continue
            if not component:
                return True
            for comp in c["components"]:
                if comp["name"] == component:
                    return not feature or feature in comp["features"]
    return False


def all_consoles() -> list[str]:
    """Every console as "Page/Console" (the keys roles are assigned under)."""
    return [f"{p['name']}/{c['name']}" for p in TAXONOMY for c in p["consoles"]]


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------


class ChannelTag(BaseModel):
    page: str
    console: str
    component: str
    feature: str = ""

    def key(self) -> str:
        return "|".join((self.page, self.console, self.component, self.feature))


class VerbCategory(BaseModel):
    id: str
    name: str
    keywords: list[str] = Field(default_factory=list)


class Admin(BaseModel):
    """`roles` maps a console, written "Page/Console", to the roles the admin holds there."""

    id: str
    name: str
    roles: dict[str, list[Role]] = Field(default_factory=dict)


class Statement(BaseModel):
    channel: ChannelTag
    verbId: str


class Validation(BaseModel):
    adminId: str
    tone: Optional[Tone] = None
    channels: list[ChannelTag] = Field(default_factory=list)
    statements: list[Statement] = Field(default_factory=list)
    updatedAt: datetime = Field(default_factory=utcnow)

    def complete(self) -> bool:
        """A tone, at least one subject, and at least one verb on every subject."""
        if self.tone is None or not self.channels:
            return False
        with_verb = {s.channel.key() for s in self.statements}
        return all(c.key() in with_verb for c in self.channels)


class Message(BaseModel):
    id: str
    text: str
    author: str
    submittedAt: str
    senderTone: Optional[Tone] = None
    openPage: Optional[str] = None
    openConsole: Optional[str] = None
    selectedComponent: Optional[str] = None


class Vote(BaseModel):
    adminId: str
    approve: bool = False
    deny: bool = False
    passed: bool = False
    approveNote: str = ""
    denyNote: str = ""
    passNote: str = ""
    updatedAt: datetime = Field(default_factory=utcnow)


class Solution(BaseModel):
    id: str
    title: str
    description: str = ""
    target: ChannelTag
    proposedBy: str
    createdAt: datetime = Field(default_factory=utcnow)
    votes: list[Vote] = Field(default_factory=list)


class HistoryEvent(BaseModel):
    at: datetime = Field(default_factory=utcnow)
    adminId: str
    kind: str
    detail: str = ""


class CaseState(BaseModel):
    id: str
    key: str  # "page|console|component|feature::verbId"
    status: CaseStatus = "open"
    votes: list[Vote] = Field(default_factory=list)
    solutions: list[Solution] = Field(default_factory=list)
    closedBy: Optional[str] = None
    closedAt: Optional[datetime] = None
    closeNote: str = ""
    history: list[HistoryEvent] = Field(default_factory=list)


class FeedbackFile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    admins: list[Admin] = Field(default_factory=list)
    verbCategories: list[VerbCategory] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    validations: dict[str, list[Validation]] = Field(default_factory=dict)  # messageId -> one per admin
    messageHistory: dict[str, list[HistoryEvent]] = Field(default_factory=dict)
    cases: dict[str, CaseState] = Field(default_factory=dict)  # caseId -> state
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


def _tag(page: str, console: str, component: str, feature: str) -> ChannelTag:
    return ChannelTag(page=page, console=console, component=component, feature=feature)


_SEED_VERBS = [
    ("verb-increase", "Increase", ["increase", "raise", "boost", "brighter", "larger", "contrast", "hard to see"]),
    ("verb-improve", "Improve", ["improve", "better", "useless", "relevant", "slow"]),
    ("verb-fix", "Fix", ["fix", "broken", "bug", "freezes", "crash", "error"]),
    ("verb-add", "Add", ["add", "missing", "wish", "would like", "need"]),
    ("verb-remove", "Remove", ["remove", "delete", "get rid of", "annoying"]),
    ("verb-simplify", "Simplify", ["simplify", "confusing", "complicated", "not sure"]),
    ("verb-keep", "Keep", ["keep", "great", "love", "like"]),
]


def _page_roles(pages: list[str], roles: list[Role]) -> dict[str, list[Role]]:
    out: dict[str, list[Role]] = {}
    for p in TAXONOMY:
        if p["name"] in pages:
            for c in p["consoles"]:
                out[f"{p['name']}/{c['name']}"] = list(roles)
    return out


def _merge_roles(*maps: dict[str, list[Role]]) -> dict[str, list[Role]]:
    out: dict[str, list[Role]] = {}
    for m in maps:
        for key, roles in m.items():
            have = out.setdefault(key, [])
            for r in roles:
                if r not in have:
                    have.append(r)
    return out


def _seed_admins() -> list[Admin]:
    return [
        Admin(id="adm-dana", name="Dana Ruiz", roles=_merge_roles(
            _page_roles(["Writer", "Reader", "Admin"], ["processor"]),
            {"Helper/Inbox": ["processor", "configurer"]},
            _page_roles(["Writer"], ["configurer", "planner"]),
        )),
        Admin(id="adm-lee", name="Lee Park", roles=_merge_roles(
            _page_roles(["Writer", "Reader"], ["processor"]),
            {"Helper/Inbox": ["processor"]},
            _page_roles(["Reader"], ["configurer"]),
        )),
        Admin(id="adm-sam", name="Sam Ortiz", roles=_merge_roles(
            _page_roles(["Reader"], ["processor", "planner"]),
            {"Helper/Inbox": ["processor"]},
        )),
    ]


_SEED_MESSAGES = [
    Message(id="fb-1", text="The editor freezes for a second every time I paste a large block of text.", author="j.rivera",
            submittedAt="2026-08-10", senderTone="unpleasant", openPage="Writer", openConsole="Page", selectedComponent="Chapter"),
    Message(id="fb-2", text="I love the new dark mode, but the sidebar icons are hard to see in it.", author="a.kim",
            submittedAt="2026-08-11", senderTone="unpleasant", openPage="Writer", openConsole="Shelf", selectedComponent="Sidebar Shelf"),
    Message(id="fb-3", text="Search inside the library is basically useless, it never finds anything relevant.", author="m.okafor",
            submittedAt="2026-08-12", senderTone="unpleasant", openPage="Reader", openConsole="Library", selectedComponent="Browse"),
    Message(id="fb-4", text="Just wanted to say the reading progress tracker is great, keep it up!", author="j.rivera",
            submittedAt="2026-08-13", senderTone="pleasant", openPage="Reader", openConsole="Nook", selectedComponent="Reading Nook"),
    Message(id="fb-5", text="Not sure what this button does??", author="a.kim",
            submittedAt="2026-08-14", senderTone="neutral", openPage="Admin", openConsole="Processor", selectedComponent="Voting"),
    Message(id="fb-6", text="At night I cannot tell the shelf icons apart, they need more contrast.", author="j.rivera",
            submittedAt="2026-08-15", senderTone="unpleasant", openPage="Writer", openConsole="Shelf", selectedComponent="Sidebar Shelf"),
    Message(id="fb-7", text="Dark mode is lovely but the icons are too dim, please make them brighter.", author="m.okafor",
            submittedAt="2026-08-16", senderTone="mixed", openPage="Writer", openConsole="Shelf", selectedComponent="Sidebar Shelf"),
]

_SPINES = _tag("Writer", "Shelf", "Sidebar Shelf", "Book Spines")
_AUTOSAVE = _tag("Writer", "Page", "Chapter", "Autosave")
_SEARCH = _tag("Reader", "Library", "Browse", "Search")
_PROGRESS = _tag("Reader", "Nook", "Reading Nook", "Progress Tracker")


def _v(admin: str, tone: Tone, pairs: list[tuple[ChannelTag, str]]) -> Validation:
    channels: list[ChannelTag] = []
    for tag, _ in pairs:
        if tag.key() not in {c.key() for c in channels}:
            channels.append(tag)
    return Validation(adminId=admin, tone=tone, channels=channels, statements=[Statement(channel=t, verbId=v) for t, v in pairs])


def _build_seed() -> FeedbackFile:
    validations: dict[str, list[Validation]] = {
        "fb-1": [_v("adm-dana", "unpleasant", [(_AUTOSAVE, "verb-fix")]), _v("adm-lee", "unpleasant", [(_AUTOSAVE, "verb-fix")]),
                 _v("adm-sam", "neutral", [(_AUTOSAVE, "verb-fix")])],
        "fb-2": [_v("adm-dana", "mixed", [(_SPINES, "verb-increase")]), _v("adm-lee", "mixed", [(_SPINES, "verb-increase")]),
                 _v("adm-sam", "unpleasant", [(_SPINES, "verb-increase")])],
        "fb-6": [_v("adm-dana", "unpleasant", [(_SPINES, "verb-increase")]), _v("adm-lee", "unpleasant", [(_SPINES, "verb-increase")]),
                 _v("adm-sam", "unpleasant", [(_SPINES, "verb-increase")])],
        "fb-7": [_v("adm-dana", "pleasant", [(_SPINES, "verb-increase")]), _v("adm-lee", "mixed", [(_SPINES, "verb-increase")]),
                 _v("adm-sam", "mixed", [(_SPINES, "verb-increase")])],
        "fb-3": [_v("adm-dana", "unpleasant", [(_SEARCH, "verb-improve")]), _v("adm-lee", "unpleasant", [(_SEARCH, "verb-improve")])],
        "fb-4": [_v("adm-sam", "pleasant", [(_PROGRESS, "verb-keep")])],
    }
    file = FeedbackFile(
        admins=_seed_admins(),
        verbCategories=[VerbCategory(id=i, name=n, keywords=k) for i, n, k in _SEED_VERBS],
        messages=_SEED_MESSAGES,
        validations=validations,
    )
    case_key = f"{_SPINES.key()}::verb-increase"
    state = CaseState(id=case_id(case_key), key=case_key)
    state.votes = [
        Vote(adminId="adm-dana", approve=True, approveNote="Three separate reports, clearly a real problem."),
        Vote(adminId="adm-lee", deny=True, denyNote="Wait for the theme rework first."),
    ]
    state.solutions = [Solution(
        id="sol-seed-1", title="Brighter icon set in dark zones", description="Raise icon lightness 15% when the zone is dark.",
        target=_tag("Writer", "Shelf", "Sidebar Shelf", ""), proposedBy="adm-dana",
        votes=[Vote(adminId="adm-dana", approve=True, approveNote="Simple and low risk.")],
    )]
    state.history = [
        HistoryEvent(adminId="adm-dana", kind="vote", detail="approved"),
        HistoryEvent(adminId="adm-lee", kind="vote", detail="denied"),
        HistoryEvent(adminId="adm-dana", kind="solution", detail="proposed Brighter icon set in dark zones"),
    ]
    file.cases[state.id] = state
    return file


# --------------------------------------------------------------------------
# Persistence (and the one-time move from schema version 1)
# --------------------------------------------------------------------------

_lock = threading.RLock()


def _path(root: Path) -> Path:
    return root / "feedback.json"


def _save(root: Path, file: FeedbackFile) -> None:
    project_store._atomic_write_json(root, _path(root), file.model_dump(mode="json"))


def _expand(pattern: str) -> list[str]:
    """An old access entry, "Page/Console" or "Page/*", as explicit console keys."""
    page, _, console = pattern.partition("/")
    if console == "*":
        return [k for k in all_consoles() if k.startswith(page + "/")]
    return [pattern]


def _migrate_v1(raw: dict) -> dict:
    """Version 1 kept three access lists per admin (processing, configuration, project plan); version 2 keeps
    roles per console (processor, configurer, planner). Quorum, overrides and majority filtering are gone; the
    stored messages, validations, votes, solutions and cases carry over unchanged."""
    mapping = (("processing", "processor"), ("configuration", "configurer"), ("projectPlan", "planner"))
    for admin in raw.get("admins", []):
        if "roles" in admin:
            continue
        roles: dict[str, list[str]] = {}
        for old, role in mapping:
            for pattern in admin.pop(old, None) or []:
                for key in _expand(pattern):
                    have = roles.setdefault(key, [])
                    if role not in have:
                        have.append(role)
        admin["roles"] = roles
    raw.setdefault("roleHistory", [])
    raw.setdefault("messageHistory", {})
    raw["schemaVersion"] = SCHEMA_VERSION
    return raw


def load(root: Path) -> FeedbackFile:
    path = _path(root)
    if not path.exists():
        file = _build_seed()
        _save(root, file)
        return file
    raw = json.loads(path.read_text(encoding="utf-8"))
    migrated = raw.get("schemaVersion", 1) < SCHEMA_VERSION
    if migrated:
        raw = _migrate_v1(raw)
    file = FeedbackFile.model_validate(raw)
    if migrated:
        _save(root, file)
    return file


def mutate(root: Path, fn) -> FeedbackFile:
    with _lock:
        file = load(root)
        fn(file)
        _save(root, file)
        return file


# --------------------------------------------------------------------------
# Roles
# --------------------------------------------------------------------------

_ROLE_WORDS = {"processor": "the Processor role", "configurer": "the Configurer role", "planner": "the Planner role"}


def case_id(key: str) -> str:
    return "case-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]


def admin_by_id(file: FeedbackFile, admin_id: str) -> Admin:
    for a in file.admins:
        if a.id == admin_id:
            return a
    raise Forbidden(f"Unknown admin {admin_id!r}")


def has_role(admin: Admin, role: str, page: str, console: str) -> bool:
    return role in admin.roles.get(f"{page}/{console}", [])


def require_role(admin: Admin, role: str, page: str, console: str, what: str) -> None:
    if not has_role(admin, role, page, console):
        raise Forbidden(f"{what} needs {_ROLE_WORDS[role]} on {page} > {console}.")


# --------------------------------------------------------------------------
# Tone
# --------------------------------------------------------------------------


def tone_category(labels: list[str]) -> Optional[ToneCategory]:
    """One category from the validators' labels. A mixed label is one pleasant vote and one unpleasant vote;
    neutral is no vote. With n validators: neutral when half or more are neutral; else mixed when pleasant and
    unpleasant votes each reach half; else pleasant / unpleasant at 75%; else mixed-leaning pleasant /
    unpleasant at 50%; else mixed. None with no validators."""
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
    """Words in the message that could indicate an intention verb: each keyword
    (matched from a word start, so "increase" also flags "increased")."""
    found: list[dict] = []
    for cat in categories:
        for kw in cat.keywords:
            for m in re.finditer(r"(?<!\w)" + re.escape(kw) + r"\w*", text, flags=re.IGNORECASE):
                found.append({"categoryId": cat.id, "keyword": kw, "start": m.start(), "end": m.end()})
    found.sort(key=lambda f: (f["start"], -f["end"]))
    return found


# --------------------------------------------------------------------------
# Cases
# --------------------------------------------------------------------------


def _statement_key(channel: ChannelTag, verb_id: str) -> str:
    return f"{channel.key()}::{verb_id}"


def selections_for(validations: list[Validation]) -> list[dict]:
    """Every subject and verb any validator chose, with how many validators chose each, most common first."""
    subjects: dict[str, dict] = {}
    for v in validations:
        for c in v.channels:
            subjects.setdefault(c.key(), {"channel": c, "chosenBy": 0, "verbs": {}})["chosenBy"] += 1
        for s in v.statements:
            entry = subjects.setdefault(s.channel.key(), {"channel": s.channel, "chosenBy": 0, "verbs": {}})
            entry["verbs"][s.verbId] = entry["verbs"].get(s.verbId, 0) + 1
    out = []
    for entry in subjects.values():
        verbs = [{"verbId": vid, "chosenBy": n} for vid, n in sorted(entry["verbs"].items(), key=lambda kv: (-kv[1], kv[0]))]
        out.append({"channel": entry["channel"], "chosenBy": entry["chosenBy"], "verbs": verbs})
    out.sort(key=lambda e: (-e["chosenBy"], e["channel"].key()))
    return out


def derive_cases(file: FeedbackFile) -> list[dict]:
    """Every statement case the completed validations produce, with its stored state. A message is in every
    (subject, verb) statement chosen by any validator who completed it."""
    members: dict[str, dict] = {}
    for m in file.messages:
        vals = file.validations.get(m.id, [])
        complete = [v for v in vals if v.complete()]
        if not complete:
            continue
        labels = [v.tone for v in vals if v.tone is not None]
        summary = tone_summary(labels)
        per_key: dict[str, tuple[ChannelTag, str, set[str]]] = {}
        for v in complete:
            for st in v.statements:
                per_key.setdefault(_statement_key(st.channel, st.verbId), (st.channel, st.verbId, set()))[2].add(v.adminId)
        for key, (channel, verb_id, validators) in per_key.items():
            entry = members.setdefault(key, {"channel": channel, "verbId": verb_id, "messages": [], "validators": set(), "labels": []})
            entry["validators"] |= validators
            entry["labels"].extend(labels)
            entry["messages"].append({
                "messageId": m.id, "text": m.text, "submittedAt": m.submittedAt, "senderTone": m.senderTone, "tone": summary,
            })
    verbs = {v.id: v for v in file.verbCategories}
    out = []
    for key, entry in members.items():
        cid = case_id(key)
        state = file.cases.get(cid) or CaseState(id=cid, key=key)
        verb = verbs.get(entry["verbId"])
        out.append({
            "state": state, "channel": entry["channel"], "verbId": entry["verbId"],
            "verbName": verb.name if verb else entry["verbId"], "messages": entry["messages"],
            "validators": len(entry["validators"]), "tone": tone_summary(entry["labels"]),
        })
    return out


def find_case(file: FeedbackFile, cid: str) -> dict:
    for c in derive_cases(file):
        if c["state"].id == cid:
            return c
    raise NotFound(f"Case {cid} not found")


def _clean_note(note: str, on: bool) -> str:
    return note.strip()[:NOTE_MAX] if on else ""


def apply_vote(
    votes: list[Vote], admin_id: str, approve: bool, deny: bool, passed: bool,
    approve_note: str, deny_note: str, pass_note: str,
) -> Optional[str]:
    """Set (or clear) one admin's vote in a list. Returns what changed for the history, or None when only a
    note changed (typing a note is not a new vote)."""
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


# --------------------------------------------------------------------------
# The bundle (anonymous: no author names, no other admin's id)
# --------------------------------------------------------------------------


def _vote_view(v: Vote, me: str) -> dict:
    return {
        "mine": v.adminId == me, "approve": v.approve, "deny": v.deny, "passed": v.passed,
        "approveNote": v.approveNote, "denyNote": v.denyNote, "passNote": v.passNote, "updatedAt": v.updatedAt.isoformat(),
    }


def _history_view(events: list[HistoryEvent], me: str) -> list[dict]:
    return [{"at": e.at.isoformat(), "kind": e.kind, "detail": e.detail, "mine": e.adminId == me} for e in events]


def bundle(file: FeedbackFile, admin_id: str) -> dict:
    """Everything the Inbox shows, for one signed-in admin."""
    me = admin_by_id(file, admin_id)
    sees_tones = has_role(me, "configurer", *INBOX_CONSOLE)
    messages = []
    for m in file.messages:
        vals = file.validations.get(m.id, [])
        views = []
        for v in sorted(vals, key=lambda x: (x.adminId != admin_id, x.adminId)):
            mine = v.adminId == admin_id
            views.append({
                "mine": mine,
                # Other validators' individual tone labels are for Configurers only.
                "tone": v.tone if (mine or sees_tones) else None,
                "toneSet": v.tone is not None,
                "channels": [c.model_dump(mode="json") for c in v.channels],
                "statements": [s.model_dump(mode="json") for s in v.statements],
                "complete": v.complete(),
            })
        labels = [v.tone for v in vals if v.tone is not None]
        messages.append({
            "message": {
                "id": m.id, "text": m.text, "submittedAt": m.submittedAt, "senderTone": m.senderTone,
                "openPage": m.openPage, "openConsole": m.openConsole, "selectedComponent": m.selectedComponent,
            },
            "flags": flags_for(m.text, file.verbCategories),
            "validations": views,
            "selections": [
                {"channel": s["channel"].model_dump(mode="json"), "chosenBy": s["chosenBy"], "verbs": s["verbs"]}
                for s in selections_for(vals)
            ],
            "tone": tone_summary(labels),
            "validationCount": sum(1 for v in vals if v.complete()),
            "joined": any(v.complete() for v in vals),
            "history": _history_view(file.messageHistory.get(m.id, []), admin_id),
        })
    cases = []
    for c in derive_cases(file):
        st: CaseState = c["state"]
        ch: ChannelTag = c["channel"]
        cases.append({
            "id": st.id, "key": st.key, "channel": ch.model_dump(mode="json"), "verbId": c["verbId"], "verbName": c["verbName"],
            "status": st.status, "messages": c["messages"], "tone": c["tone"], "validators": c["validators"],
            "votes": [_vote_view(v, admin_id) for v in st.votes if v.approve or v.deny or v.passed],
            "solutions": [{
                "id": s.id, "title": s.title, "description": s.description, "target": s.target.model_dump(mode="json"),
                "mine": s.proposedBy == admin_id, "createdAt": s.createdAt.isoformat(),
                "votes": [_vote_view(v, admin_id) for v in s.votes if v.approve or v.deny or v.passed],
            } for s in st.solutions],
            "closedAt": st.closedAt.isoformat() if st.closedAt else None, "closeNote": st.closeNote,
            "history": _history_view(st.history, admin_id),
            "can": {
                "vote": has_role(me, "processor", ch.page, ch.console),
                "propose": has_role(me, "configurer", ch.page, ch.console),
                "close": has_role(me, "planner", ch.page, ch.console),
                "reopen": has_role(me, "configurer", ch.page, ch.console),
            },
        })
    return {
        "me": me.id,
        "admins": [{"id": a.id, "name": a.name, "roles": a.roles} for a in file.admins],
        "consoles": all_consoles(),
        "taxonomy": TAXONOMY,
        "verbCategories": [v.model_dump(mode="json") for v in file.verbCategories],
        "messages": messages,
        "cases": cases,
        "roleHistory": _history_view(file.roleHistory, admin_id),
        "can": {
            "validate": has_role(me, "processor", *INBOX_CONSOLE),
            "manageVerbs": has_role(me, "configurer", *INBOX_CONSOLE),
            "seeTones": sees_tones,
        },
    }


# --------------------------------------------------------------------------
# Operations (each takes the loaded file and mutates it; the caller saves)
# --------------------------------------------------------------------------


def _message(file: FeedbackFile, message_id: str) -> Message:
    for m in file.messages:
        if m.id == message_id:
            return m
    raise NotFound(f"Message {message_id} not found")


def _check_tag(tag: ChannelTag, *, need_feature: bool) -> None:
    if not taxonomy_has(tag.page, tag.console, tag.component, tag.feature):
        raise FeedbackError(f"Unknown channel {tag.page} > {tag.console} > {tag.component}" + (f" > {tag.feature}" if tag.feature else ""))
    if need_feature and not tag.feature:
        raise FeedbackError("A subject needs a page, console, component and feature.")


def set_validation(
    file: FeedbackFile, admin_id: str, message_id: str,
    tone: Optional[Tone], channels: Optional[list[ChannelTag]], statements: Optional[list[Statement]],
) -> None:
    """Update this admin's validation of a message. Fields left out are unchanged. Stages run in order: a tone
    first, then subjects, then a verb on each subject."""
    admin = admin_by_id(file, admin_id)
    require_role(admin, "processor", *INBOX_CONSOLE, what="Validating feedback")
    _message(file, message_id)
    verbs = {v.id for v in file.verbCategories}
    mine = next((v for v in file.validations.setdefault(message_id, []) if v.adminId == admin_id), None)
    if mine is None:
        mine = Validation(adminId=admin_id)
        file.validations[message_id].append(mine)
    was_complete = mine.complete()
    if tone is not None:
        mine.tone = tone
    if (channels is not None or statements is not None) and mine.tone is None:
        raise FeedbackError("Tone this message first.")
    if channels is not None:
        seen: dict[str, ChannelTag] = {}
        for c in channels:
            _check_tag(c, need_feature=True)
            seen.setdefault(c.key(), c)
        mine.channels = list(seen.values())
        mine.statements = [s for s in mine.statements if s.channel.key() in seen]
    if statements is not None:
        keep: dict[tuple[str, str], Statement] = {}
        have = {c.key() for c in mine.channels}
        for s in statements:
            if s.verbId not in verbs:
                raise FeedbackError(f"Unknown verb category {s.verbId!r}")
            if s.channel.key() not in have:
                raise FeedbackError("A verb needs its subject added first.")
            keep.setdefault((s.channel.key(), s.verbId), s)
        mine.statements = list(keep.values())
    mine.updatedAt = utcnow()
    if mine.complete() and not was_complete:
        file.messageHistory.setdefault(message_id, []).append(HistoryEvent(adminId=admin_id, kind="validated", detail="completed a validation"))


def _open_case(file: FeedbackFile, cid: str) -> tuple[dict, CaseState]:
    derived = find_case(file, cid)
    state: CaseState = derived["state"]
    if state.status != "open":
        raise Conflict("This case is closed. Reopen it to change votes or solutions.")
    file.cases[state.id] = state  # stored now that it has activity
    return derived, state


def vote_on_case(
    file: FeedbackFile, admin_id: str, cid: str, approve: bool, deny: bool, passed: bool,
    approve_note: str, deny_note: str, pass_note: str,
) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require_role(admin, "processor", ch.page, ch.console, what="Voting")
    what = apply_vote(state.votes, admin_id, approve, deny, passed, approve_note, deny_note, pass_note)
    if what:
        state.history.append(HistoryEvent(adminId=admin_id, kind="vote", detail=what))


def propose_solution(file: FeedbackFile, admin_id: str, cid: str, title: str, description: str, target: ChannelTag) -> Solution:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require_role(admin, "configurer", ch.page, ch.console, what="Proposing a solution")
    _check_tag(target, need_feature=False)
    title = title.strip()
    if not title:
        raise FeedbackError("A solution needs a title.")
    solution = Solution(
        id=project_store.new_id("sol"), title=title[:TITLE_MAX], description=description.strip()[:SOLUTION_MAX],
        target=target, proposedBy=admin_id,
    )
    state.solutions.append(solution)
    state.history.append(HistoryEvent(adminId=admin_id, kind="solution", detail=f"proposed {solution.title}"))
    return solution


def vote_on_solution(
    file: FeedbackFile, admin_id: str, cid: str, solution_id: str,
    approve: bool, deny: bool, passed: bool, approve_note: str, deny_note: str, pass_note: str,
) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require_role(admin, "processor", ch.page, ch.console, what="Voting")
    solution = next((s for s in state.solutions if s.id == solution_id), None)
    if solution is None:
        raise NotFound(f"Solution {solution_id} not found")
    what = apply_vote(solution.votes, admin_id, approve, deny, passed, approve_note, deny_note, pass_note)
    if what:
        state.history.append(HistoryEvent(adminId=admin_id, kind="solution-vote", detail=f"{what} {solution.title}"))


def close_case(file: FeedbackFile, admin_id: str, cid: str, outcome: Literal["approved", "rejected"], note: str) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require_role(admin, "planner", ch.page, ch.console, what="Closing a case")
    state.status = outcome
    state.closedBy = admin_id
    state.closedAt = utcnow()
    state.closeNote = note.strip()[:NOTE_MAX]
    state.history.append(HistoryEvent(adminId=admin_id, kind="closed", detail=outcome))


def reopen_case(file: FeedbackFile, admin_id: str, cid: str) -> None:
    admin = admin_by_id(file, admin_id)
    derived = find_case(file, cid)
    state: CaseState = derived["state"]
    ch: ChannelTag = derived["channel"]
    require_role(admin, "configurer", ch.page, ch.console, what="Reopening a case")
    if state.status == "open":
        raise Conflict("This case is already open.")
    file.cases[state.id] = state
    state.status = "open"
    state.closedBy = None
    state.closedAt = None
    state.closeNote = ""
    state.history.append(HistoryEvent(adminId=admin_id, kind="reopened", detail=""))


# --- roles ------------------------------------------------------------------


def set_roles(file: FeedbackFile, actor_id: str, admin_id: str, console: str, roles: list[str]) -> None:
    """Set the roles an admin holds on one console (Admin > Manager > Assignment). Anyone may assign for now (no login
    yet), but nobody can remove their own Configurer role on Helper > Inbox, so someone always manages verb categories."""
    actor = admin_by_id(file, actor_id)
    target = admin_by_id(file, admin_id)
    if console not in all_consoles():
        raise FeedbackError(f"Unknown console {console!r}")
    unknown = [r for r in roles if r not in ROLE_ORDER]
    if unknown:
        raise FeedbackError(f"Unknown role {unknown[0]!r}")
    clean = [r for r in ROLE_ORDER if r in roles]
    inbox_key = "/".join(INBOX_CONSOLE)
    if actor.id == target.id and console == inbox_key and "configurer" in target.roles.get(console, []) and "configurer" not in clean:
        raise Forbidden("You cannot remove your own Configurer role on Helper > Inbox.")
    before = list(target.roles.get(console, []))
    if before == clean:
        return
    if clean:
        target.roles[console] = clean  # type: ignore[assignment]
    else:
        target.roles.pop(console, None)
    words = ", ".join(clean) if clean else "no roles"
    file.roleHistory.append(HistoryEvent(adminId=actor_id, kind="roles", detail=f"{target.name}: {console.replace('/', ' > ')} set to {words}"))


# --- verb categories -------------------------------------------------------


def _clean_keywords(keywords: list[str]) -> list[str]:
    out: list[str] = []
    for kw in keywords:
        kw = " ".join(kw.lower().split())
        if kw and kw not in out:
            out.append(kw)
    return out


def _require_manage_verbs(file: FeedbackFile, admin_id: str) -> None:
    require_role(admin_by_id(file, admin_id), "configurer", *INBOX_CONSOLE, what="Managing verb categories")


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
    """Refused while any of the category's cases is still open."""
    _require_manage_verbs(file, admin_id)
    if not any(v.id == verb_id for v in file.verbCategories):
        raise NotFound(f"Verb category {verb_id} not found")
    if any(c["verbId"] == verb_id and c["state"].status == "open" for c in derive_cases(file)):
        raise Conflict("This verb category still has open cases. Close them first.")
    file.verbCategories = [v for v in file.verbCategories if v.id != verb_id]
    for vals in file.validations.values():
        for v in vals:
            v.statements = [s for s in v.statements if s.verbId != verb_id]
