"""The writer's own models (phase 7a): a second library of the character models (my-models.json), with the same draft / publish / versions as the admin's catalog, ids that
start with "my-", and a character that can copy a published model of either library into its project. Same pretend app data as test_character_models_api.py."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import character_models_store as store
from tests.test_character_models_api import complete, entry_of

MINE = "/api/my-models"
ADMIN = "/api/character-models"


def save_mine(client: TestClient, *items: dict):
    return client.put(MINE, json={"models": list(items)})


def mine(mid: str, name: str = "Adult", **over) -> dict:
    return {"id": mid, "draft": {**complete(name), **over}}


# --------------------------------------------------------------------------- the library


def test_a_fresh_install_has_no_model_of_its_own(client: TestClient) -> None:
    assert client.get(MINE).json() == {"schemaVersion": 1, "models": []}
    assert client.get(f"{MINE}/published").json() == {"models": []}


def test_drafts_are_saved_in_order_and_kept_in_their_own_file(client: TestClient, app_data_root: Path) -> None:
    body = save_mine(client, mine("my-b", "Beta"), mine("my-a", "Alpha")).json()
    assert [e["id"] for e in body["models"]] == ["my-b", "my-a"]
    assert [e["id"] for e in client.get(MINE).json()["models"]] == ["my-b", "my-a"]
    assert (app_data_root / "my-models.json").exists()
    # the admin's catalog is another file and does not see them
    assert client.get(ADMIN).json()["models"] == []
    assert not (app_data_root / "character-models.json").read_text(encoding="utf-8").count("my-b")


def test_an_id_must_start_with_my(client: TestClient) -> None:
    resp = save_mine(client, mine("model-1"))
    assert resp.status_code == 422
    assert "my-" in resp.json()["detail"]
    assert client.get(MINE).json()["models"] == []


def test_the_admin_catalog_and_the_library_do_not_share_models(client: TestClient) -> None:
    assert client.put(ADMIN, json={"models": [{"id": "m1", "draft": complete("Adult")}]}).status_code == 200
    save_mine(client, mine("my-1", "Adult"))
    assert [e["id"] for e in client.get(ADMIN).json()["models"]] == ["m1"]
    assert [e["id"] for e in client.get(MINE).json()["models"]] == ["my-1"]
    # a name published in the catalog does not stop the writer from publishing the same name
    assert client.post(f"{ADMIN}/m1/publish").status_code == 200
    assert client.post(f"{MINE}/my-1/publish").status_code == 200


def test_a_model_left_out_of_a_save_is_deleted_with_its_versions(client: TestClient) -> None:
    save_mine(client, mine("my-1"), mine("my-2", "Other"))
    client.post(f"{MINE}/my-1/publish")
    body = save_mine(client, mine("my-2", "Other")).json()
    assert [e["id"] for e in body["models"]] == ["my-2"]
    assert client.get(f"{MINE}/published").json() == {"models": []}


# --------------------------------------------------------------------------- publishing


def test_publish_freezes_versions_and_lists_them_for_the_editor(client: TestClient) -> None:
    save_mine(client, mine("my-1"))
    first = entry_of(client.post(f"{MINE}/my-1/publish").json(), "my-1")
    assert first["published"]["version"] == 1 and first["nextVersion"] == 2
    second = entry_of(client.post(f"{MINE}/my-1/publish").json(), "my-1")
    assert second["published"]["version"] == 2 and [v["version"] for v in second["history"]] == [1]
    published = client.get(f"{MINE}/published").json()["models"]
    assert [(m["id"], m["version"], m["content"]["name"]) for m in published] == [("my-1", 2, "Adult")]
    # the admin's list of published models does not carry it
    assert client.get(f"{ADMIN}/published").json() == {"models": []}


def test_publish_is_refused_with_the_faults(client: TestClient) -> None:
    save_mine(client, {"id": "my-1", "draft": {"name": "", "description": "", "shapes": [], "objects": [], "groups": []}})
    resp = client.post(f"{MINE}/my-1/publish")
    assert resp.status_code == 422
    assert "needs a name" in resp.json()["detail"]


def test_a_name_is_unique_among_the_published_models_of_the_library(client: TestClient) -> None:
    save_mine(client, mine("my-1", "Adult"), mine("my-2", "adult"))
    assert client.post(f"{MINE}/my-1/publish").status_code == 200
    resp = client.post(f"{MINE}/my-2/publish")
    assert resp.status_code == 422
    assert "already published" in resp.json()["detail"]


def test_unpublish_discard_and_restore_work_as_they_do_in_the_catalog(client: TestClient) -> None:
    save_mine(client, mine("my-1", "Adult"))
    client.post(f"{MINE}/my-1/publish")
    assert entry_of(client.post(f"{MINE}/my-1/unpublish").json(), "my-1")["published"] is None
    assert client.post(f"{MINE}/my-1/unpublish").status_code == 409
    client.post(f"{MINE}/my-1/publish")
    save_mine(client, mine("my-1", "Changed"))
    assert entry_of(client.post(f"{MINE}/my-1/discard").json(), "my-1")["draft"]["name"] == "Adult"
    save_mine(client, mine("my-1", "Changed again"))
    restored = entry_of(client.post(f"{MINE}/my-1/restore/2").json(), "my-1")
    assert restored["draft"]["name"] == "Adult"
    assert client.post(f"{MINE}/my-1/restore/9").status_code == 404
    assert client.post(f"{MINE}/my-9/publish").status_code == 404
    assert client.post(f"{MINE}/my-9/unpublish").status_code == 404


# --------------------------------------------------------------------------- characters use them


def test_a_character_can_copy_a_published_model_of_the_library(client: TestClient) -> None:
    save_mine(client, mine("my-1", "My adult"))
    client.post(f"{MINE}/my-1/publish")
    pid = client.post("/api/projects", json={"title": "Figures"}).json()["projectId"]
    resp = client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "my-1"})
    assert resp.status_code == 201, resp.text
    copy = resp.json()
    assert copy["modelId"] == "my-1" and copy["version"] == 1 and copy["name"] == "My adult"


def test_a_model_that_is_not_published_cannot_be_copied(client: TestClient) -> None:
    save_mine(client, mine("my-1"))
    pid = client.post("/api/projects", json={"title": "Figures"}).json()["projectId"]
    assert client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "my-1"}).status_code == 404
    assert client.post(f"/api/projects/{pid}/figure-models", json={"modelId": "my-nothing"}).status_code == 404


def test_find_published_looks_in_the_library_the_id_belongs_to(app_data_root: Path) -> None:
    from app.storage.schema import ModelDraftList

    store.save_drafts(app_data_root, ModelDraftList.model_validate({"models": [{"id": "m1", "draft": complete("Catalog")}]}))
    store.publish_model(app_data_root, "m1")
    store.save_drafts(app_data_root, ModelDraftList.model_validate({"models": [mine("my-1", "Mine")]}), store.MY_LIBRARY)
    store.publish_model(app_data_root, "my-1", store.MY_LIBRARY)
    assert store.find_published(app_data_root, "m1").content.name == "Catalog"  # type: ignore[union-attr]
    assert store.find_published(app_data_root, "my-1").content.name == "Mine"  # type: ignore[union-attr]
    assert store.find_published(app_data_root, "my-2") is None
    assert store.find_published(app_data_root, "m2") is None
