"""Authored fields of the character models (phase D3c): a `prop` drive changes one property of a feature (a whole shape, one point or one edge of a shape, a whole object), and a
fieldset gathers the sliders of one feature for an owner (an object, a group, a variant or a style). Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_FIELDS_MAX, MODEL_FIELDSETS_MAX, MODEL_PROPS
from tests.test_character_models_api import content, entry_of, save, shape


def prop_range(rid: str = "r_wide", **drive) -> dict:
    d = {"kind": "prop", "feature": "shape", "shape": "s_nose", "prop": "width", "atMin": 60, "atMax": 160, **drive}
    return {"id": rid, "name": "Wide", "min": -50, "rest": 0, "max": 50, "drives": [d]}


def nosed(**over) -> dict:
    """A Nose object of one shape, a slider that widens it, and a fieldset of that slider, owned by the object."""
    base = content(
        "Adult",
        shapes=[shape("s_nose", "Nose shape")],
        objects=[{"id": "o_nose", "name": "Nose", "layer": "body", "shapes": ["s_nose"]}],
        groups=[{"id": "g_head", "name": "Head", "parent": None, "objects": ["o_nose"]}],
        ranges=[prop_range()],
        fieldsets=[{"id": "fs_nose", "name": "Nose", "ownerKind": "object", "owner": "o_nose", "feature": "shape", "target": "s_nose", "ranges": ["r_wide"]}],
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


def test_an_older_model_loads_with_no_fieldsets_and_no_prop_on_its_drives(client: TestClient) -> None:
    c = nosed(fieldsets=[], ranges=[{"id": "r1", "name": "Turn", "min": 0, "rest": 0, "max": 10, "drives": [{"kind": "turn", "group": "g_head", "atMax": 5}]}])
    out = saved(client, c)
    assert out["fieldsets"] == []
    assert out["ranges"][0]["drives"][0] | {} == {**out["ranges"][0]["drives"][0], "feature": None, "prop": None, "i": 0}


def test_a_prop_drive_and_its_fieldset_round_trip(client: TestClient) -> None:
    out = saved(client, nosed())
    [r] = out["ranges"]
    assert r["drives"][0]["kind"] == "prop" and r["drives"][0]["feature"] == "shape" and r["drives"][0]["prop"] == "width"
    assert (r["drives"][0]["atMin"], r["drives"][0]["atMax"], r["drives"][0]["i"]) == (60.0, 160.0, 0)
    assert out["fieldsets"] == [{"id": "fs_nose", "name": "Nose", "ownerKind": "object", "owner": "o_nose", "feature": "shape", "target": "s_nose", "i": 0, "ranges": ["r_wide"]}]


def test_the_amounts_default_to_the_amount_at_rest_and_are_held_to_what_the_property_allows(client: TestClient) -> None:
    c = nosed()
    c["ranges"] = [
        prop_range("r_a", prop="width", atMin=None, atMax=None),
        prop_range("r_b", prop="width", atMin=1, atMax=99999),
        prop_range("r_c", prop="opacity", atMin=-5, atMax=500),
        prop_range("r_d", prop="rotation", atMin=-9999, atMax=9999),
    ]
    for d in (c["ranges"][0]["drives"][0],):
        d.pop("atMin"), d.pop("atMax")
    a, b, c3, d = (r["drives"][0] for r in saved(client, c)["ranges"])
    assert (a["atMin"], a["atMax"]) == (100.0, 100.0)        # a size is 100 % at rest
    assert (b["atMin"], b["atMax"]) == (5.0, 1000.0)
    assert (c3["atMin"], c3["atMax"]) == (0.0, 100.0)
    assert (d["atMin"], d["atMax"]) == (-360.0, 360.0)
    positional = prop_range("r_e", prop="x")
    positional["drives"][0].pop("atMin"), positional["drives"][0].pop("atMax")
    c["ranges"] = [positional]
    e = saved(client, c)["ranges"][0]["drives"][0]
    assert (e["atMin"], e["atMax"]) == (0.0, 0.0)          # a move is nothing at rest


def test_every_property_belongs_to_the_features_that_have_it(client: TestClient) -> None:
    assert MODEL_PROPS["offset"][0] == ("edge",) and "point" in MODEL_PROPS["x"][0] and "point" not in MODEL_PROPS["width"][0]
    c = nosed()
    # a point has x and y; an edge has offset; a shape or an object has the rest. A property a feature does not have drops the drive, and so the slider's drive list.
    c["ranges"] = [
        prop_range("r_px", feature="point", prop="x", i=3),
        prop_range("r_e", feature="edge", prop="offset", i=1),
        prop_range("r_o", feature="object", shape=None, id="o_nose", prop="fillHue"),
        prop_range("r_bad1", feature="point", prop="width"),
        prop_range("r_bad2", feature="edge", prop="x"),
        prop_range("r_bad3", feature="shape", prop="offset"),
        prop_range("r_bad4", feature="shape", prop="nonsense"),
        prop_range("r_bad5", feature="object", shape=None, id=None, prop="width"),
        prop_range("r_bad6", feature="shape", shape=None, prop="width"),
    ]
    out = {r["id"]: r["drives"] for r in saved(client, c)["ranges"]}
    assert [d["i"] for d in out["r_px"]] == [3] and [d["i"] for d in out["r_e"]] == [1]
    assert out["r_o"][0]["id"] == "o_nose" and out["r_o"][0]["i"] == 0
    assert all(out[k] == [] for k in ("r_bad1", "r_bad2", "r_bad3", "r_bad4", "r_bad5", "r_bad6"))


def test_a_fieldset_is_repaired_not_refused(client: TestClient) -> None:
    c = nosed()
    c["fieldsets"] = [
        {"id": "fs_a", "name": "  " + "x" * 80, "ownerKind": "robot", "owner": "o_nose", "feature": "dial", "target": "s_nose", "i": 4, "ranges": ["r_wide", "r_wide", "bad id!", 7]},
        {"id": "fs_b", "name": "Point", "ownerKind": "object", "owner": "o_nose", "feature": "point", "target": "s_nose", "i": 2, "ranges": []},
        {"id": "fs_c", "name": "No target", "ownerKind": "object", "owner": "o_nose", "feature": "shape", "ranges": []},
        "not a fieldset",
    ]
    out = saved(client, c)["fieldsets"]
    assert [f["id"] for f in out] == ["fs_a", "fs_b"]
    a, b = out
    assert a["name"] == "x" * 40 and a["ownerKind"] == "object" and a["feature"] == "shape" and a["i"] == 0 and a["ranges"] == ["r_wide"]
    assert b["feature"] == "point" and b["i"] == 2
    c["fieldsets"] = "nothing"
    assert saved(client, c)["fieldsets"] == []


def test_the_counts_have_a_most(client: TestClient) -> None:
    def refuses(change) -> None:
        c = nosed()
        change(c)
        assert save(client, {"id": "m1", "draft": c}).status_code == 422

    refuses(lambda c: c.update(fieldsets=[{"id": f"f{i}", "name": "F", "owner": "o_nose", "target": "s_nose"} for i in range(MODEL_FIELDSETS_MAX + 1)]))
    refuses(lambda c: c["fieldsets"][0].update(ranges=[f"r{i}" for i in range(MODEL_FIELDS_MAX + 1)]))
    refuses(lambda c: c.update(fieldsets=[c["fieldsets"][0], c["fieldsets"][0]]))      # two fieldsets with one id
    ok = nosed()
    ok["fieldsets"] = [{"id": f"f{i}", "name": "F", "owner": "o_nose", "target": "s_nose"} for i in range(MODEL_FIELDSETS_MAX)]
    assert len(saved(client, ok)["fieldsets"]) == MODEL_FIELDSETS_MAX


def test_a_model_that_is_whole_publishes(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": nosed()})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_a_fieldset_may_belong_to_an_object_a_group_or_a_preset(client: TestClient) -> None:
    c = nosed()
    c["presets"] = [{"id": "p_elder", "name": "Elder", "kind": "Age"}]
    c["fieldsets"] = [
        {"id": "f_o", "name": "O", "ownerKind": "object", "owner": "o_nose", "feature": "shape", "target": "s_nose", "ranges": ["r_wide"]},
        {"id": "f_g", "name": "G", "ownerKind": "group", "owner": "g_head", "feature": "shape", "target": "s_nose", "ranges": ["r_wide"]},
        {"id": "f_p", "name": "P", "ownerKind": "preset", "owner": "p_elder", "feature": "shape", "target": "s_nose", "ranges": ["r_wide"]},
    ]
    save(client, {"id": "m1", "draft": c})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_publish_refuses_a_slider_that_changes_something_that_is_not_there(client: TestClient) -> None:
    c = nosed()
    c["ranges"] = [prop_range(shape="s_gone")]
    assert "Slider Wide changes a property of a shape that does not exist." in refused(client, c)
    c = nosed()
    c["ranges"] = [prop_range(feature="object", shape=None, id="o_gone", prop="opacity")]
    assert "Slider Wide changes a property of an object that does not exist." in refused(client, c)
    c = nosed()
    c["ranges"] = [prop_range(feature="point", prop="x", i=9)]
    assert "Slider Wide changes a point of Nose shape that is no longer there." in refused(client, c)
    c = nosed()
    c["ranges"] = [prop_range(feature="edge", prop="offset", i=9)]
    assert "Slider Wide changes an edge of Nose shape that is no longer there." in refused(client, c)


def test_publish_refuses_a_property_of_a_twin(client: TestClient) -> None:
    c = nosed()
    c["shapes"].append({"id": "s_twin", "name": "Twin", "pts": [], "mirrorOf": "s_nose"})
    c["objects"].append({"id": "o_twin", "name": "Twin", "layer": "body", "shapes": ["s_twin"], "mirrorOf": "o_nose"})
    c["groups"][0]["objects"].append("o_twin")
    c["ranges"] = [prop_range(shape="s_twin")]
    assert "Slider Wide changes a property of a twin; change the original instead." in refused(client, c)
    c["ranges"] = [prop_range(feature="object", shape=None, id="o_twin", prop="opacity")]
    assert "Slider Wide changes a property of a twin object; change the original instead." in refused(client, c)


def test_publish_refuses_a_fieldset_whose_owner_or_feature_is_not_there(client: TestClient) -> None:
    def with_fieldset(**over) -> dict:
        c = nosed()
        c["fieldsets"][0].update(over)
        return c

    assert "Fieldset Nose belongs to something that does not exist." in refused(client, with_fieldset(owner="o_gone"))
    assert "Fieldset Nose belongs to something that does not exist." in refused(client, with_fieldset(ownerKind="group", owner="o_nose"))     # an object id is not a group
    assert "Fieldset Nose belongs to something that does not exist." in refused(client, with_fieldset(ownerKind="preset", owner="p_gone"))
    assert "Fieldset Nose is bound to a shape that does not exist." in refused(client, with_fieldset(target="s_gone"))
    assert "Fieldset Nose is bound to an object that does not exist." in refused(client, with_fieldset(feature="object", target="o_gone"))
    assert "Fieldset Nose is bound to a point that does not exist." in refused(client, with_fieldset(feature="point", i=9))
    assert "Fieldset Nose is bound to an edge that does not exist." in refused(client, with_fieldset(feature="edge", i=9))


def test_publish_refuses_a_fieldset_bound_to_a_twin(client: TestClient) -> None:
    c = nosed()
    c["shapes"].append({"id": "s_twin", "name": "Twin", "pts": [], "mirrorOf": "s_nose"})
    c["objects"][0]["shapes"].append("s_twin")
    c["fieldsets"][0]["target"] = "s_twin"
    assert "Fieldset Nose is bound to a twin; bind the original." in refused(client, c)


def test_publish_refuses_a_fieldset_slider_that_is_not_there_or_changes_another_feature(client: TestClient) -> None:
    c = nosed()
    c["fieldsets"][0]["ranges"] = ["r_wide", "r_gone"]
    assert "Fieldset Nose lists a slider that does not exist." in refused(client, c)
    c = nosed()
    c["ranges"] = [{"id": "r_wide", "name": "Wide", "min": 0, "rest": 0, "max": 10, "drives": [{"kind": "turn", "group": "g_head", "atMax": 5}]}]
    assert "Slider Wide of fieldset Nose does not change a property of its feature." in refused(client, c)
    c = nosed()
    c["ranges"] = [prop_range(feature="point", prop="x", i=1)]       # the slider changes a point, the fieldset is of the whole shape
    assert "Slider Wide of fieldset Nose does not change a property of its feature." in refused(client, c)
    c = nosed()
    c["ranges"] = [prop_range(feature="object", shape=None, id="o_nose", prop="width")]
    assert "Slider Wide of fieldset Nose does not change a property of its feature." in refused(client, c)
    c = nosed()
    c["fieldsets"][0].update(feature="point", i=2)
    c["ranges"] = [prop_range(feature="point", prop="y", i=1)]       # the right feature, the wrong point
    assert "Slider Wide of fieldset Nose does not change a property of its feature." in refused(client, c)
