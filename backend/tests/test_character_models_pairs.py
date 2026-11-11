"""Pairs, point links and the back view of the character models (phase 2b): twins that mirror another shape, object or group, points linked to another
shape, a back outline and a looseness slider on a shape, and what publish refuses about them. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_LINKS_MAX, MODEL_POINTS_MAX
from tests.test_character_models_api import SQUARE, content, entry_of, save, shape


def twins(**over) -> dict:
    """An arm (shape, object, group) and its twin on the other side."""
    base = content(
        "Adult",
        shapes=[shape("s_arm", "Arm"), shape("s_arm2", "Arm (twin)", pts=[], mirrorOf="s_arm")],
        objects=[
            {"id": "o_arm", "name": "Arm", "layer": "body", "shapes": ["s_arm"]},
            {"id": "o_arm2", "name": "Arm (twin)", "layer": "body", "shapes": ["s_arm2"], "mirrorOf": "o_arm"},
        ],
        groups=[
            {"id": "g_arm", "name": "Arm", "parent": None, "objects": ["o_arm"]},
            {"id": "g_arm2", "name": "Arm (twin)", "parent": None, "objects": ["o_arm2"], "mirrorOf": "g_arm"},
        ],
    )
    base.update(over)
    return base


def linked(**over) -> dict:
    """A body shape and a shirt shape whose first point follows the body's, second is locked to the body's edge."""
    shirt_pts = [
        {"x": 90, "y": 40, "m": "s", "bind": {"kind": "point", "s": "s_body", "i": 0, "d": [-2, 0]}},
        {"x": 110, "y": 40, "m": "s", "bind": {"kind": "edge", "s": "s_body", "e": 1, "t": 0.5, "o": 3}},
        {"x": 110, "y": 60, "m": "s"},
        {"x": 90, "y": 60, "m": "s"},
    ]
    base = content(
        "Adult",
        shapes=[shape("s_body", "Body"), shape("s_shirt", "Shirt", pts=shirt_pts)],
        objects=[
            {"id": "o_body", "name": "Body", "layer": "body", "shapes": ["s_body"]},
            {"id": "o_shirt", "name": "Shirt", "layer": "clothing", "shapes": ["s_shirt"]},
        ],
        groups=[{"id": "g_all", "name": "All", "parent": None, "objects": ["o_body", "o_shirt"]}],
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


def test_a_p2a_model_loads_with_the_pair_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}]))
    s = out["shapes"][0]
    assert (s["mirrorOf"], s["back"], s["zBack"], s["loose"]) == (None, None, None, None)
    assert out["objects"][0]["mirrorOf"] is None and out["groups"][0]["mirrorOf"] is None
    assert out["shapes"][0]["pts"][0]["bind"] is None


def test_twins_round_trip(client: TestClient) -> None:
    out = saved(client, twins())
    assert out["shapes"][1]["mirrorOf"] == "s_arm" and out["shapes"][1]["pts"] == []
    assert out["objects"][1]["mirrorOf"] == "o_arm" and out["groups"][1]["mirrorOf"] == "g_arm"
    assert client.get("/api/character-models").json()["models"][0]["draft"] == out


def test_links_round_trip_and_are_repaired(client: TestClient) -> None:
    out = saved(client, linked())
    a, b = out["shapes"][1]["pts"][0]["bind"], out["shapes"][1]["pts"][1]["bind"]
    assert a == {"kind": "point", "s": "s_body", "i": 0, "d": [-2.0, 0.0], "e": 0, "t": 0.0, "o": 0.0, "tan": False}
    assert b == {"kind": "edge", "s": "s_body", "i": 0, "d": [0.0, 0.0], "e": 1, "t": 0.5, "o": 3.0, "tan": False}
    messy = linked()
    messy["shapes"][1]["pts"][0]["bind"] = {"kind": "wiggle", "s": "s_body", "i": -4, "d": [1, 2, 3], "t": 9, "o": 1e9}
    messy["shapes"][1]["pts"][1]["bind"] = {"kind": "edge"}          # no target: the link is dropped, the point stays
    messy["shapes"][1]["pts"][2]["bind"] = "not a link"
    out = saved(client, messy)
    good = out["shapes"][1]["pts"][0]["bind"]
    assert good["kind"] == "point" and good["i"] == 0 and good["d"] == [0.0, 0.0] and good["t"] == 1.0 and good["o"] == 100.0
    assert out["shapes"][1]["pts"][1]["bind"] is None and out["shapes"][1]["pts"][2]["bind"] is None
    assert len(out["shapes"][1]["pts"]) == 4


def test_a_back_outline_and_the_looseness_slider_round_trip(client: TestClient) -> None:
    c = linked(ranges=[{"id": "r_fit", "name": "Fit", "min": 0, "rest": 100, "max": 200, "unit": "%"}])
    c["shapes"][1]["back"] = [{"x": 80, "y": 40}, {"x": 120, "y": 40}, {"x": 120, "y": 70}, {"x": 80, "y": 70}]
    c["shapes"][1]["zBack"] = 12
    c["shapes"][1]["loose"] = "r_fit"
    out = saved(client, c)
    s = out["shapes"][1]
    assert len(s["back"]) == 4 and s["back"][0]["x"] == 80.0 and s["zBack"] == 12.0 and s["loose"] == "r_fit"


def test_bad_pair_fields_are_repaired(client: TestClient) -> None:
    c = twins()
    c["shapes"][1]["mirrorOf"] = "not an id!"
    c["shapes"][1]["loose"] = 7
    c["shapes"][1]["back"] = "nope"
    c["shapes"][1]["zBack"] = 900
    out = saved(client, c)
    s = out["shapes"][1]
    assert s["mirrorOf"] is None and s["loose"] is None and s["back"] is None and s["zBack"] == 100.0


def test_a_back_outline_over_the_point_limit_is_refused(client: TestClient) -> None:
    c = linked()
    c["shapes"][1]["back"] = [{"x": i, "y": i} for i in range(MODEL_POINTS_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


# --------------------------------------------------------------------------- what publish refuses


def test_a_model_with_pairs_and_links_publishes(client: TestClient) -> None:
    publishes(client, twins())
    client.put("/api/character-models", json={"models": []})
    publishes(client, linked(ranges=[{"id": "r_fit", "name": "Fit", "min": 0, "rest": 100, "max": 200, "unit": "%", "drives": [{"kind": "scale", "target": "model", "atMin": 90, "atMax": 110}]}]))


def test_a_twin_needs_no_points_but_its_original_does(client: TestClient) -> None:
    c = twins()
    c["shapes"][0]["pts"] = SQUARE[:2]
    detail = refused(client, c)
    assert "Shape Arm needs at least 3 points." in detail and "Arm (twin) needs" not in detail


def test_a_twin_of_nothing_or_of_a_twin_or_of_itself_is_refused(client: TestClient) -> None:
    c = twins()
    c["shapes"][1]["mirrorOf"] = "s_gone"
    c["objects"][1]["mirrorOf"] = "o_gone"
    c["groups"][1]["mirrorOf"] = "g_gone"
    detail = refused(client, c)
    assert "Shape Arm (twin) is a twin of a shape that does not exist." in detail
    assert "Object Arm (twin) is a twin of an object that does not exist." in detail
    assert "Group Arm (twin) is a twin of a group that does not exist." in detail
    c = twins()
    c["shapes"].append(shape("s_arm3", "Arm 3", pts=[], mirrorOf="s_arm2"))
    c["objects"][1]["shapes"].append("s_arm3")
    assert "Shape Arm 3 is a twin of a twin." in refused(client, c)
    c = twins()
    c["groups"][1]["mirrorOf"] = "g_arm2"
    assert "Group Arm (twin) is a twin of itself." in refused(client, c)


def test_a_slider_may_turn_or_scale_a_twin_group_but_not_move_a_twin_shape(client: TestClient) -> None:
    c = twins(ranges=[
        {"id": "r1", "name": "Raise", "min": 0, "rest": 0, "max": 10, "drives": [
            {"kind": "turn", "group": "g_arm2", "atMax": 5},
            {"kind": "scale", "target": "shape", "id": "s_arm2"},
            {"kind": "bend", "shape": "s_arm2"},
        ]},
    ])
    detail = refused(client, c)
    # a twin group may have drives of its own (the two sides are posed apart); a twin shape has no points to move
    assert "turns a group that is a twin" not in detail
    assert "Slider Raise scales a twin; scale the original instead." in detail
    assert "Slider Raise moves a shape that is a twin; move the original instead." in detail
    twin_group = twins(ranges=[{"id": "r1", "name": "Raise", "min": 0, "rest": 0, "max": 10, "drives": [{"kind": "turn", "group": "g_arm2", "atMax": 5}, {"kind": "scale", "target": "group", "id": "g_arm2"}]}])
    save(client, {"id": "m2", "draft": twin_group})
    assert client.post("/api/character-models/m2/publish").status_code == 200


def test_a_group_may_be_attached_to_a_point_of_a_twin_shape(client: TestClient) -> None:
    c = twins()
    c["groups"].append({"id": "g_sleeve", "name": "Sleeve", "parent": "g_arm2", "objects": [], "attach": {"shape": "s_arm2", "kind": "point", "i": 3}})
    publishes(client, c)
    c["groups"][2]["attach"]["i"] = 4                       # the twin has the four points of the arm, so this one is not there
    assert "Group Sleeve is attached to a point that does not exist." in refused(client, c)


def test_links_must_point_at_something_that_is_there(client: TestClient) -> None:
    c = linked()
    c["shapes"][1]["pts"][0]["bind"]["s"] = "s_gone"
    c["shapes"][1]["pts"][1]["bind"]["s"] = "s_shirt"
    detail = refused(client, c)
    assert "Shape Shirt has a point linked to a shape that does not exist." in detail
    assert "Shape Shirt has a point linked to its own shape." in detail
    c = linked()
    c["shapes"][1]["pts"][0]["bind"]["i"] = 4
    c["shapes"][1]["pts"][1]["bind"]["e"] = 7
    detail = refused(client, c)
    assert "Shape Shirt has a point linked to a point that does not exist." in detail
    assert "Shape Shirt has a point linked to an edge that does not exist." in detail


def test_links_may_not_go_round_in_a_circle(client: TestClient) -> None:
    c = linked()
    c["shapes"][0]["pts"][0]["bind"] = {"kind": "point", "s": "s_shirt", "i": 0}
    detail = refused(client, c)
    assert "The point links of shape Body go round in a circle." in detail and "The point links of shape Shirt go round in a circle." in detail


def test_too_many_links_are_refused(client: TestClient) -> None:
    c = linked()
    many = [{"x": i % 100, "y": i // 100, "bind": {"kind": "point", "s": "s_body", "i": 0}} for i in range(MODEL_POINTS_MAX)]
    pieces = MODEL_LINKS_MAX // MODEL_POINTS_MAX + 2
    c["shapes"] += [shape(f"s_{k}", f"Piece {k}", pts=many) for k in range(pieces)]
    c["objects"][0]["shapes"] += [f"s_{k}" for k in range(pieces)]
    detail = refused(client, c)
    assert f"A model may have at most {MODEL_LINKS_MAX} point links." in detail


def test_a_missing_looseness_slider_and_a_short_back_outline_are_refused(client: TestClient) -> None:
    c = linked()
    c["shapes"][1]["loose"] = "r_gone"
    c["shapes"][1]["back"] = [{"x": 1, "y": 1}, {"x": 2, "y": 2}]
    detail = refused(client, c)
    assert "Shape Shirt takes its looseness from a slider that does not exist." in detail
    assert "Shape Shirt has a back outline of fewer than 3 points." in detail
