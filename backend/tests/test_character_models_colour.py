"""Colour of the character models (phase 4): genre tags, the starter palette, colour slots with their default colours and ranges, and the slot (or fixed gray)
a shape is painted from. Same pretend app data as test_character_models_api.py."""

from fastapi.testclient import TestClient

from app.storage.schema import (
    MODEL_COLOURS_MAX,
    MODEL_GENRES_MAX,
    MODEL_PALETTE_MAX,
    MODEL_SLOTS_MAX,
)
from tests.test_character_models_api import complete, entry_of, save


def painted(**over) -> dict:
    """A publishable model whose one shape is painted from a Skin slot: two default colours (one for every genre, one only for Fantasy), a starter palette."""
    base = complete()
    base["shapes"][0]["slot"] = "k_skin"
    base.update(
        genres=[{"id": "g_fic", "name": "Fiction"}, {"id": "g_fan", "name": "Fantasy"}],
        palette=[{"id": "p1", "name": "Warm", "h": 24, "s": 46}, {"id": "p2", "name": "Moss", "h": 104, "s": 30}],
        slots=[{
            "id": "k_skin", "name": "Skin", "lMin": 18, "lRest": 60, "lMax": 92, "aMin": 100, "aRest": 100, "aMax": 100,
            "colours": [{"id": "c_fair", "name": "Fair", "hex": "#f6dcc8", "genres": []}, {"id": "c_green", "name": "Orc green", "hex": "#5b8a3a", "genres": ["g_fan"]}],
        }],
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


def test_an_older_model_loads_with_the_colour_fields_at_their_defaults(client: TestClient) -> None:
    out = saved(client, complete())
    assert out["genres"] == [] and out["palette"] == [] and out["slots"] == []
    assert out["shapes"][0]["slot"] is None and out["shapes"][0]["gray"] is None


def test_colour_round_trips(client: TestClient) -> None:
    out = saved(client, painted())
    assert [g["name"] for g in out["genres"]] == ["Fiction", "Fantasy"]
    assert out["palette"] == [{"id": "p1", "name": "Warm", "h": 24, "s": 46}, {"id": "p2", "name": "Moss", "h": 104, "s": 30}]
    skin = out["slots"][0]
    assert (skin["lMin"], skin["lRest"], skin["lMax"]) == (18, 60, 92)
    assert [(c["name"], c["hex"], c["genres"]) for c in skin["colours"]] == [("Fair", "#f6dcc8", []), ("Orc green", "#5b8a3a", ["g_fan"])]
    assert out["shapes"][0]["slot"] == "k_skin"


def test_a_fixed_gray_is_kept_and_held_to_0_100(client: TestClient) -> None:
    c = painted()
    c["shapes"][0]["slot"] = None
    c["shapes"][0]["gray"] = 100
    assert saved(client, c)["shapes"][0]["gray"] == 100
    c["shapes"][0]["gray"] = 250
    assert saved(client, c)["shapes"][0]["gray"] == 100
    c["shapes"][0]["gray"] = "white"
    assert saved(client, c)["shapes"][0]["gray"] is None


def test_values_are_repaired_not_refused(client: TestClient) -> None:
    c = painted(
        palette=[{"id": "p1", "h": 400, "s": -5}],
        slots=[{
            "id": "k_skin", "name": "  Skin  ", "lMin": 90, "lRest": 99, "lMax": 20, "aMin": "x",
            "colours": [{"id": "c1", "hex": "#ABCDEF", "genres": ["g_fic", "g_fic", "no way!"]}, {"id": "c2", "hex": "red"}, {"id": "c1", "hex": "#000000"}],
        }],
    )
    out = saved(client, c)
    assert out["palette"] == [{"id": "p1", "name": "", "h": 359, "s": 0}]   # hue and saturation are clamped
    skin = out["slots"][0]
    assert skin["name"] == "Skin"
    assert (skin["lMin"], skin["lRest"], skin["lMax"]) == (90, 90, 90)      # the largest cannot be under the smallest; rest sits between
    assert (skin["aMin"], skin["aRest"], skin["aMax"]) == (100, 100, 100)   # a value that is not a number is the default
    assert [(x["id"], x["hex"], x["genres"]) for x in skin["colours"]] == [("c1", "#abcdef", ["g_fic"]), ("c2", "#808080", [])]   # a repeated colour id is dropped


def test_a_bad_entry_is_dropped_and_its_siblings_stay(client: TestClient) -> None:
    c = painted(slots=[{"id": "bad id!", "name": "No"}, {"id": "k_ok", "name": "Hair"}], palette=[{"name": "no id"}, {"id": "p1", "h": 1, "s": 1}], genres=["Fantasy", {"id": "g1", "name": "Fantasy"}])
    c["shapes"][0]["slot"] = None
    out = saved(client, c)
    assert [s["id"] for s in out["slots"]] == ["k_ok"]
    assert [p["id"] for p in out["palette"]] == ["p1"]
    assert [g["id"] for g in out["genres"]] == ["g1"]


def test_two_of_a_kind_may_not_share_an_id(client: TestClient) -> None:
    for field, items in (("slots", [{"id": "k1", "name": "A"}, {"id": "k1", "name": "B"}]), ("palette", [{"id": "p1"}, {"id": "p1"}]), ("genres", [{"id": "g1"}, {"id": "g1"}])):
        c = painted(**{field: items})
        c["shapes"][0]["slot"] = None
        assert save(client, {"id": "m1", "draft": c}).status_code == 422, field


# --------------------------------------------------------------------------- limits


def test_the_limits_are_refused_on_save(client: TestClient) -> None:
    def too_many(field: str, n: int, make) -> None:
        c = painted()
        c[field] = [make(i) for i in range(n)]
        c["shapes"][0]["slot"] = None
        assert save(client, {"id": "m1", "draft": c}).status_code == 422, field

    too_many("palette", MODEL_PALETTE_MAX + 1, lambda i: {"id": f"p{i}", "h": i, "s": 10})
    too_many("slots", MODEL_SLOTS_MAX + 1, lambda i: {"id": f"k{i}", "name": f"S{i}"})
    too_many("genres", MODEL_GENRES_MAX + 1, lambda i: {"id": f"g{i}", "name": f"G{i}"})
    c = painted()
    c["slots"][0]["colours"] = [{"id": f"c{i}", "hex": "#101010"} for i in range(MODEL_COLOURS_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422
    # exactly the most is fine
    ok = painted(palette=[{"id": f"p{i}", "h": i, "s": 10} for i in range(MODEL_PALETTE_MAX)])
    assert len(saved(client, ok)["palette"]) == MODEL_PALETTE_MAX


# --------------------------------------------------------------------------- publish


def test_a_painted_model_publishes_and_the_published_copy_carries_the_colour(client: TestClient) -> None:
    publishes(client, painted())
    published = client.get("/api/character-models/published").json()["models"][0]["content"]
    assert published["slots"][0]["colours"][1]["hex"] == "#5b8a3a"
    assert published["palette"][0]["h"] == 24
    assert published["shapes"][0]["slot"] == "k_skin"


def test_a_shape_may_not_use_a_slot_that_does_not_exist(client: TestClient) -> None:
    c = painted()
    c["shapes"][0]["slot"] = "k_gone"
    assert "uses a colour slot that does not exist" in refused(client, c)


def test_a_colour_may_not_fit_a_genre_that_does_not_exist(client: TestClient) -> None:
    c = painted()
    c["slots"][0]["colours"][1]["genres"] = ["g_gone"]
    detail = refused(client, c)
    assert "Orc green" in detail and "fits a genre that does not exist" in detail


def test_a_model_with_no_colour_at_all_still_publishes(client: TestClient) -> None:
    publishes(client, complete())
