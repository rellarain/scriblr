"""The one-time move of Resources and Training into the markup (storage/markup_migration.py): an old file is converted when it is
read, a copy of it is kept, a second read converts nothing, the old form questions become text, and extra quizzes are merged."""

import json
from pathlib import Path

from fastapi.testclient import TestClient


def _old_resources() -> dict:
    return {
        "schemaVersion": 1,
        "nodes": [
            {"id": "writer", "kind": "interface", "parentId": None, "order": 0, "name": "Writer"},
            {"id": "writer/draft", "kind": "console", "parentId": "writer", "order": 0, "name": "Draft"},
        ],
        "content": {"writer/draft": {
            "guide": "# Drafting\n\n- Write\n- Save\n\nSee [help](https://x.y).",
            "tutorials": [{"id": "t1", "title": "Start", "body": "1. Open\n2. Type"}],
            "faq": [{"id": "f1", "question": "Why?", "answer": "Because 2 * 2 = 4.", "source": "authored", "sourceMessageId": None}],
        }},
        "assessments": {"writer/draft": {"questions": [
            {"id": "q1", "prompt": "Pick", "options": [{"id": "o1", "text": "Yes", "isCorrect": True}, {"id": "o2", "text": "No", "isCorrect": False}]},
        ]}},
        "screensVersion": 99,
    }


def test_an_old_resources_file_is_converted_once_with_a_copy_kept(client: TestClient, app_data_root: Path) -> None:
    path = app_data_root / "resources.json"
    path.write_text(json.dumps(_old_resources()), encoding="utf-8")
    body = client.get("/api/resources").json()
    assert body["schemaVersion"] == 2
    content = body["content"]["writer/draft"]
    assert content["guide"] == "###### Drafting\n\n> Write\n> Save\n\nSee help (https://x.y)."
    assert content["tutorials"][0]["body"] == ">> Open\n>> Type"
    assert content["faq"][0]["answer"] == "Because 2 \\* 2 = 4."
    assert body["assessments"]["writer/draft"] == {"text": "????#q1 Pick\n?! Yes\n?? No"}
    backup = app_data_root / "resources.before-markup.json"
    assert json.loads(backup.read_text(encoding="utf-8")) == _old_resources()
    # a second read converts nothing and makes no second copy
    again = client.get("/api/resources").json()
    assert again["content"] == body["content"]
    assert not (app_data_root / "resources.before-markup-2.json").exists()


def test_a_copy_already_there_is_not_overwritten(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "resources.before-markup.json").write_text("{}", encoding="utf-8")
    (app_data_root / "resources.json").write_text(json.dumps(_old_resources()), encoding="utf-8")
    client.get("/api/resources")
    assert (app_data_root / "resources.before-markup.json").read_text(encoding="utf-8") == "{}"
    assert json.loads((app_data_root / "resources.before-markup-2.json").read_text(encoding="utf-8"))["schemaVersion"] == 1


def _quiz(qid: str, title: str, description: str = "") -> dict:
    return {"id": qid, "title": title, "description": description, "passMark": 70}


def _old_training() -> dict:
    return {
        "schemaVersion": 1,
        "curricula": [{"id": "w", "title": "Writer", "description": "Learn *this*", "hue": 30, "courseIds": ["c1"]}],
        "courses": [{
            "id": "c1", "title": "Course", "description": "# not a heading", "hue": None,
            "modules": [{
                "id": "m1", "title": "Module", "description": "", "tests": [_quiz("t1", "Test 1"), _quiz("t2", "Test 2", "Harder")],
                "lessons": [{
                    "id": "l1", "title": "Lesson", "description": "", "body": "# Lesson\n\n> a quote",
                    "exercises": [{"id": "e1", "title": "Ex", "description": "Do ? this"}],
                    "quizzes": [_quiz("q1", "Quiz 1"), _quiz("q2", "Quiz 2"), _quiz("q3", "Quiz 3", "Last")],
                }],
            }],
            "projects": [],
            "exams": [_quiz("x1", "Exam")],
        }],
    }


def test_an_old_training_file_is_converted_and_extra_quizzes_are_merged(client: TestClient, app_data_root: Path) -> None:
    path = app_data_root / "training.json"
    path.write_text(json.dumps(_old_training()), encoding="utf-8")
    content = client.get("/api/training").json()["content"]
    assert content["schemaVersion"] == 2
    assert content["curricula"][0]["description"] == "Learn \\*this\\*"
    course = content["courses"][0]
    assert course["description"] == "\\# not a heading"
    lesson = course["modules"][0]["lessons"][0]
    assert lesson["body"] == "###### Lesson\n\n\" a quote"
    assert lesson["exercises"][0]["description"] == "Do ? this"
    assert [q["id"] for q in lesson["quizzes"]] == ["q1"]
    assert lesson["quizzes"][0]["text"] == "##### Quiz 2\n\n##### Quiz 3\n\nLast"
    tests = course["modules"][0]["tests"]
    assert [t["id"] for t in tests] == ["t1"] and tests[0]["text"] == "##### Test 2\n\nHarder"
    assert course["exams"][0]["text"] == ""
    assert json.loads((app_data_root / "training.before-markup.json").read_text(encoding="utf-8")) == _old_training()
    # saved again as it is, nothing changes
    assert client.put("/api/training/content", json={"curricula": content["curricula"], "courses": content["courses"]}).status_code == 200
    assert client.get("/api/training").json()["content"]["courses"] == content["courses"]


def test_a_field_that_would_go_over_its_limit_keeps_its_old_text(client: TestClient, app_data_root: Path) -> None:
    data = _old_training()
    long = "*" * 1500  # 1500 characters; escaped it would be 3000, over the 2000 a description may have
    data["courses"][0]["description"] = long
    (app_data_root / "training.json").write_text(json.dumps(data), encoding="utf-8")
    assert client.get("/api/training").json()["content"]["courses"][0]["description"] == long


def test_a_new_install_writes_the_markup_seed(client: TestClient, app_data_root: Path) -> None:
    content = client.get("/api/training").json()["content"]
    lesson = content["courses"][0]["modules"][0]["lessons"][0]
    assert lesson["body"].startswith("#### Lesson 1")
    assert all(len(m["tests"]) <= 1 for c in content["courses"] for m in c["modules"])
    assert not (app_data_root / "training.before-markup.json").exists()
