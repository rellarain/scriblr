import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import character_models_store as store
from app.storage.schema import (
    MODEL_COPY_MAX_BYTES,
    MODEL_HISTORY_MAX,
    MODEL_OBJECTS_PER_GROUP_MAX,
    MODEL_POINTS_MAX,
    MODEL_SHAPES_PER_OBJECT_MAX,
    ModelContent,
)

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]


def shape(sid: str, name: str = "", pts=None, **over) -> dict:
    # a copy of the points: a test that edits a shape's points (links, handles) must not edit them for every other test
    return {"id": sid, "name": name, "pts": [dict(p) for p in SQUARE] if pts is None else pts, **over}


def content(name: str, **over) -> dict:
    return {"name": name, "description": "", "shapes": [], "objects": [], "groups": [], **over}


def draft(mid: str, name: str, **over) -> dict:
    return {"id": mid, "draft": content(name, **over)}


def save(client: TestClient, *items: dict):
    return client.put("/api/character-models", json={"models": list(items)})


def entry_of(body: dict, mid: str) -> dict:
    return next(e for e in body["models"] if e["id"] == mid)


def complete(name: str = "Adult") -> dict:
    """A model that can be published: one shape in one object in one group."""
    return content(
        name,
        shapes=[shape("s1", "Head")],
        objects=[{"id": "o1", "name": "Head", "layer": "body", "shapes": ["s1"]}],
        groups=[{"id": "g1", "name": "Head", "parent": None, "objects": ["o1"]}],
    )


# --------------------------------------------------------------------------- the catalog


def test_a_fresh_install_has_no_model(client: TestClient) -> None:
    body = client.get("/api/character-models").json()
    assert body == {"schemaVersion": 1, "models": []}
    assert client.get("/api/character-models/published").json() == {"models": []}


def test_a_corrupt_file_is_quarantined_and_reported(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "character-models.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/character-models").status_code == 409
    assert client.get("/api/character-models").status_code == 200  # the next load starts from an empty catalog


def test_the_file_sits_beside_the_presets(client: TestClient, app_data_root: Path) -> None:
    client.get("/api/character-models")
    assert (app_data_root / "character-models.json").exists()


# --------------------------------------------------------------------------- drafts


def test_save_drafts_keeps_the_order_and_a_new_model_is_unpublished(client: TestClient) -> None:
    body = save(client, draft("m_b", "Beta"), draft("m_a", "Alpha")).json()
    assert [m["id"] for m in body["models"]] == ["m_b", "m_a"]
    for m in body["models"]:
        assert m["published"] is None and m["history"] == [] and m["nextVersion"] == 1
    assert client.get("/api/character-models").json() == body


def test_save_trims_names_and_repairs_points(client: TestClient) -> None:
    pts = [{"x": 1e9, "y": "nope", "m": "weird", "hi": [1, 2, 3], "ho": [5, 6]}, {"x": 1, "y": 2}, {"x": 3, "y": 4}]
    body = save(client, draft("m1", "  Adult  ", shapes=[shape("s1", " Head ", pts=pts, op=7, z=-5, view="up")])).json()
    c = entry_of(body, "m1")["draft"]
    assert c["name"] == "Adult"
    s = c["shapes"][0]
    assert s["name"] == "Head" and s["op"] == 1.0 and s["z"] == 0.0 and s["view"] == "both"
    p = s["pts"][0]
    assert p["x"] == 250.0 and p["y"] == 0.0 and p["m"] == "c"      # clamped to the model space, a non-number is the default, an unknown mode is curve
    assert p["hi"] is None and p["ho"] == [5.0, 6.0]                 # a handle is two numbers or nothing


def test_save_keeps_published_copies_and_history_and_deletes_a_model_left_out(client: TestClient) -> None:
    save(client, draft("m1", "One", **{k: complete("One")[k] for k in ("shapes", "objects", "groups")}), draft("m2", "Two"))
    assert client.post("/api/character-models/m1/publish").status_code == 200
    body = save(client, draft("m1", "One renamed", **{k: complete("One")[k] for k in ("shapes", "objects", "groups")})).json()
    assert [m["id"] for m in body["models"]] == ["m1"]
    m1 = entry_of(body, "m1")
    assert m1["published"]["content"]["name"] == "One" and m1["draft"]["name"] == "One renamed"


