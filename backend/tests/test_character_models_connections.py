"""Names on a connection (shape editor S5): a point link may carry the name of the connection and of the shared segment that starts at its point."""

from app.storage.schema import MODEL_BIND_NAME_MAX, ModelBind, ModelContent


def test_a_link_has_no_names_unless_it_says_so():
    b = ModelBind.model_validate({"s": "a"})
    assert b.name == "" and b.segName == ""


def test_names_are_trimmed_and_cut_to_the_limit():
    b = ModelBind.model_validate({"s": "a", "name": "  Shoulder seam  ", "segName": "x" * 99})
    assert b.name == "Shoulder seam"
    assert b.segName == "x" * MODEL_BIND_NAME_MAX


def test_a_name_that_is_not_text_is_none():
    for bad in (3, None, True, ["a"]):
        assert ModelBind.model_validate({"s": "a", "name": bad}).name == ""


def test_names_survive_a_round_trip_through_a_model():
    pts = [{"x": 0, "y": 0, "m": "s", "bind": {"s": "b", "kind": "point", "name": "Hinge", "segName": "Seam"}}, {"x": 10, "y": 0, "m": "s"}, {"x": 10, "y": 10, "m": "s"}]
    content = ModelContent.model_validate({"name": "Demo", "shapes": [{"id": "a", "pts": pts}]})
    again = ModelContent.model_validate(content.model_dump())
    assert again.shapes[0].pts[0].bind.name == "Hinge"
    assert again.shapes[0].pts[0].bind.segName == "Seam"
