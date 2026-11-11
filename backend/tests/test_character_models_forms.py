"""Forms and presets of the character models (phase 3a): an object's axes of forms (alternate outlines of its shapes), named presets of slider values and hidden
objects, and what publish refuses about them. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_AXES_MAX, MODEL_FORMS_MAX, MODEL_HIDDEN_MAX, MODEL_KIND_MAX, MODEL_POINTS_MAX, MODEL_PRESETS_MAX
from tests.test_character_models_api import SQUARE, content, entry_of, save, shape

WIDE = [{"x": 80, "y": 40, "m": "s"}, {"x": 120, "y": 40, "m": "s"}, {"x": 120, "y": 60, "m": "s"}, {"x": 80, "y": 60, "m": "s"}]


def faced(**over) -> dict:
    """An eye object with two shapes and an axis of three forms: the base outline, a wider eye, and one with the pupil hidden."""
    base = content(
        "Adult",
        shapes=[shape("s_eye", "Eye"), shape("s_pupil", "Pupil", pts=[{"x": 98, "y": 48, "m": "s"}, {"x": 102, "y": 48, "m": "s"}, {"x": 100, "y": 52, "m": "s"}])],
        objects=[{
            "id": "o_eye", "name": "Eye", "layer": "body", "shapes": ["s_eye", "s_pupil"],
            "axes": [{
                "id": "a_shape", "name": "Eye shape", "initial": "f_std",
                "options": [
                    {"id": "f_std", "name": "Standard", "ovr": []},
                    {"id": "f_wide", "name": "Wide", "ovr": [{"shape": "s_eye", "pts": WIDE}]},
                    {"id": "f_shut", "name": "Shut", "ovr": [{"shape": "s_pupil", "pts": []}]},
                ],
            }],
        }],
        groups=[{"id": "g_head", "name": "Head", "parent": None, "objects": ["o_eye"]}],
        ranges=[{"id": "r_open", "name": "Open", "min": 0, "rest": 0, "max": 10}],
        presets=[{"id": "p_wave", "name": "Wave", "kind": "Pose", "values": {"r_open": 5}, "hidden": ["o_eye"]}],
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


def test_a_p2_model_loads_with_the_form_and_preset_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}]))
    assert out["objects"][0]["axes"] == [] and out["presets"] == []


def test_forms_and_presets_round_trip(client: TestClient) -> None:
    out = saved(client, faced())
    axis = out["objects"][0]["axes"][0]
    assert (axis["id"], axis["name"], axis["initial"]) == ("a_shape", "Eye shape", "f_std")
    assert [f["id"] for f in axis["options"]] == ["f_std", "f_wide", "f_shut"]
    assert axis["options"][1]["ovr"][0]["shape"] == "s_eye" and len(axis["options"][1]["ovr"][0]["pts"]) == 4
    assert axis["options"][2]["ovr"] == [{"shape": "s_pupil", "pts": []}]
    assert out["presets"] == [{"id": "p_wave", "name": "Wave", "kind": "Pose", "values": {"r_open": 5.0}, "hidden": ["o_eye"], "scope": None, "forms": {}, "fall": None, "grip": None, "styles": {}, "picks": {}, "hsl": {}, "order": []}]
    assert client.get("/api/character-models").json()["models"][0]["draft"] == out


def test_how_often_randomise_changes_an_axis_defaults_to_always_and_is_kept_between_zero_and_a_hundred(client: TestClient) -> None:
    assert saved(client, faced())["objects"][0]["axes"][0]["roll"] == 100            # a model saved before the field rolls every time
    for sent, kept in ((0, 0), (15, 15), (100, 100), (250, 100), (-3, 0), (14.6, 15), ("often", 100), (None, 100), (True, 100)):
        c = faced()
        c["objects"][0]["axes"][0]["roll"] = sent
        assert saved(client, c)["objects"][0]["axes"][0]["roll"] == kept, sent


def test_the_genres_an_axis_is_rolled_in_are_kept_repaired_and_must_exist(client: TestClient) -> None:
    c = faced()
    c["genres"] = [{"id": "g_a", "name": "A"}, {"id": "g_b", "name": "B"}]
    axis = c["objects"][0]["axes"][0]
    axis["genres"] = ["g_a", "g_a", "g_b", 5, "bad id!"]
    out = saved(client, c)["objects"][0]["axes"][0]
    assert out["genres"] == ["g_a", "g_b"]                                 # no repeats, no non-ids
    publishes(client, c)
    c["objects"][0]["axes"][0]["genres"] = ["g_gone"]
    assert "rolled in a genre that does not exist" in refused(client, c)
    c["objects"][0]["axes"][0]["genres"] = "all"
    assert saved(client, c)["objects"][0]["axes"][0]["genres"] == []


def test_an_axis_is_repaired_not_refused(client: TestClient) -> None:
    c = faced()
    axis = c["objects"][0]["axes"][0]
    axis["initial"] = "f_gone"
    axis["options"].append({"id": "f_std", "name": "Duplicate", "ovr": []})            # a second form with a taken id
    axis["options"][1]["ovr"].append({"shape": "s_eye", "pts": SQUARE})                  # a second override of one shape
    out = saved(client, c)["objects"][0]["axes"][0]
    assert out["initial"] == "f_std" and [f["id"] for f in out["options"]] == ["f_std", "f_wide", "f_shut"]
    assert [o["shape"] for o in out["options"][1]["ovr"]] == ["s_eye"] and len(out["options"][1]["ovr"][0]["pts"]) == 4   # the first one stays


def test_bad_axes_forms_and_overrides_are_dropped_one_by_one(client: TestClient) -> None:
    c = faced()
    c["objects"][0]["axes"] = [
        c["objects"][0]["axes"][0],
        {"id": "a_empty", "name": "No forms", "options": []},                              # an axis needs a form
        {"name": "No id", "options": [{"id": "f", "ovr": []}]},
        "not an axis",
    ]
    c["objects"][0]["axes"][0]["options"] = [c["objects"][0]["axes"][0]["options"][1], {"name": "no id"}, "nope"]
    c["objects"][0]["axes"][0]["options"][0]["ovr"] = [{"shape": "s_eye", "pts": SQUARE}, {"pts": SQUARE}, {"shape": "bad id!", "pts": []}, "x"]
    out = saved(client, c)["objects"][0]["axes"]
    assert [a["id"] for a in out] == ["a_shape"]
    assert [f["id"] for f in out[0]["options"]] == ["f_wide"] and out[0]["initial"] == "f_wide"
    assert [o["shape"] for o in out[0]["options"][0]["ovr"]] == ["s_eye"]


def test_a_form_outline_drops_bad_points_one_by_one(client: TestClient) -> None:
    c = faced()
    c["objects"][0]["axes"][0]["options"][1]["ovr"][0]["pts"] = [{"x": 1, "y": 1}, "bad", {"x": 5000, "y": -9000}]
    pts = saved(client, c)["objects"][0]["axes"][0]["options"][1]["ovr"][0]["pts"]
    assert len(pts) == 2 and pts[1]["x"] == 250.0 and pts[1]["y"] == -50.0                  # clamped into the model's space


def test_presets_are_repaired(client: TestClient) -> None:
    c = faced(presets=[
        {"id": "p1", "name": "  Smile  ", "kind": "  ", "values": {"r_open": "x", "bad key!": 3, "r_a": True, "r_b": 99999, "r_ok": 2}, "hidden": ["o_eye", "o_eye", "bad id!", 7]},
        {"id": "p2", "name": "Long", "kind": "K" * 60, "values": "nope", "hidden": "nope"},
        {"name": "No id"},
        "not a preset",
    ])
    out = saved(client, c)["presets"]
    assert [p["id"] for p in out] == ["p1", "p2"]
    assert out[0]["name"] == "Smile" and out[0]["kind"] == "Pose"
    assert out[0]["values"] == {"r_b": 1000.0, "r_ok": 2.0} and out[0]["hidden"] == ["o_eye"]
    assert out[1]["kind"] == "K" * MODEL_KIND_MAX and out[1]["values"] == {} and out[1]["hidden"] == []


def test_two_presets_may_not_share_an_id(client: TestClient) -> None:
    c = faced(presets=[{"id": "p1", "name": "A"}, {"id": "p1", "name": "B"}])
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


def test_the_limits_are_stops_on_save(client: TestClient) -> None:
    base = faced()
    c = faced()
    c["objects"][0]["axes"] = [{"id": f"a{i}", "name": f"A{i}", "options": [{"id": "f", "ovr": []}]} for i in range(MODEL_AXES_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    c = faced()
    c["objects"][0]["axes"][0]["options"] = [{"id": f"f{i}", "ovr": []} for i in range(MODEL_FORMS_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    assert save(client, {"id": "m1", "draft": faced(presets=[{"id": f"p{i}", "name": "P"} for i in range(MODEL_PRESETS_MAX + 1)])}).status_code == 422
    c = faced(presets=[{"id": "p", "name": "P", "hidden": [f"h{i}" for i in range(MODEL_HIDDEN_MAX + 1)]}])
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    c = faced()
    c["objects"][0]["axes"][0]["options"][1]["ovr"][0]["pts"] = [{"x": i, "y": i} for i in range(MODEL_POINTS_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    assert save(client, {"id": "m1", "draft": base}).status_code == 200


# --------------------------------------------------------------------------- what publish refuses


def test_a_model_with_forms_and_presets_publishes(client: TestClient) -> None:
    publishes(client, faced())


def test_a_form_may_change_only_shapes_of_its_own_object(client: TestClient) -> None:
    c = faced()
    c["shapes"].append(shape("s_other", "Other"))
    c["objects"][0]["axes"][0]["options"][1]["ovr"].append({"shape": "s_other", "pts": SQUARE})
    c["objects"][0]["axes"][0]["options"][2]["ovr"].append({"shape": "s_gone", "pts": SQUARE})
    detail = refused(client, c)
    assert detail.count("Form Wide of Eye changes a shape that is not in the object.") == 1
    assert "Form Shut of Eye changes a shape that is not in the object." in detail


def test_a_form_may_not_change_a_twin(client: TestClient) -> None:
    c = faced()
    c["shapes"].append(shape("s_eye2", "Eye (twin)", pts=[], mirrorOf="s_eye"))
    c["objects"][0]["shapes"].append("s_eye2")
    c["objects"][0]["axes"][0]["options"][1]["ovr"].append({"shape": "s_eye2", "pts": SQUARE})
    assert "Form Wide of Eye changes a twin; change the original instead." in refused(client, c)


def test_an_outline_is_empty_or_has_three_points(client: TestClient) -> None:
    c = faced()
    c["objects"][0]["axes"][0]["options"][1]["ovr"][0]["pts"] = SQUARE[:2]
    assert "Form Wide of Eye has an outline of fewer than 3 points for shape Eye." in refused(client, c)
    c["objects"][0]["axes"][0]["options"][1]["ovr"][0]["pts"] = []
    publishes(client, c)                                                                    # an empty outline hides the shape: allowed


def test_a_preset_may_only_set_sliders_and_hide_things_that_exist(client: TestClient) -> None:
    c = faced(presets=[{"id": "p", "name": "Smile", "values": {"r_open": 3, "r_gone": 1}, "hidden": ["o_eye", "o_gone"]}])
    detail = refused(client, c)
    assert "Preset Smile sets a slider that does not exist." in detail and "Preset Smile hides something that does not exist." in detail
    c = faced(presets=[{"id": "p", "name": "Hide the head", "hidden": ["g_head"]}])
    publishes(client, c)                                                                    # a group may be hidden too
