"""Pivots (shape types T3): a model's pivot points and the pivot circles that turn about them are kept; a circle's turn stays inside its limits, the limits keep
the rest inside them, and a circle about a pivot point that is not there stops a publish."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.storage import character_models_store as store
from app.storage.schema import MODEL_PIVOTS_MAX, MODEL_TURN_LIMIT, ModelContent, ModelShape

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]
RING = [{"x": 92, "y": 100, "m": "c"}, {"x": 80, "y": 112, "m": "c"}, {"x": 68, "y": 100, "m": "c"}, {"x": 80, "y": 88, "m": "c"}]


def circle(sid: str, at: str = "p1", **pivot) -> dict:
    return {"id": sid, "name": sid, "kind": "pivot", "pts": [dict(p) for p in RING], "pivot": {"at": at, **pivot}}


def model(**over) -> dict:
    return {
        "name": "Pivots",
        "shapes": [{"id": "s1", "name": "Body", "pts": [dict(p) for p in SQUARE]}, circle("c1"), circle("c2", turn=30)],
        "objects": [{"id": "o1", "name": "Part", "layer": "body", "shapes": ["s1", "c1", "c2"]}],
        "groups": [{"id": "g1", "name": "Group", "parent": None, "objects": ["o1"]}],
        "pivots": [{"id": "p1", "name": "Elbow", "x": 80, "y": 100}],
        **over,
    }


def test_pivots_and_pivot_circles_round_trip(client: TestClient) -> None:
    saved = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model()}]})
    assert saved.status_code == 200
    body = client.get("/api/character-models").json()
    draft = body["models"][0]["draft"]
    assert draft["pivots"] == [{"id": "p1", "name": "Elbow", "x": 80.0, "y": 100.0}]
    c2 = next(s for s in draft["shapes"] if s["id"] == "c2")
    assert c2["kind"] == "pivot" and c2["pivot"] == {"at": "p1", "turn": 30.0, "lo": -MODEL_TURN_LIMIT, "hi": MODEL_TURN_LIMIT}
    assert next(s for s in draft["shapes"] if s["id"] == "s1")["pivot"] is None


def test_a_file_from_before_pivots_loads_with_none() -> None:
    c = ModelContent.model_validate({"name": "Old", "shapes": [{"id": "s1", "pts": SQUARE}]})
    assert c.pivots == [] and c.shapes[0].pivot is None


def test_the_turn_is_held_inside_the_limits_and_the_limits_around_rest() -> None:
    def pivot_of(**p):
        return ModelShape.model_validate(circle("c1", **p)).pivot

    assert pivot_of(turn=90, hi=45).turn == 45
    assert pivot_of(turn=-90, lo=-30).turn == -30
    # the limits always hold the rest (no turn)
    held = pivot_of(lo=20, hi=-10)
    assert (held.lo, held.hi, held.turn) == (0.0, 0.0, 0.0)
    # angles past the largest turn are brought back to it
    assert pivot_of(turn=500, hi=900).turn == MODEL_TURN_LIMIT


def test_a_broken_pivot_is_left_out_and_a_broken_point_is_dropped() -> None:
    shape = ModelShape.model_validate({**circle("c1"), "pivot": {"at": "not an id!"}})
    assert shape.pivot is None
    c = ModelContent.model_validate(model(pivots=[{"id": "p1", "x": 80, "y": 100}, {"id": "bad id!"}, "nothing"]))
    assert [p.id for p in c.pivots] == ["p1"]


def test_too_many_pivots_are_refused() -> None:
    with pytest.raises(ValidationError):
        ModelContent.model_validate(model(pivots=[{"id": f"p{i}", "x": 0, "y": 0} for i in range(MODEL_PIVOTS_MAX + 1)]))


def test_a_circle_about_a_missing_pivot_point_stops_a_publish() -> None:
    c = ModelContent.model_validate(model())
    assert store.publish_faults(c) == []
    gone = ModelContent.model_validate(model(pivots=[]))
    assert "Pivot circle c1 turns about a pivot point that does not exist." in store.publish_faults(gone)
