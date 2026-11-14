"""Symmetry of a shape (shape editor S6): the axes and the source it is made from, kept only while they fit the points."""

from app.storage.schema import MODEL_SYM_AXES_MAX, ModelContent, ModelShape


def _shape(count: int, sym):
    pts = [{"x": i, "y": i % 3, "m": "s"} for i in range(count)]
    return ModelShape.model_validate({"id": "s1", "pts": pts, "sym": sym})


def test_a_shape_is_not_symmetric_unless_it_says_so():
    assert _shape(4, None).sym is None


def test_symmetry_that_fits_the_points_is_kept():
    s = _shape(8, {"a": 90, "n": 2, "side": 1, "cx": 10.123, "cy": -4, "m": 1})
    assert s.sym is not None
    assert (s.sym.a, s.sym.n, s.sym.side, s.sym.cx, s.sym.cy, s.sym.m) == (90.0, 2, 1, 10.12, -4.0, 1)
    assert _shape(4, {"a": 270, "n": 1, "cx": 0, "cy": 0, "m": 1}).sym.a == 90.0


def test_symmetry_that_does_not_fit_is_let_go_and_the_points_stay():
    s = _shape(7, {"a": 0, "n": 2, "cx": 0, "cy": 0, "m": 1})
    assert s.sym is None and len(s.pts) == 7
    for bad in ({"a": 0, "n": 0, "m": 1}, {"a": 0, "n": MODEL_SYM_AXES_MAX + 1, "m": 0}, {"a": "x", "n": 1, "m": 1}, {"a": 0, "n": 1, "m": -1}, "sym"):
        assert _shape(4, bad).sym is None


def test_symmetry_survives_a_round_trip_through_a_model():
    shape = _shape(4, {"a": 45, "n": 1, "side": 1, "cx": 1, "cy": 2, "m": 1}).model_dump()
    content = ModelContent.model_validate({"name": "Demo", "shapes": [shape]})
    again = ModelContent.model_validate(content.model_dump())
    assert again.shapes[0].sym.a == 45.0 and again.shapes[0].sym.m == 1
