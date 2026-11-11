"""The basic adult that comes with the app: published on a fresh install (once), offered by an endpoint, and sound as a model."""

from pathlib import Path

from app.storage import character_models_store as store
from app.storage.schema import MODEL_COPY_MAX_BYTES, ModelContent, ModelDraftList


def test_the_basic_model_is_a_publishable_model_inside_the_size_limit():
    content = store.basic_model_content()
    assert store.publish_faults(content) == []
    assert store.copy_bytes(content) < MODEL_COPY_MAX_BYTES
    assert content.name == "Adult (basic)"


def test_the_basic_model_has_a_body_a_face_and_the_presets():
    content = store.basic_model_content()
    objects = {o.id for o in content.objects}
    assert {"neck", "chest", "uarm", "leg", "skull", "eyes", "brows", "nose", "mouth", "ears"} <= objects
    kinds = {p.kind for p in content.presets}
    assert {"Age", "Build", "Expression"} <= kinds
    assert len([p for p in content.presets if p.kind == "Age"]) == 9
    assert len([p for p in content.presets if p.kind == "Expression"]) == 13
    assert {f.name for f in content.frames} >= {"Bust", "Face"}
    # every option of the face parts is a form of its object
    forms = {o.id: len(o.axes[0].options) for o in content.objects if o.axes}
    assert forms["eyes"] == 14 and forms["nose"] == 14 and forms["mouth"] == 13 and forms["skull"] == 13 and forms["ears"] == 12 and forms["brows"] == 13


def test_the_basic_model_has_hair_in_sections_and_facial_hair_with_a_chance_of_being_rolled():
    content = store.basic_model_content()
    sections = [o for o in content.objects if o.id.startswith("hair.")]
    assert len(sections) == 14 and {o.layer for o in sections} == {"hair"}
    for o in sections:
        assert o.axes[0].id == "cut" and o.axes[0].roll == 0                      # a hairstyle chooses the cut: Randomise does not
        names = sorted(r.name for r in content.ranges if r.scope == o.id)
        assert names == ["Length", "Texture"]
    props = {d.prop for r in content.ranges for d in r.drives if d.kind == "prop"}
    assert {"length", "texture"} <= props
    assert [p.name for p in content.presets if p.kind == "Hair style"][:3] == ["Short", "Buzzed", "Pixie"]
    assert len([p for p in content.presets if p.kind == "Hair style"]) == 14
    facial = {o.id: o for o in content.objects if o.id in ("beard", "moustache")}
    assert set(facial) == {"beard", "moustache"}
    for o in facial.values():
        assert len(o.axes[0].options) == 14 and o.axes[0].initial == "none" and o.axes[0].roll == 15 and o.layer == "hair"
    assert len([p for p in content.presets if p.kind == "Facial hair"]) == 14


def test_a_fresh_install_gets_the_basic_model_published_once(app_data_root: Path):
    assert store.seed_on_first_start(app_data_root) is True
    catalog = store.load_models(app_data_root)
    assert [e.id for e in catalog.models] == [store.BASIC_MODEL_ID]
    assert catalog.models[0].published is not None and catalog.models[0].published.version == 1
    assert [m.id for m in store.published_models(app_data_root).models] == [store.BASIC_MODEL_ID]
    # a second start changes nothing, and a model the admin deleted does not come back
    assert store.seed_on_first_start(app_data_root) is False
    store.save_drafts(app_data_root, ModelDraftList(models=[]))
    assert store.seed_on_first_start(app_data_root) is False
    assert store.load_models(app_data_root).models == []


def test_a_catalog_that_has_models_is_left_alone(app_data_root: Path):
    own = ModelContent(name="Mine")
    store.save_drafts(app_data_root, ModelDraftList(models=[{"id": "mine", "draft": own}]))
    assert store.seed_on_first_start(app_data_root) is False
    assert [e.id for e in store.load_models(app_data_root).models] == ["mine"]
    # the marker is left, so it stays that way after the admin empties the catalog
    store.save_drafts(app_data_root, ModelDraftList(models=[]))
    assert store.seed_on_first_start(app_data_root) is False


def test_the_endpoint_adds_the_basic_model_and_refuses_a_second_time(client):
    first = client.post("/api/character-models/basic")
    assert first.status_code == 200
    ids = [m["id"] for m in first.json()["models"]]
    assert ids == ["basic"]
    assert first.json()["models"][0]["published"]["version"] == 1
    assert client.post("/api/character-models/basic").status_code == 409
    published = client.get("/api/character-models/published").json()["models"]
    assert [m["id"] for m in published] == ["basic"]


def test_a_published_model_with_the_same_name_leaves_the_basic_model_a_draft(app_data_root: Path):
    other = ModelContent.model_validate(store.basic_model_content().model_dump(mode="json"))
    store.save_drafts(app_data_root, ModelDraftList(models=[{"id": "mine", "draft": other}]))
    store.publish_model(app_data_root, "mine")
    catalog = store.add_basic_model(app_data_root)
    basic = next(e for e in catalog.models if e.id == store.BASIC_MODEL_ID)
    assert basic.published is None and basic.draft.name == "Adult (basic)"
