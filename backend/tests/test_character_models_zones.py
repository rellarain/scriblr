"""Zones (Z2): blocks of a model's tree between the model and its groups. They are kept in order with their groups; a group is in at most one zone, a zone keeps only
groups that exist, and a zone that repeats an id goes. A model saved before zones loads with none."""

from fastapi.testclient import TestClient

from app.storage.schema import MODEL_ZONE_NAME_MAX, MODEL_ZONES_MAX, ModelContent

SQUARE = [{"x": 90, "y": 40, "m": "s"}, {"x": 110, "y": 40, "m": "s"}, {"x": 110, "y": 60, "m": "s"}, {"x": 90, "y": 60, "m": "s"}]


def model(**over) -> dict:
    return {
        "name": "Zones",
        "shapes": [{"id": "s1", "name": "Body", "pts": [dict(p) for p in SQUARE]}],
        "objects": [{"id": "o1", "name": "Part", "layer": "body", "shapes": ["s1"]}],
        "groups": [{"id": "g1", "name": "Arm", "parent": None, "objects": ["o1"]}, {"id": "g2", "name": "Leg", "parent": None, "objects": []}],
        **over,
    }


def test_zones_round_trip_in_order(client: TestClient) -> None:
    zones = [{"id": "z1", "name": "Legs", "groups": ["g2"]}, {"id": "z2", "name": "Arms", "groups": ["g1"]}, {"id": "z3", "name": "Head", "groups": []}]
    saved = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model(zones=zones)}]})
    assert saved.status_code == 200
    draft = client.get("/api/character-models").json()["models"][0]["draft"]
    assert draft["zones"] == zones


def test_a_model_without_zones_has_none() -> None:
    assert ModelContent.model_validate(model()).zones == []


def test_zones_are_repaired_not_refused() -> None:
    c = ModelContent.model_validate(model(zones=[
        {"id": "z1", "name": "  Torso  ", "groups": ["g1", "g1", "gone", 7, "bad id!"]},
        {"id": "z2", "name": "Arms", "groups": ["g1", "g2"]},
        {"id": "z1", "name": "Again", "groups": []},
        {"name": "No id", "groups": []},
        "not a zone",
    ]))
    assert [(z.id, z.name, z.groups) for z in c.zones] == [("z1", "Torso", ["g1"]), ("z2", "Arms", ["g2"])]


def test_a_zone_name_is_cut_to_length() -> None:
    c = ModelContent.model_validate(model(zones=[{"id": "z1", "name": "x" * (MODEL_ZONE_NAME_MAX + 10), "groups": []}]))
    assert len(c.zones[0].name) == MODEL_ZONE_NAME_MAX


def test_a_model_holds_at_most_so_many_zones(client: TestClient) -> None:
    zones = [{"id": f"z{i}", "name": f"Zone {i}", "groups": []} for i in range(MODEL_ZONES_MAX + 1)]
    refused = client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model(zones=zones)}]})
    assert refused.status_code == 422


def test_a_model_with_zones_publishes(client: TestClient) -> None:
    zones = [{"id": "z1", "name": "Torso", "groups": ["g1", "g2"]}]
    client.put("/api/character-models", json={"models": [{"id": "m1", "draft": model(zones=zones)}]})
    published = client.post("/api/character-models/m1/publish")
    assert published.status_code == 200
    assert published.json()["models"][0]["published"]["content"]["zones"] == zones
