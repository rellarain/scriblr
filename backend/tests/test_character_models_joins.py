"""Joins (slice 9c): a shape's join set (and the set it is in from behind), a group's joint cap, and the model's switch for drawing join sets as one outline. Repaired on
load, never refused, and written only when set, so a model without joins keeps its content (and its key)."""

from app.storage.schema import MODEL_CAP_RANGE, MODEL_JOIN_NAME_MAX, ModelContent, ModelGroup, ModelShape


def _shape(**extra):
    pts = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]
    return ModelShape.model_validate({"id": "s1", "pts": pts, **extra})


def _group(**extra):
    return ModelGroup.model_validate({"id": "g1", "name": "Forearm", **extra})


def test_a_shape_is_in_no_set_unless_it_says_so():
    shape = _shape()
    assert shape.join is None and shape.joinBack is None
    dumped = shape.model_dump(mode="json")
    assert "join" not in dumped and "joinBack" not in dumped


def test_a_set_name_is_trimmed_and_held_to_its_length():
    assert _shape(join="  Body ").join == "Body"
    assert len(_shape(join="x" * 99).join) == MODEL_JOIN_NAME_MAX
    for bad in (3, True, [], {}):
        assert _shape(join=bad).join is None


def test_from_behind_an_empty_name_is_no_set_and_none_is_the_front_set():
    shape = _shape(join="Body", joinBack="")
    assert shape.joinBack == ""
    dumped = shape.model_dump(mode="json")
    assert dumped["join"] == "Body" and dumped["joinBack"] == ""
    assert "joinBack" not in _shape(join="Body").model_dump(mode="json")


def test_a_joint_cap_is_held_to_its_range():
    assert _group().cap is None
    assert "cap" not in _group().model_dump(mode="json")
    assert _group(cap=1.05).cap == 1.05
    assert _group(cap=9).cap == MODEL_CAP_RANGE[1]
    assert _group(cap=0.1).cap == MODEL_CAP_RANGE[0]
    assert _group(cap=1.23456).cap == 1.23
    assert _group(cap="wide").cap == 1.05


def test_the_model_switch_is_written_only_when_on():
    assert "joins" not in ModelContent.model_validate({"name": "Demo"}).model_dump(mode="json")
    assert "joins" not in ModelContent.model_validate({"name": "Demo", "joins": False}).model_dump(mode="json")
    assert ModelContent.model_validate({"name": "Demo", "joins": True}).model_dump(mode="json")["joins"] is True


def test_joins_survive_a_round_trip_through_a_model():
    content = ModelContent.model_validate({
        "name": "Demo", "joins": True,
        "shapes": [_shape(join="Body", joinBack="Arms").model_dump()],
        "groups": [_group(cap=1.1).model_dump()],
    })
    again = ModelContent.model_validate(content.model_dump(mode="json"))
    assert again.joins is True
    assert (again.shapes[0].join, again.shapes[0].joinBack) == ("Body", "Arms")
    assert again.groups[0].cap == 1.1
