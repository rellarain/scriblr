"""Training's data: the courses (authored, global to the app, in training.json) and one learner's state (enrolment, completion marks and
assessment results, in training-progress.json). The two are separate documents, so saving the courses can never wipe what the learner did.

A curriculum is a collection of courses (a course may be in several curricula, or none). A course has modules, projects and exams; a module has
lessons and tests; a lesson has exercises and quizzes; a lesson's material is Markdown. A project is a system of exercises of its course. A quiz, a
test and an exam are the same thing (an assessment with a pass mark) in a lesson, a module and a course: passing one marks that lesson, module or
course complete. List order is the display order. Ids are chosen by whoever writes the courses and are unique across the whole document."""

from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, Field, StringConstraints, model_validator

from .schema import utcnow

TRAINING_SCHEMA_VERSION = 1

ID_PATTERN = r"^[A-Za-z0-9_-]{1,80}$"
Id = Annotated[str, StringConstraints(pattern=ID_PATTERN)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(max_length=2000)]
Hue = Annotated[int, Field(ge=0, le=360)]

MAX_CURRICULA = 50
MAX_COURSES = 500
MAX_MODULES = 100
MAX_LESSONS = 200
MAX_EXERCISES = 100
MAX_PROJECTS = 50
MAX_ASSESSMENTS = 50
MAX_BODY = 100_000
MAX_ATTEMPTS = 20
DEFAULT_PASS_MARK = 70


class Assessment(BaseModel):
    """A quiz (in a lesson), a test (in a module) or an exam (in a course). No questions yet: a result is a score the learner got."""

    id: Id
    title: Title
    description: Description = ""
    passMark: int = Field(default=DEFAULT_PASS_MARK, ge=0, le=100)


class Exercise(BaseModel):
    id: Id
    title: Title
    description: Description = ""


class Lesson(BaseModel):
    id: Id
    title: Title
    description: Description = ""
    # The lesson's material, Markdown.
    body: str = Field(default="", max_length=MAX_BODY)
    exercises: list[Exercise] = Field(default_factory=list, max_length=MAX_EXERCISES)
    quizzes: list[Assessment] = Field(default_factory=list, max_length=MAX_ASSESSMENTS)


class Module(BaseModel):
    id: Id
    title: Title
    description: Description = ""
    lessons: list[Lesson] = Field(default_factory=list, max_length=MAX_LESSONS)
    tests: list[Assessment] = Field(default_factory=list, max_length=MAX_ASSESSMENTS)


class Project(BaseModel):
    """A system of exercises of its course that produces a working product when done."""

    id: Id
    title: Title
    description: Description = ""
    exerciseIds: list[Id] = Field(default_factory=list, max_length=MAX_EXERCISES)


class Course(BaseModel):
    id: Id
    title: Title
    description: Description = ""
    # Its own colour (a hue); none = its first curriculum's.
    hue: Optional[Hue] = None
    modules: list[Module] = Field(default_factory=list, max_length=MAX_MODULES)
    projects: list[Project] = Field(default_factory=list, max_length=MAX_PROJECTS)
    exams: list[Assessment] = Field(default_factory=list, max_length=MAX_ASSESSMENTS)


class Curriculum(BaseModel):
    """A collection of courses, in order."""

    id: Id
    title: Title
    description: Description = ""
    hue: Optional[Hue] = None
    courseIds: list[Id] = Field(default_factory=list, max_length=MAX_COURSES)


def _ids_of(course: Course) -> list[str]:
    ids = [course.id]
    for module in course.modules:
        ids.append(module.id)
        ids.extend(t.id for t in module.tests)
        for lesson in module.lessons:
            ids.append(lesson.id)
            ids.extend(e.id for e in lesson.exercises)
            ids.extend(q.id for q in lesson.quizzes)
    ids.extend(p.id for p in course.projects)
    ids.extend(x.id for x in course.exams)
    return ids


class TrainingContentDraft(BaseModel):
    """What a save sends: the curricula and the courses (the schema version is the server's)."""

    curricula: list[Curriculum] = Field(default_factory=list, max_length=MAX_CURRICULA)
    courses: list[Course] = Field(default_factory=list, max_length=MAX_COURSES)

    @model_validator(mode="after")
    def _consistent(self) -> "TrainingContentDraft":
        seen: set[str] = set()
        ids = [c.id for c in self.curricula]
        for course in self.courses:
            ids.extend(_ids_of(course))
        for item in ids:
            if item in seen:
                raise ValueError(f"id {item!r} is used twice: ids are unique across the whole of the courses")
            seen.add(item)
        course_ids = {c.id for c in self.courses}
        for curriculum in self.curricula:
            if len(set(curriculum.courseIds)) != len(curriculum.courseIds):
                raise ValueError(f"curriculum {curriculum.id!r} lists a course twice")
            for course_id in curriculum.courseIds:
                if course_id not in course_ids:
                    raise ValueError(f"curriculum {curriculum.id!r} names {course_id!r}, which is not a course")
        for course in self.courses:
            exercise_ids = {e.id for m in course.modules for lesson in m.lessons for e in lesson.exercises}
            for project in course.projects:
                if len(set(project.exerciseIds)) != len(project.exerciseIds):
                    raise ValueError(f"project {project.id!r} lists an exercise twice")
                for exercise_id in project.exerciseIds:
                    if exercise_id not in exercise_ids:
                        raise ValueError(f"project {project.id!r} names {exercise_id!r}, which is not an exercise of its course")
        return self


class TrainingContent(TrainingContentDraft):
    schemaVersion: int = TRAINING_SCHEMA_VERSION


class Attempt(BaseModel):
    score: float = Field(ge=0, le=100)
    passed: bool
    at: datetime = Field(default_factory=utcnow)


class TrainingProgress(BaseModel):
    """One learner's state. Ids that are no longer in the courses are dropped when the courses are saved."""

    schemaVersion: int = TRAINING_SCHEMA_VERSION
    # Course id -> when enrolled.
    enrolled: dict[str, datetime] = Field(default_factory=dict)
    # Course, module, lesson, exercise or project id -> when marked complete.
    completed: dict[str, datetime] = Field(default_factory=dict)
    # Assessment id -> its attempts, oldest first (the latest MAX_ATTEMPTS).
    attempts: dict[str, list[Attempt]] = Field(default_factory=dict)


class TrainingState(BaseModel):
    content: TrainingContent
    progress: TrainingProgress


class AttemptIn(BaseModel):
    score: float = Field(ge=0, le=100)
