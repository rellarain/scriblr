"""Saved poses (slice 9d): a model keeps poses by name, each a turn per pivot point and a place per figure. Repaired on load, never refused, written only when there are
any."""

from app.storage.schema import MODEL_POSES_MAX, ModelContent


def _poses(value):
    return ModelContent.model_validate({"name": "Demo", "poses": value}).poses


def test_a_model_has_no_poses_unless_it_says_so():
    assert _poses([]) == []
    assert "poses" not in ModelContent.model_validate({"name": "Demo"}).model_dump(mode="json")


def test_a_pose_keeps_its_turns_and_places():
    [pose] = _poses([{"id": "pose1", "name": " Wave ", "turns": {"forearmL:14": 90.456, "sR9:14": -30}, "places": {"o_pelvis": {"dx": 5, "dy": 0, "turn": 10}}}])
    assert (pose.id, pose.name) == ("pose1", "Wave")
    assert pose.turns == {"forearmL:14": 90.46, "sR9:14": -30.0}
    assert pose.places["o_pelvis"].dx == 5.0


def test_what_a_pose_cannot_hold_is_left_out():
    [pose] = _poses([{"id": "p", "name": 3, "turns": {"no-point": 5, "s:1": "far", "s:2": True, "s:3": 0, "s:4": 999}, "places": {"o": "here", "bad id!": {"dx": 1}}}])
    assert pose.name == "Pose"
    assert pose.turns == {"s:4": 180.0}
    assert pose.places == {}
    # no id, a repeated id, and past the limit
    many = [{"id": f"p{n}"} for n in range(MODEL_POSES_MAX + 3)]
    assert len(_poses([{"name": "x"}, {"id": "a"}, {"id": "a"}] + many)) == MODEL_POSES_MAX
    assert _poses("pose") == []


def test_poses_survive_a_round_trip_through_a_model():
    content = ModelContent.model_validate({"name": "Demo", "poses": [{"id": "pose1", "name": "Wave", "turns": {"s:1": 45}}]})
    again = ModelContent.model_validate(content.model_dump(mode="json"))
    assert again.poses[0].turns == {"s:1": 45.0}
