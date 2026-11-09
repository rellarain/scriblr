"""Hands of the character models (phase 5c): grip points, the role tag of a slider, the grip a pose holds with, the raised limits, and twin groups that have drives of
their own. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_CHAIN_MAX, MODEL_CHAIN_WARN, MODEL_GRIPS_MAX, MODEL_MAX_GROUPS, MODEL_RANGES_MAX
from tests.test_character_models_api import content, entry_of, save, shape

PTS = [{"x": 90, "y": 20, "m": "s"}, {"x": 110, "y": 20, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 90, "y": 40, "m": "s"}]


def handed(**over) -> dict:
    """A publishable model: a forearm with a hand under it, a grip on the hand, a curl slider with a role and a pose that holds with the grip."""
    base = content(
        "Adult",
        shapes=[shape("s_fore", "Forearm", pts=[dict(p) for p in PTS]), shape("s_hand", "Hand", pts=[{**p, "y": p["y"] + 20} for p in PTS])],
        objects=[{"id": "o_fore", "name": "Forearm", "layer": "body", "shapes": ["s_fore"]}, {"id": "o_hand", "name": "Hand", "layer": "body", "shapes": ["s_hand"]}],
        groups=[
            {"id": "g_fore", "name": "Forearm", "parent": None, "objects": ["o_fore"]},
            {"id": "g_hand", "name": "Hand", "parent": "g_fore", "objects": ["o_hand"], "pivot": [100, 60]},
        ],
        ranges=[{"id": "r_curl", "name": "Curl", "min": 0, "rest": 0, "max": 100, "unit": "%", "role": "curl-index", "drives": [{"kind": "turn", "group": "g_hand", "atMax": 60}]}],
        grips=[{"id": "gr1", "name": "Staff", "group": "g_hand", "x": 100, "y": 70, "angle": 20}],
        presets=[{"id": "p1", "name": "Grip", "kind": "Hand", "values": {"r_curl": 60}, "hidden": [], "grip": "gr1"}],
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


def test_an_older_model_loads_with_the_hand_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}], ranges=[{"id": "r", "min": 0, "rest": 0, "max": 10}]))
    assert out["grips"] == [] and out["ranges"][0]["role"] is None


def test_the_hand_fields_round_trip(client: TestClient) -> None:
    out = saved(client, handed())
    assert out["grips"] == [{"id": "gr1", "name": "Staff", "group": "g_hand", "x": 100.0, "y": 70.0, "angle": 20.0}]
    assert out["ranges"][0]["role"] == "curl-index"
    assert out["presets"][0]["grip"] == "gr1"
    client.post("/api/character-models/m1/publish")
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_values_are_repaired_not_refused(client: TestClient) -> None:
    c = handed(grips=[{"id": "gr1", "name": "  Cup  ", "group": "bad id!", "x": 9999, "y": "x", "angle": 999}, {"id": "bad id!"}])
    c["ranges"][0]["role"] = "  " + "x" * 80
    c["presets"][0]["grip"] = 5
    out = saved(client, c)
    assert len(out["grips"]) == 1
    g = out["grips"][0]
    assert g["name"] == "Cup" and g["group"] is None and g["x"] == 250.0 and g["y"] == 200.0 and g["angle"] == 180.0
    assert out["ranges"][0]["role"] == "x" * 40
    assert out["presets"][0]["grip"] is None


def test_a_blank_role_is_none(client: TestClient) -> None:
    c = handed()
    c["ranges"][0]["role"] = "   "
    assert saved(client, c)["ranges"][0]["role"] is None


def test_too_many_grips_are_refused(client: TestClient) -> None:
    many = [{"id": f"g{i}", "name": f"G{i}", "group": "g_hand"} for i in range(MODEL_GRIPS_MAX + 1)]
    assert save(client, {"id": "m1", "draft": handed(grips=many)}).status_code == 422


def test_a_complete_model_publishes(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": handed()})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_a_grip_on_a_missing_group_is_refused(client: TestClient) -> None:
    c = handed()
    c["grips"][0]["group"] = "g_gone"
    assert "Grip Staff is on a group that does not exist." in refused(client, c)
    c["grips"][0]["group"] = None
    assert "Grip Staff is on a group that does not exist." in refused(client, c)


def test_a_pose_that_holds_with_a_missing_grip_is_refused(client: TestClient) -> None:
    c = handed()
    c["presets"][0]["grip"] = "gr_gone"
    assert "Preset Grip holds with a grip that does not exist." in refused(client, c)


def test_the_limits_are_raised_for_hands() -> None:
    assert MODEL_CHAIN_WARN == 6 and MODEL_CHAIN_MAX == 9 and MODEL_MAX_GROUPS == 120 and MODEL_RANGES_MAX == 120


def test_a_pivot_chain_of_seven_is_published(client: TestClient) -> None:
    c = content("Deep", shapes=[shape("s0")], objects=[{"id": "o0", "shapes": ["s0"]}])
    c["groups"] = [{"id": f"g{i}", "name": f"G{i}", "parent": f"g{i - 1}" if i else None, "objects": ["o0"] if i == 0 else [], "pivot": [100, 20 + i]} for i in range(7)]
    save(client, {"id": "m1", "draft": c})
    assert client.post("/api/character-models/m1/publish").status_code == 200
