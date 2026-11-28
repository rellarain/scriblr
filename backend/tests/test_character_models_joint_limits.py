"""Joint limits (slice 9d): a pivot point's name and the joint of the body it stands for, and the body a model's limits are set for. Repaired on load, never refused, written
only when set, so a model without them keeps its content (and its key)."""

from app.storage.schema import MODEL_JOINT_NAME_MAX, ModelContent, ModelJoint


def test_a_joint_has_no_name_or_kind_unless_it_says_so():
    joint = ModelJoint.model_validate({"turn": 10, "lo": 0, "hi": 145})
    assert joint.name is None and joint.kind is None
    assert joint.model_dump(mode="json") == {"turn": 10.0, "lo": 0.0, "hi": 145.0}


def test_a_name_is_trimmed_and_a_kind_is_one_of_the_body_s_joints():
    joint = ModelJoint.model_validate({"name": "  Elbow (left) ", "kind": "elbow"})
    assert (joint.name, joint.kind) == ("Elbow (left)", "elbow")
    assert len(ModelJoint.model_validate({"name": "x" * 99}).name) == MODEL_JOINT_NAME_MAX
    assert ModelJoint.model_validate({"name": "   ", "kind": "tail"}).model_dump(mode="json") == {"turn": 0.0, "lo": -180.0, "hi": 180.0}
    for kind in ("neck", "shoulder", "elbow", "wrist", "hip", "knee", "ankle"):
        assert ModelJoint.model_validate({"kind": kind}).kind == kind


def test_the_body_is_read_as_the_default_where_it_is_not_known():
    def body(value):
        return ModelContent.model_validate({"name": "Demo", "limitsFor": value}).limitsFor

    assert body({"sex": "women", "age": "elder", "hyper": True}).model_dump() == {"sex": "women", "age": "elder", "hyper": True}
    assert body({"sex": "x", "age": "teen", "hyper": "yes"}).model_dump() == {"sex": "men", "age": "adult", "hyper": False}
    assert body("women") is None
    assert "limitsFor" not in ModelContent.model_validate({"name": "Demo"}).model_dump(mode="json")


def test_joint_limits_survive_a_round_trip_through_a_model():
    pts = [
        {"x": 0, "y": 0, "m": "s"},
        {"x": 10, "y": 0, "m": "s", "bind": {"kind": "point", "s": "a", "i": 0, "pivot": {"turn": 5, "lo": 0, "hi": 150, "name": "Elbow", "kind": "elbow"}}},
        {"x": 10, "y": 10, "m": "s"},
    ]
    content = ModelContent.model_validate({"name": "Demo", "limitsFor": {"sex": "women"}, "shapes": [{"id": "s1", "pts": pts}]})
    again = ModelContent.model_validate(content.model_dump(mode="json"))
    assert again.limitsFor.sex == "women"
    pivot = again.shapes[0].pts[1].bind.pivot
    assert (pivot.name, pivot.kind, pivot.hi) == ("Elbow", "elbow", 150.0)


def test_a_joint_may_turn_at_a_place_of_its_own():
    assert ModelJoint.model_validate({"at": [120.456, 160]}).at == [120.46, 160.0]
    for bad in ([1], [1, "x"], [1, True], "1,2", [float("nan"), 1]):
        assert ModelJoint.model_validate({"at": bad}).at is None
    assert "at" not in ModelJoint.model_validate({}).model_dump(mode="json")


def test_a_shoulder_blade_may_follow_the_arm():
    joint = ModelJoint.model_validate({"follow": {"at": [107.84, 101.8], "after": 30, "share": 0.5}})
    assert joint.model_dump(mode="json")["follow"] == {"at": [107.84, 101.8], "after": 30.0, "share": 0.5}
    held = ModelJoint.model_validate({"follow": {"at": [1, 2], "after": 500, "share": 3}}).follow
    assert (held.after, held.share) == (180.0, 1.0)
    for bad in ({"at": [1]}, {"after": 30}, "yes", {"at": [1, "x"]}):
        assert ModelJoint.model_validate({"follow": bad}).follow is None
    assert "follow" not in ModelJoint.model_validate({}).model_dump(mode="json")
