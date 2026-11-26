"""Global (not project-scoped) storage for support chats, at %APPDATA%\\Scriblr\\support.json.

How the pieces fit:
  - A user starts a chat from a console's Help tile: it waits in that console's queue (the console's channel id), about a
    focal feature (any channel node), at tier 1.
  - A staff member takes it from the queue and talks with the user. The conversation runs through stages (greeting,
    presentation of the issue, acknowledgement / escalation / transfer, solution presentations, resolution, closing) and
    every step is an event: a message (the user's, a helper's or an admin's) or an action (a greeting, a guide sent, feedback
    drafted for the user to confirm, an escalation, a transfer, a check-in, a hold, a change of stage or focal feature).
  - Transferring sends the chat back to waiting in another console's queue; escalating sends it back to waiting at the next
    tier (1 to 4 on each console: helpers promoted on the console, helpers promoted on its interface, the console's channel
    support, admins with helper hours promoted on it; staff.py).
  - The queues' settings and helper time (schedules, levels, the switchboard) are kept here too (queues.py).
  - Feedback drafted in a chat becomes the user's feedback when they confirm it, and waits in the Outbox of the staff
    member who drafted it (HUI), who completes it and sends it on to the Inbox (AUI's Office) to be checked.
  - The user sees their own chats; staff see what is waiting and the chats they are in.
"""

import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from . import channels, feedback, project_store, staff
from .queues import QueueSettings, seed_schedules
from .schema import utcnow

Stage = Literal["greeting", "issue", "acknowledgement", "solution", "resolution", "closing"]
STAGES: tuple[str, ...] = ("greeting", "issue", "acknowledgement", "solution", "resolution", "closing")
EventKind = Literal[
    "userMessage", "helperMessage", "adminMessage", "greeting", "resource", "feedbackInitiated", "feedbackConfirmed",
    "escalation", "transfer", "checkIn", "hold", "stage", "focal", "taken", "closed",
]
ChatStatus = Literal["pending", "active", "closed"]
SCHEMA_VERSION = 1
TEXT_MAX = 2000
TIER_TOP = 4
CHATS_MAX = 5000


class SupportError(Exception):
    status = 400


class NotFound(SupportError):
    status = 404


class Forbidden(SupportError):
    status = 403


class Draft(BaseModel):
    """Feedback a staff member drafted in a chat, for the user to confirm."""

    channelId: str
    verbId: str
    text: str = Field(max_length=feedback.TEXT_MAX)
    tone: Optional[feedback.Tone] = None
    confirmed: bool = False
    messageId: Optional[str] = None


class Event(BaseModel):
    id: str = Field(default_factory=lambda: f"ev-{uuid.uuid4().hex[:10]}")
    at: datetime = Field(default_factory=utcnow)
    kind: EventKind
    by: Literal["user", "staff", "system"] = "system"
    staffId: str = ""
    text: str = Field(default="", max_length=TEXT_MAX)
    nodeId: Optional[str] = None
    draft: Optional[Draft] = None
    toQueue: Optional[str] = None
    toTier: Optional[int] = None
    stage: Optional[Stage] = None


class Chat(BaseModel):
    id: str
    userId: str
    userName: str = ""
    queue: str
    focal: str
    tier: int = Field(default=1, ge=1, le=TIER_TOP)
    staffId: str = ""
    status: ChatStatus = "pending"
    stage: Stage = "greeting"
    createdAt: datetime = Field(default_factory=utcnow)
    # When it last started waiting (on creation, transfer or escalation): the queue's oldest first.
    waitingSince: datetime = Field(default_factory=utcnow)
    events: list[Event] = Field(default_factory=list)


class SupportFile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    chats: list[Chat] = Field(default_factory=list)
    queues: QueueSettings = Field(default_factory=QueueSettings)


# --------------------------------------------------------------------------
# Persistence
# --------------------------------------------------------------------------

_lock = threading.RLock()


def _path(root: Path) -> Path:
    return root / "support.json"


def _save(root: Path, file: SupportFile) -> None:
    project_store._atomic_write_json(root, _path(root), file.model_dump(mode="json"))


