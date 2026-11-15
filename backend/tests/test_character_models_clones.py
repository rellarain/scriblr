"""Clones (Z4): a shape or an object may be a clone of another (its outline, its own place, turn and flip). The clone and its place are kept; a bad place is let go;
a clone of something missing, of a clone, a mirror or a pivot circle, a stray shape in a clone object and a clone with no place stop a publish."""

from fastapi.testclient import TestClient

from app.storage import character_models_store as store
from app.storage.schema import ModelContent

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]
AT = {"x": 130, "y": 60, "turn": 45, "flip": True}


def model(**clone) -> dict:
    return {
        "name": "Clones",
        "shapes": [{"id": "leaf", "name": "Leaf", "pts": [dict(p) for p in SQUARE]}, {"id": "c1", "name": "Leaf (clone)", "pts": [], "cloneOf": "leaf", "cloneAt": AT, **clone}],
        "objects": [{"id": "o1", "name": "Tree", "layer": "body", "shapes": ["leaf", "c1"]}],
        "groups": [{"id": "g1", "name": "Group", "parent": None, "objects": ["o1"]}],
    }


def shape(c: ModelContent, sid: str):
    return next(s for s in c.shapes if s.id == sid)


def test_a_clone_and_its_place_round_trip(client: TestClient) -> None:
    saved = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model()}]})
    assert saved.status_code == 200
    draft = client.get("/api/character-models").json()["models"][0]["draft"]
    c1 = next(s for s in draft["shapes"] if s["id"] == "c1")
    assert c1["cloneOf"] == "leaf" and c1["cloneAt"] == {"x": 130.0, "y": 60.0, "turn": 45.0, "flip": True}
    leaf = next(s for s in draft["shapes"] if s["id"] == "leaf")
    assert leaf["cloneOf"] is None and leaf["cloneAt"] is None


def test_a_place_is_repaired_or_let_go() -> None:
    c = ModelContent.model_validate(model(cloneAt={"x": 1, "y": 2, "turn": 270, "flip": "yes"}))
    assert shape(c, "c1").cloneAt.turn == -90.0 and shape(c, "c1").cloneAt.flip is False
    assert shape(ModelContent.model_validate(model(cloneAt={"x": "left", "y": 2})), "c1").cloneAt is None


def test_a_clone_of_something_wrong_stops_a_publish() -> None:
    assert store.publish_faults(ModelContent.model_validate(model())) == []
    faults = store.publish_faults(ModelContent.model_validate(model(cloneOf="gone")))
    assert "Shape Leaf (clone) is a clone of a shape that does not exist." in faults
    bad = model()
    bad["shapes"][0]["mirrorOf"] = "c1"
    assert "Shape Leaf (clone) is a clone of a clone, a mirror or a pivot circle." in store.publish_faults(ModelContent.model_validate(bad))
    assert "Shape Leaf (clone) is a clone with no place of its own outside a clone object." in store.publish_faults(ModelContent.model_validate(model(cloneAt=None)))


def test_an_object_clone_holds_clones_of_its_original() -> None:
    m = model()
    m["shapes"].append({"id": "c2", "name": "Leaf (clone 2)", "pts": [], "cloneOf": "leaf"})
    m["shapes"].append({"id": "stray", "name": "Stray", "pts": [dict(p) for p in SQUARE]})
    m["objects"].append({"id": "o2", "name": "Tree (clone)", "layer": "body", "shapes": ["c2", "stray"], "cloneOf": "o1", "cloneAt": AT})
    m["groups"][0]["objects"].append("o2")
    faults = store.publish_faults(ModelContent.model_validate(m))
    assert faults == ["Shape Stray is in the clone Tree (clone) but is not a clone of one of its original's shapes."]
