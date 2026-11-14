"""The turn of a shape's frame (shape editor S4): an angle in degrees, kept from -180 up to 180, repaired on load and never refused."""

from app.storage.schema import ModelContent, ModelShape


def _shape(**extra):
    pts = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]
    return ModelShape.model_validate({"id": "s1", "pts": pts, **extra})


def test_a_shape_is_not_turned_unless_it_says_so():
    assert _shape().rot == 0.0


def test_the_angle_is_kept_within_a_turn():
    assert _shape(rot=30).rot == 30.0
    assert _shape(rot=-45.5).rot == -45.5
    assert _shape(rot=190).rot == -170.0
    assert _shape(rot=180).rot == -180.0
    assert _shape(rot=-540).rot == -180.0
    assert _shape(rot=12.3456).rot == 12.35


def test_an_angle_that_is_not_a_number_is_none():
    for bad in ("left", True, None, [], {}):
        assert _shape(rot=bad).rot == 0.0


def test_the_angle_survives_a_round_trip_through_a_model():
    content = ModelContent.model_validate({"name": "Demo", "shapes": [_shape(rot=15).model_dump()]})
    again = ModelContent.model_validate(content.model_dump())
    assert again.shapes[0].rot == 15.0
