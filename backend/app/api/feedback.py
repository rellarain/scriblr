from pathlib import Path
from typing import Callable, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root
from ..storage import feedback as store
from ..storage import resources

# The feedback pipeline. A user sends feedback from a Help tile (a subject and a verb) and follows it in "mine"; staff
# check it (Helper > Inbox), vote on and correct statements (Office > Voting, Channel Management) and decide them
# (Project Plan). Every staff call acts as the admin named in the X-Admin-Id header (no login yet: the id is trusted)
# and returns the whole staff bundle, so the interface always shows current state. The user's routes need no admin.
router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# What the plan says of a statement's work, set by the Project Plan store (None: no plan yet).
WORK_OF: Optional[Callable[[Path], store.WorkOf]] = None


def _work(root: Path) -> Optional[store.WorkOf]:
    return WORK_OF(root) if WORK_OF else None


def current_admin(
    x_admin_id: Optional[str] = Header(default=None),
    root: Path = Depends(get_app_data_storage_root),
) -> str:
    # a staff call acts as the staff member it names, else as the owner (universal access: there is no login yet)
    if x_admin_id:
        return x_admin_id
    return store.OWNER_ID


def _known(root: Path) -> set[str]:
    return {n.id for n in resources.load_resources(root).nodes}


def _scopes(root: Path) -> set[str]:
    return {n.id for n in resources.load_resources(root).nodes if n.kind in ("interface", "console")}


def _guard(fn):
    try:
        return fn()
    except store.FeedbackError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


def _run(root: Path, admin_id: str, fn: Callable[[store.FeedbackFile], None]) -> dict:
    return _guard(lambda: store.bundle(store.mutate(root, fn), admin_id, _work(root)))


class SubmitBody(BaseModel):
    author: str = Field(default="", max_length=120)
    authorId: str = Field(default="", max_length=120)
    text: str = Field(max_length=store.TEXT_MAX)
    senderTone: Optional[store.Tone] = None
    channelId: str
    verbId: str
    fromChannel: Optional[str] = None


class EditBody(BaseModel):
    channelId: Optional[str] = None
    verbId: Optional[str] = None
    tone: Optional[store.Tone] = None
    checked: Optional[bool] = None


class TextBody(BaseModel):
    text: str = Field(max_length=store.NOTE_MAX)


class AnswerBody(BaseModel):
    authorId: str = Field(max_length=120)
    answer: str = Field(max_length=store.NOTE_MAX)


class VoteBody(BaseModel):
    approve: bool = False
    deny: bool = False
    passed: bool = False
    approveNote: str = Field(default="", max_length=store.NOTE_MAX)
    denyNote: str = Field(default="", max_length=store.NOTE_MAX)
    passNote: str = Field(default="", max_length=store.NOTE_MAX)


class DecisionBody(BaseModel):
    decision: Optional[Literal["accepted", "vetoed"]] = None
    note: str = Field(default="", max_length=store.NOTE_MAX)


class RolesBody(BaseModel):
    scope: str
    roles: list[str] = Field(default_factory=list)


class VerbBody(BaseModel):
    name: str = Field(max_length=60)
    keywords: list[str] = Field(default_factory=list)


class VerbPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    keywords: Optional[list[str]] = None


# --- the user's side (no admin) ----------------------------------------------


@router.get("/mine")
def get_mine(authorId: str = "", root: Path = Depends(get_app_data_storage_root)) -> dict:
    """What one user sent, with where each stands and the questions asked of them."""
    return _guard(lambda: store.mine(store.load(root), authorId, _work(root)))


@router.get("/verbs")
def get_verbs(root: Path = Depends(get_app_data_storage_root)) -> list[dict]:
    """The verbs a user picks from when sending feedback."""
    return [v.model_dump(mode="json") for v in store.load(root).verbCategories]


@router.post("/messages")
def post_message(body: SubmitBody, root: Path = Depends(get_app_data_storage_root)) -> dict:
    known = _known(root)
    file = _guard(lambda: store.mutate(root, lambda f: store.create_message(
        f, body.author, body.authorId, body.text, body.senderTone, body.channelId, body.verbId, body.fromChannel, known)))
    created = file.messages[-1]
    return {"id": created.id, "submittedAt": created.submittedAt}


@router.put("/messages/{message_id}/questions/{question_id}/answer")
def put_answer(message_id: str, question_id: str, body: AnswerBody, root: Path = Depends(get_app_data_storage_root)) -> dict:
    file = _guard(lambda: store.mutate(root, lambda f: store.answer_question(f, body.authorId, message_id, question_id, body.answer)))
    return store.mine(file, body.authorId, _work(root))


# --- the staff side -------------------------------------------------------------


@router.get("")
def get_bundle(admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _guard(lambda: store.bundle(store.load(root), admin_id, _work(root)))


@router.put("/messages/{message_id}")
def put_message(
    message_id: str, body: EditBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    known = _known(root)
    return _run(root, admin_id, lambda f: store.edit_message(
        f, admin_id, message_id, known, body.channelId, body.verbId, body.tone, body.checked))


@router.post("/messages/{message_id}/questions")
def post_question(
    message_id: str, body: TextBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.ask_question(f, admin_id, message_id, body.text))


@router.post("/messages/{message_id}/comments")
def post_comment(
    message_id: str, body: TextBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.add_comment(f, admin_id, message_id, body.text))


@router.put("/statements/{statement_id}/vote")
def put_vote(
    statement_id: str, body: VoteBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.vote(
        f, admin_id, statement_id, body.approve, body.deny, body.passed, body.approveNote, body.denyNote, body.passNote))


@router.post("/statements/{statement_id}/decision")
def post_decision(
    statement_id: str, body: DecisionBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    return _run(root, admin_id, lambda f: store.decide(f, admin_id, statement_id, body.decision, body.note))


@router.put("/admins/{target_id}/roles")
def put_roles(
    target_id: str, body: RolesBody,
    admin_id: str = Depends(current_admin), root: Path = Depends(get_app_data_storage_root),
) -> dict:
    scopes = _scopes(root)
    return _run(root, admin_id, lambda f: store.set_roles(f, admin_id, target_id, body.scope, body.roles, scopes))


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
