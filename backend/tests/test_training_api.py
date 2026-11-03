import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deps import get_app_data_storage_root, get_storage_root
from app.main import create_app
from app.storage import training_store


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch):
    now = [datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc)]
    monkeypatch.setattr(training_store, "_now", lambda: now[0])
    return now


def _content(client: TestClient) -> dict:
    return client.get("/api/training").json()["content"]


def _draft(content: dict) -> dict:
    return {"curricula": content["curricula"], "courses": content["courses"]}


# ---------------------------------------------------------------- the courses


def test_the_first_load_seeds_five_curricula_each_with_a_course(client: TestClient, app_data_root: Path) -> None:
    body = client.get("/api/training").json()
    content = body["content"]
    assert content["schemaVersion"] == 1
    assert [c["id"] for c in content["curricula"]] == ["user", "reader", "translator", "writer", "admin"]
    assert [c["title"] for c in content["curricula"]] == ["User Training", "Reader Training", "Translator Training", "Writer Training", "Admin Training"]
    assert [c["hue"] for c in content["curricula"]] == [200, 280, 160, 30, 340]
    writer = next(c for c in content["courses"] if c["id"] == "writer-c1")
    assert [m["id"] for m in writer["modules"]] == ["writer-c1-m1"]
    lesson = writer["modules"][0]["lessons"][0]
    assert lesson["id"] == "writer-c1-m1-l1" and lesson["body"].startswith("# Lesson 1")
    assert [e["id"] for e in lesson["exercises"]] == ["writer-c1-m1-l1-e1"]
    assert [q["id"] for q in lesson["quizzes"]] == ["writer-c1-m1-l1-q1"]
    assert [t["id"] for t in writer["modules"][0]["tests"]] == ["writer-c1-m1-t1"]
    assert [x["id"] for x in writer["exams"]] == ["writer-c1-x1"]
    assert writer["projects"][0]["exerciseIds"] == ["writer-c1-m1-l1-e1"]
    assert all(a["passMark"] == 70 for a in lesson["quizzes"] + writer["exams"])
    assert body["progress"] == {"schemaVersion": 1, "enrolled": {}, "completed": {}, "attempts": {}}
    assert (app_data_root / "training.json").exists()


def test_the_seed_is_stable_across_calls_and_processes(client: TestClient, app_data_root: Path, storage_root: Path) -> None:
    first = client.get("/api/training").json()
    assert client.get("/api/training").json() == first
    other = create_app()
    other.dependency_overrides[get_storage_root] = lambda: storage_root
    other.dependency_overrides[get_app_data_storage_root] = lambda: app_data_root
    assert TestClient(other).get("/api/training").json() == first


def test_saving_the_courses_round_trips_and_is_kept(client: TestClient, app_data_root: Path, storage_root: Path) -> None:
    content = _content(client)
    content["curricula"].append({"id": "craft", "title": "Craft", "description": "How to write.", "hue": 90, "courseIds": ["plot-101", "writer-c1"]})
    content["courses"].append({
        "id": "plot-101", "title": "Plotting 101", "description": "", "hue": None,
        "modules": [{"id": "plot-101-m1", "title": "Structure", "description": "", "tests": [], "lessons": [
            {"id": "plot-101-m1-l1", "title": "Acts", "description": "", "body": "Three acts.", "quizzes": [],
             "exercises": [{"id": "plot-101-m1-l1-e1", "title": "Beats", "description": ""}]},
        ]}],
        "projects": [{"id": "plot-101-p1", "title": "A plot", "description": "", "exerciseIds": ["plot-101-m1-l1-e1"]}],
        "exams": [],
    })
    saved = client.put("/api/training/content", json=_draft(content))
    assert saved.status_code == 200
    assert saved.json()["content"]["schemaVersion"] == 1
    assert [c["id"] for c in saved.json()["content"]["curricula"]][-1] == "craft"
    assert (app_data_root / "training.json").exists()
    again = create_app()
    again.dependency_overrides[get_storage_root] = lambda: storage_root
    again.dependency_overrides[get_app_data_storage_root] = lambda: app_data_root
    assert TestClient(again).get("/api/training").json()["content"] == saved.json()["content"]


def test_a_client_cannot_set_the_schema_version(client: TestClient, app_data_root: Path) -> None:
    client.put("/api/training/content", json={**_draft(_content(client)), "schemaVersion": 99})
    assert json.loads((app_data_root / "training.json").read_text(encoding="utf-8"))["schemaVersion"] == 1


def _bad(client: TestClient, change) -> str:
    content = _content(client)
    change(content)
    resp = client.put("/api/training/content", json=_draft(content))
    assert resp.status_code == 422
    return json.dumps(resp.json())


