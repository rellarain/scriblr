import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage.schema import CHARACTER_MAX_MARKS, PORTRAIT_RANGES, CharacterDoc, CharacterLook, CharacterPortrait, CharacterState


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


# ---- the portrait is repaired, never refused ----

def test_a_bad_value_in_a_portrait_is_repaired_to_its_default_or_held_to_its_range() -> None:
    p = CharacterPortrait.model_validate({
        "age": "  ", "skin": "red", "eyeTilt": -90, "headWidth": "wide", "eyeSize": 9, "browColor": "#aabbcc", "lipColor": "nope", "highlightColor": 5,
        "hairTexture": " 4C ", "hairStyle": 7, "version": True, "tileColor": "#12", "facialHairColor": "#112233",
    })
    assert p.age == "adult" and p.skin == "#d9a07a" and p.eyeTilt == PORTRAIT_RANGES["eyeTilt"][0] and p.headWidth == 1.0 and p.eyeSize == PORTRAIT_RANGES["eyeSize"][1]
    assert p.browColor == "#aabbcc" and p.lipColor is None and p.highlightColor is None and p.facialHairColor == "#112233"
    assert p.hairTexture == "4C" and p.hairStyle == "plain" and p.version == 1 and p.tileColor == "#e6d6c3"


def test_an_id_this_build_does_not_know_is_kept_so_a_newer_portrait_survives() -> None:
    assert CharacterPortrait.model_validate({"hairStyle": "from-the-future", "age": "ancient"}).hairStyle == "from-the-future"


def test_the_width_of_the_shoulders_and_of_the_neck_are_sliders_held_to_their_range_and_old_portraits_get_the_usual() -> None:
    assert CharacterPortrait().shoulderWidth == 1.0 and CharacterPortrait().neckWidth == 1.0
    old = CharacterPortrait.model_validate({"build": "broad"})
    assert old.shoulderWidth == 1.0 and old.neckWidth == 1.0 and old.build == "broad"
    wide = CharacterPortrait.model_validate({"shoulderWidth": 9, "neckWidth": -4})
    assert wide.shoulderWidth == PORTRAIT_RANGES["shoulderWidth"][1] and wide.neckWidth == PORTRAIT_RANGES["neckWidth"][0]
    assert CharacterPortrait.model_validate({"shoulderWidth": "wide", "neckWidth": None}).neckWidth == 1.0
    assert CharacterPortrait.model_validate({"shoulderWidth": 1.1}).shoulderWidth == 1.1


def test_the_ends_and_the_placement_of_the_hair_are_ids_with_defaults_and_old_portraits_get_them() -> None:
    plain = CharacterPortrait()
    assert plain.hairEnds == "straight" and plain.hairPlacement == "front"
    # a portrait saved before these existed has neither: it opens with the defaults, and keeps what else it had
    old = CharacterPortrait.model_validate({"hairLength": "hip", "hairStyle": "halfup"})
    assert old.hairEnds == "straight" and old.hairPlacement == "front" and old.hairLength == "hip"
    made = CharacterPortrait.model_validate({"hairEnds": " out ", "hairPlacement": "allleft"})
    assert made.hairEnds == "out" and made.hairPlacement == "allleft"
    # a bad value is the default, an id this build does not know is kept
    assert CharacterPortrait.model_validate({"hairEnds": 4, "hairPlacement": "  "}).hairPlacement == "front"
    assert CharacterPortrait.model_validate({"hairEnds": 4}).hairEnds == "straight"
    assert CharacterPortrait.model_validate({"hairPlacement": "over-the-moon"}).hairPlacement == "over-the-moon"


def test_a_character_without_a_portrait_or_with_a_broken_one_has_the_default() -> None:
    assert CharacterDoc.model_validate({"id": "c1"}).portrait == CharacterPortrait()
    assert CharacterDoc.model_validate({"id": "c1", "portrait": "nonsense"}).portrait == CharacterPortrait()
    assert CharacterDoc.model_validate({"id": "c1", "portrait": {"hairLength": "chest"}}).portrait.hairLength == "chest"


