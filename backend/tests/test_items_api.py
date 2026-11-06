import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage.schema import ITEM_MAX_HOLDINGS, ItemDoc


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Items"}).json()["projectId"]


def _url(pid: str, tail: str = "") -> str:
    return f"/api/projects/{pid}/items{tail}"


def _new(client: TestClient, pid: str, **body) -> dict:
    resp = client.post(_url(pid), json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_an_item_is_created_listed_saved_and_deleted(client: TestClient) -> None:
    pid = _project(client)
    sword = _new(client, pid, name="The Sunblade", kind="weapon")
    ring = _new(client, pid, name="A ring")
    assert [i["name"] for i in client.get(_url(pid)).json()] == ["The Sunblade", "A ring"]
    assert sword["kind"] == "weapon" and sword["holdings"] == [] and ring["kind"] == "other"
    sword["description"] = "Forged at dawn."
    sword["holdings"] = [{"id": "h1", "holder": "", "at": "", "note": "In the forge"}]
    saved = client.put(_url(pid, f"/{sword['id']}"), json=sword)
    assert saved.status_code == 200 and saved.json()["holdings"][0]["note"] == "In the forge"
    assert client.get(_url(pid, "/all")).json()[0]["description"] == "Forged at dawn."
    assert client.delete(_url(pid, f"/{ring['id']}")).status_code == 204
    assert [i["id"] for i in client.get(_url(pid)).json()] == [sword["id"]]
    assert client.get(_url(pid, f"/{ring['id']}")).status_code == 404
    assert client.put(_url(pid, f"/{sword['id']}"), json={**sword, "id": "other"}).status_code == 422


def test_an_item_is_repaired_never_refused() -> None:
    doc = ItemDoc.model_validate({
        "id": "i1", "name": "   ", "kind": " Weapon ", "color": "red", "description": 5,
        "holdings": [{"id": "a", "holder": "char:c1"}, {"id": "a", "holder": "char:c2"}, {"id": "b", "holder": "nonsense", "at": "n1"}, "junk", {"holder": "char:c3"}],
    })
    assert doc.name == "Unnamed item" and doc.kind == "weapon" and doc.color == "" and doc.description == ""
    assert [(h.id, h.holder) for h in doc.holdings] == [("a", "char:c1"), ("b", "")]
    assert ItemDoc.model_validate({"id": "i2", "kind": "wand", "color": "#AABBCC"}).kind == "other"
    assert ItemDoc.model_validate({"id": "i2", "color": "#AABBCC"}).color == "#aabbcc"
    many = ItemDoc.model_validate({"id": "i3", "holdings": [{"id": f"h{n}"} for n in range(ITEM_MAX_HOLDINGS + 20)]})
    assert len(many.holdings) == ITEM_MAX_HOLDINGS


def test_deleting_a_character_leaves_their_items_with_nobody_known(client: TestClient) -> None:
    pid = _project(client)
    ada = client.post(f"/api/projects/{pid}/characters", json={"name": "Ada"}).json()
    item = _new(client, pid, name="Letter")
    item["holdings"] = [{"id": "h1", "holder": f"char:{ada['id']}", "at": ""}, {"id": "h2", "holder": "place:m/p", "at": "n2"}]
    client.put(_url(pid, f"/{item['id']}"), json=item)
    client.delete(f"/api/projects/{pid}/characters/{ada['id']}")
    held = client.get(_url(pid, f"/{item['id']}")).json()["holdings"]
    assert [h["holder"] for h in held] == ["", "place:m/p"]


def test_an_item_links_to_a_character_a_scene_and_a_plot_node_and_the_link_goes_with_it(client: TestClient) -> None:
    pid = _project(client)
    outline = {"schemaVersion": 2, "nodes": [{"id": "ch1", "kind": "chapter", "parentId": None, "order": 0, "title": "One"}]}
    assert client.put(f"/api/projects/{pid}/outline", json=outline).status_code == 200
    ada = client.post(f"/api/projects/{pid}/characters", json={"name": "Ada"}).json()
    item = _new(client, pid, name="Key")
    links = f"/api/projects/{pid}/world-links"
    ref = f"item:{item['id']}"
    assert client.post(links, json={"a": ref, "b": f"char:{ada['id']}"}).status_code == 200
    assert client.post(links, json={"a": ref, "b": "scene:ch1"}).status_code == 200
    assert client.post(links, json={"a": ref, "b": "scene:nope"}).status_code == 422
    assert client.post(links, json={"a": ref, "b": "item:other"}).status_code == 422
    assert len(client.get(links).json()) == 2
    client.delete(_url(pid, f"/{item['id']}"))
    assert client.get(links).json() == []


def test_an_item_that_cannot_be_read_is_set_aside_and_the_others_still_load(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    good = _new(client, pid, name="Good")
    bad = _new(client, pid, name="Bad")
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["items"][bad["id"]]["order"] = "first"
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert [r["name"] for r in client.get(_url(pid)).json()] == ["Good"]
    assert client.get(_url(pid, f"/{good['id']}")).status_code == 200
    assert client.get(_url(pid, f"/{bad['id']}")).status_code == 409


def test_a_project_saved_before_items_loads_with_none(client: TestClient, storage_root: Path) -> None:
    pid = _project(client)
    path = storage_root / pid / "project.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("items", None)
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert client.get(_url(pid)).json() == []
