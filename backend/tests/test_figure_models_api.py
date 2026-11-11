"""The figure of a character (the art mannequin, phase 6a): the copies of published models a project keeps (one entry per content, never changed by the admin publishing
again), the figure a character holds, how it is repaired, and how an edition freezes it. Same pretend app data as test_character_models_api.py."""

import pytest
from fastapi.testclient import TestClient

from app.storage import figure_models, project_store
from app.storage.schema import FIGURE_MAX_MINE, FIGURE_MAX_ON, CharacterDoc, CharacterFigure, CharacterState
from tests.test_character_models_api import complete, entry_of, save
from tests.test_world_publishing_api import _extras, _publish, _read_to, _share_character, _world

KEY = "0123456789ab"


def _publish_model(client: TestClient, mid: str = "m1", name: str = "Adult") -> None:
    assert save(client, {"id": mid, "draft": complete(name)}).status_code == 200
    assert client.post(f"/api/character-models/{mid}/publish").status_code == 200


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Figures"}).json()["projectId"]


def _copy(client: TestClient, pid: str, **body) -> dict:
    resp = client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "m1", **body})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _character(client: TestClient, pid: str, **body) -> dict:
    resp = client.post(f"/api/projects/{pid}/characters", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---- the copies ----

def test_a_project_starts_with_no_copies(client: TestClient) -> None:
    assert client.get(f"/api/projects/{_project(client)}/figure-models").json() == []


def test_a_copy_of_a_published_model_is_kept_once(client: TestClient) -> None:
    _publish_model(client)
    pid = _project(client)
    first = _copy(client, pid)
    assert len(first["id"]) == 12 and first["modelId"] == "m1" and first["version"] == 1 and first["name"] == "Adult" and first["content"]["name"] == "Adult"
    assert _copy(client, pid)["id"] == first["id"]
    assert [m["id"] for m in client.get(f"/api/projects/{pid}/figure-models").json()] == [first["id"]]


def test_a_model_that_is_not_published_or_not_there_cannot_be_copied(client: TestClient) -> None:
    pid = _project(client)
    assert client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "nope"}).status_code == 404
    save(client, {"id": "m1", "draft": complete("Draft only")})
    assert client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "m1"}).status_code == 404


def test_publishing_the_model_again_never_changes_a_copy(client: TestClient) -> None:
    _publish_model(client)
    pid = _project(client)
    old = _copy(client, pid)
    changed = complete("Adult")
    changed["description"] = "A newer one"
    assert save(client, {"id": "m1", "draft": changed}).status_code == 200
    assert client.post("/api/character-models/m1/publish").status_code == 200
    newer = _copy(client, pid)
    assert newer["id"] != old["id"] and newer["version"] == 2
    held = {m["id"]: m for m in client.get(f"/api/projects/{pid}/figure-models").json()}
    assert set(held) == {old["id"], newer["id"]} and held[old["id"]]["content"]["description"] == "" and held[old["id"]]["version"] == 1


def test_a_copy_can_be_made_from_content_as_a_character_file_carries_it(client: TestClient) -> None:
    _publish_model(client)
    pid = _project(client)
    from_catalog = _copy(client, pid)
    made = client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "m1", "version": 1, "name": "Adult", "content": from_catalog["content"]})
    assert made.status_code == 201 and made.json()["id"] == from_catalog["id"]      # the same content is the same entry
    other = dict(from_catalog["content"], description="Changed in a file")
    assert client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "m1", "version": 1, "content": other}).json()["id"] != from_catalog["id"]


def test_a_copy_over_the_size_a_character_may_keep_is_refused(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _publish_model(client)
    monkeypatch.setattr(figure_models, "MODEL_COPY_MAX_BYTES", 10)
    resp = client.post(f"/api/projects/{_project(client)}/figure-models", json={"modelId": "m1"})
    assert resp.status_code == 422 and "KB" in resp.json()["detail"]


def test_a_project_holds_only_so_many_copies(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _publish_model(client)
    pid = _project(client)
    monkeypatch.setattr(project_store, "FIGURE_MAX_MODELS", 1)
    first = _copy(client, pid)
    assert _copy(client, pid)["id"] == first["id"]       # the same one is not a new copy
    other = dict(first["content"], description="Another")
    resp = client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "m1", "content": other})
    assert resp.status_code == 422 and "at most 1 copies" in resp.json()["detail"]


