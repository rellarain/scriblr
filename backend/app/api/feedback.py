from pathlib import Path
from typing import Callable, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root
from ..storage import feedback as store

# The Helper Inbox: validating feedback messages and processing the statement cases
# they form (votes, notes, solutions). Every call acts as the signed-in admin named
# in the X-Admin-Id header (no login yet: the id is trusted); each one returns the
# whole Inbox bundle for that admin, so the interface always shows current state.
router = APIRouter(prefix="/api/feedback", tags=["feedback"])


def current_admin(
    x_admin_id: Optional[str] = Header(default=None),
    root: Path = Depends(get_app_data_storage_root),
) -> str:
    if x_admin_id:
        return x_admin_id
    return store.load(root).admins[0].id


def _run(root: Path, admin_id: str, fn: Callable[[store.FeedbackFile], None]) -> dict:
    try:
        file = store.mutate(root, fn)
        return store.bundle(file, admin_id)
    except store.FeedbackError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


class ValidationBody(BaseModel):
    tone: Optional[store.Tone] = None
    channels: Optional[list[store.ChannelTag]] = None
    statements: Optional[list[store.Statement]] = None


class VoteBody(BaseModel):
    approve: bool = False
    deny: bool = False
    approveNote: str = Field(default="", max_length=store.NOTE_MAX)
    denyNote: str = Field(default="", max_length=store.NOTE_MAX)


class SolutionBody(BaseModel):
    title: str = Field(max_length=store.TITLE_MAX)
    description: str = Field(default="", max_length=store.SOLUTION_MAX)
    target: store.ChannelTag


class CloseBody(BaseModel):
    outcome: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=store.NOTE_MAX)


class VerbBody(BaseModel):
    name: str = Field(max_length=60)
    keywords: list[str] = Field(default_factory=list)


class VerbPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    keywords: Optional[list[str]] = None


@router.get("")
def get_inbox(admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    try:
        return store.bundle(store.load(root), admin_id)
    except store.FeedbackError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.put("/messages/{message_id}/validation")
def put_validation(
    message_id: str, body: ValidationBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.set_validation(f, admin_id, message_id, body.tone, body.channels, body.statements))


@router.put("/cases/{case_id}/vote")
def put_case_vote(
    case_id: str, body: VoteBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.vote_on_case(f, admin_id, case_id, body.approve, body.deny, body.approveNote, body.denyNote))


@router.post("/cases/{case_id}/solutions")
def post_solution(
    case_id: str, body: SolutionBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.propose_solution(f, admin_id, case_id, body.title, body.description, body.target))


@router.put("/cases/{case_id}/solutions/{solution_id}/vote")
def put_solution_vote(
    case_id: str, solution_id: str, body: VoteBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.vote_on_solution(
        f, admin_id, case_id, solution_id, body.approve, body.deny, body.approveNote, body.denyNote))


@router.post("/cases/{case_id}/close")
def post_close(
    case_id: str, body: CloseBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.close_case(f, admin_id, case_id, body.outcome, body.note))


@router.post("/cases/{case_id}/reopen")
def post_reopen(
    case_id: str, admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.reopen_case(f, admin_id, case_id))


@router.post("/verb-categories")
def post_verb(body: VerbBody, admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.add_verb(f, admin_id, body.name, body.keywords))


@router.patch("/verb-categories/{verb_id}")
def patch_verb(
    verb_id: str, body: VerbPatch,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.update_verb(f, admin_id, verb_id, body.name, body.keywords))


@router.delete("/verb-categories/{verb_id}")
def delete_verb(verb_id: str, admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.delete_verb(f, admin_id, verb_id))
