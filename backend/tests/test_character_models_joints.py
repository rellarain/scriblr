"""Joints (J2, J3): a link may be a pivot point (its turn and the smallest and largest turn allowed), and an object may be posed as the first object of its figure (its
place). Both are kept; a pivot's turn is held inside its limits and the limits keep the rest inside them; a bad pivot or place is let go."""

from fastapi.testclient import TestClient

from app.storage import character_models_store as store
from app.storage.schema import ModelContent

SQUARE = [{"x": 60, "y": 40, "m": "s"}, {"x": 100, "y": 40, "m": "s"}, {"x": 100, "y": 100, "m": "s"}, {"x": 60, "y": 100, "m": "s"}]
ARM = [{"x": 100, "y": 100, "m": "s"}, {"x": 120, "y": 100, "m": "s"}, {"x": 120, "y": 160, "m": "s"}, {"x": 100, "y": 160, "m": "s"}]


def model(pivot=None, place=None) -> dict:
    arm = [dict(p) for p in ARM]
    arm[0]["bind"] = {"kind": "point", "s": "body", "i": 2, "pivot": pivot if pivot is not None else {"turn": 30, "lo": -45, "hi": 90}}
    return {
        "name": "Joints",
        "shapes": [{"id": "body", "name": "Body", "pts": [dict(p) for p in SQUARE]}, {"id": "arm", "name": "Arm", "pts": arm}],
        "objects": [
            {"id": "ob", "name": "Body", "layer": "body", "shapes": ["body"], **({"place": place} if place is not None else {})},
            {"id": "oa", "name": "Arm", "layer": "body", "shapes": ["arm"]},
        ],
        "groups": [{"id": "g1", "name": "Group", "parent": None, "objects": ["ob", "oa"]}],
    }


def arm_bind(c: ModelContent):
    return next(s for s in c.shapes if s.id == "arm").pts[0].bind


def test_a_pivot_point_and_a_place_round_trip(client: TestClient) -> None:
    saved = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model(place={"dx": 3, "dy": 4, "turn": 20})}]})
    assert saved.status_code == 200
    draft = client.get("/api/character-models").json()["models"][0]["draft"]
    arm = next(s for s in draft["shapes"] if s["id"] == "arm")
    assert arm["pts"][0]["bind"]["pivot"] == {"turn": 30.0, "lo": -45.0, "hi": 90.0}
    assert next(o for o in draft["objects"] if o["id"] == "ob")["place"] == {"dx": 3.0, "dy": 4.0, "turn": 20.0}
    assert next(o for o in draft["objects"] if o["id"] == "oa")["place"] is None
    assert store.publish_faults(ModelContent.model_validate(model())) == []


def test_a_pivot_is_held_inside_its_limits_and_a_bad_one_let_go() -> None:
    held = arm_bind(ModelContent.model_validate(model(pivot={"turn": 120, "lo": 10, "hi": 60})))
    assert (held.pivot.lo, held.pivot.hi, held.pivot.turn) == (0.0, 60.0, 60.0)
    assert arm_bind(ModelContent.model_validate(model(pivot={"turn": "left"}))).pivot is None
    assert arm_bind(ModelContent.model_validate(model(pivot="yes"))).pivot is None


def test_a_bad_place_is_let_go_and_a_turn_wrapped() -> None:
    c = ModelContent.model_validate(model(place={"dx": 1, "dy": 2, "turn": 370}))
    assert next(o for o in c.objects if o.id == "ob").place.turn == 10.0
    assert next(o for o in ModelContent.model_validate(model(place={"dx": "far"})).objects if o.id == "ob").place is None
