from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_app_data_storage_root
from ..storage import feedback as fb_store
from ..storage import staff as store
from . import feedback as feedback_api

# The staff (Admin > Office): the roster, the departments and teams, helper hours, the console queues each person
# supports, training and promotions, and the SLA per priority. Every call acts as the staff member in the X-Admin-Id header (no login yet; anyone
# may change it for now) and returns the whole staff view.
router = APIRouter(prefix="/api/staff", tags=["staff"])


def _guard(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except (store.StaffError, fb_store.FeedbackError) as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


def _run(root: Path, admin_id: str, fn: Callable[[store.StaffFile], None]) -> dict:
    def go() -> dict:
        fb_store.admin_by_id(fb_store.load(root), admin_id)
        return store.view(store.mutate(root, fn))
    return _guard(go)


class HireBody(BaseModel):
    name: str = Field(max_length=store.NAME_MAX)
    kind: store.PersonKind = "admin"
    departmentId: Optional[str] = None
    teamId: Optional[str] = None


class PersonPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=store.NAME_MAX)
    kind: Optional[store.PersonKind] = None
    active: Optional[bool] = None
    departmentId: Optional[str] = None
    teamId: Optional[str] = None
    allotment: Optional[int] = None
    supports: Optional[list[str]] = None


class TrainingBody(BaseModel):
    nodeId: str
    finished: bool = True


class PromoteBody(BaseModel):
    nodeId: str
    promoted: bool = True


class NameBody(BaseModel):
    name: str = Field(max_length=store.NAME_MAX)
    departmentId: Optional[str] = None


class GroupPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=store.NAME_MAX)
    directorId: Optional[str] = None
    managerId: Optional[str] = None
    departmentId: Optional[str] = None


@router.get("")
def get_staff(root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _guard(lambda: store.view(store.load(root)))


@router.post("/people")
def post_person(body: HireBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.hire(f, root, body.name, body.kind, body.departmentId, body.teamId))


@router.patch("/people/{person_id}")
def patch_person(person_id: str, body: PersonPatch, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.edit_person(f, root, person_id, body.model_dump(exclude_unset=True)))


@router.put("/people/{person_id}/training")
def put_training(person_id: str, body: TrainingBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.set_training(f, root, person_id, body.nodeId, body.finished))


@router.put("/people/{person_id}/promotion")
def put_promotion(person_id: str, body: PromoteBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.promote(f, admin_id, person_id, body.nodeId, body.promoted))


@router.post("/departments")
def post_department(body: NameBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.add_department(f, body.name))


@router.patch("/departments/{department_id}")
def patch_department(department_id: str, body: GroupPatch, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.edit_department(f, department_id, body.model_dump(exclude_unset=True)))


@router.delete("/departments/{department_id}")
def delete_department(department_id: str, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.delete_department(f, department_id))


@router.post("/teams")
def post_team(body: NameBody, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    if not body.departmentId:
        raise HTTPException(status_code=400, detail="A team belongs to a department.")
    return _run(root, admin_id, lambda f: store.add_team(f, body.name, body.departmentId or ""))


@router.patch("/teams/{team_id}")
def patch_team(team_id: str, body: GroupPatch, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.edit_team(f, team_id, body.model_dump(exclude_unset=True)))


@router.delete("/teams/{team_id}")
def delete_team(team_id: str, admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.delete_team(f, team_id))


@router.put("/sla")
def put_sla(body: dict[str, int], admin_id: str = Depends(feedback_api.current_admin), root: Path = Depends(get_app_data_storage_root)) -> dict:
    return _run(root, admin_id, lambda f: store.set_sla(f, body))
