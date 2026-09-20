"""Global (not project-scoped) storage and rules for the Helper Inbox: feedback
messages, their per-admin validations (tone, channels, verbs), the feedback
statement cases derived from them, and the votes, solutions and history that
hang off each case. Lives at %APPDATA%\\Scriblr\\feedback.json, a sibling of
admin-config.json, seeded with sample data on first use. Reuses
project_store's atomic-write helper.

How the pieces fit:
  - Every admin validates a message independently: their own tone, the channels
    (page > console > component > feature) it is about, and an intention verb
    (a managed verb category) for each channel.
  - A message reaches quorum once enough admins have completed a validation
    (3 when three or more admins exist, else 1). Only then does it join cases.
  - A feedback statement case is one (channel, verb) pair kept by at least half
    of the validators. Cases are derived on read; only their votes, solutions,
    status and history are stored (keyed by the pair).
  - Tone is a score over every response (the sender's and each admin's):
    pleasant +1, unpleasant -1, mixed and neutral 0, averaged, then banded.
  - What an admin may do depends on per-console access levels (see `Admin`).
"""

import hashlib
import re
import threading
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import project_store
from .schema import utcnow
from datetime import datetime

Tone = Literal["pleasant", "unpleasant", "mixed", "neutral"]
ToneBand = Literal["mostlyPleasant", "slightlyPleasant", "neutral", "slightlyUnpleasant", "mostlyUnpleasant"]
CaseStatus = Literal["open", "approved", "rejected"]