def test_two_models_cannot_share_an_id_and_a_model_cannot_repeat_an_id_inside(client: TestClient) -> None:
    assert save(client, draft("m1", "A"), draft("m1", "B")).status_code == 422
    assert save(client, draft("m1", "A", shapes=[shape("s1"), shape("s1")])).status_code == 422
    assert save(client, draft("bad id!", "A")).status_code == 422


# --------------------------------------------------------------------------- the limits


def test_points_per_shape_stop_at_the_limit(client: TestClient) -> None:
    ok = [{"x": i, "y": i % 7} for i in range(MODEL_POINTS_MAX)]
    assert save(client, draft("m1", "A", shapes=[shape("s1", pts=ok)])).status_code == 200
    assert save(client, draft("m1", "A", shapes=[shape("s1", pts=ok + [{"x": 1, "y": 1}])])).status_code == 422


def test_objects_per_group_and_shapes_per_object_stop_at_their_limits(client: TestClient) -> None:
    objs = [f"o{i}" for i in range(MODEL_OBJECTS_PER_GROUP_MAX)]
    g = lambda ids: [{"id": "g1", "name": "G", "parent": None, "objects": ids}]  # noqa: E731
    assert save(client, draft("m1", "A", groups=g(objs))).status_code == 200
    assert save(client, draft("m1", "A", groups=g(objs + ["extra"]))).status_code == 422
    shapes_ok = [f"s{i}" for i in range(MODEL_SHAPES_PER_OBJECT_MAX)]
    o = lambda ids: [{"id": "o1", "name": "O", "layer": "body", "shapes": ids}]  # noqa: E731
    assert save(client, draft("m1", "A", objects=o(shapes_ok))).status_code == 200
    assert save(client, draft("m1", "A", objects=o(shapes_ok + ["extra"]))).status_code == 422


# --------------------------------------------------------------------------- publishing