def test_the_key_is_the_same_for_the_same_content() -> None:
    a = CharacterDoc(id="c")  # only to have the schema imported with the store; the key itself is a function of the content
    assert a.figure is None
    from app.storage.schema import ModelContent

    assert figure_models.content_key(ModelContent(name="X")) == figure_models.content_key(ModelContent(name="X"))
    assert figure_models.content_key(ModelContent(name="X")) != figure_models.content_key(ModelContent(name="Y"))


# ---- a copy is dropped when no character points at it ----

def test_a_copy_nobody_points_at_goes_when_the_project_is_opened(client: TestClient) -> None:
    _publish_model(client)
    pid = _project(client)
    kept, lonely = _copy(client, pid), _copy(client, pid, content=dict(complete("Adult"), description="x"), name="Lonely")
    _character(client, pid, figure={"model": kept["id"]})
    assert len(client.get(f"/api/projects/{pid}/figure-models").json()) == 2     # nothing is dropped in the middle of a save
    assert client.get(f"/api/projects/{pid}").status_code == 200
    assert [m["id"] for m in client.get(f"/api/projects/{pid}/figure-models").json()] == [kept["id"]]
    assert lonely["id"] != kept["id"]


def test_a_copy_a_story_state_points_at_stays(client: TestClient) -> None:
    _publish_model(client)
    pid = _project(client)
    copy = _copy(client, pid)
    doc = _character(client, pid)
    doc["states"] = [{"id": "s1", "at": "", "figure": {"model": copy["id"]}}]
    assert client.put(f"/api/projects/{pid}/characters/{doc['id']}", json=doc).status_code == 200
    client.get(f"/api/projects/{pid}")
    assert len(client.get(f"/api/projects/{pid}/figure-models").json()) == 1


# ---- the figure a character holds ----

def test_a_character_without_a_figure_has_none_and_an_older_file_loads_unchanged(client: TestClient) -> None:
    pid = _project(client)
    doc = _character(client, pid, name="Ada")
    assert doc["figure"] is None
    summary = client.get(f"/api/projects/{pid}/characters").json()[0]
    assert summary["figure"] is None and summary["portrait"]["skin"]


def test_a_figure_is_saved_with_the_character_and_the_cast_list_carries_its_choices(client: TestClient) -> None:
    pid = _project(client)
    doc = _character(client, pid, name="Ada")
    doc["figure"] = {"model": KEY, "values": {"r_raise": 40.5}, "forms": {"o1.a1": "f2"}, "hidden": ["o_shirt"], "tile": "#AABBCC", "locks": ["o_eye"], "genre": "g_fantasy"}
    saved = client.put(f"/api/projects/{pid}/characters/{doc['id']}", json=doc).json()
    assert saved["figure"]["model"] == KEY and saved["figure"]["values"] == {"r_raise": 40.5} and saved["figure"]["tile"] == "#aabbcc" and saved["figure"]["genre"] == "g_fantasy"
    assert client.get(f"/api/projects/{pid}/characters/{doc['id']}").json()["figure"] == saved["figure"]
    assert client.get(f"/api/projects/{pid}/characters").json()[0]["figure"] == saved["figure"]


def test_a_character_is_created_with_a_figure_to_start_from(client: TestClient) -> None:
    pid = _project(client)
    made = _character(client, pid, name="Copy", figure={"model": KEY, "values": {"r": 1}})
    assert made["figure"]["model"] == KEY and made["figure"]["values"] == {"r": 1.0}
    assert _character(client, pid, name="Plain", figure="nonsense")["figure"] is None
    assert _character(client, pid, name="NoModel", figure={"values": {"r": 1}})["figure"] is None


