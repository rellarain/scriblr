"""The limits the admin sets for the writer's own models (phase 7b): GET and PUT /api/my-models/limits, each held between a floor and the admin's own limit, a model of the
writer's library refused at Publish when it is over one of them (a draft may be over), and the library kept to the number of models the admin allows. Same pretend app data as
test_my_models_api.py."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import character_models_store as store
from app.storage.schema import ModelContent, WriterModelLimits
from tests.test_character_models_api import complete, content, entry_of, shape
from tests.test_my_models_api import ADMIN, MINE, mine, save_mine

LIMITS = f"{MINE}/limits"
CEILINGS = {"points": 60, "shapesPerObject": 72, "objectsPerGroup": 48, "shapes": 800, "objects": 200, "groups": 120, "sliders": 120, "copyKb": 2048, "models": 100}


def set_limits(client: TestClient, **over: int) -> dict:
    return client.put(LIMITS, json={**CEILINGS, **over}).json()


def grown(name: str = "Wide", objects: int = 1, shapes_each: int = 1) -> dict:
    """A model with `objects` objects in one group, each of `shapes_each` four-point shapes."""
    shapes = [shape(f"s{o}_{i}", f"Shape {o}-{i}") for o in range(objects) for i in range(shapes_each)]
    objs = [{"id": f"o{o}", "name": f"Object {o}", "layer": "body", "shapes": [f"s{o}_{i}" for i in range(shapes_each)]} for o in range(objects)]
    return content(name, shapes=shapes, objects=objs, groups=[{"id": "g1", "name": "Body", "parent": None, "objects": [o["id"] for o in objs]}])


def detail(resp) -> str:  # type: ignore[no-untyped-def]
    assert resp.status_code == 422, resp.text
    return resp.json()["detail"]


# --------------------------------------------------------------------------- the limits themselves


def test_every_limit_starts_at_the_admins_own(client: TestClient, app_data_root: Path) -> None:
    assert client.get(LIMITS).json() == CEILINGS
    # reading them writes nothing
    assert not (app_data_root / "my-models-limits.json").exists()


def test_the_limits_are_kept_in_a_file_of_their_own_and_read_back(client: TestClient, app_data_root: Path) -> None:
    saved = set_limits(client, shapes=300, points=24, copyKb=600)
    assert saved == {**CEILINGS, "shapes": 300, "points": 24, "copyKb": 600}
    assert client.get(LIMITS).json() == saved
    assert (app_data_root / "my-models-limits.json").exists()
    # the library and the admin's catalog are untouched
    assert not (app_data_root / "my-models.json").exists() or "points" not in (app_data_root / "my-models.json").read_text(encoding="utf-8")
    assert client.get(ADMIN).json()["models"] == []


def test_a_limit_is_held_between_its_floor_and_the_admins_own(client: TestClient) -> None:
    held = set_limits(client, points=9999, shapes=0, objects=-4, sliders=-1, copyKb=1, models=0, groups=1000)
    assert held["points"] == 60          # the admin's limit is the ceiling
    assert held["shapes"] == 1           # a model needs a shape
    assert held["objects"] == 1
    assert held["sliders"] == 0          # a writer may be allowed none
    assert held["copyKb"] == 16
    assert held["models"] == 1
    assert held["groups"] == 120


def test_a_limit_that_is_not_a_number_is_the_admins_own(client: TestClient) -> None:
    # sent as text, since 1e400 is a number JSON allows and Python reads as infinity
    resp = client.put(LIMITS, content='{"points": "many", "shapes": null, "objects": true, "groups": 1e400, "sliders": 12.9}', headers={"Content-Type": "application/json"})
    assert resp.status_code == 200
    held = resp.json()
    assert held["points"] == 60 and held["shapes"] == 800 and held["objects"] == 200 and held["groups"] == 120
    assert held["sliders"] == 12      # a fraction is cut
    assert held["models"] == 100      # missing


def test_a_file_that_cannot_be_read_is_put_aside_and_the_ceilings_apply(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "my-models-limits.json").write_text("{ not json", encoding="utf-8")
    assert client.get(LIMITS).json() == CEILINGS
    assert list(app_data_root.glob("my-models-limits.corrupt-*.json"))


def test_the_limits_are_not_a_model_id(client: TestClient) -> None:
    # "limits" is a route, not a model; a model id always starts with my-
    assert client.get(LIMITS).status_code == 200
    assert client.post(f"{MINE}/limits/publish").status_code == 404


# --------------------------------------------------------------------------- publishing


def publish(client: TestClient, content_: dict, mid: str = "my-1"):  # type: ignore[no-untyped-def]
    save_mine(client, {"id": mid, "draft": content_})
    return client.post(f"{MINE}/{mid}/publish")


def test_a_model_at_a_limit_can_be_published_and_one_over_it_cannot(client: TestClient) -> None:
    set_limits(client, shapes=4)
    assert publish(client, grown(objects=2, shapes_each=2)).status_code == 200
    message = detail(publish(client, grown("Wider", objects=1, shapes_each=5), "my-2"))
    assert "The model has 5 shapes: the limit for a model of your own is 4." in message


def test_points_in_a_shape(client: TestClient) -> None:
    set_limits(client, points=3)
    message = detail(publish(client, complete()))
    assert "Shape Head has 4 points: the limit for a model of your own is 3." in message


def test_shapes_in_an_object_and_objects_in_a_group_and_the_totals(client: TestClient) -> None:
    set_limits(client, shapesPerObject=2, objectsPerGroup=2, objects=2, groups=1, sliders=0)
    message = detail(publish(client, grown(objects=3, shapes_each=3)))
    assert "Object Object 0 has 3 shapes: the limit for a model of your own is 2." in message
    assert "Group Body has 3 objects: the limit for a model of your own is 2." in message
    assert "The model has 3 objects: the limit for a model of your own is 2." in message
    # the group count is not over: one group, one allowed
    assert "groups:" not in message


def test_sliders(client: TestClient) -> None:
    set_limits(client, sliders=0)
    c = complete()
    c["ranges"] = [{"id": "r1", "name": "Tilt", "scope": "g1", "min": -10, "def": 0, "max": 10, "drives": []}]
    message = detail(publish(client, c))
    assert "The model has 1 sliders: the limit for a model of your own is 0." in message
    set_limits(client, sliders=1)
    assert publish(client, c).status_code == 200


def test_the_size_of_a_characters_copy(client: TestClient) -> None:
    big = grown(objects=3, shapes_each=60)
    size = store.copy_bytes(ModelContent.model_validate(big)) // 1024
    assert size > 16
    set_limits(client, copyKb=16)
    message = detail(publish(client, big))
    assert f"A character's copy of this model would be {size} KB; the limit for a model of your own is 16 KB." in message
    set_limits(client, copyKb=2048)
    assert publish(client, big).status_code == 200


def test_every_fault_is_said_at_once_with_the_ones_publish_already_had(client: TestClient) -> None:
    set_limits(client, points=3, shapes=1)
    c = grown(objects=1, shapes_each=2)
    c["name"] = ""
    message = detail(publish(client, c))
    assert "needs a name" in message
    assert "has 4 points" in message and "The model has 2 shapes" in message


def test_the_admins_catalog_is_not_held_to_the_writers_limits(client: TestClient) -> None:
    set_limits(client, shapes=1, points=3)
    assert client.put(ADMIN, json={"models": [{"id": "m1", "draft": grown(objects=2, shapes_each=2)}]}).status_code == 200
    assert client.post(f"{ADMIN}/m1/publish").status_code == 200


def test_a_draft_may_be_over_a_limit_and_a_published_model_stays_published(client: TestClient) -> None:
    assert publish(client, grown(objects=2, shapes_each=2)).status_code == 200
    # the admin tightens the limit below the model: it stays published, and a draft over the limit is saved
    set_limits(client, shapes=2)
    assert [m["id"] for m in client.get(f"{MINE}/published").json()["models"]] == ["my-1"]
    body = save_mine(client, {"id": "my-1", "draft": grown(objects=2, shapes_each=3)}).json()
    assert len(entry_of(body, "my-1")["draft"]["shapes"]) == 6
    # but a new version cannot be published until it fits
    assert "The model has 6 shapes" in detail(client.post(f"{MINE}/my-1/publish"))
    save_mine(client, {"id": "my-1", "draft": grown(objects=1, shapes_each=2)})
    assert client.post(f"{MINE}/my-1/publish").status_code == 200


# --------------------------------------------------------------------------- the library


def test_the_library_holds_no_more_models_than_the_admin_allows(client: TestClient) -> None:
    set_limits(client, models=2)
    assert save_mine(client, mine("my-1"), mine("my-2", "Two")).status_code == 200
    message = detail(save_mine(client, mine("my-1"), mine("my-2", "Two"), mine("my-3", "Three")))
    assert "at most 2" in message
    assert [e["id"] for e in client.get(MINE).json()["models"]] == ["my-1", "my-2"]


def test_a_library_over_the_limit_can_shrink_and_be_saved_but_not_grow(client: TestClient) -> None:
    save_mine(client, mine("my-1"), mine("my-2", "Two"), mine("my-3", "Three"))
    set_limits(client, models=1)
    # the same three (an autosave of an edit) is not growth
    assert save_mine(client, mine("my-1", "Changed"), mine("my-2", "Two"), mine("my-3", "Three")).status_code == 200
    # a fourth is
    assert detail(save_mine(client, mine("my-1"), mine("my-2", "Two"), mine("my-3", "Three"), mine("my-4", "Four")))
    # fewer is always fine
    assert save_mine(client, mine("my-1")).status_code == 200


def test_the_admins_catalog_is_not_held_to_the_library_limit(client: TestClient) -> None:
    set_limits(client, models=1)
    assert client.put(ADMIN, json={"models": [{"id": "m1", "draft": complete("One")}, {"id": "m2", "draft": complete("Two")}]}).status_code == 200


def test_the_store_reads_and_writes_the_same_limits(app_data_root: Path) -> None:
    assert store.load_writer_limits(app_data_root) == WriterModelLimits()
    store.save_writer_limits(app_data_root, WriterModelLimits(shapes=10, points=5))
    assert store.load_writer_limits(app_data_root).shapes == 10
    assert store.load_writer_limits(app_data_root).points == 5
