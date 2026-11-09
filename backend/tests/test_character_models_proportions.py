"""Proportions and frames of the character models (phase 5a): bones with a head unit and the Length drive, how an object fits the body, the writer's limit on a
slider, named frames and the card colour. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_BONES_MAX, MODEL_FRAME_HIDE_MAX, MODEL_FRAME_MIN, MODEL_FRAMES_MAX
from tests.test_character_models_api import content, entry_of, save, shape

HEAD = [{"x": 90, "y": 20, "m": "s"}, {"x": 110, "y": 20, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 90, "y": 40, "m": "s"}]


def bodied(**over) -> dict:
    """A publishable model: a torso group with a head group under it, an arm group, a bone for each, a slider that lengthens the arm, a frame."""
    base = content(
        "Adult",
        shapes=[shape("s_torso", "Torso"), shape("s_head", "Head", pts=[dict(p) for p in HEAD]), shape("s_arm", "Arm"), shape("s_hat", "Hat")],
        objects=[
            {"id": "o_torso", "name": "Torso", "layer": "body", "shapes": ["s_torso"]},
            {"id": "o_head", "name": "Head", "layer": "body", "shapes": ["s_head"]},
            {"id": "o_arm", "name": "Arm", "layer": "body", "shapes": ["s_arm"]},
            {"id": "o_hat", "name": "Hat", "layer": "clothing", "shapes": ["s_hat"], "fit": "stretch", "fitTo": "s_head"},
        ],
        groups=[
            {"id": "g_torso", "name": "Torso", "parent": None, "objects": ["o_torso"]},
            {"id": "g_head", "name": "Head", "parent": "g_torso", "objects": ["o_head", "o_hat"], "pivot": [100, 40]},
            {"id": "g_arm", "name": "Arm", "parent": "g_torso", "objects": ["o_arm"], "pivot": [60, 60]},
        ],
        bones=[
            {"id": "b_head", "name": "Head", "start": "g_head", "end": {"kind": "point", "id": "s_head", "i": 0}},
            {"id": "b_arm", "name": "Arm", "start": "g_arm", "end": {"kind": "group", "id": "g_head"}},
        ],
        headBone="b_head",
        ranges=[{"id": "r_arm", "name": "Arm length", "min": 80, "rest": 100, "max": 120, "unit": "%", "limit": [90, 110], "drives": [{"kind": "length", "id": "b_arm", "atMin": 80, "atMax": 120}]}],
        frames=[{"id": "f_bust", "name": "Bust", "x": 40, "y": 0, "w": 120, "h": 110, "hide": ["g_arm"]}],
        tile="#E6D6C3",
    )
    base.update(over)
    return base


def saved(client: TestClient, c: dict) -> dict:
    resp = save(client, {"id": "m1", "draft": c})
    assert resp.status_code == 200, resp.text
    return entry_of(resp.json(), "m1")["draft"]


def refused(client: TestClient, c: dict) -> str:
    save(client, {"id": "m1", "draft": c})
    resp = client.post("/api/character-models/m1/publish")
    assert resp.status_code == 422
    return resp.json()["detail"]


def publishes(client: TestClient, c: dict) -> None:
    save(client, {"id": "m1", "draft": c})
    resp = client.post("/api/character-models/m1/publish")
    assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------- what a save keeps


def test_an_older_model_loads_with_the_proportion_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}], ranges=[{"id": "r", "min": 0, "rest": 0, "max": 10}]))
    assert out["bones"] == [] and out["headBone"] is None and out["frames"] == [] and out["tile"] == "#e6d6c3"
    assert out["objects"][0]["fit"] == "scale" and out["objects"][0]["fitTo"] is None
    assert out["ranges"][0]["limit"] is None


def test_proportions_and_frames_round_trip(client: TestClient) -> None:
    out = saved(client, bodied())
    assert [(b["id"], b["start"], b["end"]) for b in out["bones"]] == [
        ("b_head", "g_head", {"kind": "point", "id": "s_head", "i": 0}), ("b_arm", "g_arm", {"kind": "group", "id": "g_head", "i": 0}),
    ]
    assert out["headBone"] == "b_head"
    assert out["ranges"][0]["drives"][0] == {**out["ranges"][0]["drives"][0], "kind": "length", "id": "b_arm", "atMin": 80.0, "atMax": 120.0}
    assert out["ranges"][0]["limit"] == [90.0, 110.0]
    hat = next(o for o in out["objects"] if o["id"] == "o_hat")
    assert hat["fit"] == "stretch" and hat["fitTo"] == "s_head"
    assert out["frames"] == [{"id": "f_bust", "name": "Bust", "x": 40.0, "y": 0.0, "w": 120.0, "h": 110.0, "hide": ["g_arm"]}]
    assert out["tile"] == "#e6d6c3"   # lower case


def test_values_are_repaired_not_refused(client: TestClient) -> None:
    c = bodied(tile="blue", frames=[{"id": "f1", "name": "  Tiny ", "x": 9999, "y": "x", "w": 1, "h": 99999, "hide": ["g_arm", "g_arm", "bad id!", 3]}])
    c["objects"][3].update(fit="wobble", fitTo="s_head")
    c["ranges"][0]["limit"] = [150, 20]
    out = saved(client, c)
    assert out["tile"] == "#e6d6c3"
    f = out["frames"][0]
    assert (f["name"], f["x"], f["y"], f["w"], f["h"], f["hide"]) == ("Tiny", 250.0, 0.0, MODEL_FRAME_MIN, 500.0, ["g_arm"])
    hat = next(o for o in out["objects"] if o["id"] == "o_hat")
    assert hat["fit"] == "scale" and hat["fitTo"] is None   # an unknown mode is the default, and only a stretching object has a target
    assert out["ranges"][0]["limit"] is None   # held inside the slider, it covers all of it: no limit


def test_a_writers_limit_is_ordered_inside_the_slider_and_holds_the_resting_value(client: TestClient) -> None:
    c = bodied()
    c["ranges"][0]["limit"] = [110, 90]
    assert saved(client, c)["ranges"][0]["limit"] == [90.0, 110.0]
    c["ranges"][0]["limit"] = [110, 105]
    assert saved(client, c)["ranges"][0]["limit"] == [100.0, 110.0]   # the resting value (100) is always allowed
    c["ranges"][0]["limit"] = [0, 500]
    assert saved(client, c)["ranges"][0]["limit"] is None   # the whole slider is no limit
    c["ranges"][0]["limit"] = "wide"
    assert saved(client, c)["ranges"][0]["limit"] is None


def test_a_bone_that_is_not_complete_is_dropped(client: TestClient) -> None:
    c = bodied(bones=[{"id": "b1", "name": "No end", "start": "g_head"}, {"id": "b2", "name": "Fine", "start": "g_head", "end": {"kind": "group", "id": "g_arm"}}, {"id": "b3", "start": "bad id!", "end": {"id": "g_arm"}}])
    assert [b["id"] for b in saved(client, c)["bones"]] == ["b2"]


def test_a_length_drive_needs_a_bone(client: TestClient) -> None:
    c = bodied()
    c["ranges"][0]["drives"] = [{"kind": "length", "atMin": 80, "atMax": 120}, {"kind": "length", "id": "b_arm", "atMin": 2, "atMax": 5000}]
    drives = saved(client, c)["ranges"][0]["drives"]
    assert len(drives) == 1 and drives[0]["atMin"] == 5.0 and drives[0]["atMax"] == 1000.0   # a percentage, held to 5..1000


def test_too_many_bones_or_frames_are_refused(client: TestClient) -> None:
    c = bodied(bones=[{"id": f"b{i}", "start": "g_head", "end": {"kind": "group", "id": "g_arm"}} for i in range(MODEL_BONES_MAX + 1)])
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    c = bodied(frames=[{"id": f"f{i}", "x": 0, "y": 0, "w": 50, "h": 50} for i in range(MODEL_FRAMES_MAX + 1)])
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


def test_a_frames_hide_list_is_held_to_its_limit(client: TestClient) -> None:
    c = bodied(frames=[{"id": "f1", "x": 0, "y": 0, "w": 50, "h": 50, "hide": [f"g{i}" for i in range(MODEL_FRAME_HIDE_MAX + 20)]}])
    assert len(saved(client, c)["frames"][0]["hide"]) == MODEL_FRAME_HIDE_MAX


# --------------------------------------------------------------------------- what publish refuses


def test_a_model_with_proportions_publishes(client: TestClient) -> None:
    publishes(client, bodied())


def test_a_bone_that_points_at_nothing_is_refused(client: TestClient) -> None:
    c = bodied()
    c["bones"][1]["start"] = "g_gone"
    assert "Bone Arm starts at a group that does not exist." in refused(client, c)
    c = bodied()
    c["bones"][1]["end"] = {"kind": "group", "id": "g_gone", "i": 0}
    assert "Bone Arm ends at a group that does not exist." in refused(client, c)
    c = bodied()
    c["bones"][0]["end"] = {"kind": "point", "id": "s_gone", "i": 0}
    assert "Bone Head ends at a shape that does not exist." in refused(client, c)
    c = bodied()
    c["bones"][0]["end"] = {"kind": "point", "id": "s_head", "i": 9}
    assert "Bone Head ends at a point that does not exist." in refused(client, c)


def test_a_bone_may_not_start_at_a_twin_group(client: TestClient) -> None:
    c = bodied()
    c["groups"].append({"id": "g_arm2", "name": "Arm 2", "parent": "g_torso", "objects": [], "mirrorOf": "g_arm"})
    c["bones"][1]["start"] = "g_arm2"
    assert "Bone Arm starts at a twin group; use the original." in refused(client, c)


def test_a_slider_may_only_change_the_length_of_a_bone_that_exists(client: TestClient) -> None:
    c = bodied()
    c["bones"] = [c["bones"][0]]
    assert "Slider Arm length changes the length of a bone that does not exist." in refused(client, c)


def test_the_head_bone_must_exist(client: TestClient) -> None:
    c = bodied(headBone="b_gone")
    assert "The head bone does not exist." in refused(client, c)


def test_a_stretching_object_needs_a_shape_that_is_not_its_own(client: TestClient) -> None:
    c = bodied()
    c["objects"][3]["fitTo"] = None
    assert "Object Hat stretches to a shape but has none chosen." in refused(client, c)
    c["objects"][3]["fitTo"] = "s_gone"
    assert "Object Hat stretches to a shape that does not exist." in refused(client, c)
    c["objects"][3]["fitTo"] = "s_hat"
    assert "Object Hat stretches to a shape of its own." in refused(client, c)


def test_a_frame_may_only_hide_what_exists(client: TestClient) -> None:
    c = bodied()
    c["frames"][0]["hide"] = ["g_arm", "g_gone"]
    assert "Frame Bust hides something that does not exist." in refused(client, c)
    c["frames"][0]["hide"] = ["g_arm", "o_hat"]   # a group and an object are both fine
    publishes(client, c)
