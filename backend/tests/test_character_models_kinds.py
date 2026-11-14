"""Shape types (T1): a shape's kind is kept, and anything the server does not know is read as a base shape."""

from app.storage.schema import ModelShape


def _shape(**extra):
    pts = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]
    return ModelShape.model_validate({"id": "s1", "pts": pts, **extra})


def test_a_shape_is_a_base_shape_unless_it_says_otherwise():
    assert _shape().kind == "base"


def test_each_kind_is_kept():
    for kind in ("base", "stretch", "pivot", "shadow", "light"):
        assert _shape(kind=kind).kind == kind


def test_an_unknown_kind_is_read_as_a_base_shape():
    assert _shape(kind="lamp").kind == "base"
    assert _shape(kind=3).kind == "base"
    assert _shape(kind=None).kind == "base"


def test_the_kind_round_trips_through_json():
    shape = _shape(kind="shadow", op=0.3)
    again = ModelShape.model_validate(shape.model_dump())
    assert again.kind == "shadow" and again.op == 0.3