def test_a_state_keeps_a_portrait_it_captured_and_ignores_a_broken_one_and_the_old_snapshot_stays() -> None:
    kept = CharacterState.model_validate({"id": "s1", "portrait": {"age": "elderly"}, "snapshot": {"hair": "bun"}})
    assert kept.portrait is not None and kept.portrait.age == "elderly" and kept.snapshot is not None and kept.snapshot.hair == "bun"
    assert CharacterState.model_validate({"id": "s1", "portrait": 4}).portrait is None
    assert CharacterState.model_validate({"id": "s1"}).portrait is None


def test_the_ranges_are_the_front_ends(client: TestClient) -> None:
    # the front end's portrait/defaults.ts holds the same list (a portrait/defaults test reads this file too)
    assert set(PORTRAIT_RANGES) == {"headWidth", "eyeSize", "eyeSpacing", "eyeTilt", "noseSize", "noseWidth", "mouthSize", "shoulderWidth", "neckWidth"}


# ---- the endpoints ----

def test_a_new_character_has_the_default_look_and_goes_last(client: TestClient) -> None:
    pid = _project(client)
    assert client.get(f"/api/projects/{pid}/characters").json() == []
    a = _new(client, pid, name="Ada")
    b = _new(client, pid, name="Bram")
    assert a["order"] == 0 and b["order"] == 1 and a["look"]["hair"] == "short" and a["look"]["outfit"]["top"] == "tee"
    rows = client.get(f"/api/projects/{pid}/characters").json()
    assert [r["name"] for r in rows] == ["Ada", "Bram"] and "look" not in rows[0]


def test_a_new_character_has_the_default_portrait_and_can_start_from_one(client: TestClient) -> None:
    pid = _project(client)
    plain = _new(client, pid, name="Plain")
    assert plain["portrait"] == CharacterPortrait().model_dump(mode="json")
    made = _new(client, pid, name="Copy", portrait={"hairStyle": "boxbraids", "hairLength": "hip", "skin": "#8d5524"})
    assert made["portrait"]["hairStyle"] == "boxbraids" and made["portrait"]["skin"] == "#8d5524" and made["portrait"]["eyes"] == "almond"
    # a portrait that is not one is the default, not a refusal
    assert _new(client, pid, portrait="x")["portrait"]["age"] == "adult"


def test_a_portrait_and_a_captured_one_are_saved_with_the_character_and_the_old_look_is_kept(client: TestClient) -> None:
    pid = _project(client)
    c = _new(client, pid, name="Ada", look={"hair": "braid"})
    c["portrait"]["hairTexture"] = "3B"
    c["portrait"]["highlightColor"] = "#c9a063"
    c["portrait"]["hairEnds"] = "in"
    c["portrait"]["hairPlacement"] = "right"
    c["states"] = [{"id": "s1", "at": "", "portrait": {**c["portrait"], "age": "older"}}]
    assert client.put(f"/api/projects/{pid}/characters/{c['id']}", json=c).status_code == 200
    got = client.get(f"/api/projects/{pid}/characters/{c['id']}").json()
    assert got["portrait"]["hairTexture"] == "3B" and got["portrait"]["highlightColor"] == "#c9a063"
    assert got["portrait"]["hairEnds"] == "in" and got["portrait"]["hairPlacement"] == "right"
    assert got["states"][0]["portrait"]["age"] == "older" and got["states"][0]["snapshot"] is None
    assert got["look"]["hair"] == "braid"


def test_a_character_saved_before_portraits_opens_with_the_default_portrait_and_keeps_its_look(client: TestClient) -> None:
    pid = _project(client)
    c = _new(client, pid, name="Old", look={"hair": "bun", "skin": "#8d5524"})
    old = {k: v for k, v in c.items() if k != "portrait"}  # the document as an older build wrote it
    assert client.put(f"/api/projects/{pid}/characters/{c['id']}", json=old).status_code == 200
    got = client.get(f"/api/projects/{pid}/characters/{c['id']}").json()
    assert got["portrait"] == CharacterPortrait().model_dump(mode="json") and got["look"]["hair"] == "bun" and got["look"]["skin"] == "#8d5524"


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


# ---- the profile, relationships and story ----

def test_a_new_character_has_an_empty_profile_and_story(client: TestClient) -> None:
    pid = _project(client)
    c = _new(client, pid, name="Ada")
    assert c["profile"]["role"] == "" and c["profile"]["fields"] == []
    assert c["possessions"] == c["relationships"] == c["states"] == c["arc"] == c["events"] == []


