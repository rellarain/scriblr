from fastapi.testclient import TestClient

from app.storage.schema import PLOT_FIELDSET_NAME_MAX, PLOT_MAX_FIELDSETS, PLOT_MAX_OPTIONS, PLOT_OPTION_LABEL_MAX


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
    # A plotpoint saved with its one old place holds it as its first placement, and the old field is left empty.
    assert nodes[2]["assignedMomentId"] is None
    assert nodes[2]["placements"] == [{"id": "pp_1@moment_1", "targetId": "moment_1", "paragraphIndex": None, "awareness": None}]
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
    assert nodes_by_id["pp_1"]["placements"][0]["paragraphIndex"] == 2

    resp = client.get(f"/api/projects/{project_id}/plot")
    reloaded = {n["id"]: n for n in resp.json()["nodes"]}
    assert reloaded["pp_1"]["placements"] == [{"id": "pp_1@moment_1", "targetId": "moment_1", "paragraphIndex": 2, "awareness": None}]
    assert reloaded["pp_1"]["assignedMomentId"] is None and reloaded["pp_1"]["assignedParagraphIndex"] is None


def test_a_cluster_sits_between_a_subcategory_and_a_plotline_with_its_own_fields(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Cluster Test"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] += [
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Betrayal"},
        {"id": "sub_1", "kind": "subcategory", "parentId": "cat_1", "order": 0, "title": "Early hints"},
        {"id": "cl_1", "kind": "cluster", "parentId": "sub_1", "order": 0, "title": "The household", "hue": 180,
         "customFieldDefs": [{"id": "f1", "name": "Motive"}]},
        {"id": "pl_1", "kind": "plotline", "parentId": "cl_1", "order": 0, "title": "The mole"},
        {"id": "pl_2", "kind": "plotline", "parentId": "sub_1", "order": 1, "title": "Skips the cluster"},
    ]
    resp = client.put(f"/api/projects/{project_id}/plot", json=tree)
    assert resp.status_code == 200
    reloaded = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}
    assert reloaded["cl_1"]["kind"] == "cluster"
    assert reloaded["cl_1"]["parentId"] == "sub_1"
    assert reloaded["cl_1"]["hue"] == 180
    assert reloaded["cl_1"]["customFieldDefs"] == [{"id": "f1", "name": "Motive", "setId": None, "kind": None, "options": []}]
    assert reloaded["pl_1"]["parentId"] == "cl_1"
    assert reloaded["pl_2"]["parentId"] == "sub_1"


def test_fieldsets_round_trip_with_the_fields_listed_under_them(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Fieldsets"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] += [
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast",
         "customFieldSets": [{"id": "set_1", "name": "Looks"}, {"id": "set_2", "name": "Past"}],
         "customFieldDefs": [{"id": "f1", "name": "Hair", "setId": "set_1"}, {"id": "f2", "name": "Motto"}, {"id": "f3", "name": "Home", "setId": "set_2"}]},
    ]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    cat = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}["cat_1"]
    assert cat["customFieldSets"] == [{"id": "set_1", "name": "Looks"}, {"id": "set_2", "name": "Past"}]
    assert [(d["id"], d["setId"]) for d in cat["customFieldDefs"]] == [("f1", "set_1"), ("f2", None), ("f3", "set_2")]


def test_a_plot_saved_before_fieldsets_loads_with_no_sets_and_loose_fields(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Old plot"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] += [
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast", "customFieldDefs": [{"id": "f1", "name": "Hair"}]},
    ]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    cat = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}["cat_1"]
    assert cat["customFieldSets"] == []
    assert cat["customFieldDefs"][0]["setId"] is None


def test_a_fieldset_name_that_is_too_long_is_cut_not_refused(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Long set"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] += [
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast", "customFieldSets": [{"id": "s", "name": "N" * 80}]},
    ]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    cat = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}["cat_1"]
    assert cat["customFieldSets"][0]["name"] == "N" * PLOT_FIELDSET_NAME_MAX