NOTE_MAX = 500
SOLUTION_MAX = 2000
TITLE_MAX = 120
MAX_REQUIRED_VALIDATIONS = 3
INBOX_CONSOLE = ("Helper", "Inbox")

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
        {"name": "Inbox", "components": [{"name": "Validation", "features": ["Tone", "Channel", "Explicate"]}, {"name": "Processing", "features": ["Voting", "Solutions"]}]},
        {"name": "Queue", "components": [{"name": "Queue Meter", "features": ["Segments"]}]},
    ]},
    {"name": "Admin", "consoles": [
        {"name": "Processor", "components": [{"name": "Voting", "features": ["Approve", "Deny"]}]},
        {"name": "Organizer", "components": [{"name": "Channel Management", "features": ["Review"]}]},
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
    """Access is per console, written "Page/Console" (or "Page/*" for every console
    of a page): processing (validate messages, vote on cases), configuration
    (propose solutions, reopen cases, manage verb categories) and project plan
    (with configuration: close a case)."""

    id: str
    name: str
    processing: list[str] = Field(default_factory=list)
    configuration: list[str] = Field(default_factory=list)
    projectPlan: list[str] = Field(default_factory=list)


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
        """A tone, at least one channel, and a verb on every channel."""
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
    approveNote: str = ""
    denyNote: str = ""
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
    schemaVersion: int = 1
    admins: list[Admin] = Field(default_factory=list)
    verbCategories: list[VerbCategory] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    validations: dict[str, list[Validation]] = Field(default_factory=dict)  # messageId -> one per admin
    cases: dict[str, CaseState] = Field(default_factory=dict)  # caseId -> state


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

_SEED_ADMINS = [
    Admin(
        id="adm-dana", name="Dana Ruiz",
        processing=["Helper/Inbox", "Writer/*", "Reader/*", "Admin/*"],
        configuration=["Helper/Inbox", "Writer/*"],
        projectPlan=["Writer/*"],
    ),
    Admin(
        id="adm-lee", name="Lee Park",
        processing=["Helper/Inbox", "Writer/*", "Reader/*"],
        configuration=["Reader/*"],
        projectPlan=[],
    ),
    Admin(
        id="adm-sam", name="Sam Ortiz",
        processing=["Helper/Inbox", "Reader/*"],
        configuration=[],
        projectPlan=["Reader/*"],
    ),
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
        # Fully validated by all three admins: they form statement cases.
        "fb-1": [_v("adm-dana", "unpleasant", [(_AUTOSAVE, "verb-fix")]), _v("adm-lee", "unpleasant", [(_AUTOSAVE, "verb-fix")]),
                 _v("adm-sam", "neutral", [(_AUTOSAVE, "verb-fix")])],
        "fb-2": [_v("adm-dana", "mixed", [(_SPINES, "verb-increase")]), _v("adm-lee", "mixed", [(_SPINES, "verb-increase")]),
                 _v("adm-sam", "unpleasant", [(_SPINES, "verb-increase")])],
        "fb-6": [_v("adm-dana", "unpleasant", [(_SPINES, "verb-increase")]), _v("adm-lee", "unpleasant", [(_SPINES, "verb-increase")]),
                 _v("adm-sam", "unpleasant", [(_SPINES, "verb-increase")])],
        "fb-7": [_v("adm-dana", "pleasant", [(_SPINES, "verb-increase")]), _v("adm-lee", "mixed", [(_SPINES, "verb-increase")]),
                 _v("adm-sam", "mixed", [(_SPINES, "verb-increase")])],
        # Still in validation.
        "fb-3": [_v("adm-dana", "unpleasant", [(_SEARCH, "verb-improve")]), _v("adm-lee", "unpleasant", [(_SEARCH, "verb-improve")])],
        "fb-4": [_v("adm-sam", "pleasant", [(_PROGRESS, "verb-keep")])],
    }
    file = FeedbackFile(
        admins=_SEED_ADMINS,
        verbCategories=[VerbCategory(id=i, name=n, keywords=k) for i, n, k in _SEED_VERBS],
        messages=_SEED_MESSAGES,
        validations=validations,
    )
    # A little voting activity so the Process list is not empty.
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
# Persistence
# --------------------------------------------------------------------------

_lock = threading.RLock()


def _path(root: Path) -> Path:
    return root / "feedback.json"


def _save(root: Path, file: FeedbackFile) -> None:
    project_store._atomic_write_json(root, _path(root), file.model_dump(mode="json"))


def load(root: Path) -> FeedbackFile:
    path = _path(root)
    if not path.exists():
        file = _build_seed()
        _save(root, file)
        return file
    return FeedbackFile.model_validate_json(path.read_text(encoding="utf-8"))


def mutate(root: Path, fn) -> FeedbackFile:
    with _lock:
        file = load(root)
        fn(file)
        _save(root, file)
        return file


# --------------------------------------------------------------------------
# Rules
# --------------------------------------------------------------------------


def case_id(key: str) -> str:
    return "case-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]


def required_validations(file: FeedbackFile) -> int:
    return MAX_REQUIRED_VALIDATIONS if len(file.admins) >= MAX_REQUIRED_VALIDATIONS else 1


def _covers(patterns: list[str], page: str, console: str) -> bool:
    return f"{page}/{console}" in patterns or f"{page}/*" in patterns


def admin_by_id(file: FeedbackFile, admin_id: str) -> Admin:
    for a in file.admins:
        if a.id == admin_id:
            return a
    raise Forbidden(f"Unknown admin {admin_id!r}")


def can(admin: Admin, level: Literal["processing", "configuration", "projectPlan"], page: str, console: str) -> bool:
    return _covers(getattr(admin, level), page, console)


def require(admin: Admin, level: Literal["processing", "configuration", "projectPlan"], page: str, console: str, what: str) -> None:
    if not can(admin, level, page, console):
        names = {"processing": "feedback processing", "configuration": "configuration", "projectPlan": "project plan"}
        raise Forbidden(f"{what} needs {names[level]} access to {page} > {console}.")


def require_close(admin: Admin, page: str, console: str) -> None:
    if not (can(admin, "configuration", page, console) and can(admin, "projectPlan", page, console)):
        raise Forbidden(f"Closing a case needs configuration and project plan access to {page} > {console}.")


_TONE_VALUE: dict[str, int] = {"pleasant": 1, "unpleasant": -1, "mixed": 0, "neutral": 0}


def tone_band(net: int, count: int) -> ToneBand:
    """Five bands over the average response (-1 = every response unpleasant, +1 = every one pleasant):
    0.5 or more mostly pleasant, above 0 slightly pleasant, 0 neutral, and the mirror image below."""
    if count == 0 or net == 0:
        return "neutral"
    score = net / count
    if score >= 0.5:
        return "mostlyPleasant"
    if score > 0:
        return "slightlyPleasant"
    if score <= -0.5:
        return "mostlyUnpleasant"
    return "slightlyUnpleasant"


def tone_summary(message: Message, validations: list[Validation]) -> dict:
    """The score over every response: the sender's own tone and each admin's."""
    tones: list[str] = [t for t in [message.senderTone, *[v.tone for v in validations]] if t is not None]
    net = sum(_TONE_VALUE[t] for t in tones)
    return {"net": net, "count": len(tones), "band": tone_band(net, len(tones))}


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


def reconcile(message: Message, validations: list[Validation], required: int) -> dict:
    complete = [v for v in validations if v.complete()]
    n = len(complete)
    channel_votes: dict[str, int] = {}
    statement_votes: dict[tuple[str, str], int] = {}
    channels: dict[str, ChannelTag] = {}
    for v in complete:
        for c in v.channels:
            channels[c.key()] = c
            channel_votes[c.key()] = channel_votes.get(c.key(), 0) + 1
        for s in v.statements:
            k = (s.channel.key(), s.verbId)
            statement_votes[k] = statement_votes.get(k, 0) + 1
    kept_channels = [channels[k] for k, c in channel_votes.items() if n and c * 2 >= n]
    kept_statements = [{"channel": channels[k[0]], "verbId": k[1]} for k, c in statement_votes.items() if n and c * 2 >= n]
    return {"complete": n, "atQuorum": n >= required, "channels": kept_channels, "statements": kept_statements}


def _statement_key(channel: ChannelTag, verb_id: str) -> str:
    return f"{channel.key()}::{verb_id}"


def derive_cases(file: FeedbackFile) -> list[dict]:
    """Every statement case the messages at quorum produce, with its stored state."""
    required = required_validations(file)
    members: dict[str, dict] = {}
    for m in file.messages:
        vals = file.validations.get(m.id, [])
        rec = reconcile(m, vals, required)
        if not rec["atQuorum"]:
            continue
        summary = tone_summary(m, vals)
        for st in rec["statements"]:
            key = _statement_key(st["channel"], st["verbId"])
            entry = members.setdefault(key, {"channel": st["channel"], "verbId": st["verbId"], "messages": []})
            entry["messages"].append({
                "messageId": m.id, "text": m.text, "author": m.author, "submittedAt": m.submittedAt,
                "senderTone": m.senderTone, "tone": summary,
            })
    verbs = {v.id: v for v in file.verbCategories}
    out = []
    for key, entry in members.items():
        cid = case_id(key)
        state = file.cases.get(cid) or CaseState(id=cid, key=key)
        verb = verbs.get(entry["verbId"])
        out.append({"state": state, "channel": entry["channel"], "verbId": entry["verbId"],
                    "verbName": verb.name if verb else entry["verbId"], "messages": entry["messages"]})
    return out


def find_case(file: FeedbackFile, cid: str) -> dict:
    for c in derive_cases(file):
        if c["state"].id == cid:
            return c
    raise NotFound(f"Case {cid} not found")


def _clean_note(note: str, on: bool) -> str:
    return note.strip()[:NOTE_MAX] if on else ""


def apply_vote(votes: list[Vote], admin_id: str, approve: bool, deny: bool, approve_note: str, deny_note: str) -> Optional[str]:
    """Set (or clear) one admin's vote in a list. Returns what changed for the history, or None when only a
    note changed (typing a note is not a new vote)."""
    before = next((v for v in votes if v.adminId == admin_id), None)
    was = (before.approve, before.deny) if before else (False, False)
    votes[:] = [v for v in votes if v.adminId != admin_id]
    if not approve and not deny:
        return "withdrew" if was != (False, False) else None
    votes.append(Vote(adminId=admin_id, approve=approve, deny=deny,
                      approveNote=_clean_note(approve_note, approve), denyNote=_clean_note(deny_note, deny)))
    if was == (approve, deny):
        return None
    return "approved and denied" if approve and deny else ("approved" if approve else "denied")


def bundle(file: FeedbackFile, admin_id: str) -> dict:
    """Everything the Inbox shows, for one signed-in admin."""
    me = admin_by_id(file, admin_id)
    required = required_validations(file)
    messages = []
    for m in file.messages:
        vals = file.validations.get(m.id, [])
        rec = reconcile(m, vals, required)
        messages.append({
            "message": m.model_dump(mode="json"),
            "flags": flags_for(m.text, file.verbCategories),
            "validations": [v.model_dump(mode="json") | {"complete": v.complete()} for v in vals],
            "tone": tone_summary(m, vals),
            "reconciled": {
                "complete": rec["complete"], "required": required, "atQuorum": rec["atQuorum"],
                "channels": [c.model_dump(mode="json") for c in rec["channels"]],
                "statements": [{"channel": s["channel"].model_dump(mode="json"), "verbId": s["verbId"]} for s in rec["statements"]],
            },
        })
    cases = []
    for c in derive_cases(file):
        st: CaseState = c["state"]
        ch: ChannelTag = c["channel"]
        cases.append({
            "id": st.id, "key": st.key, "channel": ch.model_dump(mode="json"), "verbId": c["verbId"], "verbName": c["verbName"],
            "status": st.status, "messages": c["messages"],
            "votes": [v.model_dump(mode="json") for v in st.votes],
            "solutions": [s.model_dump(mode="json") for s in st.solutions],
            "closedBy": st.closedBy, "closedAt": st.closedAt.isoformat() if st.closedAt else None, "closeNote": st.closeNote,
            "history": [h.model_dump(mode="json") for h in st.history],
            "can": {
                "vote": can(me, "processing", ch.page, ch.console),
                "propose": can(me, "configuration", ch.page, ch.console),
                "close": can(me, "configuration", ch.page, ch.console) and can(me, "projectPlan", ch.page, ch.console),
                "reopen": can(me, "configuration", ch.page, ch.console),
            },
        })
    return {
        "me": me.id,
        "admins": [a.model_dump(mode="json") for a in file.admins],
        "requiredValidations": required,
        "taxonomy": TAXONOMY,
        "verbCategories": [v.model_dump(mode="json") for v in file.verbCategories],
        "messages": messages,
        "cases": cases,
        "can": {
            "validate": can(me, "processing", *INBOX_CONSOLE),
            "manageVerbs": can(me, "configuration", *INBOX_CONSOLE),
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
        raise FeedbackError("A channel needs a page, console, component and feature.")


def set_validation(
    file: FeedbackFile, admin_id: str, message_id: str,
    tone: Optional[Tone], channels: Optional[list[ChannelTag]], statements: Optional[list[Statement]],
) -> None:
    """Update this admin's validation of a message. Fields left out are unchanged."""
    admin = admin_by_id(file, admin_id)
    require(admin, "processing", *INBOX_CONSOLE, what="Validating feedback")
    _message(file, message_id)
    verbs = {v.id for v in file.verbCategories}
    mine = next((v for v in file.validations.setdefault(message_id, []) if v.adminId == admin_id), None)
    if mine is None:
        mine = Validation(adminId=admin_id)
        file.validations[message_id].append(mine)
    if tone is not None:
        mine.tone = tone
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
                raise FeedbackError("A verb needs its channel added first.")
            keep.setdefault((s.channel.key(), s.verbId), s)
        mine.statements = list(keep.values())
    mine.updatedAt = utcnow()


def _open_case(file: FeedbackFile, cid: str) -> tuple[dict, CaseState]:
    derived = find_case(file, cid)
    state: CaseState = derived["state"]
    if state.status != "open":
        raise Conflict("This case is closed. Reopen it to change votes or solutions.")
    file.cases[state.id] = state  # stored now that it has activity
    return derived, state


def vote_on_case(file: FeedbackFile, admin_id: str, cid: str, approve: bool, deny: bool, approve_note: str, deny_note: str) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require(admin, "processing", ch.page, ch.console, what="Voting")
    what = apply_vote(state.votes, admin_id, approve, deny, approve_note, deny_note)
    if what:
        state.history.append(HistoryEvent(adminId=admin_id, kind="vote", detail=what))


def propose_solution(file: FeedbackFile, admin_id: str, cid: str, title: str, description: str, target: ChannelTag) -> Solution:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require(admin, "configuration", ch.page, ch.console, what="Proposing a solution")
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
    approve: bool, deny: bool, approve_note: str, deny_note: str,
) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require(admin, "processing", ch.page, ch.console, what="Voting")
    solution = next((s for s in state.solutions if s.id == solution_id), None)
    if solution is None:
        raise NotFound(f"Solution {solution_id} not found")
    what = apply_vote(solution.votes, admin_id, approve, deny, approve_note, deny_note)
    if what:
        state.history.append(HistoryEvent(adminId=admin_id, kind="solution-vote", detail=f"{what} {solution.title}"))


def close_case(file: FeedbackFile, admin_id: str, cid: str, outcome: Literal["approved", "rejected"], note: str) -> None:
    admin = admin_by_id(file, admin_id)
    derived, state = _open_case(file, cid)
    ch: ChannelTag = derived["channel"]
    require_close(admin, ch.page, ch.console)
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
    require(admin, "configuration", ch.page, ch.console, what="Reopening a case")
    if state.status == "open":
        raise Conflict("This case is already open.")
    file.cases[state.id] = state
    state.status = "open"
    state.closedBy = None
    state.closedAt = None
    state.closeNote = ""
    state.history.append(HistoryEvent(adminId=admin_id, kind="reopened", detail=""))


# --- verb categories -------------------------------------------------------


def _clean_keywords(keywords: list[str]) -> list[str]:
    out: list[str] = []
    for kw in keywords:
        kw = " ".join(kw.lower().split())
        if kw and kw not in out:
            out.append(kw)
    return out


def _require_manage_verbs(file: FeedbackFile, admin_id: str) -> None:
    require(admin_by_id(file, admin_id), "configuration", *INBOX_CONSOLE, what="Managing verb categories")


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
