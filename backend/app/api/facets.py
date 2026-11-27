from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import get_storage_root
from ..storage import facet_activity, project_store as store
from ..storage.schema import ActivityEvent, DayTotals, MonthTotals, Planner

project_router = APIRouter(prefix="/api/projects/{project_id}", tags=["facets"])
account_router = APIRouter(prefix="/api/activity", tags=["facets"])


class FacetActivityResponse(BaseModel):
    today: str
    events: list[ActivityEvent] = Field(default_factory=list)
    daily: dict[str, DayTotals] = Field(default_factory=dict)
    monthly: dict[str, MonthTotals] = Field(default_factory=dict)


class RibbonResponse(BaseModel):
    date: str
    today: dict[str, list[int]]
    average: dict[str, list[float]]


@project_router.get("/activity/facets", response_model=FacetActivityResponse)
def get_facet_activity(project_id: str, root: Path = Depends(get_storage_root)) -> FacetActivityResponse:
    """The project's activity by facet: the last days' events, the daily totals for about a year, and the monthly totals before that."""
    facet_activity.compact_project(root, project_id)
    fa = store.load_facets(root, project_id)
    return FacetActivityResponse(today=facet_activity.local_now().date().isoformat(), events=fa.events, daily=fa.daily, monthly=fa.monthly)


@account_router.get("/ribbon", response_model=RibbonResponse)
def get_ribbon(root: Path = Depends(get_storage_root)) -> RibbonResponse:
    """Today's events per 10-minute slot across every project, and each slot's average over the 28 days before."""
    return RibbonResponse(**facet_activity.ribbon(root))


def _check_dates(planner: Planner) -> None:
    days: list[str] = [d for d in (planner.timelineStart, planner.timelineEnd) if d]
    for goal in planner.goals:
        if goal.deadline:
            days.append(goal.deadline)
    for shift in planner.shifts:
        days.append(shift.date)
        days.extend(shift.skipped)
        days.extend(shift.overrides.keys())
        for pause in shift.pauses:
            days.extend([pause.start, pause.end])
        if shift.recurrence:
            days.append(shift.recurrence.anchor)
            if shift.recurrence.until:
                days.append(shift.recurrence.until)
    for routine in planner.routines:
        days.append(routine.recurrence.anchor)
        if routine.recurrence.until:
            days.append(routine.recurrence.until)
        if routine.lastDone:
            days.append(routine.lastDone)
        for pause in routine.pauses:
            days.extend([pause.start, pause.end])
    for item in planner.items:
        if item.doneOn:
            days.append(item.doneOn)
        if item.dueDate:
            days.append(item.dueDate)
        if item.addedOn:
            days.append(item.addedOn)
    for rest in planner.restDays:
        days.extend([rest.start, rest.end])
    for phase in planner.phases:
        days.extend(d for d in (phase.start, phase.end) if d)
    for milestone in planner.milestones:
        days.extend(d for d in (milestone.date, milestone.doneOn) if d)
    days.extend(e.lastDone for e in planner.exercises if e.lastDone)
    for revision_pass in planner.passes:
        days.extend(d for d in (revision_pass.start, revision_pass.end) if d)
    for day in days:
        try:
            date.fromisoformat(day)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"not a date (YYYY-MM-DD): {day}")
    for phase in planner.phases:
        if phase.start and phase.end and phase.end < phase.start:
            raise HTTPException(status_code=422, detail=f"phase {phase.title!r} ends before it starts")
    for revision_pass in planner.passes:
        if revision_pass.end and revision_pass.end < revision_pass.start:
            raise HTTPException(status_code=422, detail=f"pass {revision_pass.name!r} ends before it starts")
        if len(set(revision_pass.kinds)) != len(revision_pass.kinds):
            raise HTTPException(status_code=422, detail=f"pass {revision_pass.name!r} names a kind of flag twice")
        for goal in revision_pass.goals:
            if goal.kind == "words" and not goal.words:
                raise HTTPException(status_code=422, detail=f"a word goal of pass {revision_pass.name!r} needs the words to cut or add")
        if len({g.id for g in revision_pass.goals}) != len(revision_pass.goals):
            raise HTTPException(status_code=422, detail=f"two goals of pass {revision_pass.name!r} share an id")
    for phase in planner.phases:
        if phase.level == 'project' and phase.nodeId:
            raise HTTPException(status_code=422, detail=f"phase {phase.title!r} is the project's, so it has no book or chapter")
        if phase.level != 'project' and not phase.nodeId:
            raise HTTPException(status_code=422, detail=f"phase {phase.title!r} is a {phase.level} phase, so it needs the {phase.level} it is for")
    for kind, items in (('phase', planner.phases), ('milestone', planner.milestones), ('process', planner.processes), ('exercise', planner.exercises), ('phase kind', planner.phaseKinds), ('pass', planner.passes)):
        ids = [i.id for i in items]
        if len(ids) != len(set(ids)):
            raise HTTPException(status_code=422, detail=f"two {kind}s share an id")


class ReadRequest(BaseModel):
    chapterId: str = Field(min_length=1, max_length=200)


@project_router.post("/activity/read", status_code=204)
def record_read(project_id: str, body: ReadRequest, root: Path = Depends(get_storage_root)) -> None:
    """A chapter read in the Preview (while a revision pass with a reading goal runs): an activity event, facet "revision", action "read"."""
    with store.transaction(root, project_id):
        node = next((n for n in store.load_project(root, project_id).outline.nodes if n.id == body.chapterId), None)
        if node is None or node.kind != "chapter":
            raise HTTPException(status_code=404, detail=f"chapter not found: {body.chapterId}")
        facet_activity.record(root, project_id, "revision", "read", node_id=node.id, kind="chapter", label=node.title)


@project_router.get("/planner", response_model=Planner)
def get_planner(project_id: str, root: Path = Depends(get_storage_root)) -> Planner:
    return store.load_planner(root, project_id)


@project_router.put("/planner", response_model=Planner)
def put_planner(project_id: str, body: Planner, root: Path = Depends(get_storage_root)) -> Planner:
    _check_dates(body)
    store.save_planner(root, project_id, body)
    return body
