"""Turning (phase A1): how a shape turns with the figure, the depth of a group, and the shape an object lies on."""

from app.storage.character_models_store import publish_faults
from app.storage.schema import ModelContent, ModelGroup, ModelObject, ModelShape

PTS = [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}]


def test_a_turn_is_kept_and_repaired() -> None:
    s = ModelShape.model_validate({"id": "s", "pts": PTS, "turn": {"depth": 900, "thick": 5, "dz": [1, "x", 3, 4], "seen": [-30, 400]}})
    assert s.turn is not None
    assert s.turn.depth == 200.0 and s.turn.thick == 2.0
    assert s.turn.dz == [1.0, 0.0, 3.0]  # one per point: a long list is cut
    assert s.turn.seen == [330.0, 40.0]
    assert ModelShape.model_validate({"id": "s", "pts": PTS, "turn": "round"}).turn is None
    assert ModelShape.model_validate({"id": "s", "pts": PTS}).turn is None


def test_outlines_at_key_angles_are_multiples_of_15_and_never_the_front_or_the_back() -> None:
    angles = [{"at": 90, "tilt": 37, "pts": PTS}, {"at": 90, "tilt": 30, "pts": PTS}, {"at": 0, "pts": PTS}, {"at": 180, "pts": PTS}, {"at": 50, "pts": PTS}, {"at": -45, "pts": PTS}, {"at": 135, "pts": PTS[:2]}]
    s = ModelShape.model_validate({"id": "s", "pts": PTS, "turn": {"angles": angles}})
    assert s.turn is not None
    assert [(a.at, a.tilt) for a in s.turn.angles] == [(90, 30), (315, 0)]


def test_a_form_may_have_outlines_at_key_angles() -> None:
    from app.storage.schema import ModelOverride

    o = ModelOverride.model_validate({"shape": "s", "pts": PTS, "angles": [{"at": 45, "pts": PTS}]})
    assert o.angles is not None and o.angles[0].at == 45
    assert ModelOverride.model_validate({"shape": "s", "pts": PTS, "angles": [{"at": 0, "pts": PTS}]}).angles is None


def test_a_group_has_a_depth_and_an_object_may_lie_on_a_shape() -> None:
    assert ModelGroup.model_validate({"id": "g", "depth": 12.345}).depth == 12.35
    assert ModelGroup.model_validate({"id": "g", "depth": "deep"}).depth == 0.0
    assert ModelObject.model_validate({"id": "o", "wrap": "skull"}).wrap == "skull"
    assert ModelObject.model_validate({"id": "o", "wrap": 3}).wrap is None


def test_an_object_must_lie_on_a_shape_that_is_there_and_not_its_own() -> None:
    content = ModelContent.model_validate({
        "name": "M",
        "shapes": [{"id": "a", "pts": PTS}, {"id": "b", "pts": PTS}],
        "objects": [{"id": "o", "name": "Eyes", "shapes": ["a"], "wrap": "a"}, {"id": "p", "name": "Nose", "shapes": ["b"], "wrap": "gone"}],
        "groups": [{"id": "g", "objects": ["o", "p"]}],
    })
    faults = publish_faults(content)
    assert "Object Eyes lies on one of its own shapes." in faults
    assert "Object Nose lies on a shape that does not exist." in faults
