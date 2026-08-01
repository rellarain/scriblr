from fastapi.testclient import TestClient


def _seed_project_with_draft(client: TestClient) -> tuple[str, str, str]:
    """Creates a project (auto-seeded with one book), adds a chapter with a
    drafted moment under it, and returns (project_id, book_id, chapter_id)."""
    project_id = client.post("/api/projects", json={"title": "Export Test"}).json()["projectId"]
    outline = client.get(f"/api/projects/{project_id}/outline").json()
    book_id = outline["nodes"][0]["id"]

    outline["nodes"].append(
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
    outline["nodes"].append(
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
    resp = client.put(f"/api/projects/{project_id}/outline", json=outline)
    assert resp.status_code == 200

    resp = client.put(
        f"/api/projects/{project_id}/draft/moment_1",
        json={"outlineNodeId": "moment_1", "body": "**Bold** opening prose for the export test."},
    )
    assert resp.status_code == 200

    return project_id, book_id, "ch_1"


def test_export_book_pdf(client: TestClient) -> None:
    project_id, book_id, _ = _seed_project_with_draft(client)

    resp = client.get(f"/api/projects/{project_id}/export/book/{book_id}")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.content[:4] == b"%PDF"
    assert len(resp.content) > 500


def test_export_chapter_pdf(client: TestClient) -> None:
    project_id, _, chapter_id = _seed_project_with_draft(client)

    resp = client.get(f"/api/projects/{project_id}/export/chapter/{chapter_id}")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_export_book_pdf_404_for_unknown_book(client: TestClient) -> None:
    project_id, _, _ = _seed_project_with_draft(client)

    resp = client.get(f"/api/projects/{project_id}/export/book/does-not-exist")
    assert resp.status_code == 404


def test_export_chapter_pdf_404_for_unknown_chapter(client: TestClient) -> None:
    project_id, _, _ = _seed_project_with_draft(client)

    resp = client.get(f"/api/projects/{project_id}/export/chapter/does-not-exist")
    assert resp.status_code == 404
