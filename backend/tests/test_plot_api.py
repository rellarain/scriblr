from fastapi.testclient import TestClient


def test_get_and_replace_plot_tree(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Plot API Test"}).json()["projectId"]

    resp = client.get(f"/api/projects/{project_id}/plot")
    assert resp.status_code == 200
    assert resp.json()["nodes"] == []

    tree = resp.json()
    tree["nodes"].append(
        {
            "id": "cat_1",
            "kind": "category",
            "parentId": None,
            "order": 0,
            "title": "Betrayal",
            "body": "",
            "assignedMomentId": None,
        }
    )
    tree["nodes"].append(
        {
            "id": "pl_1",
            "kind": "plotline",
            "parentId": "cat_1",
            "order": 0,
            "title": "The mole",
            "body": "",
            "assignedMomentId": None,
        }
    )
    tree["nodes"].append(
        {
            "id": "pp_1",
            "kind": "plotpoint",
            "parentId": "pl_1",
            "order": 0,
            "title": "Reveal",
            "body": "What if the villain is the narrator's future self?",
            "assignedMomentId": "moment_1",
        }
    )
    resp = client.put(f"/api/projects/{project_id}/plot", json=tree)
    assert resp.status_code == 200
    assert len(resp.json()["nodes"]) == 3

    resp = client.get(f"/api/projects/{project_id}/plot")
    nodes = resp.json()["nodes"]
    assert [n["id"] for n in nodes] == ["cat_1", "pl_1", "pp_1"]
    assert nodes[2]["assignedMomentId"] == "moment_1"
    assert nodes[2]["body"] == "What if the villain is the narrator's future self?"


def test_plot_for_missing_project_404s(client: TestClient) -> None:
    resp = client.get("/api/projects/nope/plot")
    assert resp.status_code == 404
