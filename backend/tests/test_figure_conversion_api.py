"""Converting a character's portrait to a mannequin (phase 6c-4): the figure of the character, of its captured story looks and of the portraits frozen in its editions are kept in one
write, the old portrait stays, and going back drops exactly what the conversion made. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from tests.test_figure_models_api import _character, _copy, _project, _publish_model
from tests.test_world_publishing_api import _extras, _publish, _read_to, _share_character, _world

PORTRAIT = {"skin": "#aa7755", "hairColor": "#112233"}


def _ada(client: TestClient, w: dict, **extra) -> dict:
    """A published character with a portrait, and two captured story looks: one with a portrait and one without."""
    states = [{"id": "s1", "at": "", "portrait": PORTRAIT}, {"id": "s2", "at": ""}]
    doc = _share_character(client, w["pid"], "Ada", {"published": True, "fields": ["role"]}, portrait=PORTRAIT, states=states, **extra)
    return doc.model_dump(mode="json")


def _figure(copy: dict, **more) -> dict:
    return {"model": copy["id"], "values": {"r": 2}, "tile": "#112233", **more}


def _setup(client: TestClient) -> tuple[dict, dict, dict]:
    w = _world(client)
    _publish_model(client)
    copy = _copy(client, w["pid"])
    ada = _ada(client, w)
    _publish(client, w)
    return w, copy, ada


def _convert(client: TestClient, w: dict, ada: dict, copy: dict, **body):
    payload = {"figure": _figure(copy), "states": {"s1": _figure(copy, values={"r": 3}), "s2": _figure(copy)}, "editions": [{"bookId": "b1", "n": 1, "figure": _figure(copy, values={"r": 4})}], **body}
    return client.post(f"/api/projects/{w['pid']}/characters/{ada['id']}/convert", json=payload)


def test_the_portraits_frozen_in_the_editions_are_listed(client: TestClient) -> None:
    w, _copy_, ada = _setup(client)
    frozen = client.get(f"/api/projects/{w['pid']}/characters/{ada['id']}/frozen").json()
    assert [(f["bookId"], f["n"], f["hasFigure"], f["converted"]) for f in frozen] == [("b1", 1, False, False)]
    assert frozen[0]["portrait"]["skin"] == "#aa7755"
    assert client.get(f"/api/projects/{w['pid']}/characters/nope/frozen").status_code == 404


def test_converting_keeps_the_figure_the_story_looks_and_the_editions_and_the_portrait(client: TestClient) -> None:
    w, copy, ada = _setup(client)
    resp = _convert(client, w, ada, copy)
    assert resp.status_code == 200, resp.text
    doc = resp.json()
    assert doc["figure"]["converted"] is True and doc["figure"]["values"] == {"r": 2.0} and doc["figure"]["model"] == copy["id"]
    assert doc["portrait"]["skin"] == "#aa7755"
    # only the look that holds a portrait takes a figure
    by_id = {s["id"]: s for s in doc["states"]}
    assert by_id["s1"]["figure"]["converted"] is True and by_id["s1"]["figure"]["values"] == {"r": 3.0} and by_id["s1"]["portrait"]["skin"] == "#aa7755"
    assert by_id["s2"]["figure"] is None
    # kept: a reload gives the same
    again = client.get(f"/api/projects/{w['pid']}/characters/{ada['id']}").json()
    assert again["figure"]["converted"] is True and {s["id"]: s["figure"] is not None for s in again["states"]} == {"s1": True, "s2": False}
    # the edition card has a figure, and the edition its copy; the reader sees it
    assert client.get(f"/api/projects/{w['pid']}/characters/{ada['id']}/frozen").json()[0]["converted"] is True
    _read_to(client, w, 1)
    extras = _extras(client, w)
    card = extras["characters"][0]
    assert card["figure"]["values"] == {"r": 4.0} and card["portrait"]["skin"] == "#aa7755" and list(extras["figureModels"]) == [copy["id"]]


def test_a_conversion_needs_its_model_copy_to_be_in_the_project(client: TestClient) -> None:
    w, copy, ada = _setup(client)
    resp = _convert(client, w, ada, copy, figure=_figure({"id": "ffffffffffff"}))
    assert resp.status_code == 422 and "model" in resp.json()["detail"]
    assert client.get(f"/api/projects/{w['pid']}/characters/{ada['id']}").json()["figure"] is None
    assert client.post(f"/api/projects/{w['pid']}/characters/nope/convert", json={"figure": _figure(copy)}).status_code == 404


def test_an_edition_card_with_a_figure_of_its_own_is_left_as_it_was(client: TestClient) -> None:
    w = _world(client)
    _publish_model(client)
    copy = _copy(client, w["pid"])
    ada = _ada(client, w, figure=_figure(copy, values={"r": 9}))
    _publish(client, w)
    resp = _convert(client, w, ada, copy)
    assert resp.status_code == 200
    # the character's own figure is the converted one; what was published keeps what the writer made
    assert resp.json()["figure"]["values"] == {"r": 2.0}
    _read_to(client, w, 1)
    assert _extras(client, w)["characters"][0]["figure"]["values"] == {"r": 9.0}


def test_going_back_drops_what_the_conversion_made_and_keeps_the_portraits(client: TestClient) -> None:
    w, copy, ada = _setup(client)
    assert _convert(client, w, ada, copy).status_code == 200
    resp = client.post(f"/api/projects/{w['pid']}/characters/{ada['id']}/revert")
    assert resp.status_code == 200, resp.text
    doc = resp.json()
    assert doc["figure"] is None and doc["portrait"]["skin"] == "#aa7755" and [s["figure"] for s in doc["states"]] == [None, None] and doc["states"][0]["portrait"]["skin"] == "#aa7755"
    _read_to(client, w, 1)
    extras = _extras(client, w)
    assert extras["characters"][0]["figure"] is None and extras["characters"][0]["portrait"]["skin"] == "#aa7755" and extras["figureModels"] == {}
    # converting again works
    assert _convert(client, w, ada, copy).status_code == 200


def test_a_figure_that_was_not_converted_cannot_be_taken_back_this_way(client: TestClient) -> None:
    w = _world(client)
    _publish_model(client)
    copy = _copy(client, w["pid"])
    plain = _character(client, w["pid"], name="Plain")
    assert client.post(f"/api/projects/{w['pid']}/characters/{plain['id']}/revert").status_code == 409
    made = _share_character(client, w["pid"], "Made", {"published": False, "fields": []}, figure=_figure(copy)).model_dump(mode="json")
    assert client.post(f"/api/projects/{w['pid']}/characters/{made['id']}/revert").status_code == 409
    assert client.get(f"/api/projects/{w['pid']}/characters/{made['id']}").json()["figure"]["model"] == copy["id"]
    assert client.post(f"/api/projects/{_project(client)}/characters/nope/revert").status_code == 404
