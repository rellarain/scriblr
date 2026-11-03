"""Global (not project-scoped) storage for Training (see training_schema.py): the courses in %APPDATA%\\Scriblr\\training.json and one learner's
progress in training-progress.json, siblings of the projects/ directory. Reuses project_store's atomic-write and quarantine-on-corruption helpers.

The courses are seeded on the first load, with fixed ids (the same in every process), and are saved whole by whoever authors them. Saving them
never touches what the learner did, except to drop what refers to a course, lesson or exercise that is gone."""

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable

from . import project_store
from .schema import utcnow
from .training_schema import (
    DEFAULT_PASS_MARK,
    MAX_ATTEMPTS,
    TRAINING_SCHEMA_VERSION,
    Assessment,
    Attempt,
    Course,
    Curriculum,
    Exercise,
    Lesson,
    Module,
    Project,
    TrainingContent,
    TrainingContentDraft,
    TrainingProgress,
    TrainingState,
)

_lock = threading.RLock()


class UnknownItemError(ValueError):
    """No course, module, lesson, exercise, project or assessment has this id."""


class InvalidItemError(ValueError):
    """The id exists but not as the kind of thing the operation is for (an assessment cannot be marked complete; only an assessment has attempts)."""


class NewerTrainingSchemaError(ValueError):
    """training.json was saved by a newer version of Scriblr."""


def _now() -> datetime:
    return utcnow()


def _content_path(root: Path) -> Path:
    return root / "training.json"


def _progress_path(root: Path) -> Path:
    return root / "training-progress.json"


# ---------------------------------------------------------------- the seed

# The five curricula that were the pages of the User panel's Training console, with a placeholder course each, so every level of the
# Training interface can be opened. Hues are the curricula's. Replaced when the courses are written.
_SEED_CURRICULA: list[tuple[str, str, int]] = [("user", "User", 200), ("reader", "Reader", 280), ("translator", "Translator", 160), ("writer", "Writer", 30), ("admin", "Admin", 340)]


def default_content() -> TrainingContent:
    curricula: list[Curriculum] = []
    courses: list[Course] = []
    for key, role, hue in _SEED_CURRICULA:
        c, m, lesson = f"{key}-c1", f"{key}-c1-m1", f"{key}-c1-m1-l1"
        curricula.append(Curriculum(id=key, title=f"{role} Training", description=f"Access {role.lower()} training resources here.", hue=hue, courseIds=[c]))
        courses.append(Course(
            id=c, title=f"{role} Course 1", description=f"The first {role.lower()} course.",
            modules=[Module(
                id=m, title="Module 1", description="Placeholder module.",
                lessons=[Lesson(
                    id=lesson, title="Lesson 1", description="Placeholder lesson.", body=f"# Lesson 1\n\nPlaceholder material for the {role.lower()} course.",
                    exercises=[Exercise(id=f"{lesson}-e1", title="Exercise 1", description="Placeholder exercise.")],
                    quizzes=[Assessment(id=f"{lesson}-q1", title="Quiz 1", description="Placeholder quiz.")],
                )],
                tests=[Assessment(id=f"{m}-t1", title="Test 1", description="Placeholder test.")],
            )],
            projects=[Project(id=f"{c}-p1", title="Project 1", description="Placeholder project.", exerciseIds=[f"{lesson}-e1"])],
            exams=[Assessment(id=f"{c}-x1", title="Exam 1", description="Placeholder exam.")],
        ))
    return TrainingContent(curricula=curricula, courses=courses)


# ---------------------------------------------------------------- reading and writing

def _stored_version(path: Path) -> int:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return TRAINING_SCHEMA_VERSION
    version = data.get("schemaVersion", TRAINING_SCHEMA_VERSION) if isinstance(data, dict) else TRAINING_SCHEMA_VERSION
    return version if isinstance(version, int) else TRAINING_SCHEMA_VERSION


def _refuse_newer(path: Path) -> None:
    found = _stored_version(path)
    if found > TRAINING_SCHEMA_VERSION:
        raise NewerTrainingSchemaError(f"{path.name} was saved by a newer version of Scriblr (format {found}, this one writes {TRAINING_SCHEMA_VERSION})")


def load_content(root: Path) -> TrainingContent:
    with _lock:
        path = _content_path(root)
        if not path.exists():
            content = default_content()
            _save_content(root, content)
            return content
        _refuse_newer(path)
        return project_store._read_shard(path, TrainingContent)


def _save_content(root: Path, content: TrainingContent) -> None:
    content.schemaVersion = TRAINING_SCHEMA_VERSION
    project_store._write_shard(root, _content_path(root), content)


def load_progress(root: Path) -> TrainingProgress:
    with _lock:
        path = _progress_path(root)
        if not path.exists():
            return TrainingProgress()
        _refuse_newer(path)
        return project_store._read_shard(path, TrainingProgress)


def _save_progress(root: Path, progress: TrainingProgress) -> None:
    progress.schemaVersion = TRAINING_SCHEMA_VERSION
    project_store._write_shard(root, _progress_path(root), progress)


def state(root: Path) -> TrainingState:
    with _lock:
        return TrainingState(content=load_content(root), progress=load_progress(root))


