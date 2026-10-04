import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage.project_store import project_dir_of
from app.storage.schema import hex_to_hue


def _create_project(client: TestClient) -> str:
    return client.post("/api/projects", json={"title": "Hues"}).json()["projectId"]


def _node(id: str, kind: str, parent: str | None, order: int, **extra) -> dict:
    base = {
        "id": id, "kind": kind, "parentId": parent, "order": order, "title": "", "synopsis": "",
        "draftRef": None, "flag": None, "color": None, "chapterCountTarget": None,
        "plotlineIds": [], "wordCountGoal": None,
    }
    base.update(extra)
    return base


def _plot_node(id: str, kind: str, parent: str | None, order: int, **extra) -> dict:
    base = {
        "id": id, "kind": kind, "parentId": parent, "order": order, "title": "", "body": "",
        "assignedMomentId": None, "assignedParagraphIndex": None, "sourceFieldId": None,
        "customFieldDefs": [], "customFieldValues": {}, "keywords": [], "flag": None,
    }
    base.update(extra)
    return base


def test_hex_to_hue() -> None:
    assert hex_to_hue("#ff0000") == 0
    assert hex_to_hue("#00ff00") == 120
    assert hex_to_hue("#0000ff") == 240
    assert hex_to_hue("3a8fb0") == 197
    assert hex_to_hue("#5a3a1e") == 28
    assert hex_to_hue("#6b6b6b") == 0  # a grey has no hue: the value is 0
    assert hex_to_hue("nope") is None
    assert hex_to_hue(None) is None


def test_a_legacy_book_colour_becomes_its_theme_hue(client: TestClient) -> None:
    project_id = _create_project(client)
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [_node("b1", "book", None, 0, color="#3f7a4a")]})
    book = client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"][0]
    assert book["themeHue"] == 131
    assert "accentHue" not in book  # a book has the one colour


def test_an_explicit_theme_hue_is_kept_and_a_legacy_accent_hue_is_dropped(client: TestClient) -> None:
    project_id = _create_project(client)
    node = _node("b1", "book", None, 0, color="#3f7a4a", themeHue=250, accentHue=10)
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [node]})
    book = client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"][0]
    assert book["themeHue"] == 250
    assert "accentHue" not in book


def test_a_grey_legacy_colour_becomes_a_saturated_red_not_a_desaturated_one(client: TestClient) -> None:
    project_id = _create_project(client)
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [_node("b1", "book", None, 0, color="#6b6b6b")]})
    assert client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"][0]["themeHue"] == 360  # 0 would read as desaturated


def test_hue_codes_are_limited_to_the_range_minus_724_to_724(client: TestClient) -> None:
    project_id = _create_project(client)
    for bad_value in (725, -725):
        bad = _node("b1", "book", None, 0, themeHue=bad_value)
        assert client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [bad]}).status_code == 422
        bad_plot = _plot_node("c1", "category", None, 0, hue=bad_value)
        assert client.put(f"/api/projects/{project_id}/plot", json={"schemaVersion": 1, "nodes": [bad_plot]}).status_code == 422


def test_category_and_subcategory_hues_round_trip(client: TestClient) -> None:
    project_id = _create_project(client)
    nodes = [_plot_node("c1", "category", None, 0, hue=200), _plot_node("s1", "subcategory", "c1", 0, hue=230), _plot_node("c2", "category", None, 1)]
    resp = client.put(f"/api/projects/{project_id}/plot", json={"schemaVersion": 1, "nodes": nodes})
    assert resp.status_code == 200
    saved = {n["id"]: n["hue"] for n in client.get(f"/api/projects/{project_id}").json()["plot"]["nodes"]}
    assert saved == {"c1": 200, "s1": 230, "c2": None}


def test_project_theme_hue_is_stored_and_validated(client: TestClient) -> None:
    project_id = _create_project(client)
    assert client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["themeHue"] is None
    resp = client.patch(f"/api/projects/{project_id}", json={"themeHue": 150})
    assert resp.status_code == 200
    assert resp.json()["settings"]["themeHue"] == 150
    assert client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["themeHue"] == 150
    assert client.patch(f"/api/projects/{project_id}", json={"themeHue": 725}).status_code == 422
    # Other settings changes leave it alone.
    client.patch(f"/api/projects/{project_id}", json={"wordCountTarget": 1000})
    assert client.get(f"/api/projects/{project_id}").json()["index"]["settings"]["themeHue"] == 150


