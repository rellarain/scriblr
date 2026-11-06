import pytest
from fastapi.testclient import TestClient

from app.storage.schema import WorldLink


def _world(client: TestClient) -> dict:
    pid = client.post("/api/projects", json={"title": "Links"}).json()["projectId"]
    plot = {
        "schemaVersion": 2,
        "nodes": [
            {"id": "cat1", "kind": "category", "parentId": None, "order": 0, "title": "Magic"},
            {"id": "line1", "kind": "plotline", "parentId": "cat1", "order": 0, "title": "The heist"},
        ],
    }
    assert client.put(f"/api/projects/{pid}/plot", json=plot).status_code == 200
    ada = client.post(f"/api/projects/{pid}/characters", json={"name": "Ada"}).json()
    bram = client.post(f"/api/projects/{pid}/characters", json={"name": "Bram"}).json()
    doc = client.post(f"/api/projects/{pid}/maps", json={"title": "Veyra"}).json()
    layer = next(x["id"] for x in doc["layers"] if x["kind"] == "symbols")
    doc["symbols"] = [
        {"id": "port", "layerId": layer, "kind": "town", "x": 3, "y": 3, "name": "Port Veyra"},
        {"id": "tree", "layerId": layer, "kind": "tree", "x": 6, "y": 3, "name": ""},
    ]
    assert client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).status_code == 200
    return {"pid": pid, "ada": f"char:{ada['id']}", "bram": f"char:{bram['id']}", "port": f"place:{doc['id']}/port", "tree": f"place:{doc['id']}/tree", "line": "plot:line1", "adaId": ada["id"], "mapId": doc["id"]}


def _url(w: dict) -> str:
    return f"/api/projects/{w['pid']}/world-links"


def test_a_link_joins_two_kinds_and_reads_the_same_from_either_end(client: TestClient) -> None:
    w = _world(client)
    assert client.get(_url(w)).json() == []
    first = client.post(_url(w), json={"a": w["port"], "b": w["ada"]}).json()
    assert first == [{"a": min(w["port"], w["ada"]), "b": max(w["port"], w["ada"])}]
    again = client.post(_url(w), json={"a": w["ada"], "b": w["port"]}).json()  # the other way round: the same link
    assert again == first
    client.post(_url(w), json={"a": w["line"], "b": w["ada"]})
    assert len(client.get(_url(w)).json()) == 2


def test_it_refuses_a_link_between_the_same_kind_a_missing_end_or_a_bad_ref(client: TestClient) -> None:
    w = _world(client)
    assert client.post(_url(w), json={"a": w["ada"], "b": w["bram"]}).status_code == 422  # two characters have relationships
    assert client.post(_url(w), json={"a": w["ada"], "b": "char:nobody"}).status_code == 422
    assert client.post(_url(w), json={"a": w["ada"], "b": w["tree"]}).status_code == 422  # a symbol with no name is not a place
    assert client.post(_url(w), json={"a": w["ada"], "b": "nonsense"}).status_code == 422
    assert client.post(_url(w), json={"a": w["ada"], "b": "plot:missing"}).status_code == 422
    assert client.get(_url(w)).json() == []


def test_a_link_can_be_taken_away_from_either_end(client: TestClient) -> None:
    w = _world(client)
    client.post(_url(w), json={"a": w["port"], "b": w["ada"]})
    client.post(_url(w), json={"a": w["line"], "b": w["ada"]})
    left = client.delete(_url(w), params={"a": w["ada"], "b": w["port"]}).json()
    assert [(x["a"], x["b"]) for x in left] == [tuple(sorted((w["line"], w["ada"])))]
    assert client.delete(_url(w), params={"a": w["ada"], "b": w["port"]}).status_code == 200  # nothing to remove: no harm
    assert client.delete(_url(w), params={"a": "x", "b": "y"}).status_code == 422


def test_a_link_whose_end_is_gone_is_not_shown(client: TestClient) -> None:
    w = _world(client)
    client.post(_url(w), json={"a": w["port"], "b": w["ada"]})
    client.post(_url(w), json={"a": w["line"], "b": w["bram"]})
    client.delete(f"/api/projects/{w['pid']}/characters/{w['adaId']}")
    assert [(x["a"], x["b"]) for x in client.get(_url(w)).json()] == [tuple(sorted((w["line"], w["bram"])))]
    doc = client.get(f"/api/projects/{w['pid']}/maps/{w['mapId']}").json()
    doc["symbols"][0]["name"] = ""  # the place loses its name
    client.put(f"/api/projects/{w['pid']}/maps/{w['mapId']}", json=doc)
    client.post(_url(w), json={"a": w["line"], "b": w["bram"]})  # a change drops what is dangling for good
    assert len(client.get(_url(w)).json()) == 1


def test_links_survive_a_reload_and_a_bad_entry_is_dropped(client: TestClient) -> None:
    w = _world(client)
    client.post(_url(w), json={"a": w["port"], "b": w["ada"]})
    assert len(client.get(_url(w)).json()) == 1
    assert WorldLink(a="plot:z", b="char:a").a == "char:a"  # the ends are kept in order
    with pytest.raises(ValueError):
        WorldLink(a="char:a", b="char:b")


def test_an_unknown_project_is_not_found(client: TestClient) -> None:
    assert client.get("/api/projects/nope/world-links").status_code == 404
