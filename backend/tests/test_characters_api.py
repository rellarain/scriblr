import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage.schema import CHARACTER_MAX_MARKS, CharacterDoc, CharacterLook


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Cast Test"}).json()["projectId"]


def _new(client: TestClient, pid: str, **body) -> dict:
    resp = client.post(f"/api/projects/{pid}/characters", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---- the look is repaired, never refused ----

def test_a_bad_value_in_a_look_is_repaired_to_its_default_or_held_to_its_range() -> None:
    look = CharacterLook.model_validate({
        "skin": "red", "height": 9, "width": "wide", "eyeTilt": -90, "hair": "  ", "hairColor": "#12", "streakColor": "#aabbcc", "heldLeft": 5, "pose": " walking ",
    })
    assert look.skin == "#e0b08a" and look.height == 1.3 and look.width == 1.0 and look.eyeTilt == -20.0
    assert look.hair == "short" and look.hairColor == "#3b2a20" and look.streakColor == "#aabbcc" and look.heldLeft is None and look.pose == "walking"


def test_marks_keep_their_strokes_inside_the_area_and_drop_what_is_not_a_mark() -> None:
    look = CharacterLook.model_validate({"marks": [
        {"id": "a", "kind": "tattoo", "strokes": [[[0, 0], [2, 3], [0.5, 0.5]], [[0.1, 0.1]], "x"]},
        {"id": "a", "kind": "mole"}, {"id": "b", "kind": "not-a-kind"}, "nonsense", {"id": "c", "kind": "scar", "x": -4, "size": 99, "color": "blue"},
    ]})
    assert [m.id for m in look.marks] == ["a", "c"]
    assert look.marks[0].strokes == [[[0.0, 0.0], [1.0, 1.0], [0.5, 0.5]]]
    assert look.marks[1].x == 0.0 and look.marks[1].size == 3.0 and look.marks[1].color is None


def test_there_are_at_most_so_many_marks_and_accessories() -> None:
    look = CharacterLook.model_validate({"marks": [{"id": f"m{i}", "kind": "freckles"} for i in range(60)], "outfit": {"accessories": [f"a{i}" for i in range(20)] + ["a1"]}})
    assert len(look.marks) == CHARACTER_MAX_MARKS and len(look.outfit.accessories) == 8


def test_an_outfit_keeps_only_real_colours_and_a_blank_name_is_put_back() -> None:
    doc = CharacterDoc.model_validate({"id": "c1", "name": "   ", "look": {"outfit": {"colors": {"top": "#112233", "bottom": "nope", "": "#000000"}, "top": ""}}})
    assert doc.name == "Unnamed character" and doc.look.outfit.colors == {"top": "#112233"} and doc.look.outfit.top is None


# ---- the endpoints ----

def test_a_new_character_has_the_default_look_and_goes_last(client: TestClient) -> None:
    pid = _project(client)
    assert client.get(f"/api/projects/{pid}/characters").json() == []
    a = _new(client, pid, name="Ada")
    b = _new(client, pid, name="Bram")
    assert a["order"] == 0 and b["order"] == 1 and a["look"]["hair"] == "short" and a["look"]["outfit"]["top"] == "tee"
    rows = client.get(f"/api/projects/{pid}/characters").json()
    assert [r["name"] for r in rows] == ["Ada", "Bram"] and "look" not in rows[0]


def test_a_character_can_start_from_a_look(client: TestClient) -> None:
    pid = _project(client)
    made = _new(client, pid, name="Copy", look={"hair": "braid", "skin": "#8d5524"})
    assert made["look"]["hair"] == "braid" and made["look"]["skin"] == "#8d5524"


def test_put_replaces_the_character_and_checks_the_id(client: TestClient) -> None:
    pid = _project(client)
    c = _new(client, pid, name="Ada")
    c["name"] = "Ada Lovelace"
    c["look"]["eyes"] = "almond"
    c["look"]["marks"] = [{"id": "m1", "kind": "mole", "design": "round", "area": "cheeks", "x": 0.3, "y": 0.6, "size": 1, "color": None, "strokes": []}]
    saved = client.put(f"/api/projects/{pid}/characters/{c['id']}", json=c)
    assert saved.status_code == 200 and saved.json()["name"] == "Ada Lovelace"
    got = client.get(f"/api/projects/{pid}/characters/{c['id']}").json()
    assert got["look"]["eyes"] == "almond" and got["look"]["marks"][0]["x"] == 0.3
    assert client.put(f"/api/projects/{pid}/characters/other", json=c).status_code == 422
    c["id"] = "chr_none"
    assert client.put(f"/api/projects/{pid}/characters/chr_none", json=c).status_code == 404


def test_delete_removes_one_and_a_missing_one_is_404(client: TestClient) -> None:
    pid = _project(client)
    a, b = _new(client, pid, name="A"), _new(client, pid, name="B")
    assert client.delete(f"/api/projects/{pid}/characters/{a['id']}").status_code == 204
    assert [r["name"] for r in client.get(f"/api/projects/{pid}/characters").json()] == ["B"]
    assert client.delete(f"/api/projects/{pid}/characters/{a['id']}").status_code == 404
    assert client.get(f"/api/projects/{pid}/characters/{b['id']}").status_code == 200


def test_the_cast_is_capped(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.api.characters.CHARACTER_MAX_PER_PROJECT", 2)
    pid = _project(client)
    _new(client, pid)
    _new(client, pid)
    assert client.post(f"/api/projects/{pid}/characters", json={}).status_code == 422


# ---- the file ----

def test_a_character_that_cannot_be_read_is_set_aside_and_the_others_still_load(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    good = _new(client, pid, name="Good")
    bad = _new(client, pid, name="Bad")
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["characters"][bad["id"]]["order"] = "first"
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert [r["name"] for r in client.get(f"/api/projects/{pid}/characters").json()] == ["Good"]
    assert client.get(f"/api/projects/{pid}/characters/{good['id']}").status_code == 200
    resp = client.get(f"/api/projects/{pid}/characters/{bad['id']}")
    assert resp.status_code == 409 and "quarantined" in resp.json()["detail"]
    assert list((storage_root / pid / "quarantine").glob(f"characters.{bad['id']}.corrupt-*.json"))


def test_a_project_saved_before_characters_loads_with_none(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("characters", None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert client.get(f"/api/projects/{pid}/characters").json() == []
