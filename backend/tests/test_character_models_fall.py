"""Bridges, creases and fall of the character models (phase 5b): an edge link that leaves along its edge, a shape that fades in with a slider, the Fall drive on
the points that carry a weight, and the side hanging things fall to that a preset keeps. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from tests.test_character_models_api import content, entry_of, save, shape

PTS = [{"x": 90, "y": 20, "m": "s"}, {"x": 110, "y": 20, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 90, "y": 40, "m": "s"}]


def lock(i: int = 0, **over) -> dict:
    return {"x": 100, "y": 100, "m": "s", "bind": {"kind": "edge", "s": "s_a", "e": 0, "t": 0.5, "o": 0, **over}}


def hung(**over) -> dict:
    """A publishable model: two parts with a bridge between them, a crease that fades in with a bend slider, a scarf that hangs with a fall slider."""
    scarf = [{"x": 100, "y": 60, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 110, "y": 80, "m": "s", "w": 0.5}, {"x": 100, "y": 80, "m": "s", "w": 1}]
    base = content(
        "Adult",
        shapes=[
            shape("s_a", "Upper", pts=[dict(p) for p in PTS]),
            shape("s_b", "Lower", pts=[{**p, "y": p["y"] + 30} for p in PTS]),
            shape("s_bridge", "Bridge", pts=[lock(), lock(), lock(), lock()]),
            shape("s_crease", "Crease", pts=[dict(p) for p in PTS]),
            shape("s_scarf", "Scarf", pts=scarf),
        ],
        objects=[
            {"id": "o_a", "name": "Upper", "layer": "body", "shapes": ["s_a"]},
            {"id": "o_b", "name": "Lower", "layer": "body", "shapes": ["s_b", "s_bridge", "s_crease"]},
            {"id": "o_s", "name": "Scarf", "layer": "clothing", "shapes": ["s_scarf"]},
        ],
        groups=[{"id": "g_a", "name": "Upper", "parent": None, "objects": ["o_a", "o_s"]}, {"id": "g_b", "name": "Lower", "parent": "g_a", "objects": ["o_b"], "pivot": [100, 50]}],
        ranges=[
            {"id": "r_bend", "name": "Bend", "min": 0, "rest": 0, "max": 100, "drives": [{"kind": "turn", "group": "g_b", "atMin": 0, "atMax": 60}]},
            {"id": "r_fall", "name": "Fall", "min": 0, "rest": 0, "max": 100, "unit": "%", "drives": [{"kind": "fall", "shape": "s_scarf"}]},
        ],
    )
    base["shapes"][3]["opBy"] = {"slider": "r_bend", "hidden": 8, "shown": 110}
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


def test_an_older_model_loads_with_the_fall_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1", pts=[lock()])], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}]))
    assert out["shapes"][0]["opBy"] is None
    assert out["shapes"][0]["pts"][0]["bind"]["tan"] is False
    assert out["presets"] == []


def test_the_fall_fields_round_trip(client: TestClient) -> None:
    c = hung()
    c["shapes"][2]["pts"][0]["bind"]["tan"] = True
    c["presets"] = [{"id": "p1", "name": "Windy", "kind": "Weather", "values": {}, "hidden": [], "fall": "left"}]
    out = saved(client, c)
    assert out["shapes"][2]["pts"][0]["bind"]["tan"] is True and out["shapes"][2]["pts"][1]["bind"]["tan"] is False
    assert out["shapes"][3]["opBy"] == {"slider": "r_bend", "hidden": 8.0, "shown": 110.0}
    assert [p.get("w") for p in out["shapes"][4]["pts"]] == [None, None, 0.5, 1.0]
    drive = out["ranges"][1]["drives"][0]
    assert drive["kind"] == "fall" and drive["shape"] == "s_scarf" and drive["atMin"] == 0.0 and drive["atMax"] == 100.0
    assert out["presets"][0]["fall"] == "left"


def test_values_are_repaired_not_refused(client: TestClient) -> None:
    c = hung()
    c["shapes"][2]["pts"][0]["bind"]["tan"] = "yes"
    c["shapes"][3]["opBy"] = {"slider": "bad id!", "hidden": 1, "shown": 2}
    c["shapes"][4]["opBy"] = {"slider": "r_bend", "hidden": "x", "shown": 99999}
    c["ranges"][1]["drives"][0].update(atMin=-40, atMax=500)
    c["presets"] = [{"id": "p1", "name": "Windy", "kind": "Weather", "values": {}, "hidden": [], "fall": "sideways"}]
    out = saved(client, c)
    assert out["shapes"][2]["pts"][0]["bind"]["tan"] is False
    assert out["shapes"][3]["opBy"] is None
    assert out["shapes"][4]["opBy"] == {"slider": "r_bend", "hidden": 0.0, "shown": 1000.0}
    drive = out["ranges"][1]["drives"][0]
    assert drive["atMin"] == 0.0 and drive["atMax"] == 100.0
    assert out["presets"][0]["fall"] is None


def test_a_fall_drive_needs_a_shape(client: TestClient) -> None:
    c = hung()
    c["ranges"][1]["drives"] = [{"kind": "fall"}]
    assert saved(client, c)["ranges"][1]["drives"] == []


def test_a_fall_drive_may_be_set_to_part_of_the_way(client: TestClient) -> None:
    c = hung()
    c["ranges"][1]["drives"] = [{"kind": "fall", "shape": "s_scarf", "atMin": 0, "atMax": 60}]
    drive = saved(client, c)["ranges"][1]["drives"][0]
    assert drive["atMin"] == 0.0 and drive["atMax"] == 60.0


def test_point_weights_stay_between_none_and_full(client: TestClient) -> None:
    c = hung()
    c["shapes"][4]["pts"][3]["w"] = 7
    c["shapes"][4]["pts"][2]["w"] = -2
    out = saved(client, c)
    assert [p.get("w") for p in out["shapes"][4]["pts"]][2:] == [0.0, 1.0]


# --------------------------------------------------------------------------- publishing


def test_a_complete_model_publishes(client: TestClient) -> None:
    publishes(client, hung())


def test_a_crease_that_fades_with_a_missing_slider_is_refused(client: TestClient) -> None:
    c = hung()
    c["shapes"][3]["opBy"]["slider"] = "r_gone"
    assert "Shape Crease fades with a slider that does not exist." in refused(client, c)


def test_a_fall_drive_on_a_missing_shape_is_refused(client: TestClient) -> None:
    c = hung()
    c["ranges"][1]["drives"][0]["shape"] = "s_gone"
    assert "Slider Fall moves a shape that does not exist." in refused(client, c)


def test_a_fall_drive_on_a_twin_is_refused(client: TestClient) -> None:
    c = hung()
    c["shapes"].append(shape("s_twin", "Scarf (right)", pts=[], mirrorOf="s_scarf"))
    c["objects"][2]["shapes"].append("s_twin")
    c["ranges"][1]["drives"][0]["shape"] = "s_twin"
    assert "Slider Fall moves a shape that is a twin; move the original instead." in refused(client, c)