def test_ids_are_unique_across_the_whole_document(client: TestClient) -> None:
    def clash(c: dict) -> None:
        c["courses"][0]["modules"][0]["lessons"][0]["id"] = c["courses"][1]["id"]
    assert "used twice" in _bad(client, clash)

    def curriculum_clash(c: dict) -> None:
        c["curricula"][0]["id"] = "writer-c1"
    assert "used twice" in _bad(client, curriculum_clash)


def test_a_curriculum_can_only_name_courses_that_exist_once(client: TestClient) -> None:
    assert "not a course" in _bad(client, lambda c: c["curricula"][0]["courseIds"].append("nope"))
    assert "twice" in _bad(client, lambda c: c["curricula"][0]["courseIds"].append(c["curricula"][0]["courseIds"][0]))


def test_a_project_can_only_name_exercises_of_its_own_course(client: TestClient) -> None:
    def foreign(c: dict) -> None:
        c["courses"][0]["projects"][0]["exerciseIds"] = [c["courses"][1]["modules"][0]["lessons"][0]["exercises"][0]["id"]]
    assert "not an exercise of its course" in _bad(client, foreign)


@pytest.mark.parametrize("change", [
    lambda c: c["courses"][0]["exams"][0].update(passMark=101),
    lambda c: c["courses"][0]["exams"][0].update(passMark=-1),
    lambda c: c["courses"][0].update(hue=361),
    lambda c: c["courses"][0].update(title="   "),
    lambda c: c["courses"][0].update(title="x" * 201),
    lambda c: c["courses"][0].update(id="has space"),
    lambda c: c["courses"][0]["modules"][0]["lessons"][0].update(body="x" * 100_001),
    lambda c: c["courses"][0]["modules"][0].update(lessons=[{"id": f"l{i}", "title": "L"} for i in range(201)]),
], ids=["pass-mark-high", "pass-mark-low", "hue", "blank-title", "long-title", "bad-id", "long-body", "too-many-lessons"])
def test_limits_are_enforced(client: TestClient, change) -> None:
    content = _content(client)
    change(content)
    assert client.put("/api/training/content", json=_draft(content)).status_code == 422


