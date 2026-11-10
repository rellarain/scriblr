"""Complete variants, locked colour parts and rearranged styles of the character models (phase D3a): a variant also turns on a style of each object and picks a
default colour of each slot, an object and a style hold parts (hue, saturation, lightness) of a slot's colour, and a style puts the shapes of its object in an order
of its own and may hide some of them. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_PRESET_FORMS_MAX, MODEL_SHAPES_PER_OBJECT_MAX, MODEL_SLOTS_MAX
from tests.test_character_models_api import content, entry_of, save, shape


def worn(**over) -> dict:
    """An Eye object with two shapes painted from an Eye slot, a style of it (one that hides the pupil and draws the iris last, with a lock on the slot's saturation)
    and a variant that turns that style on and picks a default colour."""
    base = content(
        "Adult",
        shapes=[shape("s_white", "White"), shape("s_iris", "Iris", slot="k_eye"), shape("s_pupil", "Pupil")],
        objects=[{"id": "o_eye", "name": "Eye", "layer": "body", "shapes": ["s_white", "s_iris", "s_pupil"], "hsl": {"k_eye": {"h": None, "s": 40, "l": None}}}],
        groups=[{"id": "g_head", "name": "Head", "parent": None, "objects": ["o_eye"]}],
        slots=[{"id": "k_eye", "name": "Eye", "lMin": 10, "lRest": 40, "lMax": 80, "aMin": 100, "aRest": 100, "aMax": 100,
                "colours": [{"id": "c_blue", "name": "Blue", "hex": "#3a6ea5", "genres": []}, {"id": "c_green", "name": "Green", "hex": "#4a8a4a", "genres": []}]}],
        presets=[
            {"id": "st_plain", "name": "Plain", "kind": "Style", "scope": "o_eye", "values": {}, "hidden": ["s_pupil"], "order": ["s_iris", "s_white"],
             "hsl": {"k_eye": {"h": 200, "s": None, "l": 55}}},
            {"id": "v_elder", "name": "Elder", "kind": "Age", "values": {}, "hidden": [], "styles": {"o_eye": "st_plain"}, "picks": {"k_eye": "c_green"}},
        ],
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


def preset(out: dict, pid: str) -> dict:
    return next(p for p in out["presets"] if p["id"] == pid)


# --------------------------------------------------------------------------- what a save keeps


def test_an_older_model_loads_with_the_new_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "name": "O", "layer": "body", "shapes": ["s1"]}],
                                presets=[{"id": "p1", "name": "Wave", "kind": "Pose", "values": {}, "hidden": []}]))
    assert out["objects"][0]["hsl"] == {}
    p = out["presets"][0]
    assert (p["styles"], p["picks"], p["hsl"], p["order"]) == ({}, {}, {}, [])


def test_the_variant_style_locks_and_order_round_trip(client: TestClient) -> None:
    out = saved(client, worn())
    assert out["objects"][0]["hsl"] == {"k_eye": {"h": None, "s": 40, "l": None}}
    elder, plain = preset(out, "v_elder"), preset(out, "st_plain")
    assert elder["styles"] == {"o_eye": "st_plain"} and elder["picks"] == {"k_eye": "c_green"}
    assert plain["hsl"] == {"k_eye": {"h": 200, "s": None, "l": 55}} and plain["order"] == ["s_iris", "s_white"] and plain["hidden"] == ["s_pupil"]


def test_locks_are_repaired_not_refused(client: TestClient) -> None:
    c = worn()
    c["objects"][0]["hsl"] = {
        "k_eye": {"h": 400, "s": -5, "l": "bright"},     # held to 0..359 and 0..100; a part that is not a number is free
        "k_none": {"h": None, "s": None, "l": None},      # locks nothing: dropped
        "k_bad": "red",                                   # not a lock: dropped
        "bad id!": {"h": 10},                             # not an id: dropped
    }
    assert saved(client, c)["objects"][0]["hsl"] == {"k_eye": {"h": 359, "s": 0, "l": None}}
    c = worn()
    c["objects"][0]["hsl"] = "none at all"
    assert saved(client, c)["objects"][0]["hsl"] == {}


def test_a_preset_s_new_maps_and_order_are_repaired(client: TestClient) -> None:
    c = worn()
    elder = preset(c, "v_elder")
    elder["styles"] = {"o_eye": "st_plain", "bad id!": "st_plain", "o_x": 7}
    elder["picks"] = {"k_eye": "c_green", "k_y": None}
    plain = preset(c, "st_plain")
    plain["order"] = ["s_iris", "s_iris", "s_white", 3]
    plain["hsl"] = {"k_eye": {"l": 55}, "k_z": {}}
    out = saved(client, c)
    assert preset(out, "v_elder")["styles"] == {"o_eye": "st_plain"} and preset(out, "v_elder")["picks"] == {"k_eye": "c_green"}
    assert preset(out, "st_plain")["order"] == ["s_iris", "s_white"]
    assert preset(out, "st_plain")["hsl"] == {"k_eye": {"h": None, "s": None, "l": 55}}
    c = worn()
    for key in ("styles", "picks", "hsl", "order"):
        preset(c, "v_elder")[key] = "nothing"
    out = saved(client, c)
    assert (preset(out, "v_elder")["styles"], preset(out, "v_elder")["order"]) == ({}, [])


def test_the_counts_have_a_most(client: TestClient) -> None:
    def refuses(change) -> None:
        c = worn()
        change(c)
        assert save(client, {"id": "m1", "draft": c}).status_code == 422

    refuses(lambda c: c["objects"][0].update(hsl={f"k{i}": {"h": 1} for i in range(MODEL_SLOTS_MAX + 1)}))
    refuses(lambda c: preset(c, "st_plain").update(hsl={f"k{i}": {"h": 1} for i in range(MODEL_SLOTS_MAX + 1)}))
    refuses(lambda c: preset(c, "v_elder").update(picks={f"k{i}": f"c{i}" for i in range(MODEL_SLOTS_MAX + 1)}))
    refuses(lambda c: preset(c, "v_elder").update(styles={f"o{i}": f"p{i}" for i in range(MODEL_PRESET_FORMS_MAX + 1)}))
    refuses(lambda c: preset(c, "st_plain").update(order=[f"s{i}" for i in range(MODEL_SHAPES_PER_OBJECT_MAX + 1)]))
    ok = worn()
    ok["objects"][0]["hsl"] = {f"k{i}": {"h": 1} for i in range(MODEL_SLOTS_MAX)}
    assert len(saved(client, ok)["objects"][0]["hsl"]) == MODEL_SLOTS_MAX


# --------------------------------------------------------------------------- what publish refuses


def test_a_model_that_is_whole_publishes(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": worn()})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_a_variant_turning_on_a_style_that_is_not_there_is_refused(client: TestClient) -> None:
    for bad in ({"o_eye": "st_gone"}, {"o_gone": "st_plain"}, {"o_eye": "v_elder"}):     # a missing style, a missing object, a preset that is no style of the object
        c = worn()
        preset(c, "v_elder")["styles"] = bad
        assert "Elder turns on a style that does not exist." in refused(client, c), bad


def test_a_variant_picking_a_colour_that_is_not_there_is_refused(client: TestClient) -> None:
    for bad in ({"k_eye": "c_gone"}, {"k_gone": "c_green"}):
        c = worn()
        preset(c, "v_elder")["picks"] = bad
        assert "Elder picks a colour that does not exist." in refused(client, c), bad


def test_a_lock_on_a_slot_that_is_not_there_is_refused(client: TestClient) -> None:
    c = worn()
    c["objects"][0]["hsl"] = {"k_gone": {"h": 10}}
    assert "Object Eye locks a colour of a slot that does not exist." in refused(client, c)
    c = worn()
    preset(c, "st_plain")["hsl"] = {"k_gone": {"h": 10}}
    assert "Preset Plain locks a colour of a slot that does not exist." in refused(client, c)


def test_an_order_with_shapes_of_another_object_is_refused(client: TestClient) -> None:
    c = worn()
    c["shapes"].append(shape("s_other", "Other"))
    preset(c, "st_plain")["order"] = ["s_iris", "s_other"]
    assert "Preset Plain puts shapes in order that are not in its object." in refused(client, c)
    c = worn()
    preset(c, "v_elder")["order"] = ["s_iris"]      # a variant has no object whose shapes it could order
    assert "Elder puts shapes in order that are not in its object." in refused(client, c)


def test_a_style_may_hide_shapes_of_its_object_and_nothing_else(client: TestClient) -> None:
    c = worn()
    c["shapes"].append(shape("s_other", "Other"))
    preset(c, "st_plain")["hidden"] = ["s_pupil", "s_other"]
    assert "Preset Plain hides something that does not exist." in refused(client, c)
    c = worn()
    preset(c, "v_elder")["hidden"] = ["s_pupil"]     # a variant hides objects and groups only
    assert "Elder hides something that does not exist." in refused(client, c)