def _load(root: Path) -> SupportFile:
    path = _path(root)
    if not path.exists():
        # First use: the sample staff's hours this week.
        file = SupportFile()
        seed_schedules(file.queues, staff.load(root), datetime.now().astimezone())
        return file
    try:
        return SupportFile.model_validate(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as e:
        quarantined = project_store._quarantine(path)
        raise project_store.ShardCorruptError(path, quarantined, str(e)) from e


def load(root: Path) -> SupportFile:
    with _lock:
        return _load(root)


def mutate(root: Path, fn) -> SupportFile:
    with _lock:
        file = _load(root)
        fn(file)
        _save(root, file)
        return file


def _uses(root: Path, ids: set[str]) -> list[str]:
    n = sum(1 for c in load(root).chats if c.status != "closed" and (c.queue in ids or c.focal in ids))
    return [f"{n} open support chat{'s' if n != 1 else ''}"] if n else []


channels.register_use_check(_uses)


# --------------------------------------------------------------------------
# Views
# --------------------------------------------------------------------------


def _event_view(e: Event) -> dict:
    return e.model_dump(mode="json")


def chat_view(c: Chat) -> dict:
    d = c.model_dump(mode="json")
    d["events"] = [_event_view(e) for e in c.events]
    return d


def mine(file: SupportFile, user_id: str) -> dict:
    """A user's chats, open ones first, newest first."""
    own = [c for c in file.chats if user_id and c.userId == user_id]
    own.sort(key=lambda c: (c.status == "closed", -c.createdAt.timestamp()))
    return {"chats": [chat_view(c) for c in own]}


def staff_view(file: SupportFile, me: str) -> dict:
    """What a staff member sees: every chat waiting (oldest first), the chats they are in, and the others in progress
    (who has them, their stage; the admin view of the queues), and the ones they closed lately."""
    waiting = sorted((c for c in file.chats if c.status == "pending"), key=lambda c: c.waitingSince)
    active = [c for c in file.chats if c.status == "active"]
    closed = sorted((c for c in file.chats if c.status == "closed" and c.staffId == me), key=lambda c: c.events[-1].at if c.events else c.createdAt, reverse=True)[:20]
    return {
        "me": me,
        "waiting": [chat_view(c) for c in waiting],
        "mine": [chat_view(c) for c in active if c.staffId == me],
        "others": [{k: v for k, v in chat_view(c).items() if k != "events"} | {"actions": [e.kind for e in c.events if e.by != "user"]} for c in active if c.staffId != me],
        "closed": [chat_view(c) for c in closed],
    }


# --------------------------------------------------------------------------
# Changes
# --------------------------------------------------------------------------


def _chat(file: SupportFile, chat_id: str) -> Chat:
    for c in file.chats:
        if c.id == chat_id:
            return c
    raise NotFound(f"Chat {chat_id} not found")


def _text(text: str) -> str:
    t = text.strip()
    if not t:
        raise SupportError("Write something first.")
    return t[:TEXT_MAX]


def _consoles(known: dict[str, str]) -> set[str]:
    return {i for i, kind in known.items() if kind == "console"}


def queue_of(node_id: str, known: dict[str, str]) -> str:
    """The console a node is in (its queue)."""
    scope = feedback.scope_of(node_id)
    if known.get(scope) != "console":
        raise SupportError("Support is by console: choose a part of the app inside a console.")
    return scope


def start(file: SupportFile, known: dict[str, str], user_id: str, user_name: str, focal: str, text: str) -> Chat:
    if not user_id:
        raise SupportError("Who is asking?")
    if focal not in known:
        raise SupportError(f"No part of the app {focal}.")
    if len(file.chats) >= CHATS_MAX:
        # Oldest closed chats make room.
        closed = sorted((c for c in file.chats if c.status == "closed"), key=lambda c: c.createdAt)
        if not closed:
            raise SupportError("Too many chats are open.")
        file.chats.remove(closed[0])
    chat = Chat(id=f"chat-{uuid.uuid4().hex[:10]}", userId=user_id, userName=user_name[:80], queue=queue_of(focal, known), focal=focal)
    chat.events.append(Event(kind="userMessage", by="user", text=_text(text)))
    file.chats.append(chat)
    return chat


def _own(chat: Chat, user_id: str) -> None:
    if not user_id or chat.userId != user_id:
        raise Forbidden("This is someone else's chat.")
    if chat.status == "closed":
        raise SupportError("This chat is closed.")


def user_message(file: SupportFile, user_id: str, chat_id: str, text: str) -> None:
    chat = _chat(file, chat_id)
    _own(chat, user_id)
    chat.events.append(Event(kind="userMessage", by="user", text=_text(text)))


def user_close(file: SupportFile, user_id: str, chat_id: str) -> None:
    chat = _chat(file, chat_id)
    _own(chat, user_id)
    chat.status = "closed"
    chat.events.append(Event(kind="closed", by="user"))


def confirm_draft(file: SupportFile, root: Path, user_id: str, user_name: str, chat_id: str, event_id: str, known: set[str]) -> None:
    """The user confirms feedback drafted in the chat: it is sent as theirs, and waits in the drafter's Outbox (with the
    draft's subject, verb and tone) until they send it on to the Inbox. A drafter who is not on the feedback staff has no
    Outbox: the feedback goes straight to the Inbox."""
    chat = _chat(file, chat_id)
    _own(chat, user_id)
    event = next((e for e in chat.events if e.id == event_id and e.kind == "feedbackInitiated"), None)
    if event is None or event.draft is None:
        raise NotFound("No drafted feedback there.")
    if event.draft.confirmed:
        raise SupportError("That feedback was sent already.")
    draft = event.draft

    def send(fb: feedback.FeedbackFile) -> None:
        m = feedback.create_message(fb, user_name, user_id, draft.text, None, draft.channelId, draft.verbId, chat.focal, known)
        m.tone = draft.tone
        if any(a.id == event.staffId for a in fb.admins):
            m.heldBy = event.staffId
            m.heldChat = chat.id
        draft.messageId = m.id

    try:
        feedback.mutate(root, send)
    except feedback.FeedbackError as exc:
        raise SupportError(str(exc)) from exc
    draft.confirmed = True
    chat.events.append(Event(kind="feedbackConfirmed", by="user", draft=draft.model_copy()))


def _staff_kind(sf: staff.StaffFile, me: str) -> str:
    p = next((x for x in sf.people if x.id == me), None)
    return "helperMessage" if p is not None and p.kind == "helper" else "adminMessage"


def _in(chat: Chat, me: str) -> None:
    if chat.status != "active" or chat.staffId != me:
        raise Forbidden("Take the chat first.")


def take(file: SupportFile, me: str, chat_id: str) -> None:
    chat = _chat(file, chat_id)
    if chat.status != "pending":
        raise SupportError("Someone has this chat already." if chat.status == "active" else "This chat is closed.")
    chat.staffId = me
    chat.status = "active"
    chat.events.append(Event(kind="taken", by="staff", staffId=me))


def staff_message(file: SupportFile, sf: staff.StaffFile, me: str, chat_id: str, text: str) -> None:
    chat = _chat(file, chat_id)
    _in(chat, me)
    chat.events.append(Event(kind=_staff_kind(sf, me), by="staff", staffId=me, text=_text(text)))  # type: ignore[arg-type]


def act(
    file: SupportFile, fb: feedback.FeedbackFile, me: str, chat_id: str, known: dict[str, str], action: str, *,
    text: str = "", node_id: Optional[str] = None, stage: Optional[str] = None, to_queue: Optional[str] = None,
    draft: Optional[dict] = None,
) -> None:
    chat = _chat(file, chat_id)
    _in(chat, me)
    ev = Event(kind=action, by="staff", staffId=me, text=text.strip()[:TEXT_MAX])  # type: ignore[arg-type]
    if action in ("greeting", "checkIn", "hold"):
        if action == "greeting":
            chat.stage = "greeting"
    elif action == "stage":
        if stage not in STAGES:
            raise SupportError("No such stage.")
        chat.stage = stage  # type: ignore[assignment]
        ev.stage = stage  # type: ignore[assignment]
    elif action == "focal":
        if node_id not in known:
            raise SupportError(f"No part of the app {node_id}.")
        chat.focal = node_id  # type: ignore[assignment]
        ev.nodeId = node_id
    elif action == "resource":
        if node_id not in known:
            raise SupportError(f"No part of the app {node_id}.")
        ev.nodeId = node_id
        chat.stage = "solution"
    elif action == "feedbackInitiated":
        d = Draft(**(draft or {}))
        if d.channelId not in known:
            raise SupportError(f"No part of the app {d.channelId}.")
        if not any(v.id == d.verbId for v in fb.verbCategories):
            raise SupportError("Choose what should happen.")
        d.text = _text(d.text)
        ev.draft = d
    elif action == "transfer":
        if to_queue not in _consoles(known) or to_queue == chat.queue:
            raise SupportError("Transfer to another console's queue.")
        chat.queue = to_queue  # type: ignore[assignment]
        ev.toQueue = to_queue
        _back_to_waiting(chat)
        chat.stage = "acknowledgement"
    elif action == "escalation":
        if chat.tier >= TIER_TOP:
            raise SupportError("This chat is at the top tier already.")
        chat.tier += 1
        ev.toTier = chat.tier
        _back_to_waiting(chat)
        chat.stage = "acknowledgement"
    elif action == "closed":
        chat.status = "closed"
        chat.stage = "closing"
    else:
        raise SupportError(f"Unknown action {action!r}.")
    chat.events.append(ev)


def _back_to_waiting(chat: Chat) -> None:
    chat.status = "pending"
    chat.staffId = ""
    chat.waitingSince = utcnow()
