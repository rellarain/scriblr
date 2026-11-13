"""Skin weights of the character models (phase O1): a shape's points may also follow groups besides their own, one weight per point for each, so the outline bends
like skin at a joint. What is kept, what is repaired and what publish refuses. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_SKIN_MAX
from tests.test_character_models_api import content, entry_of, save, shape


def arm(**over) -> dict:
    """An upper arm and a forearm, the forearm hanging from the upper arm; the upper arm's shape is skinned to the forearm near the elbow."""
    upper = shape("s_up", "Upper arm", skin=[{"g": "g_fore", "w": [0, 0, 0.5, 0.5]}])
    base = content(
        "Adult",
        shapes=[upper, shape("s_fore", "Forearm")],
        objects=[
            {"id": "o_up", "name": "Upper arm", "layer": "body", "shapes": ["s_up"]},
            {"id": "o_fore", "name": "Forearm", "layer": "body", "shapes": ["s_fore"]},
        ],
        groups=[
            {"id": "g_up", "name": "Upper arm", "parent": None, "objects": ["o_up"]},
            {"id": "g_fore", "name": "Forearm", "parent": "g_up", "objects": ["o_fore"], "pivot": [100, 60]},
        ],
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


def test_a_model_saved_before_skin_weights_loads_with_none(client: TestClient) -> None:
    body = saved(client, content("Adult", shapes=[shape("s1")]))
    assert body["shapes"][0]["skin"] == []


def test_skin_weights_round_trip_and_publish(client: TestClient) -> None:
    body = saved(client, arm())
    assert body["shapes"][0]["skin"] == [{"g": "g_fore", "w": [0, 0, 0.5, 0.5]}]
    assert faults(client, arm()) == ""


def test_weights_are_held_to_0_1_in_hundredths_and_fitted_to_the_points(client: TestClient) -> None:
    long = shape("s_up", skin=[{"g": "g_fore", "w": [1.7, -3, 0.333, "x", 0.5, 0.5]}])
    body = saved(client, arm(shapes=[long, shape("s_fore")]))
    assert body["shapes"][0]["skin"][0]["w"] == [1, 0, 0.33, 0]   # cut to the four points
    short = shape("s_up", skin=[{"g": "g_fore", "w": [0.25]}])
    body = saved(client, arm(shapes=[short, shape("s_fore")]))
    assert body["shapes"][0]["skin"][0]["w"] == [0.25, 0, 0, 0]   # filled with 0


def test_a_bad_entry_and_a_repeated_group_are_dropped(client: TestClient) -> None:
    sk = [{"g": "bad id!", "w": [1, 1, 1, 1]}, {"g": "g_fore", "w": [0, 0, 1, 1]}, {"g": "g_fore", "w": [1, 1, 1, 1]}, "nothing"]
    body = saved(client, arm(shapes=[shape("s_up", skin=sk), shape("s_fore")]))
    assert body["shapes"][0]["skin"] == [{"g": "g_fore", "w": [0, 0, 1, 1]}]


def test_more_groups_than_the_limit_are_refused(client: TestClient) -> None:
    ok = [{"g": f"g{i}", "w": [0, 0, 0, 0]} for i in range(MODEL_SKIN_MAX)]
    assert save(client, {"id": "m1", "draft": content("A", shapes=[shape("s1", skin=ok)])}).status_code == 200
    over = ok + [{"g": "g_more", "w": [0, 0, 0, 0]}]
    assert save(client, {"id": "m1", "draft": content("A", shapes=[shape("s1", skin=over)])}).status_code == 422


def test_a_shape_skinned_to_a_group_that_is_not_there_or_its_own_is_refused(client: TestClient) -> None:
    gone = arm(shapes=[shape("s_up", "Upper arm", skin=[{"g": "g_gone", "w": [0, 0, 1, 1]}]), shape("s_fore")])
    assert "Shape Upper arm is skinned to a group that does not exist." in faults(client, gone)
    own = arm(shapes=[shape("s_up", "Upper arm", skin=[{"g": "g_up", "w": [0, 0, 1, 1]}]), shape("s_fore")])
    assert "Shape Upper arm is skinned to its own group." in faults(client, own)


def test_a_twin_with_weights_of_its_own_is_refused(client: TestClient) -> None:
    c = arm()
    c["shapes"].append(shape("s_up2", "Upper arm (twin)", pts=[], mirrorOf="s_up", skin=[{"g": "g_fore", "w": []}]))
    c["objects"][0]["shapes"].append("s_up2")
    assert "Shape Upper arm (twin) is a twin and has skin weights of its own: skin the original instead." in faults(client, c)


def test_a_shape_skinned_to_a_group_that_hangs_from_it_is_refused(client: TestClient) -> None:
    # the forearm is fixed to the upper arm's shape, so the upper arm's shape cannot wait for the forearm's place
    c = arm()
    c["groups"][1]["attach"] = {"shape": "s_up", "kind": "point", "i": 2}
    assert "Shape Upper arm is skinned to a group that hangs from it." in faults(client, c)
