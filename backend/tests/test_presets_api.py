import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.storage import presets_store


def content(name: str, **over) -> dict:
    return {"name": name, "description": "", "keywords": [], "fields": [], "subcategories": [], **over}


def draft(pid: str, name: str, **over) -> dict:
    return {"id": pid, "draft": content(name, **over)}


def save(client: TestClient, *items: dict):
    return client.put("/api/presets", json={"presets": list(items)})


def entry_of(body: dict, pid: str) -> dict:
    return next(e for e in body["presets"] if e["id"] == pid)


# --------------------------------------------------------------------------- the catalog and its first load


def test_get_presets_seeds_the_built_ins_as_unpublished_drafts(client: TestClient) -> None:
    resp = client.get("/api/presets")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schemaVersion"] == 2
    assert [p["draft"]["name"] for p in body["presets"]][:2] == ["Characters", "Settings"]
    assert len(body["presets"]) == 10
    for preset in body["presets"]:
        assert preset["published"] is None
        assert preset["history"] == []
        assert preset["nextVersion"] == 1
    assert client.get("/api/presets/published").json()["presets"] == []
    characters = entry_of(body, "preset-characters")
    assert characters["draft"]["fields"][:3] == ["Name", "Role", "Physical Description"]


def test_get_presets_is_stable_across_calls_and_processes(client: TestClient) -> None:
    first = client.get("/api/presets").json()
    assert client.get("/api/presets").json() == first
    # The built-ins' ids are fixed, not generated each time the module loads.
    assert [p["id"] for p in presets_store.default_catalog().model_dump()["presets"]] == [p["id"] for p in first["presets"]]


def test_a_corrupt_file_is_quarantined_and_reported(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "presets.json").write_text("{not json", encoding="utf-8")
    assert client.get("/api/presets").status_code == 409
    assert client.get("/api/presets").status_code == 200  # the next load starts from the defaults


# --------------------------------------------------------------------------- upgrading a version 1 file


V1 = {
    "schemaVersion": 1,
    "presets": [
        {"id": "preset_aaaa1111", "name": "Factions", "fields": ["Name", " Territory ", "", "Leader"]},
        {"id": "preset_bbbb2222", "name": "factions", "fields": []},
        {"id": "preset_cccc3333", "name": "", "fields": ["Orphan"]},
        {"id": "bad id!", "name": "X" * 80, "fields": ["Y" * 40]},
    ],
}


def test_a_version_1_file_becomes_unpublished_drafts_and_is_kept(client: TestClient, app_data_root: Path) -> None:
    (app_data_root / "presets.json").write_text(json.dumps(V1), encoding="utf-8")
    body = client.get("/api/presets").json()
    assert body["schemaVersion"] == 2
    first, second, nameless, long = body["presets"]
    assert first["id"] == "preset_aaaa1111"
    assert first["draft"]["fields"] == ["Name", "Territory", "Leader"]
    assert second["draft"]["name"] == "factions (copy)"  # names are unique now
    for entry in body["presets"]:
        assert entry["published"] is None and entry["history"] == [] and entry["nextVersion"] == 1
    assert client.get("/api/presets/published").json()["presets"] == []  # nothing is offered until it is published
    assert nameless["draft"]["name"] == "" and nameless["draft"]["fields"] == ["Orphan"]
    assert len(long["draft"]["name"]) == 50 and len(long["draft"]["fields"][0]) == 30
    assert long["id"] != "bad id!"
    assert json.loads((app_data_root / "presets.v1.json").read_text(encoding="utf-8")) == V1
    assert client.get("/api/presets").json() == body  # once only


# --------------------------------------------------------------------------- saving drafts


