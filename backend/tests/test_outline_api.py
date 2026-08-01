from fastapi.testclient import TestClient


def test_get_and_replace_outline(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Outline API Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/outline")
    assert resp.status_code == 200
    tree = resp.json()
    book_id = tree["nodes"][0]["id"]

    # Flexible nesting: a chapter directly under the book, then a moment
    # directly under the chapter, skipping arc and scene.
    tree["nodes"].append(
        {
            "id": "ch_1",
            "kind": "chapter",
            "parentId": book_id,
            "order": 0,
            "title": "Chapter One",
            "synopsis": "",
            "draftRef": None,
        }
    )
    tree["nodes"].append(
        {
            "id": "moment_1",
            "kind": "moment",
            "parentId": "ch_1",
            "order": 0,
            "title": "Opening beat",
            "synopsis": "",
            "draftRef": "moment_1",
        }
    )
    resp = client.put(f"/api/projects/{project_id}/outline", json=tree)
    assert resp.status_code == 200
    assert len(resp.json()["nodes"]) == 3

    resp = client.get(f"/api/projects/{project_id}/outline")
    assert [n["id"] for n in resp.json()["nodes"]] == [book_id, "ch_1", "moment_1"]
    assert resp.json()["nodes"][2]["parentId"] == "ch_1"


def test_outline_for_missing_project_404s(client: TestClient) -> None:
    resp = client.get("/api/projects/nope/outline")
    assert resp.status_code == 404


def test_act_kind_nests_between_chapter_and_scene(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Act Level Test"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    book_id = tree["nodes"][0]["id"]

    tree["nodes"].append(
        {"id": "ch_1", "kind": "chapter", "parentId": book_id, "order": 0, "title": "Chapter One"}
    )
    tree["nodes"].append({"id": "act_1", "kind": "act", "parentId": "ch_1", "order": 0, "title": "Act One"})
    tree["nodes"].append(
        {"id": "scene_1", "kind": "scene", "parentId": "act_1", "order": 0, "title": "Scene One"}
    )
    resp = client.put(f"/api/projects/{project_id}/outline", json=tree)
    assert resp.status_code == 200

    resp = client.get(f"/api/projects/{project_id}/outline")
    nodes_by_id = {n["id"]: n for n in resp.json()["nodes"]}
    assert nodes_by_id["act_1"]["kind"] == "act"
    assert nodes_by_id["act_1"]["parentId"] == "ch_1"
    assert nodes_by_id["scene_1"]["parentId"] == "act_1"


def test_book_color_chapter_target_and_plotline_ids_round_trip(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Book Fields Test"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    book = tree["nodes"][0]
    book["color"] = "#4a90d9"
    book["chapterCountTarget"] = 12
    book["plotlineIds"] = ["line_1", "line_2"]

    resp = client.put(f"/api/projects/{project_id}/outline", json=tree)
    assert resp.status_code == 200
    saved = resp.json()["nodes"][0]
    assert saved["color"] == "#4a90d9"
    assert saved["chapterCountTarget"] == 12
    assert saved["plotlineIds"] == ["line_1", "line_2"]

    resp = client.get(f"/api/projects/{project_id}/outline")
    reloaded = resp.json()["nodes"][0]
    assert reloaded["color"] == "#4a90d9"
    assert reloaded["chapterCountTarget"] == 12
    assert reloaded["plotlineIds"] == ["line_1", "line_2"]


def test_book_fields_default_to_empty_when_unset(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Book Defaults Test"}).json()["projectId"]
    resp = client.get(f"/api/projects/{project_id}/outline")
    book = resp.json()["nodes"][0]
    assert book["color"] is None
    assert book["chapterCountTarget"] is None
    assert book["plotlineIds"] == []