def test_a_figure_that_does_not_point_at_a_model_copy_is_none() -> None:
    assert CharacterDoc.model_validate({"id": "c", "figure": {"model": "not a key"}}).figure is None
    assert CharacterDoc.model_validate({"id": "c", "figure": "x"}).figure is None
    assert CharacterDoc.model_validate({"id": "c", "figure": {"model": KEY}}).figure.model == KEY      # type: ignore[union-attr]
    assert CharacterState.model_validate({"id": "s", "figure": {"model": "x"}}).figure is None
    assert CharacterState.model_validate({"id": "s", "figure": {"model": KEY, "values": {"a": 1}}}).figure.values == {"a": 1.0}      # type: ignore[union-attr]


def test_what_is_wrong_in_a_figure_is_repaired_not_refused() -> None:
    f = CharacterFigure.model_validate({
        "model": KEY, "values": {"a": "x", "b": 1e9, "c": 2, " ": 3, "d": True}, "forms": {"o.a": "f1", "x": "f", "o.b": 5}, "hidden": ["o1", "o1", 5, ""],
        "colours": {"k_skin": {"src": "swatch", "id": "s1", "l": 900, "a": "x"}, "k_bad": "nonsense", "k_hair": {"src": "weird", "id": "c1"}},
        "palette": [{"id": "p1", "name": "Warm", "h": 400, "s": 150}, "nonsense"], "tile": "red", "fall": "up", "locks": ["a", "a", 7], "zoff": {"o1": 99, "o2": 0, "o3": "x"},
        "mine": [{"id": "m1", "name": " Mine ", "kind": "Style", "values": {"r": 2}}, {"id": "m1"}, "nope", {"name": "no id"}], "genre": "g_fantasy",
    })
    assert f.values == {"b": 1000.0, "c": 2.0} and f.forms == {"o.a": "f1"} and f.hidden == ["o1"]
    assert list(f.colours) == ["k_skin"] and f.colours["k_skin"].l == 100.0 and f.colours["k_skin"].a is None
    assert f.palette is not None and [(s.id, s.h, s.s) for s in f.palette] == [("p1", 359, 100)]
    assert f.tile == "#e6d6c3" and f.fall == "down" and f.locks == ["a"] and f.zoff == {"o1": 50}
    assert [p.name for p in f.mine] == ["Mine"] and f.genre == "g_fantasy"
    assert CharacterFigure.model_validate({"model": KEY, "genre": " not an id "}).genre is None


def test_a_figure_with_nothing_chosen_has_the_defaults() -> None:
    f = CharacterFigure.model_validate({"model": KEY})
    assert (f.values, f.forms, f.hidden, f.colours, f.palette, f.tile, f.fall, f.locks, f.zoff, f.mine, f.genre) == ({}, {}, [], {}, None, "#e6d6c3", "down", [], {}, [], None)
    assert (f.on, f.order) == ([], {})


def test_the_styles_that_are_on_and_the_order_a_style_gave_are_kept_and_repaired() -> None:
    f = CharacterFigure.model_validate({"model": KEY, "on": ["p_dark", "p_dark", 5, " "], "order": {"o_shirt": ["s2", "s1", "s2", 4], "o_none": [], "o_bad": "x", " ": ["s1"]}})
    assert f.on == ["p_dark"] and f.order == {"o_shirt": ["s2", "s1"]}
    assert CharacterFigure.model_validate({"model": KEY, "on": "nope", "order": [1, 2]}).on == []
    assert CharacterFigure.model_validate({"model": KEY, "order": [1, 2]}).order == {}


