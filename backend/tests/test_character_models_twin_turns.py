"""Twins pose (slice 9d): a twin's own turns at its original's pivot points, by point number. Repaired on load, never refused, written only when set."""

from app.storage.schema import ModelContent, ModelShape

PTS = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]


def _twin(**extra):
    return ModelShape.model_validate({"id": "sR1", "pts": [], "mirrorOf": "s1", **extra})


def test_a_twin_has_no_turns_of_its_own_unless_it_says_so():
    assert _twin().twinTurns is None
    assert "twinTurns" not in _twin().model_dump(mode="json")


def test_turns_are_kept_by_point_number_within_a_half_turn():
    assert _twin(twinTurns={"1": 30, "4": -45.678}).twinTurns == {"1": 30.0, "4": -45.68}
    assert _twin(twinTurns={"2": 999}).twinTurns == {"2": 180.0}
    assert _twin(twinTurns={"07": 12}).twinTurns == {"7": 12.0}


def test_anything_else_is_left_out_and_a_rest_turn_is_not_written():
    assert _twin(twinTurns={"x": 5, "-1": 5, "3": "far", "4": True, "5": 0}).twinTurns is None
    assert "twinTurns" not in _twin(twinTurns={"5": 0}).model_dump(mode="json")
    for bad in ("30", [30], 30):
        assert _twin(twinTurns=bad).twinTurns is None


def test_turns_survive_a_round_trip_through_a_model():
    content = ModelContent.model_validate({"name": "Demo", "shapes": [{"id": "s1", "pts": PTS}, _twin(twinTurns={"1": -20}).model_dump()]})
    again = ModelContent.model_validate(content.model_dump(mode="json"))
    assert again.shapes[1].twinTurns == {"1": -20.0}