def test_a_corrupt_courses_file_is_quarantined_then_reseeded(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/training")
    (app_data_root / "training.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/training").status_code == 409
    assert client.get("/api/training").status_code == 200
    assert list(app_data_root.glob("training.corrupt-*.json"))


def test_a_file_from_a_newer_version_is_refused_not_overwritten(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/training")
    path = app_data_root / "training.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["schemaVersion"] = 2
    path.write_text(json.dumps(data), encoding="utf-8")
    assert client.get("/api/training").status_code == 409
    assert client.put("/api/training/content", json=_draft(data)).status_code == 409
    assert json.loads(path.read_text(encoding="utf-8"))["schemaVersion"] == 2


# ---------------------------------------------------------------- the learner


def test_enrolling_and_leaving_are_idempotent_and_keep_the_first_date(client: TestClient, clock) -> None:
    first = client.put("/api/training/enrolments/writer-c1").json()["progress"]
    assert list(first["enrolled"]) == ["writer-c1"]
    clock[0] += timedelta(days=1)
    again = client.put("/api/training/enrolments/writer-c1").json()["progress"]
    assert again["enrolled"] == first["enrolled"]
    client.put("/api/training/enrolments/reader-c1")
    left = client.delete("/api/training/enrolments/writer-c1").json()["progress"]
    assert list(left["enrolled"]) == ["reader-c1"]
    assert client.delete("/api/training/enrolments/writer-c1").status_code == 200


def test_enrolment_is_for_a_course_only(client: TestClient) -> None:
    assert client.put("/api/training/enrolments/nope").status_code == 404
    assert client.put("/api/training/enrolments/writer-c1-m1").status_code == 422
    assert client.delete("/api/training/enrolments/nope").status_code == 404


@pytest.mark.parametrize("item", ["writer-c1", "writer-c1-m1", "writer-c1-m1-l1", "writer-c1-m1-l1-e1", "writer-c1-p1"])
def test_a_course_module_lesson_exercise_or_project_can_be_marked_complete_and_unmarked(client: TestClient, item: str) -> None:
    done = client.put(f"/api/training/completions/{item}").json()["progress"]
    assert list(done["completed"]) == [item]
    assert list(client.put(f"/api/training/completions/{item}").json()["progress"]["completed"]) == [item]
    assert client.delete(f"/api/training/completions/{item}").json()["progress"]["completed"] == {}


def test_completion_refuses_assessments_curricula_and_unknown_ids(client: TestClient) -> None:
    for assessment in ("writer-c1-m1-l1-q1", "writer-c1-m1-t1", "writer-c1-x1", "writer"):
        assert client.put(f"/api/training/completions/{assessment}").status_code == 422
    assert client.put("/api/training/completions/nope").status_code == 404
    assert client.delete("/api/training/completions/nope").status_code == 404


def test_a_pass_marks_the_parent_complete_and_a_fail_does_not(client: TestClient, clock) -> None:
    failed = client.post("/api/training/attempts/writer-c1-m1-l1-q1", json={"score": 69.9}).json()["progress"]
    assert failed["attempts"]["writer-c1-m1-l1-q1"][0]["passed"] is False
    assert failed["completed"] == {}
    passed = client.post("/api/training/attempts/writer-c1-m1-l1-q1", json={"score": 70}).json()["progress"]
    assert [a["passed"] for a in passed["attempts"]["writer-c1-m1-l1-q1"]] == [False, True]
    assert list(passed["completed"]) == ["writer-c1-m1-l1"]
    test = client.post("/api/training/attempts/writer-c1-m1-t1", json={"score": 100}).json()["progress"]
    exam = client.post("/api/training/attempts/writer-c1-x1", json={"score": 95}).json()["progress"]
    assert set(exam["completed"]) == {"writer-c1-m1-l1", "writer-c1-m1", "writer-c1"}
    assert set(test["completed"]) == {"writer-c1-m1-l1", "writer-c1-m1"}


def test_a_pass_keeps_the_date_of_an_earlier_completion(client: TestClient, clock) -> None:
    client.put("/api/training/completions/writer-c1-m1-l1")
    before = client.get("/api/training").json()["progress"]["completed"]["writer-c1-m1-l1"]
    clock[0] += timedelta(days=3)
    client.post("/api/training/attempts/writer-c1-m1-l1-q1", json={"score": 100})
    assert client.get("/api/training").json()["progress"]["completed"]["writer-c1-m1-l1"] == before


def test_attempts_are_for_assessments_and_scores_are_0_to_100(client: TestClient) -> None:
    assert client.post("/api/training/attempts/nope", json={"score": 50}).status_code == 404
    assert client.post("/api/training/attempts/writer-c1", json={"score": 50}).status_code == 422
    assert client.post("/api/training/attempts/writer-c1-x1", json={"score": 101}).status_code == 422
    assert client.post("/api/training/attempts/writer-c1-x1", json={"score": -1}).status_code == 422
    assert client.post("/api/training/attempts/writer-c1-x1", json={}).status_code == 422


def test_only_the_latest_twenty_attempts_are_kept(client: TestClient) -> None:
    for score in range(25):
        resp = client.post("/api/training/attempts/writer-c1-x1", json={"score": score})
    attempts = resp.json()["progress"]["attempts"]["writer-c1-x1"]
    assert [a["score"] for a in attempts] == list(range(5, 25))


def test_a_pass_mark_set_by_the_courses_decides_a_pass(client: TestClient) -> None:
    content = _content(client)
    content["courses"][0]["exams"][0]["passMark"] = 40
    client.put("/api/training/content", json=_draft(content))
    assert client.post("/api/training/attempts/user-c1-x1", json={"score": 40}).json()["progress"]["attempts"]["user-c1-x1"][0]["passed"] is True


def test_saving_the_courses_keeps_progress_and_drops_what_is_gone(client: TestClient) -> None:
    client.put("/api/training/enrolments/writer-c1")
    client.put("/api/training/enrolments/reader-c1")
    client.put("/api/training/completions/writer-c1-m1-l1")
    client.put("/api/training/completions/reader-c1-m1-l1")
    client.post("/api/training/attempts/writer-c1-x1", json={"score": 10})
    client.post("/api/training/attempts/reader-c1-x1", json={"score": 10})
    content = _content(client)
    content["courses"] = [c for c in content["courses"] if c["id"] != "reader-c1"]
    for curriculum in content["curricula"]:
        curriculum["courseIds"] = [i for i in curriculum["courseIds"] if i != "reader-c1"]
    saved = client.put("/api/training/content", json=_draft(content)).json()["progress"]
    assert list(saved["enrolled"]) == ["writer-c1"]
    assert "reader-c1-m1-l1" not in saved["completed"] and "writer-c1-m1-l1" in saved["completed"]
    assert list(saved["attempts"]) == ["writer-c1-x1"]
    assert client.get("/api/training").json()["progress"] == saved


def test_progress_survives_a_courses_save_that_changes_nothing(client: TestClient) -> None:
    client.put("/api/training/enrolments/admin-c1")
    before = client.get("/api/training").json()["progress"]
    client.put("/api/training/content", json=_draft(_content(client)))
    assert client.get("/api/training").json()["progress"] == before


def test_a_corrupt_progress_file_is_quarantined_then_starts_empty(client: TestClient, app_data_root: Path) -> None:
    client.put("/api/training/enrolments/writer-c1")
    (app_data_root / "training-progress.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/training").status_code == 409
    assert client.get("/api/training").json()["progress"]["enrolled"] == {}
    assert list(app_data_root.glob("training-progress.corrupt-*.json"))
