"""The shape editor (2026-11-14): the old catalog of models is put aside once on start, and the basic model is no longer seeded or updated."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.storage import character_models_store as store
from app.storage.schema import ModelContent, ModelDraftList


def _with_two_models(root: Path) -> bytes:
    store.add_basic_model(root)
    catalog = store.load_models(root)
    entries = [{"id": e.id, "draft": e.draft.model_dump(mode="json")} for e in catalog.models]
    entries.append({"id": "own", "draft": ModelContent(name="Own").model_dump(mode="json")})
    store.save_drafts(root, ModelDraftList.model_validate({"models": entries}))
    store.publish_model(root, "basic")  # a second version, so there is history to put aside too
    return (root / store.ADMIN_LIBRARY).read_bytes()


def test_the_old_catalog_is_put_aside_once_and_the_next_read_is_empty(tmp_path: Path):
    before = _with_two_models(tmp_path)
    assert store.retire_catalog_on_start(tmp_path) is True
    backup = tmp_path / f"{store.RETIRED_COPY}.json"
    assert backup.read_bytes() == before
    assert store.load_models(tmp_path).models == []
    # a model made afterwards stays: the step is done once
    store.save_drafts(tmp_path, ModelDraftList.model_validate({"models": [{"id": "demo", "draft": ModelContent(name="Demo").model_dump(mode="json")}]}))
    assert store.retire_catalog_on_start(tmp_path) is False
    assert [e.id for e in store.load_models(tmp_path).models] == ["demo"]


def test_a_fresh_install_has_nothing_to_put_aside(tmp_path: Path):
    assert store.retire_catalog_on_start(tmp_path) is False
    assert not (tmp_path / f"{store.RETIRED_COPY}.json").exists()
    assert store.retire_catalog_on_start(tmp_path) is False


def test_a_taken_backup_name_gets_a_number(tmp_path: Path):
    (tmp_path / f"{store.RETIRED_COPY}.json").write_text("older", encoding="utf-8")
    _with_two_models(tmp_path)
    assert store.retire_catalog_on_start(tmp_path) is True
    assert (tmp_path / f"{store.RETIRED_COPY}.json").read_text(encoding="utf-8") == "older"
    assert (tmp_path / f"{store.RETIRED_COPY}-2.json").exists()


def test_the_writers_library_is_left_alone(tmp_path: Path):
    mine = {"id": "my-a", "draft": ModelContent(name="Mine").model_dump(mode="json")}
    store.save_drafts(tmp_path, ModelDraftList.model_validate({"models": [mine]}), store.MY_LIBRARY)
    _with_two_models(tmp_path)
    store.retire_catalog_on_start(tmp_path)
    assert [e.id for e in store.load_models(tmp_path, store.MY_LIBRARY).models] == ["my-a"]


def test_a_start_puts_the_catalog_aside_and_seeds_nothing(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SCRIBLR_DATA_DIR", str(tmp_path))
    from app.storage.paths import get_app_data_root

    root = get_app_data_root()
    _with_two_models(root)
    with TestClient(create_app()) as client:
        body = client.get("/api/character-models").json()
    assert body["models"] == []
    assert (root / f"{store.RETIRED_COPY}.json").exists()


def test_a_fresh_start_does_not_add_the_basic_model(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SCRIBLR_DATA_DIR", str(tmp_path))
    with TestClient(create_app()) as client:
        assert client.get("/api/character-models").json()["models"] == []
