from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.storage import reader_store
from app.storage.schema import CharacterDoc, MapDoc, ReaderShare

START = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(reader_store, "_now", lambda: START)


def _world(client: TestClient) -> dict:
    """A book of three chapters (two published, the third not), a map with two places, a hero and a rival."""
    pid = client.post("/api/projects", json={"title": "World"}).json()["projectId"]
    nodes = [
        {"id": "b1", "kind": "book", "parentId": None, "order": 0, "title": "My Book"},
        {"id": "c1", "kind": "chapter", "parentId": "b1", "order": 0, "title": "One"},
        {"id": "c2", "kind": "chapter", "parentId": "b1", "order": 1, "title": "Two"},
        {"id": "c3", "kind": "chapter", "parentId": "b1", "order": 2, "title": "Three"},
        {"id": "s1", "kind": "scene", "parentId": "c1", "order": 0, "title": "Arrival"},
        {"id": "s2", "kind": "scene", "parentId": "c2", "order": 0, "title": "The vault"},
        {"id": "m1", "kind": "moment", "parentId": "s1", "order": 0, "title": "m1"},
        {"id": "m2", "kind": "moment", "parentId": "s2", "order": 0, "title": "m2"},
    ]
    client.put(f"/api/projects/{pid}/outline", json={"schemaVersion": 2, "nodes": nodes})
    client.put(f"/api/projects/{pid}/draft/chapter/c1/moment/m1", json={"outlineNodeId": "m1", "body": "The harbour."})
    client.put(f"/api/projects/{pid}/draft/chapter/c2/moment/m2", json={"outlineNodeId": "m2", "body": "The vault."})
    client.post(f"/api/projects/{pid}/publications/c1")
    client.post(f"/api/projects/{pid}/publications/c2")
    return {"pid": pid, "book": f"local-{pid}-b1"}