# ---------------------------------------------------------------- what an id is

# id -> (kind, the id of what it sits in). A quiz sits in a lesson, a test in a module, an exam in a course.
Index = dict[str, tuple[str, str | None]]
COMPLETABLE = ("course", "module", "lesson", "exercise", "project")


def index_of(content: TrainingContent) -> Index:
    out: Index = {}
    for curriculum in content.curricula:
        out[curriculum.id] = ("curriculum", None)
    for course in content.courses:
        out[course.id] = ("course", None)
        for module in course.modules:
            out[module.id] = ("module", course.id)
            for test in module.tests:
                out[test.id] = ("test", module.id)
            for lesson in module.lessons:
                out[lesson.id] = ("lesson", module.id)
                for exercise in lesson.exercises:
                    out[exercise.id] = ("exercise", lesson.id)
                for quiz in lesson.quizzes:
                    out[quiz.id] = ("quiz", lesson.id)
        for project in course.projects:
            out[project.id] = ("project", course.id)
        for exam in course.exams:
            out[exam.id] = ("exam", course.id)
    return out


def _assessment(content: TrainingContent, assessment_id: str) -> Assessment | None:
    for course in content.courses:
        for exam in course.exams:
            if exam.id == assessment_id:
                return exam
        for module in course.modules:
            for test in module.tests:
                if test.id == assessment_id:
                    return test
            for lesson in module.lessons:
                for quiz in lesson.quizzes:
                    if quiz.id == assessment_id:
                        return quiz
    return None


# ---------------------------------------------------------------- the courses

def save_content(root: Path, draft: TrainingContentDraft) -> TrainingState:
    """Replace the courses. What the learner did is kept, except what names something that is no longer there."""
    with _lock:
        load_content(root)  # a corrupt or newer file is refused here, not overwritten
        content = TrainingContent(curricula=draft.curricula, courses=draft.courses)
        _save_content(root, content)
        index = index_of(content)
        progress = load_progress(root)
        progress.enrolled = {i: at for i, at in progress.enrolled.items() if index.get(i, ("",))[0] == "course"}
        progress.completed = {i: at for i, at in progress.completed.items() if index.get(i, ("",))[0] in COMPLETABLE}
        progress.attempts = {i: a for i, a in progress.attempts.items() if index.get(i, ("",))[0] in ("quiz", "test", "exam")}
        _save_progress(root, progress)
        return TrainingState(content=content, progress=progress)


# ---------------------------------------------------------------- the learner

def _mutate(root: Path, change: Callable[[TrainingContent, Index, TrainingProgress], None]) -> TrainingState:
    with _lock:
        content = load_content(root)
        progress = load_progress(root)
        change(content, index_of(content), progress)
        _save_progress(root, progress)
        return TrainingState(content=content, progress=progress)


def _require(index: Index, item_id: str, kinds: tuple[str, ...], what: str) -> None:
    found = index.get(item_id)
    if found is None:
        raise UnknownItemError(f"no {what} {item_id!r}")
    if found[0] not in kinds:
        raise InvalidItemError(f"{item_id!r} is a {found[0]}, not a {what}")


def enrol(root: Path, course_id: str) -> TrainingState:
    def change(_content: TrainingContent, index: Index, progress: TrainingProgress) -> None:
        _require(index, course_id, ("course",), "course")
        progress.enrolled.setdefault(course_id, _now())
    return _mutate(root, change)


def leave(root: Path, course_id: str) -> TrainingState:
    def change(_content: TrainingContent, index: Index, progress: TrainingProgress) -> None:
        _require(index, course_id, ("course",), "course")
        progress.enrolled.pop(course_id, None)
    return _mutate(root, change)


def set_completed(root: Path, item_id: str) -> TrainingState:
    def change(_content: TrainingContent, index: Index, progress: TrainingProgress) -> None:
        _require(index, item_id, COMPLETABLE, "course, module, lesson, exercise or project")
        progress.completed.setdefault(item_id, _now())
    return _mutate(root, change)


def clear_completed(root: Path, item_id: str) -> TrainingState:
    def change(_content: TrainingContent, index: Index, progress: TrainingProgress) -> None:
        _require(index, item_id, COMPLETABLE, "course, module, lesson, exercise or project")
        progress.completed.pop(item_id, None)
    return _mutate(root, change)


def record_attempt(root: Path, assessment_id: str, score: float) -> TrainingState:
    """Keep a result. Passing it (the score reaches the pass mark) marks the lesson, module or course it checks complete."""
    def change(content: TrainingContent, index: Index, progress: TrainingProgress) -> None:
        _require(index, assessment_id, ("quiz", "test", "exam"), "quiz, test or exam")
        assessment = _assessment(content, assessment_id)
        mark = assessment.passMark if assessment else DEFAULT_PASS_MARK
        passed = score >= mark
        now = _now()
        attempts = progress.attempts.setdefault(assessment_id, [])
        attempts.append(Attempt(score=score, passed=passed, at=now))
        del attempts[:-MAX_ATTEMPTS]
        if passed:
            parent = index[assessment_id][1]
            if parent is not None:
                progress.completed.setdefault(parent, now)
    return _mutate(root, change)
