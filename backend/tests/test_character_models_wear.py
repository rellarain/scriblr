"""What an object is worn under (phase 6b): the garments or families whose outlines trim it, so a shirt does not show outside a jacket and underwear does not show outside the
clothes. Same pretend app data as test_character_models_api.py."""

import pytest
from fastapi.testclient import TestClient

from app.storage.schema import MODEL_UNDER_MAX
from tests.test_character_models_api import content, entry_of, save, shape


def dressed(**over) -> dict:
    """A shirt and a jacket (clothing) in one group; the shirt is worn under the jacket."""
    base = content(
        "Adult",
        shapes=[shape("s_shirt", "Shirt"), shape("s_jacket", "Jacket")],
        objects=[
            {"id": "o_shirt", "name": "Shirt", "layer": "clothing", "shapes": ["s_shirt"], "under": ["o_jacket"]},
            {"id": "o_jacket", "name": "Jacket", "layer": "clothing", "shapes": ["s_jacket"]},
        ],
        groups=[{"id": "g_torso", "name": "Torso", "parent": None, "objects": ["o_shirt", "o_jacket"]}],
    )
    base.update(over)
    return base


def saved(client: TestClient, c: dict) -> dict:
    resp = save(client, {"id": "m1", "draft": c})
    assert resp.status_code == 200, resp.text
    return entry_of(resp.json(), "m1")["draft"]


def faults_of(client: TestClient, c: dict) -> str:
    save(client, {"id": "m1", "draft": c})
    resp = client.post("/api/character-models/m1/publish")
    assert resp.status_code == 422
    return resp.json()["detail"]


def test_an_older_model_loads_worn_under_nothing(client: TestClient) -> None:
    c = dressed()
    for o in c["objects"]:
        o.pop("under", None)
    assert [o["under"] for o in saved(client, c)["objects"]] == [[], []]


def test_what_an_object_is_worn_under_is_kept_and_the_list_is_cleaned(client: TestClient) -> None:
    c = dressed()
    c["objects"][0]["under"] = ["o_jacket", "o_jacket", "not an id", 7, None, "k_family"]
    assert saved(client, c)["objects"][0]["under"] == ["o_jacket", "k_family"]
    c["objects"][0]["under"] = "o_jacket"
    assert saved(client, c)["objects"][0]["under"] == []


def test_a_list_past_its_limit_is_refused_not_quietly_cut(client: TestClient) -> None:
    c = dressed()
    c["objects"][0]["under"] = [f"o_{i}" for i in range(MODEL_UNDER_MAX + 1)]
    assert save(client, {"id": "m1", "draft": c}).status_code == 422


def test_a_model_worn_under_an_object_or_a_family_publishes(client: TestClient) -> None:
    c = dressed(classes=[{"id": "k_coats", "name": "Coats", "template": "o_jacket", "exclusive": True}])
    c["objects"][0]["under"] = ["o_jacket", "k_coats"]
    save(client, {"id": "m1", "draft": c})
    assert client.post("/api/character-models/m1/publish").status_code == 200


@pytest.mark.parametrize(
    "target, words",
    [("o_gone", "Object Shirt is worn under something that does not exist."), ("o_shirt", "Object Shirt is worn under itself.")],
)
def test_wearing_something_under_what_is_not_there_or_under_itself_is_refused(client: TestClient, target: str, words: str) -> None:
    c = dressed()
    c["objects"][0]["under"] = [target]
    assert words in faults_of(client, c)