def test_publish_freezes_the_draft_and_numbers_the_versions(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": complete("Adult")})
    body = client.post("/api/character-models/m1/publish").json()
    m = entry_of(body, "m1")
    assert m["published"]["version"] == 1 and m["nextVersion"] == 2 and m["history"] == []
    published = client.get("/api/character-models/published").json()["models"]
    assert [(p["id"], p["version"], p["content"]["name"]) for p in published] == [("m1", 1, "Adult")]
    # a later edit changes the draft only
    save(client, {"id": "m1", "draft": {**complete("Adult"), "description": "changed"}})
    assert client.get("/api/character-models/published").json()["models"][0]["content"]["description"] == ""
    again = client.post("/api/character-models/m1/publish").json()
    m = entry_of(again, "m1")
    assert m["published"]["version"] == 2 and [h["version"] for h in m["history"]] == [1]


def test_the_history_is_capped(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": complete("Adult")})
    for _ in range(MODEL_HISTORY_MAX + 4):
        body = client.post("/api/character-models/m1/publish").json()
    m = entry_of(body, "m1")
    assert len(m["history"]) == MODEL_HISTORY_MAX and m["published"]["version"] == MODEL_HISTORY_MAX + 4
    assert m["history"][0]["version"] == MODEL_HISTORY_MAX + 3   # newest first


def test_publish_refusals_say_what_to_fix(client: TestClient) -> None:
    def refused(**over) -> str:
        save(client, {"id": "m1", "draft": {**complete("Adult"), **over}})
        resp = client.post("/api/character-models/m1/publish")
        assert resp.status_code == 422, over
        return resp.json()["detail"]

    assert "needs a name" in refused(name="")
    assert "at least 3 points" in refused(shapes=[shape("s1", "Head", pts=SQUARE[:2])])
    assert "does not exist" in refused(objects=[{"id": "o1", "name": "Head", "layer": "body", "shapes": ["gone"]}])
    assert "more than one object" in refused(
        shapes=[shape("s1", "Head")],
        objects=[{"id": "o1", "name": "A", "layer": "body", "shapes": ["s1"]}, {"id": "o2", "name": "B", "layer": "body", "shapes": ["s1"]}],
        groups=[],
    )
    assert "does not exist" in refused(groups=[{"id": "g1", "name": "G", "parent": None, "objects": ["gone"]}])
    assert "more than one group" in refused(
        groups=[{"id": "g1", "name": "A", "parent": None, "objects": ["o1"]}, {"id": "g2", "name": "B", "parent": None, "objects": ["o1"]}],
    )
    assert "parent that does not exist" in refused(groups=[{"id": "g1", "name": "G", "parent": "nope", "objects": ["o1"]}])
    assert "circle" in refused(
        groups=[{"id": "g1", "name": "A", "parent": "g2", "objects": ["o1"]}, {"id": "g2", "name": "B", "parent": "g1", "objects": []}],
    )


def test_a_name_already_published_is_refused(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": complete("Adult")}, {"id": "m2", "draft": complete("adult")})
    assert client.post("/api/character-models/m1/publish").status_code == 200
    resp = client.post("/api/character-models/m2/publish")
    assert resp.status_code == 422 and "already published" in resp.json()["detail"]


def test_a_copy_over_the_size_limit_is_refused(app_data_root: Path) -> None:
    # 300 shapes of 60 points each is well past the limit once serialized with long names
    shapes = [{"id": f"s{i}", "name": "x" * 60, "pts": [{"x": j, "y": j % 9, "hi": [1.123456, 2.123456], "ho": [3.123456, 4.123456]} for j in range(60)]} for i in range(300)]
    c = ModelContent.model_validate({"name": "Big", "shapes": shapes})
    assert store.copy_bytes(c) > MODEL_COPY_MAX_BYTES
    assert any("KB" in f for f in store.publish_faults(c))
    small = ModelContent.model_validate(complete("Small"))
    assert store.copy_bytes(small) < 2000 and store.publish_faults(small) == []


def test_unpublish_keeps_the_versions_and_the_numbering(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": complete("Adult")})
    client.post("/api/character-models/m1/publish")
    body = client.post("/api/character-models/m1/unpublish").json()
    m = entry_of(body, "m1")
    assert m["published"] is None and [h["version"] for h in m["history"]] == [1] and m["nextVersion"] == 2
    assert client.get("/api/character-models/published").json() == {"models": []}
    assert client.post("/api/character-models/m1/unpublish").status_code == 409
    assert entry_of(client.post("/api/character-models/m1/publish").json(), "m1")["published"]["version"] == 2


def test_discard_puts_the_draft_back_and_a_never_published_model_is_cleared(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": complete("Adult")}, draft("m2", "Fresh", shapes=[shape("s1")]))
    client.post("/api/character-models/m1/publish")
    save(client, {"id": "m1", "draft": {**complete("Adult"), "description": "edited"}}, draft("m2", "Fresh", shapes=[shape("s1")]))
    body = client.post("/api/character-models/m1/discard").json()
    assert entry_of(body, "m1")["draft"]["description"] == ""
    cleared = entry_of(client.post("/api/character-models/m2/discard").json(), "m2")
    assert cleared["draft"]["name"] == "Fresh" and cleared["draft"]["shapes"] == []


def test_restore_brings_an_earlier_version_into_the_draft(client: TestClient) -> None:
    save(client, {"id": "m1", "draft": {**complete("Adult"), "description": "first"}})
    client.post("/api/character-models/m1/publish")
    save(client, {"id": "m1", "draft": {**complete("Adult"), "description": "second"}})
    client.post("/api/character-models/m1/publish")
    body = client.post("/api/character-models/m1/restore/1").json()
    m = entry_of(body, "m1")
    assert m["draft"]["description"] == "first" and m["published"]["version"] == 2     # not published again until Publish
    assert client.post("/api/character-models/m1/restore/9").status_code == 404


def test_unknown_models_are_404(client: TestClient) -> None:
    for action in ("publish", "unpublish", "discard", "restore/1"):
        assert client.post(f"/api/character-models/nope/{action}").status_code == 404


# --------------------------------------------------------------------------- the file


def test_the_catalog_round_trips_through_the_file(client: TestClient, app_data_root: Path) -> None:
    save(client, {"id": "m1", "draft": complete("Adult")})
    client.post("/api/character-models/m1/publish")
    raw = json.loads((app_data_root / "character-models.json").read_text(encoding="utf-8"))
    assert raw["schemaVersion"] == 1 and raw["models"][0]["published"]["version"] == 1
    assert client.get("/api/character-models").json() == raw