def test_put_replaces_the_drafts_in_order_and_keeps_what_was_published(client: TestClient) -> None:
    client.get("/api/presets")
    before = client.get("/api/presets").json()
    kept = entry_of(before, "preset-themes")
    resp = save(
        client,
        draft("fresh", "Factions", fields=["Name", "Territory"]),
        {"id": "preset-themes", "draft": content("Big ideas", fields=["Statement"])},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [p["id"] for p in body["presets"]] == ["fresh", "preset-themes"]
    themes = entry_of(body, "preset-themes")
    assert themes["draft"]["name"] == "Big ideas"
    assert themes["published"] == kept["published"]  # the Writer still sees "Themes"
    assert entry_of(body, "fresh")["published"] is None
    assert client.get("/api/presets").json() == body


def test_put_can_delete_everything(client: TestClient) -> None:
    client.get("/api/presets")
    assert save(client).json()["presets"] == []
    assert client.get("/api/presets/published").json()["presets"] == []


def test_put_cleans_the_text_it_is_given(client: TestClient) -> None:
    body = save(client, draft("a", "  Cast  ", description="  who  ", keywords=[" hero ", "", "hero", "villain"], fields=[" Name", "  ", "Role "])).json()
    saved = entry_of(body, "a")["draft"]
    assert saved["name"] == "Cast" and saved["description"] == "who"
    assert saved["keywords"] == ["hero", "villain"]
    assert saved["fields"] == ["Name", "Role"]


def test_put_keeps_fieldsets_cleans_them_and_drops_an_empty_one(client: TestClient) -> None:
    sets = [
        {"name": "  Looks ", "fields": [" Hair", "  ", "Eyes "]},
        {"name": "", "fields": []},  # an unfinished card: left out
        {"name": "Past", "fields": []},
    ]
    body = save(client, draft("a", "Cast", fields=["Motto"], fieldsets=sets)).json()
    saved = entry_of(body, "a")["draft"]
    assert saved["fields"] == ["Motto"]
    assert saved["fieldsets"] == [{"name": "Looks", "fields": ["Hair", "Eyes"]}, {"name": "Past", "fields": []}]
    # What was saved is what is read back, and a published copy holds the sets too.
    assert client.get("/api/presets").json() == body
    published = entry_of(client.post("/api/presets/a/publish").json(), "a")
    assert published["published"]["content"]["fieldsets"][0]["name"] == "Looks"


def test_a_preset_saved_before_fieldsets_has_none(client: TestClient) -> None:
    body = save(client, {"id": "a", "draft": {"name": "Cast", "description": "", "keywords": [], "fields": ["Name"], "subcategories": []}}).json()
    assert entry_of(body, "a")["draft"]["fieldsets"] == []


def test_put_refuses_fieldsets_the_plot_editor_could_not_hold(client: TestClient) -> None:
    too_many = [{"name": f"Set {i}", "fields": []} for i in range(21)]
    for over in (
        {"fieldsets": [{"name": "S" * 31, "fields": []}]},
        {"fieldsets": [{"name": "Looks", "fields": ["F" * 31]}]},
        {"fieldsets": too_many},
        {"fields": ["f"] * 60, "fieldsets": [{"name": "Looks", "fields": ["g"] * 41}]},  # more than a hundred fields in all
    ):
        assert save(client, {"id": "a", "draft": {**content("ok"), **over}}).status_code == 422, over
    # A hundred in all is the limit, and it is kept.
    assert save(client, {"id": "a", "draft": {**content("ok"), "fields": ["f"] * 60, "fieldsets": [{"name": "Looks", "fields": ["g"] * 40}]}}).status_code == 200


def test_put_refuses_what_the_plot_editor_could_not_hold(client: TestClient) -> None:
    for over in ({"name": "N" * 51}, {"description": "D" * 256}, {"fields": ["F" * 31]}, {"keywords": ["K" * 51]}):
        assert save(client, {"id": "a", "draft": {**content("ok"), **over}}).status_code == 422, over


def test_put_refuses_repeated_ids_and_names(client: TestClient) -> None:
    assert save(client, draft("a", "Cast"), draft("a", "Other")).status_code == 422
    assert save(client, draft("a", "Cast"), draft("b", "cast")).status_code == 422
    assert save(client, draft("a", ""), draft("b", "")).status_code == 200  # unfinished presets may be nameless
    assert save(client, draft("bad id!", "Cast")).status_code == 422


# --------------------------------------------------------------------------- publishing


def test_publish_freezes_the_draft_and_counts_versions_up(client: TestClient) -> None:
    save(client, draft("a", "Cast", fields=["Name"]))
    assert client.get("/api/presets/published").json()["presets"] == []
    first = entry_of(client.post("/api/presets/a/publish").json(), "a")
    assert first["published"]["version"] == 1 and first["nextVersion"] == 2

    save(client, draft("a", "Cast", fields=["Name", "Role"]))
    assert client.get("/api/presets/published").json()["presets"][0]["content"]["fields"] == ["Name"]  # not live until published
    second = entry_of(client.post("/api/presets/a/publish").json(), "a")
    assert second["published"]["version"] == 2
    assert [h["version"] for h in second["history"]] == [1]
    live = client.get("/api/presets/published").json()["presets"]
    assert [(p["id"], p["version"], p["content"]["fields"]) for p in live] == [("a", 2, ["Name", "Role"])]


def test_published_presets_follow_the_catalog_order_and_leave_out_the_unpublished(client: TestClient) -> None:
    save(client, draft("a", "Alpha"), draft("b", "Beta"), draft("c", "Gamma"))
    client.post("/api/presets/c/publish")
    client.post("/api/presets/a/publish")
    assert [p["content"]["name"] for p in client.get("/api/presets/published").json()["presets"]] == ["Alpha", "Gamma"]


def test_the_history_keeps_the_ten_latest_versions(client: TestClient) -> None:
    save(client, draft("a", "Cast"))
    body = {}
    for n in range(13):
        save(client, draft("a", "Cast", description=f"v{n}"))
        body = client.post("/api/presets/a/publish").json()
    a = entry_of(body, "a")
    assert a["published"]["version"] == 13
    assert [h["version"] for h in a["history"]] == [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]


def test_publish_is_refused_for_a_card_without_a_name(client: TestClient) -> None:
    save(client, draft("a", ""))
    resp = client.post("/api/presets/a/publish")
    assert resp.status_code == 422 and "needs a name" in resp.json()["detail"]

    save(client, draft("a", "Cast", subcategories=[
        {"id": "s1", "name": "", "description": "", "keywords": [], "fields": [], "clusters": []},
        {"id": "s2", "name": "Allies", "description": "", "keywords": [], "fields": [], "clusters": [
            {"id": "c1", "name": "", "description": "", "keywords": [], "fields": []}]},
    ]))
    detail = client.post("/api/presets/a/publish").json()["detail"]
    assert "Subcategory 1 needs a name" in detail and "Cluster 1 in subcategory Allies needs a name" in detail
    assert client.get("/api/presets/published").json()["presets"] == []


def test_publish_is_refused_when_another_preset_is_published_under_that_name(client: TestClient) -> None:
    save(client, draft("a", "Cast"), draft("b", "Crew"))
    client.post("/api/presets/a/publish")
    save(client, draft("a", "Ensemble"), draft("b", "Cast"))  # a's draft was renamed, but "Cast" is still what the Writer sees of a
    resp = client.post("/api/presets/b/publish")
    assert resp.status_code == 422 and "already published as 'Cast'" in resp.json()["detail"]
    client.post("/api/presets/a/publish")
    assert client.post("/api/presets/b/publish").status_code == 200


def test_publishing_keeps_nested_cards_and_their_order(client: TestClient) -> None:
    subs = [
        {"id": "s1", "name": "Heroes", "description": "Those we follow", "keywords": ["lead"], "fields": ["Want", "Need"], "clusters": [
            {"id": "c1", "name": "Core", "description": "", "keywords": [], "fields": ["Dynamic"]}]},
        {"id": "s2", "name": "Villains", "description": "", "keywords": [], "fields": [], "clusters": []},
    ]
    save(client, draft("a", "Cast", description="The people", keywords=["people"], fields=["Name"], subcategories=subs))
    published = client.post("/api/presets/a/publish").json()
    live = client.get("/api/presets/published").json()["presets"][0]["content"]
    assert live == entry_of(published, "a")["draft"]
    assert [s["name"] for s in live["subcategories"]] == ["Heroes", "Villains"]
    assert live["subcategories"][0]["clusters"][0]["fields"] == ["Dynamic"]


# --------------------------------------------------------------------------- unpublish, discard, restore


def test_unpublish_hides_the_preset_but_keeps_its_versions_and_count(client: TestClient) -> None:
    save(client, draft("a", "Cast"))
    client.post("/api/presets/a/publish")
    body = client.post("/api/presets/a/unpublish").json()
    a = entry_of(body, "a")
    assert a["published"] is None and [h["version"] for h in a["history"]] == [1] and a["nextVersion"] == 2
    assert client.get("/api/presets/published").json()["presets"] == []
    assert entry_of(client.post("/api/presets/a/publish").json(), "a")["published"]["version"] == 2
    assert client.post("/api/presets/a/unpublish").status_code == 200
    assert client.post("/api/presets/a/unpublish").status_code == 409


def test_discard_puts_the_draft_back_to_the_published_copy(client: TestClient) -> None:
    save(client, draft("a", "Cast", fields=["Name"]))
    client.post("/api/presets/a/publish")
    save(client, draft("a", "Renamed", fields=["Name", "Role"]))
    body = client.post("/api/presets/a/discard").json()
    assert entry_of(body, "a")["draft"]["name"] == "Cast" and entry_of(body, "a")["draft"]["fields"] == ["Name"]


def test_discard_clears_a_preset_with_no_published_copy_but_keeps_its_name(client: TestClient) -> None:
    save(client, draft("b", "Never published", description="d", keywords=["k"], fields=["Name"], subcategories=[
        {"id": "s", "name": "Sub", "description": "", "keywords": [], "fields": ["x"], "clusters": []},
    ]))
    body = client.post("/api/presets/b/discard").json()
    b = entry_of(body, "b")
    assert b["draft"] == {"name": "Never published", "description": "", "keywords": [], "fields": [], "fieldsets": [], "subcategories": []}
    assert b["published"] is None and b["nextVersion"] == 1
    # An unpublished preset that was published once is cleared the same way, and its versions stay.
    save(client, draft("c", "Was live", fields=["Name"]))
    client.post("/api/presets/c/publish")
    client.post("/api/presets/c/unpublish")
    c = entry_of(client.post("/api/presets/c/discard").json(), "c")
    assert c["draft"]["fields"] == [] and c["draft"]["name"] == "Was live" and [h["version"] for h in c["history"]] == [1]


def test_restore_brings_an_earlier_version_into_the_draft_without_publishing_it(client: TestClient) -> None:
    save(client, draft("a", "Cast", description="first"))
    client.post("/api/presets/a/publish")
    save(client, draft("a", "Cast", description="second"))
    client.post("/api/presets/a/publish")
    body = client.post("/api/presets/a/restore/1").json()
    a = entry_of(body, "a")
    assert a["draft"]["description"] == "first"
    assert a["published"]["version"] == 2 and a["published"]["content"]["description"] == "second"
    assert client.post("/api/presets/a/restore/2").status_code == 200  # the current version too
    assert client.post("/api/presets/a/restore/9").status_code == 404


def test_unknown_presets_are_404(client: TestClient) -> None:
    client.get("/api/presets")
    for action in ("publish", "unpublish", "discard", "restore/1"):
        assert client.post(f"/api/presets/nope/{action}").status_code == 404, action


def test_deleting_a_preset_removes_its_published_copy_too(client: TestClient) -> None:
    save(client, draft("a", "Cast"), draft("b", "Crew"))
    client.post("/api/presets/a/publish")
    save(client, draft("b", "Crew"))
    assert client.get("/api/presets/published").json()["presets"] == []
    save(client, draft("a", "Cast"), draft("b", "Crew"))  # the same id again starts over
    assert entry_of(client.get("/api/presets").json(), "a")["published"] is None


# --------------------------------------------------------------------------- fields that are not plain lists of plotpoints


def test_put_keeps_choice_fields_beside_plain_ones_in_the_loose_fields_and_in_the_sets(client: TestClient) -> None:
    genre = {"name": " Genre ", "kind": "multi", "options": [" Fantasy", "Romance ", "Fantasy", "romance", "  "]}
    sets = [{"name": "Tone", "fields": ["Pace", {"name": "Mood", "kind": "dropdown", "options": ["Calm"]}]}]
    body = save(client, draft("a", "Cast", fields=["Motto", genre, {"name": "Tagline", "kind": "text", "options": ["ignored"]}], fieldsets=sets)).json()
    saved = entry_of(body, "a")["draft"]
    assert saved["fields"] == [
        "Motto",
        {"name": "Genre", "kind": "multi", "options": ["Fantasy", "Romance"]},
        {"name": "Tagline", "kind": "text", "options": []},
    ]
    assert saved["fieldsets"] == [{"name": "Tone", "fields": ["Pace", {"name": "Mood", "kind": "dropdown", "options": ["Calm"]}]}]
    assert client.get("/api/presets").json() == body
    published = entry_of(client.post("/api/presets/a/publish").json(), "a")
    assert published["published"]["content"]["fields"][1]["kind"] == "multi"


def test_put_refuses_choice_fields_the_plot_editor_could_not_hold(client: TestClient) -> None:
    for over in (
        {"fields": [{"name": "F" * 31, "kind": "multi", "options": ["a"]}]},
        {"fields": [{"name": "Genre", "kind": "multi", "options": ["O" * 31]}]},
        {"fields": [{"name": "Genre", "kind": "multi", "options": [f"o{i}" for i in range(21)]}]},
        {"fields": [{"name": "Genre", "kind": "radio", "options": ["a"]}]},
        {"fieldsets": [{"name": "S", "fields": [{"name": "Genre", "kind": "dropdown", "options": ["O" * 31]}]}]},
    ):
        assert save(client, {"id": "a", "draft": {**content("ok"), **over}}).status_code == 422, over
    assert save(client, {"id": "a", "draft": {**content("ok"), "fields": [{"name": "Genre", "kind": "multi", "options": [f"o{i}" for i in range(20)]}]}}).status_code == 200
