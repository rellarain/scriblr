from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root
from ..storage import feedback as fb_store
from ..storage import queues
from ..storage import resources
from ..storage import staff as staff_store
from ..storage import support as store
from . import feedback as feedback_api

# Support chats. A user starts one from a Help tile and follows it in "mine"; staff take chats from the queues, talk, send
# guides, draft feedback, transfer, escalate and close them. Staff calls act as the X-Admin-Id staff member and return the
# staff view (with the chat that is next for them); the user's calls need no admin and return the user's chats. The queue
# routes (helper time, the switchboard, levels) return the Queue console's view (queues.py).
router = APIRouter(prefix="/api/support", tags=["support"])


def _guard(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except (store.SupportError, fb_store.FeedbackError, staff_store.StaffError) as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


def _known(root: Path) -> dict[str, str]:
    return {n.id: n.kind for n in resources.load_resources(root).nodes}


def _now() -> datetime:
    """Local time (helper schedules are in the user's own hours); tests replace it."""
    return datetime.now().astimezone()


def _consoles(root: Path) -> list[str]:
    """The console queues, in the channel list's order."""
    nodes = resources.load_resources(root).nodes
    interfaces = sorted((n for n in nodes if n.kind == "interface"), key=lambda n: n.order)
    out: list[str] = []
    for i in interfaces:
        out += [n.id for n in sorted((n for n in nodes if n.kind == "console" and n.parentId == i.id), key=lambda n: n.order)]
    return out


def _with_next(root: Path, file: store.SupportFile, admin_id: str) -> dict:
    view = store.staff_view(file, admin_id)
    view["next"] = queues.next_for(file, file.queues, staff_store.load(root), admin_id, _consoles(root), _now())
    return view


def _staff(root: Path, admin_id: str, fn: Callable[[store.SupportFile], None]) -> dict:
    def go() -> dict:
        fb_store.admin_by_id(fb_store.load(root), admin_id)
        return _with_next(root, store.mutate(root, fn), admin_id)
    return _guard(go)


def _queues(root: Path, admin_id: str, fn: Optional[Callable[[store.SupportFile, staff_store.StaffFile, list[str], datetime], None]] = None) -> dict:
    def go() -> dict:
        sf = staff_store.load(root)
        consoles = _consoles(root)
        now = _now()
        file = store.mutate(root, lambda f: fn(f, sf, consoles, now)) if fn else store.load(root)
        return queues.view(file, file.queues, sf, admin_id, consoles, now)
    return _guard(go)


def _user(root: Path, user_id: str, fn: Callable[[store.SupportFile], None]) -> dict:
    return _guard(lambda: store.mine(store.mutate(root, fn), user_id))


class StartBody(BaseModel):
    userId: str = Field(max_length=120)
    userName: str = Field(default="", max_length=120)
    focal: str
    text: str = Field(max_length=store.TEXT_MAX)


class UserText(BaseModel):
    userId: str = Field(max_length=120)
    text: str = Field(default="", max_length=store.TEXT_MAX)


class ConfirmBody(BaseModel):
    userId: str = Field(max_length=120)
    userName: str = Field(default="", max_length=120)


class StaffText(BaseModel):
    text: str = Field(max_length=store.TEXT_MAX)


class DraftBody(BaseModel):
    channelId: str
    verbId: str
    text: str = Field(max_length=fb_store.TEXT_MAX)
    tone: Optional[fb_store.Tone] = None


class ActionBody(BaseModel):
    action: Literal["greeting", "checkIn", "hold", "stage", "focal", "resource", "feedbackInitiated", "transfer", "escalation", "closed"]
    text: str = Field(default="", max_length=store.TEXT_MAX)
    nodeId: Optional[str] = None
    stage: Optional[store.Stage] = None
    toQueue: Optional[str] = None
    draft: Optional[DraftBody] = None


# --- the user's side ----------------------------------------------------------------


@router.get("/mine")
def get_mine(userId: str = "", root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _guard(lambda: store.mine(store.load(root), userId))


@router.post("/chats")
def post_chat(body: StartBody, root: Path = Depends(get_app_data_storage_root)) -> dict:
    known = _known(root)
    return _user(root, body.userId, lambda f: store.start(f, known, body.userId, body.userName, body.focal, body.text))


@router.post("/chats/{chat_id}/user-messages")
def post_user_message(chat_id: str, body: UserText, root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _user(root, body.userId, lambda f: store.user_message(f, body.userId, chat_id, body.text))


@router.post("/chats/{chat_id}/user-close")
def post_user_close(chat_id: str, body: UserText, root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _user(root, body.userId, lambda f: store.user_close(f, body.userId, chat_id))


@router.post("/chats/{chat_id}/drafts/{event_id}/confirm")
def post_confirm(chat_id: str, event_id: str, body: ConfirmBody, root: Path = Depends(get_app_data_storage_root)) -> dict:
    known = set(_known(root))
    return _user(root, body.userId, lambda f: store.confirm_draft(f, root, body.userId, body.userName, chat_id, event_id, known))


# --- the staff side ------------------------------------------------------------------


@router.get("")
def get_staff_view(admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _guard(lambda: _with_next(root, store.load(root), admin_id))


@router.post("/chats/{chat_id}/take")
def post_take(chat_id: str, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _staff(root, admin_id, lambda f: store.take(f, admin_id, chat_id))


@router.post("/chats/{chat_id}/messages")
def post_staff_message(chat_id: str, body: StaffText, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    sf = staff_store.load(root)
    return _staff(root, admin_id, lambda f: store.staff_message(f, sf, admin_id, chat_id, body.text))


@router.post("/chats/{chat_id}/actions")
def post_action(chat_id: str, body: ActionBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    known = _known(root)
    fb = fb_store.load(root)
    return _staff(root, admin_id, lambda f: store.act(
        f, fb, admin_id, chat_id, known, body.action, text=body.text, node_id=body.nodeId, stage=body.stage,
        to_queue=body.toQueue, draft=body.draft.model_dump() if body.draft else None))


# --- the queues ---------------------------------------------------------------------


class BlockBody(BaseModel):
    day: int
    start: int
    hours: int


class ScheduleBody(BaseModel):
    blocks: list[BlockBody] = Field(default_factory=list, max_length=7)


class SwitchBody(BaseModel):
    queue: str
    on: bool


class RangesBody(BaseModel):
    medium: int
    high: int
    urgent: int


class LevelsBody(BaseModel):
    queue: Optional[str] = None
    ranges: Optional[RangesBody] = None


class OverrideBody(BaseModel):
    queue: str
    level: Optional[queues.Level] = None
    hours: int = 4


@router.get("/queues")
def get_queues(admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _queues(root, admin_id)


@router.put("/schedule")
def put_schedule(body: ScheduleBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _queues(root, admin_id, lambda f, sf, c, now: queues.set_schedule(f.queues, sf, admin_id, [b.model_dump() for b in body.blocks], now))


@router.put("/switchboard")
def put_switch(body: SwitchBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _queues(root, admin_id, lambda f, sf, c, now: queues.set_switch(f, f.queues, sf, admin_id, body.queue, body.on, c, now))


class BreakBody(BaseModel):
    on: bool


class BreakRateBody(BaseModel):
    minutes: int = Field(ge=0, le=queues.BREAK_RATE_MAX)


# The staff member's break (AUI's work and break meters): start it (on shift only) or end it.
@router.put("/break")
def put_break(body: BreakBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _queues(root, admin_id, lambda f, sf, c, now: queues.set_break(f.queues, sf, admin_id, body.on, now))


# The break allowance, minutes earned per hour worked (an admin; Admin > Configuration > SLA).
@router.put("/break-rate")
def put_break_rate(body: BreakRateBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _queues(root, admin_id, lambda f, sf, c, now: queues.set_break_rate(f.queues, sf, admin_id, body.minutes))


@router.put("/levels")
def put_levels(body: LevelsBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    ranges = body.ranges.model_dump() if body.ranges else None
    return _queues(root, admin_id, lambda f, sf, c, now: queues.set_ranges(f.queues, sf, admin_id, body.queue, ranges, c))


@router.put("/overrides")
def put_override(body: OverrideBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _queues(root, admin_id, lambda f, sf, c, now: queues.set_override(f.queues, sf, admin_id, body.queue, body.level, body.hours, c, now))
