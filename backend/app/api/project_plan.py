from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root
from ..storage import feedback as fb_store
from ..storage import project_plan as store
from ..storage import resources
from ..storage.schema import Recurrence
from . import feedback as feedback_api

# The app's own Project Plan (Admin > Project Plan): every node of the channel list has a plan of tasks, processes,
# procedures and routines. Every call acts as the staff member in the X-Admin-Id header (as the feedback routes do) and
# returns the whole plan, with what that staff member may do with each item. The plan's statuses reach the writers of
# the feedback statements it answers (feedback_api.WORK_OF).
router = APIRouter(prefix="/api/project-plan", tags=["project-plan"])

feedback_api.WORK_OF = store.work_for


def _guard(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except (store.PlanError, fb_store.FeedbackError) as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


def _run(root: Path, admin_id: str, fn: Callable[[store.PlanFile, fb_store.FeedbackFile], None]) -> dict:
    def go() -> dict:
        fb = fb_store.load(root)
        fb_store.admin_by_id(fb, admin_id)
        plan = store.mutate(root, lambda f: fn(f, fb))
        return store.view(plan, fb, admin_id)
    return _guard(go)


def _known(root: Path) -> set[str]:
    return {n.id for n in resources.load_resources(root).nodes}


class ItemBody(BaseModel):
    nodeId: str
    kind: store.Kind
    title: str = Field(max_length=store.TITLE_MAX)
    parentId: Optional[str] = None
    ordered: bool = True
    notes: str = Field(default="", max_length=store.NOTES_MAX)
    priority: store.Priority = "normal"
    start: Optional[str] = None
    due: Optional[str] = None
    assigneeId: Optional[str] = None
    statementIds: list[str] = Field(default_factory=list, max_length=store.STATEMENTS_MAX)
    recurrence: Optional[Recurrence] = None


class ItemPatch(BaseModel):
    title: Optional[str] = Field(default=None, max_length=store.TITLE_MAX)
    notes: Optional[str] = Field(default=None, max_length=store.NOTES_MAX)
    parentId: Optional[str] = None
    ordered: Optional[bool] = None
    status: Optional[store.ItemStatus] = None
    priority: Optional[store.Priority] = None
    start: Optional[str] = None
    due: Optional[str] = None
    assigneeId: Optional[str] = None
    statementIds: Optional[list[str]] = Field(default=None, max_length=store.STATEMENTS_MAX)
    recurrence: Optional[Recurrence] = None


class ReorderBody(BaseModel):
    nodeId: str
    parentId: Optional[str] = None
    orderedIds: list[str]


class ClaimBody(BaseModel):
    release: bool = False


@router.get("")
def get_plan(admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _guard(lambda: store.view(store.load(root), fb_store.load(root), admin_id))


@router.post("/items")
def post_item(body: ItemBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    known = _known(root)
    return _run(root, admin_id, lambda f, fb: store.add_item(
        f, fb, admin_id, known, node_id=body.nodeId, kind=body.kind, title=body.title, parent_id=body.parentId,
        ordered=body.ordered, notes=body.notes, priority=body.priority, start=body.start, due=body.due,
        assignee_id=body.assigneeId, statement_ids=body.statementIds, recurrence=body.recurrence))


@router.patch("/items/{item_id}")
def patch_item(item_id: str, body: ItemPatch, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    # Only the fields sent change (a field sent as null clears it: the parent, the dates, the assignee, the recurrence).
    changes = body.model_dump(exclude_unset=True, mode="python")
    if "recurrence" in changes and body.recurrence is not None:
        changes["recurrence"] = body.recurrence
    for key in ("start", "due"):
        if key in changes:
            try:
                changes[key] = store._day(changes[key])
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"{key}: {exc}") from exc
    return _run(root, admin_id, lambda f, fb: store.edit_item(f, fb, admin_id, item_id, changes))


@router.delete("/items/{item_id}")
def delete_item(item_id: str, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f, fb: store.delete_item(f, fb, admin_id, item_id))


@router.put("/items/reorder")
def put_reorder(body: ReorderBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f, fb: store.reorder(f, fb, admin_id, body.nodeId, body.parentId, body.orderedIds))


@router.post("/items/{item_id}/claim")
def post_claim(item_id: str, body: ClaimBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f, fb: store.claim(f, fb, admin_id, item_id, body.release))
