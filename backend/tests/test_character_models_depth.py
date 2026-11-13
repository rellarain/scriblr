"""Foreshortening, depth order and shadows across parts (phase O2): a Depth drive on a bone, the `z` property of an authored field, and the other parts a shading shape lies
on. What is kept, what is repaired and what publish refuses. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_DEPTH_MAX, MODEL_OVER_MAX
from tests.test_character_models_api import content, entry_of, save, shape


def drive(**over) -> dict:
    base = {"kind": "depth", "id": "b_up", "atMin": -60, "atMax": 60}
    base.update(over)
    return base


def arm(**over) -> dict:
    """An upper arm and a forearm with a bone along the upper arm, the arm's twin on the other side, and a Depth slider."""
    base = content(
        "Adult",
        shapes=[shape("s_up", "Upper arm"), shape("s_up2", "Upper arm (twin)", pts=[], mirrorOf="s_up"), shape("s_fore", "Forearm")],
        objects=[
            {"id": "o_up", "name": "Upper arm", "layer": "body", "shapes": ["s_up"]},
            {"id": "o_up2", "name": "Upper arm (twin)", "layer": "body", "shapes": ["s_up2"], "mirrorOf": "o_up"},
            {"id": "o_fore", "name": "Forearm", "layer": "body", "shapes": ["s_fore"]},
        ],
        groups=[
            {"id": "g_up", "name": "Upper arm", "parent": None, "objects": ["o_up"], "pivot": [100, 40]},
            {"id": "g_up2", "name": "Upper arm (twin)", "parent": None, "objects": ["o_up2"], "mirrorOf": "g_up"},
            {"id": "g_fore", "name": "Forearm", "parent": "g_up", "objects": ["o_fore"], "pivot": [100, 60]},
        ],
        bones=[{"id": "b_up", "name": "Upper arm", "start": "g_up", "end": {"kind": "group", "id": "g_fore", "i": 0}}],
        ranges=[{"id": "r_depth", "name": "Depth", "min": -60, "rest": 0, "max": 60, "unit": "°", "drives": [drive()]}],
    )
    base.update(over)
    return base


def saved(client: TestClient, c: dict) -> dict:
    resp = save(client, {"id": "m1", "draft": c})
    assert resp.status_code == 200, resp.text
    return entry_of(resp.json(), "m1")["draft"]


def faults(client: TestClient, c: dict) -> str:
    save(client, {"id": "m1", "draft": c})
    resp = client.post("/api/character-models/m1/publish")
    return resp.json()["detail"] if resp.status_code == 422 else ""


def test_a_depth_drive_round_trips_and_publishes(client: TestClient) -> None:
    body = saved(client, arm())
    d = body["ranges"][0]["drives"][0]
    assert (d["kind"], d["id"], d["atMin"], d["atMax"]) == ("depth", "b_up", -60, 60)
    assert faults(client, arm()) == ""


def test_a_depth_drive_is_held_to_89_degrees_and_needs_a_bone(client: TestClient) -> None:
    body = saved(client, arm(ranges=[{"id": "r_depth", "name": "Depth", "drives": [drive(atMin=-200, atMax=150)]}]))
    d = body["ranges"][0]["drives"][0]
    assert (d["atMin"], d["atMax"]) == (-MODEL_DEPTH_MAX, MODEL_DEPTH_MAX)
    body = saved(client, arm(ranges=[{"id": "r_depth", "name": "Depth", "drives": [drive(id=None)]}]))
    assert body["ranges"][0]["drives"] == []


def test_a_depth_drive_for_a_bone_that_is_not_there_or_a_wrong_twin_is_refused(client: TestClient) -> None:
    gone = arm(ranges=[{"id": "r_depth", "name": "Depth", "drives": [drive(id="b_gone")]}])
    assert "Slider Depth turns a bone toward the viewer that does not exist." in faults(client, gone)
    wrong = arm(ranges=[{"id": "r_depth", "name": "Depth", "drives": [drive(group="g_fore")]}])
    assert "Slider Depth turns the twin of a bone toward the viewer, but g_fore is not the twin of the group the bone starts at." in faults(client, wrong)
    twin = arm(ranges=[{"id": "r_depth", "name": "Depth", "drives": [drive(group="g_up2")]}])
    assert faults(client, twin) == ""


def test_the_depth_order_of_a_twin_may_be_set(client: TestClient) -> None:
    z = {"kind": "prop", "feature": "object", "prop": "z", "id": "o_up2", "atMin": -20, "atMax": 20}
    c = arm(ranges=[{"id": "r_z", "name": "Order", "min": -1, "rest": 0, "max": 1, "drives": [z]}])
    assert saved(client, c)["ranges"][0]["drives"][0]["prop"] == "z"
    assert faults(client, c) == ""
    # another property of a twin is still refused
    w = {**z, "prop": "width", "atMin": 80, "atMax": 120}
    assert "Slider Order changes a property of a twin object; change the original instead." in faults(client, arm(ranges=[{"id": "r_z", "name": "Order", "drives": [w]}]))
    # and the amount is held to the property's span
    big = saved(client, arm(ranges=[{"id": "r_z", "name": "Order", "drives": [{**z, "atMin": -500, "atMax": 500}]}]))
    assert (big["ranges"][0]["drives"][0]["atMin"], big["ranges"][0]["drives"][0]["atMax"]) == (-60, 60)


def torso(**shadow) -> dict:
    shade = shape("s_shadow", "Shadow", shade={"kind": "shadow", "t": 0.2}, over=["o_pelvis"])
    shade.update(shadow)
    return content(
        "Torso",
        shapes=[shape("s_chest", "Chest"), shade, shape("s_pelvis", "Pelvis")],
        objects=[{"id": "o_chest", "name": "Chest", "layer": "body", "shapes": ["s_chest", "s_shadow"]}, {"id": "o_pelvis", "name": "Pelvis", "layer": "body", "shapes": ["s_pelvis"]}],
        groups=[{"id": "g", "name": "Torso", "parent": None, "objects": ["o_chest", "o_pelvis"]}],
    )


def test_a_shading_shape_lies_on_other_parts(client: TestClient) -> None:
    assert saved(client, torso())["shapes"][1]["over"] == ["o_pelvis"]
    assert faults(client, torso()) == ""
    # repeats and bad ids are dropped, and the list is cut at the limit
    many = [f"o_{k}" for k in range(MODEL_OVER_MAX + 3)]
    body = saved(client, torso(over=["o_pelvis", "o_pelvis", "bad id!"] + many))
    assert body["shapes"][1]["over"][:1] == ["o_pelvis"] and len(body["shapes"][1]["over"]) == MODEL_OVER_MAX
    assert saved(client, content("A", shapes=[shape("s1")]))["shapes"][0]["over"] == []


def test_lying_on_a_part_that_is_not_there_or_without_being_shading_is_refused(client: TestClient) -> None:
    assert "Shape Shadow lies on a part that does not exist." in faults(client, torso(over=["o_gone"]))
    assert "Shape Shadow lies on other parts but is not a shading shape." in faults(client, torso(shade=None))
