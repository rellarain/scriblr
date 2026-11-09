"""Classes and styles of the character models (phase 3b): a template object with members whose shapes follow the template's, families that show one member
at a time, and styles (presets that belong to an object or a group and keep form choices). Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_CLASSES_MAX, MODEL_MEMBERS_MAX, MODEL_PRESET_FORMS_MAX
from tests.test_character_models_api import content, entry_of, save, shape

WIDE = [{"x": 80, "y": 40, "m": "s"}, {"x": 120, "y": 40, "m": "s"}, {"x": 120, "y": 60, "m": "s"}, {"x": 80, "y": 60, "m": "s"}]


def eyes(**over) -> dict:
    """A head group with an Eye template (two shapes, one axis of forms) and two members: Round (follows the template, except that its pupil has an outline of its
    own) and Hooded (hides the pupil). A family; and a style of the head that picks the Round member and its wide form."""
    base = content(
        "Adult",
        shapes=[
            shape("s_eye", "Eye"), shape("s_pupil", "Pupil", pts=[{"x": 98, "y": 48, "m": "s"}, {"x": 102, "y": 48, "m": "s"}, {"x": 100, "y": 52, "m": "s"}]),
            shape("s_r_eye", "Eye", pts=[], copyOf="s_eye"), shape("s_r_pupil", "Pupil", pts=WIDE[:3], copyOf="s_pupil"),
            shape("s_h_eye", "Eye", pts=[], copyOf="s_eye"), shape("s_h_pupil", "Pupil", pts=[], copyOf="s_pupil", hide=True),
        ],
        objects=[
            {
                "id": "o_eye", "name": "Eye", "shapes": ["s_eye", "s_pupil"],
                "axes": [{"id": "a_shape", "name": "Eye shape", "initial": "f_std", "options": [{"id": "f_std", "name": "Standard", "ovr": []}, {"id": "f_wide", "name": "Wide", "ovr": [{"shape": "s_eye", "pts": WIDE}]}]}],
            },
            {"id": "o_round", "name": "Round eye", "shapes": ["s_r_eye", "s_r_pupil"], "classOf": "c_eye"},
            {"id": "o_hooded", "name": "Hooded eye", "shapes": ["s_h_eye", "s_h_pupil"], "classOf": "c_eye"},
        ],
        groups=[{"id": "g_head", "name": "Head", "parent": None, "objects": ["o_eye", "o_round", "o_hooded"]}],
        classes=[{"id": "c_eye", "name": "Eye", "template": "o_eye", "exclusive": True}],
        presets=[{"id": "p_sleepy", "name": "Sleepy", "kind": "Style", "scope": "g_head", "values": {}, "hidden": [], "forms": {"o_round.a_shape": "f_wide", "class:c_eye": "o_round"}}],
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


def test_an_older_model_loads_with_the_class_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "shapes": ["s1"]}], groups=[{"id": "g1", "objects": ["o1"]}], presets=[{"id": "p", "name": "P"}]))
    assert out["classes"] == [] and out["objects"][0]["classOf"] is None
    assert out["shapes"][0]["copyOf"] is None and out["shapes"][0]["hide"] is False
    assert out["presets"][0]["scope"] is None and out["presets"][0]["forms"] == {}


def test_classes_members_and_styles_round_trip(client: TestClient) -> None:
    out = saved(client, eyes())
    assert out["classes"] == [{"id": "c_eye", "name": "Eye", "template": "o_eye", "exclusive": True}]
    assert [o["classOf"] for o in out["objects"]] == [None, "c_eye", "c_eye"]
    by_id = {s["id"]: s for s in out["shapes"]}
    assert by_id["s_r_eye"]["copyOf"] == "s_eye" and by_id["s_r_eye"]["pts"] == []
    assert by_id["s_r_pupil"]["copyOf"] == "s_pupil" and len(by_id["s_r_pupil"]["pts"]) == 3
    assert by_id["s_h_pupil"]["hide"] is True and by_id["s_eye"]["hide"] is False
    assert out["presets"][0]["scope"] == "g_head" and out["presets"][0]["forms"] == {"o_round.a_shape": "f_wide", "class:c_eye": "o_round"}
    assert client.get("/api/character-models").json()["models"][0]["draft"] == out


def test_the_class_fields_are_repaired_not_refused(client: TestClient) -> None:
    c = eyes(classes=[
        {"id": "c_eye", "name": "  Eye  ", "template": "o_eye", "exclusive": "yes"},        # only true is true
        {"id": "c_no_template", "name": "No template"},
        {"template": "o_eye"},
        "not a class",
    ])
    c["objects"][1]["classOf"] = "bad id!"
    c["shapes"][2]["copyOf"] = 7
    c["shapes"][5]["hide"] = "yes"
    c["presets"][0]["scope"] = "bad id!"
    c["presets"][0]["forms"] = {"o_round.a_shape": "f_wide", "x": "f_wide", "o_round.a_shape2": "bad id!", "ok.key": 3}
    out = saved(client, c)
    assert out["classes"] == [{"id": "c_eye", "name": "Eye", "template": "o_eye", "exclusive": False}]
    assert out["objects"][1]["classOf"] is None and out["shapes"][2]["copyOf"] is None and out["shapes"][5]["hide"] is False
    assert out["presets"][0]["scope"] is None and out["presets"][0]["forms"] == {"o_round.a_shape": "f_wide"}


def test_two_classes_may_not_share_an_id(client: TestClient) -> None:
    c = eyes(classes=[{"id": "c", "template": "o_eye"}, {"id": "c", "template": "o_round"}])
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


def test_the_limits_are_stops_on_save(client: TestClient) -> None:
    assert save(client, {"id": "m1", "draft": eyes(classes=[{"id": f"c{i}", "template": "o_eye"} for i in range(MODEL_CLASSES_MAX + 1)])}).status_code == 422
    c = eyes()
    c["presets"][0]["forms"] = {f"o{i}.a{i}": "f" for i in range(MODEL_PRESET_FORMS_MAX + 1)}
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    assert save(client, {"id": "m1", "draft": eyes()}).status_code == 200


# --------------------------------------------------------------------------- what publish refuses


def test_a_model_with_a_class_and_a_style_publishes(client: TestClient) -> None:
    publishes(client, eyes())


def test_a_template_must_be_there_and_be_an_ordinary_object(client: TestClient) -> None:
    detail = refused(client, eyes(classes=[{"id": "c_eye", "name": "Eye", "template": "o_gone"}]))
    assert "Class Eye has a template that does not exist." in detail
    c = eyes(classes=[{"id": "c_eye", "name": "Eye", "template": "o_round", "exclusive": True}, {"id": "c_two", "name": "Two", "template": "o_round"}])
    detail = refused(client, c)
    assert "Class Eye has a template that is a member of a class." in detail
    assert "Object Round eye is the template of more than one class." in detail
    c = eyes()
    c["objects"].append({"id": "o_twin", "name": "Twin", "shapes": [], "mirrorOf": "o_eye"})
    c["classes"] = [{"id": "c_twin", "name": "Twin class", "template": "o_twin"}]
    c["groups"][0]["objects"].append("o_twin")
    assert "Class Twin class has a template that is a twin; use the original." in refused(client, c)


def test_a_member_must_belong_to_a_class_that_is_there(client: TestClient) -> None:
    c = eyes()
    c["objects"][1]["classOf"] = "c_gone"
    assert "Object Round eye is a member of a class that does not exist." in refused(client, c)
    c = eyes()
    c["objects"][0]["classOf"] = "c_eye"
    assert "Object Eye is a member of the class it is the template of." in refused(client, c)


def test_a_class_has_at_most_so_many_members(client: TestClient) -> None:
    c = eyes()
    for i in range(MODEL_MEMBERS_MAX):
        c["objects"].append({"id": f"o_m{i}", "name": f"M{i}", "shapes": [], "classOf": "c_eye"})
        c["groups"][0]["objects"].append(f"o_m{i}")
    assert f"Class Eye has more than {MODEL_MEMBERS_MAX} members." in refused(client, c)


def test_a_shape_may_only_copy_a_shape_of_the_template_from_inside_a_member(client: TestClient) -> None:
    c = eyes()
    c["shapes"][2]["copyOf"] = "s_gone"
    assert "Shape Eye copies a shape that does not exist." in refused(client, c)
    c = eyes()
    c["shapes"].append(shape("s_other", "Other"))
    c["objects"].append({"id": "o_other", "name": "Other", "shapes": ["s_other"]})
    c["groups"][0]["objects"].append("o_other")
    c["shapes"][2]["copyOf"] = "s_other"
    assert "Shape Eye copies a shape that is not in the template of its class." in refused(client, c)
    c = eyes()
    c["shapes"][0]["copyOf"] = "s_pupil"                                                    # a shape of the template itself
    assert "Shape Eye copies a shape but is not in a member of a class." in refused(client, c)


def test_a_shape_may_not_copy_a_twin(client: TestClient) -> None:
    c = eyes()
    c["shapes"].append(shape("s_eye2", "Eye twin", pts=[], mirrorOf="s_eye"))
    c["objects"][0]["shapes"].append("s_eye2")
    c["shapes"][2]["copyOf"] = "s_eye2"
    assert "Shape Eye copies a twin; copy the original." in refused(client, c)


def test_a_shape_that_follows_its_template_has_no_points_but_an_outline_of_its_own_needs_three(client: TestClient) -> None:
    c = eyes()
    c["shapes"][3]["pts"] = WIDE[:2]
    assert "Shape Pupil needs at least 3 points." in refused(client, c)
    c["shapes"][3]["pts"] = []
    publishes(client, c)                                                                      # follows the template's pupil: allowed
    c = eyes()
    c["shapes"].append(shape("s_loose", "Loose", pts=[]))
    c["objects"][0]["shapes"].append("s_loose")
    assert "Shape Loose needs at least 3 points." in refused(client, c)                       # an ordinary shape still does


def test_an_anchor_may_use_the_points_a_following_shape_has_through_its_template(client: TestClient) -> None:
    c = eyes()
    c["groups"].append({"id": "g_lash", "name": "Lash", "parent": "g_head", "objects": [], "pivot": [100, 50], "attach": {"shape": "s_r_eye", "kind": "point", "i": 3}})
    publishes(client, c)
    c["groups"][1]["attach"]["i"] = 4                                                         # the template's eye has four points
    assert "Group Lash is attached to a point that does not exist." in refused(client, c)


def test_a_style_needs_its_scope_and_the_forms_it_chooses(client: TestClient) -> None:
    c = eyes()
    c["presets"][0]["scope"] = "g_gone"
    assert "Preset Sleepy belongs to something that does not exist." in refused(client, c)
    c = eyes()
    c["presets"][0]["forms"] = {"o_round.a_shape": "f_gone", "o_round.a_gone": "f_wide", "class:c_gone": "o_round", "class:c_eye": "o_eye", "o_gone.a_shape": "f_wide"}
    detail = refused(client, c)
    assert detail.count("Preset Sleepy chooses a form that does not exist.") == 1           # said once per preset
    for good in ({"o_round.a_shape": "f_wide"}, {"o_eye.a_shape": "f_wide"}, {"class:c_eye": "o_hooded"}):
        c = eyes()
        c["presets"][0]["forms"] = good
        publishes(client, c)
