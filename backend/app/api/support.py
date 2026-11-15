from pathlib import Path
from typing import Any, Callable, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root
from ..storage import feedback as fb_store
from ..storage import resources
from ..storage import staff as staff_store
from ..storage import support as store
from . import feedback as feedback_api

# Support chats. A user starts one from a Help tile and follows it in "mine"; staff take chats from the queues, talk, send
# guides, draft feedback, transfer, escalate and close them. Staff calls act as the X-Admin-Id staff member and return the
# staff view; the user's calls need no admin and return the user's chats.
router = APIRouter(prefix="/api/support", tags=["support"])


def _guard(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except (store.SupportError, fb_store.FeedbackError, staff_store.StaffError) as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


def _known(root: Path) -> dict[str, str]:
    return {n.id: n.kind for n in resources.load_resources(root).nodes}


def _staff(root: Path, admin_id: str, fn: Callable[[store.SupportFile], None]) -> dict:
    def go() -> dict:
        fb_store.admin_by_id(fb_store.load(root), admin_id)
        return store.staff_view(store.mutate(root, fn), admin_id)
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
    return _guard(lambda: store.staff_view(store.load(root), admin_id))


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
