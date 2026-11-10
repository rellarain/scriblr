"""Corner roundness and patterns of the character models (phase D4): a shape has a radius its sharp corners are rounded to (a form may change it), a pattern keeps marks inside a
base shape and is switched off by hiding its id, and a field may drive roundness. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_PATTERN_MARKS_MAX, MODEL_PATTERNS_MAX, MODEL_ROUND_MAX
from tests.test_character_models_api import content, entry_of, save, shape


def shirted(**over) -> dict:
    """A Shirt object of a base shape and two stripes, and a pattern Stripes of the two stripes on the base."""
    base = content(
        "Adult",
        shapes=[shape("s_shirt", "Shirt"), shape("s_stripe1", "Stripe 1"), shape("s_stripe2", "Stripe 2")],
        objects=[{"id": "o_shirt", "name": "Shirt", "layer": "clothing", "shapes": ["s_shirt", "s_stripe1", "s_stripe2"]}],
        groups=[{"id": "g_torso", "name": "Torso", "parent": None, "objects": ["o_shirt"]}],
        patterns=[{"id": "pt_stripes", "name": "Stripes", "base": "s_shirt", "marks": ["s_stripe1", "s_stripe2"]}],
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


def test_an_older_model_loads_with_sharp_corners_and_no_patterns(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "name": "O", "layer": "body", "shapes": ["s1"]}], groups=[{"id": "g1", "name": "G", "parent": None, "objects": ["o1"]}]))
    assert out["patterns"] == [] and out["shapes"][0]["round"] == 0


def test_a_roundness_is_a_whole_number_held_to_its_most(client: TestClient) -> None:
    c = shirted()
    c["shapes"][0]["round"] = 6.4
    c["shapes"][1]["round"] = 999
    c["shapes"][2]["round"] = -3
    out = saved(client, c)["shapes"]
    assert [s["round"] for s in out] == [6, MODEL_ROUND_MAX, 0]
    c["shapes"][0]["round"] = "round"
    c["shapes"][1]["round"] = True
    assert [s["round"] for s in saved(client, c)["shapes"]][:2] == [0, 0]


def test_a_form_may_change_the_roundness_of_a_shape_and_a_look_with_only_that_stays(client: TestClient) -> None:
    c = shirted()
    c["objects"][0]["axes"] = [{"id": "a_cut", "name": "Cut", "initial": "f_a", "options": [
        {"id": "f_a", "name": "Sharp", "ovr": []},
        {"id": "f_b", "name": "Soft", "ovr": [], "looks": [{"shape": "s_shirt", "round": 12}, {"shape": "s_stripe1", "round": 99}, {"shape": "s_stripe2"}]},
    ]}]
    looks = saved(client, c)["objects"][0]["axes"][0]["options"][1]["looks"]
    assert looks == [{"shape": "s_shirt", "slot": None, "gray": None, "tone": None, "round": 12}, {"shape": "s_stripe1", "slot": None, "gray": None, "tone": None, "round": MODEL_ROUND_MAX}]


def test_a_pattern_round_trips_and_is_repaired_not_refused(client: TestClient) -> None:
    out = saved(client, shirted())["patterns"]
    assert out == [{"id": "pt_stripes", "name": "Stripes", "base": "s_shirt", "marks": ["s_stripe1", "s_stripe2"]}]
    c = shirted()
    c["patterns"] = [
        {"id": "pt_a", "name": "  " + "x" * 80, "base": "s_shirt", "marks": ["s_stripe1", "s_stripe1", "bad id!", 7]},
        {"id": "pt_b", "name": "No base", "marks": []},
        {"id": "pt_a", "name": "Repeated id", "base": "s_shirt", "marks": []},
        "not a pattern",
    ]
    resp = save(client, {"id": "m1", "draft": c})
    assert resp.status_code == 422      # two patterns with one id: the whole model is refused, like any other repeated id
    c["patterns"] = c["patterns"][:2] + ["not a pattern"]
    out = saved(client, c)["patterns"]
    assert [p["id"] for p in out] == ["pt_a"]
    assert out[0]["name"] == "x" * 40 and out[0]["marks"] == ["s_stripe1"]
    c["patterns"] = "nothing"
    assert saved(client, c)["patterns"] == []


def test_the_counts_have_a_most(client: TestClient) -> None:
    def refuses(change) -> None:
        c = shirted()
        change(c)
        assert save(client, {"id": "m1", "draft": c}).status_code == 422

    refuses(lambda c: c.update(patterns=[{"id": f"p{i}", "name": "P", "base": "s_shirt"} for i in range(MODEL_PATTERNS_MAX + 1)]))
    refuses(lambda c: c["patterns"][0].update(marks=[f"m{i}" for i in range(MODEL_PATTERN_MARKS_MAX + 1)]))
    ok = shirted()
    ok["patterns"] = [{"id": f"p{i}", "name": "P", "base": "s_shirt"} for i in range(MODEL_PATTERNS_MAX)]
    assert len(saved(client, ok)["patterns"]) == MODEL_PATTERNS_MAX


def test_a_model_that_is_whole_publishes(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": shirted()})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_a_pattern_is_switched_off_by_hiding_it_like_an_object(client: TestClient) -> None:
    c = shirted()
    c["presets"] = [{"id": "p_plain", "name": "Plain", "kind": "Outfit", "hidden": ["pt_stripes"]}]
    c["groups"][0]["states"] = [{"id": "st_look", "name": "Look", "options": [{"id": "op_a", "name": "Plain", "hidden": ["pt_stripes"]}]}]
    save(client, {"id": "m1", "draft": c})
    assert client.post("/api/character-models/m1/publish").status_code == 200
    c["presets"][0]["hidden"] = ["pt_gone"]
    assert "Preset Plain hides something that does not exist." in refused(client, c)


def test_publish_refuses_a_pattern_with_a_base_or_a_mark_that_is_not_there(client: TestClient) -> None:
    def with_pattern(**over) -> dict:
        c = shirted()
        c["patterns"][0].update(over)
        return c

    assert "Pattern Stripes is on a shape that does not exist." in refused(client, with_pattern(base="s_gone"))
    assert "Pattern Stripes has a mark that does not exist." in refused(client, with_pattern(marks=["s_stripe1", "s_gone"]))
    assert "Pattern Stripes has its own base as a mark." in refused(client, with_pattern(marks=["s_shirt"]))


def test_publish_refuses_a_pattern_on_a_twin_or_with_a_twin_mark(client: TestClient) -> None:
    c = shirted()
    c["shapes"].append({"id": "s_twin", "name": "Twin", "pts": [], "mirrorOf": "s_shirt"})
    c["objects"][0]["shapes"].append("s_twin")
    c["patterns"][0]["base"] = "s_twin"
    assert "Pattern Stripes is on a twin; put it on the original." in refused(client, c)
    c = shirted()
    c["shapes"].append({"id": "s_twin", "name": "Twin", "pts": [], "mirrorOf": "s_stripe1"})
    c["objects"][0]["shapes"].append("s_twin")
    c["patterns"][0]["marks"] = ["s_twin"]
    assert "Pattern Stripes has a mark that is a twin; use the original." in refused(client, c)


def test_a_field_may_change_the_roundness_of_a_shape(client: TestClient) -> None:
    c = shirted()
    c["ranges"] = [{"id": "r_soft", "name": "Soft", "min": 0, "rest": 0, "max": 20, "drives": [{"kind": "prop", "feature": "shape", "shape": "s_shirt", "prop": "roundness", "atMin": 0, "atMax": 99}]}]
    c["fieldsets"] = [{"id": "fs_shirt", "name": "Shirt", "ownerKind": "object", "owner": "o_shirt", "feature": "shape", "target": "s_shirt", "ranges": ["r_soft"]}]
    out = saved(client, c)["ranges"][0]["drives"][0]
    assert (out["prop"], out["atMin"], out["atMax"]) == ("roundness", 0.0, 20.0)       # held to what the property allows
    c["ranges"][0]["drives"][0].update(feature="point", i=1)
    assert saved(client, c)["ranges"][0]["drives"] == []                                # a point has no roundness
