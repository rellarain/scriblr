"""Sliders (shape types T5): an edge link's stops and posed place are kept; the stops are put in order, the posed place is held between them, a slide on a point
link is let go, and a link from before sliders has none."""

from fastapi.testclient import TestClient

from app.storage.schema import ModelBind, ModelPoint

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]


def test_a_slider_round_trips(client: TestClient) -> None:
    bead = [dict(p) for p in SQUARE]
    bead[0]["bind"] = {"kind": "edge", "s": "rail", "e": 0, "t": 0.5, "slide": {"lo": 0.25, "hi": 1.5, "at": 1.25}}
    draft = {
        "name": "Sliders",
        "shapes": [{"id": "rail", "pts": [dict(p) for p in SQUARE]}, {"id": "bead", "pts": bead}],
        "objects": [{"id": "o1", "name": "Part", "layer": "body", "shapes": ["rail", "bead"]}],
        "groups": [{"id": "g1", "name": "Group", "parent": None, "objects": ["o1"]}],
    }
    assert client.put("/api/character-models", json={"models": [{"id": "m1", "draft": draft}]}).status_code == 200
    shapes = client.get("/api/character-models").json()["models"][0]["draft"]["shapes"]
    got = next(s for s in shapes if s["id"] == "bead")["pts"][0]["bind"]
    assert got["slide"] == {"lo": 0.25, "hi": 1.5, "at": 1.25}


def test_a_link_from_before_sliders_has_none() -> None:
    assert ModelBind.model_validate({"kind": "edge", "s": "a", "e": 0, "t": 0.5}).slide is None


def test_the_stops_are_put_in_order_and_the_posed_place_held_between_them() -> None:
    b = ModelBind.model_validate({"kind": "edge", "s": "a", "slide": {"lo": 2, "hi": 0.5, "at": 9}})
    assert (b.slide.lo, b.slide.hi, b.slide.at) == (0.5, 2.0, 2.0)
    assert ModelBind.model_validate({"kind": "edge", "s": "a", "slide": {"lo": 0, "hi": 1, "at": "no"}}).slide.at is None


def test_only_an_edge_link_slides() -> None:
    assert ModelBind.model_validate({"kind": "point", "s": "a", "slide": {"lo": 0, "hi": 1}}).slide is None
    p = ModelPoint.model_validate({"x": 1, "y": 2, "bind": {"kind": "edge", "s": "a", "slide": "broken"}})
    assert p.bind is not None and p.bind.slide is None
