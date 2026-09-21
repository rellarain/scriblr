from fastapi.testclient import TestClient

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
    assert book["accentHue"] == 131  # the secondary colour is required: it starts as the primary hue


def test_a_book_with_no_hues_gets_the_default_for_both(client: TestClient) -> None:
    project_id = _create_project(client)
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [_node("b1", "book", None, 0)]})
    book = client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"][0]
    assert (book["themeHue"], book["accentHue"]) == (None, 28)


def test_only_books_get_an_accent_hue(client: TestClient) -> None:
    project_id = _create_project(client)
    nodes = [_node("b1", "book", None, 0), _node("c1", "chapter", "b1", 0)]
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": nodes})
    saved = {n["id"]: n["accentHue"] for n in client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"]}
    assert saved["c1"] is None


def test_an_explicit_theme_hue_is_kept_and_the_accent_hue_round_trips(client: TestClient) -> None:
    project_id = _create_project(client)
    node = _node("b1", "book", None, 0, color="#3f7a4a", themeHue=250, accentHue=10)
    client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [node]})
    book = client.get(f"/api/projects/{project_id}").json()["outline"]["nodes"][0]
    assert (book["themeHue"], book["accentHue"]) == (250, 10)


def test_hues_are_limited_to_0_360(client: TestClient) -> None:
    project_id = _create_project(client)
    bad = _node("b1", "book", None, 0, themeHue=400)
    assert client.put(f"/api/projects/{project_id}/outline", json={"schemaVersion": 2, "nodes": [bad]}).status_code == 422
    bad_plot = _plot_node("c1", "category", None, 0, hue=-5)
    assert client.put(f"/api/projects/{project_id}/plot", json={"schemaVersion": 1, "nodes": [bad_plot]}).status_code == 422


def test_category_and_subcategory_hues_round_trip(client: TestClient) -> None:
    project_id = _create_project(client)
    nodes = [_plot_node("c1", "category", None, 0, hue=200), _plot_node("s1", "subcategory", "c1", 0, hue=230), _plot_node("c2", "category", None, 1)]
    resp = client.put(f"/api/projects/{project_id}/plot", json={"schemaVersion": 1, "nodes": nodes})
    assert resp.status_code == 200
    saved = {n["id"]: n["hue"] for n in client.get(f"/api/projects/{project_id}").json()["plot"]["nodes"]}
    assert saved == {"c1": 200, "s1": 230, "c2": None}
