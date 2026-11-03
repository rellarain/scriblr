from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_app_data_storage_root
from ..storage import training_store as store
from ..storage.training_schema import AttemptIn, TrainingContentDraft, TrainingState

router = APIRouter(prefix="/api/training", tags=["training"])


def _refuse(exc: ValueError) -> HTTPException:
    if isinstance(exc, store.UnknownItemError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, store.NewerTrainingSchemaError):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


@router.get("", response_model=TrainingState)
def get_training(root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    """The courses (seeded on the first load) and this learner's progress."""
    try:
        return store.state(root)
    except store.NewerTrainingSchemaError as exc:
        raise _refuse(exc)


@router.put("/content", response_model=TrainingState)
def put_content(body: TrainingContentDraft, root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    """Replace the curricula and the courses. The learner's progress is kept, minus what names something that is gone."""
    try:
        return store.save_content(root, body)
    except store.NewerTrainingSchemaError as exc:
        raise _refuse(exc)


@router.put("/enrolments/{course_id}", response_model=TrainingState)
def enrol(course_id: str, root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    try:
        return store.enrol(root, course_id)
    except (store.UnknownItemError, store.InvalidItemError, store.NewerTrainingSchemaError) as exc:
        raise _refuse(exc)


@router.delete("/enrolments/{course_id}", response_model=TrainingState)
def leave(course_id: str, root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    try:
        return store.leave(root, course_id)
    except (store.UnknownItemError, store.InvalidItemError, store.NewerTrainingSchemaError) as exc:
        raise _refuse(exc)


@router.put("/completions/{item_id}", response_model=TrainingState)
def complete(item_id: str, root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    """Mark a course, module, lesson, exercise or project complete. (A quiz, test or exam is passed, with an attempt.)"""
    try:
        return store.set_completed(root, item_id)
    except (store.UnknownItemError, store.InvalidItemError, store.NewerTrainingSchemaError) as exc:
        raise _refuse(exc)


@router.delete("/completions/{item_id}", response_model=TrainingState)
def uncomplete(item_id: str, root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    try:
        return store.clear_completed(root, item_id)
    except (store.UnknownItemError, store.InvalidItemError, store.NewerTrainingSchemaError) as exc:
        raise _refuse(exc)


@router.post("/attempts/{assessment_id}", response_model=TrainingState)
def attempt(assessment_id: str, body: AttemptIn, root: Path = Depends(get_app_data_storage_root)) -> TrainingState:
    """Keep a result of a quiz, test or exam. A score that reaches its pass mark marks the lesson, module or course complete."""
    try:
        return store.record_attempt(root, assessment_id, body.score)
    except (store.UnknownItemError, store.InvalidItemError, store.NewerTrainingSchemaError) as exc:
        raise _refuse(exc)
