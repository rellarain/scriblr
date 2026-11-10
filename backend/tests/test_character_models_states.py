"""Group states of the character models (phase D3b): a named switch on a group (Open or Closed, Front or Back) whose options each set slider values, switch objects and
groups off and choose forms. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_HIDDEN_MAX, MODEL_STATE_OPTIONS_MAX, MODEL_STATES_MAX
from tests.test_character_models_api import content, entry_of, save, shape


def handed(**over) -> dict:
    """A Hand group of two objects (a palm and a finger, the finger with an axis of two forms), a slider that curls it, and a state Grip: Open sets nothing, Closed curls
    the hand and switches the finger off."""
    base = content(
        "Adult",
        shapes=[shape("s_palm", "Palm"), shape("s_finger", "Finger")],
        objects=[
            {"id": "o_palm", "name": "Palm", "layer": "body", "shapes": ["s_palm"]},
            {"id": "o_finger", "name": "Finger", "layer": "body", "shapes": ["s_finger"], "axes": [{"id": "a_bend", "name": "Bend", "initial": "f_straight", "options": [{"id": "f_straight", "name": "Straight", "ovr": []}, {"id": "f_bent", "name": "Bent", "ovr": []}]}]},
        ],
        groups=[{
            "id": "g_hand", "name": "Hand", "parent": None, "objects": ["o_palm", "o_finger"],
            "states": [{"id": "st_grip", "name": "Grip", "options": [
                {"id": "op_open", "name": "Open"},
                {"id": "op_closed", "name": "Closed", "values": {"r_curl": 80}, "hidden": ["o_palm"], "forms": {"o_finger.a_bend": "f_bent"}},
            ]}],
        }],
        ranges=[{"id": "r_curl", "name": "Curl", "min": 0, "rest": 0, "max": 100}],
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


def hand(c: dict) -> dict:
    return next(g for g in c["groups"] if g["id"] == "g_hand")


def test_an_older_model_loads_with_no_states(client: TestClient) -> None:
    out = saved(client, content("Adult", shapes=[shape("s1")], objects=[{"id": "o1", "name": "O", "layer": "body", "shapes": ["s1"]}], groups=[{"id": "g1", "name": "G", "parent": None, "objects": ["o1"]}]))
    assert out["groups"][0]["states"] == []


def test_a_state_round_trips_with_its_options(client: TestClient) -> None:
    out = saved(client, handed())
    [grip] = hand(out)["states"]
    assert grip["name"] == "Grip" and [o["name"] for o in grip["options"]] == ["Open", "Closed"]
    assert grip["options"][0] == {"id": "op_open", "name": "Open", "values": {}, "hidden": [], "forms": {}}
    assert grip["options"][1] == {"id": "op_closed", "name": "Closed", "values": {"r_curl": 80.0}, "hidden": ["o_palm"], "forms": {"o_finger.a_bend": "f_bent"}}


def test_a_state_with_no_option_is_dropped_and_repeated_ids_keep_the_first(client: TestClient) -> None:
    c = handed()
    hand(c)["states"] = [
        {"id": "st_empty", "name": "Empty", "options": []},
        {"id": "st_grip", "name": "Grip", "options": [{"id": "a", "name": "A"}, {"id": "a", "name": "Again"}, {"id": "b", "name": "B"}]},
        {"id": "st_grip", "name": "Repeated", "options": [{"id": "z", "name": "Z"}]},
        "not a state",
    ]
    states = hand(saved(client, c))["states"]
    assert [s["id"] for s in states] == ["st_grip"]
    assert [o["name"] for o in states[0]["options"]] == ["A", "B"]


def test_an_option_is_repaired_not_refused(client: TestClient) -> None:
    c = handed()
    hand(c)["states"][0]["options"][1] = {
        "id": "op_closed", "name": "  " + "x" * 80,
        "values": {"r_curl": 5000, "bad id!": 3, "r_x": "high", "r_y": True},
        "hidden": ["o_palm", "o_palm", "bad id!", 7],
        "forms": {"o_finger.a_bend": "f_bent", "ab": "f_x", "o_finger.a_bend2": 4},
    }
    option = hand(saved(client, c))["states"][0]["options"][1]
    assert option["name"] == "x" * 40
    assert option["values"] == {"r_curl": 1000.0}
    assert option["hidden"] == ["o_palm"]
    assert option["forms"] == {"o_finger.a_bend": "f_bent"}
    c = handed()
    hand(c)["states"] = "nothing"
    assert hand(saved(client, c))["states"] == []


def test_the_counts_have_a_most(client: TestClient) -> None:
    def refuses(change) -> None:
        c = handed()
        change(c)
        assert save(client, {"id": "m1", "draft": c}).status_code == 422

    refuses(lambda c: hand(c).update(states=[{"id": f"s{i}", "name": "S", "options": [{"id": "a", "name": "A"}]} for i in range(MODEL_STATES_MAX + 1)]))
    refuses(lambda c: hand(c)["states"][0].update(options=[{"id": f"o{i}", "name": "O"} for i in range(MODEL_STATE_OPTIONS_MAX + 1)]))
    refuses(lambda c: hand(c)["states"][0]["options"][1].update(hidden=[f"h{i}" for i in range(MODEL_HIDDEN_MAX + 1)]))
    ok = handed()
    hand(ok)["states"] = [{"id": f"s{i}", "name": "S", "options": [{"id": f"o{j}", "name": "O"} for j in range(MODEL_STATE_OPTIONS_MAX)]} for i in range(MODEL_STATES_MAX)]
    assert len(hand(saved(client, ok))["states"]) == MODEL_STATES_MAX


def test_a_model_that_is_whole_publishes(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": handed()})
    assert client.post("/api/character-models/m1/publish").status_code == 200


def test_publish_refuses_an_option_that_names_something_that_is_not_there(client: TestClient) -> None:
    c = handed()
    hand(c)["states"][0]["options"][1]["values"] = {"r_gone": 10}
    assert "Option Closed of state Grip sets a slider that does not exist." in refused(client, c)
    c = handed()
    hand(c)["states"][0]["options"][1]["hidden"] = ["o_gone"]
    assert "Option Closed of state Grip switches off something that does not exist." in refused(client, c)
    c = handed()
    hand(c)["states"][0]["options"][1]["forms"] = {"o_finger.a_bend": "f_gone"}
    assert "Option Closed of state Grip chooses a form that does not exist." in refused(client, c)
    c = handed()
    hand(c)["states"][0]["options"][1]["forms"] = {"o_palm.a_bend": "f_bent"}      # an axis the object does not have
    assert "Option Closed of state Grip chooses a form that does not exist." in refused(client, c)


def test_a_twin_group_has_no_states_of_its_own(client: TestClient) -> None:
    c = handed()
    c["groups"].append({"id": "g_twin", "name": "Hand twin", "parent": None, "objects": [], "mirrorOf": "g_hand", "states": [{"id": "st_t", "name": "T", "options": [{"id": "a", "name": "A"}]}]})
    assert "Group Hand twin is a twin and has states of its own; give them to the original." in refused(client, c)
