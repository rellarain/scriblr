"""Paint effects of the character models (phase 4b): tones, a derived tone, shading shapes, gradients, blend modes, clips and cut-outs, helper shapes, and what
a form may change in the paint of its shapes. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_LOOKS_MAX, MODEL_SHADES_MAX
from tests.test_character_models_api import content, entry_of, save, shape

BAND = [{"x": 90, "y": 40, "m": "s"}, {"x": 96, "y": 40, "m": "s"}, {"x": 96, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]


def painted(**over) -> dict:
    """A publishable model: a head with a Skin slot, a hole shape (a helper) and a shadow band, all in one object, and an eye object with a form that
    changes the iris paint."""
    base = content(
        "Adult",
        shapes=[
            shape("s_head", "Head", slot="k_skin", cut=["s_hole"], grad={"dir": "radial", "to": "k_hair"}, blend="multiply", tone=1),
            shape("s_hole", "Hole", pts=[dict(p) for p in BAND], helper=True),
            shape("s_shadow", "Shadow", pts=[dict(p) for p in BAND], slot="k_skin", shade={"kind": "shadow", "t": 0.2}, clip="s_head"),
            shape("s_iris", "Iris", slot="k_eye"),
        ],
        objects=[
            {"id": "o_head", "name": "Head", "layer": "body", "shapes": ["s_head", "s_hole", "s_shadow"]},
            {
                "id": "o_eye", "name": "Eye", "layer": "body", "shapes": ["s_iris"],
                "axes": [{
                    "id": "a_col", "name": "Colour", "initial": "f_a",
                    "options": [
                        {"id": "f_a", "name": "Plain", "ovr": []},
                        {"id": "f_b", "name": "Dark", "ovr": [], "looks": [{"shape": "s_iris", "slot": "k_hair", "tone": -1}]},
                    ],
                }],
            },
        ],
        groups=[{"id": "g1", "name": "Head", "parent": None, "objects": ["o_head", "o_eye"]}],
        slots=[
            {"id": "k_skin", "name": "Skin", "lMin": 10, "lRest": 60, "lMax": 90, "colours": []},
            {"id": "k_hair", "name": "Hair", "lMin": 5, "lRest": 30, "lMax": 90, "colours": []},
            {"id": "k_eye", "name": "Eye", "lMin": 10, "lRest": 40, "lMax": 80, "colours": []},
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


def publishes(client: TestClient, c: dict) -> None:
    save(client, {"id": "m1", "draft": c})
    resp = client.post("/api/character-models/m1/publish")
    assert resp.status_code == 200, resp.text


def by_id(c: dict, sid: str) -> dict:
    return next(s for s in c["shapes"] if s["id"] == sid)


# --------------------------------------------------------------------------- what a save keeps


def test_an_older_model_loads_with_the_paint_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}]))
    s = out["shapes"][0]
    assert (s["tone"], s["derive"], s["shade"], s["grad"], s["blend"], s["clip"], s["cut"], s["helper"]) == (0, None, None, None, None, None, [], False)


def test_paint_effects_round_trip(client: TestClient) -> None:
    out = saved(client, painted())
    head = by_id(out, "s_head")
    assert head["tone"] == 1 and head["blend"] == "multiply" and head["cut"] == ["s_hole"]
    assert head["grad"] == {"dir": "radial", "to": "k_hair"}
    assert by_id(out, "s_hole")["helper"] is True
    shadow = by_id(out, "s_shadow")
    assert shadow["shade"] == {"kind": "shadow", "t": 0.2} and shadow["clip"] == "s_head"
    look = out["objects"][1]["axes"][0]["options"][1]["looks"]
    assert look == [{"shape": "s_iris", "slot": "k_hair", "gray": None, "tone": -1, "round": None}]


def test_derived_tones_round_trip_and_are_held_to_their_range(client: TestClient) -> None:
    c = painted()
    by_id(c, "s_iris")["derive"] = {"kind": "highlight", "t": 0.5}
    assert by_id(saved(client, c), "s_iris")["derive"] == {"kind": "highlight", "t": 0.5}
    by_id(c, "s_iris")["derive"] = {"kind": "mid", "t": 5}
    assert by_id(saved(client, c), "s_iris")["derive"] == {"kind": "mid", "t": 0.8}
    by_id(c, "s_iris")["derive"] = {"kind": "mid", "t": 0}
    assert by_id(saved(client, c), "s_iris")["derive"]["t"] == 0.02
    by_id(c, "s_iris")["derive"] = {"kind": "nonsense", "t": "x"}
    assert by_id(saved(client, c), "s_iris")["derive"] == {"kind": "shadow", "t": 0.12}
    by_id(c, "s_iris")["derive"] = "dark"
    assert by_id(saved(client, c), "s_iris")["derive"] is None


def test_values_are_repaired_not_refused(client: TestClient) -> None:
    c = painted()
    head = by_id(c, "s_head")
    head.update(tone=9, blend="wobble", grad={"dir": "sideways", "to": "no way!"}, clip="not an id!", cut=["s_hole", "s_hole", "bad id", 7], helper="yes")
    out = by_id(saved(client, c), "s_head")
    assert out["tone"] == 2   # held to -2..2
    assert out["blend"] is None
    assert out["grad"] == {"dir": "down", "to": None}
    assert out["clip"] is None
    assert out["cut"] == ["s_hole"]   # duplicates and bad ids are dropped
    assert out["helper"] is False   # only a real true counts
    head["tone"] = "x"
    assert by_id(saved(client, c), "s_head")["tone"] == 0


def test_a_cut_list_is_held_to_its_limit(client: TestClient) -> None:
    c = painted()
    by_id(c, "s_head")["cut"] = [f"c{i}" for i in range(20)]
    assert len(by_id(saved(client, c), "s_head")["cut"]) == 8


def test_a_look_that_changes_nothing_is_dropped_and_a_slot_wins_over_a_gray(client: TestClient) -> None:
    c = painted()
    form = c["objects"][1]["axes"][0]["options"][1]
    form["looks"] = [{"shape": "s_iris"}, {"shape": "s_iris", "slot": "k_hair", "gray": 20}, {"shape": "s_iris", "tone": 1}]
    looks = saved(client, c)["objects"][1]["axes"][0]["options"][1]["looks"]
    assert looks == [{"shape": "s_iris", "slot": "k_hair", "gray": None, "tone": None, "round": None}]   # one per shape: the first valid one stays
    form["looks"] = [{"shape": "s_iris", "gray": 250, "tone": 7}]
    assert saved(client, c)["objects"][1]["axes"][0]["options"][1]["looks"] == [{"shape": "s_iris", "slot": None, "gray": 100, "tone": 2, "round": None}]


def test_too_many_looks_are_refused(client: TestClient) -> None:
    c = painted()
    c["objects"][1]["axes"][0]["options"][1]["looks"] = [{"shape": f"s{i}", "tone": 1} for i in range(MODEL_LOOKS_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


# --------------------------------------------------------------------------- what publish refuses


def test_a_model_with_paint_effects_publishes(client: TestClient) -> None:
    publishes(client, painted())


def test_a_clip_to_nothing_is_refused(client: TestClient) -> None:
    c = painted()
    by_id(c, "s_shadow")["clip"] = "s_gone"
    assert "Shape Shadow is clipped to a shape that does not exist." in refused(client, c)
    by_id(c, "s_shadow")["clip"] = "s_shadow"
    assert "Shape Shadow is clipped to itself." in refused(client, c)


def test_a_cut_by_nothing_is_refused(client: TestClient) -> None:
    c = painted()
    by_id(c, "s_head")["cut"] = ["s_gone"]
    assert "Shape Head is cut by a shape that does not exist." in refused(client, c)
    by_id(c, "s_head")["cut"] = ["s_head"]
    assert "Shape Head is cut by itself." in refused(client, c)


def test_a_gradient_to_a_slot_that_is_gone_is_refused(client: TestClient) -> None:
    c = painted()
    by_id(c, "s_head")["grad"] = {"dir": "down", "to": "k_gone"}
    assert "Shape Head has a gradient to a colour slot that does not exist." in refused(client, c)
    by_id(c, "s_head")["grad"] = {"dir": "down", "to": None}   # a darker tone of its own colour needs no slot
    publishes(client, c)


def test_a_form_may_only_change_the_paint_of_its_own_objects_shapes(client: TestClient) -> None:
    c = painted()
    form = c["objects"][1]["axes"][0]["options"][1]
    form["looks"] = [{"shape": "s_head", "tone": 1}]
    assert "Form Dark of Eye changes the paint of a shape that is not in the object." in refused(client, c)
    form["looks"] = [{"shape": "s_gone", "tone": 1}]
    assert "changes the paint of a shape that is not in the object" in refused(client, c)


def test_a_form_may_not_change_the_paint_of_a_twin(client: TestClient) -> None:
    c = painted()
    c["shapes"].append(shape("s_twin", "Twin", pts=[], mirrorOf="s_iris"))
    c["objects"][1]["shapes"].append("s_twin")
    c["objects"][1]["axes"][0]["options"][1]["looks"] = [{"shape": "s_twin", "tone": 1}]
    assert "Form Dark of Eye changes the paint of a twin; change the original instead." in refused(client, c)


def test_a_form_may_only_paint_from_a_slot_that_exists(client: TestClient) -> None:
    c = painted()
    c["objects"][1]["axes"][0]["options"][1]["looks"] = [{"shape": "s_iris", "slot": "k_gone"}]
    assert "Form Dark of Eye paints shape Iris from a colour slot that does not exist." in refused(client, c)


def test_an_object_may_have_at_most_ten_shading_shapes(client: TestClient) -> None:
    c = painted()
    extra = [shape(f"s_x{i}", f"Shade {i}", pts=[dict(p) for p in BAND], shade={"kind": "mid", "t": 0.1}) for i in range(MODEL_SHADES_MAX)]
    c["shapes"].extend(extra)
    c["objects"][0]["shapes"].extend(s["id"] for s in extra)   # the model's own shadow makes 11
    assert f"Object Head has more than {MODEL_SHADES_MAX} shading shapes." in refused(client, c)
    c["objects"][0]["shapes"] = c["objects"][0]["shapes"][:-1]   # ten
    publishes(client, c)


def test_a_twin_of_a_shading_shape_is_not_counted(client: TestClient) -> None:
    c = painted()
    extra = [shape(f"s_x{i}", f"Shade {i}", pts=[dict(p) for p in BAND], shade={"kind": "mid", "t": 0.1}) for i in range(MODEL_SHADES_MAX - 1)]
    twins = [shape(f"s_t{i}", f"Twin {i}", pts=[], mirrorOf=f"s_x{i}", shade={"kind": "mid", "t": 0.1}) for i in range(MODEL_SHADES_MAX - 1)]
    c["shapes"].extend(extra + twins)
    c["objects"][0]["shapes"].extend(s["id"] for s in extra + twins)
    publishes(client, c)   # ten originals (the model's own shadow and nine), nine twins that follow them
