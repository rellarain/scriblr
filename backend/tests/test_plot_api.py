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


def test_assigned_paragraph_index_round_trips(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Paragraph Anchor Test"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"].append(
        {
            "id": "cat_1",
            "kind": "category",
            "parentId": None,
            "order": 0,
            "title": "Betrayal",
        }
    )
    tree["nodes"].append(
        {
            "id": "sub_1",
            "kind": "subcategory",
            "parentId": "cat_1",
            "order": 0,
            "title": "Early hints",
        }
    )
    tree["nodes"].append(
        {
            "id": "pl_1",
            "kind": "plotline",
            "parentId": "sub_1",
            "order": 0,
            "title": "The mole",
        }
    )
    tree["nodes"].append(
        {
            "id": "pp_1",
            "kind": "plotpoint",
            "parentId": "pl_1",
            "order": 0,
            "title": "Reveal",
            "assignedMomentId": "moment_1",
            "assignedParagraphIndex": 2,
        }
    )
    resp = client.put(f"/api/projects/{project_id}/plot", json=tree)
    assert resp.status_code == 200
    nodes_by_id = {n["id"]: n for n in resp.json()["nodes"]}
    assert nodes_by_id["sub_1"]["kind"] == "subcategory"
    assert nodes_by_id["pl_1"]["parentId"] == "sub_1"
    assert nodes_by_id["pp_1"]["assignedParagraphIndex"] == 2

    resp = client.get(f"/api/projects/{project_id}/plot")
    reloaded = {n["id"]: n for n in resp.json()["nodes"]}
    assert reloaded["pp_1"]["assignedParagraphIndex"] == 2
    assert reloaded["pp_1"]["assignedMomentId"] == "moment_1"


def test_source_field_id_round_trips(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Source Field Test"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"].append(
        {
            "id": "cat_1",
            "kind": "category",
            "parentId": None,
            "order": 0,
            "title": "Characters",
            "customFieldDefs": [{"id": "field_1", "name": "Personality"}],
        }
    )
    tree["nodes"].append(
        {
            "id": "pl_1",
            "kind": "plotline",
            "parentId": "cat_1",
            "order": 0,
            "title": "Protagonist",
            "customFieldValues": {"field_1": "Stubborn but fiercely loyal"},
        }
    )
    tree["nodes"].append(
        {
            "id": "pp_1",
            "kind": "plotpoint",
            "parentId": "pl_1",
            "order": 0,
            "title": "Personality",
            "body": "Stubborn but fiercely loyal",
            "sourceFieldId": "field_1",
        }
    )
    resp = client.put(f"/api/projects/{project_id}/plot", json=tree)
    assert resp.status_code == 200
    nodes_by_id = {n["id"]: n for n in resp.json()["nodes"]}
    assert nodes_by_id["pp_1"]["sourceFieldId"] == "field_1"
    assert nodes_by_id["pp_1"]["body"] == "Stubborn but fiercely loyal"

    resp = client.get(f"/api/projects/{project_id}/plot")
    reloaded = {n["id"]: n for n in resp.json()["nodes"]}
    assert reloaded["pp_1"]["sourceFieldId"] == "field_1"


def test_plotpoint_field_reference_and_awareness_round_trip(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Fields"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    base = {"parentId": None, "order": 0, "title": "", "body": ""}
    tree["nodes"] = [
        {**base, "id": "cat", "kind": "category", "customFieldDefs": [{"id": "f1", "name": "Theme"}]},
        {**base, "id": "val", "kind": "plotpoint", "parentId": "cat", "title": "Trust", "fieldId": "f1"},
        {**base, "id": "line", "kind": "plotline", "parentId": "cat"},
        {**base, "id": "ref", "kind": "plotpoint", "parentId": "line", "fieldId": "f1", "refId": "val",
         "assignedMomentId": "m1", "awareness": "back"},
    ]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    nodes = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}
    assert nodes["val"]["fieldId"] == "f1" and nodes["val"]["refId"] is None and nodes["val"]["awareness"] is None
    assert (nodes["ref"]["refId"], nodes["ref"]["awareness"]) == ("val", "back")


def test_plotpoint_awareness_only_takes_the_four_states(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Bad"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] = [{"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "x", "awareness": "sideways"}]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 422


def test_plots_saved_before_fields_still_load(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Old"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] = [{"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "old", "body": ""}]
    client.put(f"/api/projects/{project_id}/plot", json=tree)
    node = client.get(f"/api/projects/{project_id}/plot").json()["nodes"][0]
    assert (node["fieldId"], node["refId"], node["awareness"]) == (None, None, None)