def _share_map(client: TestClient, pid: str, share: dict, **extra) -> MapDoc:
    doc = client.post(f"/api/projects/{pid}/maps", json={"title": "Veyra"}).json()
    doc["symbols"] = [
        {"id": "port", "layerId": next(l["id"] for l in doc["layers"] if l["kind"] == "symbols"), "kind": "town", "x": 3, "y": 3, "name": "Port Veyra"},
        {"id": "vault", "layerId": next(l["id"] for l in doc["layers"] if l["kind"] == "symbols"), "kind": "castle", "x": 8, "y": 8, "name": "The Vault"},
    ]
    doc["reader"] = share
    doc.update(extra)
    resp = client.put(f"/api/projects/{pid}/maps/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    return MapDoc.model_validate(resp.json())


def _share_character(client: TestClient, pid: str, name: str, share: dict, **extra) -> CharacterDoc:
    doc = client.post(f"/api/projects/{pid}/characters", json={"name": name}).json()
    doc["reader"] = share
    doc.update(extra)
    resp = client.put(f"/api/projects/{pid}/characters/{doc['id']}", json=doc)
    assert resp.status_code == 200, resp.text
    return CharacterDoc.model_validate(resp.json())


def _publish(client: TestClient, w: dict) -> None:
    assert client.post(f"/api/projects/{w['pid']}/books/b1/publish").status_code == 200


def _read_to(client: TestClient, w: dict, chapter: int) -> None:
    assert client.put(f"/api/reader/books/{w['book']}/reading", json={"chapter": chapter, "pct": 10}).status_code == 200


def _extras(client: TestClient, w: dict) -> dict:
    resp = client.get(f"/api/reader/books/{w['book']}/extras")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_the_share_is_repaired_never_refused() -> None:
    share = ReaderShare.model_validate({"published": "yes", "revealAt": 0, "reveals": {"a": 3, "b": "x", "c": -1, "": 2, "d": True}, "fields": ["role", "role", 5, "", "x" * 80]})
    assert share.published is False and share.revealAt is None and share.reveals == {"a": 3} and share.fields == ["role"]
    assert ReaderShare.model_validate({"revealAt": 12}).revealAt == 12
    assert MapDoc(id="m", reader="nonsense").reader == ReaderShare()  # type: ignore[arg-type]
    assert CharacterDoc(id="c", reader=[1]).reader == ReaderShare()  # type: ignore[arg-type]


def test_nothing_is_shown_until_it_is_published(client: TestClient) -> None:
    w = _world(client)
    _share_map(client, w["pid"], {"published": False})
    _share_character(client, w["pid"], "Ada", {"published": False, "fields": ["role"]})
    _publish(client, w)
    assert _extras(client, w) == {"bookId": w["book"], "reach": 0, "maps": [], "characters": [], "lockedMaps": 0, "lockedCharacters": 0}


def test_a_published_map_is_shown_from_its_chapter_and_a_symbol_from_its_own(client: TestClient) -> None:
    w = _world(client)
    _share_map(client, w["pid"], {"published": True, "revealAt": 1, "reveals": {"vault": 2}})
    _publish(client, w)

    _read_to(client, w, 1)
    first = _extras(client, w)
    assert first["reach"] == 1 and [m["title"] for m in first["maps"]] == ["Veyra"]
    assert [s["name"] for s in first["maps"][0]["symbols"]] == ["Port Veyra"]

    _read_to(client, w, 2)
    assert [s["name"] for s in _extras(client, w)["maps"][0]["symbols"]] == ["Port Veyra", "The Vault"]


def test_a_map_revealed_later_is_counted_but_not_sent(client: TestClient) -> None:
    w = _world(client)
    _share_map(client, w["pid"], {"published": True, "revealAt": 2})
    _publish(client, w)
    _read_to(client, w, 1)
    extras = _extras(client, w)
    assert extras["maps"] == [] and extras["lockedMaps"] == 1
    _read_to(client, w, 2)
    assert len(_extras(client, w)["maps"]) == 1


def test_reading_to_the_end_of_the_book_reveals_everything(client: TestClient) -> None:
    w = _world(client)
    _share_map(client, w["pid"], {"published": True, "revealAt": 2})
    _publish(client, w)
    client.put(f"/api/reader/books/{w['book']}/reading", json={"chapter": 1, "pct": 95})  # past 90%: finished
    assert len(_extras(client, w)["maps"]) == 1


def test_a_character_shows_only_its_public_fields_and_each_from_its_chapter(client: TestClient) -> None:
    w = _world(client)
    profile = {"role": "Navigator", "background": "Born at sea.", "fear": "Drowning", "fields": [{"id": "f1", "label": "Motto", "value": "Onward"}]}
    ada = _share_character(client, w["pid"], "Ada", {"published": True, "fields": ["role", "background", "field:f1", "possessions"], "reveals": {"background": 2}}, profile=profile)
    assert ada.reader.fields == ["role", "background", "field:f1", "possessions"]
    _publish(client, w)

    _read_to(client, w, 1)
    card = _extras(client, w)["characters"][0]
    assert card["name"] == "Ada" and card["look"]["skin"]
    assert [(f["key"], f["value"]) for f in card["fields"]] == [("role", "Navigator"), ("field:f1", "Onward")]  # the fear is private; empty possessions are left out

    _read_to(client, w, 2)
    assert [f["key"] for f in _extras(client, w)["characters"][0]["fields"]] == ["role", "background", "field:f1"]
    assert "Drowning" not in str(_extras(client, w))


def test_the_words_about_how_a_character_looks_can_be_public_one_by_one(client: TestClient) -> None:
    w = _world(client)
    profile = {"appearance": "A weathered woman with a sailor's squint.", "hair": "Grey, cropped.", "voice": "Low and dry.", "marks": "A scar through the left brow."}
    _share_character(client, w["pid"], "Ada", {"published": True, "fields": ["appearance", "hair", "marks"], "reveals": {"marks": 2}}, profile=profile)
    _publish(client, w)
    _read_to(client, w, 1)
    fields = _extras(client, w)["characters"][0]["fields"]
    assert [(f["key"], f["label"]) for f in fields] == [("appearance", "Appearance"), ("hair", "Hair")]  # the voice is private, the scar comes at chapter 2
    _read_to(client, w, 2)
    assert [f["key"] for f in _extras(client, w)["characters"][0]["fields"]] == ["appearance", "hair", "marks"]


def test_relationships_show_only_between_published_characters(client: TestClient) -> None:
    w = _world(client)
    bram = _share_character(client, w["pid"], "Bram", {"published": True})
    secret = _share_character(client, w["pid"], "Secret", {"published": False})
    links = [
        {"id": "r1", "targetId": bram.id, "kind": "friend", "label": "Old friend", "description": "Sailed together."},
        {"id": "r2", "targetId": secret.id, "kind": "enemy"},
    ]
    _share_character(client, w["pid"], "Ada", {"published": True, "fields": ["relationships"], "reveals": {"relationships": 2}}, relationships=links)
    _publish(client, w)

    _read_to(client, w, 1)
    assert all(c["relationships"] == [] for c in _extras(client, w)["characters"])
    _read_to(client, w, 2)
    ada = next(c for c in _extras(client, w)["characters"] if c["name"] == "Ada")
    assert [(r["targetName"], r["label"], r["description"]) for r in ada["relationships"]] == [("Bram", "Old friend", "Sailed together.")]


def test_a_child_map_loses_its_link_to_a_parent_that_is_not_shown(client: TestClient) -> None:
    w = _world(client)
    parent = _share_map(client, w["pid"], {"published": False})
    child = client.post(f"/api/projects/{w['pid']}/maps", json={"title": "Inn", "parentId": parent.id, "kind": "interior"}).json()
    child["reader"] = {"published": True}
    client.put(f"/api/projects/{w['pid']}/maps/{child['id']}", json=child)
    _publish(client, w)
    _read_to(client, w, 1)
    maps = _extras(client, w)["maps"]
    assert [m["title"] for m in maps] == ["Inn"] and maps[0]["parentId"] is None


def test_the_edition_is_frozen_so_later_changes_wait_for_the_next_one(client: TestClient) -> None:
    w = _world(client)
    mp = _share_map(client, w["pid"], {"published": True})
    _publish(client, w)
    changed = mp.model_dump(mode="json") | {"title": "Renamed"}
    client.put(f"/api/projects/{w['pid']}/maps/{mp.id}", json=changed)
    _share_character(client, w["pid"], "Later", {"published": True})
    _read_to(client, w, 1)
    extras = _extras(client, w)
    assert [m["title"] for m in extras["maps"]] == ["Veyra"] and extras["characters"] == []
    _publish(client, w)
    extras = _extras(client, w)
    assert [m["title"] for m in extras["maps"]] == ["Renamed"] and [c["name"] for c in extras["characters"]] == ["Later"]


def test_the_author_previews_any_chapter_with_what_is_published_now(client: TestClient) -> None:
    w = _world(client)
    _share_map(client, w["pid"], {"published": True, "revealAt": 2})
    base = f"/api/projects/{w['pid']}/books/b1/extras-preview"
    assert client.get(base, params={"chapter": 1}).json()["maps"] == []
    assert len(client.get(base, params={"chapter": 2}).json()["maps"]) == 1
    assert client.get(f"/api/projects/{w['pid']}/books/nope/extras-preview").status_code == 404
    assert client.get(base, params={"chapter": -1}).status_code == 422


def test_the_author_is_warned_when_a_reveal_comes_after_a_scene_that_uses_it(client: TestClient) -> None:
    w = _world(client)
    mp = _share_map(client, w["pid"], {"published": True, "reveals": {"port": 2}})
    ada = _share_character(client, w["pid"], "Ada", {"published": True, "revealAt": 2}, appearances=["s1", "s2"])
    nodes = client.get(f"/api/projects/{w['pid']}/outline").json()["nodes"]
    for n in nodes:
        if n["id"] == "s1":
            n["location"] = f"{mp.id}/port"
    client.put(f"/api/projects/{w['pid']}/outline", json={"schemaVersion": 2, "nodes": nodes})

    info = client.get(f"/api/projects/{w['pid']}/reader-extras").json()
    assert len(info) == 1 and info[0]["bookId"] == "b1"
    assert [(c["n"], c["title"]) for c in info[0]["chapters"]] == [(1, "One"), (2, "Two")]
    warnings = [(x["kind"], x["name"], x["revealAt"], x["sceneTitle"], x["chapter"]) for x in info[0]["warnings"]]
    assert warnings == [("character", "Ada", 2, "Arrival", 1), ("place", "Port Veyra", 2, "Arrival", 1)]
    assert ada.id in {x["targetId"] for x in info[0]["warnings"]}


def test_no_warning_when_the_reveal_is_in_time(client: TestClient) -> None:
    w = _world(client)
    _share_character(client, w["pid"], "Ada", {"published": True, "revealAt": 2}, appearances=["s2"])
    _share_character(client, w["pid"], "Bram", {"published": False, "revealAt": 2}, appearances=["s1"])
    assert client.get(f"/api/projects/{w['pid']}/reader-extras").json()[0]["warnings"] == []
    assert client.get("/api/projects/nope/reader-extras").status_code == 404


def test_other_books_have_no_extras(client: TestClient) -> None:
    assert client.get("/api/reader/books/nope/extras").status_code == 404
