"""A book's goals in its outline node: the outline to fill (scenes and moments besides chapters), whether its goals have dates, and the
days a book and its arcs are to be done by."""

from fastapi.testclient import TestClient


def _project(client: TestClient) -> tuple[str, dict]:
    project_id = client.post("/api/projects", json={"title": "Goals"}).json()["projectId"]
    return project_id, client.get(f"/api/projects/{project_id}/outline").json()


def test_book_goals_and_dates_are_kept(client: TestClient) -> None:
    project_id, tree = _project(client)
    book = tree["nodes"][0]
    assert book["sceneCountTarget"] is None and book["momentCountTarget"] is None
    assert book["goalsDated"] is False and book["dueDate"] is None
    book.update(sceneCountTarget=120, momentCountTarget=400, goalsDated=True, dueDate="2027-06-30")
    tree["nodes"].append({"id": "arc1", "kind": "arc", "parentId": book["id"], "order": 0, "title": "Crossing", "dueDate": "2027-01-31"})
    assert client.put(f"/api/projects/{project_id}/outline", json=tree).status_code == 200

    nodes = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/outline").json()["nodes"]}
    assert nodes[book["id"]]["sceneCountTarget"] == 120
    assert nodes[book["id"]]["momentCountTarget"] == 400
    assert nodes[book["id"]]["goalsDated"] is True
    assert nodes[book["id"]]["dueDate"] == "2027-06-30"
    assert nodes["arc1"]["dueDate"] == "2027-01-31"


def test_an_empty_date_is_no_date(client: TestClient) -> None:
    project_id, tree = _project(client)
    tree["nodes"][0]["dueDate"] = ""
    resp = client.put(f"/api/projects/{project_id}/outline", json=tree)
    assert resp.status_code == 200
    assert resp.json()["nodes"][0]["dueDate"] is None


def test_a_date_that_is_not_a_day_or_a_goal_below_one_is_refused(client: TestClient) -> None:
    project_id, tree = _project(client)
    for bad in ({"dueDate": "30/06/2027"}, {"dueDate": "2027-02-30"}, {"sceneCountTarget": 0}, {"momentCountTarget": -3}):
        tree["nodes"][0].update({"dueDate": None, "sceneCountTarget": None, "momentCountTarget": None, **bad})
        assert client.put(f"/api/projects/{project_id}/outline", json=tree).status_code == 422, bad
