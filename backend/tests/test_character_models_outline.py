"""A shape's outline (shape editor S3): its width in the model's units, or none. Repaired on load, never refused."""

from app.storage.schema import MODEL_OUTLINE_MAX, MODEL_OUTLINE_MIN, ModelContent, ModelShape


def _shape(**extra):
    pts = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]
    return ModelShape.model_validate({"id": "s1", "pts": pts, **extra})


def test_a_shape_has_no_outline_unless_it_says_so():
    assert _shape().outline is None
    assert _shape(outline=None).outline is None


def test_the_width_is_kept_and_held_to_its_range():
    assert _shape(outline=0.75).outline == 0.75
    assert _shape(outline=3).outline == 3.0
    assert _shape(outline=0.1).outline == MODEL_OUTLINE_MIN
    assert _shape(outline=500).outline == MODEL_OUTLINE_MAX
    assert _shape(outline=1.23456).outline == 1.23


def test_a_width_that_is_not_a_number_is_no_outline():
    for bad in ("thick", True, [], {}):
        assert _shape(outline=bad).outline is None


def test_the_outline_survives_a_round_trip_through_a_model():
    content = ModelContent.model_validate({"name": "Demo", "shapes": [_shape(outline=2.5).model_dump()]})
    again = ModelContent.model_validate(content.model_dump())
    assert again.shapes[0].outline == 2.5


# ---- per-edge outlines (slice 9a): `line` False on a point leaves the edge from it to the next point without the outline ----


def _edges(*lines):
    pts = [{"x": 0, "y": 0, "m": "s"}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]
    for p, line in zip(pts, lines):
        p["line"] = line
    return ModelShape.model_validate({"id": "s1", "pts": pts, "outline": 1})


def test_an_edge_without_the_outline_is_kept_and_anything_else_is_an_outlined_edge():
    shape = _edges(False, True, "no")
    assert [p.line for p in shape.pts] == [False, None, None]


def test_only_edges_without_the_outline_are_written():
    dumped = _edges(False, None, None).model_dump(mode="json")
    assert dumped["pts"][0]["line"] is False
    # an outlined edge's point is written as before per-edge outlines, so a model's content (and its key) is unchanged
    assert "line" not in dumped["pts"][1] and "line" not in dumped["pts"][2]


def test_the_edges_survive_a_round_trip_through_a_model():
    content = ModelContent.model_validate({"name": "Demo", "shapes": [_edges(None, False, None).model_dump()]})
    again = ModelContent.model_validate(content.model_dump(mode="json"))
    assert [p.line for p in again.shapes[0].pts] == [None, False, None]
