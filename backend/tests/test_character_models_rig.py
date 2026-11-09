"""The rig of the character models (phase 2a): pivots and anchors on groups, sliders (ranges) with their drives, the mirror axis, and what publish
refuses about them. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import (
    MODEL_CHAIN_MAX,
    MODEL_DRIVES_MAX,
    MODEL_RANGES_MAX,
    ModelContent,
)
from tests.test_character_models_api import SQUARE, complete, content, draft, entry_of, save, shape


def rig(**over) -> dict:
    """Torso with a neck shape, a head group hanging from it, and a head tilt slider turning the head."""
    base = content(
        "Adult",
        shapes=[shape("s_neck", "Neck"), shape("s_head", "Head")],
        objects=[
            {"id": "o_neck", "name": "Neck", "layer": "body", "shapes": ["s_neck"]},
            {"id": "o_head", "name": "Head", "layer": "body", "shapes": ["s_head"]},
        ],
        groups=[
            {"id": "g_torso", "name": "Torso", "parent": None, "objects": ["o_neck"], "pivot": [100, 150]},
            {"id": "g_head", "name": "Head", "parent": "g_torso", "objects": ["o_head"], "pivot": [100, 54], "attach": {"shape": "s_neck", "kind": "point", "i": 0}},
        ],
        ranges=[{"id": "r_tilt", "name": "Head tilt", "scope": "g_head", "min": -20, "rest": 0, "max": 20, "unit": "°", "drives": [{"kind": "turn", "group": "g_head", "atMin": -12, "atMax": 12}]}],
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


# --------------------------------------------------------------------------- what a save keeps


def test_a_p1_model_loads_with_the_rig_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, complete("Adult"))
    assert out["axis"] == 100.0 and out["ranges"] == []
    assert out["groups"][0]["pivot"] is None and out["groups"][0]["attach"] is None


def test_the_rig_round_trips(client: TestClient) -> None:
    out = saved(client, rig())
    head = next(g for g in out["groups"] if g["id"] == "g_head")
    assert head["pivot"] == [100.0, 54.0]
    assert head["attach"] == {"shape": "s_neck", "kind": "point", "i": 0, "t": 0.0, "slider": None, "rx": 0.5, "ry": 0.5}
    r = out["ranges"][0]
    assert (r["min"], r["rest"], r["max"], r["unit"], r["show"]) == (-20.0, 0.0, 20.0, "°", True)
    drive = r["drives"][0]
    assert (drive["kind"], drive["group"], drive["atMin"], drive["atMax"], drive["mirror"]) == ("turn", "g_head", -12.0, 12.0, True)
    assert client.get("/api/character-models").json()["models"][0]["draft"] == out


def test_a_slider_is_repaired_not_refused(client: TestClient) -> None:
    out = saved(client, rig(ranges=[{"id": "r1", "name": "  Size  ", "min": 50, "rest": 400, "max": 10, "unit": "cm", "rand": [200, 5]}]))
    r = out["ranges"][0]
    assert r["name"] == "Size" and r["unit"] == ""
    assert r["max"] > r["min"] and r["min"] <= r["rest"] <= r["max"]
    assert r["rand"][0] <= r["rand"][1] and r["min"] <= r["rand"][0] and r["rand"][1] <= r["max"]


def test_a_bad_slider_or_drive_is_dropped_and_its_siblings_stay(client: TestClient) -> None:
    out = saved(client, rig(ranges=[
        {"id": "ok", "name": "Ok", "min": 0, "rest": 0, "max": 10, "drives": [
            {"kind": "turn", "group": "g_head", "atMin": 0, "atMax": 5},
            {"kind": "turn"},                               # no group
            {"kind": "scale", "target": "group"},            # no id
            {"kind": "points"},                              # no shape
            {"kind": "wiggle", "group": "g_head"},          # unknown kind
        ]},
        {"min": 0, "max": 5},                                # no id
        "not a slider",
    ]))
    assert [r["id"] for r in out["ranges"]] == ["ok"]
    assert [d["kind"] for d in out["ranges"][0]["drives"]] == ["turn"]


def test_drive_amounts_are_held_to_sensible_ranges_and_scale_defaults_to_100(client: TestClient) -> None:
    out = saved(client, rig(ranges=[{"id": "r1", "name": "A", "min": 0, "rest": 0, "max": 10, "drives": [
        {"kind": "turn", "group": "g_head", "atMin": -9999, "atMax": 9999},
        {"kind": "scale", "target": "model"},
        {"kind": "scale", "target": "shape", "id": "s_head", "axis": "sideways", "atMax": 5000, "atMin": 0},
        {"kind": "bend", "shape": "s_head", "y0": 90, "y1": 20, "atMax": 30},
    ]}]))
    turn, model_scale, shape_scale, bend = out["ranges"][0]["drives"]
    assert (turn["atMin"], turn["atMax"]) == (-360.0, 360.0)
    assert (model_scale["atMin"], model_scale["atMax"]) == (100.0, 100.0)
    assert shape_scale["axis"] == "xy" and shape_scale["atMin"] == 5.0 and shape_scale["atMax"] == 1000.0
    assert bend["y0"] == 20.0 and bend["y1"] == 90.0 and bend["pivot"] == [100.0, 200.0]


def test_point_moves_are_kept_and_clamped(client: TestClient) -> None:
    out = saved(client, rig(ranges=[{"id": "r1", "name": "Shoulders", "min": 0, "rest": 0, "max": 10, "drives": [
        {"kind": "points", "shape": "s_head", "sym": True, "moves": [{"i": 2, "dx": 3.5, "dy": -1}, {"i": 999, "dx": 5000, "dxMin": -2}, "junk"]},
    ]}]))
    moves = out["ranges"][0]["drives"][0]["moves"]
    assert len(moves) == 2 and moves[0]["dx"] == 3.5
    assert moves[1]["i"] < 60 and moves[1]["dx"] == 200.0 and moves[1]["dxMin"] == -2.0


def test_a_broken_anchor_is_dropped_and_the_pivot_is_repaired(client: TestClient) -> None:
    c = rig()
    c["groups"][1]["attach"] = {"kind": "edge"}            # no shape
    c["groups"][1]["pivot"] = ["x", 3]
    out = saved(client, c)
    head = next(g for g in out["groups"] if g["id"] == "g_head")
    assert head["attach"] is None and head["pivot"] == [100.0, 3.0]   # a pivot is repaired part by part, as a point is


def test_the_mirror_axis_is_held_between_40_and_160(client: TestClient) -> None:
    assert saved(client, rig(axis=500))["axis"] == 160.0
    assert saved(client, rig(axis=-3))["axis"] == 40.0
    assert saved(client, rig(axis="left"))["axis"] == 100.0
    assert saved(client, rig(axis=96.5))["axis"] == 96.5


def test_two_sliders_cannot_share_an_id(client: TestClient) -> None:
    c = rig(ranges=[{"id": "r1", "name": "A"}, {"id": "r1", "name": "B"}])
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


def test_sliders_and_drives_stop_at_their_limits(client: TestClient) -> None:
    many = [{"id": f"r{i}", "name": f"R{i}", "min": 0, "rest": 0, "max": 1} for i in range(MODEL_RANGES_MAX)]
    assert save(client, {"id": "m1", "draft": rig(ranges=many)}).status_code == 200
    assert save(client, {"id": "m1", "draft": rig(ranges=many + [{"id": "extra", "name": "X"}])}).status_code == 422
    drives = [{"kind": "turn", "group": "g_head", "atMin": -1, "atMax": 1} for _ in range(MODEL_DRIVES_MAX)]
    assert save(client, {"id": "m1", "draft": rig(ranges=[{"id": "r", "name": "R", "drives": drives}])}).status_code == 200
    assert save(client, {"id": "m1", "draft": rig(ranges=[{"id": "r", "name": "R", "drives": drives + drives[:1]}])}).status_code == 422


def test_the_content_model_has_the_same_fields_as_what_is_saved() -> None:
    assert {"axis", "ranges"} <= set(ModelContent.model_fields)


# --------------------------------------------------------------------------- what publish refuses


def test_a_rigged_model_publishes(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": rig()})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def chain(depth: int) -> dict:
    groups = [{"id": f"g{i}", "name": f"G{i}", "parent": None if i == 0 else f"g{i - 1}", "objects": ["o1"] if i == 0 else []} for i in range(depth)]
    return {**complete("Adult"), "groups": groups}


def test_a_pivot_chain_of_six_is_fine_and_seven_is_refused(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": chain(MODEL_CHAIN_MAX)})
    assert client.post("/api/character-models/m1/publish").status_code == 200
    detail = refused(client, chain(MODEL_CHAIN_MAX + 1))
    assert f"7 levels deep" in detail and f"at most {MODEL_CHAIN_MAX}" in detail


def test_an_anchor_must_point_at_a_shape_of_an_ancestor(client: TestClient) -> None:
    def with_attach(attach: dict, parent: str | None = "g_torso") -> dict:
        c = rig()
        c["groups"][1]["attach"] = attach
        c["groups"][1]["parent"] = parent
        return c

    assert "shape that does not exist" in refused(client, with_attach({"shape": "gone", "kind": "point"}))
    assert "not in its parent group or one above it" in refused(client, with_attach({"shape": "s_head", "kind": "point"}))
    assert "has no parent group" in refused(client, with_attach({"shape": "s_neck", "kind": "point"}, parent=None))
    assert "point that does not exist" in refused(client, with_attach({"shape": "s_neck", "kind": "point", "i": 30}))
    assert "edge that does not exist" in refused(client, with_attach({"shape": "s_neck", "kind": "edge", "i": 30}))
    assert "slider that does not exist" in refused(client, with_attach({"shape": "s_neck", "kind": "range", "i": 0, "slider": "nope"}))
    save(client, {"id": "m1", "draft": with_attach({"shape": "s_neck", "kind": "range", "i": 1, "slider": "r_tilt"})})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_a_slider_must_drive_things_that_exist(client: TestClient) -> None:
    def with_drive(drive: dict) -> dict:
        c = rig()
        c["ranges"][0]["drives"] = [drive]
        return c

    assert "turns a group that does not exist" in refused(client, with_drive({"kind": "turn", "group": "gone", "atMax": 3}))
    assert "scales something that does not exist" in refused(client, with_drive({"kind": "scale", "target": "shape", "id": "gone", "atMax": 120}))
    assert "scales something that does not exist" in refused(client, with_drive({"kind": "scale", "target": "group", "id": "s_head", "atMax": 120}))
    assert "moves a shape that does not exist" in refused(client, with_drive({"kind": "bend", "shape": "gone", "y0": 0, "y1": 9}))
    assert "no longer there" in refused(client, with_drive({"kind": "points", "shape": "s_head", "moves": [{"i": 9, "dx": 1}]}))
    for ok in (
        {"kind": "scale", "target": "model", "atMax": 110},
        {"kind": "scale", "target": "group", "id": "g_head", "atMax": 120},
        {"kind": "points", "shape": "s_head", "moves": [{"i": len(SQUARE) - 1, "dx": 1}]},
    ):
        save(client, {"id": "m1", "draft": with_drive(ok)})
        assert client.post("/api/character-models/m1/publish").status_code == 200, ok


def test_the_published_copy_carries_the_rig(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": rig()})
    client.post("/api/character-models/m1/publish")
    published = client.get("/api/character-models/published").json()["models"][0]["content"]
    assert published["ranges"][0]["drives"][0]["group"] == "g_head"
    assert published["groups"][1]["attach"]["shape"] == "s_neck"


def test_draft_helper_still_builds_models(client: TestClient) -> None:
    assert save(client, draft("m2", "Other")).status_code == 200
