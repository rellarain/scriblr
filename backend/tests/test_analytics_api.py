from fastapi.testclient import TestClient


def _build_book_chapter_moment(
    client: TestClient, project_id: str, book_chapter_count_target: int | None = None
) -> tuple[str, str, str]:
    tree = client.get(f"/api/projects/{project_id}/outline").json()
    book_id = tree["nodes"][0]["id"]
    if book_chapter_count_target is not None:
        tree["nodes"][0]["chapterCountTarget"] = book_chapter_count_target
    tree["nodes"].append(
        {
            "id": "ch_1",
            "kind": "chapter",
            "parentId": book_id,
            "order": 0,
            "title": "Chapter One",
            "synopsis": "",
        }
    )
    tree["nodes"].append(
        {
            "id": "moment_1",
            "kind": "moment",
            "parentId": "ch_1",
            "order": 0,
            "title": "Opening",
            "synopsis": "",
            "flag": {"type": "review", "note": "needs work"},
        }
    )
    client.put(f"/api/projects/{project_id}/outline", json=tree)
    return book_id, "ch_1", "moment_1"


def test_analytics_totals_and_goal_echo(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Analytics Test"}).json()["projectId"]
    client.patch(
        f"/api/projects/{project_id}",
        json={"wordCountTarget": 100, "bookCountTarget": 1},
    )
    book_id, chapter_id, moment_id = _build_book_chapter_moment(client, project_id, book_chapter_count_target=5)
    client.put(
        f"/api/projects/{project_id}/draft/{moment_id}",
        json={"outlineNodeId": moment_id, "body": "Five little words here indeed."},
    )

    resp = client.get(f"/api/projects/{project_id}/analytics")
    assert resp.status_code == 200
    body = resp.json()

    assert body["totals"]["bookCount"] == 1
    assert body["totals"]["chapterCount"] == 1
    assert body["totals"]["momentCount"] == 1
    assert body["totals"]["totalWordCount"] == 5

    assert body["goals"]["wordCountTarget"] == 100
    assert body["goals"]["bookCountTarget"] == 1
    assert "chapterCountTarget" not in body["goals"]

    per_book = next(b for b in body["perBook"] if b["nodeId"] == book_id)
    assert per_book["wordCount"] == 5
    assert per_book["chapterCount"] == 1
    assert per_book["chapterCountTarget"] == 5

    per_chapter = next(c for c in body["perChapter"] if c["nodeId"] == chapter_id)
    assert per_chapter["wordCount"] == 5
    assert per_chapter["bookId"] == book_id


def test_analytics_collects_flagged_nodes_from_outline_and_plot(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Flags Test"}).json()["projectId"]
    _build_book_chapter_moment(client, project_id)

    plot = client.get(f"/api/projects/{project_id}/plot").json()
    plot["nodes"].append(
        {
            "id": "cat_1",
            "kind": "category",
            "parentId": None,
            "order": 0,
            "title": "Themes",
            "flag": {"type": "edit", "note": "expand"},
        }
    )
    client.put(f"/api/projects/{project_id}/plot", json=plot)

    resp = client.get(f"/api/projects/{project_id}/analytics")
    flagged = resp.json()["flaggedNodes"]
    assert {f["nodeId"] for f in flagged} == {"moment_1", "cat_1"}
    outline_flag = next(f for f in flagged if f["nodeId"] == "moment_1")
    assert outline_flag["treeType"] == "outline"
    assert outline_flag["flag"]["type"] == "review"
    plot_flag = next(f for f in flagged if f["nodeId"] == "cat_1")
    assert plot_flag["treeType"] == "plot"
    assert plot_flag["flag"]["type"] == "edit"
