"""Phase O4a: a build that bundles a newer basic model publishes it once, as the next version, unless the admin has changed the basic model; then the Designer offers
Update the basic model (GET/POST /api/character-models/basic/update)."""

import json
from pathlib import Path

import pytest

from app.storage import character_models_store as store
from app.storage.schema import ModelContent, ModelDraftList


@pytest.fixture
def bundle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """The bundled basic model, in a file the test can replace with a newer one."""
    path = tmp_path / "bundle" / "basic_model.json"
    path.parent.mkdir()
    original = json.loads(store._seed_path().read_text(encoding="utf-8"))
    path.write_text(json.dumps(original), encoding="utf-8")
    monkeypatch.setattr(store, "_seed_path", lambda: path)

    def newer(description: str = "A newer basic adult.") -> None:
        path.write_text(json.dumps({**original, "description": description}), encoding="utf-8")

    return newer


def basic(root: Path):
    return next(e for e in store.load_models(root).models if e.id == store.BASIC_MODEL_ID)


def test_a_fresh_install_records_the_bundled_model_and_has_nothing_to_update(app_data_root: Path, bundle):
    assert store.seed_on_first_start(app_data_root) is True
    assert store.update_basic_on_start(app_data_root) is False
    assert store.basic_update_available(app_data_root) is False
    assert basic(app_data_root).published.version == 1


def test_a_newer_bundled_model_is_published_once_as_the_next_version_keeping_the_history(app_data_root: Path, bundle):
    store.seed_on_first_start(app_data_root)
    bundle("A newer basic adult.")
    assert store.update_basic_on_start(app_data_root) is True
    entry = basic(app_data_root)
    assert entry.published.version == 2
    assert entry.published.content.description == "A newer basic adult."
    assert entry.draft.description == "A newer basic adult."
    assert [h.version for h in entry.history] == [1]
    # done once: a second start changes nothing
    assert store.update_basic_on_start(app_data_root) is False
    assert basic(app_data_root).published.version == 2
    assert store.basic_update_available(app_data_root) is False


def test_an_install_from_before_the_record_is_updated_when_the_basic_model_is_as_it_came(app_data_root: Path, bundle):
    # a build from before phase O4a added the basic model and left no record of which one
    store.add_basic_model(app_data_root)
    (app_data_root / store._SEEDED_MARKER).write_text("done", encoding="utf-8")
    bundle()
    assert store.update_basic_on_start(app_data_root) is True
    assert basic(app_data_root).published.version == 2


def test_the_same_model_as_the_bundled_one_is_only_recorded(app_data_root: Path, bundle):
    store.add_basic_model(app_data_root)
    assert store.update_basic_on_start(app_data_root) is False
    assert basic(app_data_root).published.version == 1
    assert store.basic_update_available(app_data_root) is False


def test_a_basic_model_the_admin_changed_is_left_alone_and_the_update_is_offered(app_data_root: Path, bundle):
    store.seed_on_first_start(app_data_root)
    entry = basic(app_data_root)
    changed = entry.draft.model_copy(update={"description": "The admin's own words."})
    store.save_drafts(app_data_root, ModelDraftList(models=[{"id": store.BASIC_MODEL_ID, "draft": changed}]))
    bundle()
    assert store.update_basic_on_start(app_data_root) is False
    assert basic(app_data_root).draft.description == "The admin's own words."
    assert store.basic_update_available(app_data_root) is True
    # pressing Update the basic model replaces the draft and publishes it
    store.update_basic_model(app_data_root)
    entry = basic(app_data_root)
    assert entry.published.version == 2 and entry.draft.description == "A newer basic adult."
    assert store.basic_update_available(app_data_root) is False


def test_a_basic_model_the_admin_published_again_is_left_alone(app_data_root: Path, bundle):
    store.seed_on_first_start(app_data_root)
    entry = basic(app_data_root)
    store.save_drafts(app_data_root, ModelDraftList(models=[{"id": store.BASIC_MODEL_ID, "draft": entry.draft.model_copy(update={"description": "Mine now."})}]))
    store.publish_model(app_data_root, store.BASIC_MODEL_ID)
    bundle()
    assert store.update_basic_on_start(app_data_root) is False
    assert basic(app_data_root).published.content.description == "Mine now."
    assert store.basic_update_available(app_data_root) is True


def test_a_catalog_without_the_basic_model_is_left_alone(app_data_root: Path, bundle):
    store.save_drafts(app_data_root, ModelDraftList(models=[{"id": "mine", "draft": ModelContent(name="Mine")}]))
    store.seed_on_first_start(app_data_root)
    bundle()
    assert store.update_basic_on_start(app_data_root) is False
    assert store.basic_update_available(app_data_root) is False
    with pytest.raises(store.UnknownModelError):
        store.update_basic_model(app_data_root)


def test_the_endpoints_say_whether_an_update_waits_and_make_it(client, app_data_root: Path, bundle):
    assert client.get("/api/character-models/basic/update").json() == {"available": False}
    assert client.post("/api/character-models/basic/update").status_code == 404
    client.post("/api/character-models/basic")
    store._record_basic(app_data_root, store._content_key(store.basic_model_content()))
    bundle()
    assert client.get("/api/character-models/basic/update").json() == {"available": True}
    done = client.post("/api/character-models/basic/update")
    assert done.status_code == 200
    model = next(m for m in done.json()["models"] if m["id"] == "basic")
    assert model["published"]["version"] == 2
    assert client.get("/api/character-models/basic/update").json() == {"available": False}
