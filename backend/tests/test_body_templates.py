"""The body templates (WUI slice 9a): the six bodies of the approved mockup that a new model can start from, each a sound model with its proportion guide, its rig
and its right side as twins of the left; listed without their content, read one at a time. The proportion guide is part of a model, and a model without one is
written as before."""

from app.storage import body_templates
from app.storage import character_models_store as store
from app.storage.schema import MODEL_COPY_MAX_BYTES, ModelContent

BODIES = ["man", "woman", "athletic", "heavyman", "heavywoman", "elder"]


def test_the_list_has_the_six_bodies_with_a_picture_each_and_no_content(client):
    res = client.get("/api/character-models/body-templates")
    assert res.status_code == 200
    templates = res.json()["templates"]
    assert [t["id"] for t in templates] == BODIES
    assert [t["name"] for t in templates] == ["Average man", "Average woman", "Athletic man", "Heavier man", "Heavier woman", "Older woman"]
    for t in templates:
        assert t["thumb"].startswith("<svg") and "content" not in t
        assert 7 <= t["heads"] <= 7.6


def test_a_template_is_a_publishable_model_inside_the_size_limit():
    for body in BODIES:
        content = body_templates.get_template(body).content
        assert store.publish_faults(content) == [], body
        assert store.copy_bytes(content) < MODEL_COPY_MAX_BYTES


def test_a_template_has_its_rig_its_twins_its_guide_and_outlines_per_edge(client):
    res = client.get("/api/character-models/body-templates/woman")
    assert res.status_code == 200
    content = ModelContent.model_validate(res.json()["content"])
    groups = {g.id: g for g in content.groups}
    assert groups["pelvis"].parent is None and groups["head"].parent == "neck" and groups["handL"].parent == "forearmL"
    assert all(g.pivot is not None for g in content.groups if not g.mirrorOf)
    # the right arm and leg are twins of the left, with everything under them
    assert {g.name for g in content.groups if g.mirrorOf} == {"Upper arm (right)", "Forearm (right)", "Hand (right)", "Thigh (right)", "Shin (right)", "Foot (right)"}
    twins = [s for s in content.shapes if s.mirrorOf]
    assert twins and all(not s.pts for s in twins)
    assert any(s.name == "Breast (right)" for s in twins)
    # the guide: a head of 56 units from the crown, with the named lines
    assert content.guide is not None and content.guide.head == 56 and content.guide.top == 10
    assert [line.name for line in content.guide.lines] == ["Chin", "Chest", "Waist", "Crotch", "Knees", "Soles"]
    # the joins inside the body have no outline; the silhouette has
    chest = next(s for s in content.shapes if s.id == "chest")
    assert chest.outline and any(p.line is False for p in chest.pts) and any(p.line is None for p in chest.pts)


def test_an_unknown_template_is_404(client):
    assert client.get("/api/character-models/body-templates/giant").status_code == 404


def test_a_model_without_a_guide_is_written_as_before_and_a_bad_guide_is_none():
    assert "guide" not in ModelContent.model_validate({"name": "A"}).model_dump(mode="json")
    assert ModelContent.model_validate({"name": "A", "guide": "tall"}).guide is None
    guide = ModelContent.model_validate({"name": "A", "guide": {"top": 12, "head": 1000, "lines": [{"name": " Chin ", "y": 68}, 7]}}).guide
    assert guide is not None and guide.head == 200 and [(line.name, line.y) for line in guide.lines] == [("Chin", 68)]


def test_the_guide_survives_a_save(client):
    res = client.get("/api/character-models/body-templates/man")
    content = res.json()["content"]
    content["name"] = "From a body"
    put = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": content}]})
    assert put.status_code == 200, put.text
    saved = put.json()["models"][0]["draft"]
    assert saved["guide"]["lines"][0] == {"name": "Chin", "y": 66.0}