def test_series_arc_and_chapter_keep_their_own_theme_hue(client: TestClient) -> None:
    project_id = _create_project(client)
    nodes = [
        _node("s1", "series", None, 0, themeHue=120),
        _node("b1", "book", "s1", 0, themeHue=200),
        _node("a1", "arc", "b1", 0, themeHue=240),
        _node("c1", "chapter", "a1", 0, themeHue=280),
    ]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    saved = {n["id"]: n for n in client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"]}
    assert [saved[i]["themeHue"] for i in ("s1", "b1", "a1", "c1")] == [120, 200, 240, 280]


def test_level_hues_hold_a_tone_and_the_neutral_stops(client: TestClient) -> None:
    project_id = _create_project(client)
    # Hues of every tone (saturated 1-360, desaturated -360-0, light saturated 361-720, dark saturated -720 to -361)
    # and the neutral stops (-721 dark gray, 721 white, -722 / 722 dark / light gray of the parent, 723 light shade).
    assert client.patch(f"/api/projects/{project_id}", json={"themeHue": -721}).json()["settings"]["themeHue"] == -721
    assert client.patch(f"/api/projects/{project_id}", json={"themeHue": 725}).status_code == 422
    codes = {"b1": -500, "a1": 722, "a2": -722, "c1": 400, "c2": -20, "c3": 723, "c4": 721, "c5": 0}
    nodes = [_node("b1", "book", None, 0, themeHue=codes["b1"])] + [
        _node(i, "arc" if i.startswith("a") else "chapter", "b1", n, themeHue=c) for n, (i, c) in enumerate(list(codes.items())[1:])
    ]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    saved = {n["id"]: n["themeHue"] for n in client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"]}
    assert saved == codes


def _legacy_file(storage_root: Path, project_id: str) -> Path:
    return project_dir_of(storage_root, project_id) / "project.json"


def test_a_project_saved_with_the_old_swatches_is_converted_once_on_load(client: TestClient, storage_root: Path) -> None:
    project_id = _create_project(client)
    path = _legacy_file(storage_root, project_id)
    raw = json.loads(path.read_text(encoding="utf-8"))
    # What a version before the tones wrote: no hueScheme, plain hues 0-360 and the swatches 361-364.
    del raw["hueScheme"]
    raw["index"]["settings"]["themeHue"] = 0
    raw["outline"]["nodes"] = [
        _node("b1", "book", None, 0, themeHue=361), _node("b2", "book", None, 1, themeHue=362), _node("b3", "book", None, 2, themeHue=363),
        _node("b4", "book", None, 3, themeHue=364), _node("b5", "book", None, 4, themeHue=0), _node("b6", "book", None, 5, themeHue=200),
    ]
    raw["plot"]["nodes"] = [_plot_node("c1", "category", None, 0, hue=0), _plot_node("c2", "category", None, 1, hue=120)]
    raw["outlineHistory"] = [{"snapshotId": "s1", "treeType": "outline", "createdAt": "2026-01-01T00:00:00Z", "nodes": [{"id": "b1", "themeHue": 364}]}]
    path.write_text(json.dumps(raw), encoding="utf-8")

    body = client.get(f"/api/projects/{project_id}").json()
    assert body["index"]["settings"]["themeHue"] == 360  # a red stays a red (0 now means desaturated)
    assert [n["themeHue"] for n in body["outline"]["nodes"]] == [-388, -721, 0, 721, 360, 200]  # brown, black, gray, white, red, unchanged
    assert [n["hue"] for n in body["plot"]["nodes"]] == [360, 120]
    # The next change keeps the converted colours, and loading again does not convert them twice.
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": body["outline"]["nodes"]})
    assert json.loads(path.read_text(encoding="utf-8"))["hueScheme"] == 2
    again = client.get(f"/api/projects/{project_id}").json()
    assert [n["themeHue"] for n in again["outline"]["nodes"]] == [-388, -721, 0, 721, 360, 200]
    snapshot = json.loads(path.read_text(encoding="utf-8"))["outlineHistory"][0]["nodes"][0]
    assert snapshot["themeHue"] == 721  # kept snapshots are converted too


def test_a_new_project_is_already_in_the_current_hue_scheme(client: TestClient, storage_root: Path) -> None:
    project_id = _create_project(client)
    assert json.loads(_legacy_file(storage_root, project_id).read_text(encoding="utf-8"))["hueScheme"] == 2