def test_the_profile_and_story_are_held_to_their_limits_and_repaired() -> None:
    doc = CharacterDoc.model_validate({
        "id": "c1",
        "profile": {"role": "  Captain  ", "personality": "x" * 9000, "fields": [{"id": "f", "label": "Eyes", "value": "green"}, {"id": "f"}, "bad"]},
        "possessions": [{"id": "p", "name": "Sword"}, {"id": "p"}, 3],
        "relationships": [{"id": "r", "targetId": "c2", "kind": "nonsense", "family": "cousin", "changes": [{"id": "x", "at": "ch1"}, {"id": "x"}]}],
        "states": [{"id": "s", "at": "ch1", "inventory": ["rope", "rope", "", 4], "snapshot": {"hair": "braid"}}, {"id": "s2", "snapshot": "no"}],
        "arc": [{"id": "a", "name": "Denial", "at": ""}], "events": [{"id": "e", "when": "Year 3", "title": "Born"}],
    })
    assert doc.profile.role == "Captain" and len(doc.profile.personality) == 8000 and [f.id for f in doc.profile.fields] == ["f"]
    assert [p.id for p in doc.possessions] == ["p"]
    rel = doc.relationships[0]
    assert rel.kind == "other" and rel.family is None and [c.id for c in rel.changes] == ["x"]
    assert doc.states[0].inventory == ["rope"] and doc.states[0].snapshot is not None and doc.states[0].snapshot.hair == "braid" and doc.states[1].snapshot is None
    assert doc.arc[0].at is None and doc.events[0].when == "Year 3"


def test_the_words_about_the_look_are_held_to_their_limits() -> None:
    profile = CharacterDoc.model_validate({"id": "c1", "profile": {"appearance": "x" * 9000, "height": "  Tall " + "y" * 200, "hair": 5, "marks": "m" * 1500, "voice": "  Low  "}}).profile
    assert len(profile.appearance) == 8000 and len(profile.height) == 120 and profile.height.startswith("Tall")
    assert profile.hair == "" and len(profile.marks) == 1000 and profile.voice == "Low"
    assert CharacterDoc.model_validate({"id": "c2"}).profile.appearance == ""


def test_put_drops_relationships_to_nobody_or_to_oneself(client: TestClient) -> None:
    pid = _project(client)
    a, b = _new(client, pid, name="A"), _new(client, pid, name="B")
    a["relationships"] = [
        {"id": "r1", "targetId": b["id"], "kind": "friend", "label": "old friend"}, {"id": "r2", "targetId": "chr_ghost"}, {"id": "r3", "targetId": a["id"]},
    ]
    saved = client.put(f"/api/projects/{pid}/characters/{a['id']}", json=a).json()
    assert [r["id"] for r in saved["relationships"]] == ["r1"]


def test_deleting_a_character_removes_the_relationships_that_point_at_it(client: TestClient) -> None:
    pid = _project(client)
    a, b = _new(client, pid, name="A"), _new(client, pid, name="B")
    a["relationships"] = [{"id": "r1", "targetId": b["id"], "kind": "rival"}]
    client.put(f"/api/projects/{pid}/characters/{a['id']}", json=a)
    assert client.delete(f"/api/projects/{pid}/characters/{b['id']}").status_code == 204
    assert client.get(f"/api/projects/{pid}/characters/{a['id']}").json()["relationships"] == []


# ---- where the character appears, and the whole cast ----

def test_appearances_are_kept_once_each_and_cut() -> None:
    doc = CharacterDoc.model_validate({"id": "c1", "appearances": ["ch1", "ch1", "  ", 3, "s" * 200, "sc2"]})
    assert doc.appearances == ["ch1", "s" * 80, "sc2"]
    assert CharacterDoc.model_validate({"id": "c1", "appearances": "no"}).appearances == []


def test_the_whole_cast_is_one_request_and_keeps_appearances(client: TestClient) -> None:
    pid = _project(client)
    a, b = _new(client, pid, name="A"), _new(client, pid, name="B")
    a["appearances"] = ["ch1", "sc1"]
    client.put(f"/api/projects/{pid}/characters/{a['id']}", json=a)
    rows = client.get(f"/api/projects/{pid}/characters/all").json()
    assert [r["name"] for r in rows] == ["A", "B"] and rows[0]["appearances"] == ["ch1", "sc1"] and "look" in rows[1]
    assert client.get(f"/api/projects/{pid}/characters/{b['id']}").status_code == 200
