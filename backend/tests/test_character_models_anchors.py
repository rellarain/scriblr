"""Anchors and the posed place (shape types T4): a shape's marks and place are kept; a mark of an unknown kind is an anchor, one on a point that is not there lies inside
the shape, a second mark with the same id is dropped, too many are refused; a place's turn is brought into -180..180."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.storage.schema import MODEL_MARKS_MAX, ModelShape

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]


def shape(**extra) -> dict:
    return {"id": "s1", "name": "Body", "pts": [dict(p) for p in SQUARE], **extra}


def test_marks_and_place_round_trip(client: TestClient) -> None:
    draft = {
        "name": "Anchored",
        "shapes": [shape(marks=[{"id": "k1", "kind": "anchor", "x": 90, "y": 40, "i": 0, "name": "Hip"}, {"id": "k2", "x": 100, "y": 50}], place={"dx": 5, "dy": -2, "turn": 30})],
        "objects": [{"id": "o1", "name": "Part", "layer": "body", "shapes": ["s1"]}],
        "groups": [{"id": "g1", "name": "Group", "parent": None, "objects": ["o1"]}],
    }
    assert client.put("/api/character-models", json={"models": [{"id": "m1", "draft": draft}]}).status_code == 200
    got = client.get("/api/character-models").json()["models"][0]["draft"]["shapes"][0]
    assert got["marks"] == [
        {"id": "k1", "kind": "anchor", "x": 90.0, "y": 40.0, "i": 0, "name": "Hip", "c": False},
        {"id": "k2", "kind": "anchor", "x": 100.0, "y": 50.0, "i": None, "name": "", "c": False},
    ]
    assert got["place"] == {"dx": 5.0, "dy": -2.0, "turn": 30.0}


def test_a_shape_from_before_anchors_has_none() -> None:
    s = ModelShape.model_validate(shape())
    assert s.marks == [] and s.place is None


def test_marks_are_repaired() -> None:
    s = ModelShape.model_validate(shape(marks=[{"id": "k1", "kind": "nail", "x": 1, "y": 2, "i": 9}, {"id": "k1", "x": 3}, {"id": "bad id!"}, "nothing", {"id": "k2", "kind": "pose", "i": True}]))
    assert [(m.id, m.kind, m.i) for m in s.marks] == [("k1", "anchor", None), ("k2", "pose", None)]


def test_too_many_marks_are_refused() -> None:
    with pytest.raises(ValidationError):
        ModelShape.model_validate(shape(marks=[{"id": f"k{i}", "x": 0, "y": 0} for i in range(MODEL_MARKS_MAX + 1)]))


def test_a_place_turn_is_brought_round() -> None:
    assert ModelShape.model_validate(shape(place={"turn": 270})).place.turn == -90.0
    assert ModelShape.model_validate(shape(place={"dx": "far"})).place is None


def test_a_mark_on_the_centre_has_no_point_and_only_true_counts() -> None:
    """Shape editor C1: an anchor on the shape's centre follows it, so it lies on no point; anything but true is not on the centre."""
    s = ModelShape.model_validate(shape(marks=[{"id": "k1", "x": 100, "y": 50, "i": 2, "c": True}, {"id": "k2", "x": 1, "y": 1, "c": "yes"}]))
    assert [(m.id, m.c, m.i) for m in s.marks] == [("k1", True, None), ("k2", False, None)]


def test_a_point_linked_to_a_centre_keeps_its_kind_and_offset() -> None:
    """Shape editor C1: a point may follow the centre of another shape, with an offset; an unknown kind is a point link."""
    pts = [dict(p) for p in SQUARE]
    pts[0]["bind"] = {"kind": "center", "s": "s2", "d": [1.5, -2]}
    pts[1]["bind"] = {"kind": "middle", "s": "s2"}
    s = ModelShape.model_validate(shape(pts=pts))
    assert (s.pts[0].bind.kind, s.pts[0].bind.s, s.pts[0].bind.d) == ("center", "s2", [1.5, -2.0])
    assert s.pts[1].bind.kind == "point"