def test_the_lists_of_a_figure_are_cut_to_their_limits() -> None:
    f = CharacterFigure.model_validate({
        "model": KEY, "mine": [{"id": f"m{i}", "name": "x"} for i in range(FIGURE_MAX_MINE + 10)],
        "palette": [{"id": f"p{i}", "h": i, "s": 50} for i in range(14)], "locks": [f"o{i}" for i in range(400)],
    })
    assert len(f.mine) == FIGURE_MAX_MINE and f.palette is not None and len(f.palette) == 10 and len(f.locks) == 300
    assert len(CharacterFigure.model_validate({"model": KEY, "on": [f"p{i}" for i in range(FIGURE_MAX_ON + 30)]}).on) == FIGURE_MAX_ON


# ---- an edition freezes the figure and its copy ----

def _published_figure(client: TestClient, w: dict, **share) -> dict:
    _publish_model(client)
    copy = _copy(client, w["pid"])
    _share_character(client, w["pid"], "Ada", {"published": True, "fields": ["role"], **share}, figure={"model": copy["id"], "values": {"r": 2}, "tile": "#112233"})
    return copy


def test_a_published_character_shows_its_figure_with_its_copy(client: TestClient) -> None:
    w = _world(client)
    copy = _published_figure(client, w)
    _publish(client, w)
    _read_to(client, w, 1)
    extras = _extras(client, w)
    card = extras["characters"][0]
    assert card["figure"]["model"] == copy["id"] and card["figure"]["values"] == {"r": 2.0} and card["figure"]["tile"] == "#112233" and card["portrait"]["skin"]
    assert list(extras["figureModels"]) == [copy["id"]] and extras["figureModels"][copy["id"]]["content"]["name"] == "Adult"


def test_the_edition_keeps_its_own_copy_when_the_projects_changes(client: TestClient) -> None:
    w = _world(client)
    copy = _published_figure(client, w)
    _publish(client, w)
    # the character moves to another copy and the old one goes from the project
    other = _copy(client, w["pid"], content=dict(copy["content"], description="Newer"), name="Newer")
    ada = client.get(f"/api/projects/{w['pid']}/characters").json()[0]
    doc = client.get(f"/api/projects/{w['pid']}/characters/{ada['id']}").json()
    doc["figure"]["model"] = other["id"]
    assert client.put(f"/api/projects/{w['pid']}/characters/{ada['id']}", json=doc).status_code == 200
    client.get(f"/api/projects/{w['pid']}")
    assert [m["id"] for m in client.get(f"/api/projects/{w['pid']}/figure-models").json()] == [other["id"]]
    _read_to(client, w, 1)
    extras = _extras(client, w)
    assert extras["characters"][0]["figure"]["model"] == copy["id"] and list(extras["figureModels"]) == [copy["id"]]


def test_a_character_without_a_figure_sends_no_copy_and_one_revealed_later_does_not_send_its_copy_yet(client: TestClient) -> None:
    w = _world(client)
    _share_character(client, w["pid"], "Plain", {"published": True, "fields": ["role"]})
    _publish_model(client)
    copy = _copy(client, w["pid"])
    _share_character(client, w["pid"], "Later", {"published": True, "revealAt": 2, "fields": ["role"]}, figure={"model": copy["id"]})
    _publish(client, w)
    _read_to(client, w, 1)
    extras = _extras(client, w)
    assert [(c["name"], c["figure"]) for c in extras["characters"]] == [("Plain", None)] and extras["figureModels"] == {}
    _read_to(client, w, 2)
    later = _extras(client, w)
    assert len(later["characters"]) == 2 and list(later["figureModels"]) == [copy["id"]]


def test_the_authors_preview_carries_the_figure_and_its_copy(client: TestClient) -> None:
    w = _world(client)
    copy = _published_figure(client, w)
    body = client.get(f"/api/projects/{w['pid']}/books/b1/extras-preview?chapter=1").json()
    assert body["characters"][0]["figure"]["model"] == copy["id"] and list(body["figureModels"]) == [copy["id"]]


def test_entries_of_the_catalog_do_not_leak_into_a_character(client: TestClient) -> None:
    _publish_model(client)
    assert entry_of(client.get("/api/character-models").json(), "m1")["published"]["version"] == 1
