from fastapi.testclient import TestClient

from app.storage.schema import MAP_MAX_STOPS, MapDoc, MapJourney


def _project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Versions"}).json()["projectId"]


def _map(client: TestClient, pid: str, **body) -> dict:
    resp = client.post(f"/api/projects/{pid}/maps", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _with_place(client: TestClient, pid: str, doc: dict) -> dict:
    layer = next(x["id"] for x in doc["layers"] if x["kind"] == "symbols")
    doc["symbols"] = [{"id": "port", "layerId": layer, "kind": "town", "x": 3, "y": 3, "name": "Port Veyra"}]
    return client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()


# ---- journeys are repaired, never refused ----

def test_a_journey_keeps_its_good_stops_and_drops_the_rest() -> None:
    doc = MapDoc.model_validate({"id": "m", "journeys": [
        {"id": "j1", "characterId": "chr_a", "color": "red", "stops": [
            {"id": "s1", "x": 3, "y": 4, "at": " c1 ", "note": "Arrives"}, {"id": "s1", "x": 9}, {"id": "s2", "x": "far", "y": float("inf")}, "junk", {"x": 1},
        ]},
        {"id": "j1", "characterId": "chr_b"}, {"id": "j2"}, "nonsense",
    ]})
    assert [j.id for j in doc.journeys] == ["j1"]
    journey = doc.journeys[0]
    assert journey.color is None and [s.id for s in journey.stops] == ["s1", "s2"]
    assert (journey.stops[0].x, journey.stops[0].y, journey.stops[0].at) == (3.0, 4.0, "c1")
    assert (journey.stops[1].x, journey.stops[1].y) == (0.0, 0.0)


def test_there_are_at_most_so_many_stops_on_a_journey() -> None:
    journey = MapJourney.model_validate({"id": "j", "characterId": "c", "stops": [{"id": f"s{i}", "x": i} for i in range(MAP_MAX_STOPS + 30)]})
    assert len(journey.stops) == MAP_MAX_STOPS


def test_journeys_are_saved_with_the_map(client: TestClient) -> None:
    pid = _project(client)
    doc = _map(client, pid, title="World")
    doc["journeys"] = [{"id": "j1", "characterId": "chr_a", "color": "#aa3355", "stops": [{"id": "s1", "x": 2, "y": 2, "at": "c1", "note": "Leaves"}]}]
    saved = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc).json()
    assert saved["journeys"][0]["stops"][0]["note"] == "Leaves"
    assert client.get(f"/api/projects/{pid}/maps/{doc['id']}").json()["journeys"][0]["color"] == "#aa3355"


# ---- versions ----

def test_a_version_is_a_copy_of_the_map_that_is_not_in_the_tree_and_has_no_places_of_its_own(client: TestClient) -> None:
    pid = _project(client)
    base = _with_place(client, pid, _map(client, pid, title="Veyra", kind="town"))
    made = client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={"title": "Veyra after the fire", "appliesFrom": "c2"})
    assert made.status_code == 201, made.text
    version = made.json()
    assert version["id"] != base["id"] and version["versionOf"] == base["id"] and version["appliesFrom"] == "c2" and version["parentId"] is None
    assert [s["name"] for s in version["shapes"]] == ["Port Veyra"] and version["reader"]["published"] is False
    summaries = {m["id"]: m for m in client.get(f"/api/projects/{pid}/maps").json()}
    assert summaries[version["id"]]["versionOf"] == base["id"] and summaries[version["id"]]["appliesFrom"] == "c2"
    places = client.get(f"/api/projects/{pid}/maps/places/all").json()
    assert [p["key"] for p in places] == [f"{base['id']}/port"]  # only the first map's symbol is a place


def test_a_version_of_a_version_is_a_version_of_the_first_map_and_the_title_has_a_default(client: TestClient) -> None:
    pid = _project(client)
    base = _map(client, pid, title="Veyra")
    first = client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).json()
    second = client.post(f"/api/projects/{pid}/maps/{first['id']}/versions", json={"appliesFrom": "  "}).json()
    assert first["title"] == "Veyra, later" and second["versionOf"] == base["id"] and second["appliesFrom"] is None
    assert second["order"] == first["order"] + 1


def test_a_save_cannot_change_what_a_version_is_of_or_put_it_in_the_tree(client: TestClient) -> None:
    pid = _project(client)
    base = _map(client, pid, title="Veyra")
    other = _map(client, pid, title="Other")
    version = client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).json()
    version.update({"versionOf": other["id"], "parentId": other["id"], "appliesFrom": "c3"})
    saved = client.put(f"/api/projects/{pid}/maps/{version['id']}", json=version).json()
    assert saved["versionOf"] == base["id"] and saved["parentId"] is None and saved["appliesFrom"] == "c3"
    other["parentId"] = version["id"]  # a map cannot be inside a version
    assert client.put(f"/api/projects/{pid}/maps/{other['id']}", json=other).status_code == 422
    assert client.post(f"/api/projects/{pid}/maps", json={"title": "Inn", "parentId": version["id"]}).status_code == 422


def test_deleting_a_map_deletes_its_versions_and_deleting_a_version_leaves_the_map(client: TestClient) -> None:
    pid = _project(client)
    base = _map(client, pid, title="Veyra")
    v1 = client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).json()
    v2 = client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).json()
    assert client.delete(f"/api/projects/{pid}/maps/{v1['id']}").status_code == 204
    assert {m["id"] for m in client.get(f"/api/projects/{pid}/maps").json()} == {base["id"], v2["id"]}
    assert client.delete(f"/api/projects/{pid}/maps/{base['id']}").status_code == 204
    assert client.get(f"/api/projects/{pid}/maps").json() == []


def test_a_map_has_at_most_so_many_versions_and_an_unknown_map_has_none(client: TestClient) -> None:
    pid = _project(client)
    base = _map(client, pid, title="Veyra")
    for _ in range(12):
        assert client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).status_code == 201
    assert client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).status_code == 422
    assert client.post(f"/api/projects/{pid}/maps/nope/versions", json={}).status_code == 404


def test_a_version_is_not_a_place_to_link_to_and_its_journeys_are_not_sent_to_readers(client: TestClient) -> None:
    pid = _project(client)
    base = _with_place(client, pid, _map(client, pid, title="Veyra"))
    version = client.post(f"/api/projects/{pid}/maps/{base['id']}/versions", json={}).json()
    ada = client.post(f"/api/projects/{pid}/characters", json={"name": "Ada"}).json()
    assert client.post(f"/api/projects/{pid}/world-links", json={"a": f"char:{ada['id']}", "b": f"place:{version['id']}/port"}).status_code == 422
    assert client.post(f"/api/projects/{pid}/world-links", json={"a": f"char:{ada['id']}", "b": f"place:{base['id']}/port"}).status_code == 200

    from app.storage.schema import EditionMap, ReaderShare
    from app.storage.world_publishing import extras_view

    doc = MapDoc.model_validate(version | {"reader": ReaderShare(published=True).model_dump(), "journeys": [{"id": "j", "characterId": ada["id"], "stops": [{"id": "s", "x": 1, "y": 1}]}]})
    view = extras_view("b", [EditionMap(mapId=doc.id, doc=doc)], [], 1)
    assert view.maps[0].journeys == [] and view.maps[0].versionOf == base["id"]