def test_more_than_the_most_fieldsets_on_a_node_is_refused(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Too many"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    sets = [{"id": f"s{i}", "name": f"Set {i}"} for i in range(PLOT_MAX_FIELDSETS + 1)]
    tree["nodes"] += [{"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast", "customFieldSets": sets}]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 422


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
    assert nodes["val"]["fieldId"] == "f1" and nodes["val"]["refId"] is None and nodes["val"]["placements"] == []
    # The old awareness went with the old place into a placement.
    assert nodes["ref"]["refId"] == "val"
    assert [(p["targetId"], p["awareness"]) for p in nodes["ref"]["placements"]] == [("m1", "back")]
    assert nodes["ref"]["awareness"] is None


def test_plotpoint_awareness_only_takes_the_four_states(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Bad"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] = [{"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "x", "awareness": "sideways"}]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 422
    tree["nodes"] = [{"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "x", "placements": [{"id": "a", "targetId": "m1", "awareness": "sideways"}]}]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 422


def _point(placements: list[dict], **over) -> dict:
    return {"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "x", "body": "", "placements": placements, **over}


def test_a_plotpoint_keeps_many_placements_each_with_its_own_awareness_and_paragraph(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Many"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    placements = [
        {"id": "a", "targetId": "ch1", "paragraphIndex": None, "awareness": None},
        {"id": "b", "targetId": "m1", "paragraphIndex": 2, "awareness": "back"},
        {"id": "c", "targetId": "m2", "paragraphIndex": None, "awareness": "off"},
    ]
    tree["nodes"] = [_point(placements)]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    node = client.get(f"/api/projects/{project_id}/plot").json()["nodes"][0]
    assert node["placements"] == placements
    # Saved again as it came back, nothing changes.
    assert client.put(f"/api/projects/{project_id}/plot", json={"nodes": [node]}).json()["nodes"][0]["placements"] == placements


def test_a_plotpoint_is_placed_once_on_a_target_and_at_most_a_hundred_times(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Cut"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    twice = [{"id": "a", "targetId": "m1", "awareness": "front"}, {"id": "b", "targetId": "m1", "awareness": "off"}, {"id": "c", "targetId": "m2"}]
    many = [{"id": f"x{i}", "targetId": f"m{i}"} for i in range(130)]
    tree["nodes"] = [_point(twice), _point(many, id="q")]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    nodes = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}
    assert [(p["id"], p["awareness"]) for p in nodes["p"]["placements"]] == [("a", "front"), ("c", None)]  # the first to a target wins
    assert len(nodes["q"]["placements"]) == 100 and nodes["q"]["placements"][-1]["id"] == "x99"


def test_an_old_place_is_read_into_a_placement_beside_new_ones_and_only_once(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Legacy"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    old = {"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "x", "assignedMomentId": "m1", "assignedParagraphIndex": 1, "awareness": "mid"}
    already = {"id": "q", "kind": "plotpoint", "parentId": None, "order": 1, "title": "y", "assignedMomentId": "m1",
               "placements": [{"id": "own", "targetId": "m1", "awareness": "front"}]}
    tree["nodes"] = [old, already]
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    nodes = {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}
    assert nodes["p"]["placements"] == [{"id": "p@m1", "targetId": "m1", "paragraphIndex": 1, "awareness": "mid"}]
    assert nodes["q"]["placements"] == [{"id": "own", "targetId": "m1", "paragraphIndex": None, "awareness": "front"}]  # not placed twice
    for n in nodes.values():
        assert (n["assignedMomentId"], n["assignedParagraphIndex"], n["awareness"]) == (None, None, None)


def test_plots_saved_before_fields_still_load(client: TestClient) -> None:
    project_id = client.post("/api/projects", json={"title": "Old"}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] = [{"id": "p", "kind": "plotpoint", "parentId": None, "order": 0, "title": "old", "body": ""}]
    client.put(f"/api/projects/{project_id}/plot", json=tree)
    node = client.get(f"/api/projects/{project_id}/plot").json()["nodes"][0]
    assert (node["fieldId"], node["refId"], node["awareness"], node["placements"]) == (None, None, None, [])


# --------------------------------------------------------------------------- fields of other kinds, and their answers


def _plot_with(client: TestClient, title: str, *nodes: dict) -> dict:
    project_id = client.post("/api/projects", json={"title": title}).json()["projectId"]
    tree = client.get(f"/api/projects/{project_id}/plot").json()
    tree["nodes"] += list(nodes)
    assert client.put(f"/api/projects/{project_id}/plot", json=tree).status_code == 200
    return {n["id"]: n for n in client.get(f"/api/projects/{project_id}/plot").json()["nodes"]}


def test_choice_fields_round_trip_with_their_options_and_the_answers_that_use_them(client: TestClient) -> None:
    nodes = _plot_with(
        client, "Choices",
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast", "customFieldDefs": [
            {"id": "f1", "name": "Genre", "kind": "multi", "options": [{"id": "o1", "label": "Fantasy"}, {"id": "o2", "label": "Romance"}]},
            {"id": "f2", "name": "Tone", "kind": "dropdown", "options": [{"id": "o3", "label": "Dark"}]},
            {"id": "f3", "name": "Motto", "kind": "text"},
            {"id": "f4", "name": "Notes"},
        ]},
        {"id": "pl_1", "kind": "plotline", "parentId": "cat_1", "order": 0, "title": "Line"},
        {"id": "pp_1", "kind": "plotpoint", "parentId": "pl_1", "order": 0, "title": "Fantasy", "fieldId": "f1", "optionId": "o1"},
    )
    defs = {d["id"]: d for d in nodes["cat_1"]["customFieldDefs"]}
    assert (defs["f1"]["kind"], [(o["id"], o["label"]) for o in defs["f1"]["options"]]) == ("multi", [("o1", "Fantasy"), ("o2", "Romance")])
    assert (defs["f2"]["kind"], defs["f3"]["kind"], defs["f3"]["options"]) == ("dropdown", "text", [])
    assert nodes["pp_1"]["optionId"] == "o1"


def test_a_plot_saved_before_field_kinds_has_only_the_usual_kind_and_no_answers(client: TestClient) -> None:
    nodes = _plot_with(
        client, "Old fields",
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast", "customFieldDefs": [{"id": "f1", "name": "Hair"}]},
        {"id": "pp_1", "kind": "plotpoint", "parentId": "cat_1", "order": 0, "title": "Red", "fieldId": "f1"},
    )
    assert nodes["cat_1"]["customFieldDefs"][0]["kind"] is None
    assert nodes["cat_1"]["customFieldDefs"][0]["options"] == []
    assert nodes["pp_1"]["optionId"] is None


def test_a_kind_this_version_does_not_know_is_read_as_the_usual_one_not_refused(client: TestClient) -> None:
    nodes = _plot_with(
        client, "Newer file",
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast",
         "customFieldDefs": [{"id": "f1", "name": "Mood", "kind": "radio", "options": [{"id": "o1", "label": "Calm"}]}]},
    )
    assert nodes["cat_1"]["customFieldDefs"][0]["kind"] is None


def test_an_option_label_too_long_is_cut_a_repeated_option_id_and_the_surplus_are_dropped(client: TestClient) -> None:
    options = [{"id": "o1", "label": "L" * 90}, {"id": "o1", "label": "again"}] + [{"id": f"x{i}", "label": f"Option {i}"} for i in range(PLOT_MAX_OPTIONS + 5)]
    nodes = _plot_with(
        client, "Many options",
        {"id": "cat_1", "kind": "category", "parentId": None, "order": 0, "title": "Cast",
         "customFieldDefs": [{"id": "f1", "name": "Genre", "kind": "multi", "options": options}]},
    )
    kept = nodes["cat_1"]["customFieldDefs"][0]["options"]
    assert kept[0] == {"id": "o1", "label": "L" * PLOT_OPTION_LABEL_MAX}
    assert len(kept) == PLOT_MAX_OPTIONS
    assert [o["id"] for o in kept].count("o1") == 1
