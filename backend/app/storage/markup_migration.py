"""The one-time move of Resources and Training into Scriblr's markup (markup_convert.py), run when a file whose raw `schemaVersion` is
below the markup's is read, before it is validated:

1. its text is converted: Markdown (guides, tutorials, lesson material) by markdown_to_markup, plain text (FAQ answers, descriptions) by
   plain_to_markup; the old form questions of Resources become text with their ids kept; where a lesson, module or course had several
   quizzes, tests or exams, the extra ones are merged into the first (their titles and descriptions become headings and text in its text);
2. a field that would go over its limit keeps its old text;
3. the result is checked against the new model; when it passes, the file is copied, untouched, to `<name>.before-markup.json` (or `-2`,
   `-3`... when that is taken) and the result written atomically. When it does not pass, the file is left as it was and the normal read
   decides what to do with it.

A second read finds the new version and converts nothing."""

import json
import shutil
from pathlib import Path
from typing import Any, Callable, Optional

from pydantic import BaseModel, ValidationError

from . import project_store
from .markup_convert import markdown_to_markup, merge_assessments, plain_to_markup, questions_to_markup

MARKUP_VERSION = 2

# Limits the converted text must keep to (the models' own).
RESOURCE_TEXT_MAX = 100_000
TRAINING_DESCRIPTION_MAX = 2000
TRAINING_BODY_MAX = 100_000


def _raw(path: Path) -> Optional[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def backup_path(path: Path) -> Path:
    """Where the copy goes: `<stem>.before-markup.json`, or a numbered name when that is taken."""
    candidate = path.with_name(f"{path.stem}.before-markup{path.suffix}")
    k = 2
    while candidate.exists():
        candidate = path.with_name(f"{path.stem}.before-markup-{k}{path.suffix}")
        k += 1
    return candidate


def _kept(old: Any, new: str, limit: int) -> Any:
    return new if len(new) <= limit else old


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _upgrade(root: Path, path: Path, convert: Callable[[dict], dict], model: type[BaseModel]) -> bool:
    """Convert the file at `path` once. True when it was converted and written."""
    data = _raw(path)
    if data is None:
        return False
    version = data.get("schemaVersion", 1)
    if not isinstance(version, int) or version >= MARKUP_VERSION:
        return False
    try:
        converted = model.model_validate(convert(data))
    except (ValidationError, ValueError, TypeError, AttributeError):
        return False
    shutil.copy2(path, backup_path(path))
    project_store._write_shard(root, path, converted)
    return True


# ---------------------------------------------------------------- Resources


def convert_resources(data: dict) -> dict:
    out = dict(data)
    content = data.get("content") if isinstance(data.get("content"), dict) else {}
    new_content: dict[str, Any] = {}
    for node_id, c in content.items():
        if not isinstance(c, dict):
            continue
        c = dict(c)
        c["guide"] = _kept(c.get("guide"), markdown_to_markup(_text(c.get("guide"))), RESOURCE_TEXT_MAX)
        tutorials = []
        for t in c.get("tutorials") or []:
            if isinstance(t, dict):
                t = dict(t)
                t["body"] = _kept(t.get("body"), markdown_to_markup(_text(t.get("body"))), RESOURCE_TEXT_MAX)
                tutorials.append(t)
        c["tutorials"] = tutorials
        faq = []
        for f in c.get("faq") or []:
            if isinstance(f, dict):
                f = dict(f)
                f["answer"] = _kept(f.get("answer"), plain_to_markup(_text(f.get("answer"))), RESOURCE_TEXT_MAX)
                faq.append(f)
        c["faq"] = faq
        new_content[node_id] = c
    out["content"] = new_content
    assessments = data.get("assessments") if isinstance(data.get("assessments"), dict) else {}
    new_assessments: dict[str, Any] = {}
    for node_id, a in assessments.items():
        if not isinstance(a, dict):
            continue
        text = a.get("text") if isinstance(a.get("text"), str) else questions_to_markup(a.get("questions") or [])
        new_assessments[node_id] = {"text": text[:RESOURCE_TEXT_MAX]}
    out["assessments"] = new_assessments
    out["schemaVersion"] = MARKUP_VERSION
    return out


def upgrade_resources(root: Path, path: Path, model: type[BaseModel]) -> bool:
    return _upgrade(root, path, convert_resources, model)


# ---------------------------------------------------------------- Training


def _described(item: Any) -> dict:
    item = dict(item) if isinstance(item, dict) else {}
    if "description" in item:
        item["description"] = _kept(item.get("description"), plain_to_markup(_text(item.get("description"))), TRAINING_DESCRIPTION_MAX)
    return item


def _one_assessment(items: Any) -> list[dict]:
    """The assessments of a lesson, module or course as one (the first), the others merged into its text."""
    found = [_described(a) for a in (items or []) if isinstance(a, dict)]
    if not found:
        return []
    first = found[0]
    first_text = _text(first.get("text"))
    if len(found) > 1:
        merged = merge_assessments(first_text, [(_text(a.get("title")), _text(a.get("description")), _text(a.get("text"))) for a in found[1:]])
        first_text = merged if len(merged) <= TRAINING_BODY_MAX else first_text
    first["text"] = first_text
    return [first]


def convert_training(data: dict) -> dict:
    out = dict(data)
    out["curricula"] = [_described(c) for c in data.get("curricula") or [] if isinstance(c, dict)]
    courses = []
    for course in data.get("courses") or []:
        if not isinstance(course, dict):
            continue
        course = _described(course)
        modules = []
        for module in course.get("modules") or []:
            if not isinstance(module, dict):
                continue
            module = _described(module)
            lessons = []
            for lesson in module.get("lessons") or []:
                if not isinstance(lesson, dict):
                    continue
                lesson = _described(lesson)
                lesson["body"] = _kept(lesson.get("body"), markdown_to_markup(_text(lesson.get("body"))), TRAINING_BODY_MAX)
                lesson["exercises"] = [_described(e) for e in lesson.get("exercises") or [] if isinstance(e, dict)]
                lesson["quizzes"] = _one_assessment(lesson.get("quizzes"))
                lessons.append(lesson)
            module["lessons"] = lessons
            module["tests"] = _one_assessment(module.get("tests"))
            modules.append(module)
        course["modules"] = modules
        course["projects"] = [_described(p) for p in course.get("projects") or [] if isinstance(p, dict)]
        course["exams"] = _one_assessment(course.get("exams"))
        courses.append(course)
    out["courses"] = courses
    out["schemaVersion"] = MARKUP_VERSION
    return out


def upgrade_training(root: Path, path: Path, model: type[BaseModel]) -> bool:
    return _upgrade(root, path, convert_training, model)
