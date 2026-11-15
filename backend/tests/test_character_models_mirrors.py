"""Mirrors (Z3): a twin may be reflected across a symmetric shape's axis instead of the model's centre line. The line is kept on the twin shape and the twin
object; a bad one is let go; a line across a shape that does not exist or is not symmetric stops a publish."""

from fastapi.testclient import TestClient

from app.storage import character_models_store as store
from app.storage.schema import ModelContent

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]


def model(line: object = None, chest_sym: bool = True, object_line: object = None) -> dict:
    chest = {"id": "chest", "name": "Chest", "pts": [dict(p) for p in SQUARE]}
    if chest_sym:
        chest["sym"] = {"a": 90, "n": 1, "side": 0, "cx": 100, "cy": 50, "m": 1}
    return {
        "name": "Mirrors",
        "shapes": [chest, {"id": "b1", "name": "Breast", "pts": [dict(p) for p in SQUARE]}, {"id": "b2", "name": "Breast (twin)", "pts": [], "mirrorOf": "b1", "mirrorLine": line}],
        "objects": [{"id": "o1", "name": "Torso", "layer": "body", "shapes": ["chest", "b1"]}, {"id": "o2", "name": "Twin", "layer": "body", "shapes": ["b2"], "mirrorOf": "o1", "mirrorLine": object_line}],
        "groups": [{"id": "g1", "name": "Body", "parent": None, "objects": ["o1", "o2"]}],
    }


def shape(c: ModelContent, sid: str):
    return next(s for s in c.shapes if s.id == sid)


def test_a_mirror_line_round_trips(client: TestClient) -> None:
    saved = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model({"shape": "chest", "k": 0}, object_line={"shape": "chest", "k": 0})}]})
    assert saved.status_code == 200
    draft = client.get("/api/character-models").json()["models"][0]["draft"]
    b2 = next(s for s in draft["shapes"] if s["id"] == "b2")
    assert b2["mirrorLine"] == {"shape": "chest", "k": 0}
    assert next(o for o in draft["objects"] if o["id"] == "o2")["mirrorLine"] == {"shape": "chest", "k": 0}
    assert next(s for s in draft["shapes"] if s["id"] == "b1")["mirrorLine"] is None


def test_a_bad_mirror_line_is_let_go() -> None:
    for bad in ({"shape": "bad id!", "k": 0}, {"shape": "chest", "k": 9}, {"k": 0}, "chest", 3):
        assert shape(ModelContent.model_validate(model(bad)), "b2").mirrorLine is None


def test_a_line_across_a_shape_that_is_not_symmetric_stops_a_publish() -> None:
    assert store.publish_faults(ModelContent.model_validate(model({"shape": "chest", "k": 0}))) == []
    faults = store.publish_faults(ModelContent.model_validate(model({"shape": "chest", "k": 0}, chest_sym=False)))
    assert "Shape Breast (twin) is reflected across a shape that does not exist or is not symmetric." in faults
    faults = store.publish_faults(ModelContent.model_validate(model({"shape": "gone", "k": 0}, object_line={"shape": "gone", "k": 0})))
    assert "Object Twin is reflected across a shape that does not exist or is not symmetric." in faults
